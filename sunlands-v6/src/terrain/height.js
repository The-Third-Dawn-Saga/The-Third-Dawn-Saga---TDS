/* ============================================================================
   height.js  ::  terrainHeight(x, z) and the material classification.

   The single source of truth for the shape of the ground. The quadtree
   evaluates it at fourteen levels of detail, the mesher worker evaluates it
   for every vertex, and the character controller evaluates it for collision.
   All three must agree exactly, so this file is pure: same inputs, same
   outputs, no time, no state, no randomness at call time.

   Coordinates are ABSOLUTE metres. +X east, +Z south, +Y up.
   The origin is the throne dais in Sundisk, so sea level is NOT y = 0. See
   the SEA_LEVEL note below.

   COMPOSITION, per the mission brief and the project worldbuilding reference:

     base   domain-warped fbm, 4 octaves, freq 4e-6, persistence 0.5, x180 m
     dunes  fbm, 5 octaves, freq 6e-5, x45 m
     ridges abs(simplex) at 2e-5, x90 m, sheared into the wind frame so the
            ridges run as linear dunes rather than as blobs
     reg    worley F2-F1 at 4e-4, thresholded, hard cracked pavement
     ripple sin(dot(windDir, xz) * 0.8) * 0.15 m surface ripples

   then authored stamps override or blend: the city plateau, the salt flats,
   the glass sheet, the Wailing Cliffs, the Ashteeth, about forty star dunes,
   the oases, the canal corridors, the Ashlands, and the coast.
   ========================================================================= */

import {
  simplex2, fbm, warpedFbm, worleyF2F1, hash2i, hash3i,
  clamp, lerp, smoothstep, smin,
} from './noise.js';
import { KM, WIND } from '../units.js';

/* WHERE SEA LEVEL SITS, AND WHY IT IS NOT ZERO.

   The brief fixes the origin at the centre of the Solaharan's throne dais.
   Sundisk stands on a plateau something over two hundred metres above the
   Sunlands Sea, so once the dais is y = 0 the sea CANNOT also be y = 0. It
   has to sit below the origin by the city's elevation. Everything internal to
   this file is computed as elevation above the sea, in the units the canon
   text uses, and converted to world Y once at the end of terrainHeight.

   Change SEA_LEVEL and the whole world moves under the dais, which is the
   correct behaviour: the dais does not move, it is the origin. */
export const SEA_LEVEL = -241;                  // world Y of the sea surface

/* The city ground plane. The dais is a raised platform whose top centre is
   the origin, so the ground the palace stands on is one dais below y = 0. */
export const DAIS_HEIGHT = 0.9;
export const CITY_GROUND_Y = -DAIS_HEIGHT;      // world Y
const CITY_ELEVATION = CITY_GROUND_Y - SEA_LEVEL;   // metres above the sea

/* ---------------------------------------------------------------------------
   THE COAST

   An open polyline running west to east along the southern shore and then
   north up the eastern shore. Land lies on the left of travel, which in our
   axes (with +Z south, so "down" on a map) is the negative-cross side.
   Authored in kilometres, converted once at load.
   ------------------------------------------------------------------------ */

const COAST_KM = [
  [-2600, 560], [-2300, 600], [-2000, 628], [-1700, 646], [-1400, 640],
  [-1150, 614], [-900, 584], [-700, 558], [-520, 534], [-380, 508],
  [-280, 476], [-210, 450], [-150, 422], [-100, 392], [-60, 340],
  [-30, 268], [-8, 196], [10, 150], [28, 124], [46, 116],
  [66, 117], [80, 122], [98, 128], [130, 138], [180, 150],
  [240, 160], [360, 176], [500, 190], [640, 197], [780, 203],
  [900, 214], [1010, 214], [1110, 198], [1180, 172], [1224, 132],
  [1252, 60], [1266, -60], [1268, -220], [1252, -430], [1218, -640],
  [1180, -900], [1150, -1300],
];

const COAST = new Float64Array(COAST_KM.length * 2);
for (let i = 0; i < COAST_KM.length; i++) {
  COAST[i * 2] = COAST_KM[i][0] * KM;
  COAST[i * 2 + 1] = COAST_KM[i][1] * KM;
}
const COAST_N = COAST_KM.length;

/* The Poison Sea bounds the Ashlands on the west, Part 3.3. */
const POISON_SEA_X = -2600 * KM;

/**
 * Signed distance from the coast in metres. Positive inland, negative at sea.
 * Nearest-segment sign. The polyline is smooth enough that the usual
 * nearest-segment sign artefacts at concave corners stay well below the
 * amplitude of the coastal noise added on top.
 */
function rawCoastDistance(x, z, segs) {
  let best = Infinity, bestSign = 1;
  const n = segs ? segs.length : COAST_N - 1;
  for (let s = 0; s < n; s++) {
    const i = segs ? segs[s] : s;
    const ax = COAST[i * 2], az = COAST[i * 2 + 1];
    const bx = COAST[i * 2 + 2], bz = COAST[i * 2 + 3];
    const dx = bx - ax, dz = bz - az;
    const px = x - ax, pz = z - az;
    const len2 = dx * dx + dz * dz;
    let t = (px * dx + pz * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = px - dx * t, cz = pz - dz * t;
    const d2 = cx * cx + cz * cz;
    if (d2 < best) {
      best = d2;
      /* Screen-style cross product with +X right and +Z down. Land is the
         negative side, so flip it to make land positive. */
      bestSign = (dx * pz - dz * px) < 0 ? 1 : -1;
    }
  }
  return bestSign * Math.sqrt(best);
}

/* Coastal settlements that canon puts on the water. The noise added to the
   coastline is tens of kilometres of bays and headlands, which would happily
   drown a fishing village, so each of these guarantees a minimum of land at
   its position and blends the guarantee out over its radius. Explicit, small,
   and visible, rather than a fudge buried in the noise. */
const LAND_GUARDS = [
  /* x km, z km, radius km, minimum land distance km */
  [0, 0, 40, 60],        // Sundisk plateau, well inland, keeps the metro dry
  [40, 110, 22, 3.0],    // Mensah's Landing
  [72, 118, 14, 1.2],    // Rhy's fishing village, right at the water
  [-280, 470, 26, 3.0],  // Drum Harbor
  [1210, 140, 30, 3.0],  // Golden Coast
];

/** Coast distance with bays and headlands, and the settlement guards applied. */
export function coastDistance(x, z, segs) {
  let d = rawCoastDistance(x, z, segs);
  d += fbm(x + 4210.5, z - 1180.25, 4, 1 / 42000, 0.5) * 5200;
  d += fbm(x - 9820.75, z + 3311.5, 3, 1 / 9000, 0.5) * 900;
  for (let i = 0; i < LAND_GUARDS.length; i++) {
    const g = LAND_GUARDS[i];
    const gx = g[0] * KM, gz = g[1] * KM, gr = g[2] * KM, gm = g[3] * KM;
    const r = Math.hypot(x - gx, z - gz);
    if (r < gr) {
      const w = smoothstep(gr, gr * 0.25, r);
      d = Math.max(d, lerp(d, gm, w));
    }
  }
  /* The Poison Sea, west of the Ashlands. Its own shore, its own noise. */
  const poison = (x - POISON_SEA_X) + fbm(x, z + 7700, 3, 1 / 30000, 0.5) * 6000;
  return Math.min(d, poison);
}

/* ---------------------------------------------------------------------------
   THE ISLANDS

   The Sunset Islands are the only landmass the coastline does not describe,
   so they are stamped: three islands, a pirate confederation.
   ------------------------------------------------------------------------ */

const ISLANDS = [
  /* x km, z km, radius km, peak m */
  [-120, 720, 34, 210],
  [-62, 686, 22, 160],
  [-168, 762, 19, 140],
];

function islandField(x, z, list) {
  list = list || ISLANDS;
  let best = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const cx = c[0] * KM, cz = c[1] * KM, cr = c[2] * KM;
    const wob = 1 + fbm(x * 3, z * 3, 3, 1 / 9000, 0.5) * 0.28;
    const r = Math.hypot(x - cx, z - cz) / (cr * wob);
    if (r < 1.35) {
      const v = (1 - r) * cr;
      if (v > best) best = v;
    }
  }
  return best === -Infinity ? -Infinity : best;
}

/* ---------------------------------------------------------------------------
   THE WIND FRAME

   The Harmattan comes out of the northeast. Linear dune ridges run along the
   wind, so heights are sampled in a frame rotated to the wind direction and
   stretched five to one along it. That is the difference between dunes and
   blobs.
   ------------------------------------------------------------------------ */

const WX = WIND.dir.x, WZ = WIND.dir.z;
const windAlong = (x, z) => x * WX + z * WZ;
const windAcross = (x, z) => -x * WZ + z * WX;

/* ---------------------------------------------------------------------------
   THE STAR DUNES

   Roughly forty, reaching 500 m, generated once at module load from a fixed
   seed so their coordinates are stable landmarks a walking player can
   navigate by. Exported so the map overlay and the minimap can label them.
   ------------------------------------------------------------------------ */

export const STAR_DUNES = [];
{
  /* Scattered through the sand seas of the Sunlands box, avoiding the city,
     the glass sheet and the salt flats, which are stamped flat anyway. */
  let n = 0, i = 0;
  while (STAR_DUNES.length < 40 && i < 4000) {
    const h1 = hash3i(i, 17, 3), h2 = hash3i(i, 31, 11), h3 = hash3i(i, 57, 23);
    i++;
    const x = lerp(-1250 * KM, 1200 * KM, h1);
    const z = lerp(-950 * KM, 560 * KM, h2);
    if (Math.hypot(x, z) < 90 * KM) continue;                 // clear of Sundisk
    if (Math.abs(x - 530 * KM) < 250 * KM && Math.abs(z + 70 * KM) < 160 * KM) continue;
    if (Math.abs(x + 520 * KM) < 190 * KM && Math.abs(z - 40 * KM) < 125 * KM) continue;
    if (coastDistance(x, z) < 40 * KM) continue;              // inland only
    let tooClose = false;
    for (const d of STAR_DUNES) if (Math.hypot(d.x - x, d.z - z) < 110 * KM) { tooClose = true; break; }
    if (tooClose) continue;
    STAR_DUNES.push({
      id: `stardune-${STAR_DUNES.length + 1}`,
      x, z,
      radius: lerp(7 * KM, 17 * KM, hash3i(i, 71, 5)),
      height: lerp(260, 500, h3),
      arms: 3 + Math.floor(hash3i(i, 91, 9) * 3),             // 3 to 5 arms
      phase: hash3i(i, 113, 13) * Math.PI * 2,
    });
    n++;
  }
}

/* ---------------------------------------------------------------------------
   THE OASES

   Twelve major oases within 400 km of Sundisk, plus two hundred minor ones
   scattered wider, per Part 3.2. Deterministic from a fixed seed. Each is a
   shallow depression with a water table near the surface.
   ------------------------------------------------------------------------ */

export const OASES = [];
{
  const push = (x, z, major, idx) => {
    OASES.push({
      id: `${major ? 'oasis-major' : 'oasis-minor'}-${idx}`,
      x, z, major,
      radius: major ? lerp(2200, 5200, hash3i(idx, 5, 41)) : lerp(300, 1400, hash3i(idx, 5, 43)),
      depth: major ? lerp(9, 22, hash3i(idx, 6, 47)) : lerp(3, 9, hash3i(idx, 6, 53)),
    });
  };
  let placed = 0, i = 0;
  while (placed < 12 && i < 3000) {
    const a = hash3i(i, 201, 3) * Math.PI * 2;
    const r = lerp(70 * KM, 400 * KM, Math.sqrt(hash3i(i, 202, 7)));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    i++;
    if (coastDistance(x, z) < 25 * KM) continue;
    let tooClose = false;
    for (const o of OASES) if (Math.hypot(o.x - x, o.z - z) < 90 * KM) { tooClose = true; break; }
    if (tooClose) continue;
    push(x, z, true, placed); placed++;
  }
  let m = 0, j = 0;
  while (m < 200 && j < 20000) {
    const x = lerp(-1250 * KM, 1200 * KM, hash3i(j, 301, 3));
    const z = lerp(-950 * KM, 540 * KM, hash3i(j, 302, 7));
    j++;
    if (coastDistance(x, z) < 12 * KM) continue;
    if (Math.hypot(x, z) < 22 * KM) continue;
    push(x, z, false, m); m++;
  }
}

/* Canal network: Sundisk out to the twelve major oases and on to the coast.
   Angel Stone sand-barrier posts line these, and green farm corridors flank
   them. The terrain carries a shallow channel; the region builder puts the
   water, the posts and the farmland on top. */
export const CANALS = [];
{
  /* Water leaves the city through the four cardinal gates, not through the
     palace, so the network is four trunks that fan out rather than twelve
     spokes radiating from a point. Each major oasis takes the gate it is
     closest to in bearing, shares that trunk for the first stretch, and
     branches off. That is both how irrigation actually gets built and what
     stops the aerial view reading as a starburst. */
  const GATE_R = 5.5 * KM;                     // the Great Wall
  const GATE_DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // east, south, west, north
  const TRUNK = 55 * KM;

  for (const o of OASES.filter(o => o.major)) {
    const len = Math.hypot(o.x, o.z);
    let g = 0, bestDot = -2;
    for (let i = 0; i < 4; i++) {
      const d = (o.x * GATE_DIR[i][0] + o.z * GATE_DIR[i][1]) / len;
      if (d > bestDot) { bestDot = d; g = i; }
    }
    const dir = GATE_DIR[g];
    const trunkLen = Math.min(TRUNK, len * 0.34);
    const p0 = [dir[0] * GATE_R, dir[1] * GATE_R];
    const p1 = [dir[0] * trunkLen, dir[1] * trunkLen];
    /* One bend between the trunk end and the oasis, so the branch reads as
       something surveyed rather than ruled. */
    const mx = (p1[0] + o.x) / 2, mz = (p1[1] + o.z) / 2;
    const nx = -(o.z - p1[1]), nz = (o.x - p1[0]);
    const nl = Math.hypot(nx, nz) || 1;
    const bend = (hash3i(Math.round(o.x), Math.round(o.z), 77) - 0.5) * 0.16;
    const p2 = [mx + nx / nl * len * bend, mz + nz / nl * len * bend];
    CANALS.push({ id: `canal-${o.id}`, points: [p0, p1, p2, [o.x, o.z]] });
  }
  /* Sundisk to the south coast at Mensah's Landing, and the eastern trunk on
     to Tawari, both leaving by their own gate. */
  CANALS.push({ id: 'canal-coast-south',
    points: [[0, GATE_R], [6 * KM, 44 * KM], [22 * KM, 78 * KM], [40 * KM, 108 * KM]] });
  CANALS.push({ id: 'canal-east-trunk',
    points: [[GATE_R, 0], [180 * KM, -34 * KM], [470 * KM, -18 * KM], [780 * KM, 30 * KM]] });
}

/* ---------------------------------------------------------------------------
   AUTHORED REGION STAMPS
   ------------------------------------------------------------------------ */

/* Part 3.2, all in metres. */
export const STAMPS = {
  city:      { x: 0, z: 0, flatR: 6.4 * KM, blendR: 15 * KM, y: CITY_ELEVATION },
  saltFlats: { x: -520 * KM, z: 40 * KM, hx: 160 * KM, hz: 100 * KM, y: 34, feather: 26 * KM },
  glass:     { x: 530 * KM, z: -70 * KM, hx: 215 * KM, hz: 135 * KM, y: 96, feather: 30 * KM },
  faros:     { x: -400 * KM, z: 80 * KM, r: 46 * KM, depth: 26 },
  ashteeth:  { z: -900 * KM, minX: -600 * KM, maxX: 900 * KM, halfWidth: 52 * KM, crest: 1450 },
  cliffs:    { minX: 30 * KM, maxX: 90 * KM, minZ: 105 * KM, maxZ: 122 * KM },
  ashlands:  { frontierX: -1300 * KM, feather: 120 * KM },
};

/* Distance to a polyline, used by the canal channels. */
function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    const px = x - ax, pz = z - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? (px * dx + pz * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = px - dx * t, cz = pz - dz * t;
    const d = Math.sqrt(cx * cx + cz * cz);
    if (d < best) best = d;
  }
  return best;
}

/* ---------------------------------------------------------------------------
   THE SAND SEA MASK

   Canon: the Sunlands are 70 percent hard reg pavement and 30 percent sand
   sea. A single large-scale field decides which, with the threshold tuned by
   sampling (see tools/verify_scale.mjs, which reports the actual split).
   ------------------------------------------------------------------------ */

const SAND_SEA_THRESHOLD = 0.128;

/** 0 = hard reg pavement, 1 = sand sea. */
export function sandSeaMask(x, z) {
  const f = fbm(x + 61230.0, z - 22110.0, 3, 1 / 520000, 0.55);
  return smoothstep(SAND_SEA_THRESHOLD - 0.08, SAND_SEA_THRESHOLD + 0.16, f);
}

/* ---------------------------------------------------------------------------
   THE ASHLANDS

   Volcanic wasteland west of x = -1300 km. Sharper relief than the desert,
   lava fields, and the habitable Three Burns between them. Rendered beautiful
   at distance and wrong on approach, which is a shading job, not a height
   job, but the shape has to be right first: basalt sheets, collapsed cones,
   and a metal-laden river system.
   ------------------------------------------------------------------------ */

const BURNS = [
  [-1600 * KM, -300 * KM], [-1900 * KM, 0], [-2200 * KM, 300 * KM],
];
const ASH_CONES = [];
{
  for (let i = 0; i < 70; i++) {
    ASH_CONES.push({
      x: lerp(-2560 * KM, -1300 * KM, hash3i(i, 401, 3)),
      z: lerp(-680 * KM, 680 * KM, hash3i(i, 402, 7)),
      r: lerp(6 * KM, 26 * KM, hash3i(i, 403, 11)),
      h: lerp(220, 1150, hash3i(i, 404, 13)),
    });
  }
}

function ashlandsHeight(x, z, cones) {
  cones = cones || ASH_CONES;
  const base = warpedFbm(x, z, 5, 0.0000055, 0.52) * 260;
  const sheets = Math.abs(simplex2(x * 0.000018, z * 0.000018)) * 130;
  const rubble = fbm(x, z, 5, 0.00012, 0.5) * 18;
  let h = 120 + base + sheets * 0.7 + rubble;

  /* The Three Burns are the habitable floors between the lava fields. */
  for (let i = 0; i < BURNS.length; i++) {
    const r = Math.hypot(x - BURNS[i][0], z - BURNS[i][1]) / (180 * KM);
    if (r < 1) h = lerp(h, 60 + rubble * 0.5, smoothstep(1, 0.15, r) * 0.85);
  }
  for (let i = 0; i < cones.length; i++) {
    const c = cones[i];
    const r = Math.hypot(x - c.x, z - c.z) / c.r;
    if (r < 1.2) {
      const cone = c.h * Math.pow(clamp(1 - r, 0, 1), 1.4);
      const crater = c.h * 0.36 * smoothstep(0.22, 0.0, r);
      h += cone - crater;
    }
  }
  /* The Rust-River, winding from -1500 km to -2300 km, and Lake Verdigris. */
  const riverT = (z + 500 * KM) / (900 * KM);
  const riverX = lerp(-1500 * KM, -2300 * KM, clamp(riverT, 0, 1)) +
                 simplex2(z * 0.000009, 4.7) * 70 * KM;
  const dr = Math.abs(x - riverX);
  h -= 34 * smoothstep(3.2 * KM, 0, dr);
  const dv = Math.hypot(x + 1900 * KM, z + 150 * KM);
  h -= 46 * smoothstep(17 * KM, 0, dv);
  return h;
}

/* ---------------------------------------------------------------------------
   PREFILTERING

   The mesher evaluates one chunk at a time, and a chunk touches almost none
   of the authored stamps. Testing two hundred oases and forty star dunes for
   every one of four thousand vertices is most of the cost of building a
   chunk, so a sampler prefilters the lists once per chunk to exactly those
   that can reach it.

   The filter radii below are the radii past which each stamp contributes
   EXACTLY zero, not approximately zero, so a prefiltered sample and a full
   sample return identical numbers. verify_terrain.mjs asserts that.
   ------------------------------------------------------------------------ */

const FULL_CTX = {
  coast: null, islands: ISLANDS, oases: OASES, canals: CANALS,
  dunes: STAR_DUNES, cones: ASH_CONES,
};

/** Distance from a point to an axis-aligned box, zero inside. */
function boxDist(x, z, minX, minZ, maxX, maxZ) {
  const dx = Math.max(minX - x, 0, x - maxX);
  const dz = Math.max(minZ - z, 0, z - maxZ);
  return Math.hypot(dx, dz);
}

/** Distance from a segment to a box, sampled finely enough to be safe. */
function segBoxDist(ax, az, bx, bz, minX, minZ, maxX, maxZ) {
  let best = Infinity;
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    best = Math.min(best, boxDist(ax + (bx - ax) * t, az + (bz - az) * t, minX, minZ, maxX, maxZ));
  }
  return best;
}

/**
 * A height and classification sampler specialised to one chunk.
 * Returns exactly the same values as terrainHeight and classify.
 */
export function createSampler(minX, minZ, maxX, maxZ) {
  const diag = Math.hypot(maxX - minX, maxZ - minZ);

  /* Coast: the nearest segment decides both the distance and the sign, and
     for any point in the box the nearest segment is within (closest segment
     distance + box diagonal). Anything further can never win. */
  const segDist = [];
  let closest = Infinity;
  for (let i = 0; i < COAST_N - 1; i++) {
    const d = segBoxDist(COAST[i * 2], COAST[i * 2 + 1], COAST[i * 2 + 2], COAST[i * 2 + 3],
                         minX, minZ, maxX, maxZ);
    segDist.push(d);
    if (d < closest) closest = d;
  }
  const coast = [];
  for (let i = 0; i < segDist.length; i++) {
    if (segDist[i] <= closest + diag + 1) coast.push(i);
  }

  const within = (cx, cz, reach) => boxDist(cx, cz, minX, minZ, maxX, maxZ) <= reach;

  const CTX = {
    coast: coast.length === COAST_N - 1 ? null : coast,
    islands: ISLANDS.filter(c => within(c[0] * KM, c[1] * KM, c[2] * KM * 1.35 * 1.3)),
    oases: OASES.filter(o => within(o.x, o.z, o.radius * 2.3)),
    canals: CANALS.filter(c => {
      for (let i = 0; i < c.points.length - 1; i++) {
        if (segBoxDist(c.points[i][0], c.points[i][1], c.points[i + 1][0], c.points[i + 1][1],
                       minX, minZ, maxX, maxZ) <= 1500) return true;
      }
      return false;
    }),
    dunes: STAR_DUNES.filter(d => within(d.x, d.z, d.radius * 1.2)),
    cones: ASH_CONES.filter(c => within(c.x, c.z, c.r * 1.25)),
  };

  return {
    height: (x, z) => terrainHeight(x, z, CTX),
    classify: (x, z, h, out, cd) => classify(x, z, h, out, CTX, cd),
    coastDistance: (x, z) => coastDistance(x, z, CTX.coast),
    ctx: CTX,
  };
}

/* ---------------------------------------------------------------------------
   THE MAIN FIELD
   ------------------------------------------------------------------------ */

/**
 * Ground height in metres at an absolute position.
 * @param {number} x absolute east metres
 * @param {number} z absolute south metres
 * @returns {number} height in metres, sea level is 0
 */
export function terrainHeight(x, z, ctx) {
  const CX = ctx || FULL_CTX;
  const cd = coastDistance(x, z, CX.coast);

  /* --- offshore ---------------------------------------------------------- */
  if (cd < 0) {
    const off = -cd;
    const island = islandField(x, z, CX.islands);
    if (island > -Infinity && island > 0) {
      /* An island rises out of the shelf. Blend it against the sea floor. */
      const peak = 150 + fbm(x, z, 4, 1 / 12000, 0.5) * 60;
      const h = island * 0.011 * (peak / 150) + fbm(x, z, 4, 1 / 3000, 0.5) * 12;
      if (h > 0) return h + SEA_LEVEL;
    }
    const shelf = -25 * smoothstep(0, 12 * KM, off);
    const slope = -160 * smoothstep(14 * KM, 120 * KM, off);
    const abyss = -760 * smoothstep(120 * KM, 420 * KM, off);
    const rough = fbm(x, z, 4, 1 / 26000, 0.5) * 22 * smoothstep(4 * KM, 40 * KM, off);
    return shelf + slope + abyss + rough + SEA_LEVEL;
  }

  /* --- the Ashlands take over west of the frontier ----------------------- */
  const A = STAMPS.ashlands;
  const ashW = smoothstep(A.frontierX + A.feather, A.frontierX - A.feather, x);

  /* --- the desert base --------------------------------------------------- */
  const base = warpedFbm(x, z, 4, 0.000004, 0.5) * 180;

  const sand = sandSeaMask(x, z);

  const dunes = fbm(x, z, 5, 0.00006, 0.5) * 45;

  /* Linear dune ridges, sheared into the wind frame and stretched five to one
     along it so they run as ridges rather than sit as blobs. */
  const u = windAlong(x, z), v = windAcross(x, z);
  const ridges = Math.abs(simplex2(u * 0.000004, v * 0.00002)) * 90;

  /* Hard reg pavement: near flat, cracked into polygons. */
  const w = worleyF2F1(x * 0.0004, z * 0.0004);
  const reg = (smoothstep(0.0, 0.22, w) - 0.5) * 1.6;

  /* Surface ripples, the finest term in the field. */
  const ripple = Math.sin((x * WX + z * WZ) * 0.8) * 0.15;

  /* THE DUNE HIERARCHY, an extension to the composition above.

     The terms the brief specifies run at sixteen to fifty kilometre
     wavelengths, which is the size of a dune FIELD, not of a dune. On their
     own they make a smooth plain, and the empty desert at true scale has to
     be worth looking at. So the sand sea also carries the two scales a Sahara
     erg actually has, both anisotropic in the wind frame because linear dunes
     run ALONG the wind and repeat ACROSS it:

       draa   mega-dunes, 2.6 km apart across the wind, running 26 km along it
       dunes  secondary crests, 420 m apart, riding on the draa

     Between the draa are the interdune corridors the sand sailers use as
     shipping lanes, which is why the corridor width is authored and not left
     to the noise. */
  const draaDensity = smoothstep(-0.25, 0.35, fbm(u * 0.5, v * 0.5, 3, 1 / 90000, 0.5));
  const draaRidge = Math.pow(1 - Math.abs(simplex2(u / 26000, v / 2600)), 1.7);
  const draa = draaRidge * 62 * draaDensity;
  const duneRidge = Math.pow(1 - Math.abs(simplex2(u / 2600, v / 420)), 1.9);
  const dune2 = duneRidge * 13 * draaDensity * (0.35 + 0.65 * draaRidge);

  /* The reg is not featureless either: shallow wadis drain it, and they are
     what floods in the brief violent rain. */
  const wadi = -Math.pow(1 - Math.abs(simplex2(x * 0.000021, z * 0.000021)), 6.0) * 26;

  let h = 210 + base
        + sand * (dunes + ridges * 0.85 + draa + dune2)
        + (1 - sand) * (reg + dunes * 0.08 + wadi)
        + ripple;

  /* --- star dunes -------------------------------------------------------- */
  const starDunes = CX.dunes;
  for (let i = 0; i < starDunes.length; i++) {
    const d = starDunes[i];
    const dx = x - d.x, dz = z - d.z;
    const r = Math.hypot(dx, dz);
    if (r < d.radius * 1.15) {
      const t = clamp(1 - r / d.radius, 0, 1);
      const theta = Math.atan2(dz, dx);
      const arm = 0.58 + 0.42 * Math.cos(d.arms * theta + d.phase);
      h += d.height * t * t * (0.55 + 0.45 * arm);
    }
  }

  /* --- the Ashteeth, the northern wall ----------------------------------- */
  const AT = STAMPS.ashteeth;
  if (x > AT.minX - 120 * KM && x < AT.maxX + 120 * KM) {
    const meander = simplex2(x * 0.0000042, 11.3) * 46 * KM;
    const dz2 = Math.abs(z - (AT.z + meander));
    const along = smoothstep(AT.minX - 90 * KM, AT.minX + 40 * KM, x) *
                  smoothstep(AT.maxX + 90 * KM, AT.maxX - 40 * KM, x);
    if (dz2 < AT.halfWidth * 2.2 && along > 0) {
      const band = Math.pow(clamp(1 - dz2 / (AT.halfWidth * 1.9), 0, 1), 1.7);
      /* Razor ridgelines: ridged multifractal, two octaves, narrow defiles. */
      let rr = 0, amp = 1, f = 0.000035, norm = 0;
      for (let o = 0; o < 4; o++) {
        const n = 1 - Math.abs(simplex2(x * f, (z - AT.z) * f * 2.4));
        rr += amp * n * n;
        norm += amp; amp *= 0.5; f *= 2.1;
      }
      rr /= norm;
      h += AT.crest * band * along * (0.35 + 0.85 * rr);
    }
  }

  /* --- the Great Salt Flats ---------------------------------------------- */
  const SF = STAMPS.saltFlats;
  {
    const wob = fbm(x, z, 3, 1 / 60000, 0.5) * 0.18;
    const ex = Math.abs(x - SF.x) / (SF.hx * (1 + wob));
    const ez = Math.abs(z - SF.z) / (SF.hz * (1 + wob));
    const e = Math.max(ex, ez);
    if (e < 1.4) {
      const k = smoothstep(1.18, 0.82, e);
      const crust = (worleyF2F1(x * 0.0016, z * 0.0016) < 0.05 ? -0.09 : 0.02);
      h = lerp(h, SF.y + crust + fbm(x, z, 2, 1 / 30000, 0.5) * 1.2, k);
    }
  }

  /* --- Faro's Mirror, a seasonal lake at the salt flats margin [PROPOSED] - */
  {
    const F = STAMPS.faros;
    const wob = 1 + fbm(x, z, 3, 1 / 24000, 0.5) * 0.3;
    const r = Math.hypot(x - F.x, z - F.z) / (F.r * wob);
    if (r < 1.2) h -= F.depth * smoothstep(1.05, 0.1, r);
  }

  /* --- the Glass Desert --------------------------------------------------
     Sand fused to glass. A sheet, so it is flatter than anything natural,
     with a faint pooling to it and a raised rim where the blast threw the
     sand outward. */
  const GD = STAMPS.glass;
  {
    const wob = fbm(x, z, 3, 1 / 90000, 0.5) * 0.12;
    const ex = (x - GD.x) / (GD.hx * (1 + wob));
    const ez = (z - GD.z) / (GD.hz * (1 + wob));
    const e = Math.sqrt(ex * ex + ez * ez);
    if (e < 1.5) {
      const k = smoothstep(1.14, 0.86, e);
      const pool = fbm(x, z, 3, 1 / 40000, 0.5) * 5;
      h = lerp(h, GD.y + pool, k);
      h += 26 * smoothstep(1.32, 1.12, e) * smoothstep(0.96, 1.12, e);
    }
  }

  /* --- oases and canal corridors ----------------------------------------- */
  for (let i = 0; i < CX.oases.length; i++) {
    const o = CX.oases[i];
    const dx = x - o.x, dz = z - o.z;
    if (Math.abs(dx) > o.radius * 1.6 || Math.abs(dz) > o.radius * 1.6) continue;
    const r = Math.hypot(dx, dz) / o.radius;
    if (r < 1.5) h -= o.depth * smoothstep(1.35, 0.2, r);
  }
  for (let i = 0; i < CX.canals.length; i++) {
    const d = distToPolyline(x, z, CX.canals[i].points);
    if (d < 900) h -= 5.5 * smoothstep(900, 90, d);
  }

  /* --- the city plateau --------------------------------------------------
     Flattened hard inside the metro, blended out over the approaches. The
     origin is on the dais, so the plateau sits at CITY_GROUND_Y by
     definition, and the desert meets it on the ramp. */
  const C = STAMPS.city;
  {
    const r = Math.hypot(x - C.x, z - C.z);
    if (r < C.blendR) {
      const k = smoothstep(C.blendR, C.flatR, r);
      h = lerp(h, C.y, k);
    }
  }

  /* --- hand the west over to the Ashlands -------------------------------- */
  if (ashW > 0) h = lerp(h, ashlandsHeight(x, z, CX.cones), ashW);

  /* --- the coastal plain -------------------------------------------------
     Land does not arrive at the sea two hundred metres up. Inside forty
     kilometres of the shore the interior relief is damped away into a low
     plain, which is what puts Drum Harbor and the Golden Coast docks at a
     harbour's elevation rather than on a cliff. */
  if (cd < 40 * KM) {
    const plain = 5 + fbm(x, z, 3, 1 / 8000, 0.5) * 7;
    h = lerp(plain, h, smoothstep(2.5 * KM, 40 * KM, cd));
  }

  /* --- the Wailing Cliffs ------------------------------------------------
     The exception to the coastal plain: a cliff line with 60 to 140 m faces,
     applied after the plain so the face reads as a step up out of it. Driven
     by coast distance rather than an authored polyline, so the cliff follows
     every bay and headland the coastal noise invents. */
  const CL = STAMPS.cliffs;
  let cliffW = 0;
  if (x > CL.minX - 14 * KM && x < CL.maxX + 14 * KM && cd < 26 * KM) {
    const span = smoothstep(CL.minX - 10 * KM, CL.minX + 5 * KM, x) *
                 smoothstep(CL.maxX + 10 * KM, CL.maxX - 5 * KM, x);
    cliffW = span * smoothstep(26 * KM, 2.5 * KM, cd);
    if (cliffW > 0) {
      const faceH = lerp(60, 140, 0.5 + 0.5 * simplex2(x * 0.00007, 3.1));
      const rise = smoothstep(0, 260, cd);     // the face itself, near vertical
      h = lerp(h, faceH * rise, cliffW);
    }
  }

  /* --- meet the sea ------------------------------------------------------
     Beaches actually reach the water, except where the cliffs drop into it. */
  if (cd < 900 && cliffW < 0.9) {
    const beach = smoothstep(0, 900, cd);
    h = lerp(0.35 + fbm(x, z, 3, 1 / 400, 0.5) * 0.7, h, lerp(beach * beach, 1, cliffW));
  }

  return h + SEA_LEVEL;
}

/* ---------------------------------------------------------------------------
   MATERIAL CLASSIFICATION

   Four weights the sand shader blends between, plus two extras the region
   shading needs. Written into a caller-supplied array so the mesher does not
   allocate per vertex.

     out[0] reg      hard cracked pavement
     out[1] salt     salt flat crust
     out[2] glass    the fused sheet
     out[3] ash      the Western Ashlands
     out[4] verdant  oasis and canal-corridor greenery
     out[5] rock     the Ashteeth and the cliff faces

   Sand is whatever is left over: 1 minus the sum, clamped.
   ------------------------------------------------------------------------ */

export function classify(x, z, h, out, ctx, cdIn) {
  const CX = ctx || FULL_CTX;
  const cd = cdIn === undefined ? coastDistance(x, z, CX.coast) : cdIn;
  const sand = sandSeaMask(x, z);

  out[0] = (1 - sand) * 0.92;
  out[1] = 0; out[2] = 0; out[3] = 0; out[4] = 0; out[5] = 0;

  const SF = STAMPS.saltFlats;
  {
    const wob = fbm(x, z, 3, 1 / 60000, 0.5) * 0.18;
    const e = Math.max(Math.abs(x - SF.x) / (SF.hx * (1 + wob)),
                       Math.abs(z - SF.z) / (SF.hz * (1 + wob)));
    out[1] = smoothstep(1.18, 0.82, e);
  }
  const GD = STAMPS.glass;
  {
    const wob = fbm(x, z, 3, 1 / 90000, 0.5) * 0.12;
    const ex = (x - GD.x) / (GD.hx * (1 + wob));
    const ez = (z - GD.z) / (GD.hz * (1 + wob));
    out[2] = smoothstep(1.14, 0.86, Math.sqrt(ex * ex + ez * ez));
  }
  const A = STAMPS.ashlands;
  out[3] = smoothstep(A.frontierX + A.feather, A.frontierX - A.feather, x);

  /* Greenery follows the water: oases and the canal corridors, which is the
     whole point of the canal retcon. */
  for (let i = 0; i < CX.oases.length; i++) {
    const o = CX.oases[i];
    const dx = x - o.x, dz = z - o.z;
    if (Math.abs(dx) > o.radius * 2.2 || Math.abs(dz) > o.radius * 2.2) continue;
    const r = Math.hypot(dx, dz) / (o.radius * 1.7);
    out[4] = Math.max(out[4], smoothstep(1.0, 0.25, r));
  }
  for (let i = 0; i < CX.canals.length; i++) {
    const d = distToPolyline(x, z, CX.canals[i].points);
    if (d < 1400) out[4] = Math.max(out[4], smoothstep(1400, 220, d) * 0.85);
  }

  /* Rock where the ground is steep or high: the Ashteeth crest and the
     cliff faces read as bare stone, not sand. */
  const AT = STAMPS.ashteeth;
  const meander = simplex2(x * 0.0000042, 11.3) * 46 * KM;
  const dz2 = Math.abs(z - (AT.z + meander));
  const inRange = x > AT.minX - 120 * KM && x < AT.maxX + 120 * KM;
  if (inRange && dz2 < AT.halfWidth * 2.2) out[5] = smoothstep(AT.halfWidth * 2.0, AT.halfWidth * 0.5, dz2);
  const CL = STAMPS.cliffs;
  if (x > CL.minX - 14 * KM && x < CL.maxX + 14 * KM && cd > 0 && cd < 900) {
    out[5] = Math.max(out[5], smoothstep(900, 120, cd) *
      smoothstep(CL.minX - 10 * KM, CL.minX + 5 * KM, x) *
      smoothstep(CL.maxX + 10 * KM, CL.maxX - 5 * KM, x));
  }

  /* Salt, glass and ash win over reg where they overlap. */
  const taken = Math.min(1, out[1] + out[2] + out[3]);
  out[0] *= (1 - taken);
  out[5] *= (1 - out[2]);
  return out;
}

/* ---------------------------------------------------------------------------
   NORMALS

   Central differences at a spacing matched to the chunk, so a coarse chunk
   gets a coarse normal and the shading agrees with the geometry it is on.
   ------------------------------------------------------------------------ */

export function terrainNormal(x, z, eps, out) {
  const hl = terrainHeight(x - eps, z);
  const hr = terrainHeight(x + eps, z);
  const hd = terrainHeight(x, z - eps);
  const hu = terrainHeight(x, z + eps);
  let nx = hl - hr, ny = 2 * eps, nz = hd - hu;
  const inv = 1 / Math.hypot(nx, ny, nz);
  out[0] = nx * inv; out[1] = ny * inv; out[2] = nz * inv;
  return out;
}

/** Ground height clamped to sea level, which is what a walker stands on. */
export function walkableHeight(x, z) {
  return Math.max(terrainHeight(x, z), SEA_LEVEL);
}

/** Above the water line. Sea level is not zero, see the note at the top. */
export const isLand = (x, z) => coastDistance(x, z) > 0;
