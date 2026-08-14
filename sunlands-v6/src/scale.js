/* ============================================================================
   scale.js  ::  the floating origin and the scale acceptance test.

   Pure units, world extents, view tiers and travel maths live in units.js so
   that the mesher worker can import them without dragging in Three.js. This
   file is the part that needs Three.js, and it re-exports units.js so the
   rest of the codebase has one place to import from.
   ========================================================================= */

import * as THREE from 'three';

export * from './units.js';
import { WORLD, KM } from './units.js';

/* ---- the floating origin -------------------------------------------------
   Float32 vertex positions and depth precision fall apart long before the
   2.55 million metres this world spans. So:

     - worldOffset is kept in plain JS numbers, which are float64.
     - Every streamed scene root is registered with its ABSOLUTE anchor.
     - On rebase we recompute each root's position from its anchor and the
       new offset, rather than accumulating subtractions, so the roots never
       drift by accumulated float error.
     - Mesh vertex data is authored chunk-local. Absolute coordinates never
       reach a Float32Array.

   Y is never rebased. The vertical span is small enough not to need it and
   leaving it alone means camera.position.y IS the altitude, which the tier
   system and the HUD both read directly.
   ------------------------------------------------------------------------ */

export const REBASE_RADIUS = 2000;

const worldOffset = { x: 0, y: 0, z: 0 };
const roots = [];   // { obj, ax, az }  absolute anchor in metres

/** Read-only view of the current offset. Do not mutate. */
export function getWorldOffset() { return worldOffset; }

/**
 * Register a scene root so the floating origin keeps it in place.
 * @param {THREE.Object3D} obj
 * @param {number} ax absolute X anchor, metres
 * @param {number} az absolute Z anchor, metres
 */
export function registerRoot(obj, ax = 0, az = 0) {
  const rec = { obj, ax, az };
  roots.push(rec);
  obj.position.set(ax - worldOffset.x, obj.position.y, az - worldOffset.z);
  return rec;
}

export function unregisterRoot(obj) {
  const i = roots.findIndex(r => r.obj === obj);
  if (i >= 0) roots.splice(i, 1);
}

const _delta = new THREE.Vector3();

/**
 * Shift the scene if the camera has drifted past REBASE_RADIUS.
 * Returns the applied shift (zero vector when nothing moved). Callers must
 * apply the same shift to anything they track in scene space that is not a
 * registered root, above all the orbit target.
 */
export function rebase(cameraPosition) {
  _delta.set(0, 0, 0);
  const drift = Math.hypot(cameraPosition.x, cameraPosition.z);
  if (drift <= REBASE_RADIUS) return _delta;

  _delta.set(cameraPosition.x, 0, cameraPosition.z);
  worldOffset.x += _delta.x;
  worldOffset.z += _delta.z;

  for (const r of roots) {
    r.obj.position.x = r.ax - worldOffset.x;
    r.obj.position.z = r.az - worldOffset.z;
  }
  cameraPosition.x = 0;
  cameraPosition.z = 0;
  return _delta;
}

/** Absolute metres to current scene space. */
export function absToScene(x, y, z, out = new THREE.Vector3()) {
  return out.set(x - worldOffset.x, y, z - worldOffset.z);
}

/** Current scene space back to absolute metres. */
export function sceneToAbs(v, out = { x: 0, y: 0, z: 0 }) {
  out.x = v.x + worldOffset.x;
  out.y = v.y;
  out.z = v.z + worldOffset.z;
  return out;
}

/** Absolute X of a scene-space X. Cheap scalar helpers for hot loops. */
export const absX = (sx) => sx + worldOffset.x;
export const absZ = (sz) => sz + worldOffset.z;
export const sceneX = (ax) => ax - worldOffset.x;
export const sceneZ = (az) => az - worldOffset.z;

/* ---- the acceptance test -------------------------------------------------
   Part 1.4, and the whole point of the rebuild:

     at the altitude where the whole Sunlands fills the viewport, Sundisk
     City's entire 18 km metro footprint must occupy fewer than 12 screen
     pixels.

   This runs the real projection maths on a scratch camera in absolute space,
   so it cannot be fooled by the floating origin or by whatever the live
   camera happens to be doing. Exposed on window as __scaleTest().
   ------------------------------------------------------------------------ */

export const SUNDISK_METRO_DIAMETER = 18 * KM;   // OPEN O-1, derived not stated

export function scaleAcceptanceTest(fovDeg = 50, viewportW = 1920, viewportH = 1080) {
  const b = WORLD.sunlands;
  const halfW = (b.maxX - b.minX) / 2;
  const halfH = (b.maxZ - b.minZ) / 2;
  const aspect = viewportW / viewportH;
  const tanHalfV = Math.tan(fovDeg * Math.PI / 360);

  /* Altitude at which the box exactly fills the viewport: whichever of the
     two dimensions runs out of room first decides. */
  const altForHeight = halfH / tanHalfV;
  const altForWidth = halfW / (tanHalfV * aspect);
  const altitude = Math.max(altForHeight, altForWidth);

  const cam = new THREE.PerspectiveCamera(fovDeg, aspect, 5 * KM, 4000 * KM);
  cam.up.set(0, 0, -1);                      // looking straight down, north up
  cam.position.set((b.minX + b.maxX) / 2, altitude, (b.minZ + b.maxZ) / 2);
  cam.lookAt(cam.position.x, 0, cam.position.z);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();

  const half = SUNDISK_METRO_DIAMETER / 2;
  const a = new THREE.Vector3(-half, 0, 0).project(cam);
  const c = new THREE.Vector3(half, 0, 0).project(cam);
  const pixels = Math.abs(c.x - a.x) * 0.5 * viewportW;

  return {
    altitudeM: altitude,
    altitudeKm: altitude / KM,
    metroDiameterKm: SUNDISK_METRO_DIAMETER / KM,
    pixels,
    budget: 12,
    pass: pixels < 12,
    viewport: `${viewportW}x${viewportH}`,
    fov: fovDeg,
  };
}
