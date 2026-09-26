// The one built thing in the landscape, where the reference had hay stacks: a
// small log hut on the valley floor, seen from the front-left, with a fence
// running away from it, a bare tree beside it and smoke going up from the
// chimney.
//
// ---------------------------------------------------------------------------
// How big it actually is, and what that allows
// ---------------------------------------------------------------------------
// The layer's box is 14% x 12% of the hero canvas — about 202 x 216 CSS px on
// a 1440 screen — sampled on the default 100 x 100 grid. So one cell is barely
// two pixels wide and the widest bar it can draw is two pixels. The hut is, in
// effect, a hundred-pixel drawing.
//
// The catch is the shader's neighbour test: it drops any cell within TWO
// TEXELS of black. Drawn at the box's own size that is two and a half CELLS,
// so anything thinner than five cells — a window bar, a fence post, a chimney
// — gets eaten by the black around it and never draws at all. The fix is to
// paint at twice the box size and let the shader sample down. u_texSize
// follows the canvas, so two texels then cover half a cell instead of two and
// a half, and detail at the scale of a window survives.
//
// ---------------------------------------------------------------------------
// The greys are upside down from how the hut looks
// ---------------------------------------------------------------------------
// This layer is graded blackPoint 25 / whitePoint 200 the normal way up, and
// tweens to 75 / 150 on scroll. A DARK grey draws a WIDE bar and reads BRIGHT
// on the page. So:
//   * 145 and over is invisible once the page has scrolled; 190 and over is
//     invisible from the start. That is how the ground and the eaves' shadow
//     are drawn — by going pale.
//   * 75 and under is the widest bar under either grade. That is the roof, the
//     chimney and the lit window, which are the things meant to carry.
//   * 90..140 is the middle: the walls, the stones, the smoke.
// Nothing separates two parts of the hut with black — black would eat half a
// cell either side of it. Parts are separated by a change of grey instead.

import type { CanvasSource } from "../barShader";
import { makeRng, valueNoise2 } from "./noise";

type HutOptions = { seed: number; width: number; height: number };

// Paint at twice the box size: see the note above about the neighbour test.
const SS = 2;
// The smoke is the only thing that moves, and it moves slowly. Redrawing it
// ten times a second is plenty, and update() returns false the rest of the
// time so the engine skips the texture upload.
const SMOKE_FPS = 10;
const SMOKE_PERIOD = 11;
const PUFFS = 6;

const ROOF = 40;
const ROOF_LINE = 96;
const WALL = 122;
const WALL_SIDE = 158;
const LOG = 96;
const LOG_SIDE = 132;
const WINDOW = 22;
const WINDOW_FRAME = 172;
const WINDOW_SIDE = 92;
const DOOR = 78;
const STONE = 110;
const CHIMNEY = 52;
const FENCE = 106;
const POST = 74;
const TREE = 100;
const GROUND = 178;

function g(v: number): string {
  const c = Math.round(v < 8 ? 8 : v > 255 ? 255 : v);
  return `rgb(${c},${c},${c})`;
}

export function createHutSilhouette(options: HutOptions): CanvasSource {
  const w = Math.max(2, Math.round(options.width)) * SS;
  const h = Math.max(2, Math.round(options.height)) * SS;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // The hut, the fence and the tree never change, so they are drawn once and
  // stamped back under the smoke on every frame.
  const still = document.createElement("canvas");
  still.width = w;
  still.height = h;
  const sctx = still.getContext("2d");
  if (sctx) paintStill(sctx, w, h, options.seed);

  const X = (u: number) => u * w;
  const Y = (v: number) => v * h;
  const smokeX = X(0.784);
  const smokeY = Y(0.283);

  let lastFrame = -1;
  const draw = (frame: number) => {
    if (!ctx || !sctx) return;
    const t = frame / SMOKE_FPS;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(still, 0, 0);
    // Six puffs on one loop, each a third of a turn behind the last, so the
    // column is continuous however long the page has been open. Position is a
    // function of t alone: pause and resume and the smoke is where it should
    // be.
    for (let i = 0; i < PUFFS; i++) {
      const u = ((t / SMOKE_PERIOD + i / PUFFS) % 1 + 1) % 1;
      const rise = Y(0.29) * (0.08 + 1.05 * u);
      const px = smokeX + Y(0.12) * u * u * 1.5 + Y(0.03) * Math.sin(u * 7 + i * 1.9);
      const py = smokeY - rise;
      if (py < -Y(0.05)) continue;
      const r = Y(0.026) * (1 + 2.6 * u);
      // Thinning out as it climbs: the grade reads a paler grey as a thinner
      // bar, so a puff that goes pale is a puff that fades.
      const tone = 112 + 86 * u;
      const fade = Math.min(1, u * 9);
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, g(tone));
      grad.addColorStop(0.6, g(tone + 22));
      grad.addColorStop(1, g(tone + 58));
      ctx.globalAlpha = fade;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  draw(0);
  return {
    canvas,
    animated: true,
    ready: Promise.resolve(),
    update: (t) => {
      const frame = Math.round(t * SMOKE_FPS);
      if (frame === lastFrame) return false;
      lastFrame = frame;
      draw(frame);
      return true;
    },
    dispose: () => {
      canvas.width = 1;
      canvas.height = 1;
      still.width = 1;
      still.height = 1;
    },
  };
}

function paintStill(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const rng = makeRng(seed);
  const X = (u: number) => u * w;
  const Y = (v: number) => v * h;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  // The hut takes the right half of the box and stands on the bottom edge,
  // because that is where the valley floor in the mountains layer reaches
  // under it. The left half is the ground in front of it: a fence going away,
  // and one bare tree.
  const ground = 0.94;
  const frontL = 0.36;
  const frontR = 0.655;
  const eave = 0.635;
  const peakX = (frontL + frontR) / 2;
  const peakY = 0.4;
  const backR = 0.9;
  const backEave = 0.675;
  const backGround = 0.905;
  const baseTop = 0.885;

  // --- the ground it stands on -------------------------------------------
  // Pale, so it is all but invisible: the valley floor behind it is drawn by
  // the mountains layer and this is only here to stop the hut ending on air.
  ctx.fillStyle = g(GROUND);
  ctx.beginPath();
  ctx.moveTo(0, Y(0.965));
  ctx.lineTo(w, Y(0.925));
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // --- a bare tree at the far left ---------------------------------------
  // A trunk and six limbs. Nothing finer survives the sampling, and six limbs
  // is enough to say tree rather than post.
  const treeX = 0.135;
  ctx.strokeStyle = g(TREE);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, w * 0.018);
  ctx.beginPath();
  ctx.moveTo(X(treeX), Y(0.925));
  ctx.quadraticCurveTo(X(treeX - 0.014), Y(0.78), X(treeX + 0.01), Y(0.66));
  ctx.stroke();
  ctx.lineWidth = Math.max(2, w * 0.012);
  const limbs: [number, number, number][] = [
    [0.755, -0.075, 0.66],
    [0.73, 0.07, 0.635],
    [0.69, -0.055, 0.6],
    [0.675, 0.065, 0.585],
    [0.66, -0.03, 0.555],
    [0.66, 0.035, 0.56],
  ];
  for (const [from, dx, to] of limbs) {
    ctx.beginPath();
    ctx.moveTo(X(treeX), Y(from));
    ctx.quadraticCurveTo(X(treeX + dx * 0.55), Y((from + to) * 0.5), X(treeX + dx), Y(to));
    ctx.stroke();
  }

  // --- the fence, running from the tree to the hut -----------------------
  const railTop = 0.795;
  ctx.fillStyle = g(FENCE);
  ctx.beginPath();
  ctx.moveTo(X(0.015), Y(railTop + 0.035));
  ctx.lineTo(X(frontL), Y(railTop - 0.015));
  ctx.lineTo(X(frontL), Y(railTop + 0.013));
  ctx.lineTo(X(0.015), Y(railTop + 0.068));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = g(POST);
  for (let i = 0; i < 6; i++) {
    const u = 0.04 + i * 0.056;
    const v = railTop + 0.035 - (u - 0.015) * 0.145;
    ctx.fillRect(X(u), Y(v - 0.012), Math.max(2, w * 0.017), Y(0.085));
  }

  // --- side wall (receding to the right) ---------------------------------
  // It faces away from the light, and on this grade "darker on the page"
  // means PALER here, so its grey is the highest number on the hut.
  ctx.fillStyle = g(WALL_SIDE);
  ctx.beginPath();
  ctx.moveTo(X(frontR), Y(eave));
  ctx.lineTo(X(backR), Y(backEave));
  ctx.lineTo(X(backR), Y(backGround));
  ctx.lineTo(X(frontR), Y(ground));
  ctx.closePath();
  ctx.fill();
  const courses = 5;
  ctx.strokeStyle = g(LOG_SIDE);
  ctx.lineWidth = Math.max(2, h * 0.008);
  for (let i = 1; i < courses; i++) {
    const f = i / courses;
    ctx.beginPath();
    ctx.moveTo(X(frontR), Y(eave + (ground - eave) * f));
    ctx.lineTo(X(backR), Y(backEave + (backGround - backEave) * f));
    ctx.stroke();
  }
  // Side window, skewed with the wall.
  ctx.fillStyle = g(WINDOW_SIDE);
  ctx.beginPath();
  ctx.moveTo(X(0.725), Y(0.725));
  ctx.lineTo(X(0.795), Y(0.74));
  ctx.lineTo(X(0.795), Y(0.815));
  ctx.lineTo(X(0.725), Y(0.805));
  ctx.closePath();
  ctx.fill();

  // --- front wall (the gable end) ----------------------------------------
  ctx.fillStyle = g(WALL);
  ctx.fillRect(X(frontL), Y(eave), X(frontR) - X(frontL), Y(ground) - Y(eave));
  ctx.strokeStyle = g(LOG);
  ctx.lineWidth = Math.max(2, h * 0.009);
  for (let i = 1; i < courses; i++) {
    const y = Y(eave + (ground - eave) * (i / courses));
    ctx.beginPath();
    ctx.moveTo(X(frontL), y);
    ctx.lineTo(X(frontR), y);
    ctx.stroke();
  }

  // --- stone base --------------------------------------------------------
  ctx.fillStyle = g(STONE);
  ctx.beginPath();
  ctx.moveTo(X(frontL - 0.006), Y(baseTop));
  ctx.lineTo(X(frontR), Y(baseTop));
  ctx.lineTo(X(backR + 0.004), Y(baseTop - (ground - backGround) * 0.9));
  ctx.lineTo(X(backR + 0.004), Y(backGround + 0.004));
  ctx.lineTo(X(frontR), Y(ground + 0.004));
  ctx.lineTo(X(frontL - 0.006), Y(ground + 0.004));
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const u = frontL + rng() * (frontR - frontL);
    const v = baseTop + rng() * (ground - baseTop);
    const r = h * (0.009 + rng() * 0.011);
    ctx.fillStyle = g(STONE + (rng() - 0.5) * 44);
    ctx.beginPath();
    ctx.ellipse(X(u), Y(v), r * 1.5, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- door and the lit window -------------------------------------------
  ctx.fillStyle = g(DOOR);
  ctx.fillRect(X(0.55), Y(0.745), X(0.625) - X(0.55), Y(ground) - Y(0.745));
  // A pale surround, which on this grade draws no bar at all, so the window
  // is cut out of the wall by a dark ring instead of by black — black would
  // take half a cell of the wall with it.
  ctx.fillStyle = g(WINDOW_FRAME);
  ctx.fillRect(X(0.386), Y(0.695), X(0.49) - X(0.386), Y(0.8) - Y(0.695));
  // The window is the brightest thing in the box on purpose: it is the only
  // light in the valley that is not the sky or the water.
  ctx.fillStyle = g(WINDOW);
  ctx.fillRect(X(0.4), Y(0.709), X(0.476) - X(0.4), Y(0.786) - Y(0.709));
  ctx.fillStyle = g(WINDOW_FRAME);
  ctx.fillRect(X(0.4355), Y(0.709), Math.max(2, w * 0.009), Y(0.786) - Y(0.709));
  ctx.fillRect(X(0.4), Y(0.7435), X(0.476) - X(0.4), Math.max(2, h * 0.009));
  // The light falling out of it onto the wall below.
  ctx.fillStyle = g(WALL - 26);
  ctx.beginPath();
  ctx.moveTo(X(0.386), Y(0.8));
  ctx.lineTo(X(0.49), Y(0.8));
  ctx.lineTo(X(0.515), Y(0.865));
  ctx.lineTo(X(0.362), Y(0.865));
  ctx.closePath();
  ctx.fill();

  // --- chimney (behind the roof, so it goes down first) -------------------
  ctx.fillStyle = g(CHIMNEY);
  ctx.fillRect(X(0.755), Y(0.305), X(0.812) - X(0.755), Y(0.56) - Y(0.305));
  ctx.fillStyle = g(CHIMNEY - 16);
  ctx.fillRect(X(0.742), Y(0.285), X(0.825) - X(0.742), Y(0.318) - Y(0.285));

  // --- roof ---------------------------------------------------------------
  // Two planes, and they have to separate: the one facing us takes the light
  // and is the widest bar on the hut, the one going away is a couple of
  // shades back so the ridge between them reads.
  const overhang = 0.035;
  ctx.fillStyle = g(ROOF + 18);
  ctx.beginPath();
  ctx.moveTo(X(peakX), Y(peakY));
  ctx.lineTo(X(backR - 0.02), Y(peakY + (backEave - eave) * 0.9));
  ctx.lineTo(X(backR + 0.022), Y(backEave + 0.016));
  ctx.lineTo(X(frontR + overhang), Y(eave + 0.022));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = g(ROOF_LINE + 26);
  ctx.lineWidth = Math.max(2, h * 0.007);
  for (let i = 1; i < 4; i++) {
    const f = i / 4;
    const ax = peakX + (frontR + overhang - peakX) * f;
    const ay = peakY + (eave + 0.022 - peakY) * f;
    const bx = backR - 0.02 + 0.042 * f;
    const by = peakY + (backEave - eave) * 0.9 + (backEave + 0.016 - peakY - (backEave - eave) * 0.9) * f;
    ctx.beginPath();
    ctx.moveTo(X(ax), Y(ay));
    ctx.lineTo(X(bx), Y(by));
    ctx.stroke();
  }
  // Gable wall under the roof: the same logs as the front, a shade back.
  ctx.fillStyle = g(WALL + 12);
  ctx.beginPath();
  ctx.moveTo(X(frontL), Y(eave + 0.001));
  ctx.lineTo(X(peakX), Y(peakY + 0.042));
  ctx.lineTo(X(frontR), Y(eave + 0.001));
  ctx.closePath();
  ctx.fill();
  // The near roof plane: a chevron of shingles over the gable.
  ctx.fillStyle = g(ROOF);
  ctx.beginPath();
  ctx.moveTo(X(frontL - overhang), Y(eave + 0.02));
  ctx.lineTo(X(peakX), Y(peakY - 0.014));
  ctx.lineTo(X(frontR + overhang), Y(eave + 0.02));
  ctx.lineTo(X(frontR + overhang), Y(eave + 0.058));
  ctx.lineTo(X(peakX), Y(peakY + 0.024));
  ctx.lineTo(X(frontL - overhang), Y(eave + 0.058));
  ctx.closePath();
  ctx.fill();

  // Grain: the bar shader turns flat grey into an even comb; a little noise on
  // every painted pixel makes the walls and roof read as texture instead.
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = data[o];
      if (v === 0) continue;
      const n =
        // Small on purpose. One cell here is two pixels wide, so a bar is
        // either nothing, one pixel or two: the whole hut has three levels to
        // work in, and grain any stronger than this knocks a wall's pixel up
        // to the roof's two and the roof stops being a roof.
        (valueNoise2(x * 0.16, y * 0.16, seed) - 0.5) * 11 +
        (valueNoise2(x * 0.7, y * 0.7, seed + 1) - 0.5) * 5;
      const nv = Math.max(8, Math.min(255, v + n));
      data[o] = nv;
      data[o + 1] = nv;
      data[o + 2] = nv;
    }
  }
  ctx.putImageData(img, 0, 0);
}
