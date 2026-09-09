/** Drop one ball at a chosen spot on the route and watch it get carried. */
import { buildSimulation } from "./run.mjs";
import { guideRoute } from "./world.mjs";

const sim = await buildSimulation();
const route = guideRoute();
const frac = Number(process.argv[2] ?? 0.9);   // where along the route to start
const seconds = Number(process.argv[3] ?? 1.5);
const [z, y] = route[Math.min(route.length - 1, Math.round(frac * (route.length - 1)))];

// park every existing ball far away so only the probe matters
sim.ballBodies.forEach((b, i) => b.setTranslation({ x: 40 + i, y: 0, z: 40 }, true));
const pose = sim.poseAt(0);
const at = sim.modelToWorld([0, y, z], pose);
const probe = sim.ballBodies[0];
probe.setTranslation({ x: at[0], y: at[1], z: at[2] }, true);
probe.setLinvel({ x: 0, y: 0, z: 0 }, true);

console.log(`probe starts at model z,y = ${z.toFixed(3)}, ${y.toFixed(3)}`);
let next = 0;
while (sim.time < seconds) {
  const p = sim.step();
  if (sim.time >= next) {
    next += 0.1;
    const m = sim.worldToModel(probe.translation(), p);
    console.log(`  ${sim.time.toFixed(2)}s  z,y = ${m[2].toFixed(3)}, ${m[1].toFixed(3)}  x ${m[0].toFixed(3)}`);
  }
}
