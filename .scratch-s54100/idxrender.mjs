// Orthographic wireframe/solid render of the three indexer parts, side view
// (looking down model +X), so their attachment is visible.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "/tmp/claude-1000/-home-kevin-projects-arbor-web/54100826-470d-415c-9137-9830d97c804a/scratchpad/node_modules/pngjs/lib/png.js";

const path = process.argv[2];
const angle = Number(process.argv[3] ?? 0);
const out = process.argv[4];
const buf = readFileSync(path);
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const scene = gltf.scene;
const names = [
  ["part_indexer_1x1_thin_5x_half_c_alu_v1_0", [255, 90, 90]],
  ["part_indexer_1x1_thin_5x_half_c_alu_v1_1", [255, 170, 60]],
  ["part_indexer_component222_0", [90, 160, 255]],
];
// view window in (z, y): the indexer sits around y 1.5-1.95, z -0.8..0.15
const Z0 = -0.95, Z1 = 0.30, Y0 = 1.35, Y1 = 2.05;
const W = 1000, H = Math.round(W * (Y1 - Y0) / (Z1 - Z0));
const img = new PNG({ width: W, height: H });
img.data.fill(18);
const depth = new Float32Array(W * H).fill(Infinity);

const px = (z) => ((z - Z0) / (Z1 - Z0)) * W;
const py = (y) => (1 - (y - Y0) / (Y1 - Y0)) * H;

const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
for (const [name, colour] of names) {
  const node = scene.getObjectByName(name);
  if (!node) { console.log("missing", name); continue; }
  node.rotation.x = angle;
  node.updateWorldMatrix(true, true);
  node.traverse((child) => {
    const mesh = child;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(i + k) : i + k;
        v[k].fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      }
      // depth = model x (viewer at +x looking -x)
      const ax = px(v[0].z), ay = py(v[0].y);
      const bx = px(v[1].z), by = py(v[1].y);
      const cx = px(v[2].z), cy = py(v[2].y);
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-9) continue;
      // flat shade off the facet normal
      const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).normalize();
      const lit = 0.35 + 0.65 * Math.abs(n.dot(new THREE.Vector3(0.6, 0.5, 0.62).normalize()));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const w0 = ((bx - ax) * (y + 0.5 - ay) - (by - ay) * (x + 0.5 - ax)) / area;
        const w1 = ((x + 0.5 - ax) * (cy - ay) - (y + 0.5 - ay) * (cx - ax)) / area;
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
        const d = v[0].x * (1 - w0 - w1) + v[2].x * w0 + v[1].x * w1;
        const o = y * W + x;
        if (-d >= depth[o]) continue;
        depth[o] = -d;
        const p = o * 4;
        img.data[p] = Math.min(255, colour[0] * lit);
        img.data[p + 1] = Math.min(255, colour[1] * lit);
        img.data[p + 2] = Math.min(255, colour[2] * lit);
        img.data[p + 3] = 255;
      }
    }
  });
}
writeFileSync(out, PNG.sync.write(img));
console.log("wrote", out, W, H);
