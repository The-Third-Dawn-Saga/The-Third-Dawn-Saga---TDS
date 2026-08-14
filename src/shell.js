/* mode switching + cross-view glue */
(function(){
'use strict';
const tabs={cosmos:document.getElementById('tabCosmos'), map:document.getElementById('tabMap')};
const views={cosmos:document.getElementById('viewCosmos'), map:document.getElementById('viewMap')};
function go(m){
  for(const k in tabs){ tabs[k].classList.toggle('active',k===m); views[k].classList.toggle('active',k===m); }
  document.getElementById('infoPanel').classList.remove('open');
  if(m==='cosmos'){ window.__cosmosStart&&window.__cosmosStart(); }
  else { window.__cosmosStop&&window.__cosmosStop(); window.__mapResize&&window.__mapResize(); }
}
tabs.cosmos.addEventListener('click',()=>go('cosmos'));
tabs.map.addEventListener('click',()=>go('map'));
/* "Fly there" from the info panel: hop to the cosmos and tween the camera */
window.__flyToFeature=function(f){
  go('cosmos');
  if(window.__cosmosFlyTo) window.__cosmosFlyTo(f);
};
window.__go=go;

/* THE WAY OUT TO THE SUNLANDS, and the one case where there is not one.

   This atlas is a single self-contained file that works off a disk. The
   Sunlands build is not and cannot be: it streams terrain from a module
   worker and fetches its canon over the network, and browsers give neither
   an origin under file://. So opened from disk the link cannot work, and a
   link that cannot work should say so rather than land on a 404. Served from
   anywhere with an origin, which includes the Pages deployment, it is an
   ordinary relative link to the folder beside this one. */
const out=document.getElementById('navSunlands');
if(out && location.protocol==='file:'){
  out.classList.add('unavailable');
  out.removeAttribute('href');
  out.title='The Southern Sunlands needs a web server: it streams terrain from a module worker, which a browser will not run from a file. Serve this folder over http and the link works.';
  out.addEventListener('click',e=>{ e.preventDefault(); alert(out.title); });
}
})();
