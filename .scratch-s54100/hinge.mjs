import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { readFileSync } from "node:fs";
const buf = readFileSync("public/model/robot/robot.glb");
const g = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const scene = g.scene;
scene.updateWorldMatrix(true, true);
for (const name of ["part_indexer_1x1_thin_5x_half_c_alu_v1_0", "part_indexer_1x1_thin_5x_half_c_alu_v1_1", "part_indexer_component222_0"]) {
  const node = scene.getObjectByName(name);
  const pivot = node.position.clone();           // node translation == chosen pivot
  let best = Infinity, near = null, box = new THREE.Box3();
  const v = new THREE.Vector3();
  node.traverse((c) => {
    if (!c.isMesh) return;
    const pos = c.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld);
      box.expandByPoint(v);
      const d = v.distanceTo(pivot);
      if (d < best) { best = d; near = v.clone(); }
    }
  });
  console.log(`${name.replace("part_indexer_", "")}`);
  console.log(`  pivot            ${pivot.toArray().map(n=>n.toFixed(4))}`);
  console.log(`  nearest vertex   ${near.toArray().map(n=>n.toFixed(4))}   distance ${best.toFixed(4)}`);
  console.log(`  part box         ${box.min.toArray().map(n=>n.toFixed(4))} .. ${box.max.toArray().map(n=>n.toFixed(4))}`);
}
