/**
 * What is drawn with a 2D canvas before the scene starts: the title on
 * each panel, and the places the points take to spell a word.
 */
import * as THREE from "three";

/** A random number source that gives the same run every time, so the
 *  field looks the same on every visit and in every capture. */
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

/** The canvas cannot use the no-break hyphen some titles carry for the
 *  display serif's sake; here the type is the sans and a plain one is right. */
const plain = (s: string): string => s.replace(/‑/g, "-");

/** Break words into lines no wider than `max`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export const TITLE_W = 720;
export const TITLE_H = 1000;

/**
 * The type on one panel: the title large at the foot, the number and the
 * year small at the head. White on black; the panel's shader reads the
 * red channel as "how much type is here".
 */
export function titleTexture(
  title: string,
  index: number,
  year: string,
  fonts: { sans: string; mono: string },
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TITLE_W;
  canvas.height = TITLE_H;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  if (!ctx) return texture;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, TITLE_W, TITLE_H);
  ctx.fillStyle = "#fff";

  const pad = 54;
  const room = TITLE_W - pad * 2;
  // The foot of the panel is the title's: about a quarter of its height.
  const tall = 236;
  const text = plain(title);
  let size = 150;
  let lines: string[] = [text];
  for (; size >= 40; size -= 2) {
    ctx.font = `700 ${size}px ${fonts.sans}`;
    lines = wrap(ctx, text, room);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= room && lines.length * size * 0.98 <= tall) break;
  }
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = `${-size * 0.03}px`;
  lines.forEach((l, i) => {
    const y = TITLE_H - pad - (lines.length - 1 - i) * size * 0.98;
    ctx.fillText(l, pad - size * 0.04, y);
  });

  ctx.letterSpacing = "3px";
  ctx.font = `500 26px ${fonts.mono}`;
  ctx.textBaseline = "top";
  ctx.fillText(String(index + 1).padStart(2, "0"), pad, pad);
  const w = ctx.measureText(year).width;
  ctx.fillText(year, TITLE_W - pad - w, pad);

  texture.needsUpdate = true;
  return texture;
}

export const WORD_W = 1600;
export const WORD_H = 470;

/** A long group name is set on two lines, broken after its "&". */
function wordLines(label: string): string[] {
  const at = label.indexOf(" & ");
  if (label.length > 12 && at > 0) return [label.slice(0, at + 2), label.slice(at + 3)];
  return [label];
}

/**
 * Places for `count` points that together spell `label`.
 *
 * The word is drawn to a canvas nobody sees, the filled pixels are
 * collected, and each point is given one of them at random. The result is
 * x and y per point, in units of the canvas' width, centred on 0, y up.
 */
export function sampleWord(label: string, count: number, sans: string, rand: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  const canvas = document.createElement("canvas");
  canvas.width = WORD_W;
  canvas.height = WORD_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;

  const lines = wordLines(label);
  let size = 300;
  for (; size >= 60; size -= 4) {
    ctx.font = `700 ${size}px ${sans}`;
    ctx.letterSpacing = `${-size * 0.02}px`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= WORD_W * 0.97 && lines.length * size * 1.02 <= WORD_H * 0.98) break;
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const lead = size * 1.02;
  const block = lines.length * lead;
  lines.forEach((l, i) => {
    // 0.78 of the size is about where the baseline sits in a line of Inter.
    const y = (WORD_H - block) / 2 + i * lead + size * 0.8;
    ctx.fillText(l, WORD_W / 2, y);
  });

  const data = ctx.getImageData(0, 0, WORD_W, WORD_H).data;
  const filled: number[] = [];
  for (let y = 0; y < WORD_H; y += 1) {
    for (let x = 0; x < WORD_W; x += 1) {
      if (data[(y * WORD_W + x) * 4 + 3] > 140) filled.push(y * WORD_W + x);
    }
  }
  if (!filled.length) return out;

  for (let i = 0; i < count; i += 1) {
    const at = filled[Math.floor(rand() * filled.length)];
    let x = (at % WORD_W) + rand();
    let y = Math.floor(at / WORD_W) + rand();
    // One point in nine hangs a little off the letter, as dust round it.
    if (rand() < 0.11) {
      const a = rand() * Math.PI * 2;
      const r = 3 + rand() * rand() * 22;
      x += Math.cos(a) * r;
      y += Math.sin(a) * r;
    }
    out[i * 2] = x / WORD_W - 0.5;
    out[i * 2 + 1] = -(y - WORD_H / 2) / WORD_W;
  }
  return out;
}
