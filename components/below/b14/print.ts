/**
 * Prints a face onto a canvas: pale blossom paper with fibres in it, then
 * everything sheet.ts laid out, in plum ink. Pictures are small scenes
 * drawn here in grey and put through the site's halftone painter
 * (components/halftone.ts), so they print as plum dots like a newspaper
 * photograph. The shrine pieces come from the valley's own drawings.
 */
import { createDotPainter, type DotGrid, dotRamp, sampleLuminance } from "@/components/halftone";
import { skillIcon } from "@/components/skillIcons";
import { createLantern, createPagoda, createTorii } from "@/components/valley/sources/japan";
import { fbm1, makeRng } from "@/components/valley/sources/noise";
import { TEX_H, TEX_W } from "./layout";
import type { Font, MeasureFont, Printed, Run, SceneKey } from "./sheet";

export type Fonts = { serif: string; sans: string; mono: string };

export const INK = "#2a0d1e";
export const PAPER = "#fde7f3";
const SOFT = "rgba(42, 13, 30, 0.66)";
/** Halftone cell in canvas px. About a third of a millimetre on screen. */
const CELL = 8;

export type Printer = {
  measure: MeasureFont;
  /** Paper with nothing printed on it. Shared, drawn once. */
  paper: HTMLCanvasElement;
  print(canvas: HTMLCanvasElement, printed: Printed): void;
  dispose(): void;
};

function fontString(fonts: Fonts, f: Font): string {
  const family = f.face === "serif" ? fonts.serif : f.face === "mono" ? fonts.mono : fonts.sans;
  return `${f.italic ? "italic " : ""}${f.weight} ${f.size}px ${family}`;
}

/** Paper: the pale blossom ground, faint clouding, and short fibres in two tints. Seeded, so every visit prints the same sheet. */
function makePaper(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const rng = makeRng(1407);
  // Clouding: paper is never one flat colour.
  for (let i = 0; i < 26; i += 1) {
    const x = rng() * TEX_W;
    const y = rng() * TEX_H;
    const r = 120 + rng() * 320;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rng() > 0.5;
    g.addColorStop(0, light ? "rgba(255,255,255,0.22)" : "rgba(249,185,220,0.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fibres: short bent strokes, most darker than the paper, some lighter.
  ctx.lineCap = "round";
  for (let i = 0; i < 3400; i += 1) {
    const x = rng() * TEX_W;
    const y = rng() * TEX_H;
    const len = 5 + rng() * 22;
    const a = rng() * Math.PI * 2;
    const bend = (rng() - 0.5) * len * 0.6;
    const dark = rng() < 0.7;
    ctx.strokeStyle = dark ? `rgba(120, 50, 90, ${(0.05 + rng() * 0.07).toFixed(3)})` : `rgba(255, 255, 255, ${(0.35 + rng() * 0.35).toFixed(3)})`;
    ctx.lineWidth = 0.5 + rng() * 0.9;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(a) * bend, (y + ey) / 2 + Math.cos(a) * bend, ex, ey);
    ctx.stroke();
  }
  // Specks.
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = `rgba(90, 30, 60, ${(0.04 + rng() * 0.08).toFixed(3)})`;
    ctx.fillRect(rng() * TEX_W, rng() * TEX_H, 1 + rng(), 1 + rng());
  }
  return canvas;
}

// ------------------------------------------------------------ pictures
// Each scene is drawn in white on nothing. How opaque a pixel is says how
// much ink goes there: the halftone makes a bigger dot for more ink.

const ink = (a: number): string => `rgba(255,255,255,${a.toFixed(3)})`;

/** Sky, a sun and two rows of hills, filling the picture. */
function land(ctx: CanvasRenderingContext2D, W: number, H: number, seed: number, horizon = 0.62): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H * horizon);
  sky.addColorStop(0, ink(0.2));
  sky.addColorStop(1, ink(0.03));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // The sun, cut out of the sky and ringed.
  const sx = W * 0.76;
  const sy = H * 0.3;
  const sr = Math.min(W, H) * 0.11;
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(sx, sy, sr * 1.25, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fillStyle = ink(0.16);
  ctx.fill();
  const ridge = (base: number, amp: number, a: number, s: number): void => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) {
      ctx.lineTo(x, H * (base - amp * fbm1((x / W) * 3.2, 4, s)));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = ink(a);
    ctx.fill();
  };
  ridge(horizon, 0.22, 0.3, seed);
  ridge(horizon + 0.14, 0.16, 0.52, seed + 3);
}

/** A design space of 160 by 100, centred and scaled to fit the picture. */
function frame(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const s = Math.min(W / 160, H / 100);
  ctx.setTransform(s, 0, 0, s, (W - 160 * s) / 2, (H - 100 * s) / 2);
}

function drawCoach(ctx: CanvasRenderingContext2D): void {
  // A microphone on a stand, and the sound going out from it.
  ctx.fillStyle = ink(0.92);
  ctx.fillRect(78.8, 44, 2.4, 44);
  ctx.beginPath();
  ctx.ellipse(80, 89, 17, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = ink(0.85);
  ctx.beginPath();
  ctx.arc(80, 30, 11, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(72, 8, 16, 34, 8);
  ctx.fillStyle = ink(0.95);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let y = 13; y < 38; y += 3.2) ctx.fillRect(73.5, y, 13, 1.1);
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    ctx.strokeStyle = ink(0.6 - i * 0.12);
    ctx.lineWidth = 1.8;
    const r = 18 + i * 9;
    ctx.beginPath();
    ctx.arc(80, 25, r, -0.28 * Math.PI, 0.28 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(80, 25, r, 0.72 * Math.PI, 1.28 * Math.PI);
    ctx.stroke();
  }
}

function drawBlaster(ctx: CanvasRenderingContext2D): void {
  // A sight behind, and the blaster side on, pointing into it.
  ctx.strokeStyle = ink(0.34);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(112, 44, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(112, 44, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(112, 10);
  ctx.lineTo(112, 78);
  ctx.moveTo(78, 44);
  ctx.lineTo(146, 44);
  ctx.stroke();
  ctx.fillStyle = ink(0.95);
  // Body.
  ctx.beginPath();
  ctx.moveTo(22, 40);
  ctx.lineTo(84, 38);
  ctx.lineTo(90, 44);
  ctx.lineTo(90, 52);
  ctx.lineTo(56, 54);
  ctx.lineTo(24, 56);
  ctx.closePath();
  ctx.fill();
  // Barrel.
  ctx.fillRect(84, 41, 30, 7);
  // Grip.
  ctx.beginPath();
  ctx.moveTo(40, 54);
  ctx.lineTo(52, 54);
  ctx.lineTo(46, 80);
  ctx.lineTo(33, 79);
  ctx.closePath();
  ctx.fill();
  // Trigger guard.
  ctx.strokeStyle = ink(0.9);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(59, 58, 6, 0, Math.PI);
  ctx.stroke();
  // Stripes on the body, lighter.
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let x = 30; x < 80; x += 7) ctx.fillRect(x, 43, 3, 8);
  ctx.globalCompositeOperation = "source-over";
  // Motion lines off the back.
  ctx.strokeStyle = ink(0.45);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(4 + i * 3, 42 + i * 6);
    ctx.lineTo(16 + i * 2, 42 + i * 6);
    ctx.stroke();
  }
}

function drawRing(ctx: CanvasRenderingContext2D): void {
  // A boxing ring in perspective, and a phone swung above it.
  const fl = [30, 80];
  const fr = [130, 80];
  const br = [114, 56];
  const bl = [46, 56];
  ctx.fillStyle = ink(0.34);
  ctx.beginPath();
  ctx.moveTo(fl[0], fl[1]);
  ctx.lineTo(fr[0], fr[1]);
  ctx.lineTo(br[0], br[1]);
  ctx.lineTo(bl[0], bl[1]);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ink(0.75);
  ctx.fillRect(30, 80, 100, 8);
  const posts = [
    [bl, 20],
    [br, 20],
    [fl, 26],
    [fr, 26],
  ] as const;
  const ropes = (h: number): void => {
    const at = (p: readonly number[], t: number): [number, number] => [p[0], p[1] - h * t];
    for (const t of [0.35, 0.65, 0.95]) {
      const a = at(fl, t * (26 / 26));
      const b = at(fr, t);
      const c = at(br, t * (20 / 26));
      const d = at(bl, t * (20 / 26));
      ctx.beginPath();
      ctx.moveTo(d[0], d[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.moveTo(d[0], d[1]);
      ctx.lineTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  };
  ctx.strokeStyle = ink(0.72);
  ctx.lineWidth = 1.1;
  ropes(26);
  ctx.fillStyle = ink(0.96);
  for (const [p, h] of posts) ctx.fillRect(p[0] - 1.6, p[1] - h, 3.2, h);
  // The phone.
  ctx.save();
  ctx.translate(80, 26);
  ctx.rotate(0.38);
  ctx.beginPath();
  ctx.roundRect(-6.5, -12, 13, 24, 2.4);
  ctx.fillStyle = ink(0.96);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(-4.8, -9.5, 9.6, 18);
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = ink(0.45);
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(80, 26, 17 + i * 5, 0.85 * Math.PI, 1.25 * Math.PI);
    ctx.stroke();
  }
}

function drawRobot(ctx: CanvasRenderingContext2D): void {
  // A field seen from above: tiles, the path the robot has run, the robot.
  ctx.strokeStyle = ink(0.2);
  ctx.lineWidth = 0.8;
  for (let x = 8; x <= 152; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, 96);
    ctx.stroke();
  }
  for (let y = 4; y <= 96; y += 18.4) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(152, y);
    ctx.stroke();
  }
  const p = (t: number): [number, number] => {
    const u = 1 - t;
    return [u * u * u * 22 + 3 * u * u * t * 30 + 3 * u * t * t * 120 + t * t * t * 118, u * u * u * 84 + 3 * u * u * t * 20 + 3 * u * t * t * 84 + t * t * t * 30];
  };
  ctx.fillStyle = ink(0.7);
  for (let i = 0; i <= 26; i += 1) {
    const [x, y] = p(i / 26);
    ctx.beginPath();
    ctx.arc(x, y, i % 5 === 0 ? 1.8 : 1, 0, Math.PI * 2);
    ctx.fill();
  }
  const bot = (x: number, y: number, a: number, alpha: number): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = ink(alpha);
    ctx.fillRect(-11, -11, 22, 22);
    ctx.fillStyle = ink(Math.min(1, alpha + 0.1));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) ctx.fillRect(sx * 12 - 2.5, sy * 7 - 4, 5, 8);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-4, -5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  };
  bot(22, 84, -Math.PI / 2 + 0.2, 0.35);
  const [ex, ey] = p(1);
  const [qx, qy] = p(0.97);
  bot(ex, ey, Math.atan2(ey - qy, ex - qx), 0.95);
}

function drawSaturn(ctx: CanvasRenderingContext2D, seed: number): void {
  // A ringed planet, lit from the upper left, on a field of stars.
  const rng = makeRng(seed);
  ctx.fillStyle = ink(0.12);
  ctx.fillRect(-200, -200, 560, 500);
  for (let i = 0; i < 46; i += 1) {
    ctx.fillStyle = ink(0.35 + rng() * 0.4);
    ctx.beginPath();
    ctx.arc(rng() * 160, rng() * 100, 0.5 + rng() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  const ring = (front: boolean): void => {
    ctx.save();
    ctx.translate(82, 52);
    ctx.rotate(-0.28);
    ctx.beginPath();
    if (front) ctx.rect(-80, 0, 160, 40);
    else ctx.rect(-80, -40, 160, 40);
    ctx.clip();
    ctx.strokeStyle = ink(0.7);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 52, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = ink(0.48);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 60, 13.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
  ring(false);
  const g = ctx.createRadialGradient(72, 40, 2, 82, 52, 28);
  g.addColorStop(0, ink(0.3));
  g.addColorStop(1, ink(0.96));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(82, 52, 26, 0, Math.PI * 2);
  ctx.fill();
  ring(true);
}

/**
 * One of the valley's shrine drawings, turned into ink. Those are grey on
 * black, the darker the heavier, and black means nothing is there.
 */
function japanInk(kind: "torii" | "lantern" | "pagoda", w: number, h: number, seed: number): HTMLCanvasElement | null {
  const make = kind === "torii" ? createTorii : kind === "lantern" ? createLantern : createPagoda;
  const src = make({ seed, width: w / 2, height: h / 2 });
  const out = document.createElement("canvas");
  out.width = src.canvas.width;
  out.height = src.canvas.height;
  const sctx = src.canvas.getContext("2d");
  const octx = out.getContext("2d");
  if (!sctx || !octx) {
    src.dispose?.();
    return null;
  }
  const img = sctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i];
    const a = v < 14 ? 0 : Math.max(0, Math.min(1, 1 - (v - 34) / 190));
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = Math.round(a * 255);
  }
  octx.putImageData(img, 0, 0);
  src.dispose?.();
  return out;
}

function drawScene(ctx: CanvasRenderingContext2D, key: SceneKey, W: number, H: number, seed: number): void {
  if (key !== "saturn" && key !== "robot") land(ctx, W, H, seed, key === "ring" ? 0.5 : 0.62);
  if (key === "torii" || key === "pagoda" || key === "lanterns") {
    if (key === "torii") {
      const h = H * 0.62;
      const t = japanInk("torii", h * 1.1, h, seed);
      if (t) ctx.drawImage(t, W * 0.5 - h * 0.55, H * 0.94 - h, h * 1.1, h);
    } else if (key === "pagoda") {
      const h = H * 0.9;
      const t = japanInk("pagoda", h * 0.62, h, seed);
      if (t) ctx.drawImage(t, W * 0.3 - h * 0.31, H * 0.98 - h, h * 0.62, h);
    } else {
      for (const [x, s] of [
        [0.3, 0.7],
        [0.7, 0.56],
      ] as const) {
        const h = H * s;
        const t = japanInk("lantern", h * 0.5, h, seed);
        if (t) ctx.drawImage(t, W * x - h * 0.25, H * 0.96 - h, h * 0.5, h);
      }
    }
    return;
  }
  frame(ctx, W, H);
  if (key === "coach") drawCoach(ctx);
  else if (key === "blaster") drawBlaster(ctx);
  else if (key === "ring") drawRing(ctx);
  else if (key === "robot") drawRobot(ctx);
  else drawSaturn(ctx, seed);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ------------------------------------------------------------ printing

/** A skill's mark, 24 by 24 from simple-icons, in plum. Skills with no icon get their short mark set in a box. */
function drawMark(ctx: CanvasRenderingContext2D, run: Extract<Run, { kind: "mark" }>, fonts: Fonts): void {
  const icon = skillIcon(run.icon);
  if (icon) {
    ctx.save();
    ctx.translate(run.x, run.y);
    ctx.scale(run.size / 24, run.size / 24);
    ctx.fillStyle = INK;
    ctx.fill(new Path2D(icon.path));
    ctx.restore();
    return;
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(run.x + 1, run.y + 1, run.size - 2, run.size - 2);
  const text = run.mark ?? "";
  const size = run.size * (text.length > 2 ? 0.34 : 0.42);
  ctx.fillStyle = INK;
  ctx.font = `500 ${size}px ${fonts.mono}`;
  ctx.textAlign = "center";
  ctx.fillText(text, run.x + run.size / 2, run.y + run.size / 2 + size * 0.36);
  ctx.textAlign = "left";
}

export function createPrinter(fonts: Fonts): Printer {
  const scratch = document.createElement("canvas");
  scratch.width = 4;
  scratch.height = 4;
  const mctx = scratch.getContext("2d");
  const painter = createDotPainter();
  const colours = dotRamp({ from: [42, 13, 30], to: [42, 13, 30], minAlpha: 0.72, maxAlpha: 1 });
  const paper = makePaper();
  const spacing = (c: CanvasRenderingContext2D, px: number): void => {
    const s = c as CanvasRenderingContext2D & { letterSpacing?: string };
    if ("letterSpacing" in s) s.letterSpacing = `${px}px`;
  };

  const measure: MeasureFont = (text, font) => {
    if (!mctx) return text.length * font.size * 0.55;
    mctx.font = fontString(fonts, font);
    spacing(mctx, 0);
    return mctx.measureText(text).width;
  };

  const picture = (ctx: CanvasRenderingContext2D, run: Extract<Run, { kind: "picture" }>): void => {
    const grid: DotGrid = { cell: CELL, cols: Math.ceil(run.w / CELL), rows: Math.ceil(run.h / CELL) };
    const values = sampleLuminance(grid, (c, W, H) => drawScene(c, run.scene, W, H, run.seed));
    ctx.save();
    ctx.beginPath();
    ctx.rect(run.x, run.y, run.w, run.h);
    ctx.clip();
    ctx.translate(run.x, run.y);
    painter.paint(ctx, grid, (_c, _r, i) => Math.pow(values[i], 0.85), colours, { round: true, maxRadius: CELL * 0.62 });
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(run.x, run.y, run.w, run.h);
  };

  return {
    measure,
    paper,
    print(canvas, printed) {
      if (canvas.width !== TEX_W) canvas.width = TEX_W;
      if (canvas.height !== TEX_H) canvas.height = TEX_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(paper, 0, 0);
      ctx.textBaseline = "alphabetic";
      for (const run of printed.runs) {
        if (run.kind === "text") {
          const text = run.font.caps ? run.text.toUpperCase() : run.text;
          ctx.font = fontString(fonts, run.font);
          spacing(ctx, run.font.tracking * run.font.size);
          ctx.textAlign = run.align;
          ctx.fillStyle = run.soft ? SOFT : INK;
          ctx.fillText(text, run.x, run.y);
          spacing(ctx, 0);
          ctx.textAlign = "left";
        } else if (run.kind === "rule") {
          ctx.fillStyle = INK;
          ctx.fillRect(run.x, run.y, run.w, run.h);
        } else if (run.kind === "square") {
          ctx.fillStyle = INK;
          ctx.fillRect(run.x, run.y, run.size, run.size);
        } else if (run.kind === "frame") {
          ctx.strokeStyle = INK;
          ctx.lineWidth = run.line;
          ctx.strokeRect(run.x, run.y, run.w, run.h);
        } else if (run.kind === "mark") {
          drawMark(ctx, run, fonts);
        } else {
          picture(ctx, run);
        }
      }
    },
    dispose() {
      paper.width = 1;
      paper.height = 1;
    },
  };
}
