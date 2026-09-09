// Verify the rebuilt robot.glb: contract checks via loadRobotModel(), then
// software-rasterized preview renders (top / side / three-quarter).
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import sharp from "sharp";

// fetch polyfill: serve /model/... from public/
const PUB = path.resolve("public");
globalThis.fetch = async (url) => {
  const p = path.join(PUB, String(url));
  const buf = fs.readFileSync(p);
  return {
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    ok: true,
    status: 200,
  };
};

const { loadRobotModel } = await import("../components/robotModel.ts");
const model = await loadRobotModel();
console.log("loadRobotModel: length", model.length, "wheels", model.wheels.length);
for (const w of model.wheels) {
  console.log("  wheel", w.object.name, "side", w.side, "r", +w.radius.toFixed(4),
    "pos", w.object.position.toArray().map((v) => +v.toFixed(3)).join(","));
}

// measurements straight from the parsed scene
const robot = model.chassis.parent;
robot.updateMatrixWorld(true);
const box = new THREE.Box3();
const v = new THREE.Vector3();
let tris = 0;
const meshTri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
robot.traverse((o) => {
  if (!o.isMesh) return;
  tris += meshTri(o);
  const p = o.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
});
// rendered = chassis + each wheel node's mesh
let rendered = 0;
robot.traverse((o) => { if (o.isMesh) rendered += meshTri(o); });
console.log("rendered tris (scene as instantiated):", rendered);
console.log("bounds min", box.min.toArray().map((n) => +n.toFixed(3)));
console.log("bounds max", box.max.toArray().map((n) => +n.toFixed(3)));
// ground contact per wheel: min world y of the wheel's own mesh
for (const w of model.wheels) {
  let minY = 1e9;
  w.object.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      minY = Math.min(minY, v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).y);
    }
  });
  console.log("  wheel", w.object.name, "lowest point y", +minY.toFixed(4), "(radius", +w.radius.toFixed(4) + ")");
}

// ---------------------------------------------------------------------------
// software rasterizer
// ---------------------------------------------------------------------------
function gatherTriangles() {
  const out = [];
  robot.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const p = g.attributes.position, n = g.attributes.normal;
    const idx = g.index ? g.index.array : null;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = g.groups.length ? g.groups : [{ count: (idx ? idx.length : p.count), materialIndex: 0, start: 0 }];
    const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for (const gr of groups) {
      const col = mats[gr.materialIndex] ? mats[gr.materialIndex].color : new THREE.Color(1, 0, 1);
      const met = mats[gr.materialIndex]?.metalness ?? 0;
      for (let i = gr.start; i < gr.start + gr.count; i += 3) {
        const tri = { c: col, m: met, p: [], n: [] };
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx[i + k] : i + k;
          tri.p.push(new THREE.Vector3().fromBufferAttribute(p, vi).applyMatrix4(o.matrixWorld));
          tri.n.push(new THREE.Vector3().fromBufferAttribute(n, vi).applyMatrix3(nm).normalize());
        }
        out.push(tri);
      }
    }
  });
  return out;
}
const tris3d = gatherTriangles();
console.log("raster triangles:", tris3d.length);

const center = box.getCenter(new THREE.Vector3());
const size = box.getSize(new THREE.Vector3());
const radius = Math.max(size.x, size.y, size.z) * 0.62;

function render(name, eyeDir, upHint) {
  const W = 900, H = 900;
  const img = new Float32Array(W * H * 3).fill(0.10);
  const zbuf = new Float32Array(W * H).fill(-1e30);
  const fwd = eyeDir.clone().normalize().negate(); // camera looks along fwd
  const right = new THREE.Vector3().crossVectors(fwd, upHint).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const l1 = new THREE.Vector3(0.5, 0.8, 0.4).normalize();
  const l2 = new THREE.Vector3(-0.6, 0.3, -0.6).normalize();
  const px = (pt) => {
    const d = pt.clone().sub(center);
    return [
      (d.dot(right) / radius) * 0.5 * W + W / 2,
      H / 2 - (d.dot(up) / radius) * 0.5 * H,
      -d.dot(fwd),
    ];
  };
  for (const t of tris3d) {
    const [a, b, c] = t.p.map(px);
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    if (minX > maxX || minY > maxY) continue;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / area;
        const w1 = ((c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0])) / area;
        const w2 = ((a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0])) / area;
        // barycentric via sub-areas (signed consistently with area)
        const u = w1, vv = w2, ww = w0; // weights for a,b,c
        if (u < 0 || vv < 0 || ww < 0) continue;
        const z = u * a[2] + vv * b[2] + ww * c[2];
        const o = y * W + x;
        if (z <= zbuf[o]) continue;
        zbuf[o] = z;
        const n = new THREE.Vector3()
          .addScaledVector(t.n[0], u).addScaledVector(t.n[1], vv).addScaledVector(t.n[2], ww).normalize();
        const lam = Math.max(Math.abs(n.dot(l1)), 0) * 0.7 + Math.max(Math.abs(n.dot(l2)), 0) * 0.35 + 0.18;
        img[o * 3] = t.c.r * lam;
        img[o * 3 + 1] = t.c.g * lam;
        img[o * 3 + 2] = t.c.b * lam;
      }
    }
  }
  // linear -> sRGB
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H * 3; i++) {
    const lin = Math.min(1, Math.max(0, img[i]));
    const s = lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
    rgb[i] = Math.round(s * 255);
  }
  return sharp(rgb, { raw: { channels: 3, height: H, width: W } })
    .png()
    .toFile(new URL(`./${name}.png`, import.meta.url).pathname)
    .then(() => console.log("wrote", name + ".png"));
}

await render("view-side", new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
await render("view-top", new THREE.Vector3(0, 1, 0.001), new THREE.Vector3(0, 0, -1));
await render("view-3q", new THREE.Vector3(1, 0.55, 1), new THREE.Vector3(0, 1, 0));
await render("view-front", new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
