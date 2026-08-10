/* ============================================================================
   shimmer.js  ::  heat shimmer over the desert.

   Part 5.5: between 11:00 and 15:00 the air over the reg is hot enough to
   refract, strongest just above the ground and strongest of all over the
   Glass Desert, which runs forty degrees hotter than the sand around it.

   Screen-space, because that is what shimmer is: a distortion of what is
   behind the air, not a property of any surface. The distortion falls off
   above the horizon so the sky stays still, and it scrolls upward because
   hot air rises.
   ========================================================================= */

export const ShimmerShader = {
  name: 'ShimmerShader',
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0 },
    uTime: { value: 0 },
    uHorizonY: { value: 0 },      // NDC y of the eye-level horizon
    uAspect: { value: 1.777 },
    uGlass: { value: 0 },         // extra shimmer when the Glass Desert is in view
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    uniform float uTime;
    uniform float uHorizonY;
    uniform float uAspect;
    uniform float uGlass;
    varying vec2 vUv;

    float hash21(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
                 mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y) * 2.0 - 1.0;
    }

    void main(){
      vec2 ndc = vUv * 2.0 - 1.0;

      /* Hot air sits on the ground, so the effect is strongest just below the
         horizon and dies out well above it. */
      float belowHorizon = smoothstep(0.10, -0.35, ndc.y - uHorizonY);
      float nearHorizon = 1.0 - smoothstep(0.0, 0.55, abs(ndc.y - uHorizonY));
      float band = max(belowHorizon * 0.55, nearHorizon);

      float amt = uAmount * band * (1.0 + uGlass * 1.6);
      if (amt < 0.0005) { gl_FragColor = texture2D(tDiffuse, vUv); return; }

      vec2 p = vec2(vUv.x * uAspect * 60.0, vUv.y * 90.0 - uTime * 1.4);
      float n1 = vnoise(p);
      float n2 = vnoise(p * 2.3 + vec2(17.0, -uTime * 2.1));
      vec2 offset = vec2(n1 * 0.55 + n2 * 0.45, n2 * 0.30) * amt * 0.010;

      /* A touch of chromatic separation: the air is a prism, weakly. */
      vec4 c;
      c.r = texture2D(tDiffuse, vUv + offset * 1.06).r;
      c.g = texture2D(tDiffuse, vUv + offset).g;
      c.b = texture2D(tDiffuse, vUv + offset * 0.94).b;
      c.a = 1.0;
      gl_FragColor = c;
    }
  `,
};
