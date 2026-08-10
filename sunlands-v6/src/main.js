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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import {
  KM, WORLD, TIERS, tierForAltitude, nearFarForAltitude,
  registerRoot, rebase, getWorldOffset, absToScene,
  scaleAcceptanceTest, ALT_MIN, ALT_MAX,
} from './scale.js';
import { env } from './env.js';
import { TerrainStreamer } from './terrain/chunker.js';
import { createTerrainMaterial, updateTerrainUniforms } from './terrain/sand.js';
import { terrainHeight, walkableHeight, coastDistance, SEA_LEVEL, STAR_DUNES } from './terrain/height.js';
import { Sky } from './sky.js';
import { SunShadows } from './shadows.js';
import { Weather, buildDustWall, updateDustWall, buildRain, updateRain } from './weather.js';
import { Ocean } from './water/ocean.js';
import { ShimmerShader } from './shaders/shimmer.js';
import { Hud } from './ui/hud.js';
import { Labels } from './ui/labels.js';
import { Overlays } from './ui/overlays.js';
import { RegionManager } from './world.js';
import { loadCanon, registerRegions } from './regions/index.js';
import { createSunklayMaterial, updateSunklayUniforms } from './city/materials.js';
import { updateVeil } from './city/veil.js';
import { updatePyramids, updateShapes } from './regions/landmarks.js';
import { updateCrowd, buildTraffic, updateTraffic } from './regions/life.js';
import { applyAshGrade, buildAshVeil, updateSeasonalLake } from './regions/ashlands.js';
import {
  ExploreController, GridCollision, Footprints, FootstepAudio,
} from './explore/controller.js';
import { MapView } from './ui/map.js';
import { TRAVEL, WIND } from './units.js';

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
/* Khronos PBR Neutral rather than ACES. This build is a canon reference: when
   the palette says the sand is #C2A24D, the sand on screen has to read as
   #C2A24D. ACES pushes already-saturated golds hard toward orange and clips
   the red channel long before the image is bright; the neutral map holds hue
   and desaturates only where it must. */
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
/* Draw calls have to be counted across every pass, not just the last one, or
   the post-processing path reports two triangles and a clean bill of health. */
renderer.info.autoReset = false;
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

/* ---- sky and post ---------------------------------------------------------
   Rayleigh and Mie scattering on a screen-filling quad, and a heat shimmer
   pass that only runs when the air is actually hot enough to refract, so the
   full-screen copy is not paid for at dawn. */
const sky = new Sky(scene);
const ocean = new Ocean(scene);
const shadows = new SunShadows(renderer);
const shadowExcluded = [];

/* Weather with a position. The Harmattan front advances at 80 km/h and the
   coastal fog is a function of coast distance, so both are sampled where the
   camera is standing rather than read off a slider. */
const weather = new Weather();
const dustWall = buildDustWall();
const rainMesh = buildRain(4000);
scene.add(dustWall, rainMesh);

/* ---- the depth prepass ----------------------------------------------------
   The water needs to know how deep it is at every pixel, and the honest way
   to get that is to ask the terrain. Half resolution, terrain only, colour
   and depth: the colour attachment doubles as the refraction source, so the
   shallows show the seabed through the surface for free. */
const depthRT = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: true,
});
depthRT.depthTexture = new THREE.DepthTexture(1, 1);
depthRT.depthTexture.type = THREE.UnsignedIntType;
depthRT.texture.colorSpace = THREE.SRGBColorSpace;
const _invViewProj = new THREE.Matrix4();

function renderDepthPass() {
  sky.mesh.visible = false;
  ocean.mesh.visible = false;
  regionRoot.visible = false;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(depthRT);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);
  renderer.setRenderTarget(prev);
  sky.mesh.visible = true;
  ocean.mesh.visible = true;
  regionRoot.visible = true;
}

const composer = new EffectComposer(renderer);
/* The materials do their own tone mapping and sRGB encode, and Three.js picks
   the encode from the CURRENT render target's colour space. Telling the
   composer's targets they hold sRGB keeps the composited path identical to
   the direct one instead of quietly skipping the encode. */
composer.renderTarget1.texture.colorSpace = THREE.SRGBColorSpace;
composer.renderTarget2.texture.colorSpace = THREE.SRGBColorSpace;
composer.addPass(new RenderPass(scene, camera));
const shimmerPass = new ShaderPass(ShimmerShader);
composer.addPass(shimmerPass);

const _fwd = new THREE.Vector3();
const _horizonProbe = new THREE.Vector3();
function horizonNdcY() {
  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-9) return -2;      // looking straight down
  _fwd.normalize();
  _horizonProbe.copy(camera.position).addScaledVector(_fwd, 1e7);
  _horizonProbe.project(camera);
  return _horizonProbe.y;
}

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

/* ---- regions --------------------------------------------------------------
   Nothing is in the scene at load. canon.json is fetched, every place is
   registered with the streaming manager, and content is generated the first
   time the camera comes close enough for it to be worth drawing. */
const sunklay = createSunklayMaterial();
const regions = new RegionManager(regionRoot);
const regionCtx = { sunklay, env };
const overlayRoot = new THREE.Group();
overlayRoot.name = 'overlays';
scene.add(overlayRoot);
registerRoot(overlayRoot, 0, 0);
let overlays = null;
let traffic = null;

/* The Ashlands ash veil: one particle layer over the whole region, faded in
   by the same grade factor that desaturates the sky. */
const ashVeil = buildAshVeil({ x: -1950 * KM, y: SEA_LEVEL + 200, z: 0 }, 1300 * KM, 9000);
overlayRoot.add(ashVeil);
let canon = null;
let labels = null;
let placesById = new Map();

const pyramidState = { active: false, phase: 0, timer: 0, done: false };
const shapeRng = { t: 20240710 };
const _regionFrustum = new THREE.Frustum();
const _regionPV = new THREE.Matrix4();

loadCanon().then(c => {
  canon = c;
  placesById = registerRegions(regions, c);
  labels = new Labels(document.getElementById('labels'), c.places, showPlace);
  mapView = new MapView(document.getElementById('minimap'),
                        document.getElementById('fullmap'), c.places);
  overlays = new Overlays(overlayRoot, c);
  overlays.setLayers(layers);
  buildGotoButtons(c);
  window.__canon = c;
}).catch(err => {
  console.error('canon.json failed to load:', err);
  hud.boot(1, 'canon data unavailable');
});

function showPlace(p) {
  hud.showInfo({
    name: p.name,
    kind: `${p.kind || ''}${p.population ? '  ' + String.fromCharCode(183) + '  Pop ' + p.population : ''}`,
    tags: p.tags || [],
    info: p.info || '',
  });
  hud.setInfoAction(() => flyTo(p.x, p.z, p.extent ? Math.max(4000, p.extent * 0.9) : 3500));
}

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

/* Fly-to presets, drawn from canon so there is one list of places, not two. */
const PRESET_IDS = ['territory', 'sundisk', 'gate', 'arena', 'glass', 'saltflats',
                    'solkhari', 'goldencoast', 'fishing', 'drumharbor', 'kosei',
                    'ashteeth', 'mournscar'];
const PRESET_ALT = {
  territory: 1450 * KM, sundisk: 14 * KM, gate: 1.4 * KM, arena: 900,
  glass: 120 * KM, saltflats: 110 * KM, solkhari: 4 * KM, goldencoast: 6 * KM,
  fishing: 700, drumharbor: 6 * KM, kosei: 8 * KM, ashteeth: 70 * KM,
  mournscar: 12 * KM,
};

function buildGotoButtons(c) {
  const wrap = document.getElementById('gotoBtns');
  const list = PRESET_IDS.map(id => c.places.find(p => p.id === id)).filter(Boolean);
  wrap.innerHTML = list.map(p => `<button class="btn" data-p="${p.id}">${p.name}</button>`).join('');
  wrap.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const p = list.find(q => q.id === b.dataset.p); if (!p) return;
    flyTo(p.x, p.z, PRESET_ALT[p.id] || 5 * KM);
    showPlace(p);
  };
}

/**
 * Put the camera over an absolute ground point at a given altitude.
 * @param {number} headingDeg optional compass bearing to look along, 0 north
 */
function flyTo(ax, az, altitude, headingDeg) {
  const groundY = walkableHeight(ax, az);
  controls.target.copy(absToScene(ax, groundY, az));
  const back = altitude * 0.55;
  if (headingDeg === null || headingDeg === undefined) {
    camera.position.copy(absToScene(ax, groundY + altitude, az + back));
  } else {
    /* Compass bearing: 0 north, 90 east. North is -Z here, so the camera sits
       opposite the bearing and looks along it. */
    const r = headingDeg * Math.PI / 180;
    const dx = Math.sin(r), dz = -Math.cos(r);
    camera.position.copy(absToScene(ax - dx * back, groundY + altitude, az - dz * back));
  }
  controls.update();
}

/* ---- explore mode ---------------------------------------------------------
   First and third person, pointer lock, real human speeds, and a travel
   accelerator that is presented as one rather than pretending to be a running
   speed. Part 6. */
const explore = new ExploreController(camera, renderer.domElement);
const footprints = new Footprints(scene, 512);
const footAudio = new FootstepAudio();
explore.onFootstep = (x, z, running) => {
  /* Cosmetics must never be able to stop the render loop. An audio context
     that will not start, or a decal buffer that will not grow, is a footstep
     nobody hears, not a frozen world. */
  try {
    footprints.place(x, z, explore.yaw, (ax, ay, az, out) => absToScene(ax, ay, az, out));
    footAudio.step(running);
  } catch (err) {
    if (!explore._footWarned) { console.warn('footstep effects disabled:', err.message); explore._footWarned = true; }
    explore.onFootstep = null;
  }
};

let mapView = null;
let mapOpen = false;
let fastTravelMode = null;
const gateState = { active: false, t: 0 };

function enterExplore(ax, az) {
  const o = getWorldOffset();
  if (ax === undefined) { ax = camera.position.x + o.x; az = camera.position.z + o.z; }
  controls.enabled = false;
  explore.enter(ax, az, 0);
  document.getElementById('explorePanel').style.display = 'block';
  document.getElementById('minimap').classList.add('vis');
  document.getElementById('exploreHint').style.display = 'block';
  const b = document.getElementById('btnExplore');
  b.textContent = 'Leave explore mode'; b.classList.add('on');
}
function leaveExplore() {
  explore.exit();
  controls.enabled = true;
  controls.target.copy(camera.position).add(new THREE.Vector3(0, -300, -300));
  document.getElementById('explorePanel').style.display = 'none';
  document.getElementById('minimap').classList.remove('vis');
  document.getElementById('exploreHint').style.display = 'none';
  const b = document.getElementById('btnExplore');
  b.textContent = 'Enter explore mode'; b.classList.remove('on');
}
document.getElementById('btnExplore').addEventListener('click', () => {
  explore.enabled ? leaveExplore() : enterExplore();
});
document.getElementById('speedBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  explore.setSpeed(parseInt(b.dataset.s, 10));
  [...e.currentTarget.children].forEach(c => c.classList.toggle('on', c === b));
});
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && explore.enabled) leaveExplore();
  if (e.code === 'KeyM') toggleMap();
});

/* Fast travel: the same journey at four canon speeds, so the player can feel
   the distance at four different rates rather than being teleported. */
{
  const wrap = document.getElementById('travelBtns');
  wrap.innerHTML = TRAVEL.map((m, i) =>
    `<button class="btn" data-t="${i}">${m.name}<br>${m.kmh} km/h</button>`).join('');
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const mode = TRAVEL[parseInt(b.dataset.t, 10)];
    fastTravelMode = mode;
    /* A mode is a speed. Sun Eater at 115 km/h is 32 m/s, which against a
       1.4 m/s walk is a 23x accelerator, and the readout says so. */
    explore.travelMode = mode;
    explore.modeSpeed = mode.kmh * 1000 / 3600;
    [...e.currentTarget.children].forEach(c => c.classList.toggle('on', c === b));
  });
}

function toggleMap() {
  mapOpen = !mapOpen;
  document.getElementById('mapOverlay').classList.toggle('vis', mapOpen);
  if (mapOpen) drawFullMap();
}
document.getElementById('btnMap').addEventListener('click', toggleMap);
document.getElementById('mapClose').addEventListener('click', toggleMap);

function drawFullMap() {
  if (!mapView) return;
  const c = document.getElementById('fullmap');
  c.width = Math.min(1500, Math.floor(innerWidth * 0.9));
  c.height = Math.floor(c.width * 0.62);
  const o = getWorldOffset();
  const px = explore.enabled ? explore.abs.x : camera.position.x + o.x;
  const pz = explore.enabled ? explore.abs.z : camera.position.z + o.z;
  mapView.draw(c, { cx: -300 * KM, cz: -100 * KM, span: 4400 * KM },
    { x: px, z: pz, heading: explore.enabled ? -explore.yaw : 0 }, true);
}

/* ---- layer toggles --------------------------------------------------------- */
const layers = {
  labels: true, canals: true, roads: false, rivers: false, farms: false,
  solanu: false, vassals: false, outposts: false, migration: false,
};
document.getElementById('layerBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  layers[b.dataset.l] = !layers[b.dataset.l];
  b.classList.toggle('on', layers[b.dataset.l]);
  if (overlays) overlays.setLayers(layers);
});

document.getElementById('btnPyr').addEventListener('click', () => {
  pyramidState.active = true; pyramidState.phase = 0; pyramidState.timer = 0;
  const p = placesById.get('solkhari');
  if (p) { flyTo(p.x, p.z, 1400); showPlace(placesById.get('pyramids') || p); }
});
document.getElementById('btnGate').addEventListener('click', () => {
  gateState.active = true; gateState.t = 0;
  const p = placesById.get('gate');
  if (p) { flyTo(p.x, p.z, 800); showPlace(p); }
});

/* ---- resize --------------------------------------------------------------- */

const viewport = { w: innerWidth, h: innerHeight };
addEventListener('resize', () => {
  viewport.w = innerWidth; viewport.h = innerHeight;
  camera.aspect = viewport.w / viewport.h;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.w, viewport.h);
  composer.setSize(viewport.w, viewport.h);
  depthRT.setSize(Math.max(2, viewport.w >> 1), Math.max(2, viewport.h >> 1));
});
depthRT.setSize(Math.max(2, viewport.w >> 1), Math.max(2, viewport.h >> 1));

/* ---- the loop ------------------------------------------------------------- */

const clock = new THREE.Clock();
let frames = 0, fpsAccum = 0, fps = 0;
let booted = false;
let lastWantDepth = false;

/* BUDGET SAMPLING, AND WHY IT IS A PEAK RATHER THAN A READING.

   The shadow cascades re-render on alternate frames, so the cost of a frame
   alternates between "scene" and "scene plus two depth passes". Sampling
   renderer.info on whichever frame the test happened to land on gives one of
   two very different answers, and the low one is a lie: the frames that stall
   are the expensive ones. So the counters are kept over a short ring and read
   as a maximum, which is the number a budget is actually about. */
const PEAK_FRAMES = 8;
const peakDraws = new Int32Array(PEAK_FRAMES);
const peakTris = new Float64Array(PEAK_FRAMES);
let peakSlot = 0;
let shadowDraws = 0, shadowTris = 0;
const peakOf = (a) => { let m = 0; for (const v of a) if (v > m) m = v; return m; };

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  env.tick(dt);

  /* Keep the orbit target on the ground so zoom lands on the terrain. */
  const off = getWorldOffset();
  const tx = controls.target.x + off.x, tz = controls.target.z + off.z;
  const groundY = walkableHeight(tx, tz);
  if (!explore.enabled) {
    controls.target.y += (groundY - controls.target.y) * Math.min(1, dt * 6);
  }

  if (explore.enabled) {
    explore.update(dt);
    /* Collision against the city, once its full build exists. */
    const city = regions.get('sundisk');
    const lvl0 = city && city.levels[0];
    if (lvl0 && lvl0.userData.collisionRects) {
      if (!explore.collision || explore.collision.__src !== lvl0) {
        const gc = new GridCollision(lvl0.userData.collisionRects, city.x, city.z);
        gc.__src = lvl0;
        explore.setCollision(gc);
      }
    } else if (explore.collision) {
      explore.setCollision(null);
    }
    explore.applyToCamera((ax, ay, az, out) => absToScene(ax, ay, az, out));
  } else {
    controls.update();
  }

  /* Floating origin. Anything tracked in scene space and not registered as a
     root has to move with it, and the orbit target is exactly that. */
  const shift = rebase(camera.position);
  if (shift.x !== 0 || shift.z !== 0) {
    controls.target.sub(shift);
    footprints.update(0, shift.x, shift.z);
  }
  footprints.update(dt, 0, 0);

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
  renderer.info.reset();
  terrain.update(camera, viewport.h);

  /* THE GRADE CHAIN, IN ORDER, ONCE A FRAME.

     Everything below update() modifies the environment in place and
     multiplicatively, so the baseline has to be re-established first or the
     grades compound frame over frame. Weather goes before the ash because it
     sets the fog numbers the ash then thickens, and both go before anything
     that reads the environment into a uniform. */
  env.update();
  weather.tick(dt, env);
  const local = weather.applyAt(env, camAbsX, camAbsZ);
  /* Crossing the frontier from Sol Taresh should feel like a colour grade, so
     it is one: a single blend applied to the sky, the haze, the sun and the
     ambient together, driven by how far west the camera is. */
  const ash = applyAshGrade(env, camAbsX);

  updateTerrainUniforms(terrainMaterial, env, off, projK);
  updateDustWall(dustWall, weather, env, camera.position, off, altitude);
  updateRain(rainMesh, env, camera.position, altitude);
  ashVeil.material.uniforms.uTime.value = env.time;
  ashVeil.material.uniforms.uAmount.value = ash;
  ashVeil.visible = ash > 0.02;

  sky.update(camera, env, camera.position.y - SEA_LEVEL);
  sky.uniforms.uCloud.value = Math.max(sky.uniforms.uCloud.value, ash * 0.8);
  updateSunklayUniforms(sunklay, env);

  if (!traffic && canon) {
    traffic = buildTraffic(regionCtx, canon.places);
    overlayRoot.add(traffic);
  }
  if (traffic) {
    updateTraffic(traffic, env);
    /* Traffic is only worth drawing where it can be seen as traffic. */
    traffic.visible = altitude < 90 * KM;
  }

  /* Region content: distance and tier driven, one build per frame. */
  const camAbs = { x: camAbsX, z: camAbsZ };
  regions.update(camAbs, altitude, regionCtx);

  /* The prepass is only worth its terrain pass when the sea is close enough
     for depth to matter. Out in the deep desert the water is not on screen at
     all, and past Regional tier the shoreline is thinner than a pixel. */
  const camCoast = coastDistance(camAbsX, camAbsZ);
  const wantDepth = altitude < 26 * KM && camCoast < 120 * KM;
  lastWantDepth = wantDepth;
  if (wantDepth) renderDepthPass();
  _invViewProj.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
  ocean.update(camera, env, altitude,
    wantDepth ? { depth: depthRT.depthTexture, color: depthRT.texture } : null,
    _invViewProj);

  /* Sun shadows. Two cascades, off at Continental tier and fading out through
     Kingdom, because a nine metre wall casts a sub-pixel shadow from forty
     kilometres up and the pass would be pure cost. */
  /* The crowd does not cast: nine thousand people casting nine thousand
     ankle-height shadows costs a great deal and shows almost nothing. */
  const beforeShadow = renderer.info.render.calls, beforeShadowTris = renderer.info.render.triangles;
  shadows.render(scene, camera, env.sunDir, altitude, env,
    [sky.mesh, ocean.mesh, overlayRoot, footprints.root, dustWall, rainMesh, ...shadowExcluded]);
  shadowDraws = renderer.info.render.calls - beforeShadow;
  shadowTris = renderer.info.render.triangles - beforeShadowTris;
  shadows.apply(terrainMaterial);
  shadows.apply(sunklay);

  /* Heat shimmer is worth a full-screen copy only while it is visible. */
  const glassNear = Math.max(0, 1 - Math.hypot(camAbsX - 530 * KM, camAbsZ + 70 * KM) / (400 * KM));
  const shimmerAmount = env.shimmer * (1 - Math.min(1, altitude / 40000));
  shimmerPass.uniforms.uAmount.value = shimmerAmount;
  shimmerPass.uniforms.uTime.value = env.time;
  shimmerPass.uniforms.uAspect.value = camera.aspect;
  shimmerPass.uniforms.uGlass.value = glassNear;
  if (shimmerAmount > 0.004) {
    shimmerPass.uniforms.uHorizonY.value = horizonNdcY();
    composer.render();
  } else {
    renderer.render(scene, camera);
  }

  /* Region animation that needs the frustum, above all the Shapes, which may
     only move while no part of them is on screen. */
  _regionPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _regionFrustum.setFromProjectionMatrix(_regionPV);
  const glassRegion = regions.get('glass');
  if (glassRegion && glassRegion.group && glassRegion.group.visible) {
    for (const lvl of glassRegion.levels) {
      if (lvl && lvl.visible) updateShapes(lvl, _regionFrustum, shapeRng);
    }
  }
  const khariRegion = regions.get('solkhari');
  if (khariRegion && khariRegion.group && khariRegion.group.visible) {
    for (const lvl of khariRegion.levels) {
      if (!lvl || !lvl.visible) continue;
      lvl.traverse(o => { if (o.userData.pyramids) updatePyramids(o, pyramidState, dt, env); });
    }
  }
  /* Faro's Mirror fills in the Greening and vanishes in the Long Dust. */
  const faros = regions.get('faros');
  if (faros && faros.group && faros.group.visible) {
    for (const lvl of faros.levels) if (lvl && lvl.visible) updateSeasonalLake(lvl, env);
  }

  const cityRegion = regions.get('sundisk');
  if (cityRegion && cityRegion.group && cityRegion.group.visible) {
    for (const lvl of cityRegion.levels) {
      if (!lvl || !lvl.visible) continue;
      lvl.traverse(o => {
        if (o.userData.veil) updateVeil(o, env, wantDepth ? depthRT.texture : null);
        if (o.userData.crowd) {
          updateCrowd(o, env);
          if (!shadowExcluded.includes(o)) shadowExcluded.push(o);
        }
      });
    }
  }

  /* HUD */
  const focusDist = camera.position.distanceTo(controls.target);
  hud.update(altitude, focusDist, camera, viewport);
  if (labels) {
    if (layers.labels) {
      labels.update(camera, off, viewport, tierForAltitude(altitude),
        (x, z) => walkableHeight(x, z));
    } else {
      for (const it of labels.items) labels.hide(it);
    }
  }
  if (overlays) overlays.update(env, altitude);

  if (explore.enabled) {
    const r = explore.readout();
    document.getElementById('exploreRead').innerHTML =
      `Travelled <b style="color:var(--gl)">${r.travelled}</b><br>` +
      `Real distance on foot <b style="color:var(--gl)">${r.onFoot}</b><br>` +
      `Which would take <b style="color:var(--gl)">${r.wouldTake}</b> at walking pace` +
      (r.accelerated ? `<br><span style="color:var(--gold)">Travel accelerator ${r.multiplier}x, not a running speed</span>` : '');
    if (mapView && frames % 6 === 0) {
      mapView.draw(document.getElementById('minimap'),
        { cx: explore.abs.x, cz: explore.abs.z, span: 3 * KM },
        { x: explore.abs.x, z: explore.abs.z, heading: -explore.yaw }, false);
    }
  }

  /* The Golden Gate activation sequence, carried over from v5. */
  if (gateState.active) {
    gateState.t += dt;
    const gr = regions.get('gate');
    if (gr) {
      for (const lvl of gr.levels) {
        if (!lvl || !lvl.visible) continue;
        lvl.traverse(o => {
          if (!o.userData.gate) return;
          const p = Math.min(1, gateState.t / 9);
          o.userData.gate.portal.scale.setScalar(0.2 + p * 0.8);
          o.userData.gate.portal.material.opacity = 0.4 + Math.sin(gateState.t * 4) * 0.2 + p * 0.4;
          o.userData.gate.portal.rotation.z += dt * (0.4 + p * 2.4);
        });
      }
    }
    if (gateState.t > 14) gateState.active = false;
  }

  peakDraws[peakSlot] = renderer.info.render.calls;
  peakTris[peakSlot] = renderer.info.render.triangles;
  peakSlot = (peakSlot + 1) % PEAK_FRAMES;

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
    const pk = peakOf(peakDraws);
    hud.dev(
      `<b>fps</b> ${fps.toFixed(0)}   <b>draws</b> ${info.calls} peak ${pk}   <b>tris</b> ${(peakOf(peakTris) / 1000).toFixed(0)}k\n` +
      `<b>shadow pass</b> ${shadowDraws} draws ${(shadowTris / 1000).toFixed(0)}k tris\n` +
      `<b>chunks</b> vis ${t.visible} res ${t.resident} q ${t.queued} depth ${t.deepest}\n` +
      `<b>alt</b> ${altitude.toFixed(0)} m  <b>near/far</b> ${nf.near.toFixed(1)} / ${(nf.far / 1000).toFixed(0)}k\n` +
      `<b>regions</b> active ${regions.stats.active} built ${regions.stats.built}  <b>ash</b> ${ash.toFixed(2)}\n` +
      `<b>dust</b> ${local.dust.toFixed(2)}  <b>fog</b> ${local.fog.toFixed(2)}  <b>flood</b> ${env.flood.toFixed(2)}  <b>front</b> ${(weather.frontOffset(camAbsX, camAbsZ) / 1000).toFixed(0)} km\n` +
      `<b>origin</b> ${(off.x / 1000).toFixed(1)}, ${(off.z / 1000).toFixed(1)} km`);
    if (pk > 900) console.warn(`draw call budget exceeded: ${pk}`);
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
  /* The worst frame of the last eight, not whichever one the caller landed
     on. See the note at PEAK_FRAMES. */
  draws: peakOf(peakDraws),
  triangles: peakOf(peakTris),
  frameDraws: renderer.info.render.calls,
  shadowDraws,
  shadowTris,
  depthPass: lastWantDepth,
  terrain: { ...terrain.stats },
  altitude: camera.position.y,
  offset: { ...getWorldOffset() },
});

/* Where the triangles actually are, grouped by the nearest named ancestor.
   Counting what a pass draws is the only way to tell a terrain problem from a
   city problem, and the two want opposite fixes. */
window.__triBreakdown = () => {
  const out = {};
  scene.traverseVisible(o => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const per = (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3;
    const n = o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? g.instanceCount : 1);
    let a = o, name = o.name;
    while (a && !name) { a = a.parent; name = a ? a.name : ''; }
    out[name || 'unnamed'] = (out[name || 'unnamed'] || 0) + per * n;
  });
  return Object.fromEntries(Object.entries(out).sort((p, q) => q[1] - p[1]).slice(0, 12));
};

window.__flyTo = flyTo;
window.__regions = () => ({ ...regions.stats });
window.__showPlace = (id) => { const p = placesById.get(id); if (p) { showPlace(p); flyTo(p.x, p.z, PRESET_ALT[id] || 4 * KM); } return !!p; };
window.__activatePyramids = () => { pyramidState.active = true; pyramidState.phase = 0; pyramidState.timer = 0; };
window.__explore = explore;
window.__frames = () => frames;
window.__loopAlive = () => ({ frames, t: performance.now() });
window.__enterExplore = (x, z) => enterExplore(x, z);
window.__leaveExplore = () => leaveExplore();
window.__layers = () => ({ ...layers });
window.__ashBlend = () => env.ashBlend || 0;
window.__scene = scene;
window.__shadowStrength = () => shadows.strength;
window.__weather = () => ({
  front: weather.frontDistance,
  offsetHere: weather.frontOffset(camera.position.x + getWorldOffset().x,
                                  camera.position.z + getWorldOffset().z),
  dust: env.localDust, fog: env.localFog, flood: env.flood,
  wallVisible: dustWall.visible,
});
window.__setFront = (m) => { weather.frontDistance = m; };
window.__dustAt = (x, z) => weather.dustAt(x, z);
window.__fogAt = (x, z) => weather.fogAt(x, z);
window.__coastDistance = (x, z) => coastDistance(x, z);
/* The axis the front is a surface of constant value of, so a test can place a
   point a known distance ahead of or behind the storm. */
window.__WIND = { x: WIND.dir.x, z: WIND.dir.z };
window.__setLayer = (k, v) => { layers[k] = v; if (overlays) overlays.setLayers(layers); };
window.__canonPlaces = () => (canon ? canon.places.map(p => ({ id: p.id, name: p.name, x: p.x, z: p.z, tags: p.tags })) : []);
window.__env = env;
window.__camera = camera;
window.__terrainHeight = terrainHeight;
window.__starDunes = () => STAR_DUNES.map(d => ({ x: d.x, z: d.z, h: d.height }));
window.__tiers = TIERS;
window.__ready = () => booted;
window.__terrainSettled = () => terrain.isSettled();

/* Read back real pixels so shading can be calibrated against numbers rather
   than against an impression of a screenshot. Renders first, because the
   drawing buffer is not preserved between tasks. */
window.__setDebug = (n) => { terrainMaterial.uniforms.uDebug.value = n | 0; };
window.__oceanDebug = (n) => { ocean.uniforms.uDebugFlat.value = n | 0; };
window.__testPlane = () => {
  const g = new THREE.PlaneGeometry(40000, 40000);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff00ff }));
  m.position.set(camera.position.x, SEA_LEVEL, camera.position.z);
  scene.add(m);
  return 'added';
};
window.__oceanFlag = (k, v) => { ocean.material[k] = v; ocean.material.needsUpdate = true; };
window.__probeAt = (px, py) => {
  /* What is actually at this pixel: raycast the terrain chunks and report the
     hit height, so the depth question can be settled with a number. */
  const ndc = new THREE.Vector2((px / viewport.w) * 2 - 1, -(py / viewport.h) * 2 + 1);
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, camera);
  rc.far = camera.far;
  const hits = rc.intersectObject(terrainRoot, true);
  return hits.length ? { y: hits[0].point.y, dist: hits[0].distance } : null;
};
window.__oceanOnly = () => {
  terrainRoot.visible = false;
  renderer.info.reset();
  renderer.render(scene, camera);
  const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  const gl = renderer.getContext();
  const dpr = renderer.getPixelRatio();
  const buf = new Uint8Array(4);
  gl.readPixels(Math.round(viewport.w / 2 * dpr), Math.round(viewport.h / 2 * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  terrainRoot.visible = true;
  const props = renderer.properties.get(ocean.material);
  return { calls, tris, pixel: [buf[0], buf[1], buf[2]],
           program: !!(props && props.currentProgram),
           diagnostics: props && props.currentProgram ? props.currentProgram.diagnostics || null : null };
};
window.__oceanBasic = (on) => {
  if (on) {
    ocean.mesh.userData.realMat = ocean.mesh.material;
    ocean.mesh.material = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
  } else if (ocean.mesh.userData.realMat) {
    ocean.mesh.material = ocean.mesh.userData.realMat;
  }
};
window.__oceanSrc = () => ocean.material.vertexShader;
window.__oceanVerts = () => {
  const a = ocean.mesh.geometry.getAttribute('position');
  const idx = ocean.mesh.geometry.getIndex();
  return {
    count: a.count, itemSize: a.itemSize,
    first: Array.from(a.array.slice(0, 12)),
    mid: Array.from(a.array.slice(3 * 60 * 129, 3 * 60 * 129 + 12)),
    indexCount: idx ? idx.count : 0,
    indexType: idx ? idx.array.constructor.name : 'none',
    maxIndex: idx ? Math.max(...Array.from(idx.array.slice(-30))) : -1,
    drawRange: ocean.mesh.geometry.drawRange.count,
  };
};
window.__oceanInfo = () => ({
  visible: ocean.mesh.visible,
  hasDepth: ocean.uniforms.uHasDepth.value,
  radius: ocean.uniforms.uRadius.value,
  waveScale: ocean.uniforms.uWaveScale.value,
  centre: ocean.uniforms.uCentre.value.toArray(),
  seaLevel: ocean.uniforms.uSeaLevel.value,
  camY: camera.position.y,
  programOk: !!ocean.material.program,
});
window.__samplePixels = (points) => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const dpr = renderer.getPixelRatio();
  const buf = new Uint8Array(4);
  return points.map(([px, py]) => {
    gl.readPixels(Math.round(px * dpr), Math.round((viewport.h - py) * dpr), 1, 1,
                  gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return [buf[0], buf[1], buf[2]];
  });
};
