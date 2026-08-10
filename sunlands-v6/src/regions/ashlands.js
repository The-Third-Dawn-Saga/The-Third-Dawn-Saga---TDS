/* ============================================================================
   ashlands.js  ::  the Western Ashlands.

   The tonal note from the July 2026 expansion doctrine is load-bearing and it
   is NOT a monster wasteland. The honest picture is an exclusion zone where
   abandonment plus time produced an eerie sanctuary, and the wildlife
   recolonised. So it is rendered beautiful at distance and wrong on approach:
   desaturated to basalt and rust, no sand glitter at all, an overcast dome
   with a permanent high ash veil and a slow drifting particle layer, and the
   only saturated colour left in the whole region is the Weeping Wastes and
   the Bloomfields, which is exactly the wrong place for anything to be lovely.

   Crossing the frontier from Sol Taresh should feel like a colour grade
   change, so it IS one: a single blend factor driven by how far west the
   camera is, applied to the sky, the haze and the ground together.
   ========================================================================= */

import * as THREE from 'three';
import { KM } from '../units.js';
import { walkableHeight } from '../terrain/height.js';
import { makeRng, seedFrom } from '../world.js';

/* Part 3.3: the frontier is around x = -1,300 km and the Poison Sea begins at
   about -2,600 km. The grade comes up across the frontier, not at a line. */
export const FRONTIER_X = -1300 * KM;
export const GRADE_WIDTH = 260 * KM;

/** 0 in the Sunlands, 1 deep in the Ashlands. */
export function ashBlendAt(x) {
  const t = (FRONTIER_X + GRADE_WIDTH * 0.5 - x) / GRADE_WIDTH;
  return Math.max(0, Math.min(1, t));
}

/**
 * Apply the grade to the environment. Called every frame with the camera's
 * absolute X, so a flight west desaturates continuously rather than snapping.
 */
export function applyAshGrade(env, camX) {
  const a = ashBlendAt(camX);
  env.ashBlend = a;
  if (a <= 0.001) return a;

  /* Permanent grey overcast, and haze that never lifts. */
  const grey = new THREE.Color(0.42, 0.43, 0.44).convertSRGBToLinear();
  env.skyColor.lerp(grey, a * 0.80);
  env.horizonColor.lerp(grey.clone().multiplyScalar(1.15), a * 0.78);
  env.ambientSky.lerp(grey, a * 0.75);
  env.fogColor.lerp(new THREE.Color(0.46, 0.45, 0.43).convertSRGBToLinear(), a * 0.82);
  env.fogDensity *= (1 + a * 1.9);
  /* The ash sits low, so there is a top to it you can see over from height. */
  env.fogScaleHeight = env.fogScaleHeight * (1 - a) + 2600 * a;
  /* Less direct sun through the veil, more of it scattered. */
  env.sunIntensity *= (1 - a * 0.55);
  env.ambientScale *= (1 + a * 0.9);
  return a;
}

/* ---------------------------------------------------------------------------
   THE DRIFTING ASH

   A slow particle layer over the whole region. Motion is computed per grain
   in the vertex shader from a seed, so ten thousand grains cost one draw call
   and no CPU work.
   ------------------------------------------------------------------------ */

const ASH_VERT = /* glsl */`
precision highp float;
attribute float aSeed;
uniform float uTime;
uniform float uAmount;
uniform float uSpan;
uniform vec3 uCentre;
varying float vAlpha;
float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main(){
  float s = aSeed;
  float life = 26.0 + h11(s * 3.1) * 30.0;
  float t = mod(uTime * 0.35 + s * 71.0, life) / life;
  /* Drifting west to east and settling, which is what ash does. */
  float x = uCentre.x + (h11(s * 5.7) - 0.5) * uSpan + t * uSpan * 0.22;
  float z = uCentre.z + (h11(s * 9.3) - 0.5) * uSpan;
  float y = uCentre.y + 40.0 + h11(s * 13.7) * 900.0 - t * 260.0;
  vAlpha = uAmount * (1.0 - abs(t * 2.0 - 1.0)) * 0.5;
  vec4 mv = viewMatrix * modelMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(900.0 / max(1.0, -mv.z), 1.0, 6.0);
}
`;
const ASH_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = 1.0 - smoothstep(0.2, 0.5, length(c));
  if (d <= 0.001 || vAlpha <= 0.002) discard;
  gl_FragColor = vec4(uColor, d * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildAshVeil(centre, span, count = 9000) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) seed[i] = (i * 0.6180339887) % 1 * 991 + i * 0.173;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), span * 2);

  const uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uSpan: { value: span },
    uCentre: { value: new THREE.Vector3(centre.x, centre.y, centre.z) },
    uColor: { value: new THREE.Color('#8c8781') },
  };
  const m = new THREE.ShaderMaterial({
    uniforms, vertexShader: ASH_VERT, fragmentShader: ASH_FRAG,
    transparent: true, depthWrite: false,
  });
  m.userData.ownedByRegion = true;
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  pts.name = 'ash-veil';
  return pts;
}

/* ---------------------------------------------------------------------------
   THE ONLY COLOUR LEFT

   Lake Verdigris, the Weeping Wastes and the Bloomfields. Emissive, because
   the point is that they glow in a region where nothing else does, and the
   traveller who walks toward the pretty light is making a mistake.
   ------------------------------------------------------------------------ */

export function buildBrightSpot(p, ctx, opts) {
  const grp = new THREE.Group();
  grp.name = `bright:${p.id}`;
  const rng = makeRng(seedFrom(p.id));
  const R = opts.radius;

  const g = new THREE.CircleGeometry(R, 64);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(opts.color),
    transparent: true, opacity: opts.opacity, depthWrite: false,
  });
  m.userData.ownedByRegion = true;
  const disc = new THREE.Mesh(g, m);
  disc.position.y = walkableHeight(p.x, p.z) + (opts.lift || 3);
  disc.renderOrder = 3;
  grp.add(disc);

  /* A scatter of smaller pools, so the edge is not a circle. */
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * R * 1.25;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const sub = new THREE.Mesh(g, m);
    sub.scale.setScalar(0.08 + rng() * 0.22);
    sub.position.set(x, walkableHeight(p.x + x, p.z + z) + (opts.lift || 3), z);
    sub.renderOrder = 3;
    grp.add(sub);
  }
  return grp;
}

/* ---------------------------------------------------------------------------
   FARO'S MIRROR  [PROPOSED]

   A seasonal lake at the salt flats margin: it fills in the Greening and
   vanishes in the Long Dust, leaving harvestable salt behind. So it is not a
   decal, it is a water surface whose LEVEL is a function of the season, and
   in the Dust it drops below the basin floor and the salt crust the terrain
   already carries is what is left.
   ------------------------------------------------------------------------ */

export function buildSeasonalLake(p, ctx, radius) {
  const grp = new THREE.Group();
  grp.name = `seasonal-lake:${p.id}`;
  const g = new THREE.CircleGeometry(radius, 96);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#7fa8b0'), transparent: true, opacity: 0.8, depthWrite: false,
  });
  m.userData.ownedByRegion = true;
  const disc = new THREE.Mesh(g, m);
  disc.renderOrder = 3;
  grp.add(disc);
  /* The basin floor, so the level has something to be a level ABOVE. */
  grp.userData.lake = { disc, floor: walkableHeight(p.x, p.z), radius };
  return grp;
}

export function updateSeasonalLake(grp, env) {
  const L = grp.userData.lake;
  if (!L) return;
  /* Full in the Greening, gone in the Long Dust, and the Harmattan is the
     hinge between them. */
  const fill = env.seasonDef.faros;
  grp.visible = fill > 0.02;
  if (!grp.visible) return;
  L.disc.position.y = L.floor + 1.2 + fill * 11;
  L.disc.scale.setScalar(0.35 + 0.65 * fill);
  L.disc.material.opacity = 0.35 + 0.5 * fill;
}

export const BRIGHT_SPOTS = {
  verdigris: { color: '#2fd0a8', opacity: 0.72, radius: 14 * KM, lift: 4 },
  weeping: { color: '#7ef07a', opacity: 0.5, radius: 62 * KM, lift: 6 },
  bloomfields: { color: '#e86ac8', opacity: 0.42, radius: 74 * KM, lift: 6 },
};
