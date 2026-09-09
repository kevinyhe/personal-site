const m = await import("../components/ballPhysics.ts");
const n = m.ballCount(), end = m.ballTimelineEnd();
// does any ball ever rise after it has left the robot?
let worstRise = 0, at = 0, who = -1;
for (let i = 0; i < n; i++) {
  let released = false, prevY = null;
  for (let t = 0; t <= end; t += 0.02) {
    const s = m.ballStatesAt(t)[i];
    if (!s.carried && prevY !== null && released) {
      const rise = s.position[1] - prevY;
      if (rise > worstRise) { worstRise = rise; at = t; who = i; }
    }
    if (!s.carried && t > 1) released = true;
    prevY = s.position[1];
  }
}
console.log(`largest upward step after release: ${worstRise.toFixed(4)} (ball ${who}, t=${at.toFixed(2)})`);
let worst = 9;
for (let t = 0; t <= end; t += 0.05) {
  const st = m.ballStatesAt(t);
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) {
    const a = st[i].position, b = st[j].position;
    worst = Math.min(worst, Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]));
  }
}
console.log(`closest two balls: ${worst.toFixed(3)} (need 0.312)`);
console.log("eject times:", JSON.stringify(Array.from({length:n},(x,i)=>{
  let t0=null; for(let t=0;t<=end;t+=0.01){ if(!m.ballStatesAt(t)[i].carried && t>1){t0=+t.toFixed(2);break;} } return t0;})));
console.log("pure:", JSON.stringify(m.ballStatesAt(7.0))===JSON.stringify(m.ballStatesAt(7.0)));
