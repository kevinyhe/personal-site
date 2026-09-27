/**
 * Where everything in design 06 stands. Plain numbers, no DOM and no
 * WebGL, so a Node script can import this file and print the same layout
 * the page draws.
 *
 * Units: x and widths are in vw, y and heights in vh, both measured on
 * the stage (the pinned screen), with 0,0 at its top left. The scene
 * turns them into its own units at the last moment.
 */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export type Rect = { left: number; width: number };
export type Box = { left: number; top: number; width: number; height: number };
export type Side = "left" | "right";

// ------------------------------------------------------------ the work row

export const WORK = {
  count: 10,
  perProject: 2,
  w: 3.2,
  gap: 0.8,
  h: 46,
  top: 27,
  /** An opened strip. */
  openW: 38,
  /** The others while one is open. */
  thinW: 1.4,
  thinGap: 0.5,
  /** Nothing of the opened arrangement comes nearer the edge than this. */
  margin: 3,
  titleW: 30,
  titleGap: 2.5,
  /** The row's left edge where its travel begins and ends. */
  startLeft: 56,
  endLeft: 4.8,
} as const;

export const WORK_PITCH = WORK.w + WORK.gap;
export const WORK_ROW_W = WORK.count * WORK.w + (WORK.count - 1) * WORK.gap;
const THIN_PITCH = WORK.thinW + WORK.thinGap;
/** Room left over once the opened arrangement is laid out edge to edge.
 *  The arrangement moves inside it to stay under the cursor. */
const OPEN_SLACK =
  100 - 2 * WORK.margin - ((WORK.count - 1) * THIN_PITCH + WORK.openW + 2 * WORK.titleGap + WORK.titleW);

/** The row's left edge for a slide of 0 (start) to 1 (end). 0.5 is rest:
 *  the row in the middle of the screen. */
export const workRowLeft = (slide: number): number => lerp(WORK.startLeft, WORK.endLeft, slide);

export function restLayout(rowLeft: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < WORK.count; i += 1) out.push({ left: rowLeft + i * WORK_PITCH, width: WORK.w });
  return out;
}

/** Which strip's place the point x is over, or -1. A place is the strip
 *  at rest and half the gap each side. It does not change while strips
 *  open and close, so the answer cannot flicker. */
export function workSlotAt(x: number, y: number, rowLeft: number, rowTop: number): number {
  if (y < rowTop || y > rowTop + WORK.h) return -1;
  const i = Math.floor((x - (rowLeft - WORK.gap / 2)) / WORK_PITCH);
  return i >= 0 && i < WORK.count ? i : -1;
}

export type OpenLayout = { rects: Rect[]; title: Rect; side: Side };

/**
 * The row with strip i opened. The arrangement fills the screen: thin
 * strips, the opened one, the title column beside it, thin strips. The
 * title goes on whichever side lets the opened strip cover the place the
 * strip had at rest, so the cursor that opened it is still on it.
 */
export function openLayout(i: number, rowLeft: number, forced?: Side): OpenLayout {
  const slotL = rowLeft + i * WORK_PITCH - WORK.gap / 2;
  const slotR = slotL + WORK_PITCH;
  const want = (slotL + slotR) / 2 - WORK.openW / 2;
  const base = WORK.margin + i * THIN_PITCH;
  const column = WORK.titleW + 2 * WORK.titleGap;

  const leftIfTitleRight = clamp(want, base, base + OPEN_SLACK);
  const leftIfTitleLeft = clamp(want, base + column, base + column + OPEN_SLACK);
  const cover = (left: number): number => Math.min(slotL - left, left + WORK.openW - slotR);
  const side: Side = forced ?? (cover(leftIfTitleRight) >= cover(leftIfTitleLeft) ? "right" : "left");

  const openLeft = side === "right" ? leftIfTitleRight : leftIfTitleLeft;
  const shift = openLeft - base - (side === "right" ? 0 : column);
  const rects: Rect[] = [];
  for (let j = 0; j < WORK.count; j += 1) {
    if (j < i) rects.push({ left: WORK.margin + j * THIN_PITCH + shift, width: WORK.thinW });
    else if (j === i) rects.push({ left: openLeft, width: WORK.openW });
    else {
      const after = openLeft + WORK.openW + (side === "right" ? column : WORK.thinGap);
      rects.push({ left: after + (j - i - 1) * THIN_PITCH, width: WORK.thinW });
    }
  }
  const title: Rect = {
    left: side === "right" ? openLeft + WORK.openW + WORK.titleGap : openLeft - WORK.titleGap - WORK.titleW,
    width: WORK.titleW,
  };
  return { rects, title, side };
}

/**
 * The part of a project's artwork a strip shows. The artwork is as wide
 * as an opened strip, so a strip of any width shows width / openW of it:
 * widening a strip uncovers more of the picture and never stretches it.
 * `which` is 0 or 1, the strip's place in its pair.
 */
export function artWindow(which: number, width: number): { centre: number; width: number } {
  const t = clamp((width - WORK.w) / (WORK.openW - WORK.w), 0, 1);
  return { centre: lerp(which === 0 ? 0.3 : 0.7, 0.5, t), width: width / WORK.openW };
}

// ---------------------------------------------------------- the skills row

export const SKILLS = {
  w: 2.4,
  gap: 0.6,
  groupGap: 2.4,
  h: 30,
  top: 31,
  openW: 11,
  /** The row's left edge at the start of its travel, and the space left
   *  at the right of the screen at the end of it. */
  startLeft: 8,
  endSpace: 8,
  /** The group names, under the row. */
  labelTop: 64.5,
  /** The name of the opened skill, over it. */
  nameTop: 23.5,
} as const;

export type SkillsRow = {
  /** Left edge of each strip, from the row's left edge. */
  rel: number[];
  /** Index of the group each strip is in. */
  group: number[];
  /** Left edge and width of each group, from the row's left edge. */
  groups: Rect[];
  width: number;
  startLeft: number;
  endLeft: number;
};

export function skillsRow(groupSizes: number[]): SkillsRow {
  const rel: number[] = [];
  const group: number[] = [];
  const groups: Rect[] = [];
  let x = 0;
  groupSizes.forEach((size, g) => {
    const from = x;
    for (let k = 0; k < size; k += 1) {
      rel.push(x);
      group.push(g);
      x += SKILLS.w + (k < size - 1 ? SKILLS.gap : 0);
    }
    groups.push({ left: from, width: x - from });
    if (g < groupSizes.length - 1) x += SKILLS.groupGap;
  });
  return { rel, group, groups, width: x, startLeft: SKILLS.startLeft, endLeft: 100 - SKILLS.endSpace - x };
}

export const skillsRowLeft = (row: SkillsRow, slide: number): number => lerp(row.startLeft, row.endLeft, slide);

/** Which skill's place the point is over, or -1. Places are the strips at
 *  rest, each with half the gap beside it. */
export function skillSlotAt(row: SkillsRow, x: number, y: number, rowLeft: number, rowTop: number): number {
  if (y < rowTop || y > rowTop + SKILLS.h) return -1;
  const rx = x - rowLeft;
  for (let i = 0; i < row.rel.length; i += 1) {
    if (rx >= row.rel[i] - SKILLS.gap / 2 && rx < row.rel[i] + SKILLS.w + SKILLS.gap / 2) return i;
  }
  return -1;
}

/** Strip j's rectangle when skill `open` is opened (-1 for none). The
 *  opened strip widens about its own middle and the rest step aside. */
export function skillRect(row: SkillsRow, j: number, open: number, rowLeft: number): Rect {
  const left = rowLeft + row.rel[j];
  if (open < 0) return { left, width: SKILLS.w };
  const half = (SKILLS.openW - SKILLS.w) / 2;
  if (j === open) return { left: left - half, width: SKILLS.openW };
  return { left: left + (j < open ? -half : half), width: SKILLS.w };
}

// ---------------------------------------------------------------- the fence

export const FENCE = { w: 7.6, gap: 1.6, h: 28, top: 68 } as const;
export const FENCE_W = WORK.count * FENCE.w + (WORK.count - 1) * FENCE.gap;

export function fenceRect(i: number): Rect {
  return { left: (100 - FENCE_W) / 2 + i * (FENCE.w + FENCE.gap), width: FENCE.w };
}

// ------------------------------------------------------------- the timeline

/**
 * The page in screens. The stage is pinned while `u`, the screens
 * scrolled since it reached the top, goes from 0 to TRAVEL. #work is 3
 * screens tall, #skills 2.5, #contact 1, and #work starts one screen up,
 * over the stage.
 */
export const SCREENS = { work: 3, skills: 2.5, contact: 1 } as const;
export const TRAVEL = SCREENS.work + SCREENS.skills + SCREENS.contact - 1;
const WORK_PINNED = SCREENS.work - 1;
const SKILLS_FROM = SCREENS.work;
const SKILLS_TO = SCREENS.work + SCREENS.skills - 1;

/** How far the pinned layer of #work has moved off the stage, in vh. */
export const workLayerTop = (u: number): number => (u <= WORK_PINNED ? 0 : (WORK_PINNED - u) * 100);
export const skillsLayerTop = (u: number): number =>
  u < SKILLS_FROM ? (SKILLS_FROM - u) * 100 : u <= SKILLS_TO ? 0 : (SKILLS_TO - u) * 100;

export const workSlide = (u: number): number => clamp(u / WORK_PINNED, 0, 1);
/** The skills start to slide a little before they are pinned and go on a
 *  little after, so the row is never seen standing still. */
export const skillsSlide = (u: number): number => clamp((u - 2.6) / (4.7 - 2.6), 0, 1);

/** Past this the work strips are out of sight above, and are moved to
 *  the foot of the screen to become the fence. */
export const FENCE_FROM = 3.6;
/** How far strip i of the fence has stood up, 0 lying to 1 upright. */
export function fenceStand(i: number, u: number): number {
  const p = clamp((u - 4.55) / (5.4 - 4.55), 0, 1);
  const from = (i / WORK.count) * 0.7;
  return smooth(from, from + 0.3, p);
}

export type Phase = "work" | "skills" | "contact";
export const phaseAt = (u: number): Phase => (u < 2.5 ? "work" : u < 4.75 ? "skills" : "contact");

// ------------------------------------------------------------------ motion

export type Spring = { x: number; v: number };

/** A weight on a spring, a little under-damped: it passes its mark once,
 *  softly, and comes back. Stepped in small fixed pieces so a long frame
 *  cannot throw it. */
export function stepSpring(s: Spring, target: number, dt: number): void {
  const K = 60;
  const C = 8.4;
  let left = Math.min(dt, 0.1);
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 120);
    s.v += (K * (target - s.x) - C * s.v) * h;
    s.x += s.v * h;
    left -= h;
  }
}

export const BEND_MAX = 0.75;
/** Curvature of the row, 1 over the cylinder's radius in screen heights,
 *  from the row's speed in vw a second. The sign follows the direction. */
export const bendFromSpeed = (v: number): number => clamp(v * 0.014, -BEND_MAX, BEND_MAX);
export const SHEAR_PER_BEND = 0.14;

// ------------------------------------------------------------------ camera

export const FOV = 30;
/** The camera stands this far from the strips, so that the screen is
 *  exactly 1 unit tall where they are. */
export const CAMERA_Z = 0.5 / Math.tan((FOV * Math.PI) / 360);

/**
 * Where a point of a strip ends up on screen once the row is bent and
 * sheared. The same sums as the vertex shader, for the labels that have
 * to follow a strip. In and out in vw and vh.
 */
export function bendPoint(x: number, y: number, bend: number, shear: number, aspect: number): { x: number; y: number } {
  let wx = (x / 100 - 0.5) * aspect;
  const wy = 0.5 - y / 100;
  let wz = 0;
  wx += wy * shear;
  if (Math.abs(bend) > 0.0005) {
    const a = wx * bend;
    wx = Math.sin(a) / bend;
    wz = -(1 - Math.cos(a)) / bend;
  }
  const k = CAMERA_Z / (CAMERA_Z - wz);
  return { x: ((wx * k) / aspect + 0.5) * 100, y: (0.5 - wy * k) * 100 };
}

// ------------------------------------------------------------------- titles

/** A title broken into short lines, so it can be set very large in a
 *  narrow column. Words are kept whole. */
export function titleLines(title: string): string[] {
  const lines: string[] = [];
  for (const word of title.split(" ")) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= 8) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}

export const TITLE = {
  /** Line height, in ems. Capitals only, so it can be tight. */
  leading: 0.86,
  tracking: -0.04,
  /** The title is never taller than this, in vh, nor its type larger
   *  than this, in vw. */
  maxHeight: 30,
  maxSize: 9,
} as const;

/** The type size, in stage pixels, at which a title of `lines` lines
 *  whose longest line is `widest` ems wide fills the column. */
export function titleSize(widest: number, lines: number, stageW: number, stageH: number): number {
  const byWidth = ((WORK.titleW / 100) * stageW) / widest;
  const byHeight = ((TITLE.maxHeight / 100) * stageH) / (lines * TITLE.leading);
  return Math.min(byWidth, byHeight, (TITLE.maxSize / 100) * stageW);
}

// ------------------------------------------------------------------ colours

export const PLUM = "#2a0d1e";
export const DEEP = "#1a0812";
export const PINK = "#f9b9dc";
/** The two colours this design adds. */
export const APRICOT = "#ffb070";
export const MINT = "#86e3ce";
/** One per skill group. The last is blossom let down with plum. */
export const GROUP_COLOURS = [PINK, MINT, APRICOT, "#ffffff", "#c98fb6"] as const;

const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * The colour a brand's mark is drawn in on a dark strip. Near black
 * becomes blossom. A dark colour keeps its hue and is let up with white
 * until it can be read.
 */
export function markColour(hex: string): string {
  const v = parseInt(hex, 16);
  let r = (v >> 16) & 255;
  let g = (v >> 8) & 255;
  let b = v & 255;
  if (luminance(r, g, b) < 40) return PINK;
  for (let n = 0; n < 12 && luminance(r, g, b) < 120; n += 1) {
    r += (255 - r) * 0.15;
    g += (255 - g) * 0.15;
    b += (255 - b) * 0.15;
  }
  const two = (c: number): string => Math.round(c).toString(16).padStart(2, "0");
  return `#${two(r)}${two(g)}${two(b)}`;
}
