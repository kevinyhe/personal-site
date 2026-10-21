import * as THREE from "three";

import { pressure } from "@/components/below/b20/layout";

/**
 * One brush stroke down a whole block of the page, painted by the scroll:
 * its wet head stays a little below the middle of the screen and the ink
 * behind it stays on the page, as the line on lukebaffait.fr does.
 *
 * The path is given in the block's own pixels (x from its left, y from its
 * top) as runs. A run is one load of the brush: it lands light, bears down,
 * and is running dry by the time the next run lands. All the runs are one
 * curve, so the stroke never lifts.
 *
 * It is drawn on a canvas one screen tall that the block keeps pinned
 * (sticky), with an orthographic camera that follows the scroll, so a
 * pixel of path is a pixel of page. The grain is design 20's brush.
 */

export type Run = readonly (readonly [number, number])[];

export type PageStroke = {
  /** Lay the path. `vh` is the screen height the grain is scaled to. */
  build(runs: Run[], vh: number): void;
  /** `top`: the block's top relative to the top of the screen, in px;
   *  `height`: the block's height. */
  render(top: number, height: number): void;
  resize(): void;
  dispose(): void;
};

/** Where the wet head sits, as a share of the screen from the top. */
const HEAD = 0.62;
/** Curve samples between two control points. */
const PER = 24;

const VERT = /* glsl */ `
attribute float aDry;
varying vec2 vUv;
varying float vDry;
void main() {
  vUv = uv;
  vDry = aDry;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Design 20's RIBBON_FRAG, with the dryness per vertex (each run dries on
 *  its own) and lengths in half-screens so the grain keeps its size. */
const FRAG = /* glsl */ `
uniform float uDraw;
uniform float uLen;
uniform float uSeed;
uniform vec3 uInk;
varying vec2 vUv;
varying float vDry;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
}

void main() {
  float t = vUv.x;
  if (t > uDraw) discard;
  float across = vUv.y * 2.0 - 1.0;
  float s = t * uLen;

  float head = clamp((uDraw - t) * uLen / 0.04, 0.0, 1.0);
  if (abs(across) > sqrt(head)) discard;

  float bristle = noise(vec2(s * 2.5 + uSeed, vUv.y * 38.0));
  float fine = noise(vec2(s * 14.0, vUv.y * 90.0 + uSeed));

  float dry = vDry * 0.55 + pow(abs(across), 3.0) * 0.45;
  if (bristle * 0.7 + fine * 0.3 < dry * 0.95) discard;

  float edge = abs(across) + (noise(vec2(s * 9.0, uSeed)) - 0.5) * 0.25;
  if (edge > 0.97) discard;

  float wet = 1.0 - smoothstep(0.0, 0.18, (uDraw - t) * uLen);
  float ink = 0.8 + 0.16 * bristle + 0.08 * wet - 0.25 * dry;
  gl_FragColor = vec4(uInk, clamp(ink, 0.0, 1.0));
}
`;

export function createPageStroke(canvas: HTMLCanvasElement, ink: string, seed = 2.3): PageStroke | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false, antialias: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 2000);
  camera.position.z = 1000;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uDraw: { value: 0 }, uLen: { value: 1 }, uSeed: { value: seed }, uInk: { value: new THREE.Color(ink) } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let w = 1;
  let h = 1;
  const resize = (): void => {
    w = Math.max(2, canvas.clientWidth);
    h = Math.max(2, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, 2560 / w));
    renderer.setSize(w, h, false);
    camera.left = 0;
    camera.right = w;
    camera.top = 0;
    camera.bottom = -h;
    camera.updateProjectionMatrix();
  };
  resize();

  // Per sample: page y (px), and the running lowest point reached so far,
  // so a loop that climbs back up does not make the head jump.
  let ys = new Float32Array(0);
  let reach = new Float32Array(0);
  let total = 1;
  let cum = new Float32Array(0);

  const build = (runs: Run[], vh: number): void => {
    const pts: THREE.Vector3[] = [];
    const starts: number[] = [];
    for (const run of runs) {
      if (!run.length) continue;
      starts.push(pts.length);
      for (const [x, y] of run) pts.push(new THREE.Vector3(x, -y, 0));
    }
    if (pts.length < 2) {
      geo.setDrawRange(0, 0);
      ys = new Float32Array(0);
      return;
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const n = PER * (pts.length - 1);
    const at = Array.from({ length: n + 1 }, (_, i) => curve.getPoint(i / n));
    cum = new Float32Array(n + 1);
    for (let i = 1; i <= n; i += 1) cum[i] = cum[i - 1] + at[i].distanceTo(at[i - 1]);
    total = Math.max(1, cum[n]);
    // Where each run lands, in px along the stroke.
    const landAt = starts.map((k) => cum[k * PER]);
    landAt.push(total);

    const half = vh / 2;
    const hwMax = 0.024 * vh;
    const positions = new Float32Array((n + 1) * 6);
    const uvs = new Float32Array((n + 1) * 4);
    const dry = new Float32Array((n + 1) * 2);
    const index = new Uint32Array(n * 6);
    ys = new Float32Array(n + 1);
    reach = new Float32Array(n + 1);
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();
    let run = 0;
    for (let i = 0; i <= n; i += 1) {
      const p = at[i];
      const a = at[Math.max(0, i - 1)];
      const b = at[Math.min(n, i + 1)];
      tan.subVectors(b, a).normalize();
      side.set(-tan.y, tan.x, 0);
      while (run < landAt.length - 2 && cum[i] >= landAt[run + 1]) run += 1;
      const local = (cum[i] - landAt[run]) / Math.max(1, landAt[run + 1] - landAt[run]);
      // The brush turns in the hand, so the stroke narrows and swells.
      const s = cum[i] / half;
      const turn = 0.45 * Math.sin(s * 1.3 + seed);
      const hw = hwMax * Math.cos(turn) * pressure(local, seed + run);
      positions.set([p.x - side.x * hw, p.y - side.y * hw, 0, p.x + side.x * hw, p.y + side.y * hw, 0], i * 6);
      const u = cum[i] / total;
      uvs.set([u, 0, u, 1], i * 4);
      const d = THREE.MathUtils.smoothstep(local, 0.5, 1);
      dry[i * 2] = d;
      dry[i * 2 + 1] = d;
      ys[i] = -p.y;
      reach[i] = i ? Math.max(reach[i - 1], ys[i]) : ys[i];
      if (i < n) index.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute("aDry", new THREE.BufferAttribute(dry, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, Infinity);
    mat.uniforms.uLen.value = total / half;
    last = "";
  };

  /** How much of the stroke is down when the head line is at page y `line`. */
  const drawnTo = (line: number): number => {
    const n = reach.length - 1;
    if (n < 1 || line <= reach[0]) return 0;
    if (line >= reach[n]) return 1;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (reach[mid] < line) lo = mid;
      else hi = mid;
    }
    const f = (line - reach[lo]) / Math.max(1e-3, reach[hi] - reach[lo]);
    return (cum[lo] + f * (cum[hi] - cum[lo])) / total;
  };

  let last = "";
  const render = (top: number, height: number): void => {
    // The canvas is pinned inside the block, so the part of the block it
    // shows is from max(0, -top), and never past the block's last screen.
    const view = Math.min(Math.max(0, -top), Math.max(0, height - h));
    const draw = drawnTo(-top + HEAD * h);
    const key = `${view.toFixed(1)}:${draw.toFixed(4)}:${w}x${h}`;
    if (key === last) return;
    last = key;
    camera.position.y = -view;
    mat.uniforms.uDraw.value = draw;
    mesh.visible = draw > 0;
    renderer.render(scene, camera);
  };

  return {
    build,
    render,
    resize: () => {
      last = "";
      resize();
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    },
  };
}
