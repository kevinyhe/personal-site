
import { buildDriftPath, DRIFT_FINISH } from "/home/kevin/projects/arbor-web/components/robotDrift.ts";
const f=buildDriftPath({wheelRadius:0.0997});
const pts=f.filter(s=>s.time>=2.0&&s.time<=5.3).map(s=>s.position);
const cx=pts.reduce((a,p)=>a+p[0],0)/pts.length, cz=pts.reduce((a,p)=>a+p[1],0)/pts.length;
console.log(JSON.stringify({cx:+cx.toFixed(2),cz:+cz.toFixed(2),fx:+DRIFT_FINISH.position[0].toFixed(2),fz:+DRIFT_FINISH.position[1].toFixed(2)}));
