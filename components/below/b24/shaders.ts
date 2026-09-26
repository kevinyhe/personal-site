/**
 * The tiles. One small box per tile, drawn many times over. Each copy knows
 * where it stands in the word it is leaving (aA) and in the word it is going
 * to (aB); uT says how far across the page is. On the way, a tile turns into
 * a petal (the box flattens, pinches at the base, cups and notches at the
 * tip), rides a gust to the right and up, spins, and settles as a tile of
 * the next word. The same sums are in layout.ts (tileLocal, gustOffset) so
 * the Node check can follow a petal.
 *
 * The output is grey on black, for the bar dither: bright faces become wide
 * runs of blossom, dark faces thin ones, black is the plum ground.
 */

export const TILE_VERT = /* glsl */ `
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aSeed;
uniform float uT;
uniform vec2 uSpanA;
uniform float uSizeA;
uniform float uSizeB;
uniform float uYawA;
uniform float uYawB;
uniform float uDepth;
uniform vec3 uPush;
uniform float uPushR;
uniform float uTime;
varying vec3 vView;
varying float vPetal;

mat3 turnY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

vec3 turnAbout(vec3 v, vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

void main() {
  // The gust takes the left of the word first.
  float lead = clamp((aA.x - uSpanA.x) / max(uSpanA.y - uSpanA.x, 0.001), 0.0, 1.0);
  float delay = lead * 0.38 + aSeed.x * 0.12;
  float local = clamp((uT - delay) / 0.5, 0.0, 1.0);
  float e = smoothstep(0.2, 0.9, local);
  float bump = sin(local * 3.14159265);
  float petal = smoothstep(0.0, 0.18, local) * (1.0 - smoothstep(0.82, 1.0, local));

  // The box, and the same box bent into a petal.
  vec3 p = position;
  vec3 tile = vec3(p.xy, p.z * uDepth);
  float t = p.y + 0.5;
  float w = 0.1 + 0.9 * sin(3.14159265 * (0.12 + 0.8 * t));
  float notch = p.y > 0.4 ? 0.14 * (1.0 - abs(p.x) * 2.0) : 0.0;
  vec3 leaf = vec3(p.x * w * 0.8, p.y * 1.25 - notch, p.z * 0.1 + 0.22 * p.x * p.x * 4.0);
  vec3 shape = mix(tile, leaf, petal);

  // A tile only in the word it is leaving shows until it lands, and one only
  // in the word it is going to shows from when it sets off.
  // Tiles in neither word are spare; only some of them fly, or a short word
  // between two short words would still send a storm.
  float spare = step(aA.w + aB.w, 0.5) * step(0.3, aSeed.w);
  float here = max(mix(aA.w, aB.w, e), petal * (1.0 - spare));
  float size = mix(uSizeA, uSizeB, e) * (1.0 + 2.0 * petal) * here;

  vec3 axis = normalize(aSeed.yzw - 0.5 + vec3(0.001, 0.002, 0.003));
  float spin = petal * (local * 9.0 * (0.5 + aSeed.y) + aSeed.z * 6.2832);
  vec3 q = turnY(mix(uYawA, uYawB, e)) * turnAbout(shape * size, axis, spin);

  vec3 home = mix(aA.xyz, aB.xyz, e);
  vec3 gust = vec3(0.55 + 0.9 * aSeed.y, 0.2 + 0.5 * aSeed.z, 0.15 + 0.55 * aSeed.w) * bump;
  gust.y += 0.12 * sin(local * 9.0 + aSeed.x * 6.2832) * bump;
  // A petal held in the air keeps moving a little.
  gust.x += 0.05 * sin(uTime * 0.7 + aSeed.w * 6.2832) * petal;
  gust.y += 0.04 * sin(uTime * 0.9 + aSeed.y * 6.2832) * petal;
  vec3 world = home + gust;

  // The cursor pushes tiles out of its way and toward the viewer, and tips
  // them; uPush.z is a spring, so they rock back past rest and settle.
  vec2 d = world.xy - uPush.xy;
  float near = exp(-dot(d, d) / (uPushR * uPushR)) * uPush.z;
  vec2 away = normalize(d + vec2(0.0001, 0.0));
  world.xy += away * near * uPushR * 0.5;
  world.z += near * 0.3;
  q = turnAbout(q, normalize(vec3(-away.y, away.x, 0.0)), near * 0.9);

  vec4 mv = modelViewMatrix * vec4(world + q, 1.0);
  vView = mv.xyz;
  vPetal = petal;
  gl_Position = projectionMatrix * mv;
}
`;

export const TILE_FRAG = /* glsl */ `
varying vec3 vView;
varying float vPetal;

void main() {
  // Flat faces: the normal from how the surface moves across the screen.
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  // Light from the front and above: faces toward the viewer are bright,
  // the sides of the letters half, the undersides dark (never black).
  vec3 l = normalize(vec3(0.0, 0.47, 0.88));
  float d = dot(n, l);
  // A petal is thin and seen from both sides.
  float lit = mix(max(d, 0.0), abs(d), vPetal);
  float shade = 0.3 + 0.7 * lit;
  gl_FragColor = vec4(vec3(shade), 1.0);
}
`;
