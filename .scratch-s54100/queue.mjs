const m = await import("../components/ballPhysics.ts");
const n = m.ballCount(), end = m.ballTimelineEnd();
const R = 0.156;
console.log("balls", n, "timeline", end.toFixed(2));
// minimum separation between any two balls at any time -> must be >= diameter
let worst = 9, worstT = 0, worstPair = "";
for (let t = 0; t <= end; t += 0.05) {
  const st = m.ballStatesAt(t);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = st[i].position, b = st[j].position;
    const d = Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
    if (d < worst) { worst = d; worstT = t; worstPair = `${i}-${j}`; }
  }
}
console.log(`closest any two balls ever get: ${worst.toFixed(3)} (need ${(2*R).toFixed(3)}) at t=${worstT.toFixed(2)} pair ${worstPair}`);
// FIFO: eject order must equal load order; and depth order in the goal
const fin = m.ballStatesAt(end);
console.log("final depths (first-in should be DEEPEST):");
const finish = fin.map((s,i)=>({i, x:+s.position[0].toFixed(2), z:+s.position[2].toFixed(2)}));
for (const f of finish) console.log(`   ball ${f.i}: x ${f.x} z ${f.z}`);
// spin magnitude
let maxSpin = 0;
for (let t = 0.5; t <= end; t += 0.1) {
  const a = m.ballStatesAt(t-0.1), b = m.ballStatesAt(t);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(b[i].rotation[0]-a[i].rotation[0]) + Math.abs(b[i].rotation[2]-a[i].rotation[2]);
    if (d < 3) maxSpin = Math.max(maxSpin, d/0.1);
  }
}
console.log("peak roll rate (rad/s, was ~1/R x speed):", maxSpin.toFixed(1));
const f1 = JSON.stringify(m.ballStatesAt(3.0)), f2 = JSON.stringify(m.ballStatesAt(3.0));
console.log("still pure:", f1 === f2);
