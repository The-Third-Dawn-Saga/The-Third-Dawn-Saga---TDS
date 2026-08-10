/* ============================================================================
   wall.js  ::  the Great Wall, its towers, and the six gates.

   OPEN O-6: canon says the wall is "3 m or more". At a capital of a million
   and a half that is a garden wall, so this model builds it at 9 m with a 3 m
   parapet and flags the change rather than quietly adopting it.

   Towers every 180 m, which around a 5,500 m ring is 192 of them. Four
   cardinal gates with barbicans, queue lines and tax booths, plus two service
   gates. The queue at the eastern gate is longest at dawn, because that is
   when the market opens and when the caravans that camped outside come in.
   ========================================================================= */

import * as THREE from 'three';
import { CITY_GROUND_Y } from '../terrain/height.js';
import { InstanceSet, geometryKit } from './kit.js';
import { goldRatio } from './materials.js';
import { CITY } from './sundisk.js';
import { makeRng, seedFrom } from '../world.js';

const G = CITY_GROUND_Y;

export function buildWall(ctx) {
  const mat = ctx.sunklay;
  const geo = geometryKit();
  const rng = makeRng(seedFrom('great-wall'));

  const segs = new InstanceSet(geo.box, mat, 1024);
  const towers = new InstanceSet(geo.cyl, mat, 256);
  const booths = new InstanceSet(geo.house, mat, 128);

  const R = CITY.wall;
  const H = CITY.wallHeight;
  const P = CITY.wallParapet;
  const T = CITY.wallThickness;

  /* Gate bearings, converted once. Compass 0 is north, which is -Z here. */
  const gateAngles = CITY.gates.map(g => ({
    a: (g.bearing - 90) * Math.PI / 180, ...g,
  }));

  const nTowers = Math.round((2 * Math.PI * R) / CITY.towerSpacing);
  const segCount = nTowers * 3;                 // three wall segments per bay

  for (let i = 0; i < segCount; i++) {
    const a = (i / segCount) * Math.PI * 2;
    /* Leave a gap where a gate stands. */
    let atGate = false;
    for (const g of gateAngles) {
      let d = Math.abs(((a - g.a + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (d * R < (g.service ? 22 : 42)) atGate = true;
    }
    if (atGate) continue;

    const segLen = (2 * Math.PI * R) / segCount * 1.02;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    const gold = goldRatio(R, 0.45, 0.8);
    segs.add(x, G, z, T, H, segLen, a, gold, 0.55, 0.25);
    /* The parapet, set back and crenellated by the gaps between instances. */
    segs.add(x, G + H, z, T * 0.55, P, segLen * 0.62, a, gold, 0.6, 0.22);
  }

  for (let i = 0; i < nTowers; i++) {
    const a = (i / nTowers) * Math.PI * 2;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    towers.add(x, G, z, 9.5, H + P + 4.5, 9.5, 0, goldRatio(R, 0.5, 0.9), 0.6, 0.2);
  }

  /* ---- gates -------------------------------------------------------------
     Barbican, tax booths, and a queue line that is longest at dawn. The
     queue itself is instanced people, added by the crowd system; what is
     built here is the architecture that makes people queue. */
  for (const g of gateAngles) {
    const a = g.a;
    const cx = Math.cos(a) * R, cz = Math.sin(a) * R;
    const w = g.service ? 26 : 52;
    const towerH = H + P + (g.service ? 6 : 14);
    const gold = goldRatio(R, g.service ? 0.3 : 0.7, 1.0);

    /* Flanking gate towers. */
    for (const s of [-1, 1]) {
      const ox = Math.cos(a + Math.PI / 2) * (w / 2) * s;
      const oz = Math.sin(a + Math.PI / 2) * (w / 2) * s;
      towers.add(cx + ox, G, cz + oz, 15, towerH, 15, 0, gold, 0.65, 0.15);
    }
    /* The barbican: an outwork in front of the gate, so an attacker who gets
       through the first arch is standing in a box. */
    const bx = Math.cos(a) * (R + 34), bz = Math.sin(a) * (R + 34);
    segs.add(bx, G, bz, 10, H * 0.8, w * 0.9, a, gold * 0.7, 0.55, 0.3);
    for (const s of [-1, 1]) {
      const ox = Math.cos(a + Math.PI / 2) * (w / 2) * s;
      const oz = Math.sin(a + Math.PI / 2) * (w / 2) * s;
      segs.add(cx + ox * 1.0 + Math.cos(a) * 17, G, cz + oz * 1.0 + Math.sin(a) * 17,
        34, H * 0.8, 6, a, gold * 0.7, 0.55, 0.3);
    }
    /* Tax booths along the approach road. Nobody passes without paying. */
    if (!g.service) {
      for (let k = 0; k < 4; k++) {
        const d = R + 70 + k * 46;
        for (const s of [-1, 1]) {
          const ox = Math.cos(a + Math.PI / 2) * 13 * s;
          const oz = Math.sin(a + Math.PI / 2) * 13 * s;
          booths.add(Math.cos(a) * d + ox, G, Math.sin(a) * d + oz,
            5, 3.4, 4, a, gold * 0.25, 0.6, 0.35);
        }
      }
    }
  }

  /* ---- drum towers -------------------------------------------------------
     They fire the market close at solar noon. Four of them, one per quarter,
     inside the Middle Ring where the market can hear them. */
  const drums = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 2450, z = Math.sin(a) * 2450;
    towers.add(x, G, z, 11, 30, 11, 0, goldRatio(2450, 0.6, 0.9), 0.6, 0.15);
    drums.push({ x, z });
  }

  const grp = new THREE.Group();
  grp.name = 'great-wall';
  for (const [set, name] of [[segs, 'wall-segments'], [towers, 'wall-towers'], [booths, 'tax-booths']]) {
    const m = set.build(name);
    if (m) grp.add(m);
  }
  grp.userData.drums = drums;
  grp.userData.towerCount = nTowers;
  return grp;
}

/* ---------------------------------------------------------------------------
   THE THREE UNDERGROUND RIVERS

   Water is the reason the city exists, so it has to be visible. The three
   rivers surface inside the wall as stone-lined channels and feed public
   fountains at every ring-street crossing.
   ------------------------------------------------------------------------ */

export function buildCityWater(ctx) {
  const mat = ctx.sunklay;
  const geo = geometryKit();
  const kerbs = new InstanceSet(geo.box, mat, 2048);
  const basins = new InstanceSet(geo.cyl, mat, 256);
  const rng = makeRng(seedFrom('three-rivers'));

  const grp = new THREE.Group();
  grp.name = 'city-water';

  /* Three rivers converging on the centre, which is why the city is here. */
  const channels = [];
  for (let r = 0; r < 3; r++) {
    const a = (r / 3) * Math.PI * 2 + 0.5;
    const pts = [];
    for (let t = 0; t <= 24; t++) {
      const f = t / 24;
      const rr = 140 + f * (CITY.wall - 140);
      const wob = Math.sin(f * 7.0 + r * 2.1) * 0.055;
      pts.push([Math.cos(a + wob) * rr, Math.sin(a + wob) * rr]);
    }
    channels.push(pts);

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const ang = Math.atan2(dz, dx);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      /* Stone kerbs either side of a 7 m channel. */
      for (const s of [-1, 1]) {
        kerbs.add(mx + Math.cos(ang + Math.PI / 2) * 4.2 * s, G,
          mz + Math.sin(ang + Math.PI / 2) * 4.2 * s,
          len, 0.9, 1.6, ang, 0.02, 0.75, 0.2);
      }
    }
  }
  grp.userData.channels = channels;

  /* Public fountains where the channels cross the ring streets. */
  for (const pts of channels) {
    for (let i = 2; i < pts.length; i += 4) {
      const [x, z] = pts[i];
      basins.add(x, G, z, 11, 1.1, 11, 0, goldRatio(Math.hypot(x, z), 0.5, 0.7), 0.8, 0.12);
    }
  }

  for (const [set, name] of [[kerbs, 'river-kerbs'], [basins, 'fountains']]) {
    const m = set.build(name);
    if (m) grp.add(m);
  }
  return grp;
}
