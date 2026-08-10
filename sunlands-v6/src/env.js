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

/* Authored in sRGB because that is how a person reads colour, converted once
   here rather than once a frame. */
const SUNSET_COL = new THREE.Color(0.98, 0.52, 0.24).convertSRGBToLinear();
const DUST_COL = new THREE.Color(0.66, 0.50, 0.31).convertSRGBToLinear();
const FOG_COL = new THREE.Color(0.74, 0.77, 0.79).convertSRGBToLinear();

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
    this.ambientSky = new THREE.Color();
    this.nightAmbient = new THREE.Color();
    this.groundColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.fogDensity = 0;
    this.fogScaleHeight = 8000;
    this.shimmer = 0;
    this.flood = 0;
    this.localDust = 0;
    this.localFog = 0;
    this.shadowStrength = 1;
    this.airmass = 1;
    this.above = 1;
    this.ambientScale = 0.38;
    this.skyLight = 1;
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

  /* THIS RUNS EVERY FRAME, AND IT HAS TO.

     Everything downstream of it, the weather at a position and the Ashlands
     colour grade, modifies these fields in place and multiplicatively: less
     direct sun, more scattered, denser haze. Those are grades applied to a
     baseline, not state, so the baseline has to be re-established first. Left
     to accumulate they compound frame over frame, and eight seconds inside
     the Ashlands ends with a fog density of twenty-eight per metre and a sun
     four orders of magnitude too dim. Ask for it once at the top of the frame
     and the grades below are exactly what they say they are. */
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
    this.above = above;
    this.nightFactor = 1 - Math.min(1, Math.max(0, (el + 0.12) / 0.30));

    /* ATMOSPHERIC EXTINCTION, which is what actually makes a sunset.

       Airmass is roughly 1 / sin(elevation), with a Kasten and Young style
       correction so it stays finite at the horizon. Longer path, more
       scattering, and blue scatters far more than red: hence the reddening.
       Doing it this way means the sun dims and reddens for one reason rather
       than for two hand-tuned curves that have to be kept in agreement. */
    const elDeg = el * 180 / Math.PI;
    const airmass = el > -0.05
      ? 1 / (Math.sin(Math.max(el, 0.001)) + 0.50572 * Math.pow(Math.max(elDeg + 6.07995, 0.1), -1.6364))
      : 40;
    this.airmass = airmass;
    const kR = 0.100, kG = 0.205, kB = 0.375;      // per unit airmass
    this.sunColor.setRGB(
      Math.exp(-kR * airmass),
      Math.exp(-kG * airmass),
      Math.exp(-kB * airmass));
    this.sunIntensity = 1.75 * (el > 0 ? 1 : Math.max(0, 1 + el * 9));

    const w = this.weatherDef;
    const seas = this.seasonDef;
    /* Cloud and dust take light out of the direct beam and put it into the
       ambient, which is why an overcast day has no shadows. */
    const overcast = Math.min(0.92, w.cloud * 0.85 + w.dust * 0.45);
    this.sunIntensity *= (1 - overcast);
    this.shadowStrength = 1 - overcast;

    /* TWO CURVES, NOT ONE.

       lit  follows the SKY, so it stays up through civil twilight after the
            sun itself has gone. Everything that is lit by the sky reads this.
       hue  follows the sun's own height, and only drives colour, not
            brightness. It is what turns the horizon orange.

       Driving sky brightness off the sun's height is what makes a world snap
       to black the instant the sun touches the horizon, with no twilight at
       all. Sunset is the sky's brightest, most coloured moment; it cannot be
       the moment the lighting model gives up. */
    const lit = Math.min(1, Math.max(0, (Math.sin(el) + 0.20) / 0.35));
    const hue = Math.min(1, Math.max(0, Math.sin(el) / 0.32));
    const night = 1 - lit;
    this.skyLight = lit;
    const day = Math.pow(above, 0.5);

    /* Authored the way a person reads colour, in sRGB, and converted to
       linear light before anything uses them. */
    this.skyColor.setRGB(
      0.16 + 0.16 * hue, 0.29 + 0.28 * hue, 0.55 + 0.38 * hue)
      .convertSRGBToLinear().multiplyScalar(0.05 + 0.95 * lit);

    const warm = Math.pow(1 - hue, 1.3);
    this.horizonColor.setRGB(0.80, 0.84, 0.88).convertSRGBToLinear()
      .lerp(SUNSET_COL, warm)
      .multiplyScalar((0.05 + 0.95 * lit) * (0.40 + 0.60 * hue) * 1.2);

    /* What the ground actually sees: mostly the zenith at noon, mostly the
       burning horizon at sunset. */
    this.ambientSky.copy(this.skyColor).lerp(this.horizonColor, 0.30 + 0.55 * warm);

    /* A DELIBERATE LIFT. Starlight is about four orders of magnitude below
       daylight and rendering it honestly gives a black screen. This is the
       one place the model stops being physical, so it is a named constant
       rather than a fudge spread through the shaders. */
    this.nightAmbient.setRGB(0.022, 0.027, 0.046).multiplyScalar(night);

    this.fogColor.copy(this.horizonColor);
    if (w.dust > 0) this.fogColor.lerp(DUST_COL, 0.75 * w.dust * (0.20 + 0.80 * lit));
    if (this.weather === 'fog') this.fogColor.lerp(FOG_COL, 0.72 * (0.18 + 0.82 * lit));
    if (this.weather === 'rain') this.fogColor.multiplyScalar(0.58);
    this.fogColor.lerp(DUST_COL, seas.haze * 0.20 * lit);
    this.fogColor.add(this.nightAmbient);

    /* Haze so the horizon dissolves around 250 km at Kingdom tier on a clear
       day, and far sooner in dust. This is a density, not a distance: the
       shader integrates it against an exponential atmosphere. */
    const baseVisibility = 250 * KM;
    this.fogDensity = (2.2 / baseVisibility) * w.fog * (1 + seas.haze * 0.5);

    /* Scale height of the haze layer. Dust and coastal fog sit in a much
       shallower layer than clear-air haze does, which is why a dust wall has
       a top you can see over and a clear day does not. */
    this.fogScaleHeight = this.weather === 'harmattan' ? 3000
                        : this.weather === 'fog' ? 600
                        : this.weather === 'rain' ? 4000
                        : 8000;

    /* Heat shimmer over the desert between 11:00 and 15:00, Part 5.5. */
    this.shimmer = (this.timeOfDay > 10.5 && this.timeOfDay < 15.5)
      ? Math.sin((this.timeOfDay - 10.5) / 5 * Math.PI) * (1 - w.wet) * (1 - w.cloud * 0.8)
      : 0;

    /* Ambient is sky light plus bounce off very bright ground. In a desert
       the bounce term is not a rounding error. */
    /* Sky light and ground bounce, as a strength rather than a colour: the
       materials already have the sky and ground colours and would square them
       if handed a colour here too. About a third of the direct beam on a
       clear day, more when cloud turns the whole dome into the light source. */
    /* Skylight, not sunlight. It has to follow the sky rather than the direct
       beam, or the world snaps to black the instant the sun touches the
       horizon and there is no twilight at all. The floor is starlight and the
       reflected glow off the sand, which in a desert is not nothing. */
    this.ambientScale = (0.030 + 0.40 * Math.pow(lit, 1.3)) * (1 + overcast * 1.6);
    this.ambient.copy(this.ambientSky).multiplyScalar(this.ambientScale).add(this.nightAmbient);
    this.groundColor.setRGB(0.42, 0.34, 0.24).convertSRGBToLinear()
      .multiplyScalar(0.22 + 0.78 * day);
  }

  /** Advance animation clocks. Does not move the sun: the slider owns that. */
  tick(dt) {
    this.time += dt;
    /* A flash flood fills fast and drains slowly, which is the whole reason
       it is dangerous: the wadi is still running long after the rain stops. */
    const target = this.weather === 'rain' ? 1 : 0;
    const rate = target > this.flood ? 0.28 : 0.055;
    this.flood += Math.max(-rate * dt, Math.min(rate * dt, target - this.flood));
  }
}

export const env = new Environment();
