/** Print each ball's model-space position and model-relative speed. */
import { buildSimulation } from "./run.mjs";

const sim = await buildSimulation();
const until = Number(process.argv[2] ?? 4);
const every = Number(process.argv[3] ?? 0.25);
const watch = (process.argv[4] ?? "").split(",").filter(Boolean).map(Number);
const ids = watch.length ? watch : sim.ballBodies.map((ignored, i) => i);

console.log(`drift ${sim.driftEnd.toFixed(2)}s  gate ${sim.gateOpensAt.toFixed(2)}s  wheels ${sim.wheels.length}  plates ${sim.plates.length}  gate reach ${sim.gate.reach.toFixed(3)} dir ${sim.gate.closedDirection.map((v) => v.toFixed(2))}`);
{
  const g = sim.gate;
  const tipY = g.hinge[0] + g.closedDirection[1] * g.reach;
  const tipZ = g.hinge[1] + g.closedDirection[0] * g.reach;
  console.log(`gate flap centre z,y = ${tipZ.toFixed(3)},${tipY.toFixed(3)} spans y ${(tipY - g.bladeHalfHeight).toFixed(3)}..${(tipY + g.bladeHalfHeight).toFixed(3)}  dip ${g.dip}  lift on opening ${(g.reach * Math.sin(0.36)).toFixed(3)}`);
}
const from = Number(process.argv[5] ?? 0);
let next = from;
let last = null;
while (sim.time < until) {
  const pose = sim.step();
  if (sim.time >= next) {
    next += every;
    const now = ids.map((i) => sim.worldToModel(sim.ballBodies[i].translation(), pose));
    const parts = now.map((m, k) => {
      const speed = last ? Math.hypot(m[1] - last[k][1], m[2] - last[k][2]) / every : 0;
      return `${m[2].toFixed(2)},${m[1].toFixed(2)}(${speed.toFixed(1)})`;
    });
    last = now;
    console.log(`${sim.time.toFixed(2)} ${parts.join(" ")}`);
  }
}
