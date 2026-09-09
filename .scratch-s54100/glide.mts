import { ballStatesAt, ballCount, ballTimelineEnd, scoringStart } from "../components/ballPhysics.ts";
const n = ballCount(), end = ballTimelineEnd();
const DT = 1 / 240;
console.log(`scoringStart ${scoringStart().toFixed(2)}  end ${end.toFixed(2)}  balls ${n}`);
// speed of each ball across its touchdown, and the largest speed step
for (let b = 0; b < n; b++) {
  const speeds: Array<[number, number]> = [];
  let prev = ballStatesAt(0)[b]?.position;
  for (let t = DT; t <= end; t += DT) {
    const p = ballStatesAt(t)[b]?.position;
    if (p && prev) speeds.push([t, Math.hypot(p[0]-prev[0], p[1]-prev[1], p[2]-prev[2]) / DT]);
    prev = p;
  }
  // find the largest jump in speed after the run starts settling
  let worst = 0, worstT = 0;
  for (let i = 1; i < speeds.length; i++) {
    const d = Math.abs(speeds[i][1] - speeds[i-1][1]);
    if (d > worst) { worst = d; worstT = speeds[i][0]; }
  }
  const peak = Math.max(...speeds.map((s) => s[1]));
  // when does it finally stop?
  let stop = 0;
  for (const [t, v] of speeds) if (v > 0.02) stop = t;
  console.log(` ball ${b}  peak ${peak.toFixed(2)} u/s  biggest speed step ${worst.toFixed(2)} at t=${worstT.toFixed(2)}  last motion t=${stop.toFixed(2)}`);
}
// overlap check
let closest = { d: 9, t: 0, i: -1, j: -1 };
for (let t = 0; t <= end; t += 0.01) {
  const s = ballStatesAt(t);
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) {
    if (!s[i] || !s[j]) continue;
    const d = Math.hypot(s[i].position[0]-s[j].position[0], s[i].position[1]-s[j].position[1], s[i].position[2]-s[j].position[2]);
    if (d < closest.d) closest = { d, t, i, j };
  }
}
console.log(`closest pair overall ${closest.d.toFixed(3)} (diameter 0.312) at t=${closest.t.toFixed(2)} balls ${closest.i}/${closest.j}`);
let closeScored = { d: 9, t: 0, i: -1, j: -1 };
for (let t = scoringStart(); t <= end; t += 0.01) {
  const s = ballStatesAt(t);
  for (let i = 0; i < n; i++) for (let j = i+1; j < n; j++) {
    if (!s[i] || !s[j] || s[i].carried || s[j].carried) continue;
    const d = Math.hypot(s[i].position[0]-s[j].position[0], s[i].position[1]-s[j].position[1], s[i].position[2]-s[j].position[2]);
    if (d < closeScored.d) closeScored = { d, t, i, j };
  }
}
console.log(`closest scored pair  ${closeScored.d.toFixed(3)} at t=${closeScored.t.toFixed(2)} balls ${closeScored.i}/${closeScored.j}`);
