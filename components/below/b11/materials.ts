import * as THREE from "three";

/**
 * The plates' materials. Every one is a short shader of our own that
 * writes a grey and nothing else, because the picture is only ever read
 * by the bar shader, and the bar shader reads brightness: a dark grey is
 * a wide plum bar, a pale grey a thin one.
 *
 * The renderer writes linear values straight out (no tone mapping, no
 * colour space change), so the grey a shader writes is the grey the bar
 * shader sees. Nothing goes under 0.1: the bar shader throws away black
 * cells, and a black hole in a plate would show the page through it.
 */

/** Light from the upper left, a little in front. Fixed in the world, so a turning object shows all its faces. */
const LIGHT = new THREE.Vector3(-0.55, 0.8, 0.6).normalize();

const INK_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vL;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  n = mat3(instanceMatrix) * n;
  #endif
  vL = position;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * p;
}
`;

const INK_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform float uDark;
uniform float uLit;
uniform float uBands;
varying vec3 vN;
varying vec3 vL;
void main() {
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  float d = max(dot(n, uLight), 0.0);
  float g = mix(uDark, uLit, d);
  if (uBands > 0.0) {
    g *= 0.82 + 0.18 * sin(vL.y * uBands);
  }
  gl_FragColor = vec4(vec3(max(g, 0.1)), 1.0);
}
`;

/** A solid thing, shaded from `dark` (facing away) to `lit` (facing the light). */
export function ink(dark = 0.12, lit = 0.5, bands = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLight: { value: LIGHT.clone() },
      uDark: { value: dark },
      uLit: { value: lit },
      uBands: { value: bands },
    },
    vertexShader: INK_VERT,
    fragmentShader: INK_FRAG,
    side: THREE.DoubleSide,
  });
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform float uTop;
uniform float uLow;
varying vec3 vDir;
void main() {
  float h = smoothstep(-0.05, 0.55, vDir.y);
  gl_FragColor = vec4(vec3(mix(uLow, uTop, h)), 1.0);
}
`;

/** The sky, a big sphere seen from inside: pale overhead, a shade darker at the horizon. */
export function sky(top = 0.86, low = 0.7): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uTop: { value: top }, uLow: { value: low } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  m.renderOrder = -1;
  return m;
}

const GROUND_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const GROUND_FRAG = /* glsl */ `
uniform float uNear;
uniform float uFar;
uniform float uReach;
uniform float uTile;
uniform float uTileHalf;
varying vec3 vW;
void main() {
  float g = mix(uNear, uFar, smoothstep(uReach * 0.2, uReach, length(vW.xz)));
  if (uTile > 0.0 && abs(vW.x) < uTileHalf && abs(vW.z) < uTileHalf) {
    vec2 f = abs(fract(vW.xz / uTile + 0.5) - 0.5);
    float seam = step(0.47, max(f.x, f.y));
    g = mix(0.6, 0.22, seam);
  }
  gl_FragColor = vec4(vec3(g), 1.0);
}
`;

/**
 * The floor: a wide disc that pales into the horizon. With `tile` set it
 * draws a square of foam tiles with dark seams in the middle, the VEX field.
 */
export function ground(radius = 40, near = 0.54, far = 0.7, tile = 0, tiles = 0): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 64);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: {
        uNear: { value: near },
        uFar: { value: far },
        uReach: { value: radius * 0.6 },
        uTile: { value: tile },
        uTileHalf: { value: (tile * tiles) / 2 },
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
    }),
  );
}

const PIC_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PIC_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uGain;
uniform float uLift;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  float v = max(c.r, max(c.g, c.b)) * c.a;
  if (v < 0.03) discard;
  gl_FragColor = vec4(vec3(max(uLift + v * uGain, 0.1)), 1.0);
}
`;

/**
 * A flat picture from one of the valley's own painters (the hills, the
 * blossom clouds), stood up in the scene. They paint grey on black; the
 * black is cut away so the sky shows round them, and the grey is kept.
 */
export function picture(map: THREE.Texture, gain = 1, lift = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uGain: { value: gain }, uLift: { value: lift } },
    vertexShader: PIC_VERT,
    fragmentShader: PIC_FRAG,
    side: THREE.DoubleSide,
    transparent: false,
  });
}

const RING_VERT = /* glsl */ `
varying vec3 vL;
void main() {
  vL = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform float uInner;
uniform float uOuter;
varying vec3 vL;
void main() {
  float r = (length(vL.xy) - uInner) / (uOuter - uInner);
  // Two gaps, like the planet's own: one narrow, one wide.
  if (abs(r - 0.62) < 0.035 || abs(r - 0.3) < 0.015) discard;
  float g = 0.34 + 0.3 * r + 0.06 * sin(r * 70.0);
  gl_FragColor = vec4(vec3(g), 1.0);
}
`;

/** The planet's ring, lying in its own XY plane, in bands of grey with two gaps. */
export function ringMaterial(inner: number, outer: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uInner: { value: inner }, uOuter: { value: outer } },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    side: THREE.DoubleSide,
  });
}

/** Frees every geometry, material and texture under a node. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      if ((m as THREE.ShaderMaterial).uniforms) {
        for (const u of Object.values((m as THREE.ShaderMaterial).uniforms)) {
          if (u.value instanceof THREE.Texture) u.value.dispose();
        }
      }
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
