/**
 * The night's shaders. Each writes one grey, and the grey is how much
 * blossom the bar shader draws there: 0.04 is a hairline on plum, 1.0 is a
 * full bar. So "bright" here means "more blossom". Nothing may be pure
 * black: the bar shader drops those cells.
 */

/** The sky's grey at the horizon, which is also what far things fade to. */
export const HORIZON = 0.2;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Lighter at the horizon, nearly nothing overhead. */
export const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
void main() {
  float e = normalize(vDir).y;
  float t = mix(${HORIZON.toFixed(2)}, 0.045, smoothstep(-0.02, 0.5, e));
  gl_FragColor = vec4(vec3(t), 1.0);
}
`;

export const MOON_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** A pale disc with a few darker seas, so the bars show it is the moon and not a lamp. */
export const MOON_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float t = 0.93;
  t -= 0.14 * (1.0 - smoothstep(0.08, 0.13, length(p - vec2(-0.12, 0.1))));
  t -= 0.1 * (1.0 - smoothstep(0.05, 0.09, length(p - vec2(0.13, 0.04))));
  t -= 0.08 * (1.0 - smoothstep(0.04, 0.07, length(p - vec2(0.02, -0.18))));
  gl_FragColor = vec4(vec3(t), 1.0);
}
`;

/**
 * The valley and its hills. Moonlight from ahead and above catches the
 * slopes that face it; distance fades everything toward the horizon grey,
 * so the ranges stand in layers like the valley at the top of the page.
 * Each ground group of lanterns throws a small pool of light round it.
 */
export const LAND_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const LAND_FRAG = /* glsl */ `
uniform vec3 uCam;
uniform vec3 uMoonDir;
uniform vec4 uPools[5];
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec3 n = normalize(vNormalW);
  float lit = max(dot(n, uMoonDir), 0.0);
  float t = 0.06 + 0.1 * lit;
  for (int i = 0; i < 5; i++) {
    vec2 d = (vWorld.xz - uPools[i].xy) / vec2(1.6, uPools[i].z);
    t += uPools[i].w * 0.16 / (1.0 + dot(d, d) * 2.0);
  }
  float fog = 1.0 - exp(-distance(vWorld, uCam) * 0.005);
  t = mix(t, ${HORIZON.toFixed(2)}, fog);
  gl_FragColor = vec4(vec3(clamp(t, 0.04, 1.0)), 1.0);
}
`;

/**
 * The small lanterns, one instanced mesh for the field that rises and one
 * for the lanterns on the ground.
 *
 * aBase is x, starting height, z. aMisc is rise speed, phase, size, group.
 * The field wraps in a band round the camera's height, so there are always
 * lanterns about however high the camera goes; each shrinks away near the
 * band's ends, near the ground, and under uFloor, instead of popping.
 * The cursor pushes each lantern away from it on screen, worked out in
 * view space so a near lantern moves as far on screen as a far one.
 */
export const LANTERN_VERT = /* glsl */ `
attribute vec3 aBase;
attribute vec4 aMisc;
uniform float uTime;
uniform float uCamY;
uniform float uBand;
uniform float uFloor;
uniform float uGround;
uniform float uDrift;
uniform vec2 uPointer;
uniform float uPush;
uniform float uAspect;
uniform float uTanHalf;
uniform float uRows[6];
varying float vGlow;
varying float vH;
varying float vFace;
varying float vDepth;
void main() {
  float speed = aMisc.x;
  float phase = aMisc.y;
  float size = aMisc.z;
  float y = aBase.y + uTime * speed;
  y = uCamY + mod(y - uCamY + uBand, 2.0 * uBand) - uBand;
  float grow = 1.0 - smoothstep(uBand - 8.0, uBand, abs(y - uCamY));
  grow *= smoothstep(uFloor, uFloor + 4.0, y);
  grow *= smoothstep(uGround - 0.2, uGround + 1.4, y);

  vec3 c = vec3(
    aBase.x + uDrift * sin(uTime * 0.23 + phase) * 0.6,
    y,
    aBase.z + uDrift * cos(uTime * 0.19 + phase * 1.3) * 0.6
  );

  // A slow sway about the lantern's middle.
  float sw = sin(uTime * 0.7 + phase) * 0.09;
  float cs = cos(sw);
  float sn = sin(sw);
  vec3 p = position * size * grow;
  p = vec3(p.x * cs - p.y * sn, p.x * sn + p.y * cs, p.z);
  vec3 nrm = vec3(normal.x * cs - normal.y * sn, normal.x * sn + normal.y * cs, normal.z);

  vec4 mc = viewMatrix * vec4(c, 1.0);
  float depth = max(0.5, -mc.z);
  vec2 ndc = mc.xy / (depth * uTanHalf * vec2(uAspect, 1.0));
  vec2 d = (ndc - uPointer) * vec2(uAspect, 1.0);
  float dist = length(d);
  float k = uPush * (1.0 - smoothstep(0.0, 0.5, dist));
  vec2 dir = d / max(dist, 0.0001);
  mc.xy += dir * k * 0.22 * depth * uTanHalf;

  vec4 mv = mc + viewMatrix * vec4(p, 0.0);
  gl_Position = projectionMatrix * mv;

  vH = position.y / ${(0.9).toFixed(1)} + 0.5;
  vFace = normalize(mat3(viewMatrix) * nrm).z;
  vDepth = depth;
  float flicker = 0.9 + 0.1 * sin(uTime * 1.7 + phase * 3.0);
  vGlow = uRows[int(aMisc.w + 0.5)] * flicker;
}
`;

/**
 * Paper lit from inside: brightest where it faces the camera and low down
 * near the flame, with a few darker ribs. Seen through an open end, the
 * inside is the brightest of all.
 */
export const LANTERN_FRAG = /* glsl */ `
varying float vGlow;
varying float vH;
varying float vFace;
varying float vDepth;
void main() {
  float t;
  if (gl_FrontFacing) {
    float body = 0.45 + 0.55 * clamp(vFace, 0.0, 1.0);
    float warm = mix(1.0, 0.72, vH);
    float rib = smoothstep(0.86, 1.0, abs(sin(vH * 3.14159 * 6.0)));
    t = vGlow * body * warm * (1.0 - 0.3 * rib);
    t *= 1.0 - 0.6 * (1.0 - step(0.05, vH) * step(vH, 0.95));
  } else {
    t = vGlow;
  }
  float fog = 1.0 - exp(-vDepth * 0.006);
  t = mix(t, ${HORIZON.toFixed(2)}, fog * 0.6);
  gl_FragColor = vec4(vec3(clamp(t, 0.05, 1.0)), 1.0);
}
`;

/**
 * A project lantern: the same paper, with the project's name painted on
 * it. The texture's red is the paper (1) and the ink (0).
 */
export const BIG_VERT = /* glsl */ `
varying vec2 vUv;
varying float vFace;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFace = normalize(normalMatrix * normal).z;
  gl_Position = projectionMatrix * mv;
}
`;

export const BIG_FRAG = /* glsl */ `
uniform sampler2D uPaper;
uniform float uGlow;
varying vec2 vUv;
varying float vFace;
void main() {
  float t;
  if (gl_FrontFacing) {
    float paper = texture2D(uPaper, vUv).r;
    float body = 0.5 + 0.5 * clamp(vFace, 0.0, 1.0);
    float warm = mix(1.0, 0.8, vUv.y);
    t = uGlow * body * warm * (0.12 + 0.88 * paper);
  } else {
    t = uGlow;
  }
  gl_FragColor = vec4(vec3(clamp(t, 0.05, 1.0)), 1.0);
}
`;
