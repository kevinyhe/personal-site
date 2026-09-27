/**
 * The GLSL. Colours go in and come out as they are written (the renderer
 * does no colour conversion), so a plum here is the site's plum on screen.
 */

/**
 * A sheet. Each vertex carries where it is on the flat sheet (s from the
 * spine, zn from the top edge) and is bent here round a roll of radius
 * uR whose line has reached uXc. Keep in step with sheetPoint in
 * layout.ts, which the Node check runs.
 */
export const SHEET_VERT = /* glsl */ `
attribute vec2 aSheet;
uniform float uXc;
uniform float uR;
uniform float uSkew;
uniform float uBase;
uniform vec3 uJit;
uniform float uW;
uniform float uH;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vRoll;

void main() {
  float s = aSheet.x;
  float zn = aSheet.y;
  float xc = uXc * (1.0 - uSkew * zn);
  float d = s - xc;
  float arc = 3.14159265 * uR;
  vec3 p = vec3(s, 0.0, 0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float roll = 0.0;
  if (d > 0.0 && d < arc) {
    float a = d / uR;
    p = vec3(xc + uR * sin(a), uR * (1.0 - cos(a)), 0.0);
    n = vec3(-sin(a), cos(a), 0.0);
    roll = sin(a);
  } else if (d >= arc) {
    p = vec3(xc - (d - arc), 2.0 * uR, 0.0);
    n = vec3(0.0, -1.0, 0.0);
  }
  p.z = (zn - 0.5) * uH;
  p.y += uBase;
  float c = cos(uJit.z);
  float sn = sin(uJit.z);
  vec2 xz = vec2(c * p.x - sn * p.z, sn * p.x + c * p.z) + uJit.xy;
  p.x = xz.x;
  p.z = xz.y;
  vec2 nxz = vec2(c * n.x - sn * n.z, sn * n.x + c * n.z);
  n.x = nxz.x;
  n.z = nxz.y;
  vUv = vec2(s / uW, 1.0 - zn);
  vNormal = n;
  vRoll = roll;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The shadow a sheet in the air throws on what is under it: a soft band
 * just past the roll, and a lighter one under the part that has gone
 * over. Shared by the sheets and the desk.
 */
const CAST = /* glsl */ `
uniform vec4 uCast;
uniform float uHalfH;
float castShade(vec3 w) {
  float xc = uCast.x;
  float r = uCast.y;
  float amount = uCast.z;
  float land = uCast.w;
  float q = (w.x - (xc + 0.35 * r)) / (0.2 + 0.9 * r);
  float band = exp(-q * q);
  float under = smoothstep(land - 0.15, land + 0.25, w.x) * (1.0 - smoothstep(xc - 0.1, xc + 0.15, w.x));
  float inside = 1.0 - smoothstep(uHalfH - 0.05, uHalfH + 0.35, abs(w.z));
  return amount * inside * (0.26 * band + 0.12 * under);
}
`;

export const SHEET_FRAG = /* glsl */ `
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec3 uLight;
uniform float uReceive;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vRoll;
${CAST}

void main() {
  bool front = gl_FrontFacing;
  vec2 uv = front ? vUv : vec2(1.0 - vUv.x, vUv.y);
  vec3 col = front ? texture2D(uFront, uv).rgb : texture2D(uBack, uv).rgb;
  vec3 n = normalize(front ? vNormal : -vNormal);
  // Bright by default: a flat page facing up comes out at about 0.98 of
  // its printed colour. Only the roll turns away from the light.
  float lit = 0.72 + 0.3 * max(dot(n, normalize(uLight)), 0.0);
  // The inside of the roll is a little darker, the paper curving away.
  lit -= front ? 0.06 * vRoll : 0.03 * vRoll;
  col *= lit;
  col *= 1.0 - uReceive * castShade(vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Plain vertex shader for the desk: passes the world position on. */
export const DESK_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The desk: plum with a faint grain along x, darker toward its far edges,
 * and the soft shadows of the two piles of paper. uPileR and uPileL are
 * the piles' boxes (x0, z0, x1, z1); uPiles says how much of each is there.
 */
export const DESK_FRAG = /* glsl */ `
uniform vec3 uPlum;
uniform vec3 uDeep;
uniform vec4 uPileR;
uniform vec4 uPileL;
uniform vec2 uPiles;
uniform vec2 uCentre;
varying vec3 vWorld;
${CAST}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float box(vec2 p, vec4 b, float soft) {
  vec2 lo = smoothstep(b.xy - soft, b.xy + soft, p);
  vec2 hi = 1.0 - smoothstep(b.zw - soft, b.zw + soft, p);
  return lo.x * lo.y * hi.x * hi.y;
}

void main() {
  vec2 p = vWorld.xz;
  float grain = noise(vec2(p.x * 0.7, p.y * 9.0)) * 0.6 + noise(vec2(p.x * 2.1, p.y * 23.0)) * 0.4;
  vec3 col = uPlum * (0.9 + 0.2 * grain);
  float far = smoothstep(4.0, 10.0, length(p - uCentre));
  col = mix(col, uDeep, 0.75 * far);
  // Light from the upper left, so the shadows fall down and to the right.
  vec2 off = vec2(0.1, 0.16);
  float shade = uPiles.x * box(p - off, uPileR, 0.28) + uPiles.y * box(p - off, uPileL, 0.28);
  col = mix(col, uDeep * 0.7, 0.62 * clamp(shade, 0.0, 1.0));
  col *= 1.0 - castShade(vWorld) * 0.8;
  gl_FragColor = vec4(col, 1.0);
}
`;
