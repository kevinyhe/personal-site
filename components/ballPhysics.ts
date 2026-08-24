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
/**
 * Height a ball comes to rest at inside the goal, model y, stage units. This
 * is NOT the indexer height: the Long Goal's ball channel measures 1.527 off
 * the asset (see components/propModels.ts), but the balls sat visibly proud
 * of the goal at that height, so they rest slightly lower. The throw arc therefore climbs into the mouth,
 * which is what a real robot does — it shoots slightly upward into the goal.
 */
const TROUGH_Y = 1.49;

/**
 * How many balls the robot drives on already holding. They occupy the front
 * of the queue and are therefore thrown first — the indexer is a queue, not
 * a stack, so the first ball in is the first out.
 */
const PRELOAD_COUNT = 4;

/** Number of balls on the floor. */
const BALL_COUNT = 5;
/** Seconds a ball spends between the intake grab and reaching the queue. */
const CARRY_DURATION = 0.85;
/**
 * Straight-line gap to keep between balls queued nose-to-tail inside the
 * robot, stage units. A ball is 0.312 across; the small extra stops them
 * touching. Spacing them by distance ALONG the path does not work, because
 * the path bends hard around the sprockets and the chord across a bend is
 * much shorter than the arc — balls queued by arc length still overlapped
 * on the curves.
 */
const BALL_GAP = 0.36;
/**
 * How much of a true roll the ball shows, 0..1. A ball being dragged up a
 * tower by flex wheels is gripped, not free-rolling on the floor, so
 * spinning it at the full distance/radius rate looked frantic. Each ball
 * also gets its own small factor either side of this so they do not all
 * turn in lockstep.
 */
const ROLL_FACTOR = 0.22;
/** Per-ball roll multipliers and axis wobble. Fixed, so the run replays. */
const ROLL_VARIATION = [1.0, 0.86, 1.13, 0.93, 1.07, 0.8, 1.18, 0.9, 1.04];
const ROLL_WOBBLE = [0.06, -0.1, 0.13, -0.05, 0.09, -0.12, 0.04, 0.11, -0.08];
/** Seconds of quiet after the robot parks before the first ball is thrown. */
const EJECT_LEAD_IN = 0.3;
/** Seconds between one ball leaving the indexer and the next. */
const EJECT_SPACING = 0.34;
/**
 * Per-ball jitter on that spacing, in seconds. Fixed literals rather than
 * random numbers, because the run has to replay identically when the page
 * is scrolled back, but enough variation that the balls do not go in on a
 * metronome.
 */
const EJECT_JITTER = [0, 0.07, -0.05, 0.11, -0.03, 0.09, -0.07, 0.04, 0.12];
/** Seconds a thrown ball spends in the air. */
const FLIGHT_DURATION = 0.35;
/** How far the ball dips crossing into the goal, stage units. */
const FLIGHT_SAG = 0.03;
/** Seconds of settling hop after a ball lands in the trough. */
const BOUNCE_DURATION = 0.2;
/**
 * How far the ball settles DOWN into the channel after it arrives. It is a
 * small drop, not a bounce: a ball rolling into a trough does not spring
 * back up, and an upward hop here looked like it had been kicked.
 */
const BOUNCE_HEIGHT = 0.02;
/** Model z the balls come to rest at inside the trough, stage units (behind the robot's rear at -0.8). */
const TROUGH_Z = -1.2;
/**
 * Gap between balls resting in the trough, stage units. They queue back
 * ALONG the goal (model -z, receding from the robot's tail), not across it:
 * the Long Goal is a narrow channel 5.7 long and about 1.1 wide, so a row
 * spread sideways would not fit inside it.
 */
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
 * The route follows the mechanism rather than cutting through it: in along
 * the floor, UNDER both rows of front flex wheels, onto the underside of
 * the 32T, rearward and fully around the back 16T, then forward again and
 * up the face of the 30T, over its top, and out across the indexer flex
 * wheels. In profile that is an S.
 *
 * What may look wrong but is not: the path passes inside the pitch circles
 * of the sprockets. That is correct, because the sprockets are not in the
 * ball's way — every one of them sits at |x| = 0.17 to 0.30 in the model
 * while the ball only spans +/-0.156, so the chain runs go down either side
 * and the ball rides between them. The only parts actually in the corridor
 * are the eight flex wheels at |x| = 0.08 to 0.12, and those are compliant:
 * the path keeps the ball's surface within 0.06 of each, which is the grip
 * that carries it. Positions and radii come from
 * public/model/robot/robot-meta.json, so this can be rechecked whenever the
 * robot is re-exported.
 */
const CARRY_PATH: Array<[number, number]> = [
  [0.9, 0.16], // on the floor, ahead of the intake
  [0.702, 0.16], // under the first row of flex wheels
  [0.486, 0.2], // under the second row
  [0.097, 0.307], // onto the underside of the 32T
  [-0.047, 0.556], // around its back — the ball is heading rearward now
  [-0.199, 0.727], // behind the back 16T
  [-0.086, 0.923], // and over its top: the top of the S
  [0.14, 0.923], // back forward again
  [0.344, 0.895], // onto the front of the 30T
  [0.517, 1.196], // up its face
  [0.344, 1.497], // over its top
  [-0.004, 1.497],
  [-0.118, 1.5], // across the indexer flex wheels
  [-0.364, 1.52],
  [-0.52, 1.52], // out of the back, level with the goal trough
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

/**
 * How far back along CARRY_PATH each queue place sits, measured from the
 * exit. Walked backwards from the end, taking whatever arc length is needed
 * for the STRAIGHT-LINE gap to reach BALL_GAP, so the spacing survives the
 * bends. All balls share the top of the path, so one table serves them all.
 */
let queueBacksets: number[] | null = null;
function queueBackset(place: number): number {
  if (!queueBacksets) {
    const path: Vec3[] = CARRY_PATH.map(([z, y]) => [0, y, z] as Vec3);
    const arc = arcLengths(path);
    const total = arc[arc.length - 1];
    const pointAt = (back: number): Vec3 => {
      const target = clamp(total - back, 0, total);
      let i = 1;
      while (i < arc.length - 1 && arc[i] < target) i += 1;
      const span = arc[i] - arc[i - 1];
      const t = span > 1e-9 ? (target - arc[i - 1]) / span : 0;
      const a = path[i - 1];
      const b = path[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    };
    queueBacksets = [0];
    for (let k = 1; k < 16; k += 1) {
      let back = queueBacksets[k - 1];
      const previous = pointAt(back);
      // Creep back along the path until the ball clears the one in front.
      for (let step = 0; step < 400; step += 1) {
        back += 0.01;
        const here = pointAt(back);
        const gap = Math.hypot(here[0] - previous[0], here[1] - previous[1], here[2] - previous[2]);
        if (gap >= BALL_GAP || back >= total) break;
      }
      queueBacksets.push(Math.min(back, total));
    }
  }
  const whole = Math.floor(place);
  const blend = place - whole;
  const a = queueBacksets[Math.min(whole, queueBacksets.length - 1)];
  const b = queueBacksets[Math.min(whole + 1, queueBacksets.length - 1)];
  return a + (b - a) * blend;
}

/** Cumulative arc length along a model-space polyline. */
function arcLengths(path: Vec3[]): number[] {
  const arc = [0];
  for (let i = 1; i < path.length; i += 1) {
    arc.push(arc[i - 1] + Math.hypot(
      path[i][0] - path[i - 1][0],
      path[i][1] - path[i - 1][1],
      path[i][2] - path[i - 1][2],
    ));
  }
  return arc;
}

/**
 * How far the queue has advanced by `time`, in ball positions. Each throw
 * moves everything still aboard one place closer to the exit; the shift is
 * eased over the gap between throws rather than snapping, so the balls
 * visibly shuffle forward instead of teleporting.
 */
function queueAdvance(time: number): number {
  const list = ballPlans();
  let advance = 0;
  for (const plan of list) {
    advance += smoothstep((time - plan.ejectTime) / EJECT_SPACING);
  }
  return advance;
}

/**
 * How many balls thrown AFTER this one have landed by `time`. Each one
 * arriving pushes this ball further down the trough, which is what makes
 * the goal fill nose-to-tail: the first ball in ends up deepest.
 */
function pushedBy(index: number, time: number): number {
  const list = ballPlans();
  let pushed = 0;
  for (let i = index + 1; i < list.length; i += 1) {
    // Timed off the THROW, not the landing, and completing within the
    // flight: the ball already in the goal has finished shuffling deeper by
    // the moment the next one arrives, instead of still sitting in the spot
    // that ball is about to land on.
    pushed += smoothstep((time - list[i].ejectTime) / FLIGHT_DURATION);
  }
  return pushed;
}

/**
 * Where a scored ball is sitting at `time`. It lands just inside the mouth
 * and is shoved further in by every ball thrown after it, so the goal fills
 * from the back: first in, deepest. A stack would have done the opposite.
 */
function troughAt(plan: BallPlan, index: number, time: number): Vec3 {
  const depth = TROUGH_Z - pushedBy(index, time) * TROUGH_SPACING;
  const lateral = TROUGH_JITTER[index % TROUGH_JITTER.length];
  return modelToWorld([lateral, TROUGH_Y, depth], finishPose());
}

function buildPlans(): BallPlan[] {
  const schedule = pickupSchedule();
  const parked = finishPose();

  // The first throw waits for both the robot to park and the last ball to
  // finish climbing, so nothing is fired out of an empty indexer.
  const lastArrival = schedule.length ? schedule[schedule.length - 1].time + CARRY_DURATION : 0;
  const firstEject = Math.max(driftEnd(), lastArrival) + EJECT_LEAD_IN;

  // The balls already aboard. Giving them a pickup a full carry before zero
  // means their climb is finished before the run starts, so they are simply
  // holding station in the queue from the first frame. They share the same
  // path as everything else — where they sit is decided by their place in
  // the queue, not by a fixed slot.
  const preloaded: BallPlan[] = Array.from({ length: PRELOAD_COUNT }, (ignored, index) => {
    const path: Vec3[] = CARRY_PATH.map(([z, y]) => [0, y, z] as Vec3);
    return {
      arc: arcLengths(path),
      ejectTime: firstEject + index * EJECT_SPACING + EJECT_JITTER[index % EJECT_JITTER.length],
      path,
      pickupTime: -CARRY_DURATION,
      restPosition: modelToWorld(path[path.length - 1], robotPoseAt(0)),
      troughPosition: [0, 0, 0] as Vec3,
    };
  });

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
    const order = PRELOAD_COUNT + index;
    return {
      arc,
      ejectTime: firstEject + order * EJECT_SPACING + EJECT_JITTER[order % EJECT_JITTER.length],
      path,
      pickupTime: entry.time,
      restPosition,
      troughPosition: troughSpot(order, parked),
    };
  });

  const all = [...preloaded, ...built];
  timelineEnd = all.length
    ? all[all.length - 1].ejectTime + FLIGHT_DURATION + BOUNCE_DURATION
    : driftEnd();
  return all;
}

/** Resting spot for the `order`-th ball thrown, queued back along the goal. */
function troughSpot(order: number, parked: RobotPose): Vec3 {
  const back = TROUGH_Z - order * TROUGH_SPACING;
  const lateral = TROUGH_JITTER[order % TROUGH_JITTER.length];
  return modelToWorld([lateral, TROUGH_Y, back], parked);
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
function ballAt(plan: BallPlan, time: number, index: number): { carried: boolean; position: Vec3 } {
  if (time <= plan.pickupTime) return { carried: false, position: plan.restPosition };

  if (time < plan.ejectTime) {
    // Inside the robot. Two things decide where along the path it sits: how
    // far it has climbed since the grab, and how far back in the queue it
    // is. It takes whichever is further from the exit, so a ball that has
    // finished climbing still waits its turn behind the ones in front
    // instead of piling onto them at the mouth.
    const total = plan.arc[plan.arc.length - 1];
    const climbed = smoothstep((time - plan.pickupTime) / CARRY_DURATION) * total;
    const place = Math.max(0, index - queueAdvance(time));
    const held = total - queueBackset(place);
    const model = pathPoint(plan, Math.min(climbed, held) / Math.max(total, 1e-9));
    return { carried: true, position: modelToWorld(model, robotPoseAt(time)) };
  }

  const release = modelToWorld(plan.path[plan.path.length - 1], finishPose());
  const landing = troughAt(plan, index, time);
  const flight = time - plan.ejectTime;

  if (flight < FLIGHT_DURATION) {
    // Fed across into the trough, not lobbed into it. The indexer lets go
    // level with the goal's channel, so the ball crosses on a nearly flat
    // line with a slight sag in the middle — never rising above where it
    // started. The old version launched it on a projectile arc that peaked
    // 0.14 above the release, which read as the ball hopping upward the
    // instant it was scored.
    const u = flight / FLIGHT_DURATION;
    const sag = FLIGHT_SAG * Math.sin(Math.PI * u);
    return {
      carried: false,
      position: [
        release[0] + (landing[0] - release[0]) * u,
        release[1] + (landing[1] - release[1]) * u - sag,
        release[2] + (landing[2] - release[2]) * u,
      ],
    };
  }

  const rest = troughAt(plan, index, time);
  const settle = time - plan.ejectTime - FLIGHT_DURATION;
  if (settle < BOUNCE_DURATION) {
    // A small damped settle DOWNWARD, so the ball beds into the channel
    // instead of sticking to it dead the instant it touches.
    const u = settle / BOUNCE_DURATION;
    const hop = -BOUNCE_HEIGHT * Math.sin(Math.PI * u) * (1 - u);
    return { carried: false, position: [rest[0], rest[1] + hop, rest[2]] };
  }

  return { carried: false, position: rest };
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
  spinTable = list.map((plan, ballIndex) => {
    const track: Quat[] = [[0, 0, 0, 1]];
    let previous = ballAt(plan, 0, ballIndex).position;
    for (let i = 1; i <= steps; i += 1) {
      const current = ballAt(plan, i / SPIN_SAMPLE_RATE, ballIndex).position;
      const dx = current[0] - previous[0];
      const dy = current[1] - previous[1];
      const dz = current[2] - previous[2];
      const distance = Math.hypot(dx, dy, dz);
      // up x d, which drops the vertical component of the travel.
      const axisX = -dz;
      const axisZ = dx;
      const axisLength = Math.hypot(axisX, axisZ);
      if (distance > 1e-9 && axisLength > 1e-9) {
        const angle = (distance / BALL_RADIUS) * ROLL_FACTOR * ROLL_VARIATION[ballIndex % ROLL_VARIATION.length];
        const half = angle / 2;
        const s = Math.sin(half) / axisLength;
        const step: Quat = [axisX * s, ROLL_WOBBLE[ballIndex % ROLL_WOBBLE.length] * Math.sin(half), axisZ * s, Math.cos(half)];
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
    const { carried, position } = ballAt(plan, clamped, index);
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
