/* ============================================================
   2D LAYERED MAP ENGINE v3
   - raster classification in a Worker (OffscreenCanvas → ImageBitmap)
   - 2-level LOD: full-world raster + lazy 4×4 tile pyramid
   - two stacked canvases: base (raster blit) / overlay (vectors)
   - Path2D geometry cached in world coordinates
   - season wheel drives raster variants + migration flows
   ============================================================ */
(function(){
'use strict';
const D=TDA_DATA, G=TDA_GEO;
const { WORLD, KINGDOMS, FOREST_RING, MOUNTAINS, RIVERS, LAKES, MARSHES, FORESTS,
  SETTLEMENTS, GATES, RING_GATES, WONDERS, HIDDEN, ISLANDS, SEAMARKS, ROUTES,
  BADLANDS, MAELSTROMS, WAR, SEASON_STOPS, SEASON_NAMES, MIGRATIONS,
  SEASON_ACTIVITIES, SEASON_TRAVEL, FLOW_NOTE, coastNoise, ringGatePos } = D;

const DPR=Math.min(2, window.devicePixelRatio||1);
const base=document.getElementById('mapBase');
const bctx=base.getContext('2d');
const canvas=document.getElementById('mapCanvas');
const ctx=canvas.getContext('2d');

let view = { x: WORLD.cx, y: WORLD.cy, scale: 0.12 };
let dragging=false, lastP=null, moved=false;
let measure = { active:false, a:null, b:null };
let selected = null;
let STYLE='satellite';
let SEASON=1; // High
const LAYERS = {
  war:false, borders:true, rivers:true, mountains:true,
  settlements:true, gates:true, wonders:true, routes:true,
  hidden:false, labels:true, migrations:true, activities:true,
};

/* ============================================================
   RASTER SERVICE — Worker with priority queue, main-thread fallback
   ============================================================ */
const RW=1500, RH=1167;
const TILE_LEVELS=[{n:4,minZoom:0.28},{n:8,minZoom:0.75}]; // ≈3000- and 6000-px-equivalent pyramids
const rasterCache=new Map();   // 'style|season' -> ImageBitmap|Canvas
const tileCache=new Map();     // 'style|season|tx|ty' -> ImageBitmap (LRU)
const TILE_CACHE_MAX=40;
const pendingJobs=new Map();   // jobKey -> {job, resolve[]}
const jobQueue=[];             // [{key, job, prio}]
let workerBusy=false, worker=null, workerFailed=false;
const rKey=(s,se)=>s+'|'+se;
const tKey=(s,se,n,tx,ty)=>s+'|'+se+'|'+n+'|'+tx+'|'+ty;

function getWorker(){
  if(worker||workerFailed) return worker;
  try{
    const parts=['src-data','src-geo','src-worker'].map(id=>document.getElementById(id).textContent);
    const blob=new Blob(parts,{type:'text/javascript'});
    worker=new Worker(URL.createObjectURL(blob));
    worker.onmessage=e=>{
      const m=e.data;
      if(m.type==='raster') rasterCache.set(rKey(m.style,m.season), m.bitmap);
      else if(m.type==='tile'){ tileCache.set(tKey(m.style,m.season,m.n,m.tx,m.ty), m.bitmap); trimTiles(); }
      const waiters=pendingJobs.get(m.id)||{resolve:[]};
      pendingJobs.delete(m.id);
      for(const r of waiters.resolve) r(m.bitmap);
      workerBusy=false; pump();
      dirty(true,true);
    };
    worker.onerror=err=>{ console.warn('raster worker failed, falling back to main thread', err.message||err); workerFailed=true; worker=null; workerBusy=false; pump(); };
  }catch(err){ workerFailed=true; worker=null; }
  return worker;
}
function trimTiles(){
  while(tileCache.size>TILE_CACHE_MAX){
    const k=tileCache.keys().next().value;
    const bm=tileCache.get(k); tileCache.delete(k);
    if(bm&&bm.close) bm.close();
  }
}
function submit(jobKey, job, prio){
  if(pendingJobs.has(jobKey)) return new Promise(res=>pendingJobs.get(jobKey).resolve.push(res));
  const entry={resolve:[]}; pendingJobs.set(jobKey,entry);
  const p=new Promise(res=>entry.resolve.push(res));
  jobQueue.push({key:jobKey, job, prio});
  jobQueue.sort((a,b)=>a.prio-b.prio);
  pump();
  return p;
}
function pump(){
  if(workerBusy||!jobQueue.length) return;
  const next=jobQueue.shift();
  const w=getWorker();
  if(w){ workerBusy=true; w.postMessage(Object.assign({id:next.key}, next.job)); }
  else {
    // main-thread fallback (kept async so the UI can breathe)
    setTimeout(()=>{
      const m=next.job;
      const out=renderSync(m);
      if(m.type==='raster') rasterCache.set(rKey(m.style,m.season), out);
      else if(m.type==='tile'){ tileCache.set(tKey(m.style,m.season,m.n,m.tx,m.ty), out); trimTiles(); }
      const waiters=pendingJobs.get(next.key)||{resolve:[]};
      pendingJobs.delete(next.key);
      for(const r of waiters.resolve) r(out);
      dirty(true,true); pump();
    },0);
  }
}
function renderSync(m){
  let W,H,x0,y0,x1,y1,opts={style:m.style,season:m.season};
  if(m.type==='raster'){ W=RW;H=RH;x0=0;y0=0;x1=WORLD.w;y1=WORLD.h; }
  else if(m.type==='tile'){ const tw=WORLD.w/m.n, th=WORLD.h/m.n;
    W=750;H=584;x0=m.tx*tw;y0=m.ty*th;x1=x0+tw;y1=y0+th; }
  else { const pad=1.13; W=m.size||2048; H=Math.round(W*(WORLD.b/WORLD.a));
    x0=WORLD.cx-WORLD.a*pad; y0=WORLD.cy-WORLD.b*pad; x1=WORLD.cx+WORLD.a*pad; y1=WORLD.cy+WORLD.b*pad;
    opts.waterAlpha=0; }
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const g=c.getContext('2d');
  const img=g.createImageData(W,H);
  G.paintRegion(img.data,W,H,x0,y0,x1,y1,opts);
  g.putImageData(img,0,0);
  G.paintWeather(g,W,H,x0,y0,x1,y1,opts);
  return c;
}
function requestRaster(style,season,prio){
  const k=rKey(style,season);
  if(rasterCache.has(k)) return Promise.resolve(rasterCache.get(k));
  return submit('r:'+k, {type:'raster',style,season}, prio==null?1:prio);
}
function requestTile(style,season,n,tx,ty){
  const k=tKey(style,season,n,tx,ty);
  if(tileCache.has(k)) return Promise.resolve(tileCache.get(k));
  return submit('t:'+k, {type:'tile',style,season,n,tx,ty}, 0);
}
/* eager background builds: other style at this season, then the other seasons */
function prebuild(){
  requestRaster(STYLE,SEASON,0).then(()=>{
    const other=STYLE==='satellite'?'atlas':'satellite';
    requestRaster(other,SEASON,5);
    for(let s=0;s<4;s++) if(s!==SEASON) requestRaster(STYLE,s,8);
  });
}
/* the cosmos view asks us for its 4096-wide continent texture */
window.__requestCosmosTexture=function(style,season,size){
  return submit('c:'+style+'|'+season+'|'+size, {type:'cosmos',style,season,size}, 2);
};
window.__rasterReady=function(){ return requestRaster(STYLE,SEASON,0); };

/* ============================================================
   COORDINATES + DIRTY-FLAG DRAW SCHEDULER
   ============================================================ */
function resize(){
  const r=canvas.parentElement.getBoundingClientRect();
  for(const c of [base,canvas]){
    c.width=r.width*DPR; c.height=r.height*DPR;
    c.style.width=r.width+'px'; c.style.height=r.height+'px';
  }
  dirty(true,true);
}
function w2s(x,y){
  return [ (x-view.x)*view.scale*DPR + canvas.width/2,
           (y-view.y)*view.scale*DPR + canvas.height/2 ];
}
function s2w(px,py){
  return [ (px*DPR - canvas.width/2)/(view.scale*DPR) + view.x,
           (py*DPR - canvas.height/2)/(view.scale*DPR) + view.y ];
}
let needBase=false, needOverlay=false, rafQueued=false;
function dirty(b,o){
  needBase=needBase||b; needOverlay=needOverlay||o;
  if(!rafQueued){ rafQueued=true; requestAnimationFrame(frame); }
}
function frame(now){
  rafQueued=false;
  if(needBase){ needBase=false; drawBase(); }
  if(needOverlay){ needOverlay=false; drawOverlay(now); }
  // keep animating while migration flows are on screen
  if(flowsActive() && document.visibilityState!=='hidden' &&
     document.getElementById('viewMap').classList.contains('active')){
    dirty(false,true);
  }
}
function flowsActive(){
  return LAYERS.migrations && MIGRATIONS.some(m=>m.seasons[SEASON]!==undefined);
}

/* ============================================================
   BASE LAYER — raster blit + LOD tiles
   ============================================================ */
function drawBase(){
  const P=G.PALETTES[STYLE];
  bctx.setTransform(1,0,0,1,0,0);
  bctx.fillStyle=`rgb(${P.deep.join(',')})`; bctx.fillRect(0,0,base.width,base.height);
  let bm=rasterCache.get(rKey(STYLE,SEASON));
  if(!bm){
    requestRaster(STYLE,SEASON,0);
    // placeholder: any season of this style, else other style
    for(let s=0;s<4&&!bm;s++) bm=rasterCache.get(rKey(STYLE,s));
    if(!bm) for(const[,v] of rasterCache){ bm=v; break; }
  }
  bctx.imageSmoothingEnabled=true; bctx.imageSmoothingQuality='high';
  const [ox,oy]=w2s(0,0);
  const ww=WORLD.w*view.scale*DPR, wh=WORLD.h*view.scale*DPR;
  if(bm) bctx.drawImage(bm, ox, oy, ww, wh);
  // LOD tile pyramid when zoomed past the base raster's resolution
  const [wx0,wy0]=s2w(0,0), [wx1,wy1]=s2w(canvas.width/DPR,canvas.height/DPR);
  for(const lvl of TILE_LEVELS){
    if(view.scale<=lvl.minZoom) continue;
    const tw=WORLD.w/lvl.n, th=WORLD.h/lvl.n;
    for(let ty=0;ty<lvl.n;ty++) for(let tx=0;tx<lvl.n;tx++){
      const x0=tx*tw,y0=ty*th;
      if(x0>wx1||y0>wy1||x0+tw<wx0||y0+th<wy0) continue;
      const t=tileCache.get(tKey(STYLE,SEASON,lvl.n,tx,ty));
      if(t){
        const p=w2s(x0,y0);
        bctx.drawImage(t, p[0], p[1], tw*view.scale*DPR+1, th*view.scale*DPR+1);
      } else requestTile(STYLE,SEASON,lvl.n,tx,ty);
    }
  }
}

/* ============================================================
   WORLD-SPACE PATH2D CACHES
   ============================================================ */
function smoothPath(path){
  const p=new Path2D();
  p.moveTo(path[0][0],path[0][1]);
  for(let i=1;i<path.length;i++){
    const p0=path[i-1],p1=path[i];
    p.quadraticCurveTo(p0[0],p0[1],(p0[0]+p1[0])/2,(p0[1]+p1[1])/2);
  }
  p.lineTo(path[path.length-1][0],path[path.length-1][1]);
  return p;
}
const PATH_RIVERS=RIVERS.map(r=>({r, p:smoothPath(r.path)}));
const PATH_ROUTES=ROUTES.map(r=>({r, p:smoothPath(r.path)}));
const PATH_KINGDOM=new Map(KINGDOMS.map(k=>{
  const p=new Path2D();
  if(k.shape==='circle') p.ellipse(k.cx,k.cy,k.rx,k.ry,0,0,Math.PI*2);
  else { p.moveTo(k.poly[0][0],k.poly[0][1]);
    for(let i=1;i<k.poly.length;i++) p.lineTo(k.poly[i][0],k.poly[i][1]); p.closePath(); }
  return [k.id,p];
}));
const PATH_LAND=(()=>{
  const p=new Path2D();
  for(let i=0;i<=240;i++){
    const a=i/240*Math.PI*2, c0=coastNoise(a);
    const x=WORLD.cx+Math.cos(a)*WORLD.a*c0, y=WORLD.cy+Math.sin(a)*WORLD.b*c0;
    if(i===0) p.moveTo(x,y); else p.lineTo(x,y);
  }
  p.closePath(); return p;
})();
/* migration flow geometry: cumulative arc lengths per polyline */
const FLOWGEO=new Map();
function flowGeo(path){
  let g=FLOWGEO.get(path);
  if(g) return g;
  const cum=[0];
  for(let i=1;i<path.length;i++) cum.push(cum[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
  g={cum, len:cum[cum.length-1], p2d:smoothPath(path)};
  FLOWGEO.set(path,g);
  return g;
}
function flowPoint(path,g,s){
  const cum=g.cum;
  let i=1; while(i<cum.length-1&&cum[i]<s) i++;
  const t=(s-cum[i-1])/((cum[i]-cum[i-1])||1);
  const x=path[i-1][0]+(path[i][0]-path[i-1][0])*t;
  const y=path[i-1][1]+(path[i][1]-path[i-1][1])*t;
  const ang=Math.atan2(path[i][1]-path[i-1][1],path[i][0]-path[i-1][0]);
  return [x,y,ang];
}
/* world-transform helper: geometry in world units, stroke widths in px */
function withWorld(c,fn){
  c.save();
  const S=view.scale*DPR;
  c.setTransform(S,0,0,S, canvas.width/2-view.x*S, canvas.height/2-view.y*S);
  fn(S);
  c.restore();
}

/* ============================================================
   OVERLAY LAYER — vectors, markers, labels, flows
   ============================================================ */
const SANS='"Roboto","Segoe UI",Arial,Helvetica,sans-serif';
function drawOverlay(now){
  const P=G.PALETTES[STYLE];
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // rivers
  if(LAYERS.rivers){
    withWorld(ctx,S=>{
      for(const {r,p} of PATH_RIVERS){
        ctx.lineWidth=Math.max(1.2,12*view.scale)*DPR/S;
        ctx.lineCap='round';
        ctx.strokeStyle= r.poison ? 'rgba(120,155,70,0.9)' : P.river;
        if(r.underground){ ctx.setLineDash([8*DPR/S,7*DPR/S]); ctx.globalAlpha=0.6; }
        ctx.stroke(p); ctx.setLineDash([]); ctx.globalAlpha=1;
      }
    });
  }

  // kingdom borders (clipped to land)
  if(LAYERS.borders){
    withWorld(ctx,S=>{
      ctx.save(); ctx.clip(PATH_LAND);
      for(const k of KINGDOMS){
        const p=PATH_KINGDOM.get(k.id);
        ctx.strokeStyle=P.border;
        ctx.lineWidth=(selected&&selected.k===k?2.4:1.1)*DPR/S;
        ctx.stroke(p);
        if(selected&&selected.k===k){ ctx.fillStyle='rgba(255,216,106,0.10)'; ctx.fill(p); }
      }
      ctx.restore();
    });
  }

  // War Powers overlay
  if(LAYERS.war){
    withWorld(ctx,S=>{
      ctx.save(); ctx.clip(PATH_LAND);
      for(const bloc of WAR.blocs){
        for(const kid of bloc.kingdoms){
          const p=PATH_KINGDOM.get(kid);
          ctx.fillStyle=bloc.color+'44'; ctx.fill(p);
          ctx.strokeStyle=bloc.color; ctx.lineWidth=2.2*DPR/S; ctx.stroke(p);
        }
      }
      for(const kid of WAR.neutral){
        ctx.fillStyle='rgba(150,150,150,0.15)'; ctx.fill(PATH_KINGDOM.get(kid));
      }
      ctx.restore();
    });
    drawWarLegend();
  }

  // volcano markers
  if(LAYERS.mountains){
    for(const m of MOUNTAINS){
      if(m.id!=='burning'&&m.id!=='serpent') continue;
      for(let i=0;i<m.path.length;i+=2){
        const p=w2s(m.path[i][0],m.path[i][1]);
        ctx.beginPath(); ctx.arc(p[0],p[1],2.6*DPR,0,7);
        ctx.fillStyle=`rgb(${P.lavadot.join(',')})`; ctx.fill();
      }
    }
  }

  // routes
  if(LAYERS.routes){
    withWorld(ctx,S=>{
      for(const {r,p} of PATH_ROUTES){
        ctx.lineCap='round';
        if(r.kind==='road'){ ctx.strokeStyle=P.route; ctx.setLineDash([]); ctx.lineWidth=Math.max(1.6,10*view.scale)*DPR/S; }
        else if(r.kind==='caravan'){ ctx.strokeStyle=P.route; ctx.setLineDash([9*DPR/S,7*DPR/S]); ctx.lineWidth=1.5*DPR/S; }
        else if(r.kind==='sea'){ ctx.strokeStyle=P.sea; ctx.setLineDash([4*DPR/S,7*DPR/S]); ctx.lineWidth=1.5*DPR/S; }
        else { ctx.strokeStyle='rgba(170,110,190,0.85)'; ctx.setLineDash([3*DPR/S,9*DPR/S]); ctx.lineWidth=1.5*DPR/S; }
        ctx.stroke(p);
      }
      ctx.setLineDash([]);
    });
  }

  // seasonal ice-road dash across Deepmere in deep winter
  if(SEASON===3){
    const a=w2s(4510,1110), b=w2s(4690,1190);
    ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]);
    ctx.strokeStyle= STYLE==='satellite'?'rgba(90,110,130,0.9)':'rgba(120,140,160,0.9)';
    ctx.lineWidth=1.6*DPR; ctx.setLineDash([5*DPR,5*DPR]); ctx.stroke(); ctx.setLineDash([]);
    if(LAYERS.labels&&view.scale>0.14) label('ice road',(a[0]+b[0])/2,(a[1]+b[1])/2-8*DPR,9,'rgba(160,185,205,0.9)',true);
  }

  // migration flows
  if(LAYERS.migrations) drawFlows(now||performance.now());
  // seasonal human-activity markers
  if(LAYERS.activities) drawActivities(now||performance.now());

  // hidden world
  if(LAYERS.hidden) drawHidden();

  // gates + ring gates
  if(LAYERS.gates) drawGates();

  // maelstroms & wonders
  if(LAYERS.wonders) drawMaelstroms();
  if(LAYERS.wonders) drawWonders();

  // settlements
  if(LAYERS.settlements) drawSettlements();

  // labels
  if(LAYERS.labels) drawLabels();

  // measure overlay
  if(measure.a){
    const pa=w2s(measure.a.x,measure.a.y);
    pinDot(pa[0],pa[1],'#34a853','A');
    if(measure.b){
      const pb=w2s(measure.b.x,measure.b.y);
      ctx.beginPath(); ctx.moveTo(pa[0],pa[1]); ctx.lineTo(pb[0],pb[1]);
      ctx.strokeStyle= STYLE==='satellite'?'#ffd86a':'#1a73e8';
      ctx.lineWidth=2*DPR; ctx.setLineDash([8*DPR,6*DPR]); ctx.stroke(); ctx.setLineDash([]);
      pinDot(pb[0],pb[1],'#ea4335','B');
    }
  }
  drawScaleBar();
}

function drawFlows(now){
  const t=now*0.001;
  for(const mg of MIGRATIONS){
    const dir=mg.seasons[SEASON];
    if(dir===undefined) continue;
    if(mg.kind==='seabird'){
      // colony density dots at the Gannet Stacks
      const c=mg.cluster, p=w2s(c.x,c.y), R=Math.max(10,c.r*view.scale*DPR);
      for(let i=0;i<26;i++){
        const a=G.hash2(i,3)*Math.PI*2, rr=Math.sqrt(G.hash2(i,11))*R;
        const pulse=0.45+0.4*Math.sin(t*2+i);
        ctx.beginPath(); ctx.arc(p[0]+Math.cos(a)*rr,p[1]+Math.sin(a)*rr*0.75,1.5*DPR,0,7);
        ctx.fillStyle=`rgba(232,238,242,${pulse})`; ctx.fill();
      }
      continue;
    }
    for(const path of mg.paths){
      const g=flowGeo(path);
      if(g.len<1) continue;
      // faint route hint
      withWorld(ctx,S=>{
        ctx.strokeStyle=mg.color; ctx.globalAlpha=0.18;
        ctx.lineWidth=1.2*DPR/S; ctx.setLineDash([4*DPR/S,6*DPR/S]);
        ctx.stroke(g.p2d);
        ctx.setLineDash([]); ctx.globalAlpha=1;
      });
      const n=Math.max(3,Math.round(g.len/200));
      const speed= mg.kind==='recol'? 42 : 85; // world miles per second
      for(let i=0;i<n;i++){
        let s=(t*speed+i*g.len/n)%g.len;
        if(dir<0) s=g.len-s;
        const [x,y,ang0]=flowPoint(path,g,s);
        const ang= dir<0 ? ang0+Math.PI : ang0;
        const p=w2s(x,y);
        const sz=(mg.kind==='whale'?6.5:mg.kind==='herd'||mg.kind==='reindeer'?5.2:4.2)*DPR;
        ctx.save();
        ctx.translate(p[0],p[1]); ctx.rotate(ang);
        ctx.beginPath();
        if(mg.kind==='recol'){ ctx.arc(0,0,sz*0.55,0,7); }
        else { ctx.moveTo(sz,0); ctx.lineTo(-sz*0.7,sz*0.55); ctx.lineTo(-sz*0.4,0); ctx.lineTo(-sz*0.7,-sz*0.55); ctx.closePath(); }
        ctx.fillStyle=mg.color; ctx.globalAlpha=0.95; ctx.fill();
        ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=DPR*0.8; ctx.stroke();
        ctx.restore();
      }
    }
  }
}
function drawActivities(now){
  const t=now*0.001;
  for(const a of SEASON_ACTIVITIES){
    if(!a.seasons.includes(SEASON)) continue;
    const p=w2s(a.x,a.y);
    const pulse=1+0.12*Math.sin(t*2.2+a.x);
    const r=6*DPR*pulse;
    ctx.save();
    ctx.translate(p[0],p[1]); ctx.rotate(Math.PI/4);
    ctx.beginPath(); ctx.rect(-r/1.9,-r/1.9,r*1.05,r*1.05);
    ctx.fillStyle='rgba(201,162,39,0.22)'; ctx.fill();
    ctx.strokeStyle= STYLE==='satellite'?'#e2c268':'#8a6d1c'; ctx.lineWidth=1.4*DPR; ctx.stroke();
    ctx.restore();
    ctx.font=`${9*DPR}px ${SANS}`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle= STYLE==='satellite'?'#f0dc9a':'#7a5f14';
    ctx.fillText(a.glyph,p[0],p[1]);
    if(LAYERS.labels&&view.scale>0.11) label(a.name,p[0],p[1]+15*DPR,9.5, STYLE==='satellite'?'#e2c268':'#8a6d1c', true);
  }
}
function drawHidden(){
  for(const h of HIDDEN){
    const p=w2s(h.x,h.y);
    const purple= STYLE==='satellite' ? '#c99ae0' : '#8b5bb0';
    if(h.icon==='sunken'){
      ctx.beginPath(); ctx.ellipse(p[0],p[1], h.r*view.scale*DPR, h.r*0.7*view.scale*DPR,0.15,0,7);
      ctx.fillStyle='rgba(20,15,40,0.45)'; ctx.fill();
      ctx.strokeStyle=purple; ctx.lineWidth=1.4*DPR; ctx.stroke();
    } else if(h.icon==='watchring'){
      ctx.beginPath(); ctx.ellipse(p[0],p[1], h.r*view.scale*DPR, h.r*0.8*view.scale*DPR,0,0,7);
      ctx.strokeStyle= STYLE==='satellite' ? 'rgba(120,220,170,0.8)' : 'rgba(30,130,80,0.8)';
      ctx.setLineDash([6*DPR,6*DPR]); ctx.lineWidth=1.6*DPR; ctx.stroke(); ctx.setLineDash([]);
      for(let i=0;i<h.towers;i++){
        const a=i/h.towers*Math.PI*2;
        const tx=p[0]+Math.cos(a)*h.r*view.scale*DPR;
        const ty=p[1]+Math.sin(a)*h.r*0.8*view.scale*DPR;
        ctx.fillStyle= STYLE==='satellite' ? '#8fe0b4' : '#1e8250';
        ctx.fillRect(tx-2*DPR,ty-7*DPR,4*DPR,7*DPR);
      }
    } else if(h.icon==='spire'){
      ctx.strokeStyle=purple; ctx.lineWidth=2*DPR;
      ctx.beginPath(); ctx.moveTo(p[0],p[1]+9*DPR); ctx.lineTo(p[0],p[1]-15*DPR); ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0],p[1]-17*DPR,2.4*DPR,0,7); ctx.fillStyle=purple; ctx.fill();
    } else {
      const glyph={camp:'▲',pirate:'☠',rail:'⚙',ruin:'■',crime:'⚔',cult:'۞',swamp:''}[h.icon]||'●';
      if(glyph){
        ctx.font=`${13*DPR}px ${SANS}`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillStyle=purple; ctx.fillText(glyph,p[0],p[1]);
      }
    }
    if(LAYERS.labels && view.scale>0.09 && h.icon!=='watchring' && h.name){
      label(h.name, p[0], p[1]+16*DPR, 10.5, purple);
    }
  }
}
function drawGates(){
  for(const g of GATES){
    const p=w2s(g.x,g.y);
    const on= STYLE==='satellite' ? '#6fd8ff' : '#1a73e8';
    const off='#e05a7a';
    ctx.beginPath(); ctx.arc(p[0],p[1],6.4*DPR,0,7);
    ctx.fillStyle=g.embargo?'rgba(224,90,122,0.2)':(STYLE==='satellite'?'rgba(111,216,255,0.2)':'rgba(26,115,232,0.14)'); ctx.fill();
    ctx.strokeStyle=g.embargo?off:on; ctx.lineWidth=2*DPR; ctx.stroke();
    ctx.beginPath(); ctx.arc(p[0],p[1],2.3*DPR,0,7); ctx.fillStyle=g.embargo?off:on; ctx.fill();
    if(g.embargo){ ctx.beginPath();
      ctx.moveTo(p[0]-5.5*DPR,p[1]+5.5*DPR);
      ctx.lineTo(p[0]+5.5*DPR,p[1]-5.5*DPR);
      ctx.strokeStyle=off; ctx.stroke(); }
  }
  for(const rg of RING_GATES){
    const [x,y]=ringGatePos(rg.deg);
    const p=w2s(x,y);
    const col= STYLE==='satellite' ? '#9fe8bd' : '#188038';
    ctx.strokeStyle=col; ctx.lineWidth=2.2*DPR; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(p[0]-5*DPR,p[1]+5*DPR);
    ctx.lineTo(p[0]-5*DPR,p[1]-1*DPR);
    ctx.arc(p[0],p[1]-1*DPR,5*DPR,Math.PI,0);
    ctx.lineTo(p[0]+5*DPR,p[1]+5*DPR);
    ctx.stroke();
    if(LAYERS.labels && view.scale>0.10) label(rg.name,p[0],p[1]+16*DPR,10, col);
  }
}
function drawMaelstroms(){
  for(const ms of MAELSTROMS){
    const p=w2s(ms.x,ms.y);
    const R0=ms.r*view.scale*DPR;
    const col= ms.vortex ? (STYLE==='satellite'?'#b9a5e8':'#7a5bb8') : (STYLE==='satellite'?'#8fc4e8':'#3b7fae');
    ctx.strokeStyle=col; ctx.lineWidth=1.6*DPR; ctx.lineCap='round';
    ctx.beginPath();
    for(let t=0;t<=2.6*Math.PI*2;t+=0.15){
      const rr=R0*(1-t/(2.6*Math.PI*2))*0.9+R0*0.06;
      const px=p[0]+Math.cos(t)*rr, py=p[1]+Math.sin(t)*rr*0.8;
      t===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
    }
    ctx.stroke();
    if(ms.vortex){
      ctx.beginPath(); ctx.ellipse(p[0],p[1],R0*1.25,R0*1.0,0,0,7);
      ctx.strokeStyle='rgba(220,225,235,0.55)'; ctx.setLineDash([3*DPR,5*DPR]);
      ctx.lineWidth=3*DPR; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle= STYLE==='satellite' ? '#d8cdf2' : '#6a4ba8';
      for(let i=0;i<3;i++){
        const ix=p[0]+(i-1)*R0*0.34, iy=p[1]-R0*(0.35+0.12*((i*7)%3));
        ctx.beginPath(); ctx.ellipse(ix,iy,R0*0.14,R0*0.06,0,0,7); ctx.fill();
      }
    }
    if(LAYERS.labels && view.scale>0.07)
      label(ms.name,p[0],p[1]+R0+12*DPR,10.5, col, true);
  }
}
function drawWonders(){
  for(const w of WONDERS){
    const p=w2s(w.x,w.y);
    if(w.id==='worldtree'){
      const h=Math.max(16, 200*view.scale)*DPR;
      ctx.strokeStyle='#7a5a34'; ctx.lineWidth=Math.max(2.4,h*0.09);
      ctx.beginPath(); ctx.moveTo(p[0],p[1]); ctx.lineTo(p[0],p[1]-h); ctx.stroke();
      const cg=ctx.createRadialGradient(p[0],p[1]-h,1,p[0],p[1]-h,h*0.66);
      cg.addColorStop(0,'rgba(120,235,150,0.95)'); cg.addColorStop(1,'rgba(40,140,70,0.12)');
      ctx.beginPath(); ctx.arc(p[0],p[1]-h,h*0.6,0,7); ctx.fillStyle=cg; ctx.fill();
    } else {
      ctx.font=`${13*DPR}px ${SANS}`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle= STYLE==='satellite' ? '#f0dc9a' : '#b06000';
      const glyph={glass:'✦',peak:'▲',arena:'◎',under:'☗',cliffs:'≈',pillars:'‖',scar:'✖',road:'≡',float:'♒'}[w.icon]||'✦';
      ctx.fillText(glyph,p[0],p[1]);
    }
  }
}
function drawSettlements(){
  for(const s of SETTLEMENTS){
    const p=w2s(s.x,s.y);
    const townCol='#ffffff';
    const townEdge= STYLE==='satellite' ? 'rgba(0,0,0,0.7)' : '#6b7075';
    if(s.type==='capital'){
      ctx.beginPath(); ctx.arc(p[0],p[1],5.4*DPR,0,7);
      ctx.fillStyle=townCol; ctx.fill();
      ctx.lineWidth=2*DPR; ctx.strokeStyle=townEdge; ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0],p[1],2.1*DPR,0,7);
      ctx.fillStyle=townEdge; ctx.fill();
    } else {
      const r=(s.type==='vassal'||s.type==='town')?3.6:(s.type==='village'?2.8:3);
      if(s.type==='site'){
        ctx.fillStyle=townCol; ctx.strokeStyle=townEdge; ctx.lineWidth=DPR;
        ctx.beginPath(); ctx.rect(p[0]-2.8*DPR,p[1]-2.8*DPR,5.6*DPR,5.6*DPR);
        ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p[0],p[1],r*DPR,0,7);
        ctx.fillStyle=townCol; ctx.fill();
        ctx.strokeStyle=townEdge; ctx.lineWidth=DPR; ctx.stroke();
      }
    }
  }
}
function centroid(poly){ let x=0,y=0; for(const p of poly){x+=p[0];y+=p[1];} return [x/poly.length,y/poly.length]; }
function drawLabels(){
  ctx.textAlign='center';
  for(const k of KINGDOMS){
    const c=k.shape==='circle'?[k.cx,k.cy]:centroid(k.poly);
    const p=w2s(c[0],c[1]);
    const size=Math.min(22,Math.max(11,150*view.scale));
    ctx.font=`500 ${size*DPR}px ${SANS}`;
    const col= STYLE==='satellite' ? 'rgba(255,255,255,0.92)' : 'rgba(80,86,92,0.95)';
    halo(k.name.toUpperCase(),p[0],p[1]-8*DPR,col);
  }
  if(view.scale>0.075){
    for(const s of SETTLEMENTS){
      if(view.scale<0.11 && (s.type==='village'||s.type==='site')) continue;
      if(view.scale<0.16 && s.type==='site') continue;
      const p=w2s(s.x,s.y);
      const size=s.type==='capital'?12.5:10.5;
      label(s.name,p[0],p[1]+14*DPR,size, s.type==='capital'
        ? (STYLE==='satellite'?'#ffffff':'#202124')
        : (STYLE==='satellite'?'rgba(255,255,255,0.95)':'#5f6368'));
    }
    for(const w of WONDERS){
      if(w.id==='worldtree') continue;
      const p=w2s(w.x,w.y);
      label(w.name,p[0],p[1]-13*DPR,10, STYLE==='satellite'?'#f0dc9a':'#b06000', true);
    }
    for(const m of MOUNTAINS){
      const mid=m.path[Math.floor(m.path.length/2)];
      const p=w2s(mid[0],mid[1]);
      label(m.name,p[0],p[1]-6*DPR,10.5, STYLE==='satellite'?'rgba(225,229,235,0.95)':'#80868b', true);
    }
  }
  for(const isl of ISLANDS){
    if(!isl.name) continue;
    const p=w2s(isl.x,isl.y);
    label(isl.name,p[0],p[1]+ (isl.ry*view.scale+12)*DPR, 10.5,
      STYLE==='satellite'?'rgba(255,255,255,0.92)':'#5f6368');
  }
  if(view.scale>0.075){
    for(const lk of LAKES){
      let nm=lk.name;
      if(lk.id==='faros'&&SEASON>=2) nm+=' (salt)';
      const p=w2s(lk.x,lk.y);
      label(nm,p[0],p[1],9.5, STYLE==='satellite'?'rgba(160,205,235,0.95)':'#4a7fae', true);
    }
    for(const ma of MARSHES){
      const p=w2s(ma.x,ma.y);
      label(ma.name,p[0],p[1],9.5, STYLE==='satellite'?'rgba(170,215,185,0.9)':'#3f7a5a', true);
    }
    for(const fo of FORESTS){
      const p=w2s(fo.x,fo.y);
      label(fo.name,p[0],p[1],10, STYLE==='satellite'?'rgba(150,215,165,0.9)':'#2e7d4f', true);
    }
  }
  for(const s of SEAMARKS){
    const p=w2s(s.x,s.y);
    ctx.save(); ctx.translate(p[0],p[1]); if(s.rot) ctx.rotate(s.rot*Math.PI/180);
    ctx.font=`italic ${(s.sea?14:11)*DPR}px ${SANS}`;
    ctx.fillStyle= STYLE==='satellite' ? 'rgba(140,180,215,0.9)' : 'rgba(90,140,190,0.95)';
    ctx.textAlign='center'; ctx.fillText(s.name,0,0); ctx.restore();
  }
  if(view.scale>0.07){
    const bp=w2s(2900,4500);
    label('THE RED REACHES',bp[0],bp[1],11, STYLE==='satellite'?'rgba(226,170,130,0.95)':'#a05a30', true);
  }
  const frp=w2s(WORLD.cx, WORLD.cy-WORLD.b*0.91*coastNoise(-Math.PI/2));
  label('ELVEN FOREST RING', frp[0], frp[1], 11.5, STYLE==='satellite'?'rgba(150,230,175,0.95)':'#188038', true);
}
function drawWarLegend(){
  const lx=canvas.width-320*DPR, ly=18*DPR, lw=300*DPR;
  ctx.fillStyle='rgba(7,15,26,0.88)'; ctx.strokeStyle='rgba(200,180,120,0.5)';
  ctx.beginPath(); ctx.rect(lx,ly,lw,118*DPR); ctx.fill(); ctx.stroke();
  ctx.textAlign='left'; ctx.font=`700 ${11*DPR}px ${SANS}`;
  ctx.fillStyle='#e8d9a0'; ctx.fillText('WAR POWERS',lx+12*DPR,ly+18*DPR);
  let yy=ly+36*DPR;
  for(const bloc of WAR.blocs){
    ctx.fillStyle=bloc.color; ctx.fillRect(lx+12*DPR,yy-8*DPR,10*DPR,10*DPR);
    ctx.font=`${10.5*DPR}px ${SANS}`; ctx.fillStyle='#e9e2cc';
    ctx.fillText(bloc.name,lx+28*DPR,yy);
    yy+=16*DPR;
  }
  ctx.fillStyle='rgba(150,150,150,0.8)'; ctx.fillRect(lx+12*DPR,yy-8*DPR,10*DPR,10*DPR);
  ctx.font=`${10.5*DPR}px ${SANS}`; ctx.fillStyle='#b9ac86';
  ctx.fillText('Neutral: Heartlands, Vaelthorne, Zar’kaine (+ elves)',lx+28*DPR,yy);
  yy+=18*DPR;
  ctx.font=`italic ${9.5*DPR}px ${SANS}`; ctx.fillStyle='#c9a227';
  ctx.fillText('Verdict: the Northern Bloc, by attrition.',lx+12*DPR,yy);
  ctx.fillStyle='#8a94a2'; ctx.font=`italic ${9*DPR}px ${SANS}`;
  ctx.fillText('Click any kingdom for its war profile.',lx+12*DPR,yy+14*DPR);
}
function halo(text,x,y,fill){
  const P=G.PALETTES[STYLE];
  ctx.lineWidth=3*DPR; ctx.strokeStyle=P.halo; ctx.lineJoin='round';
  ctx.strokeText(text,x,y); ctx.fillStyle=fill; ctx.fillText(text,x,y);
}
function label(text,x,y,size,fill,italic){
  ctx.font=`${italic?'italic ':''}${size*DPR}px ${SANS}`;
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  halo(text,x,y,fill);
}
function pinDot(x,y,color,l){
  ctx.beginPath(); ctx.arc(x,y,8*DPR,0,7); ctx.fillStyle=color; ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=2*DPR; ctx.stroke();
  ctx.fillStyle='#fff'; ctx.font=`700 ${10*DPR}px ${SANS}`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(l,x,y);
}
function drawScaleBar(){
  const targetPx=140*DPR;
  let miles=targetPx/(view.scale*DPR);
  const nice=[10,25,50,100,250,500,1000,2000,4000];
  miles=nice.reduce((a,b)=>Math.abs(b-miles)<Math.abs(a-miles)?b:a);
  const px=miles*view.scale*DPR;
  const x=20*DPR,y=canvas.height-26*DPR;
  const col= STYLE==='satellite'?'#e8dcb0':'#5f6368';
  ctx.strokeStyle=col; ctx.lineWidth=2*DPR;
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+px,y);
  ctx.moveTo(x,y-5*DPR); ctx.lineTo(x,y+5*DPR);
  ctx.moveTo(x+px,y-5*DPR); ctx.lineTo(x+px,y+5*DPR); ctx.stroke();
  ctx.fillStyle=col; ctx.font=`${11*DPR}px ${SANS}`; ctx.textAlign='left';
  ctx.fillText(miles+' miles',x,y-9*DPR);
}

/* ============================================================
   TRAVEL CALCULATOR (season-aware; modifiers flagged PROPOSED)
   ============================================================ */
function showJourney(a,b){
  const j=G.computeJourney(a,b,SEASON);
  const el=document.getElementById('journeyResult');
  let html=`<div class="jr-head">${nearestFeatureName(a)} → ${nearestFeatureName(b)}<span>${Math.round(j.straight)} miles direct · ${SEASON_STOPS[SEASON].label} season</span></div>`;
  for(const r of j.out) html+=`<div class="jr-row"><b>${r.mode}</b><em>${r.time}</em><small>${r.detail}</small></div>`;
  if(j.seasonNote) html+=`<div class="jr-season">${j.seasonNote}</div>`;
  el.innerHTML=html; el.classList.add('open');
}
function nearestFeatureName(pt){
  let best=null,bd=1e18;
  for(const s of SETTLEMENTS){ const d=Math.hypot(s.x-pt.x,s.y-pt.y); if(d<bd){bd=d;best=s.name;} }
  if(bd<60) return best;
  const k=G.kingdomAt(pt.x,pt.y);
  return k?'point in '+k.name:'point at sea';
}

/* ============================================================
   HIT TESTING + INFO PANEL
   ============================================================ */
function featureAt(wx,wy){
  const tol=14/view.scale;
  const pools=[];
  if(LAYERS.settlements) pools.push(...SETTLEMENTS.map(s=>({x:s.x,y:s.y,kind:'settlement',o:s})));
  if(LAYERS.gates){
    pools.push(...GATES.map(g=>({x:g.x,y:g.y,kind:'gate',o:g})));
    pools.push(...RING_GATES.map(rg=>{const[x,y]=ringGatePos(rg.deg);return{x,y,kind:'ringgate',o:rg};}));
  }
  if(LAYERS.wonders) pools.push(...WONDERS.map(w=>({x:w.x,y:w.y,kind:'wonder',o:w})));
  if(LAYERS.hidden) pools.push(...HIDDEN.filter(h=>h.icon!=='watchring').map(h=>({x:h.x,y:h.y,kind:'hidden',o:h})));
  if(LAYERS.activities) pools.push(...SEASON_ACTIVITIES.filter(a=>a.seasons.includes(SEASON)).map(a=>({x:a.x,y:a.y,kind:'activity',o:a})));
  let best=null,bd=1e18;
  for(const f of pools){ const d=Math.hypot(f.x-wx,f.y-wy); if(d<bd){bd=d;best=f;} }
  if(best&&bd<tol) return best;
  if(LAYERS.migrations){
    for(const mg of MIGRATIONS){
      if(mg.seasons[SEASON]===undefined) continue;
      if(mg.cluster && Math.hypot(wx-mg.cluster.x,wy-mg.cluster.y)<mg.cluster.r*1.2) return {kind:'migration',o:mg};
      for(const path of mg.paths){ if(G.distToPath(wx,wy,path)<tol*0.9) return {kind:'migration',o:mg}; }
    }
  }
  for(const ms of MAELSTROMS){
    if(Math.hypot(wx-ms.x,wy-ms.y)<ms.r*1.3) return {kind:'maelstrom',o:ms};
  }
  const isl=G.islandAt(wx,wy);
  if(isl){ const named = isl.name ? isl : ISLANDS.find(s=>s.name && s.id.replace(/\d+$/,'')===isl.id.replace(/\d+$/,'')) || isl;
    return {kind:'island',o:named}; }
  if(LAYERS.hidden){ for(const h of HIDDEN){ if(h.r&&Math.hypot(h.x-wx,h.y-wy)<h.r) return {kind:'hidden',o:h}; } }
  const lk=G.lakeAt(wx,wy);
  if(lk) return {kind:'lake',o:lk};
  for(const fo of FORESTS){
    const dx=(wx-fo.x)/fo.rx, dy=(wy-fo.y)/fo.ry;
    if(dx*dx+dy*dy<=1) return {kind:'forest',o:fo};
  }
  for(const ma of MARSHES){
    const dx=(wx-ma.x)/ma.rx, dy=(wy-ma.y)/ma.ry;
    if(dx*dx+dy*dy<=1) return {kind:'marsh',o:ma};
  }
  if(G.onContinent(wx,wy)&&G.inPoly(wx,wy,BADLANDS.poly)) return {kind:'badlands',o:BADLANDS};
  if(G.onContinent(wx,wy)&&G.inForestRing(wx,wy)) return {kind:'ring',o:FOREST_RING};
  if(G.onContinent(wx,wy)){
    for(const m of MOUNTAINS){ if(G.distToPath(wx,wy,m.path)<110) return {kind:'mountain',o:m}; }
    const k=G.kingdomAt(wx,wy);
    if(k) return {kind:'kingdom',o:k};
  }
  return null;
}
function zoneLabel(zone){
  return {sahel:'Sunlands sahel', monsoon:'Jade rivers', taiga:'Northern taiga',
    maritime:'Albion seas', alpine:'Imperium alps', volcanic:'Volcanic zones'}[zone]||zone;
}
function showInfo(f){
  const panel=document.getElementById('infoPanel');
  if(!f){ panel.classList.remove('open'); selected=null; dirty(false,true); return; }
  let h='';
  let fly=null;
  if(f.kind==='kingdom'){
    const k=f.o; selected={k};
    const c=k.shape==='circle'?[k.cx,k.cy]:centroid(k.poly);
    fly={x:c[0],y:c[1],name:k.name};
    h=`<div class="ip-kicker">GREAT KINGDOM</div><h2>${k.name}</h2>
       <div class="ip-grid">
         <div><label>Capital</label>${k.capital}</div><div><label>Population</label>${k.pop}</div>
         <div><label>Territory</label>${k.territory}</div><div><label>Age</label>${k.age}</div>
       </div>
       <div class="ip-sect"><label>Ruler</label>${k.ruler}</div>
       <div class="ip-sect"><label>Why it is powerful</label>${k.power}</div>
       <div class="ip-sect"><label>Notes</label>${k.facts}</div>`;
    if(LAYERS.war && WAR.profiles[k.id]){
      const pr=WAR.profiles[k.id];
      const bloc=WAR.blocs.find(b=>b.kingdoms.includes(k.id));
      h+=`<div class="ip-sect" style="border-top:1px solid #22344a;padding-top:9px"><label>War profile ${bloc?'— '+bloc.name:'— Neutral'}</label>
          <b>Strength:</b> ${pr.strength}.<br><b>Key asset:</b> ${pr.asset}.<br><b>Fatal flaw:</b> ${pr.weakness}.</div>`;
      if(bloc) h+=`<div class="ip-sect"><label>Bloc position</label>${bloc.note}</div>`;
      h+=`<div class="ip-sect"><label>Verdict</label>${WAR.verdict}</div>`;
    }
  } else if(f.kind==='settlement'){
    fly={x:f.o.x,y:f.o.y,name:f.o.name};
    h=`<div class="ip-kicker">${f.o.type.toUpperCase()}</div><h2>${f.o.name}</h2>
       <div class="ip-grid"><div><label>Population</label>${f.o.pop}</div></div>
       <div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='gate'){
    fly={x:f.o.x,y:f.o.y,name:f.o.name};
    h=`<div class="ip-kicker">AETHERIC GATE${f.o.embargo?' — EMBARGO':''}</div><h2>${f.o.name}</h2>
       <div class="ip-sect">${f.o.note}</div>
       <div class="ip-sect"><label>Transit</label>Aetherial Stream: ~10–15 minutes typical; up to ~90 minutes for a full north–south crossing. Papers, screening and fees required. Gate denial is a step below a declaration of war.</div>`;
  } else if(f.kind==='ringgate'){
    const[x,y]=ringGatePos(f.o.deg); fly={x,y,name:f.o.name};
    h=`<div class="ip-kicker">ELVEN RING GATE</div><h2>${f.o.name}</h2><div class="ip-sect">${f.o.info}</div>
       <div class="ip-sect"><label>Passage</label>The elves levy fees, inspect cargo, and can close any gate during disputes — some have been shut for centuries over grievances. Albion Magna’s naval supremacy depends on their tolerance.</div>`;
  } else if(f.kind==='island'){
    if(f.o.x!=null) fly={x:f.o.x,y:f.o.y,name:f.o.name};
    h=`<div class="ip-kicker">ISLAND</div><h2>${f.o.name||'Unnamed islet'}</h2><div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='wonder'){
    fly={x:f.o.x,y:f.o.y,name:f.o.name};
    h=`<div class="ip-kicker">WONDER</div><h2>${f.o.name}</h2><div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='hidden'){
    fly={x:f.o.x,y:f.o.y,name:f.o.name};
    h=`<div class="ip-kicker">HIDDEN WORLD</div><h2>${f.o.name}</h2><div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='maelstrom'){
    fly={x:f.o.x,y:f.o.y,name:f.o.name};
    h=`<div class="ip-kicker">${f.o.vortex?'THE GREAT VORTICES':'MAELSTROM'}</div><h2>${f.o.name}</h2><div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='lake'){
    fly={x:f.o.x,y:f.o.y,name:f.o.name};
    let seas='';
    if(f.o.id==='faros') seas=`<div class="ip-sect"><label>This season</label>${SEASON>=2?'Dry: a salt pan under the Long Dust — the camps are working.':'Full: the Greening has raised the underground river.'}</div>`;
    if(f.o.id==='hundredautumns'&&SEASON===3) seas=`<div class="ip-sect"><label>This season</label>Shrunk to its hundred pools; the cranes are here, and so are the festivals.</div>`;
    if(f.o.id==='deepmere'&&SEASON===3) seas=`<div class="ip-sect"><label>This season</label>Frozen solid: the Volok Haulers are dragging longships across the ice road.</div>`;
    h=`<div class="ip-kicker">LAKE</div><h2>${f.o.name}</h2><div class="ip-sect">${f.o.info}</div>${seas}`;
  } else if(f.kind==='forest'){
    fly={x:f.o.x,y:f.o.y,name:f.o.name};
    h=`<div class="ip-kicker">FOREST</div><h2>${f.o.name}</h2><div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='marsh'){
    h=`<div class="ip-kicker">MARSH</div><h2>${f.o.name}</h2><div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='badlands'){
    h=`<div class="ip-kicker">WASTELAND</div><h2>${f.o.name}</h2><div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='mountain'){
    const mid=f.o.path[Math.floor(f.o.path.length/2)];
    fly={x:mid[0],y:mid[1],name:f.o.name};
    h=`<div class="ip-kicker">RANGE</div><h2>${f.o.name}</h2><div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='ring'){
    h=`<div class="ip-kicker">THE RING</div><h2>${f.o.name}</h2>
       <div class="ip-grid"><div><label>Population</label>${f.o.pop}</div><div><label>Width</label>${f.o.width}</div></div>
       <div class="ip-sect">${f.o.info}</div>`;
  } else if(f.kind==='migration'){
    const mg=f.o;
    const localName=SEASON_NAMES[mg.zone]?SEASON_NAMES[mg.zone][SEASON]:'';
    h=`<div class="ip-kicker">MIGRATION — ${zoneLabel(mg.zone).toUpperCase()}</div><h2>${mg.name}</h2>
       <div class="ip-grid"><div><label>Season</label>${localName}</div><div><label>Wheel</label>${SEASON_STOPS[SEASON].label}</div></div>
       <div class="ip-sect">${mg.info}</div>
       <div class="ip-sect"><label>Flow</label>${FLOW_NOTE}</div>`;
  } else if(f.kind==='activity'){
    const a=f.o;
    fly={x:a.x,y:a.y,name:a.name};
    const localName=SEASON_NAMES[a.zone]?SEASON_NAMES[a.zone][SEASON]:'';
    h=`<div class="ip-kicker">SEASONAL ACTIVITY — ${zoneLabel(a.zone).toUpperCase()}</div><h2>${a.name}</h2>
       <div class="ip-grid"><div><label>Season</label>${localName}</div><div><label>Wheel</label>${SEASON_STOPS[SEASON].label}</div></div>
       <div class="ip-sect">${a.info}</div>`;
  }
  if(fly) h+=`<button class="toolBtn ip-fly" id="ipFly">✦ Fly there in the Cosmos view</button>`;
  const body=panel.querySelector('.ip-body');
  body.innerHTML=h;
  if(fly){
    body.querySelector('#ipFly').addEventListener('click',()=>{
      if(window.__flyToFeature) window.__flyToFeature(fly);
    });
  }
  panel.classList.add('open');
  dirty(false,true);
}

/* ============================================================
   EVENTS + CONTROLS
   ============================================================ */
canvas.addEventListener('pointerdown',e=>{dragging=true;moved=false;lastP=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
  if(!dragging) return;
  const dx=e.clientX-lastP[0],dy=e.clientY-lastP[1];
  if(Math.abs(dx)+Math.abs(dy)>3) moved=true;
  view.x-=dx/view.scale; view.y-=dy/view.scale;
  lastP=[e.clientX,e.clientY]; dirty(true,true);
});
canvas.addEventListener('pointerup',e=>{
  dragging=false;
  if(moved) return;
  const rect=canvas.getBoundingClientRect();
  const [wx,wy]=s2w(e.clientX-rect.left,e.clientY-rect.top);
  if(measure.active){
    if(!measure.a) measure.a={x:wx,y:wy};
    else if(!measure.b){ measure.b={x:wx,y:wy}; showJourney(measure.a,measure.b); }
    else { measure={active:true,a:{x:wx,y:wy},b:null}; document.getElementById('journeyResult').classList.remove('open'); }
    dirty(false,true); return;
  }
  showInfo(featureAt(wx,wy));
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const rect=canvas.getBoundingClientRect();
  const [wx,wy]=s2w(e.clientX-rect.left,e.clientY-rect.top);
  view.scale=Math.min(2.2,Math.max(0.045,view.scale*Math.exp(-e.deltaY*0.0012)));
  const [nwx,nwy]=s2w(e.clientX-rect.left,e.clientY-rect.top);
  view.x+=wx-nwx; view.y+=wy-nwy;
  dirty(true,true);
},{passive:false});

document.querySelectorAll('#layerRail input[type=checkbox]').forEach(cb=>{
  cb.addEventListener('change',()=>{LAYERS[cb.dataset.layer]=cb.checked;dirty(false,true);});
});
document.querySelectorAll('.styleBtn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    STYLE=btn.dataset.style;
    document.querySelectorAll('.styleBtn').forEach(b=>b.classList.toggle('on',b===btn));
    prebuild(); dirty(true,true);
  });
});
function setSeason(s){
  SEASON=s;
  document.querySelectorAll('.seasonBtn').forEach(b=>b.classList.toggle('on',+b.dataset.season===s));
  updateSeasonCal();
  prebuild();
  if(measure.a&&measure.b) showJourney(measure.a,measure.b);
  if(window.__cosmosSeason) window.__cosmosSeason(s);
  dirty(true,true);
}
document.querySelectorAll('.seasonBtn').forEach(btn=>{
  btn.addEventListener('click',()=>setSeason(+btn.dataset.season));
});
function updateSeasonCal(){
  const el=document.getElementById('seasonCal');
  el.innerHTML=Object.keys(SEASON_NAMES).map(z=>`<b>${zoneLabel(z)}</b> — ${SEASON_NAMES[z][SEASON]}`).join('<br>');
  document.getElementById('seasonNote').textContent='Every zone reads the wheel through its own calendar. '+FLOW_NOTE;
}
document.getElementById('btnMeasure').addEventListener('click',function(){
  measure.active=!measure.active;
  if(!measure.active){measure.a=measure.b=null;document.getElementById('journeyResult').classList.remove('open');}
  this.classList.toggle('on',measure.active);
  canvas.style.cursor=measure.active?'crosshair':'grab';
  dirty(false,true);
});
document.getElementById('btnZoomIn').addEventListener('click',()=>{view.scale=Math.min(2.2,view.scale*1.4);dirty(true,true);});
document.getElementById('btnZoomOut').addEventListener('click',()=>{view.scale=Math.max(0.045,view.scale/1.4);dirty(true,true);});
document.getElementById('btnHome').addEventListener('click',()=>{view={x:WORLD.cx,y:WORLD.cy,scale:0.12};dirty(true,true);});
document.querySelector('#infoPanel .ip-close').addEventListener('click',()=>showInfo(null));
document.querySelectorAll('.quickJ').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const A=SETTLEMENTS.find(s=>s.id===btn.dataset.a),B=SETTLEMENTS.find(s=>s.id===btn.dataset.b);
    measure.active=true;document.getElementById('btnMeasure').classList.add('on');
    measure.a={x:A.x,y:A.y};measure.b={x:B.x,y:B.y};
    showJourney(measure.a,measure.b);dirty(false,true);
  });
});
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') dirty(false,true); });

/* ---------- test hooks (contract preserved) ---------- */
window.__landCheck=G.landCheck;
window.__setStyle=function(s){STYLE=s;
  document.querySelectorAll('.styleBtn').forEach(b=>b.classList.toggle('on',b.dataset.style===s));
  prebuild();dirty(true,true);};
window.__setSeason=setSeason;
window.__getSeason=function(){return SEASON;};
window.__journey=function(aId,bId,season){
  const A=SETTLEMENTS.find(s=>s.id===aId),B=SETTLEMENTS.find(s=>s.id===bId);
  return G.computeJourney({x:A.x,y:A.y},{x:B.x,y:B.y},season==null?SEASON:season);
};
window.__mapResize=resize;
window.__tilesReady=function(){
  // resolves when every tile currently visible at this view is cached (test hook)
  const [wx0,wy0]=s2w(0,0), [wx1,wy1]=s2w(canvas.width/DPR,canvas.height/DPR);
  const wants=[];
  for(const lvl of TILE_LEVELS){
    if(view.scale<=lvl.minZoom) continue;
    const tw=WORLD.w/lvl.n, th=WORLD.h/lvl.n;
    for(let ty=0;ty<lvl.n;ty++) for(let tx=0;tx<lvl.n;tx++){
      const x0=tx*tw,y0=ty*th;
      if(x0>wx1||y0>wy1||x0+tw<wx0||y0+th<wy0) continue;
      wants.push(requestTile(STYLE,SEASON,lvl.n,tx,ty));
    }
  }
  return Promise.all(wants).then(()=>{ dirty(true,true); return tileCache.size; });
};
window.__rasterStats=function(){
  return { rasters:[...rasterCache.keys()], tiles:[...tileCache.keys()], queue:jobQueue.length, worker:!!worker };
};

updateSeasonCal();
window.addEventListener('resize',resize);
resize();
prebuild();
})();
