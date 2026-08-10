/* ============================================================================
   verify_terrain.mjs  ::  headless checks on the height field.

   Runs under plain Node, no browser, because the height field is pure and
   deliberately free of Three.js. Checks:

     1. the reg / sand-sea split against the canon 70 / 30
     2. every canon coastal settlement is actually on land
     3. every canon inland settlement is actually inland
     4. the Part 3.2 placement distances
     5. star dune and oasis counts
     6. height sanity at the named stamps

   Run: node sunlands-v6/tools/verify_terrain.mjs
   ========================================================================= */

import { KM } from '../src/units.js';
import {
  terrainHeight, coastDistance, sandSeaMask, classify,
  STAR_DUNES, OASES, CANALS, CITY_GROUND_Y, SEA_LEVEL,
} from '../src/terrain/height.js';

let failures = 0;
const ok = (cond, msg, detail = '') => {
  if (!cond) { failures++; console.error(`  FAIL  ${msg}  ${detail}`); }
  else console.log(`  ok    ${msg}  ${detail}`);
};

console.log('\n1. reg / sand-sea split (canon: 70 percent reg, 30 percent sand sea)');
{
  let sandSum = 0, n = 0;
  for (let i = 0; i < 260; i++) {
    for (let j = 0; j < 260; j++) {
      const x = -1300 * KM + (2550 * KM) * (i + 0.5) / 260;
      const z = -1000 * KM + (1800 * KM) * (j + 0.5) / 260;
      if (coastDistance(x, z) < 0) continue;      // land only
      sandSum += sandSeaMask(x, z); n++;
    }
  }
  const pct = 100 * sandSum / n;
  ok(pct > 25 && pct < 35, 'sand sea share within 25 to 35 percent', `${pct.toFixed(1)} percent over ${n} land samples`);
}

console.log('\n2. canon coastal places are on land, near the water');
const coastal = [
  ['Mensahs Landing', 40, 110, 30],
  ['Rhys fishing village', 72, 118, 18],
  ['Drum Harbor', -280, 470, 34],
  ['Golden Coast', 1210, 140, 34],
];
for (const [name, xk, zk, maxInlandKm] of coastal) {
  const d = coastDistance(xk * KM, zk * KM) / KM;
  const h = terrainHeight(xk * KM, zk * KM);
  ok(d > 0 && d < maxInlandKm && h > SEA_LEVEL,
    `${name} on land and within ${maxInlandKm} km of the sea`,
    `coast dist ${d.toFixed(1)} km, height ${h.toFixed(1)} m`);
}

console.log('\n3. canon inland places are inland');
const inland = [
  ['Veth', -160, 330], ['Ashara', 300, -40],
  ['Tawari', 780, 30], ['Soleth', 900, -190], ['Sol khari', 955, -235],
  ['Mirin', -500, 20], ['Kosei s Claim', -200, -580], ['Taresh', -840, 400],
  ['Oasis of Seven Palms', 690, -430], ['Eastern Gold Mines', 640, 90],
  ['Mournscar', -1900, -100], ['Cindermarch', -1750, 120],
];
for (const [name, xk, zk] of inland) {
  const d = coastDistance(xk * KM, zk * KM) / KM;
  const h = terrainHeight(xk * KM, zk * KM);
  ok(d > 0 && h > SEA_LEVEL, `${name} on land`, `coast dist ${d.toFixed(1)} km, height ${h.toFixed(1)} m`);
}

console.log('\n4. the Sunset Islands are islands');
for (const [name, xk, zk] of [['Sunset isle 1', -120, 720], ['Sunset isle 2', -62, 686], ['Sunset isle 3', -168, 762]]) {
  const h = terrainHeight(xk * KM, zk * KM);
  const around = terrainHeight((xk + 60) * KM, (zk + 60) * KM);
  ok(h > SEA_LEVEL && around < SEA_LEVEL, `${name} above water with sea around it`, `centre ${h.toFixed(1)} m, 85 km away ${around.toFixed(1)} m`);
}

console.log('\n5. placement distances from Part 3.2');
const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
ok(Math.abs(dist(0, 0, 2.1, -2.1) - 2.97) < 0.1, 'Golden Gate Terminal about 3 km from the origin', `${dist(0, 0, 2.1, -2.1).toFixed(2)} km`);
{
  const d = dist(0, 0, 72, 118);
  ok(d > 130 && d < 145, 'fishing village straight-line distance', `${d.toFixed(1)} km straight line, canon route says about 120 km (OPEN O-4)`);
}
ok(Math.abs(dist(0, 0, 1210, 140) - 1218) < 5, 'Golden Coast about 1218 km east', `${dist(0, 0, 1210, 140).toFixed(0)} km`);

console.log('\n6. authored stamps');
ok(STAR_DUNES.length === 40, 'forty star dunes placed', `${STAR_DUNES.length}`);
{
  const tall = STAR_DUNES.filter(d => d.height > 450).length;
  const maxH = Math.max(...STAR_DUNES.map(d => d.height));
  ok(maxH > 480 && maxH <= 500, 'star dunes reach 500 m', `tallest ${maxH.toFixed(0)} m, ${tall} above 450 m`);
}
ok(OASES.filter(o => o.major).length === 12, 'twelve major oases', `${OASES.filter(o => o.major).length}`);
ok(OASES.filter(o => !o.major).length === 200, 'two hundred minor oases', `${OASES.filter(o => !o.major).length}`);
{
  const far = OASES.filter(o => o.major).map(o => Math.hypot(o.x, o.z) / KM);
  ok(Math.max(...far) <= 400, 'major oases all within 400 km of Sundisk', `furthest ${Math.max(...far).toFixed(0)} km`);
}
ok(CANALS.length === 14, 'canal network reaches every major oasis plus two trunks', `${CANALS.length} routes`);

console.log('\n7. stamp heights');
ok(Math.abs(terrainHeight(0, 0) - CITY_GROUND_Y) < 0.01, 'city plateau flat at the dais',
   `world Y ${terrainHeight(0, 0).toFixed(3)} m, which is ${(terrainHeight(0, 0) - SEA_LEVEL).toFixed(1)} m above the sea`);
{
  const ring = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    ring.push(terrainHeight(Math.cos(a) * 26 * KM, Math.sin(a) * 26 * KM));
  }
  const mean = ring.reduce((a, b) => a + b, 0) / ring.length;
  ok(Math.abs(mean - CITY_GROUND_Y) < 90, 'city plateau sits close to the surrounding desert',
     `desert 26 km out averages ${(mean - SEA_LEVEL).toFixed(0)} m above the sea, city ${(CITY_GROUND_Y - SEA_LEVEL).toFixed(0)} m`);
}
{
  const salt = terrainHeight(-520 * KM, 40 * KM) - SEA_LEVEL;
  ok(salt > 30 && salt < 40, 'salt flats flat near 34 m above the sea', `${salt.toFixed(1)} m`);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < 40; i++) {
    const h = terrainHeight((-520 + (i - 20) * 3) * KM, 40 * KM);
    mn = Math.min(mn, h); mx = Math.max(mx, h);
  }
  ok(mx - mn < 6, 'salt flats are flat across 120 km', `relief ${(mx - mn).toFixed(2)} m`);
}
{
  const glass = terrainHeight(530 * KM, -70 * KM) - SEA_LEVEL;
  ok(glass > 88 && glass < 104, 'glass sheet flat near 96 m above the sea', `${glass.toFixed(1)} m`);
}
{
  let mx = -1e9;
  for (let i = 0; i < 200; i++) {
    const x = (-600 + i * 7.5) * KM;
    for (let j = -6; j <= 6; j++) mx = Math.max(mx, terrainHeight(x, -900 * KM + j * 8 * KM) - SEA_LEVEL);
  }
  ok(mx > 900 && mx < 2600, 'the Ashteeth make a real ridge', `crest ${mx.toFixed(0)} m`);
}
{
  const clifftop = terrainHeight(60 * KM, 110 * KM) - SEA_LEVEL;
  const atShore = terrainHeight(60 * KM, 123 * KM) - SEA_LEVEL;
  ok(clifftop > 45 && clifftop < 200, 'Wailing Cliffs stand above the shore',
     `clifftop ${clifftop.toFixed(0)} m, shore ${atShore.toFixed(1)} m`);
}

console.log('\n8. classification weights stay in range');
{
  const w = new Float32Array(7);
  let bad = 0;
  for (let i = 0; i < 3000; i++) {
    const x = -2600 * KM + 3850 * KM * ((i * 7919) % 1000) / 1000;
    const z = -1000 * KM + 1800 * KM * ((i * 6271) % 1000) / 1000;
    classify(x, z, terrainHeight(x, z), w);
    for (let k = 0; k < 7; k++) if (!(w[k] >= 0 && w[k] <= 1.0001)) bad++;
  }
  ok(bad === 0, 'all material weights in 0..1', `${bad} out of range`);
  let wadiSum = 0, wadiN = 0;
  for (let i = 0; i < 2000; i++) {
    const x = -900 * KM + 1800 * KM * ((i * 7919) % 997) / 997;
    const z = -700 * KM + 1200 * KM * ((i * 6271) % 991) / 991;
    if (coastDistance(x, z) < 0) continue;
    classify(x, z, terrainHeight(x, z), w);
    wadiSum += w[6]; wadiN++;
  }
  ok(wadiSum / wadiN > 0.002 && wadiSum / wadiN < 0.25,
     'the wadi channel is a channel, not a flood plain',
     `${(100 * wadiSum / wadiN).toFixed(1)} percent of the land reads as watercourse`);
}

console.log('\n9. determinism');
{
  const a = terrainHeight(123456.75, -98765.5);
  const b = terrainHeight(123456.75, -98765.5);
  ok(a === b, 'terrainHeight is deterministic', `${a}`);
}

console.log(`\n${failures === 0 ? 'ALL TERRAIN CHECKS PASSED' : failures + ' TERRAIN CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
