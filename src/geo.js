/* ============================================================
   SHARED GEOGRAPHY + RASTER ENGINE
   Pure functions over TDA_DATA: terrain classification, palettes,
   the season-aware raster painter, and the travel model.
   Runs identically on the main thread, in the raster Worker, and
   under Node for the smoke tests.
   ============================================================ */
var TDA_GEO = (function(D){
'use strict';
const { WORLD, KINGDOMS, FOREST_RING, MOUNTAINS, RIVERS, LAKES, MARSHES, FORESTS,
        SETTLEMENTS, GATES, RING_GATES, WONDERS, HIDDEN, ISLANDS, BADLANDS,
        TRAVEL, SEASON_TRAVEL, SEAMOUNTS, coastNoise, islandNoise, ringGatePos } = D;

/* ---------- geometry helpers ---------- */
function thetaOf(x,y){ return Math.atan2((y-WORLD.cy)/WORLD.b,(x-WORLD.cx)/WORLD.a); }
function ellipseR(x,y){
  const dx=(x-WORLD.cx)/WORLD.a, dy=(y-WORLD.cy)/WORLD.b;
  return Math.sqrt(dx*dx+dy*dy);
}
function coastRadiusAt(x,y){ return coastNoise(thetaOf(x,y)); }
function onContinent(x,y){ return ellipseR(x,y) <= coastRadiusAt(x,y); }
/* Hidden isles (the Last Door, the Lost Isle) belong to the Hidden World
   layer alone: they are excluded from the raster, the terrain model and the
   coastal contour banding, and drawn as vectors by the map when that layer
   is on. VISIBLE_ISLANDS is everything the world at large can chart. */
const VISIBLE_ISLANDS = ISLANDS.filter(s=>!s.hidden);
const HIDDEN_ISLANDS  = ISLANDS.filter(s=>s.hidden);
function islandHit(x,y,list){
  for(const isl of list){
    const dx=(x-isl.x)/isl.rx, dy=(y-isl.y)/isl.ry;
    const r=Math.sqrt(dx*dx+dy*dy);
    if(r<=1.35){
      const th=Math.atan2(dy,dx);
      if(r<=islandNoise(th,isl.seed)*0.85) return isl;
    }
  }
  return null;
}
function islandAt(x,y){ return islandHit(x,y,VISIBLE_ISLANDS); }
function hiddenIslandAt(x,y){ return islandHit(x,y,HIDDEN_ISLANDS); }
function landAt(x,y){
  if(onContinent(x,y)) return {type:'continent'};
  const isl=islandAt(x,y);
  if(isl) return {type:'island', isl};
  return null;
}
function angDeg(x,y){
  let a=Math.atan2(-(y-WORLD.cy),(x-WORLD.cx))*180/Math.PI;
  return (a+360)%360;
}
function inForestRing(x,y){
  const c=coastRadiusAt(x,y);
  const rn=ellipseR(x,y)/c;
  if(rn<FOREST_RING.inner||rn>FOREST_RING.outer) return false;
  const a=angDeg(x,y);
  return !(a>=FOREST_RING.gapStartDeg && a<=FOREST_RING.gapEndDeg);
}
function inPoly(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function distToPath(x,y,path){
  let best=1e9;
  for(let i=0;i<path.length-1;i++){
    const ax=path[i][0],ay=path[i][1],bx=path[i+1][0],by=path[i+1][1];
    const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy||1;
    let t=((x-ax)*dx+(y-ay)*dy)/len2; t=Math.max(0,Math.min(1,t));
    best=Math.min(best, Math.hypot(x-(ax+t*dx),y-(ay+t*dy)));
  }
  return best;
}
function kingdomAt(x,y){
  for(const k of KINGDOMS){
    if(k.shape==='circle'){ if(Math.hypot(x-k.cx,y-k.cy)<=k.rx) return k; }
    else if(k.poly && inPoly(x,y,k.poly)) return k;
  }
  return null;
}
function lakeAt(x,y){
  for(const lk of LAKES){
    const dx=(x-lk.x)/lk.rx, dy=(y-lk.y)/lk.ry;
    if(dx*dx+dy*dy<=1) return lk;
  }
  return null;
}
/* A named forest covers a point when it is inside the ellipse and outside
   any carved clearing. The Wardwood's `hole` is the annulus that keeps the
   World Tree, Verdanthome and Root City legible inside the ring of trees. */
function inForestBody(x,y,fo){
  const dx=(x-fo.x)/fo.rx, dy=(y-fo.y)/fo.ry;
  if(dx*dx+dy*dy>1) return false;
  if(fo.hole && Math.hypot(x-fo.hole.x,y-fo.hole.y)<=fo.hole.r) return false;
  return true;
}
function forestAt(x,y){
  for(const fo of FORESTS) if(inForestBody(x,y,fo)) return fo;
  return null;
}

/* coarse mountain-distance field (for raster + relief speed) */
const MTNFIELD={ w:360, h:280, data:null,
  build(){
    if(this.data) return;
    this.data=new Float32Array(this.w*this.h);
    for(let j=0;j<this.h;j++) for(let i=0;i<this.w;i++){
      const x=i/(this.w-1)*WORLD.w, y=j/(this.h-1)*WORLD.h;
      let best=1e9;
      for(const m of MOUNTAINS) best=Math.min(best,distToPath(x,y,m.path));
      this.data[j*this.w+i]=best;
    }
  },
  sample(x,y){
    if(!this.data) this.build();
    const fx=x/WORLD.w*(this.w-1), fy=y/WORLD.h*(this.h-1);
    const i=Math.max(0,Math.min(this.w-2,Math.floor(fx))), j=Math.max(0,Math.min(this.h-2,Math.floor(fy)));
    const tx=fx-i, ty=fy-j, d=this.data, w=this.w;
    return (d[j*w+i]*(1-tx)+d[j*w+i+1]*tx)*(1-ty) + (d[(j+1)*w+i]*(1-tx)+d[(j+1)*w+i+1]*tx)*ty;
  }
};

/* value noise */
function hash2(x,y){ let h=Math.sin(x*127.1+y*311.7)*43758.5453; return h-Math.floor(h); }
function vnoise(x,y){
  const xi=Math.floor(x), yi=Math.floor(y), tx=x-xi, ty=y-yi;
  const a=hash2(xi,yi),b=hash2(xi+1,yi),c=hash2(xi,yi+1),d=hash2(xi+1,yi+1);
  const u=tx*tx*(3-2*tx), v=ty*ty*(3-2*ty);
  return a*(1-u)*(1-v)+b*u*(1-v)+c*(1-u)*v+d*u*v;
}
function fbm(x,y){ return vnoise(x,y)*0.6+vnoise(x*2.7,y*2.7)*0.28+vnoise(x*6.1,y*6.1)*0.12; }

/* ---------- palettes (shared by 2D raster and cosmos texture) ----------
   E5: this object is the single palette source for BOTH views — the
   cosmos continent texture is painted by the same paintRegion below. */
const PALETTES={
satellite:{
  /* A2: Blue Marble ocean — deep navy base, abyssal noise, pale shelf */
  deep:[10,42,82], mid:[14,58,106], shelf:[42,98,150], shallow:[92,154,190],
  abyss:[6,30,62],
  plains:[[74,107,58],[93,124,68]], heart:[60,116,60],
  vegLush:[46,92,40], vegDry:[112,119,62],
  desert:[[212,192,138],[226,206,152]], hamada:[172,146,100],
  glass:[232,224,192], salt:[238,234,223],
  snow:[[226,233,238],[240,245,248]], waste:[[90,84,76],[107,98,88]], zark:[[76,68,62],[88,76,66]],
  swamp:[30,45,30], ring:[40,74,38], ridge:[110,106,98], snowcap:[240,244,248],
  darkForest:[26,52,34], enchanted:[74,142,84], greyForest:[86,96,84], greyMist:[178,182,172],
  badA:[150,96,62], badB:[190,138,92], badCanyon:[92,56,40],
  scar:[16,12,16], lavadot:[255,110,50],
  seaIce:[214,230,240], greyWater:[92,96,100], ashen:[[84,86,88],[102,104,105]], ashenRim:[168,172,174], sahelGreen:[128,146,72], mudflat:[158,142,104], bloom:[122,214,120],
  border:'rgba(255,255,255,0.55)',           /* A2: thin translucent white */
  label:'#ffffff', halo:'rgba(0,0,0,0.65)',
  town:'#ffffff', river:'#3b7fae', sea:'#7fb2d9', route:'#f0dc9a',
  haze:'rgba(212,182,132,', ash:'rgba(120,116,110,',
},
atlas:{
  deep:[153,201,236], mid:[166,211,240], shelf:[176,218,244], shallow:[186,224,248],
  plains:[[205,232,213],[184,222,198]], heart:[178,220,190],
  desert:[[245,241,230],[240,235,220]], glass:[240,236,222], salt:[248,246,240],
  snow:[[232,234,237],[244,245,247]], waste:[[229,225,218],[221,216,208]], zark:[[224,218,210],[216,208,198]],
  swamp:[195,222,204], ring:[164,212,180], ridge:[214,210,203], snowcap:[248,249,250],
  darkForest:[142,182,152], enchanted:[172,224,172], greyForest:[188,196,186], greyMist:[226,228,222],
  badA:[232,212,192], badB:[222,198,176], badCanyon:[198,172,152],
  scar:[206,200,196], lavadot:[230,150,110],
  seaIce:[236,244,248], greyWater:[178,182,186], ashen:[[204,206,208],[216,218,219]], ashenRim:[236,238,240], sahelGreen:[198,220,158], mudflat:[228,216,192], bloom:[176,232,176],
  border:'#9aa0a6', label:'#3c4043', halo:'rgba(255,255,255,0.85)',
  town:'#5f6368', river:'#8ec7ea', sea:'#6699cc', route:'#b8860b',
  haze:'rgba(226,206,168,', ash:'rgba(190,186,180,',
},
/* A1: "Painted" — hand-drawn fantasy cartography. Coastal contour
   banding is carried by bandCols/bandDist in the water pass;
   mountain and tree glyphs are drawn as vector overlays in map.js. */
painted:{
  bandCols:[[127,212,216],[79,179,196],[47,143,168],[31,111,140],[20,82,107]],
  bandDist:[25,60,110,180],
  deep:[20,82,107], mid:[31,111,140], shelf:[79,179,196], shallow:[127,212,216],
  plains:[[167,157,95],[186,174,110]], heart:[150,158,92],
  desert:[[213,177,115],[227,193,129]],
  glass:[236,220,178], salt:[242,234,214],
  snow:[[243,239,227],[252,250,242]], snowShadow:[178,196,214],
  waste:[[124,110,92],[140,124,102]], zark:[[112,98,84],[126,110,92]],
  swamp:[44,56,40], ring:[96,128,74], ridge:[168,148,116], snowcap:[248,246,238],
  darkForest:[52,78,56], enchanted:[136,188,112], greyForest:[112,118,104], greyMist:[206,206,196],
  badA:[164,96,58], badB:[198,138,88], badCanyon:[110,62,38],
  scar:[60,48,44], lavadot:[220,110,60],
  seaIce:[226,234,232], greyWater:[116,120,116], ashen:[[116,114,110],[134,132,128]], ashenRim:[196,196,192], sahelGreen:[146,155,86], mudflat:[176,156,112], bloom:[150,206,120],
  border:'rgba(74,53,32,0.75)', label:'#4a3520', halo:'rgba(240,228,200,0.9)',
  town:'#3a2a18', river:'#3f7fa0', sea:'#2f6f8c', route:'#7a5230',
  haze:'rgba(216,186,132,', ash:'rgba(140,124,104,',
  ink:'#4a3520', parchment:'#ecdfbf',
},
};
function lerpC(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

/* ---------- seasonal parameters (wheel stop 0..3 = Early/High/Late/Deep) ---------- */
const SEASONPAR = {
  // southward shift (mi) of the Vaelthorne/Imperium snow-transition latitudes
  snowShift:   [0, -150, 250, 750],
  // sea-ice edge: open water north of this latitude freezes
  iceLine:     [650, 420, 900, 1550],
  // alpine snowcap elevation threshold (lower = more snow)
  capThresh:   [0.75, 0.85, 0.66, 0.52],
  // sahel Greening tint strength on the northern Sunlands belt
  greening:    [0.55, 0.8, 0.12, 0],
  // Long Dust bleaching of the same belt
  bleach:      [0, 0, 0.35, 0.55],
};
const SAHEL_BAND = { y0:4380, y1:5120 };

/* ---------- sea ice ----------
   An organic sheet, never a band. The edge latitude is perturbed by three
   octaves of fbm — long swells, then bays and tongues, then crenellation at
   ~95 miles, so no straight run of edge survives — it runs south along every
   coast it touches (the frozen shoreline, which ice-locks the northern isles),
   thins over a wide margin instead of stopping, and sheds detached floes
   beyond itself. */
/* A ~300-mile undulation under the noise. fbm alone leaves occasional calm
   patches where the edge drifts under 10 miles across 150+ — visually a
   straight line. A sine of this wavelength cannot: even a window centred on
   its own extremum swings ~23 miles, so no flat run survives anywhere. */
function seaIceSwell(x){ return Math.sin(x*0.0212+1.3)*24; }
/* The two long octaves plus the swell and the shoreline term. Cheap, and on
   its own enough to resolve most pixels: the fine octaves below can only move
   the edge by ±96 miles, so anything well inside or well outside is decided
   here without touching them. */
function seaIceCoarse(x,y,base,dLand){
  let edge = base + seaIceSwell(x)
    + (fbm(x*0.00115+3.1,  y*0.00115+8.7 )-0.5)*560    // long swells   ~870 mi
    + (fbm(x*0.00380+11.3, y*0.00380+2.2 )-0.5)*230;   // bays, tongues ~265 mi
  if(dLand<150) edge += (150-dLand)*1.30;              // the frozen shoreline
  return edge;
}
const ICE_FINE_MAX=96;                                 // 42.5 + 36 + 17, rounded up
function seaIceEdge(x,y,base,dLand){
  return seaIceCoarse(x,y,base,dLand)
    + (fbm(x*0.01050+5.9,  y*0.01050+17.4)-0.5)*85     // crenellation  ~95 mi
    + (fbm(x*0.02600+7.7,  y*0.02600+31.1)-0.5)*72     // pack-ice grain ~38 mi
    + (fbm(x*0.05400+23.5, y*0.05400+13.9)-0.5)*34;    // floe edge     ~19 mi
}
function seaIceAt(x,y,season,dLand){
  const base=SEASONPAR.iceLine[season];
  if(y>base+1100) return 0;                            // south of any tongue or floe
  const coarse=seaIceCoarse(x,y,base,dLand);
  if(y < coarse-165-ICE_FINE_MAX) return 1;            // solid, deep inside the sheet
  if(y > coarse+430+ICE_FINE_MAX) return 0;            // beyond the edge and its floes
  const edge=seaIceEdge(x,y,base,dLand);
  const a=(edge-y)/165;                                // thins over ~165 mi
  if(a>=1) return 1;
  if(a>0) return a;
  const band=(y-edge)/430;                             // detached floes beyond the edge
  if(band<1){
    const f=fbm(x*0.017+29.3, y*0.017+41.7);
    if(f>0.70) return Math.min(0.6,(f-0.70)*3.6)*(1-band);
  }
  return 0;
}

/* (The Last Fish's former grey-water halo is gone — ITEM 1: the isle is
   green and living. The grey, unreflecting water belongs to the Land of the
   Dead now: a ~150-mile radial ring around it, plus the crossing corridor.) */

/* The crossing to the Far Shore: the water between the Land of the Dead and
   the Isle of the Last Door is grey and does not reflect. Tinted along the
   segment between them, strongest at the far shore's own beach. */
const FARSHORE  = ISLANDS.find(s=>s.special==='farshore');
const LASTDOOR  = ISLANDS.find(s=>s.id==='lastdoor');
const FS_REACH  = 300;                                 // half-width of the grey crossing
/* ITEM 2: grey water for ~150 mi out from the Far Shore's rim, all around */
function farShoreRing(x,y){
  if(!FARSHORE) return 0;
  const rn=Math.hypot((x-FARSHORE.x)/FARSHORE.rx,(y-FARSHORE.y)/FARSHORE.ry);
  const halo=150/((FARSHORE.rx+FARSHORE.ry)/2);        // ~150 mi in normalized units
  if(rn>=1+halo) return 0;
  if(rn<=1) return 1;
  return 1-(rn-1)/halo;
}
function farShoreGrey(x,y){
  if(!FARSHORE||!LASTDOOR) return 0;
  const ax=FARSHORE.x, ay=FARSHORE.y, bx=LASTDOOR.x, by=LASTDOOR.y;
  const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
  let t=((x-ax)*dx+(y-ay)*dy)/len2;
  t=Math.max(0,Math.min(1,t));
  const d=Math.hypot(x-(ax+t*dx), y-(ay+t*dy));
  if(d>FS_REACH) return 0;
  // fades with distance from the crossing, and along it toward the Last Door
  return (1-d/FS_REACH)*(1-t*0.55);
}
/* Lake of a Hundred Autumns: deterministic dry-season sub-pools inside the shrunken bound */
const HA = LAKES.find(l=>l.id==='hundredautumns');
const HA_POOLS = (()=>{ const out=[]; for(let i=0;i<10;i++){
  const a=hash2(i,7)*Math.PI*2, r=0.15+hash2(i,13)*0.72;
  out.push({ x:HA.x+Math.cos(a)*HA.rx*0.55*r, y:HA.y+Math.sin(a)*HA.ry*0.55*r,
             rx:HA.rx*(0.07+hash2(i,29)*0.09), ry:HA.ry*(0.07+hash2(i,31)*0.09) });
} return out; })();
const FAROS = LAKES.find(l=>l.id==='faros');
const DEEPMERE = LAKES.find(l=>l.id==='deepmere');

/* seasonal state of a lake pixel: 'water' | 'salt' | 'ice' | 'mud' | null(not lake) */
function lakePixel(x,y,lk,season){
  if(lk.id==='faros' && lk.seasonal) return season>=2 ? 'salt' : 'water';
  if(lk.id==='deepmere' && season===3) return 'ice';
  if(lk.id==='hundredautumns' && season===3){
    const dx=(x-lk.x)/(lk.rx*0.55), dy=(y-lk.y)/(lk.ry*0.55);
    if(dx*dx+dy*dy>1) return 'mud';
    for(const p of HA_POOLS){
      const px=(x-p.x)/p.rx, py=(y-p.y)/p.ry;
      if(px*px+py*py<=1) return 'water';
    }
    return 'mud';
  }
  return lk.toxic ? 'toxic' : 'water';
}

/* ---------- terrain classification (travel + hit testing) ---------- */
const SW_HIDDEN = HIDDEN.find(h=>h.id==='voidswamp');
const GLASS_W = WONDERS.find(w=>w.id==='glass');
function terrainAt(x,y){
  const land=landAt(x,y);
  if(!land) return 'water';
  if(land.type==='island'){
    return {lush:'plains',snow:'snow',sand:'desert',rock:'mountain',pirate:'plains',pillar:'mountain',grey:'waste'}[land.isl.kind]||'plains';
  }
  if(lakeAt(x,y)) return 'water';
  if(forestAt(x,y)) return 'forest';
  for(const ma of MARSHES){
    const dx=(x-ma.x)/ma.rx, dy=(y-ma.y)/ma.ry;
    if(dx*dx+dy*dy<=1) return 'swamp';
  }
  if(Math.hypot(x-SW_HIDDEN.x,y-SW_HIDDEN.y)<=SW_HIDDEN.r) return 'swamp';
  if(Math.hypot(x-GLASS_W.x,y-GLASS_W.y)<=95) return 'glass';
  if(MTNFIELD.sample(x,y)<110) return 'mountain';
  if(inPoly(x,y,BADLANDS.poly)) return 'badlands';
  if(inForestRing(x,y)) return 'forest';
  const k=kingdomAt(x,y);
  if(k&&k.id==='albion'&&Math.hypot(x-5450,y-5150)<300) return 'desert';
  if(k&&k.id==='vaelthorne'&&y<1400) return 'snow';
  if(k&&k.id==='imperium'&&y<1650) return 'snow';
  if(k){
    if(k.id==='sunlands') return 'desert';
    if(k.id==='northern') return 'snow';
    if(k.id==='ashlands'||k.id==='zarkaine') return 'waste';
  }
  return 'plains';
}

/* approximate distance (miles) from a sea point to the nearest land:
   the continent coast along the ray, and every island's rim. */
let ISLE_CUT=null;
function seaDistToLand(x,y,th,cr,er){
  const Rth=Math.hypot(WORLD.a*Math.cos(th), WORLD.b*Math.sin(th))*cr;
  let d=(er-cr)*Rth;
  if(!ISLE_CUT) ISLE_CUT=VISIBLE_ISLANDS.map(s=>Math.max(s.rx,s.ry)*1.6+200);
  for(let i=0;i<VISIBLE_ISLANDS.length;i++){
    const s=VISIBLE_ISLANDS[i], cut=ISLE_CUT[i];
    const adx=x-s.x; if(adx>cut||adx<-cut) continue;
    const ady=y-s.y; if(ady>cut||ady<-cut) continue;
    // elliptical distance so the contour bands follow each island's shape
    const rn=Math.hypot(adx/s.rx,ady/s.ry);
    const di=(rn-0.92)*(s.rx+s.ry)*0.5;
    if(di<d) d=di;
  }
  return Math.max(0,d);
}
/* relief height proxy for hillshading */
function reliefAt(x,y){
  const md=MTNFIELD.sample(x,y);
  if(md>=110) return 0;
  const t=1-md/110;
  return t*(0.6+fbm(x*0.02,y*0.02)*0.7);
}

/* ---------- the raster painter ----------
   Fills a W×H RGBA buffer for the world rect [x0,y0]→[x1,y1].
   Sub-rects give LOD tiles and the cosmos continent texture.
   opts: { style, season, waterAlpha (0 for cosmos cut-out) } */
function paintRegion(buf, W, H, x0, y0, x1, y1, opts){
  const style=opts.style||'satellite', season=opts.season==null?1:opts.season;
  const waterAlpha=opts.waterAlpha==null?255:opts.waterAlpha;
  const P=PALETTES[style];
  const snowShift=SEASONPAR.snowShift[season];
  const iceReach=SEASONPAR.iceLine[season]+1100;   // south of this no ice, tongue or floe reaches
  const capT=SEASONPAR.capThresh[season], green=SEASONPAR.greening[season], bleach=SEASONPAR.bleach[season];
  MTNFIELD.build();
  const sw=SW_HIDDEN, gl=GLASS_W;
  for(let j=0;j<H;j++){
    const y=y0+(j+0.5)/H*(y1-y0);
    for(let i=0;i<W;i++){
      const x=x0+(i+0.5)/W*(x1-x0);
      const n=fbm(x*0.004,y*0.004);
      let col, alpha=255;
      const th=thetaOf(x,y), cr=coastNoise(th), er=ellipseR(x,y);
      const isl = er>cr*0.98 ? islandAt(x,y) : null;
      const onCont = er<=cr;
      if(!onCont && !isl){
        const dn=n*0.5+0.5;
        // the atlas style has no contour banding, so it only needs the
        // distance-to-land field where the sea ice can reach
        const dLand=(style!=='atlas'||y<=iceReach) ? seaDistToLand(x,y,th,cr,er) : 0;
        if(style==='painted'){
          // A1.1: coastal contour banding — discrete turquoise→teal steps
          // hugging the noisy coast, every island, strait and cluster.
          const dj=dLand + (fbm(x*0.012,y*0.012)-0.5)*14;
          const B=P.bandCols, T=P.bandDist;
          let bi=B.length-1;
          for(let b=0;b<T.length;b++){ if(dj<T[b]){ bi=b; break; } }
          col=B[bi];
          col=lerpC(col,[col[0]*0.93,col[1]*0.95,col[2]*0.97], n*0.6); // brush grain
        } else if(style==='satellite'){
          // A2: deep navy base, abyssal ridge noise, pale shelf ring,
          // slightly lighter basins toward the map-centre latitude.
          const d=dLand;
          if(d<38) col=lerpC(P.shallow,P.shelf, Math.min(1,d/38)*0.8+dn*0.2);
          else if(d<95) col=lerpC(P.shelf,P.mid,(d-38)/57*(0.75+dn*0.25));
          else col=lerpC(P.mid,P.deep, Math.min(1,(d-95)/220)*0.8+dn*0.2);
          const ab=fbm(x*0.0009+7,y*0.0009+13);           // abyssal ridges
          if(d>95) col=lerpC(col,P.abyss,(ab-0.45)*0.9*Math.min(1,(d-95)/150));
          const eq=Math.max(0,1-Math.abs(y-WORLD.cy)/(WORLD.h*0.5)); // equator-analog
          col=lerpC(col,[col[0]+14,col[1]+18,col[2]+20], eq*eq*0.35);
        } else {
          let depth=1;
          const margin=er/cr;
          if(margin<1.045) depth=0;
          else if(margin<1.10) depth=(margin-1.045)/0.055;
          if(depth>0){
            for(const s of VISIBLE_ISLANDS){
              const dx=(x-s.x)/s.rx, dy=(y-s.y)/s.ry;
              const r=Math.sqrt(dx*dx+dy*dy);
              if(r<1.6){ const dd=Math.max(0,(r-1.0)/0.6); depth=Math.min(depth,dd); }
            }
          }
          if(depth<=0) col=lerpC(P.shelf,P.shallow, dn*0.6);
          else col=lerpC(P.mid,P.deep, Math.min(1,depth*0.7+dn*0.3));
        }
        // the grey, unreflecting waters of the dead: the crossing corridor
        // and the ~150-mile ring around the Far Shore itself
        if(FARSHORE){
          const fs=Math.max(farShoreGrey(x,y), farShoreRing(x,y));
          if(fs>0) col=lerpC(col,P.greyWater, fs*0.72);
        }
        // seasonal sea ice: an organic sheet whose edge is fbm-perturbed,
        // hugs every coast, thins outward and sheds floes (never a band)
        if(y<=iceReach){
          const ice=seaIceAt(x,y,season,dLand);
          if(ice>0) col=lerpC(col,P.seaIce, ice*(0.55+dn*0.45));
        }
        alpha=waterAlpha;
      } else {
        let terr;
        if(isl) terr={lush:'plains',snow:'snow',sand:'desert',rock:'ridge',pirate:'plains',pillar:'pillar',grey:'farshore'}[isl.kind];
        else {
          if(Math.hypot(x-sw.x,y-sw.y)<=sw.r) terr='swamp';
          else if(Math.hypot(x-gl.x,y-gl.y)<=95) terr='glass';
          else if(Math.hypot(x-3300,y-5250)<=110 && Math.abs(y-5250)<80) terr='salt';
          else if(Math.hypot(x-6450,y-1750)<=52) terr='scar';
          else if(inForestRing(x,y)) terr='ring';
          else if(inPoly(x,y,BADLANDS.poly)) terr='badlands';
          else {
            const k=kingdomAt(x,y);
            if(k&&k.id==='sunlands') terr='desert';
            else if(k&&k.id==='northern') terr='snow';
            else if(k&&(k.id==='ashlands')) terr='waste';
            else if(k&&(k.id==='zarkaine')) terr='zark';
            else if(k&&k.id==='heartlands') terr='heart';
            else terr='plains';
          }
        }
        // lakes (season-aware) and named forests override terrain
        let lakeState=null, foKind=null;
        const lk=lakeAt(x,y);
        if(lk) lakeState=lakePixel(x,y,lk,season);
        if(!lakeState){
          for(const ma of MARSHES){
            const dx=(x-ma.x)/ma.rx, dy=(y-ma.y)/ma.ry;
            if(dx*dx+dy*dy<=1){ terr='swamp'; break; }
          }
          if(terr!=='swamp'){
            for(const fo of FORESTS){
              if(inForestBody(x,y,fo) && fbm(x*0.006,y*0.006)>0.32){ terr='ring'; foKind=fo.kind||'forest'; break; }
            }
          }
        }
        if(lakeState==='water') col= style==='painted' ? lerpC(P.shallow,P.shelf,n*0.5) : lerpC(P.shelf,P.shallow,n*0.7);
        else if(lakeState==='toxic') col= style==='satellite' ? [130,160,70] : [200,220,150];
        else if(lakeState==='salt') col=P.salt;
        else if(lakeState==='ice') col=lerpC(P.seaIce,P.snowcap,n*0.6);
        else if(lakeState==='mud') col=lerpC(P.mudflat,P.desert[0],n*0.4);
        else if(terr==='plains'||terr==='heart'){
          if(style==='satellite'){
            // A2: moisture/latitude-driven vegetation instead of flat washes —
            // lusher near the Heartlands and coasts, drier toward desert margins.
            const edge=er/cr;                                        // 0 centre → 1 coast
            const coastal=Math.max(0,Math.min(1,(edge-0.66)/0.30));
            const heartProx=Math.max(0,1-Math.hypot(x-4500,y-3500)/1500);
            const dryS=Math.max(0,Math.min(1,(y-3550)/1500));        // toward the Sunlands
            let moist=0.40+0.38*heartProx+0.22*coastal-0.38*dryS+(n-0.5)*0.42;
            if(terr==='heart') moist+=0.14;
            col=lerpC(P.vegDry,P.vegLush,Math.max(0,Math.min(1,moist)));
          } else if(style==='painted'){
            const nn=Math.max(0,Math.min(1,n*1.55-0.28));            // brush-noise amplitude
            col= terr==='heart' ? lerpC(P.heart,P.plains[1],nn) : lerpC(P.plains[0],P.plains[1],nn);
          } else {
            col= terr==='heart' ? lerpC(P.heart,P.plains[1],n*0.6) : lerpC(P.plains[0],P.plains[1],n);
          }
        }
        else if(terr==='desert'){
          col=lerpC(P.desert[0],P.desert[1],n);
          if(style==='satellite'){
            // A2: not one flat tan — dune-field banding + darker rocky hamada
            const dune=Math.sin(x*0.013 + fbm(x*0.004,y*0.004)*7)*0.5+0.5;
            col=lerpC(col,P.desert[1],dune*0.4);
            const hm=fbm(x*0.0016+9,y*0.0016+3);
            if(hm<0.44) col=lerpC(col,P.hamada,Math.min(0.55,(0.44-hm)*2.4));
          } else if(style==='painted'){
            const nn=Math.max(0,Math.min(1,n*1.5-0.25));
            col=lerpC(P.desert[0],P.desert[1],nn);
          }
          if(!isl && y>SAHEL_BAND.y0 && y<SAHEL_BAND.y1){
            // the Sahel belt: green-gold in the Greening, bleached in the Long Dust
            const band=Math.sin((y-SAHEL_BAND.y0)/(SAHEL_BAND.y1-SAHEL_BAND.y0)*Math.PI);
            if(green>0) col=lerpC(col,P.sahelGreen, green*band*(0.55+n*0.45));
            if(bleach>0) col=lerpC(col,P.salt, bleach*band*0.6);
          }
        }
        else if(terr==='glass') col=P.glass;
        else if(terr==='salt') col=P.salt;
        else if(terr==='snow'){
          col=lerpC(P.snow[0],P.snow[1],n);
          if(style==='painted'){
            // cream-white with blue shadow pooling in the hollows
            const sh=fbm(x*0.01+5,y*0.01+11);
            if(sh<0.44) col=lerpC(col,P.snowShadow,(0.44-sh)*1.6);
          }
        }
        else if(terr==='waste') col=lerpC(P.waste[0],P.waste[1], style==='painted'?Math.max(0,Math.min(1,n*1.5-0.25)):n);
        else if(terr==='zark') col=lerpC(P.zark[0],P.zark[1],n);
        else if(terr==='swamp') col= style==='painted' ? lerpC(P.swamp,[P.swamp[0]+26,P.swamp[1]+30,P.swamp[2]+20],n) : P.swamp;
        else if(terr==='ring'){
          col=lerpC(P.ring,P.plains[0],n*0.4);
          // C: forest kinds — 'dark' colder/deeper with sparse pale trunks,
          // 'enchanted' with a faint emissive shimmer in the Painted style
          if(foKind==='dark'){
            col=lerpC(col,P.darkForest,0.78);
            const tk=fbm(x*0.05,y*0.05);
            if(tk>0.865) col=lerpC(col,[214,208,192],0.55);          // pale trunks
          } else if(foKind==='enchanted'){
            col=lerpC(col,P.enchanted,0.5);
            if(style==='painted'){
              const sp=fbm(x*0.045+3,y*0.045+17);
              if(sp>0.8) col=lerpC(col,[240,234,168],(sp-0.8)*4);    // shimmer
            }
          } else if(foKind==='grey'){
            // the Forgetting: desaturated grey-green, and in the Painted
            // style a faint pale mist stipple. It must read wrong, not lush.
            col=lerpC(col,P.greyForest,0.82);
            if(style==='painted'){
              const mist=fbm(x*0.03+23,y*0.03+41);
              if(mist>0.56) col=lerpC(col,P.greyMist,Math.min(0.5,(mist-0.56)*1.5));
            }
          }
        }
        else if(terr==='farshore'){
          // ashen ground, no vegetation anywhere on it, and a pale bleached
          // rim toward the shoreline where the mist lies
          col=lerpC(P.ashen[0],P.ashen[1],n);
          if(isl){
            const rn=Math.hypot((x-isl.x)/isl.rx,(y-isl.y)/isl.ry);
            if(rn>0.55) col=lerpC(col,P.ashenRim,Math.min(1,(rn-0.55)/0.45)*0.7);
          }
        }
        else if(terr==='scar') col=P.scar;
        else if(terr==='badlands'){
          const strata=Math.sin(y*0.02 + fbm(x*0.008,y*0.008)*6);
          col=lerpC(P.badA,P.badB,(strata+1)/2);
          const crack=fbm(x*0.016,y*0.016);
          if(crack>0.42&&crack<0.47) col=P.badCanyon;
        }
        else col=P.ridge;
        // volcanic Bloom: faint luminous green at the Painted Basin and Bloomfields
        if(season===0){
          const b1=Math.hypot(x-7050,y-1700), b2=Math.hypot(x-2200,y-2900);
          const bf=Math.max(0, 1-Math.min(b1/110,b2/95));
          if(bf>0) col=lerpC(col,P.bloom, bf*0.5*(0.5+n*0.5));
        }
        // soft climate transitions (snow line moves with the season)
        if(!isl && terr==='plains'){
          const k2=kingdomAt(x,y);
          if(k2&&k2.id==='albion'){
            const f=Math.max(0,1-Math.hypot(x-5450,y-5150)/420)*0.85;
            if(f>0) col=lerpC(col,lerpC(P.desert[0],P.desert[1],n),f);
          } else if(k2&&k2.id==='vaelthorne'){
            const f=Math.min(1,Math.max(0,((1550+snowShift)-y)/380))*0.9;
            if(f>0) col=lerpC(col,lerpC(P.snow[0],P.snow[1],n),f);
          } else if(k2&&k2.id==='imperium'){
            const f=Math.min(1,Math.max(0,((1780+snowShift)-y)/380))*0.8;
            if(f>0) col=lerpC(col,lerpC(P.snow[0],P.snow[1],n),f);
          } else if(snowShift>300){
            // deep winter: the snow line reaches the northern Heartlands margin
            const f=Math.min(1,Math.max(0,((1450+snowShift)-y)/420))*0.7;
            if(f>0) col=lerpC(col,lerpC(P.snow[0],P.snow[1],n),f);
          }
        }
        // mountain relief (snowcap threshold moves with the season)
        if(!isl && !lakeState){
          const md=MTNFIELD.sample(x,y);
          if(md<110){
            const t=1-md/110;
            const ridge=fbm(x*0.02,y*0.02);
            const elev=t*(0.6+ridge*0.7);
            if(style==='satellite'||style==='painted'){
              // A2: fake NW-light hillshade — brighten NW-facing slopes,
              // darken SE-facing ones — instead of flat gray ridge blending.
              const dd=14;
              const shade=reliefAt(x+dd,y+dd)-reliefAt(x-dd,y-dd);
              const rock= style==='painted' ? 0.3 : 0.42;
              col=lerpC(col,P.ridge, t*rock);
              const k=Math.max(-0.42,Math.min(0.42, shade*(style==='painted'?0.9:1.5)));
              col=[col[0]*(1+k),col[1]*(1+k),col[2]*(1+k)];
            } else {
              col=lerpC(col,P.ridge, t*0.8);
            }
            if(elev>capT) col=lerpC(col,P.snowcap,Math.min(1,(elev-capT)/0.35));
            else if(style==='atlas') col=lerpC(col,[col[0]*0.7,col[1]*0.7,col[2]*0.7], (ridge-0.5)*t);
          }
        } else if(isl && isl.kind==='pillar'){
          col=lerpC(P.ridge,[30,26,24], style==='satellite'?0.6:0.0);
        }
        // seasonal ash tint over the volcanic zones during the Ashfall
        if(season===2 && !isl){
          const k3=kingdomAt(x,y);
          if(k3&&(k3.id==='ashlands'||k3.id==='zarkaine')) col=lerpC(col,[128,124,118],0.28);
        }
      }
      const o=(j*W+i)*4;
      buf[o]=col[0]; buf[o+1]=col[1]; buf[o+2]=col[2]; buf[o+3]=alpha;
    }
  }
}

/* Post-pass translucent weather overlays (haze), drawn onto a 2d
   context whose pixels cover the world rect [x0,y0]→[x1,y1]. */
function paintWeather(g, W, H, x0, y0, x1, y1, opts){
  const style=opts.style||'satellite', season=opts.season==null?1:opts.season;
  const P=PALETTES[style];
  const px=x=> (x-x0)/(x1-x0)*W, py=y=> (y-y0)/(y1-y0)*H;
  // (The Last Fish's black haze is gone — ITEM 1: the isle is green. The
  // Far Shore's greyish cast over the landmass is baked here instead.)
  if(FARSHORE){
    const cx=px(FARSHORE.x), cy=py(FARSHORE.y);
    const R=px(FARSHORE.x+FARSHORE.rx*1.35)-cx, RY=py(FARSHORE.y+FARSHORE.ry*1.35)-cy;
    if(Math.abs(R)>0.5){
      const rg=g.createRadialGradient(cx,cy,0,cx,cy,Math.abs(R));
      rg.addColorStop(0,'rgba(96,98,102,0.34)');
      rg.addColorStop(0.7,'rgba(96,98,102,0.18)');
      rg.addColorStop(1,'rgba(96,98,102,0)');
      g.fillStyle=rg;
      g.beginPath(); g.ellipse(cx,cy,Math.abs(R),Math.abs(RY),0,0,7); g.fill();
    }
  }
  if(season>=2){
    // Harmattan haze: a translucent tan gradient blowing in from the north of the Sunlands
    const a= season===3?0.30:0.20;
    const gr=g.createLinearGradient(0,py(4300),0,py(5900));
    gr.addColorStop(0,P.haze+a+')'); gr.addColorStop(1,P.haze+'0)');
    g.fillStyle=gr;
    g.fillRect(px(2700),py(4300),px(5700)-px(2700),py(5900)-py(4300));
  }
  if(season===2){
    // Ashfall: drifting ash haze over the Ashlands and Zar'kaine
    for(const c of [[1900,3250,1100],[6800,1400,1000]]){
      const rg=g.createRadialGradient(px(c[0]),py(c[1]),0,px(c[0]),py(c[1]),px(c[0]+c[2])-px(c[0]));
      rg.addColorStop(0,P.ash+'0.34)'); rg.addColorStop(1,P.ash+'0)');
      g.fillStyle=rg;
      g.beginPath(); g.ellipse(px(c[0]),py(c[1]), px(c[0]+c[2])-px(c[0]), py(c[1]+c[2]*0.75)-py(c[1]),0,0,7); g.fill();
    }
  }
}

/* ---------- travel model (season-aware, modifiers PROPOSED) ---------- */
function seasonalMult(x,y,terr,mode,season){
  if(season==null||season===1) return 1;
  let m=1;
  const k=kingdomAt(x,y);
  const taigaAlpine = k && SEASON_TRAVEL.deepWinterZones.includes(k.id);
  if(SEASON_TRAVEL.deepSeasons.includes(season) && taigaAlpine && (mode==='foot'||mode==='mount')){
    const lk=lakeAt(x,y);
    if((terr==='water') && lk && k.id==='northern') return 1/TRAVEL.terrain.water[mode]; // ice road: full base speed
    m*=0.5;
  }
  if(SEASON_TRAVEL.harmattanSeasons.includes(season) && (terr==='desert'||terr==='glass')) m*=0.8;
  if(SEASON_TRAVEL.monsoonSeasons.includes(season) && k && k.id==='jade' && terr==='plains') m*=0.75;
  return m;
}
function sampleTerrainSpeeds(a,b,mode,season){
  const N=40; let time=0; const seen={};
  const dist=Math.hypot(b.x-a.x,b.y-a.y);
  let seasonal=false;
  for(let i=0;i<N;i++){
    const t=(i+0.5)/N;
    const x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t;
    const terr=terrainAt(x,y); seen[terr]=(seen[terr]||0)+1;
    const sm=seasonalMult(x,y,terr,mode,season);
    if(sm!==1) seasonal=true;
    time += (dist/N)/(TRAVEL.modes[mode].base*TRAVEL.terrain[terr][mode]*sm);
  }
  return {days:time,dist,seen,seasonal};
}
function fmtDays(d){
  if(d<1) return Math.round(d*24)+' hours';
  const w=Math.floor(d),h=Math.round((d-w)*24);
  return w+' day'+(w!==1?'s':'')+(h?` ${h} h`:'');
}
function nearestGate(pt,excludeEmbargo){
  let best=null,bd=1e18;
  for(const g of GATES){
    if(excludeEmbargo&&g.embargo) continue;
    const d=Math.hypot(g.x-pt.x,g.y-pt.y);
    if(d<bd){bd=d;best=g;}
  }
  return {gate:best,dist:bd};
}
function computeJourney(a,b,season){
  const out=[];
  let seasonal=false;
  const straight=Math.hypot(b.x-a.x,b.y-a.y);
  for(const mode of ['foot','mount','suneater']){
    const r=sampleTerrainSpeeds(a,b,mode,season);
    if(r.seasonal) seasonal=true;
    let days=r.days,note='',recharges=0;
    if(mode==='suneater'){
      recharges=Math.max(0,Math.ceil(r.dist/TRAVEL.modes.suneater.range)-1);
      if(recharges>0){ days+=recharges*TRAVEL.modes.suneater.rechargeDays;
        note=` (incl. ${recharges} recharge stop${recharges>1?'s':''} — 2 days each, collector open like a flower)`; }
    }
    const terrs=Object.entries(r.seen).sort((p,q)=>q[1]-p[1]).slice(0,3)
      .map(e=>TRAVEL.terrain[e[0]].name).join(', ');
    out.push({mode:TRAVEL.modes[mode].label,modeId:mode,days,recharges,time:fmtDays(days),detail:`through ${terrs}${note}`});
  }
  const gA=nearestGate(a,false), gB=nearestGate(b,true);
  let embargoSkipped=false;
  if(gA.gate&&gB.gate&&gA.gate!==gB.gate){
    const legA=sampleTerrainSpeeds(a,{x:gA.gate.x,y:gA.gate.y},'mount',season).days;
    const legB=sampleTerrainSpeeds({x:gB.gate.x,y:gB.gate.y},b,'mount',season).days;
    const td=Math.hypot(gA.gate.x-gB.gate.x,gA.gate.y-gB.gate.y);
    const gm=Math.min(95,Math.max(10,10+80*(td/7600)));
    let emb='';
    const nb=nearestGate(b,false);
    if(nb.gate&&nb.gate.embargo&&nb.gate!==gB.gate){ emb=' — Paradise Terminal skipped (embargo: exit only)'; embargoSkipped=true; }
    out.push({mode:TRAVEL.modes.gate.label,modeId:'gate',days:legA+legB+gm/60/24,arrivalGate:gB.gate.id,time:fmtDays(legA+legB+gm/60/24),
      detail:`ride to ${gA.gate.name} (${fmtDays(legA)}), Aetherial Stream ${Math.round(gm)} min, ride from ${gB.gate.name} (${fmtDays(legB)})${emb}`});
  }
  return {straight,out,seasonal,embargoSkipped,seasonNote:seasonal?SEASON_TRAVEL.note:null};
}

/* ============================================================
   D. DOMAINS — population-weighted Voronoi partition per kingdom
   (multiplicative weights: nearest seed by d/w, w = pop^0.30, so
   capitals hold visibly larger cells). Rendered as thin dashed
   interior boundaries; strictly clipped to kingdom + coastline;
   never over the Forest Ring, lakes, or the Red Reaches.
   ============================================================ */
const DOMAIN_STEP=8; // grid resolution, miles
function popOf(s){ const m=String(s.pop||'').replace(/[^0-9]/g,''); return +m||3000; }
function insideKingdom(k,x,y){
  return k.shape==='circle' ? Math.hypot(x-k.cx,y-k.cy)<=k.rx : inPoly(x,y,k.poly);
}
function domainSeeds(k){
  return SETTLEMENTS
    .filter(s=>s.kingdom===k.id && s.type!=='site' && insideKingdom(k,s.x,s.y) && landAt(s.x,s.y))
    .map(s=>({s, w:Math.pow(popOf(s)+800, 0.30)}));
}
function domainMaskOK(x,y){
  if(!onContinent(x,y)) return false;          // coastline clip
  if(inForestRing(x,y)) return false;          // the Ring is the elves'
  if(lakeAt(x,y)) return false;                // not over lakes
  if(inPoly(x,y,BADLANDS.poly)) return false;  // the Red Reaches: unclaimed
  return true;
}
function domainOwner(seeds,x,y){
  let best=null,bs=1e18;
  for(const e of seeds){
    const d=Math.hypot(x-e.s.x,y-e.s.y)/e.w;
    if(d<bs){bs=d;best=e;}
  }
  return best;
}
const FREE_TOWN_TYPES=new Set(['town','village','vassal']);
function freeTownDomains(){
  return SETTLEMENTS
    .filter(s=>!s.kingdom && FREE_TOWN_TYPES.has(s.type) && onContinent(s.x,s.y))
    .map(s=>({id:s.id, name:s.name, x:s.x, y:s.y,
      r:Math.round(40+80*Math.max(0,Math.min(1,(popOf(s)-4000)/40000)))}));
}
let DOMAINS=null;
function computeDomains(){
  if(DOMAINS) return DOMAINS;
  const cellA=DOMAIN_STEP*DOMAIN_STEP;
  const segs=[];            // [x1,y1,x2,y2,...] world coords
  const cells={};           // settlementId -> {area, name, kingdom}
  const kOf={};             // settlementId -> border color source
  for(const k of KINGDOMS){
    const seeds=domainSeeds(k);
    if(seeds.length<2) continue;
    let bx0,by0,bx1,by1;
    if(k.shape==='circle'){ bx0=k.cx-k.rx; bx1=k.cx+k.rx; by0=k.cy-k.ry; by1=k.cy+k.ry; }
    else {
      bx0=bx1=k.poly[0][0]; by0=by1=k.poly[0][1];
      for(const p of k.poly){ bx0=Math.min(bx0,p[0]); bx1=Math.max(bx1,p[0]); by0=Math.min(by0,p[1]); by1=Math.max(by1,p[1]); }
    }
    const nx=Math.ceil((bx1-bx0)/DOMAIN_STEP), ny=Math.ceil((by1-by0)/DOMAIN_STEP);
    const lab=new Int16Array(nx*ny).fill(-1);
    for(let jy=0;jy<ny;jy++){
      const y=by0+(jy+0.5)*DOMAIN_STEP;
      for(let jx=0;jx<nx;jx++){
        const x=bx0+(jx+0.5)*DOMAIN_STEP;
        if(!insideKingdom(k,x,y)||!domainMaskOK(x,y)) continue;
        const own=domainOwner(seeds,x,y);
        const idx=seeds.indexOf(own);
        lab[jy*nx+jx]=idx;
        const id=own.s.id;
        (cells[id]||(cells[id]={area:0,name:own.s.name,kingdom:k.id})).area+=cellA;
        kOf[id]=k.border||'#999';
      }
    }
    // boundary segments on the dual grid where neighbouring labels differ
    for(let jy=0;jy<ny;jy++) for(let jx=0;jx<nx;jx++){
      const a=lab[jy*nx+jx];
      if(a<0) continue;
      const rt= jx+1<nx ? lab[jy*nx+jx+1] : -1;
      const dn= jy+1<ny ? lab[(jy+1)*nx+jx] : -1;
      const X=bx0+(jx+1)*DOMAIN_STEP, Y=by0+(jy+1)*DOMAIN_STEP;
      if(rt>=0&&rt!==a) segs.push(X, Y-DOMAIN_STEP, X, Y, seedColorIdx(k));
      if(dn>=0&&dn!==a) segs.push(X-DOMAIN_STEP, Y, X, Y, seedColorIdx(k));
    }
  }
  DOMAINS={segs, cells, colors:KINGDOMS.map(k=>k.border||'#999'), free:freeTownDomains()};
  return DOMAINS;
}
function seedColorIdx(k){ return KINGDOMS.indexOf(k); }
/* which domain (if any) a clicked point belongs to */
function domainInfoAt(x,y){
  const d=computeDomains();
  const k=kingdomAt(x,y);
  if(k && domainMaskOK(x,y)){
    const seeds=domainSeeds(k);
    if(seeds.length>=2){
      const own=domainOwner(seeds,x,y);
      if(own && d.cells[own.s.id]) return {settlement:own.s, area:d.cells[own.s.id].area, free:false};
    }
  }
  for(const f of d.free){
    if(Math.hypot(x-f.x,y-f.y)<=f.r){
      const s=SETTLEMENTS.find(t=>t.id===f.id);
      return {settlement:s, area:Math.round(Math.PI*f.r*f.r), free:true};
    }
  }
  return null;
}

/* ---------- E2: route audit — non-sea routes must stay on land ---------- */
function routeWaterAudit(){
  const bad=[];
  for(const r of D.ROUTES){
    if(r.kind==='sea'||r.kind==='smuggle') continue;   // sea lanes + smuggler runs may sail
    const path=r.path;
    for(let i=0;i<path.length-1;i++){
      const [ax,ay]=path[i], [bx,by]=path[i+1];
      const L=Math.hypot(bx-ax,by-ay), steps=Math.max(2,Math.ceil(L/12));
      for(let sIdx=1;sIdx<steps;sIdx++){
        const t=sIdx/steps, x=ax+(bx-ax)*t, y=ay+(by-ay)*t;
        if(terrainAt(x,y)==='water') bad.push({route:r.name, seg:i, x:Math.round(x), y:Math.round(y)});
      }
    }
  }
  return bad;
}

/* ---------- land verification (the __landCheck contract) ----------
   E6: extended to every merged feature class. */
function landCheck(){
  const bad=[];
  for(const s of SETTLEMENTS){ if(!landAt(s.x,s.y)) bad.push('settlement:'+s.id); }
  for(const g of GATES){ if(!landAt(g.x,g.y)) bad.push('gate:'+g.id); }
  /* `sea:true` marks a wonder that legitimately stands over water (the
     Floating Isles hang above the Veiled Vortex; the Drowning Pillars are
     submarine volcanoes). */
  for(const w of WONDERS){ if(w.id!=='drowningpillars'&&!w.sea&&!landAt(w.x,w.y)) bad.push('wonder:'+w.id); }
  for(const isl of VISIBLE_ISLANDS){ if(!islandAt(isl.x,isl.y)) bad.push('island-center:'+isl.id); }
  /* Hidden isles are charted as water features: they must stand in open sea,
     clear of the continent and of every island the world can see. */
  for(const isl of HIDDEN_ISLANDS){
    if(!hiddenIslandAt(isl.x,isl.y)) bad.push('hidden-island-center:'+isl.id);
    if(onContinent(isl.x,isl.y)) bad.push('hidden-island-on-land:'+isl.id);
    for(const other of VISIBLE_ISLANDS){
      if(Math.hypot(isl.x-other.x,isl.y-other.y) < Math.max(isl.rx,isl.ry)*1.4+Math.max(other.rx,other.ry)*1.4)
        bad.push('hidden-island-overlap:'+isl.id+'/'+other.id);
    }
  }
  if(D.MAELSTROMS) for(const ms of D.MAELSTROMS){
    if(landAt(ms.x,ms.y)||hiddenIslandAt(ms.x,ms.y)) bad.push('maelstrom-on-land:'+ms.id);
  }
  /* Sea-mountains are water markers: they must stand out of open sea. */
  if(SEAMOUNTS) for(let i=0;i<SEAMOUNTS.length;i++){
    const sm=SEAMOUNTS[i];
    if(landAt(sm.x,sm.y)||hiddenIslandAt(sm.x,sm.y)) bad.push('seamount-on-land:'+sm.ring+'#'+i);
    if(sm.x<0||sm.y<0||sm.x>WORLD.w||sm.y>WORLD.h) bad.push('seamount-off-map:'+sm.ring+'#'+i);
  }
  for(const rg of RING_GATES){ const[x,y]=ringGatePos(rg.deg); if(!onContinent(x,y)) bad.push('ringgate:'+rg.id); }
  for(const fo of FORESTS){ if(!landAt(fo.x,fo.y)) bad.push('forest:'+fo.id); }
  for(const lk of LAKES){ if(!onContinent(lk.x,lk.y)) bad.push('lake:'+lk.id); }
  for(const ma of MARSHES){ if(!landAt(ma.x,ma.y)) bad.push('marsh:'+ma.id); }
  for(const r of RIVERS){ if(!landAt(r.path[0][0],r.path[0][1])) bad.push('river-source:'+r.name); }
  for(const h of HIDDEN){
    if(h.x!=null && ['camp','crime','ruin','rail','cult'].includes(h.icon) && !landAt(h.x,h.y)) bad.push('hidden:'+h.id);
  }
  if(D.SEASON_ACTIVITIES) for(const a of D.SEASON_ACTIVITIES){ if(!landAt(a.x,a.y)) bad.push('activity:'+a.id); }
  return bad;
}

return { thetaOf, ellipseR, coastRadiusAt, onContinent, islandAt, hiddenIslandAt, landAt, angDeg,
  VISIBLE_ISLANDS, HIDDEN_ISLANDS, inForestBody, forestAt,
  inForestRing, inPoly, distToPath, kingdomAt, lakeAt, MTNFIELD, hash2, vnoise, fbm,
  PALETTES, lerpC, SEASONPAR, HA_POOLS, terrainAt, paintRegion, paintWeather, seaIceAt,
  seasonalMult, sampleTerrainSpeeds, fmtDays, nearestGate, computeJourney, landCheck,
  computeDomains, domainInfoAt, routeWaterAudit, popOf, seaDistToLand };
})(typeof TDA_DATA !== 'undefined' ? TDA_DATA : require('./data.js'));
if (typeof module !== 'undefined' && module.exports) module.exports = TDA_GEO;
if (typeof globalThis !== 'undefined') globalThis.TDA_GEO = TDA_GEO;
