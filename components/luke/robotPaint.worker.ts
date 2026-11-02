/**
 * Paints the robot in Skills (robotTurn.ts) off the main thread. On it a
 * frame took 26 ms on a phone's CPU (4 times slowed), every one over the
 * frame's 16.7, and the whole page's scroll stuttered with it.
 *
 * Underneath is the frame itself, faintly (UNDER), in the page's two
 * colours. Over it are bars in the ink, at the screen's own pixels, each
 * cell one pixel tall, so a bar changes its width every row. In square
 * cells the robot was about 130 rows tall and its rails broke up. In tall
 * cells alone it lost its thin lit metal, where a bar is under a pixel
 * wide and does not draw; the frame underneath keeps that.
 * Each frame (tools/robot_turn_levels.mjs) is where the robot is and how
 * near the lens, in its alpha (its far side fainter), and how lit it is
 * there, in its grey, as a rank from its darkest to its lightest. Each
 * rank is pushed toward the ends (CONTRAST) and given the koi's bar at
 * that rank (KOI_BARS) as its share of the ink, by which way the page is
 * coloured: in plum ink on the pink page a shadow is the most ink and a
 * lit face the least, in pink on the dark one the other way round, and
 * every part of the robot takes at least FLOOR of it. Graded the koi's
 * way, a lit part all ink and a shadow none, the robot on the pink page
 * was a negative of itself. Where the robot is not, both are clear.
 *
 * The frames are fetched as soon as the robot is made, the one it drives
 * in on first, and kept as files; a few at a time are decoded, the one
 * shown and those either side of it in the turn.
 */
import { frameSrc, type PaintReply, type PaintRequest, ROBOT_TURN } from "@/components/luke/robotFrames";
import type { Rgb } from "@/components/valley/barShader";

/** Frames fetched at once. */
const FETCHING = 4;
/** Frames kept read, about 1 MB each: the robot's own box of one. */
const KEPT = 12;
/** Frames decoded ahead of the one shown, each way round the turn. */
const AHEAD = 2;
/** How much of its ink the frame under the bars takes. */
const UNDER = 0.6;
/** The least of the ink any part of the robot takes: its lit faces in
 *  plum, its shadows in pink. */
const FLOOR = 0.15;
/** The koi's bars (public/work/koi.png through WorkIndex's grade) at 17
 *  ranks from the least to the most, as tools/robot_turn_levels.mjs
 *  prints them. Graded straight from the render the robot was one mid
 *  tone; at the koi's ranks it has as much of each share of ink as they
 *  have of each bar width. */
const KOI_BARS = [0, 0, 0.109, 0.24, 0.349, 0.434, 0.503, 0.566, 0.623, 0.68, 0.737, 0.806, 0.869, 0.954, 1, 1, 1];

/** The contrast: each rank pushed away from the middle one, toward the
 *  ends, by this power each side, before the koi's bar for it is taken.
 *  At the koi's own ranks (1) the robot was mostly mid tones; at 2.6 the
 *  spread is about a third more (0.32 against 0.23, as a standard
 *  deviation), and the number plate reads. */
const CONTRAST = 2.6;

/** The share of the ink each grey of a frame takes, for ink darker than
 *  the page (shade gets the ink) and lighter (light gets it). */
function shares(inkDark: boolean): Float32Array {
  const out = new Float32Array(256);
  for (let g = 0; g < 256; g += 1) {
    const t = inkDark ? 1 - g / 255 : g / 255;
    const pushed = t < 0.5 ? 0.5 * (2 * t) ** CONTRAST : 1 - 0.5 * (2 * (1 - t)) ** CONTRAST;
    const at = pushed * (KOI_BARS.length - 1);
    const i = Math.min(KOI_BARS.length - 2, Math.floor(at));
    out[g] = Math.max(FLOOR, KOI_BARS[i] + (KOI_BARS[i + 1] - KOI_BARS[i]) * (at - i));
  }
  return out;
}
const SHARE_DARK = shares(true);
const SHARE_LIGHT = shares(false);

type Colours = {
  /** Every pixel a frame can have, by its alpha and grey (alpha × 256 +
   *  grey), as the pixel the frame under the bars has there: the ground
   *  mixed toward the ink by UNDER of its share, opaque, or clear where
   *  alpha is 0. */
  under: Uint32Array;
  /** The ink as a pixel. */
  bar: number;
  /** The share of the ink each grey takes. */
  share: Float32Array;
};

/** Pixels are packed as a canvas's read as 32-bit words on a little-endian
 *  machine: alpha in the top byte, red in the bottom. */
function coloursOf(ground: Rgb, ink: Rgb): Colours {
  const share = ink[0] + ink[1] + ink[2] < ground[0] + ground[1] + ground[2] ? SHARE_DARK : SHARE_LIGHT;
  const channel = (c: number, t: number): number => Math.round(255 * (ground[c] + (ink[c] - ground[c]) * t));
  const pixelAt = (t: number): number => ((255 << 24) | (channel(2, t) << 16) | (channel(1, t) << 8) | channel(0, t)) >>> 0;
  const under = new Uint32Array(256 * 256);
  for (let a = 1; a < 256; a += 1) {
    for (let g = 0; g < 256; g += 1) under[(a << 8) | g] = pixelAt(UNDER * (a / 255) * share[g]);
  }
  return { under, bar: pixelAt(1), share };
}

/** The frames either side of `k` in its run, the turn or the spins,
 *  nearest first. */
function besides(k: number): number[] {
  const { frames, spins } = ROBOT_TURN;
  const [first, count] = k < frames ? [0, frames] : [frames, spins];
  const out: number[] = [];
  for (let i = 1; i <= AHEAD; i += 1) {
    out.push(first + ((k - first + i) % count), first + ((k - first - i + count) % count));
  }
  return out;
}

/** The order the frames are fetched in: the one it drives in on and its
 *  wheels' spins, then the turn from there on, the way it turns. */
function fetchOrder(): number[] {
  const { frames, drive, spins } = ROBOT_TURN;
  const order = [drive];
  for (let j = 0; j < spins; j += 1) order.push(frames + j);
  for (let i = 1; i < frames; i += 1) order.push((drive + i) % frames);
  return order;
}

type PaintBox = { left: number; top: number; across: number; down: number };

/** The bars' canvas at one size: its pixels, each frame x's bar, how many
 *  frame pixels each bar averages, and those sums for the row being read. */
type BarGrid = {
  w: number;
  h: number;
  spacing: number;
  cols: number;
  image: ImageData;
  px: Uint32Array;
  colOfFrameX: Int32Array;
  pixelsInCol: Uint16Array;
  alphaSum: Uint32Array;
  shadeSum: Uint32Array;
};

/** A frame's ink box, [left, top, right, bottom] in frame px, with a pixel
 *  or two of room, since the frames are saved a little lossily. */
function paintBoxOf([l, t, r, b]: number[]): PaintBox {
  const left = Math.max(0, l - 2);
  const top = Math.max(0, t - 2);
  return { left, top, across: Math.min(ROBOT_TURN.width, r + 3) - left, down: Math.min(ROBOT_TURN.height, b + 3) - top };
}

const reply = (message: PaintReply): void => {
  (self as unknown as Worker).postMessage(message);
};

function createPainter(under: OffscreenCanvas, bars: OffscreenCanvas) {
  const { width, height } = ROBOT_TURN;
  under.width = width;
  under.height = height;
  const underG = under.getContext("2d");
  const barsG = bars.getContext("2d");
  const readerG = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
  if (!underG || !barsG || !readerG) throw new Error("The robot has no 2D canvas to paint in");
  const underImage = underG.createImageData(width, height);
  const underPx = new Uint32Array(underImage.data.buffer);

  const files = new Map<number, Blob>();
  // Least recently shown first.
  const decoded = new Map<number, Uint32Array>();
  const decoding = new Set<number>();
  let inkBoxes: number[][] | null = null;
  let colours: Colours | null = null;
  let grid: BarGrid | null = null;
  let askedColours: { ground: Rgb; ink: Rgb } | null = null;
  let askedSize: { w: number; h: number; spacing: number } | null = null;
  let wanted = -1;
  let shown = -1;

  const fitBars = (w: number, h: number, spacing: number): void => {
    if (grid && grid.w === w && grid.h === h && grid.spacing === spacing) return;
    bars.width = w;
    bars.height = h;
    const cols = Math.max(1, Math.floor(w / spacing));
    const colOfFrameX = new Int32Array(width);
    const pixelsInCol = new Uint16Array(cols);
    for (let x = 0; x < width; x += 1) {
      colOfFrameX[x] = Math.floor(((x + 0.5) * w) / width / spacing);
      if (colOfFrameX[x] < cols) pixelsInCol[colOfFrameX[x]] += 1;
    }
    const image = barsG.createImageData(w, h);
    grid = { w, h, spacing, cols, image, px: new Uint32Array(image.data.buffer), colOfFrameX, pixelsInCol, alphaSum: new Uint32Array(cols), shadeSum: new Uint32Array(cols) };
    shown = -1;
  };

  // Each bar is the average of the frame's pixels in its cell, so a thin
  // channel is a thin bar.
  const paintBars = (frame: Uint32Array, box: PaintBox, ink: number, share: Float32Array): void => {
    if (!grid) return;
    const { w, h, spacing, cols, image, px, colOfFrameX, pixelsInCol, alphaSum, shadeSum } = grid;
    const firstCol = Math.floor((box.left * w) / width / spacing);
    const endCol = Math.min(cols, Math.ceil(((box.left + box.across) * w) / width / spacing));
    const firstRow = Math.floor((box.top * h) / height);
    const endRow = Math.min(h, Math.ceil(((box.top + box.down) * h) / height));
    const clearFrom = Math.floor(firstCol * spacing);
    const clearTo = Math.min(w, Math.ceil(endCol * spacing));
    let summedRow = -1;
    barsG.clearRect(0, 0, w, h);
    for (let y = firstRow; y < endRow; y += 1) {
      const frameRow = Math.min(box.top + box.down - 1, Math.floor(((y + 0.5) * height) / h));
      if (frameRow !== summedRow) {
        summedRow = frameRow;
        alphaSum.fill(0);
        shadeSum.fill(0);
        const from = (frameRow - box.top) * box.across;
        for (let i = 0; i < box.across; i += 1) {
          const pixel = frame[from + i];
          const alpha = pixel >>> 24;
          if (!alpha) continue;
          const c = colOfFrameX[box.left + i];
          alphaSum[c] += alpha;
          shadeSum[c] += alpha * (pixel & 0xff);
        }
      }
      px.fill(0, y * w + clearFrom, y * w + clearTo);
      for (let c = firstCol; c < endCol; c += 1) {
        const alpha = alphaSum[c];
        if (!alpha) continue;
        const half = 0.5 * spacing * (alpha / (255 * pixelsInCol[c])) * share[Math.round(shadeSum[c] / alpha)];
        const middle = (c + 0.5) * spacing;
        const first = Math.floor(middle - half - 0.5) + 1;
        const last = Math.ceil(middle + half - 0.5) - 1;
        for (let x = first; x <= last; x += 1) px[y * w + x] = ink;
      }
    }
    barsG.putImageData(image, 0, 0, clearFrom, firstRow, clearTo - clearFrom, endRow - firstRow);
  };

  const paintUnder = (frame: Uint32Array, box: PaintBox, colourOf: Uint32Array): void => {
    const { left, top, across, down } = box;
    underG.clearRect(0, 0, width, height);
    for (let y = 0; y < down; y += 1) {
      const from = y * across;
      const to = (top + y) * width + left;
      for (let x = 0; x < across; x += 1) {
        const pixel = frame[from + x];
        underPx[to + x] = colourOf[((pixel >>> 24) << 8) | (pixel & 0xff)];
      }
    }
    underG.putImageData(underImage, 0, 0, left, top, across, down);
  };

  const paint = (k: number, frame: Uint32Array): void => {
    if (!colours || !inkBoxes) return;
    const box = paintBoxOf(inkBoxes[k]);
    paintUnder(frame, box, colours.under);
    paintBars(frame, box, colours.bar, colours.share);
    shown = k;
  };

  // Read once, here, and only the robot's own box, 44% of the frame on
  // average: read from a canvas at every paint it was most of a paint on
  // a phone's CPU.
  const read = (bitmap: ImageBitmap, { left, top, across, down }: PaintBox): Uint32Array => {
    readerG.clearRect(0, 0, across, down);
    readerG.drawImage(bitmap, left, top, across, down, 0, 0, across, down);
    return new Uint32Array(readerG.getImageData(0, 0, across, down).data.buffer);
  };

  const decode = (k: number): void => {
    const file = files.get(k);
    if (!file || !inkBoxes || decoded.has(k) || decoding.has(k)) return;
    const box = paintBoxOf(inkBoxes[k]);
    decoding.add(k);
    void createImageBitmap(file).then((bitmap) => {
      decoding.delete(k);
      decoded.set(k, read(bitmap, box));
      bitmap.close();
      for (const old of decoded.keys()) {
        if (decoded.size <= KEPT) break;
        if (old !== wanted) decoded.delete(old);
      }
      if (k === wanted) showSoon();
    });
  };

  // The frame wanted, once it is in: until then the last one stays.
  const show = (): void => {
    if (askedSize) {
      fitBars(askedSize.w, askedSize.h, askedSize.spacing);
      askedSize = null;
    }
    if (askedColours) {
      colours = coloursOf(askedColours.ground, askedColours.ink);
      askedColours = null;
      shown = -1;
    }
    if (wanted < 0) return;
    const frame = decoded.get(wanted);
    if (frame) {
      decoded.delete(wanted);
      decoded.set(wanted, frame);
      if (shown !== wanted) paint(wanted, frame);
    } else {
      decode(wanted);
    }
    for (const k of besides(wanted)) decode(k);
  };

  // Everything the page says while a paint runs is taken before the next,
  // so only the newest heading, size and colours are painted.
  let showQueued = false;
  const showSoon = (): void => {
    if (showQueued) return;
    showQueued = true;
    setTimeout(() => {
      showQueued = false;
      show();
    });
  };

  const fetchFrame = async (k: number): Promise<void> => {
    const r = await fetch(frameSrc(k));
    if (!r.ok) throw new Error(`The robot's frame ${k} did not load: ${r.status}`);
    files.set(k, await r.blob());
    showSoon();
  };
  const order = fetchOrder();
  let next = 1;
  const fetchOn = async (): Promise<void> => {
    while (next < order.length) {
      const k = order[next];
      next += 1;
      await fetchFrame(k);
    }
  };
  void fetchFrame(order[0])
    .then(() => {
      reply({ kind: "firstFrameIn" });
      return Promise.all(Array.from({ length: FETCHING }, fetchOn));
    })
    .catch((e: unknown) => {
      reply({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    });

  return {
    setOutlines(ink: number[][]): void {
      inkBoxes = ink;
      showSoon();
    },
    setSize(w: number, h: number, spacing: number): void {
      askedSize = { w, h, spacing };
      showSoon();
    },
    setColours(ground: Rgb, ink: Rgb): void {
      askedColours = { ground, ink };
      showSoon();
    },
    want(k: number): void {
      wanted = k;
      showSoon();
    },
  };
}

let painter: ReturnType<typeof createPainter> | null = null;

self.onmessage = ({ data: request }: MessageEvent<PaintRequest>) => {
  if (request.kind === "start") {
    painter = createPainter(request.under, request.bars);
    return;
  }
  if (!painter) throw new Error(`The robot's painter was told "${request.kind}" before it started`);
  if (request.kind === "outlines") painter.setOutlines(request.ink);
  if (request.kind === "size") painter.setSize(request.w, request.h, request.spacing);
  if (request.kind === "colours") painter.setColours(request.ground, request.ink);
  if (request.kind === "want") painter.want(request.k);
};
