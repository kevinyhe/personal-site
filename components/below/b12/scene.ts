import * as THREE from "three";
import type { CanvasSource } from "@/components/valley/barShader";
import { makeRng } from "@/components/valley/sources/noise";
import {
  createHall,
  createLanternPair,
  createPagodaTower,
  createShrine,
  createToriiGate,
} from "@/components/valley/sources/shrine";
import { skillGroups } from "@/components/profile";
import * as L from "./layout";
import {
  GROUND_FRAG,
  GROUND_VERT,
  PICTURE_FRAG,
  PICTURE_VERT,
  TONE_FRAG,
  TONE_VERT,
  WALK_FRAG,
  WALK_VERT,
} from "./shaders";

/**
 * The valley, in three dimensions, drawn in greys to a small canvas that
 * the bar shader reads. Two canvas pixels for each bar cell, which is all
 * the bars can show.
 *
 * This file knows nothing about the page. It is handed the camera and the
 * walk's progress each frame.
 */

export type MapScene = {
  canvas: HTMLCanvasElement;
  /** How many bar cells across and down. */
  setGrid(cols: number, rows: number): void;
  render(state: L.State, aspect: number, time: number): void;
  dispose(): void;
};

const SUN = new THREE.Vector3(-0.45, 0.85, -0.3).normalize();
const PLAN_SIZE = 1024;

const BUILDERS: Record<L.PartKind, (o: { seed: number; width: number; height: number }) => CanvasSource> = {
  shrine: createShrine,
  torii: createToriiGate,
  lanterns: createLanternPair,
  pagoda: createPagodaTower,
  hall: createHall,
};

/**
 * Each builder draws its picture with a WebGL renderer of its own and keeps
 * it until it is collected. Browsers allow a page only a handful of those,
 * and the page above already holds several. So the context each builder
 * asks for is noted as it is made, the picture is copied out, and the
 * context is handed back at once. Only one is ever alive at a time.
 */
function snapshot(kind: L.PartKind): HTMLCanvasElement | null {
  const size = L.SNAP[kind];
  const made: (WebGLRenderingContext | WebGL2RenderingContext)[] = [];
  const proto = HTMLCanvasElement.prototype;
  const original = proto.getContext;
  const noting = function (this: HTMLCanvasElement, ...args: unknown[]): RenderingContext | null {
    const ctx = (original as unknown as (...a: unknown[]) => RenderingContext | null).apply(this, args);
    if (ctx && typeof args[0] === "string" && args[0].startsWith("webgl")) {
      made.push(ctx as WebGLRenderingContext);
    }
    return ctx;
  };
  let source: CanvasSource | null = null;
  proto.getContext = noting as unknown as typeof original;
  try {
    source = BUILDERS[kind]({ seed: 12, width: size.w, height: size.h });
  } catch {
    source = null;
  } finally {
    proto.getContext = original;
  }
  let out: HTMLCanvasElement | null = null;
  if (source && source.canvas.width > 1) {
    out = document.createElement("canvas");
    out.width = source.canvas.width;
    out.height = source.canvas.height;
    out.getContext("2d")?.drawImage(source.canvas, 0, 0);
  }
  source?.dispose?.();
  for (const gl of made) gl.getExtension("WEBGL_lose_context")?.loseContext();
  return out;
}

/** The plan of the ground, seen from straight above, in greys. */
function paintPlan(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = PLAN_SIZE;
  c.height = PLAN_SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const k = PLAN_SIZE / (2 * L.HALF);
  const X = (x: number): number => (x + L.HALF) * k;
  const Z = (z: number): number => (z + L.HALF) * k;
  const grey = (g: number): string => `rgb(${g},${g},${g})`;
  const rng = makeRng(1213);

  ctx.fillStyle = grey(214);
  ctx.fillRect(0, 0, PLAN_SIZE, PLAN_SIZE);

  // Rice fields on the flat land either side of the river: a patchwork of
  // plots a shade lighter or darker than the grass, which is what makes a
  // valley floor read as farmed from the air.
  const near = (x: number, z: number, r: number, list: { x: number; z: number }[]): boolean =>
    list.some((p) => Math.hypot(x - p.x, z - p.z) < r);
  for (let z = -L.HALF + 2; z < L.HALF - 2; z += 3.2) {
    for (let x = -L.HALF + 2; x < L.HALF - 2; x += 4.4) {
      const d = Math.abs(x + 2.2 - L.riverX(z + 1.6));
      if (d < L.riverHalf(z) + 2.5 || d > 22) continue;
      if (near(x, z, 15, L.PRECINCTS) || near(x, z, 13, L.VILLAGES)) continue;
      if (rng() < 0.25) continue;
      ctx.fillStyle = grey(rng() < 0.5 ? 196 : 232);
      ctx.fillRect(X(x) + 2, Z(z) + 2, 4.4 * k - 4, 3.2 * k - 4);
    }
  }

  // Tracks from each village to the nearest shrine gate.
  ctx.strokeStyle = grey(150);
  ctx.lineWidth = 1.1 * k;
  ctx.lineCap = "round";
  L.VILLAGES.forEach((v) => {
    let best = 0;
    let bestD = Infinity;
    L.PRECINCTS.forEach((p, i) => {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const [gx, gz] = L.gateOf(best);
    ctx.beginPath();
    ctx.moveTo(X(v.x), Z(v.z));
    ctx.quadraticCurveTo(X((v.x + gx) / 2), Z((v.z + gz) / 2 + 6), X(gx), Z(gz));
    ctx.stroke();
  });

  // The courts: pale gravel with a dark wall round.
  for (const p of L.PRECINCTS) {
    ctx.fillStyle = grey(240);
    ctx.fillRect(X(p.x - L.COURT), Z(p.z - L.COURT), 2 * L.COURT * k, 2 * L.COURT * k);
    ctx.strokeStyle = grey(96);
    ctx.lineWidth = 0.7 * k;
    ctx.strokeRect(X(p.x - L.COURT), Z(p.z - L.COURT), 2 * L.COURT * k, 2 * L.COURT * k);
  }
  // The village greens, round, for the lanterns to stand on.
  L.VILLAGES.forEach((v, i) => {
    const r = L.villageRadius(skillGroups[i]?.skills.length ?? 6) + 2.2;
    ctx.fillStyle = grey(242);
    ctx.beginPath();
    ctx.arc(X(v.x), Z(v.z), r * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = grey(128);
    ctx.lineWidth = 0.5 * k;
    ctx.stroke();
  });

  // The river, under its water, so its banks are clean.
  ctx.strokeStyle = grey(250);
  ctx.lineJoin = "round";
  for (let z = L.HALF; z > -L.HALF; z -= 1) {
    ctx.lineWidth = (2 * L.riverHalf(z) + 0.6) * k;
    ctx.beginPath();
    ctx.moveTo(X(L.riverX(z)), Z(z));
    ctx.lineTo(X(L.riverX(z - 1)), Z(z - 1));
    ctx.stroke();
  }
  return c;
}

function toneMaterial(tone: number, extra: Partial<THREE.ShaderMaterialParameters> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTone: { value: tone }, uSun: { value: SUN } },
    vertexShader: TONE_VERT,
    fragmentShader: TONE_FRAG,
    ...extra,
  });
}

export function buildMap(): MapScene {
  // The builders first, so their short-lived contexts come and go before
  // this scene's own is made.
  const kinds: L.PartKind[] = ["shrine", "torii", "lanterns", "pagoda", "hall"];
  const pictures = new Map<L.PartKind, HTMLCanvasElement | null>();
  for (const kind of kinds) pictures.set(kind, snapshot(kind));

  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 260;
  const attributes: WebGLContextAttributes = {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    // The bar shader copies this canvas after it is drawn, in the same frame.
    // Keeping the buffer makes that copy safe whenever it happens.
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  };
  const gl = canvas.getContext("webgl2", attributes);
  if (!gl) throw new Error("b12: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attributes });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(L.FOV, 1.85, L.NEAR, L.FAR);
  const textures: THREE.Texture[] = [];

  // ----------------------------------------------------------- the ground
  const planTex = new THREE.CanvasTexture(paintPlan());
  planTex.colorSpace = THREE.NoColorSpace;
  planTex.minFilter = THREE.LinearMipmapLinearFilter;
  planTex.anisotropy = 4;
  textures.push(planTex);
  const groundUniforms = {
    uPlan: { value: planTex },
    uSun: { value: SUN },
    uHalf: { value: L.HALF },
    uTime: { value: 0 },
  };
  const groundGeo = new THREE.PlaneGeometry(2 * L.HALF, 2 * L.HALF, 220, 220);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < gp.count; i += 1) gp.setY(i, L.heightAt(gp.getX(i), gp.getZ(i)));
  groundGeo.computeVertexNormals();
  scene.add(
    new THREE.Mesh(
      groundGeo,
      new THREE.ShaderMaterial({ uniforms: groundUniforms, vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG }),
    ),
  );

  // The map's four sides, down to a floor, so from above it is a block of
  // land with an edge rather than a sheet.
  const skirtPos: number[] = [];
  const skirtNormal: number[] = [];
  const BOTTOM = -9;
  const STEPS = 120;
  const sides: { at: (t: number) => [number, number]; n: [number, number] }[] = [
    { at: (t) => [t, L.HALF], n: [0, 1] },
    { at: (t) => [t, -L.HALF], n: [0, -1] },
    { at: (t) => [L.HALF, t], n: [1, 0] },
    { at: (t) => [-L.HALF, t], n: [-1, 0] },
  ];
  for (const s of sides) {
    for (let i = 0; i < STEPS; i += 1) {
      const t0 = -L.HALF + (i / STEPS) * 2 * L.HALF;
      const t1 = -L.HALF + ((i + 1) / STEPS) * 2 * L.HALF;
      const [ax, az] = s.at(t0);
      const [bx, bz] = s.at(t1);
      const ha = L.groundAt(ax, az);
      const hb = L.groundAt(bx, bz);
      skirtPos.push(ax, ha, az, bx, hb, bz, bx, BOTTOM, bz, ax, ha, az, bx, BOTTOM, bz, ax, BOTTOM, az);
      for (let v = 0; v < 6; v += 1) skirtNormal.push(s.n[0], 0, s.n[1]);
    }
  }
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute("position", new THREE.Float32BufferAttribute(skirtPos, 3));
  skirtGeo.setAttribute("normal", new THREE.Float32BufferAttribute(skirtNormal, 3));
  scene.add(new THREE.Mesh(skirtGeo, toneMaterial(0.5, { side: THREE.DoubleSide })));

  // ------------------------------------------------------------ the river
  const riverPos: number[] = [];
  const riverIdx: number[] = [];
  const RIVER_STEPS = 180;
  for (let i = 0; i <= RIVER_STEPS; i += 1) {
    const z = L.HALF - (i / RIVER_STEPS) * 2 * L.HALF;
    const x = L.riverX(z);
    const h = L.riverHalf(z);
    riverPos.push(x - h, L.WATER_Y, z, x + h, L.WATER_Y, z);
    if (i < RIVER_STEPS) {
      const a = i * 2;
      riverIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute("position", new THREE.Float32BufferAttribute(riverPos, 3));
  riverGeo.setIndex(riverIdx);
  // Straight up, whatever way round the triangles were wound: water lit
  // from above is the palest thing on the map and draws no bar at all.
  riverGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      riverPos.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  scene.add(new THREE.Mesh(riverGeo, toneMaterial(1.0, { side: THREE.DoubleSide })));

  // ------------------------------------------------------------- the walk
  const walkPos: number[] = [];
  const walkSide: number[] = [];
  const walkAlong: number[] = [];
  const walkDist: number[] = [];
  const walkIdx: number[] = [];
  const WALK_STEPS = 600;
  let run = 0;
  let prev = L.walkAt(0);
  const crossings: { x: number; z: number; angle: number }[] = [];
  let prevSign = Math.sign(prev[0] - L.riverX(prev[1]));
  const overRiver = (x: number, z: number): boolean => Math.abs(x - L.riverX(z)) < L.riverHalf(z) + 1.6;
  const DECK = L.WATER_Y + 0.8;
  for (let i = 0; i <= WALK_STEPS; i += 1) {
    const k = (i / WALK_STEPS) * 4;
    const p = L.walkAt(k);
    const q = L.walkAt(Math.min(4, k + 0.004));
    const o = L.walkAt(Math.max(0, k - 0.004));
    let tx = q[0] - o[0];
    let tz = q[1] - o[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    run += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
    const ground = L.heightAt(p[0], p[1]);
    const y = (overRiver(p[0], p[1]) ? Math.max(ground, DECK) : ground) + 0.3;
    for (const side of [-1, 1]) {
      walkPos.push(p[0], y, p[1]);
      walkSide.push(-tz * side, 0, tx * side);
      walkAlong.push(k);
      walkDist.push(run);
    }
    if (i < WALK_STEPS) {
      const a = i * 2;
      walkIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const sign = Math.sign(p[0] - L.riverX(p[1]));
    if (sign !== prevSign && i > 0) crossings.push({ x: p[0], z: p[1], angle: Math.atan2(tx, tz) });
    prevSign = sign;
  }
  const walkGeo = new THREE.BufferGeometry();
  walkGeo.setAttribute("position", new THREE.Float32BufferAttribute(walkPos, 3));
  walkGeo.setAttribute("aSide", new THREE.Float32BufferAttribute(walkSide, 3));
  walkGeo.setAttribute("aAlong", new THREE.Float32BufferAttribute(walkAlong, 1));
  walkGeo.setAttribute("aDist", new THREE.Float32BufferAttribute(walkDist, 1));
  walkGeo.setIndex(walkIdx);
  const walkUniforms = { uHalfWidth: { value: 0.2 }, uFill: { value: 0 }, uDash: { value: 2 } };
  const walk = new THREE.Mesh(
    walkGeo,
    new THREE.ShaderMaterial({
      uniforms: walkUniforms,
      vertexShader: WALK_VERT,
      fragmentShader: WALK_FRAG,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    }),
  );
  // Its box never moves but its width does; it is never worth culling.
  walk.frustumCulled = false;
  scene.add(walk);

  // A plank bridge wherever the walk crosses the river.
  const deckMat = toneMaterial(0.42);
  const railMat = toneMaterial(0.2);
  for (const c of crossings) {
    const g = new THREE.Group();
    const span = 2 * L.riverHalf(c.z) + 4;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, span), deckMat);
    deck.position.y = DECK - 0.2;
    g.add(deck);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, span), railMat);
      rail.position.set(s * 1.3, DECK + 0.3, 0);
      g.add(rail);
    }
    g.position.set(c.x, 0, c.z);
    g.rotation.y = c.angle;
    scene.add(g);
  }

  // ------------------------------------------------------------ the trees
  // Sakura in clumps: a short trunk under three soft lumps of blossom.
  const rng = makeRng(1207);
  const walkSamples: [number, number][] = [];
  for (let i = 0; i <= 200; i += 1) walkSamples.push(L.walkAt((i / 200) * 4));
  const clearOf = (x: number, z: number): boolean => {
    if (Math.abs(x) > L.HALF - 2 || Math.abs(z) > L.HALF - 2) return false;
    if (Math.abs(x - L.riverX(z)) < L.riverHalf(z) + 2.2) return false;
    if (L.PRECINCTS.some((p) => Math.max(Math.abs(x - p.x), Math.abs(z - p.z)) < L.COURT + 2.2)) return false;
    if (L.VILLAGES.some((v, i) => Math.hypot(x - v.x, z - v.z) < L.villageRadius(skillGroups[i]?.skills.length ?? 6) + 4)) return false;
    if (walkSamples.some((w) => Math.hypot(x - w[0], z - w[1]) < 2.2)) return false;
    return true;
  };
  const trees: [number, number, number][] = [];
  for (let c = 0; c < 44 && trees.length < 320; c += 1) {
    const cx = (rng() * 2 - 1) * (L.HALF - 6);
    const cz = (rng() * 2 - 1) * (L.HALF - 6);
    const n = 4 + Math.floor(rng() * 8);
    for (let t = 0; t < n; t += 1) {
      const x = cx + (rng() + rng() - 1) * 5;
      const z = cz + (rng() + rng() - 1) * 5;
      if (!clearOf(x, z)) continue;
      trees.push([x, L.heightAt(x, z), z]);
    }
  }
  const lumpGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.8, 5);
  trunkGeo.translate(0, 0.9, 0);
  const lumps = new THREE.InstancedMesh(lumpGeo, toneMaterial(0.6), trees.length * 3);
  const trunks = new THREE.InstancedMesh(trunkGeo, toneMaterial(0.3), trees.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const tone = new THREE.Color();
  trees.forEach(([x, y, z], i) => {
    const size = 0.85 + rng() * 0.5;
    m.makeScale(size, size, size).setPosition(x, y, z);
    trunks.setMatrixAt(i, m);
    for (let j = 0; j < 3; j += 1) {
      const a = (j / 3) * Math.PI * 2 + rng();
      const r = (1.05 + rng() * 0.5) * size;
      v.set(x + Math.cos(a) * 0.7 * size, y + 1.8 * size + r * 0.45, z + Math.sin(a) * 0.7 * size);
      s.set(r, r * 0.72, r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
      m.compose(v, q, s);
      lumps.setMatrixAt(i * 3 + j, m);
      const t = 0.5 + rng() * 0.16;
      lumps.setColorAt(i * 3 + j, tone.setRGB(t, t, t));
    }
  });
  lumps.instanceMatrix.needsUpdate = true;
  if (lumps.instanceColor) lumps.instanceColor.needsUpdate = true;
  scene.add(trunks, lumps);

  // ------------------------------------------------------- the precincts
  const pictureGeo = new THREE.PlaneGeometry(1, 1);
  pictureGeo.translate(0, 0.5, 0);
  const pictureMats = new Map<L.PartKind, THREE.ShaderMaterial>();
  for (const kind of kinds) {
    const pic = pictures.get(kind);
    if (!pic) continue;
    const tex = new THREE.CanvasTexture(pic);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    textures.push(tex);
    pictureMats.set(
      kind,
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: tex } },
        vertexShader: PICTURE_VERT,
        fragmentShader: PICTURE_FRAG,
        side: THREE.DoubleSide,
      }),
    );
  }
  // A builder that could not draw leaves a plain block in its place.
  const blockMat = toneMaterial(0.4);
  const standing: THREE.Object3D[] = [];
  L.PRECINCTS.forEach((p, i) => {
    const y = L.siteHeight(i);
    for (const part of p.parts) {
      const tall = part.w * (L.SNAP[part.kind].h / L.SNAP[part.kind].w) * L.STAND;
      const mat = pictureMats.get(part.kind);
      if (mat) {
        const mesh = new THREE.Mesh(pictureGeo, mat);
        mesh.scale.set(part.w, tall, 1);
        mesh.position.set(p.x + part.dx, y, p.z + part.dz);
        standing.push(mesh);
        scene.add(mesh);
      } else {
        const block = new THREE.Mesh(new THREE.BoxGeometry(part.w * 0.6, tall * 0.5, part.w * 0.45), blockMat);
        block.position.set(p.x + part.dx, y + tall * 0.25, p.z + part.dz);
        scene.add(block);
      }
    }
  });

  // ------------------------------------------------------------ lanterns
  // One per skill, in a ring on each village green. They stand up out of
  // the ground as the skills come in.
  const postGeo = new THREE.BoxGeometry(0.6, 2.6, 0.6);
  postGeo.translate(0, 1.3, 0);
  const boxGeo = new THREE.BoxGeometry(1.5, 1.3, 1.5);
  boxGeo.translate(0, 3.25, 0);
  const capGeo = new THREE.ConeGeometry(1.35, 1.0, 4);
  capGeo.rotateY(Math.PI / 4);
  capGeo.translate(0, 4.4, 0);
  const lanternSpots: { x: number; y: number; z: number; v: number; j: number; n: number }[] = [];
  skillGroups.forEach((g, vi) => {
    const n = g.skills.length;
    for (let j = 0; j < n; j += 1) {
      const [x, z] = L.lanternAt(vi, j, n);
      lanternSpots.push({ x, y: L.heightAt(x, z), z, v: vi, j, n });
    }
  });
  const lanternParts = [
    new THREE.InstancedMesh(postGeo, toneMaterial(0.2), lanternSpots.length),
    new THREE.InstancedMesh(boxGeo, toneMaterial(0.8), lanternSpots.length),
    new THREE.InstancedMesh(capGeo, toneMaterial(0.16), lanternSpots.length),
  ];
  for (const part of lanternParts) {
    // They start at nothing, and a box worked out from nothing would cull
    // them for good once they grow.
    part.frustumCulled = false;
    scene.add(part);
  }
  let risen = -1;
  const setRise = (rise: number): void => {
    if (Math.abs(rise - risen) < 0.002) return;
    risen = rise;
    lanternSpots.forEach((l, i) => {
      const start = l.v * 0.08 + (l.j / l.n) * 0.22;
      const up = L.smooth(start, start + 0.4, rise);
      if (up <= 0.001) m.makeScale(0, 0, 0);
      else m.makeScale(1, up, 1).setPosition(l.x, l.y, l.z);
      for (const part of lanternParts) part.setMatrixAt(i, m);
    });
    for (const part of lanternParts) part.instanceMatrix.needsUpdate = true;
  };
  setRise(0);

  // -------------------------------------------------------------- frames
  let cols = 240;
  const setGrid = (c: number, rows: number): void => {
    cols = Math.max(20, c);
    renderer.setSize(Math.max(2, cols * 2), Math.max(2, rows * 2), false);
  };
  setGrid(240, 130);

  const tanHalf = Math.tan((L.FOV * Math.PI) / 360);
  const render = (state: L.State, aspect: number, time: number): void => {
    const c = state.cam;
    const pos = L.camPosition(c);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(c.target[0], c.target[1], c.target[2]);
    for (const st of standing) st.rotation.y = c.yaw;
    // The walk is two bar cells wide and its dashes nine long, however far
    // off the camera is, so it never thins out to nothing between cells.
    const cell = (2 * c.dist * tanHalf * aspect) / cols;
    walkUniforms.uHalfWidth.value = cell;
    walkUniforms.uDash.value = cell * 9;
    walkUniforms.uFill.value = state.k;
    groundUniforms.uTime.value = time;
    setRise(state.rise);
    renderer.render(scene, camera);
  };

  const dispose = (): void => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) mat.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    for (const t of textures) t.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  return { canvas, setGrid, render, dispose };
}
