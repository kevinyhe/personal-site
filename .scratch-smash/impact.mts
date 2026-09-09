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
const { loadThinkerGeometry } = await import("../components/thinkerFragments.ts");
const geometry = await loadThinkerGeometry();
geometry.computeBoundingBox();
const box = geometry.boundingBox!;
const size = box.getSize(new THREE.Vector3());
console.log("bbox min", box.min.toArray().map(v=>v.toFixed(3)).join(", "));
console.log("bbox size", size.toArray().map(v=>v.toFixed(3)).join(", "));

// Stage transform, as ThinkerStage applies it.
const stage = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.08, Math.PI/3, 0.012));
const pos = geometry.getAttribute("position");
const idx = geometry.getIndex();
const count = idx ? idx.count : pos.count;
const at = (i: number) => {
  const v = idx ? idx.getX(i) : i;
  return new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v));
};
// Lowest 3% of the mesh: the base that would hit the floor.
const ys: number[] = [];
for (let i = 0; i < count; i++) ys.push(at(i).y);
ys.sort((a,b)=>a-b);
const cut = ys[Math.floor(ys.length * 0.03)];
console.log(`\nbase band: y <= ${cut.toFixed(3)} (min ${ys[0].toFixed(3)})`);
// Of those base points, which is furthest toward the camera (+z in world)?
let best: {p: THREE.Vector3; w: THREE.Vector3} | null = null;
const basePts: THREE.Vector3[] = [];
for (let i = 0; i < count; i++) {
  const p = at(i);
  if (p.y > cut) continue;
  basePts.push(p);
  const w = p.clone().applyMatrix4(stage);
  if (!best || w.z > best.w.z) best = { p, w };
}
const centroid = basePts.reduce((s,p)=>s.add(p), new THREE.Vector3()).multiplyScalar(1/basePts.length);
console.log(`base points: ${basePts.length}`);
console.log(`base centroid model (${centroid.toArray().map(v=>v.toFixed(3)).join(", ")})` +
  ` -> world (${centroid.clone().applyMatrix4(stage).toArray().map(v=>v.toFixed(3)).join(", ")})`);
console.log(`front-most base point model (${best!.p.toArray().map(v=>v.toFixed(3)).join(", ")})` +
  ` -> world (${best!.w.toArray().map(v=>v.toFixed(3)).join(", ")})`);
const frac = (p: THREE.Vector3) => [
  (p.x - box.min.x)/size.x, (p.y - box.min.y)/size.y, (p.z - box.min.z)/size.z,
].map(v=>v.toFixed(3)).join(", ");
console.log(`\nas bbox fractions:`);
console.log(`  base centroid   [${frac(centroid)}]`);
console.log(`  front-most base [${frac(best!.p)}]`);
// A point between the two: on the floor, toward the camera.
const mix = centroid.clone().lerp(best!.p, 0.7);
console.log(`  70% toward front [${frac(mix)}]  -> world (${mix.clone().applyMatrix4(stage).toArray().map(v=>v.toFixed(3)).join(", ")})`);
