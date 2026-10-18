# City Reach

A 3D map of central Weimar (the city kit, about 1.3 × 2 km). It shows how far you can walk from any point in 5, 10 and 15 minutes, and roughly how many people live in each area.

## What the app does

- **The city.** Every building is extruded from its footprint to its measured height and coloured by its main use. A legend names each colour. Streets are drawn as thin lines on a pale ground. Drag to orbit, right-drag to pan, scroll to zoom.
- **The reach.** Click on the ground and the walk starts at the nearest street junction. If no street is within 100 m, the app says so. It then follows the pedestrian network and draws three nested areas for 5, 10 and 15 minutes in three shades of red-orange. Buildings that touch an area take the same shade.
- **The residents.** For each area, the panel shows how many buildings are reached and about how many people live there.
- **Whose 5 minutes?** The same distance takes a different time for different people. A table shows what the standard 5, 10 and 15-minute walks mean for younger adults, adults, older adults and cyclists. Dashed lines on the map show how far older and younger adults get in 5, 10 or 15 minutes. The panel also gives the average age of the residents in each walking area.
- **Culture and entertainment.** Reached buildings whose main use is culture or entertainment are shown in dark blue. The five nearest are numbered on the map and listed with their distance along the streets and the time on foot, for older adults and by bike.
- **Walk or bike.** A switch recalculates every area, building count and resident count for cycling at 250 m per minute.

## How to run it

You need [Node.js](https://nodejs.org) (version 20 or newer). In this folder:

```
npm install     install the packages (once)
npm run dev     start the app at http://localhost:5173
```

`npm run build` makes the published version in `dist/`. GitHub Pages builds and publishes it on every push to `main` (see `.github/workflows/`), at `https://<user>.github.io/<repo>/`.

## Method and limits

- **Walking speed.** 4.8 km/h, which is 80 m per minute, along the pedestrian network in `streets.graph.json`. The walk starts at the junction nearest to the click, at most 100 m away. The few metres from the click to that junction are not counted.
- **The 25 m band.** Each area is the set of street pieces reached in that time, including the reachable part of the last street, with a band of 25 m on each side, joined into one shape. It is not a circle and not a convex hull. A building counts as reached when its footprint touches the band.
- **How residents are counted.** The Zensus 2022 gives residents per 100 m cell. For every cell that overlaps an area, the app takes the cell's residents times the share of the cell's area that lies inside. It adds these up and rounds to the nearest 10. This assumes people are spread evenly over a cell, which they are not: a cell's residents live in its buildings, not on its streets. The census also changes small counts slightly at random to protect privacy.
- **Cells without a figure.** Some cells have no published resident count (`null`). They are not zero. They are left out of the sum, and the panel shows how many of them overlap each area.
- **Age speeds.** Younger adults (18–35) walk about 1.15 times faster (92 m/min) and older adults (65+) about 0.65 times as fast (52 m/min). These factors are assumptions, not data from the kit. The census gives only an average age per cell, not age groups, so the app cannot say how many residents walk at which speed.
- **Culture.** The kit has no "museum" use. Culture means buildings whose main use is `culture` or `entertainment`. Their distance is measured along the streets to the point nearest the building, plus the short gap to its footprint.
- **Bike.** 15 km/h, which is 250 m per minute, on the same pedestrian network. The bike times ignore one-way streets, stairs and pedestrian zones, so they are approximate. In 15 minutes a bike reaches almost the whole kit, so the 10 and 15-minute bike areas look the same.

## Data sources

All data is in `public/data/`. `SOURCES.md` there describes every file and field.

| Data | Source | Licence |
| --- | --- | --- |
| Building footprints and heights | 3D building models LoD2 of Thuringia, © GDI-Th; uses by Egor Gaydukov | dl-de/by-2-0 |
| Pedestrian network | Egor Gaydukov, InfAU, Bauhaus-Universität Weimar | |
| Census grid (residents, average age) | Zensus 2022, 100 m grid, © Statistische Ämter des Bundes und der Länder | dl-de/by-2-0 |

Attribution, as shown on the map:

> Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).

## How this was made

1. Tools: Claude Code, with the model Claude Opus 5.5 (claude-opus-5-5).
2. I decided:
3. The agent did: it read the city kit, wrote the React Three Fiber app with its reach, resident, age, culture and bike calculations, tested the calculations, and wrote this README.
4. I checked:
