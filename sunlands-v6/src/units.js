/* ============================================================================
   units.js  ::  the unit system, the world extents, the view tiers.

   ONE WORLD UNIT EQUALS ONE METRE. Everywhere. At every zoom level. In both
   fly-over and walk-around modes. Every other module in this build depends on
   that being true, so every conversion lives here and nowhere else.

   AXIS CONVENTION (deliberately not the usual Three.js one, documented per
   the mission brief):
       +X = east
       +Z = south
       +Y = up
   Three.js normally treats -Z as "forward". We do not. A heading of 0 rad
   points east (+X) and increases toward south (+Z), which is a plain
   right-handed rotation about +Y viewed from above with Z flipped. Every
   heading in this codebase follows that rule. See headingToVector().

   ORIGIN (0, 0, 0) is the centre of the Solaharan's throne dais in the Royal
   Palace at the centre of Sundisk City.
   ========================================================================= */

/* ---- units --------------------------------------------------------------- */

export const M = 1;
export const KM = 1000;
export const MI = 1609.344;      // statute mile, for canon quoted in miles
export const ACRE = 4046.8564;   // for the palace and market areas
export const FT = 0.3048;

/** Canon coordinates are authored in kilometres. This is the only conversion. */
export const km = (v) => v * KM;

/* ---- world extents ------------------------------------------------------- */

export const WORLD = {
  /* Part 3.1: terrain root bounding box for the Southern Sunlands. Metres. */
  sunlands: { minX: -1300 * KM, maxX: 1250 * KM, minZ: -1000 * KM, maxZ: 800 * KM },

  /* Part 3.3: the Western Ashlands run west of the Sunlands to the Poison Sea. */
  ashlands: { minX: -2600 * KM, maxX: -1300 * KM, minZ: -700 * KM, maxZ: 700 * KM },

  /* The quadtree root tile. Square and a power-of-two multiple of the 256 m
     leaf so that every level lands on an exact metre boundary:
        4194304 / 2^14 = 256 m
     Centred so it covers the Sunlands box AND the Ashlands out to the Poison
     Sea, which the Sunlands-only box in Part 3.1 does not reach. */
  root: { size: 4194304, cx: -675 * KM, cz: -100 * KM },

  leafSize: 256,   // metres, finest chunk edge
  gridN: 64,       // quads per chunk edge, so 65 x 65 vertices, 4 m posts at leaf
  maxDepth: 14,    // log2(4194304 / 256)

  /* Conservative vertical bounds for quadtree AABB culling. Star dunes reach
     500 m, the Ashteeth are the tallest stamp, and the sea floor is the
     lowest. Kept generous on purpose. */
  minY: -2400,
  maxY: 3200,

  seaLevel: 0,
};

/* Sanity: the leaf really is 256 m and the depth really does reach it. */
if (WORLD.root.size / Math.pow(2, WORLD.maxDepth) !== WORLD.leafSize) {
  throw new Error('scale.js: quadtree root size and max depth disagree with the leaf size');
}

/* ---- headings ------------------------------------------------------------
   Heading 0 = east (+X), increasing toward south (+Z). Compass bearings in
   the canon text are given the usual way (0 = north), so convert with
   compassToHeading().
   ------------------------------------------------------------------------ */

export function headingToVector(h, out = new THREE.Vector3()) {
  return out.set(Math.cos(h), 0, Math.sin(h));
}
export const compassToHeading = (deg) => (deg - 90) * Math.PI / 180;

/** Prevailing Harmattan blows from the northeast, so it travels southwest. */
export const HARMATTAN_FROM_COMPASS = 45;
export const WIND = {
  from: HARMATTAN_FROM_COMPASS,
  /* Unit vector the wind travels along: out of the northeast, toward the
     southwest, which is -X and +Z in our axes. */
  dir: { x: -Math.SQRT1_2, z: Math.SQRT1_2 },
};

/* ---- the four view tiers -------------------------------------------------
   One continuous zoom axis. Camera altitude picks the tier; near and far are
   log-interpolated between tier anchors so there is no hard cut at a
   boundary, only a smooth change of the frustum.
   ------------------------------------------------------------------------ */

export const TIERS = [
  {
    id: 'street', name: 'Street',
    minAlt: 1.6, maxAlt: 2 * KM,
    near: 0.1, far: 4 * KM,
    draws: 'Individual buildings, doorways, market stalls, people, animals, props',
  },
  {
    id: 'regional', name: 'Regional',
    minAlt: 2 * KM, maxAlt: 40 * KM,
    near: 20, far: 60 * KM,
    draws: 'Settlement blocks, wall rings, oasis vegetation, pyramid fields, mine works, ships',
  },
  {
    id: 'kingdom', name: 'Kingdom',
    minAlt: 40 * KM, maxAlt: 400 * KM,
    near: 500, far: 600 * KM,
    draws: 'Coarse heightfield, salt flats, glass sheet, canals, caravan roads, settlement extents',
  },
  {
    id: 'continental', name: 'Continental',
    minAlt: 400 * KM, maxAlt: 2000 * KM,
    near: 5 * KM, far: 4000 * KM,
    draws: 'Kingdom silhouettes, coastline, the Ashteeth, biome colour, named-place billboards',
  },
];

export const ALT_MIN = TIERS[0].minAlt;
export const ALT_MAX = TIERS[TIERS.length - 1].maxAlt;

/* Anchor altitude for each tier: the geometric mean of its range, which is
   its midpoint on a logarithmic zoom axis. */
const TIER_ANCHORS = TIERS.map(t => ({
  alt: Math.sqrt(t.minAlt * t.maxAlt),
  near: t.near,
  far: t.far,
}));

export function tierForAltitude(alt) {
  for (let i = 0; i < TIERS.length; i++) {
    if (alt < TIERS[i].maxAlt) return TIERS[i];
  }
  return TIERS[TIERS.length - 1];
}

/**
 * Near and far planes for an altitude, log-interpolated across the tier
 * anchors. A single near/far pair cannot serve a 900 km vista and a person's
 * face, and a hard switch between pairs pops the depth buffer, so we slide.
 */
export function nearFarForAltitude(alt) {
  const a = Math.max(alt, ALT_MIN);
  const la = Math.log(a);
  if (a <= TIER_ANCHORS[0].alt) return { near: TIER_ANCHORS[0].near, far: TIER_ANCHORS[0].far };
  const last = TIER_ANCHORS[TIER_ANCHORS.length - 1];
  if (a >= last.alt) return { near: last.near, far: last.far };
  for (let i = 0; i < TIER_ANCHORS.length - 1; i++) {
    const A = TIER_ANCHORS[i], B = TIER_ANCHORS[i + 1];
    if (a <= B.alt) {
      const t = (la - Math.log(A.alt)) / (Math.log(B.alt) - Math.log(A.alt));
      return {
        near: Math.exp(Math.log(A.near) + t * (Math.log(B.near) - Math.log(A.near))),
        far: Math.exp(Math.log(A.far) + t * (Math.log(B.far) - Math.log(A.far))),
      };
    }
  }
  return { near: last.near, far: last.far };
}

/** 0 at the deepest zoom, 1 at the widest. Useful for shader LOD blends. */
export function zoomFraction(alt) {
  const t = (Math.log(Math.max(alt, ALT_MIN)) - Math.log(ALT_MIN)) /
            (Math.log(ALT_MAX) - Math.log(ALT_MIN));
  return Math.min(1, Math.max(0, t));
}

/* ---- travel, at canon speeds --------------------------------------------
   Part 1.5. Making the reader feel the distance is nearly free, so we do it
   on every readout rather than hiding it in a panel.
   ------------------------------------------------------------------------ */

export const TRAVEL = [
  { id: 'walk',     name: 'On foot',      kmh: 4,   hoursPerDay: 10, note: 'Walking pace' },
  { id: 'caravan',  name: 'Camel caravan', kmh: 4,  hoursPerDay: 8,  note: 'Eight hours a day' },
  { id: 'sailer',   name: 'Sand sailer',  kmh: 65,  hoursPerDay: 10, note: 'On flat reg' },
  { id: 'suneater', name: 'Sun Eater',    kmh: 115, hoursPerDay: 8,  note: 'Practical speed, heat limited' },
];

/** Hours of actual movement to cover a distance in metres. */
export function travelHours(metres, mode) {
  return (metres / KM) / mode.kmh;
}

/** Elapsed days including rest, for modes that cannot run around the clock. */
export function travelDays(metres, mode) {
  return travelHours(metres, mode) / mode.hoursPerDay;
}

/* ---- formatting ---------------------------------------------------------- */

export function formatDistance(metres) {
  const a = Math.abs(metres);
  if (a < 1) return `${(metres * 100).toFixed(0)} cm`;
  if (a < 1000) return `${metres.toFixed(a < 10 ? 1 : 0)} m`;
  if (a < 100 * KM) return `${(metres / KM).toFixed(a < 10 * KM ? 2 : 1)} km`;
  return `${Math.round(metres / KM).toLocaleString()} km`;
}

export function formatAltitude(metres) {
  if (metres < 1000) return `${metres.toFixed(metres < 10 ? 2 : 0)} m`;
  return `${(metres / KM).toLocaleString(undefined, { maximumFractionDigits: metres < 100 * KM ? 1 : 0 })} km`;
}

export function formatDuration(hours) {
  if (hours < 1 / 60) return 'moments';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 36) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  const d = hours / 24;
  if (d < 400) return `${d.toFixed(d < 10 ? 1 : 0)} days`;
  return `${(d / 365).toFixed(1)} years`;
}

/** Travel summary for a span, phrased as elapsed days where a day has a limit. */
export function travelSummary(metres) {
  return TRAVEL.map(mode => {
    const h = travelHours(metres, mode);
    const label = mode.hoursPerDay < 24 && h > mode.hoursPerDay
      ? `${formatDuration(travelDays(metres, mode) * 24)}`
      : formatDuration(h);
    return { id: mode.id, name: mode.name, text: label };
  });
}

/* ---- the scale bar ladder ------------------------------------------------ */

export const SCALE_STEPS = [
  2000 * KM, 1000 * KM, 500 * KM, 200 * KM, 100 * KM, 50 * KM, 20 * KM, 10 * KM,
  5 * KM, 2 * KM, 1 * KM, 500, 200, 100, 50, 20, 10, 5, 2, 1,
];

/**
 * Pick the largest ladder step whose on-screen width fits maxPx.
 * @param {number} metresPerPixel
 * @param {number} maxPx
 */
export function pickScaleStep(metresPerPixel, maxPx = 180) {
  for (const s of SCALE_STEPS) {
    if (s / metresPerPixel <= maxPx) return { metres: s, px: s / metresPerPixel };
  }
  const s = SCALE_STEPS[SCALE_STEPS.length - 1];
  return { metres: s, px: s / metresPerPixel };
}

/** Ground metres covered by one screen pixel, for a camera at distance dist. */
export function metresPerPixel(camera, viewportHeight, dist) {
  const vFov = camera.fov * Math.PI / 180;
  return (2 * dist * Math.tan(vFov / 2)) / viewportHeight;
}

