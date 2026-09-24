/**
 * Where everything in the tree stands, and where the camera is for any
 * amount of scroll. Plain numbers only: no page, no GPU, no three. A Node
 * script imports this and prints where each branch lands on the screen,
 * so the layout can be checked without a browser.
 *
 * World units are the tree generator's own, scaled. y is up. The trunk
 * stands on the origin and the camera looks at it from +z.
 */

export type V3 = [number, number, number];

export const FOV = 40;
export const NEAR = 0.2;
export const FAR = 260;

// ------------------------------------------------------------ the trunk

/** Where the trunk ends and the crown (a whole generated tree) takes over. */
export const TRUNK_TOP = 31;
export const TRUNK_BASE_RADIUS = 1.15;
/** The crown tree's own trunk is 0.48 thick in its units; times CROWN_SCALE this matches it. */
export const CROWN_SCALE = 1.7;
export const TRUNK_TOP_RADIUS = 0.48 * CROWN_SCALE * 0.95;

/** The trunk leans a little one way and then the other, so it does not read as a pole. */
export function trunkX(y: number): number {
  return 0.55 * Math.sin(y * 0.11) - 0.35 * Math.sin(y * 0.05 + 1.0) + 0.295;
}

export function trunkRadius(y: number): number {
  const t = Math.min(1, Math.max(0, y / TRUNK_TOP));
  // A flare at the foot, where the roots go in.
  const flare = 0.55 * Math.exp(-y * 1.3);
  return TRUNK_BASE_RADIUS + (TRUNK_TOP_RADIUS - TRUNK_BASE_RADIUS) * Math.pow(t, 0.8) + flare;
}

// --------------------------------------------------------- the branches

/**
 * The generator's spray stem, as generateSpray lays it out (BareThreeCanvas,
 * createSprayStem): 7.4 units along -x, rising and then bowing. Copied here
 * only so the Node check knows roughly where the wood is; the scene uses
 * the real generated branch.
 */
export const SPRAY_LENGTH = 7.4;
export const SPRAY_SPINE: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [0.125, 0.043, 0.011],
  [0.25, 0.078, 0.016],
  [0.375, 0.095, 0.008],
  [0.5, 0.084, -0.007],
  [0.625, 0.051, -0.016],
  [0.75, 0.003, -0.011],
  [0.875, -0.057, 0.003],
  [1, -0.122, 0.014],
];
/** The sprigs stand up to about 1.9 units off the stem, and droop a little under it. */
export const SPRIG_UP = 1.9;
export const SPRIG_DOWN = 0.55;

export const SPRAY_SCALE = 1.15;
/** How far each branch turns toward the camera from straight out sideways. */
export const BRANCH_TOWARD = 0.3;

export type BranchDef = { y: number; side: -1 | 1 };

/** One per project, left and right up the trunk. */
export const BRANCHES: readonly BranchDef[] = [
  { y: 5.2, side: -1 },
  { y: 10.9, side: 1 },
  { y: 16.6, side: -1 },
  { y: 22.3, side: 1 },
  { y: 28.0, side: -1 },
];

/** Turn about y that lays the spray's -x stem out on its side, a little toward the camera. */
export function branchYaw(i: number): number {
  return BRANCHES[i].side < 0 ? BRANCH_TOWARD : Math.PI - BRANCH_TOWARD;
}

/** Where the cut end of branch i goes into the trunk. */
export function branchRoot(i: number): V3 {
  const b = BRANCHES[i];
  return [trunkX(b.y) + b.side * trunkRadius(b.y) * 0.55, b.y, 0.15];
}

/** A point in the spray's own frame, carried out to the world for branch i. */
export function branchLocalToWorld(i: number, p: V3): V3 {
  const yaw = branchYaw(i);
  const s = SPRAY_SCALE;
  const x = p[0] * s;
  const y = p[1] * s;
  const z = p[2] * s;
  const c = Math.cos(yaw);
  const n = Math.sin(yaw);
  const r = branchRoot(i);
  // three's rotation about y: x' = x cos + z sin, z' = -x sin + z cos.
  return [r[0] + x * c + z * n, r[1] + y, r[2] - x * n + z * c];
}

/** The stem at t (0 at the trunk, 1 at the tip), in the spray's frame. */
export function sprayStem(t: number): V3 {
  const k = Math.min(SPRAY_SPINE.length - 2, Math.floor(t * (SPRAY_SPINE.length - 1)));
  const a = SPRAY_SPINE[k];
  const b = SPRAY_SPINE[k + 1];
  const f = (t - a[0]) / (b[0] - a[0]);
  const L = SPRAY_LENGTH;
  return [-t * L, (a[1] + (b[1] - a[1]) * f) * L, (a[2] + (b[2] - a[2]) * f) * L];
}

/** Where on the stem each project's object hangs, and how far below it. */
export const HANG_T = 0.6;
export const HANG_DROP = 1.55;
/** The objects are about this big across. */
export const HANG_SIZE = 0.95;

export function hangAnchor(i: number): V3 {
  return branchLocalToWorld(i, sprayStem(HANG_T));
}

/** A cloud of points around branch i: stem, sprigs above, droop below, and the object. */
export function branchEnvelope(i: number): V3[] {
  const out: V3[] = [];
  for (let k = 0; k <= 16; k += 1) {
    const t = k / 16;
    const p = sprayStem(t);
    out.push(branchLocalToWorld(i, p));
    // The sprigs lean toward the tip and to either side (z in the spray's frame).
    const up = SPRIG_UP * Math.sin(Math.PI * (0.15 + 0.8 * t));
    out.push(branchLocalToWorld(i, [p[0] - 0.4, p[1] + up, p[2] + 0.6]));
    out.push(branchLocalToWorld(i, [p[0] - 0.4, p[1] + up, p[2] - 0.6]));
    out.push(branchLocalToWorld(i, [p[0], p[1] - SPRIG_DOWN, p[2]]));
  }
  const a = hangAnchor(i);
  const h = HANG_SIZE / 2;
  out.push([a[0] - h, a[1] - HANG_DROP - HANG_SIZE, a[2]]);
  out.push([a[0] + h, a[1] - HANG_DROP - HANG_SIZE, a[2]]);
  return out;
}

// ------------------------------------------------------------ the crown

/**
 * The crown is the hero's whole generated tree, rooted on the trunk top
 * and scaled by CROWN_SCALE. Its canopy lobes (createCanopyLobes) sit
 * between about 3.9 and 8.9 of its units up and 8 either side, so in the
 * world the blossom mass spans roughly y 37.6 to 46 and x -13.7 to 13.3.
 */
export const CROWN_BASE: V3 = [trunkX(TRUNK_TOP), TRUNK_TOP - 0.4, 0];

/** The five clusters of skill blossoms on the front of the crown, one per group. */
export const CLUSTERS: readonly { centre: V3; spread: number }[] = [
  { centre: [-9.6, 41.4, 6.2], spread: 1.05 },
  { centre: [-3.6, 43.4, 7.0], spread: 1.05 },
  { centre: [3.8, 43.0, 7.0], spread: 1.05 },
  { centre: [9.8, 41.2, 6.2], spread: 1.05 },
  { centre: [0.2, 38.9, 8.0], spread: 1.05 },
];
/** How many skills each group has, in profile.ts order. The scene reads the real counts; this is for Node. */
export const GROUP_SIZES = [7, 11, 10, 7, 7];
export const SKILL_BLOSSOM_SIZE = 0.62;

/**
 * Blossom k of a cluster: a sunflower spiral, so any count packs evenly
 * with no two on top of each other.
 */
export function skillBlossomPos(group: number, k: number): V3 {
  const c = CLUSTERS[group];
  const golden = 2.399963;
  const r = c.spread * Math.sqrt(k + 0.5);
  const a = k * golden + group * 1.3;
  return [c.centre[0] + r * Math.cos(a), c.centre[1] + r * Math.sin(a) * 0.9, c.centre[2] + 0.25 * Math.sin(a * 2)];
}

// ----------------------------------------------------------- the scroll

/** Screens of scroll for each section. The stage is pinned across all of them. */
export const WORK_SCREENS = 6.6;
export const SKILLS_SCREENS = 2.0;
export const CONTACT_SCREENS = 1.0;
export const TOTAL_SCREENS = WORK_SCREENS + SKILLS_SCREENS + CONTACT_SCREENS;
/** Scroll, in screens, at the very end: the contact section fills the screen. */
export const U_END = TOTAL_SCREENS - 1;

/** The scroll at which the camera is level with branch i. */
export const STOP_U = [0.75, 1.8, 2.85, 3.9, 4.95];
/** How long the camera rests at each stop, either side. */
export const HOLD = 0.22;
/** A project's text shows while the scroll is this close to its stop. */
export const CARD_REACH = 0.44;
export const SKILLS_FROM = 6.75;
export const SKILLS_TO = 7.5;
export const CONTACT_AT = 8.45;

/** How far the camera stands from what it looks at, at a branch stop. */
export const STOP_DIST = 14.2;

export type Pose = { pos: V3; target: V3 };

function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * The camera at branch i. It looks at a point beside the branch's middle,
 * on the text's side, so the branch fills its own half of the screen and
 * the text has the other. It stands a little off square, on the text's
 * side, so the branch runs away from it into the picture.
 */
export function stopPose(i: number): Pose {
  const b = BRANCHES[i];
  const mid = branchLocalToWorld(i, sprayStem(0.5));
  const target: V3 = [mid[0] - b.side * 3.35, b.y + 0.55, mid[2] * 0.4];
  const turn = -b.side * 0.2;
  const pos = add(target, [STOP_DIST * Math.sin(turn), -0.9, STOP_DIST * Math.cos(turn)]);
  return { pos, target };
}

/** At the foot of the tree, before the first branch: the trunk rising out of the bottom edge. */
export const START_POSE: Pose = { pos: [0.6, 2.2, 15.5], target: [0.3, 6.2, 0] };
/** The whole crown, framed wide, for the skills. */
export const SKILLS_POSE: Pose = { pos: [0, 41.0, 30.5], target: [0, 42.2, 3] };
/** Above the crown in open sky, its top just showing at the foot of the screen. */
export const CONTACT_POSE: Pose = { pos: [0, 53.5, 30], target: [0, 55.5, 0] };
/** The still frame: the whole tree in bloom. */
export const STILL_POSE: Pose = { pos: [-4, 23, 78], target: [0, 24.5, 0] };

type Key = { u: number; pose: Pose };

function keys(): Key[] {
  const out: Key[] = [{ u: 0, pose: START_POSE }, { u: 0.2, pose: START_POSE }];
  for (let i = 0; i < BRANCHES.length; i += 1) {
    const p = stopPose(i);
    out.push({ u: STOP_U[i] - HOLD, pose: p }, { u: STOP_U[i] + HOLD, pose: p });
  }
  out.push({ u: SKILLS_FROM, pose: SKILLS_POSE }, { u: SKILLS_TO, pose: SKILLS_POSE });
  out.push({ u: CONTACT_AT, pose: CONTACT_POSE }, { u: U_END + 0.01, pose: CONTACT_POSE });
  return out;
}
export const KEYS: readonly Key[] = keys();

const ease = (t: number): number => t * t * (3 - 2 * t);
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const smooth = (a: number, b: number, v: number): number => ease(clamp((v - a) / (b - a), 0, 1));

/** The camera for any scroll, eased between the resting poses. Writes into `out`. */
export function poseAt(u: number, out: Pose): Pose {
  const k = KEYS;
  let j = 0;
  while (j < k.length - 2 && u > k[j + 1].u) j += 1;
  const a = k[j];
  const b = k[j + 1];
  const t = ease(clamp((u - a.u) / Math.max(1e-6, b.u - a.u), 0, 1));
  for (let n = 0; n < 3; n += 1) {
    out.pos[n] = a.pose.pos[n] + (b.pose.pos[n] - a.pose.pos[n]) * t;
    out.target[n] = a.pose.target[n] + (b.pose.target[n] - a.pose.target[n]) * t;
  }
  return out;
}

/** How open branch i's blossoms are at scroll u: buds until just before the camera arrives. */
export function branchBloom(i: number, u: number): number {
  return smooth(STOP_U[i] - 0.75, STOP_U[i] - 0.12, u);
}

/** How much a project's text shows at scroll u. */
export function cardAmount(i: number, u: number): number {
  const d = Math.abs(u - STOP_U[i]);
  return 1 - smooth(CARD_REACH - 0.14, CARD_REACH, d);
}

/** Crown blossoms open as the camera climbs past the last branch. */
export function crownBloom(u: number): number {
  return smooth(5.3, 6.5, u);
}

/** The ground goes from plum to blossom as the camera comes out above the crown. */
export function skyAmount(u: number): number {
  return smooth(7.65, 8.3, u);
}

// ------------------------------------------------------ the projection

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
  // right = f x up, up' = right x f
  let r: V3 = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d: V3 = [p[0] - pose.pos[0], p[1] - pose.pos[1], p[2] - pose.pos[2]];
  const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const xr = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const yr = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const half = Math.tan((FOV * Math.PI) / 360);
  const ndcX = xr / (depth * half * aspect);
  const ndcY = yr / (depth * half);
  return { x: 0.5 + ndcX * 0.5, y: 0.5 - ndcY * 0.5, depth };
}

// ------------------------------------------------------------ the text

/** The project text sits on the side away from its branch. Shares of the stage. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export const CARD_WIDTH = 0.29;
export const CARD_EDGE = 0.05;
export function cardRect(i: number): Rect {
  const left = BRANCHES[i].side > 0;
  const x0 = left ? CARD_EDGE : 1 - CARD_EDGE - CARD_WIDTH;
  return { x0, y0: 0.3, x1: x0 + CARD_WIDTH, y1: 0.72 };
}
