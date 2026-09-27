/**
 * The map is drawn in greys, and the bar shader turns the greys into bar
 * widths: dark grey is a wide plum bar, light grey a thin one, and near
 * white leaves bare blossom. Pure black is thrown away by the bar shader,
 * so every surface here keeps above 0.07; only the sky past the map's edge
 * is black, and that is what gives the map its clean cut edge.
 *
 * No lights from three.js. Each shader works out its own shade from one
 * fixed sun, so the greys are the numbers written here.
 */

/** Anything solid: a tone per mesh, or per instance, times the sun. */
export const TONE_VERT = /* glsl */ `
uniform float uTone;
varying vec3 vNormal;
varying float vTone;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vTone = uTone;
  #ifdef USE_INSTANCING_COLOR
    vTone = instanceColor.r;
  #endif
  vNormal = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * p;
}
`;

export const TONE_FRAG = /* glsl */ `
uniform vec3 uSun;
varying vec3 vNormal;
varying float vTone;
void main() {
  float ndl = max(dot(normalize(vNormal), uSun), 0.0);
  float t = vTone * (0.62 + 0.45 * ndl);
  gl_FragColor = vec4(vec3(clamp(t, 0.07, 1.0)), 1.0);
}
`;

/**
 * The ground: its painted plan (fields, courts, tracks, the river) times
 * the sun on the slope, and a slow shadow of cloud crossing it.
 */
export const GROUND_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const GROUND_FRAG = /* glsl */ `
uniform sampler2D uPlan;
uniform vec3 uSun;
uniform float uHalf;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec2 uv = vec2((vWorld.x + uHalf) / (2.0 * uHalf), 1.0 - (vWorld.z + uHalf) / (2.0 * uHalf));
  float plan = texture2D(uPlan, uv).r;
  float ndl = max(dot(normalize(vNormal), uSun), 0.0);
  float t = plan * (0.55 + 0.45 * ndl);
  float c = sin(vWorld.x * 0.05 + uTime * 0.04) * sin(vWorld.z * 0.043 - uTime * 0.03);
  t *= 1.0 - 0.1 * smoothstep(0.55, 0.95, c);
  gl_FragColor = vec4(vec3(clamp(t, 0.07, 1.0)), 1.0);
}
`;

/**
 * The walking path: a ribbon on the ground, cut into dashes. Dashes behind
 * the camera's place on the walk are dark; the rest are faint.
 */
export const WALK_VERT = /* glsl */ `
attribute vec3 aSide;
attribute float aAlong;
attribute float aDist;
uniform float uHalfWidth;
varying float vAlong;
varying float vDist;
void main() {
  vAlong = aAlong;
  vDist = aDist;
  vec3 p = position + aSide * uHalfWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const WALK_FRAG = /* glsl */ `
uniform float uFill;
uniform float uDash;
varying float vAlong;
varying float vDist;
void main() {
  if (fract(vDist / uDash) > 0.58) discard;
  float done = step(vAlong, uFill);
  float t = mix(0.6, 0.1, done);
  gl_FragColor = vec4(vec3(t), 1.0);
}
`;

/**
 * A builder's picture standing in the map. Its black ground is dropped,
 * and its greys are spread out the way the valley's own grade spreads
 * them, so roofs come out dark and walls light.
 */
export const PICTURE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const PICTURE_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uMap, vUv).rgb;
  float l = (c.r + c.g + c.b) / 3.0;
  if (l < 0.06) discard;
  float t = clamp((l - 0.2) * 2.0, 0.1, 0.9);
  gl_FragColor = vec4(vec3(t), 1.0);
}
`;
