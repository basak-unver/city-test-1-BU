// City Reach: click on the ground to see how far you get in 5, 10 and 15 minutes,
// how many people live there, and how that changes with age and by bike.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { loadModel } from './data.js'
import City from './City.jsx'
import ReachAreas from './ReachAreas.jsx'
import { ATTRIBUTION, BAND, BIKE, MINUTES, MODES, SNAP, SPEEDS, WALK } from './constants.js'
import {
  USE_COLORS,
  USE_LABELS,
  REACH_SHADES,
  CULTURE_HIGHLIGHT,
  OLDER_RING,
  YOUNG_RING,
} from './palette.js'

const num = (n) => Math.round(n).toLocaleString('en-GB')
const mins = (m) => (m < 10 ? m.toFixed(1) : Math.round(m).toString()).replace(/\.0$/, '')

export default function App() {
  const [model, setModel] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [result, setResult] = useState(null)
  const [mode, setMode] = useState('walk')
  const [ringMinutes, setRingMinutes] = useState(10)
  const [showAge, setShowAge] = useState(true)
  const worker = useRef(null)
  const clickId = useRef(0)

  useEffect(() => {
    loadModel().then(setModel, (e) => setLoadError(e.message))
  }, [])

  useEffect(() => {
    const w = new Worker(new URL('./reach.worker.js', import.meta.url), { type: 'module' })
    w.onmessage = ({ data }) => {
      if (data.id !== clickId.current) return
      setResult((r) => {
        if (data.kind === 'far') return { id: data.id, far: true }
        if (data.kind === 'start')
          return { id: data.id, origin: data.origin, gap: data.gap, culture: data.culture, modes: {}, rings: {} }
        if (!r || r.id !== data.id) return r
        if (data.kind === 'mode') return { ...r, modes: { ...r.modes, [data.mode]: data } }
        if (data.kind === 'rings') return { ...r, rings: { ...r.rings, [data.minutes]: data } }
        return r
      })
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  const onPick = useCallback((x, y) => {
    const id = ++clickId.current
    setResult({ id, pending: true })
    worker.current?.postMessage({ id, x, y })
  }, [])

  const current = result?.modes?.[mode]
  const walk = result?.modes?.walk
  const ageRings = mode === 'walk' && showAge ? result?.rings?.[ringMinutes] : null

  return (
    <div className="app">
      <div className="stage">
        <Canvas camera={{ position: [0, 1500, 1500], fov: 40, near: 5, far: 20000 }} dpr={[1, 2]}>
          <color attach="background" args={['#e7e5df']} />
          <ambientLight intensity={1.6} />
          <directionalLight position={[-600, 1200, 500]} intensity={1.7} />
          <directionalLight position={[700, 500, -400]} intensity={0.5} />
          {model && (
            <>
              <City model={model} levels={current?.levels ?? null} onPick={onPick} />
              <ReachAreas
                model={model}
                bands={current?.bands}
                origin={result?.origin}
                ageRings={ageRings}
                culture={result?.culture}
              />
            </>
          )}
          <OrbitControls makeDefault maxPolarAngle={1.45} minDistance={60} maxDistance={6000} />
        </Canvas>
        {!model && !loadError && <div className="notice">Loading the city kit…</div>}
        {loadError && <div className="notice error">The city kit didn't load ({loadError}).</div>}
        <Legend />
        <p className="attribution">{ATTRIBUTION}</p>
      </div>

      <aside className="panel">
        <header>
          <h1>City Reach</h1>
          <p className="muted">Weimar city kit. Click on the ground to start. Drag to orbit, right-drag to pan, scroll to zoom.</p>
        </header>

        <div className="toggle" role="group" aria-label="Travel mode">
          {Object.entries(MODES).map(([key, m]) => (
            <button key={key} className={mode === key ? 'on' : ''} onClick={() => setMode(key)}>
              {m.label} <span className="muted">{m.mPerMin} m/min</span>
            </button>
          ))}
        </div>

        <Status result={result} current={current} />

        <table className="reach">
          <thead>
            <tr>
              <th>Time</th>
              <th>Distance</th>
              <th>Buildings</th>
              <th>Residents</th>
              <th>Culture</th>
            </tr>
          </thead>
          <tbody>
            {MINUTES.map((m, k) => {
              const b = current?.bands?.[k]
              return (
                <tr key={m}>
                  <td>
                    <span className="swatch" style={{ background: REACH_SHADES[k] }} />
                    {m} min
                  </td>
                  <td>{num(m * MODES[mode].mPerMin)} m</td>
                  <td>{b ? num(b.buildings) : '–'}</td>
                  <td>
                    {b ? `≈ ${num(b.residents)}` : '–'}
                    {b?.nullCells > 0 && (
                      <div className="note">
                        +{b.nullCells} cell{b.nullCells > 1 ? 's' : ''} without a figure
                      </div>
                    )}
                  </td>
                  <td>{b ? b.culture : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {mode === 'bike' && (
          <p className="note">
            Bike times use the pedestrian network, so they are approximate. In 15 minutes a bike covers almost the whole
            kit.
          </p>
        )}

        <section>
          <h2>Whose 5 minutes?</h2>
          <p className="muted">The same walking distance takes a different time for different people.</p>
          <table className="ages">
            <thead>
              <tr>
                <th>Distance</th>
                <th style={{ color: YOUNG_RING }}>Younger</th>
                <th>Adults</th>
                <th style={{ color: OLDER_RING }}>Older</th>
                <th>Bike</th>
              </tr>
            </thead>
            <tbody>
              {MINUTES.map((m) => {
                const d = m * WALK
                return (
                  <tr key={m}>
                    <td>{num(d)} m</td>
                    <td>{mins(d / SPEEDS.young.mPerMin)} min</td>
                    <td>{m} min</td>
                    <td>{mins(d / SPEEDS.older.mPerMin)} min</td>
                    <td>{mins(d / BIKE)} min</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="note">
            A standard 5-minute walk ({num(5 * WALK)} m) takes about {mins((5 * WALK) / SPEEDS.older.mPerMin)} minutes
            for an older adult, {mins((5 * WALK) / SPEEDS.young.mPerMin)} for a younger adult and{' '}
            {mins((5 * WALK) / BIKE)} by bike.
          </p>
          {walk && (
            <p className="note">
              Average age of the residents in the walking areas:{' '}
              {walk.bands
                .map((b) => `${b.minutes} min: ${b.avgAge != null ? b.avgAge.toFixed(0) + ' years' : 'no figure'}`)
                .join(' · ')}
              .
            </p>
          )}
          <div className="rings">
            <label>
              <input type="checkbox" checked={showAge} onChange={(e) => setShowAge(e.target.checked)} /> Show on the
              map how far each group gets in
            </label>
            <div className="toggle small">
              {MINUTES.map((m) => (
                <button key={m} className={ringMinutes === m ? 'on' : ''} onClick={() => setRingMinutes(m)}>
                  {m} min
                </button>
              ))}
            </div>
            {showAge && (
              <ul className="keys">
                <li>
                  <span className="dash" style={{ borderColor: OLDER_RING }} /> Older adults:{' '}
                  {num(ringMinutes * SPEEDS.older.mPerMin)} m
                </li>
                <li>
                  <span className="dash" style={{ borderColor: YOUNG_RING }} /> Younger adults:{' '}
                  {num(ringMinutes * SPEEDS.young.mPerMin)} m
                </li>
              </ul>
            )}
            {showAge && mode === 'bike' && <p className="note">The age rings show walking, so they are hidden in Bike mode.</p>}
            {showAge && mode === 'walk' && result?.origin && !result.rings?.[ringMinutes] && (
              <p className="note">Drawing the rings…</p>
            )}
          </div>
        </section>

        <section>
          <h2>Nearest culture & entertainment</h2>
          {!result?.culture && <p className="muted">Click on the map to list the nearest five.</p>}
          {result?.culture && (
            <ol className="culture">
              {result.culture.map((c) => (
                <li key={c.idx}>
                  <span className="pin" style={{ background: CULTURE_HIGHLIGHT }}>
                    {result.culture.indexOf(c) + 1}
                  </span>
                  <div>
                    <strong>{USE_LABELS[c.use]}</strong>, {num(c.dist)} m along the streets
                    <div className="note">
                      walk {mins(c.dist / WALK)} min · older adults {mins(c.dist / SPEEDS.older.mPerMin)} min · bike{' '}
                      {mins(c.dist / BIKE)} min
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="method">
          <h2>How this is counted</h2>
          <ul>
            <li>
              The walk starts at the street junction nearest to your click (at most {SNAP} m away). It follows the
              pedestrian network at {WALK} m per minute (4.8 km/h). The bike mode uses {BIKE} m per minute (15 km/h) on
              the same network.
            </li>
            <li>
              Each area is the stretch of street reached in that time, including part of the last street, with a band of{' '}
              {BAND} m on each side. It is not a circle. Buildings that touch the area are counted and coloured.
            </li>
            <li>
              Residents come from the Zensus 2022 100 m grid. Each cell adds its residents times the share of its area
              inside the band. The total is rounded to the nearest 10. Residents are assumed to be spread evenly over a
              cell.
            </li>
            <li>
              Cells without a published figure are not zero. They are left out of the sum and counted separately.
            </li>
            <li>
              The age speeds (×1.15 younger, ×0.65 older) are assumptions, not data. The census gives only an average
              age per cell, not age groups.
            </li>
            <li>
              "Culture" means buildings whose main use is culture or entertainment (the kit has no separate museum use).
              Their distance is measured along the streets to the point nearest the building.
            </li>
          </ul>
        </section>
      </aside>
    </div>
  )
}

function Status({ result, current }) {
  if (!result) return <p className="status muted">No start point yet.</p>
  if (result.far)
    return (
      <p className="status warn">
        No walkable street within {SNAP} m of this point. Click closer to a street.
      </p>
    )
  if (result.pending) return <p className="status muted">Finding the nearest street…</p>
  return (
    <p className="status">
      Start: the street junction {Math.round(result.gap)} m from your click.
      {!current && <span className="muted"> Computing…</span>}
    </p>
  )
}

function Legend() {
  return (
    <details className="legend" open>
      <summary>Building use</summary>
      <ul>
        {Object.keys(USE_LABELS).map((k) => (
          <li key={k}>
            <span className="swatch" style={{ background: USE_COLORS[k] }} />
            {USE_LABELS[k]}
          </li>
        ))}
        <li className="sep">
          <span className="swatch" style={{ background: REACH_SHADES[0] }} />
          <span className="swatch" style={{ background: REACH_SHADES[1] }} />
          <span className="swatch" style={{ background: REACH_SHADES[2] }} />
          Reached in 5 / 10 / 15 min
        </li>
        <li>
          <span className="swatch" style={{ background: CULTURE_HIGHLIGHT }} />
          Culture or entertainment, reached
        </li>
      </ul>
    </details>
  )
}
