import { buildDriftPath } from "/home/kevin/projects/arbor-web/components/robotDrift.ts";
const f = buildDriftPath({ wheelRadius: 0.0997 });
// path curvature from three spaced samples: circumradius of the triangle
function radiusAt(i, step) {
  const a=f[i-step].position, b=f[i].position, c=f[i+step].position;
  const A=Math.hypot(b[0]-a[0],b[1]-a[1]), B=Math.hypot(c[0]-b[0],c[1]-b[1]), C=Math.hypot(c[0]-a[0],c[1]-a[1]);
  const area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/2;
  return area<1e-9?Infinity:(A*B*C)/(4*area);
}
const step=8, rs=[];
for(let i=step;i<f.length-step;i++){
  const v=Math.hypot(...f[i].velocity);
  if(v<0.8) continue;
  const r=radiusAt(i,step);
  if(isFinite(r)&&r<20) rs.push({t:f[i].time,r,v});
}
// the U is the longest stretch where the path actually bends
const bend=rs.filter(x=>x.r<6);
const med=bend.length?bend.map(x=>x.r).sort((a,b)=>a-b)[Math.floor(bend.length/2)]:0;
const l=f[f.length-1];
console.log(JSON.stringify({R:+med.toFixed(2), inches:+(med*16.5).toFixed(0), bendSamples:bend.length,
 rot:+((l.heading-f[0].heading)*180/Math.PI).toFixed(0), spd:+Math.hypot(...l.velocity).toFixed(2),
 peak:+(Math.max(...f.map(s=>Math.abs(s.slipAngle)))*180/Math.PI).toFixed(0)}));
