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
        TRAVEL, SEASON_TRAVEL, coastNoise, islandNoise, ringGatePos } = D;

/* ---------- geometry helpers ---------- */
function thetaOf(x,y){ return Math.atan2((y-WORLD.cy)/WORLD.b,(x-WORLD.cx)/WORLD.a); }
function ellipseR(x,y){
  const dx=(x-WORLD.cx)/WORLD.a, dy=(y-WORLD.cy)/WORLD.b;
  return Math.sqrt(dx*dx+dy*dy);
}
function coastRadiusAt(x,y){ return coastNoise(thetaOf(x,y)); }
function onContinent(x,y){ return ellipseR(x,y) <= coastRadiusAt(x,y); }
function islandAt(x,y){
  for(const isl of ISLANDS){
    const dx=(x-isl.x)/isl.rx, dy=(y-isl.y)/isl.ry;
    const r=Math.sqrt(dx*dx+dy*dy);
    if(r<=1.35){
      const th=Math.atan2(dy,dx);
      if(r<=islandNoise(th,isl.seed)*0.85) return isl;
    }
  }
  return null;
}
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

/* ---------- palettes (shared by 2D raster and cosmos texture) ---------- */
const PALETTES={
satellite:{
  deep:[10,38,74], mid:[15,52,96], shelf:[38,92,140], shallow:[78,140,178],
  plains:[[74,107,58],[93,124,68]], heart:[60,116,60],
  desert:[[217,199,145],[224,207,160]], glass:[232,224,192], salt:[238,234,223],
  snow:[[226,233,238],[240,245,248]], waste:[[90,84,76],[107,98,88]], zark:[[76,68,62],[88,76,66]],
  swamp:[30,45,30], ring:[40,74,38], ridge:[110,106,98], snowcap:[240,244,248],
  badA:[150,96,62], badB:[190,138,92], badCanyon:[92,56,40],
  scar:[16,12,16], lavadot:[255,110,50],
  seaIce:[214,230,240], sahelGreen:[128,146,72], mudflat:[158,142,104], bloom:[122,214,120],
  border:'rgba(255,255,255,0.85)', label:'#ffffff', halo:'rgba(0,0,0,0.65)',
  town:'#ffffff', river:'#3b7fae', sea:'#7fb2d9', route:'#f0dc9a',
  haze:'rgba(212,182,132,', ash:'rgba(120,116,110,',
},
atlas:{
  deep:[153,201,236], mid:[166,211,240], shelf:[176,218,244], shallow:[186,224,248],
  plains:[[205,232,213],[184,222,198]], heart:[178,220,190],
  desert:[[245,241,230],[240,235,220]], glass:[240,236,222], salt:[248,246,240],
  snow:[[232,234,237],[244,245,247]], waste:[[229,225,218],[221,216,208]], zark:[[224,218,210],[216,208,198]],
  swamp:[195,222,204], ring:[164,212,180], ridge:[214,210,203], snowcap:[248,249,250],
  badA:[232,212,192], badB:[222,198,176], badCanyon:[198,172,152],
  scar:[206,200,196], lavadot:[230,150,110],
  seaIce:[236,244,248], sahelGreen:[198,220,158], mudflat:[228,216,192], bloom:[176,232,176],
  border:'#9aa0a6', label:'#3c4043', halo:'rgba(255,255,255,0.85)',
  town:'#5f6368', river:'#8ec7ea', sea:'#6699cc', route:'#b8860b',
  haze:'rgba(226,206,168,', ash:'rgba(190,186,180,',
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
    return {lush:'plains',snow:'snow',sand:'desert',rock:'mountain',pirate:'plains',pillar:'mountain'}[land.isl.kind]||'plains';
  }
  if(lakeAt(x,y)) return 'water';
  for(const fo of FORESTS){
    const dx=(x-fo.x)/fo.rx, dy=(y-fo.y)/fo.ry;
    if(dx*dx+dy*dy<=1) return 'forest';
  }
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

/* ---------- the raster painter ----------
   Fills a W×H RGBA buffer for the world rect [x0,y0]→[x1,y1].
   Sub-rects give LOD tiles and the cosmos continent texture.
   opts: { style, season, waterAlpha (0 for cosmos cut-out) } */
function paintRegion(buf, W, H, x0, y0, x1, y1, opts){
  const style=opts.style||'satellite', season=opts.season==null?1:opts.season;
  const waterAlpha=opts.waterAlpha==null?255:opts.waterAlpha;
  const P=PALETTES[style];
  const snowShift=SEASONPAR.snowShift[season], iceLine=SEASONPAR.iceLine[season];
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
        let depth=1;
        const margin=er/cr;
        if(margin<1.045) depth=0;
        else if(margin<1.10) depth=(margin-1.045)/0.055;
        if(depth>0){
          for(const s of ISLANDS){
            const dx=(x-s.x)/s.rx, dy=(y-s.y)/s.ry;
            const r=Math.sqrt(dx*dx+dy*dy);
            if(r<1.6){ const dd=Math.max(0,(r-1.0)/0.6); depth=Math.min(depth,dd); }
          }
        }
        const dn=n*0.5+0.5;
        if(depth<=0) col=lerpC(P.shelf,P.shallow, dn*0.6);
        else col=lerpC(P.mid,P.deep, Math.min(1,depth*0.7+dn*0.3));
        // seasonal sea ice: the edge moves south in deep winter
        if(y<iceLine+180){
          const f=Math.min(1,Math.max(0,(iceLine+180-y)/360));
          col=lerpC(col,P.seaIce, f*(0.55+dn*0.45));
        }
        alpha=waterAlpha;
      } else {
        let terr;
        if(isl) terr={lush:'plains',snow:'snow',sand:'desert',rock:'ridge',pirate:'plains',pillar:'pillar'}[isl.kind];
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
        let lakeState=null;
        const lk=lakeAt(x,y);
        if(lk) lakeState=lakePixel(x,y,lk,season);
        if(!lakeState){
          for(const ma of MARSHES){
            const dx=(x-ma.x)/ma.rx, dy=(y-ma.y)/ma.ry;
            if(dx*dx+dy*dy<=1){ terr='swamp'; break; }
          }
          if(terr!=='swamp'){
            for(const fo of FORESTS){
              const dx=(x-fo.x)/fo.rx, dy=(y-fo.y)/fo.ry;
              if(dx*dx+dy*dy<=1 && fbm(x*0.006,y*0.006)>0.32){ terr='ring'; break; }
            }
          }
        }
        if(lakeState==='water') col=lerpC(P.shelf,P.shallow,n*0.7);
        else if(lakeState==='toxic') col= style==='satellite' ? [130,160,70] : [200,220,150];
        else if(lakeState==='salt') col=P.salt;
        else if(lakeState==='ice') col=lerpC(P.seaIce,P.snowcap,n*0.6);
        else if(lakeState==='mud') col=lerpC(P.mudflat,P.desert[0],n*0.4);
        else if(terr==='plains') col=lerpC(P.plains[0],P.plains[1],n);
        else if(terr==='heart') col=lerpC(P.heart,P.plains[1],n*0.6);
        else if(terr==='desert'){
          col=lerpC(P.desert[0],P.desert[1],n);
          if(!isl && y>SAHEL_BAND.y0 && y<SAHEL_BAND.y1){
            // the Sahel belt: green-gold in the Greening, bleached in the Long Dust
            const band=Math.sin((y-SAHEL_BAND.y0)/(SAHEL_BAND.y1-SAHEL_BAND.y0)*Math.PI);
            if(green>0) col=lerpC(col,P.sahelGreen, green*band*(0.55+n*0.45));
            if(bleach>0) col=lerpC(col,P.salt, bleach*band*0.6);
          }
        }
        else if(terr==='glass') col=P.glass;
        else if(terr==='salt') col=P.salt;
        else if(terr==='snow') col=lerpC(P.snow[0],P.snow[1],n);
        else if(terr==='waste') col=lerpC(P.waste[0],P.waste[1],n);
        else if(terr==='zark') col=lerpC(P.zark[0],P.zark[1],n);
        else if(terr==='swamp') col=P.swamp;
        else if(terr==='ring') col=lerpC(P.ring,P.plains[0],n*0.4);
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
            col=lerpC(col,P.ridge, t*0.8);
            const elev=t*(0.6+ridge*0.7);
            if(elev>capT) col=lerpC(col,P.snowcap,Math.min(1,(elev-capT)/0.35));
            else col=lerpC(col,[col[0]*0.7,col[1]*0.7,col[2]*0.7], (ridge-0.5)*t);
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

/* ---------- land verification (the __landCheck contract) ---------- */
function landCheck(){
  const bad=[];
  for(const s of SETTLEMENTS){ if(!landAt(s.x,s.y)) bad.push('settlement:'+s.id); }
  for(const g of GATES){ if(!landAt(g.x,g.y)) bad.push('gate:'+g.id); }
  for(const w of WONDERS){ if(w.id!=='drowningpillars'&&!landAt(w.x,w.y)) bad.push('wonder:'+w.id); }
  for(const isl of ISLANDS){ if(!islandAt(isl.x,isl.y)) bad.push('island-center:'+isl.id); }
  for(const rg of RING_GATES){ const[x,y]=ringGatePos(rg.deg); if(!onContinent(x,y)) bad.push('ringgate:'+rg.id); }
  return bad;
}

return { thetaOf, ellipseR, coastRadiusAt, onContinent, islandAt, landAt, angDeg,
  inForestRing, inPoly, distToPath, kingdomAt, lakeAt, MTNFIELD, hash2, vnoise, fbm,
  PALETTES, lerpC, SEASONPAR, HA_POOLS, terrainAt, paintRegion, paintWeather,
  seasonalMult, sampleTerrainSpeeds, fmtDays, nearestGate, computeJourney, landCheck };
})(typeof TDA_DATA !== 'undefined' ? TDA_DATA : require('./data.js'));
if (typeof module !== 'undefined' && module.exports) module.exports = TDA_GEO;
if (typeof globalThis !== 'undefined') globalThis.TDA_GEO = TDA_GEO;
