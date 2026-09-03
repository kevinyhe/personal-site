"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * The robot outro: after the Thinker's debris has streamed off, the page's
 * last stretch of scroll hands the stage to a VEX robot. It drives in from
 * the right of frame, throws itself past sideways (a reverse entry), slides
 * one full circle and stops centre-left, nose to the camera's 10 o'clock.
 *
 * The whole run is scrubbed by the scroll (the robot phase, 0..1, from
 * ThinkerStage): the long straight, the flick and the half-turn are each
 * just a stretch of the page, and scrolling back runs the drift backwards.
 *
 * Two sibling branches supply the real content and are imported lazily:
 * components/robotDrift.ts (the physical trajectory) and
 * components/robotModel.ts (the scanned robot). Until they exist the
 * clearly-marked placeholders below stand in with the same interfaces, so
 * this scene works — and merges — on its own.
 */

/**
 * One sample of the drift, in the ground frame: x = camera right,
 * z = toward the camera, units = robot lengths, y implicit (ground).
 * heading is 0 along +z and grows counter-clockwise seen from above.
 * (Frozen interface shared with components/robotDrift.ts.)
 */
export type RobotDriftFrame = {
  heading: number;
  position: [number, number];
  slipAngle: number;
  time: number;
  velocity: [number, number];
  wheelAngularSpeed: [number, number];
};

/**
 * The robot as a scene object: +Z forward, +Y up, ground at y = 0.
 * (Frozen interface shared with components/robotModel.ts.)
 */
export type RobotModel = {
  chassis: THREE.Object3D;
  length: number;
  /** Gears and rollers that turn without steering. Optional: a robotModel
   *  that predates them still loads, it just has nothing extra to spin. */
  spinners?: RobotSpinner[];
  wheels: Array<{
    object: THREE.Object3D;
    radius: number;
    side: "left" | "right";
  }>;
};

/**
 * A part that turns in place: a drivetrain gear, an intake roller. "drive"
 * parts are geared to the wheels, "intake" parts run whenever the intake
 * does. axis is the local axis it turns about, radius is its own radius in
 * the same units as the wheels'.
 * (Frozen interface shared with components/robotModel.ts.)
 */
export type RobotSpinner = {
  axis: "x" | "y" | "z";
  category: "drive" | "intake";
  object: THREE.Object3D;
  radius: number;
  side: "left" | "right" | "center";
};

/**
 * The Push Back long goal: a trough whose tube sits troughHeight above its
 * base, with a mouth at each end. Opening positions and inward directions
 * are in the goal's own frame, base at y = 0, long axis through the two
 * openings; "inward" points from the mouth into the trough.
 * (Frozen interface shared with components/propModels.ts.)
 */
export type GoalModel = {
  length: number;
  object: THREE.Object3D;
  openings: Array<{ inward: [number, number, number]; position: [number, number, number] }>;
  troughHeight: number;
};

/**
 * One ball at one instant, in STAGE units and world space (the ground is at
 * ROBOT_GROUND_Y, not 0). carried is true while the robot holds it.
 * (Frozen interface shared with components/ballPhysics.ts.)
 */
export type BallState = {
  carried: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
};

/** What the rally camera needs to know about the robot, every frame. */
export type RobotCameraState = {
  /** Lateral acceleration (stage units/s^2), positive toward the robot's left. */
  aLat: number;
  /** World yaw, same convention as RobotDriftFrame.heading. */
  heading: number;
  /** Stage-space position (y is the ground height). */
  position: THREE.Vector3;
  /** True once the run has finished and the robot sits still. */
  resting: boolean;
  /** |velocity|, stage units/s. */
  speed: number;
  /** Stage-space velocity. */
  velocity: THREE.Vector3;
};

export function createRobotCameraState(): RobotCameraState {
  return {
    aLat: 0,
    heading: -Math.PI / 2,
    position: new THREE.Vector3(9.7, ROBOT_GROUND_Y, 1.5),
    resting: false,
    speed: 0,
    velocity: new THREE.Vector3(),
  };
}

/** One robot length in stage units. */
export const ROBOT_LENGTH = 1.6;
/** The robot scene's own floor: the statue is faded out, so a clean height. */
export const ROBOT_GROUND_Y = -1.2;

// The statue owns the screen until it has fully faded (ThinkerStage's
// STATUE_FADE_END); only then does the robot scene begin to appear, so the
// two are never on screen together. Nothing of the robot is drawn before
// ROBOT_FADE_START, and its lights come up between there and FADE_IN_END.
const ROBOT_FADE_START = 0.08;
const FADE_IN_END = 0.13;
// Where in the robot phase the drift begins. Below this the robot is
// still fading in; from here to the end of the page the scroll scrubs the
// whole run, so the straight, the flick and the half-turn are all just
// stretches of scroll.
const RUN_START = 0.15;
// Daylight between the robot's rear and the goal's mouth at the finish, in
// stage units: enough that the aligner reads as seated, not intersecting.
const GOAL_GAP = 0.12;
// How fast the intake's rollers pull a ball across their surface, stage
// units/s. Faster than the robot drives, which is what makes a ball snap in
// rather than get nudged along the floor.
const INTAKE_SURFACE_SPEED = 3.2;

type RobotRig = {
  /** World position + heading. */
  pose: THREE.Group;
  /** Receives the small body-roll tilt (the chassis without its wheels
   *  when the model provides that split, the whole robot otherwise). */
  roll: THREE.Object3D;
  /** Stage units per model unit, applied to the whole robot. */
  scale: number;
  spinners: RobotSpinner[];
  /** The wheel radius the drive gears are geared against, model units. */
  wheelRadius: number;
  wheels: Array<{ object: THREE.Object3D; side: "left" | "right" }>;
};

/** Where the playhead sits, in seconds along the drift. Scroll sets it. */
type RunState = { time: number };

// ---------------------------------------------------------------------------
// Sibling modules, loaded lazily.
//
// The specifiers are template literals on purpose: a literal
// import("@/components/robotDrift") fails the BUILD while the sibling file
// does not exist, but a template literal makes webpack resolve the request
// at runtime against everything under @/components/ — missing file rejects
// (caught, placeholder used), present file resolves, so the sibling merges
// upgrade this scene without touching it.
// ---------------------------------------------------------------------------

type DriftFinish = { heading: number; position: [number, number] };
type DriftModule = {
  buildDriftPath: (options?: unknown) => RobotDriftFrame[];
  DRIFT_FINISH?: DriftFinish;
  DRIFT_REST_POSE?: DriftFinish;
};
type ModelModule = { loadRobotModel: () => Promise<RobotModel> };
type PropsModule = {
  loadBallModel: () => Promise<{ object: THREE.Object3D; radius: number }>;
  loadGoalModel: () => Promise<GoalModel>;
};
type BallPhysicsModule = {
  ballCount: () => number;
  ballStatesAt: (time: number) => BallState[];
};

/**
 * The drift, plus where it ends. The finish drives the goal's placement, so
 * it is read from the drift module's own constant when there is one and
 * from the last frame otherwise — the two agree, and the fallback keeps the
 * goal on the robot's rear even if that constant is renamed away.
 */
async function loadDrift(
  wheelRadius?: number,
): Promise<{ finish: DriftFinish; frames: RobotDriftFrame[] }> {
  const name = "robotDrift";
  const driftModule = (await import(`@/components/${name}`).catch(
    () => null,
  )) as DriftModule | null;
  const frames = driftModule?.buildDriftPath
    ? driftModule.buildDriftPath(wheelRadius ? { wheelRadius } : undefined)
    : buildPlaceholderDriftPath();
  const last = frames[frames.length - 1];
  const finish =
    driftModule?.DRIFT_FINISH ??
    driftModule?.DRIFT_REST_POSE ?? {
      heading: last.heading,
      position: last.position,
    };
  return { finish, frames };
}

async function loadProps(): Promise<{
  ball: { object: THREE.Object3D; radius: number };
  goal: GoalModel;
}> {
  const name = "propModels";
  const propsModule = (await import(`@/components/${name}`).catch(
    () => null,
  )) as PropsModule | null;
  const goal =
    (await propsModule?.loadGoalModel?.().catch(() => null)) ??
    buildPlaceholderGoal();
  const ball =
    (await propsModule?.loadBallModel?.().catch(() => null)) ??
    buildPlaceholderBall();
  return { ball, goal };
}

async function loadBallPhysics(): Promise<BallPhysicsModule | null> {
  const name = "ballPhysics";
  const physics = (await import(`@/components/${name}`).catch(
    () => null,
  )) as BallPhysicsModule | null;
  if (!physics?.ballStatesAt || !physics.ballCount) return null;
  return physics;
}

async function loadModel(): Promise<RobotModel | null> {
  const name = "robotModel";
  const modelModule = (await import(`@/components/${name}`).catch(
    () => null,
  )) as ModelModule | null;
  if (!modelModule?.loadRobotModel) return null;
  return modelModule.loadRobotModel().catch(() => null);
}

// ---------------------------------------------------------------------------
// PLACEHOLDER TRAJECTORY — components/robotDrift.ts (batch/robot-drift)
// replaces this. When that lands, delete this function and its single call
// site in loadDrift above.
//
// A hand-scripted run, ~7 s at 60 samples/s: straight in from the right at
// x ≈ 6 heading -x; a flick; slip past sideways (peaks ≈ -110°, the reverse
// entry); one full circle plus 60° on a 1.5-length radius; to rest at
// ≈ (-1.4, 0.2) facing (-0.5, -0.87) — the camera's 10 o'clock.
// ---------------------------------------------------------------------------

// Smoothstep interpolation through [time, value] keyframes.
function keyedValue(keys: Array<[number, number]>, t: number) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [time, value] = keys[i];
    if (t <= time) {
      const [previousTime, previousValue] = keys[i - 1];
      const x = (t - previousTime) / Math.max(time - previousTime, 1e-6);
      return THREE.MathUtils.lerp(previousValue, value, x * x * (3 - 2 * x));
    }
  }
  return keys[keys.length - 1][1];
}

function buildPlaceholderDriftPath(): RobotDriftFrame[] {
  const SAMPLE_RATE = 60;
  const DURATION = 7;
  const STRAIGHT_END = 1.6;
  const ARC_END = 6.0;
  const ARC_SPAN = ARC_END - STRAIGHT_END;
  const RADIUS = 1.5;
  const ENTRY_HEADING = -Math.PI / 2;
  // One full circle plus the 60° that lands the nose on 10 o'clock;
  // negative = clockwise seen from above (the turn is to the robot's right).
  const TOTAL_TURN = -(2 * Math.PI + Math.PI / 3);
  // Yaw eased as 1-(1-u)^p: fast early, dying away at the end, and its rate
  // at u=0 times RADIUS matches the straight phase's exit speed, so the
  // speed is continuous into the arc.
  const EASE_POWER = 1.42;
  const WHEEL_RADIUS = 0.1375; // wheel radius in robot lengths (0.22 stage)
  const HALF_TRACK = 0.33; // half the wheel track, robot lengths
  // Slip angle (heading minus travel direction) through the run: a small
  // counter-flick left, the swing past sideways, a long held slide easing
  // off, then straightening out before the stop.
  const SLIP_KEYS: Array<[number, number]> = [
    [0, 0],
    [1.25, 0],
    [1.5, 0.16],
    [1.75, -0.5],
    [2.4, -1.92],
    [3.2, -1.35],
    [4.4, -0.8],
    [5.2, -0.7],
    [6.2, 0],
  ];

  const velocityHeadingAt = (t: number) => {
    if (t <= STRAIGHT_END) return ENTRY_HEADING;
    const u = Math.min((t - STRAIGHT_END) / ARC_SPAN, 1);
    return ENTRY_HEADING + TOTAL_TURN * (1 - (1 - u) ** EASE_POWER);
  };
  const speedAt = (t: number) => {
    if (t <= STRAIGHT_END) return 4.05 - 0.5 * (t / STRAIGHT_END);
    const u = Math.min((t - STRAIGHT_END) / ARC_SPAN, 1);
    if (u >= 1) return 0;
    return (
      ((Math.abs(TOTAL_TURN) * EASE_POWER * (1 - u) ** (EASE_POWER - 1)) /
        ARC_SPAN) *
      RADIUS
    );
  };

  const dt = 1 / SAMPLE_RATE;
  const count = Math.round(DURATION * SAMPLE_RATE) + 1;
  const frames: RobotDriftFrame[] = [];
  let x = 6.05;
  let z = 0.95;
  let previousHeading = ENTRY_HEADING + keyedValue(SLIP_KEYS, 0);
  for (let i = 0; i < count; i += 1) {
    const time = i * dt;
    const velocityHeading = velocityHeadingAt(time);
    const speed = speedAt(time);
    const slipAngle = keyedValue(SLIP_KEYS, time);
    const heading = velocityHeading + slipAngle;
    const yawRate = (heading - previousHeading) / dt;
    previousHeading = heading;
    // The drive wheels overspeed while sliding (wheelspin), and the two
    // sides differ by the yaw so the outer wheels run faster.
    const slide = Math.min(1, Math.abs(slipAngle) / 0.5);
    const surface = speed * (1 + 0.6 * slide) + 1.2 * slide * Math.min(1, speed);
    frames.push({
      heading,
      position: [x, z],
      slipAngle,
      time,
      velocity: [Math.sin(velocityHeading) * speed, Math.cos(velocityHeading) * speed],
      wheelAngularSpeed: [
        (surface - yawRate * HALF_TRACK) / WHEEL_RADIUS,
        (surface + yawRate * HALF_TRACK) / WHEEL_RADIUS,
      ],
    });
    x += Math.sin(velocityHeading) * speed * dt;
    z += Math.cos(velocityHeading) * speed * dt;
  }
  return frames;
}

// ---------------------------------------------------------------------------
// PLACEHOLDER MODEL — components/robotModel.ts (batch/robot-asset) replaces
// this. When that lands, delete this function and its single call site in
// assembleRig below.
//
// A low box chassis, four dark cylinder wheels with one bright spoke each
// (so their spin reads in captures), and a small front mast so the robot's
// orientation is legible.
// ---------------------------------------------------------------------------

function buildPlaceholderRobot(): RobotModel {
  const aluminum = new THREE.MeshStandardMaterial({
    color: "#9aa0a8",
    metalness: 0.75,
    roughness: 0.32,
  });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: "#3a3d42",
    metalness: 0.6,
    roughness: 0.5,
  });
  const tire = new THREE.MeshStandardMaterial({
    color: "#17181b",
    metalness: 0.1,
    roughness: 0.92,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: "#c23b3b",
    metalness: 0.3,
    roughness: 0.45,
  });
  const spoke = new THREE.MeshStandardMaterial({
    color: "#d7dade",
    metalness: 0.5,
    roughness: 0.4,
  });

  const chassis = new THREE.Group();
  // The body on its own node so the roll tilt leaves the wheels planted.
  const body = new THREE.Group();
  body.name = "robot-body";
  chassis.add(body);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 1.6), aluminum);
  deck.position.y = 0.34;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 0.8), darkSteel);
  tray.position.set(0, 0.52, -0.2);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.12), accent);
  bumper.position.set(0, 0.32, 0.78);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), aluminum);
  mast.position.set(-0.28, 0.85, 0.6);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.02), accent);
  flag.position.set(-0.14, 1.04, 0.6);
  body.add(deck, tray, bumper, mast, flag);

  const wheelGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 24);
  wheelGeometry.rotateZ(Math.PI / 2); // axle along local X
  const hubGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.15, 12);
  hubGeometry.rotateZ(Math.PI / 2);
  const spokeGeometry = new THREE.BoxGeometry(0.16, 0.4, 0.07);

  const wheels: RobotModel["wheels"] = [];
  // The robot faces +Z, so its left side is +X.
  for (const [x, z, side] of [
    [0.56, 0.55, "left"],
    [0.56, -0.55, "left"],
    [-0.56, 0.55, "right"],
    [-0.56, -0.55, "right"],
  ] as Array<[number, number, "left" | "right"]>) {
    const wheel = new THREE.Group();
    wheel.position.set(x, 0.22, z);
    wheel.add(
      new THREE.Mesh(wheelGeometry, tire),
      new THREE.Mesh(hubGeometry, darkSteel),
      new THREE.Mesh(spokeGeometry, spoke),
    );
    chassis.add(wheel);
    wheels.push({ object: wheel, radius: 0.22, side });
  }

  // Two drivetrain gears (one per side, geared to that side's wheels) and a
  // front intake roller, each with a bright marker so the turn is visible.
  const spinners: RobotSpinner[] = [];
  const gearGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16);
  gearGeometry.rotateZ(Math.PI / 2);
  const markerGeometry = new THREE.BoxGeometry(0.06, 0.22, 0.04);
  for (const [x, side] of [
    [0.48, "left"],
    [-0.48, "right"],
  ] as Array<[number, "left" | "right"]>) {
    const gear = new THREE.Group();
    gear.position.set(x, 0.34, 0);
    gear.add(
      new THREE.Mesh(gearGeometry, darkSteel),
      new THREE.Mesh(markerGeometry, spoke),
    );
    chassis.add(gear);
    spinners.push({
      axis: "x",
      category: "drive",
      object: gear,
      radius: 0.12,
      side,
    });
  }
  const roller = new THREE.Group();
  roller.position.set(0, 0.46, 0.72);
  const rollerGeometry = new THREE.CylinderGeometry(0.13, 0.13, 0.7, 16);
  rollerGeometry.rotateZ(Math.PI / 2);
  roller.add(
    new THREE.Mesh(rollerGeometry, darkSteel),
    new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.04), accent),
  );
  chassis.add(roller);
  spinners.push({
    axis: "x",
    category: "intake",
    object: roller,
    radius: 0.13,
    side: "center",
  });

  return { chassis, length: ROBOT_LENGTH, spinners, wheels };
}

// ---------------------------------------------------------------------------
// PLACEHOLDER PROPS — components/propModels.ts (batch/props) replaces these.
// When that lands, delete these two functions and their call sites in
// loadProps above.
//
// The goal is the Push Back long goal reduced to the shape that matters: a
// horizontal tube on two legs, open at both ends, so "the robot backs into
// the mouth" is still readable. The ball is a plain sphere at match size.
// ---------------------------------------------------------------------------

const PLACEHOLDER_GOAL_LENGTH = 5.7;
const PLACEHOLDER_TROUGH_HEIGHT = 1.29;

function buildPlaceholderGoal(): GoalModel {
  const frame = new THREE.MeshStandardMaterial({
    color: "#6f7885",
    metalness: 0.7,
    roughness: 0.4,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: "#c23b3b",
    metalness: 0.25,
    roughness: 0.5,
  });

  const object = new THREE.Group();
  const half = PLACEHOLDER_GOAL_LENGTH / 2;
  const tubeGeometry = new THREE.CylinderGeometry(
    0.34,
    0.34,
    PLACEHOLDER_GOAL_LENGTH,
    20,
    1,
    true,
  );
  tubeGeometry.rotateX(Math.PI / 2); // long axis along local Z
  const tube = new THREE.Mesh(tubeGeometry, frame);
  tube.position.y = PLACEHOLDER_TROUGH_HEIGHT;
  object.add(tube);
  for (const z of [half, -half]) {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 20), trim);
    lip.position.set(0, PLACEHOLDER_TROUGH_HEIGHT, z);
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, PLACEHOLDER_TROUGH_HEIGHT, 0.1),
      frame,
    );
    leg.position.set(0, PLACEHOLDER_TROUGH_HEIGHT / 2, z * 0.75);
    object.add(lip, leg);
  }

  return {
    length: PLACEHOLDER_GOAL_LENGTH,
    object,
    openings: [
      { inward: [0, 0, -1], position: [0, PLACEHOLDER_TROUGH_HEIGHT, half] },
      { inward: [0, 0, 1], position: [0, PLACEHOLDER_TROUGH_HEIGHT, -half] },
    ],
    troughHeight: PLACEHOLDER_TROUGH_HEIGHT,
  };
}

function buildPlaceholderBall(): { object: THREE.Object3D; radius: number } {
  // A Push Back ball is about a fifth of the robot's length across.
  const radius = ROBOT_LENGTH * 0.1;
  const object = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 14),
    new THREE.MeshStandardMaterial({
      color: "#d8d24a",
      metalness: 0.1,
      roughness: 0.6,
    }),
  );
  return { object, radius };
}

// ---------------------------------------------------------------------------
// PLACEHOLDER BALL MOTION — components/ballPhysics.ts (batch/ball-physics)
// replaces this. When that lands, delete this function and its call site in
// the loader effect below.
//
// Balls are laid on the drift path itself, so the robot drives over each
// one: it sits still until the robot reaches it, rides in the intake, then
// hops out into the goal mouth at the end of the run.
// ---------------------------------------------------------------------------

function buildPlaceholderBallPhysics(
  frames: RobotDriftFrame[],
  radius: number,
  mouth: THREE.Vector3,
): BallPhysicsModule {
  const COUNT = 5;
  const SCORE_SPAN = 0.45; // seconds from leaving the robot to inside the goal
  const duration = frames[frames.length - 1].time;
  const seeds = Array.from({ length: COUNT }, (ignored, i) => {
    const pickup = duration * (0.14 + 0.12 * i);
    const sample = sampleDrift(frames, pickup);
    return {
      pickup,
      release: duration * 0.82 + SCORE_SPAN * 0.5 * i,
      rest: new THREE.Vector3(
        sample.position[0] * ROBOT_LENGTH,
        ROBOT_GROUND_Y + radius,
        sample.position[1] * ROBOT_LENGTH,
      ),
    };
  });

  return {
    ballCount: () => seeds.length,
    ballStatesAt: (time: number) =>
      seeds.map((seed) => {
        if (time < seed.pickup) {
          const resting: BallState = {
            carried: false,
            position: [seed.rest.x, seed.rest.y, seed.rest.z],
            rotation: [0, 0, 0],
          };
          return resting;
        }
        const held = sampleDrift(frames, Math.min(time, seed.release));
        const carriedAt: [number, number, number] = [
          held.position[0] * ROBOT_LENGTH,
          ROBOT_GROUND_Y + ROBOT_LENGTH * 0.4,
          held.position[1] * ROBOT_LENGTH,
        ];
        const spin = (time - seed.pickup) * 7;
        if (time < seed.release) {
          return { carried: true, position: carriedAt, rotation: [spin, 0, 0] };
        }
        // Out of the intake and up into the mouth on a short lob.
        const u = THREE.MathUtils.clamp((time - seed.release) / SCORE_SPAN, 0, 1);
        return {
          carried: false,
          position: [
            THREE.MathUtils.lerp(carriedAt[0], mouth.x, u),
            THREE.MathUtils.lerp(carriedAt[1], mouth.y, u) +
              Math.sin(Math.PI * u) * 0.35,
            THREE.MathUtils.lerp(carriedAt[2], mouth.z, u),
          ],
          rotation: [spin, 0, 0],
        };
      }),
  };
}

/** True when node already hangs somewhere under root. */
function isUnder(node: THREE.Object3D, root: THREE.Object3D) {
  for (let walk = node.parent; walk; walk = walk.parent) {
    if (walk === root) return true;
  }
  return false;
}

function assembleRig(model: RobotModel | null): RobotRig {
  const resolved = model ?? buildPlaceholderRobot();
  const pose = new THREE.Group();
  // The loaded model hands its wheels back as SIBLINGS of the chassis — each
  // spins about its own axle, so it cannot be buried inside it — while the
  // placeholder parents them to the chassis. Re-home whatever is loose under
  // one group and scale that, or the real robot's four wheels are left
  // orphaned and never reach the scene at all. The gears and rollers arrive
  // the same way and for the same reason, so they get the same treatment.
  const body = new THREE.Group();
  body.add(resolved.chassis);
  const spinners = resolved.spinners ?? [];
  for (const { object } of [...resolved.wheels, ...spinners]) {
    if (!isUnder(object, resolved.chassis)) body.add(object);
  }
  const scale = ROBOT_LENGTH / Math.max(resolved.length, 1e-3);
  body.scale.setScalar(scale);
  pose.add(body);
  pose.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) node.castShadow = true;
  });
  return {
    pose,
    roll: resolved.chassis.getObjectByName("robot-body") ?? body,
    scale,
    spinners,
    wheelRadius: resolved.wheels[0]?.radius ?? 0.22,
    wheels: resolved.wheels.map(({ object, side }) => ({ object, side })),
  };
}

/**
 * Stand the goal on the floor with one of its mouths just off the robot's
 * rear at the finish, turned so that backing straight out of the run drives
 * the aligner down the trough's axis and into the opening. Returns that
 * mouth's world position, which is where scored balls end up.
 */
function placeGoal(goal: GoalModel, finish: DriftFinish): THREE.Vector3 {
  // The robot faces along (sin h, cos h), so its rear points the other way.
  const rearX = -Math.sin(finish.heading);
  const rearZ = -Math.cos(finish.heading);
  const opening = goal.openings[0] ?? {
    inward: [0, 0, -1] as [number, number, number],
    position: [0, goal.troughHeight, goal.length / 2] as [number, number, number],
  };
  // Turn the goal until "into this mouth" and "the way the robot is backing"
  // are the same direction. Both angles are measured the same way headings
  // are, atan2(x, z), so the difference is the yaw to apply.
  const yaw =
    Math.atan2(rearX, rearZ) - Math.atan2(opening.inward[0], opening.inward[2]);
  goal.object.rotation.set(0, yaw, 0);
  // The mouth sits half a robot behind the finish, plus a hair of daylight.
  const standoff = ROBOT_LENGTH * 0.5 + GOAL_GAP;
  const mouth = new THREE.Vector3(
    finish.position[0] * ROBOT_LENGTH + rearX * standoff,
    ROBOT_GROUND_Y + opening.position[1],
    finish.position[1] * ROBOT_LENGTH + rearZ * standoff,
  );
  // Back the goal's own origin out from the mouth: the opening's offset,
  // turned by the same yaw. The base rides on the floor.
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  goal.object.position.set(
    mouth.x - (opening.position[0] * cos + opening.position[2] * sin),
    ROBOT_GROUND_Y,
    mouth.z - (-opening.position[0] * sin + opening.position[2] * cos),
  );
  goal.object.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return mouth;
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

type DriftSample = {
  aLat: number;
  heading: number;
  position: [number, number];
  slipAngle: number;
  velocity: [number, number];
  wheelAngularSpeed: [number, number];
};

function frameIndexAt(frames: RobotDriftFrame[], t: number) {
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (frames[mid].time <= t) low = mid;
    else high = mid - 1;
  }
  return low;
}

// The body pose between two samples: positions and velocities lerped,
// heading along the shortest arc (the sibling's frames may wrap).
function sampleDrift(frames: RobotDriftFrame[], t: number): DriftSample {
  const clamped = THREE.MathUtils.clamp(
    t,
    frames[0].time,
    frames[frames.length - 1].time,
  );
  const index = frameIndexAt(frames, clamped);
  const a = frames[index];
  const b = frames[Math.min(index + 1, frames.length - 1)];
  const span = Math.max(b.time - a.time, 1e-6);
  const mix = THREE.MathUtils.clamp((clamped - a.time) / span, 0, 1);
  const headingDelta = Math.atan2(
    Math.sin(b.heading - a.heading),
    Math.cos(b.heading - a.heading),
  );
  const velocity: [number, number] = [
    THREE.MathUtils.lerp(a.velocity[0], b.velocity[0], mix),
    THREE.MathUtils.lerp(a.velocity[1], b.velocity[1], mix),
  ];
  // Lateral acceleration from the velocity's finite difference, projected
  // on the travel direction's left (falls back to the heading at rest).
  const ax = (b.velocity[0] - a.velocity[0]) / span;
  const az = (b.velocity[1] - a.velocity[1]) / span;
  const speed = Math.hypot(velocity[0], velocity[1]);
  const heading = a.heading + headingDelta * mix;
  const dirX = speed > 0.05 ? velocity[0] / speed : Math.sin(heading);
  const dirZ = speed > 0.05 ? velocity[1] / speed : Math.cos(heading);
  return {
    aLat: ax * dirZ + az * -dirX,
    heading,
    position: [
      THREE.MathUtils.lerp(a.position[0], b.position[0], mix),
      THREE.MathUtils.lerp(a.position[1], b.position[1], mix),
    ],
    slipAngle: THREE.MathUtils.lerp(a.slipAngle, b.slipAngle, mix),
    velocity,
    wheelAngularSpeed: [
      THREE.MathUtils.lerp(a.wheelAngularSpeed[0], b.wheelAngularSpeed[0], mix),
      THREE.MathUtils.lerp(a.wheelAngularSpeed[1], b.wheelAngularSpeed[1], mix),
    ],
  };
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

export default function RobotOutro({
  progressRef,
  robotState,
}: {
  /** ThinkerStage's scrubbed progress; only .robot (0..1) is read here. */
  progressRef: MutableRefObject<{ robot: number }>;
  /** Written every frame for the rally camera in ThinkerStage. */
  robotState: RobotCameraState;
}) {
  const { gl, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const keyLightRef = useRef<THREE.SpotLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const runRef = useRef<RunState>({ time: 0 });
  const environmentRef = useRef<{
    active: boolean;
    previous: THREE.Texture | null;
    previousIntensity: number;
    texture: THREE.Texture | null;
  }>({ active: false, previous: null, previousIntensity: 1, texture: null });
  const [frames, setFrames] = useState<RobotDriftFrame[] | null>(null);
  const [rig, setRig] = useState<RobotRig | null>(null);
  // The goal and the balls: one group so the scene mounts and disposes them
  // together, plus the ball meshes in ballPhysics' own order.
  const [scenery, setScenery] = useState<{
    balls: THREE.Object3D[];
    group: THREE.Group;
  } | null>(null);
  const ballStatesRef = useRef<((time: number) => BallState[]) | null>(null);
  // Read by headless captures to check the goal landed and the parts turn.
  const probeRef = useRef({
    balls: 0,
    driveAngle: 0,
    goal: [0, 0, 0] as [number, number, number],
    intakeAngle: 0,
  });

  useEffect(() => {
    let live = true;
    void (async () => {
      const model = await loadModel();
      if (!live) return;
      setRig(assembleRig(model));
      // The trajectory's wheel speeds are computed from a wheel radius, and
      // the wheels have to spin at the speed they actually cover ground —
      // so the radius comes from THIS model rather than the drift module's
      // default. The Fusion robot rolls on 3.25 in omnis, appreciably
      // smaller than that default, and wheels turning too slowly for the
      // ground read as the whole run sliding.
      const wheel = model?.wheels[0];
      const { finish, frames } = await loadDrift(
        model && wheel && model.length > 0
          ? wheel.radius / model.length
          : undefined,
      );
      if (!live) return;
      setFrames(frames);

      // The goal and the balls. Both come from sibling branches; either one
      // missing falls back to a placeholder, so the scene never waits.
      const { ball, goal } = await loadProps();
      if (!live) return;
      const mouth = placeGoal(goal, finish);
      const physics =
        (await loadBallPhysics()) ??
        buildPlaceholderBallPhysics(frames, ball.radius, mouth);
      if (!live) return;
      ballStatesRef.current = physics.ballStatesAt;
      const group = new THREE.Group();
      group.add(goal.object);
      // One mesh per ball; the clones share the source's geometry and
      // material, so disposing the group's meshes frees each exactly once.
      const balls = Array.from(
        { length: Math.max(0, Math.round(physics.ballCount())) },
        (ignored, i) => {
          const object = i === 0 ? ball.object : ball.object.clone();
          object.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) node.castShadow = true;
          });
          group.add(object);
          return object;
        },
      );
      probeRef.current.balls = balls.length;
      probeRef.current.goal = [
        goal.object.position.x,
        goal.object.position.y,
        goal.object.position.z,
      ];
      setScenery({ balls, group });
    })();
    return () => {
      live = false;
    };
  }, []);

  // Dispose whatever the rig holds when it goes; for the placeholder that is
  // everything it built, for a loaded model whatever the loader handed over
  // (the stage is being torn down either way).
  useEffect(() => {
    if (!rig) return undefined;
    return () => {
      rig.pose.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          material.dispose();
        }
      });
    };
  }, [rig]);

  // Same for the goal and the balls: the group owns every mesh in the prop
  // set, and the ball clones share their source's geometry and material, so
  // three's own guard against a double dispose covers the repeats.
  useEffect(() => {
    if (!scenery) return undefined;
    return () => {
      scenery.group.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          material.dispose();
        }
      });
    };
  }, [scenery]);

  // Restore the scene's environment and free the PMREM texture on unmount.
  useEffect(() => {
    const environment = environmentRef.current;
    return () => {
      if (environment.active) {
        scene.environment = environment.previous;
        scene.environmentIntensity = environment.previousIntensity;
      }
      environment.texture?.dispose();
      environment.texture = null;
      environment.active = false;
    };
  }, [scene]);

  // Exposed so headless captures can read where the playhead sits.
  useEffect(() => {
    const debug = {
      probe: probeRef.current,
      run: runRef.current,
    };
    (window as unknown as Record<string, unknown>).__robotOutro = debug;
    return () => {
      delete (window as unknown as Record<string, unknown>).__robotOutro;
    };
  }, []);

  const memo = useMemo(
    () => ({
      fadeIn: (phase: number) =>
        THREE.MathUtils.smoothstep(phase, ROBOT_FADE_START, FADE_IN_END),
    }),
    [],
  );

  useFrame(() => {
    const phase = progressRef.current.robot;
    const group = groupRef.current;
    if (!group) return;
    // Nothing of the robot exists on screen while the statue is still
    // fading out, so the two scenes never overlap.
    const active = phase > ROBOT_FADE_START;
    group.visible = active;

    // The RoomEnvironment is set ONLY while the robot phase is live so the
    // statue phase's look stays exactly as it was; built once, on demand.
    const environment = environmentRef.current;
    if (active && !environment.active) {
      if (!environment.texture) {
        const pmrem = new THREE.PMREMGenerator(gl);
        const room = new RoomEnvironment();
        environment.texture = pmrem.fromScene(room, 0.04).texture;
        pmrem.dispose();
        (room as unknown as { dispose?: () => void }).dispose?.();
      }
      environment.previous = scene.environment;
      environment.previousIntensity = scene.environmentIntensity;
      scene.environment = environment.texture;
      // At full strength the room floods the stage; kept low it only puts
      // the metallic reads on the robot and a faint sheen on the asphalt.
      scene.environmentIntensity = 0.25;
      environment.active = true;
    } else if (!active && environment.active) {
      scene.environment = environment.previous;
      scene.environmentIntensity = environment.previousIntensity;
      environment.active = false;
    }
    if (!active) return;

    // Lights ride the fade the statue leaves on: warm key high right, cool
    // rim from back-left, a dim hemisphere floor.
    const fade = memo.fadeIn(phase);
    if (keyLightRef.current) keyLightRef.current.intensity = 240 * fade;
    if (rimLightRef.current) rimLightRef.current.intensity = 2.6 * fade;
    if (hemisphereRef.current) hemisphereRef.current.intensity = 0.25 * fade;

    if (!frames || !rig) return;
    const run = runRef.current;
    const duration = frames[frames.length - 1].time;
    // The scroll IS the playhead: the run is scrubbed, not played. Position,
    // heading and wheel spin all come from where the scroll sits, so the
    // drift runs backwards when the page does and holds still when it does.
    const previousTime = run.time;
    run.time =
      duration *
      THREE.MathUtils.clamp((phase - RUN_START) / (1 - RUN_START), 0, 1);
    // How far the playhead moved this frame, for integrating wheel spin.
    const dTime = run.time - previousTime;

    const sample = sampleDrift(frames, run.time);
    rig.pose.position.set(
      sample.position[0] * ROBOT_LENGTH,
      ROBOT_GROUND_Y,
      sample.position[1] * ROBOT_LENGTH,
    );
    rig.pose.rotation.y = sample.heading;

    // No body roll: the robot stays flat on its wheels through the whole
    // slide. A leaning chassis read as the model itself being tilted.
    rig.roll.rotation.z = 0;

    // Wheels integrate their angular speed (left samples on left wheels),
    // so the spin is real rotation, not a pose.
    for (const wheel of rig.wheels) {
      const omega =
        wheel.side === "left"
          ? sample.wheelAngularSpeed[0]
          : sample.wheelAngularSpeed[1];
      // Integrated against the PLAYHEAD, not the clock, so the wheels turn
      // exactly as far as the ground the scroll has moved them over — and
      // unwind when the page scrolls back.
      wheel.object.rotation.x += omega * dTime;
    }

    // The gears and rollers, on the same playhead-integrated footing.
    // The intake runs the whole way: the robot is collecting through the
    // pickups and still feeding at the goal, so it never idles mid-run.
    const intakeRunning = run.time > 0 && run.time < duration;
    for (const spinner of rig.spinners) {
      let omega = 0;
      if (spinner.category === "drive") {
        const wheelOmega =
          spinner.side === "left"
            ? sample.wheelAngularSpeed[0]
            : spinner.side === "right"
              ? sample.wheelAngularSpeed[1]
              : (sample.wheelAngularSpeed[0] + sample.wheelAngularSpeed[1]) / 2;
        // Meshed parts share a surface speed, so a gear smaller than the
        // wheel it drives turns proportionally faster.
        omega = wheelOmega * (rig.wheelRadius / Math.max(spinner.radius, 1e-4));
      } else if (intakeRunning) {
        // Radius is in model units; the surface speed is in stage units.
        omega =
          INTAKE_SURFACE_SPEED / Math.max(spinner.radius * rig.scale, 1e-4);
      }
      spinner.object.rotation[spinner.axis] += omega * dTime;
      const probe = probeRef.current;
      if (spinner.category === "drive") {
        probe.driveAngle = spinner.object.rotation[spinner.axis];
      } else {
        probe.intakeAngle = spinner.object.rotation[spinner.axis];
      }
    }

    // The balls are a pure function of the playhead too, so scrolling back
    // puts every one of them back where it was.
    const ballStates = ballStatesRef.current?.(run.time);
    if (scenery && ballStates) {
      for (let i = 0; i < scenery.balls.length; i += 1) {
        const state = ballStates[i];
        const object = scenery.balls[i];
        object.visible = Boolean(state);
        if (!state) continue;
        object.position.set(...state.position);
        object.rotation.set(...state.rotation);
      }
    }

    robotState.position.set(
      sample.position[0] * ROBOT_LENGTH,
      ROBOT_GROUND_Y,
      sample.position[1] * ROBOT_LENGTH,
    );
    robotState.velocity.set(
      sample.velocity[0] * ROBOT_LENGTH,
      0,
      sample.velocity[1] * ROBOT_LENGTH,
    );
    robotState.speed = robotState.velocity.length();
    robotState.heading = sample.heading;
    robotState.aLat = sample.aLat * ROBOT_LENGTH;
    // Resting means "has stopped", not "is nearly out of timeline". The run
    // parks well before its last frame — the drift ends around 2.6 s of 5.3 s
    // and the park phase just holds it still — and a fixed 0.2 s tail left the
    // camera on its MOVING framing for over a second while the robot sat
    // motionless. That framing sits 3.4 units behind a robot 1.77 tall, which
    // filled the entire frame. Once it has genuinely stopped, hand over to the
    // wider three-quarter shot that can also see the goal it just scored into.
    robotState.resting =
      run.time >= duration - 0.2 ||
      (robotState.speed < 0.25 && run.time > duration * 0.45);
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Near-black asphalt, matte with a slight environment sheen. */}
      <mesh
        position={[0, ROBOT_GROUND_Y, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[46, 32]} />
        <meshStandardMaterial
          color="#101114"
          envMapIntensity={0.4}
          metalness={0.05}
          roughness={0.85}
        />
      </mesh>
      <hemisphereLight
        ref={hemisphereRef}
        args={["#33404f", "#0b0b0d", 0]}
      />
      <spotLight
        ref={keyLightRef}
        angle={0.55}
        castShadow
        color="#ffd2a0"
        decay={1.1}
        distance={60}
        intensity={0}
        penumbra={0.45}
        position={[9, 11, 5]}
        shadow-bias={-0.0004}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <directionalLight
        ref={rimLightRef}
        color="#8fb4ff"
        intensity={0}
        position={[-7, 5, -7]}
      />
      {scenery ? <primitive object={scenery.group} /> : null}
      {rig ? <primitive object={rig.pose} /> : null}
    </group>
  );
}
