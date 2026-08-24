// Extract the VEX robot from the Fusion 360 archive "sexy s bot only.f3z" and
// write public/model/robot/robot.glb plus robot-meta.json.
//
// Run manually from the repo root (the f3z is untracked and must be present):
//   node scripts/extract-robot.mjs ["path/to/sexy s bot only.f3z"]
//
// How it works:
// The f3z is a zip of .f3d files (each itself a zip; entries are Zstandard-
// compressed, which node's zlib handles). The root .f3d carries an Autodesk
// OGS scene dump: a "world" stream (length-prefixed UTF-16 record soup) plus a
// vertex/index blob (Fusion_mesh_000). Component tessellation lives in
// per-component worlds in local frames; the CURRENT placement of every moved
// occurrence lives in a table of PersistentPassiveNodePath records at the end
// of the world stream, each carrying an absolute world matrix
// (OverrideTransformAttribute). This script rebuilds the saved assembly:
//   1. parse the scope tree (ARenderList / SingleNodeWorld ... EndMark);
//   2. parse Face records (full + bbox-only reference forms, references
//      resolved by exact bbox match) and bucket them by scope;
//   3. parse Instance/Component records; map each to its component world
//      directly (adjacent SingleNodeWorld), through the world's root GroupNode
//      hexid (shared components serialize once), or through the prototype
//      hexid named just before the record;
//   4. apply the override table: each path's leaf subtree is drawn with its
//      absolute matrix; children with their own override are drawn separately;
//   5. detect wheels: instances of round part worlds (two near-equal large
//      dims, thin third) reached during the walk - on this design that finds
//      the four 8T sprockets the bot rolls on (three collinear right-side ones
//      near the ground plus one elevated left one) and several decorative
//      flex/omni wheels which stay baked into the chassis;
//   6. weld, meshopt-simplify, and write a GLB: one chassis mesh plus wheel
//      nodes sharing one sprocket mesh, pre-pivoted so node.rotation.x spins
//      them about their axle.
//
// Output frame: +Z forward, +Y up, ground at y = 0 (the design's own floor
// plane - one kickstand leg of the sculpture pokes below it, faithfully to the
// file), uniform scale such that the forward extent (length) is exactly 1.6.
//
// Not tessellated in this archive (so absent from the GLB): the V5 motor,
// brain, and battery bodies, plus ~17k instanced faces whose source
// tessellation was never baked by Fusion (about a fifth of the face records;
// mostly repeated fastener/spacer copies).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { MeshoptSimplifier } from "meshoptimizer/meshopt_simplifier.module.js";

const SRC = process.argv[2] ?? path.resolve("sexy s bot only.f3z");
const OUT_DIR = path.resolve("public/model/robot");
const t0 = Date.now();
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// ---------------------------------------------------------------------------
// Minimal zip reading (store, deflate, and zstd method 93).
// ---------------------------------------------------------------------------
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: no end-of-central-directory");
  const count = buf.readUInt16LE(eocd + 10);
  let o = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(o) !== 0x02014b50) throw new Error("zip: bad central directory");
    const method = buf.readUInt16LE(o + 10);
    const csize = buf.readUInt32LE(o + 20);
    const nlen = buf.readUInt16LE(o + 28);
    const elen = buf.readUInt16LE(o + 30);
    const clen = buf.readUInt16LE(o + 32);
    const lho = buf.readUInt32LE(o + 42);
    entries.push({ csize, lho, method, name: buf.toString("utf8", o + 46, o + 46 + nlen) });
    o += 46 + nlen + elen + clen;
  }
  return entries;
}
function zipRead(buf, e) {
  const nlen = buf.readUInt16LE(e.lho + 26);
  const elen = buf.readUInt16LE(e.lho + 28);
  const raw = buf.subarray(e.lho + 30 + nlen + elen, e.lho + 30 + nlen + elen + e.csize);
  if (e.method === 0) return Buffer.from(raw);
  if (e.method === 8) return zlib.inflateRawSync(raw);
  if (e.method === 93) return zlib.zstdDecompressSync(raw);
  throw new Error("zip: unsupported compression method " + e.method);
}

// ---------------------------------------------------------------------------
// World stream helpers.
// ---------------------------------------------------------------------------
function namePat(name) {
  const b = Buffer.alloc(4 + name.length * 2);
  b.writeUInt32LE(name.length, 0);
  b.write(name, 4, "utf16le");
  return b;
}
function findAll(hay, pat, from = 0, to = Infinity) {
  const out = [];
  let i = from;
  for (;;) {
    i = hay.indexOf(pat, i);
    if (i < 0 || i >= to) break;
    out.push(i);
    i += pat.length;
  }
  return out;
}

function mul4(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let ro = 0; ro < 4; ro++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + ro] * b[c * 4 + k];
      r[c * 4 + ro] = s;
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Scene parsing.
// ---------------------------------------------------------------------------
function buildScene(world, blobLen, geomEnd) {
  const opens = [];
  for (const n of ["ARenderList", "SingleNodeWorld"]) {
    for (const at of findAll(world, namePat(n))) opens.push({ at, kind: n });
  }
  const closes = findAll(world, namePat("WorldSerializerEndMark")).map((at) => ({ at, kind: "end" }));
  const evs = [...opens, ...closes].sort((a, b) => a.at - b.at);
  const scopes = [];
  {
    const stack = [];
    for (const e of evs) {
      if (e.kind === "end") {
        const s = stack.pop();
        if (s) s.end = e.at;
      } else {
        const s = { at: e.at, children: [], end: world.length, kind: e.kind };
        if (stack.length) stack[stack.length - 1].children.push(s);
        scopes.push(s);
        stack.push(s);
      }
    }
  }
  const sorted = scopes.slice().sort((a, b) => a.at - b.at);
  const smallestScope = (at) => {
    let best = null;
    for (const s of sorted) {
      if (s.at > at) break;
      if (at < s.end && (!best || s.end - s.at < best.end - best.at)) best = s;
    }
    return best;
  };

  // TransformAttribute: name, u32, u8 flag, then 16 f32 column-major.
  const xfPat = namePat("TransformAttribute");
  const xfs = findAll(world, xfPat).map((at) => {
    const base = at + xfPat.length + 5;
    const m = [];
    for (let k = 0; k < 16; k++) m.push(world.readFloatLE(base + 4 * k));
    return { at, m };
  });

  const gnPat = namePat("GroupNode");
  const gnPositions = findAll(world, gnPat);
  const hexidAt = (o) =>
    o >= 0 && world.readUInt32LE(o) === 16 && /^[0-9A-F]{16}$/.test(world.toString("utf16le", o + 4, o + 36))
      ? world.toString("utf16le", o + 4, o + 36)
      : null;

  // Instance / Component records. A u64 big-endian id sits 17 bytes before the
  // type string; the prototype node's hexid (when the record has no world of
  // its own) sits 65 bytes before; the nearest preceding TransformAttribute is
  // the node's base placement inside its parent world.
  const instRecs = [];
  for (const n of ["Instance", "Component"]) {
    for (const at of findAll(world, namePat(n))) {
      if (at < 65) continue;
      const hi = world.readUInt32BE(at - 17);
      const lo = world.readUInt32BE(at - 13);
      instRecs.push({ at, id: hi === 0 ? lo : null, protoHexid: hexidAt(at - 65), type: n });
    }
  }
  instRecs.sort((a, b) => a.at - b.at);
  {
    let xi = 0;
    for (const r of instRecs) {
      while (xi < xfs.length && xfs[xi].at < r.at) xi++;
      const prev = xfs[xi - 1];
      r.base = prev && r.at - prev.at < 600 ? prev.m : null;
    }
  }

  // hexid -> largest scope starting right after any occurrence of that hexid.
  const hexScope = new Map();
  for (const g of gnPositions) {
    const id = hexidAt(g + gnPat.length);
    if (!id) continue;
    const after = g + gnPat.length + 36;
    let sc = null;
    for (const s of sorted) {
      if (s.at >= after && s.at < after + 120) { sc = s; break; }
      if (s.at >= after + 120) break;
    }
    if (!sc) continue;
    const cur = hexScope.get(id);
    if (!cur || sc.end - sc.at > cur.end - cur.at) hexScope.set(id, sc);
  }

  // Component world per instance record.
  const snwSorted = scopes.filter((s) => s.kind === "SingleNodeWorld").sort((a, b) => a.at - b.at);
  const ownedScopes = new Set();
  const targetByOwnHex = new Map();
  for (const r of instRecs) {
    const og = gnPositions.find((x) => x > r.at && x < r.at + 200);
    r.ownHexid = og !== undefined ? hexidAt(og + gnPat.length) : null;
    const s = snwSorted.find((x) => x.at > r.at && x.at < r.at + 600);
    if (!s) { r.target = null; continue; }
    ownedScopes.add(s);
    const g = gnPositions.find((x) => x > s.at && x < s.at + 60);
    const rootHex = g !== undefined ? hexidAt(g + gnPat.length) : null;
    let t = rootHex ? hexScope.get(rootHex) : null;
    if (!t || t.end - t.at <= s.end - s.at) t = s;
    r.target = t;
    if (r.ownHexid) targetByOwnHex.set(r.ownHexid, t);
  }
  // Records without their own world resolve through their prototype's node;
  // iterate so chains of shared prototypes settle.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const r of instRecs) {
      if (r.target) continue;
      const t = r.protoHexid ? targetByOwnHex.get(r.protoHexid) : null;
      if (t) {
        r.target = t;
        changed = true;
        if (r.ownHexid && !targetByOwnHex.has(r.ownHexid)) targetByOwnHex.set(r.ownHexid, t);
      }
    }
    if (!changed) break;
  }

  // Face records. Full form: fixed 57-byte prefix after the name, then
  // [vbOffset][posFloats][nrmFloats][uvFloats][idxCount][edgeCount][edges...]
  // [6 x f64 bbox]; vertex data at vbOffset is interleaved pos3+nrm3(+uv2)
  // f32 with the u32 index buffer following it. Reference form: bbox only;
  // resolved by exact bbox match (identical copies share identical bounds).
  const facePat = namePat("Face");
  const fullFaces = [];
  const refFaces = [];
  const bboxKey = (b) => b.map((x) => x.toFixed(6)).join(",");
  for (const at of findAll(world, facePat, 0, geomEnd)) {
    const b = at + facePat.length + 57;
    if (b + 24 + 48 > world.length) continue;
    const off = world.readUInt32LE(b);
    const pos = world.readUInt32LE(b + 4);
    const nrm = world.readUInt32LE(b + 8);
    const uv = world.readUInt32LE(b + 12);
    const idx = world.readUInt32LE(b + 16);
    const ec = world.readUInt32LE(b + 20);
    const readBbox = (o) => {
      const out = [];
      for (let k = 0; k < 6; k++) {
        const v = world.readDoubleLE(o + 8 * k);
        if (!Number.isFinite(v) || Math.abs(v) >= 1e4) return null;
        out.push(v);
      }
      if (out[3] < out[0] || out[4] < out[1] || out[5] < out[2]) return null;
      return out;
    };
    let handled = false;
    if (
      off % 4 === 0 && off < blobLen && pos > 0 && pos % 3 === 0 && pos <= 3e6 &&
      nrm === pos && uv % 2 === 0 && uv <= 2e6 && idx % 3 === 0 && idx <= 6e6 &&
      off + (pos + nrm + uv) * 4 + idx * 4 <= blobLen && ec <= 100000 &&
      b + 24 + 4 * ec + 48 <= world.length
    ) {
      const bbox = readBbox(b + 24 + 4 * ec);
      if (bbox) {
        fullFaces.push({ at, bbox, face: { idx, nv: pos / 3, off, uv: uv / 2 } });
        handled = true;
      }
    }
    if (!handled) {
      for (const rel of [49, 53, 57, 61]) {
        const bbox = readBbox(at + facePat.length + rel);
        if (bbox && !bbox.every((x) => x === 0)) {
          refFaces.push({ at, bbox });
          break;
        }
      }
    }
  }
  const srcByBbox = new Map();
  for (const f of fullFaces) srcByBbox.set(bboxKey(f.bbox), f.face);
  let refHits = 0;
  for (const f of fullFaces) {
    const s = smallestScope(f.at);
    if (s) (s.faces ??= []).push(f.face);
  }
  for (const r of refFaces) {
    const src = srcByBbox.get(bboxKey(r.bbox));
    if (!src) continue;
    refHits++;
    const s = smallestScope(r.at);
    if (s) (s.faces ??= []).push(src);
  }
  console.log("faces: full", fullFaces.length, "refs", refFaces.length, "refs resolved", refHits);
  for (const r of instRecs) {
    const s = smallestScope(r.at);
    if (s) (s.insts ??= []).push(r);
  }
  return { hexScope, instRecs, ownedScopes, scopes, targetByOwnHex };
}

// ---------------------------------------------------------------------------
// Override table: PersistentPassiveNodePath records, each a chain of numeric
// node ids plus the leaf node's hexid, followed by an absolute 4x4
// (OverrideTransformAttribute). Records may instead carry visibility or
// material overrides; those are skipped.
// ---------------------------------------------------------------------------
function parseOverrides(world) {
  const pPath = namePat("PersistentPassiveNodePath");
  const pXf = namePat("OverrideTransformAttribute");
  const starts = findAll(world, pPath);
  const out = [];
  for (let k = 0; k < starts.length; k++) {
    const at = starts[k];
    const lim = k + 1 < starts.length ? starts[k + 1] : world.length;
    let o = at + pPath.length;
    if (world.readUInt32LE(o) === 16) o += 36; // the attribute's own id string
    const count = world.readUInt32LE(o);
    o += 4;
    if (count < 1 || count > 32) continue;
    const entries = [];
    let ok = true;
    for (let e = 0; e < count; e++) {
      const flag = world.readUInt32LE(o);
      const hi = world.readUInt32BE(o + 4);
      if (flag !== 1 || hi !== 0) { ok = false; break; }
      entries.push(world.readUInt32BE(o + 8));
      o += 12;
    }
    if (!ok) continue;
    // leaf hexid between the entries and the override record
    let leafHex = null;
    for (let q = o; q < Math.min(o + 200, lim - 36); q++) {
      if (world.readUInt32LE(q) === 16) {
        const t = world.toString("utf16le", q + 4, q + 36);
        if (/^[0-9A-F]{16}$/.test(t)) { leafHex = t; q += 35; }
      }
    }
    const xfAt = world.indexOf(pXf, o);
    if (xfAt < 0 || xfAt >= lim) continue;
    const base = xfAt + pXf.length + 5;
    const m = [];
    for (let j = 0; j < 16; j++) m.push(world.readFloatLE(base + 4 * j));
    out.push({ entries, leafHex, m });
  }
  // duplicate chains: keep the first table entry (later ones are stale)
  const byChain = new Map();
  for (const p of out) {
    const k = p.entries.join(">");
    if (!byChain.has(k)) byChain.set(k, p);
  }
  return [...byChain.values()];
}

// ---------------------------------------------------------------------------
// Welding, simplification, normals.
// ---------------------------------------------------------------------------
function weld(soup) {
  const key = new Map();
  const pos = [], idx = [];
  const np = soup.length / 3;
  for (let i = 0; i < np; i++) {
    const px = soup[i * 3], py = soup[i * 3 + 1], pz = soup[i * 3 + 2];
    const k = `${px.toFixed(4)},${py.toFixed(4)},${pz.toFixed(4)}`;
    let v = key.get(k);
    if (v === undefined) {
      v = pos.length / 3;
      key.set(k, v);
      pos.push(px, py, pz);
    }
    idx.push(v);
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
  const target = Math.max(3, targetTris * 3 - (targetTris * 3) % 3);
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
  // Area-weighted vertex normals; planar regions stay flat, fillets smooth.
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
// GLB writer.
// ---------------------------------------------------------------------------
function writeGlb(filePath, chassisMesh, wheelMesh, wheelNodes, meta) {
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
      const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
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
  function prim(mesh, material) {
    return {
      attributes: {
        NORMAL: addAccessor(mesh.nrm, "VEC3", 5126, 34962),
        POSITION: addAccessor(mesh.pos, "VEC3", 5126, 34962),
      },
      indices: addAccessor(mesh.idx, "SCALAR", 5125, 34963),
      material,
    };
  }
  const materials = [
    { name: "aluminum", pbrMetallicRoughness: { baseColorFactor: [0.79, 0.8, 0.82, 1], metallicFactor: 0.85, roughnessFactor: 0.4 } },
    { name: "rubber", pbrMetallicRoughness: { baseColorFactor: [0.082, 0.082, 0.082, 1], metallicFactor: 0, roughnessFactor: 0.95 } },
  ];
  const meshes = [
    { name: "chassis", primitives: [prim(chassisMesh, 0)] },
    { name: "wheel", primitives: [prim(wheelMesh, 1)] },
  ];
  const nodes = [
    { children: [1, ...wheelNodes.map((_, i) => 2 + i)], extras: meta, name: "robot" },
    { mesh: 0, name: "chassis" },
    ...wheelNodes.map((wn) => ({ mesh: 1, name: wn.name, translation: wn.translation })),
  ];
  const json = {
    accessors,
    asset: { generator: "extract-robot.mjs", version: "2.0" },
    bufferViews,
    buffers: [{ byteLength }],
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

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
await MeshoptSimplifier.ready;
console.log("reading", SRC);
const f3z = fs.readFileSync(SRC);
const outer = zipEntries(f3z);
const manifest = JSON.parse(zipRead(f3z, outer.find((e) => e.name === "Manifest.json")).toString("utf8"));
const f3d = zipRead(f3z, outer.find((e) => e.name === manifest.root));
const inner = zipEntries(f3d);
const world = zipRead(f3d, inner.find((e) => /DefaultScene\/world$/.test(e.name)));
const blob = zipRead(f3d, inner.find((e) => /DefaultScene\/Fusion_mesh_000$/.test(e.name)));
console.log("world", world.length, "bytes; mesh blob", blob.length, "bytes");

// Geometry lives before the override/appearance tail of the stream; face and
// scope records beyond this point are override bookkeeping, not scene content.
const geomEnd = Math.min(
  ...["PersistentPassiveNodePath", "OverrideTransformAttribute", "FOverrideProteinEffectAttribute"]
    .map((n) => {
      const i = world.indexOf(namePat(n));
      return i < 0 ? world.length : i;
    }),
);
const scene = buildScene(world, blob.length, geomEnd);
const overrides = parseOverrides(world);
console.log("scopes", scene.scopes.length, "instance records", scene.instRecs.length, "transform overrides", overrides.length);

const instById = new Map();
for (const r of scene.instRecs) if (r.id !== null && !instById.has(r.id)) instById.set(r.id, r);
const overriddenIds = new Set();
for (const p of overrides) overriddenIds.add(p.entries[p.entries.length - 1]);
const roots = [];
let unresolvedOverrides = 0;
for (const p of overrides) {
  const leaf = p.entries[p.entries.length - 1];
  const r = instById.get(leaf);
  let target = r && r.target ? r.target : null;
  if (!target && p.leafHex) {
    target = scene.hexScope.get(p.leafHex) ?? scene.targetByOwnHex.get(p.leafHex) ?? null;
  }
  if (target && target.at >= geomEnd) target = null;
  if (!target) { unresolvedOverrides++; continue; }
  roots.push({ m: p.m, target });
}
console.log("override roots", roots.length, "unresolved", unresolvedOverrides);

// ---------------------------------------------------------------------------
// Wheel-world classification: local geometry of each component world.
// ---------------------------------------------------------------------------
function collectScope(scope, out, m, depth) {
  if (depth > 16) return;
  for (const f of scope.faces || []) {
    const ibOff = f.off + (f.nv * 6 + f.uv * 2) * 4;
    const stride = f.uv ? 32 : 24;
    for (let i = 0; i < f.idx; i++) {
      const ix = blob.readUInt32LE(ibOff + 4 * i);
      if (ix >= f.nv) continue;
      const b = f.off + ix * stride;
      const x = blob.readFloatLE(b), y = blob.readFloatLE(b + 4), z = blob.readFloatLE(b + 8);
      out.push(
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      );
    }
  }
  for (const r of scope.insts || []) {
    if (r.type !== "Instance" || !r.target || r.target === scope) continue;
    // children moved by their own override are not part of this subtree
    if (r.id !== null && overriddenIds.has(r.id)) continue;
    collectScope(r.target, out, r.base ? mul4(m, r.base) : m, depth + 1);
  }
  for (const c of scope.children) {
    if (scene.ownedScopes.has(c)) continue;
    collectScope(c, out, m, depth + 1);
  }
}
const scopeInfoCache = new Map();
function scopeInfo(scope) {
  if (scopeInfoCache.has(scope)) return scopeInfoCache.get(scope);
  const out = [];
  collectScope(scope, out, I4, 0);
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < out.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (out[i + k] < min[k]) min[k] = out[i + k];
      if (out[i + k] > max[k]) max[k] = out[i + k];
    }
  }
  const info = {
    center: [0, 1, 2].map((k) => (min[k] + max[k]) / 2),
    size: [0, 1, 2].map((k) => max[k] - min[k]),
    tris: out.length / 9,
  };
  scopeInfoCache.set(scope, info);
  return info;
}
function isWheelWorld(scope) {
  const { size, tris } = scopeInfo(scope);
  if (tris < 300) return false;
  const s = size.slice().sort((a, b) => a - b);
  return s[2] > 3.4 && s[2] < 11 && Math.abs(s[2] - s[1]) < 0.5 && s[0] < s[2] * 0.45;
}

// ---------------------------------------------------------------------------
// Assembly walk: collect the chassis soup; record wheel-world draws.
// ---------------------------------------------------------------------------
// The walk records one draw per (world, matrix): shared part worlds are
// simplified once and instanced. Scopes with loose faces along the way get
// their own pseudo-world keyed by the scope.
const chassisDraws = [];
const wheelDraws = [];
function drawScope(scope, m, depth) {
  if (depth > 16) return;
  if (isWheelWorld(scope)) {
    wheelDraws.push({ m, scope });
    return;
  }
  if ((scope.faces || []).length) chassisDraws.push({ m, scope, shallow: true });
  for (const r of scope.insts || []) {
    if (r.type !== "Instance" || !r.target) continue;
    // subtrees with their own (or an unresolvable) override are not drawn here
    if (r.id !== null && overriddenIds.has(r.id)) continue;
    drawScope(r.target, r.base ? mul4(m, r.base) : m, depth + 1);
  }
  for (const c of scope.children) {
    if (scene.ownedScopes.has(c)) continue;
    drawScope(c, m, depth + 1);
  }
}
let droppedFloaters = 0;
for (const root of roots) {
  const drawMark = chassisDraws.length;
  const wheelMark = wheelDraws.length;
  drawScope(root.target, root.m, 0);
  // parts parked in space fully below the design's floor plane are spares the
  // user dragged aside, not part of the robot
  let maxZ = -1e9;
  for (let d = drawMark; d < chassisDraws.length; d++) {
    const { m, scope } = chassisDraws[d];
    for (const f of scope.faces || []) {
      const ibOff = f.off + (f.nv * 6 + f.uv * 2) * 4;
      const stride = f.uv ? 32 : 24;
      for (let i = 0; i < f.idx; i += 7) {
        const ix = blob.readUInt32LE(ibOff + 4 * i);
        if (ix >= f.nv) continue;
        const b = f.off + ix * stride;
        const x = blob.readFloatLE(b), y = blob.readFloatLE(b + 4), z = blob.readFloatLE(b + 8);
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (wz > maxZ) maxZ = wz;
      }
    }
  }
  if (chassisDraws.length > drawMark && maxZ < 0) {
    chassisDraws.length = drawMark;
    wheelDraws.length = wheelMark;
    droppedFloaters++;
  }
}
console.log("chassis draws", chassisDraws.length, "wheel-world draws", wheelDraws.length, "dropped floaters", droppedFloaters);

// Ground wheels: the collinear near-ground run plus its partner side. On this
// design that is the four 8T sprockets (radius ~2 cm); the decorative
// flex/omni wheels sit high on the sculpture and are baked into the chassis.
const wheelInfos = wheelDraws.map((d) => {
  const info = scopeInfo(d.scope);
  const s = info.size.slice().sort((a, b) => a - b);
  const axleLocal = info.size.indexOf(s[0]);
  const ax = [d.m[axleLocal * 4], d.m[axleLocal * 4 + 1], d.m[axleLocal * 4 + 2]];
  const al = Math.hypot(...ax) || 1;
  const c = info.center;
  return {
    axle: ax.map((v) => v / al),
    center: [
      d.m[0] * c[0] + d.m[4] * c[1] + d.m[8] * c[2] + d.m[12],
      d.m[1] * c[0] + d.m[5] * c[1] + d.m[9] * c[2] + d.m[13],
      d.m[2] * c[0] + d.m[6] * c[1] + d.m[10] * c[2] + d.m[14],
    ],
    draw: d,
    radius: s[2] / 2,
  };
});
// up axis in model space is +Z; a ground wheel has a horizontal axle and its
// rim near the lowest wheel rim of the model
const horizontal = wheelInfos.filter((w) => Math.abs(w.axle[2]) < 0.3);
if (horizontal.length === 0) throw new Error("no horizontal-axle wheels found");
const lowestRim = Math.min(...horizontal.map((w) => w.center[2] - w.radius));
const groundWheels = horizontal.filter((w) => w.center[2] - w.radius < lowestRim + 1.5);
// include the partner-side wheel(s) of the same kind even if elevated, so both
// sides are represented for the drift animation
const groundRadius = groundWheels[0].radius;
const wheels = wheelInfos.filter(
  (w) => Math.abs(w.radius - groundRadius) / groundRadius < 0.05 && Math.abs(w.axle[2]) < 0.3,
);
console.log("wheels picked", wheels.length, "of", wheelInfos.length, "wheel-world draws;",
  "radius", wheels[0] && +wheels[0].radius.toFixed(2));
for (const w of wheels) {
  console.log("  wheel", "c", w.center.map((v) => +v.toFixed(1)).join(","), "axle", w.axle.map((v) => +v.toFixed(2)).join(","), "r", +w.radius.toFixed(2));
}
// the decorative round parts stay chassis geometry (drawn as their own scopes)
for (const w of wheelInfos) {
  if (wheels.includes(w)) continue;
  function reAdd(scope, m, depth) {
    if (depth > 16) return;
    if ((scope.faces || []).length) chassisDraws.push({ m, scope });
    for (const r of scope.insts || []) {
      if (r.type !== "Instance" || !r.target || r.target === scope) continue;
      if (r.id !== null && overriddenIds.has(r.id)) continue;
      reAdd(r.target, r.base ? mul4(m, r.base) : m, depth + 1);
    }
    for (const c of scope.children) {
      if (scene.ownedScopes.has(c)) continue;
      reAdd(c, m, depth + 1);
    }
  }
  reAdd(w.draw.scope, w.draw.m, 0);
}

// ---------------------------------------------------------------------------
// Frame change: model +Z up, wheels roll along model Y. GLB frame: +Y up,
// +Z forward = model +Y (the bulk of the sculpture leans that way), so
// glb = (-x, z, y) in model coordinates - a proper rotation.
// Ground: the design's own z=0 floor plane.
// ---------------------------------------------------------------------------
const F2G = [-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]; // column-major
const mapPoint = (p) => [-p[0], p[2], p[1]];
const mapDir = mapPoint;

// ---------------------------------------------------------------------------
// Meshing: weld + simplify each scope's direct-face geometry ONCE in its local
// frame, then emit every instance through its (frame-changed) matrix. Error
// bounds are kept below sheet-metal wall thickness so channels stay channels;
// fastener-sized parts may collapse to blobs, which is invisible at the
// robot's on-screen size.
// ---------------------------------------------------------------------------
function scopeLocalMesh(scope) {
  const soup = [];
  for (const f of scope.faces || []) {
    const ibOff = f.off + (f.nv * 6 + f.uv * 2) * 4;
    const stride = f.uv ? 32 : 24;
    for (let i = 0; i < f.idx; i++) {
      const ix = blob.readUInt32LE(ibOff + 4 * i);
      if (ix >= f.nv) continue;
      const b = f.off + ix * stride;
      soup.push(blob.readFloatLE(b), blob.readFloatLE(b + 4), blob.readFloatLE(b + 8));
    }
  }
  const welded = dropDegenerate(weld(soup));
  let maxDim = 0;
  {
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (let i = 0; i < welded.pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (welded.pos[i + k] < min[k]) min[k] = welded.pos[i + k];
        if (welded.pos[i + k] > max[k]) max[k] = welded.pos[i + k];
      }
    }
    for (let k = 0; k < 3; k++) maxDim = Math.max(maxDim, max[k] - min[k]);
  }
  const raw = welded.idx.length / 3;
  return { maxDim, raw, welded };
}
function budgetedMesh(part, scale2) {
  const { maxDim, raw, welded } = part;
  let mesh;
  if (maxDim < 2.2) {
    mesh = simplify(welded, Math.max(60, Math.round(Math.min(raw, 150) * scale2)), 0.04);
  } else if (part.round) {
    // decorative wheels: keep the silhouette, drop the roller/tread detail
    mesh = simplify(welded, Math.max(800, Math.round(3600 * scale2)), 0.02);
  } else {
    // the error bound stays below sheet-metal wall thickness no matter how
    // tight the budget gets: collapsed channel walls look far worse than a
    // slightly higher triangle count
    const err = Math.min(0.03, 0.18 / maxDim);
    mesh = simplify(welded, Math.max(300, Math.round(Math.max(400, raw / 8) * scale2)), err);
  }
  return compact(mesh);
}
const partCache = new Map();
function partFor(scope) {
  let p = partCache.get(scope);
  if (!p) {
    p = scopeLocalMesh(scope);
    const info = scopeInfo(scope);
    const sz = info.size.slice().sort((a, b) => a - b);
    p.round = sz[2] > 3 && Math.abs(sz[2] - sz[1]) < sz[2] * 0.06 && sz[0] < sz[2] * 0.45;
    partCache.set(scope, p);
  }
  return p;
}
// Two-pass budget: measure at scale 1, then shrink per-part targets so the
// instanced total fits under the triangle cap.
const drawCount = new Map();
for (const d of chassisDraws) drawCount.set(d.scope, (drawCount.get(d.scope) || 0) + 1);
const CAP = 168000;
let budgetScale = 1;
const meshCache = new Map();
for (let pass = 0; pass < 6; pass++) {
  meshCache.clear();
  let total = 0;
  for (const [scope, n] of drawCount) {
    const mesh = budgetedMesh(partFor(scope), budgetScale);
    meshCache.set(scope, mesh);
    total += (mesh.idx.length / 3) * n;
  }
  console.log("budget pass", pass, "scale", +budgetScale.toFixed(3), "instanced tris", total);
  if (total <= CAP) break;
  budgetScale *= (CAP / total) * 0.97;
}
function meshFor(scope) {
  return meshCache.get(scope);
}
const chassisPos = [];
const chassisIdx = [];
for (const d of chassisDraws) {
  const mesh = meshFor(d.scope);
  if (!mesh.idx.length) continue;
  const m = mul4(F2G, d.m);
  const base = chassisPos.length / 3;
  for (let i = 0; i < mesh.pos.length; i += 3) {
    const x = mesh.pos[i], y = mesh.pos[i + 1], z = mesh.pos[i + 2];
    chassisPos.push(
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    );
  }
  for (const i of mesh.idx) chassisIdx.push(base + i);
}
let chassisMesh = { idx: new Uint32Array(chassisIdx), pos: new Float32Array(chassisPos) };
// a light global pass welds coincident vertices across part instances and
// shaves what that frees up, at ~1 mm error
{
  const rewelded = dropDegenerate(weld(Array.from(expandSoup(chassisMesh))));
  chassisMesh = compact(simplify(rewelded, Math.ceil(rewelded.idx.length / 3 * 0.92), 0.0008));
}
console.log("instanced chassis tris", chassisMesh.idx.length / 3, "from", meshCache.size, "unique part meshes");
function expandSoup(mesh) {
  const out = new Float32Array(mesh.idx.length * 3);
  for (let i = 0; i < mesh.idx.length; i++) {
    const v = mesh.idx[i] * 3;
    out[i * 3] = mesh.pos[v];
    out[i * 3 + 1] = mesh.pos[v + 1];
    out[i * 3 + 2] = mesh.pos[v + 2];
  }
  return out;
}

// bounds (chassis + wheels) in the new frame, before scaling
let minB = [1e9, 1e9, 1e9], maxB = [-1e9, -1e9, -1e9];
for (let i = 0; i < chassisMesh.pos.length; i += 3) {
  for (let k = 0; k < 3; k++) {
    if (chassisMesh.pos[i + k] < minB[k]) minB[k] = chassisMesh.pos[i + k];
    if (chassisMesh.pos[i + k] > maxB[k]) maxB[k] = chassisMesh.pos[i + k];
  }
}
for (const w of wheels) {
  const c = mapPoint(w.center);
  for (let k = 0; k < 3; k++) {
    minB[k] = Math.min(minB[k], c[k] - w.radius);
    maxB[k] = Math.max(maxB[k], c[k] + w.radius);
  }
}
const lengthCm = maxB[2] - minB[2];
const scale = 1.6 / lengthCm;
const zMid = (minB[2] + maxB[2]) / 2; // center the robot along its length
console.log("bounds (cm)", minB.map((v) => +v.toFixed(1)), maxB.map((v) => +v.toFixed(1)), "scale", +scale.toFixed(5));

// wheel mesh from the ground-wheel component world, pre-pivoted: axle through
// the origin along +X (in the GLB frame)
const wheelScope = wheels[0].draw.scope;
const wheelSoupLocal = [];
collectScope(wheelScope, wheelSoupLocal, I4, 0);
const wInfo = scopeInfo(wheelScope);
{
  const sizes = wInfo.size.slice().sort((a, b) => a - b);
  const axleLocal = wInfo.size.indexOf(sizes[0]);
  const c = wInfo.center;
  for (let i = 0; i < wheelSoupLocal.length; i += 3) {
    let x = wheelSoupLocal[i] - c[0], y = wheelSoupLocal[i + 1] - c[1], z = wheelSoupLocal[i + 2] - c[2];
    if (axleLocal === 1) [x, y] = [y, -x];
    else if (axleLocal === 2) [x, z] = [z, -x];
    wheelSoupLocal[i] = x;
    wheelSoupLocal[i + 1] = y;
    wheelSoupLocal[i + 2] = z;
  }
}
const wheelMesh = computeNormals(compact(simplify(dropDegenerate(weld(wheelSoupLocal)), 2600, 0.012)));
chassisMesh = computeNormals(chassisMesh);
console.log("simplified tris: chassis", chassisMesh.idx.length / 3, "wheel", wheelMesh.idx.length / 3);

// bake scale + centering into the meshes
function bake(mesh, s2) {
  for (let i = 0; i < mesh.pos.length; i += 3) {
    mesh.pos[i] *= s2;
    mesh.pos[i + 1] *= s2;
    mesh.pos[i + 2] = (mesh.pos[i + 2] - zMid) * s2;
  }
  return mesh;
}
bake(chassisMesh, scale);
for (let i = 0; i < wheelMesh.pos.length; i += 3) {
  wheelMesh.pos[i] *= scale;
  wheelMesh.pos[i + 1] *= scale;
  wheelMesh.pos[i + 2] *= scale;
}

const wheelNodes = wheels.map((w, i) => {
  const c = mapPoint(w.center);
  return {
    name: `wheel_${c[0] < 0 ? "left" : "right"}_${i}`,
    side: c[0] < 0 ? "left" : "right",
    translation: [c[0] * scale, c[1] * scale, (c[2] - zMid) * scale],
    wheel: w,
  };
});
const meta = {
  boundsSize: [maxB[0] - minB[0], maxB[1] - minB[1], lengthCm].map((v) => v * scale),
  length: 1.6,
  wheels: wheelNodes.map((wn) => {
    const d = mapDir(wn.wheel.axle);
    return {
      axleDirection: d[0] < 0 ? d.map((v) => -v) : d,
      axlePosition: wn.translation,
      radius: wn.wheel.radius * scale,
      side: wn.side,
    };
  }),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
writeGlb(path.join(OUT_DIR, "robot.glb"), chassisMesh, wheelMesh, wheelNodes, meta);
fs.writeFileSync(path.join(OUT_DIR, "robot-meta.json"), JSON.stringify(meta, null, 2) + "\n");

const glbSize = fs.statSync(path.join(OUT_DIR, "robot.glb")).size;
const renderedTris = chassisMesh.idx.length / 3 + (wheelMesh.idx.length / 3) * wheelNodes.length;
console.log("---");
console.log("chassis draws:", chassisDraws.length, "unique part meshes:", meshCache.size);
console.log("triangles out (rendered):", renderedTris);
console.log("wheels:", meta.wheels.length, "radius", +meta.wheels[0].radius.toFixed(4));
console.log("robot.glb:", (glbSize / 1e6).toFixed(2), "MB");
console.log("done in", ((Date.now() - t0) / 1000).toFixed(1), "s");
