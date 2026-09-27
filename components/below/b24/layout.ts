import { projects, skillGroups } from "../../profile";
import { EMAIL } from "../../siteContent";

/**
 * Where every word stands and when, for any amount of scroll. Nothing here
 * touches the page or the GPU, so a Node script can import it and print the
 * numbers the scene will draw.
 *
 * The camera sits on +z and looks at the origin. Its distance is picked so
 * the plane z = 0 is exactly one screen: y runs from +1 at the top to -1 at
 * the bottom, x from -aspect to +aspect. A share of the stage (0 at the left
 * or top, 1 at the right or bottom) turns into a place on that plane with
 * `toWorld`.
 */

export const FOV = 30;
export const DIST = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
export const NEAR = 0.1;
export const FAR = 20;

/** One tile is this share of the stage's height, whatever the word. */
export const PITCH = 1 / 200;
/** A tile is this many times deeper than it is wide: the letters are solid. */
export const DEPTH = 2.4;
/** No word may use more tiles than this; a word that would is sampled coarser. */
export const MAX_TILES = 9000;

/** Line spacing and the height of one line's ink (ascender to descender), in em. */
export const LINE_EM = 1.0;
export const INK_EM = 1.08;
/** The italic leans past its advance width; this much room is kept for it. */
export const ITALIC_SLACK = 0.08;

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Align = "left" | "center" | "right";
export type FormSpec = {
  /** The words as profile.ts has them. */
  text: string;
  lines: string[];
  /** Set in Inter: the display serif draws a watermark for digits. */
  sans: boolean;
  box: Box;
  /** Turn about the upright axis, radians. Positive sends the right end away. */
  yaw: number;
  align: Align;
  section: "work" | "skills" | "contact";
  index: number;
};

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Characters the display serif cannot draw. Digits make the whole word Inter; the rest fall back one at a time. */
export const SERIF_UNSAFE = /['"$&@!()*+/=#%\-]/;
export const hasDigit = (s: string): boolean => /[0-9]/.test(s);

/** Breaks a long name at the space nearest its middle; an email before its @. */
export function breakLines(text: string, max = 11): string[] {
  const at = text.indexOf("@");
  if (at > 0) return [text.slice(0, at), text.slice(at)];
  if (text.length <= max) return [text];
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best < 0 ? [text] : [text.slice(0, best), text.slice(best + 1)];
}

// --------------------------------------------------------------- the words

/** Which side the word of each project stands on. Its text takes the other. */
export const WORD_SIDE: readonly ("left" | "right")[] = ["left", "right", "left", "right", "left"];
const WORK_BOX = { left: { x0: 0.07, y0: 0.2, x1: 0.56, y1: 0.8 }, right: { x0: 0.44, y0: 0.2, x1: 0.93, y1: 0.8 } } as const;
/** The project text blocks, as shares of the stage (CSS: 31vw wide, left 63vw or 6vw, centred on the middle). */
export const TEXT_X = { left: [0.63, 0.94], right: [0.06, 0.37] } as const;
export const TEXT_Y: readonly [number, number] = [0.26, 0.74];

export const SKILL_BOX: Box = { x0: 0.1, y0: 0.08, x1: 0.9, y1: 0.5 };
/** The skills list under the word: CSS centred on 66% down, 72vw wide; about 11% tall at 1920. */
export const SKILL_LIST: Box = { x0: 0.14, y0: 0.58, x1: 0.86, y1: 0.74 };
export const EMAIL_BOX: Box = { x0: 0.08, y0: 0.12, x1: 0.92, y1: 0.54 };
/** The email as text and the links, CSS top 62% down to about 84%. */
export const CONTACT_TEXT: Box = { x0: 0.2, y0: 0.62, x1: 0.8, y1: 0.84 };

export const FORMS: readonly FormSpec[] = [
  ...projects.map((p, i): FormSpec => {
    const side = WORD_SIDE[i];
    return {
      text: p.title,
      lines: breakLines(p.title),
      sans: hasDigit(p.title),
      box: WORK_BOX[side],
      yaw: side === "left" ? 0.3 : -0.3,
      align: side === "left" ? "left" : "right",
      section: "work",
      index: i,
    };
  }),
  ...skillGroups.map(
    (g, c): FormSpec => ({
      text: g.label,
      lines: breakLines(g.label, 12),
      sans: hasDigit(g.label),
      box: SKILL_BOX,
      yaw: c % 2 === 0 ? 0.14 : -0.14,
      align: "center",
      section: "skills",
      index: c,
    }),
  ),
  { text: EMAIL, lines: breakLines(EMAIL), sans: hasDigit(EMAIL), box: EMAIL_BOX, yaw: 0, align: "center", section: "contact", index: 0 },
];

export const WORK = projects.length;
export const GROUPS = skillGroups.length;

/**
 * The font size, in px, that fits these lines into a box w by h px.
 * `width100(line)` is a line's advance at 100 px.
 */
export function fitFont(lines: readonly string[], w: number, h: number, width100: (line: string) => number): number {
  const widest = Math.max(...lines.map(width100)) / 100;
  const byW = w / (widest * (1 + ITALIC_SLACK));
  const byH = h / (LINE_EM * (lines.length - 1) + INK_EM);
  return Math.max(4, Math.min(byW, byH));
}

export const toWorld = (sx: number, sy: number, aspect: number): [number, number] => [(sx * 2 - 1) * aspect, 1 - sy * 2];

// ---------------------------------------------------------------- timeline

/** Scroll, in screens since the stage pinned, at which each word stands whole. Also the goTo stops. */
export const CENTRES: readonly number[] = [0, 1.2, 2.4, 3.6, 4.8, 6, 7, 8, 9, 10, 11];
/** Screens of scroll the stage stays pinned: work 6, skills 5, contact 1, less the one on screen. */
export const SPAN = 11;
/** When each word breaks and the next forms: [start, end] of the gust from word f to f + 1. */
export const WINDOWS: readonly (readonly [number, number])[] = CENTRES.slice(0, -1).map((c, f) => {
  const hold = f < WORK ? 0.25 : 0.22;
  return [c + hold, CENTRES[f + 1] - hold] as const;
});

export type Pair = { a: number; b: number; t: number };

/** Which two words the tiles are between, and how far across (0 all of a, 1 all of b). */
export function pairAt(u: number): Pair {
  for (let f = 0; f < WINDOWS.length; f += 1) {
    const [s, e] = WINDOWS[f];
    if (u < e) return { a: f, b: f + 1, t: clamp((u - s) / (e - s), 0, 1) };
  }
  return { a: WINDOWS.length - 1, b: WINDOWS.length, t: 1 };
}

/** How much the text beside word f shows: gone as soon as it breaks, back only once the next is nearly whole. */
export function textShown(f: number, u: number): number {
  const p = pairAt(u);
  if (f === p.a) return 1 - smooth(0, 0.22, p.t);
  if (f === p.b) return smooth(0.78, 1, p.t);
  return 0;
}

/** The word that stands (or is about to) at this scroll. */
export const formAt = (u: number): number => {
  const p = pairAt(u);
  return p.t < 0.5 ? p.a : p.b;
};

// ------------------------------------------------------------------- tiles

/**
 * The shader's gust, written again here so the check can see where the
 * petals go. `lead` is how far along word a the tile sits (0 left, 1 right);
 * s are the tile's four seeds.
 */
export function tileLocal(t: number, lead: number, s0: number): number {
  const delay = lead * 0.38 + s0 * 0.12;
  return clamp((t - delay) / 0.5, 0, 1);
}
export function gustOffset(local: number, s: readonly [number, number, number, number]): [number, number, number] {
  const bump = Math.sin(local * Math.PI);
  return [(0.55 + 0.9 * s[1]) * bump, (0.2 + 0.5 * s[2]) * bump + 0.12 * Math.sin(local * 9 + s[0] * 6.283) * bump, (0.15 + 0.55 * s[3]) * bump];
}

/** Deterministic numbers (mulberry32), so the tiles fly the same way on every visit. */
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

// ------------------------------------------------------------------ camera

export type Cam = { x: number; y: number; z: number };

/** The camera at rest, or leaned toward the cursor (lean -1 to 1 each way). */
export const cameraAt = (leanX = 0, leanY = 0): Cam => ({ x: leanX * 0.1, y: -leanY * 0.06, z: DIST });

/**
 * Where a world point lands on the stage, as shares, for a camera at `cam`
 * looking at the origin. The same sums three.js does, kept here so Node
 * can run them without a renderer.
 */
export function project(p: readonly [number, number, number], cam: Cam, aspect: number): { x: number; y: number; depth: number } {
  // Camera basis: forward toward the origin, right and up from world up.
  const fx = -cam.x;
  const fy = -cam.y;
  const fz = -cam.z;
  const fl = Math.hypot(fx, fy, fz);
  const f = [fx / fl, fy / fl, fz / fl];
  let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];
  const rl = Math.hypot(r[0], r[1], r[2]);
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z];
  const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
  const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const k = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
  const nx = (x / z) * (k / aspect);
  const ny = (y / z) * k;
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth: z };
}

/**
 * The eight corners of a word's box as the tiles make it: the box on the
 * plane, turned by the word's yaw about its middle, a tile's depth thick.
 */
export function boxCorners(spec: FormSpec, aspect: number): [number, number, number][] {
  const [ax, ay] = toWorld(spec.box.x0, spec.box.y0, aspect);
  const [bx, by] = toWorld(spec.box.x1, spec.box.y1, aspect);
  const cx = (ax + bx) / 2;
  const half = (DEPTH * PITCH * 2) / 2;
  const out: [number, number, number][] = [];
  for (const x of [ax, bx]) {
    for (const y of [ay, by]) {
      for (const dz of [-half, half]) {
        const dx = x - cx;
        out.push([cx + dx * Math.cos(spec.yaw) + dz * Math.sin(spec.yaw), y, -dx * Math.sin(spec.yaw) + dz * Math.cos(spec.yaw)]);
      }
    }
  }
  return out;
}

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The text block that stands beside word f, as shares of the stage. */
export function textBoxOf(f: number): Rect {
  const spec = FORMS[f];
  if (spec.section === "work") {
    const [x0, x1] = TEXT_X[WORD_SIDE[spec.index]];
    return { x0, y0: TEXT_Y[0], x1, y1: TEXT_Y[1] };
  }
  return spec.section === "skills" ? SKILL_LIST : CONTACT_TEXT;
}
