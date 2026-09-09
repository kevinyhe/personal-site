import { buildDriftPath, DRIFT_FINISH, BALL_PICKUP_TIMES } from "../components/robotDrift.ts";
const RL = 1.6;
const MOUTH: [number, number] = [-3.6 / RL, -3.4 / RL];  // robot lengths
const f = buildDriftPath();
const dur = f[f.length - 1].time;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const deg = (r: number) => (r * 180) / Math.PI;
const spd = (s: any) => Math.hypot(s.velocity[0], s.velocity[1]);
const at = (t: number) => f[Math.min(f.length - 1, Math.round((t / dur) * (f.length - 1)))];
console.log(`duration ${dur.toFixed(2)}s   mouth(rl) ${MOUTH[0].toFixed(2)},${MOUTH[1].toFixed(2)}`);
console.log(`  t     x      z    | hdg  spd  f/r slip | dMouth`);
for (let t = 0; t <= dur + 1e-9; t += 0.3) {
  const s = at(t);
  const fwd = Math.sin(s.heading) * s.velocity[0] + Math.cos(s.heading) * s.velocity[1];
  const d = Math.hypot(s.position[0]-MOUTH[0], s.position[1]-MOUTH[1]);
  console.log(` ${t.toFixed(2)} ${s.position[0].toFixed(2).padStart(6)} ${s.position[1].toFixed(2).padStart(6)} | ${deg(wrap(s.heading)).toFixed(0).padStart(4)} ${spd(s).toFixed(2)} ${fwd>=0?"fwd":"REV"} ${deg(s.slipAngle).toFixed(0).padStart(5)} | ${d.toFixed(2)}`);
}
const last = f[f.length - 1];
// overshoot: how far past the mouth plane (z < mouth z) does it ever get?
const minZ = Math.min(...f.map(s=>s.position[1]));
console.log(`\ntotal rotation ${deg(last.heading - f[0].heading).toFixed(0)} deg`);
// turn direction of the closing correction: sign of heading change after the deepest point
const iDeep = f.reduce((b,s,i)=> s.position[1] < f[b].position[1] ? i : b, 0);
console.log(`deepest z ${minZ.toFixed(2)} at t=${f[iDeep].time.toFixed(2)}  (mouth z ${MOUTH[1].toFixed(2)}; overshoot ${(MOUTH[1]-minZ).toFixed(2)} rl)`);
console.log(`closing turn ${deg(last.heading - f[iDeep].heading).toFixed(0)} deg (want POSITIVE = same way as the drift)`);
console.log(`drift turn    ${deg(f[iDeep].heading - f[0].heading).toFixed(0)} deg`);
const dx = last.position[0]-MOUTH[0], dz = last.position[1]-MOUTH[1];
// lateral = perpendicular to goal axis (goal runs along +z from mouth) -> lateral is x
console.log(`\nFINISH  pos ${last.position[0].toFixed(2)},${last.position[1].toFixed(2)}  mouth offset  lateral(x) ${dx.toFixed(3)} rl  along(z) ${dz.toFixed(3)} rl`);
console.log(`        heading ${deg(wrap(last.heading)).toFixed(1)} (want 180)  err ${deg(wrap(last.heading-Math.PI)).toFixed(1)} deg  speed ${spd(last).toFixed(3)}`);
console.log(`pickups ${BALL_PICKUP_TIMES.map(p=>p.time.toFixed(2)).join(" ")}`);
console.log(`extent x ${Math.min(...f.map(s=>s.position[0])).toFixed(1)}..${Math.max(...f.map(s=>s.position[0])).toFixed(1)} z ${minZ.toFixed(1)}..${Math.max(...f.map(s=>s.position[1])).toFixed(1)}`);
console.log(`peak slip ${deg(Math.max(...f.map(s=>Math.abs(s.slipAngle)))).toFixed(0)}`);
