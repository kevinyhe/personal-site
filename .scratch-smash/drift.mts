// Offline audit of the drift run: how sideways the robot actually is, per
// phase, and where it ends up. Slip angle is the angle between where the
// nose points and where the robot is travelling — that IS driftiness.
const { buildDriftPath, DRIFT_FINISH } = await import("../components/robotDrift.ts");
const frames = buildDriftPath({ sampleRate: 120 });
const end = frames[frames.length - 1].time;
// Schedule boundaries, cumulative (durations 1.5,0.6,0.8,1.1,1.2,1.75,1.0).
const BOUNDS: Array<[string, number, number]> = [
  ["1 entry        ", 0.0, 1.5],
  ["2 flick        ", 1.5, 2.1],
  ["3 slide        ", 2.1, 2.9],
  ["4 steer to app ", 2.9, 4.0],
  ["5 TURN TO GOAL ", 4.0, 5.2],
  ["6 back in      ", 5.2, 6.95],
  ["7 stop         ", 6.95, 7.95],
];
const deg = (r: number) => (r * 180) / Math.PI;
console.log(`run length ${end.toFixed(2)} s, ${frames.length} frames`);
console.log("phase             mean|slip|  max|slip|   mean speed  max speed");
for (const [label, a, b] of BOUNDS) {
  const win = frames.filter((f) => f.time >= a && f.time < b);
  if (!win.length) continue;
  const slip = win.map((f) => Math.abs(deg(f.slipAngle)));
  const spd = win.map((f) => Math.hypot(f.velocity[0], f.velocity[1]));
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  console.log(`${label}  ${mean(slip).toFixed(1).padStart(7)}   ${Math.max(...slip).toFixed(1).padStart(7)}   ` +
    `${mean(spd).toFixed(2).padStart(9)}  ${Math.max(...spd).toFixed(2).padStart(8)}`);
}
// Speed and sideways-ness over time: where does the drift's momentum go?
console.log("\ntime   speed  |slip|  lateral (speed*sin|slip|, the sliding part)");
for (let t = 0; t <= 7.9; t += 0.25) {
  const f0 = frames.reduce((b, f) => (Math.abs(f.time - t) < Math.abs(b.time - t) ? f : b));
  const sp = Math.hypot(f0.velocity[0], f0.velocity[1]);
  const sl = Math.abs(deg(f0.slipAngle));
  const lat = sp * Math.abs(Math.sin(f0.slipAngle));
  const bar = "#".repeat(Math.round(lat * 12));
  console.log(`${t.toFixed(2).padStart(5)}  ${sp.toFixed(2).padStart(5)}  ${sl.toFixed(0).padStart(5)}   ${lat.toFixed(2).padStart(5)} ${bar}`);
}
const f = DRIFT_FINISH;
console.log(`\nfinish heading ${deg(f.heading).toFixed(1)} deg  position (${f.position.map((v) => v.toFixed(3)).join(", ")})`);
console.log(`goal mouth (robot lengths) (-2.250, -2.125)`);
