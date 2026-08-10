/* ============================================================================
   index.js  ::  canon.json to regions.

   Every place in the canon file gets registered with the streaming manager
   and given the builders its kind deserves. Nothing is in the scene at load;
   a region that has never been approached has never been generated.
   ========================================================================= */

import * as THREE from 'three';
import { RegionManager } from '../world.js';
import { buildTown, buildTownImposter, townRadius, parsePop } from './settlements.js';
import {
  buildGateTerminal, buildMilitaryBase, buildArena,
  buildPyramidField, buildShapes,
} from './landmarks.js';
import { buildSundiskFull, buildSundiskBlocks, buildSundiskImposter, CITY } from '../city/sundisk.js';
import { buildWall, buildCityWater } from '../city/wall.js';
import { buildVeil } from '../city/veil.js';
import { KM } from '../units.js';

export async function loadCanon(url = './data/canon.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`canon.json ${res.status}`);
  return res.json();
}

/**
 * @param {RegionManager} manager
 * @param {object} canon
 */
export function registerRegions(manager, canon) {
  const byId = new Map(canon.places.map(p => [p.id, p]));

  for (const p of canon.places) {
    const pop = parsePop(p.population);
    const extent = p.extent || 0;

    if (p.id === 'sundisk') {
      manager.add({
        id: p.id, place: p, x: p.x, z: p.z,
        radius: CITY.commons,
        fullRange: 9 * KM,
        blockRange: 30 * KM,
        imposterRange: 700 * KM,
        buildFull: (ctx) => buildSundiskFull({
          ...ctx, buildWall, buildVeil, buildWater: buildCityWater,
        }),
        buildBlocks: (ctx) => buildSundiskBlocks({ ...ctx, buildWall, buildVeil }),
        buildImposter: buildSundiskImposter,
      });
      continue;
    }

    if (p.id === 'gate') {
      manager.add({
        id: p.id, place: p, x: p.x, z: p.z, radius: 320,
        fullRange: 4 * KM, blockRange: 14 * KM, imposterRange: 90 * KM,
        buildFull: (ctx) => buildGateTerminal(p, ctx),
        buildBlocks: (ctx) => buildGateTerminal(p, ctx),
        buildImposter: (ctx) => buildTownImposter({ ...p, population: '9000' }, ctx),
      });
      continue;
    }
    if (p.id === 'milbase') {
      manager.add({
        id: p.id, place: p, x: p.x, z: p.z, radius: 240,
        fullRange: 4 * KM, blockRange: 12 * KM, imposterRange: 70 * KM,
        buildFull: (ctx) => buildMilitaryBase(p, ctx),
        buildBlocks: (ctx) => buildMilitaryBase(p, ctx),
        buildImposter: (ctx) => buildTownImposter({ ...p, population: '6000' }, ctx),
      });
      continue;
    }
    if (p.id === 'arena') {
      manager.add({
        id: p.id, place: p, x: p.x, z: p.z, radius: 170,
        fullRange: 5 * KM, blockRange: 16 * KM, imposterRange: 90 * KM,
        buildFull: (ctx) => buildArena(p, ctx),
        buildBlocks: (ctx) => buildArena(p, ctx),
        buildImposter: (ctx) => buildTownImposter({ ...p, population: '9000' }, ctx),
      });
      continue;
    }
    if (p.id === 'solkhari') {
      manager.add({
        id: p.id, place: p, x: p.x, z: p.z, radius: townRadius(pop) + 1000,
        fullRange: 6 * KM, blockRange: 22 * KM, imposterRange: 220 * KM,
        buildFull: (ctx) => {
          const g = new THREE.Group();
          g.add(buildTown(p, ctx, 1));
          g.add(buildPyramidField(p, ctx));
          return g;
        },
        buildBlocks: (ctx) => {
          const g = new THREE.Group();
          g.add(buildTown(p, ctx, 0.22));
          g.add(buildPyramidField(p, ctx));
          return g;
        },
        buildImposter: (ctx) => buildTownImposter(p, ctx),
      });
      continue;
    }
    if (p.id === 'glass') {
      manager.add({
        id: p.id, place: p, x: p.x, z: p.z, radius: 40 * KM,
        fullRange: 30 * KM, blockRange: 60 * KM, imposterRange: 0,
        buildFull: (ctx) => buildShapes(p, ctx),
        buildBlocks: (ctx) => buildShapes(p, ctx),
      });
      continue;
    }

    /* Everything else is a settlement of some kind, or a feature with an
       extent but no buildings. */
    if (pop >= 400 && !/desert|flats|cliffs|range|sea|ring|march|canal|technology|vehicle|economic|barrier|collector|transport|border|zone|wonder|ocean/i.test(p.kind || '')) {
      manager.add({
        id: p.id, place: p, x: p.x, z: p.z, radius: townRadius(pop),
        fullRange: 2.6 * KM, blockRange: 11 * KM,
        imposterRange: Math.max(90 * KM, townRadius(pop) * 60),
        buildFull: (ctx) => buildTown(p, ctx, 1),
        buildBlocks: (ctx) => buildTown(p, ctx, 0.2),
        buildImposter: (ctx) => buildTownImposter(p, ctx),
      });
    }
  }

  return byId;
}
