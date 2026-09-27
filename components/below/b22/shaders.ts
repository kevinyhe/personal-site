/**
 * The tunnel's shaders. Each writes a single grey, and the bar shader
 * turns that grey into blossom: 0.07 is plain plum, 0.92 is a full
 * blossom bar. So "bright" here means "more blossom", and the light that
 * comes through the gaps between the posts is the brightest thing there.
 *
 * Every surface fades toward a pale haze with distance, which is what
 * makes the far gates and the far hills lighter than the near ones.
 */

const FOG = /* glsl */ `
uniform vec3 uCam;
uniform float uFogRate;
uniform float uHaze;
varying vec3 vWorld;
float fogged(float t) {
  float f = 1.0 - exp(-distance(vWorld, uCam) * uFogRate);
  return clamp(mix(t, uHaze, f), 0.03, 1.0);
}
`;

/**
 * The gates. One instanced mesh holds every post and base, another every
 * beam. aTone is each piece's own grey. The face turned back toward the
 * way in catches the light from the gaps; the faces along the path and
 * the undersides stay dark, so every post reads as its own bright stripe.
 */
export const GATE_VERT = /* glsl */ `
attribute float aTone;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vBack;
varying float vTone;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(m) * normal);
  vBack = normalize(mat3(m) * vec3(0.0, 0.0, 1.0));
  vTone = aTone;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const GATE_FRAG = /* glsl */ `
${FOG}
varying vec3 vNormalW;
varying vec3 vBack;
varying float vTone;
void main() {
  vec3 n = normalize(vNormalW);
  float face = max(dot(n, normalize(vBack)), 0.0);
  float up = max(n.y, 0.0);
  float t = vTone * (0.34 + 0.66 * face * face) + 0.1 * up;
  gl_FragColor = vec4(vec3(fogged(t)), 1.0);
}
`;

/** Plain vertex shader for the meshes that carry their grey per vertex. */
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

/** Trees, trunks, lanterns, the rack, the hills: one grey each, a little lighter facing up. */
export const SHADE_FRAG = /* glsl */ `
${FOG}
varying vec3 vNormalW;
varying float vShade;
void main() {
  float up = 0.82 + 0.18 * max(normalize(vNormalW).y, 0.0);
  gl_FragColor = vec4(vec3(fogged(vShade * up)), 1.0);
}
`;

/** Position only, for the open ground. */
export const PLAIN_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/** Position and texture coordinates, for the plaques and tablets. */
export const CARD_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/** The tunnel floor: texture coordinates plus how open the ground is there. */
export const UV_VERT = /* glsl */ `
attribute float aOpen;
varying vec3 vWorld;
varying vec2 vUv;
varying float vOpen;
void main() {
  vUv = uv;
  vOpen = aOpen;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/**
 * The floor of the tunnel. uv.x is metres from the middle line, uv.y is
 * metres along the run counted in gates. Sun comes in between the posts
 * and lies on the floor in slanted bars, strongest near the walls. aOpen
 * is 1 where the tunnel opens, and there the floor is the open ground.
 */
export const FLOOR_FRAG = /* glsl */ `
${FOG}
uniform float uGround;
varying vec2 vUv;
varying float vOpen;
void main() {
  float lat = abs(vUv.x);
  float ph = fract(vUv.y + vUv.x * 0.22);
  float slit = smoothstep(0.22, 0.36, ph) * (1.0 - smoothstep(0.64, 0.78, ph));
  float edge = smoothstep(0.1, 1.1, lat);
  float inside = 0.12 + slit * (0.16 + 0.42 * edge);
  float t = mix(inside, uGround, vOpen);
  gl_FragColor = vec4(vec3(fogged(t)), 1.0);
}
`;

/** Open ground: a flat grey, slightly mottled so it does not read as a sheet. */
export const GROUND_FRAG = /* glsl */ `
${FOG}
uniform float uGround;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 c = floor(vWorld.xz * 0.7);
  float t = uGround + (hash(c) - 0.5) * 0.06;
  gl_FragColor = vec4(vec3(fogged(t)), 1.0);
}
`;

/** A plaque or a tablet: the texture's red is its grey, and clear texels are cut out. */
export const CARD_FRAG = /* glsl */ `
${FOG}
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(vec3(fogged(c.r)), 1.0);
}
`;

/** The sky: bright all over, brightest overhead, a pale haze below the horizon where the valley is. */
export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
uniform float uHaze;
varying vec3 vDir;
void main() {
  float e = normalize(vDir).y;
  float sky = mix(0.8, 0.93, smoothstep(0.0, 0.6, e));
  float t = mix(uHaze, sky, smoothstep(-0.04, 0.02, e));
  gl_FragColor = vec4(vec3(t), 1.0);
}
`;

/** Petals drifting down, kept in a box round the point ahead of the camera. */
export const PETAL_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform vec3 uCentre;
uniform float uSize;
varying float vNear;
void main() {
  vec3 q = position + vec3(
    uTime * 0.35 + sin(uTime * 0.7 + aPhase) * 0.5,
    -uTime * 0.28,
    sin(uTime * 0.5 + aPhase * 2.0) * 0.4
  );
  vec3 box = vec3(6.0, 2.6, 9.0);
  q = uCentre + mod(q - uCentre + box, 2.0 * box) - box;
  vec4 mv = viewMatrix * vec4(q, 1.0);
  float depth = max(0.5, -mv.z);
  gl_PointSize = uSize / depth;
  vNear = 1.0 - smoothstep(7.0, 15.0, depth);
  gl_Position = projectionMatrix * mv;
}
`;

export const PETAL_FRAG = /* glsl */ `
varying float vNear;
void main() {
  if (vNear < 0.05) discard;
  vec2 c = (gl_PointCoord - 0.5) * vec2(1.0, 1.8);
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(vec3(0.35 + 0.5 * vNear), 1.0);
}
`;

/** Birds over the valley: each wing's tip rises and falls. aWing is how far out along the wing a vertex is. */
export const BIRD_VERT = /* glsl */ `
attribute float aWing;
attribute float aPhase;
uniform float uTime;
void main() {
  vec3 p = position;
  p.y += aWing * sin(uTime * 5.0 + aPhase) * 0.9;
  p.x += sin(uTime * 0.2 + aPhase) * 3.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const BIRD_FRAG = /* glsl */ `
void main() {
  gl_FragColor = vec4(vec3(0.12), 1.0);
}
`;
