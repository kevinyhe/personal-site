// Build public/model/props/ball.glb and goal.glb from the two VEX Push Back
// FBX exports that sit untracked in the repo root:
//
//   276-9142-001_Instruction - Blue.fbx   the game ball
//   276-9142-100.fbx                      the Long Goal (a horizontal tube)
//
// Run manually from the repo root (the FBX files must be present):
//   node scripts/extract-props.mjs ["path/to/ball.fbx" "path/to/goal.fbx"]
//
// Everything here follows scripts/robot-from-fbx.mjs: the same hand-rolled GLB
// writer, the same KHR_mesh_quantization scheme (16-bit positions with the
// decode transform on the node, byte normals, 16-bit indices where they fit),
// the same meshoptimizer decimation with error bounds, and the same rule that
// one Fusion appearance colour becomes one glTF material.
//
// Scale is the one thing that has to agree with the robot. Both FBX files are
// in millimetres. The robot is authored in inches and normalized so its
// forward extent is 1.6 stage units; that extent is 16.5 in, so one stage unit
// is 16.5 / 1.6 = 10.3125 in = 261.9375 mm. That single number converts both
// props, which is why the goal's tube ends up at the same height as the
// robot's indexer exit instead of merely near it.

import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { MeshoptSimplifier } from "meshoptimizer/meshopt_simplifier.module.js";

const BALL_SRC = process.argv[2] ?? path.resolve("276-9142-001_Instruction - Blue.fbx");
const GOAL_SRC = process.argv[3] ?? path.resolve("276-9142-100.fbx");
const OUT_DIR = path.resolve("public/model/props");
const t0 = Date.now();

// One stage unit in millimetres. See the header: this is the robot's own
// scale, not a number picked to make the goal look right.
const MM_PER_UNIT = (16.5 * 25.4) / 1.6;

// The goal arrives at 334,660 triangles, which is more than the whole rest of
// the scene needs from a prop that sits in the background. 60k keeps the
// tube's diamond cross-section and the leg trusses readable.
const CAP_GOAL = 60000;
// The ball is already cheap at 7,244 triangles and it is the object the eye
// follows, so it is left alone unless it somehow arrives much heavier.
const CAP_BALL = 12000;

await MeshoptSimplifier.ready;

// ---------------------------------------------------------------------------
// Materials: group by Fusion appearance colour, exactly as the robot pipeline
// does, so several appearance names that share a colour collapse to one glTF
// material and the name seen on the most triangles picks its finish.
// ---------------------------------------------------------------------------
function matStyle(name) {
  const n = name.toLowerCase();
  if (/rubber|tire|flex/.test(n)) return { metallicFactor: 0, roughnessFactor: 0.95 };
  if (/alumin|steel|bronze|silver|metal/.test(n)) return { metallicFactor: 0.85, roughnessFactor: 0.4 };
  return { metallicFactor: 0, roughnessFactor: 0.65 };
}

function newColorRegistry() {
  const reg = new Map(); // key -> { factor, names: Map(name -> tris) }
  function keyOf(mat) {
    const c = mat && mat.color ? mat.color : new THREE.Color(0.5, 0.5, 0.5);
    // Material colours are already in three's linear working space, which is
    // what baseColorFactor wants; quantize to merge float noise.
    const q = (x) => Math.round(x * 1000) / 1000;
    return `${q(c.r)},${q(c.g)},${q(c.b)}`;
  }
  function register(mat, tris) {
    const key = keyOf(mat);
    let e = reg.get(key);
    if (!e) {
      const c = mat && mat.color ? mat.color : new THREE.Color(0.5, 0.5, 0.5);
      e = { factor: [c.r, c.g, c.b, 1], names: new Map() };
      reg.set(key, e);
    }
    const name = mat && mat.name ? mat.name : "unnamed";
    e.names.set(name, (e.names.get(name) || 0) + tris);
    return key;
  }
  function materials() {
    const index = new Map();
    const list = [];
    for (const [key, e] of reg) {
      let bestName = "unnamed";
      let bestTris = -1;
      for (const [n, t] of e.names) if (t > bestTris) { bestTris = t; bestName = n; }
      index.set(key, list.length);
      list.push({
        name: bestName,
        pbrMetallicRoughness: {
          baseColorFactor: e.factor.map((n) => +n.toFixed(4)),
          ...matStyle(bestName),
        },
      });
    }
    return { index, list };
  }
  return { materials, register };
}

// ---------------------------------------------------------------------------
// Split a mesh into (geometry, colour) slots. FBXLoader hands back triangle
// soup with geometry.groups selecting the material per vertex range. The goal
// FBX has some groups with a negative material index, which the loader warns
// about; clamping to 0 puts those triangles on the mesh's first material.
// ---------------------------------------------------------------------------
function slotsOf(mesh, reg) {
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
    out.push({ colorKey: reg.register(mat, count / 3), count, geometry: g, start });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Welding, simplification, normals. Same helpers as the robot pipeline.
// ---------------------------------------------------------------------------
function weld(soup, quant) {
  const key = new Map();
  const pos = [];
  const idx = [];
  const np = soup.length / 3;
  for (let i = 0; i < np; i++) {
    const px = soup[i * 3];
    const py = soup[i * 3 + 1];
    const pz = soup[i * 3 + 2];
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
    const a = mesh.idx[t];
    const b = mesh.idx[t + 1];
    const c = mesh.idx[t + 2];
    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }
  mesh.idx = new Uint32Array(out);
  return mesh;
}
function simplify(mesh, targetTris, maxError) {
  const target = Math.max(3, Math.round(targetTris)) * 3;
  const [res] = MeshoptSimplifier.simplify(mesh.idx, mesh.pos, 3, target, maxError, []);
  return { idx: new Uint32Array(res), pos: mesh.pos };
}
function compact(mesh) {
  const remap = new Int32Array(mesh.pos.length / 3).fill(-1);
  const pos = [];
  const idx = [];
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
  // Area-weighted vertex normals: planar regions stay flat, fillets smooth.
  const nrm = new Float32Array(mesh.pos.length);
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const a = mesh.idx[t] * 3;
    const b = mesh.idx[t + 1] * 3;
    const c = mesh.idx[t + 2] * 3;
    const ux = mesh.pos[b] - mesh.pos[a];
    const uy = mesh.pos[b + 1] - mesh.pos[a + 1];
    const uz = mesh.pos[b + 2] - mesh.pos[a + 2];
    const vx = mesh.pos[c] - mesh.pos[a];
    const vy = mesh.pos[c + 1] - mesh.pos[a + 1];
    const vz = mesh.pos[c + 2] - mesh.pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
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

function loadFbx(src) {
  const fileBuf = fs.readFileSync(src);
  const ab = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);
  const root = new FBXLoader().parse(ab, "");
  root.updateMatrixWorld(true);
  return root;
}

// ---------------------------------------------------------------------------
// Collect one welded local-frame mesh per (geometry, colour slot), shared by
// every instance of that geometry, then decimate under a triangle cap. Sizes
// are in millimetres because that is what the source files use.
// ---------------------------------------------------------------------------
function collectInstances(root, reg) {
  const partCache = new Map(); // "geomUuid|colorKey|start" -> part
  const instances = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const worldScale = o.matrixWorld.getMaxScaleOnAxis();
    for (const slot of slotsOf(o, reg)) {
      const id = `${slot.geometry.uuid}|${slot.colorKey}|${slot.start}`;
      let part = partCache.get(id);
      if (!part) {
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
        let min = [1e30, 1e30, 1e30];
        let max = [-1e30, -1e30, -1e30];
        for (let i = 0; i < soup.length; i += 3) {
          for (let k = 0; k < 3; k++) {
            if (soup[i + k] < min[k]) min[k] = soup[i + k];
            if (soup[i + k] > max[k]) max[k] = soup[i + k];
          }
        }
        const localMax = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-6);
        const welded = dropDegenerate(weld(soup, localMax / 131072));
        part = { maxDimMm: localMax * worldScale, raw: welded.idx.length / 3, welded };
        partCache.set(id, part);
      }
      instances.push({ matrixWorld: o.matrixWorld, part, slot });
    }
  });
  return instances;
}

// Error bound in millimetres, expressed as a fraction of the part's own
// extent because that is what meshopt's target_error means. 1.5 mm is about
// half the wall thickness of the goal's extrusions, so walls survive; small
// fasteners get a floor of 0.02 so they may round off, which is invisible at
// the size these props appear on screen.
function budgetedMesh(part, scale2) {
  const err = Math.min(0.02, 1.5 / Math.max(part.maxDimMm, 1e-6));
  const target = Math.max(24, Math.round(part.raw * scale2));
  return compact(simplify(part.welded, target, err));
}

function budgetLoop(instances, cap, label) {
  const meshCache = new Map(); // part -> simplified mesh
  let scale2 = 1;
  for (let pass = 0; pass < 8; pass++) {
    meshCache.clear();
    let total = 0;
    for (const inst of instances) {
      let mesh = meshCache.get(inst.part);
      if (!mesh) {
        mesh = budgetedMesh(inst.part, scale2);
        meshCache.set(inst.part, mesh);
      }
      total += mesh.idx.length / 3;
    }
    console.log(label, "budget pass", pass, "scale", +scale2.toFixed(4), "instanced tris", total);
    if (total <= cap) break;
    scale2 *= (cap / total) * 0.95;
  }
  return meshCache;
}

// Bake the instance world matrices into one position/index pair per colour,
// applying `mapPoint` (millimetres -> stage units in the prop's own frame).
function bakePrimitives(instances, meshCache, mapPoint, weldMm) {
  const byColor = new Map();
  const e0 = new THREE.Vector3();
  for (const inst of instances) {
    const mesh = meshCache.get(inst.part);
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
  const prims = [];
  for (const [colorKey, acc] of byColor) {
    const soup = new Float32Array(acc.idx.length * 3);
    for (let i = 0; i < acc.idx.length; i++) {
      const vi = acc.idx[i] * 3;
      soup[i * 3] = acc.pos[vi];
      soup[i * 3 + 1] = acc.pos[vi + 1];
      soup[i * 3 + 2] = acc.pos[vi + 2];
    }
    prims.push({ colorKey, mesh: computeNormals(compact(dropDegenerate(weld(soup, weldMm / MM_PER_UNIT)))) });
  }
  prims.sort((a, b) => b.mesh.idx.length - a.mesh.idx.length);
  return prims;
}

function worldBounds(root) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
  });
  return box;
}

// ---------------------------------------------------------------------------
// GLB writer. One root node carrying the prop's meta as glTF extras, plus one
// mesh node whose translation/scale is the position-dequantization transform.
// ---------------------------------------------------------------------------
function writeGlb(filePath, { extras, materials, meshName, prims, quantizeCentred, rootName }) {
  const buffers = [];
  let byteLength = 0;
  const accessors = [];
  const bufferViews = [];
  function addAccessor(arr, type, componentType, target) {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      buffers.push(Buffer.alloc(pad));
      byteLength += pad;
    }
    bufferViews.push({ buffer: 0, byteLength: buf.byteLength, byteOffset: byteLength, target });
    buffers.push(buf);
    byteLength += buf.byteLength;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType,
      count: type === "SCALAR" ? arr.length : arr.length / 3,
      type,
    });
    return accessors.length - 1;
  }
  // Positions become 16-bit integers over the mesh's own extent and normals
  // signed bytes (KHR_mesh_quantization). The integer-to-real transform has to
  // live on the node, so all primitives of one prop share a single scale. The
  // ball is quantized about a range centred on the origin so its decode offset
  // is zero: its node translation is then the true centre and rotating the
  // node spins the ball about itself rather than swinging it around a point.
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
      const half = Math.max(...[0, 1, 2].map((k) => Math.max(-min[k], max[k])));
      min = [-half, -half, -half];
      max = [half, half, half];
    }
    // One uniform scale on all three axes keeps the decode a similarity
    // transform, so the byte normals stay correct without rescaling.
    const extent = Math.max(...[0, 1, 2].map((k) => max[k] - min[k]), 1e-9);
    return { offset: centred ? [0, 0, 0] : min.map((n) => n + extent / 2), scale: extent / 65534 };
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
        const raw = Math.round((mesh.pos[i * 3 + k] - q.offset[k]) / q.scale);
        const c = Math.max(-32767, Math.min(32767, raw));
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
        out[i * 4 + k] = Math.max(-127, Math.min(127, Math.round(mesh.nrm[i * 3 + k] * 127)));
      }
    }
    const index = addAccessor(out, "VEC3", 5120, 34962);
    accessors[index].count = count;
    accessors[index].normalized = true;
    bufferViews[accessors[index].bufferView].byteStride = 4;
    return index;
  }
  function addIndices(idx, vertexCount) {
    // 16-bit indices wherever the primitive has few enough vertices.
    if (vertexCount <= 65536) return addAccessor(Uint16Array.from(idx), "SCALAR", 5123, 34963);
    return addAccessor(idx, "SCALAR", 5125, 34963);
  }
  const q = quantizePositions(prims, quantizeCentred);
  const primitives = prims.map((p) => ({
    attributes: {
      NORMAL: addByteNormals(p.mesh),
      POSITION: addQuantizedPositions(p.mesh, q),
    },
    indices: addIndices(p.mesh.idx, p.mesh.pos.length / 3),
    material: materials.index.get(p.colorKey),
  }));
  const json = {
    accessors,
    asset: { generator: "extract-props.mjs", version: "2.0" },
    bufferViews,
    buffers: [{ byteLength }],
    extensionsRequired: ["KHR_mesh_quantization"],
    extensionsUsed: ["KHR_mesh_quantization"],
    materials: materials.list,
    meshes: [{ name: meshName, primitives }],
    nodes: [
      { children: [1], extras, name: rootName },
      { mesh: 0, name: meshName, scale: [q.scale, q.scale, q.scale], translation: q.offset },
    ],
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

// ---------------------------------------------------------------------------
// Ball. A single 7,244-triangle piece whose material is "Opaque(213,0,50)" --
// red, despite "Blue" in the file name. It is not actually a sphere: it is a
// rounded cube, 82 mm across the flats and 97.7 mm across the corners, which
// is what the Push Back game piece looks like. `radius` is therefore the
// half-extent across the flats, the distance from its centre to the surface it
// rests on. Recentred on its own bounding-box centre, because a rolling prop
// has to rotate about its centre rather than swing around some other point.
// ---------------------------------------------------------------------------
function buildBall() {
  const root = loadFbx(BALL_SRC);
  const reg = newColorRegistry();
  const instances = collectInstances(root, reg);
  const box = worldBounds(root);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // The three half-extents agree; averaging them shrugs off the
  // sub-tenth-of-a-millimetre difference the tessellation leaves behind.
  const radiusMm = (size.x + size.y + size.z) / 6;
  const spread = (Math.max(size.x, size.y, size.z) - Math.min(size.x, size.y, size.z)) / Math.max(size.x, size.y, size.z);
  if (spread > 0.02) throw new Error(`ball is lopsided: bbox size ${size.toArray().map((n) => n.toFixed(2))}`);
  const radius = radiusMm / MM_PER_UNIT;

  const meshCache = budgetLoop(instances, CAP_BALL, "ball");
  const s = 1 / MM_PER_UNIT;
  const prims = bakePrimitives(
    instances,
    meshCache,
    (x, y, z) => [(x - centre.x) * s, (y - centre.y) * s, (z - centre.z) * s],
    0.2,
  );
  const tris = prims.reduce((n, p) => n + p.mesh.idx.length / 3, 0);
  console.log(`ball: radius ${radiusMm.toFixed(2)} mm = ${radius.toFixed(5)} units, ${tris} tris, ${prims.length} colour primitives`);

  writeGlb(path.join(OUT_DIR, "ball.glb"), {
    extras: { radius },
    materials: reg.materials(),
    meshName: "ball",
    prims,
    quantizeCentred: true,
    rootName: "ball",
  });
  return { radius, tris };
}

// ---------------------------------------------------------------------------
// Goal. A VEX Push Back Long Goal: a tube of diamond cross-section carried on
// two leg assemblies, long axis along the source file's z. Normalized to base
// at y = 0 and centred on x and z.
//
// Where the openings are, and how I measured them (see the numbers printed by
// this script -- it re-derives them from the geometry every run):
//
//   * The tube is closed all the way round in cross-section: an inner diamond
//     about 100 mm wide at its widest and 130 mm tall, so a ball can only get
//     in or out through the two ends. Those ends are the openings.
//   * Trough height: I sweep a sphere of the ball's across-the-flats radius
//     upward along the tube axis and take the lowest height at which it clears
//     every triangle -- the ball rests on a flat, so that is the right probe.
//     That is
//     where a ball actually comes to rest between the tube's two lower
//     slanted walls, and it is flat along the whole tube. This is the height
//     a robot has to deliver a ball to, which is what troughHeight means.
//   * Opening z: the outermost triangle belonging to the tube walls (anything
//     above the legs and inside the tube's x half-width). Past that plane the
//     resting height drops away, i.e. the tube no longer confines the ball --
//     so that plane is the mouth.
//   * The inward vector is the tube axis pointing from each mouth toward the
//     tube's middle, which is (0, 0, -1) at the +z mouth and (0, 0, +1) at
//     the -z mouth.
// ---------------------------------------------------------------------------
function measureGoalChannel(root, ballRadiusMm) {
  const tris = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    const n = g.index ? g.index.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const ia = g.index ? g.index.getX(t) : t;
      const ib = g.index ? g.index.getX(t + 1) : t + 1;
      const ic = g.index ? g.index.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
      tris.push([a.clone(), b.clone(), c.clone()]);
    }
  });

  // The tube walls are the geometry that sits above the legs and close to the
  // axis. Their z extent is the pair of mouths.
  const TUBE_Y_MIN = 300;
  const TUBE_X_HALF = 90;
  let tubeZmin = Infinity;
  let tubeZmax = -Infinity;
  for (const [p, q, r] of tris) {
    for (const v of [p, q, r]) {
      if (v.y > TUBE_Y_MIN && Math.abs(v.x) < TUBE_X_HALF) {
        if (v.z < tubeZmin) tubeZmin = v.z;
        if (v.z > tubeZmax) tubeZmax = v.z;
      }
    }
  }
  if (!Number.isFinite(tubeZmin)) throw new Error("goal: found no tube walls above y = 300 mm");

  // Bucket triangles by z so the sphere sweep only looks at what is nearby.
  const SLAB = 20;
  const zbuckets = new Map();
  for (const t of tris) {
    const z0 = Math.min(t[0].z, t[1].z, t[2].z);
    const z1 = Math.max(t[0].z, t[1].z, t[2].z);
    for (let k = Math.floor(z0 / SLAB); k <= Math.floor(z1 / SLAB); k++) {
      let l = zbuckets.get(k);
      if (!l) {
        l = [];
        zbuckets.set(k, l);
      }
      l.push(t);
    }
  }
  const probe = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const tri = new THREE.Triangle();
  function restHeightAt(z) {
    const near = [];
    for (let k = Math.floor((z - ballRadiusMm - 5) / SLAB); k <= Math.floor((z + ballRadiusMm + 5) / SLAB); k++) {
      const l = zbuckets.get(k);
      if (l) near.push(...l);
    }
    for (let y = TUBE_Y_MIN; y <= 480; y += 0.5) {
      probe.set(0, y, z);
      let clear = true;
      for (const [p, q, r] of near) {
        tri.set(p, q, r);
        tri.closestPointToPoint(probe, closest);
        if (closest.distanceTo(probe) < ballRadiusMm) {
          clear = false;
          break;
        }
      }
      if (clear) return y;
    }
    return null;
  }
  // Sample along the tube, away from the mouths, and take the median so one
  // odd slice cannot move the answer.
  const samples = [];
  for (let f = -0.8; f <= 0.801; f += 0.1) {
    const y = restHeightAt(tubeZmax * f);
    if (y !== null) samples.push(y);
  }
  samples.sort((x, y) => x - y);
  const restY = samples[Math.floor(samples.length / 2)];
  const jitter = samples[samples.length - 1] - samples[0];
  if (jitter > 5) throw new Error(`goal: ball resting height varies by ${jitter.toFixed(1)} mm along the tube`);
  console.log(`goal: tube z ${tubeZmin.toFixed(1)}..${tubeZmax.toFixed(1)} mm, ball rests at y ${restY.toFixed(1)} mm (spread ${jitter.toFixed(1)} mm over ${samples.length} samples)`);
  return { restY, tubeZmax, tubeZmin };
}

function buildGoal(ballRadius) {
  const root = loadFbx(GOAL_SRC);
  const reg = newColorRegistry();
  const instances = collectInstances(root, reg);
  const box = worldBounds(root);
  const size = box.getSize(new THREE.Vector3());
  if (!(size.z > size.y && size.z > size.x)) {
    throw new Error(`goal: expected z to be the long axis, got size ${size.toArray().map((n) => n.toFixed(1))}`);
  }
  const ballRadiusMm = ballRadius * MM_PER_UNIT;
  const { restY, tubeZmax, tubeZmin } = measureGoalChannel(root, ballRadiusMm);

  const s = 1 / MM_PER_UNIT;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const baseY = box.min.y;
  const mapPoint = (x, y, z) => [(x - cx) * s, (y - baseY) * s, (z - cz) * s];

  const meshCache = budgetLoop(instances, CAP_GOAL, "goal");
  const prims = bakePrimitives(instances, meshCache, mapPoint, 0.4);
  const tris = prims.reduce((n, p) => n + p.mesh.idx.length / 3, 0);

  const troughHeight = (restY - baseY) * s;
  const mouthPlus = (tubeZmax - cz) * s;
  const mouthMinus = (tubeZmin - cz) * s;
  const meta = {
    boundsSize: [size.x * s, size.y * s, size.z * s],
    length: size.z * s,
    openings: [
      { inward: [0, 0, 1], position: [0, troughHeight, mouthMinus] },
      { inward: [0, 0, -1], position: [0, troughHeight, mouthPlus] },
    ],
    troughHeight,
  };
  console.log(
    `goal: ${tris} tris in ${prims.length} colour primitives; length ${meta.length.toFixed(4)}, height ${meta.boundsSize[1].toFixed(4)}, width ${meta.boundsSize[0].toFixed(4)}, trough ${troughHeight.toFixed(4)}, mouths z ${mouthMinus.toFixed(4)} / ${mouthPlus.toFixed(4)}`,
  );

  writeGlb(path.join(OUT_DIR, "goal.glb"), {
    extras: meta,
    materials: reg.materials(),
    meshName: "goal",
    prims,
    quantizeCentred: false,
    rootName: "goal",
  });
  return { meta, tris };
}

// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
const ball = buildBall();
const goal = buildGoal(ball.radius);
// A sidecar for eyeballing what got baked in; the runtime reads the copy in
// the GLB extras, not this file.
fs.writeFileSync(
  path.join(OUT_DIR, "props-meta.json"),
  JSON.stringify({ ball: { radius: ball.radius }, goal: goal.meta, mmPerUnit: MM_PER_UNIT }, null, 2) + "\n",
);

const ballBytes = fs.statSync(path.join(OUT_DIR, "ball.glb")).size;
const goalBytes = fs.statSync(path.join(OUT_DIR, "goal.glb")).size;
console.log("---");
console.log("ball.glb:", (ballBytes / 1e6).toFixed(3), "MB,", ball.tris, "tris");
console.log("goal.glb:", (goalBytes / 1e6).toFixed(3), "MB,", goal.tris, "tris");
console.log("total:", ((ballBytes + goalBytes) / 1e6).toFixed(3), "MB");
console.log("done in", ((Date.now() - t0) / 1000).toFixed(1), "s");
