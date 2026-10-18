// The reach calculation. Pure functions on the model from geo.js: no React, no 3D.
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js'
import BufferParameters from 'jsts/org/locationtech/jts/operation/buffer/BufferParameters.js'
import LineMerger from 'jsts/org/locationtech/jts/operation/linemerge/LineMerger.js'
import 'jsts/org/locationtech/jts/monkey.js'
import { gf, bboxNear } from './geo.js'
import { BAND, MINUTES, SNAP } from './constants.js'

// A reach area prepared for many fast "does this polygon touch it?" tests.
// (jsts 2.12's own PreparedGeometry classes crash on construction, so this is
// a small replacement: the area's outline segments in a grid of GRID-metre cells.)
const GRID = 25
function prepare(rings) {
  const segs = [] // [x0, y0, x1, y1]
  for (const poly of rings)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) segs.push([...ring[i - 1], ...ring[i]])
  const grid = new Map()
  const rows = new Map() // horizontal strips, for point-in-area
  const key = (i, j) => i * 100003 + j
  segs.forEach((s, k) => {
    const i0 = Math.floor(Math.min(s[0], s[2]) / GRID), i1 = Math.floor(Math.max(s[0], s[2]) / GRID)
    const j0 = Math.floor(Math.min(s[1], s[3]) / GRID), j1 = Math.floor(Math.max(s[1], s[3]) / GRID)
    for (let j = j0; j <= j1; j++) {
      if (!rows.has(j)) rows.set(j, [])
      rows.get(j).push(k)
      for (let i = i0; i <= i1; i++) {
        const c = key(i, j)
        if (!grid.has(c)) grid.set(c, [])
        grid.get(c).push(k)
      }
    }
  })
  // Even-odd rule: count outline crossings of a ray running east from the point.
  const contains = (x, y) => {
    let inside = false
    for (const k of rows.get(Math.floor(y / GRID)) ?? []) {
      const [x0, y0, x1, y1] = segs[k]
      if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside
    }
    return inside
  }
  const crosses = (ax, ay, bx, by) => {
    const i0 = Math.floor(Math.min(ax, bx) / GRID), i1 = Math.floor(Math.max(ax, bx) / GRID)
    const j0 = Math.floor(Math.min(ay, by) / GRID), j1 = Math.floor(Math.max(ay, by) / GRID)
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (const k of grid.get(key(i, j)) ?? []) if (segmentsCross(ax, ay, bx, by, ...segs[k])) return true
    return false
  }
  // True if a polygon (outer ring + holes, as point arrays) touches the area.
  const intersects = (polyRings) => {
    const outer = polyRings[0]
    if (contains(outer[0][0], outer[0][1])) return true
    for (const ring of polyRings)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length]
        if (crosses(a[0], a[1], b[0], b[1])) return true
      }
    // The whole area lies inside the polygon (e.g. a band inside a large footprint).
    const [sx, sy] = segs[0]
    return pointInRings(polyRings, sx, sy)
  }
  return { contains, intersects }
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px))
  const o1 = o(ax, ay, bx, by, cx, cy), o2 = o(ax, ay, bx, by, dx, dy)
  const o3 = o(cx, cy, dx, dy, ax, ay), o4 = o(cx, cy, dx, dy, bx, by)
  if (o1 !== o2 && o3 !== o4) return true
  // Touching or overlapping collinear pieces count as touching.
  const on = (px, py, qx, qy, rx, ry) =>
    Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy)
  return (
    (o1 === 0 && on(ax, ay, bx, by, cx, cy)) ||
    (o2 === 0 && on(ax, ay, bx, by, dx, dy)) ||
    (o3 === 0 && on(cx, cy, dx, dy, ax, ay)) ||
    (o4 === 0 && on(cx, cy, dx, dy, bx, by))
  )
}

function pointInRings(rings, x, y) {
  let inside = false
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j], [x1, y1] = ring[i]
      if (y0 > y !== y1 > y && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) inside = !inside
    }
  return inside
}

// 1. The nearest walkable node to a clicked point, or null if none is within SNAP metres.
export function nearestNode(model, x, y) {
  let best = -1, bestD = Infinity
  for (const i of model.walkableNodes) {
    const n = model.nodes[i]
    const d = Math.hypot(n.x - x, n.y - y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return bestD <= SNAP ? { node: best, gap: bestD } : null
}

// 2. Shortest network distance in metres from the start node to every node (Dijkstra).
export function networkDistances(model, start) {
  const dist = new Float64Array(model.nodes.length).fill(Infinity)
  dist[start] = 0
  const heap = [[0, start]]
  const push = (item) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const [d, u] = pop()
    if (d > dist[u]) continue
    for (const k of model.adj[u]) {
      const e = model.edges[k]
      const v = e.from === u ? e.to : e.from
      const nd = d + e.len
      if (nd < dist[v]) {
        dist[v] = nd
        push([nd, v])
      }
    }
  }
  return dist
}

// The part of a polyline between a and b metres from its start.
function slice(pts, a, b) {
  const out = []
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const L = Math.hypot(x1 - x0, y1 - y0)
    const s1 = s + L
    if (s1 >= a && s <= b && L > 0) {
      const t0 = Math.max(0, (a - s) / L)
      const t1 = Math.min(1, (b - s) / L)
      const p0 = [x0 + t0 * (x1 - x0), y0 + t0 * (y1 - y0)]
      const p1 = [x0 + t1 * (x1 - x0), y0 + t1 * (y1 - y0)]
      if (!out.length) out.push(p0)
      out.push(p1)
    }
    s = s1
  }
  return out.length >= 2 ? out : null
}

// 3. The street pieces reached within `limit` network metres, including the
// reachable part of the last edge from either end.
export function reachedLines(model, dist, limit) {
  const lines = []
  for (const e of model.edges) {
    const a = limit - dist[e.from] // metres left when standing at `from`
    const b = limit - dist[e.to]
    if (a <= 0 && b <= 0) continue
    if (Math.max(a, 0) + Math.max(b, 0) >= e.len) {
      lines.push(e.pts)
      continue
    }
    const k = e.polyLen / e.len // network metres to drawing metres
    if (a > 0) {
      const p = slice(e.pts, 0, a * k)
      if (p) lines.push(p)
    }
    if (b > 0) {
      const p = slice(e.pts, e.polyLen - b * k, e.polyLen)
      if (p) lines.push(p)
    }
  }
  return lines
}

// 4. A band of BAND metres on each side of every reached piece, joined into one shape.
export function bandArea(lines, width = BAND) {
  if (!lines.length) return null
  const ml = gf.createMultiLineString(
    lines.map((pts) => gf.createLineString(pts.map(([x, y]) => new Coordinate(x, y)))),
  )
  // Joining touching pieces into long lines first gives the same shape ~3x faster.
  const merger = new LineMerger()
  merger.add(ml)
  const merged = gf.createMultiLineString(merger.getMergedLineStrings().toArray())
  return merged.buffer(width, 6, BufferParameters.CAP_ROUND)
}

// A jsts (multi)polygon as plain arrays: [[outer ring, ...holes], ...].
export function toRings(geom) {
  const polys = []
  for (let i = 0; i < geom.getNumGeometries(); i++) {
    const p = geom.getGeometryN(i)
    if (p.isEmpty()) continue
    const ring = (r) => r.getCoordinates().map((c) => [c.x, c.y])
    const rings = [ring(p.getExteriorRing())]
    for (let h = 0; h < p.getNumInteriorRing(); h++) rings.push(ring(p.getInteriorRingN(h)))
    polys.push(rings)
  }
  return polys
}

function envelopeBox(geom) {
  const e = geom.getEnvelopeInternal()
  return [e.getMinX(), e.getMinY(), e.getMaxX(), e.getMaxY()]
}

const ringArea = (r) => {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]
  return a / 2
}

// Cut a ring down to the part inside a convex, counter-clockwise clip ring (Sutherland–Hodgman).
// For a concave ring the result may have zero-width slivers, but its area is right.
function clipRing(ring, clip) {
  let out = ring
  for (let i = 0; i < clip.length && out.length; i++) {
    const [ax, ay] = clip[i]
    const [bx, by] = clip[(i + 1) % clip.length]
    const side = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax)
    const input = out
    out = []
    for (let k = 0; k < input.length; k++) {
      const p = input[k]
      const q = input[(k + 1) % input.length]
      const sp = side(p), sq = side(q)
      if (sp >= 0) out.push(p)
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq)
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
      }
    }
  }
  return out
}

// Share of a census cell's area inside the reach area (0..1).
function shareInside(rings, cell) {
  let clip = cell.rings[0]
  if (ringArea(clip) < 0) clip = [...clip].reverse()
  let inside = 0
  for (const poly of rings)
    poly.forEach((ring, h) => {
      const a = Math.abs(ringArea(clipRing(ring, clip)))
      inside += h === 0 ? a : -a // holes take area away
    })
  return Math.max(0, Math.min(1, inside / cell.area))
}

// 5 + 6. Buildings touching the area and residents living in it.
function analyse(model, area, rings, buildingCandidates) {
  const prep = prepare(rings)
  const box = envelopeBox(area)
  const touched = buildingCandidates.filter((i) => {
    const b = model.buildings[i]
    return bboxNear(b.bbox, box) && prep.intersects(b.rings)
  })
  let residents = 0, nullCells = 0, ageWeight = 0, ageSum = 0
  for (const c of model.cells) {
    if (!bboxNear(c.bbox, box) || !prep.intersects(c.rings)) continue
    const share = shareInside(rings, c)
    if (share <= 0) continue
    if (c.pop == null) {
      nullCells++
      continue
    }
    const people = c.pop * share
    residents += people
    if (c.age != null && c.pop > 0) {
      ageSum += c.age * people
      ageWeight += people
    }
  }
  return {
    touched,
    residentsExact: residents,
    residents: Math.round(residents / 10) * 10,
    nullCells,
    avgAge: ageWeight > 0 ? ageSum / ageWeight : null,
  }
}

// Network distance (m) from the start to each cultural building, nearest first.
export function cultureDistances(model, dist) {
  return model.culture
    .map((c) => {
      let best = Infinity
      for (const a of c.access) {
        const e = model.edges[a.edge]
        const d = Math.min(dist[e.from] + a.s, dist[e.to] + (e.len - a.s)) + a.gap
        if (d < best) best = d
      }
      return { ...c, dist: best }
    })
    .sort((p, q) => p.dist - q.dist)
}

// Everything for one travel speed: three nested areas, the buildings they touch
// (`levels[i]` = 0, 1, 2 for 5, 10, 15 min, -1 if not reached) and residents.
export function computeMode(model, dist, mPerMin) {
  const levels = new Int8Array(model.buildings.length).fill(-1)
  let candidates = model.buildings.map((_, i) => i)
  const bands = []
  // Largest area first: each smaller one only needs to test what the larger one touched.
  for (let k = MINUTES.length - 1; k >= 0; k--) {
    const minutes = MINUTES[k]
    const limit = minutes * mPerMin
    const area = bandArea(reachedLines(model, dist, limit))
    const rings = area ? toRings(area) : []
    const result = area
      ? analyse(model, area, rings, candidates)
      : { touched: [], residents: 0, residentsExact: 0, nullCells: 0, avgAge: null }
    for (const i of result.touched) levels[i] = k
    candidates = result.touched
    bands[k] = { minutes, limit, rings, buildings: result.touched.length, ...result }
    delete bands[k].touched
  }
  const cultureReached = MINUTES.map((_, k) =>
    model.culture.filter((c) => levels[c.idx] >= 0 && levels[c.idx] <= k).length,
  )
  bands.forEach((b, k) => (b.culture = cultureReached[k]))
  return { bands, levels }
}

// Outline of the area reached within `limit` metres, for the dashed age rings.
export function reachOutline(model, dist, limit) {
  const area = bandArea(reachedLines(model, dist, limit))
  return area ? toRings(area) : []
}
