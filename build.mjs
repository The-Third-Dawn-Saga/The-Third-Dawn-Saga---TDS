/* ============================================================
   BUILD — assembles src/ into ONE self-contained offline HTML.
   esbuild syntax-checks + minifies each module (identifiers kept,
   so the worker-shared globals and canon strings survive intact).
   Emits: Third_Dawn_Definitive_Atlas.html + index.html (identical).
   Usage: node build.mjs [--no-minify]
   ============================================================ */
import { readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const MINIFY = !process.argv.includes('--no-minify');

function js(path){
  const src = readFileSync(new URL(path, import.meta.url), 'utf8');
  const out = transformSync(src, {
    loader: 'js',
    minifyWhitespace: MINIFY,
    minifySyntax: MINIFY,
    minifyIdentifiers: false,   // globals bridge modules + worker; canon strings untouched
    charset: 'utf8',
    legalComments: 'none',
  }).code;
  // keep inline <script> bodies HTML-safe
  return out.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

const template = readFileSync(new URL('./src/template.html', import.meta.url), 'utf8');
const three = readFileSync(new URL('./src/vendor/three.min.js', import.meta.url), 'utf8');

const data   = js('./src/data.js');
const geo    = js('./src/geo.js');
const worker = js('./src/map.worker.js');
const map    = js('./src/map.js');
const cosmos = js('./src/cosmos.js');
const shell  = js('./src/shell.js');

/* data + geo execute on the main thread AND are re-read as text
   (by id) to assemble the raster Worker's Blob — one copy, two uses. */
const html = template
  .replace('<!--THREE-->',  ()=>`<script>\n${three}\n</script>`)
  .replace('<!--DATA-->',   ()=>`<script id="src-data">${data}</script>`)
  .replace('<!--GEO-->',    ()=>`<script id="src-geo">${geo}</script>`)
  .replace('<!--WORKER-->', ()=>`<script type="text/js-worker" id="src-worker">${worker}</script>`)
  .replace('<!--MAP-->',    ()=>`<script>${map}</script>`)
  .replace('<!--COSMOS-->', ()=>`<script>${cosmos}</script>`)
  .replace('<!--SHELL-->',  ()=>`<script>${shell}</script>`);

for (const out of ['Third_Dawn_Definitive_Atlas.html', 'index.html']){
  writeFileSync(new URL('./'+out, import.meta.url), html);
}
console.log(`built ${(html.length/1024).toFixed(0)} KB → Third_Dawn_Definitive_Atlas.html, index.html (minify=${MINIFY})`);
