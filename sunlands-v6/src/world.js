/* ============================================================================
   world.js  ::  the region registry and the streaming manager.

   Terrain streams by screen-space error. Region CONTENT streams by distance
   and by tier, because a settlement is not a continuous field: it has a size,
   a position, and three levels at which it is worth drawing at all.

     beyond 8 km      an imposter. One low-poly proxy hull with a baked
                      colour, or nothing at all past the tier's range.
     8 km to 2 km     blocks. Massing, walls, the shape of the place.
     inside 2 km      the full build: individual buildings, props, crowds.

   Each level is built once, cached, and reused. Nothing is in the scene at
   load. A region that has not been approached has never been generated, which
   is the only way a world this size fits in memory.
   ========================================================================= */

import * as THREE from 'three';
import { KM, tierForAltitude } from './scale.js';

export const LOD = { FULL: 0, BLOCKS: 1, IMPOSTER: 2, NONE: 3 };

/* Part 2: beyond about 8 km a settlement is a proxy, not buildings. */
const FULL_RANGE = 2.2 * KM;
const BLOCK_RANGE = 8 * KM;
const IMPOSTER_RANGE = 140 * KM;

const MAX_BUILDS_PER_FRAME = 1;

export class RegionManager {
  /**
   * @param {THREE.Object3D} root registered with the floating origin
   */
  constructor(root) {
    this.root = root;
    this.regions = new Map();
    this.stats = { active: 0, built: 0, meshes: 0 };
    this._pending = [];
  }

  /**
   * @param {object} def
   * @param {string} def.id
   * @param {number} def.x absolute metres
   * @param {number} def.z absolute metres
   * @param {number} [def.radius] content radius, metres
   * @param {number} [def.fullRange] override for FULL detail
   * @param {number} [def.blockRange]
   * @param {number} [def.imposterRange]
   * @param {(ctx:object)=>THREE.Object3D} [def.buildFull]
   * @param {(ctx:object)=>THREE.Object3D} [def.buildBlocks]
   * @param {(ctx:object)=>THREE.Object3D} [def.buildImposter]
   */
  add(def) {
    this.regions.set(def.id, {
      ...def,
      radius: def.radius || 500,
      fullRange: def.fullRange || FULL_RANGE,
      blockRange: def.blockRange || BLOCK_RANGE,
      imposterRange: def.imposterRange || IMPOSTER_RANGE,
      levels: [null, null, null],     // FULL, BLOCKS, IMPOSTER
      current: LOD.NONE,
      group: null,
    });
  }

  get(id) { return this.regions.get(id); }

  /** Which level of detail a region deserves right now. */
  levelFor(region, dist, altitude) {
    const near = Math.max(0, dist - region.radius);
    if (near < region.fullRange && altitude < 3.5 * KM && region.buildFull) return LOD.FULL;
    if (near < region.blockRange && altitude < 26 * KM && region.buildBlocks) return LOD.BLOCKS;
    if (near < region.imposterRange && region.buildImposter) return LOD.IMPOSTER;
    return LOD.NONE;
  }

  /**
   * @param {{x:number,z:number}} camAbs absolute camera position
   * @param {number} altitude metres above the ground
   * @param {object} ctx passed to builders: env, materials, helpers
   */
  update(camAbs, altitude, ctx) {
    let active = 0;
    let builds = 0;
    for (const [, r] of this.regions) {
      const dist = Math.hypot(camAbs.x - r.x, camAbs.z - r.z);
      const want = this.levelFor(r, dist, altitude);

      if (want === LOD.NONE) {
        if (r.group) r.group.visible = false;
        r.current = LOD.NONE;
        continue;
      }
      active++;

      if (!r.levels[want]) {
        /* One region build per frame at most. They are much heavier than a
           terrain chunk, and a hitch here is far more visible than a chunk
           arriving a frame late. */
        if (builds >= MAX_BUILDS_PER_FRAME) {
          /* Fall back to whatever level IS built rather than showing nothing. */
          const have = r.levels.findIndex(l => l);
          if (have >= 0) this.show(r, have);
          continue;
        }
        const builder = [r.buildFull, r.buildBlocks, r.buildImposter][want];
        const obj = builder({ ...ctx, region: r });
        if (obj) {
          obj.visible = false;
          obj.position.set(r.x, 0, r.z);
          this.ensureGroup(r).add(obj);
          r.levels[want] = obj;
          this.stats.built++;
        } else {
          r.levels[want] = new THREE.Group();      // nothing to build, remember that
        }
        builds++;
      }
      this.show(r, want);
    }
    this.stats.active = active;
    return active;
  }

  ensureGroup(r) {
    if (!r.group) {
      r.group = new THREE.Group();
      r.group.name = `region:${r.id}`;
      this.root.add(r.group);
    }
    r.group.visible = true;
    return r.group;
  }

  show(r, level) {
    if (!r.group) return;
    r.group.visible = true;
    for (let i = 0; i < 3; i++) {
      if (r.levels[i]) r.levels[i].visible = (i === level);
    }
    r.current = level;
  }

  /** Free everything a long way behind the camera. */
  prune(camAbs, maxDist = 400 * KM) {
    for (const [, r] of this.regions) {
      if (!r.group) continue;
      const dist = Math.hypot(camAbs.x - r.x, camAbs.z - r.z);
      if (dist < maxDist) continue;
      disposeTree(r.group);
      this.root.remove(r.group);
      r.group = null;
      r.levels = [null, null, null];
      r.current = LOD.NONE;
    }
  }
}

export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      /* Shared materials are owned by their module, not by the region, so
         only dispose the ones a builder made for itself. */
      for (const m of mats) if (m.userData && m.userData.ownedByRegion) m.dispose();
    }
  });
}

/** Convenience: seeded deterministic RNG for region generators. */
export function makeRng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** A string to a stable integer seed, so region ids give stable layouts. */
export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export { tierForAltitude };
