/**
 * The GLSL for the things that are not lit by three's own lights: the
 * sky, the ground and the petals. They write their colour straight out,
 * with no tone mapping, so a colour chosen here is the colour on screen.
 */

/** The sky's colour in a direction. The ground's haze uses it too, so the
 *  far ground fades into exactly the sky behind it and no line shows. */
export const SKY_AT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uGlowDir;

vec3 skyAt(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.5, y), 0.6));
  vec3 flat3 = normalize(vec3(d.x, 0.0, d.z) + vec3(0.0001, 0.0, 0.0));
  float facing = max(dot(flat3, uGlowDir), 0.0);
  float glow = pow(facing, 2.5) * exp(-y * 6.5);
  // A thin brighter line right on the horizon, as when light comes from under it.
  glow += pow(facing, 6.0) * exp(-y * 40.0) * 0.6;
  return col + uGlow * glow;
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}
`;

export const SKY_FRAG = /* glsl */ `
${SKY_AT}
varying vec3 vDir;

float cell(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyAt(d);
  // A few faint stars, none near the horizon where the haze would hide them.
  vec3 g = d * 150.0;
  vec3 id = floor(g);
  float on = step(0.9972, cell(id));
  float dot1 = 1.0 - smoothstep(0.0, 0.32, length(fract(g) - 0.5));
  col += vec3(1.0, 0.86, 0.94) * on * dot1 * smoothstep(0.06, 0.4, d.y) * (0.25 + 0.5 * cell(id + 3.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const GROUND_FRAG = /* glsl */ `
${SKY_AT}
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uLine;
uniform vec3 uPool;
uniform vec3 uMoonDir;
uniform vec4 uBlocks[5];
uniform vec4 uField;
varying vec3 vWorld;
varying vec3 vNormal;

void main() {
  vec3 n = normalize(vNormal);
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 view = toEye / dist;

  float h = vWorld.y;
  vec3 col = mix(uLow, uHigh, smoothstep(0.0, 14.0, h));
  float moon = max(dot(n, uMoonDir), 0.0);
  col *= 0.55 + 0.9 * moon;

  // Slopes that face the glow pick a little of it up.
  col += uGlow * pow(max(dot(n, uGlowDir), 0.0), 2.0) * 0.35 * smoothstep(0.5, 6.0, h);

  // Height lines, as on a survey map. They thin out with distance so the
  // far hills do not turn into a moire.
  float step1 = h / 1.25;
  float w = fwidth(step1);
  float line = 1.0 - smoothstep(0.0, 1.4, abs(fract(step1 - 0.5) - 0.5) / max(w, 0.0001));
  col += uLine * line * 0.2 * (1.0 - smoothstep(60.0, 190.0, dist)) * smoothstep(0.25, 1.2, h);

  // A faint survey grid on the flat ground near the camera, so the plain
  // has something to measure the camera's travel against.
  vec2 gq = vWorld.xz / 4.0;
  vec2 gw = max(fwidth(gq), vec2(0.0001));
  vec2 gl2 = 1.0 - smoothstep(vec2(0.0), gw * 1.5, abs(fract(gq - 0.5) - 0.5));
  col += uLine * max(gl2.x, gl2.y) * 0.075 * (1.0 - smoothstep(24.0, 110.0, dist));

  // A pool of light on the ground round each block, and under the field.
  for (int i = 0; i < 5; i++) {
    float d = distance(vWorld.xz, uBlocks[i].xy);
    col += uPool * uBlocks[i].z * (exp(-d * d / 22.0) * 0.55 + exp(-d * d / 160.0) * 0.12);
  }
  float df = distance(vWorld.xz, uField.xy);
  col += uPool * uField.z * exp(-df * df / 90.0) * 0.4;

  // Haze, into the colour of the sky behind.
  float f = 1.0 - exp(-pow(dist * 0.0075, 2.0));
  col = mix(col, skyAt(vec3(-view.x, 0.0, -view.z)), f);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export const PETAL_VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform vec3 uBox;
attribute vec4 aSeed;
varying float vSpin;
varying float vFade;
varying float vTint;

void main() {
  // Every petal drifts with the wind and sinks, then wraps round a box
  // that travels with the camera, so there are always petals near it.
  vec3 p = position * uBox;
  float t = uTime * (0.5 + aSeed.x * 0.6);
  p.x += t * 0.9 + sin(uTime * 0.4 + aSeed.y * 6.28) * 0.8;
  p.y -= t * 0.35;
  p.z += t * 0.35 + cos(uTime * 0.33 + aSeed.z * 6.28) * 0.8;
  p = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5 + cameraPosition;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(0.1, -mv.z);
  gl_PointSize = uScale * (0.11 + aSeed.w * 0.1) / depth;
  vSpin = aSeed.y * 6.28 + uTime * (0.4 + aSeed.z);
  // Gone by the far side of the box, and gone when it is in the lens.
  vFade = (1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.5, depth)) * smoothstep(0.6, 2.2, depth);
  vTint = aSeed.w;
}
`;

export const PETAL_FRAG = /* glsl */ `
uniform vec3 uPetal;
varying float vSpin;
varying float vFade;
varying float vTint;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vSpin);
  float k = cos(vSpin);
  vec2 r = vec2(c.x * k - c.y * s, c.x * s + c.y * k);
  // Long one way, narrow the other, with one end pinched: a petal.
  r.y *= 1.0 + r.x * 1.2;
  float d = length(vec2(r.x * 2.0, r.y * 3.6));
  float a = (1.0 - smoothstep(0.75, 1.0, d)) * vFade * 0.85;
  if (a < 0.01) discard;
  vec3 col = mix(uPetal, vec3(1.0), vTint * 0.45);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;
