/* ============================================================================
   rites.js  ::  the things Sundisk does on a clock.

   THE ROOF MIRRORS, Part 4.2. The Great Sun Temple's golden roof mirrors are
   asked to be functional rather than decorative, driving a moving light pool
   on nearby district roofs as the sun angle changes. So they are: each mirror
   has a normal, the sun is reflected about it, the reflected ray is marched
   down to the height of the surrounding roofline, and the pool is put where
   it lands. Nothing is keyframed. Move the time-of-day slider and the pools
   sweep across the quarter because the geometry says they do, and at noon,
   with the sun nearly overhead, they collapse back under the temple itself.

   THE DRUMS, Part 4.6. Four drum towers fire the market close at solar noon.
   The ring each strike sends out travels at the speed of sound, which is the
   honest thing to do in a build whose whole premise is that distances are
   real: from the tower to the far side of the Grand Market is about four
   seconds, and you can watch it cross.

   THE GATE QUEUES, Part 4.6. Traffic actually queues, and it queues longest
   at the eastern gate at dawn, because that is when the market opens and when
   the caravans that camped outside the wall overnight come in.

   The market's own closing curve lives here too, so the crowd and the drums
   are reading one number rather than two that have to be kept in agreement.
   ========================================================================= */

import * as THREE from 'three';
import { InstanceSet, geometryKit } from './kit.js';
import { goldRatio } from './materials.js';
import { CITY_GROUND_Y } from '../terrain/height.js';

const G = CITY_GROUND_Y;

/* The roofline the pools land on. Sundisk's ordinary courtyard houses run to
   two storeys, so the district roofs around the temple sit around here. */
const ROOF_Y = G + 8.5;

/* ---------------------------------------------------------------------------
   THE MARKET CLOCK

   One curve, read by the crowd and by the drums. The market opens at dawn and
   the drums close it at solar noon, so the drums are loud across the closing
   and quiet either side of it.
   ------------------------------------------------------------------------ */

/** 1 while the Grand Market is trading, 0 once the drums have closed it. */
export function marketOpen(h) {
  if (h < 5.5) return 0;
  if (h <= 11.9) return 1;
  return Math.max(0, 1 - (h - 11.9) / 0.5);     // shuts over the half hour
}

/** How hard the drum towers are being struck. Peaks at solar noon. */
export function drumStrength(h) {
  const d = Math.abs(h - 12);
  return Math.max(0, 1 - d / 0.55);
}

/* ---------------------------------------------------------------------------
   THE ROOF MIRRORS
   ------------------------------------------------------------------------ */

const POOL_VERT = /* glsl */`
precision highp float;
attribute float aGlow;
varying vec2 vUv;
varying float vGlow;
void main(){
  vUv = uv;
  vGlow = aGlow;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const POOL_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
varying vec2 vUv;
varying float vGlow;
void main(){
  if (vGlow <= 0.004) discard;
  /* A pool of light has a bright core and a long soft edge, because the
     mirror is a finite plate and its penumbra is wide by the time the beam
     has crossed a couple of hundred metres of city. */
  float r = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - r), 2.2);
  gl_FragColor = vec4(uColor * (0.35 + 0.65 * a), a * vGlow);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Golden plates along the temple roof, and the pool each one throws.
 *
 * @param {{x:number,z:number,w:number,d:number,h:number}} TEMPLE the temple's
 *   own footprint, passed in rather than repeated here, because a mirror that
 *   is not on the roof is not a mirror.
 */
export function buildRoofMirrors(material, TEMPLE) {
  const geo = geometryKit();
  const grp = new THREE.Group();
  grp.name = 'temple-roof-mirrors';

  /* A CROWN OF NEARLY UPRIGHT PLATES, AND WHY THEY HAVE TO BE UPRIGHT.

     The obvious design, plates lying almost flat on the roof, does not work,
     and the reason is worth writing down because it is not obvious until you
     do the algebra. For a plate canted by an angle a in the sun's vertical
     plane and a sun at elevation e, the reflected ray's vertical component
     comes out as sin(2a + e). A gently canted plate therefore sends the beam
     UP, into the sky, at every hour of the day. To put light on a roof the
     plate has to be nearly upright: 2a + e past a half turn.

     So the mirrors stand up, in a fan from due east to due west, canted from
     forty-eight degrees at the middle of the row to eighty-eight at its ends.
     Between them there is always one roughly facing the sun. Early and late
     the pools reach seventy metres into the quarter; at noon, with the sun
     almost overhead, they collapse back under the temple itself. */
  const plates = new InstanceSet(geo.house, material, 12);
  const mirrors = [];
  const n = 9;
  const CANT_MID = 48, CANT_END = 88;               // degrees off horizontal
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);                          // 0 at the east end
    const phi = u * Math.PI;                        // faces due east to due west
    const cant = (CANT_MID + (CANT_END - CANT_MID) * Math.abs(u - 0.5) * 2) * Math.PI / 180;
    const px = TEMPLE.x + (u - 0.5) * (TEMPLE.w - 18);
    const pz = TEMPLE.z;
    /* A thin upright slab facing along phi. The instance kit only turns about
       Y, which is all an upright plate needs. */
    plates.add(px, G + TEMPLE.h, pz, 7.0, 3.2, 0.35, Math.PI / 2 - phi,
      goldRatio(Math.hypot(px, pz), 1.0, 1.0), 1.0, 0.02);
    mirrors.push({
      pos: new THREE.Vector3(px, G + TEMPLE.h + 1.6, pz),
      normal: new THREE.Vector3(
        Math.sin(cant) * Math.cos(phi), Math.cos(cant), Math.sin(cant) * Math.sin(phi)).normalize(),
    });
  }
  const pm = plates.build('temple-mirror-plates');
  if (pm) grp.add(pm);

  const disc = new THREE.PlaneGeometry(1, 1);
  disc.rotateX(-Math.PI / 2);
  const glow = new Float32Array(n);
  const pools = new THREE.InstancedMesh(disc, new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffd68a') } },
    vertexShader: POOL_VERT, fragmentShader: POOL_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), n);
  pools.geometry.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 1));
  pools.name = 'temple-light-pools';
  pools.frustumCulled = false;
  pools.renderOrder = 4;
  grp.add(pools);

  grp.userData.roofMirrors = { mirrors, pools, glow };
  return grp;
}

const _refl = new THREE.Vector3();
const _mat = new THREE.Matrix4();

/** Put each pool where its mirror is actually throwing the sun this hour. */
export function updateRoofMirrors(grp, env) {
  const rm = grp.userData.roofMirrors;
  if (!rm) return;
  const { mirrors, pools, glow } = rm;
  const s = env.sunDir;
  let any = 0;

  for (let i = 0; i < mirrors.length; i++) {
    const m = mirrors[i];
    const catches = m.normal.dot(s);              // how square the plate is to the sun
    /* Reflected direction: d = 2(n.s)n - s. */
    _refl.copy(m.normal).multiplyScalar(2 * catches).sub(s);

    let g = 0, px = m.pos.x, pz = m.pos.z, radius = 9;
    if (catches > 0.02 && s.y > 0.02 && _refl.y < -0.02) {
      const t = (ROOF_Y - m.pos.y) / _refl.y;
      const dx = _refl.x * t, dz = _refl.z * t;
      const reach = Math.hypot(dx, dz);
      px = m.pos.x + dx; pz = m.pos.z + dz;
      /* A pool spreads as it travels, and past a few hundred metres it has
         spread into nothing worth drawing. */
      radius = 9 + reach * 0.09;
      g = catches * Math.min(1, s.y * 3.5) * Math.max(0, 1 - reach / 420);
    }
    glow[i] = g;
    any += g;
    _mat.makeScale(radius * 2, 1, radius * 2);
    _mat.setPosition(px, ROOF_Y + 0.35, pz);
    pools.setMatrixAt(i, _mat);
  }
  pools.instanceMatrix.needsUpdate = true;
  pools.geometry.attributes.aGlow.needsUpdate = true;
  pools.visible = any > 0.004;
}

/* ---------------------------------------------------------------------------
   THE NOON DRUMS
   ------------------------------------------------------------------------ */

/* The quad is a little wider than the ring it carries, or the front lands
   exactly on the geometry edge and frays. */
const RING_PAD = 1.15;

const RING_VERT = /* glsl */`
precision highp float;
attribute float aRadius;
attribute float aAlpha;
varying vec2 vUv;
varying float vRadius;
varying float vAlpha;
void main(){
  vUv = uv; vRadius = aRadius; vAlpha = aAlpha;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform float uBand;      // ring thickness in metres, constant as it expands
varying vec2 vUv;
varying float vRadius;
varying float vAlpha;
void main(){
  if (vAlpha <= 0.004) discard;
  float r = length(vUv - 0.5) * 2.0 * vRadius * ${RING_PAD};   // metres from the tower
  float d = abs(r - vRadius);
  float a = (1.0 - smoothstep(0.0, uBand, d)) * vAlpha;
  if (a <= 0.004) discard;
  gl_FragColor = vec4(uColor, a * 0.55);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* Sound goes 343 metres a second, and in a world built on real distances the
   ring has no business going any faster. Tower to the far side of the Grand
   Market is about four seconds. */
export const SOUND_SPEED = 343;
const RING_MAX = 1400;
const BEAT = RING_MAX / SOUND_SPEED + 1.9;      // one strike, then a pause

/**
 * @param {Array<{x:number,z:number}>} drums tower positions from the wall build
 */
export function buildDrumRings(drums) {
  const disc = new THREE.PlaneGeometry(1, 1);
  disc.rotateX(-Math.PI / 2);
  const n = drums.length;
  const radii = new Float32Array(n);
  const alphas = new Float32Array(n);
  const mesh = new THREE.InstancedMesh(disc, new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#e8c98a') },
      uBand: { value: 26 },
    },
    vertexShader: RING_VERT, fragmentShader: RING_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), n);
  mesh.geometry.setAttribute('aRadius', new THREE.InstancedBufferAttribute(radii, 1));
  mesh.geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alphas, 1));
  mesh.name = 'drum-rings';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  mesh.userData.drumRings = { drums, radii, alphas };
  return mesh;
}

/* ---------------------------------------------------------------------------
   THE GATE QUEUES

   Part 4.6: traffic actually queues at dawn. The queue is longest at the
   eastern gate, because that is the hour the market opens and the caravans
   that camped outside the wall overnight come in.

   Every figure in the line is one instance holding a gate index and a slot in
   the queue. Its position along the approach road is derived in the shader
   from that slot and the clock, so the whole line shuffles forward, somebody
   passes through the barbican, and somebody joins at the back, for one draw
   call and no CPU work at all.
   ------------------------------------------------------------------------ */

const QUEUE_SPACING = 5.2;          // metres between one party and the next
const QUEUE_SLOTS = 34;             // longest a line ever gets
const QUEUE_CREEP = 0.42;           // metres a second, which is a queue

const QUEUE_VERT = /* glsl */`
precision highp float;
attribute float aSeed;
attribute float aSlot;        // place in the line, 0 at the gate
attribute vec4 aGate;         // xy outward unit normal, z wall radius, w gate index

uniform float uTime;
uniform float uQueue;         // 0 to 1, how long the lines are this hour
uniform vec4 uGateShare;      // per-gate multiplier, east first
uniform float uBaseY;

varying float vShade;
varying float vCull;
float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

void main(){
  vec2 outward = normalize(aGate.xy);
  vec2 across = vec2(-outward.y, outward.x);
  float gi = aGate.w;
  float share = gi < 0.5 ? uGateShare.x : gi < 1.5 ? uGateShare.y
              : gi < 2.5 ? uGateShare.z : uGateShare.w;

  /* The line creeps forward and wraps, so nobody stands still for an hour. */
  float creep = fract(uTime * ${QUEUE_CREEP.toFixed(3)} / ${QUEUE_SPACING.toFixed(3)});
  float slot = aSlot + creep;
  float len = uQueue * share * ${QUEUE_SLOTS}.0;
  vCull = slot < len ? 1.0 : 0.0;

  /* Two files abreast, offset a little so it reads as a queue rather than as
     a pair of dotted lines. */
  float file = h11(aSeed * 5.9) > 0.5 ? 1.0 : -1.0;
  float jitter = (h11(aSeed * 13.1) - 0.5) * 1.5;
  float along = aGate.z + 34.0 + slot * ${QUEUE_SPACING.toFixed(3)};
  vec2 xz = outward * along + across * (file * 2.6 + jitter);

  /* Standing about, with a shuffle forward every time the line moves. */
  float fidget = sin(uTime * 1.1 + aSeed * 30.0) * 0.09;
  vec3 local = position;
  local.y += abs(sin(uTime * 2.0 + aSeed * 61.0)) * 0.05;
  vec4 wp = modelMatrix * vec4(vec3(xz.x + fidget, uBaseY, xz.y) + local, 1.0);
  vShade = 0.5 + 0.5 * h11(aSeed * 11.3);
  if (vCull < 0.5) wp.y -= 1e6;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const QUEUE_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uAmbient;
varying float vShade;
varying float vCull;
void main(){
  if (vCull < 0.5) discard;
  gl_FragColor = vec4(mix(uColorA, uColorB, vShade) * (uAmbient + vec3(0.55)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** How long the lines are at this hour. Dawn is the whole point. */
export function queueLength(h) {
  if (h < 4.2 || h > 20.5) return 0.06;           // the night gate, barely used
  if (h < 7.6) return Math.min(1, 0.25 + (h - 4.2) / 2.2);   // builds to dawn peak
  if (h < 11.5) return 0.62;
  if (h < 16) return 0.34;                        // nobody travels in the heat
  return 0.5;
}

/**
 * @param {Array<{a:number,service:boolean}>} gates gate bearings from the wall
 * @param {number} wallRadius metres
 */
export function buildGateQueues(gates, wallRadius) {
  const cardinal = gates.filter(g => !g.service).slice(0, 4);
  if (!cardinal.length) return null;

  const body = new THREE.BoxGeometry(0.52, 1.72, 0.36);
  body.translate(0, 0.86, 0);
  const n = cardinal.length * QUEUE_SLOTS * 2;
  const seeds = new Float32Array(n);
  const slots = new Float32Array(n);
  const gate = new Float32Array(n * 4);
  let k = 0;
  for (let g = 0; g < cardinal.length; g++) {
    const a = cardinal[g].a;
    for (let i = 0; i < QUEUE_SLOTS * 2; i++) {
      seeds[k] = k * 0.6180339887 * 97 + g * 13.7;
      slots[k] = Math.floor(i / 2);
      gate[k * 4] = Math.cos(a);
      gate[k * 4 + 1] = Math.sin(a);
      gate[k * 4 + 2] = wallRadius;
      gate[k * 4 + 3] = g;
      k++;
    }
  }

  const geom = new THREE.InstancedBufferGeometry();
  geom.index = body.index;
  geom.attributes.position = body.attributes.position;
  geom.attributes.normal = body.attributes.normal;
  geom.attributes.uv = body.attributes.uv;
  geom.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geom.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slots, 1));
  geom.setAttribute('aGate', new THREE.InstancedBufferAttribute(gate, 4));
  geom.instanceCount = n;
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), wallRadius + 400);

  const mesh = new THREE.Mesh(geom, new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uQueue: { value: 0 },
      uGateShare: { value: new THREE.Vector4(1, 0.55, 0.55, 0.55) },
      uBaseY: { value: G },
      uColorA: { value: new THREE.Color('#6d5a44') },
      uColorB: { value: new THREE.Color('#a8906c') },
      uAmbient: { value: new THREE.Color(0.2, 0.2, 0.2) },
    },
    vertexShader: QUEUE_VERT, fragmentShader: QUEUE_FRAG,
  }));
  mesh.name = 'gate-queues';
  mesh.userData.gateQueues = true;
  /* The east gate is the long one. Canon: the caravans that camped outside
     come in at dawn, and the market opens at dawn. */
  const east = cardinal.findIndex(g => Math.abs(Math.cos(g.a) - 1) < 0.2);
  if (east >= 0) {
    const share = mesh.material.uniforms.uGateShare.value;
    share.set(0.55, 0.55, 0.55, 0.55);
    share.setComponent(east, 1.0);
  }
  return mesh;
}

export function updateGateQueues(mesh, env) {
  const u = mesh.material.uniforms;
  u.uTime.value = env.time;
  u.uQueue.value = queueLength(env.timeOfDay);
  u.uAmbient.value.copy(env.ambient);
}

export function updateDrumRings(mesh, env) {
  const dr = mesh.userData.drumRings;
  if (!dr) return;
  const strength = drumStrength(env.timeOfDay);
  mesh.visible = strength > 0.01;
  if (!mesh.visible) return;

  const { drums, radii, alphas } = dr;
  for (let i = 0; i < drums.length; i++) {
    /* The four towers do not strike together. A quarter beat apart is enough
       that from the middle of the city you hear them come round. */
    const phase = ((env.time + i * BEAT * 0.25) % BEAT) / BEAT;
    const r = Math.max(6, phase * BEAT * SOUND_SPEED);
    radii[i] = r;
    /* The front loses energy as it spreads, which is most of why a drum is
       only heard so far. */
    alphas[i] = strength * Math.max(0, 1 - r / RING_MAX);
    _mat.makeScale(r * 2 * RING_PAD, 1, r * 2 * RING_PAD);
    _mat.setPosition(drums[i].x, G + 1.2, drums[i].z);
    mesh.setMatrixAt(i, _mat);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.geometry.attributes.aRadius.needsUpdate = true;
  mesh.geometry.attributes.aAlpha.needsUpdate = true;
}
