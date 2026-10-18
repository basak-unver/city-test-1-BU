// Every number the method rests on, in one place.

export const WALK = 80 // m per minute = 4.8 km/h
export const SPEEDS = {
  young: { label: 'Younger adults (18–35)', factor: 1.15, mPerMin: 92 },
  adult: { label: 'Adults (36–65)', factor: 1.0, mPerMin: 80 },
  older: { label: 'Older adults, reduced mobility (65+)', factor: 0.65, mPerMin: 52 },
}
export const BIKE = 250 // m per minute = 15 km/h
export const MODES = {
  walk: { label: 'Walk', mPerMin: WALK },
  bike: { label: 'Bike', mPerMin: BIKE },
}

export const MINUTES = [5, 10, 15]
export const BAND = 25 // m on each side of a reached street
export const SNAP = 100 // m: farthest a click may be from a street node

// Buildings that count as cultural destinations ("museum" is not a use in the kit).
export const CULTURE_USES = ['culture', 'entertainment']

export const ATTRIBUTION =
  'Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).'
