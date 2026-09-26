/**
 * Where everything in the garden is, and where the camera stands for any
 * amount of scroll. No imports, no DOM, no GPU: a Node script loads this
 * file on its own and prints what the scene will draw.
 *
 * World axes: x runs along the garden (left to right as seen), y is up,
 * z comes toward the viewer. The wall is at the back, at WALL_Z. The
 * camera never turns left or right; it only tilts down by `pitch`. That
 * keeps projecting a point a few lines of arithmetic.
 *
 * Screen positions are shares of the stage: sx 0 at the left, 1 at the
 * right; sy 0 at the top, 1 at the bottom.
 */

/** Vertical field of view, degrees. */
export const FOV = 45;
export const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
export const NEAR = 0.1;
export const FAR = 80;

/** World distance between two raked grooves. */
export const SPACING = 0.34;
/** The front face of the garden wall, and how tall it is to the eaves. */
export const WALL_Z = -5;
export const WALL_H = 2;
/** Where the sand is: the rake texture covers exactly this. */
export const SAND = { x0: -14, z0: WALL_Z, x1: 74, z1: 10 };

export const WORK = 5;
/** Screens of scroll the stage stays pinned: work 6, skills 2, contact 1, less the one on screen. */
export const SPAN = 8;

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const rad = (deg: number): number => (deg * Math.PI) / 180;

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Pose = { x: number; y: number; z: number; pitch: number };

// --------------------------------------------------------------- stones

export type StoneShape = "upright" | "leaning" | "boulder" | "slab" | "pair";
export type Stone = {
  shape: StoneShape;
  x: number;
  z: number;
  /** Half its width along x, half its depth along z, and its height above the sand. */
  halfW: number;
  halfD: number;
  h: number;
  /** Where its moss island ends; the rings start just past it. */
  moss: number;
  /** Which half of the screen the stone stands in; the words take the other. */
  side: "left" | "right";
  seed: number;
};

/** Five stones, one per project, nine units apart. Each a different shape. */
export const STONES: readonly Stone[] = [
  { shape: "upright", x: 0, z: -1, halfW: 0.55, halfD: 0.5, h: 1.55, moss: 1.05, side: "left", seed: 11 },
  { shape: "leaning", x: 9, z: -0.7, halfW: 0.95, halfD: 0.5, h: 1.2, moss: 1.1, side: "right", seed: 23 },
  { shape: "boulder", x: 18, z: -1.2, halfW: 0.85, halfD: 0.8, h: 0.62, moss: 1.2, side: "left", seed: 37 },
  { shape: "slab", x: 27, z: -0.8, halfW: 1.3, halfD: 0.72, h: 0.4, moss: 1.5, side: "right", seed: 41 },
  { shape: "pair", x: 36, z: -1, halfW: 1.3, halfD: 0.6, h: 0.9, moss: 1.45, side: "left", seed: 53 },
];

/** Rings every stone keeps, and how much further they reach round the stone the page is on. */
export const RINGS_KEPT = 3;
export const RINGS_REACH = 2.4;

// --------------------------------------------------------------- camera

/** Height and tilt of the camera at each stone, and how far in front of it. */
const STONE_Y = 2.4;
const STONE_PITCH = rad(-14);
const STONE_BACK = 6;
/** Where on the screen the stone's middle lands, by side. */
export const STONE_SX = { left: 0.3, right: 0.7 } as const;

/** Over open sand past the last stone: the pebbles. */
export const SKILLS_POSE: Pose = { x: 46, y: 6, z: 5.4, pitch: rad(-55) };
/** High above the far end, looking straight down. */
export const CONTACT_POSE: Pose = { x: 60, y: 9.5, z: 1.2, pitch: rad(-90) };

/** Camera basis for a pose: right is always +x. */
function basis(p: Pose): { up: [number, number, number]; fw: [number, number, number] } {
  const c = Math.cos(p.pitch);
  const s = Math.sin(p.pitch);
  return { up: [0, c, s], fw: [0, s, -c] };
}

/** Screen position of a world point, and its depth in front of the camera (below 0 is behind). */
export function project(p: Pose, aspect: number, x: number, y: number, z: number): { sx: number; sy: number; depth: number } {
  const { up, fw } = basis(p);
  const rx = x - p.x;
  const ry = y - p.y;
  const rz = z - p.z;
  const xc = rx;
  const yc = ry * up[1] + rz * up[2];
  const d = ry * fw[1] + rz * fw[2];
  const safe = Math.abs(d) < 1e-6 ? 1e-6 : d;
  return { sx: 0.5 + xc / (safe * TAN * aspect) / 2, sy: 0.5 - yc / (safe * TAN) / 2, depth: d };
}

/** Where a point on the screen meets the level plane y = planeY, or null if it looks above it. */
export function unproject(p: Pose, aspect: number, sx: number, sy: number, planeY = 0): { x: number; z: number; dist: number } | null {
  const { up, fw } = basis(p);
  const a = (2 * sx - 1) * TAN * aspect;
  const b = (1 - 2 * sy) * TAN;
  const dx = a;
  const dy = fw[1] + b * up[1];
  const dz = fw[2] + b * up[2];
  if (dy > -1e-5) return null;
  const s = (planeY - p.y) / dy;
  if (s <= 0) return null;
  return { x: p.x + dx * s, z: p.z + dz * s, dist: s * Math.hypot(dx, dy, dz) };
}

/** The camera at stone i: in front of it, shifted so the stone lands on its side of the screen. */
export function stonePose(i: number, aspect: number): Pose {
  const st = STONES[i];
  const pose: Pose = { x: st.x, y: STONE_Y, z: st.z + STONE_BACK, pitch: STONE_PITCH };
  const { fw } = basis(pose);
  const d = (st.h * 0.5 - pose.y) * fw[1] + (st.z - pose.z) * fw[2];
  const want = STONE_SX[st.side];
  pose.x = st.x - (2 * want - 1) * d * TAN * aspect;
  return pose;
}

/** Scroll, in screens since the stage pinned, at which each stop is held: five stones, skills, contact. */
export const STOP_U = [0.3, 1.3, 2.3, 3.3, 4.3, 6.5, 8] as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
function mix(a: Pose, b: Pose, t: number, lift: number): Pose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t) + lift * Math.sin(Math.PI * t),
    z: lerp(a.z, b.z, t),
    pitch: lerp(a.pitch, b.pitch, t),
  };
}

/**
 * The camera for any scroll u. Each stone is held for 0.6 of a screen and
 * the walk to the next takes 0.4. Then the long move to the pebbles, which
 * are held while the skills are read, then the rise to look straight down.
 */
export function poseAt(u: number, aspect: number): Pose {
  if (u <= 0.6) return stonePose(0, aspect);
  for (let i = 0; i < WORK - 1; i += 1) {
    if (u < i + 1) return mix(stonePose(i, aspect), stonePose(i + 1, aspect), smooth(i + 0.6, i + 1, u), 0.35);
    if (u <= i + 1.6) return stonePose(i + 1, aspect);
  }
  if (u < 6) return mix(stonePose(WORK - 1, aspect), SKILLS_POSE, smooth(4.6, 6, u), 0.8);
  if (u <= 7) return { ...SKILLS_POSE };
  if (u < 8) return mix(SKILLS_POSE, CONTACT_POSE, smooth(7, 8, u), 0.6);
  return { ...CONTACT_POSE };
}

/** How much the page is "at" stone i, 0 to 1: its rings reach out while this is up. */
export function presence(i: number, u: number): number {
  return smooth(i - 0.3, i + 0.25, u) * (1 - smooth(i + 0.7, i + 1.05, u));
}

/** How far the rings round the email have come in, 0 to 1. */
export const contactOn = (u: number): number => smooth(7.15, 7.95, u);

/** Opacity of project i's words. */
export function wordsOn(i: number, u: number): number {
  const inn = i === 0 ? 1 : smooth(i - 0.25, i + 0.02, u);
  const out = i === WORK - 1 ? 1 - smooth(4.62, 4.9, u) : 1 - smooth(i + 0.6, i + 0.8, u);
  return inn * out;
}

/** Which stop the camera is nearest, 0..6. */
export function stopAt(u: number): number {
  let best = 0;
  for (let k = 1; k < STOP_U.length; k += 1) if (Math.abs(u - STOP_U[k]) < Math.abs(u - STOP_U[best])) best = k;
  return best;
}

// ----------------------------------------------------------------- words

/** The panel of words beside stone i, as a share of the stage. Sizes match index.tsx. */
export const PANEL_W = 0.38;
export const PANEL_EDGE = 0.07;
export function panelBox(i: number): Box {
  const right = STONES[i].side === "left";
  const x0 = right ? 1 - PANEL_EDGE - PANEL_W : PANEL_EDGE;
  return { x0, x1: x0 + PANEL_W, y0: 0.24, y1: 0.76 };
}

/** The screen box round a stone: the eight corners of its bounds, projected. */
export function stoneBox(i: number, pose: Pose, aspect: number): Box & { nearest: number } {
  const st = STONES[i];
  const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, nearest: Infinity };
  for (const dx of [-st.halfW, st.halfW])
    for (const dz of [-st.halfD, st.halfD])
      for (const y of [0, st.h]) {
        const q = project(pose, aspect, st.x + dx, y, st.z + dz);
        out.x0 = Math.min(out.x0, q.sx);
        out.x1 = Math.max(out.x1, q.sx);
        out.y0 = Math.min(out.y0, q.sy);
        out.y1 = Math.max(out.y1, q.sy);
        out.nearest = Math.min(out.nearest, q.depth);
      }
  return out;
}

export const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// ---------------------------------------------------------------- skills

/** Screen height of each group's line of pebbles; the group's names sit at the same height on the right. */
export const SKILL_ROW_Y = [0.24, 0.36, 0.48, 0.6, 0.72] as const;
const PEBBLE_X0 = 0.075;
const PEBBLE_STEP = 0.037;
/** Pebble width as a share of the stage width. */
const PEBBLE_SIZE = 0.027;

export type Pebble = { group: number; k: number; x: number; z: number; r: number; sx: number; sy: number; turn: number };

/** Small seeded wobble so the lines look laid by hand. */
function wobble(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

/**
 * The pebbles, laid out on screen first and then set on the sand where
 * those screen points land, so each line reads straight whatever the
 * width. Every pebble is sized by its distance so they all look alike.
 */
export function pebbleLayout(aspect: number, groupSizes: readonly number[]): Pebble[] {
  const out: Pebble[] = [];
  groupSizes.forEach((n, g) => {
    for (let k = 0; k < n; k += 1) {
      const idx = out.length;
      const sx = PEBBLE_X0 + k * PEBBLE_STEP + (g % 2) * 0.01 + wobble(idx) * 0.006;
      const sy = SKILL_ROW_Y[g] + wobble(idx + 100) * 0.008;
      const hit = unproject(SKILLS_POSE, aspect, sx, sy, 0.05);
      if (!hit) continue;
      const r = PEBBLE_SIZE * hit.dist * TAN * aspect;
      out.push({ group: g, k, x: hit.x, z: hit.z, r, sx, sy, turn: wobble(idx + 200) * 1.2 });
    }
  });
  return out;
}

/** The skills words, as a share of the stage. Sizes match index.tsx. */
export const SKILLS_PANEL: Box = { x0: 0.54, x1: 0.93, y0: 0.16, y1: 0.8 };

// --------------------------------------------------------------- contact

/** Where the email and links sit in the last screen, as a share of it, until the page measures them. */
export const CONTACT_BOX: Box = { x0: 0.15, y0: 0.34, x1: 0.85, y1: 0.76 };
export const CONTACT_RING_REACH = 3.2;

/** A box on the last screen, turned into the rectangle of sand beneath it (centre x, z, half sizes). */
export function contactRect(aspect: number, box: Box): { cx: number; cz: number; hx: number; hz: number } {
  const p = CONTACT_POSE;
  const halfH = (p.y - 0) * TAN;
  const halfW = halfH * aspect;
  const x0 = p.x + (2 * box.x0 - 1) * halfW;
  const x1 = p.x + (2 * box.x1 - 1) * halfW;
  const z0 = p.z + (2 * box.y0 - 1) * halfH;
  const z1 = p.z + (2 * box.y1 - 1) * halfH;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2 };
}

// ----------------------------------------------------------------- trees

/** Five cherry trees behind the wall, one for every screen of garden. */
export const TREES = [
  { x: 3.5, seed: 3 },
  { x: 16, seed: 7 },
  { x: 30, seed: 13 },
  { x: 44, seed: 19 },
  { x: 58, seed: 29 },
] as const;
