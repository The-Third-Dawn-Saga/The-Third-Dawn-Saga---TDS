/* ============================================================================
   kit.js  ::  the instancing kit.

   Everything repeated in this world goes through here: buildings, palms,
   stalls, wall towers, silos, tents, crowd figures. Individual meshes cross
   the draw-call budget at around three thousand objects and Sundisk alone
   needs ten times that, so nothing repeated is ever a Mesh.
   ========================================================================= */

import * as THREE from 'three';
import { attachSunklayAttributes } from './materials.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Collects instance transforms and the three sunklay attributes, then emits
 * one InstancedMesh. Grows on demand so callers do not have to count first.
 */
export class InstanceSet {
  constructor(geometry, material, capacity = 256) {
    this.geometry = geometry;
    this.material = material;
    this.cap = capacity;
    this.n = 0;
    this.matrices = new Float32Array(capacity * 16);
    this.gold = new Float32Array(capacity);
    this.tone = new Float32Array(capacity);
    this.wear = new Float32Array(capacity);
  }

  grow() {
    const cap = this.cap * 2;
    const m = new Float32Array(cap * 16); m.set(this.matrices);
    const g = new Float32Array(cap); g.set(this.gold);
    const t = new Float32Array(cap); t.set(this.tone);
    const w = new Float32Array(cap); w.set(this.wear);
    this.matrices = m; this.gold = g; this.tone = t; this.wear = w;
    this.cap = cap;
  }

  /**
   * @param {number} x @param {number} y @param {number} z  centre, metres
   * @param {number} sx @param {number} sy @param {number} sz  scale
   * @param {number} rotY radians
   * @param {number} gold 0..1
   * @param {number} tone 0..1
   * @param {number} wear 0..1
   */
  add(x, y, z, sx, sy, sz, rotY, gold, tone, wear) {
    if (this.n >= this.cap) this.grow();
    _e.set(0, rotY, 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    _m.toArray(this.matrices, this.n * 16);
    this.gold[this.n] = gold;
    this.tone[this.n] = tone;
    this.wear[this.n] = wear;
    this.n++;
  }

  /** @returns {THREE.InstancedMesh|null} */
  build(name) {
    if (this.n === 0) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.n);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(
      this.matrices.subarray(0, this.n * 16), 16);
    mesh.instanceMatrix.needsUpdate = true;
    attachSunklayAttributes(mesh,
      this.gold.subarray(0, this.n),
      this.tone.subarray(0, this.n),
      this.wear.subarray(0, this.n));
    mesh.frustumCulled = true;
    mesh.name = name || 'instances';
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/* ---------------------------------------------------------------------------
   SHARED GEOMETRY

   One of each, made once, reused by every region in the world. A building is
   a unit box with its base on y = 0, so a builder only has to think in
   footprint and height.
   ------------------------------------------------------------------------ */

let _geo = null;

export function geometryKit() {
  if (_geo) return _geo;

  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);

  /* Flat-roofed mud brick with a parapet: two boxes would be two draws, so
     the parapet is part of the same geometry. */
  const parapet = new THREE.BoxGeometry(1.06, 0.09, 1.06);
  parapet.translate(0, 1.02, 0);
  const house = mergeGeoms([box, parapet]);

  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false);
  cyl.translate(0, 0.5, 0);

  /* Granary silo: a tapering cylinder with a domed cap. */
  const silo = mergeGeoms([
    taper(new THREE.CylinderGeometry(0.42, 0.5, 1, 12, 1, false), 0, 0.5),
    domeAt(0.42, 1.0),
  ]);

  const cone = new THREE.ConeGeometry(0.5, 1, 8);
  cone.translate(0, 0.5, 0);

  const dome = new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(0, 0, 0);

  /* Ostrich-egg pinnacle, the Great Sun Temple's signature. */
  const egg = new THREE.SphereGeometry(0.5, 10, 8);
  egg.scale(1, 1.35, 1);
  egg.translate(0, 0.68, 0);

  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);

  _geo = { box, house, cyl, silo, cone, dome, egg, plane };
  return _geo;
}

function taper(g, ty, y) { g.translate(0, y, 0); return g; }
function domeAt(r, y) {
  const d = new THREE.SphereGeometry(r, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  d.translate(0, y, 0);
  return d;
}

/** Minimal geometry merge: positions and normals only, non-indexed. */
export function mergeGeoms(list) {
  const parts = list.map(g => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of parts) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    const p = g.getAttribute('position').array;
    const n = g.getAttribute('normal').array;
    pos.set(p, o * 3);
    nrm.set(n, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
