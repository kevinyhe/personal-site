// The robot's turn for Skills (components/luke/robotTurn.ts), from the
// two sheets that /tools/robot-turn bakes, to one picture a frame,
// public/models/robot-turn/00.webp to 87.webp, loaded as the robot turns.
// In one sheet at 800 by 680 a frame it would be 48 megapixels, 190 MB
// decoded.
//
//   node tools/robot_turn_levels.mjs <saved.png> <saved-depth.png>
//
// Each frame is grey and alpha: the alpha is where the robot is (the render
// is on black, and anything over EDGE is robot) and how near the lens,
// from 255 at its nearest to 255 less FADE of it at its furthest, so its
// far side draws fainter bars, on either page; the grey how lit it is
// there, as a rank: the share of the robot darker than it, so the sheet's
// greys are spread evenly from 0 to 255. robotPaint.worker.ts gives each rank the
// koi photo's bar at the same rank (public/work/koi.png, through
// WorkIndex's grade), so the robot has the koi's spread of bar widths,
// pushed further apart: the koi are a fifth next to none, three in eight
// a whole bar, 0.585 of a bar on average. On the pink page the darkest of it gets the widest bar,
// on the dark one the lightest, once robotPaint.worker.ts has pushed the ranks
// toward the ends (CONTRAST). This prints the koi's bars at 17 ranks from
// 0 to 1, robotPaint.worker.ts KOI_BARS.
//
// Graded straight from the render the robot was one mid tone (86% of it
// between a quarter and three quarters of a bar), and pushed to the ends
// by an S curve, sharpened, and backed in the page colour it was a
// stencil. With every part at full strength, the far side's rails drew as
// dark as the near side's and the robot read as one flat layer.
//
//
// It also writes public/models/robot-turn.json: each frame's ink box (the
// robot's pixels), [left, top, right, bottom] in frame px, and its outline,
// their left and right in every ROW px down the frame (-1 for none), which
// Skills.tsx wipes the sentence and the groups along as the robot drives
// across. And it prints the numbers robotTurn.ts frames the robot by: the
// rows every frame has some of the robot in, its top (the lowest top over
// every frame) to its foot (the highest bottom), and its widest against
// the height between.
import fs from "node:fs";

import sharp from "sharp";

/** The sheet's grid: ROBOT_TURN in components/luke/robotFrames.ts. */
const FRAME_W = 800;
const FRAME_H = 680;
const COLS = 8;
/** ROBOT_TURN.frames, then its spins. */
const FRAMES = 72 + 16;
/** The outline's rows, frame px. */
const ROW = 8;

/** The background is 0; the robot's darkest shadows are over this. */
const EDGE = 2;
/** The koi and WorkIndex's grade of them: a channel at WHITE draws no bar
 *  and at BLACK a whole one; a pixel's bar is its channels' average. */
const KOI = new URL("../public/work/koi.png", import.meta.url).pathname;
const WHITE = 40;
const BLACK = 215;
/** How much fainter the robot's furthest part is than its nearest, and
 *  the shares of it nearer than those two (the depth sheet's spread is
 *  taken between them). At 0.7 its back washed out; at 0.6 the back half
 *  had no contrast left. */
const FADE = 0.35;
const NEAR_SHARE = 0.02;
const FAR_SHARE = 0.98;
/** The fade in this many steps: under a twentieth of a bar each, too
 *  little to see, and in 255 the sheet came out 1.7 MB. */
const STEPS = 16;
/** A row with fewer of the robot's pixels than this is a stray rod tip,
 *  not where it is framed from. */
const SHOWN = 3;
const QUALITY = 80;

const [src, depthSrc] = process.argv.slice(2);
if (!src || !depthSrc) {
  console.error("usage: node tools/robot_turn_levels.mjs <saved.png> <saved-depth.png>");
  process.exit(1);
}
const { data, info: raw } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
const depth = await sharp(depthSrc).greyscale().raw().toBuffer();
const hist = new Array(256).fill(0);
let robot = 0;
for (const v of data) {
  if (v <= EDGE) continue;
  hist[v]++;
  robot++;
}
const koi = await sharp(KOI).ensureAlpha().raw().toBuffer();
const bars = [];
for (let i = 0; i < koi.length; i += 4) {
  if (koi[i + 3] < 128) continue;
  let bar = 0;
  for (let c = 0; c < 3; c++) bar += Math.max(0, Math.min(1, (koi[i + c] - WHITE) / (BLACK - WHITE))) / 3;
  bars.push(bar);
}
bars.sort((a, b) => a - b);
console.log(`KOI_BARS ${Array.from({ length: 17 }, (_, i) => bars[Math.min(bars.length - 1, Math.floor((i / 16) * bars.length))].toFixed(3)).join(", ")}`);
// Each grey of the render as the share of the robot darker than it (half
// of its own count, so a grey is ranked at its middle).
const grey = new Uint8Array(256);
for (let v = EDGE + 1, darker = 0; v < 256; v++) {
  grey[v] = Math.round((255 * (darker + hist[v] / 2)) / robot);
  darker += hist[v];
}
// How near each pixel of the robot is: the nearest of the robot round it,
// a pixel each way, since its edge pixels are part background in the
// depth render and would read as further than they are.
const near = new Uint8Array(raw.width * raw.height);
const nearHist = new Array(256).fill(0);
for (let y = 0; y < raw.height; y++) {
  for (let x = 0; x < raw.width; x++) {
    const i = y * raw.width + x;
    if (data[i] <= EDGE) continue;
    let most = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= raw.width || yy >= raw.height) continue;
        const j = yy * raw.width + xx;
        if (data[j] > EDGE && depth[j] > most) most = depth[j];
      }
    }
    near[i] = most;
    nearHist[most]++;
  }
}
let FAR = 0;
let NEAR = 255;
for (let v = 0, below = 0; v < 256; v++) {
  below += nearHist[v];
  if (below < (1 - FAR_SHARE) * robot) FAR = v;
  if (below < (1 - NEAR_SHARE) * robot) NEAR = v + 1;
}
console.log(`depth: furthest ${FAR}, nearest ${NEAR}`);
const sheet = Buffer.alloc(raw.width * raw.height * 2);
for (let i = 0; i < raw.width * raw.height; i++) {
  const v = data[i];
  if (v <= EDGE) continue;
  const far = Math.round(STEPS * Math.max(0, Math.min(1, (NEAR - near[i]) / (NEAR - FAR)))) / STEPS;
  sheet[2 * i] = grey[v];
  sheet[2 * i + 1] = Math.max(1, Math.round(255 * (1 - FADE * far)));
}
const ink = [];
const rows = [];
const shown = [];
for (let k = 0; k < FRAMES; k++) {
  const x0 = (k % COLS) * FRAME_W;
  const y0 = Math.floor(k / COLS) * FRAME_H;
  let l = FRAME_W, t = FRAME_H, r = -1, b = -1;
  const outline = new Array(2 * Math.ceil(FRAME_H / ROW)).fill(-1);
  let st = FRAME_H, sb = -1;
  for (let y = 0; y < FRAME_H; y++) {
    const i = 2 * Math.floor(y / ROW);
    let count = 0;
    for (let x = 0; x < FRAME_W; x++) {
      if (!sheet[2 * ((y0 + y) * raw.width + x0 + x) + 1]) continue;
      count++;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
      if (outline[i] < 0 || x < outline[i]) outline[i] = x;
      if (x > outline[i + 1]) outline[i + 1] = x;
    }
    if (count >= SHOWN) {
      if (y < st) st = y;
      sb = y;
    }
  }
  ink.push([l, t, r, b]);
  rows.push(outline);
  shown.push([st, sb]);
}
const boxes = new URL("../public/models/robot-turn.json", import.meta.url).pathname;
fs.writeFileSync(boxes, JSON.stringify({ frame: [FRAME_W, FRAME_H], row: ROW, ink, rows }) + "\n");
// The rows every frame has the robot in: framed by them, it covers the
// groups at every heading. (Framed by the median top and the lowest foot,
// at some headings it stopped short of the last group.)
const top = Math.max(...shown.map((s) => s[0]));
const foot = Math.min(...shown.map((s) => s[1])) + 1;
const widest = Math.max(...ink.map((i) => i[2] + 1 - i[0]));
console.log(`TOP ${(top / FRAME_H).toFixed(3)} FOOT ${(foot / FRAME_H).toFixed(3)} WIDEST ${(widest / (foot - top)).toFixed(3)}`);
const dir = new URL("../public/models/robot-turn/", import.meta.url).pathname;
fs.mkdirSync(dir, { recursive: true });
let bytes = 0;
for (let k = 0; k < FRAMES; k++) {
  const info = await sharp(sheet, { raw: { width: raw.width, height: raw.height, channels: 2 } })
    .extract({ left: (k % COLS) * FRAME_W, top: Math.floor(k / COLS) * FRAME_H, width: FRAME_W, height: FRAME_H })
    .webp({ quality: QUALITY, alphaQuality: 100 })
    .toFile(`${dir}${String(k).padStart(2, "0")}.webp`);
  bytes += info.size;
}
console.log(dir, FRAMES, "frames", Math.round(bytes / 1024), "KB");
