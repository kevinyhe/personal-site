/**
 * The game balls: where each one sits on the floor, how the robot's intake
 * picks it up, how it rides the tower to the indexer, and how it is thrown
 * out of the back into the goal trough at the end of the run.
 *
 * Pure TypeScript, no DOM, no three.js — importable from Node so the motion
 * can be audited offline.
 *
 * Why this is not a physics stepper
 * ---------------------------------
 * The scene is scroll-scrubbed. The viewer can scroll backwards and the run
 * has to play backwards, frame for frame. Anything that integrates velocity
 * across calls would drift apart from itself the moment the playhead moves
 * the other way. So `ballStatesAt(t)` evaluates the position of every ball
 * directly from `t` — closed form for the flight arc, arc-length lookup
 * along a fixed internal path for the ride through the robot. Spin is the
 * one quantity that genuinely accumulates (a rolling ball's orientation is
 * the integral of its motion), so it is baked once into a fixed table at
 * module load and read back by interpolation. The table never changes, so
 * two calls at the same `t` return the same numbers.
 *
 * Units and frames
 * ----------------
 * - Output is in STAGE units, world space: x camera-right, y up, z toward
 *   the camera, floor at ROBOT_GROUND_Y.
 * - `robotDrift` works in robot lengths; 1 robot length = STAGE_PER_ROBOT_LENGTH
 *   stage units.
 * - Model space is the robot's own frame in stage units: z forward, y up
 *   with y = 0 at the robot's ground contact, x lateral. World forward is
 *   (sin h, 0, cos h) and world +x-of-model is (cos h, 0, -sin h), matching
 *   the heading convention in `robotDrift`. The internal ball path runs down
 *   the middle of the robot, so its lateral coordinate is zero throughout
 *   and which way x points does not affect the path.
 *
 * The internal path (measured off the Fusion assembly, converted from the
 * Z-up inch model): front lip at z +0.72 / y 0.40, preroller at +0.51 /
 * 0.38, three tower sprockets climbing to y 1.18, then the indexer flex
 * wheels at the top rear, z -0.10 to -0.24, y 1.29. The exit height is the
 * goal trough height — that is why the robot can just back up and spit the
 * balls straight in.
 */

import * as robotDrift from './robotDrift';
import { buildDriftPath, type RobotDriftFrame } from './robotDrift';

export type BallState = {
  /** True while the ball is inside the robot, from the intake grab to the moment the indexer throws it. */
  carried: boolean;
  /** Stage units, world space. */
  position: [number, number, number];
  /** Euler angles in radians, XYZ order (three.js default). */
  rotation: [number, number, number];
};

/** Pose of the robot on the floor at some instant, in the drift module's units. */
export type RobotPose = {
  /** Radians, continuous (never wrapped), 0 along +z. */
  heading: number;
  /** Robot lengths, [x, z]. */
  position: [number, number];
};

/** Ball radius, stage units. */
export const BALL_RADIUS = 0.156;
/** Floor height in the stage, stage units. */
export const ROBOT_GROUND_Y = -1.2;
/** One robot length in stage units. */
export const STAGE_PER_ROBOT_LENGTH = 1.6;

/** Robot length along its own z, stage units — the front lip sits at half of this. */
const ROBOT_LENGTH = 1.6;
/** How far forward the intake mouth reaches, model z, stage units. */
const MOUTH_Z = ROBOT_LENGTH / 2;
/** Height of the indexer exit, model y, stage units. */
const INDEXER_Y = 1.29;
/**
 * Height a ball comes to rest at inside the goal, model y, stage units. This
 * is NOT the indexer height: the Long Goal's ball channel was measured off the
 * asset at 1.527 (see components/propModels.ts), a quarter of a unit above
 * where the robot lets go. The throw arc therefore climbs into the mouth,
 * which is what a real robot does — it shoots slightly upward into the goal.
 */
const TROUGH_Y = 1.527;

/** Number of balls on the floor. */
const BALL_COUNT = 5;
/** Seconds a ball spends between the intake grab and sitting in the indexer. */
const CARRY_DURATION = 0.85;
/** Seconds of quiet after the robot parks before the first ball is thrown. */
const EJECT_LEAD_IN = 0.3;
/** Seconds between one ball leaving the indexer and the next. */
const EJECT_SPACING = 0.34;
/** Seconds a thrown ball spends in the air. */
const FLIGHT_DURATION = 0.35;
/** Gravity used for the throw arc, stage units per second squared. */
const FLIGHT_GRAVITY = 9;
/** Seconds of settling hop after a ball lands in the trough. */
const BOUNCE_DURATION = 0.2;
/** Height of that settling hop, stage units. */
const BOUNCE_HEIGHT = 0.05;
/** Model z the balls come to rest at inside the trough, stage units (behind the robot's rear at -0.8). */
const TROUGH_Z = -1.2;
/** Lateral gap between balls resting in the trough, stage units. */
const TROUGH_SPACING = 0.34;
/**
 * Small fixed lateral offsets so the row in the trough does not look drawn
 * with a ruler. Fixed literals, not random, because the run must replay
 * identically every time.
 */
const TROUGH_JITTER = [0.03, -0.04, 0.02, 0.05, -0.02];

/** Samples per second in the drift path this module reads. */
const DRIFT_SAMPLE_RATE = 60;
/** Samples per second used to bake ball spin. */
const SPIN_SAMPLE_RATE = 120;

/**
 * The ride through the robot, model space, [z, y] in stage units. The ball
 * is threaded onto this after its own floor position, which is prepended
 * per ball so the pick-up is continuous with where the ball was lying.
 *
 * The preroller sits 0.02 below the front lip: the measured geometry pulls
 * the ball down a touch as it takes it off the lip, so the climb is not
 * strictly monotonic over that first pair of points. Everything after is.
 */
const CARRY_PATH: Array<[number, number]> = [
  [0.72, 0.4], // front lip, half-flex wheels
  [0.51, 0.38], // preroller
  [0.24, 0.49], // tower sprocket, bottom
  [0.14, 0.72], // tower sprocket, middle
  [0.2, 1.18], // tower sprocket, top
  [-0.1, INDEXER_Y], // indexer flex wheels, entry
  [-0.24, INDEXER_Y], // indexer, holding position
];

/**
 * Fractions of the drift where the fallback pick-ups happen, used only
 * while `robotDrift` does not yet export `BALL_PICKUP_TIMES`. They sit in
 * the middle of the run so the robot is still moving at every grab and the
 * last ball still has time to reach the indexer before the throw.
 */
const FALLBACK_PICKUP_FRACTIONS = [0.22, 0.34, 0.46, 0.58, 0.7];

type PickupSpec = {
  /** Seconds from the start of the run. */
  time: number;
  /** Where the ball lies, robot lengths, [x, z]. */
  position: [number, number];
};

/**
 * Unit 3 is adding `DRIFT_FINISH` and `BALL_PICKUP_TIMES` to `robotDrift`.
 * They may not be there yet, so the module is read through an optional
 * shape rather than imported by name: with them we use the real values,
 * without them we fall back to the drift path itself (finish = last frame,
 * pick-ups = wherever the intake mouth happens to be at
 * FALLBACK_PICKUP_FRACTIONS of the run). Either way nothing throws.
 */
type DriftExtras = {
  BALL_PICKUP_TIMES?: PickupSpec[];
  DRIFT_FINISH?: RobotPose;
};

const driftExtras = robotDrift as unknown as DriftExtras;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Hermite smoothstep: zero slope at both ends, so nothing starts or stops with a jerk. */
function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

type Vec3 = [number, number, number];
type Quat = [number, number, number, number]; // x, y, z, w

function modelToWorld(model: Vec3, pose: RobotPose): Vec3 {
  const sinH = Math.sin(pose.heading);
  const cosH = Math.cos(pose.heading);
  const originX = pose.position[0] * STAGE_PER_ROBOT_LENGTH;
  const originZ = pose.position[1] * STAGE_PER_ROBOT_LENGTH;
  return [
    originX + model[2] * sinH + model[0] * cosH,
    ROBOT_GROUND_Y + model[1],
    originZ + model[2] * cosH - model[0] * sinH,
  ];
}

function worldToModel(world: Vec3, pose: RobotPose): Vec3 {
  const sinH = Math.sin(pose.heading);
  const cosH = Math.cos(pose.heading);
  const dx = world[0] - pose.position[0] * STAGE_PER_ROBOT_LENGTH;
  const dz = world[2] - pose.position[1] * STAGE_PER_ROBOT_LENGTH;
  return [dx * cosH - dz * sinH, world[1] - ROBOT_GROUND_Y, dx * sinH + dz * cosH];
}

let driftFrames: RobotDriftFrame[] | null = null;

function frames(): RobotDriftFrame[] {
  if (!driftFrames) driftFrames = buildDriftPath({ sampleRate: DRIFT_SAMPLE_RATE });
  return driftFrames;
}

/** When the robot stops moving — the end of the drift path. */
function driftEnd() {
  const list = frames();
  return list[list.length - 1].time;
}

/**
 * Where the robot is parked once the drift is over. Unit 3's `DRIFT_FINISH`
 * when it exists, otherwise the last frame of the path (the same pose, just
 * recomputed here).
 */
function finishPose(): RobotPose {
  const supplied = driftExtras.DRIFT_FINISH;
  if (supplied) return { heading: supplied.heading, position: [supplied.position[0], supplied.position[1]] };
  const list = frames();
  const last = list[list.length - 1];
  return { heading: last.heading, position: [last.position[0], last.position[1]] };
}

/** Robot pose at any playhead time; before the run it holds the first frame, after it the parked pose. */
export function robotPoseAt(time: number): RobotPose {
  const list = frames();
  if (time <= 0) return { heading: list[0].heading, position: [list[0].position[0], list[0].position[1]] };
  if (time >= driftEnd()) return finishPose();
  const exact = time * DRIFT_SAMPLE_RATE;
  const lower = Math.min(list.length - 2, Math.floor(exact));
  const blend = exact - lower;
  const a = list[lower];
  const b = list[lower + 1];
  return {
    // Heading is continuous in the drift path (never wrapped), so a plain
    // lerp cannot jump a turn here.
    heading: a.heading + (b.heading - a.heading) * blend,
    position: [
      a.position[0] + (b.position[0] - a.position[0]) * blend,
      a.position[1] + (b.position[1] - a.position[1]) * blend,
    ],
  };
}

/**
 * Pick-up schedule. Unit 3's `BALL_PICKUP_TIMES` when present, otherwise a
 * fallback derived from the drift path: take the mouth position at a few
 * fractions of the run and drop a ball there. Either source is sorted by
 * time and trimmed to what the drift can actually service.
 */
function pickupSchedule(): PickupSpec[] {
  const end = driftEnd();
  const supplied = driftExtras.BALL_PICKUP_TIMES;
  const raw: PickupSpec[] = supplied?.length
    ? supplied.map((entry) => ({
        position: [entry.position[0], entry.position[1]],
        time: clamp(entry.time, 0, end),
      }))
    : FALLBACK_PICKUP_FRACTIONS.slice(0, BALL_COUNT).map((fraction) => {
        const time = fraction * end;
        const mouth = modelToWorld([0, BALL_RADIUS, MOUTH_Z], robotPoseAt(time));
        return {
          position: [mouth[0] / STAGE_PER_ROBOT_LENGTH, mouth[2] / STAGE_PER_ROBOT_LENGTH],
          time,
        } as PickupSpec;
      });
  return raw.slice().sort((a, b) => a.time - b.time);
}

type BallPlan = {
  /** Cumulative arc length along `path`, same length as `path`. */
  arc: number[];
  /** When the indexer throws this ball, seconds. */
  ejectTime: number;
  /** When the intake grabs it, seconds. */
  pickupTime: number;
  /** Model-space ride: the ball's own resting spot first, then CARRY_PATH. */
  path: Vec3[];
  /** Where it lies before the robot arrives, world stage units. */
  restPosition: Vec3;
  /** Where it comes to rest in the trough, world stage units. */
  troughPosition: Vec3;
};

let plans: BallPlan[] | null = null;
let timelineEnd = 0;

function buildPlans(): BallPlan[] {
  const schedule = pickupSchedule();
  const parked = finishPose();
  const count = schedule.length;

  // The first throw waits for both the robot to park and the last ball to
  // finish climbing, so nothing is fired out of an empty indexer.
  const lastArrival = schedule.length ? schedule[schedule.length - 1].time + CARRY_DURATION : 0;
  const firstEject = Math.max(driftEnd(), lastArrival) + EJECT_LEAD_IN;

  const built = schedule.map((entry, index) => {
    const restPosition: Vec3 = [
      entry.position[0] * STAGE_PER_ROBOT_LENGTH,
      ROBOT_GROUND_Y + BALL_RADIUS,
      entry.position[1] * STAGE_PER_ROBOT_LENGTH,
    ];
    // Start the internal path at wherever the ball actually is, expressed
    // in the robot's frame at the instant of the grab. That makes the
    // hand-off exact even if the supplied pick-up position is not perfectly
    // under the mouth.
    const entryModel = worldToModel(restPosition, robotPoseAt(entry.time));
    const path: Vec3[] = [entryModel, ...CARRY_PATH.map(([z, y]) => [0, y, z] as Vec3)];
    const arc: number[] = [0];
    for (let i = 1; i < path.length; i += 1) {
      const dx = path[i][0] - path[i - 1][0];
      const dy = path[i][1] - path[i - 1][1];
      const dz = path[i][2] - path[i - 1][2];
      arc.push(arc[i - 1] + Math.hypot(dx, dy, dz));
    }
    // Balls line up across the trough in the order they were thrown.
    const lateral = (index - (count - 1) / 2) * TROUGH_SPACING + TROUGH_JITTER[index % TROUGH_JITTER.length];
    return {
      arc,
      ejectTime: firstEject + index * EJECT_SPACING,
      path,
      pickupTime: entry.time,
      restPosition,
      troughPosition: modelToWorld([lateral, TROUGH_Y, TROUGH_Z], parked),
    };
  });

  timelineEnd = built.length
    ? built[built.length - 1].ejectTime + FLIGHT_DURATION + BOUNCE_DURATION
    : driftEnd();
  return built;
}

function ballPlans(): BallPlan[] {
  if (!plans) plans = buildPlans();
  return plans;
}

/** Point on a ball's internal path at fraction `s` of its total length, model space. */
function pathPoint(plan: BallPlan, s: number): Vec3 {
  const total = plan.arc[plan.arc.length - 1];
  const target = clamp(s, 0, 1) * total;
  let i = 1;
  while (i < plan.arc.length - 1 && plan.arc[i] < target) i += 1;
  const span = plan.arc[i] - plan.arc[i - 1];
  const blend = span > 1e-9 ? (target - plan.arc[i - 1]) / span : 0;
  const a = plan.path[i - 1];
  const b = plan.path[i];
  return [a[0] + (b[0] - a[0]) * blend, a[1] + (b[1] - a[1]) * blend, a[2] + (b[2] - a[2]) * blend];
}

/** Where a ball is at time `t`, in world stage units, and whether the robot is holding it. */
function ballAt(plan: BallPlan, time: number): { carried: boolean; position: Vec3 } {
  if (time <= plan.pickupTime) return { carried: false, position: plan.restPosition };

  if (time < plan.ejectTime) {
    // Inside the robot: climb the path over CARRY_DURATION, then sit at the
    // indexer. Smoothstep on the arc parameter means the ball leaves the
    // floor and arrives at the indexer without a velocity step.
    const s = smoothstep((time - plan.pickupTime) / CARRY_DURATION);
    const model = pathPoint(plan, s);
    return { carried: true, position: modelToWorld(model, robotPoseAt(time)) };
  }

  const release = modelToWorld(plan.path[plan.path.length - 1], finishPose());
  const flight = time - plan.ejectTime;

  if (flight < FLIGHT_DURATION) {
    // A plain projectile from the indexer to the resting spot in the
    // trough. Both ends are at the same height, so the vertical launch
    // speed is whatever brings it back down in FLIGHT_DURATION and the arc
    // peaks halfway across.
    const u = flight / FLIGHT_DURATION;
    const rise = (FLIGHT_GRAVITY * FLIGHT_DURATION) / 2;
    return {
      carried: false,
      position: [
        release[0] + (plan.troughPosition[0] - release[0]) * u,
        release[1] + rise * flight - 0.5 * FLIGHT_GRAVITY * flight * flight,
        release[2] + (plan.troughPosition[2] - release[2]) * u,
      ],
    };
  }

  const settle = time - plan.ejectTime - FLIGHT_DURATION;
  if (settle < BOUNCE_DURATION) {
    // One small damped hop so the ball does not stick to the trough floor
    // the instant it touches it.
    const u = settle / BOUNCE_DURATION;
    const hop = BOUNCE_HEIGHT * Math.sin(Math.PI * u) * (1 - u);
    return {
      carried: false,
      position: [plan.troughPosition[0], plan.troughPosition[1] + hop, plan.troughPosition[2]],
    };
  }

  return { carried: false, position: plan.troughPosition };
}

function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function quatSlerp(a: Quat, b: Quat, blend: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let end: Quat = b;
  if (dot < 0) {
    end = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    const out: Quat = [
      a[0] + (end[0] - a[0]) * blend,
      a[1] + (end[1] - a[1]) * blend,
      a[2] + (end[2] - a[2]) * blend,
      a[3] + (end[3] - a[3]) * blend,
    ];
    const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
    return [out[0] / len, out[1] / len, out[2] / len, out[3] / len];
  }
  const theta = Math.acos(clamp(dot, -1, 1));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - blend) * theta) / sinTheta;
  const wb = Math.sin(blend * theta) / sinTheta;
  return [
    a[0] * wa + end[0] * wb,
    a[1] * wa + end[1] * wb,
    a[2] * wa + end[2] * wb,
    a[3] * wa + end[3] * wb,
  ];
}

/** XYZ-order Euler angles from a unit quaternion, matching three.js `Euler` defaults. */
function quatToEulerXYZ(q: Quat): Vec3 {
  const [x, y, z, w] = q;
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - w * z);
  const m13 = 2 * (x * z + w * y);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - w * x);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const ry = Math.asin(clamp(m13, -1, 1));
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-m23, m33), ry, Math.atan2(-m12, m11)];
  }
  return [Math.atan2(m32, m22), ry, 0];
}

/**
 * Spin, baked once. A ball rolling along a direction d turns about
 * up x d by (distance / radius) — that holds while it is on the floor,
 * while the rollers drive it up the tower, and near enough in the air,
 * where the horizontal direction is fixed so the axis stays put. Purely
 * vertical motion (the settling hop) leaves the orientation alone.
 */
let spinTable: Quat[][] | null = null;

function ballSpin(): Quat[][] {
  if (spinTable) return spinTable;
  const list = ballPlans();
  const steps = Math.max(1, Math.ceil(timelineEnd * SPIN_SAMPLE_RATE));
  spinTable = list.map((plan) => {
    const track: Quat[] = [[0, 0, 0, 1]];
    let previous = ballAt(plan, 0).position;
    for (let i = 1; i <= steps; i += 1) {
      const current = ballAt(plan, i / SPIN_SAMPLE_RATE).position;
      const dx = current[0] - previous[0];
      const dy = current[1] - previous[1];
      const dz = current[2] - previous[2];
      const distance = Math.hypot(dx, dy, dz);
      // up x d, which drops the vertical component of the travel.
      const axisX = -dz;
      const axisZ = dx;
      const axisLength = Math.hypot(axisX, axisZ);
      if (distance > 1e-9 && axisLength > 1e-9) {
        const angle = distance / BALL_RADIUS;
        const half = angle / 2;
        const s = Math.sin(half) / axisLength;
        const step: Quat = [axisX * s, 0, axisZ * s, Math.cos(half)];
        track.push(quatMultiply(step, track[i - 1]));
      } else {
        track.push(track[i - 1]);
      }
      previous = current;
    }
    return track;
  });
  return spinTable;
}

/** How many balls the scene should draw. */
export function ballCount(): number {
  return ballPlans().length;
}

/** Last moment anything moves, seconds. */
export function ballTimelineEnd(): number {
  ballPlans();
  return timelineEnd;
}

/**
 * How hard the intake is working at time `t`, 0 to 1 — one while a ball is
 * being drawn in, easing off either side. The stage can multiply its intake
 * and indexer roller speeds by this so the wheels are spinning exactly when
 * they are doing something.
 */
export function intakeActivityAt(time: number): number {
  let activity = 0;
  for (const plan of ballPlans()) {
    const start = plan.pickupTime - 0.25;
    const stop = plan.pickupTime + CARRY_DURATION + 0.15;
    if (time < start || time > stop) continue;
    const rampIn = smoothstep((time - start) / 0.25);
    const rampOut = 1 - smoothstep((time - (stop - 0.2)) / 0.2);
    activity = Math.max(activity, Math.min(rampIn, rampOut));
  }
  return activity;
}

/** Every ball's world position, orientation, and carried flag at playhead time `time`. */
export function ballStatesAt(time: number): BallState[] {
  const list = ballPlans();
  const spin = ballSpin();
  const clamped = clamp(time, 0, timelineEnd);
  const exact = clamped * SPIN_SAMPLE_RATE;
  return list.map((plan, index) => {
    const { carried, position } = ballAt(plan, clamped);
    const track = spin[index];
    const lower = Math.min(track.length - 2, Math.max(0, Math.floor(exact)));
    const blend = clamp(exact - lower, 0, 1);
    const rotation = quatToEulerXYZ(quatSlerp(track[lower], track[lower + 1], blend));
    return { carried, position: [position[0], position[1], position[2]], rotation };
  });
}

/**
 * Where the goal sits so the robot ends backed into it: the trough mouth in
 * world stage units and the heading it should face. The goal faces the
 * robot, so its own forward is the robot's backward — heading + PI.
 */
export function goalPlacement(): { heading: number; position: Vec3; troughHeight: number } {
  const parked = finishPose();
  return {
    heading: parked.heading + Math.PI,
    position: modelToWorld([0, 0, TROUGH_Z], parked),
    troughHeight: ROBOT_GROUND_Y + TROUGH_Y,
  };
}
