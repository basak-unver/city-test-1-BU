// Loads the city kit. Every path goes through BASE_URL so it works on localhost
// and on GitHub Pages (https://<user>.github.io/<repo>/).
import { prepareKit } from './geo.js'

const FILES = {
  kit: 'kit.json',
  buildings: 'buildings.geojson',
  graph: 'streets.graph.json',
  zensus: 'zensus.geojson',
}

export async function loadModel() {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, file]) => {
      const r = await fetch(`${import.meta.env.BASE_URL}data/${file}`)
      if (!r.ok) throw new Error(`data/${file}: ${r.status}`)
      return [key, await r.json()]
    }),
  )
  return prepareKit(Object.fromEntries(entries))
}
