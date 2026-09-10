// Cuts the statue's chunks ahead of time and writes them under public/, so
// the page loads the pieces instead of fracturing the model on every visit.
//
//   npm run bake:chunks
//
// Output: public/model/thinker/chunks.json (the header: every chunk's
// numbers and where its arrays sit) and chunks.bin (the arrays, float32).
// The header carries a fingerprint of the options and the fracture code's
// version; the page's loader (components/thinkerChunks.ts) only trusts a
// bake whose fingerprint matches, and cuts live otherwise — so a forgotten
// re-bake costs the television hold, never a wrong figure.
import { register } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const repo = path.resolve(new URL(".", import.meta.url).pathname, "..") + "/";
register(pathToFileURL(repo + "scripts/ts-hooks.mjs"), pathToFileURL(repo));

// The loader fetches from public/; here that is the disk.
globalThis.fetch = async (url) => {
  const file = repo + "public" + new URL(url, "http://bake/").pathname;
  const data = await readFile(file);
  return {
    ok: true,
    json: async () => JSON.parse(data.toString()),
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  };
};

const fragments = await import(repo + "components/thinkerFragments.ts");
const chunksModule = await import(repo + "components/thinkerChunks.ts");
const options = chunksModule.THINKER_CHUNK_OPTIONS;
if (!options.bakedPath) throw new Error("THINKER_CHUNK_OPTIONS.bakedPath is not set");

const started = performance.now();
const geometry = await fragments.loadThinkerGeometry(options.modelPath, options.normalizeHeight);
const build = fragments.buildSolidThinkerChunks(geometry, options);
const seconds = (performance.now() - started) / 1000;

// Positions go as int16 against one range (the largest coordinate of any
// vertex about its chunk's centre — under a unit, so the step is about
// 2e-5 figure units, far below anything the eye or the cut can tell), and
// normals as int8. A third of the float32 size. All the int16 arrays are
// laid out first, then the int8 ones, so alignment takes care of itself.
let positionRange = 0;
for (const chunk of build.chunks) {
  for (const array of [chunk.surfacePositions, chunk.interiorPositions]) {
    for (let i = 0; i < array.length; i += 1) {
      positionRange = Math.max(positionRange, Math.abs(array[i]));
    }
  }
}
const positionScale = 32767 / positionRange;
const packPositions = (array) => Int16Array.from(array, (v) => Math.round(v * positionScale));
const packNormals = (array) =>
  Int8Array.from(array, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 127));

const int16s = [];
const int8s = [];
const records = build.chunks.map((chunk) => {
  const sp = packPositions(chunk.surfacePositions);
  const ip = packPositions(chunk.interiorPositions);
  const sn = packNormals(chunk.surfaceNormals);
  const inn = packNormals(chunk.interiorNormals);
  int16s.push(sp, ip);
  int8s.push(sn, inn);
  return {
    center: chunk.center,
    offset: chunk.offset,
    phase: chunk.phase,
    radius: chunk.radius,
    releaseAt: chunk.releaseAt,
    scale: chunk.scale,
    spin: chunk.spin,
    travel: chunk.travel,
    surfacePositions: sp,
    surfaceNormals: sn,
    interiorPositions: ip,
    interiorNormals: inn,
  };
});
let byteLength = 0;
const placed = new Map();
for (const array of [...int16s, ...int8s]) {
  placed.set(array, [byteLength, array.length]);
  byteLength += array.byteLength;
}
byteLength = Math.ceil(byteLength / 4) * 4;
const bin = new Uint8Array(byteLength);
for (const [array, [offset]] of placed) {
  bin.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
}
for (const record of records) {
  for (const key of ["surfacePositions", "surfaceNormals", "interiorPositions", "interiorNormals"]) {
    record[key] = placed.get(record[key]);
  }
}
const header = {
  format: chunksModule.BAKED_FORMAT,
  fingerprint: chunksModule.chunkOptionsFingerprint(options),
  positionRange,
  breakOrigin: build.breakOrigin,
  drift: build.drift,
  stats: build.stats,
  chunks: records,
  byteLength,
};

const out = repo + "public" + options.bakedPath;
await mkdir(path.dirname(out), { recursive: true });
await writeFile(`${out}.json`, JSON.stringify(header));
await writeFile(`${out}.bin`, bin);

const radii = build.chunks.map((chunk) => chunk.radius).sort((a, b) => a - b);
console.log(
  JSON.stringify({
    pieces: build.chunks.length,
    seeds: build.stats.seedCount,
    dust: build.stats.dust,
    meanRadius: +(radii.reduce((a, b) => a + b, 0) / radii.length).toFixed(3),
    medianRadius: +radii[Math.floor(radii.length / 2)].toFixed(3),
    cutSeconds: +seconds.toFixed(1),
    binMB: +(byteLength / 1048576).toFixed(2),
    fingerprint: header.fingerprint,
    wrote: [`${options.bakedPath}.json`, `${options.bakedPath}.bin`],
  }),
);
