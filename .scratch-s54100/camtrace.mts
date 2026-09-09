// World-space camera bearing around the robot, to see how much the shot whips.
import { buildDriftPath } from "../components/robotDrift.ts";
const KEYS_AZ: Array<[number, number]> = [[0,-45],[1.5,-45],[2.6,-10],[4.0,30],[5.6,65],[7.0,90]];
const keyed=(k:Array<[number,number]>,at:number)=>{if(at<=k[0][0])return k[0][1];for(let i=1;i<k.length;i++){if(at>k[i][0])continue;const[t0,v0]=k[i-1],[t1,v1]=k[i];const x=Math.min(1,Math.max(0,(at-t0)/(t1-t0)));return v0+(v1-v0)*x*x*(3-2*x);}return k[k.length-1][1];};
const f = buildDriftPath();
const dur = f[f.length-1].time;
const at=(t:number)=>f[Math.min(f.length-1,Math.round(t/dur*(f.length-1)))];
const LAG=0.15;
let prev=null as number|null;
console.log("  t   robotHdg  az   worldBearing  d/dt(deg/s)");
for(let t=0;t<=dur;t+=0.2){
  const a=at(Math.max(0,t-LAG));
  const az=keyed(KEYS_AZ,t);
  const b=(a.heading*180/Math.PI)+az;
  const rate = prev===null?0:(b-prev)/0.2;
  prev=b;
  console.log(` ${t.toFixed(1).padStart(4)} ${(a.heading*180/Math.PI).toFixed(0).padStart(6)} ${az.toFixed(0).padStart(5)} ${b.toFixed(0).padStart(8)} ${rate.toFixed(0).padStart(8)}`);
}
