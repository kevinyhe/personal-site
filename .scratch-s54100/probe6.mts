import { ballStatesAt } from "../components/ballPhysics.ts";
for (let t = 10.20; t <= 10.85; t += 0.04) {
  const s = ballStatesAt(t);
  const f = (i: number) => s[i] ? `${s[i]!.position.map(n=>n.toFixed(2)).join(",")}${s[i]!.carried?"*":" "}` : "-";
  const d = (i: number, j: number) => s[i]&&s[j] ? Math.hypot(...s[i]!.position.map((v,k)=>v-s[j]!.position[k])).toFixed(3) : "-";
  console.log(`t=${t.toFixed(2)}  b5 ${f(5)}   b6 ${f(6)}   d56 ${d(5,6)}  d46 ${d(4,6)}`);
}
