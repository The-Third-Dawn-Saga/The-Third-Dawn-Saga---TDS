/* ============================================================
   SMOKE TESTS — canon rules that must never regress.
   Pure-Node layer (data + geo), plus built-file checks.
   Run: node test/smoke.mjs
   ============================================================ */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const D = require('../src/data.js');
const G = require('../src/geo.js');

let failures = 0;
function t(name, cond, detail){
  if(cond) console.log('  ok  ' + name);
  else { failures++; console.error('FAIL  ' + name + (detail?'  — '+detail:'')); }
}

console.log('— land check —');
const bad = G.landCheck();
t('__landCheck() returns []', bad.length===0, JSON.stringify(bad));

console.log('— the fishing-village ruling (LOCKED) —');
{
  const A=D.SETTLEMENTS.find(s=>s.id==='fishing'), B=D.SETTLEMENTS.find(s=>s.id==='sundisk');
  const j=G.computeJourney({x:A.x,y:A.y},{x:B.x,y:B.y},1); // High season = baseline
  const se=j.out.find(r=>r.modeId==='suneater');
  t('distance ≈ 776 mi (within Sun Eater range 810)', Math.round(j.straight)===776 && j.straight<=D.TRAVEL.modes.suneater.range, 'got '+Math.round(j.straight));
  t('Sun Eater: two days', Math.floor(se.days)===2, 'got '+se.days.toFixed(2)+' days');
  t('Sun Eater: no recharge, one crystal', se.recharges===0, 'got '+se.recharges);
  t('no seasonal modifier at baseline High', !j.seasonal);
}

console.log('— the Paradise embargo —');
{
  // journey INTO Zar'kaine must never arrive via Paradise Terminal
  const target={x:6542,y:1628}; // Paradise Lost itself
  const g=G.nearestGate(target,true);
  t('arrival gate skips Paradise', g.gate.id!=='g_paradise', 'got '+g.gate.id);
  const j=G.computeJourney({x:4500,y:3500},target,1);
  const gate=j.out.find(r=>r.modeId==='gate');
  t('gate route arrival is not Paradise', gate && gate.arrivalGate!=='g_paradise', gate&&gate.arrivalGate);
  t('journey flags the embargo skip', j.embargoSkipped===true);
  // and Paradise remains a valid DEPARTURE gate
  const dep=G.nearestGate(target,false);
  t('Paradise valid as departure', dep.gate.id==='g_paradise', dep.gate.id);
}

console.log('— gate transit formula —');
{
  const j=G.computeJourney({x:4450,y:1520},{x:4370,y:5300},1); // Ironhaven → Sundisk (near full N-S)
  const gate=j.out.find(r=>r.modeId==='gate');
  t('gate mode exists', !!gate);
  const m=/Aetherial Stream (\d+) min/.exec(gate.detail);
  const min=+m[1];
  t('transit clamped 10–95 min', min>=10&&min<=95, min+' min');
}

console.log('— seasonal systems —');
{
  t('six season zones', Object.keys(D.SEASONS).length===6);
  t('four wheel stops', D.SEASON_STOPS.length===4);
  t('every zone has a 4-stop calendar', Object.values(D.SEASON_NAMES).every(a=>a.length===4));
  const activeSets=new Set();
  for(const mg of D.MIGRATIONS) for(const s of Object.keys(mg.seasons)) activeSets.add(mg.zone+':'+s);
  t('≥4 migration flow sets', D.MIGRATIONS.length>=4, D.MIGRATIONS.length+' sets');
  t('all six zones have flows', new Set(D.MIGRATIONS.map(m=>m.zone)).size===6);
  // seasonal raster variants actually differ (Faro's Mirror: water in Greening, salt in the Dust)
  const F=D.LAKES.find(l=>l.id==='faros');
  const px=(season)=>{ const b=new Uint8ClampedArray(4);
    G.paintRegion(b,1,1,F.x-0.5,F.y-0.5,F.x+0.5,F.y+0.5,{style:'satellite',season}); return [...b]; };
  const wet=px(1), dry=px(3);
  t("Faro's Mirror: Greening≠Dust pixels", wet.join()!==dry.join(), wet.join()+' vs '+dry.join());
  // deep winter halves foot speed in the taiga (PROPOSED modifier)
  const base=G.sampleTerrainSpeeds({x:4200,y:1600},{x:4700,y:1600},'foot',1).days;
  const deep=G.sampleTerrainSpeeds({x:4200,y:1600},{x:4700,y:1600},'foot',3).days;
  t('deep winter slows taiga foot travel ~2×', deep>base*1.8, (deep/base).toFixed(2)+'×');
  // Harmattan slows desert travel 20%
  const bd=G.sampleTerrainSpeeds({x:3800,y:5400},{x:4600,y:5400},'mount',1).days;
  const hd=G.sampleTerrainSpeeds({x:3800,y:5400},{x:4600,y:5400},'mount',2).days;
  t('Harmattan slows desert ~1.25×', Math.abs(hd/bd-1.25)<0.05, (hd/bd).toFixed(3)+'×');
  // activity markers all sit on land
  const badAct=D.SEASON_ACTIVITIES.filter(a=>!G.landAt(a.x,a.y)).map(a=>a.id);
  t('activity markers on land', badAct.length===0, badAct.join(','));
}

console.log('— built file integrity —');
{
  const built='Third_Dawn_Definitive_Atlas.html';
  if(!existsSync(new URL('../'+built, import.meta.url))){
    t('built file exists', false, 'run node build.mjs first');
  } else {
    const html=readFileSync(new URL('../'+built, import.meta.url),'utf8');
    const idx=readFileSync(new URL('../index.html', import.meta.url),'utf8');
    t('index.html identical to atlas', html===idx);
    t('single-file: no external src/href fetches',
      !/<script[^>]+src=|<link[^>]+href=|url\(https?:/i.test(html));
    // every PROPOSED / RECONCILE tag in the data (info strings — the canon-workflow
    // markers, not code comments) survives the build verbatim
    const { transformSync } = await import('esbuild');
    const srcData=transformSync(readFileSync(new URL('../src/data.js', import.meta.url),'utf8'),
      {loader:'js',minifyWhitespace:true,legalComments:'none'}).code;
    const count=(s,re)=>(s.match(re)||[]).length;
    t('PROPOSED tags preserved', count(html,/PROPOSED/g)>=count(srcData,/PROPOSED/g),
      count(html,/PROPOSED/g)+' vs '+count(srcData,/PROPOSED/g));
    t('RECONCILE tags preserved', count(html,/RECONCILE/g)>=count(srcData,/RECONCILE/g),
      count(html,/RECONCILE/g)+' vs '+count(srcData,/RECONCILE/g));
    t('canon markers intact', html.includes('tree-killing cannon')||html.includes('Spire of Ascension'));
  }
}

console.log(failures? `\n${failures} FAILURE(S)` : '\nall smoke tests green');
process.exit(failures?1:0);
