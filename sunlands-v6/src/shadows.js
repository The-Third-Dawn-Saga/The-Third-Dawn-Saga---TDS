/* ============================================================================
   shadows.js  ::  cascaded sun shadows.

   One shadow map cannot serve both a forty kilometre vista and a doorway, so
   there are two cascades sized in metres and centred ahead of the camera: a
   near one that carries doorways, market awnings and the shadow a person
   casts, and a far one that carries the wall, the towers and the dune faces.
   Both follow the camera and both are snapped to their own texel grid, which
   is what stops the shadow edges crawling as the camera moves.

   Shadows are off entirely at Continental tier, per Part 2, and fade out
   through Kingdom tier because a nine metre wall casts a sub-pixel shadow
   from forty kilometres up and the pass is pure cost.

   The depth pass uses ONE override material for everything. That means the
   terrain's geomorph is not applied in the shadow pass, and the error that
   introduces is bounded by the level's own geometric error, which the depth
   bias already has to cover. One material instead of one per shader is worth
   that.
   ========================================================================= */

import * as THREE from 'three';
import { KM } from './units.js';

/* Near cascade first. Sizes are the half-extent of the orthographic box. */
export const CASCADES = [
  { size: 90, res: 768, bias: 0.0018 },
  { size: 620, res: 768, bias: 0.0050 },
];

/* Above this altitude the near cascade is behind the camera and useless, so
   only the far one is rendered. That halves the pass exactly where the
   resident chunk count is highest. */
const NEAR_CASCADE_CEILING = 1200;

const DEPTH_VERT = /* glsl */`
precision highp float;
void main(){
  #ifdef USE_INSTANCING
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    vec4 wp = modelMatrix * vec4(position, 1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const DEPTH_FRAG = /* glsl */`
precision highp float;
void main(){ gl_FragColor = vec4(1.0); }
`;

/** GLSL the lit materials include to sample the cascades. */
export const GLSL_SHADOW = /* glsl */`
uniform sampler2D tShadow0;
uniform sampler2D tShadow1;
uniform mat4 uShadowVP0;
uniform mat4 uShadowVP1;
uniform vec2 uShadowBias;
uniform float uShadowTexel;
uniform float uShadowStrength;

float sampleCascade(sampler2D tex, mat4 vp, vec3 worldPos, float bias, float NdL){
  vec4 lp = vp * vec4(worldPos, 1.0);
  vec3 uv = lp.xyz / lp.w * 0.5 + 0.5;
  if (uv.x < 0.005 || uv.x > 0.995 || uv.y < 0.005 || uv.y > 0.995 || uv.z > 1.0) return -1.0;
  /* Slope-scaled bias: a surface edge-on to the sun needs far more of it. */
  float b = bias * (1.0 + 2.6 * (1.0 - clamp(NdL, 0.0, 1.0)));
  float lit = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      float d = texture2D(tex, uv.xy + vec2(float(i), float(j)) * uShadowTexel).x;
      lit += (uv.z - b <= d) ? 1.0 : 0.0;
    }
  }
  return lit / 9.0;
}

float sunShadow(vec3 worldPos, float NdL){
  if (uShadowStrength <= 0.001) return 1.0;
  float s = sampleCascade(tShadow0, uShadowVP0, worldPos, uShadowBias.x, NdL);
  if (s < 0.0) s = sampleCascade(tShadow1, uShadowVP1, worldPos, uShadowBias.y, NdL);
  if (s < 0.0) return 1.0;
  return mix(1.0, s, uShadowStrength);
}
`;

export function shadowUniforms() {
  return {
    tShadow0: { value: null },
    tShadow1: { value: null },
    uShadowVP0: { value: new THREE.Matrix4() },
    uShadowVP1: { value: new THREE.Matrix4() },
    uShadowBias: { value: new THREE.Vector2(CASCADES[0].bias, CASCADES[1].bias) },
    uShadowTexel: { value: 1 / CASCADES[0].res },
    uShadowStrength: { value: 0 },
  };
}

export class SunShadows {
  constructor(renderer) {
    this.renderer = renderer;
    this.depthMaterial = new THREE.ShaderMaterial({
      vertexShader: DEPTH_VERT,
      fragmentShader: DEPTH_FRAG,
      side: THREE.FrontSide,
    });
    this.cascades = CASCADES.map(c => {
      const rt = new THREE.WebGLRenderTarget(c.res, c.res, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        format: THREE.RGBAFormat,
      });
      rt.depthTexture = new THREE.DepthTexture(c.res, c.res);
      rt.depthTexture.type = THREE.UnsignedIntType;
      rt.depthTexture.minFilter = THREE.NearestFilter;
      rt.depthTexture.magFilter = THREE.NearestFilter;
      const cam = new THREE.OrthographicCamera(-c.size, c.size, c.size, -c.size, 1, c.size * 8);
      return { ...c, rt, cam, vp: new THREE.Matrix4() };
    });
    this.strength = 0;
    this._centre = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    /* Shadows change far more slowly than the camera does, so the cascades
       are re-rendered on alternate frames unless the sun has moved. That is
       half the pass for a difference nobody can see. */
    this._frame = 0;
    this._lastSunY = -99;
    this.nearActive = true;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Vector3} sunDir points from the surface toward the sun
   * @param {number} altitude metres above the ground
   * @param {object} env
   * @param {Array<THREE.Object3D>} hide things that must not cast
   */
  render(scene, camera, sunDir, altitude, env, hide) {
    /* Off at Continental, fading out through Kingdom: a nine metre wall casts
       a sub-pixel shadow from forty kilometres up. */
    const tierFade = 1 - Math.min(1, Math.max(0, (altitude - 3 * KM) / (12 * KM)));
    const sunUp = Math.max(0, sunDir.y);
    this.strength = tierFade * Math.min(1, sunUp * 4) * (env ? env.shadowStrength : 1) * 0.72;
    if (this.strength <= 0.004) return false;

    this._frame++;
    const sunMoved = Math.abs(sunDir.y - this._lastSunY) > 1e-4;
    if (!sunMoved && (this._frame & 1)) return true;      // cascades still valid
    this._lastSunY = sunDir.y;

    camera.getWorldDirection(this._fwd);
    const prevTarget = this.renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevVisible = hide.map(o => o.visible);
    for (const o of hide) o.visible = false;
    scene.overrideMaterial = this.depthMaterial;

    const active = altitude > NEAR_CASCADE_CEILING ? this.cascades.slice(1) : this.cascades;
    this.nearActive = active.length > 1;
    for (const c of active) {
      /* Centre the box ahead of the camera, then snap it to its own texel
         grid so the shadow edges do not crawl as the camera moves. */
      this._centre.copy(camera.position).addScaledVector(this._fwd, c.size * 0.55);
      const texel = (c.size * 2) / c.res;
      this._centre.x = Math.round(this._centre.x / texel) * texel;
      this._centre.z = Math.round(this._centre.z / texel) * texel;

      const dist = c.size * 3.2;
      c.cam.position.copy(this._centre).addScaledVector(sunDir, dist);
      c.cam.up.set(0, 1, 0);
      c.cam.lookAt(this._centre);
      c.cam.near = 1;
      c.cam.far = dist * 2.4;
      c.cam.left = -c.size; c.cam.right = c.size;
      c.cam.top = c.size; c.cam.bottom = -c.size;
      c.cam.updateProjectionMatrix();
      c.cam.updateMatrixWorld(true);
      c.vp.multiplyMatrices(c.cam.projectionMatrix, c.cam.matrixWorldInverse);

      this.renderer.setRenderTarget(c.rt);
      this.renderer.clear(true, true, false);
      this.renderer.render(scene, c.cam);
    }

    scene.overrideMaterial = prevOverride;
    this.renderer.setRenderTarget(prevTarget);
    hide.forEach((o, i) => { o.visible = prevVisible[i]; });
    return true;
  }

  /** Push the cascade state into a material that included GLSL_SHADOW. */
  apply(material) {
    const u = material.uniforms;
    if (!u || !u.uShadowStrength) return;
    u.tShadow0.value = this.cascades[0].rt.depthTexture;
    u.tShadow1.value = this.cascades[1].rt.depthTexture;
    u.uShadowVP0.value.copy(this.cascades[0].vp);
    u.uShadowVP1.value.copy(this.cascades[1].vp);
    u.uShadowTexel.value = 1 / this.cascades[0].res;
    u.uShadowStrength.value = this.strength;
    /* When only the far cascade is live, the near one holds a stale matrix;
       collapsing it to the far one keeps the two-tap lookup correct without
       branching in the shader. */
    if (!this.nearActive) u.uShadowVP0.value.copy(this.cascades[1].vp);
  }
}
