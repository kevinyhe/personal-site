import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { CanvasSource } from "@/components/valley/barShader";
import {
  DIST,
  FAR,
  FOV,
  groundAt,
  hillAt,
  LANTERNS,
  NEAR,
  PIN_LAT,
  PIN_LEN,
  PIN_LON,
  PIN_OBJ_Y,
  type Placed,
  type Pose,
  riverAt,
  robotLon,
  ROAD_TORII,
  ROBOT_LEN,
  SHRINE_TORII,
  SHRINES,
  TREES,
  type Vec3,
  dirAt,
} from "./layout";
import {
  GLOBE_FRAG,
  GLOBE_VERT,
  PROP_FRAG,
  PROP_VERT,
  ROBOT_FRAG,
  ROBOT_VERT,
  SKY,
  STAR_FRAG,
  STAR_VERT,
} from "./shaders";

/**
 * The little planet, drawn off screen in greys and handed to the bar
 * shader as a canvas source. It knows nothing about the page: each frame
 * it is told how the planet is turned and what is lit.
 *
 * The render is small on purpose. The bar shader reads about one texel
 * in three, so a 960 wide render is plenty for 320 cells across.
 */

export type View = {
  pose: Pose;
  /** 0..1 per pin: how much it stands out. */
  pins: readonly number[];
  /** 0..1 per lantern ring. */
  rings: readonly number[];
  poleGlow: number;
  stars: number;
  /** Index of the lantern under the cursor's skill, or -1. */
  hot: number;
  time: number;
};

export type Planet = {
  source: CanvasSource;
  resize(aspect: number): void;
  draw(view: View): void;
  /** Resolves when the robot is on (or could not be had). */
  robotReady: Promise<void>;
  dispose(): void;
};

const RENDER_W = 960;
const LIGHT = new THREE.Vector3(-0.5, 0.62, 0.62).normalize();

/** A seeded generator, so a tree looks the same on every visit. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Readies a part for the merge: flat list of triangles, a grey, and whether it is a lantern's fire box. */
function part(geo: THREE.BufferGeometry, shade: number, lamp = -1, idx = -1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute("uv");
  const n = g.getAttribute("position").count;
  g.setAttribute("shade", new THREE.Float32BufferAttribute(new Array<number>(n).fill(shade), 1));
  g.setAttribute("lamp", new THREE.Float32BufferAttribute(new Array<number>(n).fill(lamp), 1));
  g.setAttribute("idx", new THREE.Float32BufferAttribute(new Array<number>(n).fill(idx), 1));
  return g;
}

const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => geo.translate(x, y, z);

/**
 * The frame of a spot on the planet: x east, y up, z south, turned about
 * up by `turn`, standing `lift` above the ground.
 */
function spotMatrix(p: Placed, lift = 0): THREE.Matrix4 {
  const n = dirAt(p.lat, p.lon);
  const up = new THREE.Vector3(n.x, n.y, n.z);
  const east = new THREE.Vector3(Math.cos(p.lon), 0, -Math.sin(p.lon));
  const south = new THREE.Vector3().crossVectors(east, up);
  const m = new THREE.Matrix4().makeBasis(east, up, south);
  m.multiply(new THREE.Matrix4().makeRotationY(p.turn));
  const r = 1 + groundAt(n) + lift;
  m.setPosition(up.x * r, up.y * r, up.z * r);
  return m;
}

// ------------------------------------------------------------ the props
function tree(h: number, seed: number): THREE.BufferGeometry[] {
  const r = rng(seed);
  const out: THREE.BufferGeometry[] = [];
  out.push(part(at(new THREE.CylinderGeometry(0.007, 0.012, h * 0.6, 5), 0, h * 0.3, 0), 0.18));
  for (const side of [-1, 1]) {
    const limb = new THREE.CylinderGeometry(0.004, 0.007, h * 0.4, 4);
    limb.translate(0, h * 0.2, 0);
    limb.rotateZ(side * (0.6 + r() * 0.3));
    limb.translate(0, h * 0.5, 0);
    out.push(part(limb, 0.18));
  }
  const clumps = 4 + Math.floor(r() * 2);
  for (let i = 0; i < clumps; i += 1) {
    const a = r() * Math.PI * 2;
    const d = r() * h * 0.28;
    const size = h * (0.26 + r() * 0.12);
    const c = new THREE.IcosahedronGeometry(size, 1);
    c.scale(1, 0.8, 1);
    c.translate(Math.cos(a) * d, h * 0.72 + (r() - 0.3) * h * 0.25, Math.sin(a) * d);
    out.push(part(c, 0.78 + r() * 0.2));
  }
  return out;
}

function shrine(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  out.push(part(at(new THREE.BoxGeometry(0.11, 0.014, 0.085), 0, 0.007, 0), 0.42));
  out.push(part(at(new THREE.BoxGeometry(0.08, 0.045, 0.058), 0, 0.036, 0), 0.16));
  const roof = new THREE.ConeGeometry(0.068, 0.045, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.3, 1, 1);
  out.push(part(at(roof, 0, 0.081, 0), 0.62));
  return out;
}

/** A torii whose opening faces along x: its legs stand either side of z = 0. */
function torii(w: number, h: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const leg = w * 0.07;
  for (const side of [-1, 1]) {
    out.push(part(at(new THREE.CylinderGeometry(leg * 0.45, leg * 0.55, h, 6), 0, h / 2, side * w * 0.5), 0.12));
  }
  out.push(part(at(new THREE.BoxGeometry(leg * 1.4, leg * 0.9, w * 1.4), 0, h + leg * 0.2, 0), 0.14));
  out.push(part(at(new THREE.BoxGeometry(leg, leg * 0.6, w * 1.1), 0, h * 0.78, 0), 0.12));
  return out;
}

const LANTERN_SIZE = 1.4;
function lantern(ring: number, idx: number): THREE.BufferGeometry[] {
  const k = LANTERN_SIZE;
  const out: THREE.BufferGeometry[] = [];
  out.push(part(at(new THREE.BoxGeometry(0.03 * k, 0.01 * k, 0.03 * k), 0, 0.005 * k, 0), 0.34));
  out.push(part(at(new THREE.CylinderGeometry(0.006 * k, 0.007 * k, 0.03 * k, 6), 0, 0.025 * k, 0), 0.34));
  out.push(part(at(new THREE.BoxGeometry(0.026 * k, 0.024 * k, 0.026 * k), 0, 0.052 * k, 0), 0, ring, idx));
  const roof = new THREE.ConeGeometry(0.027 * k, 0.018 * k, 4, 1);
  roof.rotateY(Math.PI / 4);
  out.push(part(at(roof, 0, 0.073 * k, 0), 0.5));
  return out;
}

function pagoda(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let y = 0;
  [0.06, 0.05, 0.04].forEach((w) => {
    out.push(part(at(new THREE.BoxGeometry(w, 0.04, w), 0, y + 0.02, 0), 0.2));
    const roof = new THREE.ConeGeometry(w * 1.05, 0.03, 4, 1);
    roof.rotateY(Math.PI / 4);
    out.push(part(at(roof, 0, y + 0.055, 0), 0.62));
    y += 0.055;
  });
  out.push(part(at(new THREE.CylinderGeometry(0.004, 0.006, 0.05, 5), 0, y + 0.03, 0), 0.5));
  return out;
}

/** The thing on top of each pin, its middle at the origin, its face toward +z. */
function pinObject(k: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  if (k === 0) {
    // A microphone.
    out.push(part(at(new THREE.SphereGeometry(0.055, 16, 12), 0, 0.045, 0), 0.95));
    const band = new THREE.TorusGeometry(0.05, 0.009, 6, 24);
    band.rotateX(Math.PI / 2);
    out.push(part(at(band, 0, 0.02, 0), 0.32));
    out.push(part(at(new THREE.CylinderGeometry(0.022, 0.016, 0.1, 10), 0, -0.04, 0), 0.55));
  } else if (k === 1) {
    // A blaster, side on.
    out.push(part(new THREE.BoxGeometry(0.17, 0.055, 0.045), 0.85));
    const barrel = new THREE.CylinderGeometry(0.017, 0.017, 0.08, 10);
    barrel.rotateZ(Math.PI / 2);
    out.push(part(at(barrel, 0.12, 0.008, 0), 0.6));
    out.push(part(at(new THREE.BoxGeometry(0.1, 0.016, 0.03), -0.01, 0.036, 0), 0.95));
    const grip = new THREE.BoxGeometry(0.035, 0.075, 0.04);
    grip.rotateZ(0.25);
    out.push(part(at(grip, -0.05, -0.058, 0), 0.5));
    out.push(part(at(new THREE.BoxGeometry(0.03, 0.05, 0.035), 0.03, -0.05, 0), 0.4));
  } else if (k === 2) {
    // A boxing ring.
    out.push(part(at(new THREE.BoxGeometry(0.19, 0.035, 0.19), 0, -0.04, 0), 0.82));
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        out.push(part(at(new THREE.CylinderGeometry(0.008, 0.008, 0.075, 6), x * 0.088, 0.015, z * 0.088), 0.3));
      }
    }
    for (const y of [0.0, 0.03]) {
      for (const s of [-1, 1]) {
        out.push(part(at(new THREE.BoxGeometry(0.176, 0.009, 0.009), 0, y, s * 0.088), 0.95));
        out.push(part(at(new THREE.BoxGeometry(0.009, 0.009, 0.176), s * 0.088, y, 0), 0.95));
      }
    }
  } else if (k === 3) {
    // A tiled field, three by three, with its low walls.
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        out.push(part(at(new THREE.BoxGeometry(0.058, 0.014, 0.058), i * 0.061, -0.03, j * 0.061), (i + j) % 2 === 0 ? 0.92 : 0.46));
      }
    }
    for (const s of [-1, 1]) {
      out.push(part(at(new THREE.BoxGeometry(0.195, 0.028, 0.009), 0, -0.018, s * 0.097), 0.3));
      out.push(part(at(new THREE.BoxGeometry(0.009, 0.028, 0.195), s * 0.097, -0.018, 0), 0.3));
    }
    out.push(part(at(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), 0.061, 0.0, -0.061), 0.7));
  } else {
    // A ringed moon.
    out.push(part(new THREE.SphereGeometry(0.062, 18, 12), 0.9));
    const ring = new THREE.TorusGeometry(0.105, 0.011, 6, 40);
    ring.scale(1, 1, 0.4);
    ring.rotateX(Math.PI / 2 - 0.35);
    out.push(part(ring, 0.68));
  }
  return out;
}

// ---------------------------------------------------------------- build
export function buildPlanet(canvas: HTMLCanvasElement, opts: { animated: boolean; update?: (time: number, dt: number) => void }): Planet {
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
  if (!gl) throw new Error("b23: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  try {
    return assemble(renderer, canvas, opts);
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

type Wheel = { node: THREE.Object3D; axis: THREE.Vector3; sign: number; radius: number };

function assemble(
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  opts: { animated: boolean; update?: (time: number, dt: number) => void },
): Planet {
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(new THREE.Color(SKY, SKY, SKY), 1);

  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(t: T): T => {
    owned.push(t);
    return t;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, NEAR, FAR);
  camera.position.set(0, 0, DIST);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const light = { value: LIGHT.clone() };
  const rings = { value: new Array<number>(5).fill(0) };
  const hot = { value: -1 };
  const propMat = (boost: number) =>
    keep(
      new THREE.ShaderMaterial({
        uniforms: { uLight: light, uRings: rings, uHot: hot, uBoost: { value: boost } },
        vertexShader: PROP_VERT,
        fragmentShader: PROP_FRAG,
      }),
    );

  // root: scale. tiltG: tips the pole. yawG: the spin. Everything on the
  // planet lives in yawG; the cloud ring hangs from root, so it keeps its
  // own slant whatever the planet does.
  const root = new THREE.Group();
  const tiltG = new THREE.Group();
  const yawG = new THREE.Group();
  root.add(tiltG);
  tiltG.add(yawG);
  scene.add(root);

  // --------------------------------------------------------- the ground
  const pole = { value: 0 };
  {
    const ico = new THREE.IcosahedronGeometry(1, 48);
    ico.deleteAttribute("normal");
    ico.deleteAttribute("uv");
    const g = mergeVertices(ico);
    ico.dispose();
    const pos = g.getAttribute("position");
    const hgt = new Float32Array(pos.count);
    const riv = new Float32Array(pos.count);
    const n: Vec3 = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const l = Math.hypot(x, y, z) || 1;
      n.x = x / l;
      n.y = y / l;
      n.z = z / l;
      const r = 1 + groundAt(n);
      pos.setXYZ(i, n.x * r, n.y * r, n.z * r);
      hgt[i] = hillAt(n);
      riv[i] = riverAt(n);
    }
    g.setAttribute("hgt", new THREE.BufferAttribute(hgt, 1));
    g.setAttribute("river", new THREE.BufferAttribute(riv, 1));
    g.computeVertexNormals();
    keep(g);
    const mat = keep(new THREE.ShaderMaterial({ uniforms: { uLight: light, uPole: pole }, vertexShader: GLOBE_VERT, fragmentShader: GLOBE_FRAG }));
    yawG.add(new THREE.Mesh(g, mat));
  }

  // ---------------------------------------- trees, shrines, torii, lanterns
  {
    const parts: THREE.BufferGeometry[] = [];
    const placeAll = (geos: THREE.BufferGeometry[], m: THREE.Matrix4) => {
      for (const g of geos) {
        g.applyMatrix4(m);
        parts.push(g);
      }
    };
    for (const t of TREES) placeAll(tree(t.h, t.seed), spotMatrix(t, -0.004));
    for (const s of SHRINES) placeAll(shrine(), spotMatrix(s));
    for (const t of ROAD_TORII) placeAll(torii(0.3, 0.3), spotMatrix(t));
    for (const t of SHRINE_TORII) placeAll(torii(0.08, 0.075), spotMatrix(t));
    LANTERNS.forEach((l, i) => placeAll(lantern(l.ring, i), spotMatrix(l)));
    placeAll(pagoda(), spotMatrix({ lat: Math.PI / 2 - 1e-4, lon: 0, turn: 0 }));
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (merged) yawG.add(new THREE.Mesh(keep(merged), propMat(1)));
  }

  // ------------------------------------------------------------ the pins
  const pinBoost: { value: number }[] = [];
  const pinObjects: THREE.Object3D[] = [];
  PIN_LAT.forEach((lat, k) => {
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(spotMatrix({ lat, lon: PIN_LON[k], turn: 0 }, -0.004));
    const mat = propMat(1);
    pinBoost.push(mat.uniforms.uBoost as { value: number });
    const poleParts = [
      part(at(new THREE.CylinderGeometry(0.014, 0.02, PIN_LEN, 8), 0, PIN_LEN / 2, 0), 0.72),
      part(at(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 10), 0, PIN_LEN, 0), 0.9),
      part(at(new THREE.CylinderGeometry(0.035, 0.045, 0.012, 10), 0, 0.006, 0), 0.4),
    ];
    const poleGeo = mergeGeometries(poleParts, false);
    for (const p of poleParts) p.dispose();
    if (poleGeo) holder.add(new THREE.Mesh(keep(poleGeo), mat));
    const objParts = pinObject(k);
    const obj = mergeGeometries(objParts, false);
    for (const p of objParts) p.dispose();
    const objHolder = new THREE.Group();
    objHolder.position.y = PIN_OBJ_Y;
    if (obj) objHolder.add(new THREE.Mesh(keep(obj), mat));
    holder.add(objHolder);
    pinObjects.push(objHolder);
    yawG.add(holder);
  });

  // ---------------------------------------------------------- the clouds
  const cloudSpin = new THREE.Group();
  {
    const cloudTilt = new THREE.Group();
    cloudTilt.rotation.set(0.42, 0, 0.12);
    cloudTilt.add(cloudSpin);
    root.add(cloudTilt);
    const r = rng(9023);
    const parts: THREE.BufferGeometry[] = [];
    for (let c = 0; c < 6; c += 1) {
      const centre = (c / 6) * Math.PI * 2 + r() * 0.4;
      const puffs = 5 + Math.floor(r() * 3);
      for (let i = 0; i < puffs; i += 1) {
        const a = centre + (i - puffs / 2) * 0.06 + (r() - 0.5) * 0.03;
        const rad = 1.33 + (r() - 0.5) * 0.06;
        const size = 0.045 + r() * 0.04 * (1 - Math.abs(i - puffs / 2) / puffs);
        const p = new THREE.IcosahedronGeometry(size, 1);
        p.scale(1.3, 0.62, 1);
        p.rotateY(-a);
        p.translate(Math.sin(a) * rad, (r() - 0.5) * 0.03, Math.cos(a) * rad);
        parts.push(part(p, 0.84 + r() * 0.14));
      }
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (merged) cloudSpin.add(new THREE.Mesh(keep(merged), propMat(1)));
  }

  // ----------------------------------------------------------- the stars
  const starUniforms = { uTime: { value: 0 }, uStars: { value: 0.35 }, uPx: { value: 3 } };
  {
    const r = rng(4411);
    const n = 110;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = (r() - 0.5) * 36;
      pos[i * 3 + 1] = (r() - 0.5) * 20;
      pos[i * 3 + 2] = -18;
      phase[i] = r() * Math.PI * 2;
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    const stars = new THREE.Points(g, keep(new THREE.ShaderMaterial({ uniforms: starUniforms, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG })));
    stars.frustumCulled = false;
    scene.add(stars);
  }

  // ----------------------------------------------------------- the robot
  const robotHolder = new THREE.Group();
  robotHolder.matrixAutoUpdate = false;
  robotHolder.visible = false;
  yawG.add(robotHolder);
  const wheels: Wheel[] = [];
  let robotScale = 1;
  let robotLonNow: number | null = null;
  let disposed = false;
  const robotMat = keep(new THREE.ShaderMaterial({ uniforms: { uLight: light }, vertexShader: ROBOT_VERT, fragmentShader: ROBOT_FRAG }));
  const loadRobot = async (): Promise<void> => {
    const response = await fetch("/models/hero.glb", { priority: "low" } as RequestInit);
    if (!response.ok) throw new Error(`b23: hero.glb ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (disposed) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    if (disposed) return;
    const model = gltf.scene;
    const olds = new Set<THREE.Material>();
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      keep(m.geometry);
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) olds.add(mat);
      m.material = robotMat;
    });
    for (const mat of olds) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    robotScale = ROBOT_LEN / Math.max(size.x, size.z, 1e-3);
    const centre = box.getCenter(new THREE.Vector3());
    const inner = new THREE.Group();
    inner.scale.setScalar(robotScale);
    // Centred on its footprint, wheels on the ground.
    model.position.set(-centre.x, -box.min.y, -centre.z);
    inner.add(model);
    robotHolder.add(inner);
    model.traverse((o) => {
      const data = o.userData as { axis?: number[]; sign?: number; radius?: number };
      if (/^wheel_/.test(o.name) && data.axis && data.radius) {
        wheels.push({ node: o, axis: new THREE.Vector3().fromArray(data.axis).normalize(), sign: data.sign ?? 1, radius: data.radius });
      }
    });
    robotHolder.visible = true;
  };
  const robotReady = loadRobot().catch(() => {
    // The planet stands without its robot.
  });

  // Where the robot is, facing west: the ground turns east under it as
  // the scroll goes on, so this is the way it is driving.
  const up = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const placeRobot = (lon: number): void => {
    const n = dirAt(0, lon);
    const r = 1 + groundAt(n);
    up.set(n.x, n.y, n.z);
    fwd.set(-Math.cos(lon), 0, Math.sin(lon));
    side.crossVectors(fwd, up);
    robotHolder.matrix.makeBasis(fwd, up, side);
    robotHolder.matrix.setPosition(n.x * r, n.y * r, n.z * r);
    robotHolder.matrixWorldNeedsUpdate = true;
    if (robotLonNow !== null) {
      // Wheels turn by the ground covered: west is forward.
      let d = robotLonNow - lon;
      if (Math.abs(d) > Math.PI) d = 0;
      const ds = (d * r) / Math.max(1e-6, robotScale);
      for (const w of wheels) w.node.rotateOnAxis(w.axis, (w.sign * ds) / w.radius);
    }
    robotLonNow = lon;
  };

  // ------------------------------------------------------------ drawing
  let renderH = Math.round(RENDER_W / 1.85);
  const resize = (a: number): void => {
    const aspect = Math.max(0.4, Math.min(4, a || 1.85));
    renderH = Math.max(2, Math.round(RENDER_W / aspect));
    renderer.setSize(RENDER_W, renderH, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    // A star is about three render pixels on a 1038 tall stage's worth of render.
    starUniforms.uPx.value = Math.max(2, Math.round(renderH / 170));
  };
  resize(1.85);

  const draw = (view: View): void => {
    if (disposed) return;
    const { pose } = view;
    root.scale.setScalar(pose.scale);
    tiltG.rotation.x = pose.tilt;
    yawG.rotation.y = pose.yaw;
    // The lens is slid so the planet sits where the page wants it while
    // the camera still looks straight at its middle.
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = -pose.sx;
    camera.projectionMatrix.elements[9] = -pose.sy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    view.pins.forEach((lit, k) => {
      if (pinBoost[k]) pinBoost[k].value = 0.86 + 0.2 * lit;
      const o = pinObjects[k];
      if (o) {
        o.scale.setScalar(1 + 0.3 * lit);
        o.rotation.y = Math.sin(view.time * 0.5 + k) * 0.35 * lit;
      }
    });
    for (let r = 0; r < 5; r += 1) rings.value[r] = view.rings[r] ?? 0;
    hot.value = view.hot;
    pole.value = view.poleGlow;
    starUniforms.uTime.value = view.time;
    starUniforms.uStars.value = view.stars;
    cloudSpin.rotation.y = view.time * 0.035;
    if (robotHolder.visible) placeRobot(robotLon(pose.yaw));

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
  };

  return { source, resize, draw, robotReady, dispose };
}
