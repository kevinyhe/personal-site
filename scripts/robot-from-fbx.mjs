// Build public/model/robot/robot.glb + robot-meta.json from the Fusion 360
// FBX export "sexy s bot.fbx". This is the current robot pipeline; it
// supersedes scripts/extract-robot.mjs, which reverse-engineered the same
// design out of the .f3z archive and got the assembly only approximately
// right. Fusion's own FBX export bakes the joint-solved on-screen positions
// into the node transforms, so this file IS the assembled robot, with the
// component names and appearance colors from the Fusion browser tree.
//
// Run manually from the repo root (the FBX is untracked and must be present):
//   node scripts/robot-from-fbx.mjs ["path/to/sexy s bot.fbx"]
//
// What it does:
//   1. Parse the FBX with three's FBXLoader (binary FBX 7.x). The scene is
//      Z-up with the floor at z ~ 0 and measures in inches (the robot spans
//      ~18in, the VEX size limit). 504 mesh nodes share 140 geometries;
//      5.4M source triangles.
//   2. Every part that has to turn on screen is named in the tree and is
//      pulled out of the chassis into its own node: the four "325_AS_Omni"
//      drive wheels, the gears bolted to those wheels ("drive"), and the
//      intake rollers and sprockets that carry a ball up to the indexer
//      ("intake"). See PART_TYPES below. Everything else is welded into one
//      chassis mesh, which is why it cannot move.
//   3. Simplify each unique (geometry, color) part once in its local frame
//      with meshoptimizer, with error bounds kept below sheet-metal wall
//      thickness, then instance through the world matrices. A few budget
//      passes shrink per-part targets until the instanced total fits the cap.
//   4. Reframe to the site's robot frame: +Z forward (= Fusion +Y, same
//      choice as the old pipeline), +Y up, ground plane at y = 0 (the plane
//      the wheels touch), length scaled to exactly 1.6 units.
//   5. Write a GLB: a "robot" root (meta in extras), a "chassis" mesh with
//      one primitive per Fusion appearance color, four wheel nodes sharing
//      one wheel mesh, and one node per extracted gear/roller. Every one of
//      those is pre-pivoted, so node.rotation.x spins it about its axle.
//      Materials are MeshStandardMaterial-compatible:
//      baseColorFactor straight from the Fusion appearance color,
//      metallic/roughness guessed from the appearance name.

import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { MeshoptSimplifier } from "meshoptimizer/meshopt_simplifier.module.js";

const SRC = process.argv[2] ?? path.resolve("sexy s bot.fbx");
const OUT_DIR = path.resolve("public/model/robot");
const t0 = Date.now();

// Rendered-triangle budget. These are ceilings that should NOT bind: the
// per-part error bounds below are what decides quality, and the budget
// only exists to catch a runaway. Squeezing the whole robot into 149k
// (an earlier setting) meant a further 3.4x decimation on top of those
// bounds, which bent flat channel walls and rounded off the square holes.
// Vertex data is quantized on the way out, so ~600k triangles is a ~6 MB
// file.
const CAP_CHASSIS = 800000;
const CAP_WHEEL = 40000;
// Gears and rollers used to be welded into the chassis, where they were
// decoration and got the low "round part" target. They now move on screen, so
// they get a higher target (DETAIL_SPIN multiplies the target inside
// budgetedMesh) and a per-mesh ceiling of their own. Instances that share
// geometry AND orientation share one mesh, so the ceiling is on unique data.
const CAP_SPIN = 22000;
/**
 * How far in from the end of an indexer channel its hinge sits, inches —
 * roughly half a hole pitch, so the pivot lands in the last hole rather
 * than on the very tip of the metal.
 */
const INDEXER_HINGE_INSET = 0.25;
const DETAIL_SPIN = 2.5;

await MeshoptSimplifier.ready;

// ---------------------------------------------------------------------------
// Load.
// ---------------------------------------------------------------------------
const fileBuf = fs.readFileSync(SRC);
const ab = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);
const root = new FBXLoader().parse(ab, "");
root.updateMatrixWorld(true);

// ---------------------------------------------------------------------------
// Find every part that has to turn, by its Fusion component name.
//
// The names are three's PropertyBinding.sanitizeNodeName of the Fusion browser
// names, so spaces became underscores, and Fusion appends an occurrence number
// on top of that ("LS_36T_Gear_(Drilled)_v1" becomes "..._v11" ... "..._v110").
// Hence prefix matching. Several of these prefixes name an assembly that holds
// more named parts inside it: "48T_HS_Gear_(v2)" contains the 276-7573-001
// overmold ring, "half_flex_wheel" contains the half-flex tyre and its hex
// adapter, "30T_Sprocket_-_9P" contains the HS-bore sprocket. Only the outer
// prefix is listed; the whole subtree comes along.
//
// `count` is what the current FBX has. It is asserted so that a Fusion re-export
// that renames or drops a part fails the build instead of silently shipping a
// gear that no longer spins.
// ---------------------------------------------------------------------------
const PART_TYPES = [
  // The four 3.25in omni drive wheels, one per corner.
  { cap: CAP_WHEEL, category: "wheel", count: 4, detail: 1, prefix: "325_AS_Omni" },
  // Bolted to the drive wheels or geared to them: these turn with the drive.
  { cap: CAP_SPIN, category: "drive", count: 10, detail: DETAIL_SPIN, prefix: "LS_36T_Gear_(Drilled)" },
  { cap: CAP_SPIN, category: "drive", count: 4, detail: DETAIL_SPIN, prefix: "48T_HS_Gear_(v2)" },
  // Front lip rollers that pick a ball off the floor.
  { cap: CAP_SPIN, category: "intake", count: 8, detail: DETAIL_SPIN, prefix: "half_flex_wheel" },
  // Top indexer rollers that push the ball out.
  { cap: CAP_SPIN, category: "intake", count: 2, detail: DETAIL_SPIN, prefix: "2_Flex_Wheel_-_30A_v1" },
  { cap: CAP_SPIN, category: "intake", count: 2, detail: DETAIL_SPIN, prefix: "1625_Flex_Wheel_-_30A_v1" },
  { cap: CAP_SPIN, category: "intake", count: 1, detail: DETAIL_SPIN, prefix: "8T_Sprocket_-_6P" },
  // The tower run that carries the ball from the lip up to the indexer.
  { cap: CAP_SPIN, category: "intake", count: 3, detail: DETAIL_SPIN, prefix: "16T_Sprocket_-_6P" },
  { cap: CAP_SPIN, category: "intake", count: 2, detail: DETAIL_SPIN, prefix: "30T_Sprocket_-_9P" },
  { cap: CAP_SPIN, category: "intake", count: 2, detail: DETAIL_SPIN, prefix: "32T_Sprocket_-_6P" },
  // Motor-side gears driving that run. Fusion gave these two a GUID suffix and
  // a leading underscore, which is why they do not match the drive prefixes.
  { cap: CAP_SPIN, category: "intake", count: 1, detail: DETAIL_SPIN, prefix: "_24T_HS_Gear" },
  { cap: CAP_SPIN, category: "intake", count: 1, detail: DETAIL_SPIN, prefix: "_LS_36T_Gear4" },
  // The indexer: the pieces that hold a ball back at the top of the tower
  // until it is time to score. These do NOT turn — they lift out of the
  // way — so the stage treats this category differently from "intake".
  { cap: CAP_SPIN, category: "indexer", count: 2, detail: DETAIL_SPIN, prefix: "1x1_Thin_5x_Half-C_Alu_v1" },
  { cap: CAP_SPIN, category: "indexer", count: 1, detail: DETAIL_SPIN, prefix: "Component222" },
];

// Longest match wins, so a prefix that is itself the start of a longer one
// cannot steal that type's occurrences.
function typeOf(name) {
  let best = null;
  for (const t of PART_TYPES) {
    if (!name.startsWith(t.prefix)) continue;
    if (!best || t.prefix.length > best.prefix.length) best = t;
  }
  return best;
}
// traverse() visits parents before children, so skipping nodes that have any
// matching ancestor leaves exactly the outermost wrapper of each occurrence.
const occurrencesOf = new Map(PART_TYPES.map((t) => [t, []]));
const extractedMeshSet = new Set();
root.traverse((o) => {
  const t = typeOf(o.name);
  if (!t) return;
  for (let p = o.parent; p; p = p.parent) if (typeOf(p.name)) return;
  const meshes = [];
  o.traverse((c) => {
    if (!c.isMesh) return;
    meshes.push(c);
    extractedMeshSet.add(c);
  });
  occurrencesOf.get(t).push({ group: o, meshes });
});
const countMismatch = PART_TYPES.filter((t) => occurrencesOf.get(t).length !== t.count);
for (const t of PART_TYPES) {
  const got = occurrencesOf.get(t).length;
  console.log(`${t.category} "${t.prefix}": ${got} occurrence(s)${got === t.count ? "" : ` -- expected ${t.count}`}`);
}
if (countMismatch.length) {
  throw new Error(
    "part occurrence counts changed: " +
      countMismatch.map((t) => `"${t.prefix}" expected ${t.count}, found ${occurrencesOf.get(t).length}`).join("; "),
  );
}
const wheelType = PART_TYPES[0];
const wheelMeshesOf = occurrencesOf.get(wheelType).map((o) => o.meshes);

// ---------------------------------------------------------------------------
// Measure the wheels from the raw (unsimplified) vertices in world space:
// center, bounds, and the floor plane they touch.
// ---------------------------------------------------------------------------
const v = new THREE.Vector3();
function worldBox(meshes) {
  const box = new THREE.Box3();
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
  }
  return box;
}
// Outer radius about an axle through `center` running along model X. Taken
// from the vertices rather than the bounding box because a gear's box depends
// on how its teeth happen to be clocked, and two copies of the same gear at
// different clockings must come out with the same radius.
function worldRadius(meshes, center) {
  let r2 = 0;
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      const d = (v.y - center.y) ** 2 + (v.z - center.z) ** 2;
      if (d > r2) r2 = d;
    }
  }
  return Math.sqrt(r2);
}
const wheelBoxes = wheelMeshesOf.map(worldBox);
const wheelCenters = wheelBoxes.map((b) => b.getCenter(new THREE.Vector3()));
const floorZ = Math.min(...wheelBoxes.map((b) => b.min.z));
for (const b of wheelBoxes) {
  const s = b.getSize(new THREE.Vector3());
  // the axle must run along model X (the thin axis of the wheel assembly)
  if (!(s.x < s.y * 0.6 && s.x < s.z * 0.6)) {
    throw new Error(`wheel assembly not thin along X: size ${s.toArray().map((n) => n.toFixed(2))}`);
  }
}
const wheelRadii = wheelCenters.map((c) => c.z - floorZ);
const radSpread = (Math.max(...wheelRadii) - Math.min(...wheelRadii)) / Math.max(...wheelRadii);
if (radSpread > 0.05) throw new Error(`wheel radii differ by ${(radSpread * 100).toFixed(1)}%`);
console.log(
  "wheels:",
  wheelCenters.map((c, i) => `(${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}) r=${wheelRadii[i].toFixed(2)}`).join("  "),
);
console.log("floor z (in):", floorZ.toFixed(3));

// ---------------------------------------------------------------------------
// Materials: group everything by Fusion appearance color. Several appearance
// names share one color (e.g. "Opaque(37,40,42)" and "Body" are both the VEX
// dark plastic); each color becomes one glTF material, and the appearance
// name seen on the most triangles picks its metallic/roughness.
// ---------------------------------------------------------------------------
function matStyle(name) {
  const n = name.toLowerCase();
  if (/rubber|tire|flex/.test(n)) return { metallicFactor: 0, roughnessFactor: 0.95 };
  if (/alumin|steel|bronze|silver|metal/.test(n)) return { metallicFactor: 0.85, roughnessFactor: 0.4 };
  return { metallicFactor: 0, roughnessFactor: 0.65 };
}
const colorReg = new Map(); // key -> { index, factor, names: Map(name -> tris) }
function colorKeyOf(mat) {
  const c = mat && mat.color ? mat.color : new THREE.Color(0.5, 0.5, 0.5);
  // material colors are already in three's linear working space, which is
  // exactly what baseColorFactor wants; quantize to merge float noise
  const q = (x) => Math.round(x * 1000) / 1000;
  return `${q(c.r)},${q(c.g)},${q(c.b)}`;
}
function registerColor(mat, tris) {
  const key = colorKeyOf(mat);
  let e = colorReg.get(key);
  if (!e) {
    const c = mat && mat.color ? mat.color : new THREE.Color(0.5, 0.5, 0.5);
    e = { factor: [c.r, c.g, c.b, 1], index: colorReg.size, names: new Map() };
    colorReg.set(key, e);
  }
  const name = mat && mat.name ? mat.name : "unnamed";
  e.names.set(name, (e.names.get(name) || 0) + tris);
  return key;
}

// ---------------------------------------------------------------------------
// Split each mesh into (geometry, color) slots. FBXLoader output is
// non-indexed triangle soup with geometry.groups selecting the material per
// vertex range.
// ---------------------------------------------------------------------------
function slotsOf(mesh) {
  const g = mesh.geometry;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const vertCount = g.index ? g.index.count : g.attributes.position.count;
  const groups = g.groups.length ? g.groups : [{ count: vertCount, materialIndex: 0, start: 0 }];
  const out = [];
  for (const gr of groups) {
    const start = gr.start;
    const count = Math.min(gr.count === Infinity ? vertCount - start : gr.count, vertCount - start);
    if (count <= 0) continue;
    const mat = mats[Math.max(0, gr.materialIndex ?? 0)] ?? mats[0];
    out.push({ colorKey: registerColor(mat, count / 3), count, geometry: g, start });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Welding, simplification, normals (same approach as the old pipeline).
// ---------------------------------------------------------------------------
function weld(soup, quant) {
  const key = new Map();
  const pos = [], idx = [];
  const np = soup.length / 3;
  for (let i = 0; i < np; i++) {
    const px = soup[i * 3], py = soup[i * 3 + 1], pz = soup[i * 3 + 2];
    const k = `${Math.round(px / quant)},${Math.round(py / quant)},${Math.round(pz / quant)}`;
    let n = key.get(k);
    if (n === undefined) {
      n = pos.length / 3;
      key.set(k, n);
      pos.push(px, py, pz);
    }
    idx.push(n);
  }
  return { idx: new Uint32Array(idx), pos: new Float32Array(pos) };
}
function dropDegenerate(mesh) {
  const out = [];
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const a = mesh.idx[t], b = mesh.idx[t + 1], c = mesh.idx[t + 2];
    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }
  mesh.idx = new Uint32Array(out);
  return mesh;
}
function simplify(mesh, targetTris, maxError) {
  const target = Math.max(3, targetTris) * 3;
  const [res] = MeshoptSimplifier.simplify(mesh.idx, mesh.pos, 3, target, maxError, []);
  return { idx: new Uint32Array(res), pos: mesh.pos };
}
function compact(mesh) {
  const remap = new Int32Array(mesh.pos.length / 3).fill(-1);
  const pos = [], idx = [];
  for (const i of mesh.idx) {
    if (remap[i] < 0) {
      remap[i] = pos.length / 3;
      pos.push(mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]);
    }
    idx.push(remap[i]);
  }
  return { idx: new Uint32Array(idx), pos: new Float32Array(pos) };
}
function computeNormals(mesh) {
  // area-weighted vertex normals: planar regions stay flat, fillets smooth
  const nrm = new Float32Array(mesh.pos.length);
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const a = mesh.idx[t] * 3, b = mesh.idx[t + 1] * 3, c = mesh.idx[t + 2] * 3;
    const ux = mesh.pos[b] - mesh.pos[a], uy = mesh.pos[b + 1] - mesh.pos[a + 1], uz = mesh.pos[b + 2] - mesh.pos[a + 2];
    const vx = mesh.pos[c] - mesh.pos[a], vy = mesh.pos[c + 1] - mesh.pos[a + 1], vz = mesh.pos[c + 2] - mesh.pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) {
      nrm[o] += nx;
      nrm[o + 1] += ny;
      nrm[o + 2] += nz;
    }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l;
    nrm[i + 1] /= l;
    nrm[i + 2] /= l;
  }
  mesh.nrm = nrm;
  return mesh;
}

// ---------------------------------------------------------------------------
// Parts: one welded local-frame mesh per (geometry, color slot), shared by
// every instance of that geometry. Sizes for the budget rules are in world
// units (inches), via the instance's world scale.
// ---------------------------------------------------------------------------
const partCache = new Map(); // "geomUuid|colorKey|start" -> part
function partFor(slot, worldScale) {
  const id = `${slot.geometry.uuid}|${slot.colorKey}|${slot.start}`;
  let p = partCache.get(id);
  if (p) return p;
  const g = slot.geometry;
  const posAttr = g.attributes.position;
  const soup = new Float32Array(slot.count * 3);
  if (g.index) {
    for (let i = 0; i < slot.count; i++) {
      const vi = g.index.getX(slot.start + i) * 3;
      soup[i * 3] = posAttr.array[vi];
      soup[i * 3 + 1] = posAttr.array[vi + 1];
      soup[i * 3 + 2] = posAttr.array[vi + 2];
    }
  } else {
    soup.set(posAttr.array.subarray(slot.start * 3, (slot.start + slot.count) * 3));
  }
  // local bounds for weld tolerance + budget rules
  let min = [1e30, 1e30, 1e30], max = [-1e30, -1e30, -1e30];
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (soup[i + k] < min[k]) min[k] = soup[i + k];
      if (soup[i + k] > max[k]) max[k] = soup[i + k];
    }
  }
  const dims = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const localMax = Math.max(...dims, 1e-6);
  const welded = dropDegenerate(weld(soup, localMax / 131072));
  const s = dims.slice().sort((a, b) => a - b);
  p = {
    maxDimIn: localMax * worldScale,
    raw: welded.idx.length / 3,
    // round part: two near-equal large dims, thin third (wheels, gears, ...)
    round: s[2] * worldScale > 1.2 && Math.abs(s[2] - s[1]) < s[2] * 0.08 && s[0] < s[2] * 0.45,
    welded,
  };
  partCache.set(id, p);
  return p;
}
// Budget rules, sizes in inches. Error bounds (fractions of the part's own
// extent) stay below sheet-metal wall thickness (~0.07in) so channels keep
// their walls; fastener-sized parts may collapse to blobs, invisible at the
// robot's on-screen size.
// `detail` multiplies the target for callers whose parts are not decoration.
// A gear welded into the chassis only has to read as a toothed disc; the same
// gear on its own node is watched turning, so it gets more teeth.
function budgetedMesh(part, scale2, detail) {
  const { maxDimIn, raw, welded } = part;
  let mesh;
  if (maxDimIn < 1.0) {
    mesh = simplify(welded, Math.max(48, Math.round(Math.min(raw, 320 * detail) * scale2)), 0.025);
  } else if (part.round) {
    // round parts: keep the silhouette, drop tread/tooth detail
    mesh = simplify(welded, Math.max(700, Math.round(6400 * detail * scale2)), 0.01);
  } else {
    const err = Math.min(0.015, 0.035 / maxDimIn);
    mesh = simplify(welded, Math.max(260, Math.round(Math.max(360, raw / 4) * detail * scale2)), err);
  }
  return compact(mesh);
}

// ---------------------------------------------------------------------------
// Chassis: every mesh that is not part of a drive wheel. Two-pass budget:
// measure at scale 1, then shrink per-part targets until the instanced total
// fits the cap.
// ---------------------------------------------------------------------------
const chassisInstances = []; // { slot, part, matrixWorld }
root.traverse((o) => {
  if (!o.isMesh || extractedMeshSet.has(o)) return;
  const worldScale = o.matrixWorld.getMaxScaleOnAxis();
  for (const slot of slotsOf(o)) {
    chassisInstances.push({ matrixWorld: o.matrixWorld, part: partFor(slot, worldScale), slot });
  }
});
function budgetLoop(instances, cap, label, detail = 1) {
  const meshCache = new Map(); // part -> simplified mesh
  let scale2 = 1;
  for (let pass = 0; pass < 7; pass++) {
    meshCache.clear();
    let total = 0;
    for (const inst of instances) {
      let mesh = meshCache.get(inst.part);
      if (!mesh) {
        mesh = budgetedMesh(inst.part, scale2, detail);
        meshCache.set(inst.part, mesh);
      }
      total += mesh.idx.length / 3;
    }
    console.log(label, "budget pass", pass, "scale", +scale2.toFixed(3), "instanced tris", total);
    if (total <= cap) break;
    scale2 *= (cap / total) * 0.96;
  }
  return meshCache;
}
const chassisMeshCache = budgetLoop(chassisInstances, CAP_CHASSIS, "chassis");

// ---------------------------------------------------------------------------
// One pre-pivoted mesh for a part that turns (a wheel, a gear, a roller).
// Vertices come out relative to `centerWorld` instead of the world origin, so
// the axle passes through the node origin along local +X and node.rotation.x
// spins it. Same rotation as mapPoint, applied to the offset from the centre:
// (-dx, dz, dy). Returns one primitive per Fusion appearance colour, in the
// unscaled inch frame -- the caller scales it with the rest of the robot.
// ---------------------------------------------------------------------------
function buildPartMesh(meshes, centerWorld, cap, detail, label) {
  const instances = [];
  for (const m of meshes) {
    const worldScale = m.matrixWorld.getMaxScaleOnAxis();
    for (const slot of slotsOf(m)) {
      instances.push({ matrixWorld: m.matrixWorld, part: partFor(slot, worldScale), slot });
    }
  }
  const meshCache = budgetLoop(instances, cap, label, detail);
  const vtx = new THREE.Vector3();
  const acc = new Map(); // colorKey -> { idx: [], pos: [] }
  for (const inst of instances) {
    const mesh = meshCache.get(inst.part);
    if (!mesh.idx.length) continue;
    let a = acc.get(inst.slot.colorKey);
    if (!a) {
      a = { idx: [], pos: [] };
      acc.set(inst.slot.colorKey, a);
    }
    const base = a.pos.length / 3;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      vtx.set(mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]).applyMatrix4(inst.matrixWorld);
      a.pos.push(-(vtx.x - centerWorld.x), vtx.z - centerWorld.z, vtx.y - centerWorld.y);
    }
    for (const i of mesh.idx) a.idx.push(base + i);
  }
  const prims = [];
  for (const [colorKey, a] of acc) {
    const soup = new Float32Array(a.idx.length * 3);
    for (let i = 0; i < a.idx.length; i++) {
      const vi = a.idx[i] * 3;
      soup[i * 3] = a.pos[vi];
      soup[i * 3 + 1] = a.pos[vi + 1];
      soup[i * 3 + 2] = a.pos[vi + 2];
    }
    prims.push({ colorKey, mesh: compact(dropDegenerate(weld(soup, 0.01))) });
  }
  return prims;
}


// ---------------------------------------------------------------------------
// Frame change. Model: +Z up (floor at z = floorZ), wheels roll along +Y,
// axles along X. Output: +Y up, +Z forward = model +Y (same forward choice
// as the old pipeline), ground at y = 0. glb = (-x, z - floorZ, y), a proper
// rotation, so triangle winding is preserved.
// ---------------------------------------------------------------------------
const mapPoint = (x, y, z) => [-x, z - floorZ, y];
// mapPoint is a rotation plus a translation, so dropping the translation gives
// the same map for directions. Every axle here runs along model X (asserted
// above and again per part below), and which end of an axle you call "the
// direction" is arbitrary, so the sign is normalised to point along glb +X.
const mapDirection = (x, y, z) => [-x, z, y];
const mappedAxle = mapDirection(1, 0, 0);
const wheelAxleDirection = mappedAxle.map((n) => n * (mappedAxle[0] < 0 ? -1 : 1) + 0);

// emit chassis, one position/index pair per color
const byColor = new Map(); // colorKey -> { pos: [], idx: [] }
const e0 = new THREE.Vector3();
for (const inst of chassisInstances) {
  const mesh = chassisMeshCache.get(inst.part);
  if (!mesh.idx.length) continue;
  let acc = byColor.get(inst.slot.colorKey);
  if (!acc) {
    acc = { idx: [], pos: [] };
    byColor.set(inst.slot.colorKey, acc);
  }
  const base = acc.pos.length / 3;
  for (let i = 0; i < mesh.pos.length; i += 3) {
    e0.set(mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]).applyMatrix4(inst.matrixWorld);
    acc.pos.push(...mapPoint(e0.x, e0.y, e0.z));
  }
  for (const i of mesh.idx) acc.idx.push(base + i);
}
// weld across part instances (~0.4mm) and shave what that frees up
const chassisPrims = [];
for (const [colorKey, acc] of byColor) {
  const soup = new Float32Array(acc.idx.length * 3);
  for (let i = 0; i < acc.idx.length; i++) {
    const vi = acc.idx[i] * 3;
    soup[i * 3] = acc.pos[vi];
    soup[i * 3 + 1] = acc.pos[vi + 1];
    soup[i * 3 + 2] = acc.pos[vi + 2];
  }
  const rewelded = dropDegenerate(weld(soup, 0.015));
  const shaved = compact(simplify(rewelded, Math.ceil((rewelded.idx.length / 3) * 0.94), 0.0015));
  chassisPrims.push({ colorKey, mesh: shaved });
}
chassisPrims.sort((a, b) => b.mesh.idx.length - a.mesh.idx.length);
const chassisTris = chassisPrims.reduce((s, p) => s + p.mesh.idx.length / 3, 0);
console.log("chassis tris after reweld:", chassisTris, "in", chassisPrims.length, "color primitives");

// ---------------------------------------------------------------------------
// Wheel mesh: built once from the first wheel assembly, shared by all four
// nodes, because the four omnis are the same part in the same orientation.
// ---------------------------------------------------------------------------
const wheelPrims = buildPartMesh(wheelMeshesOf[0], wheelCenters[0], wheelType.cap, wheelType.detail, "wheel");
const wheelTris = wheelPrims.reduce((s, p) => s + p.mesh.idx.length / 3, 0);
console.log("wheel tris:", wheelTris, "in", wheelPrims.length, "color primitives");

// ---------------------------------------------------------------------------
// The other spinning parts. Two occurrences may share a mesh only when their
// baked geometry is identical, which means the same source slots AND the same
// rotation and the same offset from the occurrence centre -- a mirrored or
// re-clocked copy has to get its own mesh, otherwise its teeth would point the
// wrong way. `signature` is exactly that: the slot ids plus each mesh's world
// rotation/scale and its position relative to the centre, rounded to 1e-4 in.
// ---------------------------------------------------------------------------
function signature(occ, center) {
  const rows = occ.meshes.map((m) => {
    const e = m.matrixWorld.elements;
    const r = [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]].map((n) => n.toFixed(4));
    const t = [e[12] - center.x, e[13] - center.y, e[14] - center.z].map((n) => n.toFixed(4));
    const slots = slotsOf(m).map((sl) => `${sl.geometry.uuid}:${sl.start}:${sl.count}:${sl.colorKey}`);
    return `${slots.join(",")}|${r.join(",")}|${t.join(",")}`;
  });
  rows.sort();
  return rows.join(";");
}
// Node names double as the key the runtime matches meta.parts on, so they have
// to be stable and unique: type slug plus the occurrence's index in the type.
const slugOf = (prefix) => prefix.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const spinMeshes = []; // { prims, tris }
const spinNodes = []; // { axleDirection, axis, category, meshIndex, name, radius, side, centerWorld, halfWidth }
const meshBySignature = new Map();
for (const type of PART_TYPES) {
  if (type.category === "wheel") continue;
  const slug = slugOf(type.prefix);
  occurrencesOf.get(type).forEach((occ, i) => {
    const box = worldBox(occ.meshes);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // The indexer channels are hinged, not spun: they swing about the last
    // hole at one END, the end away from the component that sits behind
    // them. Model +Y is forward and the component is the rearmost of the
    // three, so that is the +Y end of the channel, inset by half a hole
    // pitch so the pivot sits in the hole rather than off the tip.
    if (type.category === "indexer" && /Half-C/i.test(type.prefix)) {
      center.y = box.max.y - INDEXER_HINGE_INSET;
    }
    // Every one of these that SPINS turns on an axle along model X, the same
    // as the drive wheels. The bounding box of a disc on that axle is thinnest along X and
    // square across it, so check both. The square test is what actually pins
    // the axis down: an 8T sprocket is only 0.50in thick on a 0.74in circle,
    // so "much thinner along X" would not hold. Fail loudly rather than emit a
    // part that spins about the wrong axis.
    // ...but only the ones that actually turn. The indexer pieces are
    // plates, not discs: they lift out of the ball's way rather than
    // spinning, so there is no axle to check and this test would reject
    // them for being the wrong shape.
    if (type.category !== "indexer") {
      const across = Math.max(size.y, size.z);
      const flat = Math.min(size.y, size.z);
      if (!(size.x < flat && across - flat < across * 0.12)) {
        throw new Error(`${type.prefix}[${i}] axle is not along model X: size ${size.toArray().map((n) => n.toFixed(2))}`);
      }
    }
    const sig = `${type.prefix}|${signature(occ, center)}`;
    let meshIndex = meshBySignature.get(sig);
    if (meshIndex === undefined) {
      const prims = buildPartMesh(occ.meshes, center, type.cap, type.detail, `${slug}#${spinMeshes.length}`);
      meshIndex = spinMeshes.length;
      spinMeshes.push({ name: `${slug}_${meshIndex}`, prims, tris: prims.reduce((s, p) => s + p.mesh.idx.length / 3, 0) });
      meshBySignature.set(sig, meshIndex);
    }
    const [x, y, z] = mapPoint(center.x, center.y, center.z);
    spinNodes.push({
      // Pre-pivoted about the axle by buildPartMesh, so rotation.x is the spin.
      axis: "x",
      category: type.category,
      centerGlb: [x, y, z],
      meshIndex,
      name: `part_${type.category}_${slug}_${i}`,
      radiusIn: worldRadius(occ.meshes, center),
      side: Math.abs(x) < 1e-3 ? "center" : x < 0 ? "left" : "right",
    });
  });
}
const spinTris = spinNodes.reduce((s, n) => s + spinMeshes[n.meshIndex].tris, 0);
console.log(
  "spinning parts:",
  spinNodes.length,
  "nodes over",
  spinMeshes.length,
  "meshes;",
  spinMeshes.reduce((s, m) => s + m.tris, 0),
  "unique tris,",
  spinTris,
  "rendered",
);

// ---------------------------------------------------------------------------
// Normalize: forward extent (glb z) becomes exactly 1.6, centered along z;
// x stays where Fusion put it; y is already floored at 0.
// ---------------------------------------------------------------------------
let minB = [1e30, 1e30, 1e30], maxB = [-1e30, -1e30, -1e30];
for (const p of chassisPrims) {
  for (let i = 0; i < p.mesh.pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p.mesh.pos[i + k] < minB[k]) minB[k] = p.mesh.pos[i + k];
      if (p.mesh.pos[i + k] > maxB[k]) maxB[k] = p.mesh.pos[i + k];
    }
  }
}
for (let w = 0; w < 4; w++) {
  const [cx, cy, cz] = mapPoint(wheelCenters[w].x, wheelCenters[w].y, wheelCenters[w].z);
  const r = wheelRadii[w];
  minB = [Math.min(minB[0], cx - r), Math.min(minB[1], cy - r), Math.min(minB[2], cz - r)];
  maxB = [Math.max(maxB[0], cx + r), Math.max(maxB[1], cy + r), Math.max(maxB[2], cz + r)];
}
// The extracted parts are no longer inside chassisPrims, so they have to be
// added back here. Without this the robot's bounds -- and with them the 1.6
// length scale -- would shift the moment a front-lip roller left the chassis.
for (const n of spinNodes) {
  for (const prim of spinMeshes[n.meshIndex].prims) {
    const pos = prim.mesh.pos;
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const c = n.centerGlb[k] + pos[i + k];
        if (c < minB[k]) minB[k] = c;
        if (c > maxB[k]) maxB[k] = c;
      }
    }
  }
}
const lengthIn = maxB[2] - minB[2];
const scale = 1.6 / lengthIn;
const zMid = (minB[2] + maxB[2]) / 2;
console.log("bounds (in)", minB.map((n) => +n.toFixed(2)), maxB.map((n) => +n.toFixed(2)), "scale", +scale.toFixed(5));

for (const p of chassisPrims) {
  for (let i = 0; i < p.mesh.pos.length; i += 3) {
    p.mesh.pos[i] *= scale;
    p.mesh.pos[i + 1] *= scale;
    p.mesh.pos[i + 2] = (p.mesh.pos[i + 2] - zMid) * scale;
  }
  computeNormals(p.mesh);
}
// Wheel and part meshes are already centred on their own pivot, so all three
// axes just scale -- no zMid shift, which would take the pivot off the axle.
for (const p of wheelPrims) {
  for (let i = 0; i < p.mesh.pos.length; i += 3) {
    p.mesh.pos[i] *= scale;
    p.mesh.pos[i + 1] *= scale;
    p.mesh.pos[i + 2] *= scale;
  }
  computeNormals(p.mesh);
}
for (const m of spinMeshes) {
  for (const p of m.prims) {
    for (let i = 0; i < p.mesh.pos.length; i += 3) {
      p.mesh.pos[i] *= scale;
      p.mesh.pos[i + 1] *= scale;
      p.mesh.pos[i + 2] *= scale;
    }
    computeNormals(p.mesh);
  }
}
for (const n of spinNodes) {
  n.radius = n.radiusIn * scale;
  n.translation = [n.centerGlb[0] * scale, n.centerGlb[1] * scale, (n.centerGlb[2] - zMid) * scale];
}

const wheelNodes = wheelCenters.map((c, i) => {
  const [x, y, z] = mapPoint(c.x, c.y, c.z);
  const side = x < 0 ? "left" : "right";
  return {
    name: `wheel_${side}_${i}`,
    radius: wheelRadii[i] * scale,
    side,
    translation: [x * scale, y * scale, (z - zMid) * scale],
  };
});
const meta = {
  boundsSize: [maxB[0] - minB[0], maxB[1] - minB[1], lengthIn].map((n) => n * scale),
  length: 1.6,
  // One entry per extracted gear/roller node, in node order. `axis` is the
  // node-local axis to rotate about to spin the part; the geometry is
  // pre-pivoted so that is always "x", the same as the wheels.
  parts: spinNodes.map((n) => ({
    axis: n.axis,
    axlePosition: n.translation,
    category: n.category,
    name: n.name,
    radius: n.radius,
    side: n.side,
  })),
  wheels: wheelNodes.map((wn) => ({
    axleDirection: wheelAxleDirection,
    axlePosition: wn.translation,
    radius: wn.radius,
    side: wn.side,
  })),
};

// ---------------------------------------------------------------------------
// Materials: one per Fusion appearance color, style from the dominant
// appearance name for that color.
// ---------------------------------------------------------------------------
const colorIndex = new Map();
const materials = [];
for (const [key, e] of colorReg) {
  let bestName = "unnamed", bestTris = -1;
  for (const [n, t] of e.names) if (t > bestTris) { bestTris = t; bestName = n; }
  colorIndex.set(key, materials.length);
  materials.push({
    name: bestName,
    pbrMetallicRoughness: {
      baseColorFactor: e.factor.map((n) => +n.toFixed(4)),
      ...matStyle(bestName),
    },
  });
}

// ---------------------------------------------------------------------------
// GLB writer.
// ---------------------------------------------------------------------------
function writeGlb(filePath) {
  const buffers = [];
  let byteLength = 0;
  const accessors = [];
  const bufferViews = [];
  function addAccessor(arr, type, componentType, target) {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { buffers.push(Buffer.alloc(pad)); byteLength += pad; }
    bufferViews.push({ buffer: 0, byteLength: buf.byteLength, byteOffset: byteLength, target });
    buffers.push(buf);
    byteLength += buf.byteLength;
    const acc = {
      bufferView: bufferViews.length - 1,
      componentType,
      count: type === "SCALAR" ? arr.length : arr.length / 3,
      type,
    };
    if (type === "VEC3" && componentType === 5126) {
      const min = [1e30, 1e30, 1e30], max = [-1e30, -1e30, -1e30];
      for (let i = 0; i < arr.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          if (arr[i + k] < min[k]) min[k] = arr[i + k];
          if (arr[i + k] > max[k]) max[k] = arr[i + k];
        }
      }
      acc.min = min;
      acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  }
  // Vertex data is quantized (KHR_mesh_quantization): positions to 16-bit
  // integers over the mesh's own extent, normals to signed bytes. At this
  // triangle count the float32 buffers were the bulk of a 12 MB file, and
  // 16-bit positions still resolve about 0.0006 in on a robot this size —
  // far finer than the tessellation itself. The integer-to-real transform
  // has to live on the NODE, so each mesh gets one shared scale: the
  // chassis also takes an offset, while the wheel is quantized about a
  // range centred on its axle so its offset is zero and node translation
  // stays the true axle position (a non-zero offset there would be spun
  // around by rotation.x along with the wheel).
  function quantizePositions(list, centred) {
    let min = [1e30, 1e30, 1e30];
    let max = [-1e30, -1e30, -1e30];
    for (const p of list) {
      for (let i = 0; i < p.mesh.pos.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          if (p.mesh.pos[i + k] < min[k]) min[k] = p.mesh.pos[i + k];
          if (p.mesh.pos[i + k] > max[k]) max[k] = p.mesh.pos[i + k];
        }
      }
    }
    if (centred) {
      // Symmetric about the origin, so the decode offset is zero.
      const half = Math.max(...[0, 1, 2].map((k) => Math.max(-min[k], max[k])));
      min = [-half, -half, -half];
      max = [half, half, half];
    }
    // One uniform scale for all three axes keeps the decode a similarity
    // transform, so the byte normals stay correct without rescaling.
    const extent = Math.max(...[0, 1, 2].map((k) => max[k] - min[k]), 1e-9);
    const scale = extent / 65534;
    const offset = centred ? [0, 0, 0] : min.map((n) => n + extent / 2);
    return { offset, scale };
  }
  function addQuantizedPositions(mesh, q) {
    // Four components per vertex (the fourth unused) so each element is
    // 8 bytes and every accessor stays 4-byte aligned.
    const count = mesh.pos.length / 3;
    const out = new Int16Array(count * 4);
    const qmin = [32767, 32767, 32767];
    const qmax = [-32768, -32768, -32768];
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) {
        const v = Math.round((mesh.pos[i * 3 + k] - q.offset[k]) / q.scale);
        const c = Math.max(-32767, Math.min(32767, v));
        out[i * 4 + k] = c;
        if (c < qmin[k]) qmin[k] = c;
        if (c > qmax[k]) qmax[k] = c;
      }
    }
    const index = addAccessor(out, "VEC3", 5122, 34962);
    accessors[index].count = count;
    accessors[index].min = qmin;
    accessors[index].max = qmax;
    bufferViews[accessors[index].bufferView].byteStride = 8;
    return index;
  }
  function addByteNormals(mesh) {
    const count = mesh.nrm.length / 3;
    const out = new Int8Array(count * 4);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) {
        const v = Math.round(mesh.nrm[i * 3 + k] * 127);
        out[i * 4 + k] = Math.max(-127, Math.min(127, v));
      }
    }
    const index = addAccessor(out, "VEC3", 5120, 34962);
    accessors[index].count = count;
    accessors[index].normalized = true;
    bufferViews[accessors[index].bufferView].byteStride = 4;
    return index;
  }
  function addIndices(idx, vertexCount) {
    // 16-bit indices wherever the primitive has few enough vertices, which
    // after the per-colour split is all but the largest.
    if (vertexCount <= 65536) {
      return addAccessor(Uint16Array.from(idx), "SCALAR", 5123, 34963);
    }
    return addAccessor(idx, "SCALAR", 5125, 34963);
  }
  function prims(list, q) {
    return list.map((p) => ({
      attributes: {
        NORMAL: addByteNormals(p.mesh),
        POSITION: addQuantizedPositions(p.mesh, q),
      },
      indices: addIndices(p.mesh.idx, p.mesh.pos.length / 3),
      material: colorIndex.get(p.colorKey),
    }));
  }
  const chassisQ = quantizePositions(chassisPrims, false);
  const wheelQ = quantizePositions(wheelPrims, true);
  // Every spinning mesh is quantized centred for the same reason the wheel is:
  // a non-zero decode offset lives on the node, so rotation.x would swing the
  // mesh around a point off its axle.
  const spinQ = spinMeshes.map((m) => quantizePositions(m.prims, true));
  const meshes = [
    { name: "chassis", primitives: prims(chassisPrims, chassisQ) },
    { name: "wheel", primitives: prims(wheelPrims, wheelQ) },
    ...spinMeshes.map((m, i) => ({ name: m.name, primitives: prims(m.prims, spinQ[i]) })),
  ];
  const chassisMesh = 0;
  const wheelMesh = 1;
  const spinMeshBase = 2;
  const nodes = [
    { children: [], extras: meta, name: "robot" },
    {
      mesh: chassisMesh,
      name: "chassis",
      scale: [chassisQ.scale, chassisQ.scale, chassisQ.scale],
      translation: chassisQ.offset,
    },
    ...wheelNodes.map((wn) => ({
      mesh: wheelMesh,
      name: wn.name,
      scale: [wheelQ.scale, wheelQ.scale, wheelQ.scale],
      translation: wn.translation,
    })),
    ...spinNodes.map((n) => {
      const q = spinQ[n.meshIndex];
      return {
        mesh: spinMeshBase + n.meshIndex,
        name: n.name,
        scale: [q.scale, q.scale, q.scale],
        translation: n.translation,
      };
    }),
  ];
  // Everything below the root is a direct child of it: the chassis, the four
  // wheels, and one node per spinning part.
  nodes[0].children = nodes.map((_, i) => i).slice(1);
  const json = {
    accessors,
    asset: { generator: "robot-from-fbx.mjs", version: "2.0" },
    bufferViews,
    buffers: [{ byteLength }],
    extensionsRequired: ["KHR_mesh_quantization"],
    extensionsUsed: ["KHR_mesh_quantization"],
    materials,
    meshes,
    nodes,
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  let binBuf = Buffer.concat(buffers);
  const binPad = (4 - (binBuf.length % 4)) % 4;
  if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonBuf.length, 0);
  jsonHdr.writeUInt32LE(0x4e4f534a, 4);
  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binBuf.length, 0);
  binHdr.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(filePath, Buffer.concat([header, jsonHdr, jsonBuf, binHdr, binBuf]));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writeGlb(path.join(OUT_DIR, "robot.glb"));
fs.writeFileSync(path.join(OUT_DIR, "robot-meta.json"), JSON.stringify(meta, null, 2) + "\n");

const glbSize = fs.statSync(path.join(OUT_DIR, "robot.glb")).size;
const renderedTris = chassisTris + wheelTris * 4 + spinTris;
const driveTris = spinNodes.filter((n) => n.category === "drive").reduce((s, n) => s + spinMeshes[n.meshIndex].tris, 0);
console.log("---");
console.log(
  "triangles out (rendered):",
  renderedTris,
  `(chassis ${chassisTris} + 4 x wheel ${wheelTris} + drive ${driveTris} + intake ${spinTris - driveTris})`,
);
console.log("wheels:", meta.wheels.length, "radius", +meta.wheels[0].radius.toFixed(4), "sides", meta.wheels.map((w) => w.side).join(","));
for (const category of ["drive", "intake"]) {
  const list = meta.parts.filter((pt) => pt.category === category);
  console.log(`${category} parts:`, list.length, "radii", [...new Set(list.map((pt) => +pt.radius.toFixed(4)))].sort((a, b) => a - b).join(","));
}
console.log("boundsSize:", meta.boundsSize.map((n) => +n.toFixed(3)));
console.log("robot.glb:", (glbSize / 1e6).toFixed(2), "MB");
console.log("done in", ((Date.now() - t0) / 1000).toFixed(1), "s");
