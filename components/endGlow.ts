import { AURORA_RAMP } from "@/components/bandColours";

/**
 * The light over the end page's mountain (Ending.tsx), after
 * lukebaffait.fr's hero: a soft field of glow, brightest a little under
 * the top of the screen and gone by its foot, its bright parts and the dark pockets
 * between them slowly folding into each other. His is red on black; this
 * is in the aurora's pinks (AURORA_RAMP), the colours the mountain's dots
 * are drawn in.
 *
 * Drawn on black and laid over the mountain with mix-blend-mode: screen,
 * so it only adds light: where the field is dark, the stars and the peak
 * show as they were.
 *
 * Drawn in 2D, not WebGL: the home page already makes 15 WebGL contexts
 * and the browser keeps 16, past which it drops the oldest, the hero's.
 * The field has nothing in it finer than a tenth of the screen, so it is
 * worked out on a canvas COLS across (one pixel a cell) and stretched to
 * the screen, where the stretch smooths it. Each cell reads a tiling noise
 * worked out once (TILE): three lookups a cell, about 30 000 a frame.
 */

/** Cells across; down is by the screen's shape. */
const COLS = 128;
/** The noise tile, px square, and its coarsest grid across it. */
const TILE = 256;
const GRID = 4;
/** Its octaves, each this much of the one before. His shapes are big and
 *  soft; at four octaves at half each it was smoke, and the stretch showed
 *  creases along its edges. */
const OCTAVES = 3;
const PERSIST = 0.35;
/** The tile is blurred by this, px (a Gaussian's sigma). Value noise
 *  sits flat near its grid's points and climbs steeply between them,
 *  along the grid's lines, so the bright parts had straight upright
 *  edges; blurred, they are round, as his are. At 8 some edges stayed. */
const BLUR = 14;
/** Where the light starts in the blurred noise, and over how much of it
 *  it comes to full: the blur flattens the noise, so this puts the light
 *  on the same share of the screen as before it (matched at the 10th and
 *  90th percentiles). */
const LIGHT_FROM = 0.352;
const LIGHT_OVER = 0.3;
/** Tiles to a screen's height: one cell of the coarsest grid is about
 *  half the screen tall. */
const SCALE = 0.5;
/** How far the field's lookups are pushed about by the noise itself, in
 *  tiles: what folds it, instead of sliding it. */
const WARP = 0.45;
/** Tiles a second the noise drifts by. Slow, as his is: at this it
 *  changes by about as much in a second as his does (at 0.006 a quarter
 *  less, measured as the mean change of the screen's greys). */
const DRIFT = 0.008;
/** The light fades in over this much of the screen's height from its top
 * edge, so the section's edge never shows against the one above. Eased,
 * as the fall to the foot is: a straight fade (the CSS mask this replaced,
 * up to 18vh) bends sharply where it stops, and on the lit sky that bend
 * was a bright line across the screen. */
const TOP_FADE = 0.3;
/** The brightest the light gets, as a share of the ramp's top. Kept to a
 *  trace: at 0.8 it was the main thing on the page, and at 0.2 still a
 *  plain patch of light; at this it only tints the sky as it moves, and
 *  the mountain and stars are what is seen. */
const PEAK = 0.12;

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

/** The light for each of 256 brightnesses: none, then the aurora's stops
 *  above its ground (dusk plum by 0.4, mauve by 0.8, its pink at the top). */
function makeRamp(): Uint8ClampedArray {
  const stops: [number, [number, number, number]][] = [
    [0, [0, 0, 0]],
    [0.4, hex(AURORA_RAMP[1][1])],
    [0.8, hex(AURORA_RAMP[2][1])],
    [1, hex(AURORA_RAMP[3][1])],
  ];
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k += 1;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const f = (t - t0) / (t1 - t0);
    for (let c = 0; c < 3; c += 1) out[3 * i + c] = PEAK * (c0[c] + (c1[c] - c0[c]) * f);
  }
  return out;
}

/** A tiling noise, 0..1: value noise on a GRID-cell lattice and its
 *  finer octaves, each lattice wrapping round the tile. */
function makeTile(): Float32Array {
  const out = new Float32Array(TILE * TILE);
  let seed = 7;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let weight = 1;
  let total = 0;
  for (let o = 0; o < OCTAVES; o += 1) {
    const n = GRID << o;
    const lattice = Float32Array.from({ length: n * n }, rand);
    const cell = TILE / n;
    for (let y = 0; y < TILE; y += 1) {
      const gy = y / cell;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const r0 = (y0 % n) * n;
      const r1 = ((y0 + 1) % n) * n;
      for (let x = 0; x < TILE; x += 1) {
        const gx = x / cell;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
        const c0 = x0 % n;
        const c1 = (x0 + 1) % n;
        const top = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * sx;
        const bottom = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * sx;
        out[y * TILE + x] += weight * (top + (bottom - top) * sy);
      }
    }
    total += weight;
    weight *= PERSIST;
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= total;
  return blurTile(out);
}

/** The tile blurred by BLUR, wrapping round its edges, across then down. */
function blurTile(tile: Float32Array): Float32Array {
  const r = Math.ceil(BLUR * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * BLUR * BLUR)));
  const sum = k.reduce((a, b) => a + b, 0);
  const across = new Float32Array(tile.length);
  const out = new Float32Array(tile.length);
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      let v = 0;
      for (let i = -r; i <= r; i += 1) v += k[i + r] * tile[y * TILE + ((x + i + TILE) % TILE)];
      across[y * TILE + x] = v / sum;
    }
  }
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      let v = 0;
      for (let i = -r; i <= r; i += 1) v += k[i + r] * across[((y + i + TILE) % TILE) * TILE + x];
      out[y * TILE + x] = v / sum;
    }
  }
  return out;
}

export type Glow = {
  /** Draws the field `time` seconds in. */
  draw(time: number): void;
  /** Re-reads the canvas's size. */
  resize(): void;
};

/** The glow on `canvas`; the caller runs the clock (Ending's frame loop). */
export function createGlow(canvas: HTMLCanvasElement): Glow | null {
  const g = canvas.getContext("2d");
  if (!g) return null;
  const tile = makeTile();
  // Bilinear, wrapping, in tiles.
  const at = (x: number, y: number): number => {
    const px = (x - Math.floor(x)) * TILE;
    const py = (y - Math.floor(y)) * TILE;
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const fx = px - x0;
    const fy = py - y0;
    const x1 = (x0 + 1) % TILE;
    const y1 = (y0 + 1) % TILE;
    const a = tile[y0 * TILE + x0];
    const b = tile[y0 * TILE + x1];
    const c = tile[y1 * TILE + x0];
    const d = tile[y1 * TILE + x1];
    return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
  };
  const ramp = makeRamp();

  let cols = COLS;
  let rows = 1;
  let img: ImageData | null = null;
  const resize = (): void => {
    const r = canvas.getBoundingClientRect();
    cols = COLS;
    rows = Math.max(1, Math.round((COLS * Math.max(1, r.height)) / Math.max(1, r.width)));
    canvas.width = cols;
    canvas.height = rows;
    img = g.createImageData(cols, rows);
  };

  const draw = (time: number): void => {
    if (!img) return;
    const d = img.data;
    const s = time * DRIFT;
    for (let y = 0; y < rows; y += 1) {
      const v = y / rows;
      // Gone at the top edge and by the foot, brightest just under the top.
      const rise = Math.min(1, v / TOP_FADE);
      const fall = Math.max(0, 1 - v / 0.92);
      const env = rise * rise * (3 - 2 * rise) * fall * fall * (3 - 2 * fall);
      const py = v * SCALE;
      for (let x = 0; x < cols; x += 1) {
        const px = (x / rows) * SCALE;
        const wx = at(px + s, py + 0.37) - 0.5;
        const wy = at(px + 0.53, py - s * 0.8) - 0.5;
        const f = at(px + WARP * wx + s * 0.4, py + WARP * wy - s * 0.3);
        // Its bright parts and the dark between them.
        const k = Math.max(0, Math.min(1, (f - LIGHT_FROM) / LIGHT_OVER));
        const j = 3 * Math.round(env * k * k * (3 - 2 * k) * 255);
        const o = 4 * (y * cols + x);
        d[o] = ramp[j];
        d[o + 1] = ramp[j + 1];
        d[o + 2] = ramp[j + 2];
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  };

  resize();
  return { draw, resize };
}
