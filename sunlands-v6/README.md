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
  city/                 Sundisk generator, sunklay material, wall, Veil, rites
  weather.js            the Harmattan front, coastal fog, rain
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

The near plane is the tier's, or the focus distance over four hundred,
whichever is larger. Part 1.3's table can only speak to altitude, and a depth
buffer spends its precision near the camera: resolvable depth at range `z`
goes as `z² / near`. At nine hundred metres up the table gives 1.8 and 18,000,
which is right for looking down and wrong for looking out. Along a shallow
line of sight across Sundisk that leaves half a metre of depth resolution four
kilometres away, and the city's flat roofs are much thinner than that, so the
whole quarter shears into stripes. Nothing can be near the camera that is not
near what it is aimed at. It is a floor and never a ceiling, so a close-up
keeps the tier's own near plane.

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

## What the city does on a clock

Three things in Sundisk run off the time of day rather than off a loop, and
all three are in `src/city/rites.js`.

**The temple's roof mirrors** throw a real reflection. Each plate has a normal,
the sun is reflected about it, and the reflected ray is marched down to the
height of the surrounding roofline; the pool is put where it lands. Nothing is
keyframed, which is why the design had to change once the algebra was done:
for a plate canted by `a` and a sun at elevation `e`, the reflected ray's
vertical component is `sin(2a + e)`, so a plate lying flat on the roof sends
the beam into the sky at every hour of the day. The mirrors stand nearly
upright, in a fan from due east to due west. Early and late the pools reach
seventy metres into the quarter; at noon they collapse back under the temple.

**The drums** fire the market close at solar noon, and the ring each strike
sends out travels at 343 m/s, because in a build whose premise is real
distances it has no business travelling any faster. Tower to the far side of
the Grand Market is about four seconds and you can watch it cross. The crowd's
market-open curve and the drums read one function, so the drums close the
market in the code as well as in the fiction.

**The gates queue**, longest at the eastern gate at dawn. Each figure holds a
gate index and a slot in the line; its position is derived in the shader from
that slot and the clock, so the queue shuffles forward for one draw call and
no CPU work.

## The Glass Desert

The sheet is a near-mirror, and what makes a mirror a mirror is that it shows
you something, so the reflected view direction is evaluated against the same
scattering function the sky dome is drawn with. The sheet carries the sunset,
and at night it carries the stars.

The emphasis belongs on **near**. Roughness two hundredths makes the sheet
optically perfect over kilometres, and a perfect mirror seen at the grazing
angles a flat plain is mostly seen at returns the sky and nothing else: the
first version of this came out indistinguishable from more sky, which is
correct and useless. Fused silica sandblasted by forty centuries of Harmattan
is a bad mirror. At 0.055, with the reflection blurred toward the sky's
hemisphere mean by the roughness rather than merely dimmed, it still reads as
a mirror close up and keeps its own colour along the horizon.

Fresnel is a split, not a bonus: light the mirror sends to the eye never
reached the glass to be absorbed, so the diffuse term gives up exactly what
the reflection takes.

Canon marks the hidden springs with darker glass, so the dark patches are a
field in their own right rather than a side effect of the crazing, and the
polish follows the same field: a spring is where the sheet is thinnest and
least like a mirror, so it reads as duller as well as darker.

**The glow from three hundred kilometres.** Canon says the reflected starlight
is visible from Sundisk's walls. The sheet itself cannot be what you see from
there, and it is worth being exact about why: Part 1.3 puts the Street tier
far plane at four kilometres, and even without that limit, the sheet at three
hundred kilometres is a band a hair below the horizon and thinner than a
pixel. What you would actually see is the air above the sheet, lit from below,
the way a city puts a dome of light over itself. So that is what it is: a glow
banked on the eastern horizon, computed from the camera's real bearing to the
Glass Desert, swinging round the sky as you travel and gone when you are
standing on the glass. Measured from the top of the Great Wall at midnight the
eastern sky reads **1.63 times** the western, and west and north measure the
same as each other, which is how you know it is a direction and not simply a
brighter night. Over the sheet itself the glass reads 1.84 times the sand sea
it is much the darker material than.

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

Last full run: **30 terrain checks and 39 browser checks, all passing.**

```
node sunlands-v6/tools/verify_terrain.mjs    # 30 headless checks on the height field
node sunlands-v6/tools/probe.mjs             # 39 checks against the real page
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
regional     draws  119 tris   1280k of which shadow      0k  OK
street       draws  160 tris   4222k of which shadow   1042k  OK
ashlands     draws   35 tris    105k of which shadow      0k  OK
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

It also asserts, by reading pixels rather than by looking at a screenshot,
that at night the Glass Desert is brighter than the sand sea it is darker
than, and that the eastern sky from the Great Wall carries a glow the west and
the north do not. And it asserts the city's clock: that the temple's light
pools sweep and then collapse under the temple at noon, that the drum ring
crosses the market at the speed of sound, and that the gates queue at dawn and
not in the heat.

Every speed check here, the walker's and the storm's and the drum ring's, is
measured per second of **simulated** time rather than per second of wall
clock. Under a software rasteriser the page runs at about one frame a second,
so wall clock would be measuring the rasteriser.

### What these checks do not cover

Part 2 sets frame-rate targets: 60 fps at 1080p on integrated graphics at
Regional tier, 30 fps minimum at Street. Nothing here can tell you whether
those are met. The verification runs on a software rasteriser at roughly one
frame a second, so the only performance numbers it can honestly produce are
the counts, draw calls and triangles, not the time. The counts are inside
budget at every tier and the Street-tier triangle load is down fourfold, which
is the part that was measurable. The frame rate itself wants a real GPU.

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

Where canon is silent it is marked in the code with a `// CANON GAP:` comment
rather than filled in. Four of those so far:

- the exact Solanu province boundaries, so the layers show each seat's reach
  instead of drawing a border that does not exist
- the individual military outpost sites, so the layers show the named
  approaches instead
- **Sundisk's gates.** Neither their number nor their names are recorded. Four
  cardinal and two service is a reading of a walled capital of a million and a
  half, and the names in `CITY.gates` are deliberately just bearings marked
  `[NAME UNRECORDED]`, so that an invention of this build cannot be mistaken
  downstream for a fact about the Sunlands.
- **the drum towers.** That they fire the market close at solar noon is canon.
  How many there are is not. Four, one per quarter inside the Middle Ring, is
  an acoustic argument: nowhere in the Grand Market is more than a few seconds
  of sound from one. That is not the same as a canon argument.

## Controls

**Fly-over:** drag to orbit, scroll to zoom, right-drag to pan. Click a place
label for its info panel.

**Explore:** WASD or arrows, mouse to look, shift to run, space to jump,
**V** first or third person, **G** cycles the travel accelerator, **M** for
the map, **Esc** to leave.

The travel accelerator is presented as what it is. At 100x the readout still
shows the real distance walked and the time it would take at walking pace.
The world is not shrunk to make the emptiness bearable.
