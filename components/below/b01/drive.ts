import { PUCK_R, ROBOT_R, WORLD_R, clamp, type P2 } from "./world";

/**
 * How the robot and the pucks move. No physics library: the robot is a
 * two-sided drive base worked out from its left and right wheel speeds,
 * and everything that can touch is a circle on the floor.
 */

/** Top speed of a wheel over the ground, units a second. */
export const V_MAX = 7;
/** The share of wheel speed a full turn takes from one side and gives the other. */
const V_TURN = 1.35;
/** Distance between the left and right wheels, floor units. */
const TRACK = 1.15;
/** Speeding up is gentler than slowing down. */
const ACCEL = 9;
const BRAKE = 20;
/** How hard a wheel chases the speed it is asked for, 1/s. */
const RESPONSE = 3.2;

export type Robot = {
  x: number;
  z: number;
  /** Heading, not wrapped: it keeps counting past a full turn so the
   *  camera can follow it without jumping. */
  th: number;
  /** Ground speed of the left and right wheels. */
  vl: number;
  vr: number;
  /** Forward speed and turn rate, from the two above. */
  v: number;
  w: number;
  /** Nose up, radians, and how fast that is changing. */
  pitch: number;
  pitchV: number;
  /** Lean into a turn. */
  roll: number;
  /** How far each side has rolled this step, for turning the wheels. */
  dl: number;
  dr: number;
};

export const newRobot = (x: number, z: number, th: number): Robot => ({
  x, z, th, vl: 0, vr: 0, v: 0, w: 0, pitch: 0, pitchV: 0, roll: 0, dl: 0, dr: 0,
});

/** One wheel side toward the speed asked of it. The pull weakens as it
 *  gets close, so it eases into top speed and eases to a stop. */
function chase(now: number, want: number, dt: number): number {
  const slowing = Math.abs(want) < Math.abs(now) || want * now < 0;
  const rate = clamp((want - now) * RESPONSE, slowing ? -BRAKE : -ACCEL, slowing ? BRAKE : ACCEL);
  // Never past the target in one step.
  const next = now + rate * dt;
  return (want - now) * (want - next) < 0 ? want : next;
}

/** throttle and steer are -1..1. Steer is positive to the left. */
export function stepRobot(r: Robot, throttle: number, steer: number, dt: number): void {
  let wantL = throttle * V_MAX - steer * V_TURN;
  let wantR = throttle * V_MAX + steer * V_TURN;
  // Both sides scaled together if one asks for more than a wheel can do,
  // which keeps the turn and gives up speed.
  const over = Math.max(Math.abs(wantL), Math.abs(wantR)) / V_MAX;
  if (over > 1) {
    wantL /= over;
    wantR /= over;
  }
  const before = r.v;
  r.vl = chase(r.vl, wantL, dt);
  r.vr = chase(r.vr, wantR, dt);
  r.v = (r.vl + r.vr) / 2;
  r.w = (r.vr - r.vl) / TRACK;
  r.th += r.w * dt;
  r.x += Math.cos(r.th) * r.v * dt;
  r.z -= Math.sin(r.th) * r.v * dt;
  r.dl = r.vl * dt;
  r.dr = r.vr * dt;

  // The body on its springs: the nose lifts when it speeds up and dips
  // when it brakes, with a little overshoot.
  const accel = (r.v - before) / Math.max(dt, 1e-4);
  const wantPitch = clamp(accel * 0.0065, -0.085, 0.085);
  r.pitchV += (-2 * 0.42 * 10 * r.pitchV - 100 * (r.pitch - wantPitch)) * dt;
  r.pitch += r.pitchV * dt;
  const wantRoll = clamp(-r.w * r.v * 0.004, -0.05, 0.05);
  r.roll += (wantRoll - r.roll) * Math.min(1, dt * 7);
}

/** A thing that does not move: a post, a slab end, a wall section. */
export type Fixed = { x: number; z: number; r: number };

/** Push the robot out of what it has driven into and take away the part
 *  of its speed that was going into it. Turning on the spot still works
 *  against a wall, because that has no forward speed to lose. */
export function robotAgainstFixed(r: Robot, fixed: Fixed[]): void {
  for (const f of fixed) {
    const dx = r.x - f.x;
    const dz = r.z - f.z;
    const reach = f.r + ROBOT_R;
    const d2 = dx * dx + dz * dz;
    if (d2 >= reach * reach || d2 === 0) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    r.x += nx * (reach - d);
    r.z += nz * (reach - d);
    const into = (Math.cos(r.th) * nx - Math.sin(r.th) * nz) * r.v;
    if (into < 0) {
      const keep = 1 - Math.min(1, Math.abs(into) / (Math.abs(r.v) + 1e-3)) * 0.85;
      r.vl *= keep;
      r.vr *= keep;
    }
  }
  const out = Math.hypot(r.x, r.z);
  if (out > WORLD_R - ROBOT_R) {
    const k = (WORLD_R - ROBOT_R) / out;
    r.x *= k;
    r.z *= k;
  }
}

/** The pucks, as flat arrays so a step allocates nothing. */
export type Pucks = {
  n: number;
  x: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vz: Float32Array;
  /** Turn about the up axis and its rate; for show only. */
  a: Float32Array;
  va: Float32Array;
  /** How many times the robot has pushed one since the start. */
  shoved: number;
};

export function newPucks(at: P2[]): Pucks {
  const n = at.length;
  const p: Pucks = {
    n,
    x: new Float32Array(n),
    z: new Float32Array(n),
    vx: new Float32Array(n),
    vz: new Float32Array(n),
    a: new Float32Array(n),
    va: new Float32Array(n),
    shoved: 0,
  };
  at.forEach((c, i) => {
    p.x[i] = c.x;
    p.z[i] = c.z;
  });
  return p;
}

/** Sliding friction: a steady pull against the motion, so a puck loses
 *  speed at a constant rate and stops dead, the way one does on a floor. */
const SLIDE = 5.5;
const SPIN_DRAG = 3;
const BOUNCE_PUCK = 0.55;
const BOUNCE_FIXED = 0.4;
const BOUNCE_ROBOT = 0.25;

/** The robot's body for the pucks: where each circle sits, forward and to
 *  the right of the robot's middle. The model reaches further to its right. */
const BODY = [
  { fwd: 0.32, right: -0.18, r: 0.55 },
  { fwd: 0.32, right: 0.5, r: 0.55 },
  { fwd: -0.3, right: -0.18, r: 0.55 },
  { fwd: -0.3, right: 0.5, r: 0.55 },
];

/** True if anything is still moving, so a still frame knows it can stop. */
export function stepPucks(p: Pucks, r: Robot, fixed: Fixed[], dt: number): boolean {
  let moving = false;
  // Forward, and to the robot's right.
  const fx = Math.cos(r.th);
  const fz = -Math.sin(r.th);
  const rx = Math.sin(r.th);
  const rz = Math.cos(r.th);
  let dx = 0;
  let dz = 0;
  let reach = 0;
  let d2 = 0;

  for (let i = 0; i < p.n; i += 1) {
    // The robot, as four circles at its corners so its footprint is
    // nearly square. It is far heavier, so the puck takes all of the push.
    for (let c = 0; c < BODY.length; c += 1) {
      const ox = BODY[c].fwd * fx + BODY[c].right * rx;
      const oz = BODY[c].fwd * fz + BODY[c].right * rz;
      dx = p.x[i] - (r.x + ox);
      dz = p.z[i] - (r.z + oz);
      reach = BODY[c].r + PUCK_R;
      d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      p.x[i] += nx * (reach - d);
      p.z[i] += nz * (reach - d);
      // Speed of the robot's edge where it touches: its forward speed plus
      // what its turning adds at that point.
      const px = ox + nx * BODY[c].r;
      const pz = oz + nz * BODY[c].r;
      const cx = fx * r.v + r.w * pz;
      const cz = fz * r.v - r.w * px;
      const closing = (cx - p.vx[i]) * nx + (cz - p.vz[i]) * nz;
      if (closing > 0) {
        p.vx[i] += nx * closing * (1 + BOUNCE_ROBOT);
        p.vz[i] += nz * closing * (1 + BOUNCE_ROBOT);
        // A glancing push spins it.
        p.va[i] += ((cx - p.vx[i]) * -nz + (cz - p.vz[i]) * nx) * 0.8;
        if (closing > 0.3) p.shoved += 1;
        // It costs the robot a little.
        r.vl *= 0.985;
        r.vr *= 0.985;
      }
    }

    // Other pucks: equal weights, so they share the push.
    for (let j = i + 1; j < p.n; j += 1) {
      dx = p.x[j] - p.x[i];
      dz = p.z[j] - p.z[i];
      reach = PUCK_R * 2;
      d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const half = (reach - d) / 2;
      p.x[i] -= nx * half;
      p.z[i] -= nz * half;
      p.x[j] += nx * half;
      p.z[j] += nz * half;
      const closing = (p.vx[i] - p.vx[j]) * nx + (p.vz[i] - p.vz[j]) * nz;
      if (closing > 0) {
        const k = (closing * (1 + BOUNCE_PUCK)) / 2;
        p.vx[i] -= nx * k;
        p.vz[i] -= nz * k;
        p.vx[j] += nx * k;
        p.vz[j] += nz * k;
      }
    }

    // Things that do not move.
    for (const f of fixed) {
      dx = p.x[i] - f.x;
      dz = p.z[i] - f.z;
      reach = f.r + PUCK_R;
      d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      p.x[i] += nx * (reach - d);
      p.z[i] += nz * (reach - d);
      const into = p.vx[i] * nx + p.vz[i] * nz;
      if (into < 0) {
        p.vx[i] -= nx * into * (1 + BOUNCE_FIXED);
        p.vz[i] -= nz * into * (1 + BOUNCE_FIXED);
      }
    }

    // The edge of the floor.
    const out = Math.hypot(p.x[i], p.z[i]);
    if (out > WORLD_R - PUCK_R) {
      const nx = p.x[i] / out;
      const nz = p.z[i] / out;
      p.x[i] = nx * (WORLD_R - PUCK_R);
      p.z[i] = nz * (WORLD_R - PUCK_R);
      const into = p.vx[i] * nx + p.vz[i] * nz;
      if (into > 0) {
        p.vx[i] -= nx * into * 1.4;
        p.vz[i] -= nz * into * 1.4;
      }
    }

    const speed = Math.hypot(p.vx[i], p.vz[i]);
    if (speed > 0) {
      const left = Math.max(0, speed - SLIDE * dt);
      p.vx[i] *= left / speed;
      p.vz[i] *= left / speed;
      p.x[i] += p.vx[i] * dt;
      p.z[i] += p.vz[i] * dt;
      if (left > 0) moving = true;
    }
    if (p.va[i] !== 0) {
      p.va[i] *= Math.max(0, 1 - SPIN_DRAG * dt);
      if (Math.abs(p.va[i]) < 0.02) p.va[i] = 0;
      p.a[i] += p.va[i] * dt;
      moving = moving || p.va[i] !== 0;
    }
  }
  return moving;
}
