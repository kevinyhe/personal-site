// Extract the VEX robot model from the Fusion 360 archive "sexy s bot.f3z" and
// write public/model/robot/robot.glb plus robot-meta.json.
//
// Run manually from the repo root (the f3z is untracked and must be present):
//   node scripts/extract-robot.mjs ["path/to/sexy s bot.f3z"]
//
// What it does and why:
// The f3z is a zip of .f3d files (each itself a zip; entries are Zstandard-
// compressed, which node's zlib handles). The main .f3d carries an Autodesk OGS
// scene dump: a 79 MB "world" stream plus a 37 MB vertex/index blob
// (Fusion_mesh_000). The world stream stores each COMPONENT's tessellation in
// the component's own local frame; the assembled placement lives in an override
// table that references nodes by ids which, for cross-file (XRef) parts, are not
// resolvable from this archive alone. The design's saved state is also not an
// assembled robot (the embedded thumbnail shows a collapsed pile of channels
// plus VEX Push Back field elements). So instead of reproducing the saved
// scene, this script extracts the cleanly-tessellated PART meshes (C-channels,
// 2.75" flex wheels, plates, a sprocket - the user's own modeled geometry) and
// assembles a canonical four-wheel VEX drive base from them with explicit
// matrices.
//
// Output frame: +Z forward, +Y up, ground plane at y = 0, uniform scale such
// that the robot's forward extent (length) is exactly 1.6 units. Wheels are
// separate GLB nodes sharing one mesh, pre-pivoted so that node.rotation.x
// spins them about their axle.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { MeshoptSimplifier } from "meshoptimizer/meshopt_simplifier.module.js";

const SRC = process.argv[2] ?? path.resolve("sexy s bot.f3z");
const OUT_DIR = path.resolve("public/model/robot");
const t0 = Date.now();

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
// World stream parsing. Strings are length-prefixed UTF-16LE. We only need a
// few record types; everything is located by byte-pattern search.
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

function buildScene(world, blobLen) {
  // Scope tree. ARenderList and SingleNodeWorld open a scope; each is closed by
  // one WorldSerializerEndMark.
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

  // Instance / Component records: a u64 big-endian id sits 17 bytes before the
  // type string. The nearest preceding TransformAttribute is the node's local
  // placement inside its parent world.
  const instRecs = [];
  for (const n of ["Instance", "Component"]) {
    for (const at of findAll(world, namePat(n))) {
      if (at < 17) continue;
      const hi = world.readUInt32BE(at - 17);
      const lo = world.readUInt32BE(at - 13);
      instRecs.push({ at, id: hi === 0 ? lo : null, type: n });
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

  // GroupNode hexid strings; a component's world is serialized once, at the
  // first instance. Later instances carry a stub SingleNodeWorld whose root
  // GroupNode hexid points back to the definition. Map hexid -> largest scope
  // that starts right after any occurrence of that hexid.
  const gnPat = namePat("GroupNode");
  const gnPositions = findAll(world, gnPat);
  const hexidAt = (o) => (world.readUInt32LE(o) === 16 ? world.toString("utf16le", o + 4, o + 36) : null);
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
  const snwSorted = scopes.filter((s) => s.kind === "SingleNodeWorld").sort((a, b) => a.at - b.at);
  const ownedScopes = new Set();
  for (const r of instRecs) {
    const s = snwSorted.find((x) => x.at > r.at && x.at < r.at + 600);
    if (!s) { r.target = null; continue; }
    ownedScopes.add(s);
    const g = gnPositions.find((x) => x > s.at && x < s.at + 60);
    const rootHex = g !== undefined ? hexidAt(g + gnPat.length) : null;
    let t = rootHex ? hexScope.get(rootHex) : null;
    if (!t || t.end - t.at <= s.end - s.at) t = s;
    r.target = t;
  }

  // Face records. Full form: fixed 57-byte prefix after the name, then
  // [vbOffset][posFloats][nrmFloats][uvFloats][idxCount][edgeCount][edges...]
  // [6 x f64 bbox]. The vertex data at vbOffset is interleaved
  // pos3+nrm3(+uv2) f32; the u32 index buffer follows the vertex data.
  // Reference form: no counts, just the bbox — the geometry was already
  // serialized for an identical face elsewhere and is recovered by exact bbox
  // match (identical faces share identical local-frame bounds).
  const facePat = namePat("Face");
  const fullFaces = [];
  const refFaces = [];
  const bboxKey = (b) => b.map((x) => x.toFixed(6)).join(",");
  for (const at of findAll(world, facePat)) {
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
      // reference form: the bbox starts a few bytes earlier (no count fields)
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
  return { instRecs, ownedScopes, scopes };
}

// ---------------------------------------------------------------------------
// Geometry collection: expand a component world into a triangle soup
// (positions + per-vertex normals), composing nested instance base transforms.
// ---------------------------------------------------------------------------
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
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function collectWorld(blob, scene, scope, out, m = I4, depth = 0) {
  if (depth > 16) return;
  for (const f of scope.faces || []) {
    const ibOff = f.off + (f.nv * 6 + f.uv * 2) * 4;
    const stride = f.uv ? 32 : 24;
    for (let i = 0; i < f.idx; i++) {
      const ix = blob.readUInt32LE(ibOff + 4 * i);
      if (ix >= f.nv) continue;
      const b = f.off + ix * stride;
      const x = blob.readFloatLE(b), y = blob.readFloatLE(b + 4), z = blob.readFloatLE(b + 8);
      const nx = blob.readFloatLE(b + 12), ny = blob.readFloatLE(b + 16), nz = blob.readFloatLE(b + 20);
      out.pos.push(
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      );
      out.nrm.push(
        m[0] * nx + m[4] * ny + m[8] * nz,
        m[1] * nx + m[5] * ny + m[9] * nz,
        m[2] * nx + m[6] * ny + m[10] * nz,
      );
    }
  }
  for (const r of scope.insts || []) {
    if (r.type !== "Instance" || !r.target || r.target === scope) continue;
    collectWorld(blob, scene, r.target, out, r.base ? mul4(m, r.base) : m, depth + 1);
  }
  for (const c of scope.children) {
    if (scene.ownedScopes.has(c)) continue;
    collectWorld(blob, scene, c, out, m, depth + 1);
  }
}

// ---------------------------------------------------------------------------
// Part selection by geometric signature (dimensions in cm, sorted ascending).
// ---------------------------------------------------------------------------
function worldDims(soup) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < soup.pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (soup.pos[i + k] < min[k]) min[k] = soup.pos[i + k];
      if (soup.pos[i + k] > max[k]) max[k] = soup.pos[i + k];
    }
  }
  return { max, min, size: [0, 1, 2].map((k) => max[k] - min[k]) };
}
function dimsMatch(size, want, tol) {
  const s = size.slice().sort((a, b) => a - b);
  return want.every((v, i) => Math.abs(s[i] - v) <= tol);
}

// ---------------------------------------------------------------------------
// Welding and simplification.
// ---------------------------------------------------------------------------
function weld(soup) {
  // Weld by position only, so the simplifier sees closed topology instead of
  // locked seams. Normals are recomputed after simplification.
  const key = new Map();
  const pos = [], idx = [];
  const np = soup.pos.length / 3;
  for (let i = 0; i < np; i++) {
    const px = soup.pos[i * 3], py = soup.pos[i * 3 + 1], pz = soup.pos[i * 3 + 2];
    const k = `${px.toFixed(4)},${py.toFixed(4)},${pz.toFixed(4)}`;
    let v = key.get(k);
    if (v === undefined) {
      v = pos.length / 3;
      key.set(k, v);
      pos.push(px, py, pz);
    }
    idx.push(v);
  }
  return { idx: new Uint32Array(idx), nrm: new Float32Array(pos.length), pos: new Float32Array(pos) };
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
  return { idx: new Uint32Array(res), nrm: mesh.nrm, pos: mesh.pos };
}
function compact(mesh) {
  // Drop vertices that are no longer referenced after simplification.
  const remap = new Int32Array(mesh.pos.length / 3).fill(-1);
  const pos = [], nrm = [], idx = [];
  for (const i of mesh.idx) {
    if (remap[i] < 0) {
      remap[i] = pos.length / 3;
      pos.push(mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]);
      nrm.push(mesh.nrm[i * 3], mesh.nrm[i * 3 + 1], mesh.nrm[i * 3 + 2]);
    }
    idx.push(remap[i]);
  }
  return { idx: new Uint32Array(idx), nrm: new Float32Array(nrm), pos: new Float32Array(pos) };
}
function transformMesh(mesh, m) {
  const pos = new Float32Array(mesh.pos.length);
  const nrm = new Float32Array(mesh.nrm.length);
  for (let i = 0; i < mesh.pos.length; i += 3) {
    const x = mesh.pos[i], y = mesh.pos[i + 1], z = mesh.pos[i + 2];
    pos[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    pos[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    pos[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const nx = mesh.nrm[i], ny = mesh.nrm[i + 1], nz = mesh.nrm[i + 2];
    nrm[i] = m[0] * nx + m[4] * ny + m[8] * nz;
    nrm[i + 1] = m[1] * nx + m[5] * ny + m[9] * nz;
    nrm[i + 2] = m[2] * nx + m[6] * ny + m[10] * nz;
  }
  return { idx: mesh.idx, nrm, pos };
}
function mergeMeshes(meshes) {
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.pos.length; ni += m.idx.length; }
  const pos = new Float32Array(nv), nrm = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const m of meshes) {
    pos.set(m.pos, vo * 3);
    nrm.set(m.nrm, vo * 3);
    for (let i = 0; i < m.idx.length; i++) idx[io + i] = m.idx[i] + vo;
    vo += m.pos.length / 3;
    io += m.idx.length;
  }
  return { idx, nrm, pos };
}
function clipToLocalRange(mesh, axis, lo, hi) {
  // Keep triangles fully inside [lo, hi] on the given axis. Channel parts are
  // extrusions, so the ragged cut reads as an open channel end.
  const keep = [];
  for (let t = 0; t < mesh.idx.length; t += 3) {
    let ok = true;
    for (let k = 0; k < 3; k++) {
      const v = mesh.pos[mesh.idx[t + k] * 3 + axis];
      if (v < lo || v > hi) { ok = false; break; }
    }
    if (ok) keep.push(mesh.idx[t], mesh.idx[t + 1], mesh.idx[t + 2]);
  }
  return compact({ idx: new Uint32Array(keep), nrm: mesh.nrm, pos: mesh.pos });
}
function centerMesh(mesh) {
  const d = worldDims({ pos: mesh.pos });
  const c = [0, 1, 2].map((k) => (d.min[k] + d.max[k]) / 2);
  const pos = new Float32Array(mesh.pos.length);
  for (let i = 0; i < mesh.pos.length; i += 3) {
    pos[i] = mesh.pos[i] - c[0];
    pos[i + 1] = mesh.pos[i + 1] - c[1];
    pos[i + 2] = mesh.pos[i + 2] - c[2];
  }
  return { idx: mesh.idx, nrm: mesh.nrm, pos };
}

// Rotation helpers producing column-major 4x4s.
function mat(rotCols, t = [0, 0, 0]) {
  const [cx, cy, cz] = rotCols;
  return [cx[0], cx[1], cx[2], 0, cy[0], cy[1], cy[2], 0, cz[0], cz[1], cz[2], 0, t[0], t[1], t[2], 1];
}

// ---------------------------------------------------------------------------
// GLB writer (glTF 2.0, two meshes, three materials, embedded meta as extras).
// ---------------------------------------------------------------------------
function writeGlb(filePath, chassis, wheel, wheelNodes, meta) {
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
  function meshPrims(mesh, materialGroups) {
    // materialGroups: [{material, idx}] sharing this mesh's vertex accessors
    const posAcc = addAccessor(mesh.pos, "VEC3", 5126, 34962);
    const nrmAcc = addAccessor(mesh.nrm, "VEC3", 5126, 34962);
    return materialGroups.map((g) => ({
      attributes: { NORMAL: nrmAcc, POSITION: posAcc },
      indices: addAccessor(g.idx, "SCALAR", 5125, 34963),
      material: g.material,
    }));
  }
  const materials = [
    { name: "aluminum", pbrMetallicRoughness: { baseColorFactor: [0.79, 0.8, 0.82, 1], metallicFactor: 0.85, roughnessFactor: 0.4 } },
    { name: "rubber", pbrMetallicRoughness: { baseColorFactor: [0.082, 0.082, 0.082, 1], metallicFactor: 0, roughnessFactor: 0.95 } },
    { name: "polycarb", pbrMetallicRoughness: { baseColorFactor: [0.125, 0.14, 0.165, 1], metallicFactor: 0.1, roughnessFactor: 0.5 } },
  ];
  const meshes = [
    { name: "chassis", primitives: meshPrims(chassis.mesh, chassis.groups) },
    { name: "wheel", primitives: meshPrims(wheel.mesh, wheel.groups) },
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
const mainEntry = outer.find((e) => e.name === manifest.root);
const f3d = zipRead(f3z, mainEntry);
const inner = zipEntries(f3d);
const world = zipRead(f3d, inner.find((e) => /DefaultScene\/world$/.test(e.name)));
const blob = zipRead(f3d, inner.find((e) => /DefaultScene\/Fusion_mesh_000$/.test(e.name)));
console.log("world", world.length, "bytes; mesh blob", blob.length, "bytes");

const scene = buildScene(world, blob.length);
console.log("scopes", scene.scopes.length, "instance records", scene.instRecs.length);

// Gather every distinct instance-target component world with its geometry.
const targets = new Map();
for (const r of scene.instRecs) {
  if (r.target && !targets.has(r.target)) targets.set(r.target, r);
}
const parts = [];
for (const [scope] of targets) {
  const soup = { nrm: [], pos: [] };
  collectWorld(blob, scene, scope, soup);
  if (soup.pos.length / 9 < 100) continue;
  parts.push({ dims: worldDims(soup), scope, soup, tris: soup.pos.length / 9 });
}
console.log("candidate part worlds", parts.length);

// Pick parts by dimensional signature (cm). Among matches take the densest
// tessellation (first serialization is the cleanest).
function pick(label, want, tol) {
  const hits = parts.filter((p) => dimsMatch(p.dims.size, want, tol));
  if (!hits.length) throw new Error("no part world matches " + label);
  hits.sort((a, b) => b.tris - a.tris);
  const p = hits[0];
  console.log(label, "-> world@" + p.scope.at, p.tris, "tris, dims", p.dims.size.map((x) => +x.toFixed(2)).join("x"));
  return p;
}
const partChannel = pick("C-channel 17.5\"", [1.4, 2.54, 44.7], 0.35); // 1x2x1 C-channel
const partWheel = pick("2.75\" flex wheel", [1.27, 6.82, 6.82], 0.3);
const partPlate = pick("flat plate", [0.61, 6.32, 11.4], 0.3);
const partSprocket = pick("sprocket", [1.33, 9.83, 9.88], 0.3);

// Weld + simplify each part once; instances share the result.
const chanFull = dropDegenerate(weld(partChannel.soup));
const wheelFull = dropDegenerate(weld(partWheel.soup));
const plateFull = dropDegenerate(weld(partPlate.soup));
const sprocketFull = dropDegenerate(weld(partSprocket.soup));
console.log("welded tris: channel", chanFull.idx.length / 3, "wheel", wheelFull.idx.length / 3, "plate", plateFull.idx.length / 3, "sprocket", sprocketFull.idx.length / 3);
const chan = computeNormals(compact(simplify(chanFull, 9000, 0.05)));
// Wheels keep a tighter error bound so the tread stays round.
const wheelMesh0 = computeNormals(compact(simplify(wheelFull, 20000, 0.012)));
const plate = computeNormals(compact(simplify(plateFull, 1500, 0.05)));
const sprocket = computeNormals(compact(simplify(sprocketFull, 9000, 0.02)));
console.log("simplified tris: channel", chan.idx.length / 3, "wheel", wheelMesh0.idx.length / 3, "plate", plate.idx.length / 3, "sprocket", sprocket.idx.length / 3);

// ---------------------------------------------------------------------------
// Assembly (cm; +Z forward, +Y up, ground at y=0; scaled at the end).
// Channel local frame: x = 2.54 across the web, y = length, z = 1.4 flange
// depth. Wheel local frame: x = axle, y/z = radial.
// ---------------------------------------------------------------------------
const chanC = centerMesh(chan);
const plateC = centerMesh(plate);
// Wheel: rotate so the axle (the thinnest local axis) lies along +X, making
// node.rotation.x the spin axis, then center on the axle.
let wheelC = centerMesh(wheelMesh0);
{
  const size = worldDims({ pos: wheelC.pos }).size;
  const axle = size.indexOf(Math.min(...size));
  if (axle === 2) wheelC = transformMesh(wheelC, mat([[0, 0, -1], [0, 1, 0], [1, 0, 0]]));
  else if (axle === 1) wheelC = transformMesh(wheelC, mat([[0, -1, 0], [1, 0, 0], [0, 0, 1]]));
  wheelC = centerMesh(wheelC);
}
const wheelRadius = worldDims({ pos: wheelC.pos }).size[1] / 2;
const axleY = wheelRadius; // wheels touch the ground at y=0

// Side rails: length along Z, web vertical (local x -> world y).
const railX = 12.5;
const railMid = axleY + 0.2;
const sideL = mat([[0, 1, 0], [0, 0, 1], [1, 0, 0]], [-railX, railMid, 0]);
const sideR = mat([[0, 1, 0], [0, 0, 1], [1, 0, 0]], [railX, railMid, 0]);
// Cross rails: same channel clipped so the ends land on the side rails, on
// edge like the rails, sitting on top of them.
const crossHalf = 12.55;
const chanClipped = clipToLocalRange(chanC, 1, -crossHalf, crossHalf);
const crossY = railMid + 2.54 / 2 + 2.54 / 2;
const crossF = mat([[0, 1, 0], [1, 0, 0], [0, 0, 1]], [0, crossY, 10]);
const crossB = mat([[0, 1, 0], [1, 0, 0], [0, 0, 1]], [0, crossY, -10]);
const crossM = mat([[0, 1, 0], [1, 0, 0], [0, 0, 1]], [0, crossY, 0]);
// Top plate: flat on the middle cross rail.
const plateM = mat([[0, 1, 0], [0, 0, 1], [1, 0, 0]], [0, crossY + 2.54 / 2 + 0.05, 0]);
// Upper structure: two vertical channel stubs at the rear carrying a second
// plate and the drivetrain sprocket mounted between them like a flywheel.
const towerHalf = 8;
const chanStub = clipToLocalRange(chanC, 1, -towerHalf, towerHalf);
const towerZ = -10;
const towerCenterY = crossY + towerHalf - 1; // bottom sits on the cross rail
const towerTopY = towerCenterY + towerHalf;
const towerL = mat([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [-6.5, towerCenterY, towerZ]);
const towerR = mat([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [6.5, towerCenterY, towerZ]);
const plateTopM = mat([[0, 1, 0], [0, 0, 1], [1, 0, 0]], [0, towerTopY + 0.4, towerZ]);
// Sprocket: disc in the YZ plane (axle along X) between the towers.
const sprocketC = (() => {
  let m = centerMesh(sprocket);
  const size = worldDims({ pos: m.pos }).size;
  const axle = size.indexOf(Math.min(...size));
  if (axle === 2) m = transformMesh(m, mat([[0, 0, -1], [0, 1, 0], [1, 0, 0]]));
  else if (axle === 1) m = transformMesh(m, mat([[0, -1, 0], [1, 0, 0], [0, 0, 1]]));
  return centerMesh(m);
})();
const sprocketM = mat([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, towerCenterY + 2, towerZ + 4.5]);

const chassisMesh = mergeMeshes([
  transformMesh(chanC, sideL),
  transformMesh(chanC, sideR),
  transformMesh(chanClipped, crossF),
  transformMesh(chanClipped, crossB),
  transformMesh(chanClipped, crossM),
  transformMesh(chanStub, towerL),
  transformMesh(chanStub, towerR),
  transformMesh(sprocketC, sprocketM),
  transformMesh(plateC, plateM),
  transformMesh(plateC, plateTopM),
]);
// index ranges: everything up to the sprocket is aluminum, the sprocket and
// the two plates are polycarb
const plateIdxLen = plateC.idx.length * 2;
const polyIdxLen = plateIdxLen + sprocketC.idx.length;
const chassisAluIdx = chassisMesh.idx.subarray(0, chassisMesh.idx.length - polyIdxLen);
const chassisPlateIdx = chassisMesh.idx.subarray(chassisMesh.idx.length - polyIdxLen);

const wheelZ = 17;
const wheelX = railX + 1.4 / 2 + 1.33 / 2 + 0.1;
const wheelPositions = [
  { name: "wheel_left_front", side: "left", x: -wheelX, z: wheelZ },
  { name: "wheel_right_front", side: "right", x: wheelX, z: wheelZ },
  { name: "wheel_left_back", side: "left", x: -wheelX, z: -wheelZ },
  { name: "wheel_right_back", side: "right", x: wheelX, z: -wheelZ },
];

// Overall bounds before scaling (chassis + wheel extents).
const chassisDims = worldDims({ pos: chassisMesh.pos });
const wheelHalf = worldDims({ pos: wheelC.pos }).size.map((v) => v / 2);
let minB = chassisDims.min.slice(), maxB = chassisDims.max.slice();
for (const wp of wheelPositions) {
  const wMin = [wp.x - wheelHalf[0], axleY - wheelRadius, wp.z - wheelHalf[2]];
  const wMax = [wp.x + wheelHalf[0], axleY + wheelRadius, wp.z + wheelHalf[2]];
  for (let k = 0; k < 3; k++) {
    if (wMin[k] < minB[k]) minB[k] = wMin[k];
    if (wMax[k] > maxB[k]) maxB[k] = wMax[k];
  }
}
const lengthCm = maxB[2] - minB[2];
const scale = 1.6 / lengthCm;
console.log("assembled bounds (cm)", minB.map((x) => +x.toFixed(1)), maxB.map((x) => +x.toFixed(1)), "scale", scale.toFixed(5));

// Bake scale (and ground shift: minB.y -> 0) into the chassis; wheels are baked
// with scale only and positioned via node translations.
function bake(mesh, s, dy) {
  const pos = new Float32Array(mesh.pos.length);
  for (let i = 0; i < mesh.pos.length; i += 3) {
    pos[i] = mesh.pos[i] * s;
    pos[i + 1] = (mesh.pos[i + 1] - dy) * s;
    pos[i + 2] = mesh.pos[i + 2] * s;
  }
  return { idx: mesh.idx, nrm: mesh.nrm, pos };
}
const groundY = 0; // wheels already rest on y=0 by construction
const chassisFinal = bake(chassisMesh, scale, groundY);
const wheelFinal = bake(wheelC, scale, 0);
const wheelNodes = wheelPositions.map((wp) => ({
  name: wp.name,
  translation: [wp.x * scale, axleY * scale, wp.z * scale],
}));

const meta = {
  boundsSize: [(maxB[0] - minB[0]) * scale, (maxB[1] - minB[1]) * scale, lengthCm * scale],
  length: 1.6,
  wheels: wheelPositions.map((wp) => ({
    axleDirection: [1, 0, 0],
    axlePosition: [wp.x * scale, axleY * scale, wp.z * scale],
    radius: wheelRadius * scale,
    side: wp.side,
  })),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
writeGlb(
  path.join(OUT_DIR, "robot.glb"),
  { groups: [{ idx: new Uint32Array(chassisAluIdx), material: 0 }, { idx: new Uint32Array(chassisPlateIdx), material: 2 }], mesh: chassisFinal },
  { groups: [{ idx: wheelFinal.idx, material: 1 }], mesh: wheelFinal },
  wheelNodes,
  meta,
);
fs.writeFileSync(path.join(OUT_DIR, "robot-meta.json"), JSON.stringify(meta, null, 2) + "\n");

const glbSize = fs.statSync(path.join(OUT_DIR, "robot.glb")).size;
const renderedTris = chassisFinal.idx.length / 3 + (wheelFinal.idx.length / 3) * 4;
console.log("---");
console.log("vertices in (raw soup):", (partChannel.soup.pos.length + partWheel.soup.pos.length + partPlate.soup.pos.length) / 3);
console.log("triangles out (rendered):", renderedTris);
console.log("wheels:", meta.wheels.length, "radius", +meta.wheels[0].radius.toFixed(4));
console.log("robot.glb:", (glbSize / 1e6).toFixed(2), "MB");
console.log("done in", ((Date.now() - t0) / 1000).toFixed(1), "s");
