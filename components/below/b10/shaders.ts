/**
 * The three shaders of the page. Two of them draw on a rectangle that
 * covers the whole screen.
 *
 *   MASK       one step of the trail: yesterday's mask, moved and faded,
 *              with today's strokes added.
 *   COMPOSITE  the picture: the contour ground, then the robot, solid
 *              where the mask is empty and drawn where it is full.
 *
 * Colours here are linear. COMPOSITE turns its result into the screen's
 * colour space at the end.
 */

/** How many strokes one step of the trail can take. */
export const STROKES = 6;

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Smooth noise, about -0.7 to 0.7. Its slope has no steps, so lines of equal value have no corners. */
const NOISE = /* glsl */ `
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec2 slope(vec2 cell) {
  float a = 6.2831853 * hash(cell);
  return vec2(cos(a), sin(a));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(slope(i), f);
  float b = dot(slope(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(slope(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(slope(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
`;

export const MASK_FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uAspect;
uniform float uTime;
uniform float uKeep;
uniform float uDrop;
uniform float uFloor;
uniform float uFlow;
uniform vec4 uSeg[${STROKES}];
uniform vec2 uBlob[${STROKES}];
varying vec2 vUv;
${NOISE}
// One stroke: a line from seg.xy to seg.zw with round ends.
// blob.x is its radius, blob.y how strong it is.
float stroke(vec2 p, vec4 seg, vec2 blob) {
  vec2 a = seg.xy;
  vec2 ab = seg.zw - seg.xy;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
  float d = length(p - a - ab * h);
  // A stroke that is not in use has no radius, and smoothstep between
  // two equal numbers has no answer.
  float r = max(blob.x, 0.001);
  return blob.y * (1.0 - smoothstep(r * 0.4, r, d));
}

void main() {
  // p is the screen in heights: x runs 0 to the aspect, y 0 to 1.
  vec2 p = vec2(vUv.x * uAspect, vUv.y);

  // The old mask is read from a little way off, a different way at each
  // place, so it drifts and its edge wobbles. It also sinks slowly.
  vec2 q = p * 2.6;
  vec2 push = vec2(noise(q + vec2(0.0, uTime * 0.19)), noise(q + vec2(31.7, -uTime * 0.16)));
  push.y -= 0.3;
  vec2 from = vUv - vec2(push.x / uAspect, push.y) * uFlow;

  // A slight blur, which rounds the edge the way surface tension would.
  float m = texture2D(uPrev, from).r * 0.4;
  m += texture2D(uPrev, from + vec2(uTexel.x, 0.0)).r * 0.15;
  m += texture2D(uPrev, from - vec2(uTexel.x, 0.0)).r * 0.15;
  m += texture2D(uPrev, from + vec2(0.0, uTexel.y)).r * 0.15;
  m += texture2D(uPrev, from - vec2(0.0, uTexel.y)).r * 0.15;

  // The fade. uFloor is for a mask kept in 8 bits, where a small fade
  // would round back to the same number and never finish.
  m = max(min(m * uKeep - uDrop, m - uFloor), 0.0);

  for (int i = 0; i < ${STROKES}; i++) {
    m = max(m, stroke(p, uSeg[i], uBlob[i]));
  }
  gl_FragColor = vec4(min(m, 1.0), 0.0, 0.0, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uSolid;
uniform sampler2D uDraw;
uniform sampler2D uMask;
uniform vec2 uPixel;
uniform float uAspect;
uniform float uTime;
uniform float uSplit;
uniform float uOpen;
uniform float uLine;
uniform vec3 uSpot;
uniform vec3 uPlum;
uniform vec3 uDeep;
uniform vec3 uBlossom;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);

  // The mask, read with a small wobble. "inside" is 1 where the drawing
  // shows. "rim" is a thin line where the mask crosses one half.
  vec2 wob = vec2(noise(p * 4.0 + vec2(0.0, uTime * 0.23)), noise(p * 4.0 + vec2(9.1, -uTime * 0.2))) * 0.012;
  float raw = texture2D(uMask, vUv + vec2(wob.x / uAspect, wob.y)).r;
  float edge = (raw - 0.5) / max(fwidth(raw), 0.0005);
  float inside = smoothstep(-1.0, 1.0, edge);
  float rim = 1.0 - smoothstep(uLine, uLine + 1.2, abs(edge));

  // The still frame: solid on the left half, drawn on the right half.
  float side = (vUv.x - 0.5) / uPixel.x;
  inside = mix(inside, smoothstep(-1.0, 1.0, side), uSplit);
  rim = mix(rim, 1.0 - smoothstep(uLine, uLine + 1.2, abs(side)), uSplit);

  // The ground: lines of equal height on a slow field. Every fourth line
  // is stronger, as on a map.
  vec2 c = p * 1.4;
  float f = noise(c + vec2(uTime * 0.011, uTime * 0.007)) * 0.72;
  f += noise(c * 2.3 + vec2(-uTime * 0.013, 4.0 + uTime * 0.009)) * 0.28;
  float v = f * 22.0;
  float iso = abs(fract(v) - 0.5) / max(fwidth(v), 0.004);
  float line = 1.0 - smoothstep(uLine * 0.5, uLine * 0.5 + 1.0, iso);
  float major = 1.0 - step(0.5, mod(floor(v), 4.0));
  float ink = line * (0.06 + 0.09 * major);

  // A little light on the ground behind the robot, to lift it off.
  float glow = 1.0 - smoothstep(0.0, uSpot.z, distance(p, uSpot.xy));
  glow *= glow;
  vec3 groundA = uPlum + uBlossom * (ink + glow * 0.05);
  vec3 groundB = uDeep + uBlossom * (ink * 2.4 + glow * 0.025);

  // The two robots. Their colours are already multiplied by how much of
  // the pixel they cover. The drawing's lines are one pixel wide, so they
  // are spread into the four pixels next to them at part strength.
  vec4 a = texture2D(uSolid, vUv);
  vec4 b = texture2D(uDraw, vUv);
  vec4 bx = max(texture2D(uDraw, vUv + vec2(uPixel.x, 0.0)), texture2D(uDraw, vUv - vec2(uPixel.x, 0.0)));
  vec4 by = max(texture2D(uDraw, vUv + vec2(0.0, uPixel.y)), texture2D(uDraw, vUv - vec2(0.0, uPixel.y)));
  b = max(b, max(bx, by) * 0.4);

  vec3 ca = groundA * (1.0 - a.a) + a.rgb;
  vec3 cb = groundB * (1.0 - b.a) + b.rgb;
  vec3 col = mix(ca, cb, inside);
  col = mix(col, vec3(1.0, 0.9, 0.95), rim * 0.9);

  // uOpen lets the page behind the canvas show through the ground, never
  // through the robot. The large type of the skills step stands there.
  float cover = mix(a.a, b.a, inside);
  float alpha = 1.0 - uOpen * (1.0 - cover) * (1.0 - rim);

  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
}
`;
