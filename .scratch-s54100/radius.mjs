import { buildDriftPath, DRIFT_FINISH } from "../components/robotDrift.ts";
const f = buildDriftPath({ wheelRadius: 0.0997 });
const dur = f[f.length-1].time, wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)), deg=r=>r*180/Math.PI;
const at=t=>f[Math.min(f.length-1,Math.round(t/dur*(f.length-1)))];
for(let t=0;t<=dur+1e-9;t+=0.35){const s=at(t);
 const fwd=Math.sin(s.heading)*s.velocity[0]+Math.cos(s.heading)*s.velocity[1];
 console.log(` t=${t.toFixed(2)} pos ${s.position[0].toFixed(2)},${s.position[1].toFixed(2)} hdg ${deg(wrap(s.heading)).toFixed(0)} spd ${Math.hypot(...s.velocity).toFixed(2)} ${fwd>=0?"fwd":"REV"} slip ${deg(s.slipAngle).toFixed(0)}`);}
// fit a circle to the U segment (constant-yaw part)
const seg=f.filter(s=>s.time>=1.2&&s.time<=2.9).map(s=>s.position);
let sx=0,sy=0; for(const p of seg){sx+=p[0];sy+=p[1];} sx/=seg.length; sy/=seg.length;
let Suu=0,Svv=0,Suv=0,Suuu=0,Svvv=0,Suvv=0,Svuu=0;
for(const p of seg){const u=p[0]-sx,v=p[1]-sy;Suu+=u*u;Svv+=v*v;Suv+=u*v;Suuu+=u*u*u;Svvv+=v*v*v;Suvv+=u*v*v;Svuu+=v*u*u;}
const A=[[Suu,Suv],[Suv,Svv]], B=[(Suuu+Suvv)/2,(Svvv+Svuu)/2];
const det=A[0][0]*A[1][1]-A[0][1]*A[1][0];
const uc=(B[0]*A[1][1]-B[1]*A[0][1])/det, vc=(A[0][0]*B[1]-A[1][0]*B[0])/det;
const R=Math.sqrt(uc*uc+vc*vc+(Suu+Svv)/seg.length);
console.log(`\nU radius: ${R.toFixed(2)} robot lengths = ${(R*16.5).toFixed(1)} inches   (target 24 in)`);
const l=f[f.length-1];
console.log(`total rotation ${deg(l.heading-f[0].heading).toFixed(0)} deg, final speed ${Math.hypot(...l.velocity).toFixed(3)}, finish ${DRIFT_FINISH.position.map(n=>+n.toFixed(2))} hdg ${deg(wrap(DRIFT_FINISH.heading)).toFixed(0)}`);
