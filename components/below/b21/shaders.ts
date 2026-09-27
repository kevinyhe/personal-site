/**
 * The island's shaders. Every one writes a single grey, and the bar
 * shader reads that grey upside down: 1.0 is a full blossom bar, 0.04 is
 * none, plum ground. So "bright" here means "more blossom".
 *
 * Light is one fixed sun in the world. The island turns under it, so a
 * hill's lit side changes as it turns, which is most of what makes it
 * read as solid.
 */

/** Anything with a per-vertex grey: ground, rock, trees, places, lanterns. */
export const SHADE_VERT = /* glsl */ `
attribute float shade;
attribute float glow;
attribute float group;
uniform float uLit[5];
varying vec3 vNormalW;
varying float vShade;
varying float vGlow;
void main() {
  vShade = shade;
  // A lantern's window (group 0..4, its village) glows as its village
  // lights; anything else (group -1) keeps its glow as given.
  float g = glow;
  if (group > -0.5) g = glow * mix(0.2, 1.0, uLit[int(group + 0.5)]);
  vGlow = g;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SHADE_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform float uLift;
varying vec3 vNormalW;
varying float vShade;
varying float vGlow;
void main() {
  float diff = max(dot(normalize(vNormalW), uLight), 0.0);
  float t = vShade * (0.5 + 0.65 * diff) + vGlow + uLift;
  gl_FragColor = vec4(vec3(clamp(t, 0.05, 1.0)), 1.0);
}
`;

/** One grey for a whole mesh, lit by the sun. The robot. */
export const SOLID_VERT = /* glsl */ `
varying vec3 vNormalW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SOLID_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform float uBase;
varying vec3 vNormalW;
void main() {
  float diff = max(dot(normalize(vNormalW), uLight), 0.0);
  float t = uBase * (0.4 + 0.8 * diff);
  gl_FragColor = vec4(vec3(clamp(t, 0.06, 1.0)), 1.0);
}
`;

export const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The stream: bright, with slow ripples running downstream (v is along it). */
export const WATER_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  float w = sin(vUv.y * 40.0 - uTime * 2.4 + sin(vUv.x * 9.0 + uTime) * 1.2);
  float t = 0.76 + 0.18 * w * sin(vUv.x * 3.14159);
  gl_FragColor = vec4(vec3(t), 1.0);
}
`;

/** The waterfall: streaks falling, thinning toward the bottom (v = 1). */
export const FALL_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
float hash(float n) {
  return fract(sin(n * 91.3458) * 47453.5453);
}
void main() {
  float col = floor(vUv.x * 7.0);
  float streak = fract(vUv.y * 2.5 - uTime * 0.8 + hash(col));
  float t = 0.45 + 0.4 * smoothstep(0.0, 0.5, streak);
  t *= 1.0 - 0.85 * smoothstep(0.5, 1.0, vUv.y);
  gl_FragColor = vec4(vec3(max(t, 0.06)), 1.0);
}
`;

/** One of the shrine drawings on a card. Red is its grey, alpha where it is. */
export const CARD_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(vec3(c.r), 1.0);
}
`;

/**
 * Petals leaving the island. Each starts at its own spot (on the rim or
 * in a tree's crown), drifts outward and down, and starts again.
 */
export const PETAL_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uSize;
varying float vLife;
void main() {
  float life = fract(uTime * 0.045 + aPhase);
  vec3 away = normalize(vec3(position.x, 0.0, position.z) + vec3(0.001, 0.0, 0.0));
  vec3 p = position + away * life * 5.0 + vec3(
    sin(uTime * 0.7 + aPhase * 20.0) * 0.4,
    -life * 7.0 + sin(uTime * 1.3 + aPhase * 9.0) * 0.25,
    cos(uTime * 0.6 + aPhase * 13.0) * 0.4
  );
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uSize / max(0.5, -mv.z), 4.0, 12.0);
  vLife = life;
  gl_Position = projectionMatrix * mv;
}
`;

export const PETAL_FRAG = /* glsl */ `
varying float vLife;
void main() {
  vec2 c = (gl_PointCoord - 0.5) * vec2(1.0, 1.7);
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(vec3(0.92 - 0.35 * vLife), 1.0);
}
`;
