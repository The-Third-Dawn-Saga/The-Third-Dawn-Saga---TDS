/* ============================================================================
   life.js  ::  crowds, caravans, sand sailers, boats, Sun Eaters.

   All of it instanced, and all of the motion computed per instance in the
   vertex shader from a seed and the clock. Thousands of people cost one draw
   call and no CPU work per frame, which is the only way a city of a million
   and a half can have anyone in it.

   The crowd flows rather than mills: people walk the ring streets at about
   1.2 m/s, which is the same order as the player's 1.4, so a walker is
   overtaking and being overtaken rather than moving through statues. Density
   follows the district and the time of day, because the Grand Market opens at
   dawn and closes at noon with the drums.
   ========================================================================= */

import * as THREE from 'three';
import { CITY_GROUND_Y, walkableHeight } from '../terrain/height.js';
import { makeRng, seedFrom } from '../world.js';
import { KM } from '../units.js';

const CROWD_VERT = /* glsl */`
precision highp float;
attribute float aSeed;
attribute float aDistrict;   // 0 inner, 1 market, 2 outer, 3 commons

uniform float uTime;
uniform float uDensity;      // time-of-day scaled
uniform float uMarketOpen;   // 1 at dawn, 0 after the noon drums
uniform vec3 uGround;

varying float vShade;
varying float vCull;

float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

void main(){
  /* The instance matrix carries the home position; the walk is derived. */
  vec3 home = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float s = aSeed;

  float r = length(home.xz);
  float baseA = atan(home.z, home.x);
  float dir = h11(s * 3.3) > 0.5 ? 1.0 : -1.0;
  /* 1.2 m/s along the ring, which at radius r is 1.2/r radians a second. */
  float ang = baseA + dir * uTime * (1.2 / max(r, 25.0));
  float wander = sin(uTime * 0.6 + s * 40.0) * 2.2;
  vec3 p = vec3(cos(ang) * (r + wander), home.y, sin(ang) * (r + wander));

  /* A walk cycle: a small bob, out of phase per person. */
  float bob = abs(sin(uTime * 2.4 + s * 60.0)) * 0.07;

  /* Density culling by seed, so thinning the crowd is free. */
  float keep = h11(s * 7.7);
  float density = uDensity;
  if (aDistrict > 0.5 && aDistrict < 1.5) density *= mix(0.25, 1.4, uMarketOpen);
  vCull = keep < density ? 1.0 : 0.0;

  vec3 local = position;
  local.y += bob;
  vec4 wp = modelMatrix * vec4(p + local, 1.0);
  vShade = 0.55 + 0.45 * h11(s * 11.3);
  if (vCull < 0.5) wp.y -= 1e6;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CROWD_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uAmbient;
varying float vShade;
varying float vCull;
void main(){
  if (vCull < 0.5) discard;
  vec3 c = mix(uColorA, uColorB, vShade) * (uAmbient + vec3(0.55));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function crowdMaterial() {
  const uniforms = {
    uTime: { value: 0 },
    uDensity: { value: 0.7 },
    uMarketOpen: { value: 1 },
    uGround: { value: new THREE.Vector3() },
    uColorA: { value: new THREE.Color('#4a3b2a') },
    uColorB: { value: new THREE.Color('#c8b48a') },
    uAmbient: { value: new THREE.Color(0.3, 0.3, 0.32) },
  };
  const m = new THREE.ShaderMaterial({
    uniforms, vertexShader: CROWD_VERT, fragmentShader: CROWD_FRAG,
  });
  m.userData.ownedByRegion = true;
  m.name = 'crowd';
  return m;
}

/**
 * @param {object} city region record for Sundisk
 * @param {number} count how many figures
 */
export function buildCrowd(cityRings, count = 9000) {
  const rng = makeRng(seedFrom('sundisk-crowd'));
  /* A person is a 0.45 m box 1.7 m tall at this distance. Detail beyond that
     is invisible and would cost geometry for nothing. */
  const geo = new THREE.BoxGeometry(0.45, 1.7, 0.3);
  geo.translate(0, 0.85, 0);

  const mat = crowdMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4();
  const seeds = new Float32Array(count);
  const districts = new Float32Array(count);

  /* Where people are is where the city is dense: the market first, then the
     outer ring, then the commons, then the inner ring, which has the fewest
     people and the most floor space per person. */
  const bands = [
    { r0: 200, r1: cityRings.inner, share: 0.06, d: 0 },
    { r0: cityRings.inner, r1: 2100, share: 0.30, d: 1 },
    { r0: 2100, r1: cityRings.middle, share: 0.16, d: 1 },
    { r0: cityRings.middle, r1: cityRings.outer, share: 0.32, d: 2 },
    { r0: cityRings.outer, r1: cityRings.commons, share: 0.16, d: 3 },
  ];

  let i = 0;
  for (const b of bands) {
    const n = Math.round(count * b.share);
    for (let k = 0; k < n && i < count; k++, i++) {
      const a = rng() * Math.PI * 2;
      const rr = b.r0 + Math.sqrt(rng()) * (b.r1 - b.r0);
      m4.makeTranslation(Math.cos(a) * rr, CITY_GROUND_Y, Math.sin(a) * rr);
      mesh.setMatrixAt(i, m4);
      seeds[i] = i * 0.6180339887 % 1 * 977 + i * 0.211;
      districts[i] = b.d;
    }
  }
  for (; i < count; i++) {
    m4.makeTranslation(0, -1e6, 0);
    mesh.setMatrixAt(i, m4);
    seeds[i] = i;
    districts[i] = 3;
  }

  mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  mesh.geometry.setAttribute('aDistrict', new THREE.InstancedBufferAttribute(districts, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.name = 'sundisk-crowd';
  mesh.userData.crowd = true;
  return mesh;
}

/** Density by hour: the market opens at dawn and the drums close it at noon. */
export function updateCrowd(mesh, env) {
  if (!mesh || !mesh.material.uniforms) return;
  const u = mesh.material.uniforms;
  const h = env.timeOfDay;
  /* Nobody is out at three in the morning and everybody is out at eight. */
  const day = h < 4.5 ? 0.06 : h < 6 ? 0.25 : h < 11 ? 1.0
            : h < 15 ? 0.42 : h < 19.5 ? 0.85 : h < 22 ? 0.5 : 0.15;
  u.uDensity.value = day;
  u.uMarketOpen.value = (h >= 5.5 && h <= 12.2) ? 1 : 0;
  u.uTime.value = env.time;
  u.uAmbient.value.copy(env.ambient);
}

/* ---------------------------------------------------------------------------
   CARAVANS, SAND SAILERS, BOATS AND SUN EATERS

   Everything that moves between places. Same trick: one instanced mesh per
   kind, motion derived in the shader from a seed and the clock, so a hundred
   camels on a road cost one draw call.
   ------------------------------------------------------------------------ */

const TRAVELLER_VERT = /* glsl */`
precision highp float;
attribute float aSeed;
uniform float uTime;
uniform float uSpeed;        // metres a second
uniform float uSpan;         // route length
uniform vec3 uFrom;
uniform vec3 uTo;
uniform float uHover;
varying float vShade;
float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main(){
  float s = aSeed;
  float t = fract(h11(s) + uTime * uSpeed / max(uSpan, 1.0));
  vec3 base = mix(uFrom, uTo, t);
  /* Spread across the road, and string out along it. */
  vec3 dir = normalize(uTo - uFrom + vec3(1e-5));
  vec3 side = normalize(vec3(-dir.z, 0.0, dir.x));
  base += side * (h11(s * 3.7) - 0.5) * 26.0;
  base.y += uHover + sin(uTime * 3.0 + s * 20.0) * uHover * 0.25;

  float ang = atan(dir.x, dir.z);
  float c = cos(ang), sn = sin(ang);
  vec3 p = vec3(position.x * c + position.z * sn, position.y, -position.x * sn + position.z * c);

  vShade = 0.6 + 0.4 * h11(s * 9.1);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(base + p, 1.0);
}
`;
const TRAVELLER_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform vec3 uAmbient;
varying float vShade;
void main(){
  gl_FragColor = vec4(uColor * vShade * (uAmbient + vec3(0.6)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * @param {object} opts {geometry, count, from, to, speed, color, hover}
 */
export function buildTravellers(opts) {
  const count = opts.count;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: opts.speed },
      uSpan: { value: new THREE.Vector3().subVectors(opts.to, opts.from).length() },
      uFrom: { value: opts.from.clone() },
      uTo: { value: opts.to.clone() },
      uHover: { value: opts.hover || 0 },
      uColor: { value: new THREE.Color(opts.color) },
      uAmbient: { value: new THREE.Color(0.3, 0.3, 0.3) },
    },
    vertexShader: TRAVELLER_VERT,
    fragmentShader: TRAVELLER_FRAG,
  });
  mat.userData.ownedByRegion = true;

  const mesh = new THREE.InstancedMesh(opts.geometry, mat, count);
  const m4 = new THREE.Matrix4();
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    m4.identity();
    mesh.setMatrixAt(i, m4);
    seeds[i] = (i * 0.6180339887) % 1 * 983 + i * 0.317;
  }
  mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.traveller = true;
  return mesh;
}

/** Camel caravans, sand sailers and Sun Eaters on the roads out of Sundisk. */
export function buildTraffic(ctx, places) {
  const grp = new THREE.Group();
  grp.name = 'traffic';

  const camel = new THREE.BoxGeometry(2.3, 2.0, 0.9);
  camel.translate(0, 1.0, 0);
  const sailer = new THREE.ConeGeometry(2.2, 7.0, 4);
  sailer.rotateZ(Math.PI / 2);
  sailer.translate(0, 2.6, 0);
  const eater = new THREE.BoxGeometry(4.6, 0.9, 1.9);
  eater.translate(0, 0.6, 0);

  const P = (id) => {
    const p = places.find(q => q.id === id);
    return p ? new THREE.Vector3(p.x, walkableHeight(p.x, p.z), p.z) : null;
  };

  const routes = [
    ['sundisk', 'tawari', camel, 60, 1.11, '#8a6a44', 0],       // 4 km/h
    ['sundisk', 'mirin', camel, 60, 1.11, '#8a6a44', 0],
    ['sundisk', 'veth', camel, 40, 1.11, '#8a6a44', 0],
    ['sundisk', 'ashara', sailer, 26, 18.0, '#b08a56', 0],      // 65 km/h
    ['mirin', 'taresh', sailer, 20, 18.0, '#b08a56', 0],
    ['sundisk', 'solkhari', eater, 10, 32.0, '#c4a020', 0.6],   // 115 km/h
  ];

  for (const [a, b, geo, count, speed, color, hover] of routes) {
    const from = P(a), to = P(b);
    if (!from || !to) continue;
    /* Positions are absolute, and the group is a registered root child, so
       subtract nothing here: the traveller shader works in the group's space
       and the group carries the floating origin. */
    grp.add(buildTravellers({ geometry: geo, count, from, to, speed, color, hover }));
  }
  return grp;
}

export function updateTraffic(grp, env) {
  grp.traverse(o => {
    if (!o.userData.traveller) return;
    o.material.uniforms.uTime.value = env.time;
    o.material.uniforms.uAmbient.value.copy(env.ambient);
  });
}
