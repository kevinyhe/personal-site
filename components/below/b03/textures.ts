import * as THREE from "three";
import { BLOSSOM } from "@/components/bandColours";
import type { Skill } from "@/components/profile";
import { iconColour, skillIcon } from "@/components/skillIcons";

/** Every picture in the scene is drawn here on a canvas. None is loaded. */

const COLS = 8;
const ROWS = 6;
const CELL = 128;

export type MarkSheet = {
  texture: THREE.CanvasTexture;
  /** The corner and size of one skill's mark on the sheet, in 0..1. */
  cell(i: number): { u: number; v: number; w: number; h: number };
  /** Draw again, once the page's fonts have arrived. */
  redraw(monoFamily: string): void;
};

/** One sheet with all 42 marks on it: one texture to upload, not 42. */
export function buildMarkSheet(skills: Skill[], monoFamily: string): MarkSheet {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const draw = (family: string): void => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    skills.forEach((skill, i) => {
      const x = (i % COLS) * CELL;
      const y = Math.floor(i / COLS) * CELL;
      const icon = skillIcon(skill.icon);
      ctx.save();
      ctx.translate(x, y);
      if (icon) {
        // Brand marks whose own colour is near black are drawn in blossom:
        // black on a night plain is no mark at all.
        const colour = iconColour(icon, true);
        ctx.fillStyle = colour === "currentColor" ? BLOSSOM : colour;
        const pad = 20;
        const s = (CELL - pad * 2) / 24;
        ctx.translate(pad, pad);
        ctx.scale(s, s);
        ctx.fill(new Path2D(icon.path));
      } else {
        const text = skill.mark ?? skill.name.slice(0, 2);
        ctx.fillStyle = BLOSSOM;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `700 ${text.length > 2 ? 46 : 62}px ${family}`;
        ctx.fillText(text, CELL / 2, CELL / 2 + 3);
      }
      ctx.restore();
    });
    texture.needsUpdate = true;
  };
  draw(monoFamily);

  return {
    texture,
    cell: (i) => ({
      u: (i % COLS) / COLS,
      // Canvas rows count down from the top, texture v counts up from the bottom.
      v: 1 - (Math.floor(i / COLS) + 1) / ROWS,
      w: 1 / COLS,
      h: 1 / ROWS,
    }),
    redraw: draw,
  };
}

/** A soft round glow, bright in the middle, nothing at the edge. */
export function buildGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.45)");
    g.addColorStop(0.6, "rgba(255,255,255,0.1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Bands for the ringed planet: stripes of differing width, side to side. */
export function buildBandTexture(colours: string[]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    let y = 0;
    let i = 0;
    // Fixed widths, not random: the planet looks the same on every visit.
    const widths = [26, 14, 34, 10, 22, 40, 12, 30, 18, 24, 26];
    while (y < canvas.height) {
      ctx.fillStyle = colours[i % colours.length];
      const h = widths[i % widths.length];
      ctx.fillRect(0, y, canvas.width, h);
      y += h;
      i += 1;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
