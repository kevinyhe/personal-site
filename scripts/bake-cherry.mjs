/**
 * Bakes the intro cherry tree's upper trunk as one small closed mesh, for
 * the black-panel stage to shatter the way it shatters the Thinker.
 *
 *   node scripts/bake-cherry.mjs [--cut-t 0.45] [--depth 2] [--cell 0.11]
 *                                [--out public/model/cherry]
 *
 * Why a baked file rather than the live generator: the stage needs a solid
 * body to cut into chunks. The intro's tree is thousands of open tubes
 * (one per branch, no shared skin, twigs poking through boughs), which the
 * fracture code cannot slice, and building it costs ~1.5 s of main thread.
 * So this script runs the SAME generator with the SAME seed, keeps only the
 * trunk and the first two branch orders, wraps them in one continuous
 * surface, and writes a plain glTF that `loadThinkerGeometry` reads
 * unchanged. It is the intro tree, not a look-alike: every centre line and
 * radius comes from WeepingCherryGenerator, phase for phase.
 *
 * How the skin is made: each branch becomes a chain of round cones (two
 * spheres and the cone between them) along its curve, the radius taken
 * from the exact formula BranchGeometryBuilder.append uses, minus the bark
 * ridges. The signed distance to the nearest cone is sampled on a grid,
 * cut off below the chosen trunk height by a flat plane, and marching cubes
 * turns the zero level into triangles. Vertices are shared through a
 * per-edge cache, so the mesh is welded by construction and the checks at
 * the end (closed, one piece, positive volume) hold without a repair pass.
 *
 * The mesh is written in the intro's frame (its yaw and non-uniform scale,
 * no translation) so the boughs lean the way they do on screen. The loader
 * recentres and rescales it anyway; cherry-meta.json records where the flat
 * cut face ends up after that, so the stage can stand it on the floor.
 */

import { register } from "node:module";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import {
  edgeTable,
  triTable,
} from "three/examples/jsm/objects/MarchingCubes.js";

// The generator is TypeScript with JSX; the hooks let Node import it. They
// have to be registered before the dynamic imports below, and those must
// stay dynamic: a static import would be hoisted above the register call.
register("./ts-hooks.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** Trunk parameter of the cut plane, on the raw spline (getPoint, as the
 *  intro places things), not arc length. 0.45 is just under the lowest
 *  primary bough (they fork off at arc-length t 0.577-0.68), so the cut
 *  shows a clean length of bare trunk under the first fork. The guard after
 *  the skeleton is built rejects a cut outside that bare length. */
const DEFAULT_CUT_T = 0.45;
/** Deepest branch order kept. Depth 2 is the last order that reads as a
 *  bough rather than a twig, and the last the triangle budget affords. */
const DEFAULT_DEPTH = 2;
/** Grid cell edge in the tree's local units. 0.11 lands the mesh near the
 *  20k-triangle mark; the thinnest kept boughs are ~0.08 across. */
const DEFAULT_CELL = 0.11;
/** Where the trunk's cone chain starts, below the cut plane, so the plane
 *  slices through a full tube instead of grazing a rounded cone end. */
const TRUNK_START_T = 0.4;
/** A tube thinner than about one cell falls apart into beads under marching
 *  cubes, so every radius is held at 1.2 cells. */
const RADIUS_FLOOR_CELLS = 1.2;
/** A bough whose real radius drops under 0.6 cells is ended there instead
 *  of being fattened to the floor for the rest of its length; the last cone
 *  is a sphere, so it ends rounded. */
const STOP_RADIUS_CELLS = 0.6;
/** Empty cells around the field on every side, so no surface touches the
 *  grid boundary and every gradient has neighbours on both sides. */
const PADDING_CELLS = 3;
/** Field value for cells no cone was evaluated in. Anything past the cone
 *  bounding boxes (radius + 3 cells) is outside; 4 cells keeps the
 *  gradient sign right at the box edges. */
const FAR_FIELD_CELLS = 4;
/** Hard ceiling on the output. Raise --cell if it trips. */
const MAX_TRIANGLES = 25_000;
/** Same per-depth tube resolution as BranchGeometryBuilder.getTubularSegments,
 *  doubled at sampling time so cone chains follow the curves closely. */
const TUBULAR_SEGMENTS_BY_DEPTH = [24, 20, 14, 10, 9, 6, 5];

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const CUT_T = Number(readArg("cut-t", DEFAULT_CUT_T));
const KEEP_DEPTH = Number(readArg("depth", DEFAULT_DEPTH));
const CELL = Number(readArg("cell", DEFAULT_CELL));
const OUT_DIR = resolve(ROOT, readArg("out", "public/model/cherry"));

if (!(CUT_T > 0 && CUT_T < 1)) fail(`--cut-t must be in (0, 1), got ${CUT_T}`);
if (!Number.isInteger(KEEP_DEPTH) || KEEP_DEPTH < 1 || KEEP_DEPTH > 3) {
  fail(`--depth must be 1, 2 or 3, got ${KEEP_DEPTH}`);
}
if (!(CELL > 0.02 && CELL < 1)) fail(`--cell must be in (0.02, 1), got ${CELL}`);

const wallStart = performance.now();

function fail(message) {
  console.error(`bake-cherry: ${message}`);
  process.exit(1);
}

function check(condition, message) {
  if (!condition) fail(`self-check failed: ${message}`);
  console.log(`  ok  ${message}`);
}

// ---------------------------------------------------------------------------
// 1. Replay the intro's skeleton.
//
// generate() is not called: it builds bark textures on a DOM canvas and
// writes timings to window. Its skeleton phases are replayed here in the
// same order (see generate() in BareThreeCanvas.tsx). Every depth is built
// even though most is thrown away, because solveRadii sets a bough's radius
// from the twigs above it. updateArcLengths is deliberately NOT called after
// sagging; the intro leaves the arc-length tables stale too, and the
// slightly-off spacing that produces is part of its look.
// ---------------------------------------------------------------------------
const { WeepingCherryGenerator } = await import(
  "../components/BareThreeCanvas.tsx"
);
const {
  INTRO_TREE_SEED: SEED,
  TREE_BASE_SCALE,
  TREE_TUNING_DEFAULT,
} = await import("../components/treeTuning.ts");
// The site's own glTF reader; used at the end to read the bake back.
const { loadThinkerGeometry } = await import("../components/thinkerFragments.ts");

const gen = new WeepingCherryGenerator({ seed: SEED, quality: "high" });
gen.lobes = gen.createCanopyLobes();
gen.generateLobeTargets();
const trunk = gen.createTrunk();
const primaries = gen.createPrimaryBranches(trunk);
const secondaries = gen.createChildLayer(primaries, 2);
const tertiaries = gen.createChildLayer(secondaries, 3);
gen.createTerminalTwigs([...secondaries, ...tertiaries]);
gen.ensureTerminalProgression([...primaries, ...secondaries, ...tertiaries]);
gen.createSubTwigs();
gen.solveRadii(trunk);
gen.computeWeights(trunk);
gen.applySagging(trunk);

const allBranches = gen.branches;
const kept = allBranches.filter((b) => b.depth <= KEEP_DEPTH);
// getPoint (not getPointAt): the cut is placed on the raw spline parameter.
const yCut = trunk.curve.getPoint(CUT_T).y;
// The cone chain starts on the arc-length parameter, and the boughs fork off
// on it too, so the two parameter spaces are compared in y, not t. A plane
// under the chain would leave a rounded sphere end as the mesh floor; one
// above the first fork would cut through boughs.
const chainStartY = trunk.curve.getPointAt(TRUNK_START_T).y;
const lowestForkY = Math.min(...primaries.map((b) => b.curve.getPoint(0).y));
if (!(yCut > chainStartY && yCut < lowestForkY)) {
  fail(
    `--cut-t ${CUT_T} puts the plane at y=${yCut.toFixed(3)}, outside the bare ` +
      `trunk (chain starts at y=${chainStartY.toFixed(3)}, lowest bough forks ` +
      `at y=${lowestForkY.toFixed(3)})`,
  );
}
console.log(
  `skeleton: ${allBranches.length} branches, ${kept.length} at depth <= ${KEEP_DEPTH}, ` +
    `cut at y=${yCut.toFixed(4)} (bare trunk spans y ${chainStartY.toFixed(3)}..${lowestForkY.toFixed(3)})`,
);

// ---------------------------------------------------------------------------
// 2. Branches to cone chains.
// ---------------------------------------------------------------------------
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// THREE.MathUtils.lerp, as BranchGeometryBuilder.append uses, so radii match
// to the last bit.
const lerp = THREE.MathUtils.lerp;
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Radius at parameter t, exactly as BranchGeometryBuilder.append computes
 *  it before the bark ridge is added. */
function branchRadius(branch, t) {
  const depthFactor = clamp01(branch.depth / 4);
  const taperT = Math.pow(t, 0.82 - depthFactor * 0.2);
  const flare =
    branch.depth <= 1
      ? 1 + (1 - smoothstep(0, 0.22, t)) * (branch.depth === 0 ? 0.45 : 0.22)
      : 1;
  const pinch = branch.terminal ? smoothstep(0.68, 1, t) * 0.58 : 0;
  return Math.max(
    branch.terminal ? 0.006 : 0.003,
    lerp(branch.baseRadius, branch.tipRadius, taperT) * flare * (1 - pinch),
  );
}

const radiusFloor = RADIUS_FLOOR_CELLS * CELL;
const stopRadius = STOP_RADIUS_CELLS * CELL;
/** Each cone: {a, b: Vector3, r1, r2}. */
const cones = [];
/** Kept branches that produced at least one cone. A branch already thinner
 *  than stopRadius at its base gives one sample and no cone, and is not in
 *  the mesh, so it is not counted as kept either. */
const skinned = [];
let trimmedBranches = 0;
for (const branch of kept) {
  const tubular =
    TUBULAR_SEGMENTS_BY_DEPTH[
      Math.min(branch.depth, TUBULAR_SEGMENTS_BY_DEPTH.length - 1)
    ];
  const steps = tubular * 2;
  const tStart = branch.depth === 0 ? TRUNK_START_T : 0;
  const samples = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = tStart + (1 - tStart) * (i / steps);
    const raw = branchRadius(branch, t);
    if (raw < stopRadius && i > 0) {
      trimmedBranches += 1;
      break;
    }
    samples.push({
      p: branch.curve.getPointAt(t, new THREE.Vector3()),
      r: Math.max(raw, radiusFloor),
    });
  }
  if (samples.length < 2) continue;
  skinned.push(branch);
  for (let i = 1; i < samples.length; i += 1) {
    cones.push({
      a: samples[i - 1].p,
      b: samples[i].p,
      r1: samples[i - 1].r,
      r2: samples[i].r,
    });
  }
}
if (!skinned.includes(trunk)) fail("the trunk produced no cones");
const byDepth = {};
for (const b of skinned) byDepth[b.depth] = (byDepth[b.depth] ?? 0) + 1;
console.log(
  `cones: ${cones.length} from ${skinned.length} of ${kept.length} branches ` +
    `(${JSON.stringify(byDepth)}; ${trimmedBranches} ended early under ` +
    `r<${stopRadius.toFixed(3)}, ${kept.length - skinned.length} too thin to skin)`,
);

// ---------------------------------------------------------------------------
// 3. Sample the distance field.
// ---------------------------------------------------------------------------
const bboxMin = new THREE.Vector3(Infinity, Infinity, Infinity);
const bboxMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
for (const c of cones) {
  for (const [p, r] of [
    [c.a, c.r1],
    [c.b, c.r2],
  ]) {
    bboxMin.x = Math.min(bboxMin.x, p.x - r);
    bboxMin.y = Math.min(bboxMin.y, p.y - r);
    bboxMin.z = Math.min(bboxMin.z, p.z - r);
    bboxMax.x = Math.max(bboxMax.x, p.x + r);
    bboxMax.y = Math.max(bboxMax.y, p.y + r);
    bboxMax.z = Math.max(bboxMax.z, p.z + r);
  }
}
// Everything under the cut is outside, so the grid starts just below it.
// The half-cell shift keeps the plane off a grid line, where every corner
// on it would sit at exactly zero.
const pad = PADDING_CELLS * CELL;
const origin = new THREE.Vector3(
  bboxMin.x - pad,
  yCut - pad - CELL / 2,
  bboxMin.z - pad,
);
const nx = Math.ceil((bboxMax.x + pad - origin.x) / CELL) + 1;
const ny = Math.ceil((bboxMax.y + pad - origin.y) / CELL) + 1;
const nz = Math.ceil((bboxMax.z + pad - origin.z) / CELL) + 1;
const nxy = nx * ny;
const cornerCount = nx * ny * nz;
const field = new Float32Array(cornerCount).fill(FAR_FIELD_CELLS * CELL);
console.log(`grid: ${nx} x ${ny} x ${nz} corners at cell ${CELL}`);

/** Signed distance to a round cone (Inigo Quilez), with the degenerate case
 *  (one end sphere swallowing the other) reduced to the bigger sphere. */
function makeConeSdf(cone) {
  const ax = cone.a.x;
  const ay = cone.a.y;
  const az = cone.a.z;
  const bax = cone.b.x - ax;
  const bay = cone.b.y - ay;
  const baz = cone.b.z - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = cone.r1 - cone.r2;
  const a2 = l2 - rr * rr;
  if (a2 <= 0 || l2 < 1e-12) {
    const big = cone.r1 >= cone.r2 ? cone.a : cone.b;
    const r = Math.max(cone.r1, cone.r2);
    return (px, py, pz) => Math.hypot(px - big.x, py - big.y, pz - big.z) - r;
  }
  const il2 = 1 / l2;
  const r1 = cone.r1;
  const r2 = cone.r2;
  return (px, py, pz) => {
    const pax = px - ax;
    const pay = py - ay;
    const paz = pz - az;
    const y = pax * bax + pay * bay + paz * baz;
    const z = y - l2;
    const xx = pax * l2 - bax * y;
    const xy = pay * l2 - bay * y;
    const xz = paz * l2 - baz * y;
    const x2 = xx * xx + xy * xy + xz * xz;
    const y2 = y * y * l2;
    const z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  };
}

const cellIndexFloor = (v, o) => Math.floor((v - o) / CELL);
const cellIndexCeil = (v, o) => Math.ceil((v - o) / CELL);
for (const cone of cones) {
  const sdf = makeConeSdf(cone);
  const reach = Math.max(cone.r1, cone.r2) + PADDING_CELLS * CELL;
  const lo = new THREE.Vector3().copy(cone.a).min(cone.b).subScalar(reach);
  const hi = new THREE.Vector3().copy(cone.a).max(cone.b).addScalar(reach);
  const i0 = Math.max(0, cellIndexFloor(lo.x, origin.x));
  const j0 = Math.max(0, cellIndexFloor(lo.y, origin.y));
  const k0 = Math.max(0, cellIndexFloor(lo.z, origin.z));
  const i1 = Math.min(nx - 1, cellIndexCeil(hi.x, origin.x));
  const j1 = Math.min(ny - 1, cellIndexCeil(hi.y, origin.y));
  const k1 = Math.min(nz - 1, cellIndexCeil(hi.z, origin.z));
  for (let k = k0; k <= k1; k += 1) {
    const pz = origin.z + k * CELL;
    for (let j = j0; j <= j1; j += 1) {
      const py = origin.y + j * CELL;
      let idx = i0 + nx * (j + ny * k);
      for (let i = i0; i <= i1; i += 1, idx += 1) {
        const d = sdf(origin.x + i * CELL, py, pz);
        if (d < field[idx]) field[idx] = d;
      }
    }
  }
}
// Intersect with the half-space above the cut. Inside the trunk the plane
// term wins wherever it is nearer than the bark, so the face comes out flat
// to within float rounding; only the rim rounds off.
for (let k = 0, idx = 0; k < nz; k += 1) {
  for (let j = 0; j < ny; j += 1) {
    const plane = yCut - (origin.y + j * CELL);
    for (let i = 0; i < nx; i += 1, idx += 1) {
      let f = field[idx];
      if (plane > f) f = plane;
      // A value at (or within rounding of) zero would put a vertex on a
      // corner shared by four cells, which the per-edge cache cannot
      // represent, and sliver triangles between its copies.
      if (Math.abs(f) < 1e-6) f = 1e-6;
      field[idx] = f;
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Marching cubes.
//
// Corner and edge numbering follow Bourke's tables, which three.js ships:
// corners 0-3 ring the z=0 face (x, x+1, x+1 y+1, y+1), 4-7 the z=1 face.
// Each vertex is keyed by (lower grid corner, axis) of its edge so the
// four cells that share an edge reuse one vertex.
// ---------------------------------------------------------------------------
const CORNER_OFFSET = [
  0,
  1,
  1 + nx,
  nx,
  nxy,
  1 + nxy,
  1 + nx + nxy,
  nx + nxy,
];
/** Edge e runs from corner EDGE_LOW[e] to EDGE_HIGH[e] along EDGE_AXIS[e]. */
const EDGE_LOW = [0, 1, 3, 0, 4, 5, 7, 4, 0, 1, 2, 3];
const EDGE_HIGH = [1, 2, 2, 3, 5, 6, 6, 7, 4, 5, 6, 7];
const EDGE_AXIS = [0, 1, 0, 1, 0, 1, 0, 1, 2, 2, 2, 2];

const vertexOfEdge = new Int32Array(cornerCount * 3).fill(-1);
const positions = []; // local space, flat xyz
const gradients = []; // field gradient at the vertex, flat xyz
const indices = [];

function gradientAt(corner, out) {
  const i = corner % nx;
  const j = Math.floor(corner / nx) % ny;
  const k = Math.floor(corner / nxy);
  const ip = corner + (i + 1 < nx ? 1 : 0);
  const im = corner - (i > 0 ? 1 : 0);
  const jp = corner + (j + 1 < ny ? nx : 0);
  const jm = corner - (j > 0 ? nx : 0);
  const kp = corner + (k + 1 < nz ? nxy : 0);
  const km = corner - (k > 0 ? nxy : 0);
  out[0] = field[ip] - field[im];
  out[1] = field[jp] - field[jm];
  out[2] = field[kp] - field[km];
}

const gLow = [0, 0, 0];
const gHigh = [0, 0, 0];
function vertexOnEdge(cellCorner, edge) {
  const low = cellCorner + CORNER_OFFSET[EDGE_LOW[edge]];
  const high = cellCorner + CORNER_OFFSET[EDGE_HIGH[edge]];
  const axis = EDGE_AXIS[edge];
  const key = low * 3 + axis;
  const cached = vertexOfEdge[key];
  if (cached >= 0) return cached;
  const f0 = field[low];
  const f1 = field[high];
  const s = f0 / (f0 - f1);
  const i = low % nx;
  const j = Math.floor(low / nx) % ny;
  const k = Math.floor(low / nxy);
  const p = [origin.x + i * CELL, origin.y + j * CELL, origin.z + k * CELL];
  p[axis] += s * CELL;
  gradientAt(low, gLow);
  gradientAt(high, gHigh);
  const id = positions.length / 3;
  positions.push(p[0], p[1], p[2]);
  gradients.push(
    lerp(gLow[0], gHigh[0], s),
    lerp(gLow[1], gHigh[1], s),
    lerp(gLow[2], gHigh[2], s),
  );
  vertexOfEdge[key] = id;
  return id;
}

for (let k = 0; k < nz - 1; k += 1) {
  for (let j = 0; j < ny - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const corner = i + nx * (j + ny * k);
      let cube = 0;
      for (let c = 0; c < 8; c += 1) {
        if (field[corner + CORNER_OFFSET[c]] < 0) cube |= 1 << c;
      }
      if (edgeTable[cube] === 0) continue;
      const row = cube * 16;
      for (let t = 0; triTable[row + t] !== -1; t += 3) {
        indices.push(
          vertexOnEdge(corner, triTable[row + t]),
          vertexOnEdge(corner, triTable[row + t + 1]),
          vertexOnEdge(corner, triTable[row + t + 2]),
        );
      }
    }
  }
}

const vertexCount = positions.length / 3;
const triangleCount = indices.length / 3;
console.log(`marching cubes: ${vertexCount} vertices, ${triangleCount} triangles`);
if (triangleCount > MAX_TRIANGLES) {
  fail(`${triangleCount} triangles is over the ${MAX_TRIANGLES} budget; raise --cell`);
}

// ---------------------------------------------------------------------------
// 5. Into the intro's frame, with normals.
// ---------------------------------------------------------------------------
function signedVolume(pos, idx) {
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
    v +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return v;
}

// The tables' winding depends on which side counts as inside; settle it
// by the sign of the enclosed volume instead of trusting a convention.
if (signedVolume(positions, indices) < 0) {
  for (let t = 0; t < indices.length; t += 3) {
    const b = indices[t + 1];
    indices[t + 1] = indices[t + 2];
    indices[t + 2] = b;
  }
  console.log("winding: flipped to outward");
}

// The intro's group transform minus its translation: rotation.y then the
// baked non-uniform scale, as three composes them (scale first, then yaw).
const frame = new THREE.Matrix4()
  .makeRotationY(TREE_TUNING_DEFAULT.rotY)
  .multiply(
    new THREE.Matrix4().makeScale(
      TREE_BASE_SCALE.x,
      TREE_BASE_SCALE.y,
      TREE_BASE_SCALE.z,
    ),
  );
const frameNormal = new THREE.Matrix3().getNormalMatrix(frame);

const outPositions = new Float32Array(vertexCount * 3);
const outNormals = new Float32Array(vertexCount * 3);
const v = new THREE.Vector3();
for (let i = 0; i < vertexCount; i += 1) {
  v.fromArray(positions, i * 3).applyMatrix4(frame);
  outPositions[i * 3] = v.x;
  outPositions[i * 3 + 1] = v.y;
  outPositions[i * 3 + 2] = v.z;
}

// Area-weighted face normals as the fallback where the field gradient is
// zero (it cannot be at a crossing, but a max() of two fields can pinch).
const faceNormals = new Float32Array(vertexCount * 3);
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();
const pc = new THREE.Vector3();
for (let t = 0; t < indices.length; t += 3) {
  pa.fromArray(outPositions, indices[t] * 3);
  pb.fromArray(outPositions, indices[t + 1] * 3);
  pc.fromArray(outPositions, indices[t + 2] * 3);
  e1.subVectors(pb, pa);
  e2.subVectors(pc, pa);
  e1.cross(e2);
  for (let c = 0; c < 3; c += 1) {
    const base = indices[t + c] * 3;
    faceNormals[base] += e1.x;
    faceNormals[base + 1] += e1.y;
    faceNormals[base + 2] += e1.z;
  }
}

let fallbackNormals = 0;
for (let i = 0; i < vertexCount; i += 1) {
  v.fromArray(gradients, i * 3).applyMatrix3(frameNormal);
  if (v.lengthSq() < 1e-18) {
    v.fromArray(faceNormals, i * 3);
    fallbackNormals += 1;
  }
  v.normalize();
  outNormals[i * 3] = v.x;
  outNormals[i * 3 + 1] = v.y;
  outNormals[i * 3 + 2] = v.z;
}
const outIndices = new Uint32Array(indices);
console.log(`normals: ${fallbackNormals} from face areas, rest from the field`);

// ---------------------------------------------------------------------------
// 6. Self-checks on the mesh. Any failure exits non-zero; nothing is written
//    until these and the loader readback in section 8 have passed.
// ---------------------------------------------------------------------------
console.log("self-check:");
{
  let nan = 0;
  for (const a of [outPositions, outNormals]) {
    for (let i = 0; i < a.length; i += 1) if (!Number.isFinite(a[i])) nan += 1;
  }
  check(nan === 0, "positions and normals are finite");

  const directed = new Set();
  let duplicated = 0;
  for (let t = 0; t < outIndices.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = outIndices[t + e];
      const b = outIndices[t + ((e + 1) % 3)];
      const key = a * vertexCount + b;
      if (directed.has(key)) duplicated += 1;
      directed.add(key);
    }
  }
  check(duplicated === 0, "every directed edge is used exactly once");
  let unpaired = 0;
  for (const key of directed) {
    const a = Math.floor(key / vertexCount);
    const b = key % vertexCount;
    if (!directed.has(b * vertexCount + a)) unpaired += 1;
  }
  check(unpaired === 0, "every undirected edge is used exactly twice (closed)");

  const volume = signedVolume(outPositions, outIndices);
  check(volume > 0, `volume is positive (${volume.toFixed(4)} frame units^3)`);

  // Every vertex is referenced by construction (vertexOnEdge only runs
  // while a triangle is being emitted), so only connectivity is checked.
  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) parent[i] = i;
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let t = 0; t < outIndices.length; t += 3) {
    parent[find(outIndices[t + 1])] = find(outIndices[t]);
    parent[find(outIndices[t + 2])] = find(outIndices[t]);
  }
  const roots = new Set();
  for (let i = 0; i < vertexCount; i += 1) roots.add(find(i));
  check(roots.size === 1, `exactly one connected component (${roots.size})`);

  let minArea2 = Infinity;
  for (let t = 0; t < outIndices.length; t += 3) {
    pa.fromArray(outPositions, outIndices[t] * 3);
    pb.fromArray(outPositions, outIndices[t + 1] * 3);
    pc.fromArray(outPositions, outIndices[t + 2] * 3);
    e1.subVectors(pb, pa);
    e2.subVectors(pc, pa);
    minArea2 = Math.min(minArea2, e1.cross(e2).lengthSq());
  }
  check(
    minArea2 > 0,
    `no zero-area triangles (smallest area ${Math.sqrt(minArea2).toExponential(2)})`,
  );
}

// ---------------------------------------------------------------------------
// 7. Lay out the glTF + bin in memory, in the layout of public/model/thinker.
// ---------------------------------------------------------------------------
const bbox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < vertexCount; i += 1) {
  for (let c = 0; c < 3; c += 1) {
    const value = outPositions[i * 3 + c];
    bbox.min[c] = Math.min(bbox.min[c], value);
    bbox.max[c] = Math.max(bbox.max[c], value);
  }
}

const indexBytes = outIndices.byteLength;
const positionBytes = outPositions.byteLength;
const normalBytes = outNormals.byteLength;
const bin = new Uint8Array(indexBytes + positionBytes + normalBytes);
bin.set(new Uint8Array(outIndices.buffer), 0);
bin.set(new Uint8Array(outPositions.buffer), indexBytes);
bin.set(new Uint8Array(outNormals.buffer), indexBytes + positionBytes);

const gltf = {
  asset: {
    generator: "arbor-web scripts/bake-cherry.mjs",
    version: "2.0",
    extras: {
      source: "WeepingCherryGenerator in components/BareThreeCanvas.tsx",
      seed: SEED,
    },
  },
  scene: 0,
  scenes: [{ name: "Cherry_Scene", nodes: [0] }],
  nodes: [{ mesh: 0, name: "Cherry_Upper_Trunk" }],
  meshes: [
    {
      name: "Cherry_Upper_Trunk",
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }],
    },
  ],
  accessors: [
    {
      bufferView: 1,
      componentType: 5126,
      count: vertexCount,
      type: "VEC3",
      min: bbox.min,
      max: bbox.max,
    },
    { bufferView: 2, componentType: 5126, count: vertexCount, type: "VEC3" },
    { bufferView: 0, componentType: 5125, count: outIndices.length, type: "SCALAR" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: indexBytes, target: 34963 },
    { buffer: 0, byteOffset: indexBytes, byteLength: positionBytes, target: 34962 },
    {
      buffer: 0,
      byteOffset: indexBytes + positionBytes,
      byteLength: normalBytes,
      target: 34962,
    },
  ],
  buffers: [{ byteLength: bin.byteLength, uri: "scene.bin" }],
};

// ---------------------------------------------------------------------------
// 8. Read it back through the site's own loader, before anything is written.
//
// loadThinkerGeometry fetches the gltf and its bin; here fetch is served from
// memory. What comes back is what the stage will hold, so the normalised
// numbers in cherry-meta.json are measured from it rather than predicted.
// ---------------------------------------------------------------------------
const gltfText = JSON.stringify(gltf, null, 2) + "\n";
const SERVED_GLTF = "/model/cherry/scene.gltf";
const served = new Map([
  [SERVED_GLTF, new TextEncoder().encode(gltfText)],
  ["/model/cherry/scene.bin", bin],
]);
globalThis.fetch = async (url) => {
  const body = served.get(String(url));
  if (!body) return { ok: false, status: 404, statusText: `not served: ${url}` };
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(new TextDecoder().decode(body)),
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
};
const loaded = await loadThinkerGeometry(SERVED_GLTF);
const loadedPosition = loaded.getAttribute("position");
const loadedNormal = loaded.getAttribute("normal");
const loadedIndex = loaded.getIndex();
const normalizedBox = loaded.boundingBox;
check(
  loadedPosition?.count === vertexCount && loadedNormal?.count === vertexCount,
  `loader read ${loadedPosition?.count} vertices with normals`,
);
check(
  loadedIndex?.count === triangleCount * 3,
  `loader read ${(loadedIndex?.count ?? 0) / 3} triangles`,
);
{
  let mismatch = 0;
  let maxIndex = 0;
  for (let i = 0; i < outIndices.length; i += 1) {
    const value = loadedIndex.getX(i);
    maxIndex = Math.max(maxIndex, value);
    if (value !== outIndices[i]) mismatch += 1;
  }
  check(mismatch === 0 && maxIndex === vertexCount - 1, "loader indices match what was baked");
  let nonFinite = 0;
  for (const attribute of [loadedPosition, loadedNormal]) {
    for (const value of attribute.array) if (!Number.isFinite(value)) nonFinite += 1;
  }
  check(nonFinite === 0, "loaded positions and normals are finite");
}

// normalizeGeometry recentres the mesh and scales its longest side to a fixed
// length; recover that scale from what it produced and confirm every vertex
// went through it as expected.
const size = bbox.max.map((hi, c) => hi - bbox.min[c]);
const center = bbox.max.map((hi, c) => (hi + bbox.min[c]) / 2);
const normalizedSize = normalizedBox.getSize(new THREE.Vector3()).toArray();
const normalizedScale = Math.max(...normalizedSize) / Math.max(...size);
{
  let maxError = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      const expected = (outPositions[i * 3 + c] - center[c]) * normalizedScale;
      maxError = Math.max(maxError, Math.abs(expected - loadedPosition.array[i * 3 + c]));
    }
  }
  check(
    maxError < 1e-4,
    `loader recentred and rescaled the mesh (scale ${normalizedScale.toFixed(4)}, ` +
      `max error ${maxError.toExponential(2)})`,
  );
}

// The cut face must be the lowest thing in the mesh, so that after
// normalisation the bbox floor IS the cut plane, which is what the stage
// stands the tree on. Checked, not assumed: the guard on --cut-t keeps the
// plane inside the bare trunk, and this confirms the plane won.
const yCutFrame = new THREE.Vector3(0, yCut, 0).applyMatrix4(frame).y;
check(
  Math.abs(bbox.min[1] - yCutFrame) < 1e-4,
  `the flat cut is the mesh floor (y ${bbox.min[1].toFixed(4)} vs plane ${yCutFrame.toFixed(4)})`,
);

const meta = {
  source: "WeepingCherryGenerator (components/BareThreeCanvas.tsx), skeleton phases only",
  settings: {
    seed: SEED,
    cutT: CUT_T,
    keptDepth: KEEP_DEPTH,
    cell: CELL,
    trunkStartT: TRUNK_START_T,
    radiusFloor,
    stopRadius,
    frame: { rotY: TREE_TUNING_DEFAULT.rotY, scale: { ...TREE_BASE_SCALE } },
  },
  branches: { total: allBranches.length, kept: skinned.length, byDepth, cones: cones.length },
  vertexCount,
  triangleCount,
  volume: signedVolume(outPositions, outIndices),
  yCut: { local: yCut, frame: yCutFrame },
  bbox,
  // As loadThinkerGeometry hands the mesh to the stage.
  normalized: {
    scale: normalizedScale,
    center,
    cutPlaneY: normalizedBox.min.y,
    bbox: { min: normalizedBox.min.toArray(), max: normalizedBox.max.toArray() },
  },
};

// ---------------------------------------------------------------------------
// 9. Write glTF + bin + meta. Everything above has passed.
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const gltfPath = resolve(OUT_DIR, "scene.gltf");
const binPath = resolve(OUT_DIR, "scene.bin");
const metaPath = resolve(OUT_DIR, "cherry-meta.json");
writeFileSync(gltfPath, gltfText);
writeFileSync(binPath, bin);
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");

// ---------------------------------------------------------------------------
// 10. Report.
// ---------------------------------------------------------------------------
const f4 = (n) => n.toFixed(4);
console.log(
  `bbox (frame): [${bbox.min.map(f4)}] .. [${bbox.max.map(f4)}]  size [${size.map(f4)}]`,
);
console.log(
  `normalized: scale ${f4(normalizedScale)}, cut plane at y=${f4(meta.normalized.cutPlaneY)} ` +
    `(bbox y ${f4(meta.normalized.bbox.min[1])} .. ${f4(meta.normalized.bbox.max[1])})`,
);
console.log(
  `files: scene.gltf ${statSync(gltfPath).size} B, scene.bin ${statSync(binPath).size} B, ` +
    `cherry-meta.json ${statSync(metaPath).size} B`,
);

// Coarse front view (x across, y up) so a broken bake is obvious in the log.
{
  const cols = 72;
  const rows = 30;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(" "));
  const span = Math.max(size[0], size[1]);
  for (let i = 0; i < vertexCount; i += 1) {
    const x = (outPositions[i * 3] - center[0]) / span + 0.5;
    const y = (outPositions[i * 3 + 1] - center[1]) / span + 0.5;
    const col = Math.min(cols - 1, Math.floor(x * cols));
    const row = Math.min(rows - 1, Math.floor((1 - y) * rows));
    grid[row][col] = "#";
  }
  console.log("silhouette (x/y):");
  for (const line of grid) console.log("  |" + line.join("") + "|");
}
console.log(`done in ${((performance.now() - wallStart) / 1000).toFixed(2)} s`);
