/* ============================================================
   RASTER WORKER BODY
   Concatenated after data.js + geo.js into a Blob worker.
   Classifies ~1.75M px per raster off the main thread and posts
   back ImageBitmaps (transferable, zero-copy).
   ============================================================ */
'use strict';
const RW=1500, RH=1167;   // full-world raster
const TW=750, TH=584;     // per-tile pixels; the grid size n comes with each request

function renderRect(W,H,x0,y0,x1,y1,opts){
  const oc=new OffscreenCanvas(W,H);
  const g=oc.getContext('2d');
  const img=g.createImageData(W,H);
  TDA_GEO.paintRegion(img.data,W,H,x0,y0,x1,y1,opts);
  g.putImageData(img,0,0);
  TDA_GEO.paintWeather(g,W,H,x0,y0,x1,y1,opts);
  return oc.transferToImageBitmap();
}

self.onmessage = function(e){
  const m=e.data;
  const W=TDA_DATA.WORLD;
  let bitmap;
  if(m.type==='raster'){
    bitmap=renderRect(RW,RH,0,0,W.w,W.h,{style:m.style,season:m.season});
  } else if(m.type==='ocean'){
    // ITEM 4: the extended ocean — the same painter continued far beyond the
    // world bounds so no seam or edge line ever shows at any zoom
    bitmap=renderRect(m.W,m.H,m.x0,m.y0,m.x1,m.y1,{style:m.style,season:m.season});
  } else if(m.type==='tile'){
    const w=W.w/m.n, h=W.h/m.n;
    bitmap=renderRect(TW,TH, m.tx*w, m.ty*h, (m.tx+1)*w, (m.ty+1)*h, {style:m.style,season:m.season});
  } else if(m.type==='cosmos'){
    // continent texture for the 3D view: same palettes, water cut out
    const pad=1.13;
    bitmap=renderRect(m.size||4096, Math.round((m.size||4096)*(W.b/W.a)),
      W.cx-W.a*pad, W.cy-W.b*pad, W.cx+W.a*pad, W.cy+W.b*pad,
      {style:m.style,season:m.season,waterAlpha:0});
  } else return;
  self.postMessage({id:m.id, type:m.type, style:m.style, season:m.season, n:m.n, tx:m.tx, ty:m.ty, bitmap}, [bitmap]);
};
