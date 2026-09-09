const m = await import("../components/ballPhysics.ts");
const n = m.ballCount(), end = m.ballTimelineEnd();
console.log("balls", n, "timeline end", end.toFixed(2));
console.log("goalPlacement", JSON.stringify(m.goalPlacement()));
// purity: ascending vs descending must agree exactly
const ts = []; for (let t = 0; t <= end + 0.5; t += 0.05) ts.push(+t.toFixed(2));
const fwd = ts.map((t) => JSON.stringify(m.ballStatesAt(t)));
const back = [...ts].reverse().map((t) => JSON.stringify(m.ballStatesAt(t))).reverse();
console.log("PURE (fwd === rev):", fwd.every((s, i) => s === back[i]));
console.log("PURE (repeat call):", ts.every((t) => JSON.stringify(m.ballStatesAt(t)) === JSON.stringify(m.ballStatesAt(t))));
// carried transitions and continuity
for (let b = 0; b < n; b++) {
  let flips = 0, prevCarried = false, maxJump = 0, minY = 9e9, maxY = -9e9, prev = null;
  for (const t of ts) {
    const s = m.ballStatesAt(t)[b];
    if (s.carried !== prevCarried) { flips++; prevCarried = s.carried; }
    if (prev) maxJump = Math.max(maxJump, Math.hypot(s.position[0]-prev[0], s.position[1]-prev[1], s.position[2]-prev[2]));
    prev = s.position; minY = Math.min(minY, s.position[1]); maxY = Math.max(maxY, s.position[1]);
  }
  const last = m.ballStatesAt(end)[b];
  console.log(` ball ${b}: carried flips ${flips}  y ${minY.toFixed(3)}..${maxY.toFixed(3)}  max step ${maxJump.toFixed(3)}  ends ${last.position.map(x=>+x.toFixed(2))} carried=${last.carried}`);
}
console.log("intake activity at 0 / mid / end:", [0, end/2, end].map(t=>m.intakeActivityAt(t).toFixed(2)).join(" "));
