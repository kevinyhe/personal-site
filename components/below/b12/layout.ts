import { fbm2 } from "../../valley/sources/noise";

/**
 * Where everything on the map stands, and where the camera is at every
 * point of the scroll.
 *
 * Plain maths, no DOM and no three.js, so a Node script can import it and
 * print where each shrine and each card lands on screen.
 *
 * The map is a square 120 units across. x runs east, z runs south, y is
 * up. The camera looks north, so south is the bottom of the screen. The
 * river rises at the south edge and leaves by the north edge, and the
 * walk runs north with it: shrine 1 is nearest the viewer, shrine 5 the
 * furthest, and at the end the camera follows the river off the map.
 */

export type V3 = [number, number, number];

export const HALF = 60;
export const WATER_Y = -0.35;
/** Vertical field of view, degrees. */
export const FOV = 30;
export const NEAR = 1;
export const FAR = 900;

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const RAD = Math.PI / 180;

// ------------------------------------------------------------------ river

/** The river's middle, as an x for each z. Two slow bends. */
export function riverX(z: number): number {
  return 3 + 6 * Math.sin(z * 0.055 + 0.6) + 2.5 * Math.sin(z * 0.13 + 2.0);
}
/** Half its width. It widens as it runs north. */
export function riverHalf(z: number): number {
  return 1.4 + (HALF - clamp(z, -HALF, HALF)) * 0.012;
}

// ------------------------------------------------------------------ sites

export type PartKind = "shrine" | "torii" | "lanterns" | "pagoda" | "hall";

/** The size each builder is asked to draw at, px. The picture's shape is the sprite's shape. */
export const SNAP: Record<PartKind, { w: number; h: number }> = {
  shrine: { w: 640, h: 520 },
  torii: { w: 320, h: 360 },
  lanterns: { w: 320, h: 200 },
  pagoda: { w: 360, h: 520 },
  hall: { w: 480, h: 380 },
};
/**
 * The sprites stand upright and the camera looks down at 50 degrees, which
 * squashes them to about two thirds of their height. They are drawn this
 * much taller to give some of that back.
 */
export const STAND = 1.2;

/** One picture standing in a precinct: where, relative to its middle, and how wide. */
export type Part = { kind: PartKind; dx: number; dz: number; w: number };
export type Precinct = { x: number; z: number; parts: Part[] };

/** Five precincts, each put together differently from the same five builders. */
export const PRECINCTS: Precinct[] = [
  {
    // The lead project: the whole shrine, with its own gate on the approach.
    x: -17,
    z: 38,
    parts: [
      { kind: "shrine", dx: 0, dz: -1.5, w: 11.5 },
      { kind: "torii", dx: 0.5, dz: 5.5, w: 4.2 },
      { kind: "lanterns", dx: -4.2, dz: 3.2, w: 3.6 },
    ],
  },
  {
    // A tower, lanterns either side of the path, a gate in front.
    x: 19,
    z: 20,
    parts: [
      { kind: "pagoda", dx: 0, dz: -2, w: 6.4 },
      { kind: "lanterns", dx: -3.6, dz: 2.6, w: 3.4 },
      { kind: "lanterns", dx: 3.6, dz: 2.6, w: 3.4 },
      { kind: "torii", dx: 0, dz: 5.6, w: 4.4 },
    ],
  },
  {
    // A hall with a gate and lanterns on its axis.
    x: -19,
    z: 2,
    parts: [
      { kind: "hall", dx: 0, dz: -2, w: 10 },
      { kind: "lanterns", dx: 0, dz: 2.2, w: 3.8 },
      { kind: "torii", dx: 0, dz: 5.6, w: 4.2 },
    ],
  },
  {
    // A tunnel of three gates leading up to a tower and a hall side by side.
    x: 17,
    z: -17,
    parts: [
      { kind: "pagoda", dx: -3.8, dz: -3, w: 5.2 },
      { kind: "hall", dx: 3.6, dz: -3.4, w: 7 },
      { kind: "torii", dx: 0, dz: 1.4, w: 3.8 },
      { kind: "torii", dx: 0, dz: 3.6, w: 3.8 },
      { kind: "torii", dx: 0, dz: 5.8, w: 3.8 },
    ],
  },
  {
    // A tower and a hall, lanterns between them.
    x: -14,
    z: -36,
    parts: [
      { kind: "pagoda", dx: -3.6, dz: -2, w: 6 },
      { kind: "hall", dx: 3.6, dz: -1.6, w: 8 },
      { kind: "lanterns", dx: 0, dz: 3.6, w: 3.6 },
    ],
  },
];

/** Half the side of each precinct's gravel court. */
export const COURT = 7.5;

/** The five villages the skills stand in, one per group. East and west of the shrines. */
export const VILLAGES: { x: number; z: number }[] = [
  { x: 41, z: 42 },
  { x: -42, z: 22 },
  { x: 42, z: 2 },
  { x: -42, z: -16 },
  { x: 40, z: -40 },
];

/** A village's ring of lanterns: how wide, for a group of n. */
export const villageRadius = (n: number): number => 2 + n * 0.42;

/** Where lantern j of n stands in village v. */
export function lanternAt(v: number, j: number, n: number): [number, number] {
  const c = VILLAGES[v];
  const r = villageRadius(n);
  const a = (j / n) * Math.PI * 2 + v * 0.7;
  return [c.x + Math.cos(a) * r, c.z + Math.sin(a) * r];
}

// ---------------------------------------------------------------- terrain

/** The land before the building plots are levelled. */
function heightRaw(x: number, z: number): number {
  const d = Math.abs(x - riverX(z));
  const valley = 8 * smooth(3, 46, d);
  const hills = 9 * (fbm2(x * 0.035 + 11, z * 0.035 + 7, 4, 1201) - 0.5) * smooth(2, 14, d);
  const bed = -1.2 * (1 - smooth(0, riverHalf(z) + 1.2, d));
  return valley + hills + bed;
}

type Site = { x: number; z: number; r0: number; r1: number; h: number };
const SITES: Site[] = [
  ...PRECINCTS.map((p) => ({ x: p.x, z: p.z, r0: 10, r1: 16, h: heightRaw(p.x, p.z) })),
  ...VILLAGES.map((v) => ({ x: v.x, z: v.z, r0: 8, r1: 13, h: heightRaw(v.x, v.z) })),
];

/** The ground's height. Each precinct and village sits on a level plot. */
export function heightAt(x: number, z: number): number {
  let h = heightRaw(x, z);
  for (const s of SITES) {
    const w = 1 - smooth(s.r0, s.r1, Math.hypot(x - s.x, z - s.z));
    if (w > 0) h = lerp(h, s.h, w);
  }
  return h;
}

/** The ground's height inside the map, and the water's out past its edge. */
export function groundAt(x: number, z: number): number {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return WATER_Y;
  return Math.max(heightAt(x, z), WATER_Y);
}

export const siteHeight = (i: number): number => SITES[i].h;

// ------------------------------------------------------------------- walk

/** The gate of each precinct: the court's south side, where the walk arrives. */
export const gateOf = (i: number): [number, number] => [PRECINCTS[i].x, PRECINCTS[i].z + COURT + 1.5];

/**
 * The walking path's knots: each gate, and between two gates a bend that
 * swings the path to one side, so it wanders rather than runs straight.
 */
export const WALK_KNOTS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < PRECINCTS.length; i += 1) {
    const g = gateOf(i);
    out.push(g);
    if (i < PRECINCTS.length - 1) {
      const n = gateOf(i + 1);
      const mx = (g[0] + n[0]) / 2;
      const mz = (g[1] + n[1]) / 2;
      const dx = n[0] - g[0];
      const dz = n[1] - g[1];
      const len = Math.hypot(dx, dz) || 1;
      const side = i % 2 ? 5 : -5;
      out.push([mx + (-dz / len) * side, mz + (dx / len) * side]);
    }
  }
  return out;
})();

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** A point on a Catmull-Rom curve through the knots; s runs 0 to knots - 1. */
export function curve(knots: readonly (readonly number[])[], s: number): number[] {
  const last = knots.length - 1;
  const c = clamp(s, 0, last);
  const i = Math.min(last - 1, Math.floor(c));
  const t = c - i;
  const a = knots[Math.max(0, i - 1)];
  const b = knots[i];
  const d = knots[i + 1];
  const e = knots[Math.min(last, i + 2)];
  return b.map((_, j) => catmull(a[j], b[j], d[j], e[j], t));
}

/** A point on the walk. k runs 0 (gate 1) to 4 (gate 5), one unit per leg. */
export const walkAt = (k: number): [number, number] => {
  const p = curve(WALK_KNOTS, k * 2);
  return [p[0], p[1]];
};

// ----------------------------------------------------------------- camera

export type Cam = {
  target: V3;
  dist: number;
  /** Down from level, radians. */
  pitch: number;
  /** Round the vertical; 0 looks north. */
  yaw: number;
};

export function camPosition(c: Cam): V3 {
  const h = Math.cos(c.pitch) * c.dist;
  return [c.target[0] + h * Math.sin(c.yaw), c.target[1] + Math.sin(c.pitch) * c.dist, c.target[2] + h * Math.cos(c.yaw)];
}

export type Screen = { x: number; y: number; depth: number };

/** Where a point lands, as shares of the stage from its top left. depth is along the view; under NEAR is behind. */
export function project(p: V3, c: Cam, aspect: number): Screen {
  const o = camPosition(c);
  let fx = c.target[0] - o[0];
  let fy = c.target[1] - o[1];
  let fz = c.target[2] - o[2];
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x up, up' = right x forward
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl;
  rz /= rl;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const vx = p[0] - o[0];
  const vy = p[1] - o[1];
  const vz = p[2] - o[2];
  const depth = vx * fx + vy * fy + vz * fz;
  const t = Math.tan((FOV * RAD) / 2);
  const xn = (vx * rx + vz * rz) / (depth * t * aspect);
  const yn = (vx * ux + vy * uy + vz * uz) / (depth * t);
  return { x: (xn + 1) / 2, y: (1 - yn) / 2, depth };
}

/**
 * The camera target that puts point p at (sx, sy) on screen, for a camera
 * at this distance, pitch and yaw. Found by nudging the target until the
 * point lands; four rounds get it within a hair.
 */
export function frame(p: V3, sx: number, sy: number, dist: number, pitch: number, yaw: number, aspect: number): Cam {
  const cam: Cam = { target: [p[0], p[1], p[2]], dist, pitch, yaw };
  const t = Math.tan((FOV * RAD) / 2);
  const halfH = dist * t;
  const halfW = halfH * aspect;
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const ax = -Math.sin(yaw);
  const az = -Math.cos(yaw);
  for (let n = 0; n < 6; n += 1) {
    const s = project(p, cam, aspect);
    const ex = (s.x - sx) * 2;
    const ey = (s.y - sy) * 2;
    // Too far right: move the target right, which moves the point left.
    cam.target[0] += rx * ex * halfW;
    cam.target[2] += rz * ex * halfW;
    // Too low: move the target back toward the camera, which lifts it.
    const along = (ey * halfH) / Math.sin(pitch);
    cam.target[0] -= ax * along;
    cam.target[2] -= az * along;
  }
  return cam;
}

// --------------------------------------------------------------- the scroll

/**
 * The scroll, in screens from the top of the design (u). Work is u 0 to 5,
 * skills 5 to 7, contact 7 to 9.
 *
 * Between two shrines the camera travels over 60 per cent of a screen and
 * then holds for 40.
 */
export const TRAVEL: [number, number][] = [
  [0.55, 1.15],
  [1.55, 2.15],
  [2.55, 3.15],
  [3.55, 4.15],
];
export const STOP_U = [0.25, 1.35, 2.35, 3.35, 4.6];
export const LIFT: [number, number] = [5.0, 6.0];
export const SKILLS_U = 6.5;
export const FLY: [number, number] = [7.0, 8.0];
export const CONTACT_U = 8.6;
export const END_U = 9;

/** Which leg of the walk the camera is on: 0 at shrine 1, 4 at shrine 5. */
export const walkK = (u: number): number => TRAVEL.reduce((k, [a, b]) => k + smooth(a, b, u), 0);

/** Where a precinct should sit on screen, and where its card goes. */
export const PRECINCT_AT = { x: 0.32, y: 0.57 };
export const OVERVIEW_AT = { x: 0.3, y: 0.52 };
/** The card: shares of the stage. The DOM uses the same numbers in vw and vh. */
export const CARD = { x0: 0.6, x1: 0.93, y0: 0.26, y1: 0.76 };
export const SKILLS_PANEL = { x0: 0.6, x1: 0.95, y0: 0.12, y1: 0.9 };
/** The small map, in rem from the bottom left. Width and height 20rem, 4.5vw and 5vh in. */
export const MINIMAP = { size: 20, left: 0.045, bottom: 0.05 };
export const EMAIL_BOX = { x0: 0.1, x1: 0.9, y0: 0.2, y1: 0.52 };

export const STOP_DIST = 52;
const STOP_PITCH = 50 * RAD;
const STOP_YAW = [-0.12, 0.1, -0.08, 0.12, -0.06];
const TRAVEL_LIFT = 20;
export const OVERVIEW_DIST = 285;
const OVERVIEW_PITCH = 54 * RAD;
export const CONTACT_DIST = 64;
const CONTACT_PITCH = 44 * RAD;
/** How far past the north edge the camera ends: the margin the email sits on. */
const PAST_EDGE = 11;

export const precinctPoint = (i: number): V3 => [PRECINCTS[i].x, siteHeight(i), PRECINCTS[i].z];

/** The camera at rest over shrine i. */
export function stopCam(i: number, aspect: number): Cam {
  return frame(precinctPoint(i), PRECINCT_AT.x, PRECINCT_AT.y, STOP_DIST, STOP_PITCH, STOP_YAW[i], aspect);
}
export function overviewCam(aspect: number, at = OVERVIEW_AT): Cam {
  return frame([0, 3, 0], at.x, at.y, OVERVIEW_DIST, OVERVIEW_PITCH, 0, aspect);
}
/** The river's line, run on past the north edge. */
function riverPoint(z: number): V3 {
  return [riverX(clamp(z, -HALF, HALF)), WATER_Y, z];
}
export function contactCam(): Cam {
  return { target: riverPoint(-HALF - PAST_EDGE), dist: CONTACT_DIST, pitch: CONTACT_PITCH, yaw: 0 };
}

const mixCam = (a: Cam, b: Cam, t: number): Cam => ({
  target: [lerp(a.target[0], b.target[0], t), lerp(a.target[1], b.target[1], t), lerp(a.target[2], b.target[2], t)],
  dist: lerp(a.dist, b.dist, t),
  pitch: lerp(a.pitch, b.pitch, t),
  yaw: lerp(a.yaw, b.yaw, t),
});

export type State = {
  cam: Cam;
  /** How far along the walk the dashes are filled: 0 to 4. */
  k: number;
  /** The shrine nearest the camera. */
  stop: number;
  /** How much of each card shows, 0 to 1. */
  cards: number[];
  /** How far the lanterns have risen, 0 to 1. */
  rise: number;
  /** How much of the skills words and the contact words show. */
  skills: number;
  contact: number;
  /** The small map and the hint. */
  chrome: number;
};

/** Everything the scroll decides, at scroll u. */
export function stateAt(u: number, aspect: number): State {
  const k = walkK(u);
  const i = Math.min(3, Math.floor(k));
  const e = k - i;
  // Along the walk: the targets of the stops joined by one smooth curve.
  const stops = [0, 1, 2, 3, 4].map((n) => stopCam(n, aspect));
  const knots = stops.map((c) => [...c.target, c.yaw]);
  const at = curve(knots, k);
  const lift = Math.sin(Math.PI * e);
  let cam: Cam = {
    target: [at[0], at[1], at[2]],
    dist: STOP_DIST + TRAVEL_LIFT * lift,
    pitch: STOP_PITCH + 6 * RAD * lift,
    yaw: at[3],
  };
  const l = smooth(LIFT[0], LIFT[1], u);
  if (l > 0) cam = mixCam(cam, overviewCam(aspect), l);
  const f = smooth(FLY[0], FLY[1], u);
  if (f > 0) {
    // Down onto the river, then along it north and off the edge.
    const ov = overviewCam(aspect);
    const z = lerp(ov.target[2], -HALF - PAST_EDGE, f);
    const onRiver: Cam = { target: riverPoint(z), dist: lerp(OVERVIEW_DIST, CONTACT_DIST, f), pitch: lerp(OVERVIEW_PITCH, CONTACT_PITCH, f), yaw: 0 };
    cam = mixCam(ov, onRiver, smooth(0, 0.4, f));
  }
  const workOut = 1 - smooth(4.95, 5.25, u);
  const cards = [0, 1, 2, 3, 4].map((n) => clamp(1 - Math.abs(k - n) * 3, 0, 1) * workOut);
  return {
    cam,
    k,
    stop: clamp(Math.round(k), 0, 4),
    cards,
    rise: smooth(5.3, 6.1, u) * (1 - smooth(7.3, 7.9, u)),
    skills: smooth(5.95, 6.2, u) * (1 - smooth(6.9, 7.15, u)),
    contact: smooth(7.9, 8.15, u),
    // The small map is for the walk. Over the whole valley it would only
    // cover a corner of the big one.
    chrome: 1 - smooth(4.95, 5.25, u),
  };
}

/**
 * The still map, for a visitor who asked for less motion: the whole valley
 * in the middle of its own box, lanterns up, the walk drawn in full.
 */
export function stillState(aspect: number): State {
  const dist = OVERVIEW_DIST * Math.max(1, 1.25 / aspect);
  return {
    cam: frame([0, 3, 0], 0.5, 0.5, dist, OVERVIEW_PITCH, 0, aspect),
    k: 4,
    stop: 0,
    cards: [1, 1, 1, 1, 1],
    rise: 1,
    skills: 1,
    contact: 1,
    chrome: 0,
  };
}

/** Where a village's name goes: just south of its green. */
export function villageLabelPoint(v: number, n: number): V3 {
  const c = VILLAGES[v];
  const z = c.z + villageRadius(n) + 3.5;
  return [c.x, heightAt(c.x, z), z];
}

/** The top of a precinct's tallest picture, where its pin goes. */
export function pinPoint(i: number): V3 {
  const p = PRECINCTS[i];
  let top = 0;
  for (const part of p.parts) top = Math.max(top, part.w * (SNAP[part.kind].h / SNAP[part.kind].w) * STAND);
  return [p.x, siteHeight(i) + top * 0.9 + 1.5, p.z - 2];
}

/** The corners of every picture in a precinct, for the check. */
export function precinctCorners(i: number, yaw: number): V3[] {
  const p = PRECINCTS[i];
  const y0 = siteHeight(i);
  const out: V3[] = [];
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  for (const part of p.parts) {
    const h = part.w * (SNAP[part.kind].h / SNAP[part.kind].w) * STAND;
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [0, 1]) {
        out.push([p.x + part.dx + rx * sx * part.w, y0 + sy * h, p.z + part.dz + rz * sx * part.w]);
      }
    }
  }
  return out;
}
