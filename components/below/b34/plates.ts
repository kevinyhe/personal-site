/**
 * The letter plates for design 34: white capitals on black, for BarPicture
 * to draw as bars. Each plate is a row of equal slots with one letter in
 * each, squeezed sideways so the letters come out tall and narrow like a
 * condensed face, and nearly as tall as the row.
 *
 * Slot widths are whole multiples of the bar cell, so a row of repeated
 * letters can be slid left by exactly one slot and look the same: that is
 * how the WORK rows loop without a jump.
 */

/** Pixels of plate per bar cell. Three is plenty: BarPicture shrinks the
 *  plate to one pixel per cell before it draws. */
const PER_CELL = 3;

/** Inter's cap height as a share of the font size. */
const CAP = 0.727;

export type Row = {
  /** One slot's width and the row's height, in CSS px, both multiples of the cell. */
  slot: number;
  height: number;
  /** How many slots the drawn row holds. */
  count: number;
};

/** Slots for a row that must fill `width` and still have one slot to spare
 *  for sliding: slot about 0.6 of the row height, rounded to the cell. */
export function loopRow(width: number, height: number, cell: number): Row {
  const h = Math.max(cell, Math.floor(height / cell) * cell);
  const n = Math.max(3, Math.round(width / (h * 0.62)));
  const slot = Math.ceil(width / n / cell) * cell;
  return { slot, height: h, count: n + 1 };
}

/** Slots for a word set once across `width`. */
export function wordRow(width: number, height: number, cell: number, letters: number): Row {
  const h = Math.max(cell, Math.floor(height / cell) * cell);
  const slot = Math.max(cell, Math.floor(width / letters / cell) * cell);
  return { slot, height: h, count: letters };
}

/**
 * Draws `chars` (one per slot; a single character repeats in every slot)
 * as a plate the size of the row in cells times PER_CELL. `family` is the
 * CSS font family to set the letters in.
 */
export function letterPlate(chars: string, row: Row, cell: number, family: string): HTMLCanvasElement {
  const s = PER_CELL / cell;
  const slot = row.slot * s;
  const w = Math.round(row.count * slot);
  const h = Math.round(row.height * s);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const size = (h * 0.84) / CAP;
  ctx.font = `900 ${Math.round(size)}px ${family}`;
  const base = h / 2 + (size * CAP) / 2;
  for (let i = 0; i < row.count; i += 1) {
    const ch = chars.length === 1 ? chars : (chars[i] ?? "");
    if (!ch) continue;
    const m = ctx.measureText(ch).width;
    // Squeeze to at most 70% of the slot, and never wider than natural.
    const sx = Math.min(1, (slot * 0.7) / Math.max(1, m));
    ctx.save();
    ctx.translate((i + 0.5) * slot, base);
    ctx.scale(sx, 1);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
  return c;
}
