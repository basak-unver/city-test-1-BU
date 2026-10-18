// The 3D city: pale ground, thin streets, and every building merged into one mesh.
// Plan coordinates (x east, y north, in metres) map to 3D as (x, height, -y).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  USE_COLORS,
  REACH_BUILDING_SHADES,
  CULTURE_HIGHLIGHT,
  GROUND,
  STREET,
} from './palette.js'

const toVec = ([x, y]) => new THREE.Vector2(x, y)

function buildBuildings(model) {
  const parts = []
  const ranges = [] // [first vertex, vertex count] per building
  let offset = 0
  for (const b of model.buildings) {
    const shape = new THREE.Shape(b.rings[0].map(toVec))
    shape.holes = b.rings.slice(1).map((r) => new THREE.Path(r.map(toVec)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(b.height, 0.3), bevelEnabled: false })
    g.deleteAttribute('uv')
    const n = g.attributes.position.count
    ranges.push([offset, n])
    offset += n
    parts.push(g)
  }
  const geometry = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  geometry.rotateX(-Math.PI / 2)
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(offset * 3), 3))
  return { geometry, ranges }
}

function buildStreets(model) {
  const pos = []
  for (const e of model.edges)
    for (let i = 1; i < e.pts.length; i++) {
      const [x0, y0] = e.pts[i - 1]
      const [x1, y1] = e.pts[i]
      pos.push(x0, 0, -y0, x1, 0, -y1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

const color = (hex) => new THREE.Color(hex)
const useColor = Object.fromEntries(Object.entries(USE_COLORS).map(([k, v]) => [k, color(v)]))
const reachColor = REACH_BUILDING_SHADES.map(color)
const cultureColor = color(CULTURE_HIGHLIGHT)

export default function City({ model, levels, onPick }) {
  const { geometry, ranges } = useMemo(() => buildBuildings(model), [model])
  const streets = useMemo(() => buildStreets(model), [model])
  const cultureIdx = useMemo(() => new Set(model.culture.map((c) => c.idx)), [model])
  const [w, h] = model.kit.size_m

  // Repaint the building colours whenever the reach changes: one buffer rewrite, no new meshes.
  useEffect(() => {
    const arr = geometry.attributes.color.array
    model.buildings.forEach((b, i) => {
      const level = levels ? levels[i] : -1
      let c = useColor[b.use] ?? useColor.null
      if (level >= 0) c = cultureIdx.has(i) ? cultureColor : reachColor[level]
      const [start, n] = ranges[i]
      for (let v = start; v < start + n; v++) {
        arr[v * 3] = c.r
        arr[v * 3 + 1] = c.g
        arr[v * 3 + 2] = c.b
      }
    })
    geometry.attributes.color.needsUpdate = true
  }, [geometry, ranges, levels, model, cultureIdx])

  // A click (not a drag) starts the reach at that spot of the plan.
  const pick = (e) => {
    if (e.delta > 5) return
    e.stopPropagation()
    onPick(e.point.x, -e.point.z)
  }

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} onClick={pick} receiveShadow>
        <planeGeometry args={[w + 600, h + 600]} />
        <meshLambertMaterial color={GROUND} />
      </mesh>
      <lineSegments geometry={streets} position-y={0.9} renderOrder={5}>
        <lineBasicMaterial color={STREET} />
      </lineSegments>
      <mesh geometry={geometry} onClick={pick}>
        <meshLambertMaterial vertexColors />
      </mesh>
    </group>
  )
}
