import * as THREE from "three";
import * as L from "./layout";
import type { Form } from "./sample";
import { TILE_FRAG, TILE_VERT } from "./shaders";

/**
 * The picture, drawn grey on black into a canvas nobody sees. The page
 * hands that canvas to the bar dither, which is what the visitor sees. This
 * file knows nothing about the page: each frame it is told which two words
 * the tiles are between, how far across, and where the cursor is.
 */

export type SceneInput = {
  pair: L.Pair;
  time: number;
  leanX: number;
  leanY: number;
  /** The cursor on the word plane, world units, and how hard it pushes (a spring: it can go below 0). */
  push: { x: number; y: number; s: number };
};

export type LettersScene = {
  resize(width: number, height: number, aspect: number): void;
  setForms(forms: readonly Form[]): void;
  render(input: SceneInput): void;
  readonly pool: number;
  dispose(): void;
};

export function buildScene(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): LettersScene {
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
  // This canvas is a source for the dither, not what is shown; its size is
  // set in pixels by resize().
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);
  // Grey in, grey out: no colour conversion on the way.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(L.FOV, 1.85, L.NEAR, L.FAR);

  const mat = new THREE.ShaderMaterial({
    vertexShader: TILE_VERT,
    fragmentShader: TILE_FRAG,
    uniforms: {
      uT: { value: 0 },
      uSpanA: { value: new THREE.Vector2(0, 1) },
      uSizeA: { value: 0.01 },
      uSizeB: { value: 0.01 },
      uYawA: { value: 0 },
      uYawB: { value: 0 },
      uDepth: { value: L.DEPTH },
      uPush: { value: new THREE.Vector3(0, 0, 0) },
      uPushR: { value: 0.28 },
      uTime: { value: 0 },
    },
    side: THREE.DoubleSide,
  });

  // Split twice across and four times down, so the box has the points it
  // needs to bend into a petal with a notch at its tip.
  const box = new THREE.BoxGeometry(1, 1, 1, 2, 4, 1);
  let geo = new THREE.InstancedBufferGeometry();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let forms: readonly Form[] = [];
  let pool = 0;
  let aA: THREE.InstancedBufferAttribute | null = null;
  let aB: THREE.InstancedBufferAttribute | null = null;
  let shownA = -1;
  let shownB = -1;
  let aspect = 1.85;

  const fill = (attr: THREE.InstancedBufferAttribute, f: Form): void => {
    const arr = attr.array as Float32Array;
    const n = Math.max(1, f.count);
    for (let i = 0; i < pool; i += 1) {
      const j = (i % n) * 3;
      arr[i * 4] = f.pos[j];
      arr[i * 4 + 1] = f.pos[j + 1];
      arr[i * 4 + 2] = f.pos[j + 2];
      // Tiles past this word's count are extras: they sit on a random tile
      // of it (the order was shuffled) and only show as petals.
      arr[i * 4 + 3] = i < f.count ? 1 : 0;
    }
    attr.needsUpdate = true;
  };

  const setForms = (next: readonly Form[]): void => {
    forms = next;
    pool = Math.max(1, ...next.map((f) => f.count));
    geo.dispose();
    geo = new THREE.InstancedBufferGeometry();
    geo.index = box.index;
    geo.setAttribute("position", box.getAttribute("position"));
    aA = new THREE.InstancedBufferAttribute(new Float32Array(pool * 4), 4);
    aB = new THREE.InstancedBufferAttribute(new Float32Array(pool * 4), 4);
    const seeds = new Float32Array(pool * 4);
    const rand = L.seeded(2024);
    for (let i = 0; i < seeds.length; i += 1) seeds[i] = rand();
    geo.setAttribute("aA", aA);
    geo.setAttribute("aB", aB);
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = pool;
    mesh.geometry = geo;
    shownA = -1;
    shownB = -1;
  };

  const render = (f: SceneInput): void => {
    if (!forms.length || !aA || !aB) return;
    const { a, b, t } = f.pair;
    const fa = forms[a];
    const fb = forms[b];
    if (a !== shownA) {
      fill(aA, fa);
      shownA = a;
    }
    if (b !== shownB) {
      fill(aB, fb);
      shownB = b;
    }
    const u = mat.uniforms;
    u.uT.value = t;
    (u.uSpanA.value as THREE.Vector2).set(fa.span[0], fa.span[1]);
    u.uSizeA.value = fa.size;
    u.uSizeB.value = fb.size;
    u.uYawA.value = fa.yaw;
    u.uYawB.value = fb.yaw;
    u.uTime.value = f.time;
    (u.uPush.value as THREE.Vector3).set(f.push.x, f.push.y, f.push.s);

    const cam = L.cameraAt(f.leanX, f.leanY);
    camera.aspect = aspect;
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    // The standing word sways a little, as if it were light.
    mesh.rotation.y = 0.025 * Math.sin(f.time * 0.35);
    renderer.render(scene, camera);
  };

  return {
    resize(width: number, height: number, a: number): void {
      renderer.setSize(width, height, false);
      aspect = a;
    },
    setForms,
    render,
    get pool(): number {
      return pool;
    },
    dispose(): void {
      geo.dispose();
      box.dispose();
      mat.dispose();
      renderer.dispose();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
