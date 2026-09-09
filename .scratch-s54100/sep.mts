import { ballStatesAt, ballCount, ballTimelineEnd } from "../components/ballPhysics.ts";
const n = ballCount();
const end = ballTimelineEnd();
let worst = { d: 1e9, t: 0, i: -1, j: -1 };
for (let t = 0; t <= end; t += 0.02) {
  const s = ballStatesAt(t);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!s[i] || !s[j]) continue;
    const d = Math.hypot(s[i].position[0]-s[j].position[0], s[i].position[1]-s[j].position[1], s[i].position[2]-s[j].position[2]);
    if (d < worst.d) worst = { d, t, i, j };
  }
}
console.log(`closest pair ${worst.d.toFixed(3)} (diameter 0.312) at t=${worst.t.toFixed(2)} balls ${worst.i}/${worst.j}`);
// purity
const a = JSON.stringify(ballStatesAt(5.0)), b = JSON.stringify(ballStatesAt(5.0));
console.log("pure:", a === b);
