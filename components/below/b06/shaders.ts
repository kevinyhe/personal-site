/**
 * The GLSL of design 06. One vertex shader places, stands up, shears and
 * bends every strip. Five fragment shaders draw the five artworks, one
 * per project, and a sixth draws a skill's mark.
 *
 * Colours are written as the screen's own values and go out untouched:
 * none of these shaders asks three.js to convert them.
 */

/**
 * A strip is a 1 by 1 plane. uSize and uCentre (screen heights) put it in
 * place. uStand tips it about its foot: 1 is upright, 0 is lying on its
 * back. uBend wraps the whole row round an upright cylinder whose radius
 * is 1 / uBend, so the curve is one curve across all the strips.
 */
export const STRIP_VERTEX = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uCentre;
uniform float uBend;
uniform float uShear;
uniform float uStand;
uniform float uMirror;
varying vec2 vUv;

void main() {
  vUv = uv;
  float up = (position.y + 0.5) * uSize.y;
  float lean = (1.0 - uStand) * 1.5707963;
  vec3 p = vec3(position.x * uSize.x, up * cos(lean), -up * sin(lean));
  // The reflection is the same strip hung down from its own foot.
  if (uMirror > 0.5) p.y = -p.y;
  p.x += uCentre.x;
  p.y += uCentre.y - 0.5 * uSize.y;
  p.x += p.y * uShear;
  if (abs(uBend) > 0.0005) {
    float a = p.x * uBend;
    p.x = sin(a) / uBend;
    p.z -= (1.0 - cos(a)) / uBend;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const ART_HEAD = /* glsl */ `
uniform float uTime;
uniform vec4 uWindow;
uniform float uAspect;
uniform float uLight;
uniform float uAlpha;
uniform float uMirror;
uniform float uEdge;
varying vec2 vUv;

const vec3 PLUM = vec3(0.165, 0.051, 0.118);
const vec3 DEEP = vec3(0.102, 0.031, 0.071);
const vec3 PINK = vec3(0.976, 0.725, 0.863);
const vec3 WHITE = vec3(1.0, 1.0, 1.0);
const vec3 APRICOT = vec3(1.0, 0.690, 0.439);
const vec3 MINT = vec3(0.525, 0.890, 0.808);

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// 1 inside a stroke of half width w about d = 0, soft over the next s.
float stroke(float d, float w, float s) {
  return 1.0 - smoothstep(w, w + s, abs(d));
}

// The picture's own space: x across, y up, the middle at 0, 1 tall.
vec2 centred(vec2 q) {
  return vec2((q.x - 0.5) * uAspect, q.y - 0.5);
}
`;

/** uWindow is the part of the picture this strip shows: middle and width
 *  across, middle and height up, each as a share of the picture. */
const ART_FOOT = /* glsl */ `
void main() {
  vec2 q = vec2(uWindow.x + (vUv.x - 0.5) * uWindow.y, uWindow.z + (vUv.y - 0.5) * uWindow.w);
  vec3 col = art(q, uTime);
  // A light line down each long side, so the strip reads as a slab.
  float side = min(vUv.x, 1.0 - vUv.x);
  col += 0.16 * (1.0 - smoothstep(0.0, uEdge, side));
  col *= uLight;
  float a = uAlpha;
  if (uMirror > 0.5) {
    float fade = max(0.0, 1.0 - vUv.y / 0.55);
    a *= 0.30 * fade * fade;
  }
  gl_FragColor = vec4(col, a);
}
`;

/** The speaking coach. Level bands, one above another, each as long as a
 *  voice is loud at that moment: syllables inside phrases, with pauses. */
const ART_SPEECH = /* glsl */ `
vec3 art(vec2 q, float t) {
  float rows = 18.0;
  float row = floor(q.y * rows);
  float inRow = fract(q.y * rows);
  float seed = hash(row + 3.0);
  float phrase = smoothstep(-0.25, 0.35, sin(t * 0.6 + seed * 6.2832));
  float beat = 0.5 + 0.5 * sin(t * (5.0 + seed * 4.0) + row * 1.7);
  float level = phrase * (0.25 + 0.75 * beat * beat);
  float hump = 0.4 + 0.6 * sin(3.14159 * (row + 0.5) / rows);
  float len = 0.05 + 0.92 * level * hump;
  float d = abs(q.x - 0.5) * 2.0;
  float band = smoothstep(0.0, 0.14, inRow) * (1.0 - smoothstep(0.86, 1.0, inRow));
  vec3 col = mix(PLUM, PINK, 0.20 + 0.08 * q.y);
  // The track each band runs in.
  col = mix(col, PINK, 0.12 * band);
  float lit = (1.0 - smoothstep(len - 0.004, len, d)) * band;
  float tip = smoothstep(len - 0.09, len, d);
  col = mix(col, mix(PINK, WHITE, tip), lit);
  // The middle line the levels grow from.
  col = mix(col, APRICOT, stroke(q.x - 0.5, 0.0015, 0.0015));
  return col;
}
`;

/** S-KBD67. Three traces from a motion sensor, scrolling past. */
const ART_TRACES = /* glsl */ `
float signal(float x, float k, float t) {
  return 0.10 * sin(x * 5.0 + t * 1.3 + k * 2.1)
    + 0.05 * sin(x * 17.0 - t * 2.9 + k * 4.0)
    + 0.018 * sin(x * 41.0 + t * 7.0 + k);
}

vec3 art(vec2 q, float t) {
  vec2 p = centred(q);
  vec3 col = mix(DEEP, MINT, 0.19 + 0.06 * q.y);
  // Graph paper, moving with the traces.
  vec2 cell = abs(fract(vec2(p.x + t * 0.12, p.y) * 8.0) - 0.5);
  float grid = max(stroke(cell.x - 0.5, 0.02, 0.02), stroke(cell.y - 0.5, 0.02, 0.02));
  col = mix(col, MINT, 0.16 * grid);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float y = (fk - 1.0) * 0.27 + signal(p.x + t * 0.12, fk, t);
    float d = p.y - y;
    vec3 ink = k == 0 ? MINT : (k == 1 ? PINK : WHITE);
    col += ink * 0.22 * exp(-abs(d) * 38.0);
    col = mix(col, ink, stroke(d, 0.006, 0.006));
  }
  return col;
}
`;

/** King of the Ring. Arcs hung from one point, swinging like arms. */
const ART_ARCS = /* glsl */ `
vec3 art(vec2 q, float t) {
  vec2 p = centred(q);
  vec2 hang = p - vec2(0.0, 0.62);
  float r = length(hang);
  float ang = atan(hang.x, -hang.y);
  vec3 col = mix(PLUM, APRICOT, 0.18 + 0.08 * (1.0 - q.y));
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float radius = 0.22 + 0.17 * fk;
    float speed = 2.4 / sqrt(radius * 4.0);
    float swing = 0.78 * sin(t * speed + fk * 1.9);
    float inRing = stroke(r - radius, 0.022, 0.006);
    float inSpan = stroke(ang - swing, 0.24, 0.02);
    // A faint whole ring shows the way each arc travels.
    col = mix(col, APRICOT, 0.10 * stroke(r - radius, 0.002, 0.003));
    vec3 ink = k == 1 || k == 4 ? PINK : (k == 2 || k == 5 ? WHITE : APRICOT);
    col = mix(col, ink, inRing * inSpan);
  }
  return col;
}
`;

/** mclib. A path plotted on the field, and the robot driving it: drawn
 *  solid where it has been, dotted where it has yet to go. */
const ART_PATH = /* glsl */ `
float path(float x) {
  return 0.20 * sin(x * 3.1 + 0.6) + 0.09 * sin(x * 7.3);
}

float slope(float x) {
  return 0.62 * cos(x * 3.1 + 0.6) + 0.657 * cos(x * 7.3);
}

vec3 art(vec2 q, float t) {
  vec2 p = centred(q);
  vec3 col = mix(DEEP, PINK, 0.18 + 0.05 * q.y);
  // The field's tiles.
  vec2 cell = abs(fract(p * 6.0) - 0.5);
  float grid = max(stroke(cell.x - 0.5, 0.015, 0.015), stroke(cell.y - 0.5, 0.015, 0.015));
  col = mix(col, PINK, 0.20 * grid);

  float reach = uAspect * 0.5 + 0.12;
  float rx = mix(-reach, reach, fract(t * 0.11));
  vec2 robot = vec2(rx, path(rx));

  float d = (p.y - path(p.x)) / sqrt(1.0 + slope(p.x) * slope(p.x));
  float driven = 1.0 - step(rx, p.x);
  float dots = step(0.5, fract(p.x * 18.0));
  col = mix(col, MINT, stroke(d, 0.004, 0.004) * dots * (1.0 - driven) * 0.7);
  col += MINT * 0.20 * exp(-abs(d) * 30.0) * driven;
  col = mix(col, MINT, stroke(d, 0.007, 0.005) * driven);

  // Points the path is drawn through.
  for (int k = 0; k < 5; k++) {
    float wx = (float(k) - 2.0) * 0.3;
    float ring = stroke(length(p - vec2(wx, path(wx))) - 0.028, 0.004, 0.004);
    col = mix(col, APRICOT, ring);
  }

  // The robot: a square turned to face along the path.
  float h = atan(slope(rx));
  vec2 l = p - robot;
  l = vec2(l.x * cos(h) + l.y * sin(h), -l.x * sin(h) + l.y * cos(h));
  float box = max(abs(l.x), abs(l.y));
  col = mix(col, DEEP, 1.0 - smoothstep(0.046, 0.05, box));
  col = mix(col, WHITE, stroke(box - 0.046, 0.005, 0.003));
  col = mix(col, WHITE, stroke(l.y, 0.004, 0.003) * step(0.0, l.x) * (1.0 - step(0.046, l.x)));
  float pulse = fract(t * 0.8);
  col += WHITE * 0.35 * (1.0 - pulse) * stroke(length(p - robot) - (0.06 + 0.10 * pulse), 0.003, 0.004);
  return col;
}
`;

/** Saturn. A banded disc inside slow, tilted rings, and wide rings
 *  spreading out behind it. */
const ART_RINGS = /* glsl */ `
vec3 art(vec2 q, float t) {
  vec2 p = centred(q);
  float r = length(p);
  vec3 col = mix(DEEP, PINK, 0.16 + 0.05 * q.y);
  // Wide rings moving outward, very slowly.
  float wave = fract(r * 5.0 - t * 0.06);
  col = mix(col, PINK, 0.22 * stroke(wave - 0.5, 0.03, 0.05));

  float tilt = -0.38 + 0.10 * sin(t * 0.17);
  vec2 s = vec2(p.x * cos(tilt) - p.y * sin(tilt), p.x * sin(tilt) + p.y * cos(tilt));
  float e = length(vec2(s.x, s.y * 3.4));
  float turn = atan(s.y * 3.4, s.x);
  float inRings = smoothstep(0.27, 0.285, e) * (1.0 - smoothstep(0.69, 0.70, e));
  float gap = stroke(e - 0.50, 0.012, 0.004);
  float grain = 0.62 + 0.38 * sin(e * 95.0 + sin(turn * 2.0 + t * 0.25) * 1.5);
  vec3 ringInk = mix(PINK, WHITE, smoothstep(0.30, 0.68, e)) * grain;
  float rings = inRings * (1.0 - gap);

  float disc = 1.0 - smoothstep(0.168, 0.172, r);
  float bands = 0.5 + 0.5 * sin(s.y * 58.0 + 0.6 * sin(s.x * 9.0 + t * 0.2));
  vec3 discInk = mix(APRICOT, PINK, bands) * (0.72 + 0.28 * smoothstep(-0.17, 0.12, p.x + p.y));

  // The far half of the rings goes behind the disc, the near half in front.
  float front = step(s.y, 0.0);
  col = mix(col, ringInk, rings * (1.0 - front));
  col = mix(col, discInk, disc);
  col = mix(col, ringInk, rings * front);
  return col;
}
`;

const asArt = (body: string): string => `${ART_HEAD}${body}${ART_FOOT}`;

/** In the order of `projects` in profile.ts. */
export const ART_FRAGMENTS: string[] = [ART_SPEECH, ART_TRACES, ART_ARCS, ART_PATH, ART_RINGS].map(asArt);

/**
 * A skill. The ground is the group's colour let down into deep plum. The
 * mark is cut from one sheet that holds all 42, and is drawn square in
 * the middle of the strip at uMark screen heights a side, whatever the
 * strip's width.
 */
export const SKILL_FRAGMENT = /* glsl */ `
uniform sampler2D uMarks;
uniform vec4 uCell;
uniform vec3 uTint;
uniform vec2 uSize;
uniform float uMark;
uniform float uLight;
uniform float uAlpha;
uniform float uEdge;
varying vec2 vUv;

const vec3 DEEP = vec3(0.102, 0.031, 0.071);

void main() {
  vec3 col = mix(DEEP, uTint, 0.20 + 0.14 * vUv.y);
  // Fine level lines, so the ground is not flat.
  float rule = 1.0 - smoothstep(0.0, 0.08, abs(fract(vUv.y * 24.0) - 0.5));
  col = mix(col, uTint, 0.10 * rule);
  vec2 m = (vUv - 0.5) * uSize / uMark + 0.5;
  // Read the sheet for every pixel and mask after: a texture read inside
  // an if has no defined level of detail.
  vec4 mark = texture2D(uMarks, uCell.xy + clamp(m, 0.0, 1.0) * uCell.zw);
  float inside = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
  col = mix(col, mark.rgb, mark.a * inside);
  float side = min(vUv.x, 1.0 - vUv.x);
  col += 0.14 * (1.0 - smoothstep(0.0, uEdge, side));
  gl_FragColor = vec4(col * uLight, uAlpha);
}
`;
