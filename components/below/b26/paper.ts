import * as THREE from "three";
import { MAX_R } from "./path";

/**
 * The paper of a project lantern, with the project's name on its front.
 *
 * The texture wraps once round the lantern. Across, one texel is the same
 * length as one texel up at the lantern's widest point, so the letters are
 * not stretched there. The name sits in a box centred on u = 0.5, which
 * the scene turns toward the camera.
 *
 * Red is all that is read: white paper, black ink, grey ribs and rims.
 */

const TEX_H = 512;
const TEX_W = Math.round(TEX_H * 2 * Math.PI * MAX_R);
/** The name's box, as shares of the texture. */
const BOX_W = 0.19;
const BOX_H = 0.56;

/** Every way to break the words into lines, in order. Titles are at most four words. */
function splits(words: string[]): string[][] {
  if (words.length <= 1) return [words];
  const out: string[][] = [];
  const n = words.length;
  for (let mask = 0; mask < 1 << (n - 1); mask += 1) {
    const lines: string[] = [];
    let cur = words[0];
    for (let i = 1; i < n; i += 1) {
      if (mask & (1 << (i - 1))) {
        lines.push(cur);
        cur = words[i];
      } else cur += ` ${words[i]}`;
    }
    lines.push(cur);
    out.push(lines);
  }
  return out;
}

/** The display serif cannot draw digits and some marks; those titles are set in the sans. */
const serifSafe = (t: string): boolean => !/[0-9'"$&@\-!()*+/=#%‑]/.test(t);

export function paintPaper(canvas: HTMLCanvasElement, title: string, fonts: { serif: string; sans: string }): void {
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Ribs: the bamboo hoops under the paper.
  ctx.fillStyle = "#c8c8c8";
  for (let i = 1; i < 8; i += 1) ctx.fillRect(0, Math.round((i / 8) * TEX_H) - 2, TEX_W, 4);
  // Rims at top and bottom.
  ctx.fillStyle = "#404040";
  ctx.fillRect(0, 0, TEX_W, Math.round(TEX_H * 0.07));
  ctx.fillRect(0, TEX_H - Math.round(TEX_H * 0.07), TEX_W, Math.round(TEX_H * 0.07));

  const serif = serifSafe(title);
  const font = (px: number): string => (serif ? `italic 400 ${px}px ${fonts.serif}` : `300 ${px}px ${fonts.sans}`);
  const boxW = TEX_W * BOX_W;
  const boxH = TEX_H * BOX_H;
  const lineH = serif ? 0.98 : 1.05;

  // The line break that lets the name be largest.
  ctx.font = font(100);
  let best = { size: 0, lines: [title] };
  for (const lines of splits(title.split(" "))) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const size = Math.min((100 * boxW) / Math.max(1, widest), boxH / (lines.length * lineH));
    if (size > best.size) best = { size, lines };
  }
  const size = Math.floor(Math.min(best.size, TEX_H * 0.34));
  ctx.font = font(size);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = TEX_W * 0.5;
  const top = TEX_H * 0.5 - ((best.lines.length - 1) * size * lineH) / 2;
  best.lines.forEach((l, i) => ctx.fillText(l, cx, top + i * size * lineH));
}

export function makePaper(title: string, fonts: { serif: string; sans: string }): { texture: THREE.CanvasTexture; repaint(f: { serif: string; sans: string }): void } {
  const canvas = document.createElement("canvas");
  paintPaper(canvas, title, fonts);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return {
    texture,
    repaint(f) {
      paintPaper(canvas, title, f);
      texture.needsUpdate = true;
    },
  };
}
