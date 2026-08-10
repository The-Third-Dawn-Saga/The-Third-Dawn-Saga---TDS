/* ============================================================================
   env.js  ::  time of day, sun, weather, season.

   One object every renderer reads. The sun direction it produces is the same
   one the palace aperture is aimed at, so "at dawn the sun strikes the dais
   through the eastern aperture" is a fact about this file, not a fudge in the
   city builder.

   Sun path: rises due east (+X), sets due west (-X), passes close to the
   zenith at noon with a slight northward tilt, which is what a desert at this
   latitude gets. Azimuth and elevation are both driven by one hour value so
   the HUD slider only has to move one number.
   ========================================================================= */

import * as THREE from 'three';
import { KM } from './units.js';

export const WEATHER = {
  clear:     { name: 'Clear',        fog: 1.0, dust: 0.0, wet: 0.0, cloud: 0.05 },
  rain:      { name: 'Rain',         fog: 2.6, dust: 0.0, wet: 1.0, cloud: 0.92 },
  harmattan: { name: 'Harmattan',    fog: 7.5, dust: 1.0, wet: 0.0, cloud: 0.35 },
  fog:       { name: 'Coastal fog',  fog: 9.0, dust: 0.0, wet: 0.35, cloud: 0.55 },
};

export const SEASONS = {
  greening: { name: 'The Greening', verdant: 1.0, faros: 1.0, haze: 0.15 },
  dust:     { name: 'The Long Dust', verdant: 0.28, faros: 0.0, haze: 0.75 },
};

/* Peak solar elevation. The Sunlands sit in the deep desert belt, so the noon
   sun is close to overhead and shadows collapse to nothing at midday, which
   is why the Grand Market closes at noon. */
const NOON_ELEVATION = 84 * Math.PI / 180;
const NORTH_TILT = 7 * Math.PI / 180;

class Environment {
  constructor() {
    this.timeOfDay = 10;          // hours, 0 to 24
    this.weather = 'clear';
    this.season = 'greening';
    this.time = 0;                // seconds since start, for animation

    this.sunDir = new THREE.Vector3();       // points FROM the surface TO the sun
    this.sunColor = new THREE.Color();
    this.sunIntensity = 1;
    this.skyColor = new THREE.Color();
    this.horizonColor = new THREE.Color();
    this.groundColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.fogDensity = 0;
    this.fogScaleHeight = 8000;
    this.ambient = new THREE.Color();
    this.nightFactor = 0;
    this.update();
  }

  get weatherDef() { return WEATHER[this.weather]; }
  get seasonDef() { return SEASONS[this.season]; }

  setTime(h) { this.timeOfDay = ((h % 24) + 24) % 24; this.update(); }
  setWeather(w) { if (WEATHER[w]) { this.weather = w; this.update(); } }
  setSeason(s) { if (SEASONS[s]) { this.season = s; this.update(); } }

  /** Solar elevation in radians. Negative at night. */
  elevation() {
    const t = (this.timeOfDay - 6) / 12;        // 0 at sunrise, 1 at sunset
    return Math.sin(t * Math.PI) * NOON_ELEVATION;
  }

  update() {
    const t = (this.timeOfDay - 6) / 12;
    const el = this.elevation();
    /* Azimuth sweeps east to west. +X east, -X west, and the arc leans a
       little north, which is -Z. */
    const az = t * Math.PI;
    const ce = Math.cos(el);
    this.sunDir.set(ce * Math.cos(az), Math.sin(el), -ce * Math.sin(NORTH_TILT) - ce * 0.0);
    this.sunDir.x = ce * Math.cos(az);
    this.sunDir.z = -ce * Math.sin(NORTH_TILT);
    this.sunDir.y = Math.sin(el);
    this.sunDir.normalize();

    const above = Math.max(0, Math.sin(el));
    this.nightFactor = 1 - Math.min(1, Math.max(0, (el + 0.12) / 0.30));

    /* Sun colour reddens hard through the last few degrees, which is where
       the gold plaster earns its keep. */
    const warm = Math.pow(1 - Math.min(1, above / 0.35), 2.0);
    this.sunColor.setRGB(
      1.0,
      1.0 - warm * 0.45,
      1.0 - warm * 0.80,
    );
    /* Calibrated so a sand albedo near 0.76 under a high sun lands just under
       one after tone mapping, rather than clipping to white. */
    this.sunIntensity = 0.04 + 1.20 * Math.pow(above, 0.60);

    const w = this.weatherDef;
    const seas = this.seasonDef;

    /* Sky and horizon. Dust and cloud drag both toward the weather's own
       colour, which is how the Harmattan turns the whole world tan. */
    const day = Math.pow(above, 0.5);
    this.skyColor.setRGB(
      0.28 + 0.22 * day, 0.42 + 0.30 * day, 0.62 + 0.34 * day).multiplyScalar(0.15 + 0.85 * day);
    this.horizonColor.setRGB(
      0.55 + 0.45 * day, 0.52 + 0.36 * day, 0.46 + 0.30 * day).multiplyScalar(0.16 + 0.84 * day);

    const dusk = new THREE.Color(0.98, 0.55, 0.28);
    this.horizonColor.lerp(dusk, warm * 0.75 * Math.min(1, above * 6));

    const dustCol = new THREE.Color(0.72, 0.56, 0.34);
    const fogCol = new THREE.Color(0.80, 0.83, 0.84);
    this.fogColor.copy(this.horizonColor);
    if (w.dust > 0) this.fogColor.lerp(dustCol, 0.72 * w.dust * (0.25 + 0.75 * day));
    if (this.weather === 'fog') this.fogColor.lerp(fogCol, 0.7 * (0.2 + 0.8 * day));
    if (this.weather === 'rain') this.fogColor.multiplyScalar(0.62);
    this.fogColor.lerp(dustCol, seas.haze * 0.22 * day);

    /* Haze so the horizon dissolves around 250 km at Kingdom tier on a clear
       day, and far sooner in dust. Exponential-squared, so this is a density,
       not a distance. */
    const baseVisibility = 250 * KM;
    this.fogDensity = (2.2 / baseVisibility) * w.fog * (1 + seas.haze * 0.5);

    /* Scale height of the haze layer. Dust and coastal fog sit in a much
       shallower layer than clear-air haze does, which is why a dust wall has
       a top you can see over and a clear day does not. */
    this.fogScaleHeight = this.weather === 'harmattan' ? 3000
                        : this.weather === 'fog' ? 600
                        : this.weather === 'rain' ? 4000
                        : 8000;

    this.ambient.copy(this.skyColor).multiplyScalar(0.30).addScalar(0.015);
    this.groundColor.setRGB(0.42, 0.34, 0.24).multiplyScalar(0.25 + 0.75 * day);
  }

  /** Advance animation clocks. Does not move the sun: the slider owns that. */
  tick(dt) { this.time += dt; }
}

export const env = new Environment();
