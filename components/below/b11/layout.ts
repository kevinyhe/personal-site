/**
 * Design 11, Plates: every number the page is laid out by, and nothing
 * else. No DOM, no WebGL, no imports, so a Node script can load this file
 * and print where each thing lands at a given window size.
 *
 * Units. `u` is how far the journey has scrolled, in screens, from the
 * moment the journey's top reaches the top of the window. Rectangles are
 * fractions of the stage (0..1 across, 0..1 down); the stage is one
 * screen tall and pinned for the whole journey.
 */

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Slow at both ends, like a picture being drawn out of the page by hand. */
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The three blocks of scroll, in screens. #work, #skills, #contact. */
export const WORK_SCREENS = 6.5;
export const SKILLS_SCREENS = 2;
export const CONTACT_SCREENS = 1;
/** The stage is pinned from u = 0 to here: the journey's height less one screen. */
export const PIN_END = WORK_SCREENS + SKILLS_SCREENS + CONTACT_SCREENS - 1;

/**
 * The seven stops: five projects, the skills, the contact. Each is the
 * scroll at which that plate is fully open and still. The contact stop is
 * the very end of the pin, where the contact block fills the window.
 */
export const STOPS = [0.2, 1.3, 2.4, 3.5, 4.6, 7.0, PIN_END] as const;
export const STOP_COUNT = STOPS.length;
export const PROJECT_COUNT = 5;
export const SKILLS_STOP = 5;
export const CONTACT_STOP = 6;
/** How long a plate stays fully open either side of its stop. */
export const HOLD = 0.2;
/** Where the first plate starts to grow: while the stage is still coming up. */
export const FIRST_GROW = -0.55;
/** The contact plate is open this far before the end of the pin. */
const CONTACT_OPEN_BY = 0.2;

/** Where the scroll hands one plate over to the next: halfway between stops. */
export const swapAt = (k: number): number => (STOPS[k] + STOPS[k + 1]) / 2;

export type Phase = {
  /** Which plate is up, 0..6. */
  k: number;
  /** How far it is open, 0 (a small inset) .. 1 (full size), already eased. */
  open: number;
  /** The same before easing, for the grade and the labels. */
  raw: number;
};

/** Which plate is up at this scroll, and how far open it is. */
export function phaseAt(u: number, still = false): Phase {
  let k = 0;
  while (k < STOP_COUNT - 1 && u >= swapAt(k)) k += 1;
  const growFrom = k === 0 ? FIRST_GROW : swapAt(k - 1);
  const growTo = k === CONTACT_STOP ? STOPS[k] - CONTACT_OPEN_BY : STOPS[k] - HOLD;
  const closeFrom = STOPS[k] + HOLD;
  const closeTo = k === STOP_COUNT - 1 ? Infinity : swapAt(k);
  let raw: number;
  if (u < growTo) raw = clamp((u - growFrom) / (growTo - growFrom));
  else if (u <= closeFrom || closeTo === Infinity) raw = 1;
  else raw = 1 - clamp((u - closeFrom) / (closeTo - closeFrom));
  if (still) return { k, open: 1, raw: 1 };
  return { k, open: easeInOut(raw), raw };
}

/**
 * Where each plate sits when it is fully open.
 *
 * Projects: about 70% of the width, a little above the middle, so the
 * title has the band below it. Skills: wide, on the left, with the names
 * in a column to its right. Contact: small and high, the email under it.
 */
export const PROJECT_RECT: Rect = { x0: 0.16, y0: 0.12, x1: 0.84, y1: 0.68 };
export const SKILLS_RECT: Rect = { x0: 0.045, y0: 0.14, x1: 0.6, y1: 0.84 };
export const CONTACT_RECT: Rect = { x0: 0.37, y0: 0.1, x1: 0.63, y1: 0.4 };
export const OPEN_RECTS: Rect[] = [PROJECT_RECT, PROJECT_RECT, PROJECT_RECT, PROJECT_RECT, PROJECT_RECT, SKILLS_RECT, CONTACT_RECT];

/** The skills names' column, beside the wide plate. */
export const SKILLS_LIST: Rect = { x0: 0.64, y0: 0.14, x1: 0.955, y1: 0.9 };
/** The email and the links, under the small plate. */
export const CONTACT_TEXT_TOP = 0.5;

/** The closed plate: this share of the open one, centred on the stage. */
export const CLOSED_SCALE = 0.16;
const CLOSED_CENTRE = { x: 0.5, y: 0.45 };

/** The frame at this much open. Same shape all the way, so it scales, never stretches. */
export function frameRect(k: number, open: number): Rect {
  const r = OPEN_RECTS[k];
  const w = (r.x1 - r.x0) * CLOSED_SCALE;
  const h = (r.y1 - r.y0) * CLOSED_SCALE;
  const c: Rect = { x0: CLOSED_CENTRE.x - w / 2, y0: CLOSED_CENTRE.y - h / 2, x1: CLOSED_CENTRE.x + w / 2, y1: CLOSED_CENTRE.y + h / 2 };
  return { x0: lerp(c.x0, r.x0, open), y0: lerp(c.y0, r.y0, open), x1: lerp(c.x1, r.x1, open), y1: lerp(c.y1, r.y1, open) };
}

/**
 * How much of the picture shows: the middle of it when the frame is
 * small, all of it when open. This is the "clip" half of the growth; the
 * frame's own size is the "scale" half.
 */
export function cropSpan(open: number): number {
  return lerp(0.6, 1, open);
}

/**
 * The bar grade. Washed out while the plate is small (every cell pale, so
 * every bar thin), settling to the full range as it opens. It lags the
 * size a little, so the picture is still coming up after the frame stops.
 */
export function grade(raw: number): { blackPoint: number; whitePoint: number } {
  const g = smooth(0.25, 1, raw);
  return { blackPoint: lerp(-420, 20, g), whitePoint: lerp(255, 235, g) };
}

/** Cells across the plate at full size: one bar per this share of the stage width. */
export const CELL_W = 0.0044;
export function gridFor(k: number, stageW: number, stageH: number): { xSquares: number; ySquares: number } {
  const r = OPEN_RECTS[k];
  const wPx = (r.x1 - r.x0) * stageW;
  const hPx = (r.y1 - r.y0) * stageH;
  const cell = CELL_W * stageW;
  return { xSquares: Math.max(40, Math.round(wPx / cell)), ySquares: Math.max(30, Math.round(hPx / (cell * 1.05))) };
}

/** The labels come up once the frame is most of the way open. */
export const labelAlpha = (raw: number): number => smooth(0.62, 0.95, raw);

/** Gaps between the frame and its labels, as a share of the stage height. */
export const GAP_ABOVE = 0.014;
export const GAP_BELOW = 0.018;

/**
 * Where a project's labels sit, from the frame. Each is an anchor point
 * and which way the text grows from it, so nothing can land inside the
 * frame: the top pair grows upward from its top edge, the bottom pair
 * downward from its bottom edge.
 */
export function captionAnchors(f: Rect): {
  stack: { left: number; bottom: number };
  year: { right: number; bottom: number };
  title: { left: number; top: number };
  award: { right: number; top: number };
} {
  return {
    stack: { left: f.x0, bottom: 1 - f.y0 + GAP_ABOVE },
    year: { right: 1 - f.x1, bottom: 1 - f.y0 + GAP_ABOVE },
    title: { left: f.x0, top: f.y1 + GAP_BELOW },
    award: { right: 1 - f.x1, top: f.y1 + GAP_BELOW + 0.006 },
  };
}

// ---------------------------------------------------------------- scenes

export type Vec3 = [number, number, number];

/**
 * Each plate's camera. It sits at `pos`, looks at `look`, and drifts on
 * two slow sines by `drift` (x, y). The objects turn under it at `turn`
 * radians a second. Numbers checked in scratchpad/b11/check.mjs.
 */
export type Shot = { pos: Vec3; look: Vec3; fov: number; drift: [number, number]; turn: number };

export const SHOTS: Shot[] = [
  // The microphone, stand and rings: 2.6 tall.
  { pos: [0, 1.7, 6.6], look: [0, 1.3, 0], fov: 30, drift: [0.5, 0.18], turn: 0.1 },
  // The blaster, on its block.
  { pos: [0, 1.9, 5.6], look: [0, 0.85, 0], fov: 30, drift: [0.45, 0.16], turn: 0.12 },
  // The ring, from a little above the ropes.
  { pos: [0, 3.3, 9.2], look: [0, 0.75, 0], fov: 30, drift: [0.6, 0.2], turn: 0.08 },
  // The field, from the height of a driver standing at its edge.
  { pos: [0, 2.6, 5.4], look: [0, 0.15, 0], fov: 32, drift: [0.5, 0.15], turn: 0.05 },
  // The planet among the blossom clouds.
  { pos: [0, 2.4, 9.4], look: [0, 1.95, 0], fov: 30, drift: [0.55, 0.2], turn: 0.06 },
  // The valley with the lanterns, from up the slope.
  { pos: [0, 1.5, 6.4], look: [0, 0.45, -2.2], fov: 32, drift: [0.5, 0.1], turn: 0 },
  // The robot alone, close, turning on the spot.
  { pos: [0, 0.95, 2.35], look: [0, 0.28, 0], fov: 32, drift: [0.18, 0.06], turn: 0.35 },
];

/** Which scene each stop draws. The contact plate reuses the field's robot. */
export const SCENE_OF_STOP = [0, 1, 2, 3, 4, 5, 6] as const;

/** The camera at time t (seconds of drawing). */
export function cameraAt(k: number, t: number): { pos: Vec3; look: Vec3 } {
  const s = SHOTS[k];
  const dx = Math.sin(t * 0.13 + k) * s.drift[0];
  const dy = Math.sin(t * 0.09 + 1 + k * 0.7) * s.drift[1];
  return { pos: [s.pos[0] + dx, s.pos[1] + dy, s.pos[2]], look: s.look };
}

/**
 * Rough bounds of what each scene is about, a sphere in world space round
 * the thing that turns. Used only by the check, to see that the subject
 * sits inside its frame at every turn and the camera never gets close.
 */
export const SUBJECT: { c: Vec3; r: number; label: string }[] = [
  { c: [0, 1.35, 0], r: 1.3, label: "microphone" },
  { c: [0, 0.95, 0], r: 1.25, label: "blaster" },
  { c: [0, 0.8, 0], r: 2.3, label: "ring" },
  { c: [0, 0.3, 0], r: 1.6, label: "robot's circle" },
  { c: [0, 1.95, 0], r: 2.35, label: "planet and ring" },
  { c: [0, 0.35, -2.0], r: 3.6, label: "lantern groups" },
  { c: [0, 0.3, 0], r: 0.5, label: "robot" },
];

// ------------------------------------------------------------- lanterns

/**
 * The 42 lanterns: five groups spread along a gentle curve across the
 * valley floor, each group a small cluster. Given the sizes of the five
 * groups, returns each lantern's place (x, z) and group, deterministic.
 */
export function lanternPlaces(sizes: number[]): { x: number; z: number; g: number; i: number }[] {
  const out: { x: number; z: number; g: number; i: number }[] = [];
  const n = sizes.length;
  for (let g = 0; g < n; g += 1) {
    const a = n === 1 ? 0.5 : g / (n - 1);
    // The groups: left to right, the middle ones a little further back.
    const cx = lerp(-2.55, 2.55, a);
    const cz = -1.6 - Math.sin(a * Math.PI) * 1.4;
    const count = sizes[g];
    // Rows of four, back to front, each row staggered by half a place.
    for (let i = 0; i < count; i += 1) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const inRow = Math.min(4, count - row * 4);
      const x = cx + (col - (inRow - 1) / 2) * 0.36 + (row % 2) * 0.12;
      const z = cz + row * 0.42 - 0.4;
      out.push({ x, z, g, i });
    }
  }
  return out;
}

/** A lantern's height: 0.34 for the least-used skill, up to 0.62. */
export const lanternHeight = (depth: number): number => 0.27 + depth * 0.07;
