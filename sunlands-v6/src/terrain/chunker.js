/* ============================================================================
   chunker.js  ::  the quadtree, the streaming queue, the worker pool.

   Selection is by SCREEN-SPACE ERROR, not by distance rings. A node splits
   when the height error it would introduce projects to more than a couple of
   pixels. That is what lets one continuous zoom axis serve a nine hundred
   kilometre vista and a doorway without a single hand-tuned distance band.

   The cut is always a valid quadtree cut: if a node the selector wants is not
   built yet, the nearest built ancestor stands in for it, and any descendant
   of a node already in the set is dropped. So the terrain is sometimes
   coarser than ideal while chunks stream in, but it is never holed and never
   double-covered.

   Nodes are addressed by integer level and index, never by float centres, so
   a key is exact and the parent of a node is just an index shift.

   GEOMORPHING happens in the vertex shader, not here. The shader derives the
   morph factor from the vertex's own distance to the camera and the chunk's
   size, which the mesher packs into a vertex attribute. Two chunks that share
   an edge share those vertex positions exactly, so they compute the same
   morph and the seam is watertight by construction rather than by luck.
   ========================================================================= */

import * as THREE from 'three';
import { WORLD, getWorldOffset } from '../scale.js';
import { GRID, buildIndices } from './mesher.js';

export const TAU_PIXELS = 2.4;          // split threshold, screen-space height error
export const ERROR_PER_SPACING = 0.5;   // geometric error as a fraction of post spacing
export const MAX_BUILDS_PER_FRAME = 3;  // Part 2 budget, hard
const MAX_RESIDENT = 620;               // built chunks kept before eviction
const MAX_QUEUE = 96;

/* Min corner of the root tile. Node centres are half-cell offset from it. */
const MIN_X = WORLD.root.cx - WORLD.root.size / 2;
const MIN_Z = WORLD.root.cz - WORLD.root.size / 2;

export const nodeSize = (level) => WORLD.root.size / Math.pow(2, level);
export const nodeCentreX = (level, ix) => MIN_X + (ix + 0.5) * nodeSize(level);
export const nodeCentreZ = (level, iz) => MIN_Z + (iz + 0.5) * nodeSize(level);
const keyOf = (level, ix, iz) => (level * 0x1000000 + ix) * 0x1000000 + iz;

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

export class TerrainStreamer {
  /**
   * @param {THREE.Object3D} root scene root registered with the floating origin
   * @param {THREE.Material} material shared by every chunk
   */
  constructor(root, material) {
    this.root = root;
    this.material = material;

    this.indexAttr = new THREE.BufferAttribute(buildIndices(), 1);
    this.cache = new Map();        // key -> chunk record
    this.pending = new Set();      // keys out at a worker
    this.queue = [];
    this.inbox = [];
    this.frame = 0;

    this.stats = { visible: 0, resident: 0, queued: 0, built: 0, evicted: 0, deepest: 0 };

    /* Worker pool. Two to four is the sweet spot: more workers do not help,
       because the queue is drained at three chunk uploads per frame anyway. */
    const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
    this.workers = [];
    this.workerBusy = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./mesher.worker.js', import.meta.url), { type: 'module' });
      const slot = i;
      w.onmessage = (e) => {
        if (e.data.ready) return;
        this.workerBusy[slot] = false;
        for (const r of e.data.results) this.inbox.push(r);
      };
      this.workers.push(w);
      this.workerBusy.push(false);
    }

    this._desired = [];
    this._frustum = new THREE.Frustum();
    this._pv = new THREE.Matrix4();
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const [, c] of this.cache) {
      this.root.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    this.cache.clear();
  }

  /* ---- selection -------------------------------------------------------- */

  select(camera, viewportHeight, maxDepth = WORLD.maxDepth) {
    const out = this._desired;
    out.length = 0;

    this._pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._pv);

    /* Pixels of screen error per metre of geometric error, at one metre. */
    const K = viewportHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
    const off = getWorldOffset();
    const cam = camera.position;
    let deepest = 0;

    const recurse = (level, ix, iz) => {
      const size = nodeSize(level);
      const half = size / 2;
      const cx = MIN_X + (ix + 0.5) * size;
      const cz = MIN_Z + (iz + 0.5) * size;
      const sx = cx - off.x, sz = cz - off.z;

      _box.min.set(sx - half, WORLD.minY, sz - half);
      _box.max.set(sx + half, WORLD.maxY, sz + half);
      if (!this._frustum.intersectsBox(_box)) return;

      _box.clampPoint(cam, _v);
      const dist = Math.max(1, _v.distanceTo(cam));
      const error = (size / GRID) * ERROR_PER_SPACING;
      const screenError = error * K / dist;

      if (level < maxDepth && screenError > TAU_PIXELS) {
        recurse(level + 1, ix * 2, iz * 2);
        recurse(level + 1, ix * 2 + 1, iz * 2);
        recurse(level + 1, ix * 2, iz * 2 + 1);
        recurse(level + 1, ix * 2 + 1, iz * 2 + 1);
        return;
      }
      if (level > deepest) deepest = level;
      out.push({ key: keyOf(level, ix, iz), level, ix, iz, cx, cz, size, dist });
    };

    recurse(0, 0, 0);
    this.stats.deepest = deepest;
    return out;
  }

  /* ---- per-frame update ------------------------------------------------- */

  update(camera, viewportHeight, maxDepth = WORLD.maxDepth) {
    this.frame++;
    const desired = this.select(camera, viewportHeight, maxDepth);

    /* Resolve each wanted node to the deepest built ancestor-or-self, and
       queue whatever is missing. */
    const resolved = new Set();
    for (const d of desired) {
      let level = d.level, ix = d.ix, iz = d.iz;
      let queued = false;
      while (level >= 0) {
        const k = keyOf(level, ix, iz);
        if (this.cache.has(k)) { resolved.add(k); break; }
        if (!queued) { this.enqueue(d); queued = true; }
        ix >>= 1; iz >>= 1; level--;
      }
    }

    /* Drop anything shadowed by an ancestor already in the set, so the cover
       is a clean cut with no double coverage and no z-fighting. */
    for (const k of [...resolved]) {
      const c = this.cache.get(k);
      let level = c.level, ix = c.ix, iz = c.iz;
      while (level > 0) {
        ix >>= 1; iz >>= 1; level--;
        if (resolved.has(keyOf(level, ix, iz))) { resolved.delete(k); break; }
      }
    }

    let visible = 0;
    for (const [k, c] of this.cache) {
      if (resolved.has(k)) { c.mesh.visible = true; c.lastUsed = this.frame; visible++; }
      else c.mesh.visible = false;
    }

    this.dispatch();
    this.drain();
    this.evict();

    this.stats.visible = visible;
    this.stats.resident = this.cache.size;
    this.stats.queued = this.queue.length + this.pending.size;
    return visible;
  }

  enqueue(node) {
    if (this.pending.has(node.key)) return;
    for (const q of this.queue) {
      if (q.key === node.key) { if (node.dist < q.dist) q.dist = node.dist; return; }
    }
    this.queue.push({ key: node.key, level: node.level, ix: node.ix, iz: node.iz,
                      cx: node.cx, cz: node.cz, size: node.size, dist: node.dist });
  }

  /** Hand queued work to idle workers, nearest first. */
  dispatch() {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < this.workers.length && this.queue.length; i++) {
      if (this.workerBusy[i]) continue;
      const batch = this.queue.splice(0, 2);
      for (const b of batch) this.pending.add(b.key);
      this.workerBusy[i] = true;
      this.workers[i].postMessage({ jobs: batch });
    }
    /* Requests the camera has flown past are worth less than the frame time
       spent sorting them. Keep the queue short. */
    if (this.queue.length > MAX_QUEUE) this.queue.length = MAX_QUEUE;
  }

  /** Turn at most MAX_BUILDS_PER_FRAME finished jobs into live geometry. */
  drain() {
    let n = 0;
    while (this.inbox.length && n < MAX_BUILDS_PER_FRAME) {
      const r = this.inbox.shift();
      this.pending.delete(r.key);
      n++;
      if (this.cache.has(r.key)) continue;
      this.cache.set(r.key, this.makeChunk(r));
      this.stats.built++;
    }
  }

  makeChunk(r) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.normal, 3));
    g.setAttribute('morphY', new THREE.BufferAttribute(r.morphY, 1));
    g.setAttribute('aMat', new THREE.BufferAttribute(r.mat, 4, true));
    g.setAttribute('aMat2', new THREE.BufferAttribute(r.mat2, 4, true));
    g.setIndex(this.indexAttr);

    const half = r.size / 2;
    g.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, (r.minY + r.maxY) / 2, 0),
      Math.hypot(half, half) + (r.maxY - r.minY) / 2 + 1);

    const mesh = new THREE.Mesh(g, this.material);
    /* Chunk-local vertices, absolute centre in the object position. The root
       carries the negated floating origin, so the product lands near the
       camera and the float32 the GPU sees stays small. */
    mesh.position.set(r.cx, 0, r.cz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    return { key: r.key, mesh, level: r.level, ix: r.ix, iz: r.iz,
             cx: r.cx, cz: r.cz, size: r.size, minY: r.minY, maxY: r.maxY,
             lastUsed: this.frame };
  }

  /** Least recently used chunks go first, and never one that is on screen. */
  evict() {
    if (this.cache.size <= MAX_RESIDENT) return;
    const all = [...this.cache.values()].sort((a, b) => a.lastUsed - b.lastUsed);
    let toDrop = this.cache.size - MAX_RESIDENT;
    for (const c of all) {
      if (toDrop <= 0) break;
      if (c.lastUsed === this.frame) continue;
      this.root.remove(c.mesh);
      c.mesh.geometry.dispose();
      this.cache.delete(c.key);
      toDrop--;
      this.stats.evicted++;
    }
  }

  /** True when nothing is queued, in flight, or waiting to be uploaded. */
  isSettled() {
    return this.queue.length === 0 && this.pending.size === 0 && this.inbox.length === 0;
  }

  visibleChunks() {
    const out = [];
    for (const [, c] of this.cache) if (c.mesh.visible) out.push(c);
    return out;
  }
}
