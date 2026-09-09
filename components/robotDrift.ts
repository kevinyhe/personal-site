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
 * Choreography: come down the field past the goal on its right, picking up
 * the ball run; flick one side into reverse so the nose swings LEFT while
 * the body keeps sliding down the field (the drift); then keep turning the
 * SAME way — never unwinding — through a full circle, which brings the tail
 * round to the mouth, and reverse the last robot length into it.
 *
 * Two things that shape the schedule and are easy to undo by accident:
 * - The run must not sail past the goal on the way round. It has to end up
 *   in front of the mouth to back in, but only about 1.5 robot lengths in
 *   front; the earlier version ran 2.6 past, which read as the robot
 *   missing the goal and coming back for it. APPROACH is that distance.
 * - The closing rotation carries on counter-clockwise (`forceTurn: 1`).
 *   Reaching the same finish heading by unwinding clockwise is the same
 *   pose and looks completely different — the nose scrubs back through
 *   where it came from and the camera, which pans one way the whole run,
 *   ends up chasing it.
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
/** Distance at which a driveTo phase starts easing off, robot lengths. */
const DRIVE_SLOW_RADIUS = 2.2;
/** Minimum internal integration rate, Hz. */
const INTERNAL_RATE = 480;
/** Motor slew: wheel surface speed can change at most this fast, rl/s^2. */
const MAX_WHEEL_ACCEL = 14;
/** Wheel surface speed the motors top out at, rl/s. */
const MAX_WHEEL_SPEED = 4.5;
/** Sliding friction coefficient — the robot drifts on this. A drift drive
 *  on a slick floor: once the tyres let go there is very little left to
 *  stop them, so the slide runs long instead of hooking up again a moment
 *  after the flick. */
const MU_KINETIC = 0.42;
/** Distance from the robot's centre to its front bumper, robot lengths. */
const NOSE_OFFSET = 0.5;
/** Nose error below which the parking driver lets go of the sticks, rad. */
const NOSE_SETTLED = 0.04;
/** Gripping friction coefficient near zero slip. Only a little above the
 *  sliding value, so the tyres break away early and easily. */
const MU_STATIC = 0.58;
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
  /**
   * Steer toward this point on the floor, robot lengths, instead of a fixed
   * heading. The nose is trimmed onto the bearing to it, recomputed every
   * step, so the phase closes distance to a place rather than settling on a
   * direction — which is what lets the run finish at a goal whose position
   * is fixed rather than wherever the drift happened to end.
   *
   * `driveToBackwards` steers the TAIL at the point instead, for backing in.
   */
  driveTo?: [number, number];
  driveToBackwards?: boolean;
  /** Base stick input: commanded left-side wheel surface speed, rl/s. */
  left: number;
  /** Base stick input: commanded right-side wheel surface speed, rl/s. */
  right: number;
  /**
   * Force the nose to turn this way — +1 counter-clockwise, -1 clockwise —
   * however far round the target is. Without it the driver always takes the
   * shorter way about, which is why the run used to swing the nose left
   * through the drift and then unwind it back the way it came: two
   * rotations in opposite directions with a wobble between them. Setting
   * this on the closing phases keeps the whole run turning ONE way, so the
   * tail swings round into the goal instead of the nose scrubbing back.
   */
  forceTurn?: 1 | -1;
  /** Gain from yaw-rate error (rad/s) to stick differential. */
  yawGain?: number;
  /** Hold this yaw rate, rad/s (ignored when headingTarget is set). */
  yawTarget?: number;
};

/**
 * The stick inputs. Tuned against the offline audit: entry from x ~ +6.5
 * heading -x, a hard left-side reversal to start the drift, a held slide of
 * about a full turn, then park at TEN_OCLOCK_HEADING.
 *
 * Retuned for the low-grip tyres above. With that little friction there is
 * far less to resist the yaw, so the old caps span nearly two turns instead
 * of one; the flick is shorter and the yaw caps lower to bring it back to a
 * single circle. Total rotation is bimodal — the parking controller either
 * catches the nose on this turn or takes a whole extra one — so these sit
 * in the middle of the lower band rather than near its edge.
 *
 * The two sliding phases were then cut from 4.5 s to 1.5 s. Nothing about
 * that is a rescale: the path is integrated, so a third of the time is a
 * third of the tyre work, and at the old yaw caps the robot barely came
 * round at all. The caps in those two phases were raised (1.42 -> 2.6 and
 * 1.05 -> 1.8 rad/s) to spend the shorter slide harder. Swept in a grid,
 * the low band holds up to about yawTarget 3.0 in the reverse ride and 2.0
 * in the power slide before the run gains a whole extra turn, so these sit
 * clear of that edge. Entry, flick, exit and park keep their old lengths;
 * the whole run is 5.3 s.
 */
/**
 * The U-turn: how long it is held, how hard the inside wheels are backed
 * off, and the yaw rate it is trimmed to. Low yaw against high speed is
 * what makes the arc wide — radius is roughly speed over yaw rate.
 */

/**
 * The goal's mouth and a staging point in front of it, in ROBOT LENGTHS.
 * These mirror GOAL_MOUTH in components/RobotOutro.tsx, which is in stage
 * units — one robot length is 1.6 of those. Keep the two in step.
 */
const START_HEADING = Math.PI;
const GOAL_MOUTH_RL: [number, number] = [-3.6 / 1.6, -3.4 / 1.6];
/**
 * Where the robot lines up before it reverses in: straight out in front of
 * the mouth, far enough to have room to back in and no further. The old
 * staging point sat 2.6 robot lengths past the mouth plane, which on screen
 * read as the robot blowing straight past the goal and then coming back for
 * it. 1.4 is about the shortest that still leaves the tail room to swing.
 */
const APPROACH: [number, number] = [GOAL_MOUTH_RL[0], GOAL_MOUTH_RL[1] - 1.4];
/** Nose across the field during the slide: a quarter turn left of entry. */
const DRIFT_HEADING = Math.PI + Math.PI / 2;
/**
 * The finish heading expressed in the CONTINUOUS domain — one whole turn
 * past the start. The run begins at PI and the drift swings the nose left
 * (counter-clockwise); carrying on the same way brings it back to PI having
 * turned 360, with the tail arriving at the mouth. Reaching the same
 * heading by unwinding clockwise is the same pose and looks nothing like
 * it: the nose scrubs back through where it came from and the camera, which
 * pans one way the whole run, ends up chasing it.
 */
const FINISH_HEADING_CONTINUOUS = START_HEADING + 2 * Math.PI;

const SCHEDULE: DriverPhase[] = [
  // 1. Up the field, driving forwards, passing the goal on its right. The
  //    balls are collected along this leg.
  { duration: 1.5, left: 4.4, right: 4.4 },
  // 2. The drift. A hard left flick swings the nose round to face across
  //    the field while the body keeps carrying up it — the robot is
  //    pointing one way and travelling another, which is the whole move.
  { duration: 0.6, left: -4.5, right: 4.5, yawGain: 1.6, yawTarget: 3.5 },
  // 3. Hold it there and let it slide, nose across, still going up.
  {
    duration: 0.8,
    forceTurn: 1,
    headingGain: 2.0,
    headingTarget: DRIFT_HEADING,
    left: 2.6,
    right: 2.6,
    yawGain: 1.8,
  },
  // 4. Still turning the same way, now steering the body at the staging
  //    point in front of the mouth so the slide ends somewhere useful
  //    rather than wherever the tyres ran out.
  {
    duration: 1.1,
    driveTo: APPROACH,
    forceTurn: 1,
    headingGain: 1.6,
    left: 2.2,
    right: 2.2,
    yawGain: 2.0,
  },
  // 5. Carry the rotation the rest of the way round, so the tail comes to
  //    point at the mouth. The nose passes through a full turn here; it
  //    never doubles back.
  //
  //    The sticks were at 1.0, which crept: the robot held a big slip angle
  //    but at 0.29 rl/s of ground speed, and the model fades slip out below
  //    0.3 anyway, so it read as a pivot on the spot rather than a slide.
  //    At 2.4 it carries speed through the turn — nearly double — and it
  //    also arrives better: the finish lands 0.004 rl from the mouth
  //    instead of 0.28, at the cost of about 4 degrees of squareness that
  //    the parking phases below no longer have time to take out.
  //
  //    Grip was the other candidate and is a trap: dropping MU_KINETIC from
  //    0.42 to 0.36 slides beautifully and puts the finish at (-4.55, -3.16)
  //    — straight past the goal, which is the failure the fixed goal
  //    position was introduced to stop.
  {
    duration: 1.2,
    forceTurn: 1,
    headingGain: 2.4,
    headingTarget: FINISH_HEADING_CONTINUOUS,
    left: 2.4,
    right: 2.4,
    yawGain: 2.4,
  },
  // 6. Back down into it, tail first, squaring up on the way.
  {
    duration: 1.75,
    driveTo: GOAL_MOUTH_RL,
    driveToBackwards: true,
    headingGain: 3.0,
    left: -3.0,
    right: -3.0,
    yawGain: 2.4,
  },
  // 7. Stop dead, square in the mouth.
  {
    duration: 1.0,
    headingGain: 3.6,
    headingTarget: FINISH_HEADING_CONTINUOUS,
    left: 0,
    right: 0,
    yawGain: 2.6,
  },
];

/**
 * Times at which each ball is taken, chosen so the robot has covered the
 * same distance between one and the next.
 */
function pickupTimes(frames: RobotDriftFrame[]): number[] {
  const inWindow = frames.filter(
    (f) => f.time >= PICKUP_WINDOW[0] && f.time <= PICKUP_WINDOW[1],
  );
  if (inWindow.length < 2) return [];
  const arc = [0];
  for (let i = 1; i < inWindow.length; i += 1) {
    arc.push(arc[i - 1] + Math.hypot(
      inWindow[i].position[0] - inWindow[i - 1].position[0],
      inWindow[i].position[1] - inWindow[i - 1].position[1],
    ));
  }
  // A FIXED step, not the window divided up. Dividing meant a slower drift
  // put the pickups closer together, and once consecutive balls were under
  // a diameter apart on the floor they intersected. Stepping by a set
  // distance keeps them clear however long the drift takes; if the window
  // is too short to fit them all, the last ones simply land at its end,
  // which the audit catches.
  const times: number[] = [];
  for (let k = 0; k < PICKUP_COUNT; k += 1) {
    const want = PICKUP_SPACING * (k + 0.5);
    let i = 1;
    while (i < arc.length - 1 && arc[i] < want) i += 1;
    times.push(inWindow[i].time);
  }
  return times;
}

/**
 * The robot enters from the FAR end and drives toward the camera: heading PI
 * with forward drive carries it along -z, so it comes in upstage of the
 * balls and works down through them. Move this with the drift phases — a
 * longer slide covers more ground and the start has to give it room, or
 * the run finishes off the 46 x 32 floor.
 *
 * BOTH numbers matter to the goal, not just the second one. The whole path
 * is a rigid translation of this point until the closing phases start
 * steering at the mouth, so the x sets how close the slide passes the
 * goal's open end. At -1.0 the robot's front-left corner went 0.42 stage
 * units into the goal's footprint on the way past; -0.65 clears it (0.04
 * of overlap on a conservative square-box test) and, because the closing
 * phases correct for position anyway, it lands the finish dead on the
 * mouth's centreline instead of 0.14 off it.
 */
const START_POSITION: [number, number] = [-0.65, 9.4];
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

/**
 * Nose error, taking the short way about by default. With `direction` set
 * the error is pushed onto that side instead, so a target a few degrees
 * clockwise is reached by turning almost all the way round the other way —
 * which is what keeps the closing rotation going the same way as the drift.
 */
function turnError(raw: number, direction?: 1 | -1) {
  const wrapped = wrapAngle(raw);
  if (direction === 1 && wrapped < 0) return wrapped + 2 * Math.PI;
  if (direction === -1 && wrapped > 0) return wrapped - 2 * Math.PI;
  return wrapped;
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
    // Sticks are scaled down as a driveTo target is approached. Without it
    // the robot cannot arrive: it holds full speed, its turn radius is
    // wider than its distance to the point, and it just orbits.
    let drivePace = 1;
    if (phase.driveTo !== undefined) {
      const toX = phase.driveTo[0] - x;
      const toZ = phase.driveTo[1] - z;
      drivePace = clamp(Math.hypot(toX, toZ) / DRIVE_SLOW_RADIUS, 0.12, 1);
      // Heading convention: forward is (sin h, cos h), so the bearing to a
      // point is atan2 of its offset the same way round.
      let bearing = Math.atan2(toX, toZ);
      if (phase.driveToBackwards) bearing += Math.PI;
      const noseError = turnError(bearing - heading, phase.forceTurn);
      yawTarget = clamp((phase.headingGain ?? 2) * noseError, -2.5, 2.5);
    } else if (phase.headingTarget !== undefined) {
      const noseError = turnError(phase.headingTarget - heading, phase.forceTurn);
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
    const commandLeft = clamp(phase.left * drivePace - trim, -MAX_WHEEL_SPEED, MAX_WHEEL_SPEED);
    const commandRight = clamp(phase.right * drivePace + trim, -MAX_WHEEL_SPEED, MAX_WHEEL_SPEED);
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
 * When the intake should swallow a ball, as seconds into the run. Spread
 * across the entry, the flick, the reverse ride and the power slide so the
 * robot collects one every half second or so while it is still moving fast.
 * The last one lands just before the slide ends; nothing is picked up in the
 * exit or the park, where a ball vanishing under a nearly stationary robot
 * would read as a glitch.
 */
// The balls are collected on the DRIFT CURVE, not on the way in. The robot
// enters backwards, so its intake points the wrong way until the whip brings
// the nose round; from there to the flip it is driving forwards and the
// mouth leads.
//
// The times are spaced by GROUND COVERED, not by the clock. Fixed times put
// the last two pickups where the robot had slowed almost to a stop, so the
// balls they call for ended up 0.39 robot lengths apart on the floor — less
// than a ball diameter, and they intersected.
const PICKUP_WINDOW: [number, number] = [0.9, 5.0];
const PICKUP_COUNT = 5;
/** Ground between one ball and the next, robot lengths. A ball is 0.2 of
 *  one across, so this is comfortably clear of the one in front. */
const PICKUP_SPACING = 0.75;

// One simulation at module load, shared by the two exports below. Neither
// depends on the options: wheelRadius only scales the reported wheel speeds,
// and the internal step is pinned near INTERNAL_RATE whatever the sample rate.
const RUN = (() => {
  const frames = buildDriftPath();
  const last = frames[frames.length - 1];
  // Nearest recorded frame. Frame times are an exact grid, so this is the
  // index the time falls on, clamped in case a pickup time is ever edited
  // past the end of the run.
  const frameAt = (time: number) => {
    const rate = (frames.length - 1) / last.time;
    return frames[clamp(Math.round(time * rate), 0, frames.length - 1)];
  };
  return {
    finish: { heading: last.heading, position: last.position },
    // Where the front bumper is at each pickup time. Read off the simulated
    // path rather than guessed, so a ball sitting here is exactly where the
    // intake sweeps through.
    pickups: pickupTimes(frames).map((time) => {
      const frame = frameAt(time);
      const position: [number, number] = [
        frame.position[0] + NOSE_OFFSET * Math.sin(frame.heading),
        frame.position[1] + NOSE_OFFSET * Math.cos(frame.heading),
      ];
      return { position, time };
    }),
  };
})();

/**
 * Where the run ends. The heading is the final frame's CONTINUOUS heading,
 * which is now a full turn past the start (FINISH_HEADING_CONTINUOUS) —
 * wrap it before comparing it with anything.
 *
 * The goal does NOT hang off this: it sits at a fixed GOAL_MOUTH in
 * RobotOutro, and the last phases of the schedule steer the robot's tail
 * into it. The audit that matters is how squarely the robot arrives —
 * currently 0.09 robot lengths off the mouth's centreline and 2 degrees
 * off square, at a dead stop.
 */
export const DRIFT_FINISH: { heading: number; position: [number, number] } = RUN.finish;

/**
 * Ball pickups: the moment the intake takes each ball, and the ground
 * position the ball has to be sitting at for that to happen. In run order.
 * The scene places a ball at each position and removes it at the matching
 * time, feeding it up the tower to the indexer.
 */
export const BALL_PICKUP_TIMES: Array<{ position: [number, number]; time: number }> = RUN.pickups;
