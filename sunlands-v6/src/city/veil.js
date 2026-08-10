/* ============================================================================
   veil.js  ::  the Sunward Veil.  [PROPOSED, see O-5]

   Canon supplies the mechanism: Angel Stone powered sand barriers, already
   used along the canal corridors, glowing faintly gold at their posts and
   visible at night as strings of amber light crossing the desert. This
   extends that locked technology to the city wall. The NAME is proposed and
   is tagged as such everywhere it appears; the technology is not.

     posts        one every 60 m in the Great Wall's crenellations
     the plane    a vertical shimmer rising 40 m above the wall, refractive
                  rather than opaque, near invisible head on and gold at a
                  grazing angle
     deflection   airborne sand that reaches the plane is thrown up and out.
                  Real particle behaviour, not a decal: during the Harmattan
                  the Commons outside are buried while the Outer Ring behind
                  the Veil stays clear, and that contrast is the whole
                  political point of the technology.
     at night     the post stones glow amber, giving the city a ring of light
                  34 km around.
     inner ring   a second, denser Veil at 1,200 m, because the nobility do
                  not share air with the market either.
   ========================================================================= */

import * as THREE from 'three';
import { CITY_GROUND_Y } from '../terrain/height.js';
import { InstanceSet, geometryKit } from './kit.js';
import { CITY } from './sundisk.js';
import { GLSL_NOISE } from '../shaders/common.js';

const G = CITY_GROUND_Y;
export const POST_SPACING = 60;
export const VEIL_HEIGHT = 40;

/* ---------------------------------------------------------------------------
   THE SHIMMER PLANE
   ------------------------------------------------------------------------ */

const VEIL_VERT = /* glsl */`
precision highp float;
varying vec3 vWorld;
varying vec2 vUvw;
varying vec4 vClip;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vUvw = uv;
  vec4 clip = projectionMatrix * viewMatrix * wp;
  vClip = clip;
  gl_Position = clip;
}
`;

const VEIL_FRAG = /* glsl */`
precision highp float;

${GLSL_NOISE}

uniform float uTime;
uniform vec3 uGold;
uniform float uNight;
uniform float uStrength;
uniform sampler2D tBehind;
uniform bool uHasBehind;

varying vec3 vWorld;
varying vec2 vUvw;
varying vec4 vClip;

void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  /* The plane is vertical and follows the wall ring, so its normal is the
     horizontal direction away from the city centre at this point. */
  vec3 N = normalize(vec3(vWorld.x, 0.0, vWorld.z));

  float facing = abs(dot(N, V));
  /* Near total transparency head on, a gold sheen at a grazing angle. That is
     the whole visual signature: from inside the city you barely see it, and
     from along the wall it burns. */
  float grazing = pow(1.0 - facing, 3.0);

  /* Slow vertical scroll of a heat-haze field. */
  vec2 hp = vec2(vUvw.x * 220.0, vUvw.y * 26.0 - uTime * 0.65);
  float haze = fbm2(hp, 3) * 0.5 + 0.5;
  float band = smoothstep(0.0, 0.12, vUvw.y) * (1.0 - smoothstep(0.55, 1.0, vUvw.y));

  float alpha = (0.012 + grazing * 0.52) * (0.55 + 0.45 * haze) * band * uStrength;
  vec3 col = uGold * (0.45 + 0.85 * grazing + 0.35 * haze);

  /* Screen-space refraction. What is available to sample is the terrain-only
     prepass, so the offset bends the ground behind the Veil but not the city
     behind it. Honest partial: the shimmer reads, the cost is one texture
     fetch, and the alternative is a second full-scene target. */
  if (uHasBehind) {
    vec2 uv = (vClip.xy / vClip.w) * 0.5 + 0.5;
    vec2 off = vec2((haze - 0.5) * 0.010, (fbm2(hp * 1.7, 2)) * 0.006) * uStrength;
    vec3 behind = texture2D(tBehind, clamp(uv + off, 0.002, 0.998)).rgb;
    col = mix(behind, col, clamp(alpha * 2.2, 0.0, 1.0));
    alpha = clamp(alpha * 1.6 + grazing * 0.10 * uStrength, 0.0, 0.85);
  }

  /* At night the posts and the plane between them glow amber. */
  col += uGold * uNight * (0.25 + 0.35 * haze) * band;
  alpha = clamp(alpha + uNight * 0.10 * band, 0.0, 0.9);

  gl_FragColor = vec4(col, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function veilRing(radius, height, strength) {
  const segments = Math.max(48, Math.round((2 * Math.PI * radius) / 40));
  const g = new THREE.CylinderGeometry(radius, radius, height, segments, 4, true);
  const uniforms = {
    uTime: { value: 0 },
    uGold: { value: new THREE.Color('#f4c542') },
    uNight: { value: 0 },
    uStrength: { value: strength },
    tBehind: { value: null },
    uHasBehind: { value: false },
  };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VEIL_VERT,
    fragmentShader: VEIL_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
  m.userData.ownedByRegion = true;
  m.name = 'sunward-veil';
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = G + height / 2;
  mesh.renderOrder = 8;
  return mesh;
}

/* ---------------------------------------------------------------------------
   THE DEFLECTED SAND

   Real particle behaviour. Each grain has a seed and a lifetime; its path is
   computed in the vertex shader from the wind and from where the Veil is, so
   a grain that reaches the plane is thrown up and outward instead of passing
   through. That is what puts the dust wall on one side of the wall and clear
   air on the other during the Harmattan, which is the point of the whole
   technology.
   ------------------------------------------------------------------------ */

const SAND_VERT = /* glsl */`
precision highp float;
attribute float aSeed;

uniform float uTime;
uniform float uWindSpeed;
uniform vec2 uWindDir;
uniform float uVeilRadius;
uniform float uVeilHeight;
uniform float uAmount;
uniform float uGround;

varying float vAlpha;
varying float vDeflect;

float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

void main(){
  float s = aSeed;
  float life = 9.0 + h11(s * 3.7) * 7.0;
  float t = mod(uTime + s * 131.0, life) / life;

  /* Grains start upwind of the city and blow across it. */
  float lateral = (h11(s * 7.3) - 0.5) * 2.0 * (uVeilRadius * 1.8);
  vec2 across = vec2(-uWindDir.y, uWindDir.x);
  float travel = mix(-uVeilRadius * 2.2, uVeilRadius * 2.2, t);
  vec2 pos = uWindDir * travel + across * lateral;

  float baseY = uGround + 0.4 + h11(s * 11.1) * 26.0 * uAmount;

  /* Where the path crosses the Veil ring, the grain is thrown up and out.
     The deflection is a function of how close the grain is to the ring, so it
     builds as the grain approaches rather than switching on. */
  float rr = length(pos);
  float d = rr - uVeilRadius;
  float approach = 1.0 - smoothstep(0.0, 220.0, abs(d));
  float inside = step(d, 0.0);
  float deflect = approach * (1.0 - inside * 0.15);

  vec2 outward = normalize(pos + vec2(1e-4));
  pos += outward * deflect * 90.0 * (1.0 - inside);
  float y = baseY + deflect * uVeilHeight * (0.7 + 0.6 * h11(s * 17.7));

  /* Inside the ring, above the ground, the air is clear: any grain that got
     in is already falling out of the column. */
  float clearInside = mix(1.0, 0.06, inside * (1.0 - approach));

  vAlpha = uAmount * clearInside * (1.0 - abs(t * 2.0 - 1.0)) * 0.9;
  vDeflect = deflect;

  vec4 wp = modelMatrix * vec4(pos.x, y, pos.y, 1.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(240.0 / max(1.0, -mv.z) * (1.0 + deflect), 1.0, 14.0);
}
`;

const SAND_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform vec3 uGold;
varying float vAlpha;
varying float vDeflect;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = 1.0 - smoothstep(0.18, 0.5, length(c));
  if (d <= 0.001 || vAlpha <= 0.002) discard;
  vec3 col = mix(uColor, uGold, vDeflect * 0.7);
  gl_FragColor = vec4(col, d * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function deflectedSand(radius, count) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) seed[i] = i * 0.6180339887 % 1 * 997 + i * 0.137;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), radius * 3);

  const uniforms = {
    uTime: { value: 0 },
    uWindSpeed: { value: 1 },
    uWindDir: { value: new THREE.Vector2(-Math.SQRT1_2, Math.SQRT1_2) },
    uVeilRadius: { value: radius },
    uVeilHeight: { value: VEIL_HEIGHT },
    uAmount: { value: 0 },
    uGround: { value: G },
    uColor: { value: new THREE.Color('#c8ab77') },
    uGold: { value: new THREE.Color('#f4c542') },
  };
  const m = new THREE.ShaderMaterial({
    uniforms, vertexShader: SAND_VERT, fragmentShader: SAND_FRAG,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
  });
  m.userData.ownedByRegion = true;
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 9;
  return pts;
}

/* ---------------------------------------------------------------------------
   BUILD
   ------------------------------------------------------------------------ */

export function buildVeil(ctx) {
  const grp = new THREE.Group();
  grp.name = 'sunward-veil';

  /* Angel Stone posts, one every 60 m, set into the crenellations. */
  const geo = geometryKit();
  const posts = new InstanceSet(geo.cyl, ctx.sunklay, 512);
  const outerPosts = Math.round((2 * Math.PI * CITY.wall) / POST_SPACING);
  for (let i = 0; i < outerPosts; i++) {
    const a = (i / outerPosts) * Math.PI * 2;
    posts.add(Math.cos(a) * CITY.wall, G + CITY.wallHeight + CITY.wallParapet,
      Math.sin(a) * CITY.wall, 1.5, 3.2, 1.5, 0, 1.0, 1.0, 0.0);
  }
  const innerPosts = Math.round((2 * Math.PI * CITY.inner) / (POST_SPACING * 0.6));
  for (let i = 0; i < innerPosts; i++) {
    const a = (i / innerPosts) * Math.PI * 2;
    posts.add(Math.cos(a) * CITY.inner, G + 6.5, Math.sin(a) * CITY.inner,
      1.3, 2.8, 1.3, 0, 1.0, 1.0, 0.0);
  }
  const postMesh = posts.build('angel-stone-posts');
  if (postMesh) grp.add(postMesh);

  const outerRing = veilRing(CITY.wall, VEIL_HEIGHT, 1.0);
  const innerRing = veilRing(CITY.inner, VEIL_HEIGHT * 0.65, 1.35);
  grp.add(outerRing, innerRing);

  const sand = deflectedSand(CITY.wall, 6000);
  grp.add(sand);

  grp.userData.veil = { outerRing, innerRing, sand, postMesh };
  /* Circumference, for the info panel: a ring of light 34 km around. */
  grp.userData.circumferenceKm = (2 * Math.PI * CITY.wall) / 1000;
  return grp;
}

/** Called every frame while the Veil is on screen. */
export function updateVeil(grp, env, depthColorTexture) {
  const v = grp.userData.veil;
  if (!v) return;
  for (const ring of [v.outerRing, v.innerRing]) {
    const u = ring.material.uniforms;
    u.uTime.value = env.time;
    u.uNight.value = env.nightFactor;
    u.tBehind.value = depthColorTexture || null;
    u.uHasBehind.value = !!depthColorTexture;
  }
  const su = v.sand.material.uniforms;
  su.uTime.value = env.time;
  /* The Harmattan is when the Veil earns its keep. In clear air there is
     still blown sand, just far less of it. */
  su.uAmount.value = env.weather === 'harmattan' ? 1.0 : (env.weather === 'clear' ? 0.13 : 0.05);
}
