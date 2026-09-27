/**
 * Where everything is in the lantern night, and where the camera is at each
 * point of the scroll. Plain numbers only: no three, no DOM. The page and
 * the Node check both read this file, so what the check measures is what
 * the page draws.
 *
 * World units are metres. y is up. The valley floor is y = 0. The camera
 * stays at x = 0 and looks toward -z; it only rises and tilts.
 *
 * The scroll is counted in screens from the top of the pinned stage:
 *   0 .. 6     work. The camera rises with the lanterns; five big ones,
 *              one per project, come close in turn.
 *   6 .. 8.5   skills. The camera tips down to the valley floor, where 42
 *              lanterns stand lit in five groups.
 *   8.5 .. 9   contact. It tips up again, over the lanterns, to the moon.
 */

export const FOV = 50; // vertical, degrees
export const NEAR = 0.1;
export const FAR = 700;
export const TAN_HALF = Math.tan(((FOV / 2) * Math.PI) / 180);

/** How many screens the stage stays pinned. */
export const S_END = 9;

/** Scroll positions (screens) of the five project stops. */
export const STOPS = [0.75, 1.85, 2.95, 4.05, 5.15] as const;
/** How long the camera stands still at a stop, either side of it. */
export const HOLD = 0.2;
export const SKILLS_ARRIVE = 6.3;
export const SKILLS_LEAVE = 7.35;
export const CONTACT_ARRIVE = 8.45;

/** Camera height at each project stop. */
export const STOP_Y = [5, 11, 17, 23, 29] as const;
/** The big lanterns: left (-1) and right (+1) in turn, BIG_Z in front of the camera. */
export const SIDES = [-1, 1, -1, 1, -1] as const;
export const BIG_X = 3.9;
export const BIG_Z = -9.5;
/** Height of a big lantern. The small ones are SMALL_H. */
export const BIG_H = 3.0;
export const SMALL_H = 0.9;
/** The lantern's outline: radius as a share of its height, u from bottom (0) to top (1). */
export const lanternRadius = (u: number): number => (0.22 + 0.06 * u + 0.2 * Math.sin(Math.PI * u));
/** Widest radius of a lantern of height 1. */
export const MAX_R = (() => {
  let m = 0;
  for (let i = 0; i <= 40; i += 1) m = Math.max(m, lanternRadius(i / 40));
  return m;
})();

export type Pose = { x: number; y: number; z: number; yaw: number; pitch: number };

const START: Pose = { x: 0, y: 2.2, z: 0, yaw: 0, pitch: 0.07 };
export const stopPose = (k: number): Pose => ({ x: 0, y: STOP_Y[k], z: 0, yaw: 0, pitch: 0.04 });
export const SKILLS_POSE: Pose = { x: 0, y: 36, z: 4, yaw: 0, pitch: -1.15 };
export const CONTACT_POSE: Pose = { x: 0, y: 50, z: 0, yaw: 0, pitch: 0.22 };

/** The moon: far ahead and high, so it only comes into view when the camera tips up at the end. */
export const MOON = (() => {
  const dist = 300;
  const up = 0.52;
  return { x: 0, y: CONTACT_POSE.y + dist * Math.sin(up), z: -dist * Math.cos(up), r: 24 };
})();

type Key = { s: number; pose: Pose };
const KEYS: Key[] = (() => {
  const out: Key[] = [{ s: 0, pose: START }];
  STOPS.forEach((s, k) => {
    out.push({ s: s - HOLD, pose: stopPose(k) });
    out.push({ s: s + HOLD, pose: stopPose(k) });
  });
  out.push({ s: SKILLS_ARRIVE, pose: SKILLS_POSE });
  out.push({ s: SKILLS_LEAVE, pose: SKILLS_POSE });
  out.push({ s: CONTACT_ARRIVE, pose: CONTACT_POSE });
  out.push({ s: S_END, pose: CONTACT_POSE });
  return out;
})();

export const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** The camera at scroll position s (screens). Eased between keys, still at them. */
export function camAt(s: number): Pose {
  if (s <= KEYS[0].s) return { ...KEYS[0].pose };
  for (let i = 1; i < KEYS.length; i += 1) {
    const b = KEYS[i];
    if (s > b.s) continue;
    const a = KEYS[i - 1];
    const t = smooth((s - a.s) / Math.max(1e-6, b.s - a.s));
    return {
      x: a.pose.x + (b.pose.x - a.pose.x) * t,
      y: a.pose.y + (b.pose.y - a.pose.y) * t,
      z: a.pose.z + (b.pose.z - a.pose.z) * t,
      yaw: a.pose.yaw + (b.pose.yaw - a.pose.yaw) * t,
      pitch: a.pose.pitch + (b.pose.pitch - a.pose.pitch) * t,
    };
  }
  return { ...KEYS[KEYS.length - 1].pose };
}

/**
 * Where big lantern k is at scroll s. It waits in the air at its stop's
 * height, so the camera rises up to it. Once the camera has held there,
 * it is let go: it drifts out, up and away, and is gone before the next
 * one arrives.
 */
export function bigAt(k: number, s: number): { x: number; y: number; z: number } {
  const from = STOPS[k] + HOLD;
  const go = smooth((s - from) / 1.1);
  // After the first drift it keeps rising a little faster than the camera,
  // so it never sinks back into view behind the next project's words.
  const after = Math.max(0, s - from - 1.1) * (7 / 1.1);
  return {
    x: SIDES[k] * (BIG_X + 16 * go),
    y: STOP_Y[k] + 0.15 + 20 * go + after,
    z: BIG_Z - 40 * go,
  };
}

/** How lit big lantern k is: it brightens as the camera reaches it. */
export const bigLitAt = (k: number, s: number): number => 0.35 + 0.65 * smooth((s - (STOPS[k] - 0.55)) / 0.4);

/**
 * The field of small lanterns is hidden below this height while the camera
 * looks down on the valley, so nothing stands between it and the ground
 * lanterns. At other times the floor is far below and hides nothing.
 */
export const fieldDownAt = (s: number): number => smooth((s - 5.55) / 0.55) * (1 - smooth((s - 7.45) / 0.6));

// ------------------------------------------------------------ ground lamps

/** Five groups of lanterns on the valley floor, one per skill group, each a short winding line running away from the camera. */
export const GROUP_X = [-26, -13, 0, 13, 26] as const;
export const GROUP_Z = -12.5;
export const LAMP_STEP = 2.3;
/** The ground lanterns are drawn this much larger than the rising ones. */
export const GROUND_SIZE = 1.25;
export const GROUND_Y = SMALL_H * GROUND_SIZE * 0.5 + 0.02;

/** Where the j-th lantern of a group with n lanterns stands. The first is the farthest, so the list reads top to bottom. */
export function groundLamp(group: number, j: number, n: number): { x: number; y: number; z: number } {
  return {
    x: GROUP_X[group] + (j % 2 === 0 ? -0.45 : 0.45),
    y: GROUND_Y,
    z: GROUP_Z - ((n - 1) / 2 - j) * LAMP_STEP,
  };
}

/** The ground groups light one after another as the camera looks down. */
export const rowLitAt = (r: number, s: number): number => smooth((s - (SKILLS_ARRIVE - 0.45 + r * 0.1)) / 0.25);

// ------------------------------------------------------------ the words

/** How much of project k's words show at s. */
export const cardAt = (k: number, s: number): number => {
  const d = Math.abs(s - STOPS[k]);
  return 1 - smooth((d - 0.3) / 0.14);
};
export const skillsAt = (s: number): number =>
  smooth((s - (SKILLS_ARRIVE - 0.2)) / 0.2) * (1 - smooth((s - (SKILLS_LEAVE - 0.05)) / 0.15));
export const contactAt = (s: number): number => smooth((s - (CONTACT_ARRIVE - 0.35)) / 0.3);

/** The words' column at a project stop, as shares of the stage: on the side away from the lantern. */
export const textBox = (k: number): { x0: number; x1: number; y0: number; y1: number } =>
  SIDES[k] < 0 ? { x0: 0.58, x1: 0.94, y0: 0.26, y1: 0.74 } : { x0: 0.06, x1: 0.42, y0: 0.26, y1: 0.74 };

/** Where the skills labels sit relative to their lantern: this share of the width to the right. */
export const LABEL_DX = 0.012;

/**
 * Where a world point lands on screen, the way three's PerspectiveCamera
 * draws it with rotation order YXZ: x and y as shares of the width and
 * height from the top left, and how far in front of the camera it is
 * (negative is behind).
 */
export function project(pose: Pose, p: { x: number; y: number; z: number }, aspect: number): { x: number; y: number; depth: number } {
  let x = p.x - pose.x;
  let y = p.y - pose.y;
  let z = p.z - pose.z;
  const cy = Math.cos(-pose.yaw);
  const sy = Math.sin(-pose.yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  x = x1;
  z = z1;
  const cp = Math.cos(-pose.pitch);
  const sp = Math.sin(-pose.pitch);
  const y2 = y * cp - z * sp;
  const z2 = y * sp + z * cp;
  y = y2;
  z = z2;
  const depth = -z;
  const nx = x / (depth * TAN_HALF * aspect);
  const ny = y / (depth * TAN_HALF);
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth };
}

/** Scroll targets for the dev handle: 0-4 projects, 5 skills, 6 contact. */
export const GO_TO: readonly number[] = [...STOPS, (SKILLS_ARRIVE + SKILLS_LEAVE) / 2, S_END];
