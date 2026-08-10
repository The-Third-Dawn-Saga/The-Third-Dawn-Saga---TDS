/* ============================================================================
   budget.mjs  ::  the Part 2 budget check, fast.

   probe.mjs is the full correctness run and takes a long time under a
   software rasteriser because it waits for the terrain queue to drain at
   1920x1080. This is the same draw-call and triangle check at a smaller
   viewport with a fixed settle, for when what you need to know is whether a
   change blew the budget.

   Run: node sunlands-v6/tools/budget.mjs
   ========================================================================= */

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const T={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css'};
const server=createServer(async(q,r)=>{try{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';
const f=join(ROOT,normalize(p).replace(/^(\.\.[/\\])+/,''));const b=await readFile(f);
r.writeHead(200,{'content-type':T[extname(f)]||'application/octet-stream'});r.end(b);}catch{r.writeHead(404);r.end('x');}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:540}});
const errs=[];
page.on('pageerror',e=>errs.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,300));});
await page.goto(`${base}/index.html?dev=1`,{waitUntil:'load'});
await page.waitForFunction(()=>typeof window.__flyTo==='function',null,{timeout:30000});
const views=[['continental',0,120e3,1450e3],['kingdom',0,0,160e3],['regional',0,0,12e3],['street',0,0,600],['ashlands',-1900e3,-100e3,60e3]];
for(const [n,x,z,a] of views){
  await page.evaluate(([x,z,a])=>window.__flyTo(x,z,a),[x,z,a]);
  await page.waitForTimeout(9000);
  const s=await page.evaluate(()=>({...window.__stats(), shadow: window.__shadowStrength(), ash: window.__ashBlend()}));
  console.log(n.padEnd(12),'draws',String(s.draws).padStart(4),'tris',String(Math.round(s.triangles/1000)).padStart(6)+'k',
    'shadow',s.shadow.toFixed(2),'ash',s.ash.toFixed(2), s.draws<900?'OK':'OVER BUDGET');
}
console.log('errors:',errs.length?errs.slice(0,4).join(' | '):'none');
if (errs.length) process.exitCode = 1;
await browser.close();server.close();
