/**
 * The lotus, in line art, for k11. Coordinates are in a 100-unit box with
 * the flower's base at 0,0 and up as negative y. `open` 0 is a closed bud
 * (every petal folded on the middle one), 1 the open flower: an outer row
 * of four wide petals laid back, an inner row of three standing up, and the
 * seed pod showing between them.
 */

type Petal = { row: 0 | 1; slot: number };

/** Back row first, so the front row is drawn over it. */
const PETALS: Petal[] = [
  { row: 0, slot: -1.5 },
  { row: 0, slot: -0.5 },
  { row: 0, slot: 0.5 },
  { row: 0, slot: 1.5 },
  { row: 1, slot: -1 },
  { row: 1, slot: 0 },
  { row: 1, slot: 1 },
];

const f = (n: number): string => n.toFixed(2);

/** One petal: a pointed oval from the base, turned by `angle` (radians). */
function petal(length: number, width: number, angle: number, lift: number): string {
  // Built upright, then rotated about the base. The tip leans a little
  // further than the body (`lift`), so a laid-back petal curls.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tipAngle = angle * lift;
  const tc = Math.cos(tipAngle);
  const ts = Math.sin(tipAngle);
  const rot = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const tip: [number, number] = [length * ts, -length * tc];
  const r1 = rot(width, -length * 0.32);
  const r2 = rot(width * 0.62, -length * 0.86);
  const l2 = rot(-width * 0.62, -length * 0.86);
  const l1 = rot(-width, -length * 0.32);
  return `M 0 0 C ${f(r1[0])} ${f(r1[1])} ${f(r2[0])} ${f(r2[1])} ${f(tip[0])} ${f(tip[1])} C ${f(l2[0])} ${f(l2[1])} ${f(l1[0])} ${f(l1[1])} 0 0`;
}

export function flowerPaths(open: number): { petals: string[]; alpha: number[]; pod: string } {
  const petals: string[] = [];
  const alpha: number[] = [];
  for (const p of PETALS) {
    const outer = p.row === 0;
    const spread = outer ? 0.62 : 0.4;
    const angle = p.slot * spread * open;
    const length = (outer ? 66 : 74) * (0.78 + 0.22 * open);
    const width = (outer ? 17 : 13) * (0.42 + 0.58 * open);
    petals.push(petal(length, width, angle, 1 + 0.25 * open));
    // Folded petals sit on each other; the back row only shows once apart.
    alpha.push(outer ? Math.min(1, open * 1.5) * 0.45 : p.slot === 0 ? 1 : 0.35 + 0.65 * open);
  }
  // The seed pod: one flat arc across the heart, about 8 wide.
  const w = 4 * open;
  const h = -24;
  const pod = `M ${f(-w)} ${f(h)} Q 0 ${f(h + 3 * open)} ${f(w)} ${f(h)}`;
  return { petals, alpha, pod };
}
