// Model B: the camera's WORLD bearing is keyed directly, so its angular rate
// is chosen rather than inherited from the robot's yaw.
import { buildDriftPath } from "../components/robotDrift.ts";
const RL = 1.6, GROUND = -1.2, LAG = 0.15;
const keyed=(k:Array<[number,number]>,at:number)=>{if(at<=k[0][0])return k[0][1];for(let i=1;i<k.length;i++){if(at>k[i][0])continue;const[t0,v0]=k[i-1],[t1,v1]=k[i];const x=Math.min(1,Math.max(0,(at-t0)/(t1-t0)));return v0+(v1-v0)*x*x*(3-2*x);}return k[k.length-1][1];};
const f = buildDriftPath();
const driftEnd = f[f.length - 1].time;
const RATE = (f.length - 1) / driftEnd;
const at = (t: number) => f[Math.min(f.length - 1, Math.max(0, Math.round(t * RATE)))];
const TOTAL = 11.63;
const H0 = f[0].heading, H1 = f[f.length - 1].heading;
const deg = (r: number) => r * 180 / Math.PI;
console.log(`robot heading ${deg(H0).toFixed(0)} -> ${deg(H1).toFixed(0)} (turns ${deg(H1-H0).toFixed(0)})`);
// World bearing endpoints that give the requested relative framing.
const B0 = H0 - 45 * Math.PI / 180;
const B1 = H1 + (JSON.parse(process.argv[2] ?? "{}").az1 ?? 90) * Math.PI / 180;
console.log(`camera bearing ${deg(B0).toFixed(0)} -> ${deg(B1).toFixed(0)} (sweeps ${deg(B1-B0).toFixed(0)})`);

const args = JSON.parse(process.argv[2] ?? "{}");
const BEAR: Array<[number, number]> = args.bear ?? [[0, 0], [1.2, 0], [TOTAL, 1]];
const DIST: Array<[number, number]> = args.dist ?? [[0,4.6],[3.6,5.2],[5.2,6.4],[7.4,8.6],[TOTAL,9.6]];
const LIFT: Array<[number, number]> = args.lift ?? [[0,0.28],[3.6,0.42],[7.4,3.0],[TOTAL,3.4]];
const steps: number[] = [];
let prev: [number, number, number] | null = null;
const DT = TOTAL / 96;
const rows: string[] = [];
for (let t = 0; t <= TOTAL + 1e-9; t += DT) {
  const s = at(t - LAG);
  const side = B0 + (B1 - B0) * keyed(BEAR, t);
  const orbit = keyed(DIST, t), lift = keyed(LIFT, t);
  const cam: [number, number, number] = [s.position[0]*RL + Math.sin(side)*orbit, GROUND + lift, s.position[1]*RL + Math.cos(side)*orbit];
  if (prev) { const d = Math.hypot(cam[0]-prev[0], cam[1]-prev[1], cam[2]-prev[2]); steps.push(d); rows.push(` t=${t.toFixed(2).padStart(5)} rel=${(deg(side - s.heading + Math.PI*8) % 360 - 180).toFixed(0).padStart(5)}  ${d.toFixed(3)}`); }
  prev = cam;
}
const body = steps.slice(3); // skip the first frames, where the lagged anchor is still clamped
const mean = body.reduce((a,b)=>a+b,0)/body.length;
const lo = Math.min(...body), hi = Math.max(...body);
const band = (t0: number, t1: number) => {
  const a = Math.max(0, Math.round(t0 / DT) - 1), b = Math.min(steps.length, Math.round(t1 / DT));
  const sl = steps.slice(a, b);
  return sl.reduce((x, y) => x + y, 0) / Math.max(sl.length, 1);
};
console.log(`mean ${mean.toFixed(3)} min ${lo.toFixed(3)} max ${hi.toFixed(3)} | max/mean ${(hi/mean).toFixed(2)} min/mean ${(lo/mean).toFixed(2)}`);
console.log(`  bands  entry(0-1.5) ${band(0.3,1.5).toFixed(2)}  drift(1.5-4) ${band(1.5,4).toFixed(2)}  spin(4-6) ${band(4,6).toFixed(2)}  back(6-7.5) ${band(6,7.5).toFixed(2)}  score(7.5-end) ${band(7.5,TOTAL).toFixed(2)}`);
if (process.argv[3] === "trace") rows.forEach((r, i) => { if (i % 2 === 0) console.log(r); });
