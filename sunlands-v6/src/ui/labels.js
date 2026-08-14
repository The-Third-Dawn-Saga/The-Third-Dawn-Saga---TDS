/* ============================================================================
   labels.js  ::  named-place labels, projected.

   HTML rather than sprites. Text stays crisp at every zoom, costs no texture
   atlas, and gives click-to-open info panels for free, which is what makes
   this a canon reference tool rather than a flythrough.

   Which labels show is a function of tier: at Continental only the kingdoms
   and the capital, at Kingdom the provincial hubs, at Regional everything
   nearby. Anything behind the camera or past its tier's range is not in the
   DOM at all.
   ========================================================================= */

import * as THREE from 'three';
import { KM } from '../scale.js';

const TIER_RANGE = {
  continental: 3000 * KM,
  kingdom: 900 * KM,
  regional: 120 * KM,
  street: 22 * KM,
};

/* How important a place has to be to earn a label at each tier. */
const TIER_MIN_RANK = { continental: 3, kingdom: 2, regional: 1, street: 0 };

function rankOf(p) {
  if (p.tier === 'continental') return 3;
  if (/Capital/i.test(p.kind || '')) return 3;
  const pop = popNum(p.population);
  if (pop >= 100000) return 2;
  if (pop >= 20000) return 1;
  return 0;
}
function popNum(s) {
  if (!s) return 0;
  const m = String(s).replace(/[~,]/g, '').match(/([\d.]+)\s*([MK])?/i);
  if (!m) return 0;
  let v = parseFloat(m[1]);
  if (/m/i.test(m[2] || '')) v *= 1e6;
  else if (/k/i.test(m[2] || '')) v *= 1e3;
  return v;
}

const _v = new THREE.Vector3();

export class Labels {
  /**
   * @param {HTMLElement} host
   * @param {Array} places canon place records
   * @param {(place:object)=>void} onClick
   */
  constructor(host, places, onClick) {
    this.host = host;
    this.onClick = onClick;
    this.items = places.map(p => {
      const el = document.createElement('button');
      el.className = 'place-label';
      el.textContent = p.name;
      el.style.display = 'none';
      if (p.tags && p.tags.length && p.tags[0] !== 'LOCKED') {
        el.classList.add(`tag-${p.tags[0]}`);
      }
      el.addEventListener('click', (e) => { e.stopPropagation(); onClick(p); });
      host.appendChild(el);
      return { p, el, rank: rankOf(p), shown: false };
    });
  }

  /**
   * @param {THREE.Camera} camera
   * @param {{x:number,z:number}} offset floating origin
   * @param {{w:number,h:number}} viewport
   * @param {object} tier
   */
  update(camera, offset, viewport, tier, groundYAt) {
    const range = TIER_RANGE[tier.id] || 200 * KM;
    const minRank = TIER_MIN_RANK[tier.id] === undefined ? 0 : TIER_MIN_RANK[tier.id];
    const camX = camera.position.x + offset.x;
    const camZ = camera.position.z + offset.z;

    /* Nearest first, so the declutter budget spends itself on what matters. */
    const cand = [];
    for (const it of this.items) {
      if (it.rank < minRank) { this.hide(it); continue; }
      const d = Math.hypot(it.p.x - camX, it.p.z - camZ);
      if (d > range) { this.hide(it); continue; }
      cand.push({ it, d });
    }
    cand.sort((a, b) => a.d - b.d);

    const placed = [];
    let shownCount = 0;
    for (const { it, d } of cand) {
      if (shownCount >= 46) { this.hide(it); continue; }
      const y = groundYAt ? groundYAt(it.p.x, it.p.z) : 0;
      _v.set(it.p.x - offset.x, y + 40, it.p.z - offset.z);
      _v.project(camera);
      if (_v.z > 1 || _v.x < -1.15 || _v.x > 1.15 || _v.y < -1.1 || _v.y > 1.1) {
        this.hide(it); continue;
      }
      const px = (_v.x * 0.5 + 0.5) * viewport.w;
      const py = (-_v.y * 0.5 + 0.5) * viewport.h;

      /* Priority decluttering: a nearer, higher ranked label wins the space. */
      let clash = false;
      for (const q of placed) {
        if (Math.abs(q.x - px) < 96 && Math.abs(q.y - py) < 17) { clash = true; break; }
      }
      if (clash) { this.hide(it); continue; }
      placed.push({ x: px, y: py });

      it.el.style.display = 'block';
      it.el.style.transform = `translate(-50%, -50%) translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      it.el.style.opacity = String(Math.max(0.35, 1 - d / range));
      it.shown = true;
      shownCount++;
    }
    return shownCount;
  }

  hide(it) {
    if (it.shown) { it.el.style.display = 'none'; it.shown = false; }
  }
}
