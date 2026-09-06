"use client";

import { Canvas, invalidate, useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
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
import { addSeamAttribute, useMarbleMaterials } from "@/components/marbleSeams";
import { sceneFx } from "@/components/sceneFx";
import { DRIFT_FINISH } from "@/components/robotDrift";
// RobotOutro itself is deliberately not imported: it is no longer mounted
// here (see ThinkerCanvas). Its constants and its camera-state type still
// are, because the dormant chase branch in CameraRig is written against
// them and comes back with one line when the robot gets its own section.
import {
  createRobotCameraState,
  ROBOT_GROUND_Y,
  ROBOT_LENGTH,
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
 * On the frame the page's name has finished being shoved off the sides, the
 * shot CUTS round to 55 degrees off the figure's front and a little further
 * back, and holds there while the pieces keep streaming (see CUT_AZIMUTH).
 *
 * The robot outro (RobotOutro) used to take the page's last scroll room
 * from statueEnd on. It no longer runs here — it is being kept for a
 * section of its own — so the robot's phase is pinned to 0 and the statue
 * owns the whole panel.
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
  /**
   * 0..1 across the narration that plays over the held statue. The figure
   * puts itself back together against this, and the camera pans off it.
   */
  story: number;
  value: number;
}>;

/** The stage's stretch of the page, in scroll pixels; re-read on refresh. */
export type ThinkerTiming = () => {
  /** Scroll position at which the break begins. */
  breakAt: number;
  /** Scroll position at which the page's scroll ends. */
  end: number;
  /**
   * Scroll positions the reassembly runs between: from the frame the name
   * clears and the camera cuts, to the end of the narration.
   */
  storyEnd: number;
  storyStart: number;
  /** Scroll position at which the stage's progress starts (0). */
  start: number;
  /**
   * Scroll position at which the statue's progress reaches 1. The scroll
   * room from statueEnd to end is a hold on the shot the camera cut to.
   */
  statueEnd: number;
};
// Where the breakup ends, as a fraction of the stage's stretch (where it
// starts comes from the page, see ThinkerTiming).
//
// The break runs the whole way: it does not stop at the camera cut, it
// keeps opening through it and finishes as the panel reaches the full
// screen. The reverse starts there — see `story`, and `shown` in
// ChunkedThinker for how the return is made to replay this exactly.
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

// ---------------------------------------------------------------------------
// The cut.
//
// The moment the name has finished being shoved off the sides of the frame,
// the shot CUTS — one frame, no easing — round the figure and a little
// further back, and holds there for the rest of the page. Everything before
// it (the opening on the blow, the pull-out, the leftward orbit) is
// untouched.
//
// The angle is measured from the figure's FRONT, clockwise seen from above
// — 90 would be square onto its right shoulder — which is DECREASING
// azimuth here (azimuth is atan2(x, z), 0 = +z, and increasing azimuth
// turns counter-clockwise from above). The stage's yaw (THINKER_BASE_YAW)
// lands the figure's front on +z to within a couple of degrees, measured
// off the model itself, so the front is azimuth 0 and the shot is -55.
// It was -75 — a clean side profile; this is 20 degrees back toward the
// front of the figure.
//
// WHEN it fires is `sceneFx.textGone`, which the hero timeline tweens on
// exactly the word tweens' own start, duration and ease. Not the scroll
// position the exit maps to: the hero timeline is scrubbed (0.3), so under
// a real scroll the words lag the scroll by about a third of a second, and
// keyed off the scroll the cut landed with the last letter still on screen.
const CUT_AZIMUTH = -55 * (Math.PI / 180);
// Same height above the figure as the settled wide shot — only the angle
// around it and the distance change — so the cut reads as a move around the
// statue rather than a move up or down it.
const CUT_OFFSET = (() => {
  const flat = Math.hypot(CAMERA_OFFSET.x, CAMERA_OFFSET.z);
  return new THREE.Vector3(
    Math.sin(CUT_AZIMUTH) * flat,
    CAMERA_OFFSET.y,
    Math.cos(CUT_AZIMUTH) * flat,
  );
})();
// How much further out the cut sits than the shot it cuts from. A fifth.
// The name now clears in the last twentieth of the box's growth (the
// words ride the box's edges out, see HeroIntro), by which point the
// pull-out has all but settled, so the cut opens at about 6 rather than
// the 4.65 it did when the name raced the box and cleared at 59%.
//
// It is a MULTIPLIER on the pull-out, not a fixed distance, so the pull-out
// carries on running underneath the cut and the lens keeps opening to 6.1
// by the end. Frozen at 4.65 the shot ended on a wall of rubble: the pieces
// fly toward where the camera used to be, which from the side is off the right
// of frame, so they cross it and fill it. The same is true of the aim,
// which goes on easing to the figure's middle as it already did. The cut
// changes the angle around the figure and the distance. Nothing else.
const CUT_PULL_BACK = 1.2;
// How much of the cloud's drift the cut shot follows.
//
// From round the side the pieces cross the frame instead of coming at the
// lens. The
// old angle sat almost ON the flight axis — the camera direction and the
// flight direction are 16 degrees apart — so the cloud stayed centred while
// it streamed past; from the side it walks out of the right of frame and
// leaves half the picture empty. The aim (and with it the camera, which
// hangs off the aim) travels along the cloud's own mean offset instead, on
// the same travel curve the pieces use, so the shot dollies with them.
// 1 = dead centre on the cloud's mean; a little under keeps the figure's
// remains, which are behind the mean, in the frame too.
const CUT_AIM_FOLLOW = 0.85;

/**
 * How far the shot pans off the figure while the narration runs, as a
 * fraction of half the frame's width.
 *
 * A pan, not a truck: only the AIM moves, so the camera turns rather than
 * slides and the figure swings across the frame instead of the whole scene
 * sliding with it. Left, which puts the statue over on the right and leaves
 * the left of the screen — where the staircase sets — clear.
 *
 * A fraction rather than world units, because the frame is not always the
 * same width. A fixed 1.7 units is three quarters of the way across a
 * laptop and most of the way off a phone held upright.
 *
 * Zero now: the figure stays in the middle of the frame for the whole of
 * the narration, which is set centred over it (see HeroIntro) rather than
 * in a column beside it. It was 0.48 (and 0.57 before the orbit was
 * added), which put the statue over on the right to clear the left of the
 * screen for the staircase. The machinery is left in place for the day the
 * column comes back.
 */
const STORY_PAN = 0;
/**
 * And no pan at all on a portrait screen. There is no column beside the
 * figure to move it out of on a phone — the narration is full width there
 * — so moving it only loses the statue. The scrim carries legibility
 * instead (see the narration scrim in HeroIntro).
 */
const STORY_PAN_ASPECT = { full: 1.4, none: 0.95 };
/**
 * The rest of the shot's move while the figure comes back.
 *
 * The pan alone was the only thing happening, and a camera turning on the
 * spot reads as the subject sliding rather than as the camera going
 * anywhere. The orbit is what gives it somewhere to go.
 *
 * It turns BACK the way the breakup's orbit came: the swing before the cut
 * carries the eye round to the left (ORBIT_LEFT, decreasing azimuth, which
 * is clockwise seen from above), and the cut lands 55 degrees round that
 * way. Positive here is increasing azimuth — counter-clockwise from above
 * — so from the cut's three-quarter view the figure turns the other way as
 * it knits itself back together, toward its front rather than on round to
 * the profile. It was -32, the same way round as before the cut, then 38
 * the other way; this is 40% of that — a gentle turn rather than a swing,
 * enough that the figure is seen to move while it stays put in the frame.
 *
 * The distance barely moves, and outward at that. Closing in was the
 * obvious idea — the cloud contracts, so follow it — but it is wrong: the
 * distance the exploded cloud needed is roughly the distance the whole
 * figure needs, and pushing to 4.9 cropped its head and its feet. It only
 * has to open enough to fit a statue that is no longer in pieces.
 */
const STORY_ORBIT = 15.2 * (Math.PI / 180);
const STORY_DOLLY = 1.04;

/**
 * The reverse's ease, shared by the camera and the pieces so they cannot
 * disagree about how far along it is.
 *
 * Smootherstep, not smoothstep: its rate starts and ends at zero AND its
 * acceleration does too, so the figure does not lurch into motion the
 * moment the panel fills, and it settles into place rather than arriving.
 */
function storyEaseOf(story: number) {
  return smoothPhase(0, 1, story);
}

const FLOOR_Y = -1.6;
const STAGE_BLACK = "#0a0a0a";

// The hand-off to the robot was a CLIP, not a dissolve: on the frame the
// robot phase opened, the statue and everything lighting it were simply
// gone and the robot was simply there. `statueOn` is that switch, and
// RobotOutro's ROBOT_FADE_START is its other half. With the robot out of
// this sequence the phase never leaves 0, so this returns 1 for the whole
// page; it is left in place because it is the other half of putting the
// robot back.
const statueOn = (robotPhase: number) => (robotPhase > 0 ? 0 : 1);
const STATUE_FOV = 34;

/** Last frame's camera framing, read by headless captures. */
const cameraProbe: Record<string, unknown> = {};

/**
 * Outro camera keyframes, against seconds along the drift. Each is a list
 * of [time, value] read with `keyed`, which eases between them.
 */
const CAMERA_AZIMUTH: Array<[number, number]> = [
  // The entry PANS rather than holding. It used to sit at -45 for the whole
  // approach so the shot "opened on the move rather than swinging during
  // it", but a static frame for the first quarter of the run reads as a
  // still, not an opening — the robot simply drives across it. Sweeping
  // through the collection leg gives the camera somewhere to have come
  // from, and it still only ever increases, so nothing doubles back.
  [0, -78],
  [1.5, -40],
  // ...and from there it only ever INCREASES — counter-clockwise seen from
  // above — so the camera sweeps one way from the first frame of the drift
  // to the last and never doubles back. The robot itself turns a full
  // circle over the same stretch and this angle is measured against its
  // nose, so the two rotations compound instead of cancelling.
  [2.9, -6],
  [4.6, 24],
  [5.9, 50],
  // +90 as the robot parks: off its left, which puts the goal (off its
  // rear) on the right of frame.
  [7.4, 90],
  // And it keeps going, gently, while the balls unload. These keys used to
  // stop at 7.4 and `keyed` clamps past its last key, so the whole
  // settling shot — a third of the playhead — was one frozen frame. A
  // little more orbit, a little further back and higher, and the aim
  // walking down the goal below give it something to do.
  [11.50, 112],
];

const CAMERA_DISTANCE_KEYS: Array<[number, number]> = [
  // Opens wide and pushes in over the collection leg, so the pan above has
  // some parallax under it rather than being a bare rotation.
  [0, 5.7],
  [1.5, 4.5],
  [3.6, 5.2],
  [5.2, 6.0],
  [6.4, 7.2],
  [7.4, 8.8],
  [11.50, 10.0],
];
const CAMERA_HEIGHT_KEYS: Array<[number, number]> = [
  // Down at the level of the drivetrain, looking up at the robot — the
  // angle a trackside racing camera sits at, where the car fills the frame
  // against the sky rather than being looked down on.
  [0, 0.52],
  [1.5, 0.3],
  [3.6, 0.42],
  // Only at the very end does it climb, for the wide shot that has to hold
  // the goal and the scored balls as well.
  [6.4, 1.4],
  [7.4, 3.0],
  [11.50, 3.8],
];

/**
 * How far behind the robot the camera aims, model units. Past the park this
 * walks on down the goal's length as the balls fill it, so the frame pans
 * along the row rather than sitting still on the robot.
 */
const CAMERA_AIM_BEHIND_KEYS: Array<[number, number]> = [
  [0, 0],
  [5.2, 0.4],
  [6.4, 1.1],
  [7.4, 2.0],
  // Not past the goal's far end: the aim is what the frame centres on, and
  // walking it the goal's whole 5.7 length shoved the robot into the left
  // edge with two thirds of the picture empty floor. Half way down it is.
  [11.50, 3.4],
];

/**
 * Height the camera aims at, model units above the floor. Low and slightly
 * ABOVE the lens for most of the run, which is what tilts the shot upward.
 */
/**
 * Where the camera stops orbiting WITH the robot and parks in the world.
 *
 * Everything above is measured against the robot's own nose, which is right
 * for the drift — the framing follows the car. It is wrong the moment the
 * robot turns its last half-circle into the goal: the camera was dragged
 * round with it, swinging a third of the way about the field to hold the
 * same relative angle, when what the shot wants is to stand still and let
 * the robot turn in front of it. From PARK_FROM to PARK_BY the offset eases
 * off the robot's frame and onto a fixed one, and it is fixed from there to
 * the end. In run seconds — the robot phase spans 236..347vh of scroll over
 * about 11.4 of them, so one run second is roughly 9.7vh — a little over a
 * tenth of a second per vh. From the original 4.0/5.2 these went 20vh
 * earlier, then 10vh back, then 5vh back again: the camera holds the robot's
 * frame through more of the turn before it goes stale.
 */
const CAMERA_PARK_FROM = 3.4;
const CAMERA_PARK_BY = 4.6;
/**
 * The parked camera's direction from the robot, as a world angle (the same
 * convention as everything else here: 0 = +z, +90 = +x).
 *
 * Square to the robot's ACTUAL finish heading, not to the ideal one. The
 * drift does not land perfectly on its heading target — carrying speed
 * through the last turn buys the slide at the cost of a few degrees of
 * squareness — and a hardcoded -90 measured 4 degrees off perpendicular
 * because of it. Reading the finish out of the drift itself keeps the shot
 * exactly square through any retune of the run.
 *
 * +90 off the nose is the side that puts the goal on the right of frame;
 * -90, the other square angle, looks across the robot from the far side.
 */
const CAMERA_PARK_AZIMUTH = DRIFT_FINISH.heading + Math.PI / 2;
const CAMERA_PARK_DISTANCE = 5.0;
/**
 * Where the parked camera stands, in the world.
 *
 * The orbit centre eases off the live robot and onto this, so once parked
 * the camera is a fixed spot on the floor that PANS to follow the robot in,
 * rather than a rig riding along with it. Riding it kept the robot pinned
 * dead centre of frame the whole way — locked on, not a camera. Standing
 * still and panning is what a trackside rally camera does: the car crosses
 * the frame and settles in it.
 *
 * The drift reports its finish in robot lengths; the stage is in stage
 * units, 1.6 of them to a length.
 */
const PARK_CENTRE_X = DRIFT_FINISH.position[0] * ROBOT_LENGTH;
const PARK_CENTRE_Z = DRIFT_FINISH.position[1] * ROBOT_LENGTH;
/**
 * The height the robot actually scores at: its indexer, which is where
 * RobotOutro lifts the balls from before they lob into the mouth
 * (ROBOT_LENGTH * 0.4 off the floor). The parked camera sits at exactly
 * this, and aims at exactly this, so the final shot is dead level with the
 * scoring line rather than looking down on it.
 */
const CAMERA_SCORING_HEIGHT = ROBOT_LENGTH * 0.4;
/**
 * A little above that. Sitting exactly on the scoring line put the lens too
 * low in the shot; this lifts it without tilting anything, because the aim
 * is raised by the same amount — the shot stays dead level and square, it
 * just sits higher on the robot.
 */
const CAMERA_PARK_LIFT = 0.35;

const CAMERA_AIM_HEIGHT: Array<[number, number]> = [
  [0, 0.62],
  [3.6, 0.7],
  [7.4, 0.9],
  [11.50, 1.1],
];

/**
 * Value at `at` along a list of [time, value] keys, interpolated so the
 * RATE is continuous across the whole list.
 *
 * This used to smoothstep each segment independently, which looks fine on
 * one segment and ripples badly on a chain of them: smoothstep's slope is
 * zero at both ends, so the value stops dead at every key and sprints
 * through the middle of every gap. On the outro camera — six keys of
 * azimuth, four of distance, four of height, all read every frame — that
 * put a stall in the shot at each key time and a rush between them, which
 * is a large part of why the section did not scroll evenly.
 *
 * Fritsch-Carlson monotone cubic instead: each key gets a tangent averaged
 * from the segments either side, limited so the curve cannot overshoot
 * between two keys. Continuous rate, no ripple, and still no wandering
 * outside the values given — which matters, because these keys are angles
 * and distances that must not run past their endpoints.
 */
function keyed(keys: Array<[number, number]>, at: number) {
  if (at <= keys[0][0]) return keys[0][1];
  const last = keys.length - 1;
  if (at >= keys[last][0]) return keys[last][1];
  let i = 0;
  while (i < last - 1 && at > keys[i + 1][0]) i += 1;
  const [t0, v0] = keys[i];
  const [t1, v1] = keys[i + 1];
  const h = Math.max(t1 - t0, 1e-6);
  const slope = (index: number) => {
    const a = keys[index];
    const b = keys[index + 1];
    return (b[1] - a[1]) / Math.max(b[0] - a[0], 1e-6);
  };
  const d = slope(i);
  // A key's tangent is the mean of the segments meeting there, so the rate
  // carries across it; at the ends there is only one segment to follow.
  const rawStart = i === 0 ? d : (slope(i - 1) + d) / 2;
  const rawEnd = i + 1 === last ? d : (d + slope(i + 1)) / 2;
  // Fritsch-Carlson: a flat segment pins both tangents flat, and otherwise
  // neither may exceed three times the segment's own slope. Without this a
  // steep neighbour can bend this segment past v0 or v1.
  let m0 = rawStart;
  let m1 = rawEnd;
  if (d === 0) {
    m0 = 0;
    m1 = 0;
  } else {
    m0 = Math.max(-3 * Math.abs(d), Math.min(3 * Math.abs(d), m0 * Math.sign(d) < 0 ? 0 : m0));
    m1 = Math.max(-3 * Math.abs(d), Math.min(3 * Math.abs(d), m1 * Math.sign(d) < 0 ? 0 : m1));
  }
  const x = THREE.MathUtils.clamp((at - t0) / h, 0, 1);
  const x2 = x * x;
  const x3 = x2 * x;
  return (
    (2 * x3 - 3 * x2 + 1) * v0 +
    (x3 - 2 * x2 + x) * h * m0 +
    (-2 * x3 + 3 * x2) * v1 +
    (x3 - x2) * h * m1
  );
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
    ScrollTrigger.addEventListener("refresh", readBreakStart);
    // Marker mode (see DebugMarkers) holds the figure whole. Reduced motion
    // keeps the statue standing on the settled wide shot and never cuts.
    if (reducedMotion || window.location.search.includes("thinkerMarkers")) {
      return () => ScrollTrigger.removeEventListener("refresh", readBreakStart);
    }
    // NOTE: the two progress values are NOT scrubbed GSAP tweens any more.
    // They were, with `ease: "none"` — a straight line from the scroll
    // position, routed through a tween that ScrollTrigger drove on its own
    // animation-frame callback. Straight lines do not need a tween, and
    // that callback is not the one the canvas draws on: measured under
    // steady wheel input, 76 of 315 frames drew a progress value the scroll
    // had already moved past, so the picture held still for a frame and
    // then covered two frames of ground. `ScrollSync` computes the same two
    // numbers inside the render loop instead, from the same layout
    // ScrollTrigger would have used.
    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 250);
    return () => {
      window.clearTimeout(refresh);
      ScrollTrigger.removeEventListener("refresh", readBreakStart);
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

/**
 * Turns the page's scroll position into the stage's two progress values,
 * inside the render loop.
 *
 * This is the fix for the jitter. Lenis eases the scroll on one
 * animation-frame callback, GSAP computed the scrubbed values on another,
 * and the canvas draws on a third; nothing orders the three. Measured under
 * steady wheel input, 76 of 315 frames drew a progress value the scroll had
 * already moved past — the picture held still for a frame and then covered
 * two frames of ground, a quarter of the time. Afterwards: 0 of 285, with
 * the progress tracking Lenis's own scroll to the digit.
 *
 * Computing it in the same callback that draws it makes staleness
 * impossible. Both maps are straight lines, which is all the scrubbed
 * tweens were (`ease: "none"`), so nothing about the motion changes.
 *
 * Registered first in the scene, and R3F runs same-priority frame callbacks
 * in mount order, so it goes ahead of the robot, the camera and the
 * fracture.
 */
function ScrollSync({
  progressRef,
  reducedMotion,
  timing,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
  timing: ThinkerTiming;
}) {
  // ScrollTrigger still measures the page — it is good at that, and it
  // re-measures on resize, on font and image load, and on demand. What it
  // no longer does is hand the value over: these two triggers animate
  // nothing, they exist so that `.start` and `.end` are always the right
  // pixel positions. Caching those numbers by hand instead was wrong in a
  // way worth remembering: read once at mount, they were taken before the
  // page's spacers had their real heights, and the robot's progress sat at
  // 1 from the top of the page.
  const bounds = useRef<{ statue: ScrollTrigger | null }>({ statue: null });
  const story = useRef({ end: 1, start: 0 });
  useEffect(() => {
    const read = () => {
      const { storyEnd, storyStart } = timing();
      story.current = { end: storyEnd, start: storyStart };
    };
    read();
    ScrollTrigger.addEventListener("refresh", read);
    return () => ScrollTrigger.removeEventListener("refresh", read);
  }, [timing]);
  useEffect(() => {
    const statue = ScrollTrigger.create({
      end: () => timing().statueEnd,
      invalidateOnRefresh: true,
      start: () => timing().start,
    });
    bounds.current = { statue };
    return () => {
      statue.kill();
      bounds.current = { statue: null };
    };
  }, [timing]);

  const read = useCallback(() => {
    if (reducedMotion) return;
    const { statue } = bounds.current;
    if (!statue) return;
    // Lenis's own scroll in preference to `window.scrollY`: the browser
    // rounds the applied position to whole pixels, and Lenis knows the
    // fractional one it is heading for.
    const lenis = (window as unknown as { __lenis?: { scroll: number } }).__lenis;
    const y = lenis ? lenis.scroll : window.scrollY;
    progressRef.current.value = THREE.MathUtils.clamp(
      (y - statue.start) / Math.max(statue.end - statue.start, 1),
      0,
      1,
    );
    // The robot outro is no longer part of this sequence — it is being kept
    // for a section of its own — so its phase never leaves 0, which is what
    // holds the statue, its lights and its floor on (see `statueOn`) and
    // keeps CameraRig on the statue's camera for the whole page.
    progressRef.current.robot = 0;
    progressRef.current.story = THREE.MathUtils.clamp(
      (y - story.current.start) /
        Math.max(story.current.end - story.current.start, 1),
      0,
      1,
    );
  }, [progressRef, reducedMotion]);

  // The one that matters: same callback that draws, so a frame can only
  // ever show where the page is now.
  useFrame(read);

  // And again off gsap's ticker, because the canvas stops rendering
  // entirely while the panel holding it is shut (`frameloop` is "demand"
  // then) and these two would otherwise freeze at whatever they were when
  // it went quiet. Nothing but the canvas reads them, so that was invisible
  // — but it is a trap for the next thing that does. Both calls are the
  // same pure function of the scroll, so it does not matter which ran last.
  // (RobotOutro's own playhead still stops with the canvas; it is derived
  // from these and catches up on the first frame drawn.)
  useEffect(() => {
    gsap.ticker.add(read);
    return () => gsap.ticker.remove(read);
  }, [read]);
  return null;
}

function CameraRig({
  cloudDrift,
  openAim,
  progressRef,
  reducedMotion,
  robotState,
}: {
  /**
   * Where the cloud's centre ends up, in world space: the mean of the
   * chunks' full offsets, which the cut shot follows.
   */
  cloudDrift: THREE.Vector3;
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
  // Nor may the cut: the same 0.08 lerp would slide the lens round to the
  // new angle over about a third of a second, which is a whip pan, not a
  // cut. This remembers which side of the exit the last frame was on, so
  // the frame that crosses it snaps — in either direction, so scrolling
  // back up cuts back just as sharply.
  const cutRef = useRef(false);

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

    // The cut. Once the name is off the sides of the frame the camera is
    // 55 degrees round from the figure's front and a fifth further out, and
    // stays there to the bottom of the stage. Nothing above is skipped: every frame up to this
    // scroll position plays exactly as it did, and the swing and the orbit
    // this replaces are still what get it there.
    const cut = !reducedMotion && sceneFx.textGone >= 1;
    // How far through the reverse the page is. The figure reassembles
    // against this (see ChunkedThinker) and the shot keeps moving on it.
    const story = reducedMotion ? 0 : progressRef.current.story;
    const settled = storyEaseOf(story);
    const shotDistance = cut
      ? distance * CUT_PULL_BACK * THREE.MathUtils.lerp(1, STORY_DOLLY, settled)
      : distance;
    if (cut) {
      // The follow unwinds with the cloud it was following: as the pieces
      // come home there is nothing out there left to lead the frame toward.
      lookAt.addScaledVector(
        cloudDrift,
        CUT_AIM_FOLLOW * travelAt(breakup) * (1 - settled),
      );
      // Orbiting again, back the other way from the breakup's swing.
      scratch.offset
        .copy(CUT_OFFSET)
        .applyAxisAngle(UP, STORY_ORBIT * settled)
        .multiplyScalar(shotDistance);
      target.copy(scratch.offset).add(lookAt);
    }

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
        const sway = shotDistance * 0.016;
        target.x += Math.sin(clock.elapsedTime * 0.18) * sway;
        target.y += Math.sin(clock.elapsedTime * 0.13 + 1.1) * sway * 0.6;
      }
      const crossed = cut !== cutRef.current;
      cutRef.current = cut;
      if (opened.current && !crossed) camera.position.lerp(target, 0.08);
      else {
        opened.current = true;
        camera.position.copy(target);
      }
      // The pan. Applied to the AIM only, and after the position is fixed,
      // so the camera turns on the spot. Shifting the look-at before the
      // position is derived from it would have moved both together, which
      // keeps the subject dead centre and pans nothing.
      if (settled > 0.001 && persp.isPerspectiveCamera) {
        const aspect = persp.aspect;
        const wide = THREE.MathUtils.clamp(
          (aspect - STORY_PAN_ASPECT.none) /
            (STORY_PAN_ASPECT.full - STORY_PAN_ASPECT.none),
          0,
          1,
        );
        if (wide > 0) {
          const halfWidth =
            shotDistance * Math.tan((persp.fov * Math.PI) / 360) * aspect;
          scratch.forward.copy(lookAt).sub(camera.position).normalize();
          scratch.offset.crossVectors(scratch.forward, UP).normalize();
          lookAt.addScaledVector(
            scratch.offset,
            -halfWidth * STORY_PAN * settled * wide,
          );
        }
      }
      camera.lookAt(lookAt);
      // Same probe the chase used to fill in, so a headless capture can read
      // the statue's framing too — `azimuth` in degrees, on the convention
      // the cut is written in (0 = +z, and the figure's front is +z).
      cameraProbe.camera = camera.position.toArray();
      cameraProbe.look = lookAt.toArray();
      cameraProbe.cut = cut;
      cameraProbe.azimuth =
        Math.atan2(camera.position.x - lookAt.x, camera.position.z - lookAt.z) *
        (180 / Math.PI);
      cameraProbe.distance = camera.position.distanceTo(lookAt);
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
    // How far the camera has come off the robot's frame and onto the fixed
    // one. This has to travel round the robot, not across it: lerping the
    // two OFFSET VECTORS cut the chord between them, and they end up very
    // nearly opposite, so the straight line passed within a few centimetres
    // of the robot's centre — the lens went through the machine. Sweeping
    // the ANGLE and easing the RADIUS separately keeps the camera a full
    // orbit-radius out the whole way round.
    //
    // The sweep is wrapped to the shorter way round rather than taken as a
    // raw difference: `side` is the robot's own heading plus the azimuth
    // key, and both wind past a full turn, so the raw number would send the
    // camera several times around the field.
    const parked = smoothPhase(CAMERA_PARK_FROM, CAMERA_PARK_BY, runAt);
    const toPark = CAMERA_PARK_AZIMUTH - side;
    const sweep = Math.atan2(Math.sin(toPark), Math.cos(toPark));
    const swung = side + sweep * parked;
    const radius = THREE.MathUtils.lerp(orbit, CAMERA_PARK_DISTANCE, parked);
    // The orbit centre itself eases from the robot onto the fixed spot, so
    // the camera stops travelling with it and starts panning after it.
    const centreX = THREE.MathUtils.lerp(robotState.anchorPosition.x, PARK_CENTRE_X, parked);
    const centreZ = THREE.MathUtils.lerp(robotState.anchorPosition.z, PARK_CENTRE_Z, parked);
    chase.position.set(
      centreX + Math.sin(swung) * radius,
      ROBOT_GROUND_Y +
        THREE.MathUtils.lerp(lift, CAMERA_SCORING_HEIGHT + CAMERA_PARK_LIFT, parked),
      centreZ + Math.cos(swung) * radius,
    );
    // Aim at the robot, easing back toward its tail once it is parked so
    // the goal it has just filled shares the frame — but that walk-back and
    // the raised aim both ease out again as the camera parks, so the last
    // shot is square on the robot at the height it scores from.
    const behind = keyed(CAMERA_AIM_BEHIND_KEYS, runAt) * (1 - parked);
    chase.lookPosition.set(
      robotState.anchorPosition.x - Math.sin(robotState.anchorHeading) * behind,
      ROBOT_GROUND_Y +
        THREE.MathUtils.lerp(
          keyed(CAMERA_AIM_HEIGHT, runAt),
          CAMERA_SCORING_HEIGHT + CAMERA_PARK_LIFT,
          parked,
        ),
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
    cameraProbe.heading = robotState.heading;
    cameraProbe.runTime = robotState.runTime;
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
  // One surface and one cut-face material for all the chunks; the surface
  // one draws the glue seams from each chunk's `seam` attribute.
  const marble = useMarbleMaterials();
  const chunks = useMemo(
    () =>
      build.chunks.map((chunk) => {
        const geometries = makeChunkGeometries(chunk);
        addSeamAttribute(geometries.surfaceGeometry, geometries.interiorGeometry);
        return {
          ...geometries,
          center: new THREE.Vector3(...chunk.center),
          offset: new THREE.Vector3(...chunk.offset),
          releaseAt: chunk.releaseAt,
          scale: chunk.scale,
          spin: new THREE.Vector3(...chunk.spin),
          travelWindow: chunk.travel,
        };
      }),
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
    const story = reducedMotion ? 0 : progressRef.current.story;
    const storyEase = storyEaseOf(story);

    // The exact reverse.
    //
    // Not a shrink: scaling every piece's travel toward zero brings them
    // all home together, which is not what taking a break backwards looks
    // like. The break has an ORDER — each chunk has its own `releaseAt` and
    // its own window, so the hand goes first and the base last — and the
    // reverse of that is the base arriving first and the hand last.
    //
    // Running the same parameter backwards gets all of it for free. Every
    // piece's position is a function of this one number; drive it from 1
    // down to 0 and each chunk retraces its own flight, in reverse order,
    // spinning and growing back exactly the way it left.
    const shown = Math.min(breakup, 1 - storyEase);
    // The last few percent of spread unwinds with it.
    const settled = settle * (1 - storyEase);

    // The robot outro takes the stage: over its first stretch the chunks'
    // materials (surface and interior alike) fade to nothing; scrolling
    // back up restores them to their opaque selves.
    const robotPhase = reducedMotion ? 0 : progressRef.current.robot;
    const statueFade = statueOn(robotPhase);
    if (statueFade !== appliedFadeRef.current) {
      const wasFading = appliedFadeRef.current < 1;
      appliedFadeRef.current = statueFade;
      const fading = statueFade < 1;
      for (const material of [marble.surface, marble.interior]) {
        material.opacity = statueFade;
        material.transparent = fading;
        // `transparent` is baked into the compiled program (an opaque one
        // writes alpha 1 whatever the opacity), so a flip needs a rebuild.
        if (fading !== wasFading) material.needsUpdate = true;
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
      // has released, then carries on the same way. `shown` rather than
      // `breakup`, so this same line plays the flight forwards and back.
      const localProgress = Math.max(
        (shown - chunk.releaseAt) / Math.max(chunk.travelWindow, 0.01),
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
      const travel = (travelAt(localProgress) + adrift) * (1 + settled * 0.06);
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
      // The stage's own drift rides the same number, so a reassembled
      // figure stands at exactly the rotation it was carved at.
      const spread = travelAt(shown);
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
          <mesh
            castShadow
            frustumCulled={false}
            geometry={chunk.surfaceGeometry}
            material={marble.surface}
          />
          <mesh
            frustumCulled={false}
            geometry={chunk.interiorGeometry}
            material={marble.interior}
          />
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
    // Same reversed parameter the chunks ride, so the shadow comes back
    // under the figure as the figure comes back.
    const story = reducedMotion ? 0 : progressRef.current.story;
    const storyEase = storyEaseOf(story);
    const spread = reducedMotion
      ? 0
      : travelAt(Math.min(breakupAt(progressRef.current), 1 - storyEase));
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
  timing,
}: {
  active: boolean;
  progressRef: ProgressRef;
  reducedMotion: boolean;
  timing: ThinkerTiming;
}) {
  const build = useThinkerChunks();
  // RobotOutro used to write this every frame for CameraRig's chase. With
  // the robot unmounted nothing writes it and nothing reads it — the chase
  // branch is behind a `robot > 0` test that can no longer be true — but it
  // is still what CameraRig is typed on, so it stays.
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
  // Where the cloud ends up, in world space. The build reports the mean of
  // the chunks' offsets in the figure's own coordinates, so it goes through
  // the stage group's rotation like the blow does.
  const cloudDrift = useMemo(() => {
    const drift = build ? new THREE.Vector3(...build.drift) : new THREE.Vector3();

    return drift.applyEuler(new THREE.Euler(...STAGE_ROTATION));
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
      <ScrollSync
        progressRef={progressRef}
        reducedMotion={reducedMotion}
        timing={timing}
      />
      <color args={[STAGE_BLACK]} attach="background" />
      <fog args={[STAGE_BLACK, CAMERA_DISTANCE + 0.8, CAMERA_DISTANCE + 5.2]} attach="fog" />
      {/* The robot outro is NOT mounted. It is being saved for a section of
          its own, so nothing here fetches its model or drives its drift;
          `progressRef.robot` is pinned to 0 (see ScrollSync), which leaves
          CameraRig on the statue's camera and the statue's lights on for
          the whole page. Putting it back is this line plus that pin —
          RobotOutro and the chase branch below are untouched. */}
      <CameraRig
        cloudDrift={cloudDrift}
        openAim={openAim}
        progressRef={progressRef}
        reducedMotion={reducedMotion}
        robotState={robotState}
      />
      <StageLights progressRef={progressRef} reducedMotion={reducedMotion} />
      <StageFloor progressRef={progressRef} reducedMotion={reducedMotion} />
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
  const progressRef = useRef({ breakStart: 0.05, robot: 0, story: 0, value: 0 });
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
          timing={timing}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_0%,rgba(0,0,0,0.12)_42%,rgba(0,0,0,0.92)_100%)]" />
    </div>
  );
}
