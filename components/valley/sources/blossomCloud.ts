// Two big cherry blossoms drifting across the sky, in place of the reference's
// cumulus video. Kevin asked for blossoms rather than clouds, and then for
// them to read the way sondaven's cloud does: one big soft mass, bright,
// unmistakable against the sky - not a scatter of small flowers, which is what
// this layer used to be and which came back from the grid as grey mush.
//
// ---------------------------------------------------------------------------
// What the grade does here
// ---------------------------------------------------------------------------
// The layer is graded blackPoint 25 / whitePoint 255 the normal way up, on a
// 200 x 200 grid with bgOpacity 0 and the default bar widths (-2% .. 102% of a
// cell). So a DARK grey draws a WIDE bar and reads BRIGHT on the page:
//
//   brightness = clamp((grey - 25) / 230, 0, 1)
//   bar width  = 102% * (1 - brightness) - 2%   of one cell
//
//   25 and under  the bar fills the whole cell: solid pink.
//   150           half a cell, about 2.3 px on a 936 px wide box.
//   200           1.15 px: the thinnest bar worth drawing.
//   207 and over  under a pixel. The shader does not antialias, so this is not
//                 a faint bar, it is a hard one-pixel line - a screen door.
//   251 and over  nothing at all.
//
// So a blossom is built upside down from how it looks on paper: its heart is
// the DARKEST grey in it, because the heart has to come out the brightest
// thing on the page, and the petal rim is the palest. Nothing is painted
// between 200 and 251, and the rim does not fade to black - it stops. A fade
// would spend its last few cells in the hairline band.
//
// The gaps matter as much as the flowers. The shader drops any cell whose
// texel, or any texel within two of it, is black, so black is the only thing
// that cuts a shape. That is what the petal seams are made of: a three-pixel
// black wedge along each petal boundary comes back as a cell and a half of
// nothing, and the five petals separate instead of fusing into a disc. The
// same trick separates one blossom from the one behind it.
//
// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------
// One cell is w/200 by h/200 - about 4.7 x 3.2 px on the 936 x 648 source. The
// big blossom is 0.78 of the layout unit (half the box width, or a little over
// half its height, whichever is smaller), which on that source is 526 px
// across: 112 cells wide, and its tip notch alone is 15 cells. The small one
// is 0.56 of the unit, 378 px, 81 cells. Both are far past the size where the
// grid can still see a petal.

import type { CanvasSource } from "../barShader";
import { fbm2, makeRng } from "./noise";

type CloudOptions = {
  seed: number;
  width: number;
  height: number;
  // How many blossoms in the mass. Two by default; one reads as a single big
  // flower filling the box, three as a drift.
  count?: number;
};

const TAU = Math.PI * 2;
const BREATH_PERIOD = 9;
const BREATH_AMOUNT = 0.015;
// A big blossom turns much further at the rim than a small one did for the
// same angle, so the flutter is a third of what the scattered flowers used.
const FLUTTER_DEG = 2.2;
// How far anything on the canvas has to have moved since the last drawn frame
// before it is worth redrawing and re-uploading the texture. Well under one
// cell, so the grid cannot see the difference.
const STILL_PX = 0.5;

// Where each blossom sits, as a fraction of the box, and how big it is as a
// fraction of the layout unit. Listed back to front: the last one is drawn
// last and cuts into the ones behind it.
type Place = { x: number; y: number; r: number; rot: number; squash: number };
const LAYOUTS: Place[][] = [
  [{ x: 0.5, y: 0.5, r: 0.84, rot: 0.15, squash: 0.93 }],
  [
    { x: 0.71, y: 0.6, r: 0.56, rot: -0.55, squash: 0.88 },
    { x: 0.35, y: 0.44, r: 0.78, rot: 0.22, squash: 0.95 },
  ],
  [
    { x: 0.85, y: 0.33, r: 0.4, rot: 0.9, squash: 0.86 },
    { x: 0.64, y: 0.61, r: 0.52, rot: -0.4, squash: 0.9 },
    { x: 0.3, y: 0.41, r: 0.66, rot: 0.2, squash: 0.94 },
  ],
  [
    { x: 0.87, y: 0.3, r: 0.36, rot: 0.9, squash: 0.86 },
    { x: 0.14, y: 0.71, r: 0.3, rot: -1.1, squash: 0.84 },
    { x: 0.66, y: 0.62, r: 0.48, rot: -0.4, squash: 0.9 },
    { x: 0.35, y: 0.38, r: 0.6, rot: 0.2, squash: 0.94 },
  ],
];

type Bloom = {
  x: number;
  y: number;
  r: number;
  rot: number;
  squash: number;
  period: number;
  phase: number;
  path: Path2D;
  seams: Path2D;
  fill: CanvasGradient | null;
  shade: CanvasGradient | null;
  lightA: number; // which way the light comes from
  core: number; // the grey of the heart
  edge: number; // the grey the petal rim stops at
};

type Loose = {
  x: number;
  y: number;
  len: number;
  drift: number;
  angle: number;
  spin: number;
  period: number;
  phase: number;
  grey: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function grey(v: number): string {
  // Floor at 8: nothing drawn may read as the black background, or the shader
  // discards the cell and punches a hole through the flower. Ceiling at 200:
  // above it the bar is under a pixel wide and comes out as a hairline.
  const c = Math.round(clamp(v, 8, 200));
  return `rgb(${c},${c},${c})`;
}

// One five-petal blossom at unit radius, drawn from a polar radius so the
// valleys between petals are deep: a shape whose outline only dips a tenth of
// the way in comes back from the grid as a disc. This one dips to `dip`, and
// each petal tip carries the cherry blossom's notch. The outline is pushed
// around by noise as it goes so the five petals are not five copies.
function makeFlowerPath(petals: number, dip: number, seed: number): Path2D {
  const p = new Path2D();
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const c = Math.abs(Math.cos((petals / 2) * a)); // 1 on a petal axis, 0 between two
    const warp = (fbm2(Math.cos(a) * 1.7 + 4, Math.sin(a) * 1.7 + 9, 3, seed) - 0.5) * 0.12;
    const r = dip + (1 - dip) * Math.pow(c, 0.55) - 0.14 * Math.pow(c, 40) + warp * (0.35 + 0.65 * c);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

// The black wedges that separate one petal from the next. They run from just
// outside the heart to past the rim, and they are the only thing that makes a
// five-petal outline read as five petals rather than as one lobed blob.
function makeSeamPath(petals: number, offset: number, hwIn: number, hwOut: number): Path2D {
  const p = new Path2D();
  for (let i = 0; i < petals; i++) {
    const a = offset + (i / petals) * TAU + Math.PI / petals;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    p.moveTo(ca * 0.15 - sa * hwIn, sa * 0.15 + ca * hwIn);
    p.lineTo(ca * 1.08 - sa * hwOut, sa * 1.08 + ca * hwOut);
    p.lineTo(ca * 1.08 + sa * hwOut, sa * 1.08 - ca * hwOut);
    p.lineTo(ca * 0.15 + sa * hwIn, sa * 0.15 - ca * hwIn);
    p.closePath();
  }
  return p;
}

// One loose petal at unit length, pointing +x.
function makeLoosePath(): Path2D {
  const p = new Path2D();
  p.moveTo(-0.5, 0);
  p.bezierCurveTo(-0.3, -0.33, 0.24, -0.44, 0.5, -0.18);
  p.quadraticCurveTo(0.3, 0, 0.5, 0.18);
  p.bezierCurveTo(0.24, 0.44, -0.3, 0.33, -0.5, 0);
  p.closePath();
  return p;
}

let loosePath: Path2D | null = null;

export function createBlossomCloud(options: CloudOptions): CanvasSource {
  const canvas = document.createElement("canvas");
  const w = Math.max(2, Math.round(options.width));
  const h = Math.max(2, Math.round(options.height));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(options.seed);
  const seed = options.seed;
  const count = clamp(Math.round(options.count ?? 2), 1, LAYOUTS.length);
  // Half the box width or a little over half its height, whichever is smaller:
  // a blossom at r = 1 would just touch two edges of the box.
  const unit = Math.min(w * 0.5, h * 0.52);
  const cellX = w / 200;

  const blooms: Bloom[] = LAYOUTS[count - 1].map((p, i) => {
    const r = p.r * unit;
    return {
      x: p.x * w + (rng() - 0.5) * unit * 0.04,
      y: p.y * h + (rng() - 0.5) * unit * 0.04,
      r,
      rot: p.rot + (rng() - 0.5) * 0.3,
      squash: p.squash,
      period: 7 + rng() * 5,
      phase: rng() * TAU,
      path: makeFlowerPath(5, 0.4 + rng() * 0.05, seed + i * 17),
      // About three source pixels at the rim, which the two-texel discard
      // opens out into a cell and a half of nothing.
      seams: makeSeamPath(5, rng() * 0.4, (cellX * 0.35) / r, (cellX * 0.7) / r),
      fill: null,
      shade: null,
      lightA: -0.9 + (rng() - 0.5) * 1.2,
      core: 26 + i * 6,
      edge: 160 + i * 8,
    };
  });

  // A few petals coming loose at the rim, wandering out of the mass and
  // turning over as they go. Long-period on purpose: a petal that crosses a
  // cell in a few frames costs a texture upload every one of them.
  const loose: Loose[] = [];
  // A few petals coming loose, wandering in the space the blossoms leave and
  // turning over as they go. Long-period on purpose: a petal that crosses a
  // cell in a few frames costs a texture upload every one of them. They are
  // placed by trying positions around the mass and keeping the ones that clear
  // every blossom, because two big blossoms leave only a few gaps and a petal
  // that touches one is swallowed by it.
  // Two big blossoms leave only a few gaps, and a petal that touches one is
  // swallowed by it, so the gaps are found rather than guessed: the box is
  // walked on a coarse grid and the first few cells that clear every blossom
  // by a margin get a petal.
  const cols = 7;
  const rows = 5;
  const start = Math.floor(rng() * cols * rows);
  for (let k = 0; k < cols * rows && loose.length < 3; k++) {
    const cell = (start + k * 11) % (cols * rows);
    const len = unit * (0.15 + rng() * 0.06);
    const drift = unit * (0.05 + rng() * 0.05);
    const keep = len * 0.6 + drift + unit * 0.03;
    const x = ((cell % cols) + 0.5) * (w / cols) + (rng() - 0.5) * (w / cols) * 0.4;
    const y = (Math.floor(cell / cols) + 0.5) * (h / rows) + (rng() - 0.5) * (h / rows) * 0.4;
    if (x < keep || x > w - keep || y < keep || y > h - keep) continue;
    let clear = true;
    for (const bl of blooms) {
      if (Math.hypot(x - bl.x, y - bl.y) < bl.r * 0.95 + len * 0.6 + drift) clear = false;
    }
    for (const p of loose) {
      if (Math.hypot(x - p.x, y - p.y) < (len + p.len) * 2.5) clear = false;
    }
    if (!clear) continue;
    loose.push({
      x,
      y,
      len,
      drift,
      angle: rng() * TAU,
      spin: (rng() - 0.5) * 0.8,
      period: 13 + rng() * 9,
      phase: rng() * TAU,
      grey: 92 + rng() * 54,
    });
  }

  if (!loosePath) loosePath = makeLoosePath();
  const petal = loosePath;
  const centreX = w * 0.5;
  const centreY = h * 0.5;
  // The furthest any drawn point is from the centre the breath scales about,
  // which is what turns a change in the breath into a distance in pixels.
  let spread = 1;
  for (const b of blooms) spread = Math.max(spread, Math.hypot(b.x - centreX, b.y - centreY) + b.r);

  // The pose: everything that moves, as a pure function of t. It is held in
  // two flat arrays so a frame can be compared with the last one that was
  // actually drawn without allocating anything.
  const ang = new Float32Array(blooms.length);
  const pos = new Float32Array(loose.length * 3);
  let breath = 1;
  const drawnAng = new Float32Array(blooms.length);
  const drawnPos = new Float32Array(loose.length * 3);
  let drawnBreath = 0;
  let drawnOnce = false;

  const pose = (t: number) => {
    breath = 1 + BREATH_AMOUNT * Math.sin((TAU * t) / BREATH_PERIOD);
    for (let i = 0; i < blooms.length; i++) {
      const b = blooms[i];
      ang[i] = b.rot + ((FLUTTER_DEG * Math.PI) / 180) * Math.sin((TAU * t) / b.period + b.phase);
    }
    for (let i = 0; i < loose.length; i++) {
      const p = loose[i];
      const s = Math.sin((TAU * t) / p.period + p.phase);
      const c = Math.cos((TAU * t) / p.period + p.phase);
      pos[i * 3] = p.x + Math.cos(p.angle) * p.drift * s;
      pos[i * 3 + 1] = p.y + Math.sin(p.angle) * p.drift * s * 0.6 + p.drift * 0.3 * c;
      pos[i * 3 + 2] = p.angle + p.spin * s * 2;
    }
  };

  // The furthest any point on the canvas has moved since the last drawn frame.
  const moved = (): number => {
    let m = Math.abs(breath - drawnBreath) * spread;
    for (let i = 0; i < blooms.length; i++) m = Math.max(m, Math.abs(ang[i] - drawnAng[i]) * blooms[i].r);
    for (let i = 0; i < loose.length; i++) {
      m = Math.max(m, Math.abs(pos[i * 3] - drawnPos[i * 3]));
      m = Math.max(m, Math.abs(pos[i * 3 + 1] - drawnPos[i * 3 + 1]));
      m = Math.max(m, Math.abs(pos[i * 3 + 2] - drawnPos[i * 3 + 2]) * loose[i].len);
    }
    return m;
  };

  const draw = () => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.translate(centreX, centreY);
    ctx.scale(breath, breath);
    ctx.translate(-centreX, -centreY);
    for (let i = 0; i < blooms.length; i++) {
      const b = blooms[i];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang[i]);
      ctx.scale(b.r, b.r * b.squash);
      if (!b.fill) {
        // Out from the heart: the dark core that comes out solid pink, a pale
        // collar so the core reads as a disc and not as the middle of a blob,
        // the ring the anthers stand on, then the petals fading to the rim. So
        // the bar across one blossom goes wide, thin, wide, and thins away -
        // which is what makes it read as a flower.
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, grey(b.core));
        g.addColorStop(0.14, grey(b.core + 8));
        g.addColorStop(0.21, grey(138));
        g.addColorStop(0.31, grey(b.core + 48));
        g.addColorStop(0.5, grey((b.core + b.edge) * 0.5));
        g.addColorStop(0.78, grey(b.edge - 26));
        g.addColorStop(1, grey(b.edge));
        b.fill = g;
        // The light comes from one side, so the far side of every petal is
        // paler and its bars narrower. Added, not multiplied: "lighter" is the
        // only composite that keeps the flower's own shading underneath.
        const ca = Math.cos(b.lightA);
        const sa = Math.sin(b.lightA);
        const sh = ctx.createLinearGradient(-ca, -sa, ca, sa);
        sh.addColorStop(0, "rgba(0,0,0,0)");
        sh.addColorStop(0.45, "rgba(8,8,8,1)");
        // 30, not more: the rim is already at 168 and the shader draws a bar
        // under a pixel wide - a hairline - past 200.
        sh.addColorStop(1, "rgba(30,30,30,1)");
        b.shade = sh;
      }
      ctx.restore();
      // A black halo first, so a blossom in front cuts a clean gap into the
      // one behind instead of fusing with it.
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang[i]);
      ctx.scale(b.r * 1.035, b.r * b.squash * 1.035);
      ctx.fillStyle = "#000";
      ctx.fill(b.path);
      ctx.restore();
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang[i]);
      ctx.scale(b.r, b.r * b.squash);
      ctx.fillStyle = b.fill;
      ctx.fill(b.path);
      if (b.shade) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = b.shade;
        ctx.fill(b.path);
        ctx.globalCompositeOperation = "source-over";
      }
      // The anthers: a ring of dots dark enough to draw the widest bars in the
      // blossom, standing on the pale collar around the heart.
      ctx.fillStyle = grey(b.core + 14);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + b.rot * 1.7;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0.05, 0.05, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "#000";
      ctx.fill(b.seams);
      ctx.restore();
    }
    for (let i = 0; i < loose.length; i++) {
      const p = loose[i];
      // Turning over: it goes edge on twice a cycle and all but disappears.
      const turn = 0.3 + 0.7 * Math.abs(Math.cos((TAU * pos[i * 3 + 2]) / 3.1));
      ctx.save();
      ctx.translate(pos[i * 3], pos[i * 3 + 1]);
      ctx.rotate(pos[i * 3 + 2]);
      ctx.scale(p.len, p.len * turn);
      ctx.fillStyle = grey(p.grey);
      ctx.fill(petal);
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawnBreath = breath;
    drawnAng.set(ang);
    drawnPos.set(pos);
    drawnOnce = true;
  };

  pose(0);
  draw();
  return {
    canvas,
    animated: true,
    ready: Promise.resolve(),
    update: (t) => {
      pose(t);
      if (drawnOnce && moved() < STILL_PX) return false;
      draw();
      return true;
    },
    dispose: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
