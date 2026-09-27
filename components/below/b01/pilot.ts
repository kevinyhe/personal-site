import { V_MAX, type Fixed, type Robot } from "./drive";
import { LOOP_POINTS, ROBOT_R, SITES, clamp, wrap, type P2 } from "./world";

/**
 * The robot driving itself. It is given a line on the floor and steers at
 * a point a little way ahead along it, through the same throttle and steer
 * a person has, so it speeds up, brakes and shoves pucks like a driven
 * one, and finds the line again if something knocks it off.
 */

export type Path = {
  /** x, z, x, z ... */
  pts: Float32Array;
  /** Distance along the line to each point. */
  at: Float32Array;
  n: number;
  length: number;
  closed: boolean;
};

/** A smooth closed curve through the points, one after the other
 *  (Catmull-Rom), cut into short straight pieces. */
export function loopPath(points: P2[] = LOOP_POINTS, perSpan = 24): Path {
  const m = points.length;
  const n = m * perSpan;
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < m; i += 1) {
    const p0 = points[(i + m - 1) % m];
    const p1 = points[i];
    const p2 = points[(i + 1) % m];
    const p3 = points[(i + 2) % m];
    for (let k = 0; k < perSpan; k += 1) {
      const t = k / perSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      const o = (i * perSpan + k) * 2;
      pts[o] = 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3);
      pts[o + 1] = 0.5 * (2 * p1.z + (p2.z - p0.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (3 * p1.z - p0.z - 3 * p2.z + p3.z) * t3);
    }
  }
  return measure(pts, n, true);
}

/** True if a robot following the line would run into something solid. */
export function blocked(path: Path, fixed: Fixed[]): boolean {
  for (let i = 0; i < path.n; i += 1) {
    const x = path.pts[i * 2];
    const z = path.pts[i * 2 + 1];
    for (const f of fixed) {
      const reach = f.r + ROBOT_R + 0.2;
      if ((x - f.x) ** 2 + (z - f.z) ** 2 < reach * reach) return true;
    }
  }
  return false;
}

/** A curve from a point, leaving the way `th0` faces, to another,
 *  arriving the way `th1` faces. */
export function curveTo(x0: number, z0: number, th0: number, x1: number, z1: number, th1: number): Path {
  const reach = Math.hypot(x1 - x0, z1 - z0);
  const pull = clamp(reach * 0.45, 1.5, 12);
  const ax = x0 + Math.cos(th0) * pull;
  const az = z0 - Math.sin(th0) * pull;
  const bx = x1 - Math.cos(th1) * pull;
  const bz = z1 + Math.sin(th1) * pull;
  const n = 64;
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const u = 1 - t;
    pts[i * 2] = u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1;
    pts[i * 2 + 1] = u * u * u * z0 + 3 * u * u * t * az + 3 * u * t * t * bz + t * t * t * z1;
  }
  return measure(pts, n, false);
}

function measure(pts: Float32Array, n: number, closed: boolean): Path {
  const at = new Float32Array(n);
  let length = 0;
  for (let i = 1; i < n; i += 1) {
    length += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    at[i] = length;
  }
  if (closed) length += Math.hypot(pts[0] - pts[n * 2 - 2], pts[1] - pts[n * 2 - 1]);
  return { pts, at, n, length, closed };
}

/** The point of the line nearest the robot. With a hint, only the stretch
 *  just ahead of the hint is searched, so it cannot jump to another part
 *  of a line that passes close to itself. */
export function nearest(path: Path, x: number, z: number, hint = -1): number {
  let best = 0;
  let bestD = Infinity;
  const from = hint < 0 ? 0 : hint;
  const count = hint < 0 ? path.n : 14;
  for (let k = 0; k < count; k += 1) {
    let i = from + k;
    if (i >= path.n) {
      if (!path.closed) break;
      i -= path.n;
    }
    const d = (path.pts[i * 2] - x) ** 2 + (path.pts[i * 2 + 1] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export type Pilot = {
  path: Path;
  /** Index of the nearest point of the path. */
  i: number;
  /** Seconds it has wanted to move and has not. */
  stuck: number;
  /** Seconds of backing out left, and which way to turn while doing it. */
  backing: number;
  backSteer: number;
  /** A one-way path has been driven to its end and the robot is square. */
  arrived: boolean;
  /** What it asks of the drive. */
  throttle: number;
  steer: number;
};

export const newPilot = (path: Path, i: number): Pilot => ({
  path, i, stuck: 0, backing: 0, backSteer: 1, arrived: false, throttle: 0, steer: 0,
});

/** How far ahead along the line it aims. */
const AHEAD = 2.6;
const CRUISE = 0.62;
/** Inside a site's circle it goes this slowly, so the card can be read. */
const PAST_A_SITE = 0.26;

/** Works out throttle and steer for this step. `endHeading` is the way to
 *  face at the end of a one-way path. */
export function stepPilot(p: Pilot, r: Robot, fixed: Fixed[], dt: number, endHeading: number): void {
  const { path } = p;
  if (p.backing > 0) {
    p.backing -= dt;
    p.throttle = -0.45;
    p.steer = p.backSteer;
    return;
  }
  p.i = nearest(path, r.x, r.z, p.i);

  const left = path.closed ? Infinity : path.length - path.at[p.i];
  if (!path.closed && left < 0.5) {
    // At the end: stop, then turn on the spot to face the slab.
    const off = wrap(endHeading - r.th);
    p.throttle = 0;
    p.steer = Math.abs(r.v) > 0.4 ? 0 : clamp(off * 3, -0.9, 0.9);
    p.arrived = Math.abs(off) < 0.04 && Math.abs(r.v) < 0.1 && Math.abs(r.w) < 0.2;
    if (p.arrived) p.steer = 0;
    return;
  }

  // The point to aim at: AHEAD further along.
  let j = p.i;
  let walked = 0;
  while (walked < AHEAD) {
    let next = j + 1;
    if (next >= path.n) {
      if (!path.closed) break;
      next = 0;
    }
    walked += Math.hypot(path.pts[next * 2] - path.pts[j * 2], path.pts[next * 2 + 1] - path.pts[j * 2 + 1]);
    j = next;
    if (j === p.i) break;
  }
  const tx = path.pts[j * 2];
  const tz = path.pts[j * 2 + 1];
  const off = wrap(Math.atan2(-(tz - r.z), tx - r.x) - r.th);

  let steer = clamp(off * 2.4, -1, 1);
  // Facing well away from the line: turn first, drive after.
  let throttle = Math.abs(off) > 1.1 ? 0 : CRUISE * Math.max(0.3, Math.cos(off));

  let limit = 1;
  for (const s of SITES) {
    if ((r.x - s.zone.x) ** 2 + (r.z - s.zone.z) ** 2 < s.zoneR * s.zoneR) limit = PAST_A_SITE;
  }
  if (!path.closed) limit = Math.min(1, Math.sqrt(2 * 5 * Math.max(0, left - 0.3)) / V_MAX + 0.04);
  throttle = Math.min(throttle, limit);

  // Steer round anything solid that is close and in front.
  for (const f of fixed) {
    const dx = f.x - r.x;
    const dz = f.z - r.z;
    const gap = Math.hypot(dx, dz) - f.r - ROBOT_R;
    if (gap > 2.2) continue;
    const bearing = wrap(Math.atan2(-dz, dx) - r.th);
    if (Math.abs(bearing) > 1.2) continue;
    steer -= Math.sign(bearing || 1) * (1 - Math.max(0, gap) / 2.2) * 1.6;
  }
  p.steer = clamp(steer, -1, 1);
  p.throttle = throttle;

  // Wanting to go and not going: back out and try a different line.
  if (throttle > 0.1 && Math.abs(r.v) < 0.25) p.stuck += dt;
  else p.stuck = 0;
  if (p.stuck > 1.3) {
    p.stuck = 0;
    p.backing = 0.9;
    p.backSteer = off >= 0 ? -0.7 : 0.7;
  }
}
