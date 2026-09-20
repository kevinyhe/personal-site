import { BLOSSOM, CREAM, DEEP, MAUVE, PLUM, rgbOf, ROSE, WINE } from "./layout";

/**
 * The GLSL of design 09. One material draws every sheet: the five
 * pictures, the swap between two of them, the card faces and the flat
 * ground are all in one fragment shader.
 *
 * Colours are written as the screen's own values and are not converted,
 * so #f9b9dc here is #f9b9dc on the page.
 */

const vec3Of = (hex: string): string =>
  `vec3(${rgbOf(hex)
    .map((c) => c.toFixed(4))
    .join(", ")})`;

const COLOURS = `
const vec3 PLUM = ${vec3Of(PLUM)};
const vec3 DEEP = ${vec3Of(DEEP)};
const vec3 BLOSSOM = ${vec3Of(BLOSSOM)};
const vec3 WINE = ${vec3Of(WINE)};
const vec3 ROSE = ${vec3Of(ROSE)};
const vec3 MAUVE = ${vec3Of(MAUVE)};
const vec3 CREAM = ${vec3Of(CREAM)};
const vec3 WHITE = vec3(1.0, 1.0, 1.0);
`;

export const SHEET_VERTEX = `
uniform float uTime;
uniform float uWave;
uniform float uPhase;
uniform float uEdge;
uniform float uIdle;
uniform vec2 uPointer;
uniform vec2 uSize;
varying vec2 vUv;
varying float vLift;
varying float vSlope;

void main() {
  vUv = uv;
  // The wave is highest where the two pictures meet.
  float off = (uv.x - uEdge) * 2.6;
  float amp = uWave * (0.3 + 0.7 * exp(-off * off));
  float a = uv.x * 11.0 - uPhase + uv.y * 1.4;
  // The ground keeps a slow ripple, and rings spread from the cursor.
  float b = uv.x * 5.0 + uv.y * 3.0 + uTime * 0.6;
  float away = length((uv - uPointer) * uSize);
  float c = away * 5.0 - uTime * 2.4;
  float ring = exp(-away * 0.7) * uIdle;
  float lift = sin(a) * amp + sin(b) * uIdle + sin(c) * ring;
  vLift = lift;
  vSlope = cos(a) * amp + cos(b) * uIdle + cos(c) * ring;
  vec3 p = position;
  // Mostly toward the camera, and a little up and down, so the top and
  // bottom edges wave as well.
  p.z += lift;
  p.y += lift * 0.12;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const HELPERS = `
float hash(float n) {
  return fract(sin(n) * 43758.5453);
}
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
// d is a distance to an edge, negative inside. aa is the width of one pixel.
float fill(float d, float aa) {
  return 1.0 - smoothstep(-aa, aa, d);
}
// A line of half width w along d = 0.
float stroke(float d, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, abs(d));
}
`;

// Every picture is drawn in q: x runs 0 to 1.6, y runs 0 to 1, so a
// circle in q is a circle on the sheet.

/** The Actually Company: levels of a voice over time, the band to keep
 *  it in, and a mark over each filler word. */
const ART_0 = `
vec3 art0(vec2 uv, float t, float aa) {
  vec3 col = BLOSSOM;
  float band = abs(uv.y - 0.5) - 0.2;
  col = mix(col, CREAM, 0.7 * fill(band, aa));
  float dash = step(0.5, fract(uv.x * 40.0));
  col = mix(col, WINE, 0.6 * dash * stroke(band, 0.002, aa));

  float pitch = 0.025;
  float x = uv.x + t * 0.04;
  float id = floor(x / pitch);
  float fx = fract(x / pitch);
  float phrase = smoothstep(-0.2, 0.3, sin(id * 0.17) + 0.6 * sin(id * 0.053 + 1.0));
  float level = 0.02 + phrase * (0.07 + 0.3 * hash(id * 1.37 + 2.0));
  float bar = fill(abs(fx - 0.5) - 0.3, aa / pitch) * fill(abs(uv.y - 0.5) - level, aa);
  float flagged = step(0.86, hash(id * 3.1 + 9.0)) * step(0.5, phrase);
  float played = 1.0 - smoothstep(0.62 - aa, 0.62 + aa, uv.x);
  vec3 barCol = mix(MAUVE, PLUM, played);
  barCol = mix(barCol, WINE, flagged);
  col = mix(col, barCol, bar);

  vec2 m = vec2((fx - 0.5) * pitch * 1.6, uv.y - (0.5 + level + 0.05));
  float disc = length(m) - 0.013;
  col = mix(col, WHITE, fill(disc, aa) * flagged);
  col = mix(col, WINE, stroke(disc, 0.003, aa) * flagged);

  // Where the playback is.
  col = mix(col, PLUM, stroke(uv.x - 0.62, 0.0022, aa));
  vec2 h = vec2((uv.x - 0.62) * 1.6, uv.y - 0.94);
  col = mix(col, PLUM, fill(abs(h.x) + abs(h.y) - 0.022, aa));
  return col;
}
`;

/** S-KBD67: three traces from the motion sensor, and where they aim. */
const ART_1 = `
float trace(float x, float t, float k) {
  return sin(x * (5.0 + k * 2.3) + t * (1.1 + 0.4 * k) + k * 1.7) * 0.5
    + sin(x * (13.0 + k * 3.1) - t * (1.7 + 0.3 * k)) * 0.22
    + sin(x * 31.0 + t * 3.0 + k) * 0.06;
}
vec3 art1(vec2 uv, float t, float aa) {
  vec2 q = vec2(uv.x * 1.6, uv.y);
  vec3 col = CREAM;
  vec2 g = abs(fract(q * 10.0 + 0.5) - 0.5) / 10.0;
  float grid = max(stroke(g.x, 0.0012, aa), stroke(g.y, 0.0012, aa));
  col = mix(col, MAUVE, 0.3 * grid);

  for (int i = 0; i < 3; i++) {
    float k = float(i);
    float base = 0.78 - 0.28 * k;
    float y0 = base + 0.09 * trace(q.x, t, k);
    float y1 = base + 0.09 * trace(q.x + 0.004, t, k);
    float slope = (y1 - y0) / 0.004;
    float d = (uv.y - y0) / sqrt(1.0 + slope * slope);
    vec3 c = PLUM;
    if (i == 1) c = WINE;
    if (i == 2) c = ROSE;
    col = mix(col, c, stroke(d, 0.0048, aa));
  }

  vec2 c = vec2(0.8 + 0.42 * trace(0.3, t * 0.6, 0.0), 0.5 + 0.3 * trace(0.9, t * 0.6, 1.0));
  vec2 p = q - c;
  float r = length(p);
  float ring = stroke(r - 0.12, 0.004, aa);
  float armX = stroke(p.y, 0.003, aa) * step(0.04, abs(p.x)) * step(abs(p.x), 0.2);
  float armY = stroke(p.x, 0.003, aa) * step(0.04, abs(p.y)) * step(abs(p.y), 0.2);
  float mid = fill(r - 0.009, aa);
  col = mix(col, PLUM, max(max(ring, mid), max(armX, armY)));
  return col;
}
`;

/** King of the Ring: three punches, each an arc of dots, each ending in
 *  rings where it lands. */
const ART_2 = `
vec3 art2(vec2 uv, float t, float aa) {
  vec2 q = vec2(uv.x * 1.6, uv.y);
  vec3 col = PLUM;
  // The ropes.
  for (int r = 0; r < 3; r++) {
    float y = 0.1 + 0.07 * float(r);
    col = mix(col, ROSE, 0.55 * stroke(uv.y - y, 0.003, aa));
  }

  for (int i = 0; i < 3; i++) {
    float k = float(i);
    float ph = fract(t * 0.36 + k * 0.371);
    vec2 c = vec2(0.42 + 0.38 * k, 0.36 + 0.1 * hash(k + 2.0));
    float R = 0.36 - 0.04 * k;
    float side = 1.0;
    if (i == 1) side = -1.0;
    float a0 = 1.5708 + side * 1.9;
    float swing = smoothstep(0.0, 0.35, ph);
    swing = swing * swing;
    float fade = 1.0 - smoothstep(0.8, 1.0, ph);

    for (int j = 0; j < 16; j++) {
      float s = float(j) / 15.0;
      float a = a0 - side * 2.4 * s * swing;
      vec2 p = c + R * vec2(cos(a), sin(a));
      float on = fill(length(q - p) - (0.007 + 0.017 * s), aa);
      col = mix(col, BLOSSOM, on * fade * (0.4 + 0.6 * s));
    }

    float aEnd = a0 - side * 2.4 * swing;
    vec2 hit = c + R * vec2(cos(aEnd), sin(aEnd));
    float far = length(q - hit);
    col = mix(col, WHITE, fill(far - 0.034, aa) * fade);

    float after = clamp((ph - 0.35) / 0.55, 0.0, 1.0);
    float live = step(0.35, ph) * (1.0 - after * after);
    col = mix(col, WHITE, stroke(far - 0.034 - after * 0.14, 0.006, aa) * live);
    col = mix(col, BLOSSOM, stroke(far - 0.034 - after * 0.26, 0.0045, aa) * live);
    col = mix(col, ROSE, stroke(far - 0.034 - after * 0.4, 0.003, aa) * live);
  }
  return col;
}
`;

/** mclib: a robot driving the path plotted for it over a field of tiles. */
const ART_3 = `
vec2 pathAt(float s) {
  return vec2(0.8 + 0.5 * sin(s), 0.5 + 0.3 * sin(2.0 * s + 0.5));
}
// How far p is from the straight line a to b.
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float along = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * along);
}
vec3 art3(vec2 uv, float t, float aa) {
  vec2 q = vec2(uv.x * 1.6, uv.y);
  vec3 col = CREAM;
  vec2 cell = floor(q / 0.2);
  col = mix(col, BLOSSOM, 0.4 * mod(cell.x + cell.y, 2.0));
  vec2 g = abs(fract(q / 0.2 + 0.5) - 0.5) * 0.2;
  col = mix(col, MAUVE, 0.5 * max(stroke(g.x, 0.0015, aa), stroke(g.y, 0.0015, aa)));

  // The plotted path, as dashes.
  float least = 10.0;
  for (int j = 0; j < 48; j++) {
    float s = float(j) * 0.1309;
    least = min(least, segment(q, pathAt(s), pathAt(s + 0.08)));
  }
  col = mix(col, WINE, fill(least - 0.0045, aa));

  // The part just driven, thick at the robot and thin behind.
  float s0 = t * 0.45;
  float trail = 10.0;
  for (int j = 0; j < 14; j++) {
    float back = float(j) * 0.09;
    float d = segment(q, pathAt(s0 - back), pathAt(s0 - back - 0.09));
    trail = min(trail, d - 0.014 * (1.0 - float(j) / 14.0));
  }
  col = mix(col, PLUM, fill(trail, aa));

  vec2 at = pathAt(s0);
  vec2 ahead = normalize(pathAt(s0 + 0.02) - at);
  vec2 l = q - at;
  vec2 b = vec2(dot(l, ahead), dot(l, vec2(-ahead.y, ahead.x)));
  float body = max(abs(b.x), abs(b.y)) - 0.075;
  col = mix(col, PLUM, fill(body, aa));
  // Wheels along both sides, and a mark at the front.
  float wheels = max(abs(b.x) - 0.058, abs(abs(b.y) - 0.064) - 0.011);
  col = mix(col, BLOSSOM, fill(wheels, aa));
  float nose = max(abs(b.x - 0.045) - 0.014, abs(b.y) - 0.028);
  col = mix(col, WHITE, fill(nose, aa));
  return col;
}
`;

/** Saturn: the planet, its rings, a moon, and stars. */
const ART_4 = `
vec3 art4(vec2 uv, float t, float aa) {
  vec2 q = vec2(uv.x * 1.6, uv.y);
  vec3 col = DEEP;

  vec2 sc = floor(q * 24.0);
  vec2 sf = fract(q * 24.0) - 0.5;
  float h = hash2(sc);
  vec2 jitter = 0.5 * (vec2(hash2(sc + 1.7), hash2(sc + 5.1)) - 0.5);
  float star = fill(length(sf - jitter) - 0.05 - 0.06 * hash2(sc + 9.0), aa * 24.0) * step(0.84, h);
  col = mix(col, WHITE, star * (0.6 + 0.4 * sin(t * 1.5 + h * 40.0)));

  vec2 p = q - vec2(0.8, 0.5);
  // The planet leans. e is p turned by that lean.
  vec2 e = vec2(0.9287 * p.x + 0.3709 * p.y, -0.3709 * p.x + 0.9287 * p.y);
  float squash = 0.3 + 0.04 * sin(t * 0.3);
  float rr = length(vec2(e.x, e.y / squash));
  float ring = fill(abs(rr - 0.47) - 0.11, aa / squash) * (1.0 - stroke(rr - 0.5, 0.009, aa / squash));
  vec3 ringCol = mix(BLOSSOM, WHITE, 0.35 + 0.35 * sin(rr * 90.0));
  float front = step(e.y, 0.0);
  col = mix(col, ringCol, ring * (1.0 - front));

  float disc = fill(length(p) - 0.26, aa);
  float lat = e.y / 0.26;
  vec3 pc = mix(ROSE, BLOSSOM, 0.5 + 0.5 * sin(lat * 9.0 + 0.6 * sin(e.x * 6.0 + t * 0.4)));
  pc = mix(pc, CREAM, 0.4 * smoothstep(0.2, 0.9, abs(lat)));
  float lit = smoothstep(-0.5, 0.4, dot(p / 0.26, vec2(-0.8137, 0.5812)));
  pc = mix(WINE, pc, 0.25 + 0.75 * lit);
  col = mix(col, pc, disc);
  col = mix(col, ringCol, ring * front);

  float ma = t * 0.25;
  vec2 moon = vec2(cos(ma) * 0.68, sin(ma) * 0.68 * squash);
  float behind = step(0.0, sin(ma)) * disc;
  col = mix(col, WHITE, fill(length(e - moon) - 0.022, aa) * (1.0 - behind));
  return col;
}
`;

export const SHEET_FRAGMENT = `
uniform float uTime;
uniform float uFrom;
uniform float uTo;
uniform float uMix;
uniform float uDir;
uniform float uEdge;
uniform float uPhase;
uniform vec3 uCropFrom;
uniform vec3 uCropTo;
uniform float uSoft;
uniform vec2 uSize;
uniform float uRound;
uniform float uPixel;
uniform sampler2D uFace;
uniform float uCard;
uniform vec3 uFlatColour;
uniform float uFlat;
uniform float uAlpha;
varying vec2 vUv;
varying float vLift;
varying float vSlope;
${COLOURS}
${HELPERS}
${ART_0}
${ART_1}
${ART_2}
${ART_3}
${ART_4}

vec3 art(float id, vec2 uv, float t, float aa) {
  if (id < 0.5) return art0(uv, t, aa);
  if (id < 1.5) return art1(uv, t, aa);
  if (id < 2.5) return art2(uv, t, aa);
  if (id < 3.5) return art3(uv, t, aa);
  return art4(uv, t, aa);
}

// The part of a picture a sheet shows.
vec2 cropped(vec3 crop, vec2 uv) {
  return crop.xy + (uv - 0.5) * crop.z;
}

float roundBox(vec2 p, vec2 reach, float r) {
  vec2 d = abs(p) - reach + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

void main() {
  // The line between the two pictures bends with the wave.
  float x = vUv.x + vLift * 0.25 + 0.025 * sin(vUv.y * 9.0 + uPhase);
  float second = smoothstep(uEdge - 0.004, uEdge + 0.004, x);
  if (uDir < 0.0) second = 1.0 - second;
  if (uMix <= 0.0) second = 0.0;
  if (uMix >= 1.0) second = 1.0;

  // Both pictures slide the way the swap is going.
  vec2 slide = vec2(0.18 * uDir, 0.0);
  vec3 col;
  if (second <= 0.0) {
    col = art(uFrom, cropped(uCropFrom, vUv + slide * uMix), uTime, uSoft * uCropFrom.z);
  } else if (second >= 1.0) {
    col = art(uTo, cropped(uCropTo, vUv - slide * (1.0 - uMix)), uTime, uSoft * uCropTo.z);
  } else {
    vec3 a = art(uFrom, cropped(uCropFrom, vUv + slide * uMix), uTime, uSoft * uCropFrom.z);
    vec3 b = art(uTo, cropped(uCropTo, vUv - slide * (1.0 - uMix)), uTime, uSoft * uCropTo.z);
    col = mix(a, b, second);
  }

  // The card's face comes up from the foot of the sheet.
  float faceOn = smoothstep(vUv.y * 0.6, vUv.y * 0.6 + 0.4, uCard);
  col = mix(col, texture2D(uFace, vUv).rgb, faceOn);
  col = mix(col, uFlatColour, uFlat);

  // Light from the slope of the wave, so the wave can be seen.
  col += vSlope * (0.35 + 0.6 * uFlat);

  float d = roundBox((vUv - 0.5) * uSize, uSize * 0.5, uRound);
  float inside = 1.0 - smoothstep(-uPixel, 0.0, d);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), inside * uAlpha);
}
`;

export const SHADOW_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** A dark shape with a soft edge. */
export const SHADOW_FRAGMENT = `
uniform float uAlpha;
uniform vec2 uSize;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float soft = 0.16 * uSize.y;
  vec2 d = abs(p) - (uSize * 0.5 - soft);
  float far = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  float a = 1.0 - smoothstep(-soft * 0.4, soft, far);
  gl_FragColor = vec4(0.04, 0.0, 0.03, a * a * uAlpha);
}
`;
