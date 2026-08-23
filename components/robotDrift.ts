/**
 * The VEX robot's entrance: a reverse-entry drift computed by a small rigid
 * body simulation, baked to frames the stage plays back. Pure TypeScript, no
 * DOM, no three.js — importable from Node for offline auditing.
 *
 * World and units:
 * - Distances are robot lengths (1 = one robot); the scene applies scale.
 * - Ground plane axes: x = camera right, z = toward the camera.
 * - Heading is radians with direction vector (sin h, 0, cos h): 0 points at
 *   the camera (+z), +PI/2 points camera-right (+x). Seen from above this is
 *   the convention where heading = atan2(dirX, dirZ). The output heading is
 *   continuous (not wrapped), so the stage can lerp it safely.
 *
 * Physics model (deliberately simple, but genuinely dynamic — the path is an
 * integration result, not a spline):
 * - Rigid body on the ground plane: position, heading, body-frame velocity
 *   (u forward, v to the robot's left) and yaw rate, integrated with
 *   semi-implicit Euler at >= 480 Hz and resampled to the output rate.
 * - Skid-steer drivetrain as four contact patches: left/right side at
 *   front/back axle offsets, each carrying a quarter of the weight (no load
 *   transfer — the robot is short and low). Wheels roll longitudinally and
 *   can only skid laterally, which is what makes tank drives drift.
 * - Per patch, the ground rubs against the contact at the difference between
 *   wheel surface speed and the patch's ground velocity (longitudinally) and
 *   at the patch's full lateral velocity (laterally). Friction pushes along
 *   that combined slip vector, capped at mu * load: below a small slip speed
 *   the coefficient ramps up linearly (pseudo-static grip, which also lets
 *   the robot come to an honest rest), holds mu-static near the stick point,
 *   then fades to mu-kinetic once properly sliding. The single cap on the
 *   combined vector IS the friction circle: a side spinning its wheels has
 *   less lateral grip left over.
 * - Yaw torque comes from the two sides' longitudinal forces acting across
 *   the track and the axles' lateral forces acting about the centre.
 * - The "driver" is a scripted schedule of left/right wheel-speed targets
 *   (the stick inputs), slewed through a motor acceleration cap so wheel
 *   speed can never jump — VEX motors take a beat to reverse. Later phases
 *   add a proportional trim (on yaw rate, or on nose direction for the
 *   parking phases): that is the driver counter-steering by eye, and it
 *   only ever moves the sticks — every force still comes from the tires.
 * - Gravity is scaled down from the real 9.81/0.45 rl/s^2. At true scale
 *   friction kills a slide in a fraction of a second (real VEX robots barely
 *   drift); the smaller value keeps the same dynamics but lets the slide
 *   live long enough to read on camera.
 *
 * Choreography: enter from off-screen right driving hard leftward; snap one
 * side into reverse so the nose whips past the direction of travel and the
 * robot rides backwards on its momentum (the reverse entry); hold a power
 * slide around a circle near frame centre with the outside wheels overspun;
 * then straighten, counter-steer, and roll to rest facing the camera's
 * 10 o'clock.
 */

export type RobotDriftFrame = {
  /** Robot heading, radians, 0 along +z (toward camera), increasing counter-clockwise seen from above. */
  heading: number;
  /** Ground position in robot-lengths; the scene scales it. x right (camera view), z toward camera. */
  position: [number, number];
  /**
   * Signed difference between velocity direction and heading, radians.
   * Continuous across frames (it can pass beyond +/-PI during the reverse
   * entry rather than wrapping — after the nose gains a full turn on the
   * velocity it keeps a 2 * PI offset, so wrap it if you need the principal
   * value, and scale intensity effects by sin of it or by speed, not by its
   * raw magnitude), and faded to zero below 0.3 rl/s of ground
   * speed, where the direction of the velocity is numerical noise — effects
   * driven by slip should die out with speed, and this makes them.
   */
  slipAngle: number;
  /** Seconds from the start of the run. */
  time: number;
  /** Ground velocity, robot-lengths per second. */
  velocity: [number, number];
  /** Wheel angular speed, rad/s, [left side, right side]; wheel radius given in the options. */
  wheelAngularSpeed: [number, number];
};

export type RobotDriftOptions = {
  /** Samples per second in the output (default 60). */
  sampleRate?: number;
  /** Wheel radius in robot-lengths (default 0.14). */
  wheelRadius?: number;
};

/**
 * Final pose: nose pointing up-left-away on screen, the direction the scene
 * brief pinned as (-0.5, 0, -0.87) in world axes — "roughly 10 o'clock" from
 * the camera (on a literal clock face this is nearer 11; the pinned vector
 * is the contract the stage was built against, so it stays). Converted
 * through the heading convention above: atan2(-0.5, -0.87) ~= -2.62 rad
 * (-150 degrees).
 */
export const TEN_OCLOCK_HEADING = Math.atan2(-0.5, -0.87);

/** Front/back axle distance from the robot centre, robot lengths. */
const AXLE_OFFSET = 0.35;
/** Scaled-down gravity, robot lengths per s^2 (see the header comment). */
const GRAVITY = 5;
/** Minimum internal integration rate, Hz. */
const INTERNAL_RATE = 480;
/** Motor slew: wheel surface speed can change at most this fast, rl/s^2. */
const MAX_WHEEL_ACCEL = 14;
/** Wheel surface speed the motors top out at, rl/s. */
const MAX_WHEEL_SPEED = 4.5;
/** Sliding friction coefficient — the robot drifts on this. */
const MU_KINETIC = 0.85;
/** Nose error below which the parking driver lets go of the sticks, rad. */
const NOSE_SETTLED = 0.04;
/** Gripping friction coefficient near zero slip. */
const MU_STATIC = 1.1;
/** Ground speed below which the reported slip angle fades to zero, rl/s. */
const SLIP_FADE_SPEED = 0.3;
/** Slip speed below which friction ramps linearly (pseudo-static), rl/s. */
const STICK_SPEED = 0.08;
/** Left/right wheel separation, robot lengths. */
const TRACK = 0.9;
/** Largest differential the trim controllers may add to the sticks, rl/s. */
const TRIM_MAX = 2.2;
/** Yaw inertia of a 1 x TRACK box of unit mass. */
const YAW_INERTIA = (1 + TRACK * TRACK) / 12;

type DriverPhase = {
  /** Seconds this phase lasts. */
  duration: number;
  /** Gain from nose error (rad) to desired yaw rate, for headingTarget. */
  headingGain?: number;
  /** Park the nose here: trim toward this absolute heading, radians. */
  headingTarget?: number;
  /** Base stick input: commanded left-side wheel surface speed, rl/s. */
  left: number;
  /** Base stick input: commanded right-side wheel surface speed, rl/s. */
  right: number;
  /** Gain from yaw-rate error (rad/s) to stick differential. */
  yawGain?: number;
  /** Hold this yaw rate, rad/s (ignored when headingTarget is set). */
  yawTarget?: number;
};

/**
 * The stick inputs. Tuned against the offline audit: entry from x ~ +6.5
 * heading -x, a hard left-side reversal to start the drift, a held slide of
 * about a full turn, then park at TEN_OCLOCK_HEADING.
 */
const SCHEDULE: DriverPhase[] = [
  // Entry: flat out across the frame, driving in nose-first.
  { duration: 0.6, left: 4.2, right: 4.2 },
  // Flick: left side slammed into reverse while the right stays planted.
  // Momentum keeps the robot travelling -x while the nose whips CCW past
  // the velocity vector — the tail leads, the reverse entry.
  { duration: 0.7, left: -4.5, right: 4.5 },
  // Ride it backwards for a beat: a soft yaw cap stops the spin turning
  // into a pirouette, both sides stay saturated so almost all the friction
  // budget is spent longitudinally (little lateral grip is left to eat the
  // momentum), and the robot sails on with the nose far past the direction
  // of travel.
  { duration: 1.0, left: -3.5, right: 4.5, yawGain: 1.0, yawTarget: 2.2 },
  // Power slide: ease the yaw down and feed forward drive back in so the
  // spin opens into a circle; the right side overspins the whole way,
  // pumping energy into the slide.
  { duration: 3.6, left: 2.1, right: 4.5, yawGain: 2.5, yawTarget: 1.9 },
  // Exit: straighten out and let the slide bleed off.
  { duration: 1.0, headingGain: 3.0, headingTarget: TEN_OCLOCK_HEADING, left: 0.6, right: 0.6, yawGain: 2.0 },
  // Park: sticks to zero, small trims settle the nose on 10 o'clock.
  { duration: 1.4, headingGain: 3.0, headingTarget: TEN_OCLOCK_HEADING, left: 0, right: 0, yawGain: 2.0 },
];

const START_HEADING = -Math.PI / 2;
const START_POSITION: [number, number] = [6.5, -2.8];
const START_SPEED = 4.0;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Wrap an angle difference into (-PI, PI]. */
function wrapAngle(angle: number) {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/** Friction coefficient as a function of combined slip speed. */
function frictionCoef(slipSpeed: number) {
  if (slipSpeed < STICK_SPEED) return MU_STATIC * (slipSpeed / STICK_SPEED);
  if (slipSpeed < 3 * STICK_SPEED) {
    const t = (slipSpeed - STICK_SPEED) / (2 * STICK_SPEED);
    return MU_STATIC + (MU_KINETIC - MU_STATIC) * t;
  }
  return MU_KINETIC;
}

export function buildDriftPath(options: RobotDriftOptions = {}): RobotDriftFrame[] {
  const sampleRate = options.sampleRate ?? 60;
  const wheelRadius = options.wheelRadius ?? 0.14;
  if (!(sampleRate > 0) || !(wheelRadius > 0)) {
    throw new Error(`buildDriftPath needs positive options, got sampleRate=${sampleRate} wheelRadius=${wheelRadius}`);
  }
  const substeps = Math.max(1, Math.ceil(INTERNAL_RATE / sampleRate));
  const dt = 1 / (sampleRate * substeps);

  const phaseEnds: number[] = [];
  let acc = 0;
  for (const phase of SCHEDULE) {
    acc += phase.duration;
    phaseEnds.push(acc);
  }
  const totalDuration = phaseEnds[phaseEnds.length - 1];

  // State. Body frame: u along the heading, v to the robot's left; the left
  // axis in world coordinates is (cos h, -sin h), which is the direction the
  // heading vector moves when h increases.
  let heading = START_HEADING;
  let omega = 0;
  let time = 0;
  let u = START_SPEED;
  let v = 0;
  let x = START_POSITION[0];
  let z = START_POSITION[1];
  // Wheels arrive already matched to the ground: no fake wheelspin at t=0.
  let wheelLeft = START_SPEED;
  let wheelRight = START_SPEED;

  // The single encoding of the heading convention: body (u forward, v left)
  // to world (x, z). Both the recorded velocity and the position integration
  // go through this, so they cannot drift apart.
  const worldVelocity = (): [number, number] => {
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    return [u * sinH + v * cosH, u * cosH - v * sinH];
  };

  // Slip is kept continuous across output frames (unwrapped against the
  // previous frame) and faded out below SLIP_FADE_SPEED, so a stage lerping
  // it never sees a 2*PI jump mid reverse-entry or a snap-to-zero when the
  // robot settles.
  let slipPrev = 0;
  const record = (): RobotDriftFrame => {
    const speed = Math.hypot(u, v);
    if (speed > 1e-6) {
      slipPrev = slipPrev + wrapAngle(Math.atan2(v, u) - slipPrev);
    }
    const slipFade = clamp(speed / SLIP_FADE_SPEED, 0, 1);
    return {
      heading,
      position: [x, z],
      slipAngle: slipPrev * slipFade,
      time,
      velocity: worldVelocity(),
      wheelAngularSpeed: [wheelLeft / wheelRadius, wheelRight / wheelRadius],
    };
  };

  const step = () => {
    // 1. The driver: pick the phase, apply its trims, slew the wheels.
    let phaseIndex = 0;
    while (phaseIndex < SCHEDULE.length - 1 && time >= phaseEnds[phaseIndex]) phaseIndex += 1;
    const phase = SCHEDULE[phaseIndex];

    let yawTarget = phase.yawTarget;
    if (phase.headingTarget !== undefined) {
      const noseError = wrapAngle(phase.headingTarget - heading);
      // Close enough: stop chasing the target and just kill the rotation,
      // so the robot actually comes to rest instead of creeping forever on
      // an exponential approach.
      yawTarget = Math.abs(noseError) < NOSE_SETTLED ? 0 : clamp((phase.headingGain ?? 2) * noseError, -2.5, 2.5);
    }
    let trim = 0;
    if (yawTarget !== undefined) {
      trim = clamp((phase.yawGain ?? 1.2) * (yawTarget - omega), -TRIM_MAX, TRIM_MAX);
    }
    // Positive trim asks for more counter-clockwise yaw: right side up,
    // left side down, exactly like pushing a tank-drive stick pair apart.
    const commandLeft = clamp(phase.left - trim, -MAX_WHEEL_SPEED, MAX_WHEEL_SPEED);
    const commandRight = clamp(phase.right + trim, -MAX_WHEEL_SPEED, MAX_WHEEL_SPEED);
    const slewLimit = MAX_WHEEL_ACCEL * dt;
    wheelLeft += clamp(commandLeft - wheelLeft, -slewLimit, slewLimit);
    wheelRight += clamp(commandRight - wheelRight, -slewLimit, slewLimit);

    // 2. Tire forces from the four contact patches.
    let forceLong = 0;
    let forceLat = 0;
    let torque = 0;
    const patchLoad = GRAVITY / 4;
    for (const lateralOffset of [TRACK / 2, -TRACK / 2]) {
      const wheelSpeed = lateralOffset > 0 ? wheelLeft : wheelRight;
      for (const axleOffset of [AXLE_OFFSET, -AXLE_OFFSET]) {
        // Ground velocity of the patch in the body frame. A point on the
        // left of a CCW-yawing robot moves backwards relative to the centre,
        // hence the -omega * lateralOffset; points ahead of the centre swing
        // left, hence the +omega * axleOffset.
        const contactLong = u - omega * lateralOffset;
        const contactLat = v + omega * axleOffset;
        // Slip of the wheel surface against the ground. Longitudinally the
        // wheel surface runs at wheelSpeed; laterally it cannot roll at all.
        const slipLong = wheelSpeed - contactLong;
        const slipLat = -contactLat;
        const slipSpeed = Math.hypot(slipLong, slipLat);
        if (slipSpeed < 1e-9) continue;
        const force = frictionCoef(slipSpeed) * patchLoad;
        const fLong = (force * slipLong) / slipSpeed;
        const fLat = (force * slipLat) / slipSpeed;
        forceLong += fLong;
        forceLat += fLat;
        // Longitudinal force across the track turns the body; a left-side
        // (positive offset) forward push turns it clockwise, hence -offset.
        torque += -lateralOffset * fLong + axleOffset * fLat;
      }
    }

    // 3. Semi-implicit Euler. The omega * v / omega * u terms are the usual
    // rotating-frame bookkeeping so that body-frame integration matches the
    // world-frame motion.
    u += (forceLong + omega * v) * dt;
    v += (forceLat - omega * u) * dt;
    omega += (torque / YAW_INERTIA) * dt;
    heading += omega * dt;
    const [velX, velZ] = worldVelocity();
    x += velX * dt;
    z += velZ * dt;
    time += dt;
  };

  const frames: RobotDriftFrame[] = [record()];
  const frameCount = Math.round(totalDuration * sampleRate);
  for (let i = 0; i < frameCount; i += 1) {
    for (let s = 0; s < substeps; s += 1) step();
    // Snap accumulated float error so frame times are exact grid points.
    time = (i + 1) / sampleRate;
    frames.push(record());
  }
  return frames;
}

/**
 * Where the run ends — the outro scene picks the robot up from this pose.
 * The heading is the final frame's CONTINUOUS heading, two full turns past
 * the wrapped TEN_OCLOCK_HEADING (about TEN_OCLOCK_HEADING + 4 * PI): keep
 * using it as-is for continuity with the played-back frames, and wrap it
 * before comparing against TEN_OCLOCK_HEADING itself.
 */
export const DRIFT_REST_POSE = (() => {
  const frames = buildDriftPath();
  const last = frames[frames.length - 1];
  return { heading: last.heading, position: last.position };
})();
