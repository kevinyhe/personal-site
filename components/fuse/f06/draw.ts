import { CHART_ROWS, MONTHS, NOW, STREAMS, TONE_ALPHA, TONE_INK, WHITE } from "./data";

/**
 * Draws the ledger: one column per month, January 2021 to December 2026,
 * each column a stack of everything on the résumé that was running that
 * month. The stack is drawn the way the valley's hills are (barShader): a
 * grid of square cells, one vertical bar per cell, centred, full cell
 * height, as wide as the cell's value. Adjacent cells touch top to bottom,
 * so a column reads as a line that thickens and thins.
 *
 * A month is several cells wide, so the columns have texture. Inside each
 * stream's band the bars are widest at its foot and thin toward its top,
 * which is what makes bands stacked on each other read as layers of a
 * skyline rather than one block. A stream's first and last months taper in
 * and out sideways, so it starts like a hill, not a wall.
 */

export type LedgerLook = {
  /** 0..1: how far the columns have grown in, left to right. */
  grow: number;
  /** Per stream (STREAMS order), 0..1: 1 is drawn at full, 0 is faded. */
  weight: Float32Array;
  /** Month under the pointer or the keyboard, or -1. */
  hover: number;
  /** Draw a ground line of short bars where nothing was happening. */
  ground: boolean;
  /** Multiplies everything: the hero's copy is drawn faint. */
  alpha: number;
};

export type LedgerGrid = { colW: number; cellW: number; cellH: number; sub: number; fine: number };

/** A data row is split into `fine` grid rows once the chart is tall enough
 *  that cells would be over about 4.5px: the bars stay as thin as the
 *  valley's whatever the size. Months are split into square cells. */
export function gridFor(w: number, h: number): LedgerGrid {
  const colW = w / MONTHS;
  const fine = Math.max(1, Math.round(h / (CHART_ROWS * 4.5)));
  const cellH = h / (CHART_ROWS * fine);
  const sub = Math.max(1, Math.round(colW / cellH));
  return { colW, cellW: colW / sub, cellH, sub, fine };
}

/** Slow light across the picture, so the bands shimmer like a lit surface
 *  rather than reading as flat blocks. 0.7..1. */
function light(gx: number, gy: number): number {
  return 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(gx * 0.16 + gy * 0.09 + 1.7 * Math.sin(gx * 0.031 + gy * 0.05)));
}

/** Stable 0..1 noise per cell, so the texture is the same on every draw. */
function hash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Streams by level, so each month stacks bottom first. */
const BY_LEVEL = STREAMS.map((s, i) => ({ s, i })).sort((a, b) => a.s.level - b.s.level);

const MAX_W = 0.8;
/** Months a column takes to grow, in the left-to-right sweep. */
const SWEEP = 14;

export function drawLedger(ctx: CanvasRenderingContext2D, w: number, h: number, look: LedgerLook): void {
  ctx.clearRect(0, 0, w, h);
  const { colW, cellW, cellH, sub, fine } = gridFor(w, h);
  const hovering = look.hover >= 0;

  if (hovering) {
    ctx.globalAlpha = 0.06 * look.alpha;
    ctx.fillStyle = WHITE;
    ctx.fillRect(look.hover * colW, 0, colW, h);
  }

  for (let m = 0; m < MONTHS; m += 1) {
    const reveal = easeOut(clamp01((look.grow * (MONTHS + SWEEP) - m) / SWEEP));
    const x0 = m * colW;
    const dimCol = hovering && m !== look.hover ? 0.5 : 1;
    const lift = hovering && m === look.hover ? 1.12 : 1;

    // Everything running this month, bottom first.
    let total = 0;
    for (const { s } of BY_LEVEL) if (m >= s.start && m <= s.end) total += s.rows * fine;
    const shown = total * reveal;

    if (look.ground && total === 0) {
      ctx.fillStyle = WHITE;
      ctx.globalAlpha = (m > NOW ? 0.16 : 0.34) * look.alpha * dimCol * (hovering && m === look.hover ? 2 : 1);
      for (let k = 0; k < sub; k += 1) {
        const bw = Math.max(1, cellW * 0.14);
        ctx.fillRect(x0 + k * cellW + (cellW - bw) / 2, h - cellH, bw, cellH);
      }
      continue;
    }

    let base = 0;
    for (const { s, i } of BY_LEVEL) {
      if (m < s.start || m > s.end) continue;
      const wt = look.weight[i];
      ctx.fillStyle = TONE_INK[s.tone];
      ctx.globalAlpha = Math.min(1, TONE_ALPHA[s.tone] * (0.22 + 0.78 * wt) * look.alpha * dimCol * (lift > 1 ? 1.25 : 1));
      const span = s.end - s.start + 1;
      const running = s.end === NOW;
      const rows = s.rows * fine;
      for (let r = 0; r < rows; r += 1) {
        const g = base + r;
        if (g >= shown) break;
        const part = Math.min(1, shown - g);
        const t = rows > 1 ? r / (rows - 1) : 0;
        const taper = 1 - 0.7 * t ** 1.8;
        const y = h - (g + 1) * cellH;
        for (let k = 0; k < sub; k += 1) {
          // Sideways ease at a stream's ends: a hill, not a wall.
          const across = (k + 0.5) / sub;
          let edge = 1;
          if (span === 1) edge = 0.55 + 0.45 * Math.sin(Math.PI * across);
          else if (m === s.start) edge = 0.5 + 0.5 * across;
          else if (m === s.end && !running) edge = 1 - 0.5 * across;
          const gx = m * sub + k;
          const n = (0.86 + 0.14 * hash(gx, g)) * light(gx, g / fine);
          const v = taper * edge * n * (0.4 + 0.6 * wt) * part * lift;
          const bw = Math.min(cellW * 0.96, v * MAX_W * cellW);
          if (bw < 0.5) continue;
          ctx.fillRect(x0 + k * cellW + (cellW - bw) / 2, y, bw, cellH);
        }
      }
      base += rows;
    }
  }
  ctx.globalAlpha = 1;
}
