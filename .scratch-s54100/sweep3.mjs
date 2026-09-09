import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const P="components/robotDrift.ts"; const orig=readFileSync(P,"utf8");
const out=[];
for (const ret of [0.6,1.0,1.4]) {
  for (const curve of [1.8,2.2,2.6,3.0]) {
   for (const yaw of [1.6,2.2,2.8]) {
    let s=orig.replace(/const RETURN_DURATION = [0-9.]+;/,`const RETURN_DURATION = ${ret};`)
              .replace(/\{ duration: 1\.3, left: 4\.5, right: 2\.6, yawGain: 2\.0, yawTarget: 1\.4 \},/,
                       `{ duration: ${curve}, left: 4.5, right: 2.0, yawGain: 2.2, yawTarget: ${yaw} },`);
    writeFileSync(P,s);
    try{
      const r=JSON.parse(execSync("node --experimental-strip-types --no-warnings .scratch-s54100/probe.mjs 2>/dev/null",{encoding:"utf8"}).trim());
      out.push({ret,curve,yaw,...r});
    }catch{ out.push({ret,curve,yaw,err:1}); }
  }
 }
}
writeFileSync(P,orig);
out.sort((a,b)=>(Math.hypot((a.x??99)+5.2,(a.z??99)+1.3)+(a.spd??9)*4)-(Math.hypot((b.x??99)+5.2,(b.z??99)+1.3)+(b.spd??9)*4));
for(const r of out.slice(0,8)) console.log(JSON.stringify(r));
