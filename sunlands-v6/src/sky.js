/* ============================================================================
   sky.js  ::  the sky dome.

   Rayleigh and Mie single scattering, evaluated per pixel against a Kasten
   and Young airmass, with the same sun the rest of the build uses. Not a
   gradient with a sunset colour painted on: the horizon goes orange because
   blue light has been scattered out of a long path, which is also why the sun
   itself reddens at the same moment and by the same amount.

   Drawn as a screen-filling quad rather than a dome, so it costs one draw
   call and no geometry, and its ray directions come from the inverse
   projection, which means it is correct at every one of the four tiers
   without knowing anything about them.
   ========================================================================= */

import * as THREE from 'three';
import { GLSL_NOISE } from './shaders/common.js';
import { SKY_SCATTER } from './shaders/sky-glsl.js';

const VERT = /* glsl */`
precision highp float;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
varying vec3 vDir;
void main(){
  vec4 clip = vec4(position.xy, 1.0, 1.0);
  vec4 eye = uInvProj * clip;
  vDir = mat3(uCamWorld) * (eye.xyz / eye.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const FRAG = /* glsl */`
precision highp float;

${GLSL_NOISE}

uniform vec3 uSunDir;
uniform float uSunIntensity;
uniform vec3 uSunTint;        // extinction already applied to the disc
uniform vec3 uFogColor;
uniform float uNight;
uniform float uDust;          // Harmattan
uniform float uCloud;
uniform float uTime;
uniform float uCamAltitude;   // metres above sea level
uniform vec3 uGlassGlow;      // xz: unit bearing to the Glass Desert, y: strength

varying vec3 vDir;

${SKY_SCATTER}

void main(){
  vec3 d = normalize(vDir);
  vec3 s = normalize(uSunDir);
  float cosT = dot(d, s);

  /* Above the bulk of the atmosphere the airmass along a downward ray is
     small, so the sky darkens toward space as the camera climbs. */
  float highAlt = clamp(uCamAltitude / 60000.0, 0.0, 1.0);

  vec3 col = skyRadiance(d, s, uSunIntensity, uDust, mix(1.0, 0.10, highAlt));

  /* Ground half of the sphere fades to the haze colour, so looking down from
     altitude does not show a hard edge where the dome ends. */
  float below = smoothstep(0.02, -0.06, d.y);
  col = mix(col, uFogColor * (0.55 + 0.45 * uSunIntensity * 0.4), below);

  /* The sun disc, about half a degree across, with its own forward glow. */
  float disc = smoothstep(0.99987, 0.99994, cosT);
  float glow = pow(max(cosT, 0.0), 900.0) * 0.6 + pow(max(cosT, 0.0), 60.0) * 0.09;
  col += uSunTint * uSunIntensity * (disc * 26.0 + glow) * (1.0 - below);

  /* Night. Stars fade in as the sun leaves, and the Milky Way is a faint
     band because a desert sky at night is not empty. */
  if (uNight > 0.001) {
    float st = starField(d) * uNight * (1.0 - below);
    float band = pow(max(0.0, 1.0 - abs(dot(d, normalize(vec3(0.42, 0.30, -0.86)))) * 2.6), 3.0);
    col += vec3(0.95, 0.96, 1.0) * st * 1.6;
    col += vec3(0.16, 0.17, 0.24) * band * uNight * 0.30 * (1.0 - below);

    /* THE GLASS DESERT GLOW, and why it belongs to the sky.

       Canon: at night the starlight reflected off the sheet is visible from
       Sundisk's walls, three hundred kilometres away. It cannot be carried by
       the terrain from there. The Street tier far plane is four kilometres,
       per Part 1.3, and even with an unlimited one the sheet at three hundred
       kilometres is a band a hair below the horizon, thinner than a pixel.

       What you would actually see from the walls is not the sheet. It is the
       air above the sheet, lit from below, the same way a city puts a dome of
       light over itself. So that is what this is: a glow banked on the
       horizon in the sheet's direction, fading upward through the haze, on
       for as long as the stars are. It is computed from the camera's real
       bearing to the Glass Desert, so it swings round the sky as you travel
       and it is gone when you are standing on the glass itself. */
    if (uGlassGlow.y > 0.001) {
      float bearing = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z) + 1e-6),
                                   vec3(uGlassGlow.x, 0.0, uGlassGlow.z)));
      float spread = pow(bearing, 22.0);
      float lift = exp(-max(d.y, 0.0) * 26.0) * smoothstep(-0.02, 0.03, d.y);
      col += vec3(0.34, 0.42, 0.58) * spread * lift * uGlassGlow.y * uNight;
    }
  }

  /* Cloud and dust flatten the whole dome toward the haze colour. */
  col = mix(col, uFogColor, clamp(uCloud * 0.75 + uDust * 0.55, 0.0, 0.92) * (1.0 - below * 0.5));

  gl_FragColor = vec4(max(col, 0.0), 1.0);

  /* A raw ShaderMaterial gets none of the output pipeline for free: Three.js
     injects tone mapping and the linear to sRGB encode into its own materials
     through these two chunks, and a custom shader that writes gl_FragColor
     without them ships raw linear values straight to the screen. That is not
     a subtle error. Mid tones come out roughly half as bright as they should
     be and saturated colours come out darker still, which reads as "the
     lighting is wrong" and sends you tuning light levels that were correct
     all along. */
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* The Glass Desert, from canon.json. The glow is a bearing to a place, so
   the place has to be in here. */
const GLASS_CENTRE = { x: 530e3, z: -70e3 };
const GLASS_RADIUS = 215e3;                   // half the 430 km extent

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunIntensity: { value: 2.2 },
      uSunTint: { value: new THREE.Color(1, 1, 1) },
      uFogColor: { value: new THREE.Color(0.8, 0.8, 0.8) },
      uNight: { value: 0 },
      uDust: { value: 0 },
      uCloud: { value: 0 },
      uTime: { value: 0 },
      uCamAltitude: { value: 0 },
      uGlassGlow: { value: new THREE.Vector3(1, 0, 0) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.material.name = 'sky';
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
    scene.add(this.mesh);
  }

  /**
   * @param {{x:number,z:number}} camAbs camera position in absolute metres,
   *   which the Glass Desert glow needs because it is a bearing to a place.
   */
  update(camera, env, altitudeAboveSea, camAbs) {
    const u = this.uniforms;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uSunDir.value.copy(env.sunDir);
    u.uSunIntensity.value = Math.max(env.sunIntensity, 0.02);
    u.uSunTint.value.copy(env.sunColor);
    u.uFogColor.value.copy(env.fogColor);
    u.uNight.value = env.nightFactor;
    u.uDust.value = env.weatherDef.dust;
    u.uCloud.value = env.weatherDef.cloud;
    u.uTime.value = env.time;
    u.uCamAltitude.value = altitudeAboveSea;

    /* Bearing and strength of the Glass Desert glow. It rises as you leave
       the sheet, because standing on glass you see the glass and not its
       glow, and it dies away past the far side of the Sunlands. */
    if (camAbs) {
      const dx = GLASS_CENTRE.x - camAbs.x, dz = GLASS_CENTRE.z - camAbs.z;
      const dist = Math.hypot(dx, dz) || 1;
      const near = Math.min(1, Math.max(0, (dist - GLASS_RADIUS * 0.55) / (GLASS_RADIUS * 0.8)));
      const far = 1 - Math.min(1, Math.max(0, (dist - 700e3) / 900e3));
      u.uGlassGlow.value.set(dx / dist, near * far, dz / dist);
    } else {
      u.uGlassGlow.value.y = 0;
    }
  }
}
