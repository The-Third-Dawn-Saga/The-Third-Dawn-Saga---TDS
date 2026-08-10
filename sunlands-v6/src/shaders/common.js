/* ============================================================================
   common.js  ::  GLSL fragments shared by every custom material here.

   Written in GLSL ES 1.00, which WebGL2 accepts directly, so the same source
   compiles whether Three.js gives us a WebGL1 or a WebGL2 context.
   ========================================================================= */

export const GLSL_NOISE = /* glsl */`
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

/* Value noise. Cheap, and with enough octaves nobody can tell. */
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

float fbm2(vec2 p, int oct){
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= oct) break;
    s += a * vnoise(p);
    n += a; a *= 0.5; p *= 2.03;
  }
  return s / n;
}

/* Worley F2 minus F1: the cell-wall network. Cracked reg, cracked salt. */
float worley21(vec2 p){
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(ip + g);
      float d = length(g + o - fp);
      if (d < f1){ f2 = f1; f1 = d; } else if (d < f2){ f2 = d; }
    }
  }
  return f2 - f1;
}
`;

export const GLSL_LIGHTING = /* glsl */`
/* GGX, trimmed to what a desert needs. */
float ggx(vec3 N, vec3 V, vec3 L, float rough){
  vec3 H = normalize(V + L);
  float a = max(rough * rough, 0.0015);
  float a2 = a * a;
  float NdH = max(dot(N, H), 0.0);
  float d = (NdH * NdH * (a2 - 1.0) + 1.0);
  float D = a2 / (3.14159265 * d * d);
  float NdV = max(dot(N, V), 0.0015);
  float NdL = max(dot(N, L), 0.0);
  float k = a * 0.5;
  float G = (NdV / (NdV * (1.0 - k) + k)) * (NdL / (NdL * (1.0 - k) + k));
  return D * G * 0.25 / max(NdV * NdL, 0.0015);
}

float fresnelSchlick(float f0, float cosTheta){
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}
`;

/* Aerial perspective.

   Haze is not a function of distance, it is a function of how much AIR the
   ray crossed, and air thins with height. Fogging on raw distance is what
   turns a view straight down from a hundred and sixty kilometres into a
   featureless cream rectangle: the ray is long, but almost all of it is above
   the atmosphere.

   So the ray is integrated against an exponential atmosphere of scale height
   1/uFogHeightFalloff, which collapses to plain distance fog for a horizontal
   ray at sea level and to almost nothing for a ray looking down from orbit.
   Both are correct, and the same one line does both. */
export const GLSL_FOG = /* glsl */`
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeightFalloff;
uniform float uFogSeaLevel;

vec3 applyFog(vec3 color, float dist, float camY, float fragY){
  float b = uFogHeightFalloff;
  float yc = max(camY - uFogSeaLevel, 0.0);
  float yf = max(fragY - uFogSeaLevel, 0.0);
  float dy = yc - yf;
  float airDist;
  if (abs(dy) < 1.0) {
    airDist = dist * exp(-yf * b);
  } else {
    airDist = dist / dy * (exp(-yf * b) - exp(-yc * b)) / b;
  }
  float od = uFogDensity * abs(airDist);
  float f = 1.0 - exp(-od * od);
  return mix(color, uFogColor, clamp(f, 0.0, 1.0));
}
`;
