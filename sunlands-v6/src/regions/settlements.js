/* ============================================================================
   settlements.js  ::  generic builders for the named places.

   Every canon settlement gets the same three levels the region manager asks
   for, generated from its population and its kind rather than hand placed.
   Two towns of 70,000 do not look identical, because the seed comes from the
   place id, but they do obey the same rules, which is what makes the
   territory read as one culture.
   ========================================================================= */

import * as THREE from 'three';
import { InstanceSet, geometryKit } from '../city/kit.js';
import { goldRatio } from '../city/materials.js';
import { makeRng, seedFrom } from '../world.js';
import { walkableHeight, SEA_LEVEL } from '../terrain/height.js';

/**
 * Radius of a settlement from its population, at the same density Sundisk is
 * derived from. OPEN O-1 covers the density figure.
 */
export function townRadius(population) {
  const perSqKm = 15000;
  return Math.max(120, Math.sqrt(population / perSqKm / Math.PI) * 1000);
}

/**
 * @param {object} p canon place record
 * @param {object} ctx build context
 * @param {number} detail 1 full, ~0.2 blocks
 */
export function buildTown(p, ctx, detail = 1) {
  const rng = makeRng(seedFrom(p.id));
  const geo = geometryKit();
  const mat = ctx.sunklay;
  const pop = parsePop(p.population);
  const R = townRadius(pop);
  const ground = walkableHeight(p.x, p.z);
  const y = ground - 0;

  const houses = new InstanceSet(geo.house, mat, 2048);
  const silos = new InstanceSet(geo.silo, mat, 64);
  const palms = new InstanceSet(geo.cone, mat, 512);

  /* A town is a knot of lanes around a market square and a well, thinning
     outward. No grid: only the capital is planned. */
  const count = Math.max(24, Math.round(Math.min(2600, pop / 26) * detail));
  const kind = p.kind || '';
  const isPort = /port|harbor|coast|merchant/i.test(kind + p.name);
  const isOasis = /oasis/i.test(kind + p.name);
  const isMine = /mining|mines/i.test(kind + p.name);

  for (let i = 0; i < count; i++) {
    /* Square root keeps the density flat per unit area instead of piling
       everything on the square. */
    const rr = Math.pow(rng(), 0.62) * R;
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    /* Leave the market square open. */
    if (rr < R * 0.10) continue;

    const wealth = Math.max(0.05, 0.62 - rr / R * 0.5);
    const w = 4.5 + rng() * 6.5 * (1 - rr / R * 0.4);
    const d = 4.2 + rng() * 6.0 * (1 - rr / R * 0.4);
    const h = 3.2 + rng() * 3.6 * (1 - rr / R * 0.35);
    houses.add(x, y, z, w, h, d, rng() * Math.PI,
      /* Provincial gold: the mechanism is the same, the supply is not. */
      goldRatio(rr + 900, wealth, 0.4 + rng() * 0.4) * 0.55,
      rng(), 0.25 + rng() * 0.5);
  }

  /* Grain stores. Every settlement has them; only the capital's are royal. */
  for (let i = 0; i < Math.max(2, Math.round(6 * detail)); i++) {
    const a = rng() * Math.PI * 2, rr = R * (0.2 + rng() * 0.4);
    silos.add(Math.cos(a) * rr, y, Math.sin(a) * rr,
      7 + rng() * 4, 8 + rng() * 5, 7 + rng() * 4, 0, 0, 0.55, 0.3);
  }

  /* Date palms: a lot at an oasis, a few anywhere with a well. */
  const palmCount = Math.round((isOasis ? 420 : 90) * detail);
  for (let i = 0; i < palmCount; i++) {
    const a = rng() * Math.PI * 2;
    const rr = R * (isOasis ? 0.25 + rng() * 0.95 : 0.15 + rng() * 0.5);
    const hh = 9 + rng() * 8;
    palms.add(Math.cos(a) * rr, y + hh * 0.55, Math.sin(a) * rr,
      5.5 + rng() * 2.5, hh * 0.45, 5.5 + rng() * 2.5, rng() * Math.PI, 0, 0.05, 0.1);
  }

  const grp = new THREE.Group();
  grp.name = `town:${p.id}`;
  for (const [set, n] of [[houses, 'houses'], [silos, 'silos'], [palms, 'palms']]) {
    const m = set.build(`${p.id}-${n}`);
    if (m) grp.add(m);
  }

  if (isPort) grp.add(buildDocks(p, ctx, rng, R, y));
  if (isMine) grp.add(buildMineWorks(p, ctx, rng, R, y));

  grp.userData.radius = R;
  grp.userData.population = pop;
  return grp;
}

/** Deep-water docks, trading dhows, and the warehouses that pay for both. */
function buildDocks(p, ctx, rng, R, y) {
  const geo = geometryKit();
  const mat = ctx.sunklay;
  const set = new InstanceSet(geo.box, mat, 256);
  const hulls = new InstanceSet(geo.house, mat, 64);

  /* Find the seaward direction by sampling: the docks face wherever the
     ground actually falls below the water line. */
  let bestA = 0, bestH = Infinity;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const h = walkableHeight(p.x + Math.cos(a) * R * 2.2, p.z + Math.sin(a) * R * 2.2);
    if (h < bestH) { bestH = h; bestA = a; }
  }

  const cx = Math.cos(bestA) * R * 1.15, cz = Math.sin(bestA) * R * 1.15;
  for (let i = 0; i < 9; i++) {
    const off = (i - 4) * 46;
    const px = cx + Math.cos(bestA + Math.PI / 2) * off;
    const pz = cz + Math.sin(bestA + Math.PI / 2) * off;
    /* The quay, then a mole running out into the water. */
    set.add(px, y, pz, 120, 2.4, 14, bestA, 0.02, 0.7, 0.35);
    hulls.add(px + Math.cos(bestA) * 78, SEA_LEVEL + 0.6, pz + Math.sin(bestA) * 78,
      26, 4.5, 8, bestA + (rng() - 0.5) * 0.4, 0.03, 0.4, 0.45);
  }

  const grp = new THREE.Group();
  grp.name = `docks:${p.id}`;
  for (const [s, n] of [[set, 'quays'], [hulls, 'dhows']]) {
    const m = s.build(`${p.id}-${n}`);
    if (m) grp.add(m);
  }
  return grp;
}

/** Headframes, spoil heaps, and the barracks that hold the workforce. */
function buildMineWorks(p, ctx, rng, R, y) {
  const geo = geometryKit();
  const mat = ctx.sunklay;
  const frames = new InstanceSet(geo.box, mat, 256);
  const heaps = new InstanceSet(geo.cone, mat, 128);

  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, rr = R * (0.6 + rng() * 1.5);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    /* A headframe is four legs and a sheave, which at this scale is one
       tapering box and a crossbar. */
    frames.add(x, y, z, 5, 13 + rng() * 7, 5, rng() * Math.PI, 0, 0.3, 0.6);
    frames.add(x, y + 12, z, 9, 1.2, 2.2, rng() * Math.PI, 0, 0.3, 0.6);
    heaps.add(x + 16 + rng() * 20, y, z + 10 + rng() * 20,
      16 + rng() * 14, 5 + rng() * 5, 16 + rng() * 14, 0, 0, 0.2, 0.9);
  }
  const grp = new THREE.Group();
  grp.name = `mine:${p.id}`;
  for (const [s, n] of [[frames, 'headframes'], [heaps, 'spoil']]) {
    const m = s.build(`${p.id}-${n}`);
    if (m) grp.add(m);
  }
  return grp;
}

/**
 * The imposter: a settlement footprint as a glowing extent, which is exactly
 * what Part 1.4 asks for at Kingdom tier. One draw call, no buildings.
 */
export function buildTownImposter(p, ctx) {
  const pop = parsePop(p.population);
  const R = townRadius(pop);
  const ground = walkableHeight(p.x, p.z);

  const g = new THREE.CircleGeometry(R * 1.15, 40);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(pop > 100000 ? '#d8ac48' : pop > 40000 ? '#b8944a' : '#94794a'),
    transparent: true, opacity: 0.72, depthWrite: false,
  });
  m.userData.ownedByRegion = true;
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = ground + 2.5;
  mesh.renderOrder = 2;
  mesh.name = `extent:${p.id}`;
  return mesh;
}

export function parsePop(s) {
  if (!s) return 5000;
  const cleaned = String(s).replace(/[~,]/g, '');
  const m = cleaned.match(/([\d.]+)\s*([MK])?/i);
  if (!m) return 5000;
  let v = parseFloat(m[1]);
  if (/m/i.test(m[2] || '')) v *= 1e6;
  else if (/k/i.test(m[2] || '')) v *= 1e3;
  return v;
}
