# Third Dawn Definitive Atlas: Claude Code Handoff Spec
**Project:** The Third Dawn Saga, Crown of Tears world atlas
**Date:** July 2026
**Author workflow:** Rush ratifies canon; tags LOCKED / PROPOSED / RECONCILE are load-bearing and must survive any refactor.

---

## 1. What exists now

`Third_Dawn_Definitive_Atlas.html` is a single self-contained file (~720 KB): Three.js r128 inlined, plus four inline script blocks in this order:

1. **DATA** — all canon: `WORLD`, `KINGDOMS`, `FOREST_RING`, `MOUNTAINS`, `RIVERS`, `LAKES`, `FORESTS`, `SETTLEMENTS`, `GATES`, `RING_GATES` (the Nine Thresholds), `WONDERS`, `HIDDEN`, `ISLANDS`, `SEAMARKS`, `ROUTES`, `COSMOS`, `TRAVEL`, `SEASONS`, and the coastline functions `coastNoise(theta)` / `islandNoise(theta,seed)`. World units are miles in a 9000x7000 space; continent ellipse center (4500,3500), a=3560, b=2680, ~30M sq mi per the March 2026 retcon.
2. **COSMOS** — 3D world-cage view (bowl, ice wall with 28 carved faces and emissive eyes, four pillars, three guardian stars with the eastern socket empty, three animated leviathans, Mor'kaleth + two Circle of Silence rings, islands, World Tree at readable scale, custom drag-orbit).
3. **MAP** — 2D engine: pre-rendered 1500x1167 terrain raster in two palettes (`satellite`, `atlas`), noisy coastline, layer toggles, hit-testing -> info panel, travel calculator (foot / mounted / Sun Eater / Gate), quick journeys.
4. Shell script — mode tabs calling `__cosmosStart()` / `__mapResize()`.

**Test hooks already exposed:** `window.__landCheck()` (returns features not on land; must return `[]`), `window.__setStyle(s)`, `window.__mapResize`, `window.__cosmosStart`.

## 2. Canon rules that must never regress

- Fishing village -> Sundisk City: **2 days by Sun Eater, one crystal, no recharge** (~776 mi at 405 mi/day base, desert multiplier 0.95, range 810 mi). This is a ratified ruling; there is a smoke test for it.
- Gate transit: 10-15 min typical, ~90 min full north-south. Formula: `10 + 80*(termDist/7600)` clamped 10-95. Paradise Terminal is **exit only** (embargo); journey routing must skip it as an arrival.
- The Weapon at Mor'kaleth is the **tree-killing cannon** (LOCKED), not the Spire of Ascension. Info text already corrected.
- The Forest Ring gap sits at Zar'kaine's Sulphur Coast (15-85 deg in the map's angle convention). The Nine Thresholds are the only crossings.
- Ice wall faces with glowing eyes; pillars ON the wall; stars ABOVE pillars: south yellow (Salem), north+west red (fallen), east missing.
- World Tree, pillars, and leviathans render at readable scale (legend says so); 2D distances are true.
- PROPOSED/RECONCILE tags inside info strings are canon-workflow markers. Do not strip them.

## 3. Goal A — Visual upgrade to match the reference globe

Reference file: `Crown_of_Tears_Globe_corrected__1_.html` (user-supplied, 166 KB). Its technique inventory, all of which should be ported or adapted:

| Reference function | Technique | Apply to |
|---|---|---|
| atmosphere ShaderMaterial | Fresnel rim glow: `pow(0.65 - dot(vN, vec3(0,0,1)), 2.6) * intensity` | Add an atmosphere shell around the whole cosmos bowl scene; also a soft glow shell on the Isle of Last Light and World Tree |
| `buildCloudTexture` + drift | Animated semi-transparent cloud layer | A slowly rotating cloud disc above the continent in cosmos view; optional 2D cloud-shadow layer |
| `buildSurfaceTexture` w/ `fbm`, `hash` | High-res fbm-painted terrain | Regenerate the cosmos continent texture at 4096 wide using the SAME palettes as the 2D raster so the two views agree |
| `buildBumpTexture` | Bump map from mountain field | Bake `MTNFIELD` distances into a bump/normal map for the continent mesh |
| `buildRiverTubes` | Rivers as TubeGeometry | Replace texture-painted rivers with slim emissive-blue tubes in cosmos view |
| `buildVegetationLayers` | Layered vegetation sprinkle | Forest Ring, Jotunwood, Whisperwood as instanced cone/billboard clusters |
| `buildVolcanoes` | Glowing volcano cones | Burning Peaks, Serpent's Spine, Mount Vaelspyre-class peaks, the Drowning Pillars |
| `applyTimeOfDay` | Sun position + palette lerp | A day/night slider; night shows settlement lights (emissive points sized by population) and the ice wall's glowing eyes dominating |
| `flyTo` | Camera tween to a feature | Clicking any info panel entry offers "Fly there" in cosmos view; smooth eased tween |
| `buildFeatureLabels` | Sprite text labels in 3D | Kingdom + capital labels that fade by camera distance |
| `buildKingdomBorders` | Border curves on the surface | Thin luminous borders on the cosmos continent, toggleable |

**Aesthetic target:** the reference globe's look is atmospheric, soft-lit, and painterly rather than diagrammatic. Keep the atlas's parchment-gold UI; upgrade the scene, not the chrome.

## 4. Goal B — Performance and architecture

1. **Split the monolith** into `src/data.js`, `src/map/`, `src/cosmos/`, `src/ui/`, with a build step (esbuild) that still emits ONE self-contained offline HTML file. Single-file delivery is a hard requirement; module DX is the improvement.
2. **Raster in a Worker.** `buildRaster` (~1.75M pixel classifications) currently blocks the main thread ~1-2 s per style. Move to a Web Worker + `OffscreenCanvas`, build both styles eagerly in the background, post back as `ImageBitmap`.
3. **LOD tiles.** At zoom > ~0.5 px/mi the single raster blurs. Add a 2-level tile pyramid (e.g., 4x4 tiles at 3000x2334 equivalent) rendered lazily per visible tile in the worker, cached by (style, tile).
4. **Draw only on change.** The 2D view redraws per pointermove; keep that, but split static raster blit from dynamic overlay (labels/markers) via two stacked canvases so pans blit cheaply.
5. **Path2D caching** for kingdom borders, routes, rivers keyed by zoom bucket.
6. **Cap `devicePixelRatio` at 2** and pause the cosmos RAF loop when its tab is hidden.
7. **Keep the smoke tests.** jsdom + node-canvas tests exist (land check, journey ruling, click info). Port them to the new build; add one per new feature. `__landCheck()` must stay green after any data edit.

## 5. Goal C — Seasonal systems and migration layers

The `SEASONS` object in data.js holds six zones (sahel, monsoon, taiga, maritime, alpine, volcanic) with season names, movements, and human activities, all sourced from the July 2026 research pass and reconciled to canon. Build:

1. **A season control.** A four-stop wheel (Early / High / Late / Deep, mapped per zone to its own season names) or a continuous annual slider. Each zone reads the global position through its own calendar (the taiga's eight-part calendar and the volcanic zones' vent-cycle seasons are offsets, not exceptions).
2. **Seasonal raster variants.** Parameterize `buildRaster(style, season)`:
   - Sunlands: the Greening tints the Sahel belt green-gold; the Long Dust bleaches it and adds Harmattan haze (a translucent tan gradient from the north). **Faro's Mirror** (`LAKES.faros`, `seasonal:true`) renders as water in the Greening and as salt-flat white in the Long Dust.
   - Jade: **the Lake of a Hundred Autumns** scales rx/ry down ~45% in the Clear Cold, breaking into a scatter of small pools (draw 8-12 sub-ellipses inside the shrunken bound).
   - Northern: the snow line and sea-ice edge move south in deep winter; **Deepmere** renders as ice-road white with a sled-track dash.
   - Alpine: snowcap threshold in the mountain relief drops in winter, rises in summer.
   - Volcanic: the Ashfall season adds drifting ash haze over the Ashlands/Zar'kaine; the Bloom adds faint luminous green at the Painted Basin and Bloomfields.
3. **Migration flow layer.** Animated particles flowing along polylines (reuse the routes renderer), one flow set per zone per season, driven by `SEASONS[zone].movements`:
   - Sahel: herd arrows south at Long Dust onset, north at first rain, between the herd-confederacy ranges and the floodplain margins.
   - Monsoon: eel particles downriver (autumn) and upriver (late winter) on the Three Great Rivers; crane arcs converging on the Lake of a Hundred Autumns (autumn) and dispersing north (spring).
   - Taiga: reindeer bands between the Jotunwood and the northern coast strip, up to 400 mi.
   - Maritime: whale tracks north (summer) / south (winter) along the eastern and southern seas; the Herring Road pulses in the Herring-Fall; seabird density dots at the Gannet Stacks spring-summer.
   - Alpine: short up/down altitude arrows along the Ibex Passes; the livestock Ascent/Descent along Charterhouse valleys.
   - Volcanic: recolonization pulses radiating inward from zone edges after Ashfall events.
4. **Human-activity markers.** Each season shows its activity set from `SEASONS[zone].human` as small timed markers: salt camps (Dust only), the Great Thing (taiga summer), the Descent festival (alpine autumn), crane festivals (Jade winter), salvage runs (volcanic Quiet). Clicking one opens the info panel with the research-derived text.
5. **Travel calculator seasonal modifiers** (flag PROPOSED in UI until ratified): winter halves foot/mount speed in taiga and alpine zones but opens ice roads (mounted speed on frozen lakes/rivers); the Harmattan slows desert travel 20%; monsoon floods slow Jade plains travel but speed river routes.

## 6. Realism notes for implementation

- Migrations are not decorations; they are the food calendar. Predator/monster markers (future layer) should key to them (Witcher rule: monsters have habitats, prey, seasons).
- The honest toxic-zone register is recolonization plus subtle wrongness, not monsters: the Bloomfields and Pale Hounds are the tone.
- Divine Flow overlay (future): every seasonal layer eventually gets a Flow annotation (the Greening tracks a Flow surge; the Quiet is a Flow ebb). Defer specifics to the Divine Flow Ecology document; extend, never contradict.
- Tone rule everywhere: braid grim and wonderful. The Descent festival garlands only the herds that lost nothing; render both kinds.

## 7. Definition of done

- [ ] Single offline HTML output, no network requests, opens from disk.
- [ ] Cosmos view visually comparable to the reference globe (atmosphere, clouds, bump, day/night, flyTo).
- [ ] 60 fps pan/zoom on the 2D map at 1080p; raster builds off-thread; no interaction jank > 16 ms.
- [ ] Season control drives raster variants + at least four migration flow sets.
- [ ] `__landCheck()` returns `[]`; fishing-village ruling test passes; Paradise embargo test passes.
- [ ] All PROPOSED/RECONCILE tags preserved verbatim in info text.
- [ ] Screenshot diff set (satellite/atlas x two seasons x day/night) committed for Rush's review.
