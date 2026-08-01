/* ============================================================
   BROWSER VERIFICATION — July 2026 lockdowns
   ("The Unhealed", "The Salt and the Unknown One", "The Vault",
   "The Angels Door").
   Loads the built single-file atlas from disk, click-tests every new
   feature through the real hit-tester, and captures the review shots.
   Run: node tools/verify_canon_july2026.mjs
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

let failures = 0;
const t = (name, cond, detail) => {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.error('FAIL  ' + name + (detail ? '  — ' + detail : '')); }
};

/* ---------- the standing canon contract ---------- */
console.log('— canon contract in the real build —');
const land = await page.evaluate(() => window.__landCheck());
t('__landCheck() returns []', land.length === 0, JSON.stringify(land));
const j = await page.evaluate(() => window.__journey('fishing', 'sundisk', 1));
const se = j.out.find(r => r.modeId === 'suneater');
t('fishing village → Sundisk: 2 days by Sun Eater', Math.floor(se.days) === 2, se.time);
t('one crystal, no recharge', se.recharges === 0, String(se.recharges));
t('Paradise Terminal exit-only (embargo skip flagged)',
  (await page.evaluate(() => window.__journey('verdanthome', 'paradise', 1))).embargoSkipped === true);
const gateLeg = (await page.evaluate(() => window.__journey('ironhaven', 'sundisk', 1))).out.find(r => r.modeId === 'gate');
t('gate transit clamped 10–95 min', (m => m && +m[1] >= 10 && +m[1] <= 95)(/Aetherial Stream (\d+) min/.exec(gateLeg.detail)), gateLeg.detail);

/* ---------- click tests ---------- */
console.log('— click tests: new features resolve through the real hit-tester —');
await page.evaluate(() => window.__setView(4500, 3500, 0.12));

async function pick(x, y, opts = {}) {
  if (opts.zoom) await page.evaluate(([x, y, s]) => window.__setView(x, y, s), [x, y, opts.zoom]);
  return page.evaluate(([x, y]) => window.__pick(x, y), [x, y]);
}
async function expectPick(label, x, y, wantId, wantKind, zoom) {
  const r = await pick(x, y, { zoom: zoom || 0.5 });
  const ok = r && r.id === wantId && r.kind === wantKind && r.open && r.heading;
  t(label, ok, r ? `got ${r.kind}:${r.id} "${r.heading}"` : 'no feature');
  return r;
}

// hidden world OFF first: the hidden isles must be unreachable
await page.evaluate(() => window.__setLayer('hidden', false));
const offDoor = await pick(7300, 350, { zoom: 0.5 });
t('Isle of the Last Door is unreachable with Hidden World off', !offDoor || offDoor.id !== 'lastdoor',
  offDoor && offDoor.id);
const offLost = await pick(4300, 250, { zoom: 0.5 });
t('Lost Isle is unreachable with Hidden World off', !offLost || offLost.id !== 'lostisle', offLost && offLost.id);

// forests + temple (hidden layer irrelevant)
await expectPick('the Forest of the Forgetting', 1800, 3250, 'forgetting', 'forest');
await expectPick('Vargholt', 3450, 1290, 'vargholt', 'forest');
await expectPick('the Widow Wood', 5470, 4270, 'widowwood', 'forest');
await expectPick('the Wardwood', 4330, 3400, 'wardwood', 'forest');
await expectPick('the Temple of the Unknown One', 3702, 3444, 'unknowntemple', 'wonder', 1.2);
// the Wardwood's clearing keeps the World Tree clickable
const tree = await pick(4500, 3500, { zoom: 1.2 });
t('the World Tree still resolves inside the Wardwood clearing',
  tree && (tree.id === 'worldtree' || tree.id === 'verdanthome' || tree.id === 'g_worldtree'),
  tree && `${tree.kind}:${tree.id}`);

// hidden world ON
await page.evaluate(() => window.__setLayer('hidden', true));
await expectPick('the Old Cathedral — the Undercroft', 5750, 1900, 'undercroft', 'hidden', 1.2);
await expectPick("the Aunt's Cottage", 5520, 4330, 'auntscottage', 'hidden', 1.2);
await expectPick('the Ice Edge — the Winter Crossing', 4550, 780, 'iceedge', 'hidden', 1.2);
await expectPick('the Isle of the Last Door', 7300, 350, 'lastdoor', 'island', 0.5);
await expectPick('the Lost Isle', 4300, 250, 'lostisle', 'island', 0.5);
await expectPick('the Drowned Kingdom Whirlpool', 250, 3200, 'm_eelway', 'maelstrom', 0.5);

/* ---------- tags verbatim in the rendered panel ---------- */
console.log('— tags verbatim in the rendered info panel —');
const tagChecks = [
  ['forgetting', 1800, 3250, '[LOCKED — The Unhealed, July 2026]', 'forest'],
  ['vargholt', 3450, 1290, 'RECONCILE pending ruling]', 'forest'],
  ['wardwood', 4330, 3400, 'RECONCILE note: the Whisperwood is read as a named grove WITHIN the Wardwood]', 'forest'],
  ['unknowntemple', 3702, 3444, '[LOCKED — The Salt and the Unknown One, July 2026]', 'wonder'],
  ['undercroft', 5750, 1900, '[LOCKED — The Unhealed. The piano is never explained.]', 'hidden'],
  ['auntscottage', 5520, 4330, '[LOCKED — The Unhealed; what she is remains OPEN]', 'hidden'],
  ['lastdoor', 7300, 350, '[LOCKED — The Unhealed + The Angels Door amendment, July 2026]', 'island'],
  ['lostisle', 4300, 250, 'PROPOSED: they are psychopomps; never stated on the page.]', 'island'],
  ['m_eelway', 250, 3200, 'OPEN: whether the whirlpools are a distinct phenomenon', 'maelstrom'],
];
for (const [id, x, y, tag] of tagChecks) {
  const r = await pick(x, y, { zoom: id === 'unknowntemple' || id === 'undercroft' || id === 'auntscottage' ? 1.2 : 0.5 });
  t(`${id}: tag survives to the panel`, r && r.body.includes(tag), r && r.id);
}
// the two appended kingdom sentences, read off the panel
const ash = await pick(2000, 2900, { zoom: 0.2 });
t('Western Ashlands panel carries the amnesia-field sentence',
  ash && ash.body.includes('lived beside an amnesia field since before any kingdom had a name'), ash && ash.id);
const nor = await pick(3900, 1700, { zoom: 0.2 });
t('Northern Throne panel carries the underground sentence',
  nor && nor.body.includes('the older cause walks across the ice each winter'), nor && nor.id);

/* ---------- regression: the standing feature set ---------- */
console.log('— regression: standing features still resolve —');
await expectPick('the Weapon = the tree-killing cannon', 640, 4290, 'weapon', 'hidden', 0.5);
const weapon = await pick(640, 4290, { zoom: 0.5 });
t('Weapon panel names the cannon, not the Spire',
  weapon.heading.includes('Tree-Killing Cannon') && weapon.body.includes('Weapon = the cannon: LOCKED'), weapon.heading);
await expectPick('the Celestial Circle', 5290, 3860, 'celestialcircle', 'wonder', 1.2);
const reaches = await pick(2900, 4500, { zoom: 0.3 });
t('the Red Reaches still bound as badlands', reaches && reaches.kind === 'badlands', reaches && reaches.kind);

/* ---------- the Last Fish ring + the relocated Sanctuary ---------- */
console.log('— the Last Fish ring, the Sanctuary, and the hidden isles —');
await page.evaluate(() => window.__setLayer('hidden', false));
await expectPick('the Isle of the Last Fish', 6250, 330, 'lastfish', 'island', 0.5);
for (const [n, x, y] of [['north', 6250, 180], ['east', 6415, 330], ['south', 6250, 480], ['west', 6085, 330]]) {
  const r = await pick(x, y, { zoom: 0.6 });
  t(`outer isle (${n}) resolves to the ring`, r && r.kind === 'island' && /Last Fish/.test(r.body),
    r && `${r.kind}:${r.id}`);
}
await expectPick('Guardian Whirlpool — western gate', 5950, 560, 'm_fish_w', 'maelstrom', 0.5);
await expectPick('Guardian Whirlpool — eastern gate', 6560, 540, 'm_fish_e', 'maelstrom', 0.5);
await expectPick("Kaelen's Sanctuary at its new station", 8650, 4550, 'lastlight', 'island', 0.6);
{
  const r = await pick(8650, 4550, { zoom: 0.6 });
  t('the Sanctuary keeps its canon text', r && r.body.includes('I’ve killed enough. Here, I save what I can.'), r && r.id);
  const old = await pick(8480, 3050, { zoom: 0.3 });
  t('nothing island-shaped remains at the old station', !old || old.id !== 'lastlight', old && `${old.kind}:${old.id}`);
}
// the Last Door: reachable and drawn once Hidden World is on, and not clipped at y=0
await page.evaluate(() => window.__setLayer('hidden', true));
{
  await page.evaluate(() => { window.__setStyle('satellite'); window.__setView(4500, 3500, 0.12); });
  await page.evaluate(() => window.__rasterReady());
  await page.waitForTimeout(600);   // let the scheduled frame actually draw
  const painted = await page.evaluate(() => {
    // sample the overlay where the Last Door draws, at the default view
    const c = document.getElementById('mapCanvas');
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const sx = (7300 - 4500) * 0.12 * DPR + c.width / 2;
    const sy = (350 - 3500) * 0.12 * DPR + c.height / 2;
    const px = c.getContext('2d').getImageData(Math.round(sx) - 8, Math.round(sy) - 8, 17, 17).data;
    let ink = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 20) ink++;
    return { sx, sy, ink, onscreen: sx > 0 && sy > 0 && sx < c.width && sy < c.height };
  });
  t('the Last Door draws on screen at the default view', painted.onscreen && painted.ink > 100,
    JSON.stringify(painted));
  const s = await page.evaluate(() => {
    const i = TDA_DATA.ISLANDS.find(v => v.id === 'lastdoor');
    return { top: i.y - i.ry * 1.34, y: i.y, ry: i.ry };
  });
  t('the Last Door is not clipped at the map’s top edge', s.top > 0, 'rim top at y=' + s.top.toFixed(0));
  const lbl = await page.evaluate(() => {
    window.__setView(7300, 350, 0.5);
    return typeof window.__pick === 'function';
  });
  const r = await pick(7300, 350, { zoom: 0.5 });
  t('the Last Door labels and hit-tests with Hidden World on', lbl && r && r.id === 'lastdoor', r && r.id);
}

/* ---------- screenshots ---------- */
console.log('— review screenshots —');
async function capture(name, { x, y, scale, style = 'satellite', season = 1, hidden = false }) {
  await page.evaluate(() => document.querySelector('#infoPanel .ip-close').click());  // clear the click-test panel
  await page.evaluate(([st, se]) => { window.__setStyle(st); window.__setSeason(se); }, [style, season]);
  await page.evaluate(() => window.__rasterReady());
  await page.evaluate(h => window.__setLayer('hidden', h), hidden);
  await page.evaluate(([x, y, s]) => window.__setView(x, y, s), [x, y, scale]);
  await page.evaluate(() => window.__tilesReady());
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot(name) });
  console.log('  shot', name);
}
// (a) Ashlands zoom showing the Forgetting
await capture('canon_a_ashlands_forgetting', { x: 1850, y: 3300, scale: 0.62 });
// (b) north zoom showing Vargholt + the Gloamwood
await capture('canon_b_north_vargholt_gloamwood', { x: 3500, y: 1520, scale: 0.55 });
// (c) Heartlands showing the Wardwood + the Temple
await capture('canon_c_heartlands_wardwood_temple', { x: 4120, y: 3440, scale: 0.55 });
// (d) Hidden World on, far north showing both isles
await capture('canon_d_hidden_far_north_isles', { x: 5800, y: 380, scale: 0.28, hidden: true });
// (e) the Widow Wood on the Wool Road
await capture('canon_e_widowwood_wool_road', { x: 5560, y: 4340, scale: 0.5 });
// painted-style read of the Forgetting: it must look wrong, not lush
await capture('canon_f_painted_forgetting', { x: 1850, y: 3300, scale: 0.62, style: 'painted' });
// (g) Deep season: the organic frozen sea, in all three styles
await capture('canon_g_deep_frozen_sea', { x: 4500, y: 1500, scale: 0.20, season: 3 });
await capture('canon_g2_deep_frozen_sea_painted', { x: 4500, y: 1500, scale: 0.20, season: 3, style: 'painted' });
await capture('canon_g3_deep_frozen_sea_atlas', { x: 4500, y: 1500, scale: 0.20, season: 3, style: 'atlas' });
// (h) the Last Fish ring, zoomed
await capture('canon_h_lastfish_ring', { x: 6250, y: 340, scale: 1.05 });
// (i) the relocated, smaller Sanctuary
await capture('canon_i_sanctuary_relocated', { x: 8480, y: 4520, scale: 0.60 });
// (j) hidden world on, far north: both hidden isles against the ice
await capture('canon_j_hidden_isles_vs_ice', { x: 5800, y: 380, scale: 0.30, hidden: true });

/* ---------- cosmos: the widened ocean between continent and wall ---------- */
console.log('— cosmos —');
await page.evaluate(() => document.querySelector('#infoPanel .ip-close').click());
await page.evaluate(() => window.__go('cosmos'));
await page.waitForTimeout(3000);
await page.screenshot({ path: shot('canon_k_cosmos_widened_ocean') });
console.log('  shot canon_k_cosmos_widened_ocean');
const cage = await page.evaluate(() => window.__cosmosScale());
t('the ocean gap is 60–80%+ of the continent’s own radius',
  cage.gapMajor / cage.contA >= 0.6, `${cage.gapMajor} units = ${(cage.gapMajor / cage.contA * 100).toFixed(0)}% of ${cage.contA}`);
t('every leviathan swims between the coast and the wall',
  cage.leviathans.every(l => l.min > cage.contA && l.max < cage.wall),
  JSON.stringify(cage.leviathans));
t('the whole world rect sits inside the wall', cage.worldCorner < cage.wall,
  `corner ${cage.worldCorner} vs wall ${cage.wall}`);
t('every ocean feature stays between coast and wall', cage.featuresInside === true,
  'farthest feature at ' + cage.farthestFeature);
t('the cage fits the default camera framing', cage.fitsDefaultView === true,
  `dist ${cage.dist}, worst on-screen margin ${cage.framingMargin} (must be <= 1)`);

const fatal = errors.filter(e => !/favicon/.test(e));
if (fatal.length) { console.error('BROWSER ERRORS:\n' + fatal.join('\n')); failures++; }
else console.log('  ok  browser run clean — no console errors');

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nJuly 2026 canon verification green');
process.exit(failures ? 1 : 0);
