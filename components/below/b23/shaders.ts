/**
 * The planet's shaders. Every one writes a single grey, and that grey is
 * how much blossom the bar shader draws there: 0.02 draws nothing, so it
 * is the sky; 1.0 is a full bar. "Bright" here means "more blossom".
 *
 * One light, fixed to the camera, from the upper left. The planet turns
 * under it, so its lit side is always the same side of the screen.
 */

/** The sky's grey. Not black: black makes the bar shader drop its neighbours too, and thin things would vanish against it. */
export const SKY = 0.02;

export const GLOBE_VERT = /* glsl */ `
attribute float hgt;
attribute float river;
varying vec3 vObj;
varying vec3 vNormalW;
varying float vHgt;
varying float vRiver;
void main() {
  vObj = normalize(position);
  vHgt = hgt;
  vRiver = river;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const GLOBE_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform float uPole;
varying vec3 vObj;
varying vec3 vNormalW;
varying float vHgt;
varying float vRiver;
void main() {
  float l = max(dot(normalize(vNormalW), uLight), 0.0);
  float base = 0.3 + 0.36 * vHgt;
  // The road round the equator, in slabs, so a turn of the planet shows.
  float road = 1.0 - smoothstep(0.045, 0.065, abs(vObj.y));
  float lon = atan(vObj.x, vObj.z);
  float slab = step(0.5, fract(lon * 9.549));
  base = mix(base, mix(0.5, 0.64, slab), road);
  float t = base * (0.34 + 0.8 * l);
  // The river is a plum channel.
  t = mix(t, 0.07, vRiver);
  // The pole plaza takes the lanterns' light.
  t += uPole * 0.3 * smoothstep(0.8, 0.99, vObj.y);
  gl_FragColor = vec4(vec3(clamp(t, 0.05, 1.0)), 1.0);
}
`;

/** Everything standing on the planet: trees, shrines, torii, lanterns, the pins, the clouds. */
export const PROP_VERT = /* glsl */ `
attribute float shade;
attribute float lamp;
attribute float idx;
uniform float uRings[5];
uniform float uHot;
varying float vShade;
varying float vLit;
varying vec3 vNormalW;
void main() {
  vShade = shade;
  float lit = -1.0;
  if (lamp > -0.5) {
    lit = 0.0;
    for (int i = 0; i < 5; i++) {
      if (abs(lamp - float(i)) < 0.5) lit = uRings[i];
    }
    if (abs(idx - uHot) < 0.5) lit = 1.0;
  }
  vLit = lit;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const PROP_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform float uBoost;
varying float vShade;
varying float vLit;
varying vec3 vNormalW;
void main() {
  float l = max(dot(normalize(vNormalW), uLight), 0.0);
  float t = vShade * (0.5 + 0.62 * l) * uBoost;
  // A lantern's fire box: dim until its ring is lit.
  if (vLit > -0.5) t = mix(0.16, 1.0, vLit);
  gl_FragColor = vec4(vec3(clamp(t, 0.05, 1.0)), 1.0);
}
`;

/** The robot: one grey, lit. */
export const ROBOT_VERT = /* glsl */ `
varying vec3 vNormalW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ROBOT_FRAG = /* glsl */ `
uniform vec3 uLight;
varying vec3 vNormalW;
void main() {
  float l = max(dot(normalize(vNormalW), uLight), 0.0);
  gl_FragColor = vec4(vec3(clamp(0.22 + 0.7 * l, 0.05, 1.0)), 1.0);
}
`;

export const STAR_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uStars;
uniform float uPx;
varying float vTone;
void main() {
  vTone = uStars * (0.42 + 0.2 * sin(uTime * 0.7 + aPhase));
  gl_PointSize = uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const STAR_FRAG = /* glsl */ `
varying float vTone;
void main() {
  gl_FragColor = vec4(vec3(max(vTone, 0.02)), 1.0);
}
`;
