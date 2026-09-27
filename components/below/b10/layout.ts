import * as THREE from "three";

/**
 * Where the robot is for any amount of scroll, and where that puts it on
 * the screen. Nothing here touches the page or the GPU, so a Node script
 * can import it and print the numbers the scene will draw.
 *
 * The camera never moves. It sits on +z and looks down -z at the origin.
 * The robot turns, slides and drives in front of it.
 *
 * The robot's own axes (from tools/bake_hero.mjs): +x is its front, +y is
 * up, -z is its left side. Lengths are metres.
 */

export const FOV = 28;
export const DIST = 1.64;
export const NEAR = 0.2;
export const FAR = 12;

/** The model's box, read from the accessors of public/models/hero.glb. */
export const BOX_MIN: readonly [number, number, number] = [-0.1965, 0.0023, -0.1741];
export const BOX_MAX: readonly [number, number, number] = [0.21, 0.4607, 0.272];
/** The point it turns about: the middle of that box. */
export const CENTRE: readonly [number, number, number] = [
  (BOX_MIN[0] + BOX_MAX[0]) / 2,
  (BOX_MIN[1] + BOX_MAX[1]) / 2,
  (BOX_MIN[2] + BOX_MAX[2]) / 2,
];
export const WHEEL_RADIUS = 0.03925;
/** How far outside the box the dimension lines of the drawing stand. */
export const DIM_GAP = 0.045;

export const STEPS = 7;
export const WORK_STEPS = 5;
/** Screens of scroll the stage stays pinned for: work 6, skills 2, contact 1, less the one on screen. */
export const SPAN = 8;

const RAD = Math.PI / 180;
const HALF_H = DIST * Math.tan((FOV * RAD) / 2);

export type Stop = {
  name: string;
  /** Turn about the robot's up axis, degrees. */
  yaw: number;
  /** Then a tip about the screen's level axis, degrees. Positive shows the top. */
  pitch: number;
  scale: number;
  /** Centre of the robot, in half-widths and half-heights from the middle of the screen. */
  x: number;
  y: number;
  /** The scroll, in screens, at which this step is fully shown. */
  at: number;
};

/**
 * The seven steps. In the five work steps the robot stands a little to
 * the side away from the text, which alternates left and right.
 */
export const STOPS: readonly Stop[] = [
  { name: "front", yaw: -62, pitch: 14, scale: 1.18, x: 0.12, y: -0.02, at: 0.3 },
  { name: "left wheel pod", yaw: 205, pitch: 10, scale: 1.3, x: -0.14, y: 0.16, at: 1.3 },
  { name: "top", yaw: -58, pitch: 72, scale: 1.18, x: 0.12, y: 0, at: 2.3 },
  { name: "rear", yaw: 65, pitch: 12, scale: 1.18, x: -0.12, y: -0.02, at: 3.3 },
  { name: "underside", yaw: -125, pitch: -66, scale: 1.18, x: 0.12, y: 0, at: 4.3 },
  { name: "skills", yaw: -52, pitch: 12, scale: 0.92, x: -0.54, y: -0.02, at: 6.4 },
  { name: "contact", yaw: -14, pitch: 8, scale: 0.92, x: -0.54, y: -0.02, at: 8 },
];

/** Which side of the stage the text of each work step stands on. */
export const SIDES: readonly ("left" | "right")[] = ["left", "right", "left", "right", "left"];

/** The scroll over which the robot goes from step k to step k + 1. */
const MOVES: readonly (readonly [number, number])[] = [
  [0.6, 1.0],
  [1.6, 2.0],
  [2.6, 3.0],
  [3.6, 4.0],
  [4.65, 5.9],
  [6.9, 7.25],
];
/** The scroll over which it drives off. */
const DRIVE: readonly [number, number] = [7.1, 7.85];

/**
 * The point on the robot each project's dot sits on, in the robot's own
 * axes. Each was found by casting a ray from the camera at that step
 * (scratch script render.mjs), so each is on a surface that faces the lens.
 */
export const ANCHORS: readonly (readonly [number, number, number])[] = [
  [0.1622, 0.193, 0.0409],
  [0.1207, 0.0436, -0.155],
  [0.0322, 0.4022, 0.0561],
  [-0.1053, 0.155, 0.0],
  [-0.0547, 0.0436, 0.0018],
];

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Scroll in screens to a step number with a fraction: 2.5 is half way from step 2 to step 3. */
export function stepAt(u: number): number {
  let s = 0;
  for (const [a, b] of MOVES) s += easeInOut(clamp((u - a) / (b - a), 0, 1));
  return s;
}

/** The step a counter should show, 0 to 6. */
export function stepNumber(u: number): number {
  return clamp(Math.round(stepAt(u)), 0, STEPS - 1);
}

/** Is the text of work step i shown at this scroll? */
export function calloutShown(i: number, u: number): boolean {
  // The first is there as the stage arrives. The last is gone before the
  // work layer stops being pinned at u = 5.
  const from = i === 0 ? -0.4 : i - 0.04;
  return u > from && u < i + 0.62;
}

/** On a narrow stage the robot is made smaller so its width still fits. */
export function fit(aspect: number): number {
  return Math.min(1, aspect / 1.5);
}

export type Pose = {
  q: THREE.Quaternion;
  pos: THREE.Vector3;
  scale: number;
  /** How far the wheels have turned, radians. */
  wheel: number;
};

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const qPitch = new THREE.Quaternion();
const heading = new THREE.Vector3();

function stopQuat(stop: Stop, out: THREE.Quaternion): THREE.Quaternion {
  qYaw.setFromAxisAngle(Y_AXIS, stop.yaw * RAD);
  qPitch.setFromAxisAngle(X_AXIS, stop.pitch * RAD);
  return out.copy(qPitch).multiply(qYaw);
}

export function makePose(): Pose {
  return { q: new THREE.Quaternion(), pos: new THREE.Vector3(), scale: 1, wheel: 0 };
}

const driveLengths = new Map<number, number>();

/** How far it has to drive, along its own heading, for all of it to be past the right edge. */
export function driveLength(aspect: number): number {
  const key = Math.round(aspect * 1000);
  const known = driveLengths.get(key);
  if (known !== undefined) return known;
  const pose = makePose();
  const last = STOPS[STEPS - 1];
  stopQuat(last, pose.q);
  pose.scale = last.scale * fit(aspect);
  heading.set(1, 0, 0).applyQuaternion(pose.q);
  const start = new THREE.Vector3(last.x * HALF_H * aspect, last.y * HALF_H, 0);
  let length = 0;
  for (; length < 6; length += 0.02) {
    pose.pos.copy(start).addScaledVector(heading, length);
    if (screenBox(pose, aspect, DIM_GAP * 1.4).x0 > 1.03) break;
  }
  driveLengths.set(key, length);
  return length;
}

/** The robot for this much scroll. */
export function poseAt(u: number, aspect: number, out: Pose): Pose {
  const s = clamp(stepAt(u), 0, STEPS - 1);
  const k = Math.min(STEPS - 2, Math.floor(s));
  const f = s - k;
  const a = STOPS[k];
  const b = STOPS[k + 1];
  stopQuat(a, qa);
  stopQuat(b, qb);
  out.q.copy(qa).slerp(qb, f);
  out.scale = (a.scale + (b.scale - a.scale) * f) * fit(aspect);
  out.pos.set((a.x + (b.x - a.x) * f) * HALF_H * aspect, (a.y + (b.y - a.y) * f) * HALF_H, 0);
  // The drive: it sets off slowly and keeps gaining, along the way the
  // driving pose faces, so the wheels and the ground agree.
  const d = clamp((u - DRIVE[0]) / (DRIVE[1] - DRIVE[0]), 0, 1);
  const travel = d * d * driveLength(aspect);
  if (travel > 0) {
    stopQuat(STOPS[STEPS - 1], qb);
    heading.set(1, 0, 0).applyQuaternion(qb);
    out.pos.addScaledVector(heading, travel);
  }
  out.wheel = travel / (out.scale * WHEEL_RADIUS);
  return out;
}

/** Turn a pose a little about the screen's upright and level axes, radians. For the idle sway and the lean to the cursor. */
export function nudge(pose: Pose, yaw: number, pitch: number): Pose {
  qYaw.setFromAxisAngle(Y_AXIS, yaw);
  qPitch.setFromAxisAngle(X_AXIS, pitch);
  pose.q.premultiply(qYaw).premultiply(qPitch);
  return pose;
}

/** Half the height of what the lens sees at the robot's distance, metres. */
export const HALF_HEIGHT = HALF_H;

export type Spot = { x: number; y: number; depth: number };

const v = new THREE.Vector3();

/** A point given in the robot's own axes, as a share of the stage: x from the left, y from the top. */
export function project(local: readonly [number, number, number], pose: Pose, aspect: number, out: Spot): Spot {
  v.set(local[0] - CENTRE[0], local[1] - CENTRE[1], local[2] - CENTRE[2])
    .multiplyScalar(pose.scale)
    .applyQuaternion(pose.q)
    .add(pose.pos);
  const depth = DIST - v.z;
  const t = Math.tan((FOV * RAD) / 2) * depth;
  out.x = (v.x / (t * aspect) + 1) / 2;
  out.y = (1 - v.y / t) / 2;
  out.depth = depth;
  return out;
}

export type Rect = { x0: number; y0: number; x1: number; y1: number };

const spot: Spot = { x: 0, y: 0, depth: 0 };

/** The box on the stage that holds the whole robot, from the eight corners of its own box grown by `grow`. */
export function screenBox(pose: Pose, aspect: number, grow = 0): Rect & { nearest: number } {
  const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, nearest: Infinity };
  for (let c = 0; c < 8; c += 1) {
    const p: [number, number, number] = [
      c & 1 ? BOX_MAX[0] + grow : BOX_MIN[0] - grow,
      c & 2 ? BOX_MAX[1] + grow : BOX_MIN[1] - grow,
      c & 4 ? BOX_MAX[2] + grow : BOX_MIN[2] - grow,
    ];
    project(p, pose, aspect, spot);
    r.x0 = Math.min(r.x0, spot.x);
    r.x1 = Math.max(r.x1, spot.x);
    r.y0 = Math.min(r.y0, spot.y);
    r.y1 = Math.max(r.y1, spot.y);
    r.nearest = Math.min(r.nearest, spot.depth);
  }
  return r;
}

// ------------------------------------------------------------- the text

/** The text block of a work step: how far in from its edge, and how wide, as shares of the stage width. */
export const BLOCK_INSET = 0.045;
export const BLOCK_WIDTH = 0.23;
/** The leader line runs level for this share of the width before it turns to the dot. */
export const LEADER_RUN = 0.035;
/** From the top of a block down to its rule, where the leader line starts, rem. */
export const RULE_DROP = 3.3;

/** The page's rem for a window this wide, px. The same clamp as app/globals.css. */
export const remFor = (width: number): number => clamp(width * 0.0041667, 8, 48);

export type BlockText = { title: string; tagline: string; stack: string; meta: string; link: boolean };

/**
 * How tall a block will be, rem, from the length of its words and the
 * type sizes index.tsx sets them in. An estimate for the Node check; on
 * the page the real block is measured.
 */
export function blockHeight(t: BlockText, width: number): number {
  const wide = (BLOCK_WIDTH * width) / remFor(width);
  const lines = (chars: number, size: number, advance: number): number => Math.max(1, Math.ceil(chars / Math.floor(wide / (size * advance))));
  const number = RULE_DROP;
  const title = 1.6 + lines(t.title.length, 4.4, 0.56) * 4.4 * 1.08;
  const tagline = 1.6 + lines(t.tagline.length, 1.9, 0.52) * 1.9 * 1.5;
  const stack = 1.6 + lines(t.stack.length, 1.4, 0.6) * 1.4 * 1.6;
  const meta = 0.8 + lines(t.meta.length, 1.4, 0.6) * 1.4 * 1.6;
  const link = t.link ? 0.8 + 1.4 * 1.6 : 0;
  return number + title + tagline + stack + meta + link;
}

/** Where a block stands, as shares of the stage: against its side, centred top to bottom. */
export function blockRect(side: "left" | "right", heightRem: number, width: number, height: number): Rect {
  const h = (heightRem * remFor(width)) / height;
  const x0 = side === "left" ? BLOCK_INSET : 1 - BLOCK_INSET - BLOCK_WIDTH;
  return { x0, x1: x0 + BLOCK_WIDTH, y0: 0.5 - h / 2, y1: 0.5 + h / 2 };
}

export type Leader = { from: { x: number; y: number }; bend: { x: number; y: number }; to: { x: number; y: number } };

/** The leader line: from the inner end of the block's rule, level for a short run, then straight to the dot. */
export function leader(block: Rect, side: "left" | "right", ruleY: number, dot: { x: number; y: number }): Leader {
  const x = side === "left" ? block.x1 : block.x0;
  const run = side === "left" ? LEADER_RUN : -LEADER_RUN;
  return { from: { x, y: ruleY }, bend: { x: x + run, y: ruleY }, to: { x: dot.x, y: dot.y } };
}

export const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
