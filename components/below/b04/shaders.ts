/**
 * The shaders. All of them work in screen colour: what a shader writes
 * is what the monitor shows, with no conversion on the way out.
 */

/** The sky's colour in a direction. The sky, the clouds and the petals share it. */
const SKY = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uLow;
vec3 skyAt(vec3 dir) {
  float e = dir.y;
  vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.5, e));
  return mix(c, uLow, smoothstep(0.0, -0.4, e));
}
`;

const HASH = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

export const skyVert = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
varying vec3 vDir;
void main() {
  vec4 view = uInvProj * vec4(position.xy, 1.0, 1.0);
  vDir = mat3(uCamWorld) * (view.xyz / view.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

export const skyFrag = /* glsl */ `
precision highp float;
${SKY}
${HASH}
uniform vec3 uSunDir;
uniform vec3 uSun;
uniform float uStars;
uniform float uVeil;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyAt(dir);
  float sd = max(dot(dir, uSunDir), 0.0);
  // A wide glow, a tighter one, then the disc with a soft edge.
  col += uSun * (pow(sd, 6.0) * 0.16 + pow(sd, 48.0) * 0.3);
  float disc = smoothstep(0.9984, 0.9992, sd);
  col = mix(col, mix(uSun, vec3(1.0), 0.55), disc * 0.9);
  // Stars: a grid on the sky dome, one point in a few of its cells.
  if (uStars > 0.01 && dir.y > 0.0) {
    vec2 g = vec2(atan(dir.x, -dir.z) * 90.0, dir.y * 140.0);
    vec2 cell = floor(g);
    float h = hash12(cell);
    vec2 at = fract(g) - 0.5 - (vec2(hash12(cell + 7.0), hash12(cell + 13.0)) - 0.5) * 0.7;
    float s = smoothstep(0.09, 0.0, length(at)) * step(0.86, h);
    col += vec3(1.0, 0.86, 0.95) * s * uStars * smoothstep(0.02, 0.3, dir.y) * (0.35 + 0.65 * h);
  }
  // Dither, or the dark end of the gradient shows as bands.
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Clouds. One quad per cloud, turned to the camera but kept upright in
 * the world, so they lean in the frame when the camera banks. The
 * texture holds a height's slope and an alpha; the light comes from the
 * sun's side of the quad.
 */
export const cloudVert = /* glsl */ `
${SKY}
attribute vec3 aCentre;
attribute vec2 aSize;
attribute vec4 aInfo; // variant, flip, seed, opacity
uniform float uTime;
uniform vec3 uSunDir;
uniform float uFar;
uniform vec2 uSheet;
varying vec2 vUv;
varying vec2 vLocal;
varying vec3 vLight;
varying vec3 vSky;
varying float vFade;
varying float vFog;
void main() {
  vec3 c = aCentre;
  c.x += sin(uTime * 0.04 + aInfo.z * 6.283) * 1.6;
  c.y += sin(uTime * 0.05 + aInfo.z * 17.0) * 0.5;
  vec3 toCam = cameraPosition - c;
  float dist = length(toCam);
  vec3 fw = toCam / dist;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, right);
  vec2 q = position.xy * aSize;
  vec3 world = c + right * q.x + up * q.y;
  vec2 cell = vec2(mod(aInfo.x, uSheet.x), floor(aInfo.x / uSheet.x));
  vec2 uv0 = position.xy + 0.5;
  vLocal = position.xy * 2.0;
  if (aInfo.y < 0.0) uv0.x = 1.0 - uv0.x;
  vUv = (cell + uv0) / uSheet;
  vLight = vec3(dot(uSunDir, right) * aInfo.y, dot(uSunDir, up), dot(uSunDir, fw));
  // Gone before it reaches the lens, and gone before the far plane.
  vFade = smoothstep(1.2, 5.5, dist) * (1.0 - smoothstep(uFar * 0.55, uFar * 0.95, dist)) * aInfo.w;
  vFog = 1.0 - exp(-dist * 0.0062);
  vSky = skyAt(-fw);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const cloudFrag = /* glsl */ `
precision highp float;
${HASH}
uniform sampler2D uAtlas;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uSun;
varying vec2 vUv;
varying vec2 vLocal;
varying vec3 vLight;
varying vec3 vSky;
varying float vFade;
varying float vFog;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  float a = t.a * vFade;
  if (a < 0.004) discard;
  vec3 n = vec3(t.rg * 2.0 - 1.0, 0.0);
  n.z = sqrt(max(1.0 - dot(n.xy, n.xy), 0.04));
  // The sun is ahead, so by rights every cloud is lit from behind and
  // dark in the middle. Drawn that way they look like stones. The light
  // here keeps the sun's side and height but comes round to the front.
  vec3 l = normalize(vec3(vLight.x * 1.3, 0.45 + vLight.y, 0.55));
  float lit = smoothstep(-0.45, 0.95, dot(normalize(n), l));
  // Darker toward the base, whatever the puffs are doing.
  lit = lit * 0.72 + 0.28 * smoothstep(-0.45, 0.3, vLocal.y);
  vec3 col = mix(uCloudShade, uCloudLit, lit);
  // Thin edges let the light through, more so toward the sun.
  float thin = (1.0 - t.b) * (1.0 - t.b);
  col = mix(col, uCloudLit, thin * 0.3);
  col += uSun * thin * max(-vLight.z, 0.0) * 0.35;
  col = mix(col, vSky, vFog * 0.92);
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, a);
}
`;

/**
 * Petals. They live in a box that travels with the camera: a petal that
 * leaves one face comes back in the opposite one, so there are petals
 * everywhere on the path for the price of one boxful.
 */
export const petalVert = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aRand;
uniform float uTime;
uniform vec3 uCentre;
uniform vec3 uBox;
uniform vec3 uSunDir;
varying vec2 vUv;
varying float vShade;
varying float vFade;
varying float vTone;

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  vec4 a = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
  vec4 b = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
  vec4 m = mix(a, b, f.z);
  vec2 r = mix(m.xz, m.yw, f.x);
  return mix(r.x, r.y, f.y);
}

mat3 rotAxis(vec3 axis, float a) {
  float s = sin(a);
  float c = cos(a);
  float o = 1.0 - c;
  return mat3(
    o * axis.x * axis.x + c, o * axis.x * axis.y + axis.z * s, o * axis.z * axis.x - axis.y * s,
    o * axis.x * axis.y - axis.z * s, o * axis.y * axis.y + c, o * axis.y * axis.z + axis.x * s,
    o * axis.z * axis.x + axis.y * s, o * axis.y * axis.z - axis.x * s, o * axis.z * axis.z + c);
}

void main() {
  vec3 base = aOffset * uBox;
  float speed = 0.5 + aRand.x;
  // Wind from the left and a slow fall, with a sway so no two track.
  base.x += uTime * 1.5 * speed + sin(uTime * 0.6 + aRand.z * 6.283) * 0.9;
  base.y -= uTime * 0.55 * speed;
  base.z += cos(uTime * 0.45 + aRand.w * 6.283) * 0.7;
  vec3 rel = mod(base - uCentre, uBox) - 0.5 * uBox;
  vec3 world = uCentre + rel;
  // Thick in places: whole regions of the air carry none.
  float thick = vnoise(world * 0.045 + 3.0);
  float keep = smoothstep(0.38, 0.62, thick + (aRand.y - 0.5) * 0.3);
  vec3 axis = normalize(vec3(aRand.x - 0.5, aRand.y - 0.5, aRand.z - 0.5) + 0.001);
  mat3 r = rotAxis(axis, uTime * (0.8 + aRand.w * 2.2) + aRand.z * 40.0);
  float size = (0.1 + aRand.w * 0.13) * keep;
  vec3 local = r * vec3(position.xy * size, 0.0);
  vec3 normal = r * vec3(0.0, 0.0, 1.0);
  vShade = abs(dot(normal, uSunDir));
  vTone = aRand.y;
  vUv = position.xy + 0.5;
  vec4 mv = viewMatrix * vec4(world + local, 1.0);
  float dist = -mv.z;
  vFade = smoothstep(1.2, 3.2, dist) * (1.0 - smoothstep(uBox.z * 0.3, uBox.z * 0.5, dist));
  gl_Position = projectionMatrix * mv;
}
`;

export const petalFrag = /* glsl */ `
precision highp float;
uniform vec3 uPetalLight;
uniform vec3 uPetalShade;
varying vec2 vUv;
varying float vShade;
varying float vFade;
varying float vTone;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // Narrow at the stem, round at the top, a notch cut in the tip.
  float width = mix(0.45, 0.95, smoothstep(-1.0, 0.25, p.y));
  float body = length(vec2(p.x / width, p.y));
  float notch = length(p - vec2(0.0, 1.05));
  float shape = (1.0 - smoothstep(0.86, 0.98, body)) * smoothstep(0.2, 0.32, notch);
  float a = shape * vFade;
  if (a < 0.01) discard;
  vec3 tint = mix(uPetalShade, uPetalLight, 0.35 + 0.65 * vShade);
  // Whiter toward the tip, as a petal is.
  tint = mix(tint, uPetalLight, smoothstep(-0.6, 0.9, p.y) * 0.5 * vTone);
  gl_FragColor = vec4(tint, a);
}
`;

/** The craft and the objects at each stop: solid, lit from the sun's side. */
export const solidVert = /* glsl */ `
attribute vec3 aTint;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vTint;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vTint = aTint;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const solidFrag = /* glsl */ `
precision highp float;
uniform vec3 uBase;
uniform float uUseTint;
uniform vec3 uBack;
uniform float uUseBack;
uniform vec3 uSunDir;
uniform vec3 uObjLight;
uniform vec3 uObjShade;
uniform vec3 uSun;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vTint;
void main() {
  vec3 n = normalize(vNormal);
  vec3 base = mix(uBase, vTint, uUseTint);
  if (!gl_FrontFacing) {
    n = -n;
    base = mix(base, uBack, uUseBack);
  }
  float k = smoothstep(-0.7, 0.9, dot(n, uSunDir));
  // Some light from above as well, or undersides go flat.
  k = clamp(k * 0.8 + (n.y * 0.5 + 0.5) * 0.25, 0.0, 1.0);
  vec3 col = base * mix(uObjShade, uObjLight, k);
  vec3 v = normalize(cameraPosition - vWorld);
  float edge = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += uSun * edge * 0.22;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** The trail: a ribbon laid along the whole path, shown only behind the craft. */
export const trailVert = /* glsl */ `
attribute float aDist;
attribute float aEdge;
varying float vDist;
varying float vEdge;
void main() {
  vDist = aDist;
  vEdge = aEdge;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

export const trailFrag = /* glsl */ `
precision highp float;
uniform float uCraft;
uniform float uLength;
uniform vec3 uColour;
varying float vDist;
varying float vEdge;
void main() {
  float behind = uCraft - vDist;
  if (behind < 0.0 || behind > uLength) discard;
  float a = smoothstep(0.0, 0.5, behind) * pow(1.0 - behind / uLength, 1.6);
  a *= 1.0 - abs(vEdge);
  gl_FragColor = vec4(uColour, a * 0.5);
}
`;

/** A title: the texture carries only the letters' coverage. */
export const titleVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const titleFrag = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform vec3 uColour;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float a = texture2D(uMap, vUv).a * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColour, a);
}
`;

/**
 * Lanterns: one disc per skill, facing the camera, with its mark on it
 * and a glow round it.
 */
export const lanternVert = /* glsl */ `
attribute vec3 aCentre;
attribute vec3 aInfo; // atlas column, atlas row, seed
uniform float uTime;
uniform vec2 uGrid;
uniform float uSize;
uniform vec3 uSunDir;
varying vec2 vP;
varying vec2 vCell;
varying vec2 vLight;
varying float vFade;
void main() {
  vec3 c = aCentre;
  c.y += sin(uTime * 0.8 + aInfo.z * 6.283) * 0.12;
  vec3 toCam = cameraPosition - c;
  float dist = length(toCam);
  vec3 fw = toCam / dist;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, right);
  vec3 world = c + (right * position.x + up * position.y) * uSize;
  vP = position.xy * 2.0;
  vCell = aInfo.xy / uGrid;
  vLight = vec2(dot(uSunDir, right), dot(uSunDir, up));
  vFade = smoothstep(1.0, 4.0, dist) * (1.0 - smoothstep(150.0, 230.0, dist));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const lanternFrag = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform vec3 uInk;
uniform vec3 uGlow;
uniform vec3 uRim;
varying vec2 vP;
varying vec2 vCell;
varying vec2 vLight;
varying float vFade;
void main() {
  // The disc takes the middle 46% of the quad; the rest is glow.
  float d = length(vP);
  float R = 0.46;
  float aa = fwidth(d) * 1.2;
  float disc = 1.0 - smoothstep(R - aa, R + aa, d);
  vec2 uv = (vP / R) * 0.5 + 0.5;
  float mark = 0.0;
  if (disc > 0.0) {
    // Row 0 is the top of the atlas and a cell's own top is up.
    vec2 at = vCell + clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0) / uGrid;
    mark = texture2D(uAtlas, vec2(at.x, 1.0 - at.y)).a;
  }
  // Round, not flat: brighter toward the sun's side, a rim in blossom.
  float side = dot(normalize(vP + 0.0001), normalize(vLight + 0.0001)) * smoothstep(0.0, R, d);
  vec3 face = mix(uGlow, vec3(1.0), 0.5 + 0.35 * side);
  float ring = smoothstep(R - 0.06 - aa, R - 0.06 + aa, d);
  face = mix(face, uRim, ring * 0.85);
  face = mix(face, uInk, mark);
  float halo = exp(-d * d * 5.5) * 0.75 + exp(-d * d * 1.6) * 0.22;
  halo *= 1.0 - smoothstep(0.8, 1.0, d);
  vec3 col = mix(uGlow, face, disc);
  float a = max(disc, halo * (1.0 - disc));
  gl_FragColor = vec4(col, a * vFade);
}
`;
