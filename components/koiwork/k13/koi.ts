import type { CanvasSource } from "@/components/valley/barShader";

/**
 * A copy of components/luke/koi.ts for design k13, with `lead()` added so
 * the water's ripples can start where the lead fish is.
 *
 * Two big koi swimming down the left of the work section: what stands in
 * for lukebaffait.fr's red brush stroke. They are drawn into a plain 2D
 * canvas that the bar shader reads (CanvasSource), so they come out in the
 * same pink bars as the flower on the statement band above.
 *
 * The fish is one photograph (public/work/koi.png: Pexels photo 32351119,
 * pexels.com/photo/colorful-koi-fish-swimming-in-clear-water-32351119, a
 * single koi seen from above, cut out and turned to face right). Each koi
 * is drawn as thin slices from head to tail, every slice placed on the path
 * a little further back than the one before it and turned to the path's
 * direction there, so a koi bends round the curves it swims.
 *
 * Where the fish should be is the page's scroll (`setProgress`). They do
 * not jump there: they swim to it with a little momentum, so a flick of the
 * wheel is a dart and a stop is a glide. How hard the tail beats, and how
 * big the wake is, follow how fast they are going. When the scroll stops
 * they glide to a stop and go still; nothing moves on its own.
 *
 * The path is a slow meander down the left of the screen and a sweep right
 * along the bottom, through a centripetal Catmull-Rom spline (no kinks or
 * loops where control points are uneven), measured by distance so the
 * fish swim it at an even pace. It lies down a strip a few screens tall
 * that scrolls up under the screen as the fish go, so the water passes.
 *
 * The second koi follows the first a little under a body length behind,
 * drifting slowly from one side of its line to the other as it goes, the
 * way a following fish does, not locked to a fixed offset.
 */

export type KoiPair = {
  source: CanvasSource;
  /** 0..1: how far through the section the page is. */
  setProgress(p: number): void;
  /** The screen's shape changed. */
  resize(width: number, height: number): void;
  /** Where the lead's head is on screen (0..1 of width and height), and
   *  how far along the path it has swum, in lead lengths. */
  lead(): { x: number; y: number; swum: number };
};

/** The meander: [x as a share of the width, y in screen heights]. */
const PATH: [number, number][] = [
  [0.02, -1.2],
  [0.1, -0.55],
  [0.26, 0.0],
  [0.34, 0.5],
  [0.27, 1.0],
  [0.12, 1.45],
  [0.1, 1.95],
  [0.24, 2.35],
  [0.48, 2.55],
  [0.85, 2.5],
  [1.35, 2.4],
];

/** Slices per fish. */
const SLICES = 44;
/** Points sampled along the path. */
const SAMPLES = 2400;
/** One tail beat per this many body lengths swum: an unhurried koi. */
const STRIDE = 1.5;
/** The source canvas's width; its height follows the screen's shape. The
 *  bar grid is about 400 cells across, so 720 is still ~1.8 px a cell; it
 *  was 1280, and that canvas is redrawn and re-uploaded every frame. */
const SRC_W = 720;
/** Line widths and dot sizes below were tuned on a 1280 px canvas. */
const PX = SRC_W / 1280;
/** How fast the fish close on where the scroll wants them, per second:
 *  the share of the gap left after t seconds is exp(-FOLLOW * t). Per
 *  second, not per frame, so a dropped frame does not show as a stutter
 *  (was 0.085 a frame, which is this at 60 fps). */
const FOLLOW = 5.3;

export function createKoiPair(img: HTMLImageElement, screenW: number, screenH: number): KoiPair {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const IW = img.naturalWidth;
  const IH = img.naturalHeight;

  const W = SRC_W;
  let H = 540;
  /** The lead's length, in source px. */
  let L = 300;
  const px = new Float32Array(SAMPLES + 1);
  const py = new Float32Array(SAMPLES + 1);
  const along = new Float32Array(SAMPLES + 1);
  let total = 1;
  let sFrom = 0;
  let sTo = 1;

  /** The first distance along the path at which it reaches height y. */
  const distToY = (y: number): number => {
    for (let i = 0; i <= SAMPLES; i += 1) if (py[i] >= y) return along[i];
    return 0;
  };

  const build = (sw: number, sh: number): void => {
    H = Math.round((SRC_W * sh) / Math.max(1, sw));
    canvas.width = W;
    canvas.height = H;
    L = W * (sw < 1024 ? 0.72 : 0.34);
    // Centripetal Catmull-Rom (alpha 0.5) through PATH, in canvas px.
    const pts = PATH.map(([x, y]) => [x * W, y * H] as const);
    const n = pts.length - 1;
    const knot = (a: readonly [number, number], b: readonly [number, number]): number =>
      Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-3;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const g = (i / SAMPLES) * n;
      const k = Math.min(n - 1, Math.floor(g));
      const f = g - k;
      const p0 = pts[Math.max(0, k - 1)];
      const p1 = pts[k];
      const p2 = pts[k + 1];
      const p3 = pts[Math.min(n, k + 2)];
      const t1 = knot(p0, p1);
      const t2 = t1 + knot(p1, p2);
      const t3 = t2 + knot(p2, p3);
      const t = t1 + (t2 - t1) * f;
      const lerp = (a: readonly [number, number], b: readonly [number, number], ta: number, tb: number): [number, number] => {
        const w = (t - ta) / (tb - ta || 1e-3);
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
      };
      const a1 = lerp(p0, p1, 0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, 0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      const c = lerp(b1, b2, t1, t2);
      px[i] = c[0];
      py[i] = c[1];
      along[i] = i === 0 ? 0 : along[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    }
    total = along[SAMPLES];
    // The lead starts with its head just above the top of the screen and
    // ends swept off the right.
    sFrom = distToY(-0.08 * H);
    sTo = total - 0.04 * total;
  };

  const out = { x: 0, y: 0, a: 0 };
  const at = (s: number): typeof out => {
    const d = Math.max(0, Math.min(total, s));
    let lo = 0;
    let hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (along[mid] < d) lo = mid;
      else hi = mid;
    }
    const seg = along[hi] - along[lo] || 1;
    const f = (d - along[lo]) / seg;
    out.x = px[lo] + (px[hi] - px[lo]) * f;
    out.y = py[lo] + (py[hi] - py[lo]) * f;
    out.a = Math.atan2(py[hi] - py[lo], px[hi] - px[lo]);
    return out;
  };

  // Where the scroll wants the lead's head, where it is, how fast it is
  // going (smoothed, in body lengths a frame) and how far through the beat.
  let goal = 0;
  let head = 0;
  let speed = 0;
  let beat = 0;
  let view = 0;
  let dirty = true;

  /** The two fish: lag behind the lead and length, in lead lengths. */
  const FISH = [
    { lag: 0, size: 1, phase: 0, side: (): number => 0 },
    { lag: 0.78, size: 0.84, phase: 2.1, side: (s: number): number => 0.16 + 0.09 * Math.sin(s / (1.9 * L)) },
  ];
  type Fish = (typeof FISH)[number];

  /** A point `off` px to the left of the path at distance s. */
  const place = (s: number, side: number, off: number): { x: number; y: number; a: number } => {
    const p = at(s);
    const o = side * L + off;
    return { x: p.x - Math.sin(p.a) * o, y: p.y + Math.cos(p.a) * o, a: p.a };
  };

  const drawFish = (f: Fish): void => {
    if (!ctx) return;
    const len = L * f.size;
    const tall = (len * IH) / IW;
    const s0 = head - f.lag * L;
    const side = f.side(s0);
    // A fish swimming hard beats wide; a gliding one barely at all.
    const drive = 0.3 + 0.55 * Math.min(1, speed / 1.8);
    const sw = IW / SLICES;
    const step = len / SLICES;
    for (let k = 0; k < SLICES; k += 1) {
      const u = (k + 0.5) / SLICES; // 0 at the head, 1 at the tail
      // Carp swim with the front third nearly rigid and the wave growing
      // toward the tail, about one body length long.
      const env = 0.015 + 0.11 * Math.pow(u, 2.2);
      const ph = beat + f.phase - u * Math.PI * 2 * 0.95;
      const wave = Math.sin(ph) * env * len * drive;
      const slope = Math.cos(ph) * env * Math.PI * 2 * 0.95 * drive;
      const q = place(s0 - u * len, side, wave);
      ctx.setTransform(1, 0, 0, 1, 0, -view);
      ctx.translate(q.x, q.y);
      ctx.rotate(q.a + slope);
      ctx.drawImage(img, IW - (k + 1) * sw, 0, sw, IH, -step / 2 - 1, -tall / 2, step + 2, tall);
    }
  };

  // Fixed positions in the water for the wake's flecks (keyed by how far
  // along the path they are), so a fish swims away from them.
  const hash = (n: number): number => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  // The wake: the V a fish leaves (arms about 19.5 degrees off its line),
  // as three fine lines on each side, close behind the tail and opening
  // out; a few small ripples across it; and loose flecks of broken water
  // just behind the tail. All of it laid on the path just swum, and all of
  // it as big and as bright as the fish is fast.
  const drawWake = (f: Fish): void => {
    if (!ctx) return;
    const level = Math.min(1, speed / 1.08);
    if (level < 0.03) return;
    const len = L * f.size;
    const nose = head - f.lag * L;
    const tail = nose - len * 0.9;
    const side = f.side(nose);
    const reach = len * (0.5 + 0.9 * level);
    const SPREAD = Math.tan((19.5 * Math.PI) / 180);
    ctx.setTransform(1, 0, 0, 1, 0, -view);
    ctx.lineCap = "round";
    for (const dir of [-1, 1]) {
      for (let line = 0; line < 3; line += 1) {
        const inset = line * 0.018 * len;
        let prev = place(tail, side, dir * (len * 0.05 - inset));
        for (let k = 1; k <= 28; k += 1) {
          const d = (k / 28) * reach;
          const q = place(tail - d, side, dir * (len * 0.05 + d * SPREAD - inset));
          const fade = (1 - k / 28) * level * (1 - line * 0.28);
          const g = Math.round(150 * fade);
          ctx.strokeStyle = `rgb(${g},${g},${g})`;
          ctx.lineWidth = (1.5 + 3.5 * fade) * PX;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
          prev = q;
        }
      }
    }
    // Ripples across the V, fixed in the water.
    const gap = len * 0.34;
    const first = Math.floor(tail / gap) * gap;
    for (let k = 0; k < 3; k += 1) {
      const at0 = first - k * gap;
      const d = tail - at0;
      if (d < len * 0.08 || d > reach) continue;
      const fade = (1 - d / reach) * level;
      const w = len * 0.04 + d * SPREAD * 0.6;
      const g = Math.round(110 * fade);
      ctx.strokeStyle = `rgb(${g},${g},${g})`;
      ctx.lineWidth = (1.5 + 2.5 * fade) * PX;
      ctx.beginPath();
      for (let j = 0; j <= 12; j += 1) {
        const t = j / 12 - 0.5;
        const q = place(at0 + Math.cos(t * Math.PI) * w * 0.22, side, t * 2 * w);
        if (j === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }
    // Broken water right behind the tail.
    const cell = len * 0.06;
    const base = Math.floor(tail / cell);
    for (let k = 0; k < 10; k += 1) {
      const idx = base - k;
      const d = tail - idx * cell;
      if (d < 0 || d > len * 0.6) continue;
      const fade = (1 - d / (len * 0.6)) * level;
      const q = place(idx * cell, side, (hash(idx) - 0.5) * (len * 0.08 + d * SPREAD));
      const g = Math.round(170 * fade);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, (2 + 4 * hash(idx + 7) * fade) * PX, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const draw = (): void => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    for (let i = FISH.length - 1; i >= 0; i -= 1) drawWake(FISH[i]);
    for (let i = FISH.length - 1; i >= 0; i -= 1) drawFish(FISH[i]);
  };

  const aim = (): void => {
    // The strip scrolls up under the screen so the lead rides from just
    // above the top edge down to three quarters of the way down.
    const p = (head - sFrom) / Math.max(1, sTo - sFrom);
    const target = Math.min(0.75, -0.08 + 2.4 * p) * H;
    view = at(head).y - target;
  };

  build(screenW, screenH);
  goal = sFrom;
  head = sFrom;
  aim();
  draw();

  return {
    source: {
      canvas,
      animated: true,
      update: (_time: number, dt: number) => {
        const step = Math.min(0.1, Math.max(0, dt));
        const gap = goal - head;
        const moved = Math.abs(gap) < 0.05 * PX ? gap : gap * (1 - Math.exp(-FOLLOW * step));
        head += moved;
        // Speed in body lengths a second, smoothed over about 0.1 s.
        if (step > 0) speed += (Math.abs(moved) / L / step - speed) * (1 - Math.exp(-9.75 * step));
        if (moved === 0 && speed < 6e-3) speed = 0;
        beat += (moved / (STRIDE * L)) * Math.PI * 2;
        if (!dirty && moved === 0 && speed === 0) return false;
        dirty = speed !== 0;
        aim();
        draw();
        return true;
      },
    },
    setProgress: (p) => {
      goal = sFrom + (sTo - sFrom) * Math.max(0, Math.min(1, p));
      dirty = true;
    },
    lead: () => {
      const q = at(head);
      return { x: q.x / W, y: (q.y - view) / H, swum: head / L };
    },
    resize: (sw, sh) => {
      const share = (head - sFrom) / Math.max(1, sTo - sFrom);
      const want = (goal - sFrom) / Math.max(1, sTo - sFrom);
      build(sw, sh);
      head = sFrom + (sTo - sFrom) * share;
      goal = sFrom + (sTo - sFrom) * want;
      dirty = true;
    },
  };
}
