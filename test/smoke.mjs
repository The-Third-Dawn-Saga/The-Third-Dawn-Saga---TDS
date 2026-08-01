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

console.log('— Kaelen’s Sanctuary: shrunk and moved to deep water —');
{
  const s=D.ISLANDS.find(i=>i.id==='lastlight');
  t('still named the Isle of Last Light', s.name==='Isle of Last Light');
  t("shrunk to a town's footprint", s.rx<=30 && s.ry<=20, `rx${s.rx} ry${s.ry}`);
  t('at most a quarter of its former area', (s.rx*s.ry)/(300*210) <= 0.25,
    ((s.rx*s.ry)/(300*210)*100).toFixed(1)+'% of the old footprint');
  t('stands in open water, off the continent', !G.onContinent(s.x,s.y)
    && G.terrainAt(s.x+s.rx*2.2, s.y)==='water' && G.terrainAt(s.x, s.y+s.ry*2.2)==='water');
  t('its own centre resolves to it', (G.islandAt(s.x,s.y)||{}).id==='lastlight');
  t('fits inside the map (x < 9000)', s.x+s.rx<9000, String(s.x+s.rx));
  // 400+ mi of open water to the continent's coast at EVERY angle
  let minCoast=1e9;
  for(let i=0;i<3000;i++){
    const a=i/3000*Math.PI*2, c=D.coastNoise(a);
    minCoast=Math.min(minCoast, Math.hypot(s.x-(D.WORLD.cx+Math.cos(a)*D.WORLD.a*c),
                                           s.y-(D.WORLD.cy+Math.sin(a)*D.WORLD.b*c)));
  }
  t('400+ mi of open water to the coast at every angle', minCoast-s.rx>=400, minCoast.toFixed(0)+' mi');
  const liu=D.ISLANDS.find(i=>i.id==='liuchai');
  t('250+ mi from the Pearl Isles of Liu-Chai', Math.hypot(s.x-liu.x,s.y-liu.y)>=250,
    Math.hypot(s.x-liu.x,s.y-liu.y).toFixed(0)+' mi');
  const chartered=['charterholm','tradewind','portmeridian','kingsholm','newalbany','gullswick','sovereignsrest','ledgerrocks'];
  const worst=Math.min(...chartered.map(id=>{const c=D.ISLANDS.find(i=>i.id===id); return Math.hypot(s.x-c.x,s.y-c.y);}));
  t('250+ mi from every Chartered Isle', worst>=250, worst.toFixed(0)+' mi');
  t('sanctuary text preserved', s.info.includes('Nightfall the black pegasus')
    && s.info.includes('“I’ve killed enough. Here, I save what I can.”')
    && s.info.includes('sanctuary identification PROPOSED'));
}

console.log('— The Isle of the Last Fish —');
{
  const m=D.ISLANDS.find(i=>i.id==='lastfish');
  t('main isle merged', !!m && m.kind==='rock');
  t('placed between the Imperium and Zar’kaine longitudes', m.x>=5100 && m.x<=7620, String(m.x));
  t('far out in the northern ocean, off the continent', !G.onContinent(m.x,m.y)
    && G.terrainAt(m.x, m.y+m.ry*2.4)==='water' && G.terrainAt(m.x+m.rx*2.4, m.y)==='water');
  t('its centre resolves to it', (G.islandAt(m.x,m.y)||{}).id==='lastfish');
  t('tag verbatim', m.info.includes('[Event canon per author; name and placement PROPOSED, July 2026]'));
  // four outer isles
  const sats=['lastfish_n','lastfish_e','lastfish_s','lastfish_w'].map(id=>D.ISLANDS.find(i=>i.id===id));
  t('four outer isles merged, unnamed', sats.every(s=>s && s.name==='' && s.kind==='rock'));
  t('outer isles sized 24–32 × 16–22', sats.every(s=>s.rx>=24&&s.rx<=32&&s.ry>=16&&s.ry<=22));
  t('outer isles offset 140–180 mi', sats.every(s=>{const d=Math.hypot(s.x-m.x,s.y-m.y); return d>=140&&d<=180;}),
    sats.map(s=>Math.hypot(s.x-m.x,s.y-m.y).toFixed(0)).join(','));
  t('outer isles tagged [PROPOSED]', sats.every(s=>s.info==='Outer isle of the Last Fish ring. [PROPOSED]'));
  // no collisions: rim-sampled against every other island
  const rim=(isl,th)=>D.islandNoise(th,isl.seed)*0.85;
  const inside=(isl,x,y)=>{const dx=(x-isl.x)/isl.rx, dy=(y-isl.y)/isl.ry, r=Math.hypot(dx,dy);
    return r<=rim(isl,Math.atan2(dy,dx));};
  const hits=[];
  for(const a of [m,...sats]) for(const b of D.ISLANDS){
    if(b.id===a.id) continue;
    for(let d=0;d<360;d+=3){ const th=d*Math.PI/180, R=rim(a,th);
      if(inside(b,a.x+Math.cos(th)*a.rx*R, a.y+Math.sin(th)*a.ry*R)){ hits.push(a.id+'/'+b.id); break; } }
  }
  t('no island-to-island collisions in the ring', hits.length===0, hits.join(','));
  // three volcanoes, two fore (south) and one behind (north)
  t('three volcanoes on the main isle', m.volcanoes && m.volcanoes.length===3);
  t('all three stand on the isle', m.volcanoes.every(v=>(G.islandAt(v[0],v[1])||{}).id==='lastfish'));
  t('two at the fore, one behind', m.volcanoes.filter(v=>v[1]>m.y).length===2
    && m.volcanoes.filter(v=>v[1]<m.y).length===1);
  // the sea-mountain ring
  const S=D.SEAMOUNTS.filter(s=>s.ring==='lastfish_ring');
  t('sea-mountain ring generated', S.length>=14, S.length+' peaks');
  t('ring stands at ~220 mi', S.every(s=>{const d=Math.hypot(s.x-m.x,(s.y-m.y)/0.86); return d>200&&d<270;}));
  const norm=d=>((d%360)+360)%360;
  const front=S.filter(s=>norm(s.deg)>=25&&norm(s.deg)<=155).length;
  const rear =S.filter(s=>{const d=norm(s.deg); return d>205&&d<335;}).length;
  t('denser at the front than at the rear', front>rear*2, `front ${front}, rear ${rear}`);
  t('present at sides and rear too', rear>=2 && S.length-front-rear>=4, `rear ${rear}, sides ${S.length-front-rear}`);
  t('every sea-mountain stands in open water', S.every(s=>!G.landAt(s.x,s.y)));
  // whirlpools
  const w=['m_fish_w','m_fish_e'].map(id=>D.MAELSTROMS.find(x=>x.id===id));
  t('two guardian whirlpools merged', w.every(x=>x && x.r===40));
  t('whirlpool info verbatim', w.every(x=>x.info==='Guardian whirlpool of the Last Fish ring. [PROPOSED]'));
  t('whirlpools in open water', w.every(x=>!G.landAt(x.x,x.y)));
  const vn=D.MAELSTROMS.find(x=>x.id==='vortex_n');
  t('400+ mi from the Northern Vortex', w.every(x=>Math.hypot(x.x-vn.x,x.y-vn.y)>=400),
    w.map(x=>Math.hypot(x.x-vn.x,x.y-vn.y).toFixed(0)).join(','));
  const ld=D.ISLANDS.find(i=>i.id==='lastdoor');
  t('clear of the Isle of the Last Door', w.every(x=>Math.hypot(x.x-ld.x,x.y-ld.y)>=400),
    w.map(x=>Math.hypot(x.x-ld.x,x.y-ld.y).toFixed(0)).join(','));
  // black clouds here, red clouds there — the two must never be conflated
  t('the Last Fish sky is black, the Last Door’s is red',
    m.info.includes('The clouds above it are black') && ld.info.includes('The clouds above it are red'));
  // grey, unreflective water inside the ring
  const grey=new Uint8ClampedArray(4), open_=new Uint8ClampedArray(4);
  G.paintRegion(grey,1,1,m.x+150,m.y,m.x+151,m.y+1,{style:'satellite',season:1});
  G.paintRegion(open_,1,1,m.x+800,m.y,m.x+801,m.y+1,{style:'satellite',season:1});
  t('water inside the ring is greyer than the open sea',
    Math.abs(grey[2]-grey[0])<Math.abs(open_[2]-open_[0]), grey.join()+' vs '+open_.join());
}

console.log('— the frozen sea is organic, not a rectangle —');
{
  // the visible edge: first latitude (scanning south) where coverage drops below half
  const edgeAt=(x,season)=>{
    let prev=G.seaIceAt(x,0,season,9999);
    if(prev<0.5) return null;
    for(let y=1;y<3000;y++){ const v=G.seaIceAt(x,y,season,9999);
      if(v<0.5) return y-1+(prev-0.5)/Math.max(1e-6,(prev-v)); prev=v; }
    return null;
  };
  for(const season of [0,1,2,3]){
    const xs=[],es=[];
    for(let x=0;x<=9000;x+=4){ const e=edgeAt(x,season); if(e!=null){xs.push(x);es.push(e);} }
    // longest run over which the edge is straight (stays inside an 8-mile band)
    let straight=0;
    for(let i=0;i<es.length;i++){ let mn=es[i],mx=es[i];
      for(let k=i+1;k<es.length;k++){ mn=Math.min(mn,es[k]); mx=Math.max(mx,es[k]);
        if(mx-mn>8){ straight=Math.max(straight,xs[k-1]-xs[i]); break; } } }
    const range=Math.max(...es)-Math.min(...es);
    t(`season ${season}: no straight ice edge over 150 mi`, straight<150, straight.toFixed(0)+' mi');
    t(`season ${season}: the edge wanders 300+ mi of latitude`, range>=300, range.toFixed(0)+' mi');
  }
  // the frozen shoreline ice-locks the northern isles
  for(const id of ['skarnholm','isbrand','wolfteeth','hrafney']){
    const s=D.ISLANDS.find(i=>i.id===id);
    t(`${id} is ice-locked in Deep`, G.seaIceAt(s.x,s.y+s.ry+30,3,25)>0.9);
  }
  // ice clings to the coast: it reaches further south beside land than in open water
  t('ice runs further south along a coast than in open water',
    G.seaIceAt(4400,1500,3,20) > G.seaIceAt(4400,1500,3,9999));
  // detached floes exist beyond the main edge, and the edge thins rather than stopping
  let floes=0, partial=0;
  for(let x=0;x<9000;x+=25) for(let y=900;y<2300;y+=25){
    const v=G.seaIceAt(x,y,3,9999);
    if(v>0.05&&v<0.6) floes++;
    if(v>0.05&&v<0.95) partial++;
  }
  t('detached floe patches beyond the edge', floes>50, floes+' samples');
  t('the edge thins gradually rather than stopping', partial>100, partial+' partial-coverage samples');
  // and no ice in the southern ocean, in any season
  t('no sea ice in the southern ocean', [0,1,2,3].every(s=>G.seaIceAt(4500,6600,s,9999)===0));
}

console.log('— ITEM 5: The Far Shore — the Land of the Dead —');
{
  const fs=D.ISLANDS.find(i=>i.id==='landofthedead');
  t('landofthedead merged into ISLANDS', !!fs);
  t('at the far north-eastern corner', fs.x===8880 && fs.y===180);
  t('sized 220 x 150, kind grey, special farshore',
    fs.rx===220 && fs.ry===150 && fs.kind==='grey' && fs.special==='farshore');
  t('its ellipse clips off the map edge on purpose', fs.x+fs.rx>D.WORLD.w,
    `runs ${(fs.x+fs.rx)-D.WORLD.w} mi past x=${D.WORLD.w}`);
  t('NOT nudged inland — centre stays at 8880', fs.x===8880);
  t('its centre resolves to it (clickable)', (G.islandAt(fs.x,fs.y)||{}).id==='landofthedead');
  t('renders always — not a hidden-layer isle', !fs.hidden);
  t('info verbatim, tag intact', fs.info.includes('The dead can be spoken to and cannot be returned.')
    && fs.info.includes('[LOCKED — The Unhealed, July 2026; placement on the map is symbolic: the far shore lies beyond the world’s edge]'));
  // ashen coast, no vegetation colour anywhere on it
  const on=new Uint8ClampedArray(4);
  G.paintRegion(on,1,1,fs.x-60,fs.y,fs.x-59,fs.y+1,{style:'satellite',season:1});
  t('ashen coast: neutral grey, no vegetation', Math.abs(on[0]-on[1])<12 && Math.abs(on[1]-on[2])<12,
    [...on].join(','));
  const veg=G.PALETTES.satellite.vegLush;
  t('nothing on it uses the vegetation palette', !(on[1]>on[0]+15 && on[1]>on[2]+15), [...on].join(','));
  // grey unreflecting water on the crossing to the Last Door
  const ld=D.ISLANDS.find(i=>i.id==='lastdoor');
  const cross=new Uint8ClampedArray(4), open_=new Uint8ClampedArray(4);
  G.paintRegion(cross,1,1,(fs.x+ld.x)/2,(fs.y+ld.y)/2,(fs.x+ld.x)/2+1,(fs.y+ld.y)/2+1,{style:'satellite',season:1});
  G.paintRegion(open_,1,1,8100,1400,8101,1401,{style:'satellite',season:1});
  t('the crossing water is greyer than the open sea',
    Math.abs(cross[2]-cross[0]) < Math.abs(open_[2]-open_[0]),
    [...cross].join(',')+' vs '+[...open_].join(','));
  t('clear of the Isle of the Last Door', Math.hypot(fs.x-ld.x,fs.y-ld.y)>400,
    Math.hypot(fs.x-ld.x,fs.y-ld.y).toFixed(0)+' mi');
  // it must not swallow any charted island
  const rim=(isl,th)=>D.islandNoise(th,isl.seed)*0.85;
  const inside=(isl,x,y)=>{const dx=(x-isl.x)/isl.rx, dy=(y-isl.y)/isl.ry, r=Math.hypot(dx,dy);
    return r<=rim(isl,Math.atan2(dy,dx));};
  const swallowed=D.ISLANDS.filter(o=>o.id!=='landofthedead' && inside(fs,o.x,o.y)).map(o=>o.id);
  t('swallows no other island', swallowed.length===0, swallowed.join(','));
}

console.log('— ITEM 6: The Floating Isles of the World Engine —');
{
  const f=D.WONDERS.find(w=>w.id==='floatingisles');
  t('floatingisles merged into WONDERS', !!f);
  t('anchored above the Veiled Vortex', f.x===3600 && f.y===6620 && f.icon==='float');
  const vs=D.MAELSTROMS.find(m=>m.id==='vortex_s');
  t('sits above (north of) the vortex spiral', f.y < vs.y, `isles y=${f.y}, vortex y=${vs.y}`);
  t('within the vortex cloud crown', Math.hypot(f.x-vs.x,f.y-vs.y) < vs.r*1.6,
    Math.hypot(f.x-vs.x,f.y-vs.y).toFixed(0)+' mi from the vortex');
  t('marked as standing over water', f.sea===true);
  t('info verbatim', f.info.includes('hang the floating isles that hold the gate to the World Engine')
    && f.info.includes('surrender the will to dominate while retaining the will to serve')
    && f.info.includes('[Established prior sessions; rendering PROPOSED]'));
  t('the isle cluster is defined', Array.isArray(f.isles) && f.isles.length>=3 && f.isles.length<=5,
    f.isles && f.isles.length+' isles');
  t('the two largest carry mountain glyphs', f.isles.filter(i=>i[2]>=46).length>=2);
  t('every floating isle sits over open water',
    f.isles.every(i=>!G.landAt(f.x+i[0], f.y+i[1])));
  t('__landCheck() exempts it as a sea wonder', !G.landCheck().some(b=>b.includes('floatingisles')));
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
