// Bakes the Creation of Adam fresco as a stone relief panel cut into solid
// chunks, for components/luke/FrescoBreak.tsx:
//
//   node scripts/bake-fresco-chunks.mjs [--spacing 0.085] [--amp 0.06] [--thick 0.03] [--grid 320] [--seed 7]
//   node scripts/bake-fresco-chunks.mjs --mesh scripts/fresco-src/relief.stl [--zscale 1] [--painted]
//
// With --mesh, a sculpted relief (binary or ASCII STL, or OBJ) stands in for
// the depth grid: it is turned so x runs right and y up with z toward the
// viewer, centred, scaled to width 1, its back put at z = 0 and its depth
// multiplied by `zscale` (a CNC relief is often only 3% of its width deep).
// Every face is stone (kind 1, shaded off its own normals on the page)
// unless --painted, which maps the fresco onto it straight down z.
//
// The panel: a GRID×(GRID/aspect) grid across the painting (width 1, centred
// on the origin), each vertex pushed forward (+z) by the fresco's depth
// (scripts/fresco-src/depth16.raw, from scripts/fresco-depth.py) times
// `amp`, with a flat back `thick` behind the wall and sides round the edge,
// so it is one closed solid. Then it is cut into the Voronoi cells of
// seeds spread `spacing` apart over the panel, halfway through its
// thickness with a little jitter so no two cracks are quite parallel
// (scripts/voronoi-fracture.mjs). Front triangles are kind 0 (the page
// textures them with the painting); back, sides and cut faces are kind 1
// (plain stone).
//
// Writes public/models/fresco/chunks.bin + chunks.json and prints the audit:
// chunk count, chunk volume against the panel's (must match to 0.01%),
// open edges, dust.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fractureMesh, packChunks } from "./voronoi-fracture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : [])).filter((e) => e.length));
const SPACING = Number(args.spacing ?? 0.085);
const AMP = Number(args.amp ?? 0.06);
const THICK = Number(args.thick ?? 0.03);
const GRID = Number(args.grid ?? 320);
const SEED = Number(args.seed ?? 7);
const MESH = args.mesh;
const ZSCALE = Number(args.zscale ?? 1);
const PAINTED = "painted" in args;
const OUT = path.join(here, "..", "public", "models", "fresco");


// ---------------------------------------------------------------- a sculpted relief from a file
function readStl(buf) {
  const head = buf.toString("latin1", 0, Math.min(buf.length, 4096));
  const tri = [];
  if (head.trimStart().startsWith("solid") && /facet/.test(head)) {
    for (const m of buf.toString("latin1").matchAll(/vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/g)) tri.push(+m[1], +m[2], +m[3]);
  } else {
    const n = buf.readUInt32LE(80);
    for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) tri.push(buf.readFloatLE(o + k * 4)); }
  }
  return tri;
}
function readObj(txt) {
  const v = [], tri = [];
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] === "v") v.push(+t[1], +t[2], +t[3]);
    else if (t[0] === "f") {
      const ids = t.slice(1).map((w) => { const i = parseInt(w.split("/")[0], 10); return (i < 0 ? v.length / 3 + i : i - 1) * 3; });
      for (let k = 1; k + 1 < ids.length; k++) for (const i of [ids[0], ids[k], ids[k + 1]]) tri.push(v[i], v[i + 1], v[i + 2]);
    }
  }
  return tri;
}
function loadRelief(file) {
  const buf = fs.readFileSync(file);
  const tri = file.toLowerCase().endsWith(".obj") ? readObj(buf.toString("utf8")) : readStl(buf);
  // Which way is the relief facing: the thinnest axis is its depth; of the
  // other two the longer is its width. Depth points toward the viewer.
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], tri[i + k]); hi[k] = Math.max(hi[k], tri[i + k]); }
  const ext = hi.map((h, k) => h - lo[k]);
  const dz = ext.indexOf(Math.min(...ext));
  const rest = [0, 1, 2].filter((k) => k !== dz);
  const dx = ext[rest[0]] >= ext[rest[1]] ? rest[0] : rest[1];
  const dy = rest.find((k) => k !== dx);
  const scale = 1 / ext[dx];
  const cx = (lo[dx] + hi[dx]) / 2, cy = (lo[dy] + hi[dy]) / 2;
  // Weld shared vertices by exact position so the cut sees one closed surface.
  const key = new Map(); const pos = [], idx = [];
  for (let i = 0; i < tri.length; i += 3) {
    const x = (tri[i + dx] - cx) * scale, y = (tri[i + dy] - cy) * scale, z = (tri[i + dz] - lo[dz]) * scale * ZSCALE;
    const k = `${x.toFixed(7)},${y.toFixed(7)},${z.toFixed(7)}`;
    let id = key.get(k);
    if (id === undefined) { id = pos.length / 3; key.set(k, id); pos.push(x, y, z); }
    idx.push(id);
  }
  // Signed volume: the file's winding should put the outside out; flip it if not.
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const aspect = ext[dx] / ext[dy];
  ASPECT = aspect; H = 1 / aspect;
  const uv = new Float32Array(pos.length / 3 * 2);
  for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] + 0.5; uv[i * 2 + 1] = pos[i * 3 + 1] / H + 0.5; }
  const kind = new Uint8Array(idx.length / 3).fill(PAINTED ? 0 : 1);
  console.log(`relief ${path.basename(file)}: ${idx.length / 3} triangles, ${pos.length / 3} vertices welded from ${tri.length / 3}, axes x=${"xyz"[dx]} y=${"xyz"[dy]} z=${"xyz"[dz]}, aspect ${aspect.toFixed(3)}, depth ${(ext[dz] * scale * ZSCALE).toFixed(3)} of width${vol < 0 ? ", winding flipped" : ""}`);
  return { pos: Float64Array.from(pos), idx: Uint32Array.from(idx), kind, uv, nrm: null };
}

// ---------------------------------------------------------------- the relief
const info = JSON.parse(fs.readFileSync(path.join(here, "fresco-src", "depth16.json"), "utf8"));
const raw = fs.readFileSync(path.join(here, "fresco-src", "depth16.raw"));
const DW = info.width, DH = info.height;
let ASPECT = info.aspect;
const depthAt = (u, v) => {
  // u 0..1 left→right, v 0..1 bottom→top; bilinear
  const x = Math.min(DW - 1.001, Math.max(0, u * (DW - 1)));
  const y = Math.min(DH - 1.001, Math.max(0, (1 - v) * (DH - 1)));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const s = (xx, yy) => raw.readUInt16LE((yy * DW + xx) * 2) / 65535;
  return (s(x0, y0) * (1 - fx) + s(x0 + 1, y0) * fx) * (1 - fy) + (s(x0, y0 + 1) * (1 - fx) + s(x0 + 1, y0 + 1) * fx) * fy;
};
let mesh, GX = 0, GY = 0, H = 1 / ASPECT;
if (!MESH) {
  GX = GRID; GY = Math.round(GRID / ASPECT);
  const pos = [], uv = [], idx = [], kind = [];
  const front = (i, j) => j * (GX + 1) + i;
  for (let j = 0; j <= GY; j++)
    for (let i = 0; i <= GX; i++) {
      const u = i / GX, v = j / GY;
      pos.push(u - 0.5, (v - 0.5) * H, AMP * depthAt(u, v));
      uv.push(u, v);
    }
  for (let j = 0; j < GY; j++)
    for (let i = 0; i < GX; i++) {
      const a = front(i, j), b = front(i + 1, j), c = front(i + 1, j + 1), d = front(i, j + 1);
      idx.push(a, b, c, a, c, d);
      kind.push(0, 0);
    }
  // The border ring of the front, counter-clockwise seen from the front:
  // bottom edge left→right, right edge up, top edge right→left, left edge down.
  const ring = [];
  for (let i = 0; i < GX; i++) ring.push(front(i, 0));
  for (let j = 0; j < GY; j++) ring.push(front(GX, j));
  for (let i = GX; i > 0; i--) ring.push(front(i, GY));
  for (let j = GY; j > 0; j--) ring.push(front(0, j));
  const ringPos = new Map(ring.map((f, k) => [f, k]));
  // The back ring at z = -THICK, one vertex under each ring vertex, so the
  // sides close exactly.
  const backBase = pos.length / 3;
  for (const r of ring) { pos.push(pos[r * 3], pos[r * 3 + 1], -THICK); uv.push(0, 0); }
  const R = ring.length;
  for (let k = 0; k < R; k++) {
    const f0 = ring[k], f1 = ring[(k + 1) % R], b0 = backBase + k, b1 = backBase + ((k + 1) % R);
    idx.push(f0, b0, b1, f0, b1, f1); kind.push(1, 1);
  }
  // The back: a COARSE grid (STEP front cells to a back cell) fanned from
  // each cell's centre, its border cells taking in every ring vertex along
  // their outer sides. Compact triangles everywhere: a fan from the panel's
  // centre put a sliver of nearly every one of its 930 triangles into every
  // cell, and the bake came out at 7 MB.
  const STEP = (() => { let g = GX; let h = GY; while (h) [g, h] = [h, g % h]; return g; })();
  const BX = GX / STEP, BY = GY / STEP;
  const inner = new Map();
  const backAt = (i, j) => {
    const f = front(i, j);
    if (ringPos.has(f)) return backBase + ringPos.get(f);
    const key = `${i},${j}`;
    let b = inner.get(key);
    if (b === undefined) { b = pos.length / 3; inner.set(key, b); pos.push(pos[f * 3], pos[f * 3 + 1], -THICK); uv.push(0, 0); }
    return b;
  };
  for (let J = 0; J < BY; J++)
    for (let I = 0; I < BX; I++) {
      const corners = [[I, J], [I + 1, J], [I + 1, J + 1], [I, J + 1]].map(([a, b]) => [a * STEP, b * STEP]);
      const poly = [];
      for (let s = 0; s < 4; s++) {
        const [i0, j0] = corners[s], [i1, j1] = corners[(s + 1) % 4];
        const border = (j0 === j1 && (j0 === 0 || j0 === GY)) || (i0 === i1 && (i0 === 0 || i0 === GX));
        const n = border ? STEP : 1;
        for (let k = 0; k < n; k++) poly.push(backAt(i0 + ((i1 - i0) * k) / n, j0 + ((j1 - j0) * k) / n));
      }
      const c = pos.length / 3;
      let cx = 0, cy = 0;
      for (const v of poly) { cx += pos[v * 3] / poly.length; cy += pos[v * 3 + 1] / poly.length; }
      pos.push(cx, cy, -THICK); uv.push(0, 0);
      // facing -z: the polygon reversed
      for (let k = 0; k < poly.length; k++) { idx.push(poly[(k + 1) % poly.length], poly[k], c); kind.push(1); }
    }
  mesh = { pos: Float64Array.from(pos), idx: Uint32Array.from(idx), kind: Uint8Array.from(kind), uv: Float32Array.from(uv), nrm: null };
} else {
  mesh = loadRelief(path.resolve(MESH));
}
// Vertex normals, area-weighted (the page lights the front off the depth texture; these carry the rest).
{
  const n = new Float64Array(mesh.pos.length);
  const P = mesh.pos;
  for (let i = 0; i < mesh.idx.length; i += 3) {
    const a = mesh.idx[i] * 3, b = mesh.idx[i + 1] * 3, c = mesh.idx[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  mesh.nrm = new Float32Array(n.length);
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; mesh.nrm[i] = n[i] / l; mesh.nrm[i + 1] = n[i + 1] / l; mesh.nrm[i + 2] = n[i + 2] / l; }
}
console.log(`panel ${GX}x${GY} grid, ${mesh.idx.length / 3} triangles, ${mesh.pos.length / 3} vertices, aspect ${ASPECT.toFixed(3)}`);

// ---------------------------------------------------------------- seeds
let rng = SEED;
const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
const seeds = [];
{
  const r2 = SPACING * SPACING;
  let zMid = 0;
  if (MESH) { let zmax = 0; for (let i = 2; i < mesh.pos.length; i += 3) zmax = Math.max(zmax, mesh.pos[i]); zMid = zmax / 2; }
  let tries = 0;
  while (tries++ < 20000) {
    const x = rand() - 0.5, y = (rand() - 0.5) * H;
    let ok = true;
    for (const s of seeds) if ((s[0] - x) ** 2 + (s[1] - y) ** 2 < r2) { ok = false; break; }
    if (!ok) continue;
    const zf = MESH ? zMid : AMP * depthAt(x + 0.5, y / H + 0.5);
    seeds.push([x, y, (MESH ? zf : (zf - THICK) / 2) + (rand() - 0.5) * 0.03]);
  }
}
console.log(`${seeds.length} seeds`);

// ---------------------------------------------------------------- the cut
const t0 = Date.now();
const { chunks, stats, points } = fractureMesh(mesh, seeds);
console.log("audit", JSON.stringify({ ...stats, sourceVolume: +stats.sourceVolume.toFixed(6), chunkVolume: +stats.chunkVolume.toFixed(6), volumeError: `${((stats.chunkVolume / stats.sourceVolume - 1) * 100).toFixed(3)}%` }), `${Date.now() - t0} ms`);

fs.mkdirSync(OUT, { recursive: true });
const { bin, meta } = packChunks(chunks, points);
fs.writeFileSync(path.join(OUT, "chunks.bin"), bin);
fs.writeFileSync(path.join(OUT, "chunks.json"), JSON.stringify({ version: 1, aspect: ASPECT, amp: AMP, thick: THICK, spacing: SPACING, seed: SEED, mesh: MESH ? path.basename(MESH) : null, painted: MESH ? PAINTED : true, ...meta }));
console.log(`wrote ${chunks.length} chunks, ${meta.vertexCount} vertices, ${meta.indexCount / 3} triangles, ${(bin.length / 1e6).toFixed(2)} MB`);
