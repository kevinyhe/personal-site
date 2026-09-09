import { buildDriftPath } from "../components/robotDrift.ts";
const RL = 1.6;
// Goal footprint in STAGE units: mouth (-3.6,-3.4), body runs +z, 300mm wide.
const GX = -3.6, HALF_W = 0.575, Z0 = -3.4, Z1 = -3.4 + 5.7;
const HALF = 0.8; // robot half-extent, stage units
const f = buildDriftPath();
let worst = { pen: -1e9, t: 0 };
for (const s of f) {
  if (s.time > 6.0) continue; // the closing reverse-in is meant to enter the mouth
  const x = s.position[0] * RL, z = s.position[1] * RL;
  // Axis-aligned approximation of the robot's box (conservative: circumscribed square).
  const dx = Math.max(GX - HALF_W - (x + HALF), (x - HALF) - (GX + HALF_W));
  const dz = Math.max(Z0 - (z + HALF), (z - HALF) - Z1);
  const gap = Math.max(dx, dz); // negative => boxes overlap
  if (-gap > worst.pen) worst = { pen: -gap, t: s.time };
}
console.log(`deepest box overlap ${worst.pen.toFixed(3)} stage units at t=${worst.t.toFixed(2)}  (negative = clear)`);
