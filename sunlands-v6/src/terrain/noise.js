/* ============================================================================
   noise.js  ::  deterministic procedural noise.

   Everything here is a pure function of its arguments. That is not a style
   preference: the quadtree evaluates the same ground at several levels of
   detail at once, and chunks only agree at their shared edges if the noise
   agrees exactly. No time, no randomness, no state.

   Runs on the main thread (collision, region placement) and inside the mesher
   worker (chunk building) from the same source.
   ========================================================================= */

/* ---- seeded permutation --------------------------------------------------
   A small xorshift PRNG builds the permutation table once at module load, so
   the table is identical in every context that imports this file.
   ------------------------------------------------------------------------ */

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

const PERM = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  const r = makeRng(1836311903);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

/* ---- hashes --------------------------------------------------------------- */

/** Deterministic 0..1 hash of an integer lattice point. */
export function hash2i(ix, iy) {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Deterministic 0..1 hash with a salt, for independent channels. */
export function hash3i(ix, iy, salt) {
  let h = (ix * 374761393 + iy * 668265263 + salt * 2147483647) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ---- 2D simplex ----------------------------------------------------------- */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2 = new Float32Array([
  1, 1, -1, 1, 1, -1, -1, -1,
  1, 0, -1, 0, 0, 1, 0, -1,
]);

/** Classic 2D simplex noise, output roughly -1..1. */
export function simplex2(xin, yin) {
  const s = (xin + yin) * F2;
  let i = Math.floor(xin + s);
  let j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);

  let i1, j1;
  if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255, jj = j & 255;
  let n = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    const g = (PERM[ii + PERM[jj]] & 7) * 2;
    t0 *= t0;
    n += t0 * t0 * (GRAD2[g] * x0 + GRAD2[g + 1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    const g = (PERM[ii + i1 + PERM[jj + j1]] & 7) * 2;
    t1 *= t1;
    n += t1 * t1 * (GRAD2[g] * x1 + GRAD2[g + 1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    const g = (PERM[ii + 1 + PERM[jj + 1]] & 7) * 2;
    t2 *= t2;
    n += t2 * t2 * (GRAD2[g] * x2 + GRAD2[g + 1] * y2);
  }
  return 70 * n;
}

/* ---- fractal sums --------------------------------------------------------- */

/**
 * Fractional Brownian motion. Returns roughly -1..1 (normalised by the sum of
 * the amplitudes so the range does not creep as octaves change).
 */
export function fbm(x, y, octaves, freq, persistence = 0.5, lacunarity = 2.0) {
  let a = 1, f = freq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += a * simplex2(x * f, y * f);
    norm += a;
    a *= persistence;
    f *= lacunarity;
  }
  return sum / norm;
}

/**
 * Domain-warped fbm. The warp is what stops large fields reading as obvious
 * noise: it bends the isolines into something that looks eroded.
 */
export function warpedFbm(x, y, octaves, freq, persistence = 0.5, warp = 1.6) {
  const wf = freq * 2.0;
  const qx = fbm(x + 1731.7, y + 913.1, 3, wf, 0.5);
  const qy = fbm(x - 421.3, y + 2287.9, 3, wf, 0.5);
  const amp = warp / wf * 0.25;
  return fbm(x + qx * amp, y + qy * amp, octaves, freq, persistence);
}

/** Ridged noise: sharp crests, rounded valleys. Returns 0..1. */
export function ridged(x, y) {
  return 1 - Math.abs(simplex2(x, y));
}

/* ---- worley --------------------------------------------------------------
   F2 minus F1 gives the cell-wall network. Thresholded it is the cracked
   polygonal crust of hard reg pavement and of the salt flats.
   ------------------------------------------------------------------------ */

export function worleyF2F1(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 1e9, f2 = 1e9;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const cx = ix + di, cy = iy + dj;
      const px = cx + hash2i(cx, cy);
      const py = cy + hash3i(cx, cy, 7);
      const dx = px - x, dy = py - y;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; }
      else if (d < f2) { f2 = d; }
    }
  }
  return Math.sqrt(f2) - Math.sqrt(f1);
}

/* ---- helpers -------------------------------------------------------------- */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Smooth minimum, for blending stamps into the base without a visible seam. */
export function smin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}
