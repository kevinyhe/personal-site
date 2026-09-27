/**
 * The screen's paintings, drawn on 2D canvases and handed to three.js as
 * textures. Each face is pale blossom paper laid in squares, the way a
 * folding screen is laid in gold leaf, with a scene printed over it in
 * plum halftone dots through the site's own painter (components/halftone).
 *
 * One landscape runs across all six panels, the way a screen's painting
 * does: the same hills carry on from one panel to the next, and each
 * panel has its own subject standing in them. The last panel holds the
 * 42 skill marks in five columns, drawn sharp so they read.
 */
import { createDotPainter, type DotGrid, dotRamp, sampleLuminance } from "@/components/halftone";
import { petalPath } from "@/components/petalGlyphs";
import type { Skill, SkillGroup } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { createLantern, createPagoda, createTorii } from "@/components/valley/sources/japan";
import { fbm1, makeRng } from "@/components/valley/sources/noise";
import { PANEL_H, PANEL_W, RAIL } from "./layout";

export const INK = "#2a0d1e";
export const PAPER = "#fde7f3";
/** Face texture size. The painted area's own proportions, inside the frame. */
export const TEX_W = 720;
export const TEX_H = Math.round((TEX_W * (PANEL_H - 2 * RAIL)) / (PANEL_W - 2 * RAIL));
const BACK_W = 256;
const BACK_H = Math.round(BACK_W * (TEX_H / TEX_W));
/** Halftone cell in texture pixels: 80 dots across a panel. */
const CELL = 9;

type Subject = "tree" | "torii" | "pagoda" | "robot" | "night" | "skills";
export const SUBJECTS: Subject[] = ["tree", "torii", "pagoda", "robot", "night", "skills"];

const ink = (a: number): string => `rgba(255,255,255,${Math.max(0, Math.min(1, a)).toFixed(3)})`;

// ------------------------------------------------------------ paper

/** Pale paper laid in squares, each a hair lighter or darker, with fibres. Seeded. */
function paper(w: number, h: number, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  const rng = makeRng(seed);
  // The squares: eight across, as leaf is laid on a real screen.
  const sq = w / 8;
  for (let y = 0; y < h; y += sq) {
    for (let x = 0; x < w; x += sq) {
      const v = rng();
      ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(0.12 + v * 0.14).toFixed(3)})` : `rgba(249,185,220,${(0.08 + v * 0.16).toFixed(3)})`;
      ctx.fillRect(x, y, sq, sq);
      ctx.fillStyle = "rgba(160,90,130,0.07)";
      ctx.fillRect(x, y, sq, 1.2);
      ctx.fillRect(x, y, 1.2, sq);
    }
  }
  ctx.lineCap = "round";
  for (let i = 0; i < (w * h) / 260; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const len = 4 + rng() * 16;
    const a = rng() * Math.PI * 2;
    ctx.strokeStyle = rng() < 0.7 ? `rgba(120,50,90,${(0.04 + rng() * 0.06).toFixed(3)})` : `rgba(255,255,255,${(0.3 + rng() * 0.3).toFixed(3)})`;
    ctx.lineWidth = 0.5 + rng() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return c;
}

// ------------------------------------------------------------ the landscape

/** Hill height at a point along the whole screen, 0..PANELS, as a fraction of the panel's height from the top. */
const farHill = (g: number): number => 0.6 - 0.16 * fbm1(g * 0.9, 4, 71);
const nearHill = (g: number): number => 0.8 - 0.14 * fbm1(g * 1.3 + 4, 4, 23);

/** Sky, far hills, mist and near hills for panel i. The same lines carry on across the panels. */
function land(ctx: CanvasRenderingContext2D, W: number, H: number, i: number, night: boolean): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
  sky.addColorStop(0, ink(night ? 0.5 : 0.16));
  sky.addColorStop(1, ink(night ? 0.22 : 0.02));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const ridge = (fn: (g: number) => number, a: number): void => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, H * fn(i + x / W));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = ink(a);
    ctx.fill();
  };
  ridge(farHill, night ? 0.62 : 0.3);
  // Mist lying in the valley between the two rows of hills.
  const mistY = H * 0.7;
  const mist = ctx.createLinearGradient(0, mistY - H * 0.06, 0, mistY + H * 0.05);
  mist.addColorStop(0, "rgba(255,255,255,0)");
  mist.addColorStop(0.5, "rgba(255,255,255,0.6)");
  mist.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = mist;
  ctx.fillRect(0, mistY - H * 0.06, W, H * 0.11);
  ctx.globalCompositeOperation = "source-over";
  ridge(nearHill, night ? 0.8 : 0.56);
}

/** A few clouds as long soft bars, as screens paint them. */
function clouds(ctx: CanvasRenderingContext2D, W: number, H: number, seed: number, a: number): void {
  const rng = makeRng(seed);
  for (let k = 0; k < 3; k += 1) {
    const y = H * (0.12 + rng() * 0.3);
    const x = W * (rng() * 0.6 - 0.2);
    const len = W * (0.5 + rng() * 0.6);
    const g = ctx.createLinearGradient(x, 0, x + len, 0);
    g.addColorStop(0, ink(0));
    g.addColorStop(0.2, ink(a));
    g.addColorStop(0.8, ink(a));
    g.addColorStop(1, ink(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, len, H * 0.012, H * 0.006);
    ctx.fill();
  }
}

/** A blossom: five petals round a centre, from the site's own petal shape. */
function blossom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number, a: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.fillStyle = ink(a);
  for (let p = 0; p < 5; p += 1) {
    ctx.save();
    ctx.rotate((p / 5) * Math.PI * 2);
    ctx.translate(0, -r * 0.5);
    ctx.scale(r * 1.1, -r * 1.1);
    ctx.fill(petalPath(p % 3));
    ctx.restore();
  }
  ctx.fillStyle = ink(Math.min(1, a + 0.3));
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A sakura branch that forks until it ends in a clump of flowers. */
function bough(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  x: number,
  y: number,
  angle: number,
  len: number,
  width: number,
  depth: number,
  flower: number,
): void {
  const x2 = x + Math.cos(angle) * len;
  const y2 = y + Math.sin(angle) * len;
  const bend = (rng() - 0.5) * len * 0.3;
  ctx.strokeStyle = ink(0.95);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo((x + x2) / 2 - Math.sin(angle) * bend, (y + y2) / 2 + Math.cos(angle) * bend, x2, y2);
  ctx.stroke();
  if (depth <= 0 || len < 14) {
    const n = 5 + Math.floor(rng() * 5);
    for (let k = 0; k < n; k += 1) {
      blossom(ctx, x2 + (rng() - 0.5) * flower * 2.6, y2 + (rng() - 0.5) * flower * 2, flower * (0.55 + rng() * 0.5), rng() * 6, 0.35 + rng() * 0.4);
    }
    return;
  }
  const kids = rng() < 0.4 ? 3 : 2;
  for (let k = 0; k < kids; k += 1) {
    const spread = (k - (kids - 1) / 2) * (0.5 + rng() * 0.35);
    bough(ctx, rng, x2, y2, angle + spread + (rng() - 0.5) * 0.25, len * (0.68 + rng() * 0.12), width * 0.66, depth - 1, flower);
  }
}

/** Petals falling, scattered through the picture. */
function falling(ctx: CanvasRenderingContext2D, W: number, H: number, seed: number, n: number): void {
  const rng = makeRng(seed);
  for (let k = 0; k < n; k += 1) {
    ctx.save();
    ctx.translate(rng() * W, rng() * H * 0.75);
    ctx.rotate(rng() * Math.PI * 2);
    const s = W * (0.018 + rng() * 0.014);
    ctx.scale(s, s);
    ctx.fillStyle = ink(0.5 + rng() * 0.3);
    ctx.fill(petalPath(k % 3));
    ctx.restore();
  }
}

/** One of the valley's silhouettes (grey on black, darker is heavier) turned into ink. */
function silhouette(kind: "torii" | "lantern" | "pagoda", w: number, h: number, seed: number): HTMLCanvasElement | null {
  const make = kind === "torii" ? createTorii : kind === "lantern" ? createLantern : createPagoda;
  const src = make({ seed, width: w / 2, height: h / 2 });
  const out = document.createElement("canvas");
  out.width = src.canvas.width;
  out.height = src.canvas.height;
  const sctx = src.canvas.getContext("2d");
  const octx = out.getContext("2d");
  if (sctx && octx) {
    const img = sctx.getImageData(0, 0, out.width, out.height);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      const v = d[p];
      const a = v < 14 ? 0 : Math.max(0, Math.min(1, 1 - (v - 34) / 190));
      d[p] = 255;
      d[p + 1] = 255;
      d[p + 2] = 255;
      d[p + 3] = Math.round(a * 255);
    }
    octx.putImageData(img, 0, 0);
  }
  src.dispose?.();
  return out;
}

/** Kevin's robot as a side view: a low body on four wheels, a mast and a sensor head. */
function robot(ctx: CanvasRenderingContext2D, cx: number, base: number, s: number): void {
  ctx.fillStyle = ink(0.95);
  // Body.
  ctx.beginPath();
  ctx.roundRect(cx - s * 0.5, base - s * 0.42, s, s * 0.24, s * 0.03);
  ctx.fill();
  // A lighter band along the body, so it reads as a box and not a slab.
  ctx.fillStyle = ink(0.55);
  ctx.fillRect(cx - s * 0.46, base - s * 0.36, s * 0.92, s * 0.05);
  // Deck and mast.
  ctx.fillStyle = ink(0.9);
  ctx.fillRect(cx - s * 0.3, base - s * 0.5, s * 0.5, s * 0.08);
  ctx.fillRect(cx + s * 0.08, base - s * 0.86, s * 0.06, s * 0.36);
  // Sensor head, with a pale eye.
  ctx.beginPath();
  ctx.roundRect(cx - s * 0.02, base - s * 1.02, s * 0.3, s * 0.18, s * 0.04);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(cx + s * 0.2, base - s * 0.93, s * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  // Wheels, with pale hubs.
  for (const wx of [-0.36, -0.12, 0.12, 0.36]) {
    ctx.fillStyle = ink(1);
    ctx.beginPath();
    ctx.arc(cx + wx * s, base - s * 0.12, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink(0.4);
    ctx.beginPath();
    ctx.arc(cx + wx * s, base - s * 0.12, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}

function scene(ctx: CanvasRenderingContext2D, W: number, H: number, i: number, subject: Subject): void {
  const night = subject === "night";
  land(ctx, W, H, i, night);
  if (!night && subject !== "skills") clouds(ctx, W, H, 300 + i, 0.2);
  const ground = (x: number): number => H * nearHill(i + x / W);
  if (subject === "tree") {
    // A pale sun behind the tree, cut out of the sky.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(W * 0.66, H * 0.2, W * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = ink(0.4);
    ctx.lineWidth = W * 0.012;
    ctx.beginPath();
    ctx.arc(W * 0.66, H * 0.2, W * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    const rng = makeRng(2801);
    const bx = W * 0.3;
    bough(ctx, rng, bx, ground(bx) + H * 0.02, -Math.PI / 2 - 0.12, H * 0.2, W * 0.07, 5, W * 0.05);
    falling(ctx, W, H, 17, 14);
  } else if (subject === "torii") {
    const h = H * 0.3;
    const t = silhouette("torii", h * 1.1, h, 5);
    const gx = W * 0.5;
    if (t) ctx.drawImage(t, gx - h * 0.55, ground(gx) + H * 0.03 - h, h * 1.1, h);
    // Birds crossing, as short bent strokes.
    ctx.strokeStyle = ink(0.8);
    ctx.lineWidth = W * 0.008;
    const rng = makeRng(11);
    for (let k = 0; k < 6; k += 1) {
      const x = W * (0.15 + rng() * 0.7);
      const y = H * (0.12 + rng() * 0.2);
      const s = W * (0.03 + rng() * 0.02);
      ctx.beginPath();
      ctx.moveTo(x - s, y - s * 0.3);
      ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.5, x, y);
      ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.5, x + s, y - s * 0.3);
      ctx.stroke();
    }
  } else if (subject === "pagoda") {
    const h = H * 0.52;
    const t = silhouette("pagoda", h * 0.62, h, 9);
    const gx = W * 0.56;
    if (t) ctx.drawImage(t, gx - h * 0.31, ground(gx) + H * 0.04 - h, h * 0.62, h);
    // A bough reaching in from the panel before, over the tower.
    const rng = makeRng(2803);
    bough(ctx, rng, -W * 0.05, H * 0.1, 0.25, W * 0.42, W * 0.045, 3, W * 0.042);
  } else if (subject === "robot") {
    const gx = W * 0.5;
    const base = ground(gx) + H * 0.035;
    // The path it has driven, as dots running back over the hill.
    ctx.fillStyle = ink(0.7);
    for (let k = 1; k < 14; k += 1) {
      const x = gx - k * W * 0.05;
      ctx.beginPath();
      ctx.arc(x, ground(x) + H * 0.035 + k * H * 0.004, W * (k % 4 === 0 ? 0.012 : 0.007), 0, Math.PI * 2);
      ctx.fill();
    }
    robot(ctx, gx + W * 0.08, base, W * 0.5);
    const l = silhouette("lantern", W * 0.28, H * 0.2, 13);
    if (l) ctx.drawImage(l, W * 0.72, ground(W * 0.86) + H * 0.02 - H * 0.2, W * 0.28, H * 0.2);
    falling(ctx, W, H, 19, 8);
  } else if (subject === "night") {
    // A ringed planet over two lit lanterns.
    const px = W * 0.5;
    const py = H * 0.22;
    const pr = W * 0.17;
    const ring = (front: boolean): void => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.3);
      ctx.beginPath();
      if (front) ctx.rect(-W, 0, W * 2, W);
      else ctx.rect(-W, -W, W * 2, W);
      ctx.clip();
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = W * 0.022;
      ctx.beginPath();
      ctx.ellipse(0, 0, pr * 1.85, pr * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    };
    ring(false);
    ctx.globalCompositeOperation = "destination-out";
    const g = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0.55)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ring(true);
    // Stars, cut out of the dark.
    const rng = makeRng(29);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#fff";
    for (let k = 0; k < 40; k += 1) {
      ctx.beginPath();
      ctx.arc(rng() * W, rng() * H * 0.5, W * (0.004 + rng() * 0.006), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    for (const [x, s] of [
      [0.28, 0.2],
      [0.74, 0.16],
    ] as const) {
      const h = H * s;
      const l = silhouette("lantern", h * 0.5, h, 31);
      const gx = W * x;
      if (!l) continue;
      ctx.drawImage(l, gx - h * 0.25, ground(gx) + H * 0.03 - h, h * 0.5, h);
      // The window lit: cut pale.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(gx - h * 0.08, ground(gx) + H * 0.03 - h * 0.58, h * 0.16, h * 0.13);
      ctx.globalCompositeOperation = "source-over";
    }
  } else {
    // Skills: only the hills along the foot; the marks go on sharp afterwards.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H * 0.8);
    ctx.globalCompositeOperation = "source-over";
  }
}

// ------------------------------------------------------------ marks

function mark(ctx: CanvasRenderingContext2D, s: Skill, x: number, y: number, size: number, mono: string): void {
  const icon = skillIcon(s.icon);
  ctx.fillStyle = INK;
  if (icon) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.fill(new Path2D(icon.path));
    ctx.restore();
    return;
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = size * 0.05;
  ctx.strokeRect(x + size * 0.04, y + size * 0.04, size * 0.92, size * 0.92);
  const text = s.mark ?? "";
  const px = size * (text.length > 2 ? 0.32 : 0.42);
  ctx.font = `500 ${px}px ${mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + size / 2, y + size / 2 + px * 0.04);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** A seal in the lower corner, as a painter signs a panel: a plum square with the panel's number. */
function seal(ctx: CanvasRenderingContext2D, n: number, mono: string): void {
  const s = TEX_W * 0.085;
  const x = TEX_W * 0.08;
  const y = TEX_H - TEX_W * 0.08 - s;
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = PAPER;
  ctx.font = `500 ${s * 0.44}px ${mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n).padStart(2, "0"), x + s / 2, y + s / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** The skill grid's layout on the panel, shared with nothing else: five columns, a group to a column. */
function skillGrid(groups: SkillGroup[]): { skill: Skill; x: number; y: number; size: number }[] {
  const cols = groups.length;
  const colW = TEX_W / cols;
  const size = colW * 0.52;
  const top = TEX_H * 0.07;
  const step = size * 1.52;
  const out: { skill: Skill; x: number; y: number; size: number }[] = [];
  groups.forEach((g, c) => {
    g.skills.forEach((s, r) => {
      out.push({ skill: s, x: c * colW + (colW - size) / 2, y: top + r * step, size });
    });
  });
  return out;
}

// ------------------------------------------------------------ painting

export type Painter = {
  /** A face canvas for each panel, and one for all the backs. Paper only until paint() runs. */
  faces: HTMLCanvasElement[];
  back: HTMLCanvasElement;
  /** Prints every painting. Call once the mono face has loaded. */
  paint(mono: string): void;
  dispose(): void;
};

export function createPainter(groups: SkillGroup[]): Painter {
  const faces = SUBJECTS.map(() => {
    const c = document.createElement("canvas");
    c.width = TEX_W;
    c.height = TEX_H;
    return c;
  });
  const grounds = faces.map((_, i) => paper(TEX_W, TEX_H, 2800 + i));
  faces.forEach((c, i) => c.getContext("2d")?.drawImage(grounds[i], 0, 0));

  // The backs: a deeper blossom paper with a small plum dot lattice, printed once.
  const back = paper(BACK_W, BACK_H, 2899);
  {
    const ctx = back.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(249,185,220,0.55)";
      ctx.fillRect(0, 0, BACK_W, BACK_H);
      ctx.fillStyle = "rgba(42,13,30,0.28)";
      const gap = BACK_W / 12;
      for (let y = gap / 2, row = 0; y < BACK_H; y += gap, row += 1) {
        for (let x = (row % 2 ? gap : gap / 2) - gap / 2; x < BACK_W + gap; x += gap) {
          ctx.beginPath();
          ctx.arc(x, y, gap * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  const dots = createDotPainter();
  const colours = dotRamp({ from: [42, 13, 30], to: [42, 13, 30], minAlpha: 0.7, maxAlpha: 1 });
  const grid: DotGrid = { cell: CELL, cols: Math.ceil(TEX_W / CELL), rows: Math.ceil(TEX_H / CELL) };

  return {
    faces,
    back,
    paint(mono) {
      SUBJECTS.forEach((subject, i) => {
        const ctx = faces[i].getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(grounds[i], 0, 0);
        // The grid runs a few pixels past the foot of the face; the scene is drawn at the face's own size.
        const values = sampleLuminance(grid, (c) => scene(c, TEX_W, TEX_H, i, subject));
        painted(ctx, values);
        if (subject === "skills") {
          for (const m of skillGrid(groups)) mark(ctx, m.skill, m.x, m.y, m.size, mono);
        } else {
          seal(ctx, i + 1, mono);
        }
      });
    },
    dispose() {
      for (const c of [...faces, ...grounds, back]) {
        c.width = 1;
        c.height = 1;
      }
    },
  };

  function painted(ctx: CanvasRenderingContext2D, values: Float32Array): void {
    dots.paint(ctx, grid, (_c, _r, k) => Math.pow(values[k], 0.8), colours, { round: true, maxRadius: CELL * 0.62 });
  }
}
