import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const P="components/robotDrift.ts"; const orig=readFileSync(P,"utf8"); const out=[];
for (const outer of [1.1,1.5,1.9]) for (const inner of [-0.6,-0.1,0.4]) for (const yaw of [1.35,1.7,2.1]) {
  let s=orig.replace(/const U_OUTER = [-0-9.]+;/,`const U_OUTER = ${outer};`)
            .replace(/const U_INNER = [-0-9.]+;/,`const U_INNER = ${inner};`)
            .replace(/const U_YAW = [-0-9.]+;/,`const U_YAW = ${yaw};`);
  writeFileSync(P,s);
  try{ out.push({outer,inner,yaw,...JSON.parse(execSync("node --experimental-strip-types --no-warnings .scratch-s54100/uprobe.mjs 2>/dev/null",{encoding:"utf8"}).trim())}); }catch{}
}
writeFileSync(P,orig);
for(const r of out.filter(r=>r.bendSamples>120).sort((a,b)=>Math.abs(a.inches-24)-Math.abs(b.inches-24)).slice(0,8)) console.log(JSON.stringify(r));
