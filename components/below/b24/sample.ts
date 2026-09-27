import * as L from "./layout";

/**
 * Turns a word into tiles. The word is drawn white on black on a small 2D
 * canvas, in the site's own fonts, at three pixels per tile each way; each
 * tile whose block is mostly ink becomes one solid tile in the scene.
 *
 * This is the one file that needs a browser (it draws text). Everything
 * it decides from is in layout.ts.
 */

export type Form = {
  /** x y z per tile, world units, shuffled so the extra tiles of a smaller word land at random. */
  pos: Float32Array;
  count: number;
  /** Left and right of the tiles in world x: the gust leaves from the left. */
  span: [number, number];
  /** Tile width in world units. */
  size: number;
  yaw: number;
  /** Tile grid across and down, for the check. */
  cols: number;
  rows: number;
};

export type Fonts = { serif: string; sans: string };

/** Samples per tile each way. */
const SS = 3;
/** A tile is kept when this much of its block is ink. */
const KEEP = 0.42;

type Run = { text: string; sans: boolean };

/** The line in runs: all Inter if the word has a digit, else serif with Inter only for the signs the serif cannot draw. */
function runsOf(line: string, allSans: boolean): Run[] {
  if (allSans) return [{ text: line, sans: true }];
  const out: Run[] = [];
  for (const ch of line) {
    const sans = L.SERIF_UNSAFE.test(ch);
    const last = out[out.length - 1];
    if (last && last.sans === sans) last.text += ch;
    else out.push({ text: ch, sans });
  }
  return out;
}

const fontFor = (sans: boolean, px: number, f: Fonts): string => (sans ? `700 ${px}px ${f.sans}` : `italic 700 ${px}px ${f.serif}`);

function lineWidth(ctx: CanvasRenderingContext2D, runs: Run[], px: number, f: Fonts): number {
  let w = 0;
  for (const r of runs) {
    ctx.font = fontFor(r.sans, px, f);
    w += ctx.measureText(r.text).width;
  }
  return w;
}

export function sampleForm(spec: L.FormSpec, stageW: number, stageH: number, fonts: Fonts, seed: number): Form {
  const aspect = stageW / stageH;
  const bw = (spec.box.x1 - spec.box.x0) * stageW;
  const bh = (spec.box.y1 - spec.box.y0) * stageH;
  const runs = spec.lines.map((l) => runsOf(l, spec.sans));
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("b24: no 2D canvas");
  let px = L.fitFont(spec.lines, bw, bh, (line) => lineWidth(probe, runs[spec.lines.indexOf(line)], 100, fonts));
  let pitch = L.PITCH * stageH;

  let cells: { x: number; y: number }[] = [];
  let cols = 0;
  let rows = 0;
  // A second pass shrinks the type if the ink came out bigger than the box
  // (an italic overhang), or makes the tiles coarser if there are too many.
  for (let pass = 0; pass < 4; pass += 1) {
    cols = Math.max(1, Math.floor(bw / pitch));
    rows = Math.max(1, Math.floor(bh / pitch));
    // Drawn with a margin all round, so an overhang is seen, not clipped.
    const mx = Math.ceil(cols * 0.15);
    const my = Math.ceil(rows * 0.2);
    const cw = cols + 2 * mx;
    const ch = rows + 2 * my;
    const canvas = document.createElement("canvas");
    canvas.width = cw * SS;
    canvas.height = ch * SS;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("b24: no 2D canvas");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // From here on, units are the stage's pixels with the box's top-left at 0,0.
    ctx.setTransform(SS / pitch, 0, 0, SS / pitch, mx * SS, my * SS);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.lineJoin = "round";
    // A thin outline thickens the serif's hairlines, so they are still a
    // tile wide once the bars have eaten into their edges.
    ctx.lineWidth = px * 0.035;
    ctx.textBaseline = "alphabetic";
    const blockH = px * (L.LINE_EM * (spec.lines.length - 1) + L.INK_EM);
    const top = (bh - blockH) / 2;
    runs.forEach((line, i) => {
      const w = lineWidth(ctx, line, px, fonts);
      let x = spec.align === "left" ? 0 : spec.align === "right" ? bw - w : (bw - w) / 2;
      const base = top + px * (0.82 + i * L.LINE_EM);
      for (const r of line) {
        ctx.font = fontFor(r.sans, px, fonts);
        ctx.fillText(r.text, x, base);
        ctx.strokeText(r.text, x, base);
        x += ctx.measureText(r.text).width;
      }
    });
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    cells = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let cy = 0; cy < ch; cy += 1) {
      for (let cx = 0; cx < cw; cx += 1) {
        let sum = 0;
        for (let sy = 0; sy < SS; sy += 1) {
          const row = (cy * SS + sy) * canvas.width;
          for (let sx = 0; sx < SS; sx += 1) sum += data[(row + cx * SS + sx) * 4];
        }
        if (sum / (SS * SS * 255) < KEEP) continue;
        cells.push({ x: cx - mx, y: cy - my });
        minX = Math.min(minX, cx - mx);
        maxX = Math.max(maxX, cx - mx);
        minY = Math.min(minY, cy - my);
        maxY = Math.max(maxY, cy - my);
      }
    }
    if (!cells.length) break;
    const inkW = maxX - minX + 1;
    const inkH = maxY - minY + 1;
    const tooBig = inkW > cols || inkH > rows;
    const tooMany = cells.length > L.MAX_TILES;
    if (!tooBig && !tooMany) {
      // Put the ink where the box says: flush to its side, and centred up and down.
      const dx = spec.align === "left" ? -minX : spec.align === "right" ? cols - 1 - maxX : Math.round((cols - inkW) / 2) - minX;
      const dy = Math.round((rows - inkH) / 2) - minY;
      for (const c of cells) {
        c.x += dx;
        c.y += dy;
      }
      break;
    }
    if (tooBig) px *= Math.min(cols / inkW, rows / inkH) * 0.98;
    if (tooMany) pitch *= Math.sqrt(cells.length / L.MAX_TILES) * 1.03;
  }

  // Shuffled once, the same way every visit.
  const rand = L.seeded(seed);
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = cells[i];
    cells[i] = cells[j];
    cells[j] = t;
  }

  const [cxw] = L.toWorld((spec.box.x0 + spec.box.x1) / 2, 0, aspect);
  const cos = Math.cos(spec.yaw);
  const sin = Math.sin(spec.yaw);
  const pos = new Float32Array(Math.max(1, cells.length) * 3);
  let lo = Infinity;
  let hi = -Infinity;
  cells.forEach((c, i) => {
    const sx = (spec.box.x0 * stageW + (c.x + 0.5) * pitch) / stageW;
    const sy = (spec.box.y0 * stageH + (c.y + 0.5) * pitch) / stageH;
    const [wx, wy] = L.toWorld(sx, sy, aspect);
    const dx = wx - cxw;
    const x = cxw + dx * cos;
    pos[i * 3] = x;
    pos[i * 3 + 1] = wy;
    pos[i * 3 + 2] = -dx * sin;
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  });
  return {
    pos,
    count: cells.length,
    span: cells.length ? [lo, hi] : [0, 1],
    size: (2 * pitch) / stageH,
    yaw: spec.yaw,
    cols,
    rows,
  };
}
