/**
 * The two shaders. Both write grey only: how bright a pixel is says how
 * much ink is there. The bar dither turns that into bar width afterwards,
 * so there is no colour here at all. Black is "nothing": the dither drops
 * it and the grid shows through.
 */

export const RIBBON_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * vUv.x runs along the stroke, 0 where the brush landed and 1 where it
 * lifted. vUv.y runs across it.
 *
 *   uDraw   how much of the stroke is painted so far
 *   uLevel  how strong it is: 1 new, low for a ghost
 *   uLen    its length in world units, so the bristle marks keep one size
 *   uSeed   a different grain for each stroke
 */
export const RIBBON_FRAG = /* glsl */ `
uniform float uDraw;
uniform float uLevel;
uniform float uLen;
uniform float uSeed;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

void main() {
  float t = vUv.x;
  if (t > uDraw) discard;
  float across = vUv.y * 2.0 - 1.0;
  float s = t * uLen;

  // The head of the wet stroke is round, not cut square.
  float head = clamp((uDraw - t) * uLen / 0.04, 0.0, 1.0);
  if (abs(across) > sqrt(head)) discard;

  // Bristle marks: long along the stroke, fine across it.
  float bristle = noise(vec2(s * 2.5 + uSeed, vUv.y * 38.0));
  float fine = noise(vec2(s * 14.0, vUv.y * 90.0 + uSeed));

  // The brush runs out of ink toward the end, and first at its edges.
  float dry = smoothstep(0.45, 1.0, t) * 0.55 + pow(abs(across), 3.0) * 0.45;
  if (bristle * 0.7 + fine * 0.3 < dry * 0.95) discard;

  // A torn edge rather than a clean one.
  float edge = abs(across) + (noise(vec2(s * 9.0, uSeed)) - 0.5) * 0.25;
  if (edge > 0.97) discard;

  // Fresh ink at the moving head is a little denser.
  float wet = 1.0 - smoothstep(0.0, 0.18, (uDraw - t) * uLen);
  float ink = 0.8 + 0.16 * bristle + 0.08 * wet - 0.25 * dry;
  gl_FragColor = vec4(vec3(clamp(ink, 0.0, 1.0) * uLevel), 1.0);
}
`;

/**
 * Petals and skill blossoms: one square each, cut from an atlas of
 * uCols by uCols cells. aCell picks the cell, aLevel how bright it is
 * (0 hides it).
 */
export const PETAL_VERT = /* glsl */ `
attribute float aCell;
attribute float aLevel;
uniform float uCols;
varying vec2 vUv;
varying float vLevel;
void main() {
  float col = mod(aCell, uCols);
  float row = floor(aCell / uCols + 0.001);
  // The atlas is uploaded flipped, so its top row is at the top of v.
  vUv = vec2((col + uv.x) / uCols, 1.0 - (row + 1.0 - uv.y) / uCols);
  vLevel = aLevel;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}
`;

export const PETAL_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vLevel;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a < 0.5 || vLevel < 0.004) discard;
  gl_FragColor = vec4(c.rgb * vLevel, 1.0);
}
`;
