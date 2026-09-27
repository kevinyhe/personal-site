import * as THREE from "three";
import type { Project, SkillGroup } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";

/**
 * The canvas-drawn textures: one plaque per project and one sheet of the
 * 42 votive tablets. Everything is grey, and the shaders read red. In
 * this scene a light grey becomes a wide blossom bar and a dark grey
 * becomes plum, so the plaque face is pale and its letters dark.
 */

export const PLAQUE_PX_W = 1024;
export const PLAQUE_PX_H = 400;

/** Splits a title into at most two lines that each fit `maxW`, the break nearest the middle. */
function lines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (ctx.measureText(text).width <= maxW) return [text];
  const words = text.split(" ");
  if (words.length < 2) return [text];
  let best = [text];
  let bestW = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (w < bestW) {
      bestW = w;
      best = [a, b];
    }
  }
  return best;
}

/** Paints one plaque: a dark frame, a pale face, the name in dark letters as large as fits. */
export function paintPlaque(canvas: HTMLCanvasElement, p: Project, sansFamily: string): void {
  canvas.width = PLAQUE_PX_W;
  canvas.height = PLAQUE_PX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = PLAQUE_PX_W;
  const H = PLAQUE_PX_H;
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(0, 0, W, H);
  const inset = 26;
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(inset, inset, W - inset * 2, H - inset * 2);
  // A thin dark line inside the frame, as a carved border.
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 6;
  ctx.strokeRect(inset + 16, inset + 16, W - (inset + 16) * 2, H - (inset + 16) * 2);

  const maxW = W - 150;
  const maxH = H - 130;
  let size = 150;
  let ls: string[] = [p.title];
  for (; size > 40; size -= 4) {
    ctx.font = `600 ${size}px ${sansFamily}`;
    ls = lines(ctx, p.title, maxW);
    const widest = Math.max(...ls.map((l) => ctx.measureText(l).width));
    if (widest <= maxW && ls.length * size * 1.02 <= maxH) break;
  }
  ctx.font = `600 ${size}px ${sansFamily}`;
  ctx.fillStyle = "#141414";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lh = size * 1.02;
  const top = H / 2 - ((ls.length - 1) * lh) / 2;
  ls.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh + size * 0.04));
}

export function makePlaque(p: Project, sansFamily: string): { texture: THREE.CanvasTexture; repaint: () => void } {
  const canvas = document.createElement("canvas");
  paintPlaque(canvas, p, sansFamily);
  const texture = new THREE.CanvasTexture(canvas);
  // Data, not colour: three must not move these numbers.
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return {
    texture,
    repaint: () => {
      paintPlaque(canvas, p, sansFamily);
      texture.needsUpdate = true;
    },
  };
}

/** Cells of the tablet sheet. A tablet is 0.36 by 0.28 m, so a cell is that shape. */
export const SHEET_COLS = 8;
export const SHEET_ROWS = 6;
const CELL_W = 128;
const CELL_H = 100;

/**
 * The 42 tablets, each a small five-sided board with a peaked top, pale
 * wood with the skill's mark on it in dark. Transparent round the shape,
 * so the shader can cut the peak.
 */
export function paintTablets(canvas: HTMLCanvasElement, groups: SkillGroup[], sansFamily: string): void {
  canvas.width = CELL_W * SHEET_COLS;
  canvas.height = CELL_H * SHEET_ROWS;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let i = 0;
  for (const g of groups) {
    for (const s of g.skills) {
      const x = (i % SHEET_COLS) * CELL_W;
      const y = Math.floor(i / SHEET_COLS) * CELL_H;
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(CELL_W * 0.04, CELL_H * 0.3);
      ctx.lineTo(CELL_W * 0.5, CELL_H * 0.03);
      ctx.lineTo(CELL_W * 0.96, CELL_H * 0.3);
      ctx.lineTo(CELL_W * 0.96, CELL_H * 0.97);
      ctx.lineTo(CELL_W * 0.04, CELL_H * 0.97);
      ctx.closePath();
      ctx.fillStyle = "#dcdcdc";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#404040";
      ctx.stroke();
      ctx.fillStyle = "#1e1e1e";
      const icon = skillIcon(s.icon);
      const size = CELL_H * 0.5;
      const cx = CELL_W / 2;
      const cy = CELL_H * 0.61;
      if (icon) {
        ctx.translate(cx - size / 2, cy - size / 2);
        ctx.scale(size / 24, size / 24);
        ctx.fill(new Path2D(icon.path));
      } else {
        const mark = s.mark ?? s.name.slice(0, 2);
        ctx.font = `700 ${mark.length > 2 ? 30 : 38}px ${sansFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(mark, cx, cy + 2);
      }
      ctx.restore();
      i += 1;
    }
  }
}

export function makeTablets(groups: SkillGroup[], sansFamily: string): { texture: THREE.CanvasTexture; repaint: () => void } {
  const canvas = document.createElement("canvas");
  paintTablets(canvas, groups, sansFamily);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return {
    texture,
    repaint: () => {
      paintTablets(canvas, groups, sansFamily);
      texture.needsUpdate = true;
    },
  };
}

/** The sheet rectangle (u0, v0, u1, v1, three's flipped v) of tablet i. */
export function sheetRect(i: number): [number, number, number, number] {
  const col = i % SHEET_COLS;
  const row = Math.floor(i / SHEET_COLS);
  const u0 = col / SHEET_COLS;
  const u1 = (col + 1) / SHEET_COLS;
  const v1 = 1 - row / SHEET_ROWS;
  const v0 = 1 - (row + 1) / SHEET_ROWS;
  return [u0, v0, u1, v1];
}
