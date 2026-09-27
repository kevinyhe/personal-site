import * as THREE from "three";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { ROOM } from "./rig";

/**
 * Every surface in the room that is not a flat colour, drawn here on a
 * canvas. Nothing is loaded from a file.
 *
 * The random numbers come from a seed, so the grain of the desk is the
 * same grain on every visit.
 */

export const DEEP = "#1a0812";
/** The two colours that are this design's own: lamp light and wood. */
export const AMBER = "#ffc994";
export const WOOD = "#9a6a55";

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sheet(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("b07: no 2d canvas");
  return { canvas, ctx };
}

function asColour(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeatX !== 1 || repeatY !== 1) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  }
  return texture;
}

/** Grain running left to right: long wavy lines, a few knots. */
function grain(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, rand: () => number, dark: string, light: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  const knots = [0, 1].map(() => ({ x: x0 + rand() * w, y: y0 + rand() * h, r: 14 + rand() * 22 }));
  const lines = Math.round(h / 3.2);
  for (let i = 0; i < lines; i += 1) {
    const base = y0 + (i / lines) * h + (rand() - 0.5) * 3;
    const wave = 1.5 + rand() * 4;
    const length = 180 + rand() * 260;
    const phase = rand() * 6.28;
    ctx.strokeStyle = rand() < 0.62 ? dark : light;
    ctx.globalAlpha = 0.08 + rand() * 0.2;
    ctx.lineWidth = 0.6 + rand() * 1.6;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      let y = base + Math.sin(x / length + phase) * wave;
      // Lines bend round a knot, as they do in a board.
      for (const k of knots) {
        const dx = x0 + x - k.x;
        const dy = y - k.y;
        const near = Math.exp(-(dx * dx + dy * dy * 3) / (k.r * k.r * 6));
        y += Math.sign(dy || 1) * near * k.r * 0.8;
      }
      if (x === 0) ctx.moveTo(x0 + x, y);
      else ctx.lineTo(x0 + x, y);
    }
    ctx.stroke();
  }
  for (const k of knots) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(k.x, k.y, k.r * 0.55, k.r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The desk: one wide board with seams. */
export function woodTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(1024, 512);
  const rand = seeded(7);
  ctx.fillStyle = WOOD;
  ctx.fillRect(0, 0, 1024, 512);
  const boards = 4;
  for (let b = 0; b < boards; b += 1) {
    const y = (b / boards) * 512;
    ctx.globalAlpha = 0.1 + rand() * 0.12;
    ctx.fillStyle = b % 2 ? "#6f4537" : "#b98468";
    ctx.fillRect(0, y, 1024, 512 / boards);
    ctx.globalAlpha = 1;
    grain(ctx, 0, y, 1024, 512 / boards, rand, "#4f2c25", "#c99a7e");
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#3d2019";
    ctx.fillRect(0, y, 1024, 2);
  }
  ctx.globalAlpha = 1;
  return asColour(canvas);
}

/** The floor: darker boards, laid in rows with staggered ends. */
export function floorTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(1024, 1024);
  const rand = seeded(19);
  ctx.fillStyle = "#6e3a55";
  ctx.fillRect(0, 0, 1024, 1024);
  const rows = 8;
  const rowH = 1024 / rows;
  for (let r = 0; r < rows; r += 1) {
    const y = r * rowH;
    const shift = rand() * 1024;
    for (let n = -1; n < 3; n += 1) {
      const x = shift + n * 512 - 512;
      ctx.globalAlpha = 0.1 + rand() * 0.16;
      ctx.fillStyle = rand() < 0.5 ? "#4a2238" : "#8a4f6c";
      ctx.fillRect(x, y, 512, rowH);
      ctx.globalAlpha = 1;
      grain(ctx, Math.max(0, x), y, 512, rowH, rand, "#3a1a2c", "#9a6080");
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#2c1222";
      ctx.fillRect(x, y, 3, rowH);
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#2c1222";
    ctx.fillRect(0, y, 1024, 3);
  }
  ctx.globalAlpha = 1;
  return asColour(canvas, 3, 3);
}

/** The walls: plum paper with a faint stripe. */
export function wallTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(256, 256);
  const rand = seeded(31);
  ctx.fillStyle = "#8a4a74";
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = BLOSSOM;
    ctx.fillRect(x, 0, 2, 256);
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = BAND;
    ctx.fillRect(x + 16, 0, 10, 256);
  }
  for (let i = 0; i < 1600; i += 1) {
    ctx.globalAlpha = 0.04 + rand() * 0.05;
    ctx.fillStyle = rand() < 0.5 ? BAND : BLOSSOM;
    ctx.fillRect(rand() * 256, rand() * 256, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  return asColour(canvas, 8, 4);
}

/**
 * Light the back wall gives off by itself: a warm pool where the lamp is
 * and a pink one behind the set. Real lamps this small would leave the
 * wall black; this keeps the room readable.
 */
export function wallPoolsTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(512, 256);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 512, 256);
  const width = ROOM.rightX - ROOM.leftX;
  const pool = (x: number, y: number, radius: number, colour: string, strength: number): void => {
    const px = ((x - ROOM.leftX) / width) * 512;
    const py = (1 - y / ROOM.height) * 256;
    const pr = (radius / width) * 512;
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, colour);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = strength;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
  };
  pool(-0.75, 1.05, 1.5, AMBER, 0.55);
  pool(0.1, 1.2, 1.7, BLOSSOM, 0.4);
  pool(0.3, 1.0, 3.4, "#a0588a", 0.35);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return asColour(canvas);
}

/** A circuit board: plum, with blossom tracks and amber pads. */
export function boardTexture(seed: number): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(360, 260);
  const rand = seeded(seed);
  ctx.fillStyle = "#4a1a4a";
  ctx.fillRect(0, 0, 360, 260);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Tracks run on a grid and turn at right angles or at 45 degrees.
  for (let i = 0; i < 46; i += 1) {
    let x = 20 + Math.round(rand() * 32) * 10;
    let y = 20 + Math.round(rand() * 22) * 10;
    ctx.strokeStyle = BLOSSOM;
    ctx.globalAlpha = 0.5 + rand() * 0.4;
    ctx.lineWidth = rand() < 0.2 ? 3 : 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const turns = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < turns; k += 1) {
      const run = (1 + Math.floor(rand() * 5)) * 10;
      const way = Math.floor(rand() * 4);
      if (way === 0) x += run;
      else if (way === 1) y += run;
      else if (way === 2) {
        x += run;
        y += run;
      } else {
        x -= run;
        y += run;
      }
      x = Math.min(344, Math.max(16, x));
      y = Math.min(244, Math.max(16, y));
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a1a4a";
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Chips: dark bodies with legs down two sides.
  for (let c = 0; c < 5; c += 1) {
    const w = 36 + Math.floor(rand() * 4) * 12;
    const h = 28 + Math.floor(rand() * 2) * 14;
    const x = 24 + rand() * (312 - w);
    const y = 24 + rand() * (212 - h);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.85;
    for (let l = 4; l < w - 2; l += 8) {
      ctx.fillRect(x + l, y - 5, 3, 5);
      ctx.fillRect(x + l, y + h, 3, 5);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = DEEP;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = BLOSSOM;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x + 6, y + 6, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Four fixing holes.
  for (const [x, y] of [
    [12, 12],
    [348, 12],
    [12, 248],
    [348, 248],
  ]) {
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = DEEP;
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  return asColour(canvas);
}

/** Dots that get larger toward a centre: the site's halftone, as a sun. */
function halftone(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, reach: number, cell: number, colour: string): void {
  ctx.fillStyle = colour;
  for (let j = 0; j * cell < h + cell; j += 1) {
    for (let i = 0; i * cell < w + cell; i += 1) {
      const x = i * cell + (j % 2 ? cell / 2 : 0);
      const y = j * cell;
      const d = Math.hypot(x - cx, y - cy) / reach;
      const size = Math.max(0, 1 - d);
      if (size <= 0.02) continue;
      ctx.beginPath();
      ctx.arc(x, y, size * cell * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The rug: deep plum, a border, and a halftone bloom in the middle. */
export function rugTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(512, 512);
  ctx.fillStyle = "#3d1430";
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalAlpha = 0.5;
  halftone(ctx, 512, 512, 256, 256, 300, 18, BLOSSOM);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = BLOSSOM;
  ctx.lineWidth = 6;
  ctx.strokeRect(22, 22, 468, 468);
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, 440, 440);
  return asColour(canvas);
}

/** The picture on the wall: two halftone suns, one over the other. */
export function posterTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(512, 696);
  ctx.fillStyle = DEEP;
  ctx.fillRect(0, 0, 512, 696);
  halftone(ctx, 512, 696, 200, 250, 330, 22, BLOSSOM);
  ctx.globalCompositeOperation = "difference";
  halftone(ctx, 512, 696, 350, 470, 260, 14, "#ffffff");
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, 460, 644);
  return asColour(canvas);
}

/** A soft round dot, white to clear. For dust and for the screen's glow. */
export function softDotTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The glow a lit screen throws past its own edges: bright in a band
 *  round the middle, gone by the edge of the sheet. */
export function haloTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = sheet(256, 256);
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, "rgba(249,185,220,0.55)");
  g.addColorStop(0.5, "rgba(249,185,220,0.22)");
  g.addColorStop(1, "rgba(249,185,220,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The desktop as a small picture, for the one still frame a visitor who
 * asked for less motion gets. There the real desktop is laid flat under
 * the picture, so the set only has to look switched on.
 */
export function screenPictureTexture(aspect: number): THREE.CanvasTexture {
  const h = 400;
  const w = Math.round(h * aspect);
  const { canvas, ctx } = sheet(w, h);
  const g = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, w * 0.7);
  g.addColorStop(0, BLOSSOM);
  g.addColorStop(0.5, "#c77daa");
  g.addColorStop(1, "#6b2c55");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = BLOSSOM;
  ctx.fillRect(0, h * 0.13, w, h * 0.05);
  const pane = (x: number, y: number, pw: number, ph: number): void => {
    ctx.fillStyle = DEEP;
    ctx.fillRect(x * w, y * h, pw * w, ph * h);
    ctx.fillStyle = BLOSSOM;
    ctx.fillRect(x * w, y * h, pw * w, h * 0.035);
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 5; i += 1) ctx.fillRect(x * w + 8, y * h + h * 0.07 + i * h * 0.045, pw * w * (0.5 + ((i * 37) % 40) / 100), 3);
    ctx.globalAlpha = 1;
  };
  pane(0.12, 0.24, 0.3, 0.4);
  pane(0.38, 0.34, 0.42, 0.36);
  pane(0.62, 0.56, 0.26, 0.2);
  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = "rgba(26,8,18,0.28)";
    ctx.fillRect(0, y, w, 2);
  }
  return asColour(canvas);
}
