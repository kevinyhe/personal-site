import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const P = "components/robotDrift.ts";
const orig = readFileSync(P, "utf8");
const probe = `
import { buildDriftPath } from "/home/kevin/projects/arbor-web/components/robotDrift.ts";
const f = buildDriftPath({ wheelRadius: 0.0997 });
const l = f[f.length-1];
const w = (a)=>Math.atan2(Math.sin(a),Math.cos(a));
console.log(JSON.stringify({x:+l.position[0].toFixed(2), z:+l.position[1].toFixed(2),
  hdg:+(w(l.heading)*180/Math.PI).toFixed(0), spd:+Math.hypot(l.velocity[0],l.velocity[1]).toFixed(3),
  rot:+((l.heading-f[0].heading)*180/Math.PI).toFixed(0),
  peak:+(Math.max(...f.map(s=>Math.abs(s.slipAngle)))*180/Math.PI).toFixed(0), dur:+l.time.toFixed(2)}));
`;
writeFileSync(".scratch-s54100/probe.mjs", probe);
const results = [];
for (const dur of [1.6, 2.0, 2.4]) {
  for (const yaw of [1.2, 1.6, 2.0]) {
    for (const rt of [2.2, 2.8]) {
      let s = orig.replace(
        /\{ duration: 1\.4, headingGain: 2\.4, headingTarget: Math\.PI \/ 2, left: 4\.5, right: 3\.0, yawGain: 2\.0 \},/,
        `{ duration: ${dur}, left: 4.5, right: ${rt}, yawGain: 2.0, yawTarget: ${yaw} },`);
      writeFileSync(P, s);
      try {
        const out = execSync("node --experimental-strip-types --no-warnings .scratch-s54100/probe.mjs 2>/dev/null", {encoding:"utf8"});
        const r = JSON.parse(out.trim());
        results.push({dur, yaw, rt, ...r});
      } catch { results.push({dur, yaw, rt, err:1}); }
    }
  }
}
writeFileSync(P, orig);
results.sort((a,b)=>(Math.hypot((a.x??99)+5.2,(a.z??99)+1.3)+Math.abs(a.spd??9)*3)-(Math.hypot((b.x??99)+5.2,(b.z??99)+1.3)+Math.abs(b.spd??9)*3));
for (const r of results.slice(0,10)) console.log(JSON.stringify(r));
