/**
 * Where everything stands, which season it is, and where the camera is,
 * for any amount of scroll. Plain numbers only: no page, no GPU, no three.
 * A Node script imports this with the real tree's points and prints where
 * each plaque lands on screen, so the layout is checked without a browser.
 *
 * World units are the tree generator's own. y is up. The trunk stands on
 * the origin, on the crest of the hill. An angle `az` around the trunk
 * means the point (r cos az, y, r sin az).
 */

export type V3 = [number, number, number];

export const FOV = 38;
export const NEAR = 0.2;
export const FAR = 220;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const ease = (t: number): number => t * t * (3 - 2 * t);
export const smooth = (a: number, b: number, v: number): number => ease(clamp((v - a) / (b - a), 0, 1));
export const DEG = Math.PI / 180;

// -------------------------------------------------------------- the hill

/** Ground height at a distance r from the trunk. The trunk's foot sinks in a little. */
export function hillY(r: number): number {
  return 0.3 - 6.5 * (1 - Math.exp(-((r / 17) ** 2)));
}
export const HILL_RADIUS = 70;

// ------------------------------------------------------------ the plaques

/**
 * Each project hangs on a small wooden plaque (an ema) from a limb of the
 * tree. The hooks are points on the real wood, found by the Node script
 * that grows the tree (tree seed in tuning.ts); the scene checks them
 * against the grown tree and moves a string's top onto the nearest wood.
 */
export const HOOKS: readonly V3[] = [
  [3.316, 5.086, 1.71],
  [-1.316, 5.955, 2.629],
  [-2.787, 6.254, -0.566],
  [0.902, 6.024, -2.75],
  [2.822, 6.603, -1.575],
];
/** From the hook down to the plaque's top edge. */
export const STRING = 1.25;
/** The plaque: a board with a pitched top, like a small house front. */
export const PLAQUE_W = 1.15;
export const PLAQUE_H = 0.82;
export const PLAQUE_D = 0.07;

export const plaqueAz = (i: number): number => Math.atan2(HOOKS[i][2], HOOKS[i][0]);

/** The middle of plaque i's face. */
export function plaqueCentre(i: number): V3 {
  const h = HOOKS[i];
  return [h[0], h[1] - STRING - PLAQUE_H / 2, h[2]];
}

/** The plaque's outline corners, turned to face `faceAz`. For the Node check. */
export function plaqueCorners(i: number, faceAz: number): V3[] {
  const c = plaqueCentre(i);
  // The face's own right, for a face whose normal points along faceAz.
  const rx = -Math.sin(faceAz);
  const rz = Math.cos(faceAz);
  const w = PLAQUE_W / 2;
  const h = PLAQUE_H / 2;
  return [
    [c[0] - rx * w, c[1] - h, c[2] - rz * w],
    [c[0] + rx * w, c[1] - h, c[2] + rz * w],
    [c[0] + rx * w, c[1] + h * 0.45, c[2] + rz * w],
    [c[0], c[1] + h, c[2]],
    [c[0] - rx * w, c[1] + h * 0.45, c[2] - rz * w],
  ];
}

// -------------------------------------------------------------- the lantern

/** A stone lantern under the tree, lit at night. Its foot is on the ground. */
export const LANTERN_AZ = 72 * DEG;
export const LANTERN_R = 3.4;
export const LANTERN_POS: V3 = [LANTERN_R * Math.cos(LANTERN_AZ), hillY(LANTERN_R), LANTERN_R * Math.sin(LANTERN_AZ)];
export const LANTERN_H = 1.9;

// ---------------------------------------------------------- the skill blossoms

/** How many skills each group has, in profile.ts order. The scene reads the real counts; this is for Node. */
export const GROUP_SIZES = [7, 11, 10, 7, 7];
export const SKILL_BLOSSOM_SIZE = 0.36;
export const SKILL_SPREAD = 0.4;

/** The camera looks at the crown from this side for the skills. */
export const SKILLS_AZ = 380 * DEG;

/**
 * Cluster centres: angle off the camera's side, height, and distance from
 * the trunk. On the front of the crown, three high and two low, just
 * outside the blossoms there (the canopy reaches about 8 from the trunk on
 * this side).
 */
export const CLUSTERS: readonly { da: number; y: number; r: number }[] = [
  { da: 34 * DEG, y: 8.2, r: 8.2 },
  { da: 0, y: 8.7, r: 8.4 },
  { da: -34 * DEG, y: 8.2, r: 8.2 },
  { da: 17 * DEG, y: 5.8, r: 9.0 },
  { da: -17 * DEG, y: 5.8, r: 9.0 },
];

/** Blossom k of a cluster: a sunflower spiral, so any count packs evenly. Laid out across the camera's view. */
export function skillBlossomPos(group: number, k: number): V3 {
  const c = CLUSTERS[group];
  const a = SKILLS_AZ + c.da;
  const cx = c.r * Math.cos(a);
  const cz = c.r * Math.sin(a);
  // The camera's right on this side of the tree.
  const rx = -Math.sin(SKILLS_AZ);
  const rz = Math.cos(SKILLS_AZ);
  const r = SKILL_SPREAD * Math.sqrt(k + 0.5);
  const t = k * 2.399963 + group * 1.3;
  const side = r * Math.cos(t);
  return [cx + rx * side, c.y + r * Math.sin(t) * 0.9, cz + rz * side];
}

// -------------------------------------------------------------- the scroll

/** Screens of scroll for each section. The stage is pinned across all of them. */
export const WORK_SCREENS = 6;
export const SKILLS_SCREENS = 2;
export const CONTACT_SCREENS = 1;
export const TOTAL_SCREENS = WORK_SCREENS + SKILLS_SCREENS + CONTACT_SCREENS;
/** Scroll, in screens, at the very end: the contact section fills the screen. */
export const U_END = TOTAL_SCREENS - 1;

/** The scroll at which plaque i is in front: winter, spring, summer, autumn, winter. */
export const STOP_U = [0.55, 1.55, 2.55, 3.55, 4.55];
export const HOLD = 0.2;
/**
 * The skills layer is a sticky block in its own section, so it is pinned
 * only from WORK_SCREENS to WORK_SCREENS + 1. The skills live inside that.
 */
export const SKILLS_FROM = 6.1;
export const SKILLS_TO = 6.8;
export const CONTACT_AT = 7.6;
/** A project's text shows while the scroll is this close to its stop. */
export const CARD_REACH = 0.42;

export const SEASON_NAMES = ["Winter", "Spring", "Summer", "Autumn", "Winter"];

/**
 * The season as one number: 0 winter, 1 spring, 2 summer, 3 autumn,
 * 4 winter, 5 spring again (the skills). It holds still at each stop and
 * turns between them.
 */
const SEASON_KEYS: readonly [number, number][] = [
  [0, 0],
  [STOP_U[0] + HOLD, 0],
  [STOP_U[1] - HOLD, 1],
  [STOP_U[1] + HOLD, 1],
  [STOP_U[2] - HOLD, 2],
  [STOP_U[2] + HOLD, 2],
  [STOP_U[3] - HOLD, 3],
  [STOP_U[3] + HOLD, 3],
  [STOP_U[4] - HOLD, 4],
  [STOP_U[4] + HOLD, 4],
  [SKILLS_FROM - 0.1, 5],
  [U_END + 1, 5],
];

export function seasonAt(u: number): number {
  const k = SEASON_KEYS;
  let j = 0;
  while (j < k.length - 2 && u > k[j + 1][0]) j += 1;
  const t = clamp((u - k[j][0]) / Math.max(1e-6, k[j + 1][0] - k[j][0]), 0, 1);
  return k[j][1] + (k[j + 1][1] - k[j][1]) * t;
}

/** What the tree carries in season s. Each 0..1. */
export type Look = {
  /** How open the blossoms are. */
  bloom: number;
  /** How many leaves are on. */
  leaves: number;
  /** Summer green to autumn (drawn as a lighter leaf, since the bars see brightness only). */
  turn: number;
  /** Snow falling and lying on the hill. */
  snow: number;
  /** Petals let go this hard. */
  petalFall: number;
  /** Leaves let go this hard. */
  leafFall: number;
};

export function lookAt(s: number, out: Look): Look {
  out.bloom = Math.max(smooth(0.15, 0.95, s) * (1 - smooth(1.3, 1.75, s)), smooth(4.2, 4.95, s));
  out.leaves = smooth(1.45, 1.9, s) * (1 - smooth(3.1, 3.85, s));
  out.turn = smooth(2.3, 2.95, s);
  out.snow = Math.max(1 - smooth(0.3, 0.75, s), smooth(3.55, 3.95, s) * (1 - smooth(4.3, 4.7, s)));
  out.petalFall = Math.max(smooth(0.8, 1.2, s) * (1 - smooth(1.75, 1.9, s)), 0.35 * smooth(4.8, 5, s));
  out.leafFall = smooth(2.75, 3.05, s) * (1 - smooth(3.8, 3.95, s));
  return out;
}

/** How much the page has gone to night: the contact. */
export function nightAt(u: number): number {
  return smooth(6.95, 7.5, u);
}

/** How much a project's text shows at scroll u. */
export function cardAmount(i: number, u: number): number {
  const d = Math.abs(u - STOP_U[i]);
  return 1 - smooth(CARD_REACH - 0.14, CARD_REACH, d);
}

/** How far plaque i has come forward: turned to face the camera. */
export function plaqueForward(i: number, u: number): number {
  return 1 - smooth(HOLD, HOLD + 0.45, Math.abs(u - STOP_U[i]));
}

/** Skills layer, only while the skills section is pinned. */
export function skillsAmount(u: number): number {
  return smooth(6.0, 6.15, u) * (1 - smooth(6.85, 7.0, u));
}

// -------------------------------------------------------------- the camera

/**
 * The camera goes round the tree on a circle, one way only, so it never
 * cuts through the crown. Each key is a place on that circle (angle,
 * distance from the trunk, height) and a point to look at. Between keys
 * the angle, distance and height are eased on their own, which keeps the
 * camera outside the crown: every key is at least 9 from the trunk.
 */
export type Key = { u: number; az: number; r: number; y: number; target: V3 };
export type Pose = { pos: V3; target: V3 };

export const ASPECT = 1920 / 1038;
const TAN = Math.tan((FOV * DEG) / 2);
/** Where the plaque sits across the screen at its stop: left for even stops, right for odd. */
export const plaqueSide = (i: number): -1 | 1 => (i % 2 === 0 ? -1 : 1);
export const PLAQUE_SCREEN_X = 0.29;
export const STOP_R = 9.6;
/** The camera stands a little round from the plaque's own angle, alternately. */
export const STOP_TURN = 16 * DEG;

/** The unwrapped camera angle for stop i. The plaques are in order round the trunk. */
function stopAz(i: number): number {
  let a = plaqueAz(0);
  for (let k = 1; k <= i; k += 1) {
    let next = plaqueAz(k);
    while (next < a) next += Math.PI * 2;
    a = next;
  }
  return a - plaqueSide(i) * STOP_TURN;
}

export function stopKey(i: number, u: number): Key {
  const c = plaqueCentre(i);
  const az = stopAz(i);
  const y = c[1] + 0.35;
  const pos: V3 = [STOP_R * Math.cos(az), y, STOP_R * Math.sin(az)];
  // Look past the plaque, shifted sideways so it lands at PLAQUE_SCREEN_X.
  const dx = c[0] - pos[0];
  const dz = c[2] - pos[2];
  const d = Math.hypot(dx, dz);
  // Camera right when looking along (dx, dz).
  const rx = -dz / d;
  const rz = dx / d;
  const ndc = plaqueSide(i) < 0 ? PLAQUE_SCREEN_X * 2 - 1 : (1 - PLAQUE_SCREEN_X) * 2 - 1;
  const shift = -ndc * d * TAN * ASPECT;
  const target: V3 = [c[0] + rx * shift, c[1] + 0.55, c[2] + rz * shift];
  return { u, az, r: STOP_R, y, target };
}

const TREE_MID: V3 = [0, 5.2, 0];

function keys(): Key[] {
  const out: Key[] = [];
  const first = stopKey(0, 0);
  // The start: back on the hill, the whole tree in winter.
  out.push({ u: 0, az: first.az - 0.35, r: 23, y: 4.2, target: [0, 5.4, 0] });
  for (let i = 0; i < STOP_U.length; i += 1) {
    const a = stopKey(i, STOP_U[i] - HOLD);
    out.push(a, { ...stopKey(i, STOP_U[i] + HOLD) });
    if (i < STOP_U.length - 1) {
      // Halfway to the next plaque: stand back to see the whole tree turn.
      const b = stopKey(i + 1, 0);
      out.push({ u: (STOP_U[i] + STOP_U[i + 1]) / 2, az: (a.az + b.az) / 2, r: 21, y: 5.5, target: TREE_MID });
    }
  }
  const last = out[out.length - 1];
  let skillsAz = SKILLS_AZ;
  while (skillsAz < last.az + 0.3) skillsAz += Math.PI * 2;
  out.push({ u: SKILLS_FROM, az: skillsAz, r: 18.5, y: 7.4, target: [0, 7.2, 0] });
  out.push({ u: SKILLS_TO, az: skillsAz, r: 18.5, y: 7.4, target: [0, 7.2, 0] });
  out.push({ u: CONTACT_AT, az: skillsAz + 0.55, r: 25, y: 0.6, target: [0, 8.4, 0] });
  out.push({ u: U_END + 0.01, az: skillsAz + 0.62, r: 25, y: 0.6, target: [0, 8.4, 0] });
  return out;
}
export const KEYS: readonly Key[] = keys();

/** The camera for any scroll. Writes into `out`. */
export function poseAt(u: number, out: Pose): Pose {
  const k = KEYS;
  let j = 0;
  while (j < k.length - 2 && u > k[j + 1].u) j += 1;
  const a = k[j];
  const b = k[j + 1];
  const t = ease(clamp((u - a.u) / Math.max(1e-6, b.u - a.u), 0, 1));
  const az = a.az + (b.az - a.az) * t;
  const r = a.r + (b.r - a.r) * t;
  out.pos[0] = r * Math.cos(az);
  out.pos[1] = a.y + (b.y - a.y) * t;
  out.pos[2] = r * Math.sin(az);
  for (let n = 0; n < 3; n += 1) out.target[n] = a.target[n] + (b.target[n] - a.target[n]) * t;
  return out;
}

/** The still frame: the whole tree in bloom, from the skills side. */
export const STILL_POSE: Pose = {
  pos: [24 * Math.cos(SKILLS_AZ + 0.2), 5.5, 24 * Math.sin(SKILLS_AZ + 0.2)],
  target: [0, 5.6, 0],
};

// ------------------------------------------------------------ projection

/**
 * A world point onto the screen for a camera at `pose`: x and y as shares
 * of the width and height from the top left, and the distance in front of
 * the camera (negative is behind it). The same maths three does for a
 * PerspectiveCamera with this FOV looking at the target with y up.
 */
export function project(p: V3, pose: Pose, aspect: number): { x: number; y: number; depth: number } {
  const f: V3 = [pose.target[0] - pose.pos[0], pose.target[1] - pose.pos[1], pose.target[2] - pose.pos[2]];
  const fl = Math.hypot(f[0], f[1], f[2]);
  f[0] /= fl;
  f[1] /= fl;
  f[2] /= fl;
  let r: V3 = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const up: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d: V3 = [p[0] - pose.pos[0], p[1] - pose.pos[1], p[2] - pose.pos[2]];
  const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const xr = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const yr = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
  const ndcX = xr / (depth * TAN * aspect);
  const ndcY = yr / (depth * TAN);
  return { x: 0.5 + ndcX * 0.5, y: 0.5 - ndcY * 0.5, depth };
}

// ------------------------------------------------------------ the words

/** The project text sits on the other side of the screen from its plaque. Shares of the stage. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export const CARD_WIDTH = 0.32;
export function cardRect(i: number): Rect {
  const right = plaqueSide(i) < 0;
  const x0 = right ? 0.58 : 0.1;
  return { x0, y0: 0.3, x1: x0 + CARD_WIDTH, y1: 0.74 };
}
