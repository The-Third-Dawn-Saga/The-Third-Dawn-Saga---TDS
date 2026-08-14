/* ============================================================================
   hud.js  ::  the persistent readouts.

   The scale bar is the only honest way to show a reader that this world is
   two and a half thousand kilometres across, so it is never hidden and never
   approximate. It relabels itself along a fixed ladder as the camera climbs,
   and beside it sits the travel time for the span currently on screen at
   canon speeds. That is the cheapest way to make distance felt, so it is
   always on.
   ========================================================================= */

import {
  pickScaleStep, metresPerPixel, formatDistance, formatAltitude,
  travelSummary, tierForAltitude,
} from '../scale.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      tier: $('roTier'), alt: $('roAlt'), span: $('roSpan'),
      rule: $('scaleRule'), label: $('scaleLabel'), travel: $('travel'),
      stTier: $('stTier'), dev: $('dev'),
      info: $('info'), infoTitle: $('infoTitle'), infoKind: $('infoKind'),
      infoTags: $('infoTags'), infoText: $('infoText'),
      boot: $('boot'), bootbar: $('bootbar'), bootmsg: $('bootmsg'),
      todVal: $('todVal'),
    };
    $('infoClose').addEventListener('click', () => this.hideInfo());
    this.el.fly = $('infoFly');
    this._flyAction = null;
    if (this.el.fly) this.el.fly.addEventListener('click', () => { if (this._flyAction) this._flyAction(); });
    this._lastStep = -1;
    this._lastTier = '';
  }

  boot(fraction, message) {
    if (this.el.bootbar) this.el.bootbar.style.width = `${Math.round(fraction * 100)}%`;
    if (message && this.el.bootmsg) this.el.bootmsg.textContent = message;
    if (fraction >= 1 && this.el.boot) {
      this.el.boot.classList.add('gone');
      setTimeout(() => { if (this.el.boot) this.el.boot.style.display = 'none'; }, 700);
    }
  }

  /**
   * @param {number} altitude metres above the ground under the camera
   * @param {number} focusDist metres from the camera to what it is looking at
   * @param {THREE.PerspectiveCamera} camera
   * @param {{w:number,h:number}} viewport
   */
  update(altitude, focusDist, camera, viewport) {
    const mpp = metresPerPixel(camera, viewport.h, focusDist);
    const step = pickScaleStep(mpp, Math.min(190, viewport.w * 0.14));

    if (step.metres !== this._lastStep) {
      this.el.label.textContent = formatDistance(step.metres);
      this._lastStep = step.metres;
    }
    this.el.rule.style.width = `${Math.max(24, Math.round(step.px))}px`;

    const tier = tierForAltitude(altitude);
    if (tier.name !== this._lastTier) {
      this.el.tier.textContent = tier.name;
      this.el.stTier.innerHTML = `<strong>${tier.name}</strong> tier`;
      this._lastTier = tier.name;
    }
    this.el.alt.textContent = formatAltitude(altitude);

    const span = mpp * viewport.w;
    this.el.span.textContent = formatDistance(span);

    const t = travelSummary(span);
    this.el.travel.innerHTML = t.map(m => `<span>${m.name} <b>${m.text}</b></span>`).join('');
  }

  showInfo(place) {
    this.el.infoTitle.textContent = place.name;
    this.el.infoKind.textContent = place.kind || '';
    this.el.infoTags.innerHTML = (place.tags || [])
      .map(t => `<span class="tag ${t}">${t}</span>`).join('');
    this.el.infoText.textContent = place.info || '';
    this.el.info.classList.add('vis');
  }

  hideInfo() { this.el.info.classList.remove('vis'); }

  setInfoAction(fn) {
    this._flyAction = fn;
    if (this.el.fly) this.el.fly.classList.toggle('vis', !!fn);
  }

  setTimeLabel(hours) {
    const h = Math.floor(hours) % 24;
    const m = Math.round((hours - Math.floor(hours)) * 60);
    this.el.todVal.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  dev(lines) {
    if (!this.el.dev) return;
    this.el.dev.classList.add('vis');
    this.el.dev.innerHTML = lines;
  }
}
