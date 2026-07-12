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
})();
