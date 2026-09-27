import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type Cam, DEPTH, FAR, FOV, NEAR, PANEL_H, PANEL_W, PANELS, type Pose, RAIL } from "./layout";

/**
 * The room and the screen, in three.js, drawn straight to the page's
 * canvas. A dim plum floor and wall, lit from one side by a light the
 * cursor moves, and six panels on hinges. Every material is a short
 * shader of our own; the panels' paintings are the textures paint.ts
 * prints.
 *
 * Colours go in and out as the sRGB values written here: no colour
 * conversion and no tone curve, so plum is plum on screen.
 */

const LIT_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// Paper: never darker than two thirds lit, so a painting turned away from
// the light still reads. A faint sheen where the light skims it.
const PAPER_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLight;
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vN);
  float diff = max(dot(n, uLight), 0.0);
  vec3 v = normalize(cameraPosition - vW);
  vec3 h = normalize(uLight + v);
  float sheen = pow(max(dot(n, h), 0.0), 24.0);
  vec3 base = texture2D(uMap, vUv).rgb;
  vec3 col = base * (0.66 + 0.46 * diff) + vec3(0.07) * sheen;
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`;

// Frame and fittings: a coloured base with a hard highlight, which is what
// makes metal leaf read as metal.
const GILT_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uBase;
uniform float uShine;
uniform float uSpec;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  float diff = max(dot(n, uLight), 0.0);
  vec3 v = normalize(cameraPosition - vW);
  vec3 h = normalize(uLight + v);
  float spec = pow(max(dot(n, h), 0.0), uShine);
  vec3 col = uBase * (0.5 + 0.75 * diff) + vec3(1.0) * spec * uSpec;
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`;

// The floor: deep plum, a pool where the light falls, and the screen's
// shadow cast away from the light. Far off it fades to the band's plum.
const FLOOR_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform vec2 uPts[7];
uniform vec2 uPool;
varying vec3 vW;
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  return length(p - a - ab * t);
}
void main() {
  vec2 p = vW.xz;
  // What shades this spot stands between it and the lamp.
  vec2 q = p + normalize(uLight.xz + vec2(0.0001)) * 0.3;
  float d = 100.0;
  for (int i = 0; i < 6; i++) {
    d = min(d, seg(q, uPts[i], uPts[i + 1]));
  }
  float shadow = 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.75, d));
  vec2 dp = p - uPool;
  float pool = exp(-dot(dp, dp) / 16.0);
  vec3 deep = vec3(0.102, 0.031, 0.071);
  vec3 lit = vec3(0.32, 0.12, 0.22);
  vec3 col = mix(deep, lit, pool) * shadow;
  float far = smoothstep(8.0, 20.0, length(dp));
  col = mix(col, vec3(0.165, 0.051, 0.118), far);
  gl_FragColor = vec4(col, 1.0);
}
`;

// The wall: the band's plum, darker towards the floor, and a soft patch
// of light on it from the lamp's side.
const WALL_FRAG = /* glsl */ `
uniform vec2 uPatch;
varying vec3 vW;
void main() {
  vec3 band = vec3(0.165, 0.051, 0.118);
  vec3 deep = vec3(0.102, 0.031, 0.071);
  float low = smoothstep(3.5, 0.0, vW.y);
  vec3 col = mix(band, deep, low * 0.7);
  vec2 d = (vW.xy - uPatch) / vec2(5.5, 2.2);
  col += vec3(0.11, 0.045, 0.08) * exp(-dot(d, d));
  gl_FragColor = vec4(col, 1.0);
}
`;

export type Light = { x: number; y: number; z: number };

export type Room = {
  /** Textures are read from these canvases; call when they have been painted again. */
  refresh(): void;
  resize(cssW: number, cssH: number): void;
  draw(pose: Pose, cam: Cam, light: Light, focusX: number): void;
  dispose(): void;
};

/** Asks for the context first, so a browser without WebGL2 fails here and the page keeps its words. */
export function buildRoom(canvas: HTMLCanvasElement, faces: HTMLCanvasElement[], back: HTMLCanvasElement): Room {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: true, depth: true, stencil: false, powerPreference: "default" });
  if (!gl) throw new Error("b28: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  try {
    return assemble(renderer, faces, back);
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

function assemble(renderer: THREE.WebGLRenderer, faces: HTMLCanvasElement[], back: HTMLCanvasElement): Room {
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(new THREE.Color(0.165, 0.051, 0.118), 1);

  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(t: T): T => {
    owned.push(t);
    return t;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, NEAR, FAR);
  const uLight = { value: new THREE.Vector3(-0.7, 0.45, 0.55).normalize() };

  // ------------------------------------------------------------ room
  const floorU = {
    uLight,
    uPts: { value: Array.from({ length: PANELS + 1 }, () => new THREE.Vector2()) },
    uPool: { value: new THREE.Vector2() },
  };
  const floor = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(70, 50)),
    keep(new THREE.ShaderMaterial({ uniforms: floorU, vertexShader: LIT_VERT, fragmentShader: FLOOR_FRAG })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(3, 0, 2);
  scene.add(floor);

  const wallU = { uPatch: { value: new THREE.Vector2(0, 1.6) } };
  const wall = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(70, 16)),
    keep(new THREE.ShaderMaterial({ uniforms: wallU, vertexShader: LIT_VERT, fragmentShader: WALL_FRAG })),
  );
  wall.position.set(3, 8, -4.5);
  scene.add(wall);

  // ------------------------------------------------------------ panels
  // One frame, one set of fittings and one pair of face planes, shared by
  // all six panels. Local x runs 0..PANEL_W from the hinge on the left.
  const frameGeo = (() => {
    const parts = [
      new THREE.BoxGeometry(RAIL, PANEL_H, DEPTH).translate(RAIL / 2, PANEL_H / 2, 0),
      new THREE.BoxGeometry(RAIL, PANEL_H, DEPTH).translate(PANEL_W - RAIL / 2, PANEL_H / 2, 0),
      new THREE.BoxGeometry(PANEL_W - 2 * RAIL, RAIL, DEPTH).translate(PANEL_W / 2, RAIL / 2, 0),
      new THREE.BoxGeometry(PANEL_W - 2 * RAIL, RAIL, DEPTH).translate(PANEL_W / 2, PANEL_H - RAIL / 2, 0),
    ];
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) throw new Error("b28: frame did not merge");
    return keep(merged);
  })();
  const fitGeo = (() => {
    const s = RAIL * 2;
    const parts: THREE.BufferGeometry[] = [];
    for (const x of [s / 2 - 0.004, PANEL_W - s / 2 + 0.004]) {
      for (const y of [s / 2 - 0.004, PANEL_H - s / 2 + 0.004]) {
        parts.push(new THREE.BoxGeometry(s, s, DEPTH + 0.014).translate(x, y, 0));
      }
      // Hinge plates, a third of the way up and down.
      for (const y of [PANEL_H * 0.3, PANEL_H * 0.7]) {
        parts.push(new THREE.BoxGeometry(RAIL * 0.7, RAIL * 1.6, DEPTH + 0.01).translate(x < PANEL_W / 2 ? RAIL * 0.35 : PANEL_W - RAIL * 0.35, y, 0));
      }
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) throw new Error("b28: fittings did not merge");
    return keep(merged);
  })();
  const faceGeo = keep(new THREE.PlaneGeometry(PANEL_W - 2 * RAIL, PANEL_H - 2 * RAIL).translate(PANEL_W / 2, PANEL_H / 2, DEPTH * 0.2));
  const backGeo = keep(
    new THREE.PlaneGeometry(PANEL_W - 2 * RAIL, PANEL_H - 2 * RAIL)
      .rotateY(Math.PI)
      .translate(PANEL_W / 2, PANEL_H / 2, -DEPTH * 0.2),
  );

  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const texture = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = keep(new THREE.CanvasTexture(c));
    t.anisotropy = anisotropy;
    return t;
  };
  const faceTex = faces.map(texture);
  const backTex = texture(back);
  const paperMat = (map: THREE.Texture) => keep(new THREE.ShaderMaterial({ uniforms: { uLight, uMap: { value: map } }, vertexShader: LIT_VERT, fragmentShader: PAPER_FRAG }));
  const giltMat = (base: [number, number, number], shine: number, spec: number) =>
    keep(
      new THREE.ShaderMaterial({
        uniforms: { uLight, uBase: { value: new THREE.Vector3(...base) }, uShine: { value: shine }, uSpec: { value: spec } },
        vertexShader: LIT_VERT,
        fragmentShader: GILT_FRAG,
      }),
    );
  // The frame: blossom leaf, a shade deeper than the paper so the edge shows.
  const frameMat = giltMat([0.66, 0.44, 0.56], 36, 0.55);
  // The fittings: pale blossom metal with a hard white highlight.
  const fitMat = giltMat([0.93, 0.8, 0.87], 60, 0.9);
  const backMat = paperMat(backTex);

  const pivots: THREE.Group[] = [];
  for (let i = 0; i < PANELS; i += 1) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(frameGeo, frameMat));
    g.add(new THREE.Mesh(fitGeo, fitMat));
    g.add(new THREE.Mesh(faceGeo, paperMat(faceTex[i])));
    g.add(new THREE.Mesh(backGeo, backMat));
    scene.add(g);
    pivots.push(g);
  }

  const MAX_W = 2560;
  const resize = (cssW: number, cssH: number): void => {
    const w = Math.max(1, cssW);
    const h = Math.max(1, cssH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, MAX_W / w));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  let disposed = false;
  const draw = (pose: Pose, cam: Cam, light: Light, focusX: number): void => {
    if (disposed) return;
    for (let i = 0; i < PANELS; i += 1) {
      const p = pivots[i];
      p.position.set(pose.points[i].x, 0, pose.points[i].z);
      p.rotation.y = pose.psi[i];
    }
    for (let i = 0; i <= PANELS; i += 1) floorU.uPts.value[i].set(pose.points[i].x, pose.points[i].z);
    uLight.value.set(light.x, light.y, light.z).normalize();
    // The pool sits in front of the screen, pushed towards the lamp's side.
    floorU.uPool.value.set(focusX + uLight.value.x * 2.4, 1.6 + uLight.value.z * 1.2);
    wallU.uPatch.value.set(focusX + uLight.value.x * 3.5, 1.6);
    camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    camera.lookAt(cam.look.x, cam.look.y, cam.look.z);
    renderer.render(scene, camera);
  };

  return {
    refresh() {
      for (const t of faceTex) t.needsUpdate = true;
      backTex.needsUpdate = true;
    },
    resize,
    draw,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of owned) o.dispose();
      renderer.dispose();
      // Contexts are few; give this one back now.
      renderer.forceContextLoss();
    },
  };
}
