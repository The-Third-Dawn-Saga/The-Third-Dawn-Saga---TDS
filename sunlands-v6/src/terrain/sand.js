/* ============================================================================
   sand.js  ::  the terrain material.

   Five layers, per the project worldbuilding reference:

     1. diffuse contrast reflectance, a Lambertian with the falloff sharpened
     2. ocean-like macro specular across dune faces
     3. per-grain glitter, high frequency random normal perturbation.
        This is the single effect that makes sand read as sand.
     4. grain-level bump
     5. triplanar-blended ripple normals, oriented by dune slope and by the
        prevailing wind

   Palette, Sahara golden: base #C2A24D, shadow #7B6250, highlight #E4BD8F,
   with procedural colour variation at three scales. Salt flats swap to
   #E8E4D8 / #F5F3EE with a Worley F2-F1 crack network at threshold 0.05.
   Glass, ash, rock and oasis green blend in from the vertex weights the
   mesher packed.

   GEOMORPHING lives in the vertex shader here, not on the CPU. The chunk edge
   arrives packed as a power of two in a material byte, so each vertex works
   out its own morph range. Two chunks sharing an edge share those vertices
   exactly and therefore compute the same morph: the seam is watertight by
   construction.

   WORLD COORDINATES AND FLOAT32. Absolute positions run to 2.5 million metres
   and float32 cannot carry metre-scale detail at that magnitude. So the
   shader never sees an absolute coordinate. It gets scene space, which the
   floating origin keeps near the camera, plus two small uniforms carrying the
   offset: one wrapped for high frequency detail, one scaled down for the
   large colour fields.
   ========================================================================= */

import * as THREE from 'three';
import { GLSL_NOISE, GLSL_LIGHTING, GLSL_FOG } from '../shaders/common.js';
import { TAU_PIXELS, ERROR_PER_SPACING } from './chunker.js';
import { SEA_LEVEL } from './height.js';
import { WIND } from '../units.js';

/* The wrap period for high frequency detail. Any chunk fine enough for grain
   to be visible is far smaller than this, so the coordinate never wraps
   inside a chunk and the detail is continuous. */
export const HIFREQ_WRAP = 8192.0;
export const LOFREQ_SCALE = 1e-4;

const VERT = /* glsl */`
precision highp float;

attribute float morphY;
attribute vec4 aMat;    // reg, salt, glass, ash
attribute vec4 aMat2;   // verdant, rock, chunk size exponent, unused

uniform float uProjK;       // pixels of screen error per metre at one metre
uniform float uTau;         // the split threshold in pixels
uniform vec2 uOffsetFrac;   // floating origin, wrapped for detail
uniform vec2 uOffsetSmall;  // floating origin, scaled for large fields

varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vMat;
varying vec2 vMat2;
varying float vDist;
varying vec2 vHiUV;
varying vec2 vLoUV;
varying float vChunkSize;

void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float dist = distance(wp.xyz, cameraPosition);

  /* Chunk edge from the packed exponent.

     A node is SPLIT while its screen error is over the threshold, so it is
     used as a leaf from dNear = error * K / tau outward, and its parent takes
     over at exactly twice that. So the valid range is [dNear, 2 * dNear] and
     the morph has to complete near the TOP of that range, not the bottom.
     Getting this backwards is what puts visible steps at every chunk edge.

     The band closes at 1.8 rather than 2.0 because the selector measures
     distance to the chunk's bounding box while the shader measures it per
     vertex, and those disagree by a fraction of the chunk size. Finishing
     early spends a little detail to guarantee the surfaces have already met
     when the swap happens. */
  float sizeExp = floor(aMat2.z * 255.0 + 0.5);
  float chunkSize = exp2(sizeExp);
  float error = (chunkSize / 64.0) * ${ERROR_PER_SPACING.toFixed(3)};
  float dNear = error * uProjK / uTau;
  float morph = smoothstep(dNear * 1.35, dNear * 1.80, dist);

  vec3 p = position;
  p.y = mix(position.y, morphY, morph);
  vec4 wpm = modelMatrix * vec4(p, 1.0);

  vWorld = wpm.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vMat = aMat;
  vMat2 = aMat2.xy;
  vDist = distance(wpm.xyz, cameraPosition);
  vChunkSize = chunkSize;

  vHiUV = wpm.xz + uOffsetFrac;
  vLoUV = wpm.xz * ${LOFREQ_SCALE} + uOffsetSmall;

  gl_Position = projectionMatrix * viewMatrix * wpm;
}
`;

const FRAG = /* glsl */`
precision highp float;

${GLSL_NOISE}
${GLSL_LIGHTING}
${GLSL_FOG}

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbient;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec2 uWindDir;
uniform float uTime;
uniform float uWet;        // rain
uniform float uVerdant;    // season, the Greening against the Long Dust
uniform float uDust;       // Harmattan
uniform float uSeaLevel;
uniform float uTide;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vMat;
varying vec2 vMat2;
varying float vDist;
varying vec2 vHiUV;
varying vec2 vLoUV;
varying float vChunkSize;

/* Sahara golden. */
const vec3 SAND_BASE   = vec3(0.760, 0.635, 0.302);   // #C2A24D
const vec3 SAND_SHADOW = vec3(0.482, 0.384, 0.314);   // #7B6250
const vec3 SAND_HIGH   = vec3(0.894, 0.741, 0.561);   // #E4BD8F
const vec3 SALT_BASE   = vec3(0.910, 0.894, 0.847);   // #E8E4D8
const vec3 SALT_HIGH   = vec3(0.961, 0.953, 0.933);   // #F5F3EE
const vec3 REG_BASE    = vec3(0.545, 0.451, 0.322);
const vec3 GLASS_BASE  = vec3(0.352, 0.416, 0.463);
const vec3 ASH_BASE    = vec3(0.243, 0.227, 0.212);
const vec3 RUST_BASE   = vec3(0.372, 0.243, 0.169);
const vec3 ROCK_BASE   = vec3(0.400, 0.365, 0.325);
const vec3 GREEN_BASE  = vec3(0.216, 0.310, 0.153);

/* Ripple height field, oriented by the prevailing wind. Analytic, so the
   normal comes out of the same expression rather than out of a texture. */
float rippleField(vec2 p, float scale){
  float along = dot(uWindDir, p);
  float across = dot(vec2(-uWindDir.y, uWindDir.x), p);
  float wander = fbm2(p * 0.02, 3) * 2.2;
  return sin((along * scale) + wander) * 0.5 + fbm2(vec2(across * 0.06, along * 0.01), 2) * 0.2;
}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSunDir);

  float reg = vMat.x, salt = vMat.y, glass = vMat.z, ash = vMat.w;
  float verdant = vMat2.x * uVerdant, rock = vMat2.y;
  float sand = clamp(1.0 - reg - salt - glass - ash, 0.0, 1.0);

  /* ---- detail fades ---------------------------------------------------
     Everything below a few metres across is invisible past a few hundred
     metres, so it is faded rather than aliased. The fades also keep the
     float32 world coordinate honest at continental range, where wrapping the
     high frequency coordinate would otherwise show. */
  float fGrain  = 1.0 - smoothstep(20.0, 160.0, vDist);
  float fGlint  = 1.0 - smoothstep(60.0, 900.0, vDist);
  float fRipple = 1.0 - smoothstep(400.0, 3500.0, vDist);

  /* ---- layer 5: triplanar ripple normals ------------------------------ */
  vec3 Nd = N;
  if (fRipple > 0.001) {
    /* Ripples run across the wind and steepen on the windward face, so the
       amplitude follows the dune slope. */
    float slope = clamp(1.0 - N.y, 0.0, 1.0);
    float amp = (0.12 + slope * 0.55) * fRipple * sand;
    float e = 0.35;
    float h0 = rippleField(vHiUV, 0.8);
    float hx = rippleField(vHiUV + vec2(e, 0.0), 0.8);
    float hz = rippleField(vHiUV + vec2(0.0, e), 0.8);
    vec3 rippleN = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
    /* Triplanar weight: the ripple lies on the ground plane, so it fades out
       on near-vertical faces where sand does not sit anyway. */
    float w = pow(clamp(N.y, 0.0, 1.0), 2.0);
    Nd = normalize(mix(Nd, normalize(Nd + rippleN - vec3(0.0, 1.0, 0.0)), w));
  }

  /* ---- layer 4: grain-level bump -------------------------------------- */
  if (fGrain > 0.001) {
    float e = 0.02;
    float g0 = fbm2(vHiUV * 45.0, 2);
    float gx = fbm2((vHiUV + vec2(e, 0.0)) * 45.0, 2);
    float gz = fbm2((vHiUV + vec2(0.0, e)) * 45.0, 2);
    float amp = 0.06 * fGrain * (sand + reg * 0.6 + salt * 0.4);
    Nd = normalize(Nd + vec3(-(gx - g0) / e * amp, 0.0, -(gz - g0) / e * amp));
  }

  /* ---- albedo ---------------------------------------------------------
     Procedural colour variation at three scales, per the reference:
     x200 amplitude 0.04, x20 amplitude 0.08, x3 amplitude 0.12. Applied on
     the large-field coordinate so it survives to continental range. */
  float v1 = fbm2(vLoUV * 200.0, 2) * 0.04;
  float v2 = fbm2(vLoUV * 20.0, 3) * 0.08;
  float v3 = fbm2(vLoUV * 3.0, 4) * 0.12;
  float variation = v1 + v2 + v3;

  vec3 sandCol = mix(SAND_BASE, SAND_HIGH, clamp(0.5 + variation * 2.2, 0.0, 1.0));
  sandCol = mix(sandCol, SAND_SHADOW, clamp(-variation * 2.6, 0.0, 0.55));

  /* Reg pavement: darker, stonier, and cracked into polygons. */
  float regCrack = smoothstep(0.05, 0.0, worley21(vHiUV * 0.05));
  vec3 regCol = mix(REG_BASE, REG_BASE * 0.62, regCrack * fRipple);
  regCol = mix(regCol, regCol * (0.85 + variation), 0.6);

  /* Salt crust: the crack network is the whole look, threshold 0.05. */
  float saltCrack = smoothstep(0.05, 0.0, worley21(vHiUV * 0.09));
  vec3 saltCol = mix(SALT_BASE, SALT_HIGH, clamp(0.5 + variation * 3.0, 0.0, 1.0));
  saltCol = mix(saltCol, vec3(0.62, 0.58, 0.52), saltCrack * 0.8 * fRipple);

  /* Glass: dark where the sheet is thick, paler where it is crazed. The full
     near-mirror treatment is in the glass region material. */
  float crazing = fbm2(vLoUV * 60.0, 3);
  vec3 glassCol = mix(GLASS_BASE, GLASS_BASE * 0.45, smoothstep(0.1, 0.5, crazing));

  /* Ash: basalt and rust, and nothing saturated. */
  float rustV = smoothstep(0.15, 0.6, fbm2(vLoUV * 30.0, 3));
  vec3 ashCol = mix(ASH_BASE, RUST_BASE, rustV * 0.55);

  vec3 albedo = sandCol * sand + regCol * reg + saltCol * salt
              + glassCol * glass + ashCol * ash;
  albedo = mix(albedo, ROCK_BASE * (0.8 + variation), rock * (1.0 - glass));
  albedo = mix(albedo, GREEN_BASE * (0.75 + variation * 1.5), verdant * 0.80);

  /* Wet sand darkens, and so does everything in the rain. */
  float shoreWet = smoothstep(1.6, -0.4, vWorld.y - uSeaLevel - uTide) *
                   step(uSeaLevel - 6.0, vWorld.y);
  float wet = clamp(max(uWet * 0.7, shoreWet), 0.0, 1.0);
  albedo *= mix(1.0, 0.52, wet);

  /* ---- layer 1: diffuse contrast reflectance --------------------------
     A Lambertian with the falloff sharpened. Sand has a hard terminator; a
     plain Lambert makes it look like clay. */
  float NdL = dot(Nd, L);
  float diffuse = pow(clamp(NdL, 0.0, 1.0), 1.7) * 1.12;

  /* ---- layer 2: macro specular ----------------------------------------
     Broad, ocean-like, and strongest across the dune faces where the surface
     is smoothest. Wet sand and glass sharpen it. */
  float rough = mix(0.62, 0.34, clamp(N.y, 0.0, 1.0));
  rough = mix(rough, 0.12, glass);
  rough = mix(rough, 0.22, wet);
  rough = mix(rough, 0.85, ash);
  float f0 = mix(0.028, 0.16, glass) * mix(1.0, 2.2, wet);
  float spec = ggx(Nd, V, L, rough) * fresnelSchlick(f0, max(dot(Nd, V), 0.0));

  /* ---- layer 3: per-grain glitter -------------------------------------
     Individual grains catching the sun. Only a small fraction of grains are
     oriented to flash at once, so the cell threshold matters as much as the
     highlight. Killed entirely on ash: the Ashlands do not sparkle. */
  float glint = 0.0;
  if (fGlint > 0.001) {
    vec2 cell = floor(vHiUV * 42.0);
    vec2 r = hash22(cell);
    if (r.x > 0.86) {
      vec3 gn = normalize(Nd + vec3(r.x * 2.0 - 1.0, 0.55, r.y * 2.0 - 1.0) * 0.9);
      vec3 H = normalize(L + V);
      glint = pow(max(dot(gn, H), 0.0), 620.0) * 12.0 * fGlint;
      glint *= (sand * 0.9 + salt * 0.7 + glass * 1.4);
      glint *= (1.0 - ash);
    }
  }

  /* ---- assemble -------------------------------------------------------- */
  vec3 sun = uSunColor * uSunIntensity;
  float sky = 0.5 + 0.5 * Nd.y;
  vec3 ambient = mix(uGroundColor, uSkyColor, sky) * uAmbient * 2.0;

  vec3 color = albedo * (ambient + sun * diffuse)
             + sun * spec * mix(1.0, 3.0, glass)
             + sun * glint;

  /* The Ashlands lose their colour, hard. Beautiful at distance, wrong on
     approach, and the desaturation is the first half of that. */
  if (ash > 0.001) {
    float grey = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, mix(vec3(grey), color, 0.28), ash);
  }

  color = applyFog(color, vDist, cameraPosition.y, vWorld.y);
  gl_FragColor = vec4(color, 1.0);
}
`;

export function createTerrainMaterial() {
  const uniforms = {
    uProjK: { value: 1000 },
    uTau: { value: TAU_PIXELS },
    uOffsetFrac: { value: new THREE.Vector2() },
    uOffsetSmall: { value: new THREE.Vector2() },

    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunIntensity: { value: 2.2 },
    uAmbient: { value: new THREE.Color(0.3, 0.3, 0.3) },
    uSkyColor: { value: new THREE.Color(0.4, 0.55, 0.8) },
    uGroundColor: { value: new THREE.Color(0.3, 0.24, 0.16) },
    uFogColor: { value: new THREE.Color(0.8, 0.8, 0.8) },
    uFogDensity: { value: 1 / 250000 },
    uFogHeightFalloff: { value: 1 / 8000 },
    uFogSeaLevel: { value: SEA_LEVEL },

    uWindDir: { value: new THREE.Vector2(WIND.dir.x, WIND.dir.z) },
    uTime: { value: 0 },
    uWet: { value: 0 },
    uVerdant: { value: 1 },
    uDust: { value: 0 },
    uSeaLevel: { value: SEA_LEVEL },
    uTide: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
    dithering: true,
  });
  material.name = 'terrain-sand';
  return material;
}

/** Push the current environment and floating origin into the material. */
export function updateTerrainUniforms(material, env, worldOffset, projK) {
  const u = material.uniforms;
  u.uProjK.value = projK;
  u.uOffsetFrac.value.set(
    ((worldOffset.x % HIFREQ_WRAP) + HIFREQ_WRAP) % HIFREQ_WRAP,
    ((worldOffset.z % HIFREQ_WRAP) + HIFREQ_WRAP) % HIFREQ_WRAP);
  u.uOffsetSmall.value.set(worldOffset.x * LOFREQ_SCALE, worldOffset.z * LOFREQ_SCALE);

  u.uSunDir.value.copy(env.sunDir);
  u.uSunColor.value.copy(env.sunColor);
  u.uSunIntensity.value = env.sunIntensity;
  u.uAmbient.value.copy(env.ambient);
  u.uSkyColor.value.copy(env.skyColor);
  u.uGroundColor.value.copy(env.groundColor);
  u.uFogColor.value.copy(env.fogColor);
  u.uFogDensity.value = env.fogDensity;
  u.uFogHeightFalloff.value = 1 / env.fogScaleHeight;
  u.uTime.value = env.time;
  u.uWet.value = env.weatherDef.wet;
  u.uVerdant.value = env.seasonDef.verdant;
  u.uDust.value = env.weatherDef.dust;
  u.uTide.value = Math.sin(env.time * 0.02) * 0.6;
}
