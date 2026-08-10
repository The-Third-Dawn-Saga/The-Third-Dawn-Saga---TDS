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
  ['dunes',         -300, -240, 9 * KM, 8, 'clear', 'greening'],
  ['dunes_low',     -300, -240, 900, 7.5, 'clear', 'greening'],
  ['ashteeth',      120, -880, 26 * KM, 9, 'clear', 'greening'],
  ['cliffs',        62, 110, 3 * KM, 8, 'clear', 'greening'],
  ['coast',         40, 100, 14 * KM, 16, 'clear', 'greening'],
  ['glass',         530, -70, 60 * KM, 12, 'clear', 'greening'],
  ['saltflats',     -520, 40, 45 * KM, 11, 'clear', 'dust'],
  ['sundisk',       0, 0, 11 * KM, 8, 'clear', 'greening'],
  ['sundisk_low',   0, -3.2, 700, 7, 'clear', 'greening'],
  ['ashlands',      -1900, -100, 90 * KM, 11, 'clear', 'greening'],
  ['harmattan',     -200, -100, 4 * KM, 11, 'harmattan', 'dust'],
  ['dusk',          -300, -240, 3 * KM, 18.3, 'clear', 'dust'],
  ['night',         0, 0, 6 * KM, 23, 'clear', 'greening'],
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
for (const [name, xk, zk, alt, tod, weather, season] of VIEWS) {
  if (want.length && !want.includes(name)) continue;
  await page.evaluate(([x, z, a, t, w, s]) => {
    window.__env.setTime(t); window.__env.setWeather(w); window.__env.setSeason(s);
    window.__flyTo(x, z, a);
  }, [xk * KM, zk * KM, alt, tod, weather, season]);
  await page.waitForFunction(() => window.__terrainSettled(), null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, OUT)) });
  const s = await page.evaluate(() => window.__stats());
  console.log(`${name.padEnd(15)} draws ${String(s.draws).padStart(4)}  tris ${String(Math.round(s.triangles / 1000)).padStart(5)}k  chunks ${s.terrain.visible}`);
}

await browser.close();
server.close();
