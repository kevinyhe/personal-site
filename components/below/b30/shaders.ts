/**
 * Every shader in the garden. They all write grey only: how bright a pixel
 * is decides how wide its bar is once the dither has drawn it. Pure black
 * means "nothing here", and the dither leaves the plum ground showing, so
 * everything solid keeps its grey above 0.05.
 */

/** Passes the world position through, for the shaders that pattern by place. */
export const WORLD_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/**
 * The sand. Its height is a pattern of grooves: parallel lines along the
 * garden, rings round each stone, rings round the email at the end. On top
 * of that goes whatever the cursor raked, which fades back as its weight
 * runs down. The grooves are lit from the front left, so each ridge has a
 * bright face and a dark one.
 *
 *   uStones   x, z, where the rings start, where they stop
 *   uPhase    how far each stone's rings have slid outward
 *   uContact  centre x, z and half sizes of the calm patch under the email
 *   uRake     r: raked height, g: how much of it is still there
 */
export const SAND_FRAG = /* glsl */ `
uniform vec4 uStones[5];
uniform float uPhase[5];
uniform vec4 uContact;
uniform float uContactOn;
uniform float uContactReach;
uniform sampler2D uRake;
uniform vec4 uRakeArea;
uniform float uSpacing;
uniform float uDepth;
uniform vec3 uLight;
varying vec3 vWorld;
varying vec2 vUv;

float sdRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float groove(float c) {
  return 0.5 + 0.5 * cos(c * 6.2831853 / uSpacing);
}

float pattern(vec2 p) {
  float c = p.y;
  for (int i = 0; i < 5; i++) {
    vec4 s = uStones[i];
    float d = length(p - s.xy);
    if (d < s.w) c = d - s.z - uPhase[i];
  }
  float h = groove(c);
  if (uContactOn > 0.001) {
    float sd = sdRect(p - uContact.xy, uContact.zw, 0.6);
    if (sd < uContactReach * uContactOn) h = groove(sd);
    if (sd < 0.0) h = 0.5;
  }
  return h;
}

float heightAt(vec2 p) {
  float h = pattern(p);
  vec2 ruv = clamp((p - uRakeArea.xy) / uRakeArea.zw, 0.0, 1.0);
  vec4 r = texture2D(uRake, ruv);
  return mix(h, r.r, r.g);
}

void main() {
  vec2 p = vWorld.xz;
  float e = uSpacing * 0.08;
  float h0 = heightAt(p);
  float hx = heightAt(p + vec2(e, 0.0));
  float hz = heightAt(p + vec2(0.0, e));

  // Pixels of the hidden canvas one groove spans here. Far off the grooves
  // are finer than the bars can show, so they flatten out instead of
  // turning to noise.
  float px = uSpacing / max(length(fwidth(p)), 0.00001);
  float show = smoothstep(5.0, 11.0, px);
  float k = uDepth * show / e;
  vec3 n = normalize(vec3(-(hx - h0) * k, 1.0, -(hz - h0) * k));
  float lit = max(dot(n, uLight), 0.0);
  float b = 0.14 + 0.8 * lit + 0.18 * (h0 - 0.5) * show;

  // Each stone shades the sand at its foot.
  for (int i = 0; i < 5; i++) {
    vec4 s = uStones[i];
    float d = length(p - s.xy);
    b *= mix(0.6, 1.0, smoothstep(s.z * 0.8, s.z + 0.6, d));
  }

  // The patch under the email is smoothed flat and pale.
  if (uContactOn > 0.001) {
    float sd = sdRect(p - uContact.xy, uContact.zw, 0.6);
    b = mix(b, 0.93, (1.0 - smoothstep(-0.04, 0.04, sd)) * uContactOn);
  }
  gl_FragColor = vec4(vec3(clamp(b, 0.05, 1.0)), 1.0);
}
`;

/** A full-screen square, for the rake pass. */
export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The rake. One pass per frame reads last frame's rake picture and writes
 * the next: every weight runs down by uDecay, and if the cursor moved, the
 * tines are pressed in along the segment it moved over. The grooves run
 * along the stroke, so they follow the hand.
 *
 *   uSeg   start x, z and end x, z of the stroke, in world units
 *   uArea  the world rectangle the picture covers: min x, min z, size x, size z
 *   uHalf  half the rake's width
 */
export const RAKE_FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform vec4 uSeg;
uniform float uHas;
uniform float uDecay;
uniform float uInit;
uniform vec4 uArea;
uniform float uHalf;
uniform float uSpacing;
varying vec2 vUv;

void main() {
  if (uInit > 0.5) {
    gl_FragColor = vec4(0.5, 0.0, 0.0, 1.0);
    return;
  }
  vec4 prev = texture2D(uPrev, vUv);
  float h = prev.r;
  float w = max(prev.g - uDecay, 0.0);
  if (uHas > 0.5) {
    vec2 p = uArea.xy + vUv * uArea.zw;
    vec2 a = uSeg.xy;
    vec2 ab = uSeg.zw - a;
    float len2 = dot(ab, ab);
    vec2 dir = len2 > 0.00000001 ? ab / sqrt(len2) : vec2(1.0, 0.0);
    float t = len2 > 0.00000001 ? clamp(dot(p - a, ab) / len2, 0.0, 1.0) : 0.0;
    float dist = length(p - (a + ab * t));
    if (dist < uHalf) {
      float across = dot(p - a, vec2(-dir.y, dir.x));
      float g = 0.5 + 0.5 * cos(across * 6.2831853 / uSpacing);
      float edge = 1.0 - smoothstep(uHalf * 0.7, uHalf, dist);
      h = mix(h, g, edge);
      w = max(w, edge);
    }
  }
  gl_FragColor = vec4(h, w, 0.0, 1.0);
}
`;

/** Lit, with a normal. Used by the stones, the moss, the tree wood and the roof ridge. */
export const SOLID_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/**
 *   uBase, uGain  grey in shadow, and how much the light adds
 *   uGrain        how fine the speckle is, per world unit
 *   uSpeck        how strong the speckle is: faint on stone, strong on moss
 */
export const SOLID_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform float uBase;
uniform float uGain;
uniform float uGrain;
uniform float uSpeck;
varying vec3 vWorld;
varying vec3 vNormal;

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float lit = max(dot(n, uLight), 0.0);
  // Faces turned away from the eye darken, which draws the outline.
  float rim = 0.55 + 0.45 * max(dot(n, v), 0.0);
  float grain = hash3(floor(vWorld * uGrain)) - 0.5;
  float b = (uBase + uGain * lit + uSpeck * grain) * rim;
  gl_FragColor = vec4(vec3(clamp(b, 0.05, 1.0)), 1.0);
}
`;

/** Pale plaster with a stone footing, timber posts, and the eaves' shadow along the top. */
export const WALL_FRAG = /* glsl */ `
uniform float uWallH;
varying vec3 vWorld;
varying vec2 vUv;

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

void main() {
  float x = vWorld.x;
  float y = vWorld.y;
  float b = 0.66 + 0.08 * (noise2(vec2(x * 0.9, y * 2.2)) - 0.5);
  // Rain streaks down from the eaves.
  b -= 0.07 * smoothstep(0.55, 0.9, noise2(vec2(x * 6.0, 0.5))) * smoothstep(0.4, 1.9, y);
  float post = abs(fract(x / 3.6) - 0.5) * 3.6;
  if (post < 0.09) b = 0.3;
  if (y < 0.34) {
    float row = floor(y * 6.0);
    vec2 cell = floor(vec2(x * 1.6 + row * 0.5, y * 6.0));
    b = 0.36 + 0.12 * hash2(cell);
    if (fract(y * 6.0) < 0.12 || fract(x * 1.6 + row * 0.5) < 0.05) b = 0.2;
  }
  b *= 1.0 - 0.45 * smoothstep(uWallH - 0.45, uWallH, y);
  gl_FragColor = vec4(vec3(clamp(b, 0.05, 1.0)), 1.0);
}
`;

/**
 * The roof's front slope. vUv.y runs 0 at the eave to 1 at the ridge. Runs
 * of round tiles go down the slope, so the ridges repeat along x; courses
 * step up it; the eave ends in a row of round tile faces.
 */
export const ROOF_FRAG = /* glsl */ `
uniform float uTile;
uniform float uSlope;
varying vec3 vWorld;
varying vec2 vUv;

void main() {
  float across = fract(vWorld.x / uTile);
  float bulge = sin(across * 3.14159);
  float b = 0.14 + 0.36 * bulge * (0.55 + 0.45 * (1.0 - across));
  float course = fract(vUv.y * 9.0);
  b *= 0.72 + 0.28 * smoothstep(0.0, 0.25, course);
  float up = vUv.y * uSlope;
  if (up < 0.2) {
    vec2 q = vec2((across - 0.5) * uTile, up - 0.1);
    b = length(q) < 0.1 ? 0.56 : 0.1;
  }
  gl_FragColor = vec4(vec3(clamp(b, 0.05, 1.0)), 1.0);
}
`;

/**
 * Blossoms on the trees: flat sprites that always face the camera, each a
 * cell of the flower picture.
 *
 *   aCentre  where it hangs
 *   aLook    size, turn, cell, how bright
 */
export const BLOSSOM_VERT = /* glsl */ `
attribute vec3 aCentre;
attribute vec4 aLook;
uniform float uCols;
uniform float uRows;
varying vec2 vCellUv;
varying float vShade;

void main() {
  vec4 mv = viewMatrix * vec4(aCentre, 1.0);
  float c = cos(aLook.y);
  float s = sin(aLook.y);
  vec2 corner = position.xy;
  mv.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * aLook.x;
  gl_Position = projectionMatrix * mv;
  float col = mod(aLook.z, uCols);
  float row = floor(aLook.z / uCols);
  vCellUv = vec2((col + uv.x) / uCols, (uRows - row - 1.0 + uv.y) / uRows);
  vShade = aLook.w;
}
`;

/**
 * Petals falling from the trees. Where each one is comes from the time
 * alone, so nothing is sent to the GPU per frame but the clock.
 *
 *   aSeed  start x, start z, phase 0..1, seconds per fall
 */
export const PETAL_VERT = /* glsl */ `
attribute vec4 aSeed;
attribute vec4 aLook;
uniform float uTime;
uniform float uTop;
uniform float uCols;
uniform float uRows;
varying vec2 vCellUv;
varying float vShade;

void main() {
  float t = fract(uTime / aSeed.w + aSeed.z);
  float sway = sin(t * 9.0 + aSeed.z * 30.0);
  vec3 c = vec3(aSeed.x + t * 1.6 + 0.3 * sway, mix(uTop, -0.05, t), aSeed.y + t * 2.6);
  float size = aLook.x * smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.93, 1.0, t));
  float ang = aLook.y + t * 7.0 + sway * 0.5;
  // A petal turning over shows its edge: squash it across as it flips.
  float flip = 0.35 + 0.65 * abs(cos(t * 11.0 + aSeed.z * 20.0));
  vec2 corner = position.xy * vec2(flip, 1.0);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float cs = cos(ang);
  float sn = sin(ang);
  mv.xy += vec2(cs * corner.x - sn * corner.y, sn * corner.x + cs * corner.y) * size;
  gl_Position = projectionMatrix * mv;
  float col = mod(aLook.z, uCols);
  float row = floor(aLook.z / uCols);
  vCellUv = vec2((col + uv.x) / uCols, (uRows - row - 1.0 + uv.y) / uRows);
  vShade = aLook.w;
}
`;

export const FLOWER_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vCellUv;
varying float vShade;

void main() {
  vec4 t = texture2D(uAtlas, vCellUv);
  if (t.a < 0.5) discard;
  gl_FragColor = vec4(vec3(max(t.r * vShade, 0.06)), 1.0);
}
`;

/**
 * The skill pebbles: pale, lit, with the skill's mark on the crown cut
 * out in black so the dither drops it and the plum shows through.
 * vLocal is the pebble's own unit shape, flattened, before it is placed.
 */
export const PEBBLE_VERT = /* glsl */ `
attribute float aCell;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vCell;

void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vLocal = position;
  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vCell = aCell;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const PEBBLE_FRAG = /* glsl */ `
uniform sampler2D uMarks;
uniform float uCols;
uniform float uRows;
uniform vec3 uLight;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vCell;

void main() {
  vec3 n = normalize(vNormal);
  float lit = max(dot(n, uLight), 0.0);
  float b = 0.42 + 0.5 * lit;
  vec2 q = vLocal.xz / 0.62 * 0.5 + 0.5;
  vec2 cell = vec2(mod(vCell, uCols), floor(vCell / uCols));
  vec2 uv = vec2((cell.x + clamp(q.x, 0.0, 1.0)) / uCols, (uRows - cell.y - 1.0 + 1.0 - clamp(q.y, 0.0, 1.0)) / uRows);
  float m = texture2D(uMarks, uv).a;
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0) * step(0.0, vLocal.y);
  if (m * inside > 0.5) b = 0.0;
  gl_FragColor = vec4(vec3(b), 1.0);
}
`;
