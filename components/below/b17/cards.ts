import * as THREE from "three";
import type { CanvasSource } from "@/components/valley/barShader";
import { createLantern, createTorii } from "@/components/valley/sources/japan";
import { createHall, createPagodaTower } from "@/components/valley/sources/shrine";
import type { SkillGroup } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";

/**
 * The shrine's own drawings, turned into textures for the night scene.
 *
 * The site's builders paint grey pictures for the bar shader: the torii
 * and the stone lantern as flat drawings, the hall and the pagoda as small
 * 3D renders. Each is painted once here, read back, and re-coded for the
 * night: red is how much blossom the surface carries before any lantern
 * light, green marks a lantern's window, alpha is where the drawing is.
 * Then the builder is let go, which also frees the WebGL context the 3D
 * ones hold.
 *
 * A torii is flat, so a flat card is the true shape of it seen along the
 * path. The lanterns are turned to face the camera every frame.
 */

export type Card = { texture: THREE.CanvasTexture; aspect: number };
type Kind = "torii" | "lantern" | "render";

/** Is any pixel within r of (x, y) black (the builders' empty ground)? */
function nearBlack(lum: Uint8ClampedArray, w: number, h: number, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy += 1) {
    const yy = y + dy;
    if (yy < 0 || yy >= h) return true;
    for (let dx = -r; dx <= r; dx += 1) {
      const xx = x + dx;
      if (xx < 0 || xx >= w) return true;
      if (lum[yy * w + xx] < 20) return true;
    }
  }
  return false;
}

function recode(source: CanvasSource, kind: Kind): Card | null {
  const src = source.canvas;
  const w = src.width;
  const h = src.height;
  const ctx = src.getContext("2d", { willReadFrequently: true });
  if (!ctx || w < 4 || h < 4) return null;
  const data = ctx.getImageData(0, 0, w, h).data;
  const lum = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i += 1) lum[i] = Math.round((data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3);

  const out = new ImageData(w, h);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const l = lum[y * w + x];
      // The flat drawings stand on a pale strip of ground, which is not
      // wanted here: the path is the ground.
      const empty = l < 6 || (kind !== "render" && l > 170);
      if (empty) continue;
      let tone: number;
      let window = 0;
      if (kind === "torii") {
        // Darker in the drawing is more structure, which here is more blossom.
        tone = 0.46 - (l / 255) * 0.45;
      } else if (kind === "lantern") {
        // The windows are the darkest grey in the drawing. Their outline
        // against the black also passes through that grey, so a pixel only
        // counts as window when no black is near it.
        if (l < 45 && !nearBlack(lum, w, h, x, y, 3)) {
          window = 1;
          tone = 0.26;
        } else {
          tone = 0.44 - (l / 255) * 0.4;
        }
      } else {
        // A lit render: lighter faces stay lighter, lifted off the night.
        tone = 0.18 + (l / 255) * 0.55;
      }
      const o = (y * w + x) * 4;
      out.data[o] = Math.round(tone * 255);
      out.data[o + 1] = window * 255;
      out.data[o + 2] = 0;
      out.data[o + 3] = 255;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return null;

  // Cropped to the drawing, so a card's bottom edge is the drawing's foot.
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  full.getContext("2d")?.putImageData(out, 0, 0);
  const crop = document.createElement("canvas");
  crop.width = cw;
  crop.height = ch;
  crop.getContext("2d")?.drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
  full.width = 1;
  full.height = 1;

  const texture = new THREE.CanvasTexture(crop);
  // Data, not colour: three must not move these numbers.
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: cw / ch };
}

function take(make: () => CanvasSource, kind: Kind): Card | null {
  let source: CanvasSource | null = null;
  try {
    source = make();
    return recode(source, kind);
  } catch {
    return null;
  } finally {
    source?.dispose?.();
  }
}

export type Cards = { torii: Card | null; lantern: Card | null; hall: Card | null; pagoda: Card | null };

export function makeCards(): Cards {
  return {
    torii: take(() => createTorii({ seed: 17, width: 280, height: 300 }), "torii"),
    lantern: take(() => createLantern({ seed: 17, width: 150, height: 300 }), "lantern"),
    hall: take(() => createHall({ seed: 17, width: 1100, height: 760 }), "render"),
    pagoda: take(() => createPagodaTower({ seed: 17, width: 460, height: 860 }), "render"),
  };
}

/** Cells of the lamp atlas, 64 texels each, 8 across. */
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 6;
const CELL = 64;

/**
 * The faces of the 42 votive lamps: pale paper with the skill's mark cut
 * dark into it, in skill order, group after group. Grey only; the shader
 * reads red.
 */
export function makeLampAtlas(groups: SkillGroup[], sansFamily: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = CELL * ATLAS_COLS;
  c.height = CELL * ATLAS_ROWS;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#202020";
    ctx.fillRect(0, 0, c.width, c.height);
    let i = 0;
    for (const g of groups) {
      for (const s of g.skills) {
        const cx = (i % ATLAS_COLS) * CELL;
        const cy = Math.floor(i / ATLAS_COLS) * CELL;
        ctx.fillStyle = "#e8e8e8";
        ctx.fillRect(cx + 4, cy + 4, CELL - 8, CELL - 8);
        ctx.fillStyle = "#3a3a3a";
        const icon = skillIcon(s.icon);
        if (icon) {
          ctx.save();
          ctx.translate(cx + 12, cy + 12);
          ctx.scale(40 / 24, 40 / 24);
          ctx.fill(new Path2D(icon.path));
          ctx.restore();
        } else {
          const mark = s.mark ?? s.name.slice(0, 2);
          ctx.font = `700 ${mark.length > 2 ? 17 : 23}px ${sansFamily}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(mark, cx + CELL / 2, cy + CELL / 2 + 1);
        }
        i += 1;
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** The atlas rectangle (u0, v0, u1, v1, three's flipped v) of lamp i. */
export function atlasRect(i: number): [number, number, number, number] {
  const col = i % ATLAS_COLS;
  const row = Math.floor(i / ATLAS_COLS);
  const inset = 2 / CELL;
  const u0 = col / ATLAS_COLS + inset / ATLAS_COLS;
  const u1 = (col + 1) / ATLAS_COLS - inset / ATLAS_COLS;
  const v1 = 1 - row / ATLAS_ROWS - inset / ATLAS_ROWS;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + inset / ATLAS_ROWS;
  return [u0, v0, u1, v1];
}
