/* ============================================================================
   mesher.js  ::  build one terrain chunk into transferable typed arrays.

   Pure, and free of Three.js, so the worker can import it directly. Given a
   chunk's absolute centre and size it returns the buffers for a 65 x 65 grid
   plus a skirt, all in CHUNK-LOCAL coordinates. Absolute coordinates never
   enter a Float32Array: that is the whole reason the world holds together at
   two and a half million metres across.

   GEOMORPHING. Every vertex carries a second height, morphY, sampled from the
   even-indexed lattice of the same chunk. That lattice is exactly what the
   parent level would produce, so blending position.y toward morphY in the
   vertex shader walks a chunk continuously into its parent's shape before it
   is swapped out. No popping.

   SKIRTS. A ring of vertices around the edge, dropped by a fraction of the
   chunk size, hides the hairline cracks where a chunk meets a neighbour one
   level finer.
   ========================================================================= */

import { createSampler } from './height.js';

export const GRID = 64;                 // quads per edge
export const VERTS = GRID + 1;          // 65 x 65
/* The crack a level of detail change can open is bounded by that level's
   geometric error, which is size / 128. A skirt of size / 50 covers it with
   room to spare and still stays out of sight from above. */
export const SKIRT_FRACTION = 0.02;

/* The index buffer only depends on the grid resolution, which never changes,
   so it is built once and shared by every chunk in the world. */
export function buildIndices() {
  const quads = GRID * GRID;
  const skirtQuads = GRID * 4;
  const idx = new Uint16Array((quads + skirtQuads) * 6);
  let p = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const a = j * VERTS + i;
      const b = a + 1;
      const c = a + VERTS;
      const d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
  }
  /* Skirt vertices are appended after the grid, one per edge post, in the
     order: north edge (j=0), south edge (j=GRID), west edge (i=0),
     east edge (i=GRID). */
  const S = VERTS * VERTS;
  const edge = [
    { base: S + 0 * VERTS, top: (i) => 0 * VERTS + i, flip: true },
    { base: S + 1 * VERTS, top: (i) => GRID * VERTS + i, flip: false },
    { base: S + 2 * VERTS, top: (i) => i * VERTS + 0, flip: false },
    { base: S + 3 * VERTS, top: (i) => i * VERTS + GRID, flip: true },
  ];
  for (const e of edge) {
    for (let i = 0; i < GRID; i++) {
      const t0 = e.top(i), t1 = e.top(i + 1);
      const s0 = e.base + i, s1 = e.base + i + 1;
      if (e.flip) {
        idx[p++] = t0; idx[p++] = t1; idx[p++] = s0;
        idx[p++] = t1; idx[p++] = s1; idx[p++] = s0;
      } else {
        idx[p++] = t0; idx[p++] = s0; idx[p++] = t1;
        idx[p++] = t1; idx[p++] = s0; idx[p++] = s1;
      }
    }
  }
  return idx;
}

export const VERTEX_COUNT = VERTS * VERTS + VERTS * 4;

/**
 * Build one chunk.
 * @param {number} cx absolute X of the chunk centre, metres
 * @param {number} cz absolute Z of the chunk centre, metres
 * @param {number} size chunk edge length, metres
 * @returns {{position:Float32Array, normal:Float32Array, morphY:Float32Array,
 *            mat:Uint8Array, mat2:Uint8Array, minY:number, maxY:number}}
 */
export function buildChunk(cx, cz, size) {
  const n = VERTEX_COUNT;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const morphY = new Float32Array(n);
  const mat = new Uint8Array(n * 4);
  const mat2 = new Uint8Array(n * 4);

  const step = size / GRID;
  const half = size / 2;
  /* The chunk edge as a power of two, packed into a spare material byte so
     the vertex shader can work out its own geomorph range without a per-chunk
     uniform. Chunk sizes are always 256 * 2^k, so the exponent fits a byte
     exactly and survives the round trip through a normalised attribute. */
  const sizeExp = Math.round(Math.log2(size));

  /* One prefiltered sampler for the whole chunk, padded by a post so the
     edge normals can reach outside without falling back to the unfiltered
     field. Identical results, a fraction of the work: see createSampler. */
  const sampler = createSampler(cx - half - step, cz - half - step,
                                cx + half + step, cz + half + step);
  const terrainHeight = sampler.height;
  const classify = sampler.classify;

  const heights = new Float64Array(VERTS * VERTS);
  const w = new Float32Array(7);

  let minY = Infinity, maxY = -Infinity;

  /* Pass one: heights. Sampled on the absolute grid so neighbouring chunks at
     the same level produce bit-identical edge heights. */
  for (let j = 0; j < VERTS; j++) {
    const az = cz - half + j * step;
    for (let i = 0; i < VERTS; i++) {
      const ax = cx - half + i * step;
      const h = terrainHeight(ax, az);
      heights[j * VERTS + i] = h;
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
  }

  /* Pass two: positions, normals, morph targets, materials. */
  for (let j = 0; j < VERTS; j++) {
    const az = cz - half + j * step;
    for (let i = 0; i < VERTS; i++) {
      const ax = cx - half + i * step;
      const k = j * VERTS + i;
      const h = heights[k];

      position[k * 3] = -half + i * step;
      position[k * 3 + 1] = h;
      position[k * 3 + 2] = -half + j * step;

      /* Central differences on the chunk's own lattice, so the shading
         matches the geometry at this level of detail rather than at some
         finer one the player is not looking at. Edges fall back to the
         height field so the normal is still correct there. */
      const hl = i > 0 ? heights[k - 1] : terrainHeight(ax - step, az);
      const hr = i < GRID ? heights[k + 1] : terrainHeight(ax + step, az);
      const hd = j > 0 ? heights[k - VERTS] : terrainHeight(ax, az - step);
      const hu = j < GRID ? heights[k + VERTS] : terrainHeight(ax, az + step);
      let nx = hl - hr, ny = 2 * step, nz = hd - hu;
      const inv = 1 / Math.hypot(nx, ny, nz);
      normal[k * 3] = nx * inv;
      normal[k * 3 + 1] = ny * inv;
      normal[k * 3 + 2] = nz * inv;

      /* The parent level's height at this post: bilinear on the even lattice,
         which is precisely the surface one level coarser. */
      const i0 = i & ~1, j0 = j & ~1;
      const i1 = Math.min(i0 + 2, GRID), j1 = Math.min(j0 + 2, GRID);
      const fi = (i - i0) * 0.5, fj = (j - j0) * 0.5;
      const h00 = heights[j0 * VERTS + i0], h10 = heights[j0 * VERTS + i1];
      const h01 = heights[j1 * VERTS + i0], h11 = heights[j1 * VERTS + i1];
      morphY[k] = (h00 * (1 - fi) + h10 * fi) * (1 - fj) +
                  (h01 * (1 - fi) + h11 * fi) * fj;

      classify(ax, az, h, w);
      mat[k * 4] = w[0] * 255; mat[k * 4 + 1] = w[1] * 255;
      mat[k * 4 + 2] = w[2] * 255; mat[k * 4 + 3] = w[3] * 255;
      mat2[k * 4] = w[4] * 255; mat2[k * 4 + 1] = w[5] * 255;
      mat2[k * 4 + 2] = sizeExp; mat2[k * 4 + 3] = w[6] * 255;
    }
  }

  /* Skirt: copy each edge post straight down. */
  const drop = size * SKIRT_FRACTION;
  const S = VERTS * VERTS;
  const edgeIndex = [
    (i) => 0 * VERTS + i,
    (i) => GRID * VERTS + i,
    (i) => i * VERTS + 0,
    (i) => i * VERTS + GRID,
  ];
  for (let e = 0; e < 4; e++) {
    for (let i = 0; i < VERTS; i++) {
      const src = edgeIndex[e](i);
      const dst = S + e * VERTS + i;
      position[dst * 3] = position[src * 3];
      position[dst * 3 + 1] = position[src * 3 + 1] - drop;
      position[dst * 3 + 2] = position[src * 3 + 2];
      normal[dst * 3] = normal[src * 3];
      normal[dst * 3 + 1] = normal[src * 3 + 1];
      normal[dst * 3 + 2] = normal[src * 3 + 2];
      morphY[dst] = morphY[src] - drop;
      for (let c = 0; c < 4; c++) {
        mat[dst * 4 + c] = mat[src * 4 + c];
        mat2[dst * 4 + c] = mat2[src * 4 + c];
      }
    }
  }

  return { position, normal, morphY, mat, mat2, minY: minY - drop, maxY };
}
