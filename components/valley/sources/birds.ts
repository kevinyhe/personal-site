// A skein of birds, kept from the reference. Each one is a body, head, tail
// and two wings that fold and spread, seen from a little below so the flap
// reads as the wings narrowing and widening. They drift on their own slow
// circles inside the box; the bar layer itself is scrolled across the page by
// the caller, like the reference's looping tween.
//
// The layer is graded blackPoint 255 / whitePoint 0 — upside down — so a
// BRIGHT grey draws a WIDE bar. 255 fills its cell and comes out as solid
// blossom pink; 140 fills half of it and comes out as something you can see
// through; 14 and under draws nothing. That is where the depth in the flock
// comes from: the three birds in front are painted near white and read as
// solid shapes, the ones behind are painted mid grey and small, and they read
// as birds further off rather than as smaller copies of the same bird.

import type { CanvasSource } from "../barShader";
import { makeRng } from "./noise";

type BirdsOptions = { seed: number; width: number; height: number; count?: number };

type Bird = {
  cx: number;
  cy: number;
  orbitX: number;
  orbitY: number;
  orbitPeriod: number;
  orbitPhase: number;
  heading: number; // radians, canvas y down; negative = climbing
  span: number; // wing tip to wing tip when spread
  flaps: number; // flaps per second
  flapPhase: number;
  glide: number; // 0 = flapping hard, 1 = wings held out and still
  grey: number;
};

const TAU = Math.PI * 2;

// Wing outline in a flat frame: x forward along the body, y out to the tip.
// Swept back, with the trailing edge cut away toward the tip so the wing comes
// to a point instead of a paddle, and a shallow notch where the primaries part.
const WING: [number, number][] = [
  [0.16, 0.05],
  [0.15, 0.4],
  [0.08, 0.72],
  [0.02, 0.94],
  [-0.04, 1.0],
  [-0.14, 0.9],
  [-0.16, 0.78],
  [-0.26, 0.74],
  [-0.34, 0.52],
  [-0.36, 0.28],
  [-0.26, 0.09],
];

export function createBirds(options: BirdsOptions): CanvasSource {
  const canvas = document.createElement("canvas");
  const w = Math.max(2, Math.round(options.width));
  const h = Math.max(2, Math.round(options.height));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(options.seed);
  const count = Math.max(1, Math.round(options.count ?? 8));
  const unit = Math.min(w, h);

  // A skein strung out along a diagonal, climbing to the right, with the near
  // birds low and left and the far ones high and right — which is the order
  // that makes the line of them read as going away.
  // Fixed anchors rather than a scattered line: at eight birds in a box this
  // small, random placement puts two of them on top of each other and the pair
  // comes back from the shader as one lump. The first three are the near ones.
  const ANCHOR: [number, number, number][] = [
    // u, v, how near (1 = front)
    [0.2, 0.68, 1],
    [0.45, 0.52, 0.72],
    [0.13, 0.36, 0.46],
    [0.66, 0.62, 0.16],
    [0.58, 0.3, 0.1],
    [0.8, 0.42, 0.2],
    [0.36, 0.16, 0.06],
    [0.86, 0.16, 0.12],
    [0.72, 0.78, 0.08],
  ];
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    const a = ANCHOR[i % ANCHOR.length];
    const wrap = Math.floor(i / ANCHOR.length);
    const near = a[2];
    birds.push({
      cx: (a[0] + (rng() - 0.5) * 0.05 + wrap * 0.04) * w,
      cy: (a[1] + (rng() - 0.5) * 0.05 - wrap * 0.06) * h,
      orbitX: w * (0.02 + rng() * 0.035),
      orbitY: h * (0.015 + rng() * 0.03),
      orbitPeriod: 12 + rng() * 10,
      orbitPhase: rng() * TAU,
      heading: -0.3 - rng() * 0.4,
      span: unit * (0.058 + 0.105 * near + rng() * 0.022),
      flaps: 2 + rng() * 1.1,
      flapPhase: rng() * TAU,
      // Two of them are coasting with their wings out: a flock where every
      // bird beats in the same way is a pattern, not a flock.
      glide: rng() < 0.28 ? 0.7 + rng() * 0.3 : 0,
      grey: 92 + 128 * near + rng() * 18,
    });
  }
  // Far and faint first, so a near bird crossing one is drawn over it.
  birds.sort((a, b) => a.grey - b.grey);

  const drawBird = (b: Bird, t: number) => {
    if (!ctx) return;
    const orb = (TAU * t) / b.orbitPeriod + b.orbitPhase;
    const x = b.cx + b.orbitX * Math.cos(orb);
    const raw = Math.sin(TAU * b.flaps * t + b.flapPhase);
    // Downstroke is quick, upstroke slower: sharpen one half of the wave.
    const s = (raw >= 0 ? Math.pow(raw, 0.7) : -Math.pow(-raw, 1.4)) * (1 - b.glide);
    const wingAngle = -0.55 + 1.5 * ((s + 1) / 2) - b.glide * 0.18;
    const y = b.cy + b.orbitY * Math.sin(orb) + b.span * 0.03 * s;
    const L = b.span * 0.5;
    const g = Math.round(b.grey);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.heading);

    // Wings: fold the flat outline by the flap angle. Spread wings reach out
    // sideways; raised or dropped wings pull in and sweep back a little.
    const cosA = Math.cos(wingAngle);
    const sinA = Math.sin(wingAngle);
    const wg = Math.round(Math.max(8, g - 26));
    ctx.fillStyle = `rgb(${wg},${wg},${wg})`;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      WING.forEach(([fx, fy], i) => {
        const px = (fx - 0.34 * fy * Math.abs(sinA)) * L + L * 0.08;
        const py = side * fy * cosA * L;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    }

    // Body, head, beak, tail.
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.46, L * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(L * 0.44, -L * 0.02, L * 0.13, L * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(L * 0.54, -L * 0.035);
    ctx.lineTo(L * 0.72, L * 0.01);
    ctx.lineTo(L * 0.54, L * 0.045);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-L * 0.36, 0);
    ctx.lineTo(-L * 0.72, -L * 0.13);
    ctx.lineTo(-L * 0.6, 0);
    ctx.lineTo(-L * 0.72, L * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const draw = (t: number) => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (const b of birds) drawBird(b, t);
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
