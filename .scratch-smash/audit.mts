// Fracture audit. Run from inside the repo so `three` resolves:
//   node --experimental-strip-types --no-warnings .scratch-smash/audit.mts
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as THREE from "three";

// The builder fetches /model/thinker/* ; serve those from public/ on disk.
const PUBLIC = path.resolve(process.cwd(), "public");
globalThis.fetch = (async (url: string) => {
  const file = path.join(PUBLIC, String(url));
  const buf = await readFile(file);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString("utf8")),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}) as unknown as typeof fetch;

const { buildSolidThinkerChunks, loadThinkerGeometry } = await import(
  "../components/thinkerFragments.ts"
);
const { THINKER_CHUNK_OPTIONS } = await import("../components/thinkerChunks.ts");

// Signed volume of a closed triangle soup (positions are chunk-local).
function volumeOf(...arrays: Float32Array[]) {
  let v = 0;
  for (const a of arrays) {
    for (let i = 0; i + 8 < a.length; i += 9) {
      const ax = a[i], ay = a[i + 1], az = a[i + 2];
      const bx = a[i + 3], by = a[i + 4], bz = a[i + 5];
      const cx = a[i + 6], cy = a[i + 7], cz = a[i + 8];
      v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
  }
  return v;
}

// Edges used an odd number of times = holes; more than twice = non-manifold.
// Keys are quantised to a micron: the fracture's own float32 rounding puts
// coincident points a few ULPs apart, and counting those as distinct
// reports thousands of phantom holes.
const QUANT = 1e6;
function edgeAudit(...arrays: Float32Array[]) {
  const counts = new Map<string, number>();
  const q = (v: number) => Math.round(v * QUANT);
  const key = (a: Float32Array, i: number) =>
    `${q(a[i])},${q(a[i + 1])},${q(a[i + 2])}`;
  for (const a of arrays) {
    for (let i = 0; i + 8 < a.length; i += 9) {
      const p = [key(a, i), key(a, i + 3), key(a, i + 6)];
      for (let e = 0; e < 3; e++) {
        const u = p[e], w = p[(e + 1) % 3];
        const k = u < w ? `${u}|${w}` : `${w}|${u}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  let open = 0, over = 0;
  for (const c of counts.values()) {
    if (c % 2 === 1) open++;
    if (c > 2) over++;
  }
  return { open, over };
}

const geometry = await loadThinkerGeometry();
// The source is indexed; expand it so the volume sum sees whole triangles.
const rawPos = geometry.getAttribute("position").array as Float32Array;
const index = geometry.getIndex();
let sourceTris: Float32Array;
if (index) {
  const idx = index.array;
  sourceTris = new Float32Array(idx.length * 3);
  for (let i = 0; i < idx.length; i++) {
    sourceTris[i * 3] = rawPos[idx[i] * 3];
    sourceTris[i * 3 + 1] = rawPos[idx[i] * 3 + 1];
    sourceTris[i * 3 + 2] = rawPos[idx[i] * 3 + 2];
  }
} else {
  sourceTris = rawPos;
}
const sourceVolume = Math.abs(volumeOf(sourceTris));
const sourceEdges = edgeAudit(sourceTris);
console.log(`source: ${(sourceTris.length / 9) | 0} triangles, volume ${sourceVolume.toFixed(4)}, ` +
  `open edges ${sourceEdges.open}, over-used ${sourceEdges.over}`);

const t0 = performance.now();
const build = buildSolidThinkerChunks(geometry, THINKER_CHUNK_OPTIONS);
const ms = performance.now() - t0;

const chunks = build.chunks;
let total = 0;
let openTotal = 0, overTotal = 0;
const rows: Array<{ i: number; vol: number; d: number; releaseAt: number; phase: string }> = [];

// Impact reference: what the build says the break starts from.
const origin = new THREE.Vector3(...build.breakOrigin);

for (const [i, c] of chunks.entries()) {
  const vol = volumeOf(c.surfacePositions, c.interiorPositions);
  total += vol;
  const e = edgeAudit(c.surfacePositions, c.interiorPositions);
  openTotal += e.open; overTotal += e.over;
  rows.push({
    i, vol, d: new THREE.Vector3(...c.center).distanceTo(origin),
    releaseAt: c.releaseAt, phase: c.phase,
  });
}

console.log(`\nbuild: ${ms.toFixed(0)} ms, ${chunks.length} chunks, stats ${JSON.stringify(build.stats)}`);
console.log(`breakOrigin (${origin.x.toFixed(3)}, ${origin.y.toFixed(3)}, ${origin.z.toFixed(3)})`);
console.log(`volume: chunks ${total.toFixed(4)} vs source ${sourceVolume.toFixed(4)}  ` +
  `(lost ${((1 - total / sourceVolume) * 100).toFixed(2)}%)`);
console.log(`edges: ${openTotal} open, ${overTotal} over-used`);

// Size grading: volume vs distance from the impact point, in 5 distance bands.
rows.sort((a, b) => a.d - b.d);
const bands = 5, per = Math.ceil(rows.length / bands);
console.log(`\nsize grading (want volume RISING with distance from impact):`);
for (let b = 0; b < bands; b++) {
  const slice = rows.slice(b * per, (b + 1) * per);
  if (!slice.length) continue;
  const mv = slice.reduce((s, r) => s + r.vol, 0) / slice.length;
  console.log(`  band ${b + 1}  d ${slice[0].d.toFixed(2)}-${slice[slice.length - 1].d.toFixed(2)}` +
    `  n=${String(slice.length).padStart(3)}  mean vol ${mv.toFixed(4)}`);
}
// Variation: the grading already makes far chunks bigger than near ones,
// so the question is how much spread there is WITHIN a band — do cells at
// the same distance from the blow all come out the same size?
const spread = (vals: number[]) => {
  const sorted = [...vals].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  return { cv: sd / mean, ratio: q(0.9) / Math.max(q(0.1), 1e-9) };
};
{
  const all = spread(rows.map((r) => r.vol));
  console.log(`\nvariation overall:  cv ${all.cv.toFixed(2)}   p90/p10 ${all.ratio.toFixed(1)}x`);
  console.log("within each distance band (this is the one that reads as variety):");
  for (let b = 0; b < bands; b++) {
    const slice = rows.slice(b * per, (b + 1) * per);
    if (slice.length < 4) continue;
    const v = spread(slice.map((r) => r.vol));
    console.log(`  band ${b + 1}  cv ${v.cv.toFixed(2)}   p90/p10 ${v.ratio.toFixed(1)}x`);
  }
}
// What actually goes first? For "the hand breaks, then the rest", the
// earliest releases must all be close to the blow.
{
  const byRelease = [...rows].sort((a, b) => a.releaseAt - b.releaseAt).slice(0, 8);
  console.log("\nfirst 8 to release (distance from the blow, volume):");
  for (const r of byRelease) {
    console.log(`  releaseAt ${r.releaseAt.toFixed(3)}   d ${r.d.toFixed(2)}   vol ${r.vol.toFixed(4)}`);
  }
}
const small = rows.filter((r) => r.vol < 0.01).length;
console.log(`\nsmallest chunk ${Math.min(...rows.map((r) => r.vol)).toFixed(5)}, ` +
  `largest ${Math.max(...rows.map((r) => r.vol)).toFixed(4)}, under 0.01: ${small}`);
// Release cascade: how many distinct release moments (collapsing = bad).
const moments = new Set(rows.map((r) => r.releaseAt.toFixed(4)));
console.log(`release moments: ${moments.size} distinct across ${chunks.length} chunks`);
