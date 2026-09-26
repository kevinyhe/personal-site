/**
 * Where everything stands in the tunnel of gates, and where the camera is
 * at each point of the scroll. Plain numbers only: no three, no DOM. The
 * page and the Node check both read this file, so what the check measures
 * is what the page draws.
 *
 * World units are metres, y is up. The path is a gentle S curve on flat
 * ground, measured by u, the distance walked along its middle line. u = 0
 * is the entrance gate. A heading of 0 walks toward -z, the way a three.js
 * camera looks when it is not turned.
 *
 * The scroll is counted in screens from the top of the pinned stage:
 *   0 .. 6     work. Five stops, one clearing per project.
 *   6 .. 7.9   skills. A wide clearing; the head turns to the tablet rack.
 *   7.9 .. 9   contact. Out of the last gate onto a terrace over the hills.
 */

export const FOV = 50; // vertical, degrees
export const NEAR = 0.1;
export const FAR = 900;
export const EYE = 1.6;

/** How many screens the stage stays pinned. */
export const S_END = 9;

/** Text side at each project stop: +1 the words on the right, the gate on the left. */
export const SIDES = [1, -1, 1, -1, 1] as const;

// ------------------------------------------------------------------ gates

export type GateDims = {
  /** Middle line to the middle of a post. */
  half: number;
  postR: number;
  /** Bottom of the tie beam (nuki) and its height. */
  nukiY: number;
  nukiH: number;
  /** How far the tie beam runs past each post. */
  nukiOver: number;
  /** Bottom of the lower top beam (shimaki). The posts stop here. */
  shimakiY: number;
  shimakiH: number;
  shimakiOver: number;
  /** The upper top beam (kasagi) sits on the shimaki. */
  kasagiH: number;
  kasagiOver: number;
  /** Thickness of the beams along the path. */
  depth: number;
  /** The dark base each post stands in. */
  footR: number;
  footH: number;
};

/** The gates of the tunnel: close set, just wider than two people. */
export const SMALL: GateDims = {
  half: 1.05,
  postR: 0.12,
  nukiY: 2.12,
  nukiH: 0.13,
  nukiOver: 0.25,
  shimakiY: 2.62,
  shimakiH: 0.12,
  shimakiOver: 0.4,
  kasagiH: 0.16,
  kasagiOver: 0.55,
  depth: 0.26,
  footR: 0.15,
  footH: 0.32,
};

/** The larger gate at the entrance, at the far side of each clearing, and at the exit. */
export const BIG: GateDims = {
  half: 1.6,
  postR: 0.19,
  nukiY: 2.95,
  nukiH: 0.18,
  nukiOver: 0.4,
  shimakiY: 3.95,
  shimakiH: 0.16,
  shimakiOver: 0.6,
  kasagiH: 0.22,
  kasagiOver: 0.85,
  depth: 0.36,
  footR: 0.24,
  footH: 0.45,
};

/** The plaque on a big gate, between the tie beam and the top beams. */
export const PLAQUE_W = 2.0;
export const PLAQUE_H = 0.78;
export const PLAQUE_Y = (BIG.nukiY + BIG.nukiH + BIG.shimakiY) / 2;
/** It hangs this far in front of the posts, toward whoever is walking up. */
export const PLAQUE_OUT = BIG.depth / 2 + 0.05;

/** Distance between gates in a run, middle to middle. */
export const GAP = 0.8;
/** Length of each run of gates between clearings. */
const RUN = 24;
const RUN_LAST = 14;
/** From the last gate of a run to the big gate across the far side of a clearing. */
const CLEAR = 13;
/** How far before the big gate the camera stops to read its plaque. */
export const STOP_D = 7.5;
/** The skills clearing: from the last gate of run six to the big gate beyond it. */
const SK_CLEAR = 16;
/** From a big gate to the first small gate after it. */
const AFTER_BIG = 1.2;

export type Gate = { u: number; big: boolean; plaque: number | null };
export type Run = { u0: number; u1: number };

type Layout = {
  gates: Gate[];
  runs: Run[];
  /** The five project stops. */
  stopU: number[];
  plaqueU: number[];
  /** Where each project clearing starts: the last gate of the run before it. */
  clearU: number[];
  skillsU: number;
  skillsClear: [number, number];
  exitU: number;
  contactU: number;
  edgeU: number;
};

export const LAYOUT: Layout = (() => {
  const gates: Gate[] = [{ u: 0, big: true, plaque: null }];
  const runs: Run[] = [];
  const stopU: number[] = [];
  const plaqueU: number[] = [];
  const clearU: number[] = [];
  let u = AFTER_BIG;
  const run = (len: number): number => {
    const n = Math.floor(len / GAP);
    for (let i = 0; i <= n; i += 1) gates.push({ u: u + i * GAP, big: false, plaque: null });
    const end = u + n * GAP;
    runs.push({ u0: u, u1: end });
    return end;
  };
  for (let k = 0; k < 5; k += 1) {
    const end = run(RUN);
    clearU.push(end);
    const pu = end + CLEAR;
    plaqueU.push(pu);
    stopU.push(pu - STOP_D);
    gates.push({ u: pu, big: true, plaque: k });
    u = pu + AFTER_BIG;
  }
  const end6 = run(RUN);
  const skillsGate = end6 + SK_CLEAR;
  gates.push({ u: skillsGate, big: true, plaque: null });
  u = skillsGate + AFTER_BIG;
  const end7 = run(RUN_LAST);
  const exitU = end7 + AFTER_BIG;
  gates.push({ u: exitU, big: true, plaque: null });
  const contactU = exitU + 4;
  return {
    gates,
    runs,
    stopU,
    plaqueU,
    clearU,
    skillsU: end6 + 8,
    skillsClear: [end6, skillsGate],
    exitU,
    contactU,
    edgeU: contactU + 6,
  };
})();

// ------------------------------------------------------------ the curve

/** Past this point the path runs straight, so the terrace looks one way. */
const STRAIGHT_FROM = LAYOUT.exitU;
const rawHeading = (u: number): number => 0.34 * Math.sin(u / 23) + 0.14 * Math.sin(u / 9.1 + 0.7);
const H0 = rawHeading(0);
/** Which way the path runs at u, in radians (0 is -z, positive turns left). */
export const headingAt = (u: number): number => rawHeading(Math.min(u, STRAIGHT_FROM)) - H0;

const U_MIN = -30;
const U_MAX = LAYOUT.edgeU + 40;
const DU = 0.1;
const COUNT = Math.ceil((U_MAX - U_MIN) / DU) + 1;
const TX = new Float64Array(COUNT);
const TZ = new Float64Array(COUNT);
(() => {
  // Walk out from u = 0 both ways, a small step at a time.
  const i0 = Math.round(-U_MIN / DU);
  TX[i0] = 0;
  TZ[i0] = 0;
  for (let i = i0 + 1; i < COUNT; i += 1) {
    const h = headingAt(U_MIN + (i - 0.5) * DU);
    TX[i] = TX[i - 1] - Math.sin(h) * DU;
    TZ[i] = TZ[i - 1] - Math.cos(h) * DU;
  }
  for (let i = i0 - 1; i >= 0; i -= 1) {
    const h = headingAt(U_MIN + (i + 0.5) * DU);
    TX[i] = TX[i + 1] + Math.sin(h) * DU;
    TZ[i] = TZ[i + 1] + Math.cos(h) * DU;
  }
})();

export type V2 = { x: number; z: number };

/** The middle of the path at u. */
export function pointAt(u: number): V2 {
  const f = (Math.max(U_MIN, Math.min(U_MAX, u)) - U_MIN) / DU;
  const i = Math.min(COUNT - 2, Math.floor(f));
  const t = f - i;
  return { x: TX[i] + (TX[i + 1] - TX[i]) * t, z: TZ[i] + (TZ[i + 1] - TZ[i]) * t };
}
/** Forward along the path at u. */
export const forwardAt = (u: number): V2 => {
  const h = headingAt(u);
  return { x: -Math.sin(h), z: -Math.cos(h) };
};
/** To the right of someone walking the path at u. */
export const rightAt = (u: number): V2 => {
  const h = headingAt(u);
  return { x: Math.cos(h), z: -Math.sin(h) };
};
/** The point `lat` metres right of the middle line at u, and `along` metres further on, straight. */
export function placeAt(u: number, lat: number, along = 0): V2 {
  const p = pointAt(u);
  const r = rightAt(u);
  const f = forwardAt(u);
  return { x: p.x + r.x * lat + f.x * along, z: p.z + r.z * lat + f.z * along };
}

// ------------------------------------------------------------ the rack

/** The votive tablets: five rows, one per skill group, on a rack to the left of the skills clearing. */
export const RACK_LAT = 2.8;
/** The rack's middle sits this far further along the path than the camera. */
export const RACK_SHIFT = 0.8;
export const TAB_W = 0.36;
export const TAB_H = 0.28;
export const TAB_STEP = 0.46;
export const RACK_COLS = 11;
export const RAIL_TOP = 3.35;
export const ROW_PITCH = 0.6;
export const railY = (row: number): number => RAIL_TOP - row * ROW_PITCH;
/** A tablet's middle hangs this far under its rail. */
export const TAB_DROP = 0.2;
/** Along-path offset (from the camera's u) of column col. */
export const tabAlong = (col: number): number => RACK_SHIFT + (col - (RACK_COLS - 1) / 2) * TAB_STEP;
/** The rack's frame: posts at both ends, the roof over the top rail. */
export const RACK_HALF = (RACK_COLS * TAB_STEP) / 2 + 0.25;

/** A tablet's middle in the world. */
export function tabletAt(row: number, col: number): { x: number; y: number; z: number } {
  const p = placeAt(LAYOUT.skillsU, -RACK_LAT, 0);
  const f = forwardAt(LAYOUT.skillsU);
  const a = tabAlong(col);
  return { x: p.x + f.x * a, y: railY(row) - TAB_DROP, z: p.z + f.z * a };
}

// ------------------------------------------------------------ the camera

export type Pose = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number };

/** Scroll positions (screens) of the five project stops. */
export const STOPS = [0.8, 1.9, 3.0, 4.1, 5.2] as const;
/** How long the camera stands still at a stop, either side of it. */
export const HOLD = 0.2;
export const SKILLS_ARRIVE = 6.3;
export const SKILLS_LEAVE = 7.35;
export const CONTACT_ARRIVE = 8.5;
const U_START = -7;

/** The camera's place on the path at each key, eased between them. */
const KEYS: { s: number; u: number }[] = (() => {
  const out = [{ s: 0, u: U_START }];
  STOPS.forEach((s, k) => {
    out.push({ s: s - HOLD, u: LAYOUT.stopU[k] });
    out.push({ s: s + HOLD, u: LAYOUT.stopU[k] });
  });
  out.push({ s: SKILLS_ARRIVE, u: LAYOUT.skillsU });
  out.push({ s: SKILLS_LEAVE, u: LAYOUT.skillsU });
  out.push({ s: CONTACT_ARRIVE, u: LAYOUT.contactU });
  out.push({ s: S_END, u: LAYOUT.contactU });
  return out;
})();

const smooth = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** How far along the path the camera is at scroll s. */
export function uAt(s: number): number {
  if (s <= KEYS[0].s) return KEYS[0].u;
  for (let i = 1; i < KEYS.length; i += 1) {
    const b = KEYS[i];
    if (s > b.s) continue;
    const a = KEYS[i - 1];
    return a.u + (b.u - a.u) * smooth((s - a.s) / Math.max(1e-6, b.s - a.s));
  }
  return KEYS[KEYS.length - 1].u;
}

/**
 * Where the camera steps aside and turns in a clearing. Each is a bump
 * over u: nothing at `a`, all of it at `m`, nothing again by `b`. They are
 * functions of u, not of the scroll, so the camera is back on the middle
 * line before it reaches any posts.
 */
type Bump = { a: number; m: number; b: number; lat: number; yaw: number; pitch: number };
export const BUMPS: Bump[] = (() => {
  const out: Bump[] = LAYOUT.stopU.map((m, k) => ({
    a: LAYOUT.clearU[k] + 0.5,
    m,
    b: LAYOUT.plaqueU[k] - 0.3,
    // Step to the text side and turn a little that way, so the gate stands on the other half.
    lat: SIDES[k] * 1.2,
    yaw: -SIDES[k] * 0.13,
    pitch: 0.1,
  }));
  // Skills: step right and turn left, a quarter turn, to face the rack.
  out.push({
    a: LAYOUT.skillsClear[0] + 0.5,
    m: LAYOUT.skillsU,
    b: LAYOUT.skillsClear[1] - 0.5,
    lat: 1.5,
    yaw: Math.PI / 2,
    pitch: 0.115,
  });
  return out;
})();

const bumpAt = (b: Bump, u: number): number => {
  if (u <= b.a || u >= b.b) return 0;
  if (u <= b.m) return smooth((u - b.a) / (b.m - b.a));
  return 1 - smooth((u - b.m) / (b.b - b.m));
};

/** The walking sway, set by the page from how fast the scroll moves. */
export type Walk = { lat: number; bob: number; roll: number };
export const STILL: Walk = { lat: 0, bob: 0, roll: 0 };
/** The largest sway the page ever asks for; the clearance check uses it. */
export const SWAY_MAX = { lat: 0.05, bob: 0.03, roll: 0.01 };

export function poseAtU(u: number, walk: Walk = STILL): Pose {
  let lat = walk.lat;
  let yaw = 0;
  let pitch = 0;
  for (const b of BUMPS) {
    const k = bumpAt(b, u);
    lat += b.lat * k;
    yaw += b.yaw * k;
    pitch += b.pitch * k;
  }
  const p = placeAt(u, lat);
  return { x: p.x, y: EYE + walk.bob, z: p.z, yaw: headingAt(u) + yaw, pitch, roll: walk.roll };
}

export const camAt = (s: number, walk: Walk = STILL): Pose => poseAtU(uAt(s), walk);

/** The pose at each project stop and at the skills stop. */
export const stopPose = (k: number): Pose => poseAtU(LAYOUT.stopU[k]);
export const SKILLS_POSE: Pose = poseAtU(LAYOUT.skillsU);
export const CONTACT_POSE: Pose = poseAtU(LAYOUT.contactU);

/** How much of project k's words show at s. */
export const cardAt = (k: number, s: number): number => {
  const d = Math.abs(s - STOPS[k]);
  return 1 - smooth((d - 0.26) / 0.14);
};
export const skillsAt = (s: number): number =>
  smooth((s - (SKILLS_ARRIVE - 0.2)) / 0.2) * (1 - smooth((s - (SKILLS_LEAVE - 0.05)) / 0.15));
export const contactAt = (s: number): number => smooth((s - (CONTACT_ARRIVE - 0.3)) / 0.25);

/** Which scroll position each stop is at: 0-4 projects, 5 skills, 6 contact. */
export const GO_TO: readonly number[] = [...STOPS, (SKILLS_ARRIVE + SKILLS_LEAVE) / 2, S_END];

/** The words' box at a project stop, as shares of the stage, on the side away from the gate. */
export const textBox = (k: number): { x0: number; x1: number; y0: number; y1: number } =>
  SIDES[k] > 0 ? { x0: 0.58, x1: 0.94, y0: 0.24, y1: 0.76 } : { x0: 0.06, x1: 0.42, y0: 0.24, y1: 0.76 };

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
  // Undo the yaw (about y), then the pitch (about x), then the roll (about z).
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
  const cr = Math.cos(-pose.roll);
  const sr = Math.sin(-pose.roll);
  const x3 = x * cr - y * sr;
  const y3 = x * sr + y * cr;
  x = x3;
  y = y3;
  const depth = -z;
  const t = Math.tan(((FOV / 2) * Math.PI) / 180);
  const nx = x / (depth * t * aspect);
  const ny = y / (depth * t);
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth };
}

// ------------------------------------------------------- what stands about

/** A seeded generator, so the woods are the same on every visit. */
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

/** Anything round and upright: tree trunks, lanterns. The clearance check reads these. */
export type Pillar = { x: number; z: number; r: number; h: number; kind: "trunk" | "sakura" | "lantern" };

/** Is along-path position u inside a clearing (or the skills clearing, or past the exit)? */
const clearingAt = (u: number): boolean =>
  LAYOUT.clearU.some((c, k) => u > c - 0.5 && u < LAYOUT.plaqueU[k] + 0.5) ||
  (u > LAYOUT.skillsClear[0] - 0.5 && u < LAYOUT.skillsClear[1] + 0.5);

/** The woods either side of the tunnel: bare dark trunks, so the light between them shows. */
export const TRUNKS: Pillar[] = (() => {
  const r = rng(2222);
  const out: Pillar[] = [];
  for (let u = -26; u < LAYOUT.exitU - 1; u += 1.6) {
    for (const side of [-1, 1]) {
      if (r() < 0.25) continue;
      const open = clearingAt(u);
      let lat = side * (3.0 + r() * 10);
      // Clearings are open: the trees stand back.
      if (open && Math.abs(lat) < 7) lat = side * (7 + r() * 6);
      // Nothing behind the rack's near side or between it and the camera.
      if (u > LAYOUT.skillsClear[0] - 2 && u < LAYOUT.skillsClear[1] + 2 && side < 0 && Math.abs(lat) < 7) continue;
      // Not in front of the entrance, where the first view looks in.
      if (u < 0 && Math.abs(lat) < 4.5) continue;
      const p = placeAt(u + (r() - 0.5) * 1.2, lat);
      out.push({ x: p.x, z: p.z, r: 0.16 + r() * 0.2, h: 16, kind: "trunk" });
    }
  }
  return out;
})();

/** Sakura: two in each project clearing, set back from the gate. */
export const SAKURA: (Pillar & { crown: number; seed: number })[] = (() => {
  const r = rng(2201);
  const out: (Pillar & { crown: number; seed: number })[] = [];
  LAYOUT.clearU.forEach((c, k) => {
    for (const side of [-1, 1]) {
      const along = c + 7 + r() * 3;
      const lat = side * (4.6 + r() * 1.4);
      const p = placeAt(along, lat);
      out.push({ x: p.x, z: p.z, r: 0.22, h: 2.6 + r() * 0.8, kind: "sakura", crown: 2.0 + r() * 0.6, seed: 100 * k + (side + 1) });
    }
  });
  // Two at the entrance, framing it.
  for (const side of [-1, 1]) {
    const p = placeAt(-2.5, side * 5.2);
    out.push({ x: p.x, z: p.z, r: 0.24, h: 3.0, kind: "sakura", crown: 2.4, seed: 900 + side });
  }
  return out;
})();

/** A pair of stone lanterns before each plaque gate. */
export const LANTERN_H = 1.9;
export const LANTERNS: Pillar[] = (() => {
  const out: Pillar[] = [];
  LAYOUT.plaqueU.forEach((pu) => {
    for (const side of [-1, 1]) {
      const p = placeAt(pu - 1.4, side * 2.5);
      out.push({ x: p.x, z: p.z, r: 0.32, h: LANTERN_H, kind: "lantern" });
    }
  });
  return out;
})();

/** The ridges seen from the terrace: nearest first. Distance ahead, lateral half-span, base height and rise. */
export const RIDGES = [
  { d: 45, span: 90, base: -6, rise: 5, seed: 1 },
  { d: 90, span: 150, base: -4, rise: 9, seed: 2 },
  { d: 160, span: 240, base: -3, rise: 14, seed: 3 },
  { d: 260, span: 380, base: 0, rise: 22, seed: 4 },
] as const;

/** A ridge's height at lateral position l: a few slow waves, the same on every visit. */
export function ridgeY(ridge: (typeof RIDGES)[number], l: number): number {
  const s = ridge.seed * 1.7;
  const x = l / ridge.d;
  const w =
    0.5 +
    0.28 * Math.sin(x * 2.1 + s) +
    0.14 * Math.sin(x * 5.3 + s * 2.3) +
    0.08 * Math.sin(x * 11.7 + s * 4.1);
  return ridge.base + ridge.rise * Math.max(0, Math.min(1, w));
}

/** The terrace frame: where the ridges and the ground's far edge are laid out from. */
export const TERRACE = (() => {
  const p = pointAt(LAYOUT.contactU);
  return { x: p.x, z: p.z, heading: headingAt(LAYOUT.contactU), edge: LAYOUT.edgeU - LAYOUT.contactU };
})();
