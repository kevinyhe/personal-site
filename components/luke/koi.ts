import type { CanvasSource } from "@/components/valley/barShader";

/**
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
 * Where the fish are is the page's scroll (`setProgress`), taken as it
 * comes: Lenis already smooths the scroll, so there is no follow of our own.
 * How hard the tail beats, and how big the wake is, follow how fast they
 * are going. When the scroll stops they stop; nothing moves on its own.
 *
 * The path is lukebaffait's stroke (PATH). It lies down a strip a few
 * screens tall that scrolls up under the screen at one steady rate, as
 * Luke's page does under his stroke. The lead's head goes along the path
 * at one steady speed, as his line draws (GSAP, ease none), so it sits
 * where his line's tip would be at every scroll position.
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
};

/**
 * lukebaffait.fr's red stroke, [x as a share of the width, y in screen
 * heights], as a start point and then four cubic Béziers (two controls and
 * an end each). Source: #fluid-line in lukebaffait.fr/index.html,
 *   M -80,0 C 300,-20 600,150 540,400 C 490,650 0,655 300,1050
 *   C 600,1385 650,1250 850,1200 C 1050,1150 1350,1250 1540,1300
 * in a 1400 x 1400 viewBox drawn "xMidYMid slice" into a box 100vw wide
 * and (section + 100vh) tall, 30vh above the top of his #projects, which
 * is 1.4 screens tall (20vh padding, a 100vh list). So the box is 2.4
 * screens tall, 1 unit is 2.4/1400 screen, and at 16:9 x share =
 * x * 0.000964 - 0.175, y = y * 0.001714 - 0.3 (0 = top of his #projects).
 * Béziers stay Béziers under that, so this is his curve exactly at 16:9.
 */
const PATH: [number, number][] = [
  [-0.2521, -0.3],
  [0.1143, -0.3343], [0.4036, -0.0429], [0.3457, 0.3857],
  [0.2975, 0.8143], [-0.175, 0.8229], [0.1143, 1.5],
  [0.4036, 2.0743], [0.4518, 1.8429], [0.6446, 1.7571],
  [0.8375, 1.6714], [1.1268, 1.8429], [1.31, 1.9286],
];
/** The wide-screen squeeze: Luke's x from PATH_X_MIN (the left end of his
 *  turn) lands at NARROW_X0 of the width, and every share after it at
 *  NARROW_K of its distance, so his turn to the right peaks just before the
 *  middle of the screen. */
const PATH_X_MIN = -0.17;
const NARROW_X0 = 0.02;
const NARROW_K = 0.26;
/** Straight runs off the start and past the end, in screen heights, so a
 *  whole fish is off screen before and after the stroke. */
const RUN_IN = 0.9;
const RUN_OUT = 1.3;
/** Luke's stroke draws from his #projects top at 70% of the screen to its
 *  bottom at 20%: 0.7 + 1.4 - 0.2 = 1.9 screens of scroll, during which
 *  his page (and the stroke on it) moves up 1.9 screens. */
const VIEW_FROM = -0.7;
const VIEW_RUN = 1.9;

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
  /** Where the head starts (Luke's first point) and ends (his last), and
   *  how much longer the section runs than his 1.9 screens so both fish
   *  can swim off at the same speed. */
  let sFrom = 0;
  let sEnd = 1;
  let span = 1;

  const build = (sw: number, sh: number): void => {
    H = Math.round((SRC_W * sh) / Math.max(1, sw));
    canvas.width = W;
    canvas.height = H;
    // As long on a wide screen as on a small one, in the screen's own
    // terms: 0.34 read thin at 1920.
    L = W * (sw < 1024 ? 0.72 : 0.62);
    // PATH in canvas px, with a straight run on each end along the
    // stroke's own direction there.
    // On a wide screen the stroke is squeezed into the left half, so the
    // fish (much longer there now) stay clear of the names down the right.
    const sx = (x: number): number => (sw < 1024 ? x : NARROW_X0 + (x - PATH_X_MIN) * NARROW_K);
    const pts = PATH.map(([x, y]) => [sx(x) * W, y * H] as [number, number]);
    const n = (pts.length - 1) / 3;
    const ahead = (a: [number, number], b: [number, number], d: number): [number, number] => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [b[0] + ((b[0] - a[0]) / len) * d, b[1] + ((b[1] - a[1]) / len) * d];
    };
    const first = ahead(pts[1], pts[0], RUN_IN * H);
    // Out the bottom on a wide screen, not off to the right through the
    // names.
    const end = pts[pts.length - 1];
    const last: [number, number] =
      sw < 1024 ? ahead(pts[pts.length - 2], end, RUN_OUT * H) : [end[0] - 0.35 * H, end[1] + RUN_OUT * H];
    // Pieces: run in, n Béziers, run out; SAMPLES shared out evenly.
    const pieces = n + 2;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const g = (i / SAMPLES) * pieces;
      const k = Math.min(pieces - 1, Math.floor(g));
      const t = g - k;
      let x: number;
      let y: number;
      if (k === 0) {
        x = first[0] + (pts[0][0] - first[0]) * t;
        y = first[1] + (pts[0][1] - first[1]) * t;
      } else if (k === pieces - 1) {
        const e = pts[pts.length - 1];
        x = e[0] + (last[0] - e[0]) * t;
        y = e[1] + (last[1] - e[1]) * t;
      } else {
        const [a, b, c, d] = [pts[3 * k - 3], pts[3 * k - 2], pts[3 * k - 1], pts[3 * k]];
        const u = 1 - t;
        x = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
        y = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
      }
      px[i] = x;
      py[i] = y;
      along[i] = i === 0 ? 0 : along[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    }
    total = along[SAMPLES];
    // The lead's head runs from where Luke's stroke starts (off the left)
    // to past where it ends (off the right) by enough for both fish to go.
    sFrom = along[Math.round(SAMPLES / pieces)];
    sEnd = along[Math.round((SAMPLES * (pieces - 1)) / pieces)];
    const sGone = Math.min(total, sEnd + 1.9 * L);
    span = (sGone - sFrom) / Math.max(1, sEnd - sFrom);
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

  // How far through the section the scroll is, where the lead's head is,
  // how fast it is going (smoothed, in body lengths a second) and how far
  // through the beat.
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

  /** The head's distance along the path at progress p: one speed. */
  const headAt = (p: number): number => sFrom + (sEnd - sFrom) * span * Math.max(0, Math.min(1, p));

  // The strip moves up under the screen at one rate, as Luke's page does.
  const aim = (): void => {
    view = (VIEW_FROM + VIEW_RUN * span * goal) * H;
  };

  build(screenW, screenH);
  head = headAt(0);
  aim();
  draw();

  return {
    source: {
      canvas,
      animated: true,
      update: (_time: number, dt: number) => {
        const step = Math.min(0.1, Math.max(0, dt));
        const moved = headAt(goal) - head;
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
      goal = Math.max(0, Math.min(1, p));
      dirty = true;
    },
    resize: (sw, sh) => {
      build(sw, sh);
      head = headAt(goal);
      dirty = true;
    },
  };
}
