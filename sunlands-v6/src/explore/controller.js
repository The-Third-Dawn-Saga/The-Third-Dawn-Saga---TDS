/* ============================================================================
   controller.js  ::  walking the world at true scale.

   Eye height 1.7 m. Walk 1.4 m/s. Run 4.5 m/s. These are real human numbers
   and they are not inflated to make the world feel smaller. Sundisk is 18 km
   across and crossing it on foot takes four and a half hours, which is the
   whole point.

   THE TRAVEL ACCELERATOR. True scale means a lot of empty sand, and the
   answer is not to shrink the world. It is to let the player move faster
   while telling them the truth: the readout always shows the real distance
   covered and the real time it would have taken to walk it. A 100x
   multiplier is presented as a travel accelerator, not as a running speed.

   Fast travel by caravan road, canal barge, sand sailer and Sun Eater lets
   the same journey be experienced at four different rates, all of them canon.
   ========================================================================= */

import * as THREE from 'three';
import { walkableHeight, terrainHeight, SEA_LEVEL } from '../terrain/height.js';
import { KM, TRAVEL, formatDistance, formatDuration } from '../units.js';

export const EYE_HEIGHT = 1.7;
export const WALK_SPEED = 1.4;
export const RUN_SPEED = 4.5;
export const JUMP_SPEED = 4.2;
export const GRAVITY = 19.6;
export const PLAYER_RADIUS = 0.34;

export const SPEED_STEPS = [1, 4, 20, 100];

/* Streaming radii, Part 6. */
export const FULL_DETAIL_RADIUS = 1.2 * KM;
export const PROXY_RADIUS = 6 * KM;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

export class ExploreController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement
   */
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.enabled = false;
    this.thirdPerson = false;

    /* Absolute position, in metres, because the player is a thing in the
       world and not a thing in the scene. The floating origin moves the
       scene under them. */
    this.abs = new THREE.Vector3(0, 0, 0);
    this.velY = 0;
    this.grounded = true;
    this.yaw = 0;
    this.pitch = 0;
    this.speedIndex = 0;

    /* Honest bookkeeping for the readout. */
    this.distanceWalked = 0;
    this.acceleratedDistance = 0;
    this.elapsedRealSeconds = 0;
    /* Seconds spent actually moving, so speed can be checked independently of
       frame rate: distanceWalked / movingSeconds must equal the walk speed
       whether the renderer is doing 120 fps or one. */
    this.movingSeconds = 0;

    this.keys = new Set();
    this.collision = null;
    this.onFootstep = null;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'KeyV') this.thirdPerson = !this.thirdPerson;
      if (e.code === 'KeyG') this.cycleSpeed();
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    };
    addEventListener('keydown', this._onKeyDown);
    addEventListener('keyup', this._onKeyUp);
    addEventListener('mousemove', this._onMouseMove);
  }

  dispose() {
    removeEventListener('keydown', this._onKeyDown);
    removeEventListener('keyup', this._onKeyUp);
    removeEventListener('mousemove', this._onMouseMove);
  }

  get speedMultiplier() { return SPEED_STEPS[this.speedIndex]; }
  cycleSpeed() { this.speedIndex = (this.speedIndex + 1) % SPEED_STEPS.length; }
  setSpeed(i) { this.speedIndex = Math.max(0, Math.min(SPEED_STEPS.length - 1, i)); }

  /** Drop the player in at an absolute position, standing on the ground. */
  enter(ax, az, headingDeg = 0) {
    this.abs.set(ax, walkableHeight(ax, az), az);
    this.yaw = -(headingDeg * Math.PI / 180);
    this.pitch = -0.08;
    this.velY = 0;
    this.enabled = true;
    this.distanceWalked = 0;
    this.acceleratedDistance = 0;
    this.elapsedRealSeconds = 0;
    this.movingSeconds = 0;
    this.dom.requestPointerLock?.();
  }

  exit() {
    this.enabled = false;
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  /** @param {object|null} collision city collision provider, or null */
  setCollision(collision) { this.collision = collision; }

  update(dt) {
    if (!this.enabled) return;
    this.elapsedRealSeconds += dt;

    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const base = running ? RUN_SPEED : WALK_SPEED;
    const speed = base * this.speedMultiplier;

    /* Heading 0 is east in this world's axes, and yaw rotates about +Y. */
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(_fwd.z, 0, -_fwd.x);

    _move.set(0, 0, 0);
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) _move.sub(_fwd);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) _move.add(_fwd);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) _move.sub(_right);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) _move.add(_right);

    let stepped = 0;
    if (_move.lengthSq() > 1e-6) {
      this.movingSeconds += dt;
      _move.normalize().multiplyScalar(speed * dt);
      const nx = this.abs.x + _move.x;
      const nz = this.abs.z + _move.z;
      const resolved = this.collision
        ? this.collision.resolve(nx, nz, PLAYER_RADIUS, this.abs.x, this.abs.z)
        : { x: nx, z: nz };
      stepped = Math.hypot(resolved.x - this.abs.x, resolved.z - this.abs.z);
      this.abs.x = resolved.x;
      this.abs.z = resolved.z;
      this.acceleratedDistance += stepped;
      /* What the player would actually have walked, at walking pace. */
      this.distanceWalked += stepped / this.speedMultiplier;
    }

    /* Ground following, with a step-up allowance so kerbs, ramps and stairs
       do not stop a walker dead. */
    const groundY = walkableHeight(this.abs.x, this.abs.z);
    const standY = this.collision
      ? Math.max(groundY, this.collision.floorAt(this.abs.x, this.abs.z, this.abs.y))
      : groundY;

    if (this.grounded && this.keys.has('Space')) {
      this.velY = JUMP_SPEED;
      this.grounded = false;
    }

    this.velY -= GRAVITY * dt;
    this.abs.y += this.velY * dt;

    const STEP_UP = 0.55;
    if (this.abs.y <= standY + 0.001 || (this.abs.y < standY + STEP_UP && this.velY <= 0)) {
      this.abs.y = standY;
      this.velY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    /* Footsteps, at a cadence that follows the real pace rather than the
       accelerated one, so 100x does not machine-gun. */
    if (this.grounded && stepped > 0 && this.onFootstep) {
      this._stepAccum = (this._stepAccum || 0) + stepped / this.speedMultiplier;
      const stride = running ? 1.55 : 0.78;
      while (this._stepAccum > stride) {
        this._stepAccum -= stride;
        this.onFootstep(this.abs.x, this.abs.z, running);
      }
    }
  }

  /** Place the camera. First person at eye height, third person behind. */
  applyToCamera(toScene) {
    const eyeAbs = this.abs.y + EYE_HEIGHT;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (!this.thirdPerson) {
      toScene(this.abs.x, eyeAbs, this.abs.z, this.camera.position);
    } else {
      const back = 4.2, up = 1.6;
      const bx = this.abs.x + Math.sin(this.yaw) * back;
      const bz = this.abs.z + Math.cos(this.yaw) * back;
      const groundBehind = walkableHeight(bx, bz);
      toScene(bx, Math.max(eyeAbs + up, groundBehind + 1.4), bz, this.camera.position);
    }
  }

  /** The honest readout, Part 6. */
  readout() {
    const walkHours = (this.distanceWalked / 1000) / TRAVEL[0].kmh;
    return {
      travelled: formatDistance(this.acceleratedDistance),
      onFoot: formatDistance(this.distanceWalked),
      wouldTake: formatDuration(walkHours),
      multiplier: this.speedMultiplier,
      accelerated: this.speedMultiplier > 1,
      metresPerSecond: this.movingSeconds > 0 ? this.distanceWalked / this.movingSeconds : 0,
    };
  }
}

/* ---------------------------------------------------------------------------
   CITY COLLISION

   Raycasting 34,000 instanced buildings per frame is not an option, so the
   generator's own building list is indexed into a uniform grid and the query
   is a 2D box test against the handful in the player's cell. Buildings are
   solid; the ground under them is their roof, which is what makes standing on
   a low roof work without a separate system.
   ------------------------------------------------------------------------ */

export class GridCollision {
  /**
   * @param {Array} rects {x, z, w, d, h, rot} in metres, local to the region
   * @param {number} originX region origin, absolute
   * @param {number} originZ
   * @param {number} cell
   */
  constructor(rects, originX, originZ, cell = 48) {
    this.cell = cell;
    this.ox = originX;
    this.oz = originZ;
    this.map = new Map();
    for (const r of rects) {
      const reach = Math.max(r.w, r.d) * 0.75 + 2;
      const i0 = Math.floor((r.x - reach) / cell), i1 = Math.floor((r.x + reach) / cell);
      const j0 = Math.floor((r.z - reach) / cell), j1 = Math.floor((r.z + reach) / cell);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = i * 100000 + j;
          let a = this.map.get(k);
          if (!a) { a = []; this.map.set(k, a); }
          a.push(r);
        }
      }
    }
  }

  cellAt(lx, lz) {
    return this.map.get(Math.floor(lx / this.cell) * 100000 + Math.floor(lz / this.cell));
  }

  /**
   * Push a proposed position out of any building it lands inside. Axis
   * separated, so sliding along a wall works instead of sticking.
   */
  resolve(nx, nz, radius, px, pz) {
    const lx = nx - this.ox, lz = nz - this.oz;
    const list = this.cellAt(lx, lz);
    if (!list) return { x: nx, z: nz };

    /* If the walker is ALREADY inside something, do not push: let them walk
       out. Otherwise a spawn inside a wall pins them there for good, which is
       how a character controller earns a reputation. */
    if (this.inside(px - this.ox, pz - this.oz, radius * 0.5)) return { x: nx, z: nz };

    let x = lx, z = lz;
    for (const r of list) {
      /* Into the building's own frame, test as a box, push out along the
         shallowest axis. */
      const c = Math.cos(-r.rot), s = Math.sin(-r.rot);
      const dx = x - r.x, dz = z - r.z;
      const bx = dx * c - dz * s;
      const bz = dx * s + dz * c;
      const hw = r.w / 2 + radius, hd = r.d / 2 + radius;
      if (Math.abs(bx) >= hw || Math.abs(bz) >= hd) continue;

      const penX = hw - Math.abs(bx);
      const penZ = hd - Math.abs(bz);
      let ox = 0, oz = 0;
      if (penX < penZ) ox = Math.sign(bx || 1) * penX;
      else oz = Math.sign(bz || 1) * penZ;
      /* Back to world. */
      const cc = Math.cos(r.rot), ss = Math.sin(r.rot);
      x += ox * cc - oz * ss;
      z += ox * ss + oz * cc;
    }
    return { x: x + this.ox, z: z + this.oz };
  }

  inside(lx, lz, radius) {
    const list = this.cellAt(lx, lz);
    if (!list) return false;
    for (const r of list) {
      const c = Math.cos(-r.rot), s = Math.sin(-r.rot);
      const dx = lx - r.x, dz = lz - r.z;
      const bx = dx * c - dz * s;
      const bz = dx * s + dz * c;
      if (Math.abs(bx) < r.w / 2 + radius && Math.abs(bz) < r.d / 2 + radius) return true;
    }
    return false;
  }

  /** Roof height under a position, or -Infinity if the player is not on one. */
  floorAt(ax, az, y) {
    const lx = ax - this.ox, lz = az - this.oz;
    const list = this.cellAt(lx, lz);
    if (!list) return -Infinity;
    let best = -Infinity;
    for (const r of list) {
      const c = Math.cos(-r.rot), s = Math.sin(-r.rot);
      const dx = lx - r.x, dz = lz - r.z;
      const bx = dx * c - dz * s;
      const bz = dx * s + dz * c;
      if (Math.abs(bx) < r.w / 2 && Math.abs(bz) < r.d / 2) {
        const roof = r.baseY + r.h;
        if (roof > best && y >= roof - 0.7) best = roof;
      }
    }
    return best;
  }
}

/* ---------------------------------------------------------------------------
   FOOTPRINTS

   Prints in sand that fill in over about ninety seconds in wind. Instanced
   quads with a per-instance age, faded in the shader, so a thousand prints
   cost one draw call and no CPU work per frame.
   ------------------------------------------------------------------------ */

const PRINT_LIFETIME = 90;

export class Footprints {
  constructor(scene, capacity = 512) {
    this.capacity = capacity;
    this.next = 0;
    this.time = 0;

    const g = new THREE.PlaneGeometry(0.26, 0.42);
    g.rotateX(-Math.PI / 2);

    const uniforms = {
      uTime: { value: 0 },
      uLifetime: { value: PRINT_LIFETIME },
      uColor: { value: new THREE.Color('#6b573a') },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */`
        precision highp float;
        attribute float aBorn;
        varying float vAge;
        void main(){
          vAge = aBorn;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime;
        uniform float uLifetime;
        uniform vec3 uColor;
        varying float vAge;
        void main(){
          float age = (uTime - vAge) / uLifetime;
          if (age < 0.0 || age > 1.0) discard;
          gl_FragColor = vec4(uColor, (1.0 - age) * 0.55);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(g, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.born = new Float32Array(capacity).fill(-1e9);
    this.mesh.geometry.setAttribute('aBorn', new THREE.InstancedBufferAttribute(this.born, 1));
    this.mesh.count = capacity;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    /* Park every instance below the world until it is used. */
    for (let i = 0; i < capacity; i++) {
      this._m.makeTranslation(0, -1e6, 0);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
    this.root = this.mesh;
  }

  /** @param {(x,y,z,out)=>void} toScene absolute to scene conversion */
  place(ax, az, heading, toScene) {
    const y = walkableHeight(ax, az) + 0.02;
    const p = new THREE.Vector3();
    toScene(ax, y, az, p);
    this._e.set(0, heading, 0);
    this._q.setFromEuler(this._e);
    this._m.compose(p, this._q, new THREE.Vector3(1, 1, 1));
    const i = this.next % this.capacity;
    this.mesh.setMatrixAt(i, this._m);
    this.born[i] = this.time;
    this.next++;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.getAttribute('aBorn').needsUpdate = true;
  }

  update(dt, shiftX, shiftZ) {
    this.time += dt;
    this.mesh.material.uniforms.uTime.value = this.time;
    /* Prints live in scene space, so a floating-origin rebase has to move
       them with everything else. */
    if (shiftX || shiftZ) {
      for (let i = 0; i < this.capacity; i++) {
        this.mesh.getMatrixAt(i, this._m);
        this._m.elements[12] -= shiftX;
        this._m.elements[14] -= shiftZ;
        this.mesh.setMatrixAt(i, this._m);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

/* ---------------------------------------------------------------------------
   FOOTSTEP AUDIO

   Synthesised, not sampled: a filtered noise burst with a fast envelope is a
   convincing footfall in sand and it keeps the site self-contained with no
   asset payload at all.
   ------------------------------------------------------------------------ */

export class FootstepAudio {
  constructor() { this.ctx = null; this.enabled = true; }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return null; }
    this.ctx = new AC();
    /* A second of noise, reused for every step. */
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x3fffffff) - 1;
    }
    return this.ctx;
  }

  step(running) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state === 'suspended') { ctx?.resume?.(); return; }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = running ? 900 + Math.random() * 500 : 620 + Math.random() * 340;
    filt.Q.value = 0.9;

    const g = ctx.createGain();
    const now = ctx.currentTime;
    const peak = running ? 0.10 : 0.055;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, now + (running ? 0.16 : 0.22));

    src.connect(filt); filt.connect(g); g.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.3);
  }
}
