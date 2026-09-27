/**
 * Every shader the field draws with. All written for this page.
 *
 * Colours arrive as uniforms in linear light (three converts the hex
 * values), and the last pass of the composer turns the picture back into
 * sRGB. Nothing in here converts colour itself.
 */

/**
 * Noise, and the curl of it.
 *
 * A point pushed along plain noise bunches up and thins out. Pushed along
 * the CURL of a noise field it cannot: the curl of anything has no sources
 * and no sinks, so the points swirl like smoke and stay evenly spread.
 * The curl is taken by measuring the field a little to each side.
 */
const NOISE = /* glsl */ `
vec3 hash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
}

// Three smooth values per point, each in -1..1.
vec3 field(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), u.x),
        mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), u.x),
        mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}

vec3 curl(vec3 p) {
  const float e = 0.12;
  vec3 dx = field(p + vec3(e, 0.0, 0.0)) - field(p - vec3(e, 0.0, 0.0));
  vec3 dy = field(p + vec3(0.0, e, 0.0)) - field(p - vec3(0.0, e, 0.0));
  vec3 dz = field(p + vec3(0.0, 0.0, e)) - field(p - vec3(0.0, 0.0, e));
  return vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x) / (2.0 * e);
}
`;

/* ------------------------------------------------------------------ */
/* The points                                                          */
/* ------------------------------------------------------------------ */

export const POINTS_VERT = /* glsl */ `
attribute vec4 aSeed;   // four random numbers per point, 0..1
attribute vec4 aWA;     // where the point sits in word 0 (xy) and word 1 (zw)
attribute vec4 aWB;     // word 2, word 3
attribute vec4 aWC;     // word 4 (xy); z = 1 if the point takes part in words

uniform float uTime;
uniform float uScale;        // buffer pixels per world unit at depth 1
uniform float uCamZ;
uniform vec3 uBox;           // size of the box the points live in

uniform vec3 uRayO;          // the cursor, as a line from the camera
uniform vec3 uRayD;
uniform float uStir;

uniform mat4 uPanelMat;      // the panel the points gather on
uniform vec2 uPanelSize;
uniform float uGather;
uniform float uGatherRing;   // the same points, gathered on the ring

uniform float uWordFrom;
uniform float uWordMix;
uniform float uForm;
uniform float uWordScale;    // world width of the word's canvas
uniform float uWordDist;     // how far in front of the camera it stands
uniform float uWordY;        // how far above the middle, world units

uniform float uRingR;
uniform float uRingDist;

uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;

uniform vec4 uQuiet;         // where the DOM text is: centre xy, radius xy, in -1..1 screen units
uniform float uQuietAmt;
uniform float uFieldDim;

uniform vec3 uBlossom;
uniform vec3 uRose;
uniform vec3 uAmber;

varying vec3 vColor;
varying float vAlpha;

${NOISE}

vec2 wordAt(float i) {
  if (i < 0.5) return aWA.xy;
  if (i < 1.5) return aWA.zw;
  if (i < 2.5) return aWB.xy;
  if (i < 3.5) return aWB.zw;
  return aWC.xy;
}

// A point on the outline of the panel, s going once round in 0..1.
vec2 outline(float s, vec2 size) {
  float w = size.x, h = size.y;
  float d = fract(s) * 2.0 * (w + h);
  if (d < w) return vec2(d - w * 0.5, h * 0.5);
  d -= w;
  if (d < h) return vec2(w * 0.5, h * 0.5 - d);
  d -= h;
  if (d < w) return vec2(w * 0.5 - d, -h * 0.5);
  d -= w;
  return vec2(-w * 0.5, d - h * 0.5);
}

void main() {
  // The box is as long as the eye can see and no longer. A point the
  // camera has left behind comes back in at the far end, so the field
  // has no end however far the travel goes.
  vec3 p = position * uBox;
  float front = uCamZ + uBox.z * 0.2;
  p.z = front - mod(front - p.z, uBox.z);

  // Two pushes along the curl: a wide slow one, then a small quick one
  // taken from where the first one left the point.
  vec3 c1 = curl(p * 0.085 + vec3(0.0, 0.0, uTime * 0.016));
  p += c1 * 1.9;
  vec3 c2 = curl(p * 0.27 + vec3(uTime * 0.045, 3.1, 0.0));
  p += c2 * 0.5;

  // The cursor stirs what is near its line of sight: round it and away.
  vec3 rel = p - uRayO;
  float along = dot(rel, uRayD);
  vec3 off = rel - uRayD * along;
  float d = max(length(off), 0.001);
  float reach = exp(-d * d / 3.2) * uStir * smoothstep(0.5, 3.0, along);
  p += (cross(uRayD, off) / d * 1.5 + off / d * 0.7) * reach;

  // Most points are faint and a few are bright, as in any night sky.
  // What the cursor has stirred is lit up a little, so the stir shows.
  float alpha = (0.16 + 0.62 * pow(aSeed.y, 2.5)) * (1.0 + 2.2 * reach);
  float world = 0.026 + 0.07 * pow(aSeed.w, 3.0);

  // One point in eight belongs to the panel in front: they run round its
  // outline while it is on. The same points later run round the ring.
  float rim = step(aSeed.x, 0.07);
  float turn = aSeed.y * 9.0 + uTime * (0.012 + 0.02 * aSeed.z);
  float gp = smoothstep(0.0, 1.0, clamp(uGather * 1.5 - aSeed.z * 0.5, 0.0, 1.0)) * rim;
  if (gp > 0.0) {
    vec2 o = outline(turn, uPanelSize);
    // Most keep close to the edge, a few stray well off it.
    vec3 loose = (aSeed.wzy - 0.5) * vec3(0.3, 0.3, 0.5) * (0.2 + pow(aSeed.x / 0.07, 3.0) * 3.0);
    vec3 tgt = (uPanelMat * vec4(vec3(o, 0.0) + loose, 1.0)).xyz;
    p = mix(p, tgt, gp);
    alpha = mix(alpha, 0.2 + 0.5 * aSeed.w, gp);
    world = mix(world, 0.024, gp);
  }
  float onRing = step(aSeed.x, 0.09);
  float gr = smoothstep(0.0, 1.0, clamp(uGatherRing * 1.5 - aSeed.z * 0.5, 0.0, 1.0)) * onRing;
  if (gr > 0.0) {
    float a = turn * 6.2831853 * 0.35;
    float stray = pow(aSeed.x / 0.09, 2.0);
    float r = uRingR * (1.0 + (aSeed.w - 0.5) * (0.04 + 0.5 * stray));
    vec3 tgt = uCamPos + uCamFwd * (uRingDist + (aSeed.z - 0.5) * 0.9)
      + (uCamRight * cos(a) + uCamUp * sin(a)) * r;
    p = mix(p, tgt, gr);
    alpha = mix(alpha, 0.14 + 0.4 * aSeed.w * (1.0 - stray * 0.5), gr);
    world = mix(world, 0.022, gr);
  }

  // The words. Each point that takes part has a place in every word; it
  // goes from one place to the next with a swerve, later or sooner than
  // its neighbours so the word breaks up and re-forms in a wave.
  float inWord = aWC.z;
  float form = smoothstep(0.0, 1.0, clamp(uForm * 1.5 - aSeed.w * 0.5, 0.0, 1.0)) * inWord;
  if (form > 0.0) {
    float k = smoothstep(0.0, 1.0, clamp(uWordMix * 1.6 - aSeed.y * 0.6, 0.0, 1.0));
    vec2 w = mix(wordAt(uWordFrom), wordAt(uWordFrom + 1.0), k);
    float mid = sin(k * 3.14159265);
    vec3 swerve = (aSeed.xyz - 0.5) * vec3(5.0, 3.0, 6.0) * mid;
    // A slow breathing so the word is made of points and not a print.
    vec2 breathe = 0.0022 * vec2(
      sin(uTime * 0.9 + aSeed.x * 40.0),
      cos(uTime * 0.7 + aSeed.y * 40.0));
    vec3 tgt = uCamPos
      + uCamRight * ((w.x + breathe.x) * uWordScale + swerve.x)
      + uCamUp * ((w.y + breathe.y) * uWordScale + uWordY + swerve.y)
      + uCamFwd * (uWordDist + (aSeed.z - 0.5) * 0.14 + swerve.z);
    p = mix(p, tgt, form);
    alpha = mix(alpha, 0.26 + 0.4 * aSeed.y, form);
    world = mix(world, 0.012 + 0.014 * aSeed.w, form);
  }

  vec4 mv = viewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  gl_Position = projectionMatrix * mv;

  // Far points fade before the box ends; points about to hit the lens
  // fade before they fill the screen.
  alpha *= smoothstep(uBox.z * 0.8, uBox.z * 0.4, depth) * smoothstep(0.4, 2.2, depth);
  alpha *= 0.72 + 0.28 * sin(uTime * (0.6 + aSeed.y * 2.4) + aSeed.x * 50.0);

  float taken = max(max(form, gp), gr);
  alpha *= mix(uFieldDim, 1.0, taken);

  // Keep the field down behind the DOM text.
  vec2 ndc = gl_Position.xy / max(gl_Position.w, 0.0001);
  float q = length((ndc - uQuiet.xy) / uQuiet.zw);
  alpha *= 1.0 - uQuietAmt * (1.0 - smoothstep(0.55, 1.15, q)) * (1.0 - taken);

  // Size by depth. A point smaller than a pixel and a half is drawn at
  // that size and dimmer; a point close to the lens is drawn large and
  // faint, the way a lens draws something out of focus.
  float size = world * uScale / max(depth, 0.05);
  float small = 1.6;
  if (size < small) {
    alpha *= (size / small) * (size / small);
    size = small;
  }
  float big = 0.011 * uScale;
  if (size > big) {
    alpha *= pow(big / size, 1.6);
    size = min(size, 0.07 * uScale);
  }
  gl_PointSize = size;

  // Blossom, through white, to deep rose. Which one a point is depends on
  // the point and on how hard the flow is pushing it, so the colour moves
  // through the field with the swirl.
  float h = clamp(aSeed.z * 0.9 + length(c1) * 0.22 - 0.08, 0.0, 1.0);
  vec3 col = h < 0.42
    ? mix(uBlossom, vec3(1.0), smoothstep(0.1, 0.42, h))
    : mix(vec3(1.0), uRose, smoothstep(0.42, 0.62, h));
  col = mix(col, uAmber, step(0.965, aSeed.x) * 0.8);
  col = mix(col, mix(uBlossom, vec3(1.0), aSeed.y * 0.45), form * 0.9);
  vColor = col;
  vAlpha = alpha;
}
`;

export const POINTS_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = 1.0 - d;
  gl_FragColor = vec4(vColor * a * a * vAlpha, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* The ribbons                                                         */
/* ------------------------------------------------------------------ */

export const RIBBON_VERT = /* glsl */ `
attribute vec3 aNext;   // the curve a step further on, for the direction
attribute vec3 aUv;     // x: 0..1 along, y: -1..1 across, z: which ribbon

uniform float uTime;
uniform float uScale;
uniform float uWidth;
uniform float uRing;
uniform float uRingR;
uniform float uRingDist;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;

varying float vAcross;
varying float vAlong;
varying float vId;
varying float vFade;

// The curve is laid out once on the CPU. This is the slow sway on top.
vec3 sway(vec3 p, float id) {
  return p + vec3(
    sin(p.z * 0.13 + uTime * 0.19 + id * 2.1),
    cos(p.z * 0.11 + uTime * 0.15 + id * 1.3),
    0.0) * 0.55;
}

vec3 ringAt(float t, float id) {
  float a = 6.2831853 * (t + id / 3.0) + uTime * 0.07;
  float r = uRingR * (1.0 + 0.03 * sin(a * 3.0 + uTime * 0.35 + id * 2.1));
  float dz = 0.3 * sin(a * 2.0 + id * 2.1 + uTime * 0.27);
  return uCamPos + uCamFwd * (uRingDist + dz) + (uCamRight * cos(a) + uCamUp * sin(a)) * r;
}

vec3 centre(vec3 base, float t, float id) {
  // The far end closes first, so the ring draws itself round.
  float k = smoothstep(0.0, 1.0, clamp(uRing * 1.5 - (1.0 - t) * 0.5, 0.0, 1.0));
  return mix(sway(base, id), ringAt(t, id), k);
}

void main() {
  float t = aUv.x;
  float id = aUv.z;
  vec3 c0 = centre(position, t, id);
  vec3 c1 = centre(aNext, t + 0.0008, id);
  vec3 dir = normalize(c1 - c0 + vec3(0.0, 0.0, -0.00001));
  vec3 toCam = normalize(cameraPosition - c0);
  vec3 side = normalize(cross(dir, toCam));

  vec4 mv0 = viewMatrix * vec4(c0, 1.0);
  float depth = max(-mv0.z, 0.05);
  // Never thinner than a few pixels, or the far end breaks into dashes.
  float w = max(uWidth, 3.5 * depth / uScale);
  vec3 p = c0 + side * aUv.y * w;

  vAcross = aUv.y;
  vAlong = t;
  vId = id;
  // Dark in the far distance, and gone before it crosses the lens.
  vFade = smoothstep(46.0, 16.0, depth) * smoothstep(0.8, 3.5, depth);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const RIBBON_FRAG = /* glsl */ `
uniform float uTime;
uniform float uRing;
uniform vec2 uRes;
uniform vec4 uQuiet;
uniform float uQuietAmt;
uniform vec3 uBlossom;
uniform vec3 uRose;
uniform vec3 uAmber;

varying float vAcross;
varying float vAlong;
varying float vId;
varying float vFade;

void main() {
  float s = abs(vAcross);
  float edge = (1.0 - s) * (1.0 - s);
  float core = exp(-s * s * 70.0);
  float glow = exp(-s * s * 6.0) * edge;

  // Light runs along the ribbon, slowly.
  float run = 0.55 + 0.45 * sin(vAlong * 150.0 - uTime * 0.8 + vId * 2.0);
  run = mix(run, 0.85 + 0.15 * sin(vAlong * 18.8495559 - uTime * 0.5), uRing);

  vec3 tint = vId < 0.5 ? uBlossom : (vId < 1.5 ? uRose : mix(uBlossom, uAmber, 0.6));
  vec3 col = tint * glow * 0.2 + mix(tint, vec3(1.0), 0.6) * core * 1.25;

  // Turned down behind the DOM text, like the points.
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  float q = length((ndc - uQuiet.xy) / uQuiet.zw);
  float quiet = 1.0 - min(1.0, uQuietAmt * 1.12) * (1.0 - smoothstep(0.6, 1.2, q));

  gl_FragColor = vec4(col * run * vFade * quiet, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* The panels                                                          */
/* ------------------------------------------------------------------ */

export const PANEL_VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const PANEL_FRAG = /* glsl */ `
uniform float uKind;
uniform float uTime;
uniform float uFocus;
uniform float uShow;
uniform vec2 uSize;
uniform sampler2D uTitle;
uniform vec3 uBlossom;
uniform vec3 uRose;
uniform vec3 uAmber;
uniform vec3 uGround;
uniform vec3 uBand;

varying vec2 vUv;

const float TAU = 6.2831853;

float hash1(float n) { return fract(sin(n * 91.345) * 47453.5453); }

// 1 on a line of width w at distance 0, soft over a pixel either side.
float stroke(float d, float w) {
  float px = fwidth(d) + 0.0005;
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + px * 1.5, abs(d));
}

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  return length(pa - ba * h);
}

// The speaking coach: a recording as bars of loudness, with the moments
// a note is pinned to marked under it.
vec3 artSound(vec2 s) {
  vec3 col = vec3(0.0);
  float n = 30.0;
  float x = (s.x * 0.5 + 0.5) * n;
  float id = floor(x);
  float fx = fract(x);
  float inside = step(0.0, id) * step(id, n - 1.0);
  float env = exp(-pow((id / n - 0.5) * 2.1, 2.0));
  float talk = 0.5 + 0.5 * sin(id * 1.7 + uTime * 1.4 + sin(id * 0.37 + uTime * 0.5) * 2.0);
  float h = (0.08 + 0.8 * talk * talk) * env;
  float bar = step(0.24, fx) * step(fx, 0.76) * (1.0 - smoothstep(h - 0.01, h, abs(s.y))) * inside;
  col += mix(uRose, uBlossom, clamp(h * 1.4, 0.0, 1.0)) * bar * (0.75 + 0.5 * (1.0 - abs(s.y) / max(h, 0.01)));
  // The playhead.
  float head = fract(uTime * 0.06) * 2.0 - 1.0;
  col += vec3(1.0) * stroke(s.x - head, 0.012) * step(abs(s.y), 0.95) * 0.9;
  // Notes: a tick under some bars.
  float note = step(0.78, hash1(id + 3.0)) * inside;
  col += uAmber * note * step(0.3, fx) * step(fx, 0.7) * step(abs(s.y + 1.08), 0.035);
  col += uBlossom * 0.35 * stroke(s.y + 1.0, 0.006) * step(abs(s.x), 1.0);
  return col;
}

// S-KBD67: three axes of an IMU. The rough line is what the sensor said,
// the clean one what the filter made of it.
vec3 artImu(vec2 s) {
  vec3 col = vec3(0.0);
  float win = step(abs(s.x), 1.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float y0 = 0.62 - fk * 0.62;
    float x = s.x * (3.0 + fk) + uTime * (0.9 + fk * 0.3);
    float clean = 0.17 * sin(x * 1.9 + fk * 2.0) + 0.07 * sin(x * 0.7 + fk);
    float cell = floor(x * 14.0);
    float rough = clean + 0.085 * mix(hash1(cell + fk * 17.0), hash1(cell + 1.0 + fk * 17.0), fract(x * 14.0)) - 0.042
      + 0.03 * sin(x * 31.0);
    col += uBlossom * 0.22 * stroke(s.y - y0, 0.005) * win;
    col += uRose * 0.95 * stroke(s.y - y0 - rough, 0.014) * win;
    col += mix(uBlossom, vec3(1.0), 0.5) * stroke(s.y - y0 - clean, 0.022) * win;
  }
  // Packet ticks along the foot.
  float tick = step(0.5, fract(s.x * 16.0 - uTime * 1.5)) * step(abs(s.y + 1.06), 0.03) * win;
  col += uAmber * tick * 0.8;
  return col;
}

// King of the Ring: swings of a phone, as arcs with a bright head.
vec3 artArcs(vec2 s) {
  vec3 col = vec3(0.0);
  vec2 c = s - vec2(0.0, -0.15);
  float r = length(c);
  float ang = atan(c.y, c.x);
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float rad = 0.2 + fk * 0.155;
    float dirn = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
    float head = dirn * (uTime * (0.5 + 0.13 * fk) + fk * 1.7);
    float da = mod(dirn * (head - ang), TAU);
    float len = 1.4 + 0.5 * sin(fk * 2.3 + uTime * 0.4);
    float trail = (1.0 - da / len) * step(da, len);
    float ring = stroke(r - rad, 0.02 + 0.02 * trail);
    col += mix(uRose, uBlossom, trail) * ring * trail * 1.2;
    col += vec3(1.0) * ring * smoothstep(0.12, 0.0, da) * 1.2;
    col += uBlossom * 0.12 * stroke(r - rad, 0.004);
  }
  // The ropes of the ring, square, faint.
  vec2 q = abs(c) - vec2(1.0);
  float box = max(q.x, q.y);
  col += uAmber * 0.5 * stroke(box, 0.008);
  return col;
}

// mclib: a field of six tiles by six and the route a robot drives on it.
vec2 route(float t) {
  return vec2(
    0.78 * sin(TAU * t * 1.0 + 0.5) * cos(TAU * t * 0.5),
    0.78 * sin(TAU * t * 1.5 + 1.1));
}

vec3 artPath(vec2 s) {
  vec3 col = vec3(0.0);
  float inside = step(abs(s.x), 1.0) * step(abs(s.y), 1.0);
  vec2 g = abs(fract(s * 3.0 + 0.5) - 0.5) / 3.0;
  float grid = max(stroke(g.x, 0.006), stroke(g.y, 0.006));
  col += uBlossom * 0.2 * grid * step(abs(s.x), 1.01) * step(abs(s.y), 1.01);

  // The whole route is there faintly, as planned. The part the robot
  // has driven is bright. A lap is driven, stands finished, and fades.
  float lap = fract(uTime * 0.04 + 0.3);
  float prog = smoothstep(0.0, 0.62, lap);
  float dmin = 10.0;
  float dall = 10.0;
  vec2 prev = route(0.0);
  vec2 prevAll = prev;
  for (int i = 1; i <= 56; i++) {
    float t = float(i) / 56.0;
    vec2 cur = route(prog * t);
    dmin = min(dmin, segment(s, prev, cur));
    prev = cur;
    vec2 curAll = route(t);
    dall = min(dall, segment(s, prevAll, curAll));
    prevAll = curAll;
  }
  float gone = 1.0 - smoothstep(0.93, 1.0, lap);
  col += uBlossom * 0.3 * stroke(dall, 0.008);
  col += mix(uRose, uBlossom, 0.6) * stroke(dmin, 0.022) * gone;
  col += uRose * 0.4 * exp(-dmin * 14.0) * gone;

  // The robot: a square at the head of the line, turned the way it goes.
  vec2 at = route(prog);
  vec2 ahead = normalize(route(prog + 0.004) - at + vec2(0.00001, 0.0));
  vec2 local = s - at;
  local = vec2(dot(local, ahead), dot(local, vec2(-ahead.y, ahead.x)));
  float body = max(abs(local.x), abs(local.y)) - 0.075;
  col += vec3(1.0) * stroke(body, 0.014) * gone;
  col += uAmber * stroke(segment(local, vec2(0.0), vec2(0.17, 0.0)), 0.014) * gone;
  return col;
}

// Saturn: the planet and its rings.
vec3 artRings(vec2 s) {
  vec3 col = vec3(0.0);
  float tilt = -0.42;
  vec2 c = vec2(cos(tilt) * s.x - sin(tilt) * s.y, sin(tilt) * s.x + cos(tilt) * s.y);
  float r = length(c);
  float ball = 0.4;
  float onBall = 1.0 - smoothstep(ball - 0.01, ball, r);
  float bands = 0.6 + 0.4 * sin(c.y * 34.0 + sin(c.x * 3.0 + uTime * 0.2) * 1.2);
  float lit = clamp(0.25 + 0.9 * dot(normalize(vec3(c, sqrt(max(ball * ball - r * r, 0.0)))), normalize(vec3(-0.6, 0.5, 0.6))), 0.0, 1.0);
  col += mix(uRose, uBlossom, bands) * onBall * lit * 0.9;

  vec2 e = vec2(c.x, c.y / 0.3);
  float rr = length(e);
  float band = smoothstep(0.58, 0.6, rr) * (1.0 - smoothstep(1.06, 1.08, rr));
  band *= 0.45 + 0.55 * sin(rr * 70.0) * sin(rr * 23.0 + 1.0);
  band *= 1.0 - (smoothstep(0.84, 0.85, rr) * (1.0 - smoothstep(0.88, 0.89, rr)));
  // The far half of the rings goes behind the planet.
  float behind = step(0.0, c.y) * onBall;
  col += mix(uBlossom, vec3(1.0), 0.4) * max(band, 0.0) * (1.0 - behind) * 0.95;

  // A moon on its way round.
  float a = uTime * 0.25;
  vec2 m = vec2(cos(a) * 1.2, sin(a) * 0.36);
  float hidden = step(0.0, sin(a)) * (1.0 - smoothstep(ball - 0.02, ball + 0.02, length(m)));
  col += uAmber * (1.0 - smoothstep(0.03, 0.045, length(c - m))) * (1.0 - hidden) * 1.2;
  return col;
}

void main() {
  // Rounded corners, cut in the shader so the mesh stays one quad.
  vec2 p = (vUv - 0.5) * uSize;
  float rad = 0.16;
  vec2 q = abs(p) - uSize * 0.5 + rad;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
  if (d > 0.0) discard;

  float lit = 0.3 + 0.7 * uFocus;
  vec3 col = mix(uGround, uBand, smoothstep(-0.2, 1.0, vUv.y) * 0.85);
  col *= 0.75 + 0.25 * lit;

  if (gl_FrontFacing) {
    // The drawing takes the top of the panel; the title has the foot.
    vec2 s = (p - vec2(0.0, 0.52)) / 1.5;
    vec3 art = vec3(0.0);
    if (uKind < 0.5) art = artSound(s);
    else if (uKind < 1.5) art = artImu(s);
    else if (uKind < 2.5) art = artArcs(s);
    else if (uKind < 3.5) art = artPath(s);
    else art = artRings(s);
    col += art * lit;

    // The title stays under the level the bloom starts at, so it is
    // sharp; the drawing above it may go over and glow.
    float title = texture2D(uTitle, vUv).r;
    col = mix(col, vec3(0.5 + 0.32 * lit), title);
  }

  // A lit edge.
  float rim = exp(d * 38.0);
  col += mix(uRose, uBlossom, 0.6) * rim * (0.25 + 0.75 * lit);

  // A panel comes out of the dark as the camera nears it (uShow).
  gl_FragColor = vec4(col, uShow);
}
`;

/* ------------------------------------------------------------------ */
/* The ground behind everything                                        */
/* ------------------------------------------------------------------ */

export const GROUND_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // Already in screen space: the quad is the screen.
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

export const GROUND_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAspect;
uniform float uDrift;
uniform vec3 uGround;
uniform vec3 uFar;
uniform vec3 uRose;

varying vec2 vUv;

${NOISE}

void main() {
  vec2 c = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(c);
  vec3 col = mix(uGround, uFar, smoothstep(0.1, 1.0, r));
  // Two slow clouds of rose, far off, so the dark has somewhere to go.
  vec3 n = field(vec3(c * 1.3, uTime * 0.02 + uDrift * 0.02));
  float cloud = smoothstep(0.1, 0.9, n.x * 0.5 + 0.5) * smoothstep(-0.2, 0.8, n.y);
  col += uRose * cloud * 0.045;
  // A little grain, or the gradient shows steps on a dark screen.
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.004;
  gl_FragColor = vec4(col, 1.0);
}
`;
