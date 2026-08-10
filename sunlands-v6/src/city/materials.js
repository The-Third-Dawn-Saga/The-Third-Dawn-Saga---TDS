/* ============================================================================
   materials.js  ::  sunklay, and the gold gradient.

   Canon supplies the mechanism and it is a good one: gold dust is mixed into
   the sunklay plaster, and the wealthier the owner the more gold is in their
   walls. So the entire visual hierarchy of the city rides on ONE scalar per
   building instance:

       goldRatio = f(distance from centre, district wealth, importance)

   That single number drives metalness, an emissive rim at grazing angles, and
   the intensity of the gold fleck in the plaster. The result gradients from
   blazing at the palace to bare brown mud in the extramural Commons in one
   continuous falloff, and it reads as wealth and hierarchy from the air
   without a single label.

   Everything is instanced. Sundisk needs tens of thousands of buildings and
   individual meshes would spend the entire draw-call budget on housing.
   ========================================================================= */

import * as THREE from 'three';
import { GLSL_NOISE, GLSL_LIGHTING, GLSL_FOG } from '../shaders/common.js';
import { GLSL_SHADOW, shadowUniforms } from '../shadows.js';

const VERT = /* glsl */`
precision highp float;

attribute float aGold;      // 0 bare mud, 1 the throne room
attribute float aTone;      // plaster colour variation, 0..1
attribute float aWear;      // dust and age, 0..1

varying vec3 vWorld;
varying vec3 vNormal;
varying float vGold;
varying float vTone;
varying float vWear;
varying float vDist;
varying vec3 vLocal;

void main(){
  vec3 transformed = position;
  vec3 objectNormal = normal;

  #ifdef USE_INSTANCING
    vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
    vec3 wn = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
    vLocal = (instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vec4 wp = modelMatrix * vec4(transformed, 1.0);
    vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
    vLocal = transformed;
  #endif

  vWorld = wp.xyz;
  vNormal = wn;
  vGold = aGold;
  vTone = aTone;
  vWear = aWear;
  vDist = distance(wp.xyz, cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
precision highp float;

${GLSL_NOISE}
${GLSL_LIGHTING}
${GLSL_FOG}
${GLSL_SHADOW}

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform float uAmbientScale;
uniform vec3 uNightAmbient;
uniform float uNightBlend;
uniform float uTime;
uniform float uLampGlow;    // window and lamp light after dark

varying vec3 vWorld;
varying vec3 vNormal;
varying float vGold;
varying float vTone;
varying float vWear;
varying float vDist;
varying vec3 vLocal;

${'${PALETTE_GLSL}'}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSunDir);

  /* Plaster: mud brick, varied by batch and weathered by the Harmattan. */
  vec3 plaster = mix(SUNKLAY_DARK, SUNKLAY_LIGHT, vTone);
  plaster = mix(plaster, SUNKLAY_DUST, vWear * 0.55);

  /* Gold dust in the plaster. The fleck is a high frequency field whose
     amplitude is the gold ratio, so a poor wall is flat mud and a rich one
     glitters unevenly the way hand-mixed plaster does. */
  float fleckFade = 1.0 - smoothstep(30.0, 400.0, vDist);
  float fleck = 0.0;
  if (vGold > 0.01 && fleckFade > 0.01) {
    float f = fbm2(vWorld.xz * 6.0 + vWorld.y * 3.0, 3) * 0.5 + 0.5;
    fleck = smoothstep(0.62, 0.95, f) * vGold * fleckFade;
  }

  vec3 albedo = mix(plaster, GOLD_PLASTER, vGold * 0.72);
  albedo = mix(albedo, GOLD_BRIGHT, fleck * 0.8);

  float metal = vGold * 0.85;
  float rough = mix(0.85, 0.16, vGold) + vWear * 0.10;

  /* Lighting, matched to the terrain so the city sits in the same world. */
  float NdL = max(dot(N, L), 0.0);
  float diffuse = pow(NdL, 1.25) * 1.05;
  float sky = 0.5 + 0.5 * N.y;
  vec3 ambient = mix(uGroundColor, uSkyColor, sky) * uAmbientScale + uNightAmbient;

  vec3 sun = uSunColor * uSunIntensity;
  vec3 H = normalize(L + V);
  float f0 = mix(0.04, 1.0, metal);
  float spec = ggx(N, V, L, rough) * fresnelSchlick(f0, max(dot(V, H), 0.0)) * NdL;

  /* Diffuse is tinted by the metal, because gold does not reflect white. */
  vec3 diffCol = mix(albedo, vec3(0.0), metal);
  vec3 specCol = mix(vec3(1.0), GOLD_BRIGHT, metal);

  float shade = sunShadow(vWorld, NdL);
  vec3 color = diffCol * (ambient + sun * diffuse * shade) + specCol * sun * spec * shade;

  /* THE GRAZING RIM. Gold plaster on a curved parapet catches the light at
     the edge, which is what makes the inner ring hard to look at at golden
     hour without needing a bloom pass to fake it. */
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  color += specCol * sun * rim * vGold * 0.55;

  /* Lamps and windows after dark. Only the wealthy burn oil all night. */
  if (uLampGlow > 0.001) {
    float win = step(0.72, fract(vLocal.y * 0.42 + hash21(floor(vLocal.xz * 0.6)) * 7.0));
    color += vec3(1.0, 0.72, 0.34) * win * uLampGlow * (0.12 + 0.88 * vGold) * 0.9;
  }

  color = applyFog(color, vDist, cameraPosition.y, vWorld.y);

  if (uNightBlend > 0.001) {
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float scotopic = 1.0 - smoothstep(0.0015, 0.045, lum);
    color = mix(color, vec3(0.62, 0.80, 1.30) * lum, scotopic * 0.80 * uNightBlend);
  }

  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* Authored as hex because that is how a person reads colour. THREE.Color's
   hex constructor already converts sRGB to linear, so nothing else does. */
const PALETTE = {
  SUNKLAY_DARK:  '#7A6248',
  SUNKLAY_LIGHT: '#B79A72',
  SUNKLAY_DUST:  '#C9B48F',
  GOLD_PLASTER:  '#C79A24',
  GOLD_BRIGHT:   '#FFD25A',
};

function paletteGlsl() {
  return Object.entries(PALETTE).map(([name, hex]) => {
    const c = new THREE.Color(hex);
    return `const vec3 ${name} = vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)});  // ${hex}`;
  }).join('\n');
}

export function createSunklayMaterial() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunIntensity: { value: 1.7 },
    uSkyColor: { value: new THREE.Color(0.2, 0.3, 0.5) },
    uGroundColor: { value: new THREE.Color(0.3, 0.24, 0.16) },
    uAmbientScale: { value: 0.38 },
    uNightAmbient: { value: new THREE.Color(0, 0, 0) },
    uNightBlend: { value: 0 },
    uTime: { value: 0 },
    uLampGlow: { value: 0 },
    uFogColor: { value: new THREE.Color(0.8, 0.8, 0.8) },
    uFogDensity: { value: 1 / 250000 },
    uFogHeightFalloff: { value: 1 / 8000 },
    uFogSeaLevel: { value: -241 },
    ...shadowUniforms(),
  };

  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG.replace('${PALETTE_GLSL}', paletteGlsl()),
    side: THREE.FrontSide,
  });
  m.name = 'sunklay';
  return m;
}

export function updateSunklayUniforms(material, env) {
  const u = material.uniforms;
  u.uSunDir.value.copy(env.sunDir);
  u.uSunColor.value.copy(env.sunColor);
  u.uSunIntensity.value = env.sunIntensity;
  u.uSkyColor.value.copy(env.ambientSky);
  u.uGroundColor.value.copy(env.groundColor);
  u.uAmbientScale.value = env.ambientScale;
  u.uNightAmbient.value.copy(env.nightAmbient);
  u.uNightBlend.value = env.nightFactor;
  u.uTime.value = env.time;
  u.uLampGlow.value = env.nightFactor;
  u.uFogColor.value.copy(env.fogColor);
  u.uFogDensity.value = env.fogDensity;
  u.uFogHeightFalloff.value = 1 / env.fogScaleHeight;
}

/* ---------------------------------------------------------------------------
   THE GOLD GRADIENT

   One function, so every builder in the city agrees on what a place is worth.
   ------------------------------------------------------------------------ */

/**
 * @param {number} r distance from the throne dais, metres
 * @param {number} wealth district multiplier, 0 to 1
 * @param {number} importance building multiplier, 0 to 1
 */
export function goldRatio(r, wealth = 0.5, importance = 0.5) {
  /* Falls off through the rings and dies at the wall. Outside it, in the
     Commons, there is no gold in anyone's walls at all. */
  const byRadius = Math.exp(-Math.pow(r / 2600, 1.35));
  const g = byRadius * (0.25 + 0.75 * wealth) * (0.35 + 0.65 * importance);
  return Math.max(0, Math.min(1, g));
}

/**
 * Attach the per-instance attributes the sunklay shader needs.
 * @param {THREE.InstancedMesh} mesh
 * @param {Float32Array} gold
 * @param {Float32Array} tone
 * @param {Float32Array} wear
 */
export function attachSunklayAttributes(mesh, gold, tone, wear) {
  mesh.geometry.setAttribute('aGold', new THREE.InstancedBufferAttribute(gold, 1));
  mesh.geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(tone, 1));
  mesh.geometry.setAttribute('aWear', new THREE.InstancedBufferAttribute(wear, 1));
}
