/**
 * The pond's shaders. Everything here draws in greys: the bar pass that
 * follows turns bright into wide blossom bars and dark into thin ones, so
 * a tone here is a bar width there. Pure black is never written, because
 * the bar pass drops a cell that touches black and the water would get
 * holes.
 */

/** A quad that covers the render target: used by the ripple step. */
export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * One step of the ripple simulation. Red holds the height now, green the
 * height one step ago. The new height is half the sum of the four
 * neighbours less the old height, then damped: the classic height field
 * wave. A pointer stroke (a short segment) or a stone adds a soft bump.
 */
export const SIM_FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uDamp;
uniform vec4 uDomain;
uniform vec4 uSeg;
uniform float uSegStrength;
uniform float uSegRadius;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uPrev, vUv);
  float n = texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r
    + texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r
    + texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r
    + texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r;
  float h = (n * 0.5 - c.g) * uDamp;
  vec2 w = uDomain.xy + vUv * uDomain.zw;
  vec2 pa = w - uSeg.xy;
  vec2 ba = uSeg.zw - uSeg.xy;
  float t = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  float d = length(pa - ba * t);
  h += uSegStrength * (1.0 - smoothstep(0.0, uSegRadius, d));
  gl_FragColor = vec4(h, c.r, 0.0, 1.0);
}
`;

/** Passes the world position to the fragment shader. */
export const WORLD_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/**
 * The water surface. It bends the picture of what is under it (the koi and
 * the stones, drawn a moment before into uUnder) by the slope of the
 * ripples, adds the bough overhead as a soft reflection, and lights the
 * slopes that face the sun.
 */
export const WATER_FRAG = /* glsl */ `
uniform sampler2D uHeight;
uniform sampler2D uUnder;
uniform sampler2D uRefl;
uniform vec4 uDomain;
uniform vec2 uTexel;
uniform vec2 uRes;
uniform vec4 uReflRect;
uniform vec2 uCam;
uniform float uTime;
varying vec3 vWorld;
void main() {
  vec2 suv = (vWorld.xz - uDomain.xy) / uDomain.zw;
  float hl = texture2D(uHeight, suv - vec2(uTexel.x, 0.0)).r;
  float hr = texture2D(uHeight, suv + vec2(uTexel.x, 0.0)).r;
  float hd = texture2D(uHeight, suv - vec2(0.0, uTexel.y)).r;
  float hu = texture2D(uHeight, suv + vec2(0.0, uTexel.y)).r;
  vec2 slope = vec2(hr - hl, hu - hd);

  vec2 screen = gl_FragCoord.xy / uRes;
  vec2 bent = clamp(screen + vec2(slope.x, -slope.y) * 0.12, vec2(0.001), vec2(0.999));
  float under = texture2D(uUnder, bent).r;

  // The bough hangs above the camera, so its reflection lies deeper than
  // the water and slides by slower as the camera drifts.
  vec2 rp = vWorld.xz - uCam * 0.4 + slope * 2.5;
  vec2 ruv = (rp - uReflRect.xy) / uReflRect.zw;
  float refl = texture2D(uRefl, vec2(ruv.x, 1.0 - ruv.y)).r;

  float lit = clamp(-(slope.x * 0.6 + slope.y * 0.8) * 7.0, -0.06, 0.55);
  // A faint slow swell so still water is not one flat grey.
  float swell = 0.012 * sin(vWorld.x * 0.9 + uTime * 0.3) * sin(vWorld.z * 1.3 - uTime * 0.25);
  float tone = 0.085 + swell + under * 0.8 + refl * 0.3 + lit;
  gl_FragColor = vec4(vec3(clamp(tone, 0.03, 1.0)), 1.0);
}
`;

/**
 * A koi. The body is built along local +x, nose first; aU runs from 0 at
 * the nose to 1 at the tail. The swimming wave travels down the body and
 * grows toward the tail, and the whole body curls into the turn it is
 * making. Lateral is local z.
 */
export const KOI_VERT = /* glsl */ `
uniform float uTime;
uniform float uPhase;
uniform float uBend;
uniform float uLen;
attribute float aU;
attribute float aFin;
varying float vU;
varying float vSide;
varying float vFin;
varying float vShade;
void main() {
  vec3 p = position;
  float wave = 0.09 * aU * aU * sin(aU * 5.5 - uTime * 5.0 + uPhase);
  float curl = uBend * (aU - 0.25) * (aU - 0.25) * 0.5;
  p.z += (wave + curl) * uLen;
  vU = aU;
  vSide = position.z / uLen;
  vFin = aFin;
  vShade = 0.62 + 0.38 * clamp(normal.y, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

/** The koi's markings: pale bodies, some with mid-grey patches, one kind darker. */
export const KOI_FRAG = /* glsl */ `
uniform float uSeed;
uniform float uKind;
varying float vU;
varying float vSide;
varying float vFin;
varying float vShade;
void main() {
  float n = sin(vU * 9.0 + uSeed) * sin(vSide * 16.0 + uSeed * 2.0 + vU * 6.0)
    + 0.45 * sin(vU * 17.0 + uSeed * 3.1);
  float spot = step(0.28, n) * step(0.08, vU) * step(vU, 0.82);
  float tone;
  if (uKind < 0.5) {
    tone = mix(0.95, 0.5, spot);
  } else if (uKind < 1.5) {
    tone = 0.9;
  } else {
    // A dark koi with a pale head.
    tone = mix(0.85, 0.38, smoothstep(0.18, 0.3, vU));
  }
  tone *= vShade;
  tone = mix(tone, tone * 0.72, vFin);
  gl_FragColor = vec4(vec3(tone), 1.0);
}
`;

/**
 * Fallen petals. Each one drifts along the pond, and rides the ripples:
 * the height under it lifts it, the slope tips it and pushes it away from
 * the crest.
 */
export const PETAL_VERT = /* glsl */ `
uniform sampler2D uHeight;
uniform vec4 uDomain;
uniform vec2 uTexel;
uniform float uTime;
attribute vec4 aSeed;
varying vec2 vUv;
varying float vLight;
void main() {
  float px = uDomain.x + mod(aSeed.x - uDomain.x + uTime * 0.06, uDomain.z);
  float pz = aSeed.y + 0.3 * sin(uTime * 0.17 + aSeed.w);
  vec2 suv = (vec2(px, pz) - uDomain.xy) / uDomain.zw;
  float h = texture2D(uHeight, suv).r;
  float gx = texture2D(uHeight, suv + vec2(uTexel.x * 2.0, 0.0)).r - texture2D(uHeight, suv - vec2(uTexel.x * 2.0, 0.0)).r;
  float gz = texture2D(uHeight, suv + vec2(0.0, uTexel.y * 2.0)).r - texture2D(uHeight, suv - vec2(0.0, uTexel.y * 2.0)).r;
  px -= gx * 0.35;
  pz -= gz * 0.35;
  float a = aSeed.z + 0.25 * sin(uTime * 0.21 + aSeed.w * 1.7);
  float size = 0.13 + 0.05 * fract(aSeed.w * 7.13);
  vec2 q = position.xy * size;
  vec2 r = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  vec3 w = vec3(px + r.x, 0.03 + h * 0.25 + (r.x * gx + r.y * gz) * 1.5, pz + r.y);
  vUv = uv;
  vLight = clamp(0.9 - (gx * 0.6 + gz * 0.8) * 4.0, 0.6, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

export const PETAL_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vLight;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // An oval petal with a small notch at its tip.
  float d = length(vec2(p.x, p.y * 1.8));
  if (d > 1.0) discard;
  if (p.x > 0.7 && abs(p.y) < (p.x - 0.7) * 0.9) discard;
  float tone = (0.97 - 0.18 * d) * vLight;
  gl_FragColor = vec4(vec3(tone), 1.0);
}
`;
