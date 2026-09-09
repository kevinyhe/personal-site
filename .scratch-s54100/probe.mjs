
import { buildDriftPath } from "/home/kevin/projects/arbor-web/components/robotDrift.ts";
const f = buildDriftPath({ wheelRadius: 0.0997 });
const l = f[f.length-1];
const w = (a)=>Math.atan2(Math.sin(a),Math.cos(a));
console.log(JSON.stringify({x:+l.position[0].toFixed(2), z:+l.position[1].toFixed(2),
  hdg:+(w(l.heading)*180/Math.PI).toFixed(0), spd:+Math.hypot(l.velocity[0],l.velocity[1]).toFixed(3),
  rot:+((l.heading-f[0].heading)*180/Math.PI).toFixed(0),
  peak:+(Math.max(...f.map(s=>Math.abs(s.slipAngle)))*180/Math.PI).toFixed(0), dur:+l.time.toFixed(2)}));
