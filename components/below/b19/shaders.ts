/**
 * The wall's two shaders. The vertex shader pushes the plane out by the
 * height map. The fragment shader shades it as matte plaster under one
 * low point light, with the carving's own shadows, and writes a grey: the
 * bar dither turns that grey into bar widths. It writes no colour at all.
 */

export const WALL_VERT = /* glsl */ `
uniform sampler2D uHeight;
uniform float uDepth;
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vUv = uv;
  float h = texture2D(uHeight, uv).r;
  vec3 p = position;
  p.z += h * uDepth;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const WALL_FRAG = /* glsl */ `
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform vec2 uTileSize;
uniform float uDepth;
uniform vec3 uLight;
uniform float uPoolR;
uniform float uDim;
uniform vec4 uSpot;
uniform float uLintel;
uniform float uLintelDepth;
uniform float uViewH;
varying vec2 vUv;
varying vec3 vWorld;

float heightAt(vec2 uv) {
  return texture2D(uHeight, uv).r;
}

void main() {
  float h = heightAt(vUv);
  // The slope, from two texels either side. World units of rise per world unit.
  vec2 ox = vec2(uTexel.x * 2.0, 0.0);
  vec2 oy = vec2(0.0, uTexel.y * 2.0);
  float dx = (heightAt(vUv + ox) - heightAt(vUv - ox)) * uDepth / (4.0 * uTexel.x * uTileSize.x);
  float dy = (heightAt(vUv + oy) - heightAt(vUv - oy)) * uDepth / (4.0 * uTexel.y * uTileSize.y);
  vec3 n = normalize(vec3(-dx, -dy, 1.0));

  vec3 p = vec3(vWorld.xy, h * uDepth);
  vec3 toLight = uLight - p;
  vec3 l = normalize(toLight);
  // Shading against what a flat wall would get here, so the open wall
  // stays pale everywhere and only the carving takes the tone.
  float lam = clamp(dot(n, l) / max(l.z, 0.12), 0.0, 1.2);

  // The carving's own shadow: walk toward the light and see whether
  // anything on the way stands above the line to it.
  float run = max(length(toLight.xy), 0.001);
  vec2 dir = toLight.xy / run;
  float rise = toLight.z / run;
  float lit = 1.0;
  for (int i = 1; i <= 12; i++) {
    float s = float(i) * 0.012;
    vec2 q = vUv + dir * s / uTileSize;
    float above = heightAt(q) * uDepth - (p.z + rise * s);
    lit = min(lit, clamp(1.0 - above / 0.006, 0.0, 1.0));
  }

  float pool = 1.0 / (1.0 + (run * run) / (uPoolR * uPoolR));
  float b = (0.3 + 0.7 * lam * lit) * mix(0.8, 1.0, pool);

  // At the contact the wall goes dark but for one oval where the light rests.
  vec2 sp = (vWorld.xy - uSpot.xy) / uSpot.zw;
  float inSpot = 1.0 - smoothstep(0.7, 1.0, length(sp));
  float dark = 0.12 + 0.16 * lam * lit;
  b = mix(b, mix(dark, b, inSpot), uDim);

  // The top of the stage darkens while it comes up under the band.
  float fromTop = 1.0 - gl_FragCoord.y / uViewH;
  b *= mix(1.0, smoothstep(0.02, uLintelDepth, fromTop), uLintel);

  b = clamp(b, 0.03, 1.0);
  gl_FragColor = vec4(vec3(b), 1.0);
}
`;

/** The robot's depth, for its carving: nearer the lens is higher. */
export const DEPTH_VERT = /* glsl */ `
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const DEPTH_FRAG = /* glsl */ `
uniform float uNear;
uniform float uFar;
varying float vDepth;
void main() {
  float t = clamp((uFar - vDepth) / (uFar - uNear), 0.0, 1.0);
  float h = 0.3 + 0.65 * t;
  gl_FragColor = vec4(vec3(h), 1.0);
}
`;
