// Cuts a closed triangle mesh into the Voronoi cells of a set of seeds:
// every cell is the mesh clipped by the bisector planes of its neighbouring
// seeds (only the planes that bound the cell's own polytope), with a flat
// cap on each cut, so every chunk is a closed solid with real cut faces.
// Cut points are shared by key (edge, plane), so caps meet the skin exactly
// and the chunks' volumes sum to the source's. A cell that comes apart into
// islands becomes one chunk per island.
//
// Used by scripts/bake-fresco-chunks.mjs. Plain arrays, no three.

const EPS = 1e-9;
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Which bisector planes bound seed i's cell: clip a box by every bisector, keep the planes left owning a face. */
function cellPlanes(seeds, i, box) {
  const si = seeds[i];
  const planes = seeds
    .map((sj, j) => {
      if (j === i) return null;
      const n = norm3(sub3(sj, si));
      const mid = [(si[0] + sj[0]) / 2, (si[1] + sj[1]) / 2, (si[2] + sj[2]) / 2];
      return { n, d: dot3(n, mid), j, dist: Math.hypot(...sub3(sj, si)) };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist);
  const [mn, mx] = box;
  const c = [[mn[0], mn[1], mn[2]], [mx[0], mn[1], mn[2]], [mx[0], mx[1], mn[2]], [mn[0], mx[1], mn[2]], [mn[0], mn[1], mx[2]], [mx[0], mn[1], mx[2]], [mx[0], mx[1], mx[2]], [mn[0], mx[1], mx[2]]];
  let faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 4, 7, 3], [1, 2, 6, 5]].map((f) => ({ pts: f.map((k) => c[k]), plane: -1 }));
  const active = [];
  for (const pl of planes) {
    let anyOut = false, anyIn = false;
    for (const f of faces) for (const p of f.pts) { if (dot3(pl.n, p) - pl.d > EPS) anyOut = true; else anyIn = true; }
    if (!anyOut) continue;
    if (!anyIn) { faces = []; break; }
    const cut = [];
    const kept = [];
    for (const f of faces) {
      const out = [];
      const n = f.pts.length;
      let first = null, last = null;
      for (let k = 0; k < n; k++) {
        const a = f.pts[k], b = f.pts[(k + 1) % n];
        const da = dot3(pl.n, a) - pl.d, db = dot3(pl.n, b) - pl.d;
        if (da <= EPS) out.push(a);
        if ((da <= EPS) !== (db <= EPS)) { const t = da / (da - db); const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; out.push(p); if (da <= EPS) first = p; else last = p; }
      }
      if (out.length >= 3) kept.push({ pts: out, plane: f.plane });
      if (first && last) cut.push([last, first]);
    }
    if (cut.length >= 3) {
      const loop = [cut[0][0], cut[0][1]];
      const rest = cut.slice(1);
      while (rest.length) {
        const e = loop[loop.length - 1];
        let bi = 0, bd = Infinity;
        rest.forEach((s, k) => { const d = (s[0][0] - e[0]) ** 2 + (s[0][1] - e[1]) ** 2 + (s[0][2] - e[2]) ** 2; if (d < bd) { bd = d; bi = k; } });
        loop.push(rest[bi][1]);
        rest.splice(bi, 1);
      }
      loop.pop();
      kept.push({ pts: loop, plane: active.length });
      active.push(pl);
    }
    faces = kept;
  }
  const alive = new Set(faces.map((f) => f.plane));
  return active.filter((_, k) => alive.has(k));
}

/** Ear-clips a loop of points (2D projection on the plane with normal n) into triangles of indices into the loop. */
function earClip(P3, n) {
  const u = norm3(Math.abs(n[0]) < 0.9 ? cross3(n, [1, 0, 0]) : cross3(n, [0, 1, 0]));
  const v = cross3(n, u);
  const P2 = P3.map((p) => [dot3(p, u), dot3(p, v)]);
  let area = 0;
  for (let i = 0; i < P2.length; i++) { const a = P2[i], b = P2[(i + 1) % P2.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const order = P2.map((_, i) => i);
  const reversed = area < 0;
  if (reversed) order.reverse();
  const tris = [];
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cr(a, b, p) >= -1e-14 && cr(b, c, p) >= -1e-14 && cr(c, a, p) >= -1e-14;
  let forced = false;
  let guard = 0;
  while (order.length > 3 && guard++ < 100000) {
    let clipped = false;
    for (let i = 0; i < order.length; i++) {
      const i0 = order[(i + order.length - 1) % order.length], i1 = order[i], i2 = order[(i + 1) % order.length];
      const a = P2[i0], b = P2[i1], c = P2[i2];
      if (cr(a, b, c) <= 1e-16) continue;
      let ear = true;
      for (const k of order) { if (k === i0 || k === i1 || k === i2) continue; if (inside(P2[k], a, b, c)) { ear = false; break; } }
      if (!ear) continue;
      tris.push([i0, i1, i2]);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) { forced = true; for (let i = 1; i < order.length - 1; i++) tris.push([order[0], order[i], order[i + 1]]); return { tris, forced, reversed }; }
  }
  if (order.length === 3) tris.push([order[0], order[1], order[2]]);
  return { tris, forced, reversed };
}

/**
 * mesh: { pos: Float64Array xyz, nrm: Float32Array xyz, uv: Float32Array uv | null,
 *         idx: Uint32Array, kind: Uint8Array per triangle (0 = skin to texture, 1 = plain stone) }
 * seeds: [[x,y,z], ...]. Returns { chunks: [{ seed, centre, radius, volume, polys }], stats }
 * where polys are { ids, kind } (kind 2 = a cap) and ids index `points`:
 * the mesh's own vertices first, then every cut point made (points.pos/nrm/uv).
 */
export function fractureMesh(mesh, seeds, { box } = {}) {
  const { pos, nrm, uv, idx, kind } = mesh;
  const NV = pos.length / 3;
  const pts = [], ptn = [], ptuv = [];
  const getP = (id) => (id < NV ? [pos[id * 3], pos[id * 3 + 1], pos[id * 3 + 2]] : pts[id - NV]);
  const getN = (id) => (id < NV ? [nrm[id * 3], nrm[id * 3 + 1], nrm[id * 3 + 2]] : ptn[id - NV]);
  const getUV = (id) => (!uv ? [0, 0] : id < NV ? [uv[id * 2], uv[id * 2 + 1]] : ptuv[id - NV]);
  const cutKey = new Map();
  let planeSerial = 0;

  const cutPoint = (a, b, pl, da, db) => {
    const key = (a < b ? `${a},${b}` : `${b},${a}`) + `|${pl.id}`;
    let id = cutKey.get(key);
    if (id !== undefined) return id;
    const t = da / (da - db);
    const A = getP(a), B = getP(b), NA = getN(a), NB = getN(b), UA = getUV(a), UB = getUV(b);
    id = NV + pts.length;
    pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
    ptn.push(norm3([NA[0] + (NB[0] - NA[0]) * t, NA[1] + (NB[1] - NA[1]) * t, NA[2] + (NB[2] - NA[2]) * t]));
    ptuv.push([UA[0] + (UB[0] - UA[0]) * t, UA[1] + (UB[1] - UA[1]) * t]);
    cutKey.set(key, id);
    return id;
  };

  const clipPolys = (polys, pl) => {
    const kept = [];
    const segs = [];
    const side = new Map();
    const dist = (id) => { let s = side.get(id); if (s === undefined) { s = dot3(pl.n, getP(id)) - pl.d; side.set(id, s); } return s; };
    for (const poly of polys) {
      const ids = poly.ids;
      const n = ids.length;
      let allIn = true, allOut = true;
      for (const id of ids) { const d = dist(id); if (d > EPS) allIn = false; else allOut = false; }
      if (allIn) { kept.push(poly); continue; }
      if (allOut) continue;
      const out = [];
      let enter = -1, leave = -1;
      for (let k = 0; k < n; k++) {
        const a = ids[k], b = ids[(k + 1) % n];
        const da = dist(a), db = dist(b);
        const ina = da <= EPS, inb = db <= EPS;
        if (ina) out.push(a);
        if (ina !== inb) {
          const id = Math.abs(da) <= EPS ? a : Math.abs(db) <= EPS ? b : cutPoint(a, b, pl, da, db);
          if (out[out.length - 1] !== id) out.push(id);
          if (ina) leave = id; else enter = id;
        }
      }
      if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
      if (out.length >= 3) kept.push({ ids: out, kind: poly.kind });
      if (enter >= 0 && leave >= 0 && enter !== leave) segs.push([leave, enter]);
    }
    return { kept, segs };
  };

  const chainLoops = (segs) => {
    const next = new Map(segs);
    const seen = new Set();
    const loops = [];
    const chains = [];
    for (const [a] of segs) {
      if (seen.has(a)) continue;
      const loop = [];
      let v = a;
      while (v !== undefined && !seen.has(v)) { seen.add(v); loop.push(v); v = next.get(v); }
      if (v === a && loop.length >= 3) loops.push(loop);
      else chains.push(loop);
    }
    // Chains that did not close (a scan's bad spot, or a simplifier's): stitch
    // each one's end to the nearest other chain's start until they close, so
    // the cut still gets a cap. Counted as broken either way.
    const broken = chains.length;
    while (chains.length) {
      const loop = chains.shift();
      let guard = 0;
      while (chains.length && guard++ < 1000) {
        const e = getP(loop[loop.length - 1]);
        let bi = 0, bd = Infinity;
        chains.forEach((c, k) => { const q = getP(c[0]); const d = (q[0] - e[0]) ** 2 + (q[1] - e[1]) ** 2 + (q[2] - e[2]) ** 2; if (d < bd) { bd = d; bi = k; } });
        const s = getP(loop[0]);
        if ((s[0] - e[0]) ** 2 + (s[1] - e[1]) ** 2 + (s[2] - e[2]) ** 2 <= bd) break;
        loop.push(...chains.splice(bi, 1)[0]);
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return { loops, broken };
  };

  const stats = { cells: 0, chunks: 0, islands: 0, brokenLoops: 0, forcedCaps: 0, dust: 0 };
  const chunks = [];
  const all = [];
  for (let t = 0; t < idx.length / 3; t++) all.push({ ids: [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]], kind: kind ? kind[t] : 0 });
  if (!box) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
    box = [mn.map((v) => v - 0.1), mx.map((v) => v + 0.1)];
  }

  for (let i = 0; i < seeds.length; i++) {
    stats.cells++;
    const planes = cellPlanes(seeds, i, box);
    planes.forEach((pl) => { pl.id = planeSerial++; });
    let polys = all;
    for (const pl of planes) {
      const { kept, segs } = clipPolys(polys, pl);
      const { loops, broken } = chainLoops(segs);
      stats.brokenLoops += broken;
      polys = kept;
      for (const loop of loops) {
        const { tris, forced, reversed } = earClip(loop.map(getP), pl.n);
        if (forced) stats.forcedCaps++;
        // The cap must run its edges the opposite way to the skin they share,
        // so the next plane's loops chain through them. The loop runs the
        // skin's way; the ear clip's triangles run the loop's way unless it
        // reversed the loop, so flip them when it did not. (Judging each
        // triangle by its normal against the plane, or the cap by its summed
        // normal, breaks on a scan: where its surface folds through itself
        // the loop is not simple and those tests disagree with the skin.)
        for (const tri of tris) {
          const ids = tri.map((k) => loop[k]);
          polys.push({ ids: reversed ? ids : [ids[0], ids[2], ids[1]], kind: 2 });
        }
      }
    }
    if (!polys.length) continue;
    const parent = new Map();
    const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
    for (const p of polys) for (const id of p.ids) if (!parent.has(id)) parent.set(id, id);
    for (const p of polys) for (let k = 1; k < p.ids.length; k++) parent.set(find(p.ids[0]), find(p.ids[k]));
    const groups = new Map();
    for (const p of polys) { const r = find(p.ids[0]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); }
    if (groups.size > 1) stats.islands += groups.size - 1;
    for (const ps of groups.values()) {
      let vol = 0;
      const c = [0, 0, 0];
      let cn = 0;
      const seenV = new Set();
      for (const p of ps) {
        for (let k = 1; k < p.ids.length - 1; k++) { const a = getP(p.ids[0]), b = getP(p.ids[k]), d = getP(p.ids[k + 1]); vol += dot3(a, cross3(b, d)) / 6; }
        for (const id of p.ids) if (!seenV.has(id)) { seenV.add(id); const q = getP(id); c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; cn++; }
      }
      if (vol < 1e-9) { stats.dust++; continue; }
      const centre = c.map((v) => v / cn);
      let r2 = 0;
      for (const id of seenV) { const q = getP(id); r2 = Math.max(r2, (q[0] - centre[0]) ** 2 + (q[1] - centre[1]) ** 2 + (q[2] - centre[2]) ** 2); }
      chunks.push({ seed: seeds[i], centre, radius: Math.sqrt(r2), volume: vol, polys: ps });
      stats.chunks++;
    }
  }

  let sourceVol = 0;
  for (let t = 0; t < idx.length; t += 3) { const a = getP(idx[t]), b = getP(idx[t + 1]), c = getP(idx[t + 2]); sourceVol += dot3(a, cross3(b, c)) / 6; }
  stats.sourceVolume = sourceVol;
  stats.chunkVolume = chunks.reduce((s, c) => s + c.volume, 0);
  let openEdges = 0;
  for (const ch of chunks) {
    const use = new Map();
    for (const p of ch.polys) for (let k = 0; k < p.ids.length; k++) { const a = p.ids[k], b = p.ids[(k + 1) % p.ids.length]; const key = a < b ? `${a},${b}` : `${b},${a}`; use.set(key, (use.get(key) || 0) + 1); }
    for (const n of use.values()) if (n % 2) openEdges++;
  }
  stats.openEdges = openEdges;
  return { chunks, stats, points: { getP, getN, getUV } };
}

/**
 * Packs chunks for the page: per vertex int16 x3 position (× scale, so pass
 * a mesh within ±1/scale), int8 x3 normal, u8 kind (0 skin, 1 stone), uint16 x2 uv
 * = 14 bytes; uint16 indices per chunk. Returns { bin: Buffer, meta }.
 */
export function packChunks(chunks, points, { posScale = 32767 } = {}) {
  const { getP, getN, getUV } = points;
  const vParts = [], iParts = [], meta = [];
  let vOff = 0, iOff = 0;
  const q = (v) => Math.max(-32767, Math.min(32767, Math.round(v * posScale)));
  const q8 = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
  const qu = (v) => Math.max(0, Math.min(65535, Math.round(v * 65535)));
  for (const ch of chunks) {
    const local = new Map();
    const verts = [];
    const tris = [];
    const vid = (id, key, n, kind) => { let l = local.get(key); if (l === undefined) { l = verts.length; local.set(key, l); verts.push([getP(id), n, kind, getUV(id)]); } return l; };
    for (const p of ch.polys) {
      let ids;
      if (p.kind === 0) ids = p.ids.map((id) => vid(id, `s${id}`, getN(id), 0));
      else {
        const a = getP(p.ids[0]), b = getP(p.ids[1]), c = getP(p.ids[2]);
        const fn = norm3(cross3(sub3(b, a), sub3(c, a)));
        const fk = `${fn[0].toFixed(3)},${fn[1].toFixed(3)},${fn[2].toFixed(3)}`;
        ids = p.ids.map((id) => vid(id, `f${fk}_${id}`, fn, 1));
      }
      for (let k = 1; k < ids.length - 1; k++) tris.push(ids[0], ids[k], ids[k + 1]);
    }
    if (verts.length > 65535) throw new Error(`chunk with ${verts.length} vertices: too many for uint16`);
    const vb = Buffer.alloc(verts.length * 14);
    verts.forEach(([p, n, kind, t], k) => {
      const o = k * 14;
      vb.writeInt16LE(q(p[0]), o); vb.writeInt16LE(q(p[1]), o + 2); vb.writeInt16LE(q(p[2]), o + 4);
      vb.writeInt8(q8(n[0]), o + 6); vb.writeInt8(q8(n[1]), o + 7); vb.writeInt8(q8(n[2]), o + 8); vb.writeUInt8(kind, o + 9);
      vb.writeUInt16LE(qu(t[0]), o + 10); vb.writeUInt16LE(qu(t[1]), o + 12);
    });
    const ib = Buffer.from(Uint16Array.from(tris).buffer);
    meta.push({ seed: ch.seed.map((v) => +v.toFixed(5)), centre: ch.centre.map((v) => +v.toFixed(5)), radius: +ch.radius.toFixed(5), volume: +ch.volume.toExponential(3), vOff, vCount: verts.length, iOff, iCount: tris.length });
    vParts.push(vb); iParts.push(ib);
    vOff += verts.length; iOff += tris.length;
  }
  const vbuf = Buffer.concat(vParts);
  const ibuf = Buffer.concat(iParts);
  const pad = (4 - (vbuf.length % 4)) % 4;
  return { bin: Buffer.concat([vbuf, Buffer.alloc(pad), ibuf]), meta: { posScale, vertexBytes: 14, indexOffset: vbuf.length + pad, vertexCount: vOff, indexCount: iOff, chunks: meta } };
}
