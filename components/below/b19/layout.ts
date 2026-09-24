/**
 * Design 19, Relief: the numbers, and nothing else.
 *
 * No DOM, no three.js, no imports. The page and the Node check both read
 * this file, so what the check prints is what the page draws.
 *
 * World units. The wall is the plane z = 0, facing +z, with y up. Panel i
 * is centred on x = i * PITCH. Panels 0 to 4 are the projects, 5 the
 * skills, 6 the contact. The camera looks straight at the wall from +z
 * and slides along x.
 */

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type Cam = { x: number; y: number; z: number; yaw: number; vh: number; panel: number };
export type Screen = { x: number; y: number; depth: number };

/** Vertical field of view, degrees. */
export const FOV = 30;
const TAN = Math.tan((FOV * Math.PI) / 360);

export const PITCH = 2;
export const PANELS = 7;
export const WORK_PANELS = 5;
export const SKILLS_PANEL = 5;
export const CONTACT_PANEL = 6;
export const ROBOT_PANEL = 3;
export const panelX = (i: number): number => i * PITCH;

/** The wall is cut into tiles, one height map each. Tile t is centred on panel t + TILE_FIRST. */
export const TILE_FIRST = -1;
export const TILE_COUNT = 9;
export const TILE_W = 2;
export const TILE_H = 1.6;
export const tileX = (t: number): number => (t + TILE_FIRST) * PITCH;
/** Height map texels per world unit. */
export const PPU = 400;
/** Drawn beyond each tile's edge, then cut off, so the blur has no seam. */
export const TILE_PAD = 0.04;
/** How far the highest carving stands out of the wall, world units. */
export const DEPTH = 0.06;

/** How tall a piece of wall fills the stage at each kind of stop. */
export const VH_WORK = 1;
export const VH_SKILLS = 1.2;
export const distFor = (vh: number): number => vh / (2 * TAN);

/**
 * Where the camera rests, in screens of scroll from the top of the
 * journey. Between two rests it slides. Work is screens 0 to 6, skills
 * 6 to 8, contact 8 to 9; the stage stays pinned until 8.
 */
export const HOLDS: readonly { from: number; to: number; panel: number; vh: number; reach: number }[] = [
  { from: -2, to: 0.6, panel: 0, vh: VH_WORK, reach: 0.78 },
  { from: 1.1, to: 1.7, panel: 1, vh: VH_WORK, reach: 0.78 },
  { from: 2.2, to: 2.8, panel: 2, vh: VH_WORK, reach: 0.78 },
  { from: 3.3, to: 3.9, panel: 3, vh: VH_WORK, reach: 0.78 },
  { from: 4.4, to: 5.0, panel: 4, vh: VH_WORK, reach: 0.78 },
  { from: 6.0, to: 7.0, panel: 5, vh: VH_SKILLS, reach: 0.97 },
  { from: 7.8, to: 99, panel: 6, vh: VH_WORK, reach: 0.8 },
];

/**
 * How much wall height a stop shows. `vh` at the usual wide window; on a
 * narrower one the camera backs off until `reach` (half the width that
 * must be seen, from the panel's centre) fits.
 */
export const holdVh = (h: { vh: number; reach: number }, aspect: number): number => Math.max(h.vh, (2 * h.reach) / aspect);
/** The skills stop's wall height, which the names' CSS divides by. */
export const skillsVh = (aspect: number): number => holdVh(HOLDS[SKILLS_PANEL], aspect);
/** One scroll position per stop, for goTo and the check. */
export const STOP_AT = [0.45, 1.4, 2.5, 3.6, 4.7, 6.5, 8.0];

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The camera for a scroll position. */
export function cameraAt(u: number, aspect: number, out?: Cam): Cam {
  const cam = out ?? { x: 0, y: 0, z: 0, yaw: 0, vh: 1, panel: 0 };
  let k = HOLDS.length - 1;
  for (let i = 0; i < HOLDS.length; i += 1) {
    if (u <= HOLDS[i].to) {
      k = i;
      break;
    }
  }
  const hold = HOLDS[k];
  if (k === 0 || u >= hold.from || u > hold.to) {
    cam.x = panelX(hold.panel);
    cam.vh = holdVh(hold, aspect);
    cam.yaw = 0;
    cam.panel = hold.panel;
  } else {
    const prev = HOLDS[k - 1];
    const t = clamp((u - prev.to) / (hold.from - prev.to), 0, 1);
    const e = smooth(0, 1, t);
    const arc = Math.sin(Math.PI * t);
    const xa = panelX(prev.panel);
    const xb = panelX(hold.panel);
    cam.x = lerp(xa, xb, e);
    // It steps back a little while it travels, and turns toward where it
    // is going, so the carving is seen from the side for a moment.
    cam.vh = lerp(holdVh(prev, aspect), holdVh(hold, aspect), e) * (1 + 0.1 * arc);
    cam.yaw = -0.09 * arc * Math.sign(xb - xa);
    cam.panel = lerp(prev.panel, hold.panel, e);
  }
  cam.y = 0;
  cam.z = distFor(cam.vh);
  return cam;
}

/** The stop the camera is at or nearest to. */
export function stopAt(u: number): number {
  let best = 0;
  for (let i = 1; i < STOP_AT.length; i += 1) {
    if (Math.abs(u - STOP_AT[i]) < Math.abs(u - STOP_AT[best])) best = i;
  }
  return best;
}

/** A world point on the stage: x and y as shares from the top left, depth in front of the lens. */
export function project(x: number, y: number, z: number, cam: Cam, aspect: number, out?: Screen): Screen {
  const s = out ?? { x: 0, y: 0, depth: 0 };
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const c = Math.cos(cam.yaw);
  const n = Math.sin(cam.yaw);
  const vx = c * dx - n * dz;
  const vz = n * dx + c * dz;
  const depth = -vz;
  s.depth = depth;
  s.x = 0.5 + vx / (depth * TAN * aspect) / 2;
  s.y = 0.5 - dy / (depth * TAN) / 2;
  return s;
}

/** The point on the wall under a place on the stage (shares). */
export function toWall(sx: number, sy: number, cam: Cam, aspect: number): { x: number; y: number } {
  const rx = (sx * 2 - 1) * TAN * aspect;
  const ry = (1 - sy * 2) * TAN;
  const c = Math.cos(cam.yaw);
  const n = Math.sin(cam.yaw);
  const wx = c * rx + n * -1;
  const wz = -n * rx + c * -1;
  const t = -cam.z / wz;
  return { x: cam.x + t * wx, y: cam.y + t * ry };
}

/** A world rectangle (y up) on the stage, as shares (y down). Corners at the wall and at full carving depth. */
export function projectRect(r: Rect, z0: number, z1: number, cam: Cam, aspect: number): Rect {
  const out: Rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const s: Screen = { x: 0, y: 0, depth: 0 };
  for (const x of [r.x0, r.x1]) {
    for (const y of [r.y0, r.y1]) {
      for (const z of [z0, z1]) {
        project(x, y, z, cam, aspect, s);
        out.x0 = Math.min(out.x0, s.x);
        out.x1 = Math.max(out.x1, s.x);
        out.y0 = Math.min(out.y0, s.y);
        out.y1 = Math.max(out.y1, s.y);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------ the work

/** Every project panel's carved frame, relative to the panel's centre. */
export const CARTOUCHE: Rect = { x0: 0.06, y0: -0.43, x1: 0.74, y1: 0.41 };

/**
 * What is carved in each project's frame, relative to the panel centre:
 * a microphone, a blaster, a boxing glove, the robot on a field, a ringed
 * planet. wall.ts draws inside these boxes; the check sets them against
 * the titles.
 */
export const SUBJECT: readonly Rect[] = [
  { x0: 0.27, y0: -0.37, x1: 0.53, y1: 0.36 },
  { x0: 0.09, y0: -0.26, x1: 0.72, y1: 0.24 },
  { x0: 0.12, y0: -0.17, x1: 0.67, y1: 0.24 },
  { x0: 0.07, y0: -0.38, x1: 0.73, y1: 0.28 },
  { x0: 0.07, y0: -0.32, x1: 0.73, y1: 0.33 },
];

/** The robot on panel 3: its centre, the floor it stands on, and its height on the wall. */
export const ROBOT = { cx: 0.4, floor: -0.22, height: 0.5 };
/** The model's own box (public/models/hero.glb), x forward, y up, z to its right. */
export const ROBOT_BOX = { min: [-0.1965, 0.0023, -0.1741], max: [0.21, 0.4607, 0.272] } as const;

/**
 * The title block's CSS, in one place, so the page and the estimate in
 * the check use the same numbers. vw and rem.
 */
export const TITLE = {
  left: 5,
  width: 42,
  /** The block's middle, % of the stage height. */
  middle: 50,
  size: 6.6,
  line: 0.95,
  counterRem: 1.4,
  gapRem: 1.6,
  taglineRem: 1.6,
  taglineWidth: 30,
  detailRem: 1.3,
  plateGapRem: 2.4,
  platePadRem: 1.4,
};

/** Average advance of one character, in ems. The display serif is a guess; Inter caps and digits a measured-ish average. */
const SERIF_EM = 0.42;
const INTER_EM = 0.62;
const MONO_EM = 0.6;
/** Titles with digits or hyphens are set in Inter: the display serif cannot draw them. */
export const needsSans = (title: string): boolean => /[0-9\-‑@&'"!()/]/.test(title);

function lines(words: string[], em: number, size: number, width: number): { count: number; widest: number } {
  let count = 1;
  let line = "";
  let widest = 0;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && next.length * em * size > width) {
      widest = Math.max(widest, line.length * em * size);
      count += 1;
      line = w;
    } else line = next;
  }
  widest = Math.max(widest, line.length * em * size);
  return { count, widest };
}

/**
 * Where the title block lands, estimated from character counts, as shares
 * of the stage. The page reports the real box through window.__b19.
 */
export function titleRect(
  p: { title: string; tagline: string; stack: string[]; href?: string },
  W: number,
  H: number,
): { title: Rect; block: Rect } {
  const rem = Math.min(48, Math.max(8, W * 0.0041667));
  const vw = W / 100;
  const size = TITLE.size * vw;
  const t = lines(p.title.split(" "), needsSans(p.title) ? INTER_EM : SERIF_EM, size, TITLE.width * vw);
  const titleH = t.count * size * TITLE.line;
  const tag = lines(p.tagline.split(" "), MONO_EM, TITLE.taglineRem * rem, TITLE.taglineWidth * vw);
  const plateH =
    2 * TITLE.platePadRem * rem +
    tag.count * TITLE.taglineRem * rem * 1.5 +
    (p.href ? 3 : 2) * (TITLE.detailRem * rem * 1.6 + 0.4 * rem);
  const counterH = TITLE.counterRem * rem * 1.4;
  const total = counterH + TITLE.gapRem * rem + titleH + TITLE.plateGapRem * rem + plateH;
  const top = (TITLE.middle / 100) * H - total / 2;
  const left = TITLE.left * vw;
  const tTop = top + counterH + TITLE.gapRem * rem;
  const plateW = Math.min(TITLE.taglineWidth * vw, tag.widest) + 2 * TITLE.platePadRem * rem;
  return {
    title: { x0: left / W, y0: tTop / H, x1: (left + t.widest) / W, y1: (tTop + titleH) / H },
    block: { x0: left / W, y0: top / H, x1: (left + Math.max(t.widest, plateW)) / W, y1: (top + total) / H },
  };
}

// ---------------------------------------------------------- the skills

/** The medallion grid on panel 5, relative to its centre. One row per group. */
export const SKILL = {
  rowTop: 0.34,
  rowPitch: 0.17,
  colLeft: -0.5,
  colPitch: 0.13,
  radius: 0.05,
  /** Where the group names start. */
  labelX: -0.9,
  /** The name under a medallion: its top, below the medallion's centre. */
  nameDrop: 0.062,
  nameWidth: 0.125,
  frame: { x0: -0.94, y0: -0.47, x1: 0.9, y1: 0.47 } as Rect,
};

export type SkillSpot = { group: number; index: number; x: number; y: number };

export function skillSpots(groupSizes: number[]): SkillSpot[] {
  const out: SkillSpot[] = [];
  groupSizes.forEach((n, g) => {
    for (let i = 0; i < n; i += 1) {
      out.push({ group: g, index: i, x: SKILL.colLeft + i * SKILL.colPitch, y: SKILL.rowTop - g * SKILL.rowPitch });
    }
  });
  return out;
}

/**
 * A world offset on the skills panel as CSS on the stage, for the names.
 * The camera parks straight on, showing skillsVh() of wall height, so one
 * world unit is 1 / skillsVh of the stage's height whatever its width.
 * The page keeps that number in --b19-sv.
 */
const SV = "var(--b19-sv, 1.2)";
export const skillCss = (x: number, y: number): { left: string; top: string } => ({
  left: `calc(50% + ${x.toFixed(4)} * var(--arbor-screen-h) / ${SV})`,
  top: `calc(50% - ${(y * 100).toFixed(3)}% / ${SV})`,
});
export const skillWidthCss = `calc(${SKILL.nameWidth} * var(--arbor-screen-h) / ${SV})`;

// --------------------------------------------------------- the contact

/** The warm spot the light narrows to, relative to panel 6's centre, and its half size. */
export const SPOT = { x: 0, y: 0.04, rx: 0.72, ry: 0.28 };
/** The shader keeps the spot at full light out to this share of its half size, then fades to its edge. */
export const SPOT_FULL = 0.7;

// ----------------------------------------------------------- the light

/** Height of the light above the wall. Low, so the carving throws long shadows. */
export const LIGHT_Z = 0.36;
/** Distance at which the pool of light is half as strong. */
export const POOL_R = 1.1;

/** Where the light wanders on its own for a camera and a clock. */
export function lightBase(cam: Cam, time: number, u: number): { x: number; y: number } {
  const skills = smooth(5.2, 6.0, u) * (1 - smooth(7.0, 7.6, u));
  const contact = smooth(7.2, 7.9, u);
  // Over the carved subject on the right, drifting slowly.
  let x = cam.x + 0.34 + 0.2 * Math.sin(time * 0.23) + 0.06 * Math.sin(time * 0.61 + 2);
  let y = 0.16 + 0.14 * Math.sin(time * 0.31 + 1.3);
  x = lerp(x, cam.x + 0.1 + 0.45 * Math.sin(time * 0.17), skills);
  y = lerp(y, 0.3 + 0.08 * Math.sin(time * 0.29), skills);
  x = lerp(x, cam.x + SPOT.x, contact);
  y = lerp(y, SPOT.y, contact);
  return { x, y };
}

/**
 * The shading, as the shader does it, for the check. n is the surface
 * normal, p the point (world), light the light. Returns 0..1, 1 = the
 * ground colour with no bar, low = a wide plum bar.
 */
export function brightness(
  n: [number, number, number],
  p: [number, number, number],
  light: [number, number, number],
  shadow = 1,
  dim = 0,
  spot = 0,
  lintel = 1,
): number {
  const tx = light[0] - p[0];
  const ty = light[1] - p[1];
  const tz = light[2] - p[2];
  const len = Math.hypot(tx, ty, tz);
  const lx = tx / len;
  const ly = ty / len;
  const lz = tz / len;
  const ndl = n[0] * lx + n[1] * ly + n[2] * lz;
  const lam = clamp(ndl / Math.max(lz, 0.12), 0, 1.2);
  const r = Math.hypot(tx, ty);
  const pool = 1 / (1 + (r * r) / (POOL_R * POOL_R));
  let b = (0.3 + 0.7 * lam * shadow) * lerp(0.8, 1, pool);
  const dark = 0.12 + 0.16 * lam * shadow;
  b = lerp(b, lerp(dark, b, spot), dim);
  b *= lintel;
  return clamp(b, 0.03, 1);
}

// ------------------------------------------------------ what is shown

/** How much of project i's title shows at scroll u, 0..1. */
export function titleAmount(i: number, u: number): number {
  const h = HOLDS[i];
  const fadeIn = i === 0 ? smooth(-0.75, -0.45, u) : smooth(h.from - 0.12, h.from + 0.08, u);
  return fadeIn * (1 - smooth(h.to - 0.08, h.to + 0.12, u));
}
export const skillsAmount = (u: number): number => smooth(6.0, 6.15, u) * (1 - smooth(6.85, 7.0, u));
export const contactAmount = (u: number): number => smooth(7.45, 7.85, u);
export const dimAt = (u: number): number => smooth(7.1, 7.8, u);
/** The top of the stage goes dark while it comes up under the band, so it joins it. */
export const lintelAt = (u: number): number => 1 - smooth(-0.1, 0.45, u);
/** How far down the stage the dark top reaches, share of its height. */
export const LINTEL_DEPTH = 0.24;

/**
 * The one still frame for a visitor who asked for less motion, or a small
 * screen: the robot's frame, centred, with the top dark to meet the band.
 */
export function stillCamera(aspect: number): Cam {
  const vh = Math.max(VH_WORK, (2 * 0.5) / aspect);
  return { x: panelX(ROBOT_PANEL) + 0.4, y: 0, z: distFor(vh), yaw: 0, vh, panel: ROBOT_PANEL };
}

/** The wall's ground, the colour between the bars. */
export const PALE = "#fde3f0";

/** Columns of the dither. Rows follow from the stage's shape so the cells are square. */
export const COLS = 240;
export const rowsFor = (aspect: number): number => Math.max(40, Math.round(COLS / Math.max(0.5, aspect)));
/** Cells brighter than this (0..255) are left as bare ground. */
export const THRESHOLD = 246;
