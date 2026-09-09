import { readFile } from "node:fs/promises";
import * as path from "node:path";
const PUBLIC = path.resolve(process.cwd(), "public");
globalThis.fetch = (async (url: string) => {
  const buf = await readFile(path.join(PUBLIC, String(url)));
  return { ok: true, status: 200,
    json: async () => JSON.parse(buf.toString("utf8")),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}) as unknown as typeof fetch;
const { buildSolidThinkerChunks, loadThinkerGeometry } = await import("../components/thinkerFragments.ts");
const { THINKER_CHUNK_OPTIONS } = await import("../components/thinkerChunks.ts");
const g = await loadThinkerGeometry();
const run = (label: string, o: object) => {
  const t = performance.now();
  const b = buildSolidThinkerChunks(g, { ...THINKER_CHUNK_OPTIONS, ...o } as never);
  console.log(`${label.padEnd(34)} ${b.stats.seedCount.toString().padStart(4)} seeds  ` +
    `${b.chunks.length.toString().padStart(4)} chunks  ${((performance.now()-t)/1000).toFixed(2)} s`);
};
run("as shipped", {});
run("variation off (0)", { sizeVariation: 0 });
run("half the seeds (spacing x1.4)", { spacingNear: 0.14, spacingFar: 0.70 });
run("both", { sizeVariation: 0, spacingNear: 0.14, spacingFar: 0.70 });
