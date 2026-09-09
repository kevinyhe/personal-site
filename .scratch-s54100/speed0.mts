import { ballStatesAt, ballTimelineEnd } from "../components/ballPhysics.ts";
const DT = 1/480;
const B = Number(process.argv[2] ?? 0);
let prev = ballStatesAt(7.9)[B]!.position;
const rows: Array<[number, number]> = [];
for (let t = 7.9 + DT; t <= Math.min(ballTimelineEnd(), 10.0); t += DT) {
  const p = ballStatesAt(t)[B]!.position;
  rows.push([t, Math.hypot(p[0]-prev[0], p[1]-prev[1], p[2]-prev[2]) / DT]);
  prev = p;
}
for (let i = 0; i < rows.length; i += 12) console.log(` t=${rows[i][0].toFixed(3)}  ${rows[i][1].toFixed(2)} u/s`);
