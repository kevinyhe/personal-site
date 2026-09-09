/**
 * The simulation itself: build the world, put the balls in it, step it.
 *
 * Kept apart from the bake script so the audit can rebuild the same world and
 * ask it questions -- where the walls are, which frame a ball was taken on --
 * without a second copy of the geometry drifting out of step with this one.
 *
 * The robot, its wheels and the indexer gate are kinematic: their motion is
 * known (the drift path decides where the robot is, the belt speed decides
 * how fast the wheels turn), so they are placed each step rather than solved.
 * The balls are dynamic and nothing places them anywhere -- they are moved by
 * friction against turning rubber, like the real thing.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import RAPIER from "@dimforge/rapier3d-compat";

import {
  BALL_MASS,
  BALL_RADIUS,
  corridorTrack,
  GATE_OPEN_ANGLE,
  GRAVITY,
  GROUND_Y,
  STAGE_PER_ROBOT_LENGTH,
  driveWheels,
  goalSpec,
  guidePlates,
  indexerGate,
  pointBackFromExit,
  sprockets,
} from "./world.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

/** Physics timestep. Fixed, so the run is reproducible. */
export const SIM_DT = 1 / 240;
/** Seconds after the robot parks before the indexer swings open. */
export const GATE_LEAD_IN = 0.3;
/** How long the gate takes to swing. */
export const GATE_SWING = 0.12;
/** How often the indexer lets one past, and how long it stays open. */
export const EJECT_PERIOD = 0.34;
export const EJECT_OPEN = 0.16;
/**
 * Where the goal's mouth sits, model z: at the robot's tail, which is what
 * "parks with its tail in the goal mouth" means and what the physics demands.
 *
 * The ball leaves the last indexer wheel at z = -0.364 at about four units a
 * second, and gravity here is 37.45 units/s^2. It can fall one ball radius --
 * after that its underside is below the trough's lip and it hits the front of
 * the goal instead of going in -- and one radius takes 0.09 s, which at that
 * speed is 0.37 units of travel. So the mouth cannot be more than about 0.37
 * past the last wheel. The tail is 0.44 past it, near enough, and the robot
 * has to be that close. A wider gap is only crossable in an animation with
 * the gravity turned down.
 */
export const MOUTH_Z = -0.8;
/** Model z a ball leaves the indexer at. */
export const EXIT_Z = -0.52;
/** How many balls the robot drives on already holding. */
export const PRELOAD_COUNT = 4;
/** How far off the corridor's centreline the rubber still reaches a ball. */
const GRIP_REACH = 0.14;
/** How hard it pulls a ball toward the belt speed, 1/s. */
const GRIP_GAIN = 26;
/**
 * The most it can pull, in the same units as gravity times the ball's mass
 * (which is 1.5). Three times the ball's weight is a firm grip on 30A rubber
 * and still finite, so a ball held against the shut gate stays there rather
 * than being extruded past it.
 */
const GRIP_FORCE = 4.5;
/** How hard the corridor holds a ball on its centreline, 1/s^2 and 1/s. */
const CENTRING_GAIN = 900;
const CENTRING_DAMPING = 30;
/** And the most the walls will push sideways, same units as GRIP_FORCE. */
const CENTRING_FORCE = 6;

// ------------------------------------------------------------------ helpers

export function yawQuat(heading) {
  return { w: Math.cos(heading / 2), x: 0, y: Math.sin(heading / 2), z: 0 };
}

export function quatMul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/** A turn about the robot's own +x. Every axle on this robot runs across it. */
export function spinQuat(angle) {
  return { w: Math.cos(angle / 2), x: Math.sin(angle / 2), y: 0, z: 0 };
}

/** Lay a cylinder (whose axis is +y) across the robot, along x. */
const ACROSS = { w: Math.cos(Math.PI / 4), x: 0, y: 0, z: Math.sin(Math.PI / 4) };

export async function buildSimulation() {
  const drift = await import(resolve(ROOT, "components/robotDrift.ts"));
  const driftFrames = drift.buildDriftPath({ sampleRate: 60 });
  const driftEnd = driftFrames[driftFrames.length - 1].time;
  const finish = drift.DRIFT_FINISH ?? {
    heading: driftFrames[driftFrames.length - 1].heading,
    position: driftFrames[driftFrames.length - 1].position,
  };
  const pickups = drift.BALL_PICKUP_TIMES ?? [];

  function poseAt(time) {
    if (time <= 0) return { heading: driftFrames[0].heading, position: driftFrames[0].position };
    if (time >= driftEnd) return { heading: finish.heading, position: finish.position };
    const exact = time * 60;
    const lower = Math.min(driftFrames.length - 2, Math.floor(exact));
    const blend = exact - lower;
    const a = driftFrames[lower];
    const b = driftFrames[lower + 1];
    return {
      heading: a.heading + (b.heading - a.heading) * blend,
      position: [
        a.position[0] + (b.position[0] - a.position[0]) * blend,
        a.position[1] + (b.position[1] - a.position[1]) * blend,
      ],
    };
  }

  function modelToWorld([x, y, z], pose) {
    const sinH = Math.sin(pose.heading);
    const cosH = Math.cos(pose.heading);
    return [
      pose.position[0] * STAGE_PER_ROBOT_LENGTH + z * sinH + x * cosH,
      GROUND_Y + y,
      pose.position[1] * STAGE_PER_ROBOT_LENGTH + z * cosH - x * sinH,
    ];
  }

  function worldToModel(position, pose) {
    const sinH = Math.sin(pose.heading);
    const cosH = Math.cos(pose.heading);
    const dx = position.x - pose.position[0] * STAGE_PER_ROBOT_LENGTH;
    const dz = position.z - pose.position[1] * STAGE_PER_ROBOT_LENGTH;
    return [dx * cosH - dz * sinH, position.y - GROUND_Y, dx * sinH + dz * cosH];
  }

  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = SIM_DT;
  // A 40 g ball squeezed between kinematic rollers is the awkward case for
  // any solver: the rollers are effectively infinitely heavy, so a shallow
  // contact can push the ball straight through something thin. More
  // iterations, and a soft skin on the rubber -- which is what a 30A flex
  // wheel is anyway -- keeps it where it belongs.
  world.numSolverIterations = 16;
  world.numAdditionalFrictionIterations = 8;
  world.numInternalPgsIterations = 2;

  // --- the floor
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(80, 0.5, 80)
      .setTranslation(0, GROUND_Y - 0.5, 0)
      .setFriction(0.7)
      .setRestitution(0.02),
    ground,
  );

  // --- the goal, mouth toward the robot's tail
  const goal = goalSpec();
  const mouthModelZ = MOUTH_Z;
  const goalMouth = modelToWorld([0, 0, mouthModelZ], finish);
  const goalHeading = finish.heading;
  const goalBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(goalMouth[0], GROUND_Y, goalMouth[2])
      .setRotation(yawQuat(goalHeading)),
  );
  const goalFloorTop = goal.troughHeight - BALL_RADIUS;
  const goalInnerHalfWidth = goal.halfWidth - 0.02;
  {
    const thickness = 0.06;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(goalInnerHalfWidth, thickness, goal.halfLength)
        .setTranslation(0, goalFloorTop - thickness, -goal.halfLength)
        .setFriction(0.18)
        .setRestitution(0.05),
      goalBody,
    );
    for (const side of [1, -1]) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(thickness, 0.4, goal.halfLength)
          .setTranslation(
            side * (goalInnerHalfWidth + thickness),
            goalFloorTop + 0.4,
            -goal.halfLength,
          )
          .setFriction(0.18),
        goalBody,
      );
    }
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(goalInnerHalfWidth, 0.4, thickness)
        .setTranslation(0, goalFloorTop + 0.4, -2 * goal.halfLength - thickness)
        .setFriction(0.18),
      goalBody,
    );
  }

  // --- the robot: corridor plates and sprockets on one kinematic body
  const robot = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const plates = guidePlates();
  for (const plate of plates) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(plate.halfThickness, plate.halfDepth, plate.halfLength)
        .setTranslation(plate.x, plate.y, plate.z)
        .setRotation(spinQuat(plate.angle))
        .setFriction(0.04),
      robot,
    );
  }
  const discs = sprockets();
  for (const disc of discs) {
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(disc.halfLength, disc.radius)
        .setTranslation(disc.x, disc.y, disc.z)
        .setRotation(ACROSS)
        .setFriction(0.1),
      robot,
    );
  }

  // --- the indexer gate
  const gate = indexerGate();
  const gateBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(gate.bladeHalfWidth, gate.bladeHalfHeight, gate.bladeHalfThickness)
      .setContactSkin(0.004)
      .setFriction(0.3),
    gateBody,
  );

  // --- the driven wheels
  const wheels = driveWheels().map((wheel) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(wheel.halfLength, wheel.radius)
        .setRotation(ACROSS)
        // Nearly frictionless on purpose. These are the corridor's walls;
        // the rubber's grip is applied as the drag in `driveBalls`, so
        // leaving them grippy as well means the ball fights its own drive
        // and creeps back down the tower.
        .setFriction(0.04)
        .setContactSkin(0.008)
        .setRestitution(0.02),
      body,
    );
    return { ...wheel, angle: 0, body };
  });

  // --- the balls
  const ballBodies = [];
  function addBall(position) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position[0], position[1], position[2])
        .setCanSleep(false)
        .setLinearDamping(0.15)
        // A foam ball squashes as it rolls and loses speed doing it, which is
        // what stops it running the whole 5.7 of the trough after it lands.
        .setAngularDamping(2.2)
        .setCcdEnabled(true),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setMass(BALL_MASS)
        .setFriction(0.85)
        .setRestitution(0.06),
      body,
    );
    ballBodies.push(body);
    return body;
  }

  const startPose = poseAt(0);
  // The four aboard are queued nose to tail against the shut gate, which is
  // where balls the robot is already holding would be sitting.
  const gateBack =
    Math.abs(EXIT_Z - gate.blockZ) + gate.bladeHalfThickness + BALL_RADIUS + 0.02;
  for (let i = 0; i < PRELOAD_COUNT; i += 1) {
    const [z, y] = pointBackFromExit(gateBack + i * (2 * BALL_RADIUS + 0.012));
    addBall(modelToWorld([0, y, z], startPose));
  }
  for (const pickup of pickups) {
    addBall([
      pickup.position[0] * STAGE_PER_ROBOT_LENGTH,
      GROUND_Y + BALL_RADIUS,
      pickup.position[1] * STAGE_PER_ROBOT_LENGTH,
    ]);
  }

  const gateOpensAt = driftEnd + GATE_LEAD_IN;
  let time = 0;

  function placeKinematics(now) {
    const pose = poseAt(now);
    const yaw = yawQuat(pose.heading);
    robot.setNextKinematicTranslation({
      x: pose.position[0] * STAGE_PER_ROBOT_LENGTH,
      y: GROUND_Y,
      z: pose.position[1] * STAGE_PER_ROBOT_LENGTH,
    });
    robot.setNextKinematicRotation(yaw);

    // The wheels and chain runs are the corridor's walls. They do not spin
    // here: the grip they provide is applied as a force in `driveBalls`,
    // because a spinning kinematic cylinder pressed against a 40 g ball
    // injects energy into the contact and eventually flings it across the
    // room. What they are for in this world is being in the way.
    for (const wheel of wheels) {
      const at = modelToWorld([wheel.x, wheel.y, wheel.z], pose);
      wheel.body.setNextKinematicTranslation({ x: at[0], y: at[1], z: at[2] });
      wheel.body.setNextKinematicRotation(yaw);
    }

    // The indexer meters: it lets one ball past, shuts behind it, and opens
    // again. Held open, the queue feeds out nose to tail at the wheels' own
    // speed -- about one every tenth of a second -- and balls arriving at the
    // goal that fast catch the one in front still rolling in and knock each
    // other out of the mouth. Cycling it is what an indexer is for, and it
    // puts them in one at a time.
    const sinceOpen = now - gateOpensAt;
    const cycle = sinceOpen < 0 ? 0 : sinceOpen % EJECT_PERIOD;
    const open = sinceOpen >= 0 && cycle < EJECT_OPEN;
    // Clamped at both ends. Unclamped, the "shut" branch returns ten before
    // the match even starts, and the flap spends the whole run swung back out
    // of the way -- which is why the two balls nearest the exit slid out of
    // the back of the robot the moment it accelerated.
    const swing = Math.max(
      0,
      Math.min(
        1,
        open
          ? cycle / GATE_SWING
          : 1 - (cycle - EJECT_OPEN) / GATE_SWING,
      ),
    );
    // Negative: the flap has to swing UP out of the corridor. Positive rotates
    // it the other way, which drives the tip further into the corridor and
    // seals the exit rather than opening it.
    const angle = -swing * GATE_OPEN_ANGLE;
    // Swing the blade about the hinge line: shut it points along
    // closedDirection and juts into the corridor, open it has lifted clear.
    const [hingeY, hingeZ] = gate.hinge;
    const [dz, dy] = gate.closedDirection;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const armZ = dz * cos - dy * sin;
    const armY = dz * sin + dy * cos;
    const centre = modelToWorld(
      [0, hingeY + armY * gate.reach, hingeZ + armZ * gate.reach],
      pose,
    );
    gateBody.setNextKinematicTranslation({ x: centre[0], y: centre[1], z: centre[2] });
    // The flap keeps its face across the corridor; the swing just tilts it.
    gateBody.setNextKinematicRotation(quatMul(yaw, spinQuat(angle)));
    return pose;
  }

  /**
   * The grip of the moving rubber, as a force. A ball within reach of the
   * corridor is dragged toward the belt velocity there; the force is capped
   * at GRIP_FORCE, which is what stops a driven ball being shoved through
   * the shut gate the way an unbounded contact would.
   */
  const grip = corridorTrack();
  const lastDrive = new Map();
  function driveBalls(pose, now) {
    const indexing = now >= gateOpensAt;
    const sinH = Math.sin(pose.heading);
    const cosH = Math.cos(pose.heading);

    // The robot's own motion, so the drag can be worked out from how fast a
    // ball is moving THROUGH the robot rather than across the floor. Without
    // this the tower reads a stationary ball in a robot doing seven units a
    // second as already up to speed and never picks it up -- and the whole
    // thing only appears to work once the robot has parked.
    const before = poseAt(Math.max(0, now - SIM_DT));
    const bodyVX =
      ((pose.position[0] - before.position[0]) * STAGE_PER_ROBOT_LENGTH) / SIM_DT;
    const bodyVZ =
      ((pose.position[1] - before.position[1]) * STAGE_PER_ROBOT_LENGTH) / SIM_DT;
    const yawRate = (pose.heading - before.heading) / SIM_DT;
    for (const body of ballBodies) {
      const [x, y, z] = worldToModel(body.translation(), pose);
      if (Math.abs(x) > 0.32) continue;
      let best = null;
      let bestDistance = GRIP_REACH;
      for (const station of grip) {
        const d = Math.hypot(station.z - z, station.y - y);
        if (d < bestDistance) {
          bestDistance = d;
          best = station;
        }
      }
      if (!best) continue;
      if (best.gated && !indexing) continue;   // the indexer is not running
      const v = body.linvel();
      // The ball's velocity relative to the robot, in the robot's frame: take
      // off the chassis's own travel, and the swing from its yaw rate at the
      // ball's offset from the turn centre.
      const relX = v.x - bodyVX + yawRate * (z * cosH + x * sinH);
      const relZ = v.z - bodyVZ - yawRate * (-z * sinH + x * cosH);
      const vz = relX * sinH + relZ * cosH;
      const vy = v.y;
      // Along the corridor: dragged toward the belt speed. Capped on its
      // own, not jointly with the centring below -- sharing one budget lets
      // a ball that is a few hundredths off the centreline spend the whole
      // allowance on getting back to the middle and none on climbing, which
      // is how a tower full of balls quietly slides back down.
      const along = best.tangent;
      const alongSpeed = vz * along[0] + vy * along[1];
      let drag = (best.speed - alongSpeed) * GRIP_GAIN * BALL_MASS;
      drag = Math.max(-GRIP_FORCE, Math.min(GRIP_FORCE, drag));

      // Across it: the walls, which hold the ball in the middle of a channel
      // its own width. Modelled as the squeeze it is rather than left to the
      // wall colliders, because the corridor's two offset curves cross where
      // the route's curvature flips, and a ball that finds one of those
      // crossings wedges and stops.
      const acrossZ = -along[1];
      const acrossY = along[0];
      const offset = (z - best.z) * acrossZ + (y - best.y) * acrossY;
      const acrossSpeed = vz * acrossZ + vy * acrossY;
      let centring = (-offset * CENTRING_GAIN - acrossSpeed * CENTRING_DAMPING) * BALL_MASS;
      centring = Math.max(-CENTRING_FORCE, Math.min(CENTRING_FORCE, centring));

      const fz = drag * along[0] + centring * acrossZ;
      const fy = drag * along[1] + centring * acrossY;
      // An impulse, not addForce: Rapier keeps an added force until it is
      // reset, so adding one every step accumulates and the ball ends up
      // three hundred units away.
      lastDrive.set(body.handle, {
        centring: Number(centring.toFixed(3)),
        drag: Number(drag.toFixed(3)),
        offset: Number(offset.toFixed(4)),
        station: [best.z, best.y],
      });
      body.applyImpulse(
        { x: fz * sinH * SIM_DT, y: fy * SIM_DT, z: fz * cosH * SIM_DT },
        true,
      );
    }
  }

  /** Advance one fixed step. Returns the robot pose it was stepped with. */
  function step() {
    const pose = placeKinematics(time);
    driveBalls(pose, time);
    world.step();
    time += SIM_DT;
    return pose;
  }

  return {
    RAPIER,
    ballBodies,
    driftEnd,
    finish,
    gate,
    gateBody,
    gateOpensAt,
    goal,
    goalBody,
    goalFloorTop,
    goalHeading,
    goalInnerHalfWidth,
    goalMouth,
    lastDrive,
    modelToWorld,
    pickups,
    plates,
    poseAt,
    robot,
    sprocketDiscs: discs,
    step,
    wheels,
    world,
    worldToModel,
    get time() {
      return time;
    },
  };
}
