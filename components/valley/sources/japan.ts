// The built things in the landscape: a torii, a stone lantern and a pagoda,
// drawn as flat silhouettes for the bar shader.
//
// WHY THESE THREE. The scene is a cherry valley at dusk, and the vocabulary
// it was carrying — a log shack, a flock of sheep, a poppy — is alpine
// European, which is where the reference's own photographs were taken. These
// are the three shapes that read as Japan at a hundred pixels and from a
// distance, in that order: the torii is unmistakable from its proportions
// alone (two uprights, a curved top rail overhanging them, a straight one
// under it); the stone lantern is a stack of four blocks with a flared cap;
// the pagoda is nothing but its eaves, each one wider than the roof above it
// and turned up at the corners. Everything else in the set — a bell, a
// bridge, a gateway — needs detail this grid cannot hold.
//
// ---------------------------------------------------------------------------
// How big they are, and what that allows
// ---------------------------------------------------------------------------
// A layer's box here is between 8% and 16% of a canvas 1440 px wide, sampled
// on a 100 x 100 grid, so one cell is two or three pixels and the widest bar
// it can draw is the same. These are hundred-pixel drawings.
//
// The catch is the shader's neighbour test: it drops any cell within TWO
// TEXELS of black. Drawn at the box's own size that is two and a half CELLS,
// so anything thinner than five cells — an upright, a lantern's window, the
// gap under an eave — is eaten by the black around it and never draws. Each
// is painted at SS times the box and sampled down, which puts two texels at
// half a cell instead of two and a half.
//
// ---------------------------------------------------------------------------
// The greys are upside down from how the things look
// ---------------------------------------------------------------------------
// These layers are graded blackPoint 25 / whitePoint 200 the normal way up,
// tweening to 75 / 150 on scroll. A DARK grey draws a WIDE bar and reads
// BRIGHT on the page. So 60 and under is what carries, 90 to 140 is the
// middle, and 170 and over has gone. Nothing is separated from anything else
// by black — black eats half a cell either side of it — so parts are told
// apart by a change of grey.

import type { CanvasSource } from "../barShader";
import { makeRng } from "./noise";

type Options = { seed: number; width: number; height: number };

/** Painted at this multiple of the box; see the note on the neighbour test. */
const SS = 2;

/** The ladder every drawing here is built from. */
const DARKEST = 34; // the thing itself, at its heaviest
const HEAVY = 58; // structure
const MID = 96; // the body of a stone or a post
const LIGHT = 134; // a turned face, a shadowed side
const GROUND = 186;

function g(v: number): string {
  const c = Math.round(v < 8 ? 8 : v > 255 ? 255 : v);
  return `rgb(${c},${c},${c})`;
}

/** A still drawing: painted once, never updated. */
function still(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): CanvasSource {
  const canvas = document.createElement("canvas");
  const w = Math.max(2, Math.round(width)) * SS;
  const h = Math.max(2, Math.round(height)) * SS;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    paint(ctx, w, h);
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

/**
 * A torii. Two uprights leaning very slightly inward, a straight tie beam
 * (nuki) through them, and over it the kasagi — the top rail, which
 * overhangs the uprights at both ends and curves UP toward the tips. That
 * upward curve is the whole silhouette: a straight top rail reads as a
 * goalpost.
 */
export function createTorii(options: Options): CanvasSource {
  return still(options.width, options.height, (ctx, w, h) => {
    const rng = makeRng(options.seed);
    const baseY = h * 0.94;
    const topY = h * 0.1;
    const span = w * 0.72;
    const lean = w * 0.018; // uprights closer together at the top
    const legW = w * 0.075;
    const lx = (w - span) / 2;
    const rx = lx + span;

    // Ground under it: pale, so the grade drops it and the gate stands on
    // nothing rather than on a bar.
    ctx.fillStyle = g(GROUND);
    ctx.fillRect(0, baseY, w, h - baseY);

    // The two uprights.
    ctx.fillStyle = g(DARKEST);
    for (const [x, dir] of [
      [lx, 1],
      [rx, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x - legW / 2, baseY);
      ctx.lineTo(x - legW / 2 + dir * lean, topY + h * 0.06);
      ctx.lineTo(x + legW / 2 + dir * lean, topY + h * 0.06);
      ctx.lineTo(x + legW / 2, baseY);
      ctx.closePath();
      ctx.fill();
    }

    // The tie beam, straight, a little under the top rail and inside it.
    const nukiY = topY + h * 0.2;
    ctx.fillStyle = g(HEAVY);
    ctx.fillRect(lx - w * 0.03, nukiY, span + w * 0.06, h * 0.055);

    // The top rail. Two curves with the same tangent at the ends, so it
    // reads as one beam sagging in the middle and lifting at the tips.
    const overhang = w * 0.11;
    const lift = h * 0.055;
    const railT = h * 0.062;
    ctx.fillStyle = g(DARKEST);
    ctx.beginPath();
    ctx.moveTo(lx - overhang, topY + lift);
    ctx.quadraticCurveTo(w / 2, topY - lift * 0.5, rx + overhang, topY + lift);
    ctx.lineTo(rx + overhang, topY + lift + railT);
    ctx.quadraticCurveTo(
      w / 2,
      topY - lift * 0.5 + railT,
      lx - overhang,
      topY + lift + railT,
    );
    ctx.closePath();
    ctx.fill();

    // The little post between the two rails (gakuzuka).
    ctx.fillStyle = g(HEAVY);
    ctx.fillRect(w / 2 - w * 0.02, topY + lift + railT, w * 0.04, nukiY - topY - lift - railT);

    // A couple of stones at the feet, so the uprights meet the ground in
    // something rather than stopping.
    ctx.fillStyle = g(MID);
    for (const x of [lx, rx]) {
      const r = legW * (0.9 + rng() * 0.3);
      ctx.beginPath();
      ctx.ellipse(x, baseY, r, r * 0.42, 0, Math.PI, 0);
      ctx.fill();
    }
  });
}

/**
 * A stone lantern (tōrō): a buried foot, a shaft, a middle stone, the
 * firebox with two lit windows, a flared roof with the corners turned up,
 * and a knob on top. The lit windows are the one thing in it drawn DARK
 * enough to be the widest bar on the layer, because a lantern that is not
 * lit is a post.
 */
export function createLantern(options: Options): CanvasSource {
  return still(options.width, options.height, (ctx, w, h) => {
    const cx = w / 2;
    const baseY = h * 0.95;

    ctx.fillStyle = g(GROUND);
    ctx.fillRect(0, baseY, w, h - baseY);

    // Foot and shaft.
    ctx.fillStyle = g(MID);
    ctx.fillRect(cx - w * 0.19, baseY - h * 0.07, w * 0.38, h * 0.07);
    ctx.fillRect(cx - w * 0.085, baseY - h * 0.36, w * 0.17, h * 0.3);
    // Middle stone.
    ctx.fillStyle = g(HEAVY);
    ctx.fillRect(cx - w * 0.17, baseY - h * 0.43, w * 0.34, h * 0.075);

    // Firebox.
    const fbY = baseY - h * 0.62;
    const fbH = h * 0.19;
    ctx.fillStyle = g(LIGHT);
    ctx.fillRect(cx - w * 0.21, fbY, w * 0.42, fbH);
    // Its two windows: the light in the whole picture.
    ctx.fillStyle = g(DARKEST);
    ctx.fillRect(cx - w * 0.145, fbY + fbH * 0.2, w * 0.1, fbH * 0.55);
    ctx.fillRect(cx + w * 0.045, fbY + fbH * 0.2, w * 0.1, fbH * 0.55);

    // Roof: a flat-ish pyramid whose corners lift. Drawn as one path so the
    // eave line is continuous.
    const rY = fbY;
    const rW = w * 0.46;
    ctx.fillStyle = g(HEAVY);
    ctx.beginPath();
    ctx.moveTo(cx - rW, rY);
    ctx.quadraticCurveTo(cx - rW * 0.55, rY - h * 0.03, cx - rW * 0.2, rY - h * 0.1);
    ctx.lineTo(cx + rW * 0.2, rY - h * 0.1);
    ctx.quadraticCurveTo(cx + rW * 0.55, rY - h * 0.03, cx + rW, rY);
    ctx.lineTo(cx + rW * 0.82, rY + h * 0.022);
    ctx.lineTo(cx - rW * 0.82, rY + h * 0.022);
    ctx.closePath();
    ctx.fill();

    // The knob.
    ctx.fillStyle = g(MID);
    ctx.beginPath();
    ctx.arc(cx, rY - h * 0.115, w * 0.05, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * A pagoda. Five storeys, and the drawing is ALL eaves: each roof is wider
 * than the one over it, overhangs its own storey by a long way and turns up
 * at the corners, and the walls between them are narrow and pale. Get the
 * eaves right and nothing else is needed; get them straight and it is a
 * stack of boxes.
 */
export function createPagoda(options: Options): CanvasSource {
  return still(options.width, options.height, (ctx, w, h) => {
    const cx = w / 2;
    const baseY = h * 0.95;
    const storeys = 5;
    const bodyH = h * 0.74;
    const step = bodyH / storeys;

    ctx.fillStyle = g(GROUND);
    ctx.fillRect(0, baseY, w, h - baseY);

    for (let i = 0; i < storeys; i += 1) {
      // 0 at the bottom. Each storey is a little narrower and shorter.
      const t = i / (storeys - 1);
      const roofW = w * (0.46 - 0.16 * t);
      const wallW = roofW * 0.56;
      const eaveY = baseY - step * (i + 1);
      const wallTop = eaveY;
      const wallBot = baseY - step * i;

      // The wall: pale, so the grade nearly loses it and the eaves carry.
      ctx.fillStyle = g(LIGHT);
      ctx.fillRect(cx - wallW / 2, wallTop, wallW, wallBot - wallTop);
      // A dark line of balcony under each eave, which is what gives the
      // storeys their separation without using black.
      ctx.fillStyle = g(MID);
      ctx.fillRect(cx - roofW * 0.72, wallTop + h * 0.006, roofW * 1.44, h * 0.012);

      // The eave. Corners lifted, and drawn as one path per roof.
      ctx.fillStyle = g(DARKEST);
      ctx.beginPath();
      ctx.moveTo(cx - roofW, eaveY + h * 0.012);
      ctx.quadraticCurveTo(cx - roofW * 0.62, eaveY - h * 0.004, cx - roofW * 0.22, eaveY - h * 0.042);
      ctx.lineTo(cx + roofW * 0.22, eaveY - h * 0.042);
      ctx.quadraticCurveTo(cx + roofW * 0.62, eaveY - h * 0.004, cx + roofW, eaveY + h * 0.012);
      ctx.lineTo(cx + roofW * 0.86, eaveY + h * 0.034);
      ctx.lineTo(cx - roofW * 0.86, eaveY + h * 0.034);
      ctx.closePath();
      ctx.fill();
    }

    // The mast (sōrin) over the top roof, with its rings.
    const topY = baseY - bodyH;
    ctx.fillStyle = g(HEAVY);
    ctx.fillRect(cx - w * 0.012, topY - h * 0.17, w * 0.024, h * 0.17);
    ctx.fillStyle = g(MID);
    for (let i = 0; i < 5; i += 1) {
      const ry = topY - h * 0.03 - i * h * 0.026;
      const rw = w * (0.05 - i * 0.006);
      ctx.fillRect(cx - rw, ry, rw * 2, h * 0.009);
    }
    ctx.fillStyle = g(DARKEST);
    ctx.beginPath();
    ctx.arc(cx, topY - h * 0.178, w * 0.022, 0, Math.PI * 2);
    ctx.fill();
  });
}
