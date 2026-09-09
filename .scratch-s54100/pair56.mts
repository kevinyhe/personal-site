import { ballStatesAt } from "../components/ballPhysics.ts";
for (let t = 10.05; t <= 10.75; t += 0.03) {
  const s = ballStatesAt(t);
  const a = s[5]!, b = s[6]!;
  const d = Math.hypot(a.position[0]-b.position[0], a.position[1]-b.position[1], a.position[2]-b.position[2]);
  console.log(`t=${t.toFixed(2)} b5 z=${a.position[2].toFixed(3)}${a.carried?"*":" "}  b6 z=${b.position[2].toFixed(3)}${b.carried?"*":" "}  sep ${d.toFixed(3)}`);
}
