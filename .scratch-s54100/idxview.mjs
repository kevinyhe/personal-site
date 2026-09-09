// Renders the indexer region with chassis context, from a chosen direction.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "/tmp/claude-1000/-home-kevin-projects-arbor-web/54100826-470d-415c-9137-9830d97c804a/scratchpad/node_modules/pngjs/lib/png.js";

const [path, angleStr, view, out] = process.argv.slice(2);
const angle = Number(angleStr);
const buf = readFileSync(path);
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const scene = gltf.scene;
const IDX = {
  part_indexer_1x1_thin_5x_half_c_alu_v1_0: [255, 90, 90],
  part_indexer_1x1_thin_5x_half_c_alu_v1_1: [255, 175, 60],
  part_indexer_component222_0: [80, 150, 255],
};
for (const n of Object.keys(IDX)) {
  const o = scene.getObjectByName(n);
  if (o) o.rotation.x = angle;
}
scene.updateWorldMatrix(true, true);

// Camera basis: right, up, forward(depth).
const BASES = {
  side: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)],  // look along -x
  front: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],  // look along +z... from -z
  top: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0)],
};
const [R, U, F] = BASES[view];
// Window centred on the indexer, in camera units.
const CENTRE = new THREE.Vector3(0.02, 1.70, -0.35);
const HALF = 0.62;
const W = 900, H = 900;
const img = new PNG({ width: W, height: H });
img.data.fill(16);
const depth = new Float32Array(W * H).fill(Infinity);
const light = new THREE.Vector3(0.5, 0.7, 0.5).normalize();
const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const rel = new THREE.Vector3();

function draw(node, colour) {
  node.traverse((child) => {
    if (!child.isMesh) return;
    const pos = child.geometry.attributes.position;
    const index = child.geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const s = [];
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(i + k) : i + k;
        p[k].fromBufferAttribute(pos, vi).applyMatrix4(child.matrixWorld);
        rel.subVectors(p[k], CENTRE);
        s.push([
          ((rel.dot(R) + HALF) / (2 * HALF)) * W,
          (1 - (rel.dot(U) + HALF) / (2 * HALF)) * H,
          rel.dot(F),
        ]);
      }
      const [a, b, c] = s;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      if (maxX < minX || maxY < minY) continue;
      const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).normalize();
      const lit = 0.32 + 0.68 * Math.abs(n.dot(light));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const w0 = ((b[0] - a[0]) * (y + 0.5 - a[1]) - (b[1] - a[1]) * (x + 0.5 - a[0])) / area;
        const w1 = ((x + 0.5 - a[0]) * (c[1] - a[1]) - (y + 0.5 - a[1]) * (c[0] - a[0])) / area;
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
        const d = a[2] * (1 - w0 - w1) + c[2] * w0 + b[2] * w1;
        const o = y * W + x;
        if (d >= depth[o]) continue;
        depth[o] = d;
        const q = o * 4;
        img.data[q] = Math.min(255, colour[0] * lit);
        img.data[q + 1] = Math.min(255, colour[1] * lit);
        img.data[q + 2] = Math.min(255, colour[2] * lit);
        img.data[q + 3] = 255;
      }
    }
  });
}
// chassis + everything else first, in grey
scene.traverse((o) => {
  if (!o.isMesh) return;
  let top = o;
  while (top.parent && top.parent !== scene) top = top.parent;
  if (IDX[top.name] || IDX[o.name]) return;
  draw(o, [120, 120, 130]);
});
for (const [n, colour] of Object.entries(IDX)) {
  const o = scene.getObjectByName(n);
  if (o) draw(o, colour);
}
writeFileSync(out, PNG.sync.write(img));
console.log("wrote", out);
