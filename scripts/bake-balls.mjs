/**
 * Runs the ball simulation once and writes the table the scene reads.
 *
 *   node scripts/bake-balls.mjs [--fps 60] [--out components/ballTrack.json]
 *
 * Why bake at all: the scene is scroll-scrubbed, so the run has to play
 * backwards frame for frame. A stepper called from `useFrame` cannot do that
 * -- it drifts apart from itself the moment the playhead reverses. So the
 * physics runs here, once, at a fixed timestep, and the site reads the
 * result. Two reads at the same time are the same numbers by construction.
 *
 * What is being simulated is in scripts/ballSim/: the robot's own flex wheels
 * and chain runs turning at one belt speed, a corridor a ball wide, the
 * indexer gate, and the goal. The balls are dynamic bodies; nothing pushes
 * them along a path.
 */

import { register } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

// robotDrift.ts imports "@/components/robotConstants" (the leaf the stage
// and the outro share). Plain node cannot resolve that alias, so this died
// at import time with ERR_MODULE_NOT_FOUND until the hooks were registered
// here the way bake-chunks.mjs and bake-cherry.mjs already do.
const REPO = dirname(dirname(fileURLToPath(import.meta.url))) + "/";
register(pathToFileURL(REPO + "scripts/ts-hooks.mjs"), pathToFileURL(REPO));

import { buildSimulation, SIM_DT } from "./ballSim/run.mjs";
import { BALL_RADIUS, BELT_SPEED, guideLength } from "./ballSim/world.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** Frames written to the table. */
const DEFAULT_FPS = 60;
/** Give up after this much simulated time even if something is still rolling. */
const MAX_SECONDS = 30;
/** A ball moving slower than this counts as parked. */
const REST_SPEED = 0.05;
/** Numbers per ball per frame: position, quaternion, carried flag. */
const STRIDE = 8;

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const FPS = Number(readArg("fps", DEFAULT_FPS));
const OUT = resolve(ROOT, readArg("out", "components/ballTrack.json"));

const sim = await buildSimulation();
const stepsPerFrame = Math.max(1, Math.round(1 / (FPS * SIM_DT)));
const frames = [];

/** Is the ball inside the robot's corridor at this instant? */
function carried(position, pose) {
  const [x, y, z] = sim.worldToModel(position, pose);
  return Math.abs(x) < 0.3 && z > -0.6 && z < 0.95 && y > 0.05 && y < 1.9;
}

let restingSince = null;
const maxSteps = Math.ceil(MAX_SECONDS / SIM_DT);
let pose = sim.poseAt(0);
for (let step = 0; step <= maxSteps; step += 1) {
  if (step % stepsPerFrame === 0) {
    const row = new Array(sim.ballBodies.length * STRIDE);
    for (let i = 0; i < sim.ballBodies.length; i += 1) {
      const t = sim.ballBodies[i].translation();
      const r = sim.ballBodies[i].rotation();
      const base = i * STRIDE;
      row[base] = t.x;
      row[base + 1] = t.y;
      row[base + 2] = t.z;
      row[base + 3] = r.x;
      row[base + 4] = r.y;
      row[base + 5] = r.z;
      row[base + 6] = r.w;
      row[base + 7] = carried(t, pose) ? 1 : 0;
    }
    frames.push(row);
  }
  pose = sim.step();

  if (sim.time > sim.gateOpensAt + 1) {
    const moving = sim.ballBodies.some((body) => {
      const v = body.linvel();
      return Math.hypot(v.x, v.y, v.z) > REST_SPEED;
    });
    if (!moving) {
      if (restingSince === null) restingSince = sim.time;
      if (sim.time - restingSince > 0.6) break;
    } else {
      restingSince = null;
    }
  }
}

// ------------------------------------------------------------------- write

const round = (v, places = 4) => Number(v.toFixed(places));
const table = {
  ballCount: sim.ballBodies.length,
  driftEnd: round(sim.driftEnd),
  fps: FPS,
  frames: frames.map((row) => row.map((v, i) => (i % STRIDE === 7 ? v : round(v)))),
  goal: {
    heading: round(sim.goalHeading, 5),
    mouth: sim.goalMouth.map((v) => round(v)),
    troughHeight: round(sim.goal.troughHeight),
  },
  scoringStart: round(sim.gateOpensAt),
  stride: STRIDE,
};
writeFileSync(OUT, `${JSON.stringify(table)}\n`);

// ------------------------------------------------------------------ report

const finalPose = sim.poseAt(sim.time);
const inTrough = [];
for (let i = 0; i < sim.ballBodies.length; i += 1) {
  const t = sim.ballBodies[i].translation();
  const local = [
    t.x - sim.goalMouth[0],
    t.y - sim.goalMouth[1],
    t.z - sim.goalMouth[2],
  ];
  const along = local[0] * Math.sin(sim.goalHeading) + local[2] * Math.cos(sim.goalHeading);
  const across = local[0] * Math.cos(sim.goalHeading) - local[2] * Math.sin(sim.goalHeading);
  inTrough.push({
    across: round(across, 3),
    ball: i,
    depth: round(-along, 3),
    height: round(t.y - sim.goalMouth[1], 3),
    scored: t.y - sim.goalMouth[1] > sim.goal.troughHeight - 3 * BALL_RADIUS && -along > 0,
  });
}
const scored = inTrough.filter((b) => b.scored).length;
console.log(`baked ${frames.length} frames (${((frames.length - 1) / FPS).toFixed(2)} s at ${FPS} fps) for ${sim.ballBodies.length} balls`);
console.log(`drift ends ${sim.driftEnd.toFixed(2)} s, indexer opens ${sim.gateOpensAt.toFixed(2)} s`);
console.log(`route ${guideLength().toFixed(3)} units at ${BELT_SPEED}/s -> ${(guideLength() / BELT_SPEED).toFixed(2)} s ride`);
console.log(`in the goal: ${scored} of ${sim.ballBodies.length}`);
for (const b of inTrough) {
  console.log(`  ball ${b.ball}: depth ${b.depth.toFixed(2)} across ${b.across.toFixed(2)} height ${b.height.toFixed(2)} ${b.scored ? "scored" : "-"}`);
}
console.log(`wrote ${OUT}`);
