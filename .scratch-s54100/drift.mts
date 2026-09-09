import { buildDriftPath, DRIFT_FINISH, BALL_PICKUP_TIMES } from "../components/robotDrift.ts";
const f = buildDriftPath({ wheelRadius: 0.1594914439676 / 1.6 });
const dur = f[f.length - 1].time;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const deg = (r: number) => (r * 180) / Math.PI;
const spd = (s: any) => Math.hypot(s.velocity[0], s.velocity[1]);
const at = (t: number) => f[Math.min(f.length - 1, Math.round((t / dur) * (f.length - 1)))];
console.log(`duration ${dur.toFixed(2)}s frames ${f.length}`);
for (let t = 0; t <= dur + 1e-9; t += 0.35) {
  const s = at(t);
  // is it travelling forwards or backwards relative to its nose?
  const fwd = Math.sin(s.heading) * s.velocity[0] + Math.cos(s.heading) * s.velocity[1];
  console.log(` t=${t.toFixed(2)} pos ${s.position[0].toFixed(2)},${s.position[1].toFixed(2)} hdg ${deg(wrap(s.heading)).toFixed(0)} spd ${spd(s).toFixed(2)} ${fwd>=0?"fwd":"REV"} slip ${deg(s.slipAngle).toFixed(0)}`);
}
const last = f[f.length - 1];
console.log(`total rotation ${deg(last.heading - f[0].heading).toFixed(0)} deg`);
console.log(`final heading ${deg(wrap(last.heading)).toFixed(1)} (want 90)  final speed ${spd(last).toFixed(3)}`);
console.log(`extent x ${Math.min(...f.map(s=>s.position[0])).toFixed(1)}..${Math.max(...f.map(s=>s.position[0])).toFixed(1)} z ${Math.min(...f.map(s=>s.position[1])).toFixed(1)}..${Math.max(...f.map(s=>s.position[1])).toFixed(1)}`);
console.log(`peak slip ${deg(Math.max(...f.map(s=>Math.abs(s.slipAngle)))).toFixed(0)}  DRIFT_FINISH ${JSON.stringify(DRIFT_FINISH.position.map(n=>+n.toFixed(2)))} hdg ${deg(wrap(DRIFT_FINISH.heading)).toFixed(0)}  pickups ${BALL_PICKUP_TIMES.length}`);
