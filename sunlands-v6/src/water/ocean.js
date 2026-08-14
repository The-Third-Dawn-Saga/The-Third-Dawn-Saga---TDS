/* ============================================================================
   ocean.js  ::  the Sunlands Sea.

   Gerstner waves, a depth-driven colour ramp, foam that finds its own
   shoreline, refraction of the seabed, and a Fresnel reflection of the actual
   sky rather than of a baked cubemap.

   WHERE THE DEPTH COMES FROM. The shoreline is not authored. Before the main
   pass the terrain is rendered on its own into a half-resolution target that
   carries a depth texture; the water shader unprojects that depth to a world
   position and subtracts it from sea level. That gives the true water column
   under every pixel, so foam appears exactly where the water gets shallow and
   nowhere else, and the same number drives the colour ramp and the
   refraction. Hand-placed foam planes are what the v5 model did and they are
   wrong at every zoom level except the one they were placed at.

   THE MESH. A radial grid locked to the camera, with ring radius going as a
   cube of the parameter so posts crowd near the viewer and stretch to the
   horizon. Its radius follows the view tier, which is also what scales the
   wave amplitude: at Kingdom tier a one metre wave is far below a pixel, so
   the waves flatten out rather than alias.
   ========================================================================= */

import * as THREE from 'three';
import { GLSL_NOISE, GLSL_FOG } from '../shaders/common.js';
import { SKY_SCATTER } from '../shaders/sky-glsl.js';
import { SEA_LEVEL } from '../terrain/height.js';
import { KM } from '../units.js';

const RINGS = 220;
const SEGMENTS = 128;

/* Five Gerstner waves. Varied amplitude, wavelength, steepness and direction,
   with the two longest carrying most of the energy, which is what an open sea
   looks like. Directions are in our axes: x east, y south. */
const WAVES = [
  /* dirX, dirZ, wavelength m, amplitude m, steepness */
  [0.92, 0.39, 128.0, 1.35, 0.62],
  [0.62, -0.78, 71.0, 0.80, 0.55],
  [-0.28, 0.96, 43.0, 0.42, 0.48],
  [0.99, -0.14, 23.0, 0.20, 0.40],
  [0.35, 0.94, 11.0, 0.09, 0.32],
];


/* Wave set, unrolled at module load.

   No loops and no arrays in the shader. GLSL ES 1.00 does not have array
   constructors, and an array uniform that fails to upload leaves the wave
   directions at zero, where normalize() returns NaN and every vertex in the
   mesh silently disappears. Emitting five straight lines of GLSL cannot fail
   either way, and it is faster. */
const WAVE_GLSL = WAVES.map((w, i) => {
  const len = Math.hypot(w[0], w[1]) || 1;
  const dx = (w[0] / len).toFixed(6), dz = (w[1] / len).toFixed(6);
  const wl = w[2].toFixed(3), amp = w[3].toFixed(4), q = w[4].toFixed(4);
  return `
  {
    const vec2 d = vec2(${dx}, ${dz});
    const float k = 6.283185307 / ${wl};
    const float c = ${Math.sqrt(9.81 / (2 * Math.PI / w[2])).toFixed(5)};
    float amp = ${amp} * uWaveScale;
    float f = k * (dot(d, p.xz) - c * uTime);
    float q = ${q} / (k * amp * ${WAVES.length}.0 + 1e-5);
    float sf = sin(f), cf = cos(f);
    disp.xz += q * amp * d * cf;
    disp.y += amp * sf;
    nrm.x -= d.x * k * amp * cf;
    nrm.z -= d.y * k * amp * cf;
    nrm.y -= q * k * amp * sf;
    chop += max(0.0, sf) * amp;
  }`;
}).join('\n');

const VERT = /* glsl */`
precision highp float;

uniform float uTime;
uniform float uSeaLevel;
uniform vec3 uCentre;        // scene-space centre the grid is locked to
uniform float uRadius;
uniform float uWaveScale;    // tier driven: 0 flattens the sea completely
uniform float uFlowPhase;

varying vec3 vWorld;
varying vec3 vWaveNormal;
varying float vDist;
varying vec4 vClip;
varying float vFoamChop;

void main(){
  /* The grid arrives in unit polar coordinates: x is the ring parameter 0..1,
     z is the angle parameter 0..1. Cubing the radius crowds detail near the
     camera without needing a second mesh. */
  float rp = position.x;
  float ang = position.z * 6.283185307;
  float r = rp * rp * rp * uRadius;
  vec3 p = vec3(uCentre.x + cos(ang) * r, uSeaLevel, uCentre.z + sin(ang) * r);

  /* Gerstner: the crests sharpen because the horizontal displacement pulls
     material toward them, which a plain sine cannot do. */
  vec3 disp = vec3(0.0);
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  float chop = 0.0;
  ${WAVE_GLSL}
  p += disp;
  vWaveNormal = normalize(nrm);
  vFoamChop = chop;

  vWorld = p;
  vDist = distance(p, cameraPosition);
  vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vClip = clip;
  gl_Position = clip;
}
`;

const FRAG = /* glsl */`
precision highp float;

${GLSL_NOISE}
${SKY_SCATTER}
${GLSL_FOG}

uniform sampler2D tSceneDepth;
uniform sampler2D tSceneColor;
uniform vec2 uResolution;
uniform mat4 uInvViewProj;
uniform float uCameraNear;
uniform float uCameraFar;
uniform bool uHasDepth;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientSky;
uniform vec3 uNightAmbient;
uniform float uDust;
uniform float uTime;
uniform float uSeaLevel;
uniform float uWaveScale;
uniform float uDetail;      // 1 near, 0 at kingdom tier and above
uniform float uFlow;        // canal water gets a directional offset
uniform vec2 uFlowDir;
uniform int uDebugFlat;

varying vec3 vWorld;
varying vec3 vWaveNormal;
varying float vDist;
varying vec4 vClip;
varying float vFoamChop;

/* Depth-based colour ramp, Part 5.2. */
const vec3 SHALLOW = vec3(0.0526, 0.3813, 0.4508);   // #3FA9B5 in linear
const vec3 MID     = vec3(0.0091, 0.0865, 0.1845);   // #1A5276
const vec3 DEEP    = vec3(0.0015, 0.0246, 0.0648);   // #0A2A44

float linearDepth(float d){
  float z = d * 2.0 - 1.0;
  return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear));
}

void main(){
  vec2 uv = (vClip.xy / vClip.w) * 0.5 + 0.5;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSunDir);

  /* ---- the water column ------------------------------------------------ */
  float depth = 400.0;                 // assume deep until told otherwise
  vec3 seabed = vec3(0.0);
  if (uHasDepth) {
    float raw = texture2D(tSceneDepth, uv).x;
    if (raw < 0.9999) {
      vec4 ndc = vec4(uv * 2.0 - 1.0, raw * 2.0 - 1.0, 1.0);
      vec4 wp = uInvViewProj * ndc;
      seabed = wp.xyz / wp.w;
      depth = max(0.0, uSeaLevel - seabed.y);
    }
  }

  /* ---- normal ---------------------------------------------------------- */
  vec3 N = normalize(vWaveNormal);
  if (uDetail > 0.01) {
    /* Fine ripple detail the vertex grid is too coarse to carry. Flow offset
       is what makes canal water run rather than just heave. */
    vec2 p = vWorld.xz * 0.35 + uFlowDir * uFlow * uTime * 1.6;
    float e = 0.5;
    float h0 = fbm2(p + vec2(uTime * 0.35, -uTime * 0.22), 3);
    float hx = fbm2(p + vec2(e + uTime * 0.35, -uTime * 0.22), 3);
    float hz = fbm2(p + vec2(uTime * 0.35, e - uTime * 0.22), 3);
    /* The ripple normal has to shrink with distance or every pixel lands on a
       different micro-facet and the sea turns into television snow. This is
       the cheap stand-in for filtering the normal distribution: less slope far
       away, and a broader specular lobe to go with it. */
    float amp = 0.30 * uDetail * clamp(uWaveScale, 0.0, 1.0) / (1.0 + vDist * 0.0022);
    N = normalize(N + vec3(-(hx - h0) / e * amp, 0.0, -(hz - h0) / e * amp));
    /* Shallow water flattens: there is not enough column to build a wave in. */
    N = normalize(mix(vec3(0.0, 1.0, 0.0), N, smoothstep(0.0, 1.8, depth)));
  }

  /* ---- body colour ----------------------------------------------------- */
  vec3 body = mix(SHALLOW, MID, smoothstep(0.4, 14.0, depth));
  body = mix(body, DEEP, smoothstep(14.0, 160.0, depth));

  /* ---- refraction of the seabed ---------------------------------------- */
  vec3 refracted = body;
  if (uHasDepth && uDetail > 0.01) {
    vec2 off = N.xz * (0.020 * uDetail) / max(1.0, vDist * 0.004);
    vec3 bed = texture2D(tSceneColor, clamp(uv + off, 0.001, 0.999)).rgb;
    /* Beer's law: the seabed shows through the shallows and is gone by the
       time the column is a few metres. */
    float clarity = exp(-depth * 0.55);
    refracted = mix(body, mix(body, bed, 0.85), clarity);
  }

  /* ---- reflection ------------------------------------------------------ */
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) * 0.85 + 0.15 * abs(R.y);
  vec3 reflSky = skyRadiance(normalize(R), L, uSunIntensity, uDust, 1.0);
  float fres = 0.02 + 0.98 * pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 5.0);

  vec3 color = mix(refracted * (uAmbientSky * 1.6 + uNightAmbient * 6.0), reflSky, fres);

  /* Sun glitter on the water, the ocean's own specular. */
  vec3 H = normalize(L + V);
  float specPow = max(10.0, mix(70.0, 520.0, uDetail) / (1.0 + vDist * 0.0016));
  float spec = pow(max(dot(N, H), 0.0), specPow) * 1.7 / (1.0 + vDist * 0.0008);
  color += uSunColor * uSunIntensity * spec * max(dot(vec3(0.0, 1.0, 0.0), L), 0.0);

  /* ---- foam -------------------------------------------------------------
     Where the column falls under about 0.6 m, and on the wave crests where
     the chop is steep enough to break. Both come out of numbers the shader
     already has, so the shoreline is correct at every zoom level. */
  float shoreFoam = 1.0 - smoothstep(0.0, 0.62, depth);
  float crestFoam = smoothstep(0.55, 0.95, vFoamChop / max(0.35, uWaveScale)) * uDetail;
  float foamMask = clamp(max(shoreFoam, crestFoam * 0.7), 0.0, 1.0);
  if (foamMask > 0.001) {
    vec2 fp = vWorld.xz * 0.6 + vec2(uTime * 0.5, uTime * 0.31);
    float f = fbm2(fp, 4) * 0.5 + 0.5;
    float lace = smoothstep(0.42, 0.78, f * (0.55 + 0.45 * foamMask));
    vec3 foamCol = (uAmbientSky * 2.6 + uSunColor * uSunIntensity * 0.55 + uNightAmbient * 8.0);
    color = mix(color, foamCol, clamp(lace * foamMask, 0.0, 0.95));
  }

  float alpha = mix(0.72, 1.0, clamp(depth / 1.2, 0.0, 1.0));
  alpha = max(alpha, foamMask * 0.9);

  color = applyFog(color, vDist, cameraPosition.y, vWorld.y);

  if (uDebugFlat == 1) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
  if (uDebugFlat == 2) { gl_FragColor = vec4(vec3(clamp(depth / 200.0, 0.0, 1.0)), 1.0); return; }

  gl_FragColor = vec4(color, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Radial grid in unit polar coordinates: x is the ring, z is the angle. */
function radialGrid(rings, segments) {
  const g = new THREE.BufferGeometry();
  const count = (rings + 1) * (segments + 1);
  const pos = new Float32Array(count * 3);
  let p = 0;
  for (let i = 0; i <= rings; i++) {
    for (let j = 0; j <= segments; j++) {
      pos[p++] = i / rings;
      pos[p++] = 0;
      pos[p++] = j / segments;
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      /* Wound so the faces point UP. Increasing the angle parameter runs
         clockwise when the XZ plane is viewed from above with +Z pointing
         south, so the naive winding puts every normal underwater and the
         whole sea is back-face culled. */
      idx.push(a, b, c, b, d, c);
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return g;
}

export class Ocean {
  constructor(scene) {
    this.uniforms = {
      uTime: { value: 0 },
      uSeaLevel: { value: SEA_LEVEL },
      uCentre: { value: new THREE.Vector3() },
      uRadius: { value: 20 * KM },
      uWaveScale: { value: 1 },
      uFlowPhase: { value: 0 },

      tSceneDepth: { value: null },
      tSceneColor: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uInvViewProj: { value: new THREE.Matrix4() },
      uCameraNear: { value: 1 },
      uCameraFar: { value: 1000 },
      uHasDepth: { value: false },

      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSunIntensity: { value: 1.7 },
      uAmbientSky: { value: new THREE.Color(0.2, 0.3, 0.5) },
      uNightAmbient: { value: new THREE.Color(0, 0, 0) },
      uDust: { value: 0 },
      uDetail: { value: 1 },
      uFlow: { value: 0 },
      uFlowDir: { value: new THREE.Vector2(1, 0) },
      uDebugFlat: { value: 0 },

      uFogColor: { value: new THREE.Color(0.8, 0.8, 0.8) },
      uFogDensity: { value: 1 / 250000 },
      uFogHeightFalloff: { value: 1 / 8000 },
      uFogSeaLevel: { value: SEA_LEVEL },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
    });
    this.material.name = 'ocean';

    this.mesh = new THREE.Mesh(radialGrid(RINGS, SEGMENTS), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'ocean';
    scene.add(this.mesh);
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} env
   * @param {number} altitude metres above the ground
   * @param {{depth:THREE.Texture, color:THREE.Texture}|null} depthPass
   */
  update(camera, env, altitude, depthPass, invViewProj) {
    const u = this.uniforms;
    u.uTime.value = env.time;

    /* The disc follows the camera and grows with altitude, so the sea always
       reaches the horizon and never wastes vertices doing it. */
    u.uCentre.value.set(camera.position.x, SEA_LEVEL, camera.position.z);
    u.uRadius.value = Math.min(900 * KM, Math.max(6 * KM, altitude * 26));

    /* Waves scale with the tier. At Kingdom tier a metre of swell is far
       below a pixel, so it is flattened rather than aliased. */
    u.uWaveScale.value = 1 - Math.min(1, Math.max(0, (Math.log(Math.max(altitude, 1)) - Math.log(2000)) / (Math.log(60000) - Math.log(2000))));
    u.uDetail.value = 1 - Math.min(1, Math.max(0, (Math.log(Math.max(altitude, 1)) - Math.log(600)) / (Math.log(20000) - Math.log(600))));

    u.uSunDir.value.copy(env.sunDir);
    u.uSunColor.value.copy(env.sunColor);
    u.uSunIntensity.value = env.sunIntensity;
    u.uAmbientSky.value.copy(env.ambientSky);
    u.uNightAmbient.value.copy(env.nightAmbient);
    u.uDust.value = env.weatherDef.dust;
    u.uFogColor.value.copy(env.fogColor);
    u.uFogDensity.value = env.fogDensity;
    u.uFogHeightFalloff.value = 1 / env.fogScaleHeight;

    u.uCameraNear.value = camera.near;
    u.uCameraFar.value = camera.far;
    u.uInvViewProj.value.copy(invViewProj);

    if (depthPass) {
      u.tSceneDepth.value = depthPass.depth;
      u.tSceneColor.value = depthPass.color;
      u.uHasDepth.value = true;
    } else {
      u.uHasDepth.value = false;
    }
  }
}
