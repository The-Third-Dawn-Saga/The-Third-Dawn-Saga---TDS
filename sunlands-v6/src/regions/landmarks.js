/* ============================================================================
   landmarks.js  ::  the places canon describes building by building.

   The Golden Gate Terminal complex, the military base that controls its
   approach, the Grand Arena, Sol'khari's Pyramid Collector field, and the
   Shapes in the Glass Desert.
   ========================================================================= */

import * as THREE from 'three';
import { InstanceSet, geometryKit } from '../city/kit.js';
import { goldRatio } from '../city/materials.js';
import { makeRng, seedFrom } from '../world.js';
import { walkableHeight } from '../terrain/height.js';
import { KM } from '../units.js';

/* ---------------------------------------------------------------------------
   THE GOLDEN GATE TERMINAL

   Five buildings, four checkpoint booths on the approach road, an outer
   security wall, an inner barrier around the Gate itself, and the uranium
   containment vault that glows green at night. The complex sits 3 km
   northeast of the outer wall and everything about its layout is about
   control: nothing reaches the Gate without passing the military base first.
   ------------------------------------------------------------------------ */

export function buildGateTerminal(p, ctx) {
  const mat = ctx.sunklay;
  const geo = geometryKit();
  const rng = makeRng(seedFrom('golden-gate'));
  const y = walkableHeight(p.x, p.z);
  const set = new InstanceSet(geo.house, mat, 256);
  const grp = new THREE.Group();
  grp.name = 'golden-gate-terminal';

  /* The five buildings, sized by what canon says they do. */
  const buildings = [
    { name: 'Main Registration Hall', x: 0, z: 0, w: 120, d: 80, h: 18, gold: 0.95 },
    { name: 'Security Station', x: -95, z: -55, w: 55, d: 42, h: 12, gold: 0.6 },
    { name: 'Customs and Cargo Inspection', x: 100, z: -50, w: 78, d: 46, h: 11, gold: 0.45 },
    { name: 'Noble Waiting Lounge', x: -80, z: 70, w: 62, d: 40, h: 14, gold: 1.0 },
    { name: 'ATA Administration', x: 95, z: 66, w: 48, d: 36, h: 12, gold: 0.7 },
  ];
  for (const b of buildings) {
    set.add(b.x, y, b.z, b.w, b.h, b.d, 0, b.gold, 0.85, 0.05);
  }

  /* Four checkpoint booths with barrier arms along the approach road, which
     runs back southwest toward the military base and the city. */
  const roadA = Math.atan2(1, -1);       // toward the city, southwest
  for (let k = 0; k < 4; k++) {
    const d = 150 + k * 90;
    const bx = Math.cos(roadA) * d, bz = Math.sin(roadA) * d;
    for (const s of [-1, 1]) {
      set.add(bx + Math.cos(roadA + Math.PI / 2) * 9 * s, y,
        bz + Math.sin(roadA + Math.PI / 2) * 9 * s, 4.5, 3.2, 3.5, roadA, 0.25, 0.7, 0.2);
    }
    /* The barrier arm itself. */
    set.add(bx, y + 2.4, bz, 20, 0.35, 0.35, roadA + Math.PI / 2, 0.5, 0.9, 0.1);
  }

  /* Outer security wall, and an inner barrier ring around the Gate. */
  const wallSet = new InstanceSet(geo.box, mat, 256);
  for (const [radius, height, gold] of [[290, 5.5, 0.2], [58, 3.2, 0.8]]) {
    const n = Math.round((2 * Math.PI * radius) / 18);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      wallSet.add(Math.cos(a) * radius, y, Math.sin(a) * radius,
        2.2, height, (2 * Math.PI * radius) / n * 1.05, a, gold, 0.6, 0.25);
    }
  }

  /* The Gate itself: a portal ring, and the uranium vault behind it. */
  const portal = new THREE.Mesh(
    new THREE.TorusGeometry(24, 2.6, 12, 48),
    gateRingMaterial());
  portal.position.set(0, y + 26, 0);
  portal.rotation.y = roadA + Math.PI / 2;
  portal.name = 'golden-gate-portal';
  grp.add(portal);

  const vault = new THREE.Mesh(
    new THREE.BoxGeometry(46, 12, 34),
    vaultMaterial());
  vault.position.set(-Math.cos(roadA) * 190, y + 6, -Math.sin(roadA) * 190);
  vault.name = 'uranium-vault';
  grp.add(vault);

  for (const [s, n] of [[set, 'buildings'], [wallSet, 'walls']]) {
    const m = s.build(`gate-${n}`);
    if (m) grp.add(m);
  }

  grp.userData.gate = { portal, vault };
  return grp;
}

function gateRingMaterial() {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#f4d35e'), transparent: true, opacity: 0.9,
  });
  m.userData.ownedByRegion = true;
  return m;
}
function vaultMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2b3a2b') });
  m.userData.ownedByRegion = true;
  return m;
}

/* ---------------------------------------------------------------------------
   THE MILITARY BASE
   ------------------------------------------------------------------------ */

export function buildMilitaryBase(p, ctx) {
  const mat = ctx.sunklay;
  const geo = geometryKit();
  const rng = makeRng(seedFrom('military-base'));
  const y = walkableHeight(p.x, p.z);
  const set = new InstanceSet(geo.house, mat, 128);

  /* Barracks in ranks, a parade ground, and a perimeter. Everything faces the
     road between the Gate and the city, because that is what it is for. */
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      set.add(-120 + c * 58, y, -70 + r * 44, 44, 6, 15, 0, 0.08, 0.45, 0.3);
    }
  }
  for (let s = 0; s < 4; s++) {
    const a = s * Math.PI / 2;
    set.add(Math.cos(a) * 210, y, Math.sin(a) * 210,
      s % 2 ? 4 : 420, 6.5, s % 2 ? 420 : 4, 0, 0.05, 0.4, 0.35);
  }
  const grp = new THREE.Group();
  grp.name = 'military-base';
  const m = set.build('military-base');
  if (m) grp.add(m);
  return grp;
}

/* ---------------------------------------------------------------------------
   THE GRAND ARENA

   100,000 capacity. Stepped seating tiers, four cardinal entrance arches with
   gilded frames, a sand-floored fighting pit, its own plaza, and an approach
   road from the south gate.
   ------------------------------------------------------------------------ */

export function buildArena(p, ctx) {
  const mat = ctx.sunklay;
  const geo = geometryKit();
  const y = walkableHeight(p.x, p.z);
  const set = new InstanceSet(geo.box, mat, 1024);
  const grp = new THREE.Group();
  grp.name = 'grand-arena';

  /* 100,000 seats at half a square metre each, in a bowl: an outer radius
     near 150 m, which is the size of a real colosseum and then some. */
  const pitR = 62, outerR = 152;
  const tiers = 9;
  for (let t = 0; t < tiers; t++) {
    const r0 = pitR + (t / tiers) * (outerR - pitR);
    const h = 3.5 + t * 3.4;
    const n = Math.round((2 * Math.PI * r0) / 9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      set.add(Math.cos(a) * r0, y, Math.sin(a) * r0,
        (outerR - pitR) / tiers * 1.05, h, (2 * Math.PI * r0) / n * 1.03, a,
        goldRatio(2000, 0.5, 0.5) * (t / tiers) * 0.6, 0.55, 0.25);
    }
  }

  /* Four cardinal entrance arches with gilded frames. */
  for (let s = 0; s < 4; s++) {
    const a = s * Math.PI / 2;
    const x = Math.cos(a) * (outerR + 8), z = Math.sin(a) * (outerR + 8);
    set.add(x, y, z, 26, 34, 18, a, 0.95, 0.9, 0.05);
  }

  /* The sand floor. */
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(pitR, 48),
    arenaSandMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y + 0.2;
  grp.add(floor);

  const m = set.build('arena');
  if (m) grp.add(m);
  return grp;
}

function arenaSandMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c8a86a') });
  m.userData.ownedByRegion = true;
  return m;
}

/* ---------------------------------------------------------------------------
   THE PYRAMID COLLECTOR FIELD

   Forty and more of them at Sol'khari. Fifteen-foot stone pyramids whose four
   faces split along the centre and hinge outward like a four-petalled flower,
   doubling the collection surface. The v5 activation sequence is preserved
   whole: opening, beams, absorbing, peak, closing.
   ------------------------------------------------------------------------ */

export const PYRAMID_PHASES = [
  { name: 'OPENING', dur: 8 },
  { name: 'SUNLIGHT BEAMS DESCENDING', dur: 6 },
  { name: 'DIVINE FLOW CONVERSION', dur: 12 },
  { name: 'PEAK ABSORPTION', dur: 10 },
  { name: 'CYCLE ENDING', dur: 8 },
];

export function buildPyramidField(p, ctx) {
  const rng = makeRng(seedFrom('pyramid-collectors'));
  const grp = new THREE.Group();
  grp.name = 'pyramid-collectors';

  const stone = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5a5148'), roughness: 0.85, metalness: 0.05,
  });
  stone.userData.ownedByRegion = true;
  const inner = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8a6a24'), roughness: 0.35, metalness: 0.4,
    emissive: new THREE.Color('#3a2a08'), emissiveIntensity: 0,
  });
  inner.userData.ownedByRegion = true;
  const crystalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e8e0c8'), roughness: 0.1, metalness: 0.0,
    emissive: new THREE.Color('#f4d35e'), emissiveIntensity: 0.2,
    transparent: true, opacity: 0.92,
  });
  crystalMat.userData.ownedByRegion = true;

  /* A petal is half a pyramid face, hinged at the base. */
  const petalGeo = new THREE.ConeGeometry(3.2, 4.6, 4, 1);
  petalGeo.translate(0, 2.3, 0);
  const crystalGeo = new THREE.OctahedronGeometry(0.9, 0);

  const pyramids = [];
  const count = 44;
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const rr = 120 + Math.sqrt(rng()) * 900;
    const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
    const y = walkableHeight(p.x + px, p.z + pz);

    const pg = new THREE.Group();
    pg.position.set(px, y, pz);

    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 9), stone);
    base.position.y = 0.6;
    pg.add(base);

    const petals = [];
    for (let f = 0; f < 4; f++) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 1.2, 0);
      pivot.rotation.y = f * Math.PI / 2;
      const petal = new THREE.Mesh(petalGeo, f % 2 ? stone : inner);
      petal.position.set(0, 0, 2.2);
      petal.rotation.x = 0;
      pivot.add(petal);
      pivot.rotation.x = -1.2;                 // closed at rest
      pg.add(pivot);
      petals.push({ pivot, mesh: petal });
    }

    const crystal = new THREE.Mesh(crystalGeo, crystalMat.clone());
    crystal.material.userData.ownedByRegion = true;
    crystal.position.y = 2.4;
    pg.add(crystal);

    grp.add(pg);
    pyramids.push({ group: pg, petals, crystal, phase: rng() });
  }

  grp.userData.pyramids = pyramids;
  return grp;
}

/**
 * The v5 five-phase activation, preserved. Idle is petals nearly closed with
 * a gentle crystal glow; active runs opening, beams, absorbing, peak, closing
 * with a per-pyramid stagger.
 */
export function updatePyramids(grp, state, dt, env) {
  const list = grp.userData.pyramids;
  if (!list) return;
  const t = env.time;

  if (!state.active) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.crystal.rotation.y += 0.003;
      p.crystal.material.emissiveIntensity = 0.2 + Math.sin(t * 0.8 + i) * 0.08;
      for (const pt of p.petals) pt.pivot.rotation.x = -1.15 + Math.sin(t * 0.3 + i) * 0.04;
    }
    return;
  }

  state.timer += dt;
  const phase = PYRAMID_PHASES[state.phase];
  const dur = phase ? phase.dur : 1;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const stag = Math.max(0, Math.min(1, (state.timer - i * 0.1) / dur));
    if (state.phase === 0) {
      for (const pt of p.petals) pt.pivot.rotation.x = -1.2 + 1.5 * stag;
      p.crystal.material.emissiveIntensity = 0.2 + stag * 1.2;
      p.crystal.rotation.y += 0.01;
    } else if (state.phase === 1) {
      for (const pt of p.petals) pt.pivot.rotation.x = 0.3;
      p.crystal.material.emissiveIntensity = 1.4 + Math.sin(t * 4 + i) * 0.3;
      p.crystal.rotation.y += 0.02;
    } else if (state.phase === 2 || state.phase === 3) {
      for (const pt of p.petals) pt.pivot.rotation.x = 0.3;
      p.crystal.material.emissiveIntensity = 1.8 + stag * 0.6 + Math.sin(t * 3 + i) * 0.2;
      p.crystal.rotation.y += 0.03;
      /* Clear quartz shifting to warm amber as it saturates. */
      p.crystal.material.color.lerp(new THREE.Color('#f0b040'), 0.006);
    } else if (state.phase === 4) {
      for (const pt of p.petals) pt.pivot.rotation.x = 0.3 - 1.5 * stag;
      p.crystal.material.emissiveIntensity = 2.2 * (1 - stag) + 0.2;
    }
  }

  if (state.timer >= dur) {
    state.phase++;
    state.timer = 0;
    if (state.phase >= PYRAMID_PHASES.length) {
      state.active = false;
      state.phase = 0;
      state.done = true;
    }
  }
}

/* ---------------------------------------------------------------------------
   THE SHAPES

   Frozen humanoid glass formations in three cluster fields. Canon behaviour:
   they move when you are not looking. So a Shape is only ever repositioned
   while it is outside the view frustum, and never while any part of it is on
   screen. That is the whole trick, and it is enforced by the frustum test
   rather than by a timer.
   ------------------------------------------------------------------------ */

export function buildShapes(p, ctx) {
  const rng = makeRng(seedFrom('the-shapes'));
  const grp = new THREE.Group();
  grp.name = 'the-shapes';

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#9fb4c4'),
    roughness: 0.06, metalness: 0.0,
    transmission: 0.86, thickness: 1.2, ior: 1.5,
    transparent: true, opacity: 0.85,
  });
  mat.userData.ownedByRegion = true;

  /* A Shape is a person, roughly: a body, a head, and the suggestion of
     arms. Low poly on purpose, because what makes them work is that they
     have moved, not that they are detailed. */
  const body = new THREE.CapsuleGeometry(0.32, 1.1, 3, 8);
  const head = new THREE.SphereGeometry(0.22, 8, 6);

  const shapes = [];
  for (let field = 0; field < 3; field++) {
    const fa = (field / 3) * Math.PI * 2 + 0.7;
    const fr = 12 * KM + field * 9 * KM;
    const fx = Math.cos(fa) * fr, fz = Math.sin(fa) * fr;
    for (let i = 0; i < 30; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * 900;
      const x = fx + Math.cos(a) * rr, z = fz + Math.sin(a) * rr;
      const y = walkableHeight(p.x + x, p.z + z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rng() * Math.PI * 2;
      const b = new THREE.Mesh(body, mat); b.position.y = 1.0; g.add(b);
      const h = new THREE.Mesh(head, mat); h.position.y = 1.85; g.add(h);
      grp.add(g);
      shapes.push({ group: g, home: new THREE.Vector3(x, y, z), field, moved: 0 });
    }
  }
  grp.userData.shapes = shapes;
  return grp;
}

const _sphere = new THREE.Sphere();
const _wp = new THREE.Vector3();

/**
 * @param {THREE.Frustum} frustum in the same space as the group's world matrix
 */
export function updateShapes(grp, frustum, rngState) {
  const shapes = grp.userData.shapes;
  if (!shapes) return 0;
  let moved = 0;
  for (const s of shapes) {
    s.group.getWorldPosition(_wp);
    _sphere.center.copy(_wp);
    _sphere.radius = 3.2;                 // generous: no part of it may be on screen
    if (frustum.intersectsSphere(_sphere)) continue;

    /* Off screen. Move it, but rarely, so that a traveller who looks away and
       back finds one Shape different rather than all of them. */
    rngState.t = (rngState.t * 1664525 + 1013904223) >>> 0;
    if ((rngState.t & 1023) > 6) continue;
    const a = (rngState.t % 6283) / 1000;
    const d = 2 + ((rngState.t >>> 10) % 900) / 100;
    s.group.position.x = s.home.x + Math.cos(a) * d * 3;
    s.group.position.z = s.home.z + Math.sin(a) * d * 3;
    s.group.rotation.y = a;
    s.moved++;
    moved++;
  }
  return moved;
}
