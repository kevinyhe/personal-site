// Offline model of the outro camera: how far does it move per unit of run
// time? Equal scroll = equal run time (measured), so a flat profile here is
// a camera that tracks the scroll evenly.
import { buildDriftPath } from "../components/robotDrift.ts";
const RL = 1.6, GROUND = -1.2, LAG = 0.15;
const AZ: Array<[number, number]> = JSON.parse(process.env.AZ ?? "[[0,-45],[1.5,-45],[2.6,-10],[4.0,30],[5.6,65],[7.4,90]]");
const DIST: Array<[number, number]> = JSON.parse(process.env.DIST ?? "[[0,4.6],[3.6,5.2],[5.2,6.4],[7.4,8.6]]");
const LIFT: Array<[number, number]> = JSON.parse(process.env.LIFT ?? "[[0,0.28],[3.6,0.42],[7.4,3.0]]");
const BEHIND: Array<[number, number]> = JSON.parse(process.env.BEHIND ?? "[[0,0],[5.2,0.4],[7.4,1.8]]");
const AIMY: Array<[number, number]> = [[0,0.62],[3.6,0.7],[7.4,0.9]];
function keyed(keys: Array<[number, number]>, at: number): number {
  if (at <= keys[0][0]) return keys[0][1];
  const last = keys.length - 1;
  if (at >= keys[last][0]) return keys[last][1];
  let i = 0;
  while (i < last - 1 && at > keys[i + 1][0]) i += 1;
  const [t0, v0] = keys[i];
  const [t1, v1] = keys[i + 1];
  const h = Math.max(t1 - t0, 1e-6);
  const slope = (n: number) => (keys[n + 1][1] - keys[n][1]) / Math.max(keys[n + 1][0] - keys[n][0], 1e-6);
  const d = slope(i);
  let m0 = i === 0 ? d : (slope(i - 1) + d) / 2;
  let m1 = i + 1 === last ? d : (d + slope(i + 1)) / 2;
  if (d === 0) { m0 = 0; m1 = 0; } else {
    m0 = Math.max(-3 * Math.abs(d), Math.min(3 * Math.abs(d), m0 * Math.sign(d) < 0 ? 0 : m0));
    m1 = Math.max(-3 * Math.abs(d), Math.min(3 * Math.abs(d), m1 * Math.sign(d) < 0 ? 0 : m1));
  }
  const x = Math.min(1, Math.max(0, (at - t0) / h)), x2 = x * x, x3 = x2 * x;
  return (2*x3-3*x2+1)*v0 + (x3-2*x2+x)*h*m0 + (-2*x3+3*x2)*v1 + (x3-x2)*h*m1;
}
const f = buildDriftPath();
const driftEnd = f[f.length - 1].time;
const RATE = (f.length - 1) / driftEnd;
const at = (t: number) => f[Math.min(f.length - 1, Math.max(0, Math.round(t * RATE)))];
const TOTAL = 11.63;
const DRIFT_SHARE = 0.82;
// scroll fraction -> run time, matching RobotOutro's bent map
const playhead = (u: number) => (u <= DRIFT_SHARE ? (u / DRIFT_SHARE) * driftEnd : driftEnd + ((u - DRIFT_SHARE) / (1 - DRIFT_SHARE)) * (TOTAL - driftEnd));

function anchor(t: number, window: number, taps: number) {
  const base = t - LAG;
  if (window <= 0) { const s = at(base); return { h: s.heading, x: s.position[0]*RL, z: s.position[1]*RL }; }
  let h = 0, x = 0, z = 0;
  for (let i = 0; i < taps; i++) {
    const s = at(base + window * (-1 + (2 * i) / (taps - 1)));
    h += s.heading; x += s.position[0]*RL; z += s.position[1]*RL;
  }
  return { h: h/taps, x: x/taps, z: z/taps };
}

function profile(window: number, taps: number) {
  const steps: number[] = [];
  let prev: [number, number, number] | null = null;
  let prevAim: [number, number, number] | null = null;
  const DT = TOTAL / 96;
  for (let k = 0; k <= 96; k++) {
    const t = playhead(k / 96);
    const a = anchor(t, window, taps);
    const az = keyed(AZ, t) * Math.PI / 180;
    const orbit = keyed(DIST, t), lift = keyed(LIFT, t);
    const side = a.h + az;
    const cam: [number, number, number] = [a.x + Math.sin(side)*orbit, GROUND + lift, a.z + Math.cos(side)*orbit];
    const behind = keyed(BEHIND, t);
    const aim: [number, number, number] = [a.x - Math.sin(a.h)*behind, GROUND + keyed(AIMY, t), a.z - Math.cos(a.h)*behind];
    if (prev) steps.push(Math.hypot(cam[0]-prev[0], cam[1]-prev[1], cam[2]-prev[2]) + Math.hypot(aim[0]-prevAim![0], aim[1]-prevAim![1], aim[2]-prevAim![2]));
    prev = cam; prevAim = aim;
  }
  const body = steps.slice(3);
  const mean = body.reduce((s,x)=>s+x,0)/body.length;
  const max = Math.max(...body);
  const min = Math.min(...body);
  const band = (t0:number,t1:number)=>{const inv=(tt:number)=>tt<=driftEnd?(tt/driftEnd)*DRIFT_SHARE*96:(DRIFT_SHARE+((tt-driftEnd)/(TOTAL-driftEnd))*(1-DRIFT_SHARE))*96;const a=Math.max(0,Math.round(inv(t0))-1),b=Math.min(steps.length,Math.round(inv(t1)));const sl=steps.slice(a,b);return sl.reduce((x,y)=>x+y,0)/Math.max(sl.length,1);};
  return { mean, max, min, ratio: max/mean, steps, bands: [band(0.3,1.5),band(1.5,4),band(4,6),band(6,7.5),band(7.5,TOTAL)] };
}

for (const w of [0, 0.6, 1.2]) {
  const p = profile(w, w === 0 ? 1 : 21);
  console.log(`window ${w.toFixed(1)}s  mean ${p.mean.toFixed(3)}  min ${p.min.toFixed(3)}  max ${p.max.toFixed(3)}  max/mean ${p.ratio.toFixed(2)}  bands ${p.bands.map(b=>b.toFixed(2)).join(" ")}`);
}
if (process.argv[2] === "trace") {
  const p = profile(Number(process.argv[4] ?? 1.2), 21);
  p.steps.forEach((s, i) => console.log(` t=${((i+1)*TOTAL/96).toFixed(2).padStart(5)}  ${s.toFixed(3)}`));
}
