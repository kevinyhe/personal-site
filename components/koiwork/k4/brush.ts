/**
 * One sumi-e brush stroke, drawn as SVG paths.
 *
 * The stroke is a bundle of bristles laid along a centre line. Each
 * bristle is a thin filled ribbon at its own offset across the brush.
 * In the body they overlap and read as solid ink; toward the tail each
 * one runs dry at its own point and breaks into gaps, so the end of the
 * stroke splits into streaks (dry brush). The width follows a pen
 * pressure curve: a quick heavy press, a long even pull, a lift.
 *
 * Seeded, so the server and the browser draw the same stroke.
 */

export type Pt = { x: number; y: number };

export type Stroke = {
  /** The bristle ribbons, each an SVG path "d". */
  bristles: string[];
  /** The centre line, for the mask that paints the stroke in. */
  spine: string;
  /** Widest point, so the mask's line covers every bristle. */
  maxWidth: number;
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D noise from a few sines with random phases. */
function wobble(rand: () => number): (t: number) => number {
  const a = [rand(), rand(), rand()].map((r) => r * Math.PI * 2);
  return (t) => (Math.sin(t * 7 + a[0]) * 0.5 + Math.sin(t * 17 + a[1]) * 0.3 + Math.sin(t * 41 + a[2]) * 0.2);
}

/** Pen pressure along the stroke, 0..1. */
function pressure(t: number): number {
  const press = Math.min(1, t / 0.06);
  const onset = 0.82 + 0.18 * Math.sin(Math.min(1, t / 0.14) * Math.PI);
  const lift = t < 0.55 ? 1 : 1 - Math.pow((t - 0.55) / 0.45, 1.6) * 0.78;
  return Math.sqrt(press) * onset * lift;
}

const f = (n: number): string => n.toFixed(1);

/**
 * @param spine  the centre line, sampled densely (80+ points)
 * @param width  widest ink, in the same units as the points
 */
export function brushStroke(spine: Pt[], width: number, seed: number): Stroke {
  const rand = rng(seed);
  const n = spine.length;
  // Normals along the spine.
  const nx: number[] = [];
  const ny: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    nx.push(-dy / l);
    ny.push(dx / l);
  }
  const edge = wobble(rand);
  const count = 34;
  const bristles: string[] = [];
  for (let k = 0; k < count; k++) {
    // Across the brush, -0.5..0.5, slightly jittered.
    const across = (k + 0.5) / count - 0.5 + (rand() - 0.5) * 0.02;
    const edgeness = Math.abs(across) * 2;
    // Outer bristles run dry first.
    const dryAt = 0.34 + (1 - edgeness) * 0.3 + rand() * 0.2;
    const end = Math.min(1, dryAt + 0.12 + rand() * 0.25);
    const thick = (width / count) * (1.05 + rand() * 0.9);
    const own = wobble(rand);
    // Break the dry part into runs of ink.
    const runs: [number, number][] = [];
    let t = Math.min(dryAt, end);
    let start = 0;
    let on = true;
    while (t < end) {
      const next = Math.min(end, t + (on ? 0.02 + rand() * 0.06 : 0.012 + rand() * 0.05));
      if (on) runs.push([start, next]);
      on = !on;
      t = next;
      start = next;
    }
    if (dryAt >= end) runs.push([0, end]);
    for (const [t0, t1] of runs) {
      const i0 = Math.floor(t0 * (n - 1));
      const i1 = Math.ceil(t1 * (n - 1));
      if (i1 - i0 < 1) continue;
      const left: string[] = [];
      const right: string[] = [];
      for (let i = i0; i <= i1; i++) {
        const u = i / (n - 1);
        const p = pressure(u);
        const w = width * p * (1 + edge(u) * 0.06);
        const off = across * w + own(u) * width * 0.008;
        // Ribbons taper at the ends of each run.
        const fade = Math.min(1, (i - i0 + 0.5) / 2, (i1 - i + 0.5) / 2);
        const h = (thick * (0.55 + 0.45 * p) * fade) / 2;
        const cx = spine[i].x + nx[i] * off;
        const cy = spine[i].y + ny[i] * off;
        left.push(`${f(cx + nx[i] * h)} ${f(cy + ny[i] * h)}`);
        right.push(`${f(cx - nx[i] * h)} ${f(cy - ny[i] * h)}`);
      }
      bristles.push(`M${left.join("L")}L${right.reverse().join("L")}Z`);
    }
  }
  const spinePath = `M${spine.map((p) => `${f(p.x)} ${f(p.y)}`).join("L")}`;
  return { bristles, spine: spinePath, maxWidth: width * 1.15 };
}

/** A near-circle, open at the top left: the ensō. In a 1000 box. */
export function ensoSpine(seed: number): Pt[] {
  const rand = rng(seed);
  const pts: Pt[] = [];
  const n = 160;
  const a0 = (-112 * Math.PI) / 180;
  const sweep = (322 * Math.PI) / 180;
  const ph = rand() * 6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = a0 + sweep * t;
    // Radius drifts in a little as the hand comes round.
    const r = 380 * (1 - 0.06 * t) + Math.sin(t * 5 + ph) * 8;
    pts.push({ x: 500 + Math.cos(a) * r, y: 500 + Math.sin(a) * r * 0.97 });
  }
  return pts;
}

/** A pulled horizontal stroke, rising a touch and curving off at the end.
 *  In a 1000 by 160 box. */
export function lineSpine(seed: number): Pt[] {
  const rand = rng(seed);
  const pts: Pt[] = [];
  const n = 110;
  const bow = 10 + rand() * 14;
  const rise = 8 + rand() * 18;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = 40 + t * 920;
    const y = 92 - rise * t - Math.sin(t * Math.PI) * bow + Math.pow(Math.max(0, t - 0.85) / 0.15, 2) * 10;
    pts.push({ x, y });
  }
  return pts;
}
