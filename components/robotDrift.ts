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
 * robot rides backwards on its momentum (the reverse entry); hold a short
 * power slide with the outside wheels overspun; then straighten,
 * counter-steer, and roll to rest with the robot's BACK pointed at the goal,
 * which is where it scores from.
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


/**
 * Where the run ends. The robot enters travelling backwards with its nose
 * toward +x, drifts left, snaps a 180, and finishes with the nose back on +x
 * — so its REAR points along -x, and that is where the goal mouth sits. It
 * scores out of its back, so this is the pose that lets it feed the goal.
 */
const FINISH_HEADING = Math.PI / 2;

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
/** How long the reverse run home lasts — tuned so it arrives at the mouth. */
const RETURN_DURATION = 0.6;

const SCHEDULE: DriverPhase[] = [
  // Reverse entry. The robot starts BEHIND the goal, off to one side, and
  // comes out backwards — nose on -x, momentum carrying it +x across the
  // frame. Both sides in reverse to hold that.
  { duration: 0.7, left: -4.4, right: -4.4 },
  // Whip: one side thrown against the other swings the nose round toward
  // the direction of travel while the body keeps sliding. The entry becomes
  // a drift here.
  { duration: 0.6, left: -4.5, right: 4.5, yawGain: 1.4, yawTarget: 4.0 },
  // The drift curve: carving on across the frame with the tail out. The
  // balls are collected along this arc.
  { duration: 1.8, left: 4.5, right: 2.0, yawGain: 2.2, yawTarget: 2.8 },
  // The flip: a hard, short counter-rotation that puts the nose back on +x
  // — which points the robot's TAIL at the goal, ready to reverse into it.
  { duration: 0.55, left: 4.5, right: -4.5, yawGain: 1.8, yawTarget: -6.5 },
  // Run home in reverse: nose stays on the finish heading while the robot
  // drives backwards the length of the frame toward the goal mouth.
  { duration: RETURN_DURATION, headingGain: 3.0, headingTarget: FINISH_HEADING, left: -4.4, right: -4.4, yawGain: 2.4 },
  // Seat the aligner: ease off and let the last of the momentum push the
  // triangle at the back into the mouth until it stops against it.
  { duration: 1.1, headingGain: 3.6, headingTarget: FINISH_HEADING, left: -0.6, right: -0.6, yawGain: 2.6 },
];

const START_HEADING = -Math.PI / 2;
const START_POSITION: [number, number] = [-8.6, -4.6];
const START_SPEED = -4.0;

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
 * When the intake should swallow a ball, as seconds into the run. Spread
 * across the entry, the flick, the reverse ride and the power slide so the
 * robot collects one every half second or so while it is still moving fast.
 * The last one lands just before the slide ends; nothing is picked up in the
 * exit or the park, where a ball vanishing under a nearly stationary robot
 * would read as a glitch.
 */
// The balls are collected on the DRIFT CURVE, not on the way in. The robot
// enters backwards, so its intake is pointing the wrong way until the whip
// brings the nose round at about t = 2.1; from there to the flip it is
// driving forwards and the mouth leads. Each of these must also leave the
// ball time to climb the tower (CARRY_DURATION) before the first throw.
const PICKUP_TIMES = [2.25, 2.6, 2.95, 3.3, 3.65];

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
    pickups: PICKUP_TIMES.map((time) => {
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
 * Where the run ends — the resting pose, and the pose the goal is placed
 * against. The heading is the final frame's CONTINUOUS heading; the run now
 * stays inside one turn, so it is also within a few degrees of
 * FINISH_HEADING, but wrap it before comparing if that ever changes.
 *
 * The goal sits just off the robot's REAR, along -(sin h, 0, cos h) from
 * this position — see FINISH_HEADING for why the robot finishes reversed
 * into it.
 */
export const DRIFT_FINISH: { heading: number; position: [number, number] } = RUN.finish;

/**
 * Ball pickups: the moment the intake takes each ball, and the ground
 * position the ball has to be sitting at for that to happen. In run order.
 * The scene places a ball at each position and removes it at the matching
 * time, feeding it up the tower to the indexer.
 */
export const BALL_PICKUP_TIMES: Array<{ position: [number, number]; time: number }> = RUN.pickups;
