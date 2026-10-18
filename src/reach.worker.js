// Runs the reach calculation off the main thread, so orbiting stays smooth while
// the bands are built. Results are posted step by step: walking first.
import { loadModel } from './data.js'
import { nearestNode, networkDistances, computeMode, cultureDistances, reachOutline } from './reach.js'
import { MODES, SPEEDS } from './constants.js'

const ready = loadModel()
let latest = 0

const pause = () => new Promise((r) => setTimeout(r, 0))

self.onmessage = async ({ data }) => {
  const { id, x, y } = data
  latest = id
  const model = await ready
  await pause()
  if (id !== latest) return

  const start = nearestNode(model, x, y)
  if (!start) {
    self.postMessage({ id, kind: 'far' })
    return
  }
  const n = model.nodes[start.node]
  const dist = networkDistances(model, start.node)
  self.postMessage({
    id,
    kind: 'start',
    origin: [n.x, n.y],
    gap: start.gap,
    culture: cultureDistances(model, dist)
      .slice(0, 5)
      .map((c) => ({ idx: c.idx, use: c.use, dist: c.dist, centre: c.centre })),
  })

  const steps = [
    ['mode', 'walk'],
    ['rings', 10],
    ['mode', 'bike'],
    ['rings', 5],
    ['rings', 15],
  ]
  for (const [kind, arg] of steps) {
    await pause()
    if (id !== latest) return // a newer click came in: drop this one
    if (kind === 'mode') {
      const { bands, levels } = computeMode(model, dist, MODES[arg].mPerMin)
      self.postMessage({ id, kind, mode: arg, bands, levels }, [levels.buffer])
    } else {
      const minutes = arg
      self.postMessage({
        id,
        kind,
        minutes,
        older: reachOutline(model, dist, minutes * SPEEDS.older.mPerMin),
        young: reachOutline(model, dist, minutes * SPEEDS.young.mPerMin),
      })
    }
  }
}
