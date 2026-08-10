/* ============================================================================
   sky-glsl.js  ::  the scattering core, shared.

   The sky dome and the ocean both need it: the ocean's reflection is the sky,
   and computing it analytically from the same function is both cheaper and
   more correct than baking a cubemap and hoping it stays in step with the
   time-of-day slider.
   ========================================================================= */

export const SKY_SCATTER = /* glsl */`
const float PI = 3.141592653589793;

/* Sea-level scattering coefficients times their scale heights, so these are
   optical depths per unit airmass rather than per metre. */
const vec3 BETA_R = vec3(5.8e-6, 13.5e-6, 33.1e-6) * 8000.0;
const vec3 BETA_M = vec3(21.0e-6) * 1200.0;

/* Kasten and Young: airmass that stays finite at the horizon. */
float airmass(float cosZenith){
  float elDeg = degrees(asin(clamp(cosZenith, -1.0, 1.0)));
  return 1.0 / (max(cosZenith, 0.0) + 0.50572 * pow(max(elDeg + 6.07995, 0.05), -1.6364));
}

float rayleighPhase(float c){ return 3.0 / (16.0 * PI) * (1.0 + c * c); }

float miePhase(float c, float g){
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + c * c)) /
         ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}

/* Stars. Needed for their own sake and because the Glass Desert has to
   reflect the starfield at night from three hundred kilometres away. */
float starField(vec3 d){
  vec3 p = d * 340.0;
  vec3 c = floor(p);
  float h = hash21(c.xy + c.z * 71.3);
  if (h < 0.9955) return 0.0;
  vec3 j = vec3(hash21(c.xy + 11.0), hash21(c.yz + 23.0), hash21(c.zx + 37.0));
  float dist = length(fract(p) - j);
  float mag = (h - 0.9955) / 0.0045;
  return pow(max(0.0, 1.0 - dist * 3.2), 12.0) * (0.35 + 0.65 * mag);
}


/* Radiance arriving from direction d, given the sun. The caller supplies the
   view airmass scale so a camera at altitude can thin the atmosphere it is
   looking through. */
vec3 skyRadiance(vec3 d, vec3 s, float sunIntensity, float dust, float airScale){
  float cosT = dot(d, s);
  float mView = airmass(d.y) * airScale;
  float mSun = airmass(s.y);
  vec3 transmit = exp(-(BETA_R + BETA_M) * mSun);
  vec3 inscatter = (BETA_R * rayleighPhase(cosT)
                  + BETA_M * miePhase(cosT, 0.76) * (1.0 + dust * 6.0))
                 * mView * transmit;
  return inscatter * sunIntensity * 30.0;
}
`;
