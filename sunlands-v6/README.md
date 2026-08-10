# The Southern Sunlands, v6

A true-scale, streamed, multi-tier 3D model of the Southern Sunlands.

**One world unit is one metre. Everywhere, at every zoom level, in both
fly-over and walk-around modes.** Every other decision in this build serves
that one.

Static site, no build step. Open `index.html` from a web server (module
workers and `fetch` both need an origin, so `file://` will not do) and it
runs. Deployable to GitHub Pages alongside the existing atlas.

```
python3 -m http.server 8000     # then open http://localhost:8000/sunlands-v6/
```

---

## The acceptance test

Part 1.4 of the brief sets one test, and it is the whole point of the
rebuild:

> at the altitude where the whole Sunlands fills the viewport, Sundisk City's
> entire 18 km metro footprint must occupy fewer than 12 screen pixels.

At 1920x1080 with a 50 degree vertical field of view, the Sunlands bounding
box fills the viewport at **1,930 km** altitude, and Sundisk measures
**10.80 px**. The projection maths and the live render camera agree to four
decimal places. `tools/probe.mjs` asserts it on every run against the real
camera, not against a mock.

---

## Layout

```
index.html              importmap, canvas, HUD shell
data/canon.json         every place, its coordinates in METRES, its info text
src/
  units.js              units, world extents, view tiers, travel speeds
  scale.js              the floating origin, the acceptance test
  env.js                time of day, sun, weather, season
  sky.js                Rayleigh and Mie scattering
  world.js              region registry and streaming manager
  main.js               bootstrap, render loop, mode switching
  terrain/              noise, height field, chunk mesher, worker, sand shader
  water/                Gerstner ocean, depth-driven shoreline and foam
  city/                 Sundisk generator, sunklay material, wall, the Veil
  regions/              settlements, landmarks, life, the Ashlands
  explore/              character controller, collision, footprints, audio
  ui/                   HUD, labels, map, reference layers
  shaders/              shared GLSL
vendor/three/           Three.js r185, vendored so the site works offline
tools/                  verification and screenshots
```

## Axes and origin

```
+X = east      +Z = south      +Y = up
```

This is deliberately **not** the usual Three.js convention of -Z forward. A
heading of 0 rad points east and increases toward south. Every heading in the
codebase follows that rule; see `headingToVector()` in `units.js`.

`(0, 0, 0)` is the centre of the Solaharan's throne dais in the Royal Palace.

**Sea level is world Y -241, not 0.** Sundisk stands on a plateau, so once the
dais is the origin the sea has to sit below it. See the note at the top of
`terrain/height.js`.

---

## The four view tiers

One continuous zoom axis. Camera altitude picks the tier; near and far are
log-interpolated between tier anchors, so there is no hard cut at a boundary.

| tier | altitude | near / far |
|---|---|---|
| Continental | 400 km to 2,000 km | 5,000 / 4,000,000 |
| Kingdom | 40 km to 400 km | 500 / 600,000 |
| Regional | 2 km to 40 km | 20 / 60,000 |
| Street | 1.6 m to 2 km | 0.1 / 4,000 |

## Streaming

Terrain streams by **screen-space error**, not distance rings: a quadtree node
splits when the height error it would introduce projects to more than 2.4
pixels. Fourteen levels, from a 4,194 km root to 256 m leaves with 4 m posts.
Three chunk uploads per frame, hard.

Region content streams by **distance and tier**, because a settlement has a
size: an imposter beyond 8 km, blocks from 8 km to 2 km, the full build
inside that. One region build per frame.

Nothing is in the scene at load.

## Shadows

Two cascades, sized in metres and centred ahead of the camera: a near one at
90 m that carries doorways, awnings and the shadow a person casts, and a far
one at 620 m that carries the wall, the towers and the dune faces. Both snap
to their own texel grid so the edges do not crawl. Off entirely at
Continental tier and faded out through Kingdom, because a nine metre wall
casts a sub-pixel shadow from forty kilometres up.

The depth pass uses one override material for everything, and re-renders on
alternate frames unless the sun has moved. The crowd does not cast: nine
thousand ankle-height shadows cost a great deal and show almost nothing.

## Weather that has a position

Two of the four Part 5.5 states are not global tints, so they are not
implemented as ones.

The **Harmattan** has a front. It advances along the wind axis at 80 km/h and
the dust in the air is a function of how far behind that line you are: nothing
ahead of it, a wall within six kilometres of the leading edge, thinning out
over the two hundred kilometres behind. Inside it visibility is about four
hundred metres against two hundred and fifty kilometres outside. That is what
makes the Sunward Veil mean anything, and it is why the wall is a real front
rather than a fog slider.

**Coastal fog** is a function of distance to the coast, because "penetrates
80 km inland" is a statement about the coast rather than about a number.

**Rain** floods the wadis. The terrain classification already carries a
watercourse channel, so the water appears exactly where the ground drains.
It fills in about four seconds and drains over twenty, which is the whole
reason a wadi is dangerous.

## Verification

```
node sunlands-v6/tools/verify_terrain.mjs    # 30 headless checks on the height field
node sunlands-v6/tools/probe.mjs             # drives the real page in a real browser
node sunlands-v6/tools/probe.mjs --shots     # the same, plus tier screenshots
node sunlands-v6/tools/shots.mjs             # the review screenshot set
node sunlands-v6/tools/budget.mjs            # the Part 2 budget check, fast
node sunlands-v6/tools/budget.mjs --where    # the same, plus where the triangles are
```

`probe.mjs` waits for the terrain queue to drain at 1920x1080, which under a
software rasteriser takes a long time. `budget.mjs` is the same draw-call and
triangle check at a smaller viewport with a fixed settle, for when the
question is only whether a change blew the budget.

Both report the **worst frame of the last eight**, not the frame the tool
happened to land on. The shadow cascades re-render on alternate frames, so a
single reading alternates between two very different answers and the low one
is a lie: the frames that stall are the expensive ones.

Last budget run:

```
continental  draws   42 tris    275k of which shadow      0k  OK
kingdom      draws   56 tris    277k of which shadow      0k  OK
regional     draws  118 tris   1277k of which shadow      0k  OK
street       draws  152 tris   4212k of which shadow   1035k  OK
ashlands     draws   38 tris    131k of which shadow      0k  OK
```

Street tier used to carry 16.9M triangles, 11.1M of them in the shadow pass.
The cause was the shape of the city's instance buckets: they were split into
twelve angular sectors, and a sector runs from the palace to the edge of the
Commons, nine kilometres. An InstancedMesh is culled whole or not at all, so
any wedge the camera could see a corner of was drawn along its whole length,
and then twice more for the cascades. Cutting radially as well, at the canon
ring boundaries, turns each bucket into a segment the frustum can reject. Four
times fewer triangles for thirty more draw calls.

`verify_terrain.mjs` runs under plain Node because the height field is pure
and free of Three.js on purpose. Among other things it asserts that every
canon coastal settlement is on land and near the water, that every inland one
is inland, that the Sunset Islands have sea around them, that the sand-sea
share is close to the canon 30 percent, and that the prefiltered per-chunk
sampler returns bit-identical results to the unfiltered reference.

`probe.mjs` asserts the acceptance test, the Part 2 draw-call budget at all
four tiers, that a walker walks at 1.4 m/s and runs at 4.5 m/s measured per
second of movement rather than per second of wall clock, that the travel
accelerator keeps counting the real walk underneath it, that crossing the
Ashlands frontier is a colour grade change, that the city carries at least
thirty thousand instances inside the budget, and that the Harmattan front
advances at 80 km/h with clear air ahead of it and four hundred metre
visibility behind.

Both speed checks, the walker's and the storm's, are measured per second of
**simulated** time rather than per second of wall clock. Under a software
rasteriser the page runs at about one frame a second, so wall clock would be
measuring the rasteriser.

---

## Canon status

`data/canon.json` carries the status tags verbatim and they are load-bearing:
**LOCKED**, **PROPOSED**, **RECONCILE**, **OPEN**. They appear on the place
labels, in the info panels, and in the source. Nothing has been promoted.

The seven open questions from Part 10 are in the file with their defaults.
One of them was sharpened by building the thing:

> **O-4.** The fishing village is three days on foot from Sundisk, rendered as
> roughly 120 km. The coordinates the placement table gives, `(0, 0)` and
> `(+72, +118)`, are **138.2 km apart in a straight line**, so no road between
> them can be 120 km. Three days at 4 km/h over an 8 hour day is 96 km, so
> even 120 km is already four days of walking. Flagged, not resolved.

Two places where canon is silent are marked in the code rather than invented:
the exact Solanu province boundaries and the individual military outpost
sites. The layers show each seat's reach and the named approaches instead of
drawing a border that does not exist.

## Controls

**Fly-over:** drag to orbit, scroll to zoom, right-drag to pan. Click a place
label for its info panel.

**Explore:** WASD or arrows, mouse to look, shift to run, space to jump,
**V** first or third person, **G** cycles the travel accelerator, **M** for
the map, **Esc** to leave.

The travel accelerator is presented as what it is. At 100x the readout still
shows the real distance walked and the time it would take at walking pace.
The world is not shrunk to make the emptiness bearable.
