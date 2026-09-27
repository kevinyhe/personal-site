/**
 * Where everything is at each point of the scroll. Plain numbers only: no
 * three, no DOM. The page and the Node check both read this file, so what
 * the check measures is what the page draws.
 *
 * The scroll is counted in screens from the top of the pinned stage:
 *   0 .. 6      work. Five stops; at each one part group comes off and
 *               one project is labelled on it.
 *   6 .. 8.5    skills. Everything is off and hangs in place; five groups
 *               carry the five skill groups.
 *   8.5 .. 10   contact. The parts fly back, the robot drives off.
 * The stage stays pinned until STAGE_END, then scrolls away with the email.
 */

import type { Vec3 } from "./parts";

export const FOV = 30; // vertical, degrees

/** Section heights, screens. */
export const WORK_H = 6;
export const SKILLS_H = 2.5;
export const CONTACT_H = 1.5;
export const STAGE_END = WORK_H + SKILLS_H + CONTACT_H - 1;

/** The part groups in the order they come off: wheels, drivetrain, lift, intake, back. */
export const ORDER = [0, 1, 2, 3, 4] as const;
/** Scroll positions (screens) of the five work stops. */
export const STOPS = [0.7, 1.65, 2.6, 3.55, 4.5] as const;
/** Where the skills and contact states sit, for the dev handle. */
export const SKILLS_AT = 6.7;
/** Put back together, about to drive off; then gone, the email alone. */
export const ASSEMBLED_AT = 8.3;
export const CONTACT_AT = 9;
export const GO_TO = [...STOPS, SKILLS_AT, ASSEMBLED_AT, CONTACT_AT] as const;

/** The robot's parts, measured from the glb (the check re-measures them). */
export const GROUP_CENTRES: Vec3[] = [
  { x: 0, y: 0.2, z: 0 },
  { x: 0.001, y: 0.057, z: 0.007 },
  { x: 0.002, y: 0.354, z: -0.003 },
  { x: 0.18, y: 0.133, z: 0 },
  { x: -0.083, y: 0.164, z: 0.005 },
  { x: 0.016, y: 0.175, z: -0.049 },
];
/** The wheel the wheels' leader points at: front right, which faces the lens. */
export const WHEEL_ANCHOR: Vec3 = { x: 0.1207, y: 0.0436, z: 0.1441 };
export const WHEEL_RADIUS = 0.03925;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** How far out each group is, 0..1. Out, it stays out until contact. */
export function explodeAt(group: number, s: number): number {
  const back = 1 - smooth(7.5, 8.05, s);
  if (group === 5) return smooth(4.85, 5.6, s) * back;
  const k = ORDER.indexOf(group as 0);
  const at = STOPS[k];
  return smooth(at - 0.55, at - 0.12, s) * back;
}

/** How visible work card k is, 0..1. */
export function cardAt(k: number, s: number): number {
  const at = STOPS[k];
  return smooth(at - 0.42, at - 0.18, s) * (1 - smooth(at + 0.22, at + 0.42, s));
}
/* The skills words are pinned from 6 to 7.5 and the contact words from
 * 8.5: each shows only while its layer is in place, or nearly. */
export const skillsAt = (s: number): number => smooth(5.95, 6.2, s) * (1 - smooth(7.3, 7.5, s));
export const contactAt = (s: number): number => smooth(8.1, 8.5, s);

/**
 * How bright each group is drawn, 0..1. At a work stop its group is lit
 * and the rest fall back; with nothing picked, all sit in the middle.
 */
export function litAt(group: number, s: number): number {
  const base = 0.5;
  let v = base;
  let focus = 0;
  STOPS.forEach((_, k) => {
    const c = cardAt(k, s);
    focus = Math.max(focus, c);
    if (ORDER[k] === group) v = Math.max(v, mix(base, 1, c));
  });
  // The others dim while one is picked.
  const picked = ORDER.some((g, k) => g === group && cardAt(k, s) > 0.001);
  if (!picked) v = mix(base, 0.12, focus);
  // All out for skills: all bright.
  return mix(v, 0.8, skillsAt(s));
}

export type Pose = {
  /** Camera. */
  eye: Vec3;
  target: Vec3;
  /** The robot's turn about its up axis, radians, and where it stands. */
  yaw: number;
  at: Vec3;
  /** How far its wheels have turned, radians. */
  roll: number;
};

type Shot = { tx: number; ty: number; dist: number; elev: number; yaw: number };
/** The robot on the right, the words on the left. */
const WORK_A: Shot = { tx: -0.43, ty: 0.2, dist: 2.4, elev: 0.3, yaw: -0.35 };
const WORK_B: Shot = { tx: -0.43, ty: 0.2, dist: 2.4, elev: 0.3, yaw: -0.95 };
/** The robot in the middle, the skills round it. */
const SKILLS: Shot = { tx: 0.0, ty: 0.22, dist: 2.7, elev: 0.34, yaw: -0.62 };
/** Put back together, side on, ready to go. */
const CONTACT: Shot = { tx: -0.05, ty: 0.02, dist: 2.2, elev: 0.16, yaw: -0.18 };

const shotMix = (a: Shot, b: Shot, t: number): Shot => ({
  tx: mix(a.tx, b.tx, t),
  ty: mix(a.ty, b.ty, t),
  dist: mix(a.dist, b.dist, t),
  elev: mix(a.elev, b.elev, t),
  yaw: mix(a.yaw, b.yaw, t),
});

/** How far it has driven off to the right, metres. */
export const driveAt = (s: number): number => {
  const t = smooth(8.5, 9.0, s);
  return t * t * 2.6;
};

/**
 * The camera and the robot at scroll s. Every shot is framed for a wide
 * screen; on one narrower than 1.25 wide (an upright phone's still frame)
 * the camera backs off so the robot's width still fits.
 */
export function poseAt(s: number, aspect = 1.85): Pose {
  let shot = shotMix(WORK_A, WORK_B, smooth(0, 4.9, s));
  shot = shotMix(shot, SKILLS, smooth(4.85, 5.8, s));
  shot = shotMix(shot, CONTACT, smooth(7.5, 8.2, s));
  const dist = shot.dist * Math.max(1, 1.25 / aspect);
  const target = { x: shot.tx, y: shot.ty, z: 0 };
  const eye = {
    x: target.x,
    y: target.y + dist * Math.sin(shot.elev),
    z: dist * Math.cos(shot.elev),
  };
  const drive = driveAt(s);
  // It drives the way it is pointing, so it does not slide sideways.
  const at = { x: drive * Math.cos(shot.yaw), y: 0, z: -drive * Math.sin(shot.yaw) };
  return { eye, target, yaw: shot.yaw, at, roll: drive / WHEEL_RADIUS };
}

/** A point in the robot's frame, into the world, for a pose. */
export function toWorld(pose: Pose, p: Vec3): Vec3 {
  const c = Math.cos(pose.yaw);
  const sn = Math.sin(pose.yaw);
  return {
    x: p.x * c + p.z * sn + pose.at.x,
    y: p.y + pose.at.y,
    z: -p.x * sn + p.z * c + pose.at.z,
  };
}

/**
 * Where a world point lands on the stage, 0..1 from the top left, and how
 * far in front of the camera it is. Same maths as three's lookAt and
 * perspective camera with y up.
 */
export function project(pose: Pose, p: Vec3, aspect: number): { x: number; y: number; depth: number } {
  const e = pose.eye;
  const t = pose.target;
  let fx = t.x - e.x;
  let fy = t.y - e.y;
  let fz = t.z - e.z;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = f x up
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl;
  rz /= rl;
  // up' = right x f
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dz = p.z - e.z;
  const xc = dx * rx + dz * rz;
  const yc = dx * ux + dy * uy + dz * uz;
  const zc = dx * fx + dy * fy + dz * fz;
  const k = Math.tan((FOV * Math.PI) / 360);
  const nx = xc / (zc * k * aspect);
  const ny = yc / (zc * k);
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth: zc };
}

/** The point each group's leader ends on, in the robot's frame, at explode e. */
export function anchorOf(group: number, e: number, groupCentreOverride?: Vec3): Vec3 {
  const dirs: Vec3[] = [
    { x: 0, y: 0, z: 0.2 },
    { x: 0, y: -0.19, z: 0 },
    { x: 0, y: 0.2, z: 0 },
    { x: 0.2, y: 0, z: 0 },
    { x: -0.2, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ];
  const c = group === 0 ? WHEEL_ANCHOR : groupCentreOverride ?? GROUP_CENTRES[group];
  const d = dirs[group];
  return { x: c.x + d.x * e, y: c.y + d.y * e, z: c.z + d.z * e };
}

/*
 * The words, in stage shares (0..1). The root font is 0.41667vw, so a rem
 * is 0.0041667 of the width, and of the height that times the aspect.
 */
export const remW = 0.0041667;
export const remH = (aspect: number): number => remW * aspect;

/** A work card: left column, top fixed, its height estimated from its lines. */
export const CARD = { left: 0.05, top: 0.3, width: 0.3 };
/** Where the leader leaves the card: just right of it, level with the title. */
export const cardLeaderStart = (aspect: number): { x: number; y: number } => ({
  x: CARD.left + CARD.width + 0.012,
  y: CARD.top + 7.6 * remH(aspect),
});
/** Card height, rem: index line, title, tagline lines, stack, award, link. */
export function cardHeightRem(taglineChars: number, award: boolean, link: boolean): number {
  // Tagline at 2.2rem in 72rem of column: about 60 characters a line.
  const lines = Math.max(1, Math.ceil(taglineChars / 58));
  return 1.4 * 1.6 + 1.6 + 7.2 * 1.05 + 2 + lines * 2.2 * 1.45 + 2 + 1.4 * 1.7 * 2 + (award ? 3 : 0) + (link ? 3 : 0);
}

/**
 * The skill blocks round the exploded robot at the skills stop: three down
 * the left, two down the right. Which block carries which group is fixed
 * here so each block's leader reaches the part on its own side.
 */
export const SKILL_BLOCK_W = 0.2;
export const SKILL_SLOTS: { left: number; top: number; side: -1 | 1 }[] = [
  { left: 0.04, top: 0.1, side: -1 },
  { left: 0.04, top: 0.4, side: -1 },
  { left: 0.04, top: 0.69, side: -1 },
  { left: 0.76, top: 0.36, side: 1 },
  { left: 0.76, top: 0.68, side: 1 },
];
/** Skill group i sits in slot SKILL_SLOT_OF[i] and names part group SKILL_PART_OF[i]. */
export const SKILL_PART_OF = [4, 1, 3, 0, 2] as const;
export const SKILL_SLOT_OF = [1, 4, 3, 2, 0] as const;
/** Block height, rem: heading and two columns of marks. */
export const skillHeightRem = (n: number): number => 2.4 * 1.2 + 1.6 + Math.ceil(n / 2) * 2.9;
export function skillLeaderStart(slot: number, aspect: number): { x: number; y: number } {
  const s = SKILL_SLOTS[slot];
  return {
    x: s.side < 0 ? s.left + SKILL_BLOCK_W + 0.01 : s.left - 0.01,
    y: s.top + 1.5 * remH(aspect),
  };
}
