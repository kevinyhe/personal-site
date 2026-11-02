// Bakes a scanned statue as stone cut into solid chunks, for
// components/luke/FrescoBreak.tsx (the stage loads /models/statue/):
//
//   node scripts/bake-statue-chunks.mjs --glb scripts/statue-src/apollo-daphne-stanetti.glb
//        [--cut -2.1] [--target 160000] [--spacing 0.1] [--inset 0.04] [--origin-dir -0.6,1,0] [--yaw 0] [--seed 7] [--dump mesh.json] [--out dir]
//
// The glb is read with its node transforms (so it stands y-up as on
// Sketchfab) and welded by position into one closed surface. `--cut y`
// takes everything below that height off (the pedestal) by cutting the
// mesh in two with one plane and keeping the top, capped. The surface is
// then simplified to about `target` triangles (meshoptimizer), stood on
// the origin one unit wide, and cut into the Voronoi cells of seeds laid
// over its surface `spacing` apart and pushed `inset` inward (both as
// fractions of the statue's height, so a tall narrow statue breaks into
// as many pieces as a squat one)
// (scripts/voronoi-fracture.mjs). The bake is unpainted: the page shades
// every face as plain stone off its own normals.
//
// Pieces of the scan not joined to the statue (specks, under 0.2% of its
// triangles) are dropped. The break starts at `origin`: the statue's
// farthest point along `origin-dir` (default straight up; for a statue
// whose raised hand is not its top, lean the direction toward it).
// Writes public/models/statue/chunks.bin + chunks.json and prints the audit: chunk
// count, chunk volume against the statue's (must match to 0.01%), open
// edges, dust.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MeshoptSimplifier } from "meshoptimizer";

import { fractureMesh, packChunks } from "./voronoi-fracture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : [])).filter((e) => e.length));
if (!args.glb) { console.error("--glb <file> is required"); process.exit(1); }
const GLB = path.resolve(args.glb);
const CUT = args.cut === undefined ? null : Number(args.cut);
const TARGET = Number(args.target ?? 160000);
const ORIGIN_DIR = (args["origin-dir"] ?? "0,1,0").split(",").map(Number);
/** Degrees to turn the statue about its upright axis so its front faces the page's camera (+z). */
const YAW = Number(args.yaw ?? 0);
const SPACING = Number(args.spacing ?? 0.1);
const INSET = Number(args.inset ?? 0.04);
const SEED = Number(args.seed ?? 7);
const OUT = args.out ? path.resolve(args.out) : path.join(here, "..", "public", "models", "statue");

// ---------------------------------------------------------------- the glb, welded, standing as on Sketchfab
function loadGlb(file) {
  const b = fs.readFileSync(file);
  if (b.toString("latin1", 0, 4) !== "glTF") throw new Error("not a glb");
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bl = b.readUInt32LE(20 + jl);
  const bin = b.subarray(28 + jl, 28 + jl + bl);
  const acc = (i) => {
    const a = j.accessors[i];
    const bv = j.bufferViews[a.bufferView];
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    if (bv.byteStride && bv.byteStride !== comps * T.BYTES_PER_ELEMENT) throw new Error("interleaved accessor");
    return new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * comps * T.BYTES_PER_ELEMENT));
  };
  // Node world matrices, column-major, from the scene roots down.
  const mul = (A, B) => { const C = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) C[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]; return C; };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const trs = (n) => {
    if (n.matrix) return n.matrix;
    const [tx, ty, tz] = n.translation ?? [0, 0, 0];
    const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = n.scale ?? [1, 1, 1];
    const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
    return [
      (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
      2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
      2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
      tx, ty, tz, 1,
    ];
  };
  const world = new Map();
  const walk = (ni, parent) => { const n = j.nodes[ni]; const w = mul(parent, trs(n)); world.set(ni, w); for (const c of n.children ?? []) walk(c, w); };
  for (const r of j.scenes[j.scene ?? 0].nodes) walk(r, I);
  const key = new Map();
  const pos = [], idx = [];
  let raw = 0;
  for (const [ni, w] of world) {
    const n = j.nodes[ni];
    if (n.mesh === undefined) continue;
    for (const p of j.meshes[n.mesh].primitives) {
      if (p.mode !== undefined && p.mode !== 4) continue;
      const P = acc(p.attributes.POSITION);
      const ix = p.indices !== undefined ? acc(p.indices) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
      const map = new Int32Array(P.length / 3);
      raw += P.length / 3;
      for (let v = 0; v < P.length / 3; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        const X = w[0] * x + w[4] * y + w[8] * z + w[12], Y = w[1] * x + w[5] * y + w[9] * z + w[13], Z = w[2] * x + w[6] * y + w[10] * z + w[14];
        const k = `${X.toFixed(5)},${Y.toFixed(5)},${Z.toFixed(5)}`;
        let id = key.get(k);
        if (id === undefined) { id = pos.length / 3; key.set(k, id); pos.push(X, Y, Z); }
        map[v] = id;
      }
      for (let i = 0; i < ix.length; i += 3) {
        const a = map[ix[i]], b2 = map[ix[i + 1]], c = map[ix[i + 2]];
        if (a !== b2 && b2 !== c && a !== c) idx.push(a, b2, c);
      }
    }
  }
  console.log(`${path.basename(file)}: ${idx.length / 3} triangles, ${pos.length / 3} vertices welded from ${raw}`);
  return { pos: Float64Array.from(pos), idx: Uint32Array.from(idx) };
}

const bounds = (pos) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
  return { lo, hi };
};
/** Drops duplicate triangles, then at every edge shared by more than two triangles all but two, then one of any two that run an edge the same way (a scan's and the simplifier's few bad spots break the cut's loops). */
const cleanMesh = (idx) => {
  const V = 1e7;
  const ekey = (a, c) => (a < c ? a * V + c : c * V + a);
  const seen = new Set();
  const keep = [];
  let dup = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const t = [idx[i], idx[i + 1], idx[i + 2]].sort((a, b) => a - b).join(",");
    if (seen.has(t)) { dup++; continue; }
    seen.add(t);
    keep.push(i);
  }
  let dropped = 0;
  for (let pass = 0; pass < 8; pass++) {
    const use = new Map();
    for (const i of keep) for (let k = 0; k < 3; k++) { const e = ekey(idx[i + k], idx[i + ((k + 1) % 3)]); use.set(e, (use.get(e) || 0) + 1); }
    const bad = keep.map((i) => { let n = 0; for (let k = 0; k < 3; k++) if (use.get(ekey(idx[i + k], idx[i + ((k + 1) % 3)])) > 2) n++; return n; });
    if (!bad.some((n) => n)) break;
    // Drop the worst triangle on each over-shared edge, one per edge per pass.
    const doneEdge = new Set();
    const drop = new Set();
    keep.forEach((i, t) => {
      if (!bad[t]) return;
      for (let k = 0; k < 3; k++) {
        const e = ekey(idx[i + k], idx[i + ((k + 1) % 3)]);
        if (use.get(e) <= 2 || doneEdge.has(e)) continue;
        let worst = -1, wn = -1;
        keep.forEach((j, u) => { if (drop.has(u)) return; for (let q = 0; q < 3; q++) if (ekey(idx[j + q], idx[j + ((q + 1) % 3)]) === e && bad[u] > wn) { wn = bad[u]; worst = u; } });
        if (worst >= 0) { drop.add(worst); doneEdge.add(e); }
      }
    });
    for (const t of drop) keep[t] = -1;
    for (let t = keep.length - 1; t >= 0; t--) if (keep[t] < 0) keep.splice(t, 1);
    dropped += drop.size;
  }
  // Two triangles running a shared edge the same way (one is flipped): drop the one with more such edges.
  let flipped = 0;
  for (let pass = 0; pass < 8; pass++) {
    const dirUse = new Map();
    for (const i of keep) for (let k = 0; k < 3; k++) { const e = idx[i + k] * V + idx[i + ((k + 1) % 3)]; dirUse.set(e, (dirUse.get(e) || 0) + 1); }
    const bad = keep.map((i) => { let n = 0; for (let k = 0; k < 3; k++) if (dirUse.get(idx[i + k] * V + idx[i + ((k + 1) % 3)]) > 1) n++; return n; });
    if (!bad.some((n) => n)) break;
    const drop = new Set();
    const doneEdge = new Set();
    keep.forEach((i, t) => {
      if (!bad[t]) return;
      for (let k = 0; k < 3; k++) {
        const e = idx[i + k] * V + idx[i + ((k + 1) % 3)];
        if (dirUse.get(e) <= 1 || doneEdge.has(e)) continue;
        let worst = -1, wn = -1;
        keep.forEach((j, u) => { if (drop.has(u)) return; for (let q = 0; q < 3; q++) if (idx[j + q] * V + idx[j + ((q + 1) % 3)] === e && bad[u] > wn) { wn = bad[u]; worst = u; } });
        if (worst >= 0) { drop.add(worst); doneEdge.add(e); }
      }
    });
    for (const t of drop) keep[t] = -1;
    for (let t = keep.length - 1; t >= 0; t--) if (keep[t] < 0) keep.splice(t, 1);
    flipped += drop.size;
  }
  const out = new Uint32Array(keep.length * 3);
  keep.forEach((i, t) => { out[t * 3] = idx[i]; out[t * 3 + 1] = idx[i + 1]; out[t * 3 + 2] = idx[i + 2]; });
  return { idx: out, dup, dropped, flipped };
};
/** Fans a triangle over every boundary loop (a hole the cleaning left), run the opposite way to the boundary so the skin stays consistent. */
const fillHoles = (idx) => {
  const dir = new Set();
  for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) dir.add(idx[i + k] + ">" + idx[i + ((k + 1) % 3)]);
  // Boundary edges a->b (no b->a), several allowed per vertex: a loop may pinch.
  const next = new Map();
  for (const e of dir) { const [a, b] = e.split(">").map(Number); if (!dir.has(b + ">" + a)) { if (!next.has(a)) next.set(a, []); next.get(a).push(b); } }
  const add = [];
  let holes = 0;
  for (const [start] of next) {
    while (next.get(start)?.length) {
      const loop = [start];
      let v = start;
      let guard = 0;
      while (guard++ < 100000) {
        const outs = next.get(v);
        if (!outs?.length) break;
        const b = outs.shift();
        if (b === start) break;
        loop.push(b);
        v = b;
      }
      if (v !== start && !(next.get(v)?.length === 0 && loop.length >= 3)) { if (loop.length < 3) break; }
      if (loop.length < 3) continue;
      holes++;
      // Boundary edge a->b has no b->a triangle: the new one runs b->a.
      for (let k = 1; k < loop.length - 1; k++) add.push(loop[0], loop[k + 1], loop[k]);
    }
  }
  const out = new Uint32Array(idx.length + add.length);
  out.set(idx); out.set(add, idx.length);
  return { idx: out, holes };
};
/** Drops connected pieces under `minShare` of the triangles: a scan's floating specks. */
const dropSpecks = (pos, idx, minShare) => {
  const V = pos.length / 3;
  const parent = new Int32Array(V).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < idx.length; i += 3) { const a = find(idx[i]); parent[find(idx[i + 1])] = a; parent[find(idx[i + 2])] = a; }
  const count = new Map();
  for (let i = 0; i < idx.length; i += 3) { const r = find(idx[i]); count.set(r, (count.get(r) || 0) + 1); }
  const keepRoot = new Set([...count].filter(([, n]) => n >= minShare * idx.length / 3).map(([r]) => r));
  const out = [];
  for (let i = 0; i < idx.length; i += 3) if (keepRoot.has(find(idx[i]))) out.push(idx[i], idx[i + 1], idx[i + 2]);
  return { idx: Uint32Array.from(out), pieces: count.size, kept: keepRoot.size };
};
const openEdges = (idx) => {
  const V = 1e7;
  const use = new Map();
  for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) { const a = idx[i + k], c = idx[i + ((k + 1) % 3)]; const e = a < c ? a * V + c : c * V + a; use.set(e, (use.get(e) || 0) + 1); }
  let open = 0;
  for (const n of use.values()) if (n % 2) open++;
  return open;
};

let { pos, idx } = loadGlb(GLB);
{ const c = cleanMesh(idx); idx = c.idx; console.log(`cleaned: ${c.dup} duplicate triangles, ${c.dropped} dropped at over-shared edges`); }
let { lo, hi } = bounds(pos);
console.log(`bounds x ${lo[0].toFixed(2)}..${hi[0].toFixed(2)} y ${lo[1].toFixed(2)}..${hi[1].toFixed(2)} z ${lo[2].toFixed(2)}..${hi[2].toFixed(2)}, open edges ${openEdges(idx)}`);

// ---------------------------------------------------------------- the pedestal off: one plane, keep the top, capped
if (CUT !== null) {
  const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  const span = hi[1] - lo[1];
  const seeds = [[cx, CUT + span, cz], [cx, CUT - span, cz]];
  const { chunks, stats, points } = fractureMesh({ pos, idx, nrm: new Float32Array(pos.length), uv: null, kind: null }, seeds);
  const top = chunks.filter((c) => c.seed === seeds[0]);
  const remap = new Map();
  const npos = [], nidx = [];
  const take = (id) => { let r = remap.get(id); if (r === undefined) { r = npos.length / 3; remap.set(id, r); npos.push(...points.getP(id)); } return r; };
  for (const ch of top) for (const p of ch.polys) for (let k = 1; k < p.ids.length - 1; k++) nidx.push(take(p.ids[0]), take(p.ids[k]), take(p.ids[k + 1]));
  pos = Float64Array.from(npos);
  idx = Uint32Array.from(nidx);
  ({ lo, hi } = bounds(pos));
  console.log(`cut at y = ${CUT}: kept ${top.length} piece(s) of ${chunks.length}, ${idx.length / 3} triangles, volume ${(top.reduce((s, c) => s + c.volume, 0) / stats.sourceVolume * 100).toFixed(1)}% of the scan, open edges ${openEdges(idx)}, broken loops ${stats.brokenLoops}`);
}

{ const d = dropSpecks(pos, idx, 0.002); idx = d.idx; console.log(`pieces: ${d.pieces}, kept ${d.kept}, ${idx.length / 3} triangles`); }

// ---------------------------------------------------------------- simpler
await MeshoptSimplifier.ready;
if (idx.length / 3 > TARGET) {
  const f32 = Float32Array.from(pos);
  const [sidx, err] = MeshoptSimplifier.simplify(idx, f32, 3, TARGET * 3, 0.02, []);
  // Drop the vertices the simplifier no longer uses.
  const remap = new Int32Array(pos.length / 3).fill(-1);
  let unique = 0;
  for (const i of sidx) if (remap[i] < 0) remap[i] = unique++;
  const npos = new Float64Array(unique * 3);
  for (let v = 0; v < remap.length; v++) { const r = remap[v]; if (r >= 0) { npos[r * 3] = pos[v * 3]; npos[r * 3 + 1] = pos[v * 3 + 1]; npos[r * 3 + 2] = pos[v * 3 + 2]; } }
  idx = Uint32Array.from(sidx, (i) => remap[i]);
  pos = npos;
  // The simplifier leaves a few bad spots; clean and refill until closed.
  let note = "";
  for (let pass = 0; pass < 6; pass++) {
    const c = cleanMesh(idx);
    const h = fillHoles(c.idx);
    idx = h.idx;
    note += `${pass ? "; " : ""}cleaned ${c.dup} duplicates, ${c.dropped} at over-shared edges, ${c.flipped} flipped, filled ${h.holes} holes`;
    if (openEdges(idx) === 0) break;
  }
  console.log(`simplified to ${idx.length / 3} triangles, ${unique} vertices, error ${(err * 100).toFixed(2)}% of the extent; ${note}; open edges ${openEdges(idx)}`);
  if (openEdges(idx)) { console.error("the simplified statue is not closed; raise --target"); process.exit(1); }
}

// ---------------------------------------------------------------- stood on the origin, one unit wide, facing +z
if (YAW) {
  const c = Math.cos((YAW * Math.PI) / 180), sn = Math.sin((YAW * Math.PI) / 180);
  for (let i = 0; i < pos.length; i += 3) { const x = pos[i], z = pos[i + 2]; pos[i] = c * x + sn * z; pos[i + 2] = -sn * x + c * z; }
}
({ lo, hi } = bounds(pos));
const width = hi[0] - lo[0];
const scale = 1 / width;
const mid = lo.map((v, k) => (v + hi[k]) / 2);
for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = (pos[i + k] - mid[k]) * scale;
const ASPECT = width / (hi[1] - lo[1]);
const DEPTH = (hi[2] - lo[2]) * scale;
let topV = 0, topD = -Infinity;
for (let i = 0; i < pos.length; i += 3) { const d = pos[i] * ORIGIN_DIR[0] + pos[i + 1] * ORIGIN_DIR[1] + pos[i + 2] * ORIGIN_DIR[2]; if (d > topD) { topD = d; topV = i / 3; } }
const ORIGIN = [pos[topV * 3], pos[topV * 3 + 1], pos[topV * 3 + 2]];
console.log(`statue: width 1, height ${(1 / ASPECT).toFixed(3)}, depth ${DEPTH.toFixed(3)}; break origin ${ORIGIN.map((v) => v.toFixed(3)).join(", ")} (farthest along ${ORIGIN_DIR})`);

// Vertex normals, area-weighted: the page lights the stone off these.
const nrm = new Float32Array(pos.length);
{
  const n = new Float64Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; nrm[i] = n[i] / l; nrm[i + 1] = n[i + 1] / l; nrm[i + 2] = n[i + 2] / l; }
}
// Skin is kind 0 (shared vertices, smooth normals; the page shades it as
// stone since the bake is unpainted); the cuts come out kind 1.
const mesh = { pos, idx, nrm, uv: null, kind: new Uint8Array(idx.length / 3) };

{
  let maxI = 0, bad = 0;
  for (let i = 0; i < idx.length; i++) if (idx[i] > maxI) maxI = idx[i];
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) bad++;
  console.log(`check: max index ${maxI} of ${pos.length / 3 - 1}, non-finite positions ${bad}`);
}

// ---------------------------------------------------------------- seeds over the surface, pushed in
let rng = SEED;
const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
const seeds = [];
{
  const order = Array.from({ length: pos.length / 3 }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const height = 1 / ASPECT;
  const r2 = (SPACING * height) ** 2;
  const inset = INSET * height;
  for (const v of order) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let ok = true;
    for (const s of seeds) if ((s[0] - x) ** 2 + (s[1] - y) ** 2 + (s[2] - z) ** 2 < r2) { ok = false; break; }
    if (!ok) continue;
    seeds.push([x - nrm[v * 3] * inset, y - nrm[v * 3 + 1] * inset, z - nrm[v * 3 + 2] * inset]);
    if (seeds.length >= 250) break;
  }
}
console.log(`${seeds.length} seeds`);
if (args.dump) fs.writeFileSync(path.resolve(args.dump), JSON.stringify({ pos: Array.from(pos), idx: Array.from(idx), nrm: Array.from(nrm), seeds }));

// ---------------------------------------------------------------- the cut
const t0 = Date.now();
const { chunks, stats, points } = fractureMesh(mesh, seeds);
console.log("audit", JSON.stringify({ ...stats, sourceVolume: +stats.sourceVolume.toFixed(6), chunkVolume: +stats.chunkVolume.toFixed(6), volumeError: `${((stats.chunkVolume / stats.sourceVolume - 1) * 100).toFixed(3)}%` }), `${Date.now() - t0} ms`);
if (chunks.length > 255) { console.error("more than 255 chunks: the page's chunk id is a byte; raise --spacing"); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
const { bin, meta } = packChunks(chunks, points);
fs.writeFileSync(path.join(OUT, "chunks.bin"), bin);
fs.writeFileSync(path.join(OUT, "chunks.json"), JSON.stringify({ version: 2, source: path.basename(GLB), painted: false, aspect: ASPECT, depth: DEPTH, origin: ORIGIN, cut: CUT, target: TARGET, originDir: ORIGIN_DIR, yaw: YAW, spacing: SPACING, inset: INSET, seed: SEED, ...meta }));
console.log(`wrote ${chunks.length} chunks, ${meta.vertexCount} vertices, ${meta.indexCount / 3} triangles, ${(bin.length / 1e6).toFixed(2)} MB`);
