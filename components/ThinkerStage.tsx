"use client";

import { Canvas, invalidate, useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
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
 * that fly away as the page scrolls, on a black stage with
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
// Where the breakup ends, as a fraction of the stage's stretch (where it
// starts comes from the page, see ThinkerTiming).
const BREAK_END = 0.96;
// Camera distance to what it looks at: at rest, close on the upper two
// thirds of the figure; over the breakup it eases slightly closer while
// dollying to the left (on the scroll, not the pieces' easing), letting
// the debris stream past the frame's edge, as on lukebaffait.fr.
const CAMERA_DISTANCE = 5.0;
const CAMERA_DISTANCE_BROKEN = 5.1;
const CAMERA_DISTANCE_COMPACT_BROKEN = 6.3;
// The shot OPENS on the blow — where the figure struck the floor, the point
// the whole fracture is measured from — and pulls out from there. The
// position comes from the build itself (`breakOrigin`), turned into world
// space by the stage group's own rotation, so if the impact moves the
// camera follows it without anything here being retyped. This is the
// fallback for the frames before the build has landed.
const IMPACT_FALLBACK = new THREE.Vector3(-0.15, -1.5, 0.25);
// Far enough back that the blow reads in context — the base and the legs
// above it — rather than filling the frame with anatomy you cannot place.
const CAMERA_DISTANCE_CLOSE = 2.6;
const CAMERA_DISTANCE_CLOSE_COMPACT = 3.2;
// The stage group's own rotation. Shared with ChunkedThinker's <group> so
// the camera and the figure cannot drift apart.
const STAGE_ROTATION: [number, number, number] = [-0.08, THINKER_BASE_YAW, 0.012];
// Where the camera aims (figure height, centre 0): the pan runs impact ->
// chest -> middle as a quadratic Bezier, so the aim ARCS up the figure and
// back down instead of sliding along a straight line between two points.
const LOOK_AT_Y = 0.85;
const LOOK_AT_Y_BROKEN = -0.05;
const LOOK_AT_MID = new THREE.Vector3(0.05, LOOK_AT_Y + 0.1, 0.35);
const LOOK_AT_END = new THREE.Vector3(0, LOOK_AT_Y_BROKEN, 0);
// Where the camera sits for the opening shot, per unit of distance: hard to
// the RIGHT of the figure and a little below the blow, so the move out to
// CAMERA_OFFSET's high three-quarter view is a real tilt and swing rather
// than a straight dolly back. Both this and CAMERA_OFFSET sit well to the
// right, and the swing below runs leftward, so the whole move reads
// right-to-left.
const CAMERA_OFFSET_CLOSE = new THREE.Vector3(0.95, 0.18, 1).normalize();
// The opening aim sits a little above the blow rather than straight at it,
// so the arms have headroom in the frame instead of sitting on its centre
// line. It was 0.45 when the blow was on the floor and half the frame would
// otherwise have been bare ground.
const IMPACT_AIM_LIFT = 0.2;
// How far the camera swings around the figure over the breakup (radians
// about the vertical, negative = around to the left), aim staying put.
// The swing rides the RAW breakup while the zoom rides its smoothstep, so
// the orbit keeps drifting after the pull-out has settled.
const ORBIT_LEFT = -1.0;
const ORBIT_LEFT_COMPACT = -0.7;

const FLOOR_Y = -1.6;
const STAGE_BLACK = "#0a0a0a";

// The hand-off to the robot is a CLIP, not a dissolve: on the frame the
// robot phase opens, the statue and everything lighting it are simply gone
// and the robot is simply there. No fade window at either end — this used
// to cross-fade over robot phase 0..0.08 with the robot coming up over
// 0.08..0.13 behind it. `statueOn` is that switch, and RobotOutro's
// ROBOT_FADE_START is its other half. Scrolling back up restores the
// statue just as sharply.
const statueOn = (robotPhase: number) => (robotPhase > 0 ? 0 : 1);
const STATUE_FOV = 34;

/** Last frame's camera framing, read by headless captures. */
const cameraProbe: Record<string, unknown> = {};

/**
 * Outro camera keyframes, against seconds along the drift. Each is a list
 * of [time, value] read with `keyed`, which eases between them.
 */
const CAMERA_AZIMUTH: Array<[number, number]> = [
  // Held while the robot comes down the field collecting balls, so the
  // shot opens on the move rather than swinging during it...
  [0, -45],
  [1.5, -45],
  // ...and from there it only ever INCREASES — counter-clockwise seen from
  // above — so the camera sweeps one way from the first frame of the drift
  // to the last and never doubles back. The robot itself turns a full
  // circle over the same stretch and this angle is measured against its
  // nose, so the two rotations compound instead of cancelling.
  [2.6, -10],
  [4.0, 30],
  [5.6, 65],
  // Lands on +90, off the robot's left, which puts the goal (off its rear)
  // on the right of frame. It holds there for the rest of the playhead —
  // the run parks at about 7.5 s but the balls take until 11.3 s to finish
  // going in, and `keyed` clamps past its last key.
  [7.4, 90],
];

const CAMERA_DISTANCE_KEYS: Array<[number, number]> = [
  [0, 4.6],
  [3.6, 5.2],
  [5.2, 6.4],
  [7.4, 8.6],
];
const CAMERA_HEIGHT_KEYS: Array<[number, number]> = [
  // Down at the level of the drivetrain, looking up at the robot — the
  // angle a trackside racing camera sits at, where the car fills the frame
  // against the sky rather than being looked down on.
  [0, 0.28],
  [3.6, 0.42],
  // Only at the very end does it climb, for the wide shot that has to hold
  // the goal and the scored balls as well.
  [7.4, 3.0],
];

const CAMERA_AIM_BEHIND_KEYS: Array<[number, number]> = [
  [0, 0],
  [5.2, 0.4],
  [7.4, 1.8],
];

/**
 * Height the camera aims at, model units above the floor. Low and slightly
 * ABOVE the lens for most of the run, which is what tilts the shot upward.
 */
const CAMERA_AIM_HEIGHT: Array<[number, number]> = [
  [0, 0.62],
  [3.6, 0.7],
  [7.4, 0.9],
];

/** Smoothstep between [time, value] keys. */
function keyed(keys: Array<[number, number]>, at: number) {
  if (at <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    if (at > keys[i][0]) continue;
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    const x = THREE.MathUtils.clamp((at - t0) / Math.max(t1 - t0, 1e-6), 0, 1);
    return v0 + (v1 - v0) * x * x * (3 - 2 * x);
  }
  return keys[keys.length - 1][1];
}

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
        // Light: the page itself now glides (components/SmoothScroll), so a
        // long scrub here would smooth an already-smoothed scroll and the
        // statue would visibly trail the page.
        scrub: 0.35,
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
        // Light: the page itself now glides (components/SmoothScroll), so a
        // long scrub here would smooth an already-smoothed scroll and the
        // statue would visibly trail the page.
        scrub: 0.35,
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

function CameraRig({
  openAim,
  progressRef,
  reducedMotion,
  robotState,
}: {
  /** Where the shot opens: the blow, lifted clear of the floor. */
  openAim: THREE.Vector3;
  progressRef: ProgressRef;
  reducedMotion: boolean;
  robotState: RobotCameraState;
}) {
  const { camera, scene, size } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  // The rally shot: where the camera sits and what it looks at during the
  // outro. Both are written outright each frame from the run time — no
  // springs, no state carried between frames — and blended over the statue
  // camera by `blend`, which snaps rather than eases.
  const chase = useMemo(
    () => ({
      blend: 0,
      fov: STATUE_FOV,
      lookPosition: new THREE.Vector3(),
      position: new THREE.Vector3(),
      roll: 0,
      seeded: false,
    }),
    [],
  );
  const scratch = useMemo(
    () => ({
      forward: new THREE.Vector3(),
      look: new THREE.Vector3(),
      offset: new THREE.Vector3(),
    }),
    [],
  );
  // The statue camera lerps toward its target so the scroll scrub stays
  // smooth, but the FIRST frame must not: the canvas starts at the wide
  // framing, and lerping from there would slide the lens into the hand
  // shot over a second instead of opening on it.
  const opened = useRef(false);

  useFrame(({ clock }) => {
    // Linear in the scroll: a slow, even zoom-out and pan.
    const breakup = reducedMotion ? 0 : breakupAt(progressRef.current);
    const compact = size.width < 720;
    // The pull-out holds the tight framing for a beat — long enough to
    // watch the hand itself come apart — then opens through the middle of
    // the run and settles at the end. Smoothstep, not linear.
    //
    // Reduced motion pins breakup to 0, which is the hand close-up. That
    // would strand those users in an extreme close-up they can never move
    // out of, so they get the settled wide framing instead: the figure
    // whole, from the far end of the same arc.
    const open = reducedMotion
      ? 1
      : breakup * breakup * (3 - 2 * breakup);
    const distance = compact
      ? THREE.MathUtils.lerp(CAMERA_DISTANCE_CLOSE_COMPACT, CAMERA_DISTANCE_COMPACT_BROKEN, open)
      : THREE.MathUtils.lerp(CAMERA_DISTANCE_CLOSE, CAMERA_DISTANCE_BROKEN, open);
    // Aim: quadratic Bezier hand -> chest -> middle.
    const u = 1 - open;
    lookAt
      .copy(openAim)
      .multiplyScalar(u * u)
      .addScaledVector(LOOK_AT_MID, 2 * u * open)
      .addScaledVector(LOOK_AT_END, open * open);
    // The eye swings from nearly head-on and below the hand round to the
    // high three-quarter view, and keeps orbiting left after the zoom has
    // settled.
    scratch.offset.copy(CAMERA_OFFSET_CLOSE).lerp(CAMERA_OFFSET, open).normalize();
    target
      .copy(scratch.offset)
      .applyAxisAngle(UP, (compact ? ORBIT_LEFT_COMPACT : ORBIT_LEFT) * breakup)
      .multiplyScalar(distance)
      .add(lookAt);

    const robotPhase = reducedMotion ? 0 : progressRef.current.robot;
    // A cut, not a pan. Easing the lens from the statue's framing into the
    // chase swept it across an empty stage for a second before the robot
    // had even arrived; the chase camera now owns the frame outright from
    // the first robot pixel.
    chase.blend = robotPhase > 0 ? 1 : 0;

    const persp = camera as THREE.PerspectiveCamera;
    if (chase.blend <= 0) {
      // The statue's camera, untouched.
      chase.seeded = false;
      // Handheld drift, scaled by how far out the camera is: the same
      // angular wander reads as much bigger movement on the tight hand
      // shot than on the wide one.
      if (!reducedMotion) {
        const sway = distance * 0.016;
        target.x += Math.sin(clock.elapsedTime * 0.18) * sway;
        target.y += Math.sin(clock.elapsedTime * 0.13 + 1.1) * sway * 0.6;
      }
      if (opened.current) camera.position.lerp(target, 0.08);
      else {
        opened.current = true;
        camera.position.copy(target);
      }
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

    // There is no chase spring here any more, and that is the point. The
    // run is scrubbed by the scroll, so a flick of the wheel can move the
    // robot ten units in one frame; a spring integrating real time gets a
    // single frame of catch-up and is left standing, then lunges after it
    // over the following second. Feeding it the playhead delta instead
    // (which is what this did) makes the stiffness change frame to frame,
    // which is what the shot was juddering on.
    //
    // The framing is now a pure function of the playhead: every term below
    // comes from the run time and the robot's pose, so the same scroll
    // position always gives the same shot, and scrolling back retraces it
    // exactly. The lag that made the robot swing across frame is still
    // there — it just lives in the RUN's clock instead of the wall's, as
    // RobotOutro's anchor pose.
    const seeding = !chase.seeded;
    if (seeding) {
      chase.seeded = true;
      chase.roll = 0;
    }

    // ------------------------------------------------------------------
    // The outro camera is CHOREOGRAPHED, not reactive. It orbits the robot
    // in the robot's own frame, so the framing is described relative to the
    // robot however the robot happens to be pointing:
    //
    //   azimuth 0 = dead in front of the nose, +90 = off its LEFT side,
    //   180 = behind it, -90 = off its RIGHT side. The angle only ever
    //   increases, so the camera pans one way (leftwards) the whole run
    //   instead of doubling back.
    //
    //   -45  it opens on the robot's FRONT RIGHT and HOLDS there through
    //        the reverse entry, so the move is not panned across
    //   +112 through the drift, about midway between its left and its
    //        back left, watching the tail hang out
    //   +315 by the end of the drift, back round to the front right
    //        (-45 plus a full turn) — that is the leftward pan
    //   +450 at rest, exactly off the robot's LEFT (+90 plus a turn),
    //        which puts the goal, sitting off the robot's rear, on the
    //        RIGHT of frame. It also backs away here so the goal and the
    //        scored balls fit in the shot.
    // ------------------------------------------------------------------
    const runAt = robotState.runTime;
    const azimuth = keyed(CAMERA_AZIMUTH, runAt) * (Math.PI / 180);
    const orbit = keyed(CAMERA_DISTANCE_KEYS, runAt);
    const lift = keyed(CAMERA_HEIGHT_KEYS, runAt);
    // Offset direction in the robot's frame. ADDING the azimuth is what
    // swings a positive angle to the robot's LEFT: with +Y up, a body's
    // right is cross(forward, up), which for a robot facing -z is +x — so
    // subtracting put the camera on the wrong side of it.
    // Both the orbit centre and the aim point hang off the ANCHOR pose —
    // where the robot was CAMERA_ANCHOR_LAG seconds of run time ago — not
    // the live one. While the robot is sliding it runs out ahead of the
    // frame; as it slows the anchor catches up and it settles back to the
    // middle, which is the swing the old loose springs were there for,
    // without any of their catch-up behaviour.
    const side = robotState.anchorHeading + azimuth;
    chase.position.set(
      robotState.anchorPosition.x + Math.sin(side) * orbit,
      ROBOT_GROUND_Y + lift,
      robotState.anchorPosition.z + Math.cos(side) * orbit,
    );
    // Aim at the robot, easing back toward its tail once it is parked so
    // the goal it has just filled shares the frame.
    const behind = keyed(CAMERA_AIM_BEHIND_KEYS, runAt);
    chase.lookPosition.set(
      robotState.anchorPosition.x - Math.sin(robotState.anchorHeading) * behind,
      ROBOT_GROUND_Y + keyed(CAMERA_AIM_HEIGHT, runAt),
      robotState.anchorPosition.z - Math.cos(robotState.anchorHeading) * behind,
    );

    // No roll at all — banking the camera tips the horizon, and on screen
    // that is indistinguishable from the robot leaning. The focal length
    // widens a little
    // with how fast the robot is actually moving, easing back to a settled
    // value once it has parked.
    chase.roll = 0;
    // The focal length widens with how fast the robot is actually going.
    // `resting` is a threshold on that same speed, so it used to flip the
    // target by 6 degrees in one frame and the old easing smeared the snap
    // over the next second — a zoom nobody asked for, at a moment nobody
    // was scrolling. Reading it straight off speed removes both the step
    // and the easing, and like everything else here it is now a pure
    // function of where the page is.
    chase.fov = 36 + 6 * THREE.MathUtils.clamp(robotState.speed / 6, 0, 1);
    const time = clock.elapsedTime;
    const noiseX = (Math.sin(time * 1.31) + Math.sin(time * 2.17)) * 0.01;
    const noiseY = (Math.sin(time * 1.73) + Math.sin(time * 2.93)) * 0.01;

    const mix = chase.blend * chase.blend * (3 - 2 * chase.blend);
    camera.position.lerpVectors(target, chase.position, mix);
    camera.position.x += noiseX * mix;
    camera.position.y += noiseY * mix;
    scratch.look.lerpVectors(lookAt, chase.lookPosition, mix);
    camera.lookAt(scratch.look);
    // Headless captures read these to check the framing numerically.
    cameraProbe.camera = camera.position.toArray();
    cameraProbe.look = scratch.look.toArray();
    cameraProbe.robot = robotState.position.toArray();
    cameraProbe.resting = robotState.resting;
    cameraProbe.speed = robotState.speed;
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
    const statueLight = statueOn(robotPhase);
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
  progressRef,
  reducedMotion,
}: {
  build: ThinkerChunkBuild;
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
    const statueFade = statueOn(robotPhase);
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
      stageRef.current.scale.setScalar(stageScale);
      const spread = travelAt(breakup);
      stageRef.current.rotation.set(
        -0.08 + spread * 0.04,
        THINKER_BASE_YAW - spread * 0.05,
        0.012,
      );
    }
  });

  return (
    <group ref={stageRef} rotation={STAGE_ROTATION}>
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
        0.82 * (1 - spread) * statueOn(robotPhase);
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
  progressRef,
  reducedMotion,
}: {
  active: boolean;
  progressRef: ProgressRef;
  reducedMotion: boolean;
}) {
  const build = useThinkerChunks();
  // Written by RobotOutro every frame, read by CameraRig for the chase.
  const robotState = useMemo(createRobotCameraState, []);
  // Where the blow landed, in world space: the build reports it in the
  // figure's own coordinates, so it has to go through the stage group's
  // rotation before the camera can aim at it.
  const openAim = useMemo(() => {
    const point = build
      ? new THREE.Vector3(...build.breakOrigin)
      : IMPACT_FALLBACK.clone();

    point.applyEuler(new THREE.Euler(...STAGE_ROTATION));
    point.y += IMPACT_AIM_LIFT;

    return point;
  }, [build]);
  // Warm the pipeline as soon as the chunks are in. One frame compiles the
  // materials and uploads the geometry; the shadow map needs its own pass,
  // so draw a few across consecutive frames rather than all in one tick.
  useEffect(() => {
    if (!build) return undefined;
    let frames = 0;
    let raf = 0;
    const warm = () => {
      invalidate();
      if (++frames < 4) raf = requestAnimationFrame(warm);
    };
    raf = requestAnimationFrame(warm);
    return () => cancelAnimationFrame(raf);
  }, [build]);
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
      // Live while the panel is open. While it is closed this is "demand",
      // NOT "never": "never" draws literally nothing, so every shader
      // compile, geometry upload and shadow-map pass landed on the first
      // frame after the panel opened and the statue arrived late over a
      // box that had already started growing. On demand the stage still
      // draws once when it mounts and again whenever the scene graph
      // changes (the chunks arriving), which is the warm-up.
      frameloop={active ? "always" : "demand"}
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
        openAim={openAim}
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
  const reducedMotion = usePrefersReducedMotion();

  // Exposed so headless captures can read the scrubbed state.
  useEffect(() => {
    const debug = { camera: cameraProbe, progress: progressRef.current };
    (window as unknown as Record<string, unknown>).__thinkerStage = debug;
    return () => {
      delete (window as unknown as Record<string, unknown>).__thinkerStage;
    };
  }, []);

  useThinkerScrollProgress({ progressRef, reducedMotion, timing });

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: STAGE_BLACK }}>
      {/* The stage is not interactive: it takes no pointer or keyboard
          input, so it never swallows a scroll or a drag meant for the page. */}
      <div className="pointer-events-none absolute inset-0">
        <ThinkerCanvas
          active={active}
          progressRef={progressRef}
          reducedMotion={reducedMotion}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_0%,rgba(0,0,0,0.12)_42%,rgba(0,0,0,0.92)_100%)]" />
    </div>
  );
}
