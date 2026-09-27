/**
 * Design 08, Glass. The numbers: where the type sits, where each glass
 * solid is at each stop, how scroll moves between stops.
 *
 * This file imports nothing, so a Node script can load it and print
 * where everything lands without a browser. Positions are fractions of
 * the stage: x from 0 at the left edge to 1 at the right, y from 0 at
 * the top to 1 at the bottom. Sizes are fractions of the stage height.
 */

export type View = { w: number; h: number };
export type Box = { l: number; t: number; r: number; b: number };

/** Camera: fixed, looking straight at the sheet of type at z = 0. */
export const FOV = 28;
export const CAM_Z = 12;

/** Screens of scroll the stage stays pinned for. */
export const SPAN = 8;
/** Five projects, the skills, the contact. */
export const STOPS = 7;
export const PROJECT_STOPS = 5;
export const SKILLS_STOP = 5;
export const CONTACT_STOP = 6;
/** Scroll, in screens, at which each stop is at rest. */
export const STOP_U = [0.25, 1.25, 2.25, 3.25, 4.25, 6, 8];
/** Scroll range in which each stop holds still. Between them, things fly. */
const HOLDS: [number, number][] = [
  [-1e9, 0.5],
  [1, 1.5],
  [2, 2.5],
  [3, 3.5],
  [4, 4.5],
  [5, 7],
  [7.85, 1e9],
];

/** Side margin of the type, as a fraction of the width. */
export const MARGIN = 0.04;
/** The small text at the lower left. No solid may rest on it. */
export const RESERVED: Box = { l: 0.03, t: 0.66, r: 0.35, b: 0.95 };
/** How far a solid strays from its place: bobbing plus leaning to the cursor. */
export const STRAY = 0.03;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (v: number): number => {
  const c = clamp(v, 0, 1);
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Ease out that goes a little past the end and comes back. */
export const backOut = (v: number, s = 1.2): number => {
  const c = clamp(v, 0, 1) - 1;
  return 1 + (s + 1) * c * c * c + s * c * c;
};

// ------------------------------------------------------------ the type

/** Inter's capital height and the line pitch, in ems. */
export const CAP = 0.7275;
export const LINE = 0.9;
export const TRACKING = -0.04;

/** Width of a string in ems at weight 700, before tracking. */
export type Measure = (text: string) => number;

export type Headline = {
  lines: string[];
  /** Font size as a fraction of the stage width. */
  size: number;
  /** Per line: left edge (of width), baseline (of height), width (of width). */
  left: number[];
  base: number[];
  width: number[];
  /** Cap top of the first line to baseline of the last. */
  box: Box;
  align: "left" | "centre";
};

export type HeadlineSpec = {
  text: string;
  align: "left" | "centre";
  /** Wanted font size, as a fraction of the width. 0.11 is 11vw. */
  target: number;
  /** Where the middle of the block sits, as a fraction of the height. */
  centreY: number;
};

const widthEm = (s: string, measure: Measure): number => measure(s) + TRACKING * s.length;

/**
 * Sets a headline on one line, or two if one does not fit, and shrinks
 * it if the widest line is still too wide. It always fits the width
 * with the margin on both sides.
 */
export function fitHeadline(spec: HeadlineSpec, view: View, measure: Measure): Headline {
  const room = 1 - 2 * MARGIN;
  let lines = [spec.text];
  if (widthEm(spec.text, measure) * spec.target > room) {
    const words = spec.text.split(" ");
    let best = Infinity;
    for (let i = 1; i < words.length; i += 1) {
      const a = words.slice(0, i).join(" ");
      const b = words.slice(i).join(" ");
      const widest = Math.max(widthEm(a, measure), widthEm(b, measure));
      if (widest < best) {
        best = widest;
        lines = [a, b];
      }
    }
  }
  const ems = lines.map((l) => widthEm(l, measure));
  const size = Math.min(spec.target, room / Math.max(...ems));
  const aspect = view.w / view.h;
  const sizeH = size * aspect;
  const blockH = (CAP + (lines.length - 1) * LINE) * sizeH;
  const top = spec.centreY - blockH / 2;
  const width = ems.map((e) => e * size);
  const left = width.map((w) => (spec.align === "left" ? MARGIN : 0.5 - w / 2));
  const base = lines.map((_, i) => top + (CAP + i * LINE) * sizeH);
  return {
    lines,
    size,
    left,
    base,
    width,
    align: spec.align,
    box: {
      l: Math.min(...left),
      t: top,
      r: Math.max(...left.map((l, i) => l + width[i])),
      b: base[base.length - 1],
    },
  };
}

/** The seven headlines' settings. The words come from the page. */
export function headlineSpecs(titles: string[], email: string): HeadlineSpec[] {
  const caps = (s: string): string => s.replace(/‑/g, "-").toUpperCase();
  return [
    { text: caps(titles[0]), align: "left", target: 0.11, centreY: 0.4 },
    { text: caps(titles[1]), align: "left", target: 0.11, centreY: 0.4 },
    { text: caps(titles[2]), align: "centre", target: 0.11, centreY: 0.4 },
    { text: caps(titles[3]), align: "left", target: 0.11, centreY: 0.4 },
    { text: caps(titles[4]), align: "centre", target: 0.11, centreY: 0.42 },
    // The skills sheet carries marks, not a headline.
    { text: "", align: "left", target: 0.11, centreY: 0.4 },
    { text: email, align: "left", target: 0.06, centreY: 0.4 },
  ];
}

// ---------------------------------------------------------- the solids

export const SOLIDS = [
  { name: "cube", r: 0.105 },
  { name: "slab", r: 0.08 },
  { name: "ring", r: 0.115 },
  { name: "petal", r: 0.1 },
  { name: "lens", r: 0.12 },
  { name: "prism", r: 0.1 },
  { name: "capsule", r: 0.085 },
  { name: "bubble", r: 0.06 },
  { name: "gem", r: 0.08 },
  { name: "small petal", r: 0.07 },
] as const;
export const LENS = 4;

export type Pose = {
  x: number;
  y: number;
  /** Distance in front of the type, in world units. */
  z: number;
  /** Radius of the ball that holds the solid, as a fraction of the height. */
  r: number;
  /** 1: its full depth. Less: pressed flat toward a disc. */
  squash: number;
  /** 0: gone. 1: there. */
  show: number;
};

/** On a narrow stage the solids shrink, or they would fill it. */
export const sizeScale = (view: View): number => clamp(view.w / view.h / 1.6, 0.45, 1);

type Spot = [x: number, y: number, z: number];

const SCATTER: Spot[] = [
  [0.83, 0.47, 2.0],
  [0.6, 0.13, 1.2],
  [0.9, 0.17, 1.6],
  [0.71, 0.78, 2.4],
  [0.47, 0.33, 3.0],
  [0.49, 0.8, 1.4],
  [0.11, 0.14, 1.8],
  [0.3, 0.5, 2.6],
  [0.92, 0.76, 1.2],
  [0.33, 0.11, 1.0],
];

/** Stop 1. The lens is placed by the slide; this entry of it is unused. */
const LENS_ROW: Spot[] = [
  [0.88, 0.3, 1.6],
  [0.7, 0.14, 1.2],
  [0.8, 0.63, 2.0],
  [0.55, 0.17, 1.8],
  [0.3, 0.4, 3.2],
  [0.91, 0.8, 1.4],
  [0.4, 0.13, 1.2],
  [0.67, 0.4, 2.4],
  [0.62, 0.8, 1.2],
  [0.25, 0.14, 1.0],
];

/** Stop 3: two staggered files at the right, big ones inside. */
const COLUMN: Spot[] = [
  [0.79, 0.122, 1.8],
  [0.915, 0.12, 1.2],
  [0.785, 0.313, 2.4],
  [0.795, 0.707, 1.6],
  [0.78, 0.516, 3.0],
  [0.8, 0.882, 1.2],
  [0.915, 0.295, 2.0],
  [0.91, 0.46, 1.4],
  [0.915, 0.63, 2.2],
  [0.91, 0.8, 1.0],
];
const COLUMN_SCALE = 0.78;

/** Stop 6: a loose heap. Offsets from its middle, in stage heights. */
const HEAP_AT = { x: 0.775, y: 0.47 };
const HEAP: Spot[] = [
  [0.03, 0.19, 1.4],
  [0.2, 0.3, 1.0],
  [0.17, 0.0, 1.8],
  [-0.15, 0.3, 2.2],
  [-0.2, -0.07, 3.0],
  [-0.02, -0.2, 1.2],
  [0.2, -0.26, 1.6],
  [-0.2, -0.31, 2.4],
  [0.27, 0.15, 2.0],
  [-0.33, 0.15, 2.6],
];

/** Order round the ring and the orbit, so neighbours differ in size. */
const ROUND = [4, 7, 0, 9, 2, 6, 3, 8, 5, 1];

/**
 * Points along part of an ellipse, evenly spaced by distance along it
 * and not by angle, which would crowd them at the two ends.
 * Half-axes in stage heights. Angles in degrees, 0 at the right, 90 at
 * the bottom. `tilt` turns the whole ellipse clockwise on the screen.
 */
function alongEllipse(
  n: number,
  a: number,
  b: number,
  from: number,
  to: number,
  closed: boolean,
  tilt: number,
): { dx: number; dy: number; angle: number }[] {
  const steps = 720;
  const lengths = [0];
  let px = a * Math.cos((from * Math.PI) / 180);
  let py = b * Math.sin((from * Math.PI) / 180);
  for (let i = 1; i <= steps; i += 1) {
    const ang = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    const x = a * Math.cos(ang);
    const y = b * Math.sin(ang);
    lengths.push(lengths[i - 1] + Math.hypot(x - px, y - py));
    px = x;
    py = y;
  }
  const total = lengths[steps];
  const out: { dx: number; dy: number; angle: number }[] = [];
  const c = Math.cos((tilt * Math.PI) / 180);
  const s = Math.sin((tilt * Math.PI) / 180);
  let k = 0;
  for (let j = 0; j < n; j += 1) {
    const want = (total * j) / (closed ? n : n - 1);
    while (k < steps - 1 && lengths[k + 1] < want) k += 1;
    const span = lengths[k + 1] - lengths[k] || 1;
    const f = k + clamp((want - lengths[k]) / span, 0, 1);
    const angle = from + ((to - from) * f) / steps;
    const x = a * Math.cos((angle * Math.PI) / 180);
    const y = b * Math.sin((angle * Math.PI) / 180);
    out.push({ dx: x * c - y * s, dy: x * s + y * c, angle });
  }
  return out;
}

export type Grid = {
  /** One per skill, in the order of the groups. */
  lenses: { x: number; y: number; row: number; col: number }[];
  /** Lens radius, as a fraction of the height. */
  r: number;
  /** Middle of each row, as a fraction of the height. */
  rows: number[];
  /** Left edge of the row labels, and where their column ends. */
  labelLeft: number;
  labelRight: number;
};

const GRID = { left: 0.29, pitch: 0.064, top: 0.2, rowPitch: 0.155 };
export const LENS_Z = 0.6;

/** The skills: one row per group, a lens per skill, from the left. */
export function lensGrid(view: View, counts: number[]): Grid {
  const aspect = view.w / view.h;
  const lenses: Grid["lenses"] = [];
  const rows: number[] = [];
  counts.forEach((count, row) => {
    const y = GRID.top + row * GRID.rowPitch;
    rows.push(y);
    for (let col = 0; col < count; col += 1) lenses.push({ x: GRID.left + col * GRID.pitch, y, row, col });
  });
  return {
    lenses,
    rows,
    r: Math.min(0.05, 0.43 * GRID.pitch * aspect),
    labelLeft: MARGIN,
    labelRight: 0.25,
  };
}

/** Which lens each solid turns into: spread over the sheet. */
export const SOLID_SLOT = [0, 9, 17, 22, 30, 35, 41, 12, 26, 5];

/** How far along its title the lens is, 0 to 1, at this scroll. */
export const lensSlide = (u: number): number => smooth((u - 0.85) / 0.8);

/**
 * Where the ten solids rest at a stop.
 * `boxes` are the headlines' extents, one per stop.
 */
export function arrange(stop: number, view: View, boxes: Box[], grid: Grid, slide: number): Pose[] {
  const aspect = view.w / view.h;
  const k = sizeScale(view);
  const pose = (i: number, x: number, y: number, z: number, scale = 1): Pose => ({
    x,
    y,
    z,
    r: SOLIDS[i].r * k * scale,
    squash: 1,
    show: 1,
  });
  const fromSpots = (spots: Spot[], scale = 1): Pose[] => spots.map((s, i) => pose(i, s[0], s[1], s[2], scale));

  if (stop === 0) return fromSpots(SCATTER);

  if (stop === 1) {
    const out = fromSpots(LENS_ROW);
    const box = boxes[1];
    out[LENS].x = lerp(box.l + 0.07, box.r - 0.03, slide);
    out[LENS].y = (box.t + box.b) / 2;
    return out;
  }

  if (stop === 2) {
    // A ring round the title, open at the lower left where the small
    // text is.
    const box = boxes[2];
    const cy = (box.t + box.b) / 2 + 0.03;
    const at = alongEllipse(SOLIDS.length, 0.41 * aspect, 0.27, 165, 450, false, 0);
    const out: Pose[] = [];
    ROUND.forEach((i, j) => {
      out[i] = pose(i, 0.5 + at[j].dx / aspect, cy + at[j].dy, 1.4 + (j % 3) * 0.6);
    });
    return out;
  }

  if (stop === 3) return fromSpots(COLUMN, COLUMN_SCALE);

  if (stop === 4) {
    // A tilted orbit through the title. The lower half is the near half.
    const box = boxes[4];
    const cy = (box.t + box.b) / 2 + 0.02;
    const at = alongEllipse(SOLIDS.length, Math.min(0.8, 0.43 * aspect), 0.15, 20, 380, true, 18);
    const out: Pose[] = [];
    ROUND.forEach((i, j) => {
      const near = Math.sin((at[j].angle * Math.PI) / 180);
      out[i] = pose(i, 0.5 + at[j].dx / aspect, cy + at[j].dy, 1.9 + near * 1.0, 0.92);
    });
    return out;
  }

  if (stop === 5) {
    // Each solid shrinks onto one lens of the sheet and gives way to it.
    return SOLIDS.map((_, i) => {
      const slot = grid.lenses[SOLID_SLOT[i] % grid.lenses.length];
      return { x: slot.x, y: slot.y, z: LENS_Z, r: grid.r, squash: 0.45, show: 0 };
    });
  }

  return HEAP.map((s, i) => pose(i, HEAP_AT.x + s[0] / aspect, HEAP_AT.y + s[1], s[2]));
}

export type Stage = { from: number; to: number; t: number };

/** Which stop the scroll is at, or which two it is between and how far. */
export function stageAt(u: number): Stage {
  for (let i = 0; i < STOPS; i += 1) {
    if (u > HOLDS[i][1]) continue;
    if (u >= HOLDS[i][0]) return { from: i, to: i, t: 0 };
    const start = HOLDS[i - 1][1];
    return { from: i - 1, to: i, t: clamp((u - start) / (HOLDS[i][0] - start), 0, 1) };
  }
  return { from: STOPS - 1, to: STOPS - 1, t: 0 };
}

/** Each solid sets off a little after the one before it. */
const LAG = 0.25;
const ownTime = (t: number, i: number): number => clamp((t - (LAG * i) / (SOLIDS.length - 1)) / (1 - LAG), 0, 1);

/** Where the ten solids are at this scroll. */
export function solidPoses(u: number, view: View, boxes: Box[], grid: Grid): Pose[] {
  const stage = stageAt(u);
  const slide = lensSlide(u);
  const a = arrange(stage.from, view, boxes, grid, slide);
  if (stage.from === stage.to) return a;
  const b = arrange(stage.to, view, boxes, grid, slide);
  return a.map((p, i) => {
    const q = b[i];
    const tt = ownTime(stage.t, i);
    const e = backOut(tt);
    const soft = smooth(tt);
    // Going: stay until nearly there. Coming back: appear at once.
    const shown = q.show < p.show ? smooth((tt - 0.7) / 0.3) : smooth(tt / 0.3);
    return {
      x: lerp(p.x, q.x, e),
      y: lerp(p.y, q.y, e),
      // Lifts toward the eye in the middle of the flight.
      z: lerp(p.z, q.z, soft) + Math.sin(Math.PI * tt) * 0.5,
      r: lerp(p.r, q.r, soft),
      squash: lerp(p.squash, q.squash, soft),
      show: lerp(p.show, q.show, shown),
    };
  });
}

/** Screens of scroll each row of skills is lifted for, and the first one's start. */
const ROW_FROM = 5.1;
const ROW_STEP = 0.36;

/** How much a row of lenses is lifted at this scroll, 0 to 1. */
export const rowLift = (row: number, u: number): number =>
  smooth(1 - Math.abs(u - (ROW_FROM + (row + 0.5) * ROW_STEP)) / (ROW_STEP * 0.75));

/** How much of lens j is there at this scroll, 0 to 1. */
export function lensShow(j: number, count: number, u: number): number {
  const stage = stageAt(u);
  if (stage.from === SKILLS_STOP && stage.to === SKILLS_STOP) return 1;
  if (stage.to === SKILLS_STOP) {
    const own = SOLID_SLOT.indexOf(j);
    // A lens a solid lands on appears as the solid goes.
    if (own >= 0) return smooth((ownTime(stage.t, own) - 0.7) / 0.3);
    return smooth((stage.t - 0.4 - (0.3 * j) / (count - 1)) / 0.3);
  }
  if (stage.from === SKILLS_STOP) return 1 - smooth((stage.t - (0.2 * j) / (count - 1)) / 0.3);
  return 0;
}

/** Which headline is on the sheet, which is coming, and how far. */
export function sheetAt(u: number): Stage {
  const stage = stageAt(u);
  if (stage.from === stage.to) return stage;
  // The words change in the middle of the flight, quicker than the solids.
  return { from: stage.from, to: stage.to, t: smooth((stage.t - 0.2) / 0.6) };
}

/** How visible a stop's small text is at this scroll, 0 to 1. */
export function labelShow(stop: number, u: number): number {
  const stage = stageAt(u);
  if (stage.from === stage.to) return stage.from === stop ? 1 : 0;
  if (stage.from === stop) return 1 - smooth(stage.t / 0.3);
  if (stage.to === stop) return smooth((stage.t - 0.7) / 0.3);
  return 0;
}

// ------------------------------------------------------ stage to world

/** Height of what the camera sees at a distance z in front of the type. */
export const viewHeightAt = (z: number): number => 2 * (CAM_Z - z) * Math.tan((FOV * Math.PI) / 360);

export type Placed = { x: number; y: number; z: number; radius: number };

/** A pose on the stage, as a place in the scene. */
export function toWorld(p: { x: number; y: number; z: number; r: number }, view: View, out: Placed): Placed {
  const h = viewHeightAt(p.z);
  out.x = (p.x - 0.5) * h * (view.w / view.h);
  out.y = (0.5 - p.y) * h;
  out.z = p.z;
  out.radius = p.r * h;
  return out;
}

/** How far a disc is from a box, in stage heights. Negative: it overlaps. */
export function clearOf(p: { x: number; y: number; r: number }, box: Box, view: View): number {
  const aspect = view.w / view.h;
  const dx = Math.max(box.l - p.x, 0, p.x - box.r) * aspect;
  const dy = Math.max(box.t - p.y, 0, p.y - box.b);
  return Math.hypot(dx, dy) - p.r;
}
