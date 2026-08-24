"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import * as THREE from "three";

import {
  CAMERA_OFFSET,
  loadThinkerChunks,
  THINKER_BASE_YAW,
} from "@/components/thinkerChunks";
import {
  makeChunkGeometries,
  type ThinkerChunkBuild,
} from "@/components/thinkerFragments";
import RobotOutro, {
  createRobotCameraState,
  ROBOT_GROUND_Y,
  type RobotCameraState,
} from "@/components/RobotOutro";

gsap.registerPlugin(ScrollTrigger);

/**
 * The Thinker, ported from kevinsworks: the figure is cut into solid chunks
 * that fly away as the page scrolls, drag-rotatable, on a black stage with
 * one hard key. Here it lives inside the home page's panel (the box that
 * grows over the tree scene). The page tells it which stretch of scroll it
 * owns — from the moment the panel starts growing to the end of the page —
 * and where in that stretch the break begins (a fifth of the way into the
 * panel's growth, after lukebaffait.fr, whose fragments start streaming
 * off while its box is still small).
 *
 * From the break to 0.96 of the stretch, every piece flies the same way —
 * left, a little up, toward the viewer — the ones in front further, while
 * the camera backs off and follows to keep the cloud in view; the last few
 * percent are a settle.
 *
 * After the statue's stretch (start..statueEnd) the page's last scroll room
 * (statueEnd..end) belongs to the robot outro (see RobotOutro): the chunks
 * and the statue's lights fade out over its first 0.3, the robot scene
 * fades in, and the camera hands over to a rally-style chase.
 *
 * Model: "The Thinker by Auguste Rodin" by Rigsters (Sketchfab), CC-BY-4.0 —
 * see public/model/thinker/license.txt. Geometry only; the textures are
 * not used.
 */

/**
 * Where the scroll is: `value` runs 0..1 across the statue's stretch (start
 * to statueEnd, so the statue's sequence is untouched by the scroll room
 * added after it), `robot` runs 0..1 across the robot outro's stretch
 * (statueEnd to end), and `breakStart` is where in the statue's stretch the
 * break begins (set from the page's layout on every refresh).
 */
type ProgressRef = MutableRefObject<{
  breakStart: number;
  robot: number;
  value: number;
}>;

/** The stage's stretch of the page, in scroll pixels; re-read on refresh. */
export type ThinkerTiming = () => {
  /** Scroll position at which the break begins. */
  breakAt: number;
  /** Scroll position at which the robot outro's progress reaches 1. */
  end: number;
  /** Scroll position at which the stage's progress starts (0). */
  start: number;
  /**
   * Scroll position at which the statue's progress reaches 1 and the robot
   * outro's begins. The scroll room from statueEnd to end belongs to the
   * robot alone.
   */
  statueEnd: number;
};
type DragRotation = {
  active: boolean;
  lastX: number;
  lastY: number;
  pitch: number;
  pointerId: number | null;
  targetPitch: number;
  targetYaw: number;
  yaw: number;
};
type DragRotationRef = MutableRefObject<DragRotation>;

// Where the breakup ends, as a fraction of the stage's stretch (where it
// starts comes from the page, see ThinkerTiming).
const BREAK_END = 0.96;
// Camera distance to what it looks at: at rest, close on the upper two
// thirds of the figure; over the breakup it eases slightly closer while
// dollying to the left (on the scroll, not the pieces' easing), letting
// the debris stream past the frame's edge, as on lukebaffait.fr.
const CAMERA_DISTANCE = 5.0;
const CAMERA_DISTANCE_BROKEN = 4.65;
const CAMERA_DISTANCE_COMPACT = 6.2;
const CAMERA_DISTANCE_COMPACT_BROKEN = 5.85;
// Where the camera aims (figure height, centre 0): above the chest at
// rest — the frame sits high, with air over the figure's head — panning
// to the middle once broken.
const LOOK_AT_Y = 0.85;
const LOOK_AT_Y_BROKEN = -0.05;
// How far the camera swings around the figure over the breakup (radians
// about the vertical, negative = around to the left), aim staying put.
const ORBIT_LEFT = -0.275;
const ORBIT_LEFT_COMPACT = -0.2;

const FLOOR_Y = -1.6;
const STAGE_BLACK = "#0a0a0a";

// The robot outro's first stretch: the statue's materials (and its lights
// and floor shadow) fade out over robot phase 0..0.2; scrolling back
// restores everything. The robot does not begin to appear until this is
// finished (RobotOutro's ROBOT_FADE_START matches), so the two scenes never
// share the screen — the hand-off reads as a cut, not a dissolve.
const STATUE_FADE_END = 0.2;
// The statue camera blends into the rally chase over about a second of
// wall time once the robot phase opens.
const CAMERA_BLEND_SECONDS = 1;
const STATUE_FOV = 34;
// The chase camera does not roll. Banking the camera tips the horizon, and
// on screen that is indistinguishable from the robot itself leaning — which
// it must not do. Kept as a constant so the lateral-acceleration term below
// stays readable; raise it to bring the bank back.
const CAMERA_ROLL_MAX = 0;

function smoothPhase(start: number, end: number, value: number) {
  const x = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// How far along its flight a piece is, in multiples of its planned
// offset, for how far it is into its own travel window (1 = the window's
// end): quick off the mark and slowing through the window, so the pieces
// are visibly peeling off while the panel is still small (as on
// lukebaffait.fr, whose sequence is mostly played out by the time its box
// is full), then drifting on steadily the same way for as long as the
// scroll lasts.
const DRIFT_ON = 0.3;
// Released pieces also gain this much travel per second of plain time, so
// they never hang still in the air when the scroll rests.
const DRIFT_PER_SECOND = 0.016;

function travelAt(x: number) {
  if (x <= 0) return 0;
  if (x <= 1) return x * (2 - x);
  return 1 + (x - 1) * DRIFT_ON;
}

// How far through the breakup the scroll is, 0..1, linear: the chunks take
// their travel from this.
function breakupAt({ breakStart, value }: { breakStart: number; value: number }) {
  return THREE.MathUtils.clamp(
    (value - breakStart) / (BREAK_END - breakStart),
    0,
    1,
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return prefersReducedMotion;
}

// Scroll progress 0..1 across the stretch the page hands over, and the
// break's place in it, both re-read from the layout on every refresh.
function useThinkerScrollProgress({
  progressRef,
  reducedMotion,
  timing,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
  timing: ThinkerTiming;
}) {
  useEffect(() => {
    progressRef.current.robot = 0;
    progressRef.current.value = 0;
    const readBreakStart = () => {
      const { breakAt, start, statueEnd } = timing();
      progressRef.current.breakStart = THREE.MathUtils.clamp(
        (breakAt - start) / Math.max(statueEnd - start, 1),
        0,
        BREAK_END - 0.05,
      );
    };
    readBreakStart();
    // Marker mode (see DebugMarkers) holds the figure whole. Reduced motion
    // keeps the statue standing and never opens the robot outro.
    if (reducedMotion || window.location.search.includes("thinkerMarkers")) return undefined;
    // The statue's stretch ends at statueEnd, not the bottom of the page:
    // the scroll room after it belongs to the robot outro, scrubbed the
    // same way on its own tween.
    const tween = gsap.to(progressRef.current, {
      ease: "none",
      scrollTrigger: {
        end: () => timing().statueEnd,
        invalidateOnRefresh: true,
        onRefresh: readBreakStart,
        scrub: 0.9,
        start: () => timing().start,
      },
      value: 1,
    });
    const robotTween = gsap.to(progressRef.current, {
      ease: "none",
      robot: 1,
      scrollTrigger: {
        end: () => timing().end,
        invalidateOnRefresh: true,
        scrub: 0.9,
        start: () => timing().statueEnd,
      },
    });
    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 250);
    return () => {
      window.clearTimeout(refresh);
      tween.scrollTrigger?.kill();
      tween.kill();
      robotTween.scrollTrigger?.kill();
      robotTween.kill();
    };
  }, [progressRef, reducedMotion, timing]);
}

function useThinkerChunks() {
  const [build, setBuild] = useState<ThinkerChunkBuild | null>(null);
  useEffect(() => {
    let active = true;
    loadThinkerChunks()
      .then((next) => {
        if (active) {
          setBuild(next);
          ScrollTrigger.refresh();
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to build The Thinker's chunks.", error);
      });
    return () => {
      active = false;
    };
  }, []);
  return build;
}

const UP = new THREE.Vector3(0, 1, 0);

// Critically damped spring: velocity decays at exactly the rate that kills
// overshoot for the given stiffness. Semi-implicit Euler; dt is clamped by
// the caller so 2*omega*dt stays under 1.
const SPRING_SCRATCH = new THREE.Vector3();
function dampSpring(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  target: THREE.Vector3,
  omega: number,
  dt: number,
) {
  velocity.multiplyScalar(Math.max(1 - 2 * omega * dt, 0));
  velocity.addScaledVector(
    SPRING_SCRATCH.subVectors(target, position),
    omega * omega * dt,
  );
  position.addScaledVector(velocity, dt);
}

function CameraRig({
  progressRef,
  reducedMotion,
  robotState,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
  robotState: RobotCameraState;
}) {
  const { camera, scene, size } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  // The rally chase: position and look-target on their own critically
  // damped springs (different stiffness), blended over the statue camera
  // by wall time while the robot phase is open.
  const chase = useMemo(
    () => ({
      blend: 0,
      fov: STATUE_FOV,
      lookPosition: new THREE.Vector3(),
      lookVelocity: new THREE.Vector3(),
      position: new THREE.Vector3(),
      roll: 0,
      seeded: false,
      velocity: new THREE.Vector3(),
    }),
    [],
  );
  const scratch = useMemo(
    () => ({
      forward: new THREE.Vector3(),
      look: new THREE.Vector3(),
      lookTarget: new THREE.Vector3(),
      positionTarget: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ clock }, delta) => {
    // Linear in the scroll: a slow, even zoom-out and pan.
    const breakup = reducedMotion ? 0 : breakupAt(progressRef.current);
    const compact = size.width < 720;
    const distance = compact
      ? THREE.MathUtils.lerp(CAMERA_DISTANCE_COMPACT, CAMERA_DISTANCE_COMPACT_BROKEN, breakup)
      : THREE.MathUtils.lerp(CAMERA_DISTANCE, CAMERA_DISTANCE_BROKEN, breakup);
    // Aimed at the chest, panning down to the middle; the camera itself
    // swings around to the left as the pieces go — a rotation about the
    // figure, not a sideways move.
    lookAt.set(0, THREE.MathUtils.lerp(LOOK_AT_Y, LOOK_AT_Y_BROKEN, breakup), 0);
    target
      .copy(CAMERA_OFFSET)
      .applyAxisAngle(UP, (compact ? ORBIT_LEFT_COMPACT : ORBIT_LEFT) * breakup)
      .multiplyScalar(distance)
      .add(lookAt);

    const robotPhase = reducedMotion ? 0 : progressRef.current.robot;
    const dt = Math.min(delta, 0.05);
    chase.blend = THREE.MathUtils.clamp(
      chase.blend + (robotPhase > 0 ? dt / CAMERA_BLEND_SECONDS : -dt * 2),
      0,
      1,
    );

    const persp = camera as THREE.PerspectiveCamera;
    if (chase.blend <= 0) {
      // The statue's camera, untouched.
      chase.seeded = false;
      if (!reducedMotion) target.x += Math.sin(clock.elapsedTime * 0.18) * 0.028;
      camera.position.lerp(target, 0.08);
      camera.lookAt(lookAt);
      if (persp.isPerspectiveCamera && Math.abs(persp.fov - STATUE_FOV) > 0.01) {
        persp.fov = STATUE_FOV;
        persp.updateProjectionMatrix();
      }
      // The fog follows the camera so the figure stays clear and only the
      // far side of the cloud sinks into the black.
      if (scene.fog instanceof THREE.Fog) {
        const reach = camera.position.distanceTo(lookAt);
        scene.fog.near = reach + 0.8;
        scene.fog.far = reach + 5.2;
      }
      return;
    }

    // Seed the springs from wherever the statue camera actually is, so the
    // hand-over starts without a jump.
    if (!chase.seeded) {
      chase.seeded = true;
      chase.position.copy(camera.position);
      chase.velocity.set(0, 0, 0);
      chase.lookPosition.copy(lookAt);
      chase.lookVelocity.set(0, 0, 0);
      chase.roll = 0;
      chase.fov = STATUE_FOV;
    }

    const speed = robotState.speed;
    const moving = speed > 0.4;
    // Chase along the travel direction; at rest, along the robot's nose.
    scratch.forward.copy(robotState.velocity);
    if (moving) scratch.forward.normalize();
    else
      scratch.forward.set(
        Math.sin(robotState.heading),
        0,
        Math.cos(robotState.heading),
      );

    if (robotState.resting) {
      // The run is over: settle into a three-quarter hero shot of the
      // robot in its 10-o'clock pose, softer springs so it eases in.
      const fx = Math.sin(robotState.heading);
      const fz = Math.cos(robotState.heading);
      scratch.positionTarget.set(
        robotState.position.x + fx * 3.0 + Math.cos(robotState.heading) * 2.0,
        ROBOT_GROUND_Y + 1.55,
        robotState.position.z + fz * 3.0 - Math.sin(robotState.heading) * 2.0,
      );
      scratch.lookTarget.set(
        robotState.position.x,
        ROBOT_GROUND_Y + 0.5,
        robotState.position.z,
      );
    } else {
      // Low, behind-left of the motion, ~2.5 robot lengths back, looking
      // ahead of the robot along its velocity.
      scratch.positionTarget
        .copy(robotState.position)
        .addScaledVector(scratch.forward, -4.0);
      scratch.positionTarget.x += scratch.forward.z * 1.1;
      scratch.positionTarget.z += -scratch.forward.x * 1.1;
      scratch.positionTarget.y = ROBOT_GROUND_Y + 0.9;
      scratch.lookTarget
        .copy(robotState.position)
        .addScaledVector(scratch.forward, Math.min(speed * 0.45, 2.4));
      scratch.lookTarget.y = ROBOT_GROUND_Y + 0.35;
    }
    dampSpring(
      chase.position,
      chase.velocity,
      scratch.positionTarget,
      robotState.resting ? 1.6 : 4.2,
      dt,
    );
    dampSpring(
      chase.lookPosition,
      chase.lookVelocity,
      scratch.lookTarget,
      robotState.resting ? 2.2 : 7.0,
      dt,
    );

    // A small roll out of the lateral acceleration, FOV widening with
    // speed, and a light two-sine handheld wobble.
    const rollTarget = moving
      ? THREE.MathUtils.clamp(
          -0.006 * robotState.aLat,
          -CAMERA_ROLL_MAX,
          CAMERA_ROLL_MAX,
        )
      : 0;
    chase.roll += (rollTarget - chase.roll) * Math.min(1, 5 * dt);
    const fovTarget = robotState.resting
      ? 36
      : STATUE_FOV + 8 * THREE.MathUtils.clamp(speed / 6, 0, 1);
    chase.fov += (fovTarget - chase.fov) * Math.min(1, 3 * dt);
    const time = clock.elapsedTime;
    const noiseX = (Math.sin(time * 1.31) + Math.sin(time * 2.17)) * 0.01;
    const noiseY = (Math.sin(time * 1.73) + Math.sin(time * 2.93)) * 0.01;

    const mix = chase.blend * chase.blend * (3 - 2 * chase.blend);
    camera.position.lerpVectors(target, chase.position, mix);
    camera.position.x += noiseX * mix;
    camera.position.y += noiseY * mix;
    scratch.look.lerpVectors(lookAt, chase.lookPosition, mix);
    camera.lookAt(scratch.look);
    camera.rotateZ(chase.roll * mix);
    if (persp.isPerspectiveCamera) {
      const fovNow = THREE.MathUtils.lerp(STATUE_FOV, chase.fov, mix);
      if (Math.abs(persp.fov - fovNow) > 0.01) {
        persp.fov = fovNow;
        persp.updateProjectionMatrix();
      }
    }
    // Wider fog than the statue's: the asphalt has to stay readable out to
    // the entry mark while the far edge still sinks into the black.
    if (scene.fog instanceof THREE.Fog) {
      const reach = camera.position.distanceTo(scratch.look);
      scene.fog.near = reach + THREE.MathUtils.lerp(0.8, 3.5, mix);
      scene.fog.far = reach + THREE.MathUtils.lerp(5.2, 20, mix);
    }
  });
  return null;
}

function StageLights({
  progressRef,
  reducedMotion,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const keyLightRef = useRef<THREE.SpotLight>(null);
  const fillLightRef = useRef<THREE.SpotLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);
  const bounceLightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const breakup = reducedMotion ? 0 : travelAt(breakupAt(progressRef.current));
    // The robot outro brings its own lighting; the statue's rig dims out
    // with the statue over the robot phase's first stretch.
    const robotPhase = reducedMotion ? 0 : progressRef.current.robot;
    const statueLight = 1 - smoothPhase(0, STATUE_FADE_END, robotPhase);
    if (groupRef.current) groupRef.current.visible = statueLight > 0.001;
    if (statueLight <= 0.001) return;
    const pulse = reducedMotion
      ? 0
      : Math.sin(clock.elapsedTime * 0.28 + breakup * 2.1) * 0.6;
    if (ambientRef.current) ambientRef.current.intensity = 0.035 * statueLight;
    if (keyLightRef.current) {
      keyLightRef.current.position.x = -3.4 + breakup * 1.4;
      keyLightRef.current.intensity = (15.5 + breakup * 5.5 + pulse) * statueLight;
      // The cone opens as the pieces spread, so none fly out of the light.
      keyLightRef.current.angle = 0.36 + breakup * 0.3;
    }
    if (fillLightRef.current) fillLightRef.current.intensity = 5 * statueLight;
    if (rimLightRef.current) {
      rimLightRef.current.intensity = (3.2 + breakup * 2.8) * statueLight;
    }
    if (bounceLightRef.current) bounceLightRef.current.intensity = 1.65 * statueLight;
  });

  return (
    <group ref={groupRef}>
      <ambientLight ref={ambientRef} intensity={0.035} />
      <spotLight
        ref={keyLightRef}
        angle={0.36}
        castShadow
        color="#ffffff"
        decay={1.05}
        distance={12}
        intensity={15.5}
        penumbra={0.06}
        position={[-3.4, 3.2, 2.8]}
        shadow-bias={-0.0005}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <spotLight
        ref={fillLightRef}
        angle={0.26}
        color="#f4f5ff"
        decay={1.2}
        distance={10}
        intensity={5}
        penumbra={0.05}
        position={[3.2, 2.1, -1.5]}
      />
      <directionalLight
        ref={rimLightRef}
        color="#ffffff"
        intensity={3.2}
        position={[2.7, 1.8, -3.8]}
      />
      <pointLight
        ref={bounceLightRef}
        color="#ffffff"
        intensity={1.65}
        position={[-1.45, -1.05, 2.4]}
      />
    </group>
  );
}

function ChunkedThinker({
  build,
  dragRotationRef,
  progressRef,
  reducedMotion,
}: {
  build: ThinkerChunkBuild;
  dragRotationRef: DragRotationRef;
  progressRef: ProgressRef;
  reducedMotion: boolean;
}) {
  const stageRef = useRef<THREE.Group>(null);
  const chunkRefs = useRef<Array<THREE.Group | null>>([]);
  // Per chunk, how long it has been adrift (seconds of wall time).
  const adriftRef = useRef<Float32Array>(new Float32Array(0));
  // The opacity last written into the chunks' materials (1 = untouched).
  const appliedFadeRef = useRef(1);
  const chunks = useMemo(
    () =>
      build.chunks.map((chunk) => ({
        ...makeChunkGeometries(chunk),
        center: new THREE.Vector3(...chunk.center),
        offset: new THREE.Vector3(...chunk.offset),
        releaseAt: chunk.releaseAt,
        scale: chunk.scale,
        spin: new THREE.Vector3(...chunk.spin),
        travelWindow: chunk.travel,
      })),
    [build],
  );

  useEffect(() => {
    return () => {
      for (const chunk of chunks) {
        chunk.interiorGeometry.dispose();
        chunk.surfaceGeometry.dispose();
      }
    };
  }, [chunks]);

  useFrame(({ clock, size }, delta) => {
    const breakup = reducedMotion ? 0 : breakupAt(progressRef.current);
    const settle = reducedMotion ? 0 : smoothPhase(BREAK_END, 1, progressRef.current.value);

    // The robot outro takes the stage: over its first stretch the chunks'
    // materials (surface and interior alike) fade to nothing; scrolling
    // back up restores them to their opaque selves.
    const robotPhase = reducedMotion ? 0 : progressRef.current.robot;
    const statueFade = 1 - smoothPhase(0, STATUE_FADE_END, robotPhase);
    if (statueFade !== appliedFadeRef.current) {
      appliedFadeRef.current = statueFade;
      const fading = statueFade < 1;
      for (const group of chunkRefs.current) {
        if (!group) continue;
        for (const child of group.children) {
          const material = (child as THREE.Mesh)
            .material as THREE.MeshStandardMaterial;
          material.opacity = statueFade;
          material.transparent = fading;
        }
      }
    }
    if (stageRef.current) stageRef.current.visible = statueFade > 0.001;
    // Fully faded: skip the flight work, the stage is the robot's now.
    if (statueFade <= 0.001) return;

    if (adriftRef.current.length !== chunks.length) {
      adriftRef.current = new Float32Array(chunks.length);
    }

    chunks.forEach((chunk, index) => {
      const group = chunkRefs.current[index];
      if (!group) return;
      // Each chunk's flight takes its own window of the breakup once it
      // has released, then carries on the same way.
      const localProgress = Math.max(
        (breakup - chunk.releaseAt) / Math.max(chunk.travelWindow, 0.01),
        0,
      );
      // Time keeps a released piece moving even while the scroll rests;
      // its share fades with localProgress so scrolling back still brings
      // the piece home.
      if (localProgress > 0 && !reducedMotion) {
        adriftRef.current[index] += Math.min(delta, 0.1);
      } else {
        adriftRef.current[index] = 0;
      }

      const adrift =
        DRIFT_PER_SECOND * adriftRef.current[index] * Math.min(localProgress, 1);
      const travel = (travelAt(localProgress) + adrift) * (1 + settle * 0.06);
      const turn = Math.min(travel, 1.5);
      const breathing =
        Math.sin(clock.elapsedTime * 0.22 + index * 0.63) * 0.012 * travel;
      group.position.copy(chunk.center).addScaledVector(chunk.offset, travel);
      group.position.y += breathing;
      group.rotation.set(chunk.spin.x * turn, chunk.spin.y * turn, chunk.spin.z * turn);
      group.scale.setScalar(THREE.MathUtils.lerp(1, chunk.scale, Math.min(travel, 1)));
    });

    if (stageRef.current) {
      const compact = size.width < 720;
      const stageScale = compact ? 0.92 : 1;
      const drag = dragRotationRef.current;
      drag.yaw = THREE.MathUtils.lerp(drag.yaw, drag.targetYaw, drag.active ? 0.32 : 0.12);
      drag.pitch = THREE.MathUtils.lerp(
        drag.pitch,
        drag.targetPitch,
        drag.active ? 0.32 : 0.12,
      );
      stageRef.current.scale.setScalar(stageScale);
      const spread = travelAt(breakup);
      stageRef.current.rotation.set(
        -0.08 + spread * 0.04 + drag.pitch,
        THINKER_BASE_YAW - spread * 0.05 + drag.yaw,
        0.012,
      );
    }
  });

  return (
    <group ref={stageRef} rotation={[-0.08, THINKER_BASE_YAW, 0.012]}>
      <DebugMarkers />
      {chunks.map((chunk, index) => (
        <group
          key={index}
          ref={(node) => {
            chunkRefs.current[index] = node;
          }}
          position={chunk.center}
        >
          <mesh castShadow frustumCulled={false} geometry={chunk.surfaceGeometry}>
            <meshStandardMaterial
              color="#f1f1eb"
              emissive="#ffffff"
              emissiveIntensity={0.02}
              metalness={0}
              roughness={0.88}
              side={THREE.FrontSide}
            />
          </mesh>
          <mesh frustumCulled={false} geometry={chunk.interiorGeometry}>
            <meshStandardMaterial
              color="#d8d8d0"
              emissive="#ffffff"
              emissiveIntensity={0.018}
              metalness={0}
              roughness={0.94}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Development aid: `?thinkerMarkers=x,y,z;x,y,z;...` (figure space) draws
// a coloured sphere at each point, for placing the break path by eye.
const MARKER_COLOURS = ["#ff2a2a", "#2aff2a", "#2a6aff", "#ffd02a", "#ff2ad0", "#2affff", "#ff8a2a", "#ffffff"];

function DebugMarkers() {
  const points = useMemo(() => {
    if (typeof window === "undefined") return [] as THREE.Vector3[];
    const raw = new URLSearchParams(window.location.search).get("thinkerMarkers");
    if (!raw) return [] as THREE.Vector3[];
    return raw.split(";").map((triple) => {
      const [x, y, z] = triple.split(",").map(Number);
      return new THREE.Vector3(x, y, z);
    });
  }, []);
  return (
    <>
      {points.map((point, index) => (
        <mesh key={index} position={point} renderOrder={1000}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshBasicMaterial
            color={MARKER_COLOURS[index % MARKER_COLOURS.length]}
            depthTest={false}
            depthWrite={false}
            transparent
          />
        </mesh>
      ))}
    </>
  );
}

// The figure's shadow on the floor. It fades as the pieces break away —
// the lower ones fly below it — and never writes depth, so nothing that
// passes under it is cut off.
function StageFloor({
  progressRef,
  reducedMotion,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
}) {
  const materialRef = useRef<THREE.ShadowMaterial>(null);

  useFrame(() => {
    const spread = reducedMotion ? 0 : travelAt(breakupAt(progressRef.current));
    const robotPhase = reducedMotion ? 0 : progressRef.current.robot;
    if (materialRef.current) {
      // Faded by the spread as before, and gone entirely with the statue
      // once the robot outro opens.
      materialRef.current.opacity =
        0.82 * (1 - spread) * (1 - smoothPhase(0, STATUE_FADE_END, robotPhase));
    }
  });

  return (
    <mesh position={[0, FLOOR_Y, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[14, 14]} />
      <shadowMaterial ref={materialRef} color="#000000" depthWrite={false} opacity={0.82} />
    </mesh>
  );
}

function ThinkerCanvas({
  active,
  dragRotationRef,
  progressRef,
  reducedMotion,
}: {
  active: boolean;
  dragRotationRef: DragRotationRef;
  progressRef: ProgressRef;
  reducedMotion: boolean;
}) {
  const build = useThinkerChunks();
  // Written by RobotOutro every frame, read by CameraRig for the chase.
  const robotState = useMemo(createRobotCameraState, []);
  return (
    <Canvas
      camera={{
        far: 100,
        fov: 34,
        near: 0.1,
        position: [
          CAMERA_OFFSET.x * CAMERA_DISTANCE,
          CAMERA_OFFSET.y * CAMERA_DISTANCE,
          CAMERA_OFFSET.z * CAMERA_DISTANCE,
        ],
      }}
      dpr={[1, 1.75]}
      // Frozen while the panel is closed: no point drawing behind the tree.
      frameloop={active ? "always" : "never"}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.38;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
      // Size from the layout box, not the transformed one: the panel grows
      // from scale(0), and following that would rebuild the drawing buffer
      // every frame of the growth at whatever size it had reached.
      resize={{ offsetSize: true }}
      shadows
      style={{ height: "100%", width: "100%" }}
    >
      <color args={[STAGE_BLACK]} attach="background" />
      <fog args={[STAGE_BLACK, CAMERA_DISTANCE + 0.8, CAMERA_DISTANCE + 5.2]} attach="fog" />
      <CameraRig
        progressRef={progressRef}
        reducedMotion={reducedMotion}
        robotState={robotState}
      />
      <StageLights progressRef={progressRef} reducedMotion={reducedMotion} />
      <StageFloor progressRef={progressRef} reducedMotion={reducedMotion} />
      <RobotOutro progressRef={progressRef} robotState={robotState} />
      {build ? (
        <ChunkedThinker
          build={build}
          dragRotationRef={dragRotationRef}
          progressRef={progressRef}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </Canvas>
  );
}

export default function ThinkerStage({
  active,
  timing,
}: {
  /** Whether the panel holding the stage is open enough to be seen. */
  active: boolean;
  /** The stretch of the page's scroll the stage owns, and its break point. */
  timing: ThinkerTiming;
}) {
  const progressRef = useRef({ breakStart: 0.05, robot: 0, value: 0 });
  const dragRotationRef = useRef<DragRotation>({
    active: false,
    lastX: 0,
    lastY: 0,
    pitch: 0,
    pointerId: null,
    targetPitch: 0,
    targetYaw: 0,
    yaw: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // Exposed so headless captures can read the scrubbed state.
  useEffect(() => {
    const debug = { progress: progressRef.current };
    (window as unknown as Record<string, unknown>).__thinkerStage = debug;
    return () => {
      delete (window as unknown as Record<string, unknown>).__thinkerStage;
    };
  }, []);

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRotationRef.current;
    if (drag.pointerId !== event.pointerId) return;
    drag.active = false;
    drag.pointerId = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const drag = dragRotationRef.current;
    drag.active = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.pointerId = event.pointerId;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRotationRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.lastX;
    const deltaY = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.targetYaw = THREE.MathUtils.clamp(
      drag.targetYaw + deltaX * 0.006,
      -Math.PI * 0.72,
      Math.PI * 0.72,
    );
    drag.targetPitch = THREE.MathUtils.clamp(
      drag.targetPitch + deltaY * 0.004,
      -0.42,
      0.32,
    );
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const drag = dragRotationRef.current;
    const yawStep = Math.PI * 0.08;
    const pitchStep = 0.08;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      drag.targetYaw = THREE.MathUtils.clamp(
        drag.targetYaw + (event.key === "ArrowLeft" ? -yawStep : yawStep),
        -Math.PI * 0.72,
        Math.PI * 0.72,
      );
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      drag.targetPitch = THREE.MathUtils.clamp(
        drag.targetPitch + (event.key === "ArrowUp" ? -pitchStep : pitchStep),
        -0.42,
        0.32,
      );
      event.preventDefault();
    }
  };

  useThinkerScrollProgress({ progressRef, reducedMotion, timing });

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: STAGE_BLACK }}>
      <div
        aria-label="Drag or use arrow keys to rotate The Thinker"
        className={`absolute inset-0 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onKeyDown={handleKeyDown}
        onPointerCancel={stopDragging}
        onPointerDown={handlePointerDown}
        onPointerLeave={(event) => {
          if (dragRotationRef.current.active) stopDragging(event);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        role="application"
        style={{ pointerEvents: active ? "auto" : "none", touchAction: "none" }}
        tabIndex={active ? 0 : -1}
      >
        <ThinkerCanvas
          active={active}
          dragRotationRef={dragRotationRef}
          progressRef={progressRef}
          reducedMotion={reducedMotion}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_0%,rgba(0,0,0,0.12)_42%,rgba(0,0,0,0.92)_100%)]" />
    </div>
  );
}
