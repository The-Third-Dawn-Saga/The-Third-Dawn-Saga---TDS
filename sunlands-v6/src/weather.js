/* ============================================================================
   weather.js  ::  weather that has a POSITION.

   Part 5.5 asks for four states, and two of them are not global tints:

     Harmattan    a dust wall 1 to 3 km high advancing at 80 km/h. It must
                  actually roll across the map, so it has a front position
                  that advances with the clock, and standing on either side of
                  it is a different experience. This is also what makes the
                  Sunward Veil mean anything: the Commons buried while the
                  Outer Ring behind the Veil stays clear only reads if there
                  is a wall of dust to be on one side of.

     Coastal fog  penetrates 80 km inland. Eighty kilometres inland from
                  WHAT, so it is a function of coast distance, not a slider.

   Rain is brief and violent and floods the wadis, which the terrain already
   knows where to put because the classification carries a wadi channel.

   The fog density a shader receives is therefore sampled at a position rather
   than read off the environment, and the environment's own number is the
   clear-air baseline that these modulate.
   ========================================================================= */

import * as THREE from 'three';
import { KM, WIND } from './units.js';
import { coastDistance, SEA_LEVEL } from './terrain/height.js';
import { GLSL_NOISE } from './shaders/common.js';

/* Canon: the dust wall advances at 80 km/h and stands 1 to 3 km high. */
export const HARMATTAN_SPEED = 80 * KM / 3600;      // metres a second
export const WALL_HEIGHT_MIN = 1000;
export const WALL_HEIGHT_MAX = 3000;

/* Coastal fog penetrates 80 km inland. */
export const FOG_PENETRATION = 80 * KM;

/* Converted once rather than once a frame. applyAt runs in the render loop. */
const DUST_COL = new THREE.Color(0.60, 0.44, 0.26).convertSRGBToLinear();
const FOG_COL = new THREE.Color(0.76, 0.79, 0.80).convertSRGBToLinear();

export class Weather {
  constructor() {
    /* The front travels along the wind, which comes out of the northeast and
       therefore travels southwest. Distance is measured along that axis from
       a start well upwind of the inhabited core. */
    this.frontDistance = -700 * KM;
    this.active = false;
    this.wall = null;
    this.rain = null;
  }

  /** Signed distance from the front along the wind axis. Negative is behind. */
  frontOffset(x, z) {
    const along = x * WIND.dir.x + z * WIND.dir.z;
    return along - this.frontDistance;
  }

  /**
   * How much dust is in the air at a position, 0 ahead of the front and 1
   * well behind it. The leading edge is abrupt, which is what a haboob is.
   */
  dustAt(x, z) {
    if (!this.active) return 0;
    const d = this.frontOffset(x, z);
    if (d > 0) return 0;                       // still ahead of the wall
    /* Densest just behind the leading edge, thinning out into the tail. */
    const behind = -d;
    const leading = Math.min(1, behind / (6 * KM));
    const tail = 1 - Math.min(1, Math.max(0, (behind - 90 * KM) / (160 * KM)));
    return leading * (0.35 + 0.65 * tail);
  }

  /** Coastal fog, thick at the shore and gone eighty kilometres inland. */
  fogAt(x, z) {
    const cd = coastDistance(x, z);
    if (cd > FOG_PENETRATION) return 0;
    if (cd < 0) return 1;                       // over the water it is total
    return 1 - Math.pow(cd / FOG_PENETRATION, 0.7);
  }

  /** Advance the front. Called once a frame with the wall clock. */
  tick(dt, env) {
    this.active = env.weather === 'harmattan';
    if (this.active) {
      this.frontDistance -= HARMATTAN_SPEED * dt;
      /* Wrap it round so a session left running keeps getting storms rather
         than one that has passed for good. */
      if (this.frontDistance < -1600 * KM) this.frontDistance = 900 * KM;
    } else {
      this.frontDistance = 900 * KM;            // parked upwind, ready
    }
  }

  /**
   * The fog density and colour a camera at this position should actually see.
   * The environment holds the clear-air baseline; this is where the weather
   * stops being a slider and starts being somewhere you are standing.
   *
   * A GRADE, NOT STATE. It modifies env in place and multiplicatively, so it
   * is only correct on a freshly computed baseline: env.update() has to have
   * run this frame. See the note above Environment.update.
   */
  applyAt(env, x, z) {
    const dust = this.dustAt(x, z);
    const fog = env.weather === 'fog' ? this.fogAt(x, z) : 0;

    env.localDust = dust;
    env.localFog = fog;

    if (dust > 0.002) {
      /* Visibility inside a haboob is a few hundred metres, not kilometres. */
      const clear = 250 * KM;
      const inWall = 0.4 * KM;
      const vis = clear * Math.pow(inWall / clear, dust);
      env.fogDensity = 2.2 / vis;
      env.fogScaleHeight = 900 + 1800 * (1 - dust);
      env.fogColor.lerp(DUST_COL, Math.min(0.92, dust * 0.95));
      env.sunIntensity *= (1 - dust * 0.85);
      env.ambientScale *= (1 + dust * 0.8);
    }

    if (fog > 0.002) {
      const clear = 250 * KM;
      const inFog = 0.9 * KM;
      const vis = clear * Math.pow(inFog / clear, fog);
      env.fogDensity = Math.max(env.fogDensity, 2.2 / vis);
      env.fogScaleHeight = Math.min(env.fogScaleHeight, 260 + 900 * (1 - fog));
      env.fogColor.lerp(FOG_COL, Math.min(0.9, fog * 0.9));
      env.sunIntensity *= (1 - fog * 0.6);
    }
    return { dust, fog };
  }
}

/* ---------------------------------------------------------------------------
   THE DUST WALL

   A curved sheet standing across the wind at the front, one to three
   kilometres high, billowing. It follows the camera sideways so the wall is
   always where the front is rather than only where it was built, and it is
   drawn only while the front is close enough to see.
   ------------------------------------------------------------------------ */

const WALL_VERT = /* glsl */`
precision highp float;
uniform float uTime;
uniform float uHeight;
uniform float uSpan;
uniform vec3 uOrigin;      // scene-space point on the front, at ground level
uniform vec2 uAlong;       // unit vector the front travels along
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv = uv;
  /* The sheet is built in unit space: x across the front, y up. Bowed
     downwind at the edges so it reads as a front rather than a billboard. */
  vec2 across = vec2(-uAlong.y, uAlong.x);
  float lateral = (uv.x - 0.5) * uSpan;
  float bow = (1.0 - cos((uv.x - 0.5) * 3.14159)) * uSpan * 0.10;
  vec3 p = uOrigin
         + vec3(across.x, 0.0, across.y) * lateral
         - vec3(uAlong.x, 0.0, uAlong.y) * bow
         + vec3(0.0, uv.y * uHeight, 0.0);
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const WALL_FRAG = /* glsl */`
precision highp float;
${GLSL_NOISE}
uniform float uTime;
uniform vec3 uColor;
uniform float uAmount;
uniform float uSunUp;
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  /* Billowing: two scrolling noise fields, the slower one carrying the lobes
     and the faster one the churn at the leading edge. */
  vec2 p = vec2(vUv.x * 26.0, vUv.y * 7.0 - uTime * 0.05);
  float n = fbm2(p, 4) * 0.5 + 0.5;
  float churn = fbm2(p * 2.7 + vec2(uTime * 0.09, 0.0), 3) * 0.5 + 0.5;

  /* THE THRESHOLD HAS TO SIT WHERE THE NOISE ACTUALLY IS.

     n and churn each average about a half, so a cutoff anywhere below that
     saturates and every lobe in the field disappears into one opaque sheet.
     That is what a miscalibrated smoothstep gets you: a wall of flat grey
     slabs with straight edges rather than a haboob. The band below brackets
     the field's real mean, so the billows survive. */
  float density = n * 0.60 + churn * 0.40;

  /* Dense at the base, ragged at the top, which is where a haboob loses its
     load, and the raggedness is the noise rather than a clean gradient. */
  float profile = 1.0 - smoothstep(0.10, 0.92 + churn * 0.20, vUv.y);
  float lobes = smoothstep(0.40, 0.74, density + profile * 0.26);

  /* The sheet has ends, and they have to be its own rather than the geometry's
     or the front reads as a flat card cut off in mid air. */
  float ends = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);

  float a = lobes * profile * ends * uAmount;
  if (a <= 0.004) discard;

  /* The top catches the sun while the base is already in its own shadow, and
     the lobes shade themselves: a haboob is not a flat colour. */
  vec3 c = uColor * (0.34 + 0.70 * vUv.y * uSunUp + 0.34 * churn - 0.16 * n);
  gl_FragColor = vec4(c, a * 0.88);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildDustWall() {
  const g = new THREE.PlaneGeometry(1, 1, 96, 24);
  g.translate(0.5, 0.5, 0);          // unit space, origin at the base corner
  const uniforms = {
    uTime: { value: 0 },
    uHeight: { value: WALL_HEIGHT_MAX },
    uSpan: { value: 90 * KM },
    uOrigin: { value: new THREE.Vector3() },
    uAlong: { value: new THREE.Vector2(WIND.dir.x, WIND.dir.z) },
    uColor: { value: new THREE.Color('#b08a52') },
    uAmount: { value: 0 },
    uSunUp: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms, vertexShader: WALL_VERT, fragmentShader: WALL_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = 'harmattan-wall';
  mesh.visible = false;
  return mesh;
}

/**
 * Place the wall at the front and size it to the view.
 * @param {THREE.Vector3} camScene camera position in scene space
 * @param {{x:number,z:number}} offset floating origin
 */
export function updateDustWall(mesh, weather, env, camScene, offset, altitude) {
  const u = mesh.material.uniforms;
  if (!weather.active) { mesh.visible = false; return; }

  const camAbsX = camScene.x + offset.x, camAbsZ = camScene.z + offset.z;
  const offsetToFront = weather.frontOffset(camAbsX, camAbsZ);

  /* Only worth drawing when the front is within sight of the camera, and
     never once the camera is well behind it and inside the dust. */
  const visible = offsetToFront > -40 * KM && offsetToFront < 260 * KM;
  mesh.visible = visible;
  if (!visible) return;

  /* The point on the front nearest the camera: slide back along the wind axis
     from the camera by however far ahead of the front it is. */
  const ax = camAbsX - WIND.dir.x * offsetToFront;
  const az = camAbsZ - WIND.dir.z * offsetToFront;

  u.uOrigin.value.set(ax - offset.x, SEA_LEVEL, az - offset.z);
  u.uTime.value = env.time;
  u.uAmount.value = Math.min(1, Math.max(0, 1 - offsetToFront / (200 * KM)));
  u.uSunUp.value = Math.max(0.15, env.sunDir.y);
  /* One to three kilometres high, taller the closer the front is, because a
     haboob seen from twenty kilometres away is mostly its own top. */
  u.uHeight.value = WALL_HEIGHT_MIN +
    (WALL_HEIGHT_MAX - WALL_HEIGHT_MIN) * Math.min(1, altitude / (8 * KM) + 0.45);
  /* Wide enough to reach past the frustum at this altitude. */
  u.uSpan.value = Math.max(40 * KM, Math.min(400 * KM, altitude * 26 + 40 * KM));
}

/* ---------------------------------------------------------------------------
   RAIN

   Brief and violent, which is the only kind the Sunlands get. Streaks rather
   than droplets, because at 1.4 m/s of walking and terminal velocity of about
   9 m/s a raindrop is a line, not a dot.
   ------------------------------------------------------------------------ */

const RAIN_VERT = /* glsl */`
precision highp float;
attribute float aSeed;
uniform float uTime;
uniform float uAmount;
uniform float uRadius;
uniform vec3 uCentre;
varying float vAlpha;
float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main(){
  float s = aSeed;
  float fall = 9.0;                          // metres a second, terminal
  float span = 220.0;
  float t = fract(h11(s * 5.1) + uTime * fall / span);
  float x = uCentre.x + (h11(s * 3.3) - 0.5) * uRadius;
  float z = uCentre.z + (h11(s * 7.9) - 0.5) * uRadius;
  float y = uCentre.y + span * (1.0 - t);
  /* Streak: the vertex's own y in the quad stretches the drop downward. */
  y += position.y * 1.6;
  vAlpha = uAmount * (0.35 + 0.65 * h11(s * 11.7));
  vec4 mv = viewMatrix * vec4(x + position.x * 0.03, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;
const RAIN_FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
varying float vAlpha;
void main(){
  if (vAlpha <= 0.004) discard;
  gl_FragColor = vec4(uColor, vAlpha * 0.30);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildRain(count = 4000) {
  /* Each drop is a thin vertical quad, so the streak is geometry rather than
     a point sprite that cannot be stretched. */
  const g = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  g.index = quad.index;
  g.attributes.position = quad.attributes.position;
  g.attributes.uv = quad.attributes.uv;
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = (i * 0.6180339887) % 1 * 967 + i * 0.29;
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uRadius: { value: 260 },
    uCentre: { value: new THREE.Vector3() },
    uColor: { value: new THREE.Color('#cfd8dd') },
  };
  const m = new THREE.ShaderMaterial({
    uniforms, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = 'rain';
  mesh.visible = false;
  return mesh;
}

export function updateRain(mesh, env, camScene, altitude) {
  const u = mesh.material.uniforms;
  /* Rain is only worth drawing where a person could feel it. */
  const on = env.weather === 'rain' && altitude < 900;
  mesh.visible = on;
  if (!on) return;
  u.uTime.value = env.time;
  u.uAmount.value = 1;
  u.uCentre.value.set(camScene.x, camScene.y - 90, camScene.z);
}
