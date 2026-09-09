import fs from "node:fs";
globalThis.fetch = async (u) => { const b = fs.readFileSync("public" + String(u));
  return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength) }; };
const { loadBallModel, loadGoalModel } = await import("../components/propModels.ts");
const ball = await loadBallModel();
console.log("ball radius", ball.radius.toFixed(4));
const goal = await loadGoalModel();
console.log("goal length", goal.length.toFixed(3), "troughHeight", goal.troughHeight.toFixed(3), "openings", goal.openings.length);
for (const o of goal.openings) console.log("  at", o.position.map(n=>+n.toFixed(3)), "inward", o.inward.map(n=>+n.toFixed(3)));
const THREE = await import("three");
for (const [n,obj] of [["ball",ball.object],["goal",goal.object]]) {
  const b = new THREE.Box3().setFromObject(obj);
  console.log(n, "bounds", b.min.toArray().map(x=>+x.toFixed(3)), b.max.toArray().map(x=>+x.toFixed(3)));
}
