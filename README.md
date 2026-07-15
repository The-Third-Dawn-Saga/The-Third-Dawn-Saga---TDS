# The Third Dawn Saga — Definitive World Atlas

**The Crown of Tears** world atlas: a single self-contained offline HTML file
(`Third_Dawn_Definitive_Atlas.html`, mirrored as `index.html`). Open it from disk —
no network requests, no server.

## Views

- **Map** — 2D layered atlas. Three styles: **Satellite** (Blue Marble-style ocean,
  moisture-driven vegetation, Sahara-like dune banding, NW-light hillshade),
  **Atlas** (clean reference), and **Painted** (hand-drawn fantasy cartography:
  coastal contour banding, painterly terrain, illustrated mountain and tree glyphs,
  cartouche typography, arc-set sea names, a compass rose, dotted parchment routes).
  Layers: kingdom borders, mountains, rivers, settlements, Gates (Aetheric + the
  Nine Thresholds), wonders, trade routes, **Domains** (population-weighted interior
  boundaries per kingdom, clipped to coast and kingdom, never over the Ring, lakes,
  or the Red Reaches; free towns get circular reaches), hidden world, War Powers,
  and a label engine with priority decluttering (capitals > kingdoms > towns >
  villages > features). Travel calculator (foot / mounted / Sun Eater / Gate).
- **Cosmos** — the World-Cage: bowl, ice wall with carved faces and glowing eyes,
  four pillars, guardian stars (east socket empty), three leviathans, Mor'kaleth and
  the Circles of Silence, World Tree at readable scale. Atmosphere fresnel glow,
  drifting clouds, bump-mapped fbm terrain painted from the same palettes as the 2D
  raster, rivers as emissive tubes, vegetation clusters, glowing volcanoes, a
  day/night slider (night belongs to the settlement lights and the wall's eyes),
  distance-fading labels, luminous borders, and "Fly there" camera tweens from any
  info-panel entry.
- **Seasons** — a four-stop wheel (Early / High / Late / Deep) that every zone reads
  through its own calendar. Drives seasonal raster variants (Faro's Mirror, the Lake
  of a Hundred Autumns, Deepmere's ice road, the snow and sea-ice lines, Harmattan
  and Ashfall haze, the Bloom), ten migration flow sets, seasonal human-activity
  markers, and PROPOSED travel modifiers.

## Architecture

Source modules live in `src/`; a build step emits the one-file HTML.

| path | role |
|---|---|
| `src/data.js` | all canon (tags LOCKED / PROPOSED / RECONCILE are load-bearing) + seasonal data |
| `src/geo.js` | shared classification, palettes, season-aware raster painter, travel model — runs on the main thread, in the Worker, and under Node |
| `src/map.worker.js` | raster Worker body (full raster + LOD tiles + cosmos texture → ImageBitmap) |
| `src/map.js` | 2D engine: two stacked canvases, worker client with priority queue, 2-level LOD tile pyramid, world-space Path2D caches, season UI, migration flows |
| `src/cosmos.js` | 3D world-cage |
| `src/shell.js` | mode tabs + flyTo glue |
| `src/template.html` | UI shell |
| `src/vendor/three.min.js` | Three.js r128 (inlined at build) |

`data.js` + `geo.js` are emitted once and re-read as text from their own
`<script id>` tags to assemble the Worker blob — one copy, two uses.

## Commands

```
npm install        # esbuild + playwright-core (dev only)
npm run build      # → Third_Dawn_Definitive_Atlas.html + index.html
npm test           # canon smoke tests (land check, fishing-village ruling, embargo, seasons)
npm run screenshots  # browser verification + review screenshot set
npm run perf       # FPS probe (flows animating + drag pan @1080p)
```

## Canon rules under test (never regress)

- `__landCheck()` returns `[]`.
- Fishing village → Sundisk City: 2 days by Sun Eater, one crystal, no recharge.
- Paradise Terminal is exit-only (embargo); journeys never arrive through it.
- Gate transit: `10 + 80·(dist/7600)` clamped 10–95 min.
- PROPOSED / RECONCILE tags survive the build verbatim.

Test hooks exposed on `window`: `__landCheck`, `__setStyle`, `__setSeason`,
`__journey`, `__mapResize`, `__rasterReady`, `__tilesReady`, `__cosmosStart`,
`__cosmosFlyTo`.

`screenshots/` holds the review set (satellite/atlas × High/Deep, migrations,
LOD zoom, cosmos day/night/flyTo) for Rush's ratification pass.
