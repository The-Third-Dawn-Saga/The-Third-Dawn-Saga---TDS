/* ============================================================================
   overlays.js  ::  the reference layers.

   Caravan roads, the canal network, the underground rivers, farm corridors,
   Solanu province boundaries, vassal kingdoms, military outposts, and the
   seasonal migration flows. Everything is drawn as line geometry in world
   space, built once and toggled, because these are reference annotations for
   a canon tool and they have to be readable from Continental tier down.

   Lines sit slightly above the ground so they read against the terrain
   without z-fighting, and their height allowance scales with altitude, which
   is the only honest way to keep a hairline visible from a thousand
   kilometres up.
   ========================================================================= */

import * as THREE from 'three';
import { KM } from '../units.js';
import { walkableHeight, CANALS, OASES, STAR_DUNES } from '../terrain/height.js';

const COLORS = {
  roads: 0xc9a15a,
  canals: 0x4fb08a,
  rivers: 0x3f7fd0,
  farms: 0x6faa4a,
  solanu: 0xd9b23a,
  vassals: 0x9a7fd0,
  outposts: 0xd06a5a,
  migration: 0xe0a85c,
};

/** Sample a polyline onto the terrain, lifted clear of it. */
function drape(points, lift = 30, segments = 6) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      out.push(x, walkableHeight(x, z) + lift, z);
    }
  }
  const [lx, lz] = points[points.length - 1];
  out.push(lx, walkableHeight(lx, lz) + lift, lz);
  return out;
}

function lineOf(coords, color, opacity = 0.85) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const l = new THREE.Line(g, m);
  l.renderOrder = 4;
  return l;
}

export class Overlays {
  /**
   * @param {THREE.Object3D} root registered with the floating origin
   * @param {object} canon
   */
  constructor(root, canon) {
    this.root = root;
    this.canon = canon;
    this.groups = {};
    this.built = {};
    this.layers = {};
    for (const k of Object.keys(COLORS)) {
      const g = new THREE.Group();
      g.name = `layer:${k}`;
      g.visible = false;
      root.add(g);
      this.groups[k] = g;
    }
  }

  setLayers(layers) {
    this.layers = layers;
    for (const k of Object.keys(this.groups)) {
      const want = !!layers[k];
      if (want && !this.built[k]) { this.build(k); this.built[k] = true; }
      this.groups[k].visible = want;
    }
  }

  place(id) { return this.canon.places.find(p => p.id === id); }

  build(k) {
    const g = this.groups[k];
    const col = COLORS[k];
    const P = (id) => { const p = this.place(id); return p ? [p.x, p.z] : null; };

    if (k === 'canals' || k === 'farms') {
      for (const c of CANALS) {
        g.add(lineOf(drape(c.points, k === 'farms' ? 24 : 34, 5), col, k === 'farms' ? 0.5 : 0.8));
        if (k === 'farms') {
          /* The green corridor flanks the channel, so it is drawn as a pair of
             offset lines rather than as one. */
          for (const s of [-1, 1]) {
            const off = c.points.map(([x, z], i, arr) => {
              const j = Math.min(i + 1, arr.length - 1);
              const dx = arr[j][0] - x, dz = arr[j][1] - z;
              const l = Math.hypot(dx, dz) || 1;
              return [x - dz / l * 900 * s, z + dx / l * 900 * s];
            });
            g.add(lineOf(drape(off, 22, 4), col, 0.32));
          }
        }
      }
      return;
    }

    if (k === 'rivers') {
      /* The three underground rivers converging on Sundisk. They are the
         reason the city is where it is, so they run to the origin. */
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        const pts = [];
        for (let t = 0; t <= 14; t++) {
          const f = t / 14;
          const rr = f * 320 * KM;
          const wob = Math.sin(f * 5 + i * 2.1) * 0.22;
          pts.push([Math.cos(a + wob) * rr, Math.sin(a + wob) * rr]);
        }
        g.add(lineOf(drape(pts, 18, 4), col, 0.55));
      }
      return;
    }

    if (k === 'roads') {
      /* Caravan roads between the places canon says trade with each other. */
      const routes = [
        ['sundisk', 'tawari', 'goldencoast'],
        ['sundisk', 'mirin', 'ok_mirin'],
        ['sundisk', 'veth', 'drumharbor'],
        ['sundisk', 'mensah', 'fishing'],
        ['sundisk', 'kosei'],
        ['sundisk', 'ashara', 'soleth', 'solkhari'],
        ['sundisk', 'taresh', 'ok_taresh'],
        ['tawari', 'ok_soleth'],
      ];
      for (const r of routes) {
        const pts = r.map(P).filter(Boolean);
        if (pts.length < 2) continue;
        g.add(lineOf(drape(densify(pts, 6), 40, 3), col, 0.7));
      }
      return;
    }

    if (k === 'solanu' || k === 'vassals') {
      /* Province and vassal extents as rings around their seats. Boundaries
         between the Nine Solanu are not stated in canon, so this shows each
         seat's reach rather than inventing a border. CANON GAP: exact Solanu
         boundaries are unrecorded. */
      const wanted = k === 'solanu'
        ? ['sundisk', 'mensah', 'veth', 'ashara', 'tawari', 'soleth', 'mirin', 'kosei', 'taresh']
        : ['solkhari', 'goldencoast', 'drumharbor', 'sunset', 'ok_taresh', 'ok_mirin', 'ok_soleth', 'ok_veth'];
      for (const id of wanted) {
        const p = this.place(id);
        if (!p) continue;
        const R = k === 'solanu' ? 190 * KM : 90 * KM;
        const pts = [];
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * Math.PI * 2;
          pts.push([p.x + Math.cos(a) * R, p.z + Math.sin(a) * R]);
        }
        g.add(lineOf(drape(pts, 60, 1), col, 0.35));
      }
      return;
    }

    if (k === 'outposts') {
      /* The Three-Zone Defense Model puts the outposts on the approaches, not
         on a line: the desert itself is the army. Markers at the passes and
         the frontier. CANON GAP: individual outpost sites are unrecorded, so
         these are placed on the named approaches only. */
      const sites = [
        [100 * KM, -820 * KM], [-380 * KM, -840 * KM], [520 * KM, -830 * KM],
        [-1300 * KM, 120 * KM], [-1300 * KM, -220 * KM],
        [1180 * KM, -20 * KM], [690 * KM, -430 * KM],
      ];
      const geo = new THREE.ConeGeometry(1, 1, 4);
      for (const [x, z] of sites) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.8, depthWrite: false,
        }));
        m.position.set(x, walkableHeight(x, z) + 1400, z);
        m.scale.set(9 * KM, 9 * KM, 9 * KM);
        m.renderOrder = 4;
        g.add(m);
      }
      return;
    }

    if (k === 'migration') {
      /* Herds move south at the onset of the Long Dust and north at the first
         rain. Drawn as arcs between the grazing belt and the floodplain
         margins; the season toggle swaps which way they point. */
      for (let i = 0; i < 7; i++) {
        const x0 = -700 * KM + i * 220 * KM;
        const pts = [];
        for (let t = 0; t <= 10; t++) {
          const f = t / 10;
          pts.push([x0 + Math.sin(f * Math.PI) * 60 * KM, -420 * KM + f * 620 * KM]);
        }
        g.add(lineOf(drape(pts, 70, 3), col, 0.45));
      }
      return;
    }
  }

  /** Migration direction follows the season, and the farms follow it too. */
  update(env, altitude) {
    const mig = this.groups.migration;
    if (mig && mig.visible) {
      /* Herds run south at the onset of the Long Dust and north at the first
         rain, so the season moves them rather than only fading them. The
         flows are drawn on the full range and shifted along it. */
      const south = env.season === 'dust';
      mig.position.z = south ? 180 * KM : -180 * KM;
      for (const c of mig.children) c.material.opacity = south ? 0.55 : 0.34;
    }
    const farms = this.groups.farms;
    if (farms && farms.visible) {
      const v = env.seasonDef.verdant;
      for (const c of farms.children) c.material.opacity = 0.18 + 0.42 * v;
    }
  }
}

function densify(pts, n) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < n; s++) {
      const t = s / n;
      out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
                pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
