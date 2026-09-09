import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { readFileSync } from "node:fs";
const load = async (path) => {
  const buf = readFileSync(path);
  const g = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  return g.scene;
};
const names = ["part_indexer_1x1_thin_5x_half_c_alu_v1_0", "part_indexer_1x1_thin_5x_half_c_alu_v1_1", "part_indexer_component222_0"];
const report = async (path, angle) => {
  const scene = await load(path);
  const out = [];
  for (const n of names) {
    const o = scene.getObjectByName(n);
    if (!o) { out.push(`${n}: MISSING`); continue; }
    o.rotation.x = angle;
    o.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(o);
    out.push(`${n.replace("part_indexer_","")} min ${box.min.toArray().map(v=>v.toFixed(4))} max ${box.max.toArray().map(v=>v.toFixed(4))}`);
  }
  return out;
};
for (const a of [0, 0.36]) {
  console.log(`--- angle ${a}`);
  for (const line of await report(process.argv[2], a)) console.log("  " + line);
}
