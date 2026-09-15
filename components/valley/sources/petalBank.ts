// Loose cherry petals drifting low across the box, where the reference had its
// herd of sheep. The reference's herd reads as three separate animals with
// black between them, and that is the thing to copy: the bar shader drops any
// cell within 2 texels of black, so the black between petals is what turns
// into page colour and keeps them apart. Petals that overlap have no black
// between them and fuse into one pale blob.
//
// So the petals are laid out in lanes. Every petal in a lane drifts at the
// same speed, which means the spacing built into the lane never changes, no
// matter how long the page has been open. Every position is a function of the
// time alone, so pausing and resuming never leaves a petal somewhere it
// should not be.
//
// ---------------------------------------------------------------------------
// Near and far
// ---------------------------------------------------------------------------
// The layer is graded blackPoint 15 / whitePoint 255 the normal way up, so a
// DARK grey draws a WIDE bar and reads bright on the page; 241 and over draws
// nothing at all. That makes depth almost free. A lane near the bottom of the
// band is near: its petals are bigger, faster, and painted DARK, so they come
// out as the widest, brightest things in the drift. A lane at the top is far:
// small, slow, and painted pale, so it lands on hairlines and sits back. The
// old bank painted every lane the same grey and the whole drift sat on one
// plane.

import type { CanvasSource } from "../barShader";
import { makeRng } from "./noise";

type PetalBankOptions = { seed: number; width: number; height: number };

type Petal = {
  x0: number; // position along the lane before the drift is applied
  span: number; // the lane's wrap length; x0 - speed * t is taken modulo this
  margin: number; // how far off each edge the wrap carries the petal
  y: number;
  size: number; // the petal's length, tip to base
  shape: 0 | 1 | 2;
  speed: number; // px/s leftwards
  spin: number; // rad/s
  rot0: number;
  bobAmp: number;
  bobPeriod: number;
  flipPeriod: number;
  flipDepth: number; // how far over it turns: 1 = right through edge on
  phase: number;
  phase2: number;
  grey: number;
  edgeGrey: number; // what it goes to as it turns edge on
  fill: CanvasGradient | null; // built on the first frame, then reused
  edgeFill: CanvasGradient | null;
};

const TAU = Math.PI * 2;
// The band the petals live in, as a fraction of the box height.
const TOP = 0.3;
const BOTTOM = 0.97;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function grey(v: number): string {
  const c = Math.round(clamp(v, 6, 255));
  return `rgb(${c},${c},${c})`;
}

// Three petals at unit length, pointing +x. The notch in the tip is cut deep
// on purpose: the bar grid only gets four or five cells across a petal and
// rubs two texels off every edge, so a shallow notch comes back as a blunt
// end. 0 is the plain one, 1 is narrow and pointed, 2 is curled so one side
// shows its back.
function makePetalPath(kind: 0 | 1 | 2): Path2D {
  const p = new Path2D();
  if (kind === 1) {
    p.moveTo(-0.5, 0);
    p.bezierCurveTo(-0.3, -0.2, 0.2, -0.3, 0.5, -0.13);
    p.quadraticCurveTo(0.32, 0, 0.5, 0.13);
    p.bezierCurveTo(0.2, 0.3, -0.3, 0.2, -0.5, 0);
  } else if (kind === 2) {
    // Curled: the far edge rolls back on itself, so the outline is lopsided.
    p.moveTo(-0.5, 0.04);
    p.bezierCurveTo(-0.34, -0.36, 0.22, -0.48, 0.5, -0.22);
    p.quadraticCurveTo(0.26, -0.02, 0.48, 0.16);
    p.bezierCurveTo(0.3, 0.3, -0.06, 0.26, -0.28, 0.3);
    p.quadraticCurveTo(-0.44, 0.24, -0.5, 0.04);
  } else {
    p.moveTo(-0.5, 0);
    p.bezierCurveTo(-0.32, -0.34, 0.24, -0.46, 0.5, -0.2);
    p.quadraticCurveTo(0.28, 0, 0.5, 0.2);
    p.bezierCurveTo(0.24, 0.46, -0.32, 0.34, -0.5, 0);
  }
  p.closePath();
  return p;
}

let petalPaths: Path2D[] | null = null;

export function createPetalBank(options: PetalBankOptions): CanvasSource {
  const canvas = document.createElement("canvas");
  const w = Math.max(2, Math.round(options.width));
  const h = Math.max(2, Math.round(options.height));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(options.seed);

  const petals: Petal[] = [];
  // Lanes are laid from the bottom edge upwards, so the drift always reaches
  // the bottom of the box and it is the top of the band that runs out.
  let y = BOTTOM * h;
  while (y > TOP * h) {
    // 0 at the top of the band, 1 at the bottom: the lane's distance sets its
    // petal size, its gap to the next lane, the spacing along it, its drift
    // and — the part that does most of the work — how dark it is painted.
    const depth = clamp((y / h - TOP) / (BOTTOM - TOP), 0, 1);
    const size = h * (0.05 + 0.058 * depth);
    const gap = size * (1.75 - 0.35 * depth);
    const step = size * (3.1 - 1.15 * depth);
    // Half a petal's longest reach, whatever way it has turned.
    const margin = size * 0.7;
    const count = Math.max(2, Math.ceil((w + 2 * margin) / step));
    const span = count * step;
    const speed = w * (0.009 + 0.044 * depth);
    for (let k = 0; k < count; k++) {
      // The top of the band keeps only half its petals, so the drift fades
      // out upward instead of stopping on a full row.
      if (depth < 0.35 && rng() > 0.5 + depth * 1.43) continue;
      const roll = rng();
      // A near petal is painted dark and draws the widest bars; a far one is
      // painted pale and lands on hairlines.
      const base = 214 - 104 * depth + (rng() - 0.5) * 30;
      petals.push({
        // Jitter stays under an eighth of a step so two petals in a lane keep
        // roughly a third of a petal's length of black between them.
        x0: (k + (rng() - 0.5) * 0.24) * step,
        span,
        margin,
        // Scattered half a lane gap up or down, which is what stops the
        // lanes reading as rows; lanes overlap a little in y, but two petals
        // only come close when one drifts past the other. The clamp keeps the
        // bottom lane's petals from falling out of the box.
        y: Math.min(y + (rng() - 0.5) * 0.85 * gap, h - 0.35 * size),
        size: size * (0.72 + 0.5 * rng()),
        shape: roll < 0.3 ? 1 : roll < 0.55 ? 2 : 0,
        speed,
        spin: (rng() - 0.5) * 0.9,
        rot0: rng() * TAU,
        // Bobbing is small on purpose: the lane's own scatter already uses
        // most of the room between one lane and the next.
        bobAmp: gap * 0.06,
        bobPeriod: 2.5 + rng() * 3,
        flipPeriod: 1.4 + rng() * 2.2,
        // A third of them turn right through edge on, where a petal is a
        // sliver a couple of cells tall and all you see is the light on its
        // edge; the rest only rock.
        flipDepth: rng() < 0.34 ? 0.88 : 0.3 + rng() * 0.25,
        phase: rng() * TAU,
        phase2: rng() * TAU,
        grey: clamp(base, 88, 230),
        edgeGrey: clamp(base - 58, 40, 214),
        fill: null,
        edgeFill: null,
      });
    }
    y -= gap;
  }
  // Higher lanes first, so a nearer petal passing behind is drawn over.
  petals.sort((a, b) => a.y - b.y);

  if (!petalPaths) petalPaths = [makePetalPath(0), makePetalPath(1), makePetalPath(2)];
  const paths = petalPaths;

  const draw = (t: number) => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (const p of petals) {
      let x = (p.x0 - p.speed * t) % p.span;
      if (x < 0) x += p.span;
      x -= p.margin;
      const yy = p.y + p.bobAmp * Math.sin((TAU * t) / p.bobPeriod + p.phase);
      const tumble = 0.3 * Math.sin((TAU * t) / (p.bobPeriod * 0.7) + p.phase2);
      const rot = p.rot0 + p.spin * t + tumble;
      // Turning over: the petal narrows across until it is nearly edge on,
      // and as it does the grey it is painted in drops, so what the shader
      // draws is a narrow shape in wider bars — a glint along the edge rather
      // than a petal that simply got thin and disappeared.
      const turn = Math.abs(Math.cos((TAU * t) / p.flipPeriod + p.phase2));
      const squash = 1 - p.flipDepth * (1 - turn);
      const edge = 1 - turn;
      ctx.save();
      ctx.translate(x, yy);
      ctx.rotate(rot);
      ctx.scale(p.size, p.size * Math.max(0.1, squash));
      if (!p.fill || !p.edgeFill) {
        // Unit-space gradients: canvas paints them through the transform in
        // force, so one gradient follows the petal at any size or angle.
        const g = ctx.createLinearGradient(-0.5, 0, 0.5, 0);
        g.addColorStop(0, grey(p.grey - 48));
        g.addColorStop(0.45, grey(p.grey));
        g.addColorStop(1, grey(p.grey + 26));
        p.fill = g;
        const e = ctx.createLinearGradient(-0.5, 0, 0.5, 0);
        e.addColorStop(0, grey(p.edgeGrey - 30));
        e.addColorStop(0.45, grey(p.edgeGrey));
        e.addColorStop(1, grey(p.edgeGrey + 20));
        p.edgeFill = e;
      }
      ctx.fillStyle = edge > 0.55 && p.flipDepth > 0.6 ? p.edgeFill : p.fill;
      ctx.fill(paths[p.shape]);
      ctx.restore();
    }
  };

  draw(0);
  return {
    canvas,
    animated: true,
    ready: Promise.resolve(),
    update: (t) => draw(t),
    dispose: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
