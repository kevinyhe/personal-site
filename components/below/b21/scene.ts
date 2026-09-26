import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { CanvasSource } from "@/components/valley/barShader";
import { fbm2, makeRng } from "@/components/valley/sources/noise";
import { type Card, makeCards } from "./cards";
import {
  camPos,
  EDGE_Y,
  FALL_AT,
  FAR,
  FOV,
  heightAt,
  LANTERN_H,
  LANTERN_PAIR,
  LANTERNS,
  NEAR,
  PADS,
  type Place,
  PLACES,
  rimAt,
  ROBOT,
  SHRINE,
  STREAM,
  STREAM_HALF_W,
  streamDist,
  TORII,
  TREES,
  UNDER_DEPTH,
  type V3,
  VILLAGE_PAD,
} from "./layout";
import {
  CARD_FRAG,
  FALL_FRAG,
  PETAL_FRAG,
  PETAL_VERT,
  SHADE_FRAG,
  SHADE_VERT,
  SOLID_FRAG,
  SOLID_VERT,
  UV_VERT,
  WATER_FRAG,
} from "./shaders";

/**
 * The floating island, drawn off screen in greys and handed to the bar
 * shader as a canvas source. It knows nothing about the page: each frame
 * it is told how the island is turned and where the camera is.
 *
 * The render is small on purpose. The bar shader samples one texel per
 * cell and there are 260 cells across, so about three texels a cell is
 * enough.
 */

export type Frame = {
  yaw: number;
  drop: number;
  tilt: number;
  bob: number;
  target: V3;
  dist: number;
  elev: number;
  time: number;
  /** 0..1 per place: how much it is brightened as its stop comes. */
  lift: readonly number[];
  /** 0..1 per village: how lit its lanterns are. */
  lit: readonly number[];
};

export type Island = {
  source: CanvasSource;
  resize(aspect: number): void;
  draw(frame: Frame): void;
  /** Resolves true when the robot has been placed, false if it could not load. */
  robot: Promise<boolean>;
  dispose(): void;
};

const RENDER_W = 900;
export const NOISE_SEED = 2121;
const noise = (x: number, y: number): number => fbm2(x, y, 4, NOISE_SEED);
const groundAt = (x: number, z: number): number => heightAt(x, z, noise);
/** The sun, fixed in the world: high, from the left and a little in front. */
const SUN = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();

/** Gives a geometry the attributes the shade material reads, and drops what the merge does not need. */
function tagged(geo: THREE.BufferGeometry, shade: number, glow = 0, group = -1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  const n = g.getAttribute("position").count;
  g.setAttribute("shade", new THREE.Float32BufferAttribute(new Array<number>(n).fill(shade), 1));
  g.setAttribute("glow", new THREE.Float32BufferAttribute(new Array<number>(n).fill(glow), 1));
  g.setAttribute("group", new THREE.Float32BufferAttribute(new Array<number>(n).fill(group), 1));
  return g;
}

/** Moves a part into place: rotation (x, y, z order) then position. */
function put(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  geo.applyMatrix4(m);
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error("b21: merge failed");
  return merged;
}

// --------------------------------------------------------------- places

/** A studio microphone on a stand. */
function micParts(): THREE.BufferGeometry[] {
  const tilt = -0.25;
  const head = new THREE.Matrix4().makeRotationX(tilt).setPosition(0, 1.45, 0);
  const onHead = (g: THREE.BufferGeometry, shade: number) => tagged(g.applyMatrix4(head), shade);
  const out = [
    tagged(put(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 20), 0, 0.04, 0), 0.55),
    tagged(put(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8), 0, 0.63, 0), 0.45),
    tagged(put(new THREE.TorusGeometry(0.28, 0.03, 6, 20, Math.PI), 0, 1.4, 0, 0, 0, Math.PI), 0.6),
    onHead(new THREE.CapsuleGeometry(0.2, 0.42, 6, 14), 0.8),
  ];
  for (const y of [-0.15, 0, 0.15]) {
    out.push(onHead(put(new THREE.TorusGeometry(0.205, 0.018, 5, 22), 0, y, 0, Math.PI / 2), 0.95));
  }
  return out;
}

/** A foam blaster on a display stand, seen side on. */
function blasterParts(): THREE.BufferGeometry[] {
  const dx = -0.17;
  return [
    tagged(put(new THREE.BoxGeometry(0.5, 0.06, 0.35), dx, 0.03, 0), 0.5),
    tagged(put(new THREE.BoxGeometry(0.12, 0.55, 0.12), dx, 0.3, 0), 0.4),
    tagged(put(new THREE.BoxGeometry(1.0, 0.3, 0.22), dx, 0.85, 0), 0.7),
    tagged(put(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 10), dx + 0.85, 0.9, 0, 0, 0, Math.PI / 2), 0.85),
    tagged(put(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 12), dx + 1.25, 0.9, 0, 0, 0, Math.PI / 2), 0.95),
    tagged(put(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 14), dx + 0.25, 0.82, 0, 0, 0, Math.PI / 2), 0.9),
    tagged(put(new THREE.BoxGeometry(0.16, 0.42, 0.18), dx - 0.3, 0.55, 0, 0, 0, -0.3), 0.6),
    tagged(put(new THREE.TorusGeometry(0.1, 0.022, 5, 12, Math.PI), dx - 0.08, 0.66, 0, 0, 0, Math.PI), 0.8),
    tagged(put(new THREE.BoxGeometry(0.5, 0.24, 0.18), dx - 0.72, 0.8, 0, 0, 0, 0.12), 0.65),
    tagged(put(new THREE.BoxGeometry(0.12, 0.08, 0.06), dx + 0.3, 1.04, 0), 0.95),
  ];
}

/** A boxing ring: platform, four posts, three ropes a side. */
function ringParts(): THREE.BufferGeometry[] {
  const out = [tagged(put(new THREE.BoxGeometry(2.1, 0.3, 2.1), 0, 0.15, 0), 0.55)];
  const c = 0.98;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(tagged(put(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8), sx * c, 0.775, sz * c), 0.85));
  for (const y of [0.65, 0.85, 1.05]) {
    for (const s of [-1, 1]) {
      out.push(tagged(put(new THREE.BoxGeometry(1.96, 0.035, 0.035), 0, y, s * c), 0.95));
      out.push(tagged(put(new THREE.BoxGeometry(0.035, 0.035, 1.96), s * c, y, 0), 0.95));
    }
  }
  // Steps up to one corner.
  for (let i = 0; i < 2; i += 1) out.push(tagged(put(new THREE.BoxGeometry(0.4, 0.1, 0.18), 0.6, 0.05 + i * 0.1, 1.2 - i * 0.12), 0.6));
  return out.map((g) => g.applyMatrix4(new THREE.Matrix4().makeRotationY(0.3)));
}

/** A tiled competition field: six by six tiles, a low wall, a small robot and two goals. */
function fieldParts(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const step = 0.36;
  for (let i = 0; i < 6; i += 1) {
    for (let j = 0; j < 6; j += 1) {
      const x = (i - 2.5) * step;
      const z = (j - 2.5) * step;
      out.push(tagged(put(new THREE.BoxGeometry(0.34, 0.05, 0.34), x, 0.025, z), (i + j) % 2 ? 0.44 : 0.62));
    }
  }
  const e = 3 * step + 0.03;
  for (const s of [-1, 1]) {
    out.push(tagged(put(new THREE.BoxGeometry(2 * e + 0.05, 0.16, 0.05), 0, 0.08, s * e), 0.9));
    out.push(tagged(put(new THREE.BoxGeometry(0.05, 0.16, 2 * e), s * e, 0.08, 0), 0.9));
  }
  out.push(tagged(put(new THREE.BoxGeometry(0.28, 0.2, 0.28), 0.35, 0.15, -0.3, 0, 0.4, 0), 0.85));
  for (const [x, z] of [
    [-0.45, 0.4],
    [0.55, 0.55],
  ]) {
    out.push(tagged(put(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 6), x, 0.09, z), 0.95));
    out.push(tagged(put(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), x, 0.2, z), 0.8));
  }
  return out.map((g) => g.applyMatrix4(new THREE.Matrix4().makeRotationY(0.25)));
}

/** A pedestal under a ringed planet. The planet itself floats on its own. */
function planetBase(): THREE.BufferGeometry[] {
  return [
    tagged(put(new THREE.CylinderGeometry(0.22, 0.3, 0.55, 12), 0, 0.275, 0), 0.45),
    tagged(put(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16), 0, 0.575, 0), 0.6),
  ];
}
function planetBody(): THREE.BufferGeometry[] {
  return [
    tagged(new THREE.IcosahedronGeometry(0.5, 2), 0.75),
    tagged(put(new THREE.RingGeometry(0.72, 1.0, 40), 0, 0, 0, -Math.PI / 2 + 0.45, 0, 0.2), 0.95),
  ];
}

// ---------------------------------------------------------------- build

export function buildIsland(canvas: HTMLCanvasElement, opts: { animated: boolean; update?: (time: number, dt: number) => void }): Island {
  // The context is asked for here, not by three, so a browser without one
  // fails before anything is built and the page keeps its words.
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    // The bar shader copies this canvas after the frame is drawn.
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("b21: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  try {
    return assemble(renderer, canvas, opts);
  } catch (error) {
    // Half a scene is no scene: hand the context back and let the page fall back.
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

function assemble(
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  opts: { animated: boolean; update?: (time: number, dt: number) => void },
): Island {
  renderer.setPixelRatio(1);
  // The greys go straight out: no colour conversion, no tone curve.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  // Not black: black is dropped by the bar shader together with its
  // neighbours, and that would eat the petals flying past the edge. This
  // grey is under the grade's white point, so it draws as plain plum.
  renderer.setClearColor(new THREE.Color(0.03, 0.03, 0.03), 1);

  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(t: T): T => {
    owned.push(t);
    return t;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, NEAR, FAR);
  // root carries the drift and the drag's tilt; spin carries the turn.
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  scene.add(root);

  const litU = { value: new Array<number>(5).fill(0) };
  const sunU = { value: SUN.clone() };
  const timeU = { value: 0 };
  const shadeMat = (side: THREE.Side = THREE.FrontSide, lift?: { value: number }) =>
    keep(
      new THREE.ShaderMaterial({
        uniforms: { uLit: litU, uLight: sunU, uLift: lift ?? { value: 0 } },
        vertexShader: SHADE_VERT,
        fragmentShader: SHADE_FRAG,
        side,
      }),
    );
  const plainMat = shadeMat();

  // ------------------------------------------------------------ the top
  {
    const RINGS = 56;
    const SEGS = 144;
    const grid: { x: number; y: number; z: number; s: number }[][] = [];
    for (let j = 0; j <= RINGS; j += 1) {
      const row: { x: number; y: number; z: number; s: number }[] = [];
      const u = j / RINGS;
      for (let a = 0; a <= SEGS; a += 1) {
        const az = (a / SEGS) * Math.PI * 2;
        const r = u * rimAt(az);
        const x = r * Math.sin(az);
        const z = r * Math.cos(az);
        const y = groundAt(x, z);
        // Grass, with a little noise in it; stone where it is levelled; a
        // darker bank along the stream; a bright lip round the rim, so the
        // island's edge reads as a line.
        let s = 0.46 + (noise(x * 0.9 + 11, z * 0.9 - 4) - 0.5) * 0.18;
        for (const p of PADS) {
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < p.r) s = Math.max(s, 0.6 - (d / p.r) * 0.06);
        }
        const sd = streamDist(x, z).d;
        if (sd < STREAM_HALF_W + 0.45) s = Math.min(s, 0.34);
        if (u > 0.965) s = 0.82;
        row.push({ x, y, z, s });
      }
      grid.push(row);
    }
    const pos: number[] = [];
    const shade: number[] = [];
    const push = (v: { x: number; y: number; z: number; s: number }) => {
      pos.push(v.x, v.y, v.z);
      shade.push(v.s);
    };
    for (let j = 0; j < RINGS; j += 1) {
      for (let a = 0; a < SEGS; a += 1) {
        const A = grid[j][a];
        const B = grid[j + 1][a];
        const C = grid[j][a + 1];
        const D = grid[j + 1][a + 1];
        if (j > 0) {
          push(A);
          push(B);
          push(C);
        }
        push(B);
        push(D);
        push(C);
      }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("shade", new THREE.Float32BufferAttribute(shade, 1));
    g.setAttribute("glow", new THREE.Float32BufferAttribute(new Array<number>(shade.length).fill(0), 1));
    g.setAttribute("group", new THREE.Float32BufferAttribute(new Array<number>(shade.length).fill(-1), 1));
    g.computeVertexNormals();
    spin.add(new THREE.Mesh(g, plainMat));
  }

  // ------------------------------------------------------ the underside
  {
    const RINGS = 16;
    const SEGS = 96;
    const grid: { x: number; y: number; z: number; s: number }[][] = [];
    for (let k = 0; k <= RINGS; k += 1) {
      const t = k / RINGS;
      const row: { x: number; y: number; z: number; s: number }[] = [];
      for (let a = 0; a <= SEGS; a += 1) {
        const az = (a / SEGS) * Math.PI * 2;
        const ca = Math.cos(az);
        const sa = Math.sin(az);
        // Rough: ridges running down it, and a longer hang in some places.
        const ridge = noise(ca * 2.2 + 5 + t * 0.6, sa * 2.2 + 5 + t * 2.4);
        const hang = 0.75 + 0.5 * noise(ca * 1.3 + 20, sa * 1.3 + 20);
        // Never wider than the rim above it, or it would show past the edge from above.
        const r = k === 0 ? rimAt(az) : rimAt(az) * Math.min(0.97, Math.pow(1 - t, 0.72) * (0.86 + 0.28 * ridge));
        const y = k === 0 ? EDGE_Y : EDGE_Y - t * UNDER_DEPTH * (k === RINGS ? 1 : hang);
        // Rock bands, darker further down.
        const band = 0.5 + 0.5 * Math.sin(y * 4.2 + ridge * 5);
        const s = (0.32 + 0.14 * band + 0.1 * ridge) * (1 - 0.4 * t);
        row.push({ x: r * sa, y, z: r * ca, s });
      }
      grid.push(row);
    }
    const pos: number[] = [];
    const shade: number[] = [];
    const push = (v: { x: number; y: number; z: number; s: number }) => {
      pos.push(v.x, v.y, v.z);
      shade.push(v.s);
    };
    for (let k = 0; k < RINGS; k += 1) {
      for (let a = 0; a < SEGS; a += 1) {
        const A = grid[k][a];
        const B = grid[k + 1][a];
        const C = grid[k][a + 1];
        const D = grid[k + 1][a + 1];
        push(A);
        push(B);
        push(C);
        if (k < RINGS - 1) {
          push(B);
          push(D);
          push(C);
        }
      }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("shade", new THREE.Float32BufferAttribute(shade, 1));
    g.setAttribute("glow", new THREE.Float32BufferAttribute(new Array<number>(shade.length).fill(0), 1));
    g.setAttribute("group", new THREE.Float32BufferAttribute(new Array<number>(shade.length).fill(-1), 1));
    g.computeVertexNormals();
    spin.add(new THREE.Mesh(g, plainMat));
  }

  // ------------------------------------------------ the stream and fall
  {
    // Sample the stream's line every 12 cm up to the rim.
    const pts: { x: number; z: number }[] = [];
    for (let i = 1; i < STREAM.length; i += 1) {
      const a = STREAM[i - 1];
      const b = STREAM[i];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.12);
      for (let k = 0; k < n; k += 1) pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    const cut = pts.findIndex((p) => Math.hypot(p.x - FALL_AT.x, p.z - FALL_AT.z) < 0.08);
    const run = pts.slice(0, cut > 0 ? cut + 1 : pts.length);
    const pos: number[] = [];
    const uv: number[] = [];
    const half = STREAM_HALF_W * 0.9;
    run.forEach((p, i) => {
      const q = run[Math.min(run.length - 1, i + 1)];
      const o = run[Math.max(0, i - 1)];
      let tx = q.x - o.x;
      let tz = q.z - o.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const y = groundAt(p.x, p.z) + 0.2;
      pos.push(p.x - tz * half, y, p.z + tx * half, p.x + tz * half, y, p.z - tx * half);
      const v = i / Math.max(1, run.length - 1);
      uv.push(0, v, 1, v);
    });
    const idx: number[] = [];
    for (let i = 0; i < run.length - 1; i += 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = keep(new THREE.ShaderMaterial({ uniforms: { uTime: timeU }, vertexShader: UV_VERT, fragmentShader: WATER_FRAG, side: THREE.DoubleSide }));
    spin.add(new THREE.Mesh(g, m));

    // The fall: a sheet leaving the rim, arcing out, and thinning as it drops.
    const ox = Math.sin(FALL_AT.az);
    const oz = Math.cos(FALL_AT.az);
    const fpos: number[] = [];
    const fuv: number[] = [];
    const STEPS = 24;
    const LEN = 7.5;
    for (let i = 0; i <= STEPS; i += 1) {
      const v = i / STEPS;
      const out = 0.05 + 1.3 * Math.sqrt(v);
      const w = 0.3 * (1 - 0.4 * v);
      const cx = FALL_AT.x + ox * out;
      const cz = FALL_AT.z + oz * out;
      const y = EDGE_Y + 0.02 - v * LEN;
      fpos.push(cx - oz * w, y, cz + ox * w, cx + oz * w, y, cz - ox * w);
      fuv.push(0, v, 1, v);
    }
    const fidx: number[] = [];
    for (let i = 0; i < STEPS; i += 1) {
      const a = i * 2;
      fidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const fg = keep(new THREE.BufferGeometry());
    fg.setAttribute("position", new THREE.Float32BufferAttribute(fpos, 3));
    fg.setAttribute("uv", new THREE.Float32BufferAttribute(fuv, 2));
    fg.setIndex(fidx);
    const fm = keep(new THREE.ShaderMaterial({ uniforms: { uTime: timeU }, vertexShader: UV_VERT, fragmentShader: FALL_FRAG, side: THREE.DoubleSide }));
    spin.add(new THREE.Mesh(fg, fm));
  }

  // -------------------------------------------------------------- trees
  {
    const parts: THREE.BufferGeometry[] = [];
    for (const t of TREES) {
      const r = makeRng(t.seed);
      const base = groundAt(t.x, t.z) - 0.05;
      parts.push(tagged(put(new THREE.CylinderGeometry(0.07, 0.13, t.h, 7), t.x, base + t.h / 2, t.z), 0.14));
      for (const side of [-1, 1]) {
        const limb = new THREE.CylinderGeometry(0.035, 0.06, t.r * 0.85, 5);
        limb.translate(0, (t.r * 0.85) / 2, 0);
        limb.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, r() * Math.PI, side * (0.6 + r() * 0.3))));
        limb.translate(t.x, base + t.h * 0.8, t.z);
        parts.push(tagged(limb, 0.14));
      }
      const clumps = 6 + Math.floor(r() * 4);
      for (let i = 0; i < clumps; i += 1) {
        const a = r() * Math.PI * 2;
        const d = r() * t.r * 0.6;
        const size = t.r * (0.4 + r() * 0.28);
        const clump = new THREE.IcosahedronGeometry(size, 1);
        const p = clump.getAttribute("position");
        for (let v = 0; v < p.count; v += 1) {
          const k = 0.82 + r() * 0.3;
          p.setXYZ(v, p.getX(v) * k, p.getY(v) * k * 0.78, p.getZ(v) * k);
        }
        clump.computeVertexNormals();
        clump.translate(t.x + Math.cos(a) * d, base + t.h + t.r * 0.35 + (r() - 0.3) * t.r * 0.45, t.z + Math.sin(a) * d);
        parts.push(tagged(clump, 0.66 + r() * 0.22));
      }
    }
    if (parts.length) spin.add(new THREE.Mesh(keep(merge(parts)), plainMat));
  }

  // ------------------------------------------------------------- places
  const lifts: { value: number }[] = [];
  let planet: THREE.Object3D | null = null;
  let moon: THREE.Object3D | null = null;
  const placeGroup = (p: Place): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(p.x, p.pad, p.z);
    // Its front faces out from the island, toward where its camera stands.
    g.rotation.y = p.az;
    spin.add(g);
    return g;
  };
  PLACES.forEach((p) => {
    const lift = { value: 0 };
    lifts.push(lift);
    const g = placeGroup(p);
    const parts = p.kind === "mic" ? micParts() : p.kind === "blaster" ? blasterParts() : p.kind === "ring" ? ringParts() : p.kind === "field" ? fieldParts() : planetBase();
    const mat = shadeMat(THREE.FrontSide, lift);
    g.add(new THREE.Mesh(keep(merge(parts)), mat));
    if (p.kind === "planet") {
      const body = new THREE.Mesh(keep(merge(planetBody())), shadeMat(THREE.DoubleSide, lift));
      body.position.y = p.mid;
      g.add(body);
      planet = body;
      const m = new THREE.Mesh(keep(tagged(new THREE.IcosahedronGeometry(0.1, 1), 0.9)), mat);
      g.add(m);
      moon = m;
    }
  });

  // --------------------------------------------- the skills' lanterns
  {
    const parts: THREE.BufferGeometry[] = [];
    // A stone lantern: foot, post, the lit box, a hipped cap. LANTERN_H tall.
    const k = LANTERN_H / 0.52;
    for (const l of LANTERNS) {
      const y = VILLAGE_PAD;
      parts.push(tagged(put(new THREE.BoxGeometry(0.16 * k, 0.06 * k, 0.16 * k), l.x, y + 0.03 * k, l.z), 0.4));
      parts.push(tagged(put(new THREE.BoxGeometry(0.06 * k, 0.2 * k, 0.06 * k), l.x, y + 0.16 * k, l.z), 0.35));
      parts.push(tagged(put(new THREE.BoxGeometry(0.16 * k, 0.16 * k, 0.16 * k), l.x, y + 0.34 * k, l.z), 0.3, 0.62, l.v));
      parts.push(tagged(put(new THREE.ConeGeometry(0.15 * k, 0.1 * k, 4), l.x, y + 0.47 * k, l.z, 0, Math.PI / 4, 0), 0.55));
    }
    spin.add(new THREE.Mesh(keep(merge(parts)), plainMat));
  }

  // ------------------------------------ the shrine, torii and lanterns
  const cards = makeCards();
  const facing: THREE.Mesh[] = [];
  const cardMesh = (card: Card | null, at: { x: number; z: number; h: number }) => {
    if (!card) return;
    keep(card.texture);
    const geo = keep(new THREE.PlaneGeometry(at.h * card.aspect, at.h));
    // Its foot a little into the ground, so it never shows a gap under it.
    geo.translate(0, at.h / 2 - 0.05, 0);
    const mat = keep(new THREE.ShaderMaterial({ uniforms: { uMap: { value: card.texture } }, vertexShader: UV_VERT, fragmentShader: CARD_FRAG, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(at.x, groundAt(at.x, at.z), at.z);
    spin.add(mesh);
    facing.push(mesh);
  };
  cardMesh(cards.shrine, SHRINE);
  cardMesh(cards.torii, TORII);
  cardMesh(cards.lanterns, LANTERN_PAIR);

  // ------------------------------------------------------------- petals
  const petalU = { uTime: timeU, uSize: { value: 40 } };
  {
    const r = makeRng(9021);
    const n = 240;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      if (i % 5 < 3 || TREES.length === 0) {
        const az = r() * Math.PI * 2;
        const rad = rimAt(az) * (0.9 + r() * 0.1);
        pos[i * 3] = rad * Math.sin(az);
        pos[i * 3 + 1] = EDGE_Y + 0.2 + r() * 0.6;
        pos[i * 3 + 2] = rad * Math.cos(az);
      } else {
        const t = TREES[Math.floor(r() * TREES.length)];
        pos[i * 3] = t.x + (r() - 0.5) * t.r;
        pos[i * 3 + 1] = groundAt(t.x, t.z) + t.h + t.r * 0.4;
        pos[i * 3 + 2] = t.z + (r() - 0.5) * t.r;
      }
      phase[i] = r();
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    const petals = new THREE.Points(g, keep(new THREE.ShaderMaterial({ uniforms: petalU, vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG })));
    petals.frustumCulled = false;
    spin.add(petals);
  }

  // -------------------------------------------------------------- robot
  let disposed = false;
  const robotMat = keep(new THREE.ShaderMaterial({ uniforms: { uLight: sunU, uBase: { value: 0.78 } }, vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG }));
  const robot = (async (): Promise<boolean> => {
    try {
      const res = await fetch("/models/hero.glb", { priority: "low" } as RequestInit);
      if (!res.ok) return false;
      const bytes = await res.arrayBuffer();
      if (disposed) return false;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.parseAsync(bytes, "");
      if (disposed) return false;
      const model = gltf.scene;
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of old) m.dispose();
        mesh.material = robotMat;
        owned.push(mesh.geometry);
      });
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      // Its drivetrain is centred on the origin and it faces +x; set its
      // feet on y = 0 and its middle on the axis, then scale it down.
      model.position.set(-centre.x, -box.min.y, -centre.z);
      holder.add(model);
      holder.scale.setScalar(ROBOT.h / Math.max(0.001, size.y));
      holder.position.set(ROBOT.x, groundAt(ROBOT.x, ROBOT.z), ROBOT.z);
      // Facing out toward the front right, where the stream goes over.
      holder.rotation.y = -Math.PI / 2 + 0.5;
      spin.add(holder);
      return true;
    } catch {
      return false;
    }
  })();

  // ------------------------------------------------------------ drawing
  let renderH = Math.round(RENDER_W / 1.85);
  const resize = (aspect: number): void => {
    const a = Math.max(0.4, Math.min(4, aspect || 1.85));
    renderH = Math.max(2, Math.round(RENDER_W / a));
    renderer.setSize(RENDER_W, renderH, false);
    camera.aspect = a;
    camera.updateProjectionMatrix();
    // A petal 0.22 m across, in render pixels at one metre.
    petalU.uSize.value = (0.22 * renderH) / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
  };
  resize(1.85);

  const world = new THREE.Vector3();
  const draw = (f: Frame): void => {
    if (disposed) return;
    root.position.y = f.drop + f.bob;
    root.rotation.x = f.tilt;
    spin.rotation.y = f.yaw;
    const c = camPos(f);
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(f.target.x, f.target.y, f.target.z);
    root.updateMatrixWorld(true);
    timeU.value = f.time;
    for (let v = 0; v < 5; v += 1) litU.value[v] = f.lit[v] ?? 0;
    lifts.forEach((l, k) => {
      l.value = 0.08 * (f.lift[k] ?? 0);
    });
    if (planet) planet.position.y = PLACES[4].mid + Math.sin(f.time * 0.8) * 0.06;
    if (moon) {
      const a = f.time * 0.5;
      moon.position.set(Math.cos(a) * 1.25, PLACES[4].mid + Math.sin(a) * 0.3, Math.sin(a) * 1.25);
    }
    // Cards turn about their own upright to face the camera.
    for (const m of facing) {
      m.getWorldPosition(world);
      m.rotation.y = Math.atan2(c.x - world.x, c.z - world.z) - f.yaw;
    }
    renderer.render(scene, camera);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const t of owned) t.dispose();
    renderer.dispose();
    // Contexts are few; give this one back now.
    renderer.forceContextLoss();
  };

  const source: CanvasSource = {
    canvas,
    animated: opts.animated,
    ready: Promise.resolve(),
    update: opts.update
      ? (time, dt) => {
          opts.update?.(time, dt);
          return true;
        }
      : undefined,
    // The page disposes the scene itself; the engine must not do it twice.
  };

  return { source, resize, draw, robot, dispose };
}
