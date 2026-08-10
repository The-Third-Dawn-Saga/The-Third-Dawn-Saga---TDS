/* ============================================================================
   probe.mjs  ::  drive the real page in a real browser and assert on it.

   The acceptance test in Part 1.4 is about pixels, so it gets checked against
   the live camera and the live projection, not against a mock. The same run
   collects the Part 2 budgets: draw calls, chunk builds per frame, triangle
   counts, at every tier.

   Run: node sunlands-v6/tools/probe.mjs [--shots]
   ========================================================================= */

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = process.argv.includes('--shots');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
};

/* Module workers and importmaps both need a real origin, so serve the folder. */
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error') errors.push(`console: ${t}`);
  if (t.includes('draw call budget')) errors.push(`budget: ${t}`);
});

/* The terrain builds at most three chunks a frame by design, so convergence
   is a function of frame rate, not of wall clock. Wait for the queue rather
   than guessing at a delay: under a software rasteriser that matters. */
async function settle(page, timeout = 300000) {
  await page.waitForFunction(() => window.__terrainSettled(), null, { timeout }).catch(() => {});
  await page.waitForTimeout(400);
}

let failures = 0;
const ok = (cond, msg, detail = '') => {
  if (!cond) { failures++; console.error(`  FAIL  ${msg}  ${detail}`); }
  else console.log(`  ok    ${msg}  ${detail}`);
};

await page.goto(`${base}/index.html?dev=1`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__scaleTest === 'function', null, { timeout: 30000 });

console.log('\nA. the page runs');
ok(errors.length === 0, 'no page errors during boot', errors.slice(0, 3).join(' | '));

console.log('\nB. Part 1.4 acceptance test, the whole point of the rebuild');
const t = await page.evaluate(() => window.__scaleTestLive());
console.log(`      whole Sunlands fits the viewport at ${t.altitudeKm.toFixed(0)} km altitude`);
ok(t.pass, `Sundisk 18 km metro under 12 px when the territory fills the view`,
   `${t.pixels.toFixed(2)} px by projection maths, budget ${t.budget}`);
ok(t.livePass, 'the same test driving the live camera',
   `${t.livePixels.toFixed(2)} px measured through the render camera`);
ok(Math.abs(t.pixels - t.livePixels) < 0.05, 'maths and live camera agree',
   `difference ${Math.abs(t.pixels - t.livePixels).toFixed(4)} px`);

console.log('\nC. terrain streams in');
await page.waitForFunction(() => window.__ready(), null, { timeout: 60000 }).catch(() => {});
const s0 = await page.evaluate(() => window.__stats());
ok(s0.terrain.built > 20, 'chunks built', `${s0.terrain.built} built, ${s0.terrain.visible} visible`);
ok(s0.draws > 0, 'the scene draws', `${s0.draws} draw calls`);

console.log('\nD. the four tiers, budgets from Part 2');
const TIER_VIEWS = [
  ['Continental', 0, 120e3, 1450e3],
  ['Kingdom', 0, 0, 160e3],
  ['Regional', 0, 0, 12e3],
  ['Street', 0, 0, 400],
];
mkdirSync(new URL('../screenshots/', import.meta.url), { recursive: true });
for (const [name, x, z, alt] of TIER_VIEWS) {
  await page.evaluate(([x, z, alt]) => window.__flyTo(x, z, alt), [x, z, alt]);
  await settle(page);
  const s = await page.evaluate(() => window.__stats());
  ok(s.draws < 900, `${name}: draw calls under 900`,
     `${s.draws} calls, ${(s.triangles / 1000).toFixed(0)}k tris, ${s.terrain.visible} chunks visible, ${s.terrain.resident} resident, depth ${s.terrain.deepest}`);
  if (SHOTS) {
    await page.screenshot({ path: fileURLToPath(new URL(`../screenshots/tier_${name.toLowerCase()}.png`, import.meta.url)) });
  }
}

console.log('\nE. explore mode walks at true scale');
await page.evaluate(() => window.__flyTo(0, 0, 900));
await settle(page);
/* Spawn on open ground outside the wall, not inside somebody's house. */
await page.evaluate(() => window.__enterExplore(0, 10400));
await page.waitForTimeout(400);
{
  /* Frame rate under a software rasteriser is around one per second with the
     full city resident, so wall-clock is useless here. What matters is that
     the speed is right per second of movement, which is frame-rate
     independent by construction. */
  await page.evaluate(() => window.__explore.keys.add('KeyW'));
  await page.waitForFunction(() => window.__explore.movingSeconds > 1.2, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.__explore.keys.delete('KeyW'));
  const walk = await page.evaluate(() => ({ ...window.__explore.readout(), y: window.__explore.abs.y, moving: window.__explore.movingSeconds }));
  ok(Math.abs(walk.metresPerSecond - 1.4) < 0.05, 'a walker walks at 1.4 m/s, not at a game speed',
     `${walk.metresPerSecond.toFixed(3)} m/s over ${walk.moving.toFixed(1)} s of movement`);
  ok(isFinite(walk.y), 'the walker stays on the ground', `y ${walk.y.toFixed(2)}`);

  await page.evaluate(() => { window.__explore.keys.add('ShiftLeft'); window.__explore.keys.add('KeyW'); });
  const before = await page.evaluate(() => ({ d: window.__explore.distanceWalked, s: window.__explore.movingSeconds }));
  await page.waitForFunction((b) => window.__explore.movingSeconds > b + 1.0, null, { timeout: 60000 }, before.s).catch(() => {});
  const run = await page.evaluate((b) => {
    const e = window.__explore;
    return { mps: (e.distanceWalked - b.d) / (e.movingSeconds - b.s) };
  }, before);
  await page.evaluate(() => { window.__explore.keys.delete('ShiftLeft'); window.__explore.keys.delete('KeyW'); });
  ok(Math.abs(run.mps - 4.5) < 0.15, 'running is 4.5 m/s', `${run.mps.toFixed(3)} m/s`);

  /* At 100x the accelerator has to be labelled as one, not as a running
     speed, and the world must go on measuring the real walk underneath it. */
  const b2 = await page.evaluate(() => ({
    d: window.__explore.distanceWalked, a: window.__explore.acceleratedDistance,
    s: window.__explore.movingSeconds,
  }));
  await page.evaluate(() => { window.__explore.setSpeed(3); window.__explore.keys.add('KeyW'); });
  await page.waitForFunction((b) => window.__explore.movingSeconds > b + 1.0, null, { timeout: 60000 }, b2.s).catch(() => {});
  await page.evaluate(() => window.__explore.keys.delete('KeyW'));
  const fast = await page.evaluate((b) => {
    const e = window.__explore;
    const dt = e.movingSeconds - b.s;
    return {
      ...e.readout(),
      onFootMps: (e.distanceWalked - b.d) / dt,
      screenMps: (e.acceleratedDistance - b.a) / dt,
    };
  }, b2);
  ok(fast.accelerated && fast.multiplier === 100
     && Math.abs(fast.onFootMps - 1.4) < 0.05
     && Math.abs(fast.screenMps / fast.onFootMps - 100) < 1,
     'the travel accelerator is honest: the world still measures the walk',
     `${fast.screenMps.toFixed(0)} m/s on screen, ${fast.onFootMps.toFixed(2)} m/s of real walking counted`);
}
await page.evaluate(() => window.__leaveExplore());
await page.waitForTimeout(300);

console.log('\nF. layer toggles build on demand');
for (const l of ['roads', 'rivers', 'farms', 'solanu', 'vassals', 'outposts', 'migration']) {
  await page.evaluate(k => window.__setLayer(k, true), l);
}
await page.waitForTimeout(900);
{
  const s = await page.evaluate(() => window.__stats());
  ok(s.draws < 900, 'every reference layer on at once stays inside the budget', `${s.draws} draw calls`);
}
for (const l of ['roads', 'rivers', 'farms', 'solanu', 'vassals', 'outposts', 'migration']) {
  await page.evaluate(k => window.__setLayer(k, false), l);
}

console.log('\nG. the Ashlands colour grade');
{
  await page.evaluate(() => window.__flyTo(-900e3, 200e3, 40e3));
  await page.waitForTimeout(900);
  const inSun = await page.evaluate(() => window.__ashBlend());
  await page.evaluate(() => window.__flyTo(-1900e3, -100e3, 40e3));
  await page.waitForTimeout(900);
  const inAsh = await page.evaluate(() => window.__ashBlend());
  ok(inSun < 0.02 && inAsh > 0.95, 'crossing the frontier is a colour grade change',
     `Sol Taresh side ${inSun.toFixed(2)}, Mournscar side ${inAsh.toFixed(2)}`);
  const s = await page.evaluate(() => window.__stats());
  ok(s.draws < 900, 'the Ashlands stay inside the draw budget', `${s.draws} calls`);
}

console.log('\nG2. Sundisk carries a city, not a diorama');
{
  await page.evaluate(() => window.__flyTo(0, 0, 1200));
  await settle(page, 180000);
  const c = await page.evaluate(() => {
    const r = window.__regions;
    let n = 0, crowd = 0;
    const walk = (o) => {
      if (o.isInstancedMesh) { n += o.count; if (o.userData.crowd) crowd += o.count; }
      o.children.forEach(walk);
    };
    walk(window.__scene);
    return { instances: n, crowd };
  });
  ok(c.instances > 30000, 'at least thirty thousand building instances, Part 4.4',
     `${c.instances.toLocaleString()} instances resident, ${c.crowd.toLocaleString()} of them people`);
  const s = await page.evaluate(() => window.__stats());
  ok(s.draws < 900, 'the full city stays inside the draw budget', `${s.draws} calls, ${(s.triangles / 1e6).toFixed(1)}M tris`);
}

console.log('\nH. the floating origin actually engages');
await page.evaluate(() => window.__flyTo(530e3, -70e3, 30e3));
await page.waitForTimeout(2500);
const s1 = await page.evaluate(() => window.__stats());
ok(Math.hypot(s1.offset.x, s1.offset.z) > 100000, 'world offset moved with the camera',
   `offset ${(s1.offset.x / 1000).toFixed(0)}, ${(s1.offset.z / 1000).toFixed(0)} km`);
ok(Math.abs(s1.altitude) < 200000, 'camera stays near the scene origin in Y-free terms',
   `camera scene position y ${(s1.altitude / 1000).toFixed(1)} km`);

console.log('\nI. errors across the whole run');
ok(errors.length === 0, 'no console or page errors', errors.slice(0, 5).join(' | '));

await browser.close();
server.close();

console.log(`\n${failures === 0 ? 'ALL BROWSER CHECKS PASSED' : failures + ' BROWSER CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
