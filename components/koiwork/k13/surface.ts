/**
 * The water's surface for design k13: a regular grid of small pink dots on
 * a 2D canvas, pushed about by rings of ripple that start where the lead
 * koi is (koi.ts `lead()`).
 *
 * A ring is started at the lead's head every RING_EVERY px of scroll, so
 * the rings come only from the scroll; no more than three are out at once.
 * Each spreads outward and dies away over three seconds, and the surface
 * goes flat and still. Nothing starts on its own.
 *
 * The grid also carries the content: the active project's number drawn in
 * brighter dots on the left (a 5 by 7 dot-matrix numeral), one row of
 * brighter dots under the active title as a guide line, and the grid fading
 * out before the text column so it never sits behind the type.
 *
 * A dot near a ring's crest is moved along the line from the ring's centre
 * and drawn a little brighter, so a ring reads as a bright line bending the
 * grid. Dots are sorted into a few alpha levels and each level is one
 * fill, so a frame is a handful of draw calls.
 *
 * The canvas is capped at a pixel ratio of 1.5.
 */

export type Lead = () => { x: number; y: number } | null;

export type Surface = {
  resize(): void;
  /** The active project's number (1-based; 0 for none), the screen y of
   *  the guide line under its title (or null), and the left edge of the
   *  text column (null where the column is the whole width). */
  setActive(n: number, guideY: number | null, columnX: number | null): void;
  destroy(): void;
};

/** A new ring every this many px of scroll. */
const RING_EVERY = 120;
/** Rings kept at once. */
const MAX_RINGS = 3;
/** Seconds a ring lives: long enough to be seen after a scroll stops. */
const LIFE = 3;
/** Alpha levels a dot is drawn at. */
const LEVELS = 12;
/** Flat water, a ring's crest, the numeral, the guide line. */
const BASE = 0.1;
const PEAK = 0.65;
const NUMERAL = 0.42;
const GUIDE = 0.35;
/** How far a crest pushes a dot, in px. */
const PUSH = 5;

/** 5 by 7 dot-matrix digits, a row a string. */
const DIGITS: string[][] = [
  ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
];

type Ring = { x: number; y: number; born: number };

export function createSurface(canvas: HTMLCanvasElement, rgb: string, lead: Lead, reduced: boolean): Surface {
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  let dpr = 1;
  let gap = 24;
  let cols = 0;
  let rows = 0;
  const rings: Ring[] = [];
  let lastY = window.scrollY;
  let travel = 0;
  let raf = 0;
  let flat = false;
  let active = 0;
  /** The lead's head on screen, in px, for clearing the numeral under it. */
  let hx = -1e4;
  let hy = -1e4;
  let guide: number | null = null;
  let column: number | null = null;
  /** Grid cells of the numeral, as col * 4096 + row. */
  let lit = new Set<number>();
  let bx: Float32Array[] = [];
  let by: Float32Array[] = [];
  const bn = new Int32Array(LEVELS);

  const layoutNumeral = (): void => {
    lit = new Set();
    if (!active || column === null) return;
    // About min(28vh, 14vw) tall: the cell is that over the font's 7 rows,
    // snapped to whole grid steps so the numeral is the grid's own dots.
    const step = Math.max(1, Math.round(Math.min(0.28 * h, 0.14 * w) / 7 / gap));
    const c0 = Math.round((0.08 * w) / gap);
    const r0 = Math.round((0.5 * h) / gap - (7 * step) / 2);
    const text = String(active).padStart(2, "0");
    [...text].forEach((ch, k) => {
      const g = DIGITS[Number(ch)];
      for (let y = 0; y < 7; y += 1)
        for (let x = 0; x < 5; x += 1) {
          if (g[y][x] !== "1") continue;
          for (let sy = 0; sy < step; sy += 1)
            for (let sx = 0; sx < step; sx += 1)
              lit.add((c0 + (k * 6 + x) * step + sx) * 4096 + r0 + y * step + sy);
        }
    });
  };

  const resize = (): void => {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gap = w < 640 ? 18 : 24;
    cols = Math.ceil(w / gap) + 1;
    rows = Math.ceil(h / gap) + 1;
    const n = cols * rows;
    bx = Array.from({ length: LEVELS }, () => new Float32Array(n));
    by = Array.from({ length: LEVELS }, () => new Float32Array(n));
    layoutNumeral();
    flat = false;
  };

  const draw = (now: number): void => {
    if (!ctx) return;
    const t = now / 1000;
    while (rings.length && t - rings[0].born > LIFE) rings.shift();
    const speed = Math.min(w, h) * 0.3; // px a second
    const band = gap * 1.8; // half-width of a crest
    bn.fill(0);
    const rr = rings.map((r) => {
      const age = t - r.born;
      return { x: r.x * w, y: r.y * h, R: age * speed, s: Math.pow(1 - age / LIFE, 1.4) };
    });
    // The grid row the guide line runs along.
    const gRow = guide === null ? -1 : Math.round(guide / gap);
    for (let j = 0; j < rows; j += 1) {
      const y0 = j * gap;
      for (let i = 0; i < cols; i += 1) {
        const x0 = i * gap;
        let dx = 0;
        let dy = 0;
        let crest = 0;
        for (let k = 0; k < rr.length; k += 1) {
          const r = rr[k];
          const ex = x0 - r.x;
          const ey = y0 - r.y;
          const d = Math.sqrt(ex * ex + ey * ey) || 1;
          const u = (d - r.R) / band;
          if (u < -2.5 || u > 2.5) continue;
          const env = Math.exp(-u * u) * r.s;
          // One crest and its trough: out on the crest, in behind it.
          const push = Math.sin(u * Math.PI * 0.8) * env * PUSH;
          dx += (ex / d) * push;
          dy += (ey / d) * push;
          crest += 1.4 * env * Math.max(0, Math.cos(u * Math.PI * 0.8));
        }
        let a = BASE + (PEAK - BASE) * Math.min(1, crest);
        if (lit.has(i * 4096 + j)) {
          // Faded where a koi lies over it: near the lead's head and along
          // the body behind it.
          const d = Math.hypot(x0 - hx, (y0 - hy) * 0.6) / (0.11 * w);
          a = Math.max(a, NUMERAL * Math.min(1, Math.max(0, d - 0.4)));
        }
        // Gone behind the text column, over 12% of the width before it.
        if (column !== null) a *= Math.max(0, Math.min(1, (column - 24 - x0) / (0.12 * w)));
        if (j === gRow) a = Math.max(a, GUIDE);
        if (a < 0.01) continue;
        const lv = Math.min(LEVELS - 1, Math.round((a / PEAK) * (LEVELS - 1)));
        const n = bn[lv];
        bx[lv][n] = x0 + dx;
        by[lv][n] = y0 + dy;
        bn[lv] = n + 1;
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = `rgb(${rgb})`;
    const s = 1.5;
    for (let lv = 1; lv < LEVELS; lv += 1) {
      const n = bn[lv];
      if (!n) continue;
      ctx.globalAlpha = (lv / (LEVELS - 1)) * PEAK;
      const xs = bx[lv];
      const ys = by[lv];
      ctx.beginPath();
      for (let q = 0; q < n; q += 1) ctx.rect(xs[q] - s / 2, ys[q] - s / 2, s, s);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const l = lead();
    if (l && (Math.abs(l.x * w - hx) > 0.5 || Math.abs(l.y * h - hy) > 0.5)) {
      hx = l.x * w;
      hy = l.y * h;
      if (lit.size) flat = false;
    }
    const y = window.scrollY;
    travel += Math.abs(y - lastY);
    lastY = y;
    if (!reduced && travel >= RING_EVERY) {
      travel = 0;
      // Only where the head is on (or near) the screen.
      if (l && l.x > -0.1 && l.x < 1.1 && l.y > -0.1 && l.y < 1.1) {
        rings.push({ x: l.x, y: l.y, born: now / 1000 });
        if (rings.length > MAX_RINGS) rings.shift();
      }
    }
    if (!rings.length && flat) return;
    draw(now);
    flat = rings.length === 0;
  };

  resize();
  raf = requestAnimationFrame(tick);

  return {
    resize,
    setActive: (n, g, c) => {
      if (n === active && g === guide && c === column) return;
      const renumber = n !== active || c !== column;
      active = n;
      guide = g;
      column = c;
      if (renumber) layoutNumeral();
      flat = false;
    },
    destroy: () => cancelAnimationFrame(raf),
  };
}
