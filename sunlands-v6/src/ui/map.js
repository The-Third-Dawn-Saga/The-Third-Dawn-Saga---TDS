/* ============================================================================
   map.js  ::  the minimap and the full-screen map overlay.

   Canvas 2D over the canon place list and the same coast polyline the terrain
   uses, so the map cannot drift out of agreement with the world. Both views
   share one draw function; only the scale and the label budget differ.
   ========================================================================= */

import { KM, formatDistance } from '../scale.js';
import { STAR_DUNES, OASES, CANALS, coastDistance } from '../terrain/height.js';

const LAND = '#2a2013';
const SEA = '#0b1a26';
const COAST = '#3b5b6b';

export class MapView {
  /**
   * @param {HTMLCanvasElement} mini
   * @param {HTMLCanvasElement} full
   * @param {Array} places
   */
  constructor(mini, full, places) {
    this.mini = mini;
    this.full = full;
    this.places = places;
    this.landCache = null;
    this.fullOpen = false;
  }

  /**
   * Land mask, rasterised once. Sampling coastDistance per pixel is slow, so
   * it is done at low resolution into an offscreen canvas and then scaled.
   */
  buildLandCache(w = 220, h = 160, bounds) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const land = hexToRgb(LAND), sea = hexToRgb(SEA), coast = hexToRgb(COAST);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = bounds.minX + (i + 0.5) / w * (bounds.maxX - bounds.minX);
        const z = bounds.minZ + (j + 0.5) / h * (bounds.maxZ - bounds.minZ);
        const d = coastDistance(x, z);
        const col = d > 12 * KM ? land : d > 0 ? coast : sea;
        const k = (j * w + i) * 4;
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2];
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.landCache = { canvas: c, bounds };
    return this.landCache;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} view {cx, cz, span} absolute metres
   * @param {object} player {x, z, heading} absolute
   * @param {boolean} detailed
   */
  draw(canvas, view, player, detailed) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const aspect = W / H;
    const halfX = view.span / 2;
    const halfZ = halfX / aspect;
    const bounds = {
      minX: view.cx - halfX, maxX: view.cx + halfX,
      minZ: view.cz - halfZ, maxZ: view.cz + halfZ,
    };
    const toPx = (x, z) => [
      (x - bounds.minX) / (bounds.maxX - bounds.minX) * W,
      (z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * H,
    ];

    g.fillStyle = SEA;
    g.fillRect(0, 0, W, H);

    if (!this.landCache || !sameBounds(this.landCache.bounds, bounds)) {
      this.buildLandCache(detailed ? 260 : 150, detailed ? 190 : 110, bounds);
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(this.landCache.canvas, 0, 0, W, H);

    /* Canal network: the reason anything grows out here. */
    g.strokeStyle = 'rgba(90,150,120,0.55)';
    g.lineWidth = detailed ? 1.6 : 1;
    for (const c of CANALS) {
      g.beginPath();
      c.points.forEach((p, i) => {
        const [px, py] = toPx(p[0], p[1]);
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      });
      g.stroke();
    }

    /* Star dunes: the landmarks a walker navigates by. */
    if (detailed) {
      g.fillStyle = 'rgba(226,190,120,0.55)';
      for (const d of STAR_DUNES) {
        const [px, py] = toPx(d.x, d.z);
        if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;
        g.beginPath();
        g.arc(px, py, Math.max(1.5, d.height / 120), 0, Math.PI * 2);
        g.fill();
      }
    }

    /* Oases. */
    g.fillStyle = 'rgba(70,140,90,0.75)';
    for (const o of OASES) {
      if (!detailed && !o.major) continue;
      const [px, py] = toPx(o.x, o.z);
      if (px < 0 || px > W || py < 0 || py > H) continue;
      g.beginPath();
      g.arc(px, py, o.major ? 3 : 1.4, 0, Math.PI * 2);
      g.fill();
    }

    /* Named places. */
    for (const p of this.places) {
      const [px, py] = toPx(p.x, p.z);
      if (px < -60 || px > W + 60 || py < -30 || py > H + 30) continue;
      const cap = /Capital/i.test(p.kind || '');
      const proposed = p.tags && p.tags.includes('PROPOSED');
      g.fillStyle = cap ? '#f4d35e' : proposed ? '#e0a85c' : '#c8a86a';
      g.beginPath();
      g.arc(px, py, cap ? 4 : 2.4, 0, Math.PI * 2);
      g.fill();
      if (detailed) {
        g.fillStyle = 'rgba(245,230,200,0.9)';
        g.font = `${cap ? 12 : 10}px Georgia, serif`;
        g.fillText(p.name, px + 6, py + 3);
      }
    }

    /* The player. */
    if (player) {
      const [px, py] = toPx(player.x, player.z);
      g.save();
      g.translate(px, py);
      g.rotate(player.heading);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(0, -7); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5);
      g.closePath();
      g.fill();
      g.restore();
    }

    /* Scale bar, because a map without one is a picture. */
    const barM = niceStep(view.span / 4);
    const barPx = barM / (bounds.maxX - bounds.minX) * W;
    g.strokeStyle = '#f4d35e';
    g.lineWidth = 1;
    const bx = 10, by = H - 14;
    g.beginPath();
    g.moveTo(bx, by - 4); g.lineTo(bx, by); g.lineTo(bx + barPx, by); g.lineTo(bx + barPx, by - 4);
    g.stroke();
    g.fillStyle = '#f4d35e';
    g.font = '10px Georgia, serif';
    g.fillText(formatDistance(barM), bx + barPx + 6, by);
  }
}

function niceStep(m) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
                 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i] <= m) return steps[i];
  return 1;
}
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function sameBounds(a, b) {
  return a && Math.abs(a.minX - b.minX) < 1 && Math.abs(a.maxX - b.maxX) < 1 &&
         Math.abs(a.minZ - b.minZ) < 1 && Math.abs(a.maxZ - b.maxZ) < 1;
}
