// The reach on the map: three nested street bands, the start point, dashed age
// rings and markers on the nearest cultural buildings.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { REACH_SHADES, OLDER_RING, YOUNG_RING, CULTURE_HIGHLIGHT } from './palette.js'

const toVec = ([x, y]) => new THREE.Vector2(x, y)

function shapeGeometry(polys) {
  const shapes = polys.map(([outer, ...holes]) => {
    const s = new THREE.Shape(outer.map(toVec))
    s.holes = holes.map((r) => new THREE.Path(r.map(toVec)))
    return s
  })
  const g = new THREE.ShapeGeometry(shapes)
  g.rotateX(-Math.PI / 2)
  return g
}

// All ring edges of the outline as one list of segment end points.
function outlineSegments(polys, y) {
  const pts = []
  for (const poly of polys)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) pts.push([ring[i - 1][0], y, -ring[i - 1][1]], [ring[i][0], y, -ring[i][1]])
  return pts
}

function Band({ polys, k }) {
  const geometry = useMemo(() => shapeGeometry(polys), [polys])
  useEffect(() => () => geometry.dispose(), [geometry])
  // Lifted a little per band and drawn nearest-last, so the 5-minute band sits on top.
  return (
    <mesh geometry={geometry} position-y={0.2 + (2 - k) * 0.2} renderOrder={2 - k + 1}>
      <meshBasicMaterial
        color={REACH_SHADES[k]}
        polygonOffset
        polygonOffsetFactor={-1 - (2 - k)}
        polygonOffsetUnits={-4 * (3 - k)}
      />
    </mesh>
  )
}

function Ring({ polys, color }) {
  const points = useMemo(() => outlineSegments(polys, 1.4), [polys])
  if (!points.length) return null
  return <Line points={points} segments color={color} lineWidth={2.2} dashed dashSize={9} gapSize={6} />
}

export default function ReachAreas({ bands, origin, ageRings, culture, model }) {
  return (
    <group>
      {bands && [2, 1, 0].map((k) => bands[k].rings.length > 0 && <Band key={k} polys={bands[k].rings} k={k} />)}
      {ageRings && (
        <>
          <Ring polys={ageRings.older} color={OLDER_RING} />
          <Ring polys={ageRings.young} color={YOUNG_RING} />
        </>
      )}
      {culture?.map((c, i) => {
        const b = model.buildings[c.idx]
        return (
          <Html
            key={c.idx}
            position={[c.centre[0], b.height + 6, -c.centre[1]]}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className="pin" style={{ background: CULTURE_HIGHLIGHT }}>
              {i + 1}
            </span>
          </Html>
        )
      })}
      {origin && (
        <group position={[origin[0], 0, -origin[1]]}>
          <mesh position-y={12}>
            <cylinderGeometry args={[2.5, 2.5, 24, 16]} />
            <meshLambertMaterial color="#1f1f1f" />
          </mesh>
          <mesh position-y={26}>
            <sphereGeometry args={[6, 20, 14]} />
            <meshLambertMaterial color="#1f1f1f" />
          </mesh>
        </group>
      )}
    </group>
  )
}
