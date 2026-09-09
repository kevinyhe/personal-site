"use client";

/**
 * The site's dot matrix, in 2D.
 *
 * The hero renders a procedural sakura through a halftone dither: the whole
 * picture is a grid of dots whose size carries the brightness. That is the
 * one thing a visitor remembers about the page, and below the hero it
 * stopped entirely — the sections were flat type on flat black. These are
 * the parts needed to run the same idea on a plain 2D canvas: a grid, a
 * strength per cell, and a dot sized and coloured by it.
 *
 * The only thing here that is not obvious is the bucketing. A viewport of
 * 14px cells is about eight thousand dots, and setting `fillStyle` per dot
 * costs far more than the fill itself. Strength is quantised into DOT_STEPS
 * levels instead, cells are sorted into a bucket per level in one pass, and
 * each bucket is drawn with a single fillStyle. Twelve state changes a
 * frame rather than eight thousand. The buckets are allocated once and
 * refilled, so a steady frame allocates nothing.
 */

/** Quantisation levels. Below ~8 the ramp bands visibly; above ~16 it costs. */
export const DOT_STEPS = 12;

/**
 * Frame budget, ms, for the 2D canvas layers once nothing on them is moving
 * fast: HalftoneField's grain, WorkPlate's sheen. Both cross under a cell a
 * frame at 30fps, so 60 and 30 paint the same picture and the loops sleep
 * to this. Each file says how it spends the budget; BranchProgress keeps
 * its own copy for its sway.
 */
export const FRAME_MS = 33;

export type DotGrid = {
  /** Cell size in CSS pixels. */
  cell: number;
  cols: number;
  rows: number;
};

export type DotPainter = {
  /**
   * Draws one frame. `strengthAt` returns 0..1 for a cell — 0 draws
   * nothing, 1 draws a dot that fills its cell. `colours` is indexed by
   * quantised step, so colour and size move together up the ramp.
   */
  paint(
    ctx: CanvasRenderingContext2D,
    grid: DotGrid,
    strengthAt: (col: number, row: number, index: number) => number,
    colours: string[],
    options?: { maxRadius?: number; round?: boolean },
  ): void;
};

export function createDotPainter(): DotPainter {
  // One flat pair of coordinate arrays per step, grown on demand.
  let capacity = 0;
  let xs: Float32Array[] = [];
  let ys: Float32Array[] = [];
  const counts = new Int32Array(DOT_STEPS);

  const ensure = (needed: number) => {
    if (needed <= capacity) return;
    capacity = Math.max(needed, capacity * 2, 1024);
    xs = Array.from({ length: DOT_STEPS }, () => new Float32Array(capacity));
    ys = Array.from({ length: DOT_STEPS }, () => new Float32Array(capacity));
  };

  return {
    paint(ctx, grid, strengthAt, colours, options) {
      const { cell, cols, rows } = grid;
      ensure(cols * rows);
      counts.fill(0);

      let index = 0;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1, index += 1) {
          const strength = strengthAt(col, row, index);
          if (strength <= 0.02) continue;
          // The top step is reserved for strength 1 exactly, so a full-
          // strength cell is never rounded down into the step below it.
          const step = Math.min(
            DOT_STEPS - 1,
            Math.floor(strength * DOT_STEPS),
          );
          const slot = counts[step];
          counts[step] = slot + 1;
          xs[step][slot] = col * cell;
          ys[step][slot] = row * cell;
        }
      }

      const maxRadius = options?.maxRadius ?? cell * 0.5;
      const round = options?.round ?? false;

      for (let step = 0; step < DOT_STEPS; step += 1) {
        const count = counts[step];
        if (!count) continue;
        // Mid-bucket, so a step's dot is the average of the range it covers.
        const level = (step + 0.5) / DOT_STEPS;
        const radius = maxRadius * level;
        const size = radius * 2;
        ctx.fillStyle = colours[step] ?? colours[colours.length - 1];
        const stepX = xs[step];
        const stepY = ys[step];
        if (round) {
          ctx.beginPath();
          for (let i = 0; i < count; i += 1) {
            const cx = stepX[i] + cell * 0.5;
            const cy = stepY[i] + cell * 0.5;
            ctx.moveTo(cx + radius, cy);
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          }
          ctx.fill();
        } else {
          for (let i = 0; i < count; i += 1) {
            ctx.fillRect(
              stepX[i] + cell * 0.5 - radius,
              stepY[i] + cell * 0.5 - radius,
              size,
              size,
            );
          }
        }
      }
    },
  };
}

/**
 * A colour ramp for the steps, from a quiet base to a hot highlight.
 *
 * Both ends are the site's own: `#f0f0f0` is the type colour and `#ff5f9a`
 * is the brightest of the background field's blobs (app/globals.css). The
 * alpha climbs with the step as well as the size, so a dim dot is small AND
 * faint — which is what keeps the resting field from reading as a texture
 * laid over the page.
 */
export function dotRamp({
  from = [240, 240, 240] as [number, number, number],
  to = [255, 95, 154] as [number, number, number],
  minAlpha = 0.05,
  maxAlpha = 1,
} = {}) {
  return Array.from({ length: DOT_STEPS }, (_, step) => {
    const t = step / (DOT_STEPS - 1);
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    const alpha = minAlpha + (maxAlpha - minAlpha) * t;
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  });
}

/**
 * Rasterises a drawing into one luminance value per cell, 0..1.
 *
 * This is how a plate gets its content: draw type (or anything) into an
 * offscreen canvas at the grid's size, then average each cell's pixels. The
 * result is the same signal the hero's dither works from, and it only has
 * to be computed once per plate — the animation modulates these values
 * rather than re-rasterising.
 */
export function sampleLuminance(
  grid: DotGrid,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
): Float32Array {
  const { cell, cols, rows } = grid;
  const width = cols * cell;
  const height = rows * cell;
  const values = new Float32Array(cols * rows);
  if (typeof document === "undefined" || width <= 0 || height <= 0) {
    return values;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return values;

  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const step = Math.max(1, Math.floor(cell / 3));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let total = 0;
      let samples = 0;
      for (let y = row * cell; y < (row + 1) * cell; y += step) {
        for (let x = col * cell; x < (col + 1) * cell; x += step) {
          const offset = (y * width + x) * 4;
          // Premultiply by alpha: the type is drawn on nothing, so a pixel
          // the glyph does not cover has colour but no coverage.
          const alpha = data[offset + 3] / 255;
          total +=
            ((data[offset] * 0.299 +
              data[offset + 1] * 0.587 +
              data[offset + 2] * 0.114) /
              255) *
            alpha;
          samples += 1;
        }
      }
      values[row * cols + col] = samples ? total / samples : 0;
    }
  }
  return values;
}

/**
 * Sizes a canvas's backing store to a CSS box at the device ratio, capped,
 * and returns the ratio used. Each dimension is written only when it
 * changes: assigning a canvas's width, even to the value it already has,
 * throws the backing store away and clears it — and a phone fires resize on
 * every address-bar show and hide without the viewport changing size.
 */
export function fitBackingStore(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  maxRatio = 2,
): number {
  const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
  const width = Math.round(Math.max(1, Math.round(cssWidth)) * ratio);
  const height = Math.round(Math.max(1, Math.round(cssHeight)) * ratio);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return ratio;
}

/**
 * Sizes a canvas's backing store to its CSS box and returns the grid that
 * fits. Capped at 2x: the dots are small solid shapes, and a third pixel
 * per axis buys nothing anyone can see for 2.25x the fill.
 */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  cell: number,
): DotGrid {
  const width = Math.max(1, Math.round(cssWidth));
  const height = Math.max(1, Math.round(cssHeight));
  const ratio = fitBackingStore(canvas, width, height);
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return {
    cell,
    cols: Math.ceil(width / cell) + 1,
    rows: Math.ceil(height / cell) + 1,
  };
}
