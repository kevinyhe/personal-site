/**
 * The end page's peak (Ending.tsx, ridge()) without its roughening: the
 * height of the ridge as a share of the end screen from its top, at a share
 * of its width.
 */
const KEYS: [x: number, y: number][] = [
  [0, 0.93], [0.08, 0.91], [0.2, 0.87], [0.3, 0.8], [0.38, 0.76], [0.43, 0.7],
  [0.48, 0.68], [0.52, 0.645], [0.55, 0.66], [0.6, 0.73], [0.63, 0.82],
  [0.67, 0.85], [0.74, 0.84], [0.8, 0.9], [0.84, 1.02], [1, 1.1],
];

export function ridgeAt(x: number): number {
  let k = 0;
  while (k < KEYS.length - 2 && x > KEYS[k + 1][0]) k += 1;
  const [x0, y0] = KEYS[k];
  const [x1, y1] = KEYS[k + 1];
  const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  return y0 + (y1 - y0) * t;
}
