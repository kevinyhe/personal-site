// How seed count, build time and chunk size trade off. Varies the spacing
// options around the shipped ones and reports what each costs.
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as THREE from "three";
const PUBLIC = path.resolve(process.cwd(), "public");
globalThis.fetch = (async (url: string) => {
  const buf = await readFile(path.join(PUBLIC, String(url)));
  return { ok: true, status: 200,
    json: async () => JSON.parse(buf.toString("utf8")),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}) as unknown as typeof fetch;
const { buildSolidThinkerChunks, loadThinkerGeometry } = await import("../components/thinkerFragments.ts");
const { THINKER_CHUNK_OPTIONS } = await import("../components/thinkerChunks.ts");

function volumeOf(...arrays: Float32Array[]) {
  let v = 0;
  for (const a of arrays)
    for (let i = 0; i + 8 < a.length; i += 9) {
      const [ax,ay,az,bx,by,bz,cx,cy,cz] = [a[i],a[i+1],a[i+2],a[i+3],a[i+4],a[i+5],a[i+6],a[i+7],a[i+8]];
      v += (ax*(by*cz-bz*cy) - ay*(bx*cz-bz*cx) + az*(bx*cy-by*cx))/6;
    }
  return v;
}

const geometry = await loadThinkerGeometry();
const cases: Array<[string, number, number]> = [
  // label, sizeVariation, shellBias
  ["v1.50", 1.50, 0.5],
  ["v1.80", 1.80, 0.5],
  ["v2.10", 2.10, 0.5],
  ["v2.50", 2.50, 0.5],
];
// p75/p25, not p90/p10: one sub-micron sliver in the tail sends a p10 ratio
// into the thousands and tells you nothing about how the figure reads.
const spreadOf = (vals: number[]) => {
  const sorted = [...vals].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  return q(0.75) / Math.max(q(0.25), 1e-9);
};
console.log("case        seeds  chunks  dust   build    vol lost   detrended p75/p25");
for (const [label, sizeVariation, shellBias] of cases) {
  const options = { ...THINKER_CHUNK_OPTIONS, shellBias, sizeVariation };
  const t0 = performance.now();
  const build = buildSolidThinkerChunks(geometry, options);
  const ms = performance.now() - t0;
  const origin = new THREE.Vector3(...build.breakOrigin);
  const rows = build.chunks.map((c) => ({
    vol: volumeOf(c.surfacePositions, c.interiorPositions),
    d: new THREE.Vector3(...c.center).distanceTo(origin),
  }));
  const total = rows.reduce((s, r) => s + r.vol, 0);
  rows.sort((a, b) => a.d - b.d);
  const per = Math.ceil(rows.length / 5);
  // Detrend: divide each chunk by the mean of its own distance band, so the
  // impact grading drops out and what is left is how much neighbours differ
  // from each other. Measured across all ~96 chunks, not ~19 per band, which
  // is what made the per-band numbers too noisy to read.
  const detrended: number[] = [];
  for (let i = 0; i < 5; i++) {
    const slice = rows.slice(i * per, (i + 1) * per);
    if (slice.length < 4) continue;
    const mean = slice.reduce((s, r) => s + r.vol, 0) / slice.length;
    for (const r of slice) detrended.push(r.vol / mean);
  }
  console.log(
    `${label.padEnd(11)} ${String(build.stats.seedCount).padStart(4)}  ${String(build.chunks.length).padStart(6)}` +
    `  ${String(build.stats.dust).padStart(4)}  ${(ms/1000).toFixed(2)}s` +
    `   ${((1 - total/3.8073)*100).toFixed(2)}%      ${spreadOf(detrended).toFixed(2)}x` +
    `   stats ${JSON.stringify(build.stats)}`);
}
