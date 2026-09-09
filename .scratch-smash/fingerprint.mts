// Exact fingerprint of the fracture's output, so an optimisation can be
// proved to change nothing about what is built.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
const t = performance.now();
const b = buildSolidThinkerChunks(g, THINKER_CHUNK_OPTIONS);
const ms = performance.now() - t;
const h = createHash("sha256");
for (const c of b.chunks) {
  h.update(c.center.map((v) => v.toFixed(6)).join(",") + "|" +
    c.releaseAt.toFixed(6) + "|" + c.travel.toFixed(6) + "|" +
    c.offset.map((v) => v.toFixed(6)).join(",") + "|" +
    c.surfacePositions.length + "," + c.interiorPositions.length + ";");
}
console.log("chunks     ", b.chunks.length);
console.log("stats      ", JSON.stringify(b.stats));
console.log("breakOrigin", b.breakOrigin.map((v) => v.toFixed(4)).join(", "));
console.log("fingerprint", h.digest("hex").slice(0, 32));
console.log("build      ", (ms / 1000).toFixed(2), "s");
