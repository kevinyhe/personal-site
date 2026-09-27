/**
 * Where everything stands on the approach, and where the camera is at each
 * point of the scroll. Plain numbers only: no three, no DOM. The page and
 * the Node check both read this file, so what the check measures is what
 * the page draws.
 *
 * World units are metres. The path runs from z = +14 down to the hall at
 * z = -110, along x = 0. y is up.
 *
 * The scroll is counted in screens from the top of the pinned stage:
 *   0 .. 6     work. Five stops, one per project lantern.
 *   6 .. 8.5   skills. The camera walks up to the lamp shelves at the hall.
 *   8.5 .. 9   contact. The camera has turned round to look back down the path.
 */

export const FOV = 50; // vertical, degrees
export const NEAR = 0.1;
export const FAR = 400;
export const EYE = 1.7;

/** How many screens the stage stays pinned. */
export const S_END = 9;

/** The five project lanterns. Left (-1) and right (+1) in turn. */
export const LANTERN_Z = [-10, -28, -46, -64, -82] as const;
export const SIDES = [-1, 1, -1, 1, -1] as const;
export const LANTERN_X = 3.5;
/** The big lanterns' height, and the width the card is drawn at for it. */
export const BIG_H = 3.6;
export const BIG_W = BIG_H * 0.605;
/** The small lanterns along both edges of the path. */
export const SMALL_H = 2.0;
export const SMALL_W = SMALL_H * 0.605;
export const SMALL_X = 2.9;
export const SMALL_Z0 = 11;
export const SMALL_STEP = 6;
export const SMALL_END = -88;
/** The lit window of a lantern, as a share of its height from the ground. */
export const WINDOW_AT = 0.7;

/** Scroll positions (screens) of the five project stops. */
export const STOPS = [0.75, 1.85, 2.95, 4.05, 5.15] as const;
/** How long the camera stands still at a stop, either side of it. */
export const HOLD = 0.2;
export const SKILLS_ARRIVE = 6.3;
export const SKILLS_LEAVE = 7.35;
export const CONTACT_ARRIVE = 8.45;

/** The torii run. Legs at +-GATE_LEG_X, top rail at GATE_H. */
export const GATE_H = 5.42;
export const GATE_W = 5.48;
export const GATE_LEG_X = 2.1;
export const GATE_LEG_W = 0.44;
/** The underside of the tie beam, the lowest thing overhead. */
export const GATE_NUKI_Y = 3.4;

/**
 * Gates stand in runs between the lanterns and never in the stretch from
 * one metre past a project lantern to seven metres before it, which is
 * the line of sight from its stop.
 */
export const GATE_Z: number[] = (() => {
  const out: number[] = [];
  for (let z = 10; z >= -2; z -= 2) out.push(z);
  for (const lz of LANTERN_Z) {
    const count = lz === LANTERN_Z[LANTERN_Z.length - 1] ? 4 : 5;
    for (let i = 0; i < count; i += 1) out.push(lz - 2 - 2 * i);
  }
  return out;
})();

/** The lamp shelves in front of the hall: five rows, one per skill group. */
export const RACK_Z = -98;
export const RACK_X0 = -2.41;
export const RACK_STEP = 0.533;
export const RACK_CENTRE_Y = 2.0;
export const RACK_ROW_GAP = 0.653;
export const LAMP_W = 0.3;
export const LAMP_H = 0.3;
export const rackRowY = (row: number): number => RACK_CENTRE_Y + (2 - row) * RACK_ROW_GAP;
export const lampX = (col: number): number => RACK_X0 + RACK_STEP * (col + 0.5);
/** The lamp's centre stands this far over its shelf board. */
export const LAMP_LIFT = LAMP_H / 2 + 0.03;

export const HALL = { z: -112, h: 16 };
export const PAGODA = { x: -17, z: -122, h: 22 };

export type Tree = { x: number; z: number; h: number; r: number; seed: number };

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sakura either side, far enough out that no canopy reaches the path. */
export const TREES: Tree[] = (() => {
  const r = rng(1717);
  const out: Tree[] = [];
  for (let z = 16; z > -104; z -= 4.6) {
    for (const side of [-1, 1]) {
      const radius = 2.2 + r() * 1.1;
      out.push({
        x: side * (radius + 4.4 + r() * 3.5),
        z: z + (r() - 0.5) * 2.4,
        h: 2.2 + r() * 1.2,
        r: radius,
        seed: Math.floor(r() * 1e6),
      });
    }
  }
  return out;
})();

export type Pose = { x: number; y: number; z: number; yaw: number; pitch: number };

const START: Pose = { x: 0, y: EYE, z: 13, yaw: 0, pitch: 0 };
/** How far the head turns toward a project lantern at its stop. */
const LOOK = 0.08;
export const stopPose = (k: number): Pose => ({ x: 0, y: EYE, z: LANTERN_Z[k] + 6, yaw: -SIDES[k] * LOOK, pitch: 0 });
export const SKILLS_POSE: Pose = { x: 0, y: RACK_CENTRE_Y, z: RACK_Z + 5, yaw: 0, pitch: 0 };
export const CONTACT_POSE: Pose = { x: 0, y: 2.2, z: -92, yaw: Math.PI, pitch: -0.05 };

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

const smooth = (t: number): number => {
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

/** How lit project lantern k is at scroll s: 0 dark, 1 fully lit. It lights as the camera arrives and stays lit. */
export const litAt = (k: number, s: number): number => smooth((s - (STOPS[k] - 0.5)) / 0.4);
/** The same for skill row r: the rows light one after another as the shelves come up. */
export const rowLitAt = (r: number, s: number): number => smooth((s - (SKILLS_ARRIVE - 0.35 + r * 0.1)) / 0.25);

/** How much of project k's words show at s. */
export const cardAt = (k: number, s: number): number => {
  const d = Math.abs(s - STOPS[k]);
  return 1 - smooth((d - 0.3) / 0.14);
};
export const skillsAt = (s: number): number =>
  smooth((s - (SKILLS_ARRIVE - 0.2)) / 0.2) * (1 - smooth((s - (SKILLS_LEAVE - 0.05)) / 0.15));
export const contactAt = (s: number): number => smooth((s - (CONTACT_ARRIVE - 0.35)) / 0.3);

/**
 * Where a world point lands on screen, the way three's PerspectiveCamera
 * draws it with rotation order YXZ: x and y as shares of the width and
 * height from the top left, and how far in front of the camera it is
 * (negative is behind).
 */
export function project(
  pose: Pose,
  p: { x: number; y: number; z: number },
  aspect: number,
): { x: number; y: number; depth: number } {
  let x = p.x - pose.x;
  let y = p.y - pose.y;
  let z = p.z - pose.z;
  // Undo the yaw (about y), then the pitch (about x).
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
  const t = Math.tan(((FOV / 2) * Math.PI) / 180);
  const nx = x / (depth * t * aspect);
  const ny = y / (depth * t);
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth };
}

/** Which stop the scroll is nearest: 0-4 projects, 5 skills, 6 contact. */
export const GO_TO: readonly number[] = [...STOPS, (SKILLS_ARRIVE + SKILLS_LEAVE) / 2, S_END];

/** The words' column at a project stop, as shares of the stage: on the side away from the lantern. */
export const textBox = (k: number): { x0: number; x1: number; y0: number; y1: number } =>
  SIDES[k] < 0 ? { x0: 0.6, x1: 0.94, y0: 0.26, y1: 0.74 } : { x0: 0.06, x1: 0.4, y0: 0.26, y1: 0.74 };
