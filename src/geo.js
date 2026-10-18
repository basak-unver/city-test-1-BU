// Turns the raw kit files into one model in local metres (x = east, y = north,
// origin at the kit centre). Pure: no fetching, no React, no 3D.
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js'
import DistanceOp from 'jsts/org/locationtech/jts/operation/distance/DistanceOp.js'
import 'jsts/org/locationtech/jts/monkey.js'
import { CULTURE_USES } from './constants.js'

export const gf = new GeometryFactory()

export function makeProjection([lon0, lat0]) {
  const phi = (lat0 * Math.PI) / 180
  const mLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi)
  const mLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)
  return ([lon, lat]) => [(lon - lon0) * mLon, (lat - lat0) * mLat]
}

// Drop the repeated closing point of a GeoJSON ring.
const openRing = (ring) => {
  const a = ring[0]
  const b = ring[ring.length - 1]
  return a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : ring
}

function bboxOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

export function jstsRing(points) {
  const cs = points.map(([x, y]) => new Coordinate(x, y))
  cs.push(new Coordinate(points[0][0], points[0][1]))
  return gf.createLinearRing(cs)
}

export function jstsPolygon(rings) {
  return gf.createPolygon(jstsRing(rings[0]), rings.slice(1).map(jstsRing))
}

export function jstsLine(points) {
  return gf.createLineString(points.map(([x, y]) => new Coordinate(x, y)))
}

export const polylineLength = (pts) => {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

// Distance from the start of a polyline to a point lying on it.
function alongPolyline(pts, [px, py]) {
  let best = Infinity, bestS = 0, s = 0
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const dx = bx - ax, dy = by - ay
    const L2 = dx * dx + dy * dy
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0
    const d = Math.hypot(ax + t * dx - px, ay + t * dy - py)
    if (d < best) {
      best = d
      bestS = s + t * Math.sqrt(L2)
    }
    s += Math.sqrt(L2)
  }
  return bestS
}

export function prepareKit({ kit, buildings, graph, zensus }) {
  const project = makeProjection(kit.center)

  const bldgs = []
  for (const f of buildings.features) {
    const rings = f.geometry.coordinates.map((r) => openRing(r).map(project))
    if (rings[0].length < 3) continue
    bldgs.push({
      id: f.properties.id,
      use: f.properties.use ?? null,
      height: f.properties.height,
      floors: f.properties.floors,
      rings,
      bbox: bboxOf(rings[0]),
      geom: jstsPolygon(rings),
    })
  }

  const nodes = graph.nodes.map((n) => {
    const [x, y] = project([n.lon, n.lat])
    return { id: n.id, x, y }
  })
  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]))
  const edges = []
  const adj = nodes.map(() => [])
  for (const e of graph.edges) {
    if (!e.walkable) continue
    const from = nodeIndex.get(e.from)
    const to = nodeIndex.get(e.to)
    const pts = e.coords.map(project)
    const k = edges.length
    edges.push({ from, to, len: e.length, pts, polyLen: polylineLength(pts), bbox: bboxOf(pts) })
    adj[from].push(k)
    adj[to].push(k)
  }
  // A node is walkable when at least one walkable edge meets it.
  const walkableNodes = nodes.map((_, i) => i).filter((i) => adj[i].length > 0)

  const cells = zensus.features.map((f) => {
    const rings = f.geometry.coordinates.map((r) => openRing(r).map(project))
    const geom = jstsPolygon(rings)
    return {
      id: f.properties.id,
      pop: f.properties.population,
      age: f.properties.avg_age,
      rings,
      geom,
      area: geom.getArea(),
      bbox: bboxOf(rings[0]),
    }
  })

  // Cultural destinations: where does each one touch the street network?
  // For every edge within 50 m we keep the closest point on the edge (as network
  // metres from the edge's `from` node) and the straight gap to the footprint.
  const culture = []
  bldgs.forEach((b, idx) => {
    if (!CULTURE_USES.includes(b.use)) return
    let access = []
    let nearest = null
    edges.forEach((e, k) => {
      if (!bboxNear(e.bbox, b.bbox, 50)) return
      const line = jstsLine(e.pts)
      const op = new DistanceOp(line, b.geom)
      const gap = op.distance()
      const p = op.nearestPoints()[0]
      const s = (alongPolyline(e.pts, [p.x, p.y]) / e.polyLen) * e.len
      const a = { edge: k, s, gap }
      if (gap <= 50) access.push(a)
      if (!nearest || gap < nearest.gap) nearest = a
    })
    if (!access.length && nearest) access = [nearest]
    if (!access.length) {
      // Far from any street: fall back to the nearest edge anywhere.
      edges.forEach((e, k) => {
        const op = new DistanceOp(jstsLine(e.pts), b.geom)
        const gap = op.distance()
        if (!nearest || gap < nearest.gap) {
          const p = op.nearestPoints()[0]
          nearest = { edge: k, s: (alongPolyline(e.pts, [p.x, p.y]) / e.polyLen) * e.len, gap }
        }
      })
      access = [nearest]
    }
    const [x0, y0, x1, y1] = b.bbox
    culture.push({ idx, use: b.use, access, centre: [(x0 + x1) / 2, (y0 + y1) / 2] })
  })

  const totalPop = cells.reduce((s, c) => s + (c.pop ?? 0), 0)
  return { kit, project, buildings: bldgs, nodes, edges, adj, walkableNodes, cells, culture, totalPop }
}

export function bboxNear(a, b, pad = 0) {
  return a[0] - pad <= b[2] && b[0] - pad <= a[2] && a[1] - pad <= b[3] && b[1] - pad <= a[3]
}
