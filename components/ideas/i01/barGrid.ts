// Idea 1: BarPicture's bars painted through the touch field, pushed aside near the cursor and smeared on a fast scroll, a few rows at a time.

import { touchQuietBetween, touchShiftAt, touchSmearUp, type TouchRegion } from "@/components/ideas/i01/touchField";

/** Ghost bars reach at most this many cells, as in the bar shader. */
const MAX_GHOST = 6;

export type BarGrid = {
  /** Each cell's bar width at level 1, CSS px, row by row. */
  widths: Float64Array;
  /** How many ghost cells each row was last painted with. */
  paintedReach: Int8Array;
  cols: number;
  rows: number;
  cell: number;
  /** Where the grid starts in the canvas, CSS px. */
  ox: number;
  oy: number;
  dpr: number;
  /** The canvas's CSS size. */
  width: number;
  height: number;
  ink: string;
  level: number;
};

export type BarTone = { flip: boolean; black: number; white: number; maxWidth: number };

/** The bar widths of a picture shrunk to one pixel per cell (RGBA rows),
 *  worked out the way BarPicture's own loop does. */
export function barGrid(data: Uint8ClampedArray, grid: Omit<BarGrid, "widths" | "paintedReach">, tone: BarTone): BarGrid {
  const widths = new Float64Array(grid.cols * grid.rows);
  for (let i = 0; i < widths.length; i += 1) {
    const k = i * 4;
    let L = (0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]) / 255;
    if (tone.flip) L = 1 - L;
    const t = Math.max(0, Math.min(1, (L - tone.black) / (tone.white - tone.black)));
    widths[i] = t * tone.maxWidth * grid.cell;
  }
  return { ...grid, widths, paintedReach: new Int8Array(grid.rows) };
}

type Frame = { rect: DOMRect; scale: number; reach: number; from: number };

/** Where the canvas is and how far the smear's ghost reaches, in cells. */
function frameOf(canvas: HTMLCanvasElement, grid: BarGrid): Frame {
  const rect = canvas.getBoundingClientRect();
  // Canvas CSS px per client px: 1 unless a transform scales the canvas.
  const scale = grid.width / rect.width;
  // The ghost trails the bar it comes from: below it on a scroll down, as
  // the picture moves up.
  const smearDown = -touchSmearUp() * scale;
  return { rect, scale, reach: Math.min(MAX_GHOST, Math.round(Math.abs(smearDown) / grid.cell)), from: smearDown > 0 ? -1 : 1 };
}

/** Clears cells x0..x1 of rows y0..y1 and paints their bars again. */
function paintBlock(ctx: CanvasRenderingContext2D, grid: BarGrid, frame: Frame, y0: number, y1: number, x0: number, x1: number): void {
  const { widths, cols, rows, cell, ox, oy, dpr, level } = grid;
  const { rect, scale, reach, from } = frame;
  const left = Math.round((ox + x0 * cell) * dpr);
  const right = Math.round((ox + x1 * cell) * dpr);
  const top = Math.round((oy + y0 * cell) * dpr);
  const bottom = Math.round((oy + y1 * cell) * dpr);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  ctx.clearRect(left, top, right - left, bottom - top);
  ctx.fillStyle = grid.ink;
  for (let y = y0; y < y1; y += 1) {
    const rowTop = Math.round((oy + y * cell) * dpr);
    const tall = Math.round((oy + (y + 1) * cell) * dpr) - rowTop;
    const cy = rect.top + (oy + (y + 0.5) * cell) / scale;
    const quiet = touchQuietBetween(cy, cy);
    for (let x = x0; x < x1; x += 1) {
      let bw = widths[y * cols + x];
      for (let k = 1; k <= reach; k += 1) {
        const source = y + from * k;
        if (source < 0 || source >= rows) break;
        bw = Math.max(bw, widths[source * cols + x] * (1 - k / (reach + 1)));
      }
      bw *= level;
      if (bw < 0.6) continue;
      const shift = quiet ? 0 : touchShiftAt(rect.left + (ox + (x + 0.5) * cell) / scale, cy) * scale;
      ctx.fillRect((ox + x * cell + (cell - bw) / 2 + shift) * dpr, rowTop, bw * dpr, tall);
    }
  }
  ctx.restore();
}

/** Paints every bar. */
export function paintBarGrid(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, grid: BarGrid): void {
  const frame = frameOf(canvas, grid);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paintBlock(ctx, grid, frame, 0, grid.rows, 0, grid.cols);
  grid.paintedReach.fill(frame.reach);
}

/** Paints the bars the touch field may have moved: the cells under
 *  `pointer`, and every row in `seen` painted under a different smear than
 *  now (those whole). Both are in the canvas's own client px. */
export function repaintBarGrid(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, grid: BarGrid, pointer: TouchRegion | null, seen: TouchRegion | null): void {
  const frame = frameOf(canvas, grid);
  const { cols, rows, cell, ox, oy, paintedReach } = grid;
  const rowAt = (y: number): number => Math.max(0, Math.min(rows, Math.floor((y * frame.scale - oy) / cell)));
  const rowAfter = (y: number): number => Math.max(0, Math.min(rows, Math.ceil((y * frame.scale - oy) / cell)));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const wholeRows = (y0: number, y1: number): void => {
    let start = -1;
    for (let y = y0; y <= y1; y += 1) {
      const stale = y < y1 && paintedReach[y] !== frame.reach;
      if (stale && start < 0) start = y;
      if (!stale && start >= 0) {
        paintBlock(ctx, grid, frame, start, y, 0, cols);
        paintedReach.fill(frame.reach, start, y);
        start = -1;
      }
    }
  };
  if (seen) wholeRows(rowAt(seen.top), rowAfter(seen.bottom));
  if (!pointer) return;
  const y0 = rowAt(pointer.top);
  const y1 = rowAfter(pointer.bottom);
  wholeRows(y0, y1);
  // The columns either side of the box are painted too: a bar moved
  // across a cell's edge must not be cut there.
  const x0 = Math.max(0, Math.floor((pointer.left * frame.scale - ox) / cell) - 1);
  const x1 = Math.min(cols, Math.ceil((pointer.right * frame.scale - ox) / cell) + 1);
  if (y0 < y1 && x0 < x1) paintBlock(ctx, grid, frame, y0, y1, x0, x1);
}
