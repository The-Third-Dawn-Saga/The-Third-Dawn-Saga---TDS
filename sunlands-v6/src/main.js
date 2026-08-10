/* ============================================================================
   main.js  ::  bootstrap, render loop, mode switching.

   The fly-over rig orbits a target that is pinned to the ground, so zooming
   in lands on the terrain rather than on an arbitrary pivot. Camera altitude
   drives the tier, the tier drives near and far, and the terrain streamer
   decides its own level of detail from the projection. Nothing here holds a
   distance band.
   ========================================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  KM, WORLD, TIERS, tierForAltitude, nearFarForAltitude,
  registerRoot, rebase, getWorldOffset, absToScene,
  scaleAcceptanceTest, ALT_MIN, ALT_MAX,
} from './scale.js';
import { env } from './env.js';
import { TerrainStreamer } from './terrain/chunker.js';
import { createTerrainMaterial, updateTerrainUniforms } from './terrain/sand.js';
import { terrainHeight, walkableHeight, SEA_LEVEL, STAR_DUNES } from './terrain/height.js';
import { Hud } from './ui/hud.js';

const DEV = new URLSearchParams(location.search).has('dev');

/* ---- renderer ------------------------------------------------------------ */

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 5 * KM, 4000 * KM);

/* ---- floating origin roots ------------------------------------------------
   Everything streamed hangs off a registered root so one rebase moves the
   whole world and nothing accumulates float error. */
const terrainRoot = new THREE.Group();
terrainRoot.name = 'terrain';
scene.add(terrainRoot);
registerRoot(terrainRoot, 0, 0);

const regionRoot = new THREE.Group();
regionRoot.name = 'regions';
scene.add(regionRoot);
registerRoot(regionRoot, 0, 0);

/* ---- terrain -------------------------------------------------------------- */

const terrainMaterial = createTerrainMaterial();
const terrain = new TerrainStreamer(terrainRoot, terrainMaterial);

/* ---- sky ------------------------------------------------------------------
   A flat backdrop for now. Step two replaces it with Rayleigh and Mie
   scattering driven by the same sun this file already uses. */
scene.background = new THREE.Color(0x8fb4d8);

/* ---- the fly-over rig ----------------------------------------------------- */

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.screenSpacePanning = false;
controls.zoomSpeed = 3.5;             // nine decades of zoom in about a hundred notches
controls.rotateSpeed = 0.55;
controls.minDistance = 2;
controls.maxDistance = ALT_MAX * 1.2;
controls.maxPolarAngle = Math.PI * 0.495;   // never below the horizon
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};

/* Open on the whole territory, which is the point: the reader should have to
   zoom in to get a good look. */
const openAltitude = 1450 * KM;
controls.target.copy(absToScene(0, SEA_LEVEL, 120 * KM));
camera.position.copy(absToScene(0, openAltitude, 900 * KM));
controls.update();

/* ---- HUD ------------------------------------------------------------------ */

const hud = new Hud();
hud.setTimeLabel(env.timeOfDay);

document.getElementById('tod').addEventListener('input', (e) => {
  env.setTime(parseFloat(e.target.value));
  hud.setTimeLabel(env.timeOfDay);
});
document.getElementById('weatherBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  env.setWeather(b.dataset.w);
  [...e.currentTarget.children].forEach(c => c.classList.toggle('on', c === b));
});
document.getElementById('seasonBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  env.setSeason(b.dataset.s);
  [...e.currentTarget.children].forEach(c => c.classList.toggle('on', c === b));
});

/* Fly-to presets. Region modules extend this list in a later step; for now it
   proves the coordinate system against the placement table. */
const PLACES = [
  { id: 'territory', name: 'Whole territory', x: 0, z: 120 * KM, alt: 1450 * KM },
  { id: 'sundisk', name: 'Sundisk City', x: 0, z: 0, alt: 14 * KM },
  { id: 'glass', name: 'Glass Desert', x: 530 * KM, z: -70 * KM, alt: 120 * KM },
  { id: 'salt', name: 'Great Salt Flats', x: -520 * KM, z: 40 * KM, alt: 110 * KM },
  { id: 'ashteeth', name: 'The Ashteeth', x: 100 * KM, z: -900 * KM, alt: 70 * KM },
  { id: 'cliffs', name: 'Wailing Cliffs', x: 60 * KM, z: 112 * KM, alt: 4 * KM },
  { id: 'ashlands', name: 'Western Ashlands', x: -1900 * KM, z: -100 * KM, alt: 260 * KM },
];
{
  const wrap = document.getElementById('gotoBtns');
  wrap.innerHTML = PLACES.map(p => `<button class="btn" data-p="${p.id}">${p.name}</button>`).join('');
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const p = PLACES.find(q => q.id === b.dataset.p); if (!p) return;
    flyTo(p.x, p.z, p.alt);
  });
}

/** Put the camera over an absolute ground point at a given altitude. */
function flyTo(ax, az, altitude) {
  const groundY = walkableHeight(ax, az);
  controls.target.copy(absToScene(ax, groundY, az));
  const back = altitude * 0.55;
  camera.position.copy(absToScene(ax, groundY + altitude, az + back));
  controls.update();
}

/* ---- resize --------------------------------------------------------------- */

const viewport = { w: innerWidth, h: innerHeight };
addEventListener('resize', () => {
  viewport.w = innerWidth; viewport.h = innerHeight;
  camera.aspect = viewport.w / viewport.h;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.w, viewport.h);
});

/* ---- the loop ------------------------------------------------------------- */

const clock = new THREE.Clock();
let frames = 0, fpsAccum = 0, fps = 0;
let booted = false;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  env.tick(dt);

  /* Keep the orbit target on the ground so zoom lands on the terrain. */
  const off = getWorldOffset();
  const tx = controls.target.x + off.x, tz = controls.target.z + off.z;
  const groundY = walkableHeight(tx, tz);
  controls.target.y += (groundY - controls.target.y) * Math.min(1, dt * 6);

  controls.update();

  /* Floating origin. Anything tracked in scene space and not registered as a
     root has to move with it, and the orbit target is exactly that. */
  const shift = rebase(camera.position);
  if (shift.x !== 0 || shift.z !== 0) controls.target.sub(shift);

  /* Altitude drives the tier, the tier drives the frustum. */
  const camAbsX = camera.position.x + off.x, camAbsZ = camera.position.z + off.z;
  const under = walkableHeight(camAbsX, camAbsZ);
  const altitude = Math.max(ALT_MIN, camera.position.y - under);
  const nf = nearFarForAltitude(altitude);
  if (Math.abs(camera.near - nf.near) > camera.near * 0.02) {
    camera.near = nf.near; camera.far = nf.far;
    camera.updateProjectionMatrix();
  }
  controls.maxDistance = Math.min(ALT_MAX * 1.2, 2600 * KM);

  camera.updateMatrixWorld();

  /* Terrain: pixels of screen error per metre at one metre, which is the only
     number the selector and the geomorph shader need to agree on. */
  const projK = viewport.h / (2 * Math.tan(camera.fov * Math.PI / 360));
  terrain.update(camera, viewport.h);
  updateTerrainUniforms(terrainMaterial, env, off, projK);

  scene.background = env.fogColor;

  renderer.render(scene, camera);

  /* HUD */
  const focusDist = camera.position.distanceTo(controls.target);
  hud.update(altitude, focusDist, camera, viewport);

  frames++; fpsAccum += dt;
  if (fpsAccum > 0.5) { fps = frames / fpsAccum; frames = 0; fpsAccum = 0; }

  if (!booted) {
    const t = terrain.stats;
    const ready = t.visible > 12 && t.queued < 40;
    hud.boot(ready ? 1 : Math.min(0.95, t.built / 90), ready ? 'ready' : `streaming terrain, ${t.built} chunks built`);
    if (ready) booted = true;
  }

  if (DEV) {
    const t = terrain.stats;
    const info = renderer.info.render;
    hud.dev(
      `<b>fps</b> ${fps.toFixed(0)}   <b>draws</b> ${info.calls}   <b>tris</b> ${(info.triangles / 1000).toFixed(0)}k\n` +
      `<b>chunks</b> vis ${t.visible} res ${t.resident} q ${t.queued} depth ${t.deepest}\n` +
      `<b>alt</b> ${altitude.toFixed(0)} m  <b>near/far</b> ${nf.near.toFixed(1)} / ${(nf.far / 1000).toFixed(0)}k\n` +
      `<b>origin</b> ${(off.x / 1000).toFixed(1)}, ${(off.z / 1000).toFixed(1)} km`);
    if (info.calls > 900) console.warn(`draw call budget exceeded: ${info.calls}`);
  }
}
tick();

/* ---- test hooks -----------------------------------------------------------
   Exposed so the headless probe can assert the acceptance test and the
   budgets against the real renderer rather than against a mock. */
window.__scaleTest = (w, h) => scaleAcceptanceTest(camera.fov, w || viewport.w, h || viewport.h);

window.__scaleTestLive = () => {
  /* The same test, but driving the live camera, so it also proves the render
     path agrees with the maths. */
  const b = WORLD.sunlands;
  const t = scaleAcceptanceTest(camera.fov, viewport.w, viewport.h);
  const saveP = camera.position.clone(), saveQ = camera.quaternion.clone();
  const saveUp = camera.up.clone(), saveN = camera.near, saveF = camera.far;
  camera.up.set(0, 0, -1);
  camera.position.copy(absToScene((b.minX + b.maxX) / 2, t.altitudeM, (b.minZ + b.maxZ) / 2));
  camera.lookAt(camera.position.x, 0, camera.position.z);
  camera.near = 5 * KM; camera.far = 4000 * KM;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  const a = absToScene(-9000, 0, 0).project(camera);
  const c = absToScene(9000, 0, 0).project(camera);
  const pixels = Math.abs(c.x - a.x) * 0.5 * viewport.w;
  camera.position.copy(saveP); camera.quaternion.copy(saveQ); camera.up.copy(saveUp);
  camera.near = saveN; camera.far = saveF;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return { ...t, livePixels: pixels, livePass: pixels < 12 };
};

window.__stats = () => ({
  fps,
  draws: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  terrain: { ...terrain.stats },
  altitude: camera.position.y,
  offset: { ...getWorldOffset() },
});

window.__flyTo = flyTo;
window.__env = env;
window.__camera = camera;
window.__terrainHeight = terrainHeight;
window.__starDunes = () => STAR_DUNES.map(d => ({ x: d.x, z: d.z, h: d.height }));
window.__tiers = TIERS;
window.__ready = () => booted;
window.__terrainSettled = () => terrain.isSettled();
