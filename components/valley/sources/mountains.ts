// Mountain country for the bar shader, painted to match the two photographic
// plates the reference feeds its own scenes:
//
//   src/hero_mountain_bg.png  one long pale ridge on black, near-white under
//                             the crest, softening downward. -> variant "far"
//   src/intro_mountain.png    four smooth ranges stacked back to front, each
//                             a flat step darker than the one behind it, over
//                             a dark heather foreground. -> variant "near"
//
// ---------------------------------------------------------------------------
// The grade, which is the reference's own
// ---------------------------------------------------------------------------
//   near  blackPoint 25  whitePoint 200,  tweening to 45 / 175 on scroll
//   far   blackPoint 0   whitePoint 255
//   bar   minSquareWidth -2%   maxSquareWidth 102%   of one cell
//
// It is the right way up: a DARK grey draws a WIDE bar.
//
//   brightness = clamp((grey - 25) / 175, 0, 1)
//   bar width  = 102% - 104% * brightness   of one cell
//
// So tone alone carries the whole picture, exactly as it does in the
// reference's photographs. A range is told from the one behind it by the step
// in bar width across their shared edge, and nothing else is needed: no
// crest lines, no bands, no gutters. Each range is one flat tone with a slow
// wash over it, and the skyline between two tones is the silhouette.
//
//   layer          grey     bar width   what it reads as
//   far range      196-176   22-30%    a fine hatch, the haze behind it all
//   back range        178       11%    a dark ridge, barely marked
//   second range      149       29%    a thin comb
//   massif            120       45%    half closed
//   valley floor   100- 92    57-62%   more ink than page
//   foreground      80- 68    70-76%   the heaviest mass in the frame
//
// The reference paints this ladder on a tan page in dark ink, so its front is
// the heaviest mass in the frame and its distance nearly bare page. Here the
// bars are blossom pink on near-black, so the same ladder reads the same way
// round — most ink at the front, least at the back — and the page's own field
// shows through the sky, which is the one thing in either source allowed to
// be pure black. The distances are held a good deal wider than the
// reference's, though: on a light page a range drawn at 5% of a cell is
// almost the page itself, but here the land is opaque, so the same range
// would be a black slab with a few threads on it rather than haze. Nothing
// in the near plate is thinner than about a third of a cell for that reason.
//
// ---------------------------------------------------------------------------
// Black is not a colour here
// ---------------------------------------------------------------------------
// The shader drops a cell whose own texel, or any texel within two of it, is
// under byte 2, and a dropped cell paints NOTHING - not even its background.
// That is what the sky is for. Every pixel of land is 30 or over, so every
// cell of land survives and paints its background solid (bgOpacity 1) before
// its bar: the land is opaque and the site's drifting field shows only above
// the skyline.
//
// ---------------------------------------------------------------------------
// Where the two boxes sit
// ---------------------------------------------------------------------------
// The two sources are split so a page element can be laid between them - the
// hero's framed picture hangs in front of the far range and behind everything
// else. Nothing in "near" is painted above 0.20 of its box; "far" keeps its
// crest between 0.10 and 0.30 of its own, so
//   farY + 0.30 * farH  <  nearY + 0.20 * nearH
// With far { y 30%, h 64% } and near { y 42%, h 58% } that is 0.492 against
// 0.536, and the strip between them is where the picture goes.

import type { CanvasSource } from "../barShader";
import { fbm1, fbm2, makeRng, valueNoise2 } from "./noise";

type MountainOptions = {
  seed: number;
  width: number;
  height: number;
  // How many ranges the country has in total, across both sources. "far"
  // always draws one; "near" draws the rest.
  ridges?: number;
  variant: "near" | "far" | "fuji";
  // The grid the layer will be sampled on. The firs along a skyline are sized
  // in cells, since anything thinner than a cell is a coin toss.
  xSquares?: number;
  ySquares?: number;
};

/** Nothing in "near" is painted above this, so the far crest has sky to stand in. */
const NEAR_CEILING = 0.3;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** A bump centred on c, s wide: one named summit on a ridgeline. */
function gauss(u: number, c: number, s: number): number {
  const d = (u - c) / s;
  return Math.exp(-d * d);
}

export function createMountains(options: MountainOptions): CanvasSource {
  const canvas = document.createElement("canvas");
  const w = Math.max(2, Math.round(options.width));
  const h = Math.max(2, Math.round(options.height));
  canvas.width = w;
  canvas.height = h;
  const grid = {
    cellX: w / Math.max(8, options.xSquares ?? 100),
    cellY: h / Math.max(8, options.ySquares ?? 100),
  };
  const ctx = canvas.getContext("2d");
  if (ctx) {
    if (options.variant === "fuji") paintFuji(ctx, w, h, options.seed);
    else if (options.variant === "far") paintFar(ctx, w, h, options.seed, grid);
    else paintNear(ctx, w, h, options.seed, Math.max(3, options.ridges ?? 4), grid);
  }
  return {
    canvas,
    animated: false,
    ready: Promise.resolve(),
    dispose: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}

type Grid = { cellX: number; cellY: number };

/**
 * A skyline: smooth, and that is the whole point of it.
 *
 * The reference's mountains are rounded hill country photographed from a long
 * way off — two or three summits across a frame and nothing sharper. Ridged
 * noise gives an alpine sawtooth instead, and once the grid has sampled it the
 * teeth come out as a random walk, so the range reads as static rather than as
 * land. Two gaussian summits over one slow fbm is all that is used here.
 */
function skyline(
  w: number,
  seed: number,
  baseL: number,
  baseR: number,
  amp: number,
  summits: { at: number; drop: number; wide: number }[],
  rng: () => number,
): Float32Array {
  const y = new Float32Array(w);
  const off = rng() * 60;
  const freq = 1.6 + rng() * 0.7;
  for (let x = 0; x < w; x++) {
    const u = x / w;
    let v = lerp(baseL, baseR, smoothstep(0, 1, u));
    for (const s of summits) v -= s.drop * gauss(u, s.at, s.wide);
    v += (fbm1(u * freq + off, 4, seed) - 0.5) * amp;
    y[x] = v;
  }
  return y;
}

/**
 * The serrated edge of a stand of firs along a crest, as both plates have.
 * Three cells apart and two or three tall: anything finer is under the grid
 * and comes back as noise on the skyline.
 */
function firs(
  y: Float32Array,
  w: number,
  h: number,
  grid: Grid,
  fromU: number,
  toU: number,
  rng: () => number,
): void {
  const x0 = Math.round(fromU * w);
  const x1 = Math.round(toU * w);
  const pitch = Math.max(2, grid.cellX * (2.6 + rng() * 0.8));
  for (let at = x0; at < x1; at += pitch) {
    const cx = at + rng() * pitch * 0.4;
    const tw = grid.cellX * (0.9 + rng() * 0.7);
    const th = grid.cellY * (1.8 + rng() * 1.6) * smoothstep(0, 0.12, (cx - x0) / w)
      * smoothstep(0, 0.12, (x1 - cx) / w);
    const a = Math.max(0, Math.round(cx - tw));
    const b = Math.min(w - 1, Math.round(cx + tw));
    for (let x = a; x <= b; x++) {
      const d = Math.abs(x - cx) / Math.max(1, tw);
      y[x] = Math.min(y[x], y[x] - (th * (1 - d * d)) / h);
    }
  }
}

// ---------------------------------------------------------------------------
// "near": the country the framed picture hangs in front of. Back to front —
// three ranges in flat tonal steps, the valley floor they stand over, and a
// dark foreground sweeping up from the bottom corners.
// ---------------------------------------------------------------------------

function paintNear(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  ridges: number,
  grid: Grid,
): void {
  const rng = makeRng(seed);
  const img = ctx.createImageData(w, h);
  const px = img.data;

  // Three skylines, each a flat step darker than the one behind it. `ridges`
  // counts the whole country including the far source's one, so the tone of
  // range i is read off its place in that whole.
  const back = clamp(ridges - 1, 2, 4);
  const bands: { y: Float32Array; top: number; bot: number }[] = [];
  for (let i = 0; i < back; i++) {
    const k = back === 1 ? 0 : i / (back - 1); // 0 = furthest of these
    const y = skyline(
      w,
      seed + i * 71 + 3,
      lerp(0.345, 0.545, k),
      lerp(0.39, 0.6, k),
      lerp(0.07, 0.1, k),
      [
        { at: 0.14 + rng() * 0.16, drop: lerp(0.11, 0.155, k), wide: 0.17 },
        { at: 0.56 + rng() * 0.26, drop: lerp(0.085, 0.13, k), wide: 0.12 },
      ],
      rng,
    );
    for (let x = 0; x < w; x++) y[x] = clamp(y[x], NEAR_CEILING, 0.96);
    // The reference's middle range carries a fringe of firs along its crest;
    // the back one is too far off to show them.
    if (i === 1) firs(y, w, h, grid, 0.44, 0.92, rng);
    // The tone ladder. (i+1) because the far source holds range 0.
    const j = (i + 1) / ridges;
    bands.push({
      y,
      top: lerp(207, 91, j),
      bot: lerp(200, 96, j),
    });
  }

  // The valley floor the ranges stand over, and where the hut stands. Flat and
  // dark, a step under the front range.
  const floorY = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const u = x / w;
    floorY[x] = 0.665 + (fbm1(u * 2.2 + 4.1, 3, seed + 61) - 0.5) * 0.022 + u * 0.018;
  }

  // The foreground, sweeping up out of both bottom corners the way the
  // reference's heather bank does, with firs standing on its left shoulder.
  const nearY = new Float32Array(w);
  {
    const off = rng() * 40;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const edge = Math.min(u, 1 - u) / 0.5; // 0 at either edge, 1 in the middle
      let v = lerp(0.755, 0.9, smoothstep(0, 1, edge));
      v += (fbm1(u * 2.8 + off, 4, seed + 97) - 0.5) * 0.03;
      nearY[x] = clamp(v, 0.62, 0.99);
    }
    firs(nearY, w, h, grid, 0.0, 0.22, rng);
    firs(nearY, w, h, grid, 0.86, 1.0, rng);
  }

  // The wash over each face: wide and slow, so a range varies along its length
  // without ever breaking into marks of its own. NSTEP px per lattice sample —
  // a cell is a dozen px, so this is finer than anything the shader looks at.
  const NSTEP = 4;
  const nw = Math.ceil(w / NSTEP) + 1;
  const wash = new Float32Array(nw); // slow, wide: which part of a face is lit
  const relief = new Float32Array(nw); // the terrain itself, a dozen cells tall
  const fine = new Float32Array(nw);
  const refresh = (y: number) => {
    for (let i = 0; i < nw; i++) {
      const x = Math.min(w - 1, i * NSTEP);
      wash[i] = fbm2(x * 0.0022, y * 0.006, 3, seed + 17) - 0.5;
      // Without this a face is one flat grey, so every cell in a column
      // draws the same bar and the range comes out as an unbroken curtain
      // from its crest to the next. This is what breaks the columns: spurs
      // and gullies about a dozen cells tall, shading the face the way the
      // reference's photographs are shaded.
      relief[i] = fbm2(x * 0.0045, y * 0.019, 3, seed + 31) - 0.5;
      fine[i] = valueNoise2(x * 0.09, y * 0.09, seed + 11) - 0.5;
    }
  };

  // The lit lip along a skyline, in rows: a couple of cells of thinner bars
  // under each crest, so two faces of similar tone still part company where
  // they overlap. The reference gets this from aerial haze in the photograph.
  const LIP = Math.max(2, grid.cellY * 1.6);

  for (let y = 0; y < h; y++) {
    if (y % NSTEP === 0) refresh(y);
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o + 3] = 255;
      const i = (x / NSTEP) | 0;

      let g = 0;
      if (nearY[x] <= v) {
        // The foreground. The darkest thing in either plate, so the widest
        // bars: at the bottom of the frame the bars all but meet.
        const t = clamp((v - nearY[x]) / Math.max(0.02, 1 - nearY[x]), 0, 1);
        g = lerp(80, 68, t) + wash[i] * 10 + relief[i] * 30 + fine[i] * 3;
        g += 54 * smoothstep(LIP, 0, (v - nearY[x]) * h);
      } else if (floorY[x] <= v) {
        g = lerp(100, 92, clamp((v - floorY[x]) / 0.2, 0, 1))
          + wash[i] * 9 + relief[i] * 20 + fine[i] * 3;
      } else {
        // Front-most range wins.
        let idx = -1;
        for (let b = bands.length - 1; b >= 0; b--) {
          if (bands[b].y[x] <= v) {
            idx = b;
            break;
          }
        }
        if (idx < 0) {
          // Sky: pure black, which the shader drops, and the page shows.
          px[o] = 0;
          px[o + 1] = 0;
          px[o + 2] = 0;
          continue;
        }
        const B = bands[idx];
        const foot = idx + 1 < bands.length ? bands[idx + 1].y[x] : floorY[x];
        const t = clamp((v - B.y[x]) / Math.max(0.02, foot - B.y[x]), 0, 1);
        g = lerp(B.top, B.bot, t) + wash[i] * 10 + relief[i] * 26 + fine[i] * 3;
        g += 54 * smoothstep(LIP, 0, (v - B.y[x]) * h);
      }

      // 30 is the floor, well clear of the shader's discard: land is opaque.
      const q = g < 24 ? 24 : g > 246 ? 246 : g;
      px[o] = q;
      px[o + 1] = q;
      px[o + 2] = q;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// "far": the furthest range alone, so the framed picture can be laid over it
// while the rest of the country is drawn in front. One long pale ridge, near
// white under the crest and softening down the face, and the moon over it —
// the reference's own hero_mountain_bg plate, which is almost all sky.
// ---------------------------------------------------------------------------

function paintFar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  grid: Grid,
): void {
  const rng = makeRng(seed);
  const img = ctx.createImageData(w, h);
  const px = img.data;

  const crest = skyline(
    w,
    seed + 5,
    0.235,
    0.205,
    0.045,
    [
      { at: 0.12 + rng() * 0.12, drop: 0.085, wide: 0.13 },
      { at: 0.58 + rng() * 0.2, drop: 0.06, wide: 0.11 },
    ],
    rng,
  );
  for (let x = 0; x < w; x++) crest[x] = clamp(crest[x], 0.1, 0.3);
  // The plate's one serrated stretch, where its ridge runs out to the right.
  firs(crest, w, h, grid, 0.6, 0.98, rng);

  const NSTEP = 4;
  const nw = Math.ceil(w / NSTEP) + 1;
  const wash = new Float32Array(nw);
  const refresh = (y: number) => {
    for (let i = 0; i < nw; i++) {
      wash[i] = fbm2(Math.min(w - 1, i * NSTEP) * 0.0022, y * 0.006, 3, seed + 23) - 0.5;
    }
  };

  for (let y = 0; y < h; y++) {
    if (y % NSTEP === 0) refresh(y);
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o + 3] = 255;
      let g = 0;
      if (crest[x] <= v) {
        const t = clamp((v - crest[x]) / Math.max(0.02, 1 - crest[x]), 0, 1);
        g = lerp(196, 176, t) + wash[(x / NSTEP) | 0] * 9;
      }
      // Everything above the crest stays 0: the reference's sky is empty
      // page, and the one thing that was ever put in this one — a moon —
      // came out as a six-cell box of bars hanging over the ridge.
      const q = g > 0 ? (g < 30 ? 30 : g > 250 ? 250 : g) : 0;
      px[o] = q;
      px[o + 1] = q;
      px[o + 2] = q;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// "fuji": one cone on the horizon, for the range behind everything.
//
// A stratovolcano is not a hill and is not drawn like one. Its profile is a
// concave curve — steep at the summit, flattening a long way out to a base
// several times its own height — and the flanks are smooth, because the ash
// that built them fell evenly. Ridged noise on a cone gives a rocky peak,
// which is the one thing this shape is not; what little texture there is
// comes from the radial gullies running straight down the flanks, and even
// those only show near the top.
//
// It is painted in the same greys the "far" plate uses, since it takes the
// same grade (blackPoint 0 / whitePoint 255): bright, so the bars are a fine
// hatch and it reads as a long way off. The snow cap is brighter still, and
// its lower edge is the one hard line in the drawing.
// ---------------------------------------------------------------------------

function paintFuji(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const rng = makeRng(seed);
  const img = ctx.createImageData(w, h);
  const px = img.data;

  // The summit sits a little off centre, and the base runs off both edges.
  const peakU = 0.44 + rng() * 0.12;
  const peakY = 0.2 + rng() * 0.05;
  // Half-width at the bottom of the canvas, in units of u. Well over 1, so
  // the flanks leave the frame rather than ending in the air.
  const spread = 0.86;
  // The concavity. 1 is a straight-sided cone; over 1 flattens the skirt.
  const flare = 2.35;
  const snowLine = peakY + 0.085;
  const off = rng() * 40;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o + 3] = 255;
      const u = x / w;
      // The profile, read the other way round: how far out the flank is at
      // this height. Nothing above the summit, everything under the curve.
      const t = clamp((v - peakY) / (1 - peakY), 0, 1);
      const halfW = spread * Math.pow(t, 1 / flare);
      const d = Math.abs(u - peakU);
      // A little waver on the skyline, at a wavelength long enough that it
      // reads as the mountain and not as noise.
      const edge = halfW + (fbm1(u * 6 + off, 3, seed + 3) - 0.5) * 0.012 * t;
      if (v < peakY || d > edge) {
        px[o] = 0;
        px[o + 1] = 0;
        px[o + 2] = 0;
        continue;
      }
      // Toward the near edge of the cone the flank turns away from the light.
      const across = clamp(d / Math.max(1e-4, edge), 0, 1);
      let grey = lerp(206, 174, across * across) - 26 * clamp((v - peakY) * 1.6, 0, 1);
      // The gullies: radial, and only near the summit where the slope is
      // steep enough to show them.
      const gully = Math.sin((u - peakU) / Math.max(0.02, t) * 26 + 1.7);
      grey += gully * 9 * (1 - clamp(t * 2.4, 0, 1));
      // Snow, with a ragged lower edge.
      const line = snowLine + (fbm1(u * 9 + 12, 3, seed + 7) - 0.5) * 0.03;
      if (v < line) grey = 242 - 10 * across;
      const q = grey < 30 ? 30 : grey > 250 ? 250 : grey;
      px[o] = q;
      px[o + 1] = q;
      px[o + 2] = q;
    }
  }
  ctx.putImageData(img, 0, 0);
}
