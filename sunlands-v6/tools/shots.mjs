/* ============================================================================
   shots.mjs  ::  capture a review set from the live page.

   Run: node sunlands-v6/tools/shots.mjs [name ...]
   With no arguments it captures the whole set.
   ========================================================================= */

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = new URL('../screenshots/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const KM = 1000;

/* name, x km, z km, altitude m, time of day, weather, season */
export const VIEWS = [
  ['territory',     0, 120, 1450 * KM, 10, 'clear', 'greening'],
  ['sunlands_wide', 0, 40, 420 * KM, 9, 'clear', 'greening'],
  ['erg',           -72, -96, 8 * KM, 8, 'clear', 'greening'],
  ['erg_low',       -72, -96, 260, 7.5, 'clear', 'greening'],
  ['erg_horizon',   -72, -96, 90, 9, 'clear', 'greening', 90],
  ['reg',           -300, -240, 2 * KM, 10, 'clear', 'greening'],
  ['ashteeth',      120, -880, 26 * KM, 9, 'clear', 'greening'],
  ['cliffs',        62, 110, 3 * KM, 8, 'clear', 'greening'],
  ['coast',         40, 100, 14 * KM, 16, 'clear', 'greening', 150],
  ['shore',         66, 118, 260, 9, 'clear', 'greening', 150],
  ['sea',           40, 260, 3 * KM, 10, 'clear', 'greening', 340],
  ['glass',         530, -70, 60 * KM, 12, 'clear', 'greening'],
  ['saltflats',     -520, 40, 45 * KM, 11, 'clear', 'dust'],
  ['sundisk',       0, 0, 11 * KM, 8, 'clear', 'greening'],
  ['sundisk_low',   0, -3.2, 700, 7, 'clear', 'greening'],
  ['ashlands',      -1900, -100, 90 * KM, 11, 'clear', 'greening'],
  ['harmattan',     -200, -100, 4 * KM, 11, 'harmattan', 'dust'],
  ['dusk',          -72, -96, 400, 18.3, 'clear', 'dust', 180],
  ['night',         -72, -96, 300, 23, 'clear', 'greening'],
  ['noon_shimmer',  -72, -96, 120, 13, 'clear', 'dust'],
];

/* Views that need more than a point and an altitude: a grazing look across a
   plain, a storm front put somewhere in particular, an hour chosen so a thing
   that only happens on the clock is happening. Each one names what it is for,
   because a screenshot nobody can tell the point of is not review material. */
export const SCENES = [
  /* Looking DOWN at the sheet, not along it. A flat mirror seen edge-on
     returns the sky and nothing else, which is correct and tells you nothing:
     the shot has to be steep enough to see the glass as well as what it is
     reflecting. */
  ['glass_mirror', 'the sheet from above, reflecting the late morning sky', () => {
    window.__env.setTime(10); window.__env.setWeather('clear');
    const gy = window.__terrainHeight(530e3, -70e3);
    window.__lookFrom(530e3, gy + 340, -70e3, 530e3 + 620, gy, -70e3 - 180);
  }],
  ['glass_night', 'the same sheet at midnight, carrying the stars', () => {
    window.__env.setTime(23);
    const gy = window.__terrainHeight(530e3, -70e3);
    window.__lookFrom(530e3, gy + 340, -70e3, 530e3 + 620, gy, -70e3 - 180);
  }],
  ['wall_glow', "from Sundisk's Great Wall at midnight, looking east", () => {
    window.__env.setTime(23);
    const gy = window.__terrainHeight(5500, 0) + 9;
    window.__lookFrom(5500, gy, 0, 5500 + 4000, gy, -520);
  }],
  ['dust_wall', 'the Harmattan front, three kilometres out from the Commons', () => {
    window.__env.setTime(10); window.__env.setWeather('harmattan');
    /* Put the front three kilometres upwind of the camera: close enough to
       fill the sky, far enough that you are still standing in clear air and
       watching it come. frontOffset is measured along the wind axis, so the
       front distance has to be set from the camera's own position on it. */
    const w = window.__WIND, cx = 7200, cz = 0;
    window.__setFront(cx * w.x + cz * w.z - 3000);
    const gy = window.__terrainHeight(cx, cz);
    window.__lookFrom(cx, gy + 120, cz, cx - w.x * 3400, gy + 700, cz - w.z * 3400);
  }],
  ['temple_pools', 'the temple quarter mid-morning, light pools on the roofs', () => {
    window.__env.setTime(8.4); window.__env.setWeather('clear');
    window.__lookFrom(520 - 250, window.__terrainHeight(0, 0) + 120, -180 - 250,
                      520, window.__terrainHeight(0, 0) + 10, -180);
  }],
  ['drums_noon', 'solar noon, the drum rings crossing the Grand Market', () => {
    window.__env.setTime(12);
    window.__lookFrom(0, window.__terrainHeight(0, 0) + 900, 2600,
                      0, window.__terrainHeight(0, 0), 200);
  }],
  ['gate_dawn', 'the eastern gate at dawn, and the queue for it', () => {
    window.__env.setTime(6.4);
    const gy = window.__terrainHeight(5500, 0);
    window.__lookFrom(5500 + 300, gy + 46, 190, 5500 + 60, gy + 6, 0);
  }],
  /* On an actual watercourse. The first attempt at this shot was framed on
     open reg where the wadi weight is near zero, so the flood was running
     correctly and there was nothing on screen to run in. The location below
     was found by searching the classification for a channel rather than by
     picking somewhere that looked likely. */
  ['wadi_flood', 'the brief violent rain, and a wadi running', () => {
    window.__env.setTime(15); window.__env.setWeather('rain');
    const wx = -270e3, wz = 182e3;
    const gy = window.__terrainHeight(wx, wz);
    window.__lookFrom(wx, gy + 130, wz, wx + 1500, gy + 20, wz + 380);
  }],
];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => console.error('pageerror:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });

await page.goto(`${base}/index.html?dev=1`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__flyTo === 'function', null, { timeout: 30000 });

const want = process.argv.slice(2);
for (const [name, xk, zk, alt, tod, weather, season, heading] of VIEWS) {
  if (want.length && !want.includes(name)) continue;
  await page.evaluate(([x, z, a, t, w, s, h]) => {
    window.__env.setTime(t); window.__env.setWeather(w); window.__env.setSeason(s);
    window.__flyTo(x, z, a, h);
  }, [xk * KM, zk * KM, alt, tod, weather, season, heading === undefined ? null : heading]);
  await page.waitForFunction(() => window.__terrainSettled(), null, { timeout: 300000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ timeout: 180000, path: fileURLToPath(new URL(`${name}.png`, OUT)) });
  const s = await page.evaluate(() => window.__stats());
  console.log(`${name.padEnd(15)} draws ${String(s.draws).padStart(4)}  tris ${String(Math.round(s.triangles / 1000)).padStart(5)}k  chunks ${s.terrain.visible}`);
}

/* The scenes. Terrain still has to settle, and the rain and the drums need a
   few frames of clock on top of that before there is anything to photograph. */
for (const [name, what, setup] of SCENES) {
  if (want.length && !want.includes(name)) continue;
  await page.evaluate(setup);
  await page.waitForFunction(() => window.__terrainSettled(), null, { timeout: 300000 }).catch(() => {});
  await page.evaluate(setup);            // settling moves the orbit target, so re-aim
  await page.waitForTimeout(2500);
  await page.screenshot({ timeout: 180000, path: fileURLToPath(new URL(`${name}.png`, OUT)) });
  const s = await page.evaluate(() => window.__stats());
  console.log(`${name.padEnd(15)} draws ${String(s.draws).padStart(4)}  tris ${String(Math.round(s.triangles / 1000)).padStart(5)}k   ${what}`);
}

await browser.close();
server.close();
