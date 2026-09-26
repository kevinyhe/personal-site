import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fbm2, makeRng } from "@/components/valley/sources/noise";
import { BLOSSOM_CELLS, drawFlowers, drawMarks, FLOWER_COLS, MARK_COLS, markRows, PETAL_CELLS, SKILLS } from "./atlas";
import * as L from "./layout";
import {
  BLOSSOM_VERT,
  FLOWER_FRAG,
  PEBBLE_FRAG,
  PEBBLE_VERT,
  PETAL_VERT,
  QUAD_VERT,
  RAKE_FRAG,
  ROOF_FRAG,
  SAND_FRAG,
  SOLID_FRAG,
  SOLID_VERT,
  WALL_FRAG,
  WORLD_VERT,
} from "./shaders";

/**
 * The garden, drawn grey on black into a canvas nobody sees. The page
 * hands that canvas to the bar dither. This file knows nothing about the
 * page: each frame it is told where the camera stands, how far each
 * stone's rings reach, and how far the rings round the email have come.
 */

export type Rings = { inner: number; outer: number; phase: number };
export type SceneInput = {
  pose: L.Pose;
  time: number;
  dt: number;
  rings: readonly Rings[];
  contactOn: number;
};
export type ContactRect = { cx: number; cz: number; hx: number; hz: number };

export type GardenScene = {
  resize(width: number, height: number, aspect: number): void;
  render(input: SceneInput): void;
  /** Presses the rake in along a line on the sand, in world units. */
  stroke(x0: number, z0: number, x1: number, z1: number): void;
  setContact(r: ContactRect): void;
  redrawMarks(sansFamily: string): void;
  pebbles(): readonly L.Pebble[];
  /** True while raked grooves are still settling. */
  raking(): boolean;
  dispose(): void;
};

/** Light from the front left and above; low enough that the grooves throw shade. */
const LIGHT = new THREE.Vector3(-0.35, 0.6, 0.72).normalize();
/** How deep a groove is, in world units. */
const GROOVE_DEPTH = 0.035;
/** Seconds for a raked groove to settle back into the pattern. */
const SETTLE = 9;
/** Half the rake's width: about five tines. */
const RAKE_HALF = 0.85;
/** Rake picture size. The sand is 88 by 15 units, so about 23 texels a unit. */
const RAKE_W = 2048;
const RAKE_H = 352;

const PETALS_PER_TREE = 36;
const PETAL_TOP = 3.4;

// ------------------------------------------------------------- geometry

/** One lumpy stone: a faceted ball, pushed about by noise, stretched to size, tipped over. */
function blob(sx: number, sy: number, sz: number, taper: number, tilt: number, seed: number, ox: number, oz: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k += 1) {
    let x = pos.getX(k);
    let y = pos.getY(k);
    let z = pos.getZ(k);
    const lump = 1 + 0.16 * (fbm2(x * 1.3 + y * 0.8 + 3, z * 1.3 - y * 0.9 + 7, 3, seed) - 0.5);
    x *= lump;
    y *= lump;
    z *= lump;
    // The part below ground is short: the stone is sunk, not balanced on a point.
    const up = y > 0 ? y * sy : y * 0.3 * sy;
    const narrow = 1 - taper * Math.max(0, y);
    pos.setXYZ(k, x * sx * narrow, up, z * sz * narrow);
  }
  g.rotateZ(tilt);
  g.translate(ox, 0, oz);
  g.computeVertexNormals();
  return g;
}

function stoneGeometry(st: L.Stone): THREE.BufferGeometry {
  switch (st.shape) {
    case "upright":
      return blob(0.5, 1.5, 0.45, 0.25, 0.06, st.seed, 0, 0);
    case "leaning":
      return blob(0.46, 1.32, 0.42, 0.55, -0.5, st.seed, -0.25, 0);
    case "boulder":
      return blob(0.82, 0.6, 0.78, 0.1, 0.05, st.seed, 0, 0);
    case "slab":
      return blob(1.25, 0.38, 0.7, 0.05, 0.03, st.seed, 0, 0);
    case "pair": {
      const big = blob(0.6, 0.88, 0.54, 0.2, 0.08, st.seed, -0.35, 0);
      const small = blob(0.36, 0.44, 0.33, 0.15, -0.12, st.seed + 5, 0.86, 0.3);
      const merged = mergeGeometries([big, small]);
      big.dispose();
      small.dispose();
      return merged ?? new THREE.BufferGeometry();
    }
  }
}

/** A low mound of moss round a stone, its edge wavering. */
function mossGeometry(st: L.Stone): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 36, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k += 1) {
    const x = pos.getX(k);
    const y = pos.getY(k);
    const z = pos.getZ(k);
    const a = Math.atan2(z, x);
    const edge = 1 + 0.12 * (fbm2(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, 3, st.seed + 1) - 0.5) * 2;
    pos.setXYZ(k, x * st.moss * edge, y * 0.14 - 0.02, z * st.moss * 0.85 * edge);
  }
  g.translate(st.x, 0, st.z);
  g.computeVertexNormals();
  return g;
}

type Branch = { a: THREE.Vector3; b: THREE.Vector3; r0: number; r1: number };

/**
 * A cherry tree growing up behind the wall and leaning out over it. The
 * trunk bends toward the garden; three limbs fork twice and droop at the
 * tips, where the blossom gathers.
 */
function growTree(x: number, seed: number): { wood: Branch[]; tips: THREE.Vector3[]; knots: THREE.Vector3[] } {
  const rng = makeRng(seed * 7919 + 1);
  const wood: Branch[] = [];
  const tips: THREE.Vector3[] = [];
  const knots: THREE.Vector3[] = [];
  const keepClear = (p: THREE.Vector3): void => {
    // Nothing grows through the roof.
    if (p.z > L.WALL_Z - 0.45 && p.y < L.WALL_H + 0.75) p.y = L.WALL_H + 0.75;
    p.z = Math.min(p.z, L.WALL_Z + 2.4);
  };

  let at = new THREE.Vector3(x, -0.3, L.WALL_Z - 1.3);
  const dir = new THREE.Vector3((rng() - 0.5) * 0.3, 1, 0.1).normalize();
  let r = 0.24;
  const forks: { p: THREE.Vector3; r: number }[] = [];
  for (let s = 0; s < 6; s += 1) {
    const next = at.clone().addScaledVector(dir, 0.64);
    const r1 = r * 0.86;
    wood.push({ a: at, b: next, r0: r, r1 });
    at = next;
    r = r1;
    dir.z += 0.08;
    dir.x += (rng() - 0.5) * 0.2;
    dir.normalize();
    if (s >= 3) forks.push({ p: at.clone(), r });
  }

  const limb = (from: THREE.Vector3, d: THREE.Vector3, len: number, rad: number, depth: number): void => {
    let p = from.clone();
    const dd = d.clone().normalize();
    let rr = rad;
    for (let s = 0; s < 3; s += 1) {
      const q = p.clone().addScaledVector(dd, len / 3);
      keepClear(q);
      const r1 = rr * 0.8;
      wood.push({ a: p, b: q, r0: rr, r1 });
      p = q;
      rr = r1;
      // Droop more the thinner the branch.
      dd.y -= 0.1 * (3 - depth);
      dd.x += (rng() - 0.5) * 0.25;
      dd.normalize();
    }
    if (depth === 0) {
      tips.push(p.clone());
      return;
    }
    knots.push(p.clone());
    for (let f = 0; f < 2; f += 1) {
      const side = f === 0 ? -1 : 1;
      const nd = new THREE.Vector3(dd.x + side * (0.5 + rng() * 0.4), dd.y + 0.25 + rng() * 0.2, dd.z + 0.2 + rng() * 0.3);
      limb(p, nd, len * 0.72, rr, depth - 1);
    }
  };

  const heads = [
    new THREE.Vector3(-0.9, 0.55, 0.55),
    new THREE.Vector3(0.15, 0.5, 0.9),
    new THREE.Vector3(0.95, 0.45, 0.5),
  ];
  heads.forEach((h, k) => {
    const f = forks[Math.min(forks.length - 1, k)];
    limb(f.p, h, 1.6 + rng() * 0.5, f.r * 0.8, 2);
  });
  return { wood, tips, knots };
}

function woodGeometry(list: Branch[]): THREE.BufferGeometry {
  const up = new THREE.Vector3(0, 1, 0);
  const parts = list.map((br) => {
    const d = br.b.clone().sub(br.a);
    const len = Math.max(0.001, d.length());
    const g = new THREE.CylinderGeometry(br.r1, br.r0, len, 6, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize()));
    g.translate(br.a.x, br.a.y, br.a.z);
    return g;
  });
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/** The roof's front slope, from the eave up to the ridge, with uv.y running up it. */
function roofGeometry(x0: number, x1: number): { geo: THREE.BufferGeometry; slope: number } {
  const eave = new THREE.Vector3(0, L.WALL_H - 0.05, L.WALL_Z + 0.55);
  const ridge = new THREE.Vector3(0, L.WALL_H + 0.55, L.WALL_Z - 0.2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([x0, eave.y, eave.z, x1, eave.y, eave.z, x0, ridge.y, ridge.z, x1, ridge.y, ridge.z], 3),
  );
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  geo.computeVertexNormals();
  return { geo, slope: eave.distanceTo(ridge) };
}

function solidMaterial(base: number, gain: number, grain: number, speck: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SOLID_VERT,
    fragmentShader: SOLID_FRAG,
    uniforms: {
      uLight: { value: LIGHT },
      uBase: { value: base },
      uGain: { value: gain },
      uGrain: { value: grain },
      uSpeck: { value: speck },
    },
  });
}

// ---------------------------------------------------------------- build

export function buildGarden(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, sansFamily: string): GardenScene {
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
  // This canvas feeds the dither and is never shown; its size is set in
  // pixels by resize(). The dither canvas carries the 1.5 cap.
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.autoClear = true;

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(L.FOV, 1.85, L.NEAR, L.FAR);

  // ------------------------------------------------------ the rake picture
  const rtOptions = {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  } as const;
  let rakeRead = keep(new THREE.WebGLRenderTarget(RAKE_W, RAKE_H, rtOptions));
  let rakeWrite = keep(new THREE.WebGLRenderTarget(RAKE_W, RAKE_H, rtOptions));
  const area = new THREE.Vector4(L.SAND.x0, L.SAND.z0, L.SAND.x1 - L.SAND.x0, L.SAND.z1 - L.SAND.z0);
  const rakeMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: RAKE_FRAG,
      uniforms: {
        uPrev: { value: null },
        uSeg: { value: new THREE.Vector4() },
        uHas: { value: 0 },
        uDecay: { value: 0 },
        uInit: { value: 1 },
        uArea: { value: area },
        uHalf: { value: RAKE_HALF },
        uSpacing: { value: L.SPACING },
      },
      depthTest: false,
      depthWrite: false,
    }),
  );
  const quadGeo = keep(new THREE.PlaneGeometry(2, 2));
  const quad = new THREE.Mesh(quadGeo, rakeMat);
  quad.frustumCulled = false;
  const rakeScene = new THREE.Scene();
  rakeScene.add(quad);
  const rakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const rakePass = (seg: [number, number, number, number] | null, decay: number, init: boolean): void => {
    const u = rakeMat.uniforms;
    u.uPrev.value = rakeRead.texture;
    u.uInit.value = init ? 1 : 0;
    u.uHas.value = seg ? 1 : 0;
    if (seg) (u.uSeg.value as THREE.Vector4).set(seg[0], seg[1], seg[2], seg[3]);
    u.uDecay.value = decay;
    renderer.setRenderTarget(rakeWrite);
    renderer.render(rakeScene, rakeCam);
    renderer.setRenderTarget(null);
    const t = rakeRead;
    rakeRead = rakeWrite;
    rakeWrite = t;
  };
  rakePass(null, 0, true);
  rakePass(null, 0, true);

  // ---------------------------------------------------------------- sand
  const stoneVecs = L.STONES.map((st) => new THREE.Vector4(st.x, st.z, st.moss + 0.1, st.moss + 0.1 + L.RINGS_KEPT * L.SPACING));
  const sandMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: SAND_FRAG,
      uniforms: {
        uStones: { value: stoneVecs },
        uPhase: { value: [0, 0, 0, 0, 0] },
        uContact: { value: new THREE.Vector4(60, 1.5, 5, 1.6) },
        uContactOn: { value: 0 },
        uContactReach: { value: L.CONTACT_RING_REACH },
        uRake: { value: rakeRead.texture },
        uRakeArea: { value: area },
        uSpacing: { value: L.SPACING },
        uDepth: { value: GROOVE_DEPTH },
        uLight: { value: LIGHT },
      },
    }),
  );
  const sandGeo = keep(new THREE.PlaneGeometry(area.z, area.w));
  sandGeo.rotateX(-Math.PI / 2);
  sandGeo.translate(area.x + area.z / 2, 0, area.y + area.w / 2);
  scene.add(new THREE.Mesh(sandGeo, sandMat));

  // --------------------------------------------------------- stones, moss
  const stoneMat = keep(solidMaterial(0.08, 0.46, 9, 0.1));
  const mossMat = keep(solidMaterial(0.14, 0.3, 18, 0.34));
  for (const st of L.STONES) {
    const sg = keep(stoneGeometry(st));
    const stone = new THREE.Mesh(sg, stoneMat);
    stone.position.set(st.x, 0, st.z);
    scene.add(stone);
    scene.add(new THREE.Mesh(keep(mossGeometry(st)), mossMat));
  }

  // ---------------------------------------------------------- wall, roof
  const WALL_X0 = L.SAND.x0 - 20;
  const WALL_X1 = L.SAND.x1 + 20;
  const wallGeo = keep(new THREE.PlaneGeometry(WALL_X1 - WALL_X0, L.WALL_H));
  wallGeo.translate((WALL_X0 + WALL_X1) / 2, L.WALL_H / 2, L.WALL_Z);
  const wallMat = keep(
    new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: WALL_FRAG, uniforms: { uWallH: { value: L.WALL_H } } }),
  );
  scene.add(new THREE.Mesh(wallGeo, wallMat));
  const roof = roofGeometry(WALL_X0, WALL_X1);
  keep(roof.geo);
  const roofMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: ROOF_FRAG,
      uniforms: { uTile: { value: 0.26 }, uSlope: { value: roof.slope } },
      side: THREE.DoubleSide,
    }),
  );
  scene.add(new THREE.Mesh(roof.geo, roofMat));
  const capGeo = keep(new THREE.BoxGeometry(WALL_X1 - WALL_X0, 0.16, 0.24));
  capGeo.translate((WALL_X0 + WALL_X1) / 2, L.WALL_H + 0.6, L.WALL_Z - 0.2);
  const capMat = keep(solidMaterial(0.26, 0.3, 6, 0.04));
  scene.add(new THREE.Mesh(capGeo, capMat));

  // --------------------------------------------------------------- trees
  const flowerCanvas = document.createElement("canvas");
  drawFlowers(flowerCanvas);
  const flowerTex = keep(new THREE.CanvasTexture(flowerCanvas));
  flowerTex.colorSpace = THREE.NoColorSpace;
  flowerTex.generateMipmaps = false;
  flowerTex.minFilter = THREE.LinearFilter;

  const woodMat = keep(solidMaterial(0.2, 0.32, 14, 0.06));
  const wood: Branch[] = [];
  const centres: number[] = [];
  const looks: number[] = [];
  const petalSeeds: number[] = [];
  const petalLooks: number[] = [];
  for (const tree of L.TREES) {
    const t = growTree(tree.x, tree.seed);
    wood.push(...t.wood);
    const rng = makeRng(tree.seed * 104729 + 17);
    const scatter = (at: THREE.Vector3, count: number, radius: number): void => {
      for (let k = 0; k < count; k += 1) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * radius;
        centres.push(at.x + Math.cos(a) * rr, at.y + (rng() - 0.45) * radius * 0.9, at.z + Math.sin(a) * rr * 0.8);
        looks.push(0.16 + rng() * 0.11, rng() * Math.PI * 2, BLOSSOM_CELLS[k % 3], 0.8 + rng() * 0.2);
      }
    };
    t.tips.forEach((p) => scatter(p, 20, 0.55));
    t.knots.forEach((p) => scatter(p, 8, 0.4));
    for (let k = 0; k < PETALS_PER_TREE; k += 1) {
      petalSeeds.push(tree.x - 1.2 + (rng() - 0.5) * 4.5, L.WALL_Z - 0.2 + rng() * 2.4, rng(), 8 + rng() * 6);
      petalLooks.push(0.075 + rng() * 0.035, rng() * Math.PI * 2, PETAL_CELLS[k % 3], 0.85 + rng() * 0.15);
    }
  }
  scene.add(new THREE.Mesh(keep(woodGeometry(wood)), woodMat));

  const sprite = keep(new THREE.PlaneGeometry(1, 1));
  const flowerUniforms = { uAtlas: { value: flowerTex }, uCols: { value: FLOWER_COLS }, uRows: { value: 2 } };
  const blossomGeo = keep(new THREE.InstancedBufferGeometry());
  blossomGeo.index = sprite.index;
  blossomGeo.setAttribute("position", sprite.attributes.position);
  blossomGeo.setAttribute("uv", sprite.attributes.uv);
  blossomGeo.setAttribute("aCentre", new THREE.InstancedBufferAttribute(new Float32Array(centres), 3));
  blossomGeo.setAttribute("aLook", new THREE.InstancedBufferAttribute(new Float32Array(looks), 4));
  blossomGeo.instanceCount = centres.length / 3;
  const blossomMat = keep(
    new THREE.ShaderMaterial({ vertexShader: BLOSSOM_VERT, fragmentShader: FLOWER_FRAG, uniforms: flowerUniforms, side: THREE.DoubleSide }),
  );
  const blossoms = new THREE.Mesh(blossomGeo, blossomMat);
  blossoms.frustumCulled = false;
  scene.add(blossoms);

  const petalGeo = keep(new THREE.InstancedBufferGeometry());
  petalGeo.index = sprite.index;
  petalGeo.setAttribute("position", sprite.attributes.position);
  petalGeo.setAttribute("uv", sprite.attributes.uv);
  petalGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(petalSeeds), 4));
  petalGeo.setAttribute("aLook", new THREE.InstancedBufferAttribute(new Float32Array(petalLooks), 4));
  petalGeo.instanceCount = petalSeeds.length / 4;
  const petalMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: PETAL_VERT,
      fragmentShader: FLOWER_FRAG,
      uniforms: { ...flowerUniforms, uTime: { value: 0 }, uTop: { value: PETAL_TOP } },
      side: THREE.DoubleSide,
    }),
  );
  const petals = new THREE.Mesh(petalGeo, petalMat);
  petals.frustumCulled = false;
  scene.add(petals);

  // ------------------------------------------------------------- pebbles
  const markCanvas = document.createElement("canvas");
  drawMarks(markCanvas, sansFamily);
  const markTex = keep(new THREE.CanvasTexture(markCanvas));
  markTex.colorSpace = THREE.NoColorSpace;
  markTex.generateMipmaps = false;
  markTex.minFilter = THREE.LinearFilter;
  const pebbleGeo = keep(new THREE.SphereGeometry(1, 24, 12));
  pebbleGeo.scale(1, 0.45, 1);
  pebbleGeo.computeVertexNormals();
  const cells = new Float32Array(SKILLS.length);
  pebbleGeo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 1));
  const pebbleMat = keep(
    new THREE.ShaderMaterial({
      vertexShader: PEBBLE_VERT,
      fragmentShader: PEBBLE_FRAG,
      uniforms: { uMarks: { value: markTex }, uCols: { value: MARK_COLS }, uRows: { value: markRows() }, uLight: { value: LIGHT } },
    }),
  );
  const pebbleMesh = new THREE.InstancedMesh(pebbleGeo, pebbleMat, SKILLS.length);
  pebbleMesh.frustumCulled = false;
  scene.add(pebbleMesh);
  const groupSizes = [0, 0, 0, 0, 0];
  SKILLS.forEach((s) => (groupSizes[s.group] += 1));
  let pebbles: L.Pebble[] = [];
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const layPebbles = (aspect: number): void => {
    pebbles = L.pebbleLayout(aspect, groupSizes);
    pebbles.forEach((p, i) => {
      q4.setFromAxisAngle(yAxis, p.turn * 0.4);
      m4.compose(new THREE.Vector3(p.x, p.r * 0.12, p.z), q4, new THREE.Vector3(p.r, p.r, p.r * 0.92));
      pebbleMesh.setMatrixAt(i, m4);
      cells[i] = i;
    });
    pebbleMesh.count = pebbles.length;
    pebbleMesh.instanceMatrix.needsUpdate = true;
    (pebbleGeo.attributes.aCell as THREE.InstancedBufferAttribute).needsUpdate = true;
  };
  layPebbles(1.85);

  // ------------------------------------------------------------- driving
  let aspect = 1.85;
  const queue: [number, number, number, number][] = [];
  let decayOwed = 0;
  let settleUntil = -1;
  let clock = 0;

  const render = (f: SceneInput): void => {
    clock = f.time;
    // The rake: owed decay is paid in steps the 8-bit picture can hold.
    if (settleUntil > clock || queue.length) {
      decayOwed += f.dt / SETTLE;
      const pay = decayOwed >= 2 / 255 ? decayOwed : 0;
      if (pay) decayOwed = 0;
      if (queue.length) {
        const n = Math.min(queue.length, 6);
        for (let k = 0; k < n; k += 1) rakePass(queue[k], k === 0 ? pay : 0, false);
        queue.length = 0;
        settleUntil = clock + SETTLE + 1;
      } else if (pay) {
        rakePass(null, pay, false);
      }
      sandMat.uniforms.uRake.value = rakeRead.texture;
    }

    const p = f.pose;
    camera.position.set(p.x, p.y, p.z);
    camera.rotation.set(p.pitch, 0, 0);
    camera.updateMatrixWorld();

    f.rings.forEach((r, i) => {
      stoneVecs[i].z = r.inner;
      stoneVecs[i].w = r.outer;
      (sandMat.uniforms.uPhase.value as number[])[i] = r.phase;
    });
    sandMat.uniforms.uContactOn.value = f.contactOn;
    petalMat.uniforms.uTime.value = f.time;
    renderer.render(scene, camera);
  };

  return {
    resize(width: number, height: number, a: number): void {
      renderer.setSize(width, height, false);
      camera.aspect = a;
      camera.updateProjectionMatrix();
      if (Math.abs(a - aspect) > 1e-4) {
        aspect = a;
        layPebbles(a);
      }
    },
    render,
    stroke(x0: number, z0: number, x1: number, z1: number): void {
      queue.push([x0, z0, x1, z1]);
      if (queue.length > 12) queue.splice(0, queue.length - 12);
    },
    setContact(r: ContactRect): void {
      (sandMat.uniforms.uContact.value as THREE.Vector4).set(r.cx, r.cz, r.hx, r.hz);
    },
    redrawMarks(family: string): void {
      drawMarks(markCanvas, family);
      markTex.needsUpdate = true;
    },
    pebbles: () => pebbles,
    raking: () => settleUntil > clock,
    dispose(): void {
      for (const d of disposables) d.dispose();
      pebbleMesh.dispose();
      renderer.dispose();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
