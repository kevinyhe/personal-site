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
 * The scroll only opens and closes the scene (the robot phase, 0..1, from
 * ThinkerStage); the run itself plays on wall-clock time — crossing phase
 * 0.5 upward starts it once, dropping under 0.2 re-arms it, so scrolling
 * away and back replays the drift.
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
  wheels: Array<{
    object: THREE.Object3D;
    radius: number;
    side: "left" | "right";
  }>;
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

// The statue fades over the robot phase's first stretch; the robot scene's
// lights fade in over the same stretch (ThinkerStage uses the mirror value).
const FADE_IN_END = 0.3;
// Run control: crossing this upward starts the drift...
const RUN_TRIGGER = 0.5;
// ...and dropping under this re-arms it for a replay.
const RUN_REARM = 0.2;

type RobotRig = {
  /** World position + heading. */
  pose: THREE.Group;
  /** Receives the small body-roll tilt (the chassis without its wheels
   *  when the model provides that split, the whole robot otherwise). */
  roll: THREE.Object3D;
  wheels: Array<{ object: THREE.Object3D; side: "left" | "right" }>;
};

type RunState = { armed: boolean; playing: boolean; time: number };

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

type DriftModule = { buildDriftPath: (options?: unknown) => RobotDriftFrame[] };
type ModelModule = { loadRobotModel: () => Promise<RobotModel> };

async function loadDriftFrames(
  wheelRadius?: number,
): Promise<RobotDriftFrame[]> {
  const name = "robotDrift";
  const driftModule = (await import(`@/components/${name}`).catch(
    () => null,
  )) as DriftModule | null;
  if (driftModule?.buildDriftPath) {
    return driftModule.buildDriftPath(wheelRadius ? { wheelRadius } : undefined);
  }
  return buildPlaceholderDriftPath();
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
// site in loadDriftFrames above.
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

  return { chassis, length: ROBOT_LENGTH, wheels };
}

function assembleRig(model: RobotModel | null): RobotRig {
  const resolved = model ?? buildPlaceholderRobot();
  const pose = new THREE.Group();
  pose.add(resolved.chassis);
  resolved.chassis.scale.setScalar(ROBOT_LENGTH / Math.max(resolved.length, 1e-3));
  pose.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) node.castShadow = true;
  });
  return {
    pose,
    roll: resolved.chassis.getObjectByName("robot-body") ?? resolved.chassis,
    wheels: resolved.wheels.map(({ object, side }) => ({ object, side })),
  };
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
  const runRef = useRef<RunState>({ armed: true, playing: false, time: 0 });
  const environmentRef = useRef<{
    active: boolean;
    previous: THREE.Texture | null;
    previousIntensity: number;
    texture: THREE.Texture | null;
  }>({ active: false, previous: null, previousIntensity: 1, texture: null });
  const [frames, setFrames] = useState<RobotDriftFrame[] | null>(null);
  const [rig, setRig] = useState<RobotRig | null>(null);
  const rollAngleRef = useRef(0);

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
      const frames = await loadDriftFrames(
        model && wheel && model.length > 0
          ? wheel.radius / model.length
          : undefined,
      );
      if (live) setFrames(frames);
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

  // Exposed so headless captures can replay the run on demand.
  useEffect(() => {
    const debug = {
      replay: () => {
        runRef.current.armed = false;
        runRef.current.playing = true;
        runRef.current.time = 0;
      },
      run: runRef.current,
    };
    (window as unknown as Record<string, unknown>).__robotOutro = debug;
    return () => {
      delete (window as unknown as Record<string, unknown>).__robotOutro;
    };
  }, []);

  const memo = useMemo(
    () => ({ fadeIn: (phase: number) => THREE.MathUtils.smoothstep(phase, 0, FADE_IN_END) }),
    [],
  );

  useFrame((_, delta) => {
    const phase = progressRef.current.robot;
    const group = groupRef.current;
    if (!group) return;
    const active = phase > 0.001;
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
    if (phase < RUN_REARM) {
      run.armed = true;
      if (run.playing) {
        run.playing = false;
        run.time = 0;
      }
    } else if (phase > RUN_TRIGGER && run.armed) {
      run.armed = false;
      run.playing = true;
      run.time = 0;
    }
    const dt = Math.min(delta, 0.1);
    if (run.playing) run.time += dt;

    const duration = frames[frames.length - 1].time;
    const sample = sampleDrift(frames, run.time);
    rig.pose.position.set(
      sample.position[0] * ROBOT_LENGTH,
      ROBOT_GROUND_Y,
      sample.position[1] * ROBOT_LENGTH,
    );
    rig.pose.rotation.y = sample.heading;

    // A touch of body roll: the chassis leans out of the lateral
    // acceleration and into the slide, a few degrees at most.
    const rollTarget = THREE.MathUtils.clamp(
      -0.008 * sample.aLat - 0.02 * sample.slipAngle,
      -0.09,
      0.09,
    );
    rollAngleRef.current +=
      (rollTarget - rollAngleRef.current) * Math.min(1, 8 * dt);
    rig.roll.rotation.z = rollAngleRef.current;

    // Wheels integrate their angular speed (left samples on left wheels),
    // so the spin is real rotation, not a pose.
    if (run.playing) {
      for (const wheel of rig.wheels) {
        const omega =
          wheel.side === "left"
            ? sample.wheelAngularSpeed[0]
            : sample.wheelAngularSpeed[1];
        wheel.object.rotation.x += omega * dt;
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
    robotState.resting = run.playing && run.time >= duration - 0.2;
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
      {rig ? <primitive object={rig.pose} /> : null}
    </group>
  );
}
