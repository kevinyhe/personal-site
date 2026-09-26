/**
 * Where everything floats on the pond, and where the camera is at each
 * point of the scroll. Plain numbers only: no three, no DOM. The page and
 * the Node check both read this file, so what the check measures is what
 * the page draws.
 *
 * World units are loose metres. The water is the plane y = 0; y is up.
 * The pond is a long strip along x. The camera hangs over it looking
 * almost straight down, tipped back by TILT so the objects on the pads
 * show a little of their sides. Screen up is world -z.
 *
 * The scroll is counted in screens from the top of the pinned stage:
 *   0 .. 6     work. Five stops, one per lily pad.
 *   6 .. 8.2   skills. The lanterns gather into five rings.
 *   8.2 .. 9   contact. A stone drops and the rings spread.
 */

export const FOV = 40; // vertical, degrees
export const NEAR = 0.1;
export const FAR = 60;
/** How far the camera leans back from straight down, radians. */
export const TILT = 0.2;

/** How many screens the stage stays pinned. */
export const S_END = 9;

/** Scroll positions (screens) of the five project stops. */
export const STOPS = [0.75, 1.85, 2.95, 4.05, 5.15] as const;
/** How long the camera stays over a pad, either side of its stop. */
export const HOLD = 0.2;
export const SKILLS_ARRIVE = 6.3;
export const SKILLS_LEAVE = 7.35;
export const CONTACT_ARRIVE = 8.2;
/** The stone falls once the scroll passes this. */
export const DROP_AT = 8.25;

/** Camera heights. */
export const WORK_H = 8;
export const SKILLS_H = 10;
export const CONTACT_H = 9;

/** The five project pads, one per project, in order. */
export const PADS = [
  { x: 0, z: -0.3, r: 1.3 },
  { x: 14, z: 0.4, r: 1.3 },
  { x: 20, z: -0.4, r: 1.3 },
  { x: 34, z: 0.3, r: 1.3 },
  { x: 40, z: -0.2, r: 1.3 },
] as const;
/** -1: the pad sits on the left of the screen and the words on the right. +1 the other way. */
export const SIDES = [-1, 1, -1, 1, -1] as const;
/** Where the pad's centre lands across the screen at its stop. */
export const PAD_SHARE = { left: 0.28, right: 0.72 } as const;
/** How high the tallest object on a pad reaches. */
export const OBJECT_TOP = 0.5;

/**
 * Small pads round each project pad, on its outer side, so the pad reads as
 * part of a clump and not a lone disc. Offsets are for a pad on the left;
 * a pad on the right has them mirrored.
 */
const CLUMP = [
  { dx: -2.1, dz: -1.5, r: 0.62 },
  { dx: -1.5, dz: 1.9, r: 0.74 },
  { dx: 0.6, dz: 2.35, r: 0.48 },
  { dx: -3.2, dz: 0.5, r: 0.55 },
];
export const SMALL_PADS: { x: number; z: number; r: number; seed: number }[] = PADS.flatMap((p, k) =>
  CLUMP.map((c, j) => ({
    // A pad on the left keeps its clump to its left; on the right, to its right.
    x: p.x + c.dx * (SIDES[k] < 0 ? 1 : -1),
    // Every other clump is flipped top to bottom so they do not all look alike.
    z: p.z + c.dz * (k % 2 ? -1 : 1),
    r: c.r,
    seed: k * 10 + j,
  })),
);

/** The strip the ripple simulation covers. Nothing the camera sees lies outside it. */
export const DOMAIN = { x0: -16, z0: -7, w: 98, d: 14 } as const;
/** Ripple texels per world unit. */
export const SIM_DENSITY = 13;
export const SIM_W = Math.round(DOMAIN.w * SIM_DENSITY);
export const SIM_H = Math.round(DOMAIN.d * SIM_DENSITY);

/** The skills stop. The lanterns gather here. */
export const SKILLS_AT = { x: 55, z: 0 } as const;
/** The contact stop. The stone falls on this point. */
export const CONTACT_AT = { x: 69, z: 0 } as const;
const START_AT = { x: -6, z: 0 } as const;

/** Floating height of the lanterns' tops. */
export const LANTERN_Y = 0.3;
/** Lantern radius. */
export const LANTERN_R = 0.19;
/** Ring radius in world units. */
export const RING_R = 0.95;
/** Where each ring's centre lands on screen at the skills stop. */
export const RING_SHARE_X = [0.12, 0.31, 0.5, 0.69, 0.88] as const;
export const RING_SHARE_Y = 0.3;
/** Top of the name lists under the rings, as a share of the height. */
export const LIST_TOP = 0.52;
export const LIST_W = 0.16;

export type Pose = { x: number; z: number; h: number };

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

const tanHalf = (): number => Math.tan(((FOV / 2) * Math.PI) / 180);

/** Where the camera hangs for a pose: over the target, leaned back by TILT. */
export function eyeOf(pose: Pose): { x: number; y: number; z: number } {
  return { x: pose.x, y: pose.h, z: pose.z + pose.h * Math.tan(TILT) };
}

/** Half the screen width in world units at the target's distance. */
export const halfWidth = (h: number, aspect: number): number => (h / Math.cos(TILT)) * tanHalf() * aspect;

export function stopPose(k: number, aspect: number): Pose {
  const p = PADS[k];
  const share = SIDES[k] < 0 ? PAD_SHARE.left : PAD_SHARE.right;
  return { x: p.x - (share - 0.5) * 2 * halfWidth(WORK_H, aspect), z: p.z, h: WORK_H };
}
export const SKILLS_POSE: Pose = { ...SKILLS_AT, h: SKILLS_H };
export const CONTACT_POSE: Pose = { ...CONTACT_AT, h: CONTACT_H };
const START_POSE: Pose = { ...START_AT, h: 9 };

function keys(aspect: number): { s: number; pose: Pose }[] {
  const out: { s: number; pose: Pose }[] = [{ s: 0, pose: START_POSE }];
  STOPS.forEach((s, k) => {
    const p = stopPose(k, aspect);
    out.push({ s: s - HOLD, pose: p });
    out.push({ s: s + HOLD, pose: p });
  });
  out.push({ s: SKILLS_ARRIVE, pose: SKILLS_POSE });
  out.push({ s: SKILLS_LEAVE, pose: SKILLS_POSE });
  out.push({ s: CONTACT_ARRIVE, pose: CONTACT_POSE });
  out.push({ s: S_END, pose: CONTACT_POSE });
  return out;
}

/** The camera at scroll s (screens). Eased between keys, still at them. */
export function camAt(s: number, aspect: number): Pose {
  const ks = keys(aspect);
  if (s <= ks[0].s) return { ...ks[0].pose };
  for (let i = 1; i < ks.length; i += 1) {
    const b = ks[i];
    if (s > b.s) continue;
    const a = ks[i - 1];
    const t = smooth((s - a.s) / Math.max(1e-6, b.s - a.s));
    return {
      x: a.pose.x + (b.pose.x - a.pose.x) * t,
      z: a.pose.z + (b.pose.z - a.pose.z) * t,
      h: a.pose.h + (b.pose.h - a.pose.h) * t,
    };
  }
  return { ...ks[ks.length - 1].pose };
}

type V3 = { x: number; y: number; z: number };

/** The camera's right, up and forward, as three's lookAt builds them. */
function basis(pose: Pose): { eye: V3; r: V3; u: V3; f: V3 } {
  const eye = eyeOf(pose);
  let f = { x: pose.x - eye.x, y: 0 - eye.y, z: pose.z - eye.z };
  const fl = Math.hypot(f.x, f.y, f.z);
  f = { x: f.x / fl, y: f.y / fl, z: f.z / fl };
  // right = f x up(0,1,0)
  let r = { x: -f.z, y: 0, z: f.x };
  const rl = Math.hypot(r.x, r.z) || 1;
  r = { x: r.x / rl, y: 0, z: r.z / rl };
  // up = r x f
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { eye, r, u, f };
}

/**
 * Where a world point lands on screen: x and y as shares of the width and
 * height from the top left, and how far in front of the camera it is
 * (negative is behind).
 */
export function project(pose: Pose, p: V3, aspect: number): { x: number; y: number; depth: number } {
  const { eye, r, u, f } = basis(pose);
  const d = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z };
  const depth = d.x * f.x + d.y * f.y + d.z * f.z;
  const sx = d.x * r.x + d.y * r.y + d.z * r.z;
  const sy = d.x * u.x + d.y * u.y + d.z * u.z;
  const t = tanHalf();
  const nx = sx / (depth * t * aspect);
  const ny = sy / (depth * t);
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth };
}

/** The point on the plane y = planeY under a screen point (shares from the top left). */
export function unproject(pose: Pose, sx: number, sy: number, planeY: number, aspect: number): { x: number; z: number } {
  const { eye, r, u, f } = basis(pose);
  const t = tanHalf();
  const nx = (sx * 2 - 1) * t * aspect;
  const ny = (1 - sy * 2) * t;
  const dir = { x: f.x + r.x * nx + u.x * ny, y: f.y + r.y * nx + u.y * ny, z: f.z + r.z * nx + u.z * ny };
  const k = (planeY - eye.y) / (dir.y || -1e-6);
  return { x: eye.x + dir.x * k, z: eye.z + dir.z * k };
}

/** Where lantern j of skill group g sits once gathered, for this screen shape. */
export function ringSpot(g: number, j: number, count: number, aspect: number): { x: number; z: number } {
  const c = unproject(SKILLS_POSE, RING_SHARE_X[g], RING_SHARE_Y, LANTERN_Y, aspect);
  const a = -Math.PI / 2 + (j / count) * Math.PI * 2;
  // A screen narrower than 1920 by 1038 has less room across: the rings shrink to keep apart.
  const r = RING_R * Math.min(1, aspect / 1.85);
  return { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
}

/** A seeded generator, so the pond is the same on every visit. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the lanterns drift before they gather: open water round the skills stop. */
export const LANTERN_SCATTER: { x: number; z: number; phase: number }[] = (() => {
  const r = rng(2727);
  const out: { x: number; z: number; phase: number }[] = [];
  for (let i = 0; i < 42; i += 1) out.push({ x: SKILLS_AT.x - 6 + r() * 12, z: -3.4 + r() * 6.8, phase: r() * Math.PI * 2 });
  return out;
})();

/** The koi: each swims a figure of eight round its own centre. */
export type Koi = { cx: number; cz: number; ax: number; az: number; speed: number; phase: number; len: number; seed: number };
export const KOI: Koi[] = (() => {
  const r = rng(515);
  const out: Koi[] = [];
  for (let x = -10; x <= 76; x += 5.4) {
    const ax = 2.2 + r() * 1.4;
    out.push({
      cx: x + (r() - 0.5) * 2,
      cz: (out.length % 2 ? 1 : -1) * (0.6 + r() * 1.1),
      ax,
      az: 1.2 + r() * 0.9,
      // About 0.55 units a second along the path.
      speed: (0.55 / ax) * (r() < 0.5 ? 1 : -1),
      phase: r() * Math.PI * 2,
      len: 1.0 + r() * 0.35,
      seed: r() * 100,
    });
  }
  return out;
})();
/** How deep the koi swim. */
export const KOI_Y = -0.45;

/** Where koi i is at time t, which way it faces (radians in the xz plane) and how hard it turns. */
export function koiAt(k: Koi, t: number): { x: number; z: number; heading: number; turn: number } {
  const th = k.phase + k.speed * t;
  const x = k.cx + k.ax * Math.sin(th);
  const z = k.cz + k.az * Math.sin(2 * th) * 0.5;
  const dx = k.ax * Math.cos(th) * k.speed;
  const dz = k.az * Math.cos(2 * th) * k.speed;
  const ddx = -k.ax * Math.sin(th) * k.speed * k.speed;
  const ddz = -2 * k.az * Math.sin(2 * th) * k.speed * k.speed;
  const v2 = dx * dx + dz * dz || 1e-6;
  // Signed curvature of the path, used to bend the body into the turn.
  const turn = (dx * ddz - dz * ddx) / Math.pow(v2, 1.5);
  return { x, z, heading: Math.atan2(dz, dx), turn: Math.max(-1.5, Math.min(1.5, turn)) };
}

/** How much of project k's words show at s. */
export const cardAt = (k: number, s: number): number => {
  const d = Math.abs(s - STOPS[k]);
  return 1 - smooth((d - 0.3) / 0.14);
};
export const skillsAt = (s: number): number =>
  smooth((s - (SKILLS_ARRIVE - 0.2)) / 0.2) * (1 - smooth((s - (SKILLS_LEAVE - 0.05)) / 0.15));
/** How far the lanterns have gathered into their rings. They stay gathered after. */
export const gatherAt = (s: number): number => smooth((s - (SKILLS_ARRIVE - 0.8)) / 0.75);
export const contactAt = (s: number): number => smooth((s - (CONTACT_ARRIVE + 0.1)) / 0.3);

/** Scroll stops for goTo: 0-4 projects, 5 skills, 6 contact. */
export const GO_TO: readonly number[] = [...STOPS, (SKILLS_ARRIVE + SKILLS_LEAVE) / 2, S_END];

/** The words' column at a project stop, as shares of the stage: on the side away from the pad. */
export const textBox = (k: number): { x0: number; x1: number; y0: number; y1: number } =>
  SIDES[k] < 0 ? { x0: 0.54, x1: 0.92, y0: 0.26, y1: 0.74 } : { x0: 0.06, x1: 0.44, y0: 0.26, y1: 0.74 };
