/**
 * The one shader in the room: dust in the lamp's light.
 *
 * Each mote has a resting place and four numbers of its own:
 *   aSeed.x  where in its drift it starts
 *   aSeed.y  how fast it drifts
 *   aSeed.z  its size, about 0.5 to 1.5
 *   aSeed.w  how bright it is, by how near the middle of the beam it is
 */
export const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform float uLevel;
attribute vec4 aSeed;
varying float vBright;

void main() {
  float a = uTime * aSeed.y + aSeed.x;
  vec3 p = position;
  p.x += sin(a) * 0.035;
  p.y += sin(a * 0.7 + aSeed.x * 2.0) * 0.02;
  p.z += cos(a * 0.9 + aSeed.x) * 0.035;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float away = max(0.05, -mv.z);
  gl_PointSize = min(14.0, uScale * aSeed.z / away);
  // Each mote turns in the light, so it comes and goes.
  vBright = aSeed.w * uLevel * (0.55 + 0.45 * sin(a * 1.9));
}
`;

export const DUST_FRAG = /* glsl */ `
uniform sampler2D uDot;
uniform vec3 uColour;
varying float vBright;

void main() {
  float d = texture2D(uDot, gl_PointCoord).a;
  float k = d * vBright;
  gl_FragColor = vec4(uColour * k, k);
  #include <colorspace_fragment>
}
`;
