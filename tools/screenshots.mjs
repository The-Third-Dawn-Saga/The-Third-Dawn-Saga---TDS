/* ============================================================
   BROWSER VERIFICATION + SCREENSHOT DIFF SET
   Loads the built single-file atlas from disk (file://), runs the
   in-page test hooks, and captures the review set:
   map: satellite/atlas × High/Deep · cosmos: day/night.
   Run: node tools/screenshots.mjs
   ============================================================ */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const atlas = fileURLToPath(new URL('../Third_Dawn_Definitive_Atlas.html', import.meta.url));
mkdirSync(new URL('../screenshots/', import.meta.url), { recursive: true });
const shot = n => fileURLToPath(new URL(`../screenshots/${n}.png`, import.meta.url));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('file://' + atlas);
await page.waitForFunction(() => typeof window.__landCheck === 'function');

// canon hooks in the real browser build
const land = await page.evaluate(() => window.__landCheck());
if (land.length) { console.error('LAND CHECK FAILED', land); process.exit(1); }
const j = await page.evaluate(() => window.__journey('fishing', 'sundisk', 1));
const se = j.out.find(r => r.modeId === 'suneater');
if (Math.floor(se.days) !== 2 || se.recharges !== 0) { console.error('RULING FAILED', se); process.exit(1); }
console.log('in-browser hooks: landCheck [], fishing→Sundisk =', se.time, 'rech', se.recharges);

// wait for the worker raster, then the map set
async function mapShot(style, season, name){
  await page.evaluate(([st, se]) => { window.__setStyle(st); window.__setSeason(se); }, [style, season]);
  await page.evaluate(() => window.__rasterReady());
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot(name) });
  console.log('shot', name);
}
await mapShot('satellite', 1, 'map_satellite_high');
await mapShot('satellite', 3, 'map_satellite_deep');
await mapShot('atlas', 1, 'map_atlas_high');
await mapShot('atlas', 3, 'map_atlas_deep');

// migration flows visible (Late season has the most); zoom to the Jade rivers
await page.evaluate(() => window.__go('map'));
await mapShot('satellite', 2, 'map_satellite_late_migrations');
await page.evaluate(() => {
  // zoom onto the Three Great Rivers + Lake of a Hundred Autumns
  window.__setSeason(2);
  const c = document.getElementById('mapCanvas');
  const r = c.getBoundingClientRect();
  // simulate zoom-in centred on the Jade Empire via the wheel API surface
  window.dispatchEvent(new Event('resize'));
});
await page.mouse.move(1250, 560);
for (let i = 0; i < 9; i++){ await page.mouse.wheel(0, -240); await page.waitForTimeout(90); }
await page.evaluate(() => window.__tilesReady());
await page.waitForTimeout(500);
await page.screenshot({ path: shot('map_jade_flows_zoom') });
console.log('shot map_jade_flows_zoom (LOD tiles resolved)');

// cosmos: day, then night
await page.evaluate(() => window.__go('cosmos'));
await page.waitForTimeout(2500); // let the 4096 texture land
await page.screenshot({ path: shot('cosmos_day') });
console.log('shot cosmos_day');
await page.evaluate(() => {
  const dn = document.getElementById('dayNight');
  dn.value = 940; dn.dispatchEvent(new Event('input'));
});
await page.waitForTimeout(600);
await page.screenshot({ path: shot('cosmos_night') });
console.log('shot cosmos_night');

// flyTo sanity
await page.evaluate(() => window.__cosmosFlyTo({ x: 4350, y: 5320, name: 'Sundisk City' }));
await page.waitForTimeout(2600);
await page.screenshot({ path: shot('cosmos_flyto_sundisk') });
console.log('shot cosmos_flyto_sundisk');

const fatal = errors.filter(e => !/favicon/.test(e));
if (fatal.length) { console.error('BROWSER ERRORS:\n' + fatal.join('\n')); process.exit(1); }
console.log('browser run clean — no console errors');
await browser.close();
