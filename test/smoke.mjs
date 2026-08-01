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

console.log('— iteration 3: canon weapon ruling (LOCKED) —');
{
  const w=D.HIDDEN.find(h=>h.id==='weapon');
  t('the Weapon is the tree-killing cannon', /Tree-Killing Cannon/i.test(w.name), w.name);
  t('LOCKED tag present', w.info.includes('Weapon = the cannon: LOCKED'));
  t('the Spire stays a separate drowned structure', w.info.includes('Spire of Ascension') && w.info.includes('separate drowned structure'));
}

console.log('— iteration 3: content merge —');
{
  const ids=['sorrowsgate','hollowharbor','ninefires','greywatch','foundlingshollow',
    'castraferrum','ludusmagna','ashvine','tribunesgate','pearlwell','baihe','mistcliff',
    'ironquay','foxglovegreen','admiraltypoint'];
  t('15 new settlements merged', ids.every(id=>D.SETTLEMENTS.some(s=>s.id===id)));
  const hids=['sunkencamp','desertersmesa','redhollow','silentmesa','vulturesshelf'];
  t('5 Red Reaches secrets in HIDDEN', hids.every(id=>D.HIDDEN.some(h=>h.id===id)));
  t('Red Reaches secrets are NOT public settlements', hids.every(id=>!D.SETTLEMENTS.some(s=>s.id===id)));
  const fids=['gloamwood','hungrypines','elderlight','weepingcedars','jadecanes','thornwild','palewood'];
  t('7 new forests merged', fids.every(id=>D.FORESTS.some(f=>f.id===id)));
  t('forest kinds present', D.FORESTS.some(f=>f.kind==='dark') && D.FORESTS.some(f=>f.kind==='enchanted'));
  const rnames=['The Waywater','The Coldrun','The Marchflow','The Reachwash','The Fairburn'];
  t('5 new rivers merged', rnames.every(n=>D.RIVERS.some(r=>r.name===n)));
  t('the Reachwash is seasonal', D.RIVERS.find(r=>r.name==='The Reachwash').seasonal===true);
  t('2 new lakes merged', ['mistmere','thaneswater'].every(id=>D.LAKES.some(l=>l.id===id)));
  const newTagged=[...ids.map(id=>D.SETTLEMENTS.find(s=>s.id===id)), ...hids.map(id=>D.HIDDEN.find(h=>h.id===id))];
  t('all new content tagged [PROPOSED]', newTagged.every(o=>o.info.includes('[PROPOSED')));
}

console.log('— iteration 3: E-pass audits —');
{
  t('E2: no land route crosses water', G.routeWaterAudit().length===0, JSON.stringify(G.routeWaterAudit().slice(0,3)));
  for(const id of ['hvalvik','fishing','imaru']){
    const st=D.SETTLEMENTS.find(x=>x.id===id);
    t('E3: '+id+' outside the Forest Ring band', !G.inForestRing(st.x,st.y));
  }
  const lh=D.WONDERS.find(w=>w.id==='lighthouse');
  t('E3: Sovereign Lighthouse outside the Ring band', !G.inForestRing(lh.x,lh.y));
  // E5: palette parity — the cosmos texture pixel equals the 2D satellite pixel (same painter)
  const a=new Uint8ClampedArray(4), b=new Uint8ClampedArray(4);
  G.paintRegion(a,1,1,4400,5500,4401,5501,{style:'satellite',season:1});
  G.paintRegion(b,1,1,4400,5500,4401,5501,{style:'satellite',season:1,waterAlpha:0});
  t('E5: 3D texture pixel == 2D raster pixel (Sunlands)', a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2], a.join()+' vs '+b.join());
  const sat=[...a];
  t('E5: Sunlands is desert tan, not white', sat[0]<245 && sat[0]>150 && sat[0]>sat[2], sat.join());
}

console.log('— iteration 3: Painted style —');
{
  t('painted palette exists', !!G.PALETTES.painted && G.PALETTES.painted.bandCols.length===5);
  // coastal contour banding: shore pixel is brighter turquoise than open ocean
  const shore=new Uint8ClampedArray(4), open_=new Uint8ClampedArray(4);
  G.paintRegion(shore,1,1,4500,6620,4501,6621,{style:'painted',season:1}); // just off the south coast
  G.paintRegion(open_,1,1,900,6600,901,6601,{style:'painted',season:1});   // far ocean corner
  t('bands: shore brighter than open ocean', (shore[0]+shore[1]+shore[2])>(open_[0]+open_[1]+open_[2])+60,
    shore.join()+' vs '+open_.join());
  // painted differs from satellite on land
  const pl=new Uint8ClampedArray(4), sl=new Uint8ClampedArray(4);
  G.paintRegion(pl,1,1,4600,3300,4601,3301,{style:'painted',season:1});
  G.paintRegion(sl,1,1,4600,3300,4601,3301,{style:'satellite',season:1});
  t('painted land is its own palette', pl.join()!==sl.join());
}

console.log('— iteration 3: Domains —');
{
  const d=G.computeDomains();
  t('domain boundaries computed', d.segs.length>1000, d.segs.length/5+' segs');
  t('every great kingdom contributes cells', new Set(Object.values(d.cells).map(c=>c.kingdom)).size>=8);
  const caps={verdanthome:'heartlands', sundisk:'sunlands', celestial:'jade'};
  for(const [cid,kid] of Object.entries(caps)){
    const capArea=d.cells[cid]&&d.cells[cid].area||0;
    const others=Object.entries(d.cells).filter(([id,c])=>c.kingdom===kid&&id!==cid).map(([,c])=>c.area);
    t('capital domain visibly largest in '+kid, others.length>0 && capArea>Math.max(...others),
      capArea+' vs max '+ (others.length?Math.max(...others):0));
  }
  t('free towns get circular domains', d.free.length>=10 && d.free.every(f=>f.r>=40&&f.r<=120));
  const dm=G.domainInfoAt(4350,5250); // near Sundisk
  t('domainInfoAt resolves', !!dm && !!dm.settlement && dm.area>0, dm&&dm.settlement.name);
  t('no domains in the Red Reaches', G.domainInfoAt(2900,4600)===null||!G.inPoly(2900,4600,D.BADLANDS.poly));
  const mask=G.domainInfoAt(2900,4600);
  t('Red Reaches unclaimed by domains', mask===null, mask&&mask.settlement.name);
}

console.log('— the Celestial Circle —');
{
  const w=D.WONDERS.find(w=>w.id==='celestialcircle');
  t('present in WONDERS', !!w);
  t('on land (covered by __landCheck)', !!G.landAt(w.x,w.y) && G.landCheck().length===0);
  t('within ~60 mi of the calibrated point', Math.hypot(w.x-5290,w.y-3860)<=60);
  t('outside the Heartlands circle (>800 mi)', Math.hypot(w.x-4500,w.y-3500)>800,
    Math.hypot(w.x-4500,w.y-3500).toFixed(0)+' mi');
  t('inside no kingdom polygon', G.kingdomAt(w.x,w.y)===null);
  t('a mountain-shoulder site (Spine of Heaven band)', G.terrainAt(w.x,w.y)==='mountain');
  t('revelation text + tags verbatim', w.info.includes('Rhy Sunfire as the next Chosen One')
    && w.info.includes('the reincarnation of Aurelion')
    && w.info.includes('[Placement PROPOSED per ruling, July 2026; revelation event canon per author]'));
}

console.log('— July 2026 lockdowns: the four canon scars —');
{
  const F=id=>D.FORESTS.find(f=>f.id===id);
  const ids=['forgetting','vargholt','widowwood','wardwood'];
  t('four new forests merged', ids.every(id=>!!F(id)));
  t('all four tagged [LOCKED', ids.every(id=>F(id).info.includes('[LOCKED')));
  t('the Forgetting is the grey kind', F('forgetting').kind==='grey');
  t('grey kind paints differently from a plain forest', (()=>{
    const a=new Uint8ClampedArray(4), b=new Uint8ClampedArray(4);
    // same fbm phase, one inside the Forgetting and one inside the Wardwood body
    G.paintRegion(a,1,1,1800,3250,1801,3251,{style:'painted',season:1});
    G.paintRegion(b,1,1,4350,3400,4351,3401,{style:'painted',season:1});
    return a.join()!==b.join();
  })());
  t('the Forgetting reads desaturated, not lush', (()=>{
    const px=new Uint8ClampedArray(4);
    G.paintRegion(px,1,1,1800,3250,1801,3251,{style:'satellite',season:1});
    return Math.abs(px[0]-px[1])<40 && Math.abs(px[1]-px[2])<40;   // low chroma
  })());
  // the Wardwood is an annulus: the World Tree, Verdanthome and the Gate stay clear
  t('Wardwood ellipse would swallow the World Tree', (()=>{
    const w=F('wardwood');
    return Math.hypot((4500-w.x)/w.rx,(3500-w.y)/w.ry)<=1;
  })());
  t('Wardwood clearing keeps the World Tree legible', G.forestAt(4500,3500)===null);
  t('Wardwood clearing covers Root City + the World Tree Gate',
    G.forestAt(4500,3500)===null && G.forestAt(4500,3470)===null);
  t('Wardwood body is still forest', (G.forestAt(4350,3400)||{}).id==='wardwood' && G.terrainAt(4350,3400)==='forest');
  // the Widow Wood sits on the Wool Road
  {
    const wool=D.ROUTES.find(r=>r.name==='The Wool Road: Root City–Crownsburg');
    const w=F('widowwood');
    let inside=0;
    for(let i=0;i<wool.path.length-1;i++){
      const [ax,ay]=wool.path[i],[bx,by]=wool.path[i+1];
      const L=Math.hypot(bx-ax,by-ay), steps=Math.max(2,Math.ceil(L/5));
      for(let s=0;s<steps;s++){ const tt=s/steps;
        if(G.inForestBody(ax+(bx-ax)*tt, ay+(by-ay)*tt, w)) inside++; }
    }
    t('the Wool Road runs visibly through the Widow Wood', inside>=10, inside*5+' mi of road inside');
  }
  // Vargholt: distinct from the Elven Forest Ring, north of the Gloamwood
  t('Vargholt stands clear of the Elven Forest Ring band', !G.inForestRing(F('vargholt').x,F('vargholt').y));
  t('Vargholt sits north of the Gloamwood', F('vargholt').y < F('gloamwood').y);
  t('the Gloamwood carries its RECONCILE note', F('gloamwood').info.includes('[RECONCILE note: read as Vargholt’s burned southern arm.]'));
  t('the Whisperwood carries its RECONCILE note', F('whisperwood').info.includes('[RECONCILE note: read as a named grove within the greater Wardwood.]'));
  // the Weeping Wastes marker must not be swallowed by the Forgetting
  const ww=D.WONDERS.find(w=>w.id==='weepingwastes');
  t('the Weeping Wastes marker clears the Forgetting', !G.inForestBody(ww.x,ww.y,F('forgetting')));
}

console.log('— July 2026 lockdowns: the new sites —');
{
  const tm=D.WONDERS.find(w=>w.id==='unknowntemple');
  t('the Temple of the Unknown One is in WONDERS', !!tm);
  t('temple within ~30 mi of the calibrated point', Math.hypot(tm.x-3700,tm.y-3455)<=30,
    Math.hypot(tm.x-3700,tm.y-3455).toFixed(1)+' mi');
  const spur=D.ROUTES.find(r=>r.name==='Crown Road: western spur');
  t('the temple sits ON the western Crown Road spur', G.distToPath(tm.x,tm.y,spur.path)<3,
    G.distToPath(tm.x,tm.y,spur.path).toFixed(2)+' mi off the road');
  t('the temple sits at the Heartlands boundary', Math.abs(Math.hypot(tm.x-4500,tm.y-3500)-800)<12,
    Math.hypot(tm.x-4500,tm.y-3500).toFixed(1)+' mi from the World Tree (boundary 800)');
  t('temple tag verbatim', tm.info.includes('[LOCKED — The Salt and the Unknown One, July 2026]'));

  const H=id=>D.HIDDEN.find(h=>h.id===id);
  for(const id of ['undercroft','auntscottage','iceedge']){
    t('hidden site '+id+' merged and on land', !!H(id) && !!G.landAt(H(id).x,H(id).y));
    t('hidden site '+id+' tagged [LOCKED', H(id).info.includes('[LOCKED'));
  }
  const w=D.FORESTS.find(f=>f.id==='widowwood'), ac=H('auntscottage');
  t("the Aunt's Cottage stands inside the Widow Wood", G.inForestBody(ac.x,ac.y,w));
  const ie=H('iceedge');
  t('the Ice Edge is on the northern coastal strip', G.onContinent(ie.x,ie.y) && !G.inForestRing(ie.x,ie.y),
    'er/cr='+(G.ellipseR(ie.x,ie.y)/G.coastRadiusAt(ie.x,ie.y)).toFixed(4));
  t('the Ice Edge is outside the Ring band, not in the sea',
    G.ellipseR(ie.x,ie.y)/G.coastRadiusAt(ie.x,ie.y) > D.FOREST_RING.outer);
}

console.log('— July 2026 lockdowns: the hidden isles + the white eel whirlpool —');
{
  const I=id=>D.ISLANDS.find(s=>s.id===id);
  for(const id of ['lastdoor','lostisle']){
    const s=I(id);
    t('hidden isle '+id+' merged with hidden:true', !!s && s.hidden===true);
    t('hidden isle '+id+' stands in open water', !G.onContinent(s.x,s.y));
    t('hidden isle '+id+' is hit-testable only as hidden',
      (G.hiddenIslandAt(s.x,s.y)||{}).id===id && G.islandAt(s.x,s.y)===null);
    t('hidden isle '+id+' is absent from the terrain model', G.terrainAt(s.x,s.y)==='water');
    t('hidden isle '+id+' tagged [LOCKED', s.info.includes('[LOCKED'));
  }
  const vn=D.MAELSTROMS.find(m=>m.id==='vortex_n');
  for(const id of ['lastdoor','lostisle']){
    const s=I(id);
    t(id+' clears the Northern Vortex by 400+ mi', Math.hypot(s.x-vn.x,s.y-vn.y)>=400,
      Math.hypot(s.x-vn.x,s.y-vn.y).toFixed(0)+' mi');
  }
  t('the two isles clear each other', Math.hypot(I('lastdoor').x-I('lostisle').x, I('lastdoor').y-I('lostisle').y)>=400);
  // hidden isles must be invisible to the water painter: the Painted style's
  // coastal contour banding is driven by seaDistToLand, which must not see them
  const dist=(x,y)=>G.seaDistToLand(x,y,G.thetaOf(x,y),G.coastRadiusAt(x,y),G.ellipseR(x,y));
  t('hidden isles register as open sea, not land', (()=>{
    const charted=dist(D.ISLANDS.find(s=>s.id==='shard_w').x, D.ISLANDS.find(s=>s.id==='shard_w').y);
    return dist(7300,350)>300 && dist(4300,250)>300 && charted<1;
  })(), 'lastdoor '+dist(7300,350).toFixed(0)+' mi, lostisle '+dist(4300,250).toFixed(0)+' mi from any land');
  t('hidden isles are excluded from VISIBLE_ISLANDS',
    G.VISIBLE_ISLANDS.length===D.ISLANDS.length-2 && G.HIDDEN_ISLANDS.length===2);

  const ms=D.MAELSTROMS.find(m=>m.id==='m_eelway');
  t('the white eel whirlpool merged', !!ms && ms.name==='The Drowned Kingdom Whirlpool');
  t('the whirlpool is in open water', !G.landAt(ms.x,ms.y));
  const mk=D.HIDDEN.find(h=>h.id==='morkaleth'), wp=D.HIDDEN.find(h=>h.id==='weapon');
  t('whirlpool keeps 450+ mi from Mor’kaleth', Math.hypot(ms.x-mk.x,ms.y-mk.y)>=450,
    Math.hypot(ms.x-mk.x,ms.y-mk.y).toFixed(0)+' mi');
  t('whirlpool keeps 350+ mi from the Weapon', Math.hypot(ms.x-wp.x,ms.y-wp.y)>=350,
    Math.hypot(ms.x-wp.x,ms.y-wp.y).toFixed(0)+' mi');
  t('whirlpool tag verbatim + name left descriptive',
    ms.info.includes('[LOCKED — The Unhealed. OPEN: whether the whirlpools are a distinct phenomenon or old routes drowned and running unattended.]'));
}

console.log('— July 2026 lockdowns: info-text updates + deliberate omissions —');
{
  const ash=D.KINGDOMS.find(k=>k.id==='ashlands');
  t('Western Ashlands entry carries the amnesia-field sentence',
    ash.facts.includes('The Forest of the Forgetting stands in its interior over the inverted Tree of Knowledge; the Ashlands have lived beside an amnesia field since before any kingdom had a name, which is why the oldest people on the continent never once rose. [LOCKED]'));
  const nor=D.KINGDOMS.find(k=>k.id==='northern');
  t('Northern Throne entry carries the underground sentence',
    nor.facts.includes('Sixty percent of its people live underground — founded belief says the mountains protect them; the older cause walks across the ice each winter. [LOCKED]'));
  // DO NOT MAP: unmappable by canon design
  const allIds=[...D.SETTLEMENTS,...D.HIDDEN,...D.WONDERS,...D.ISLANDS,...D.FORESTS,...D.LAKES].map(o=>o.id).join(' ');
  const allNames=[...D.SETTLEMENTS,...D.HIDDEN,...D.WONDERS,...D.ISLANDS,...D.FORESTS,...D.LAKES].map(o=>o.name||'').join(' | ');
  for(const banned of ['The Vault','the Mystic','The Old Man','Loomhouse','Scarlet Seer','God’s Library','Library of Aethu'])
    t('not mapped: '+banned, !allNames.includes(banned));
  for(const banned of ['vault','mystic','oldman','loomhouse','scarletseer','godslibrary'])
    t('no id for: '+banned, !new RegExp('\\b'+banned+'\\b').test(allIds));
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
    t('canon markers intact', html.includes('Weapon = the cannon: LOCKED'));
    t('no Spire-as-Weapon regression', !html.includes('The Weapon (Spire of Ascension)'));
  }
}

console.log(failures? `\n${failures} FAILURE(S)` : '\nall smoke tests green');
process.exit(failures?1:0);
