/**
 * Design 09, Tilt. All the numbers of the scene, and nothing else.
 *
 * This file imports nothing, so Node can run it. The check script in the
 * scratch folder prints where every sheet lands on the screen from the
 * same functions the page draws with.
 *
 * Words used here:
 *   sheet  one of the five flat meshes. Sheet 0 is the large plane. Sheets
 *          1 to 3 are the small ones behind it. Sheet 4 is a spare that
 *          hides behind sheet 0 until the skills need a fifth card.
 *   step   one of seven stops: five projects, the skills, the contact.
 *   pose   where a sheet is, how it is turned and how large it is.
 */

// ------------------------------------------------------------- camera
export const FOV = 30;
export const CAM_Z = 12;
const RAD = Math.PI / 180;
/** World units the camera sees top to bottom at z = 0. */
export const VIEW_H = 2 * CAM_Z * Math.tan((FOV * RAD) / 2);
/** How far back the shadow lies. Behind every sheet. */
export const SHADOW_Z = -9;

// -------------------------------------------------------------- steps
export const STEPS = 7;
export const PROJECTS = 5;
export const FAN = 5;
export const FLAT = 6;
export const SHEETS = 5;
/** Scroll, in screens from the top of the design, at which each step rests. */
export const STEP_U = [0, 1.2, 2.4, 3.6, 4.8, 6, 7];
/** Screens of scroll the stage stays pinned for. */
export const SPAN = 7;
/** Which place in the fan each sheet takes, left to right. */
export const SLOT = [2, 3, 1, 0, 4];

// ------------------------------------------------------------ colours
export const PLUM = "#2a0d1e";
export const DEEP = "#1a0812";
export const BLOSSOM = "#f9b9dc";
export const WHITE = "#ffffff";
export const WINE = "#5a1233";
export const ROSE = "#e58fb0";
export const MAUVE = "#5e4360";
export const CREAM = "#f6e7dc";

/** The ground of each step, and the ink that reads on it. */
export const GROUND = [PLUM, WINE, ROSE, MAUVE, CREAM, PLUM, BLOSSOM];
export const INK = [BLOSSOM, BLOSSOM, PLUM, BLOSSOM, PLUM, BLOSSOM, PLUM];

export type Rgb = [number, number, number];

export function rgbOf(hex: string): Rgb {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function cssOf(c: Rgb): string {
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

/** How strongly two colours differ, 1 to 21, as WCAG counts it. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const lin = rgbOf(hex).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// -------------------------------------------------------------- maths
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (lo: number, hi: number, v: number): number => {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Slow, fast, slow. */
export const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// -------------------------------------------------------------- poses
export type Pose = {
  /** Centre, world units. */
  x: number;
  y: number;
  z: number;
  /** Turn about each axis, radians, applied z first, then y, then x. */
  rx: number;
  ry: number;
  rz: number;
  /** Size, world units. */
  w: number;
  h: number;
  /** 0 is unseen. */
  a: number;
};

/** Small changes to the large plane from one project to the next, degrees. */
const MAIN_RY = [-24, -22, -26, -23, -25];
const MAIN_RZ = [-3, 2.5, -2, 3, -2.5];
const MAIN_RX = [8, 7, 9, 8, 7];

/** The small planes, as shares of the view. x and w are shares of its
 *  width, y of its height. Turns are in degrees. */
const SMALL = [
  { x: 0.335, y: -0.345, z: -2.2, w: 0.19, rx: 6, ry: -20, rz: 3 },
  { x: 0.1, y: -0.4, z: -5, w: 0.17, rx: 10, ry: -30, rz: -4 },
  { x: 0.62, y: -0.6, z: -8, w: 0.15, rx: 5, ry: -16, rz: 6 },
];
/** How far each small plane shifts from project to project, shares of the view. */
const SHIFT = [0.012, -0.014, 0.01];

const FAN_STEP = 11;
const FAN_RADIUS = 7.5;
const CARD_H = 0.44;

/** Where the five sheets rest at a step. */
export function restPoses(step: number, aspect: number): Pose[] {
  const vw = VIEW_H * aspect;
  const out: Pose[] = [];

  if (step === FLAT) {
    // One sheet covers the view and is the ground. The rest are behind it.
    for (let k = 0; k < SHEETS; k += 1) {
      out.push({ x: 0, y: 0, z: -0.3 * k, rx: 0, ry: 0, rz: 0, w: vw * 1.25, h: VIEW_H * 1.25, a: k === 0 ? 1 : 0 });
    }
    return out;
  }

  if (step === FAN) {
    const h = CARD_H * VIEW_H;
    const w = (h * 5) / 7;
    // The cards sit on a circle whose centre is far below them.
    const pivotY = 0.19 * VIEW_H - FAN_RADIUS;
    for (let k = 0; k < SHEETS; k += 1) {
      const slot = SLOT[k];
      const a = (slot - 2) * FAN_STEP * RAD;
      out.push({
        x: FAN_RADIUS * Math.sin(a),
        y: pivotY + FAN_RADIUS * Math.cos(a),
        z: (slot - 2) * 0.22,
        rx: -8 * RAD,
        ry: -a * 0.6,
        rz: -a,
        w,
        h,
        a: 1,
      });
    }
    return out;
  }

  const i = clamp(Math.round(step), 0, PROJECTS - 1);
  const w = 0.4 * vw;
  const main: Pose = {
    x: 0.204 * vw,
    y: 0.045 * VIEW_H,
    z: 0,
    rx: MAIN_RX[i] * RAD,
    ry: MAIN_RY[i] * RAD,
    rz: MAIN_RZ[i] * RAD,
    w,
    h: w * 0.625,
    a: 1,
  };
  out.push(main);
  for (let s = 0; s < SMALL.length; s += 1) {
    const m = SMALL[s];
    // Odd projects shift one way, even the other.
    const side = i % 2 === 0 ? 1 : -1;
    out.push({
      x: (m.x + SHIFT[s] * side) * vw,
      y: (m.y + SHIFT[s] * side * 0.6) * VIEW_H,
      z: m.z,
      rx: m.rx * RAD,
      ry: m.ry * RAD,
      rz: (m.rz + side * 1.5) * RAD,
      w: m.w * vw,
      h: m.w * vw * 0.625,
      a: 1,
    });
  }
  out.push({ ...main, z: -0.4, a: 0 });
  return out;
}

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    z: mix(a.z, b.z, t),
    rx: mix(a.rx, b.rx, t),
    ry: mix(a.ry, b.ry, t),
    rz: mix(a.rz, b.rz, t),
    w: mix(a.w, b.w, t),
    h: mix(a.h, b.h, t),
    a: mix(a.a, b.a, t),
  };
}

export type Spot = { x: number; y: number };

/** A point of a sheet, given in the sheet's own units from its centre,
 *  as a place in the world. */
export function worldOf(p: Pose, lx: number, ly: number): [number, number, number] {
  // About z.
  const cz = Math.cos(p.rz);
  const sz = Math.sin(p.rz);
  const x1 = lx * cz - ly * sz;
  const y1 = lx * sz + ly * cz;
  // About y.
  const cy = Math.cos(p.ry);
  const sy = Math.sin(p.ry);
  const x2 = x1 * cy;
  const z2 = -x1 * sy;
  // About x.
  const cx = Math.cos(p.rx);
  const sx = Math.sin(p.rx);
  const y3 = y1 * cx - z2 * sx;
  const z3 = y1 * sx + z2 * cx;
  return [p.x + x2, p.y + y3, p.z + z3];
}

/** A place in the world as a place on the screen, in percent. y runs down. */
export function screenOf(x: number, y: number, z: number, aspect: number): Spot {
  const reach = (CAM_Z - z) / CAM_Z;
  const halfH = (VIEW_H / 2) * reach;
  const halfW = halfH * aspect;
  return { x: 50 + (50 * x) / halfW, y: 50 - (50 * y) / halfH };
}

/** The four corners of a sheet on the screen, in percent: top left, top
 *  right, bottom right, bottom left. */
export function corners(p: Pose, aspect: number): Spot[] {
  const hw = p.w / 2;
  const hh = p.h / 2;
  return [
    [-hw, hh],
    [hw, hh],
    [hw, -hh],
    [-hw, -hh],
  ].map(([lx, ly]) => {
    const [x, y, z] = worldOf(p, lx, ly);
    return screenOf(x, y, z, aspect);
  });
}

/** The nearest any corner of a sheet comes to the camera, world units. */
export function nearest(p: Pose): number {
  const hw = p.w / 2;
  const hh = p.h / 2;
  let least = Infinity;
  for (const [lx, ly] of [
    [-hw, hh],
    [hw, hh],
    [hw, -hh],
    [-hw, -hh],
  ]) {
    least = Math.min(least, CAM_Z - worldOf(p, lx, ly)[2]);
  }
  return least;
}

/** Is a place on the screen inside a sheet? Both in percent. */
export function inside(quad: Spot[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const side = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (side === 0) continue;
    const s = side > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// ----------------------------------------------------------- pictures
/** The part of the picture each small plane shows: centre x, centre y,
 *  and how much of the picture's height it spans. One row per project. */
export const CROPS: [number, number, number][][] = [
  [
    [0.62, 0.52, 0.42],
    [0.3, 0.5, 0.6],
    [0.8, 0.6, 0.26],
  ],
  [
    [0.5, 0.5, 0.45],
    [0.25, 0.76, 0.3],
    [0.7, 0.24, 0.24],
  ],
  [
    [0.36, 0.62, 0.45],
    [0.6, 0.66, 0.3],
    [0.72, 0.5, 0.6],
  ],
  [
    [0.5, 0.5, 0.4],
    [0.72, 0.66, 0.5],
    [0.24, 0.34, 0.3],
  ],
  [
    [0.5, 0.5, 0.5],
    [0.66, 0.42, 0.26],
    [0.3, 0.6, 0.34],
  ],
];
const WHOLE: [number, number, number] = [0.5, 0.5, 1];

export function cropOf(art: number, sheet: number): [number, number, number] {
  if (sheet === 0 || sheet === 4) return WHOLE;
  return CROPS[clamp(art, 0, PROJECTS - 1)][sheet - 1];
}

/** The pictures a swap goes between. The skills and the contact have no
 *  picture of their own, so they keep the last one shown. */
export function artsFor(from: number, to: number, last: number): [number, number] {
  const a = from < PROJECTS ? from : last;
  const b = to < PROJECTS ? to : a;
  return [a, b];
}

// ---------------------------------------------------------- the scene
export type View = {
  /** The swap under way. p runs 0 to 1 and rests at 1. */
  from: number;
  to: number;
  p: number;
  artFrom: number;
  artTo: number;
  /** Screens the page is past where the step rests. */
  drift: number;
  /** The cursor, -1 to 1, already lagged. */
  tiltX: number;
  tiltY: number;
  /** How far each sheet is lifted as a card, 0 to 1. */
  lift: number[];
  aspect: number;
};

export type Look = {
  artFrom: number;
  artTo: number;
  /** 0 shows the first picture, 1 the second. */
  mix: number;
  /** 1 when the new picture comes in from the right, -1 from the left. */
  dir: number;
  /** Where the line between the two pictures is, across the sheet. */
  edge: number;
  /** Height of the wave, world units. */
  wave: number;
  phase: number;
  /** Height of the slow ripple the ground keeps. */
  idle: number;
  /** 0 shows the picture, 1 the card's face. */
  card: number;
  /** 1 is the flat colour of the ground. */
  flat: number;
  /** Where the cursor is on the sheet, 0 to 1 each way. Rings spread
   *  from there on the ground. */
  at: [number, number];
  cropFrom: [number, number, number];
  cropTo: [number, number, number];
};

export type Scene = {
  poses: Pose[];
  looks: Look[];
  shadow: Pose;
  ground: Rgb;
  ink: Rgb;
};

const isFan = (step: number): number => (step === FAN ? 1 : 0);
const isFlat = (step: number): number => (step === FLAT ? 1 : 0);
const isCard = (step: number): number => (step >= FAN ? 1 : 0);
/** How much the cursor turns the sheets at each step. */
const tiltAt = (step: number): number => (step === FLAT ? 0 : step === FAN ? 0.5 : 1);
const driftAt = (step: number): number => (step === FLAT ? 0 : step === FAN ? 0.3 : 1);

/** Height of the wave: a share of the sheet's width, and the most it may be. World units. */
export const WAVE_SHARE = 0.085;
export const WAVE_MOST = 0.45;
/** World units a sheet moves up for one screen of scroll. */
export const RATE = [0.12, 0.9, 0.6, 0.4, 0.12];
const TILT_SHARE = [1, 0.7, 0.55, 0.4, 1];
export const TILT_Y = 5 * RAD;
export const TILT_X = 3.5 * RAD;

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

/** How far the ground has gone from one step's colour to the next. The
 *  contact's ground is the sheet itself, so the page behind it changes
 *  only while the sheet covers it. */
export function groundShare(from: number, to: number, p: number): number {
  if (to === FLAT) return smooth(0.9, 1, p);
  if (from === FLAT) return smooth(0, 0.1, p);
  return smooth(0.15, 0.85, p);
}

export function sceneAt(v: View): Scene {
  const e = ease(v.p);
  const a = restPoses(v.from, v.aspect);
  const b = restPoses(v.to, v.aspect);
  const fan = mix(isFan(v.from), isFan(v.to), e);
  const tilt = mix(tiltAt(v.from), tiltAt(v.to), e);
  const drift = mix(driftAt(v.from), driftAt(v.to), e) * v.drift;
  const dir = v.to >= v.from ? 1 : -1;
  const swapping = v.artFrom !== v.artTo;

  const poses: Pose[] = [];
  const looks: Look[] = [];
  for (let k = 0; k < SHEETS; k += 1) {
    const pose = mixPose(a[k], b[k], e);
    const lift = (v.lift[k] ?? 0) * fan;
    // A lifted card moves along its own long side and toward the camera.
    pose.x += -Math.sin(pose.rz) * 0.45 * lift;
    pose.y += Math.cos(pose.rz) * 0.45 * lift;
    pose.z += 0.5 * lift;
    pose.ry += v.tiltX * TILT_Y * tilt * TILT_SHARE[k];
    pose.rx += v.tiltY * TILT_X * tilt * TILT_SHARE[k];
    pose.y += RATE[k] * drift;
    poses.push(pose);

    // The small planes start a little after the large one.
    const pk = clamp(v.p * 1.2 - 0.05 * k, 0, 1);
    const ek = ease(pk);
    looks.push({
      artFrom: swapping ? v.artFrom : v.artTo,
      artTo: v.artTo,
      mix: swapping ? ek : 1,
      dir,
      edge: dir > 0 ? 1.15 - 1.3 * ek : -0.15 + 1.3 * ek,
      wave: Math.min(WAVE_MOST, WAVE_SHARE * pose.w) * Math.sin(Math.PI * pk),
      phase: pk * 9 * dir,
      idle: k === 0 ? 0.05 * mix(isFlat(v.from), isFlat(v.to), e) : 0,
      card: mix(isCard(v.from), isCard(v.to), smooth(0.15, 0.7, pk)),
      flat: mix(isFlat(v.from), isFlat(v.to), smooth(0.45, 0.95, pk)),
      at: [(v.tiltX * 0.5 * VIEW_H * v.aspect) / pose.w + 0.5, (-v.tiltY * 0.5 * VIEW_H) / pose.h + 0.5],
      cropFrom: cropOf(v.artFrom, k),
      cropTo: cropOf(v.artTo, k),
    });
  }

  return {
    poses,
    looks,
    shadow: shadowOf(poses[0], mix(isCard(v.from), isCard(v.to), e), v.aspect),
    ground: mixRgb(rgbOf(GROUND[v.from]), rgbOf(GROUND[v.to]), groundShare(v.from, v.to, v.p)),
    ink: mixRgb(rgbOf(INK[v.from]), rgbOf(INK[v.to]), smooth(0.4, 0.6, v.p)),
  };
}

/** The shadow of the large plane: the same shape, further back, a little
 *  lower, a little larger. It fades as the plane becomes a card. */
export function shadowOf(main: Pose, card: number, aspect: number): Pose {
  const at = screenOf(main.x, main.y, main.z, aspect);
  const reach = (CAM_Z - SHADOW_Z) / CAM_Z;
  const vw = VIEW_H * aspect;
  const near = CAM_Z / (CAM_Z - main.z);
  return {
    x: ((at.x - 50) / 100 + 0.012) * vw * reach,
    y: ((50 - at.y) / 100 - 0.05) * VIEW_H * reach,
    z: SHADOW_Z,
    rx: main.rx,
    ry: main.ry,
    rz: main.rz,
    w: main.w * near * reach * 1.12,
    h: main.h * near * reach * 1.16,
    a: 1 - card,
  };
}

/** Which card a place on the screen is over, or -1. The card furthest to
 *  the right lies on top, so it is asked first. */
export function cardAt(poses: Pose[], aspect: number, x: number, y: number): number {
  let found = -1;
  let top = -1;
  for (let k = 0; k < SHEETS; k += 1) {
    if (SLOT[k] > top && inside(corners(poses[k], aspect), x, y)) {
      top = SLOT[k];
      found = k;
    }
  }
  return found;
}

/** How far the page must move off a step, in screens, before the next
 *  step is taken. Small, so two notches of a wheel are enough and the
 *  snap never pulls a visitor back who meant to go on. */
export const LEAVE = 0.09;

/** The step the page last rested on. */
export function anchorNear(u: number, anchor: number): number {
  for (let i = 0; i < STEPS; i += 1) {
    if (Math.abs(u - STEP_U[i]) < 0.02) return i;
  }
  return anchor;
}

/** The step to show. It is the one the page rested on until the page has
 *  moved off it, then the next one the way the page went. Coming back
 *  takes less than going, so it cannot flicker at the line. */
export function stepFor(u: number, anchor: number, wanted: number): number {
  const d = u - STEP_U[anchor];
  const limit = wanted === anchor ? LEAVE : LEAVE * 0.5;
  if (Math.abs(d) <= limit) return anchor;
  const dir = d > 0 ? 1 : -1;
  let best = anchor;
  let least = Infinity;
  for (let i = 0; i < STEPS; i += 1) {
    if ((STEP_U[i] - STEP_U[anchor]) * dir <= 0) continue;
    const gap = Math.abs(u - STEP_U[i]);
    if (gap < least) {
      least = gap;
      best = i;
    }
  }
  return best;
}

// --------------------------------------------------------------- type
/** Width of each character of Inter at weight 400, in em, read from the
 *  font file. */
const ADVANCE: Record<string, number> = {
  "0": 0.631, "1": 0.407, "2": 0.61, "3": 0.618, "4": 0.646, "5": 0.593, "6": 0.62, "7": 0.566, "8": 0.619, "9": 0.62,
  A: 0.69, B: 0.654, C: 0.73, D: 0.722, E: 0.601, F: 0.59, G: 0.746, H: 0.743, I: 0.269, J: 0.571, K: 0.672, L: 0.565,
  M: 0.903, N: 0.753, O: 0.765, P: 0.639, Q: 0.765, R: 0.644, S: 0.642, T: 0.646, U: 0.744, V: 0.69, W: 0.985, X: 0.682,
  Y: 0.679, Z: 0.629, a: 0.562, b: 0.612, c: 0.571, d: 0.612, e: 0.583, f: 0.37, g: 0.613, h: 0.591, i: 0.242, j: 0.242,
  k: 0.549, l: 0.242, m: 0.876, n: 0.591, o: 0.6, p: 0.612, q: 0.612, r: 0.376, s: 0.528, t: 0.327, u: 0.591, v: 0.562,
  w: 0.818, x: 0.546, y: 0.562, z: 0.552, " ": 0.281, "-": 0.46, "‑": 0.46, ".": 0.288, "@": 0.966,
};
/** Weight 500 is a little wider than the 400 the table was read at. */
const HEAVIER = 1.03;
/** Tracking of the titles, em. The page sets the same value. */
export const TITLE_TRACK = -0.045;
export const TITLE_LEADING = 0.95;
/** The text block: where it starts and how wide it is, in vw. */
export const TEXT_LEFT = 5;
export const TEXT_WIDTH = 41;
export const TITLE_MAX = 11;
export const EMAIL_TRACK = -0.04;
export const EMAIL_MAX = 7.2;
export const EMAIL_WIDTH = 86;

/** Width of a line of type, in em. */
export function lineEm(line: string, track: number): number {
  let sum = 0;
  for (const ch of line) sum += (ADVANCE[ch] ?? 0.62) * HEAVIER + track;
  return sum;
}

export type TitleFit = { lines: string[]; size: number; width: number };

/** Sets a title on one line or two, whichever lets it be larger. size and
 *  width are in vw. */
export function fitTitle(title: string): TitleFit {
  const words = title.split(" ");
  let best: TitleFit | null = null;
  for (let cut = words.length; cut >= 1; cut -= 1) {
    const lines = cut === words.length ? [title] : [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
    const em = Math.max(...lines.map((l) => lineEm(l, TITLE_TRACK)));
    // A little under the space, because the widths are read from the font, not measured on the page.
    const size = Math.min(TITLE_MAX, (TEXT_WIDTH * 0.97) / em);
    // Rounded down to a tenth, so the server and the browser write the same text.
    const fit: TitleFit = { lines, size: Math.floor(size * 10) / 10, width: 0 };
    fit.width = em * fit.size;
    if (!best || fit.size > best.size) best = fit;
  }
  return best as TitleFit;
}

export function fitEmail(email: string): { size: number; width: number } {
  const em = lineEm(email, EMAIL_TRACK);
  const size = Math.floor(Math.min(EMAIL_MAX, (EMAIL_WIDTH * 0.97) / em) * 10) / 10;
  return { size, width: em * size };
}
