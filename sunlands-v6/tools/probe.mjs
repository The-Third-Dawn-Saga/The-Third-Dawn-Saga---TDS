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

  /* THE GRADE IS APPLIED ONCE, NOT ONCE A FRAME.

     The ash grade and the weather both modify the environment in place and
     multiplicatively. Standing still in the Ashlands is therefore the test
     that the baseline is being recomputed: before this was asserted, eight
     seconds parked over Mournscar ended at a fog density of twenty-eight per
     metre and a sun four orders of magnitude too dim, and it read as
     atmosphere rather than as a bug. */
  const g0 = await page.evaluate(() => ({ s: window.__env.sunIntensity, f: window.__env.fogDensity, a: window.__env.ambientScale }));
  await page.waitForTimeout(5000);
  const g1 = await page.evaluate(() => ({ s: window.__env.sunIntensity, f: window.__env.fogDensity, a: window.__env.ambientScale }));
  ok(g0.s === g1.s && g0.f === g1.f && g0.a === g1.a,
     'the colour grade does not compound while you stand still',
     `sun ${g0.s.toFixed(4)} to ${g1.s.toFixed(4)}, fog ${g0.f.toExponential(2)} to ${g1.f.toExponential(2)}`);
  ok(g1.s > 0.3 && g1.f < 1e-3, 'and the Ashlands are still somewhere you can see',
     `sun ${g1.s.toFixed(3)}, visibility ${(2.2 / g1.f / 1000).toFixed(0)} km`);
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

console.log('\nG2b. the city keeps its own clock');
{
  const at = async (h) => {
    await page.evaluate(hh => window.__env.setTime(hh), h);
    await page.waitForTimeout(2600);
    return page.evaluate(() => window.__rites());
  };
  const reachOf = (r) => {
    const on = r.pools.at.filter(p => p.glow > 0.01);
    if (!on.length) return 0;
    return on.reduce((s, p) => s + Math.hypot(p.x - r.temple.x, p.z - r.temple.z), 0) / on.length;
  };

  /* Part 4.2: the temple's roof mirrors drive a moving light pool as the sun
     angle changes. Moving is the claim, so movement is the test. */
  const dawn = await at(7);
  const noon = await at(12);
  const dusk = await at(17);
  ok(dawn.pools && noon.pools, 'the temple roof mirrors are throwing pools',
     `${dawn.pools ? dawn.pools.at.filter(p => p.glow > 0.01).length : 0} lit at 07:00, ` +
     `${noon.pools ? noon.pools.at.filter(p => p.glow > 0.01).length : 0} at noon`);
  if (dawn.pools && noon.pools && dusk.pools) {
    const rDawn = reachOf(dawn), rNoon = reachOf(noon);
    ok(rDawn > rNoon * 2, 'and at noon they collapse back under the temple',
       `${rDawn.toFixed(0)} m out at 07:00 against ${rNoon.toFixed(0)} m at noon`);
    let moved = 0;
    for (let i = 0; i < dawn.pools.at.length; i++) {
      moved = Math.max(moved, Math.hypot(dawn.pools.at[i].x - dusk.pools.at[i].x,
                                         dawn.pools.at[i].z - dusk.pools.at[i].z));
    }
    ok(moved > 40, 'the pools sweep across the quarter through the day',
       `furthest pool travels ${moved.toFixed(0)} m between 07:00 and 17:00`);
  }

  /* Part 4.6: the drums fire the market close at solar noon, and the crowd
     and the drums read one number rather than two. */
  ok(noon.drums > 0.9 && dawn.drums < 0.01, 'the drums fire at solar noon and only then',
     `${noon.drums.toFixed(2)} at noon, ${dawn.drums.toFixed(2)} at 07:00`);
  ok(dawn.market === 1 && (await at(12.5)).market < 0.2,
     'and the market shuts when they do', 'open at dawn, shut by 12:30');
  ok(noon.rings && noon.rings.visible, 'the strike is drawn', '');

  /* The ring travels at the speed of sound, because in a build whose premise
     is real distances it has no business travelling any faster. Measured
     against simulated time, like every other speed here. */
  if (noon.rings) {
    const a = await page.evaluate(() => window.__rites());
    await page.waitForTimeout(2500);
    const b = await page.evaluate(() => window.__rites());
    const dt = b.t - a.t;
    const rates = [];
    for (let i = 0; i < a.rings.radii.length; i++) {
      const dr = b.rings.radii[i] - a.rings.radii[i];
      if (dr > 0) rates.push(dr / dt);              // skip any ring that wrapped
    }
    rates.sort((p, q) => p - q);
    const median = rates.length ? rates[rates.length >> 1] : 0;
    ok(Math.abs(median - a.soundSpeed) < 2, 'and it travels at the speed of sound',
       `${median.toFixed(1)} m/s over ${dt.toFixed(1)} s of simulated time, ` +
       `${rates.length} of ${a.rings.radii.length} rings unwrapped`);
  }

  /* Part 4.6: traffic actually queues at dawn, longest at the eastern gate. */
  const q6 = await at(6.5);
  const q14 = await at(14);
  ok(q6.queue > q14.queue * 1.5, 'the gates queue at dawn and not in the heat',
     `${q6.queue.toFixed(2)} at 06:30 against ${q14.queue.toFixed(2)} at 14:00`);
  if (q6.queues) {
    const share = q6.queues.share;
    const most = share.indexOf(Math.max(...share));
    ok(share[most] > 1.5 * Math.min(...share) && q6.queues.length === q6.queue,
       'and the eastern gate carries the long one',
       `shares ${share.map(v => v.toFixed(2)).join(' ')}`);
  }
  await page.evaluate(() => window.__env.setTime(10));
}

console.log('\nG3. the Harmattan is a place, not a tint');
{
  const KMm = 1000;
  await page.evaluate(() => window.__flyTo(0, 0, 1200));
  await page.evaluate(() => window.__env.setWeather('harmattan'));
  await page.waitForTimeout(900);

  /* THE FRONT ADVANCES AT 80 KM/H, measured against SIMULATED time.
     A software rasteriser runs at about one frame a second and the loop
     clamps dt to 0.1 s, so wall-clock here would measure the rasteriser, not
     the storm. env.time accumulates the same clamped dt the front does, so
     dividing one by the other is frame-rate independent by construction. */
  await page.evaluate(k => window.__setFront(k), 0);
  const a = await page.evaluate(() => ({ f: window.__weather().front, t: window.__env.time }));
  await page.waitForTimeout(4000);
  const b = await page.evaluate(() => ({ f: window.__weather().front, t: window.__env.time }));
  const mps = (a.f - b.f) / (b.t - a.t);
  ok(Math.abs(mps - 80000 / 3600) < 0.2, 'the dust wall advances at 80 km/h',
     `${(mps * 3.6).toFixed(2)} km/h over ${(b.t - a.t).toFixed(1)} s of simulated time`);

  /* Ahead of the front the air is clear, behind it is not. Points are placed
     by their distance ALONG the wind axis, which is what the front is a
     surface of constant value of. */
  const d = await page.evaluate((km) => {
    window.__setFront(0);
    const w = window.__WIND;
    const at = (L) => window.__dustAt(w.x * L, w.z * L);
    return { ahead: at(50 * km), justBehind: at(-100 * km), tail: at(-300 * km) };
  }, KMm);
  ok(d.ahead === 0, 'ahead of the front the air is clear', `dust ${d.ahead.toFixed(3)} at 50 km ahead`);
  ok(d.justBehind > 0.9, 'just behind the leading edge it is a wall',
     `dust ${d.justBehind.toFixed(3)} at 100 km behind`);
  ok(d.tail < d.justBehind * 0.6, 'the storm thins out into its tail',
     `dust ${d.tail.toFixed(3)} at 300 km behind`);

  /* Standing on one side of it is a different experience: that is the whole
     political point of the Veil, so it is asserted rather than assumed. */
  await page.evaluate(km => window.__setFront(-60 * km), KMm);
  await page.waitForTimeout(600);
  const clearSide = await page.evaluate(() => ({ ...window.__weather(), fog: window.__env.fogDensity }));
  await page.evaluate(km => window.__setFront(30 * km), KMm);
  await page.waitForTimeout(600);
  const dustSide = await page.evaluate(() => ({ ...window.__weather(), fog: window.__env.fogDensity }));
  ok(clearSide.dust < 0.01 && dustSide.dust > 0.9,
     'standing on either side of the front is a different place',
     `dust ${clearSide.dust.toFixed(2)} ahead, ${dustSide.dust.toFixed(2)} behind`);
  ok(dustSide.fog / clearSide.fog > 20, 'inside the wall you cannot see out of the district',
     `visibility ${(2.2 / dustSide.fog).toFixed(0)} m inside, ${(2.2 / clearSide.fog / 1000).toFixed(0)} km outside`);
  ok(clearSide.wallVisible, 'the wall is drawn while it is still coming', '');

  /* Coastal fog penetrates 80 km inland. Eighty kilometres inland from WHAT,
     so the test is the relationship to the coast, not a pair of coordinates
     that would have to be invented. */
  await page.evaluate(() => window.__env.setWeather('fog'));
  await page.waitForTimeout(400);
  const f = await page.evaluate((km) => {
    let wrong = 0, wettest = 0, deepest = 0;
    for (let x = -1200; x <= 1200; x += 37) {
      for (let z = -900; z <= 750; z += 41) {
        const cd = window.__coastDistance(x * km, z * km);
        const fg = window.__fogAt(x * km, z * km);
        if (cd > 80 * km && fg > 0) wrong++;
        if (cd > 0 && cd < 80 * km) { wettest = Math.max(wettest, fg); deepest = Math.max(deepest, cd); }
      }
    }
    return { wrong, wettest, deepest };
  }, KMm);
  ok(f.wrong === 0, 'coastal fog stops 80 km inland, everywhere',
     `${f.wrong} sample points inland of 80 km still had fog`);
  ok(f.wettest > 0.9 && f.deepest > 70000, 'and it does reach that far in',
     `thickest ${f.wettest.toFixed(2)}, deepest sample ${(f.deepest / 1000).toFixed(0)} km inland`);
  /* Tied to canon geography rather than to a coordinate picked to pass:
     Mensah's Landing is a port, so the port is in the fog. */
  const port = await page.evaluate(km => window.__fogAt(40 * km, 110 * km), KMm);
  ok(port > 0.5, "Mensah's Landing is in it, being a port", `fog ${port.toFixed(2)} at the Landing`);

  await page.evaluate(() => window.__env.setWeather('clear'));
  await page.waitForTimeout(300);
}

console.log('\nG4. the Glass Desert is a mirror, and it is visible from Sundisk');
{
  const lumOf = (px) => px.reduce((s, [r, g, b]) => s + 0.299 * r + 0.587 * g + 0.114 * b, 0) / px.length;
  await page.evaluate(() => window.__env.setTime(23));

  /* A grazing look across the sheet, and the same look across the sand sea.
     Glass is the darker material of the two by a wide margin, so at night,
     with no sun at all, the only thing that can make it the brighter one is
     that it is reflecting the sky and the stars. */
  const groundGrid = [];
  for (let x = 120; x <= 520; x += 50) for (let y = 250; y <= 330; y += 20) groundGrid.push([x, y]);
  const overGround = async (ax, az) => {
    await page.evaluate(([ax, az]) => {
      const gy = window.__terrainHeight(ax, az);
      window.__lookFrom(ax, gy + 260, az, ax + 2600, gy + 120, az);
    }, [ax, az]);
    await page.waitForTimeout(9000);
    return lumOf(await page.evaluate(g => window.__samplePixels(g), groundGrid));
  };
  const gGlass = await overGround(530e3, -70e3);
  const gSand = await overGround(300e3, -40e3);
  ok(gGlass / gSand > 1.5, 'at night the sheet is brighter than sand it is darker than',
     `glass ${gGlass.toFixed(1)} against sand ${gSand.toFixed(1)}, ${(gGlass / gSand).toFixed(2)}x`);

  /* Canon: the glow is visible from Sundisk's walls, three hundred kilometres
     away. The sheet itself cannot be: Part 1.3 puts the Street tier far plane
     at four kilometres, and at that range the sheet is a band thinner than a
     pixel anyway. What carries it is the air above the sheet, so the test is
     that the eastern sky is brighter than the rest of the sky and not that a
     surface is drawn. */
  const skyGrid = [];
  for (let x = 200; x <= 440; x += 20) for (let y = 140; y <= 175; y += 7) skyGrid.push([x, y]);
  const fromWall = async (dx, dz) => {
    await page.evaluate(([dx, dz]) => {
      const gy = window.__terrainHeight(5500, 0) + 9;        // on the Great Wall
      window.__lookFrom(5500, gy, 0, 5500 + dx, gy, dz);
    }, [dx, dz]);
    await page.waitForTimeout(7000);
    return lumOf(await page.evaluate(g => window.__samplePixels(g), skyGrid));
  };
  const east = await fromWall(4000, -520);
  const west = await fromWall(-4000, 520);
  const north = await fromWall(-520, -4000);
  ok(east / west > 1.25, 'from the Great Wall the eastern sky carries the glow',
     `east ${east.toFixed(1)} against west ${west.toFixed(1)}, ${(east / west).toFixed(2)}x`);
  ok(Math.abs(west - north) / Math.max(west, north) < 0.10,
     'and it is a direction, not a brighter night',
     `west ${west.toFixed(1)}, north ${north.toFixed(1)}`);

  await page.evaluate(() => window.__env.setTime(10));
  await page.waitForTimeout(400);
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
