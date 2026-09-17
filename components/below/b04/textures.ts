/**
 * The textures that carry type: the five titles, and one sheet holding
 * every skill's mark. The clouds' sheet is in clouds.ts.
 */
import * as THREE from "three";
import type { Skill } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";

/** A small repeatable random, so the sky is the same on every visit. */
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

/** The page's Inter, by the name next/font gave it. */
export function interFamily(): string {
  const v = getComputedStyle(document.body).getPropertyValue("--font-inter").trim();
  return v ? `${v}, system-ui, sans-serif` : "system-ui, sans-serif";
}

export async function fontsReady(family: string): Promise<void> {
  try {
    await Promise.all([document.fonts.load(`700 120px ${family}`), document.fonts.load(`500 120px ${family}`)]);
  } catch {
    // The fallback face draws instead. Nothing else to do about it.
  }
}

/** A long title breaks at the space nearest its middle. */
export function titleLines(title: string): string[] {
  if (title.length <= 12 || !title.includes(" ")) return [title];
  let best = -1;
  for (let i = 0; i < title.length; i += 1) {
    if (title[i] === " " && (best < 0 || Math.abs(i - title.length / 2) < Math.abs(best - title.length / 2))) best = i;
  }
  return [title.slice(0, best), title.slice(best + 1)];
}

export type TitleTexture = { texture: THREE.CanvasTexture; aspect: number; lines: number };

/** One title, white letters on nothing, as large as the card can hold. */
export function makeTitleTexture(title: string, family: string, maxSize: number): TitleTexture {
  const lines = titleLines(title);
  // Canvas pixels, not CSS: the size the letters are drawn at in the texture.
  const size = 220;
  const lead = 0.98;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  const set = (c: CanvasRenderingContext2D, s: number): void => {
    c.font = `700 ${s}px ${family}`;
    (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${-s * 0.035}px`;
    c.textBaseline = "alphabetic";
    c.fillStyle = "#fff";
  };
  set(ctx, size);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const pad = size * 0.12;
  const wantW = widest + pad * 2;
  const wantH = size * lead * lines.length + pad * 2;
  const scale = Math.min(1, maxSize / wantW);
  canvas.width = Math.ceil(wantW * scale);
  canvas.height = Math.ceil(wantH * scale);
  // Sizing the canvas cleared its state.
  set(ctx, size * scale);
  lines.forEach((l, i) => ctx.fillText(l, pad * scale, (pad + size * lead * i + size * 0.82) * scale));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return { texture, aspect: canvas.width / canvas.height, lines: lines.length };
}

export const ATLAS_COLS = 7;
export const ATLAS_ROWS = 6;

/** Every skill's mark in white on one sheet, in the order given. */
export function makeSkillAtlas(skills: Skill[], family: string, cell: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = cell * ATLAS_COLS;
  canvas.height = cell * ATLAS_ROWS;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.fillStyle = "#fff";
  skills.forEach((skill, i) => {
    const cx = (i % ATLAS_COLS) * cell + cell / 2;
    const cy = Math.floor(i / ATLAS_COLS) * cell + cell / 2;
    const icon = skillIcon(skill.icon);
    if (icon) {
      // The path is drawn on a 24 by 24 grid. It takes half the disc.
      const s = (cell * 0.5) / 24;
      ctx.save();
      ctx.translate(cx - 12 * s, cy - 12 * s);
      ctx.scale(s, s);
      ctx.fill(new Path2D(icon.path));
      ctx.restore();
    } else {
      const mark = skill.mark ?? skill.name.slice(0, 2);
      ctx.font = `700 ${cell * (mark.length > 2 ? 0.24 : 0.3)}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mark, cx, cy + cell * 0.015);
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}
