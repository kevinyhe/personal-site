import type { CanvasSource } from "@/components/valley/barShader";

/**
 * A spray of sakura that grows and blooms, drawn in greys for the bar
 * shader: black is nothing, a bright petal is a full bar.
 *
 * The bloom is built the way a real one goes, in stages, each on its own
 * clock:
 *   1. the boughs draw out from their roots, tapering;
 *   2. each bud swells on its twig;
 *   3. its five petals open from a cupped bud, turning outward with a
 *      small overshoot (the inner pair a beat ahead of the outer three),
 *      and the stamens show last.
 * Every blossom starts at a point set by how far along the spray it sits,
 * left to right, so a scrub opens the spray as a wave rather than all at
 * once. `set(t)` takes the scroll's 0..1; run it backwards and the wave
 * closes right to left.
 *
 * It also moves when nothing is scrolling: the boughs sway on two slow
 * sines, more at the tips, and each open blossom trembles a little.
 */

type Branch = {
  /** Polyline from root to tip, canvas px. */
  pts: [number, number][];
  /** Width at the root. */
  w: number;
  /** When it starts and ends growing, of the whole 0..1. */
  t0: number;
  t1: number;
  /** How far along the spray the root is, 0 at the left. */
  depth: number;
};

type Blossom = {
  branch: number;
  /** Where on the branch, 0 root .. 1 tip. */
  at: number;
  /** Offset from the branch point, px. */
  dx: number;
  dy: number;
  r: number;
  rot: number;
  /** Its own clock: starts at t0, fully open at t1. */
  t0: number;
  t1: number;
  /** 0 bud-only, 1 blossom. Some stay buds, as on a real bough. */
  opens: boolean;
  phase: number;
};

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Overshoots a little past 1 and settles: a petal springing open. */
const easeOutBack = (t: number) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export type BloomField = { source: CanvasSource; set(t: number): void; dispose(): void };

export function createBloomField({
  width,
  height,
  seed = 11,
  still = false,
  tilt = 0,
}: {
  width: number;
  height: number;
  seed?: number;
  still?: boolean;
  /** Lean the whole spray, radians, about the middle of its foot:
   *  positive leans it right. */
  tilt?: number;
}): BloomField {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const rand = rng(seed);
  const W = width;
  const H = height;

  // --- The boughs ----------------------------------------------------------------
  // Three trunks from the lower left, each forking; everything leans right,
  // toward the text, so the spray reads as reaching into the band.
  const branches: Branch[] = [];
  const grow = (x: number, y: number, angle: number, len: number, w: number, level: number, t0: number) => {
    const pts: [number, number][] = [[x, y]];
    const steps = 8;
    let a = angle;
    let cx = x;
    let cy = y;
    for (let i = 1; i <= steps; i += 1) {
      a += (rand() - 0.5) * 0.28 + 0.02;
      cx += Math.cos(a) * (len / steps);
      cy += Math.sin(a) * (len / steps);
      pts.push([cx, cy]);
    }
    const t1 = t0 + 0.12 + len / (W * 3.2);
    branches.push({ pts, w, t0, t1, depth: x / W });
    if (level < 3) {
      const forks = level === 0 ? 3 : 2;
      for (let k = 0; k < forks; k += 1) {
        const at = 0.35 + (k / forks) * 0.55 + rand() * 0.08;
        const i = Math.min(steps, Math.floor(at * steps));
        const [px, py] = pts[i];
        const side = k % 2 === 0 ? -1 : 1;
        grow(px, py, a + side * (0.45 + rand() * 0.35) - 0.05, len * (0.52 + rand() * 0.14), w * 0.55, level + 1, t0 + (t1 - t0) * at);
      }
    }
  };
  grow(W * 0.04, H * 1.02, -1.25, H * 0.5, W * 0.035, 0, 0);
  grow(W * 0.3, H * 1.02, -1.45, H * 0.62, W * 0.03, 0, 0.06);
  grow(W * 0.62, H * 1.02, -1.62, H * 0.42, W * 0.026, 0, 0.14);

  // --- The blossoms ---------------------------------------------------------------
  const blossoms: Blossom[] = [];
  const pointOn = (b: Branch, at: number): [number, number] => {
    const f = at * (b.pts.length - 1);
    const i = Math.min(b.pts.length - 2, Math.floor(f));
    const u = f - i;
    return [b.pts[i][0] + (b.pts[i + 1][0] - b.pts[i][0]) * u, b.pts[i][1] + (b.pts[i + 1][1] - b.pts[i][1]) * u];
  };
  branches.forEach((b, bi) => {
    if (b.w > W * 0.028) return; // trunks carry none
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k += 1) {
      const at = 0.35 + rand() * 0.65;
      const [x] = pointOn(b, at);
      // The wave: its start follows x across the spray, after its twig.
      const twigAt = b.t0 + (b.t1 - b.t0) * at;
      const wave = 0.22 + (x / W) * 0.5 + rand() * 0.06;
      const t0 = Math.max(twigAt, wave);
      blossoms.push({
        branch: bi,
        at,
        dx: (rand() - 0.5) * W * 0.03,
        dy: (rand() - 0.5) * W * 0.03,
        r: W * (0.017 + rand() * 0.014),
        rot: rand() * Math.PI * 2,
        t0,
        t1: t0 + 0.2 + rand() * 0.06,
        opens: rand() > 0.15,
        phase: rand() * 10,
      });
    }
  });
  // Draw the far (small) ones first.
  blossoms.sort((a, b) => a.r - b.r);

  // --- Drawing --------------------------------------------------------------------
  let progress = 0;
  let time = 0;

  /** The sway at a point: nothing at the root, most at the tip. */
  const swayAt = (y: number) => {
    const arm = Math.pow(clamp01((H - y) / H), 1.6);
    return arm * (W * 0.012) * (Math.sin(time * 0.9) + 0.4 * Math.sin(time * 1.7 + 1.1));
  };

  const petal = (c: CanvasRenderingContext2D, r: number) => {
    // A sakura petal: rounded, with the notch at the tip.
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(-r * 0.62, -r * 0.22, -r * 0.58, -r * 0.92, -r * 0.12, -r);
    c.lineTo(0, -r * 0.84);
    c.lineTo(r * 0.12, -r);
    c.bezierCurveTo(r * 0.58, -r * 0.92, r * 0.62, -r * 0.22, 0, 0);
    c.closePath();
  };

  const draw = () => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    // Lean the spray about the middle of its foot, and shrink it a
    // little so the lean never carries a tip past the canvas edge, which
    // the bars would show as a straight cut.
    ctx.translate(W / 2, H);
    ctx.rotate(tilt);
    ctx.scale(0.78, 0.78);
    ctx.translate(-W / 2, -H);
    const t = progress;

    // Boughs: mid grey, so they come out as thin bars under the petals.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const b of branches) {
      const g = clamp01((t - b.t0) / Math.max(0.001, b.t1 - b.t0));
      if (g <= 0) continue;
      const last = easeOut(g) * (b.pts.length - 1);
      ctx.strokeStyle = "rgb(120,120,120)";
      for (let i = 0; i < Math.ceil(last); i += 1) {
        const u = Math.min(1, last - i);
        const [x0, y0] = b.pts[i];
        const [x1, y1] = b.pts[i + 1];
        const taper = 1 - (i / (b.pts.length - 1)) * 0.7;
        ctx.lineWidth = Math.max(1, b.w * taper);
        ctx.beginPath();
        ctx.moveTo(x0 + swayAt(y0), y0);
        ctx.lineTo(x0 + (x1 - x0) * u + swayAt(y1), y0 + (y1 - y0) * u);
        ctx.stroke();
      }
    }

    // Blossoms.
    for (const f of blossoms) {
      const b = branches[f.branch];
      const g = clamp01((t - b.t0) / Math.max(0.001, b.t1 - b.t0));
      if (easeOut(g) < f.at) continue; // its twig has not reached it
      const local = clamp01((t - f.t0) / (f.t1 - f.t0));
      if (local <= 0) continue;
      const [bx, by] = pointOn(b, f.at);
      const x = bx + f.dx + swayAt(by);
      const y = by + f.dy;
      // Stage 2, the bud swelling: the first third.
      const bud = easeOut(clamp01(local / 0.35));
      // Stage 3, the petals: the rest, inner pair ahead of the outer three.
      const openAt = (k: number) => {
        const lag = k % 2 === 0 ? 0 : 0.08;
        return f.opens ? clamp01((local - 0.3 - lag) / 0.55) : 0;
      };
      const tremble = still ? 0 : Math.sin(time * 2.3 + f.phase) * 0.04;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.rot + tremble);
      const r = f.r;
      // The stalk.
      ctx.strokeStyle = "rgb(110,110,110)";
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-f.dx * 0.6, -f.dy * 0.6 + r * 0.2);
      ctx.stroke();
      for (let k = 0; k < 5; k += 1) {
        const o = easeOutBack(openAt(k));
        ctx.save();
        // Closed, each petal stands nearly upright over the centre and the
        // five overlap into a cupped bud; open, they turn out to 72 degrees
        // apart and lie flat (full length).
        const spread = (k / 5) * Math.PI * 2;
        ctx.rotate(spread * clamp01(o) + (1 - clamp01(o)) * (k - 2) * 0.16);
        const len = r * (0.45 + 0.55 * bud) * (0.55 + 0.45 * Math.min(1.08, o));
        ctx.scale(0.55 + 0.45 * Math.min(1, o) * bud, 1);
        petal(ctx, len);
        // Lit toward the tip, darker at the heart: the grade reads the
        // tip as a full bar and the heart as a thin one.
        const grad = ctx.createLinearGradient(0, 0, 0, -len);
        const bright = 170 + 85 * clamp01(o);
        grad.addColorStop(0, `rgb(${bright * 0.55},${bright * 0.55},${bright * 0.55})`);
        grad.addColorStop(1, `rgb(${bright},${bright},${bright})`);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }
      // The stamens, last.
      const st = clamp01((local - 0.8) / 0.2);
      if (st > 0) {
        ctx.strokeStyle = `rgba(60,60,60,${st})`;
        ctx.lineWidth = Math.max(1, r * 0.05);
        for (let k = 0; k < 7; k += 1) {
          const a = (k / 7) * Math.PI * 2 + 0.3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * r * 0.32 * st, Math.sin(a) * r * 0.32 * st);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  };

  let dirty = true;
  const source: CanvasSource = {
    canvas,
    animated: !still,
    update: (timeSec) => {
      if (still && !dirty) return false;
      time = timeSec;
      draw();
      dirty = false;
      return true;
    },
  };
  return {
    source,
    set: (t: number) => {
      const v = clamp01(t);
      if (v !== progress) dirty = true;
      progress = v;
    },
    dispose: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
