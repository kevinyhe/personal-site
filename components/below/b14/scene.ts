import * as THREE from "three";
import { BAND, BLOSSOM } from "@/components/bandColours";
import {
  type Cam,
  curlAt,
  type Curl,
  makePetals,
  offsetAt,
  PAGE_H,
  PAGE_W,
  petalAt,
  SEG_S,
  SEG_Z,
  SHEETS,
} from "./layout";
import { DESK_FRAG, DESK_VERT, SHEET_FRAG, SHEET_VERT } from "./shaders";

/**
 * The desk, the sheets and the petals, drawn with three.js. This file
 * knows nothing about the page: it is handed a canvas, and each frame the
 * number of turns and the camera. What is printed on each face comes from
 * `paint`, asked for only when a face is about to be seen, and kept in a
 * small pool of textures so seven sheets do not hold thirteen large
 * canvases on the graphics card at once.
 */

export type PaperScene = {
  resize(width: number, height: number): void;
  frame(turns: number, cam: Cam): void;
  /** Throw away every printed face; they are printed again as they are needed. Used once the fonts are in. */
  reprint(): void;
  /** Faces printed and on the card now. */
  resident(): string[];
  dispose(): void;
};

const MAX_BUFFER_WIDTH = 2560;
const MAX_RATIO = 1.5;
/** Printed faces kept on the card. Four are in view at most; the rest are the next and the last. */
const POOL = 8;
const PETALS = 46;
const DEEP = "#1a0812";

const rgb = (hex: string): THREE.Vector3 => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** The flat grid every sheet is bent from. Wound so its front faces up. */
function sheetGeometry(): THREE.BufferGeometry {
  const cols = SEG_S + 1;
  const rows = SEG_Z + 1;
  const sheet = new Float32Array(cols * rows * 2);
  const pos = new Float32Array(cols * rows * 3);
  for (let iz = 0; iz < rows; iz += 1) {
    for (let is = 0; is < cols; is += 1) {
      const i = iz * cols + is;
      const s = (is / SEG_S) * PAGE_W;
      const zn = iz / SEG_Z;
      sheet[i * 2] = s;
      sheet[i * 2 + 1] = zn;
      pos[i * 3] = s;
      pos[i * 3 + 2] = (zn - 0.5) * PAGE_H;
    }
  }
  const index: number[] = [];
  for (let iz = 0; iz < SEG_Z; iz += 1) {
    for (let is = 0; is < SEG_S; is += 1) {
      const a = iz * cols + is;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSheet", new THREE.BufferAttribute(sheet, 2));
  g.setIndex(index);
  return g;
}

/** One petal, blossom pink, paler at the tip, with the notch a sakura petal has. */
function petalTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.translate(64, 64);
    const g = ctx.createLinearGradient(0, 56, 0, -56);
    g.addColorStop(0, "#e893bf");
    g.addColorStop(0.5, BLOSSOM);
    g.addColorStop(1, "#fde3f0");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 58);
    ctx.bezierCurveTo(-46, 30, -44, -40, -14, -56);
    ctx.lineTo(0, -44);
    ctx.lineTo(14, -56);
    ctx.bezierCurveTo(44, -40, 46, 30, 0, 58);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

type Slot = { key: string; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; used: number };

export function buildPaper(
  canvas: HTMLCanvasElement,
  paper: HTMLCanvasElement,
  paint: (key: string, canvas: HTMLCanvasElement) => void,
): PaperScene {
  // Asked for here, not by three, so a browser with no WebGL2 fails before
  // anything is built and the caller can fall back to the plain page.
  const attributes: WebGLContextAttributes = {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    powerPreference: "high-performance",
  };
  const gl = canvas.getContext("webgl2", attributes);
  if (!gl) throw new Error("b14: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attributes });
  renderer.setClearColor(BAND, 1);
  // Colours pass through untouched: what the canvas prints is what shows.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1.85, 0.1, 60);

  const makeTexture = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    return t;
  };
  const paperTexture = keep(makeTexture(paper));

  // ------------------------------------------------------------ desk
  const cast = new THREE.Vector4(0, 0, 0, 0);
  const deskMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: DESK_VERT,
      fragmentShader: DESK_FRAG,
      uniforms: {
        uPlum: { value: rgb(BAND) },
        uDeep: { value: rgb(DEEP) },
        uPileR: { value: new THREE.Vector4(0, -PAGE_H / 2, PAGE_W, PAGE_H / 2) },
        uPileL: { value: new THREE.Vector4(-PAGE_W, -PAGE_H / 2, 0, PAGE_H / 2) },
        uPiles: { value: new THREE.Vector2(1, 0) },
        uCentre: { value: new THREE.Vector2(0.6, 0) },
        uCast: { value: cast },
        uHalfH: { value: PAGE_H / 2 },
      },
    }),
  );
  const deskGeo = keep(new THREE.PlaneGeometry(60, 40));
  deskGeo.rotateX(-Math.PI / 2);
  const desk = new THREE.Mesh(deskGeo, deskMat);
  scene.add(desk);

  // ------------------------------------------------------------ sheets
  const sheetGeo = keep(sheetGeometry());
  const light = new THREE.Vector3(-0.45, 0.85, 0.3).normalize();
  type Sheet = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; curl: Curl };
  const sheets: Sheet[] = [];
  for (let j = 0; j < SHEETS; j += 1) {
    const mat = keep(
      new THREE.ShaderMaterial({
        vertexShader: SHEET_VERT,
        fragmentShader: SHEET_FRAG,
        side: THREE.DoubleSide,
        uniforms: {
          uXc: { value: PAGE_W },
          uR: { value: 0.2 },
          uSkew: { value: 0 },
          uBase: { value: 0 },
          uJit: { value: new THREE.Vector3() },
          uW: { value: PAGE_W },
          uH: { value: PAGE_H },
          uFront: { value: paperTexture },
          uBack: { value: paperTexture },
          uLight: { value: light },
          uReceive: { value: 1 },
          uCast: { value: cast },
          uHalfH: { value: PAGE_H / 2 },
        },
      }),
    );
    const mesh = new THREE.Mesh(sheetGeo, mat);
    // The vertex shader moves the sheet a long way from where three thinks it is.
    mesh.frustumCulled = false;
    scene.add(mesh);
    sheets.push({ mesh, mat, curl: { xc: PAGE_W, r: 0.2, skew: 0, base: 0 } });
  }

  // ------------------------------------------------------------ petals
  const petals = makePetals(PETALS);
  const petalGeo = keep(new THREE.PlaneGeometry(1, 1));
  petalGeo.rotateX(-Math.PI / 2);
  const petalMap = keep(petalTexture());
  const petalMat = keep(new THREE.MeshBasicMaterial({ map: petalMap, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
  const petalMesh = new THREE.InstancedMesh(petalGeo, petalMat, petals.length);
  petalMesh.frustumCulled = false;
  scene.add(petalMesh);
  const dummy = new THREE.Object3D();
  const petalSpot = { x: 0, y: 0, z: 0, spin: 0, lift: 0 };
  let petalTurns = -1;
  const placePetals = (turns: number): void => {
    if (Math.abs(turns - petalTurns) < 1e-4) return;
    petalTurns = turns;
    petals.forEach((p, i) => {
      petalAt(p, turns, petalSpot);
      dummy.position.set(petalSpot.x, petalSpot.y, petalSpot.z);
      dummy.rotation.set(p.tilt * petalSpot.lift * 2, petalSpot.spin, p.tilt * (0.3 + petalSpot.lift), "YXZ");
      dummy.scale.setScalar(p.size);
      dummy.updateMatrix();
      petalMesh.setMatrixAt(i, dummy.matrix);
    });
    petalMesh.instanceMatrix.needsUpdate = true;
  };

  // ------------------------------------------------------------ printed faces
  const slots: Slot[] = [];
  let clock = 0;
  const find = (key: string): Slot | undefined => slots.find((s) => s.key === key);
  /** Prints a face into the pool, reusing the least recently used slot when full. */
  const ensure = (key: string): Slot => {
    const have = find(key);
    if (have) {
      have.used = clock;
      return have;
    }
    let slot: Slot;
    if (slots.length < POOL) {
      const c = document.createElement("canvas");
      slot = { key, canvas: c, texture: makeTexture(c), used: clock };
      slots.push(slot);
    } else {
      slot = slots.reduce((a, b) => (a.used <= b.used ? a : b));
      slot.key = key;
      slot.used = clock;
    }
    paint(key, slot.canvas);
    slot.texture.needsUpdate = true;
    return slot;
  };
  const textureFor = (key: string, need: Set<string>): THREE.Texture => (need.has(key) ? (find(key)?.texture ?? paperTexture) : paperTexture);

  let width = 1;
  let height = 1;

  return {
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO, MAX_BUFFER_WIDTH / width);
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    frame(turns, cam) {
      clock += 1;
      const T = Math.max(0, Math.min(SHEETS - 1, turns));
      const k = Math.min(SHEETS - 1, Math.floor(T));
      const t = k === SHEETS - 1 ? 0 : T - k;

      // The faces that can be seen now, printed before drawing; then at
      // most one of the faces a turn either way will need.
      const need = new Set<string>([`f${k}`]);
      if (k > 0) need.add(`b${k - 1}`);
      if (t > 0) {
        need.add(`b${k}`);
        if (k + 1 < SHEETS) need.add(`f${k + 1}`);
      }
      // Mark what is already printed first, so printing a missing face
      // never throws out one this same frame needs.
      need.forEach((key) => {
        const have = find(key);
        if (have) have.used = clock;
      });
      need.forEach((key) => ensure(key));
      const next = [`b${k}`, `f${k + 1}`, `f${k - 1}`, `b${k - 2}`].filter((key) => {
        const j = Number(key.slice(1));
        return j >= 0 && j < SHEETS - (key[0] === "b" ? 1 : 0) && !find(key);
      });
      if (next.length) ensure(next[0]);

      cast.set(0, 0, 0, 0);
      for (let j = 0; j < SHEETS; j += 1) {
        const s = sheets[j];
        const tj = j < k ? 1 : j === k ? t : 0;
        curlAt(j, tj, s.curl);
        const jit = offsetAt(j, tj);
        const u = s.mat.uniforms;
        u.uXc.value = s.curl.xc;
        u.uR.value = s.curl.r;
        u.uSkew.value = s.curl.skew;
        u.uBase.value = s.curl.base;
        (u.uJit.value as THREE.Vector3).set(jit[0], jit[1], jit[2]);
        u.uFront.value = textureFor(`f${j}`, need);
        u.uBack.value = textureFor(`b${j}`, need);
        const moving = tj > 0 && tj < 1;
        u.uReceive.value = moving ? 0 : 1;
        if (moving) {
          const land = s.curl.xc - Math.max(0, PAGE_W - s.curl.xc - Math.PI * s.curl.r);
          cast.set(s.curl.xc, s.curl.r, Math.sin(Math.PI * tj), land);
        }
      }
      (deskMat.uniforms.uPiles.value as THREE.Vector2).set(1, k > 0 ? 1 : Math.min(1, t * 1.6));
      placePetals(T);

      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
      camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
      camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
      renderer.render(scene, camera);
    },

    reprint() {
      for (const s of slots) s.key = "";
    },

    resident() {
      return slots.map((s) => s.key).filter(Boolean);
    },

    dispose() {
      for (const s of slots) {
        s.texture.dispose();
        s.canvas.width = 1;
        s.canvas.height = 1;
      }
      slots.length = 0;
      petalMesh.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
