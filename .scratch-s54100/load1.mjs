import * as THREE from "three";
import fs from "node:fs";
globalThis.fetch = async (u) => {
  const p = "public" + String(u);
  const b = fs.readFileSync(p);
  return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const { loadRobotModel } = await import("../components/robotModel.ts");
const m = await loadRobotModel();
console.log("length", m.length, "wheels", m.wheels.length, "spinners", m.spinners.length);
const byCat = {};
for (const s of m.spinners) (byCat[s.category] ??= []).push(s);
for (const [c, list] of Object.entries(byCat)) {
  const rs = list.map((s) => s.radius);
  console.log(` ${c}: ${list.length}  radius ${Math.min(...rs).toFixed(4)}..${Math.max(...rs).toFixed(4)}  sides ${[...new Set(list.map(s=>s.side))].join("/")}`);
}
// every spinner must be a sibling of chassis (child of root), and off-origin
const parents = new Set(m.spinners.map((s) => s.object.parent?.name));
console.log("spinner parents:", [...parents].join(","), "| chassis parent:", m.chassis.parent?.name);
const wheelR = m.wheels[0].radius;
console.log("wheel radius", wheelR.toFixed(4), "-> a drive gear turns", (wheelR/byCat.drive[0].radius).toFixed(2), "x wheel speed");
// bounds must be unchanged: length 1.6, wheels on the ground
const box = new THREE.Box3();
for (const o of [m.chassis, ...m.wheels.map(w=>w.object), ...m.spinners.map(s=>s.object)]) box.expandByObject(o);
console.log("bounds min", box.min.toArray().map(n=>+n.toFixed(3)), "max", box.max.toArray().map(n=>+n.toFixed(3)));
