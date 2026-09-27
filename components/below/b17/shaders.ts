import { SMALL_END, SMALL_STEP, SMALL_X, SMALL_Z0 } from "./path";

/**
 * The night's shaders. Every one writes a single grey, and that grey is
 * how much blossom the bar shader draws there: 0.04 is a hairline on
 * plum, 1.0 is a full bar. So "bright" here means "more blossom".
 *
 * Light comes from the lanterns only. Each project lantern is a point
 * whose reach grows as it lights, which is what makes its bars spread
 * outward. The small lanterns along the path repeat every SMALL_STEP
 * metres on both edges, so their light is worked out from the position
 * alone instead of from a list.
 */

export const LIGHTS = 6;

const f = (n: number): string => n.toFixed(2);

export const COMMON = /* glsl */ `
uniform vec4 uLights[${LIGHTS}];
uniform float uRadii[${LIGHTS}];
uniform float uSmall;
uniform vec3 uCam;
varying vec3 vWorld;

float lightAt(vec3 p) {
  float sum = 0.0;
  for (int i = 0; i < ${LIGHTS}; i++) {
    vec3 d = p - uLights[i].xyz;
    float r = uRadii[i];
    sum += uLights[i].w * r * r / (r * r + dot(d, d));
  }
  float along = mod(p.z - ${f(SMALL_Z0)} + ${f(SMALL_STEP / 2)}, ${f(SMALL_STEP)}) - ${f(SMALL_STEP / 2)};
  float inRun = step(${f(SMALL_END - 1)}, p.z) * step(p.z, ${f(SMALL_Z0 + 1)});
  vec3 ds = vec3(abs(p.x) - ${f(SMALL_X)}, p.y - 1.3, along);
  sum += uSmall * inRun * 0.7 / (0.7 + dot(ds, ds));
  return sum;
}

float fogAt(vec3 p, float rate) {
  return 1.0 - exp(-distance(p, uCam) * rate);
}

float nightTone(float base, vec3 p) {
  float l = lightAt(p);
  float t = base + l * (0.3 + base);
  return clamp(mix(t, 0.08, fogAt(p, 0.018)), 0.0, 1.0);
}
`;

export const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/** A plain surface: one grey, a little lighter where it faces up. */
export const SOLID_FRAG = /* glsl */ `
${COMMON}
uniform float uBase;
varying vec3 vNormalW;
void main() {
  float up = 0.75 + 0.25 * max(vNormalW.y, 0.0);
  gl_FragColor = vec4(vec3(nightTone(uBase * up, vWorld)), 1.0);
}
`;

/** The trees: their grey comes per vertex, so each blossom clump is its own shade. */
export const SHADE_VERT = /* glsl */ `
attribute float shade;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vShade;
void main() {
  vShade = shade;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const SHADE_FRAG = /* glsl */ `
${COMMON}
varying vec3 vNormalW;
varying float vShade;
void main() {
  float up = 0.7 + 0.3 * max(vNormalW.y, 0.0);
  gl_FragColor = vec4(vec3(nightTone(vShade * up, vWorld)), 1.0);
}
`;

/**
 * One of the shrine's drawings on a card. Red is its grey, green its
 * lantern window, alpha where it is. A lit window keeps most of its
 * brightness in the fog, so far lanterns still show down the path.
 */
export const CARD_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uMap;
uniform float uWin;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.5) discard;
  float t = nightTone(c.r, vWorld);
  float w = c.g * uWin;
  t = max(t, mix(w, 0.08, fogAt(vWorld, 0.007)));
  gl_FragColor = vec4(vec3(t), 1.0);
}
`;

/** The stone path: staggered slabs with darker joints. */
export const PATH_FRAG = /* glsl */ `
${COMMON}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 q = vec2(vWorld.x / 1.4, vWorld.z / 0.9);
  float row = floor(q.y);
  q.x += mod(row, 2.0) * 0.5;
  vec2 cell = floor(q);
  vec2 g = fract(q);
  float slab = step(0.05, g.x) * step(g.x, 0.95) * step(0.08, g.y) * step(g.y, 0.92);
  float base = mix(0.07, 0.15 + 0.07 * hash(cell), slab);
  gl_FragColor = vec4(vec3(nightTone(base, vWorld)), 1.0);
}
`;

/** The votive lamps' faces: the atlas, lit row by row. */
export const LAMP_VERT = /* glsl */ `
attribute float aRow;
uniform float uRows[5];
varying vec3 vWorld;
varying vec2 vUv;
varying float vLit;
void main() {
  vUv = uv;
  vLit = uRows[int(aRow + 0.5)];
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const LAMP_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vLit;
void main() {
  float paper = texture2D(uAtlas, vUv).r;
  float t = 0.05 + paper * (0.2 + 0.78 * vLit);
  gl_FragColor = vec4(vec3(mix(t, 0.08, fogAt(vWorld, 0.01))), 1.0);
}
`;

/** The sky: a little lighter at the horizon, nearly nothing overhead. Never black, which the bar shader would drop. */
export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
void main() {
  float e = normalize(vDir).y;
  float t = mix(0.12, 0.035, smoothstep(0.0, 0.45, e));
  gl_FragColor = vec4(vec3(t), 1.0);
}
`;

export const FLAT_FRAG = /* glsl */ `
uniform float uTone;
void main() {
  gl_FragColor = vec4(vec3(uTone), 1.0);
}
`;

export const FLAT_VERT = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Petals drifting across the path, kept in a box in front of the camera. */
export const PETAL_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform vec3 uCentre;
uniform float uSize;
varying float vNear;
void main() {
  vec3 q = position + vec3(
    uTime * 0.55 + sin(uTime * 0.7 + aPhase) * 0.6,
    -uTime * 0.32,
    sin(uTime * 0.5 + aPhase * 2.0) * 0.4
  );
  vec3 box = vec3(9.0, 4.0, 14.0);
  q = uCentre + mod(q - uCentre + box, 2.0 * box) - box;
  vec4 mv = viewMatrix * vec4(q, 1.0);
  float depth = max(0.5, -mv.z);
  gl_PointSize = uSize / depth;
  vNear = 1.0 - smoothstep(10.0, 22.0, depth);
  gl_Position = projectionMatrix * mv;
}
`;

export const PETAL_FRAG = /* glsl */ `
varying float vNear;
void main() {
  if (vNear < 0.05) discard;
  vec2 c = (gl_PointCoord - 0.5) * vec2(1.0, 1.8);
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(vec3(0.1 + 0.6 * vNear), 1.0);
}
`;
