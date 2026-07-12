/* Measures overlay animation FPS (flows on) and pan responsiveness. */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
const atlas = fileURLToPath(new URL('../Third_Dawn_Definitive_Atlas.html', import.meta.url));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + atlas);
await page.evaluate(() => window.__rasterReady());
await page.evaluate(() => window.__setSeason(2)); // Late: most flows animating
await page.evaluate(() => window.__rasterReady());
// idle-with-flows FPS over 2s
const idleFps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  (function f(){ n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(n/2); })();
}));
// FPS during a continuous drag pan
const dragFps = await page.evaluate(async () => {
  const c = document.getElementById('mapCanvas');
  const r = c.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  c.dispatchEvent(new PointerEvent('pointerdown', {clientX: cx, clientY: cy, pointerId: 1, bubbles: true}));
  let n = 0, done = false;
  (function f(){ n++; if(!done) requestAnimationFrame(f); })();
  const t0 = performance.now();
  let i = 0;
  while (performance.now() - t0 < 2000){
    i++;
    c.dispatchEvent(new PointerEvent('pointermove', {clientX: cx + Math.sin(i/9)*320, clientY: cy + Math.cos(i/11)*180, pointerId: 1, bubbles: true}));
    await new Promise(r2 => requestAnimationFrame(r2));
  }
  done = true;
  c.dispatchEvent(new PointerEvent('pointerup', {clientX: cx, clientY: cy, pointerId: 1, bubbles: true}));
  return n/2;
});
console.log(`idle+flows FPS: ${idleFps.toFixed(0)}   drag-pan FPS: ${dragFps.toFixed(0)}`);
await browser.close();
