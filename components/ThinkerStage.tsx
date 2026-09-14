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
  CAMERA_DISTANCE_CLOSE,
  CAMERA_OFFSET,
  CAMERA_OFFSET_CLOSE,
  IMPACT_AIM_LIFT,
  OPENING_AIM_POINT,
  loadThinkerChunks,
  THINKER_BASE_YAW,
} from "@/components/thinkerChunks";
import { CHERRY_BASE_YAW, CUT_TO_TREE, loadCherryChunks } from "@/components/cherryChunks";
import {
  makeChunkGeometries,
  type ThinkerChunkBuild,
} from "@/components/thinkerFragments";
import { useMarbleMaterials } from "@/components/marbleMaterials";
import {
  createPetalGeometry,
  createPetalMaterial,
  paintPetals,
  planPetals,
  updatePetals,
} from "@/components/treePetals";
import { sceneFx } from "@/components/sceneFx";
// The panel-growth fractions this stage and the hero timeline share live in
// a leaf module, so HeroIntro can read them without pulling this chunk
// (three, r3f) in to do it. Only BREAK_END is used here by name; STAGE_CUT_AT
// and TREE_BREAK are referenced in the comments below and read off sceneFx.
import { BREAK_END } from "@/components/stageCues";
// Nothing of the robot's is imported but these: RobotOutro is no longer
// mounted here (see ThinkerCanvas), and the dormant chase branch in
// CameraRig, written against its camera state and its parked finish, reads
// them from robotConstants so that neither the outro (RoomEnvironment, a
// lazy chunk per module under components/) nor the drift simulation rides
// into the home page's bundle. The branch comes back with one line when
// the robot gets its own section.
import {
  createRobotCameraState,
  DRIFT_FINISH,
  ROBOT_GROUND_Y,
  ROBOT_LENGTH,
  type RobotCameraState,
} from "@/components/robotConstants";

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
 * On the frame the panel is 60% grown, the shot CUTS — and the statue goes
 * with it. The tree from the intro (its upper trunk and boughs, in the
 * same marble; see cherryChunks) stands whole on the stage from that frame,
 * seen from 55 degrees off its front, and breaks the same way the statue
 * did over the rest of the panel's growth (see CUT_AZIMUTH and TREE_CUT_AT).
 * Neither figure comes back together: the pieces stream on for as long as
 * the page scrolls. Should the tree fail to build, the cut still fires and
 * the statue keeps the stage.
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
// The break runs the whole way: over the panel's growth and on under the
// narration, finishing as the black shuts (the page hands the stage that
// whole stretch, see HeroIntro's thinkerTiming). There is no reverse —
// `story` still runs from the break's end to the narration's, but only
// the camera reads it, and only after a cut (CUT_TO_TREE, off); the
// pieces stay gone.

// Camera distance to what it looks at: at rest, close on the upper two
// thirds of the figure; over the breakup it eases slightly closer while
// dollying to the left (on the scroll, not the pieces' easing), letting
// the debris stream past the frame's edge, as on lukebaffait.fr.
// The pull-out from the opening shot (CAMERA_DISTANCE_CLOSE, 2.2) ends
// here. It was 4.6 / 5.68 (four fifths of an earlier 5.1 / 6.3); asked
// to zoom out more, it opens to 6.2 / 7.4 from a closer start. (A 150%
// version, 10.6 / 12.7, was tried and reverted.)
const CAMERA_DISTANCE = 5.0;
const CAMERA_DISTANCE_BROKEN = 6.2;
const CAMERA_DISTANCE_COMPACT_BROKEN = 7.4;
// The shot OPENS on the blow — the hand, the nearest part of the figure to
// the lens — and pulls out from there. It used to follow the build's own
// `breakOrigin`, which was the same point; the fracture's grading point
// has since moved up to the shoulder where the break starts, and the shot
// must NOT follow it there, because lifted by IMPACT_AIM_LIFT the aim
// would land above the head. So the aim is OPENING_AIM_POINT, beside the
// flight direction in thinkerChunks.
// The opening shot's offset, distance and aim lift live in thinkerChunks,
// beside the flight direction: the break's order is measured from that
// same eye, so the two cannot drift apart.
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
// How far the camera swings around the figure over the breakup (radians
// about the vertical, negative = around to the left), aim staying put.
// The swing rides the RAW breakup while the zoom rides its smoothstep, so
// the orbit keeps drifting after the pull-out has settled. Four fifths of
// the -1.0 / -0.7 they were, with the rest of the camera's move; then 15%
// back up (-0.8 / -0.56 before) when asked for slightly more camera
// movement, see CAMERA_ROLL.
const ORBIT_LEFT = -0.92;
const ORBIT_LEFT_COMPACT = -0.64;
// A slow roll of the lens over the break, peaking at CAMERA_ROLL radians at
// ROLL_PEAK_AT of the breakup and easing back out by twice that.
//
// After lukebaffait.fr, measured off its 341 frames. Its camera never shakes
// (frame-to-frame jitter about a 9-frame mean of 0.06 px at 1920 wide) and
// never holds still either. Its first shot, close on the arm (frames 1-102),
// pulls back about 26% and turns the picture about 5 degrees (tracking is
// poor on bare marble, so those two are rough); its long shot (frames
// 104-341) pushes in 6.6%, drifts 13% of the frame's width and rolls up to
// 1.4 degrees by frame 248, easing in (0.1 degrees a third of the way there,
// 0.6 halfway), then eases back. Ours over the visible break, measured the
// same way (a similarity fit to the tracked frame, v 0 to 0.35): a 30%
// pull-out, the centre drifting 14% of the width and the figure turning 6.9
// degrees in frame, all of it from the orbit; the lens itself never rolled.
// With this and ORBIT_LEFT 15% wider, over two captures: a 27-29% pull-out,
// 15-16% drift, 10.5-12 degrees of turn. The same shot, moving a little more. The peak sits where
// the statue stops being drawn (breakup ~0.34), so the visible break is the
// reference's ease-in; sin² gives that shape and returns to level by 0.7.
// This way round (content turning counter-clockwise) adds to the turn the
// orbit already gives the figure rather than undoing it.
const CAMERA_ROLL = -1.5 * (Math.PI / 180);
const ROLL_PEAK_AT = 0.35;

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
// WHEN it fires is `sceneFx.stageCut`, which the hero timeline tweens on
// the panel's own growth tween: the same start and ease, over the first 60%
// of it, so it reaches 1 on the frame the box is seen at 60%. Not the
// scroll position that maps to: the hero timeline is scrubbed (0.3), so
// under a real scroll the box lags the scroll by about a third of a second,
// and keyed off the scroll the cut would land before the box got there.
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

// ---------------------------------------------------------------------------
// The tree.
//
// On the cut the statue is gone and the intro's cherry tree stands on the
// stage in its place — whole, its cut-flat base on the floor, in the same
// marble — and breaks from there over the rest of the panel's growth. Its
// pieces fly the way the statue's did (the same world direction, see
// cherryChunks) and the shot follows them the same way.
//
// The tree stands turned to the cut's angle so the side the intro showed
// faces the lens; no lean, its base is flat on the floor.
const TREE_ROTATION: [number, number, number] = [0, CHERRY_BASE_YAW, 0];
// How far back the cut shot sits from the tree: the distance at which the
// tree's bounding box (its height, or its widest plan extent on a narrow
// screen, plus that extent again for depth) would just fit the frame,
// times this. 0.92 reproduces the statue's own cut distance (6.12) from the
// statue's box; on the real tree that left it small — its plan is wide
// (3.1 by 2.7 of its 2.1 height) so the fit is width-bound and the depth
// allowance, the plan's diagonal again, is generous for a crown that is
// mostly air. 0.75 brings the lens in by a fifth: measured at the cut, the
// whole tree spanned 56% of the frame's width at 0.92, and the aim is to
// have the boughs' tips near the edges as the statue's shoulders were.
const TREE_FRAME_FILL = 0.75;
// The aim, a little above the tree's centre, as a fraction of its height:
// the boughs are the wide, bright part and the trunk below them is narrow,
// so dead centre leaves the crown crowding the top of the frame.
const TREE_AIM_LIFT = 0.04;

/**
 * Where the tree stands and how it is framed, worked out once from its
 * build (see `treeShotOf`). Everything in WORLD space, after the tree's
 * rotation and its placement on the floor.
 */
type TreeShot = {
  /** What the cut shot looks at. */
  aim: THREE.Vector3;
  /** Where the cloud's centre ends up, for the follow. */
  drift: THREE.Vector3;
  /** Half the tree's height and half its widest plan extent. */
  halfHeight: number;
  halfWidth: number;
  /** How far the tree's group origin sits above its flat base. */
  baseLift: number;
};

// How far through the tree's break the page is, 0..1: the hero timeline's
// own number (see TREE_BREAK), on the cut's clock.
function treeBreakupAt() {
  return THREE.MathUtils.clamp(sceneFx.treeBreak, 0, 1);
}

// The stage is drawn a little smaller on a narrow screen. One place for
// the number, because the tree's placement and its framing both have to
// agree with the group's scale (its base sits on the floor only if the
// two are worked out in the same units).
function stageScaleOf(width: number) {
  return width < 720 ? 0.92 : 1;
}

type Figure = "statue" | "tree";

// Which figure is on the stage this frame. The tree from the cut on — if
// there is one: with no tree built (its model missing, its build failed)
// the statue keeps the stage and the cut is only the camera's.
function figureAt(reducedMotion: boolean, treeReady: boolean): Figure {
  const cut = CUT_TO_TREE && !reducedMotion && sceneFx.stageCut >= 1;

  return cut && treeReady ? "tree" : "statue";
}

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
 * The story's ease, for the camera's orbit and dolly over the narration.
 * It used to be shared with the pieces' reverse, which is gone.
 *
 * Smootherstep, not smoothstep: its rate starts and ends at zero AND its
 * acceleration does too, so the shot does not lurch into motion the moment
 * the panel fills, and it settles rather than arriving.
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
// The stage's renderer, for the frame count `window.__thinkerStage` reports.
const stageProbe: { renderer: THREE.WebGLRenderer | null } = { renderer: null };

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
// they never hang still in the air when the scroll rests. Halved with the
// flight (TRAVEL_WINDOW): the pieces go at half the pace they did.
const DRIFT_PER_SECOND = 0.008;
// A released piece keeps rolling with time in the air: this much `turn` per
// second on top of the turn its travel buys, up to ROLL_LIMIT. See the
// tumble note in the chunk loop for the measurement that set them.
const ROLL_PER_SECOND = 0.3;
const ROLL_LIMIT = 2;

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

// One figure's chunks, from the page-wide build (see thinkerChunks, which
// logs a failure once; here a failed figure is simply one that never
// arrives).
/** A build that never comes: what the tree's slot gets while the cut is off. */
const loadNoTree = () => new Promise<ThinkerChunkBuild>(() => undefined);

function useChunkBuild(load: () => Promise<ThinkerChunkBuild>) {
  const [build, setBuild] = useState<ThinkerChunkBuild | null>(null);
  useEffect(() => {
    let active = true;
    load()
      .then((next) => {
        if (active) {
          setBuild(next);
          ScrollTrigger.refresh();
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [load]);
  return build;
}

/**
 * Where the tree stands and how the cut frames it, from its build: the
 * bounding box of every chunk at rest (the tree whole), in the tree's own
 * space, then through its rotation. In the tree's own units, measured from
 * its base: the group is scaled on a narrow screen, so the world positions
 * are made per frame (see `treeAim`, and the tree's placement in
 * ChunkedFigure).
 */
function treeShotOf(build: ThinkerChunkBuild): TreeShot {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const center = new THREE.Vector3();
  for (const chunk of build.chunks) {
    center.set(...chunk.center);
    for (const positions of [chunk.surfacePositions, chunk.interiorPositions]) {
      for (let i = 0; i + 2 < positions.length; i += 3) {
        point.set(positions[i], positions[i + 1], positions[i + 2]).add(center);
        box.expandByPoint(point);
      }
    }
  }
  const size = box.getSize(new THREE.Vector3());
  const rotation = new THREE.Euler(...TREE_ROTATION);
  // The turn is about the vertical only, so the base's height is the box's.
  const baseLift = -box.min.y;
  const aim = box.getCenter(new THREE.Vector3()).applyEuler(rotation);
  aim.y += baseLift + size.y * TREE_AIM_LIFT;
  return {
    aim,
    baseLift,
    drift: new THREE.Vector3(...build.drift).applyEuler(rotation),
    halfHeight: size.y / 2,
    // The widest the plan can be from any angle: its diagonal.
    halfWidth: Math.hypot(size.x, size.z) / 2,
  };
}

/** The tree's aim in the world, for the group drawn at `scale`. */
function treeAim(tree: TreeShot, scale: number, out: THREE.Vector3) {
  out.copy(tree.aim).multiplyScalar(scale);
  out.y += FLOOR_Y;
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);
// Scratch for laying out the petals against a chunk's pose.
const scratchOffset = new THREE.Vector3();
const scratchEuler = new THREE.Euler();

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
  tree,
}: {
  /**
   * Where the statue's cloud's centre ends up, in world space: the mean of
   * the chunks' full offsets, which the cut shot follows when the statue
   * keeps the stage past the cut.
   */
  cloudDrift: THREE.Vector3;
  /** Where the shot opens: the blow, lifted clear of the floor. */
  openAim: THREE.Vector3;
  progressRef: ProgressRef;
  reducedMotion: boolean;
  robotState: RobotCameraState;
  /** The tree's place and framing, once it has been built. */
  tree: TreeShot | null;
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
  // cut. This remembers which side of the cut the last frame was on, so
  // the frame that crosses it snaps — in either direction, so scrolling
  // back up cuts back just as sharply. And which figure it was framing:
  // a tree that lands after the cut (only when its build was late, see
  // figureAt) takes the frame with the same snap.
  const cutRef = useRef(false);
  const figureRef = useRef<Figure>("statue");

  // `?thinkerCamAt=<breakup>` holds the camera where it would be at that
  // point of the break while the pieces carry on with the scroll: a still
  // lens for headless captures that measure the release order off the
  // pixels, which a moving camera smears into every frame.
  const holdAt = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("thinkerCamAt");
    return raw === null || !Number.isFinite(Number(raw)) ? null : Number(raw);
  }, []);

  useFrame(({ clock }) => {
    // Linear in the scroll: a slow, even zoom-out and pan.
    const breakup = reducedMotion ? 0 : (holdAt ?? breakupAt(progressRef.current));
    const compact = size.width < 720;
    // The pull-out is LINEAR on the scroll, like the swing: it used to
    // ride a smoothstep of the breakup (a held beat on the hand, then an
    // opening that accelerated through the middle), which read as the
    // camera speeding up along with the exponential release of the
    // pieces. The release keeps its ramp; the camera moves evenly.
    //
    // Reduced motion pins breakup to 0, which is the hand close-up. That
    // would strand those users in an extreme close-up they can never move
    // out of, so they get the settled wide framing instead: the figure
    // whole, from the far end of the same arc.
    const open = reducedMotion ? 1 : breakup;
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

    // The cut. Once the panel is 60% grown the camera is 55 degrees round
    // from the figure's front and stays there to the bottom of the stage.
    // Nothing above is skipped: every frame up to this scroll position
    // plays exactly as it did, and the swing and the orbit this replaces
    // are still what get it there.
    const cut = CUT_TO_TREE && !reducedMotion && sceneFx.stageCut >= 1;
    const figure = figureAt(reducedMotion, tree !== null);
    // How far through the narration the page is. The shot keeps moving on
    // it — a gentle orbit and a touch of dolly — so the held frame is
    // never quite still.
    const story = reducedMotion ? 0 : progressRef.current.story;
    const settled = storyEaseOf(story);
    const persp = camera as THREE.PerspectiveCamera;
    let shotDistance = distance;
    if (cut && figure === "tree" && tree) {
      // The tree's shot: aimed at the tree, back far enough for its box to
      // fill the frame — by height, or by width on a screen too narrow for
      // that — then following its cloud as the pieces go. In world units,
      // so the tree's own are scaled as its group is.
      const scale = stageScaleOf(size.width);
      const halfTan = Math.tan((STATUE_FOV * Math.PI) / 360);
      const aspect = persp.isPerspectiveCamera ? persp.aspect : 1;
      const halfHeight = tree.halfHeight * scale;
      const halfWidth = tree.halfWidth * scale;
      const fit = Math.max(halfHeight / halfTan, halfWidth / (halfTan * aspect));
      shotDistance =
        (fit + halfWidth) *
        TREE_FRAME_FILL *
        THREE.MathUtils.lerp(1, STORY_DOLLY, settled);
      treeAim(tree, scale, lookAt).addScaledVector(
        tree.drift,
        scale * CUT_AIM_FOLLOW * travelAt(treeBreakupAt()),
      );
    } else if (cut) {
      // The statue's own cut shot — only seen when there is no tree — a
      // fifth further out than the shot it cuts from.
      shotDistance =
        distance * CUT_PULL_BACK * THREE.MathUtils.lerp(1, STORY_DOLLY, settled);
      lookAt.addScaledVector(cloudDrift, CUT_AIM_FOLLOW * travelAt(breakup));
    }
    if (cut) {
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

    if (chase.blend <= 0) {
      // The statue's camera, untouched.
      chase.seeded = false;
      // Handheld drift, scaled by how far out the camera is: the same
      // angular wander reads as much bigger movement on the tight hand
      // shot than on the wide one.
      if (!reducedMotion && holdAt === null) {
        const sway = shotDistance * 0.016;
        target.x += Math.sin(clock.elapsedTime * 0.18) * sway;
        target.y += Math.sin(clock.elapsedTime * 0.13 + 1.1) * sway * 0.6;
      }
      const crossed = cut !== cutRef.current || figure !== figureRef.current;
      cutRef.current = cut;
      figureRef.current = figure;
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
      if (!reducedMotion && holdAt === null) {
        const rollPhase = THREE.MathUtils.clamp(breakup / (2 * ROLL_PEAK_AT), 0, 1);
        camera.rotateZ(CAMERA_ROLL * Math.sin(Math.PI * rollPhase) ** 2);
      }
      // Same probe the chase used to fill in, so a headless capture can read
      // the statue's framing too — `azimuth` in degrees, on the convention
      // the cut is written in (0 = +z, and the figure's front is +z).
      cameraProbe.camera = camera.position.toArray();
      cameraProbe.look = lookAt.toArray();
      cameraProbe.cut = cut;
      cameraProbe.figure = figure;
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
  const skyRef = useRef<THREE.HemisphereLight>(null);
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
    if (ambientRef.current) ambientRef.current.intensity = 0.01 * statueLight;
    if (skyRef.current) skyRef.current.intensity = 0.13 * statueLight;
    if (keyLightRef.current) {
      keyLightRef.current.position.x = -3.4 + breakup * 1.4;
      keyLightRef.current.intensity = (20.5 + breakup * 5.5 + pulse) * statueLight;
      // The cone opens as the pieces spread, so none fly out of the light.
      keyLightRef.current.angle = 0.36 + breakup * 0.3;
    }
    if (fillLightRef.current) fillLightRef.current.intensity = 1.0 * statueLight;
    if (rimLightRef.current) {
      rimLightRef.current.intensity = (4.2 + breakup * 2.8) * statueLight;
    }
    if (bounceLightRef.current) bounceLightRef.current.intensity = 0.25 * statueLight;
  });

  return (
    <group ref={groupRef}>
      <ambientLight ref={ambientRef} intensity={0.01} />
      {/* What keeps the side facing away from the key off true black. With
          only the four punctual lights, the brow, eye socket and nose were
          one solid black wedge.

          0.55 at first, and now 0.13: asked for the figure much darker and
          with much more contrast, which is this light's job to give back
          along with the exposure below. Measured over the panel at 1280x800
          (swiftshader), before -> after: at hero fraction 0.62 the mean
          stone luminance goes 118.9 -> 106.9 and the median 108 -> 91 while
          the 90th percentile only falls 215 -> 204, so the midtones drop
          three times as far as the highlights; at 0.70, 136.5 -> 126.9 with
          the panel below luminance 26 going 62.8% -> 66.9%; at 0.85 the
          break's own lit pieces hold the mean at 155.6. Nothing clips:
          0.00% of the panel at or above 250 before and after.

          Not lower than 0.13. At 0.08 the face went back towards the wedge
          this light exists to prevent — at 0.13 the brow reads as a lit
          ridge and the nose and cheekbone stay separate forms in the
          capture, which is the thing the grain and the roughness bought and
          must not be spent.

          A hemisphere light and not an environment map: a PMREM'd dome did
          the same job visually but sampled per fragment, and this page is
          already 8.3 ms a frame (p50, RTX 5060, 1280x800, vsync off)
          against a 120 Hz display's 8.3 ms budget. The dome plus a grain on
          the cut faces took it to 12.0 ms; a hemisphere is two dot products
          in the light loop and left it at 8.7 ms, inside the noise.

          Ground is the stage's own black, so the lift is a top-down
          gradient that still reads as form rather than the flat wash an
          ambientLight would give — which is why the ambient stays at 0.01
          rather than simply being raised. Near-neutral sky on purpose: the
          palette is white marble on #0a0a0a and a tint would show on every
          lit pixel. */}
      <hemisphereLight
        ref={skyRef}
        args={["#eef1f6", STAGE_BLACK, 0.13]}
        position={[0, 1, 0]}
      />
      <spotLight
        ref={keyLightRef}
        angle={0.36}
        castShadow
        color="#ffffff"
        decay={1.05}
        distance={12}
        intensity={20.5}
        penumbra={0.06}
        position={[-3.4, 3.2, 2.8]}
        shadow-bias={-0.0005}
        // Held back from full, because the figure receives now and this is
        // the dominant light (intensity 20.5 against a 0.13 hemisphere and a
        // 1.0 fill). At full strength the cloud overhead put the whole chest
        // into near-black — measured against the same build with the figure
        // not receiving, at 1280x800, hero fraction 0.85: 66,600 pixels
        // darkened by a mean of 97 levels of 255 — which reads as the body
        // being unlit rather than as pieces passing over it. At 0.55 the
        // same frame is 63,666 pixels at a mean of 31, so the shadow covers
        // the same ground at a third of the depth and the marble under it
        // keeps its own modelling. 0.7 is between the two.
        shadow-intensity={0.7}
        // 1024, from 2048. It was a quarter of the texels for no visible
        // change on the 1280x800 capture back when the only receiver was
        // the floor — a soft blob under the figure, and the floor is not
        // even in frame at the break's camera. The chunks receive now (see
        // ChunkedFigure), so this map is what a piece's shadow on the body
        // is drawn from. Left at 1024: on the 1280x800 capture the edges
        // are soft but the shape of a passing piece is legible, and the
        // shadow is deliberately not hard-edged. The bias below is what
        // keeps the figure off its own shadow.
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <spotLight
        ref={fillLightRef}
        angle={0.26}
        color="#f4f5ff"
        decay={1.2}
        distance={10}
        intensity={1.0}
        penumbra={0.05}
        position={[3.2, 2.1, -1.5]}
      />
      <directionalLight
        ref={rimLightRef}
        color="#ffffff"
        intensity={4.2}
        position={[2.7, 1.8, -3.8]}
      />
      <pointLight
        ref={bounceLightRef}
        color="#ffffff"
        intensity={0.25}
        position={[-1.45, -1.05, 2.4]}
      />
    </group>
  );
}

// How many frames a figure is drawn regardless of which figure the stage
// is on, from the frame its chunks arrive — the warm-up (see the warm
// effect in ThinkerCanvas): uploading its geometry and compiling its
// materials and their shadow pass. Drawn hidden, none of that happens, and
// it would all land on the cut frame as a hitch — the one frame meant to
// read as a hard cut. Only while the panel is still shut (nothing drawn
// is seen), so a build landing late is not flashed over the other figure.
const WARM_FRAMES = 4;

/**
 * One figure in pieces: the statue or the tree, each from its own build,
 * standing where `placement` puts it and breaking against its own measure
 * of the page. Only the figure the stage is on (see figureAt) is drawn;
 * the other is kept mounted and warm, so the swap on the cut costs
 * nothing on the frame.
 */
function ChunkedFigure({
  build,
  figure,
  placement,
  progressRef,
  reducedMotion,
  treeReady,
}: {
  build: ThinkerChunkBuild;
  figure: Figure;
  /**
   * Where the figure stands: the resting rotation of its group, and how far
   * the group's origin sits above the floor, in the figure's own units.
   * `onFloor` scales that with the group, so a base at -baseLift lands on
   * the floor on a narrow screen too; the statue's origin stays put
   * instead, as it always has (its base floats a little on a phone, and
   * did before the tree).
   */
  placement: { baseLift: number; onFloor: boolean; rotation: [number, number, number] };
  progressRef: ProgressRef;
  reducedMotion: boolean;
  treeReady: boolean;
}) {
  const stageRef = useRef<THREE.Group>(null);
  const warmedRef = useRef(0);
  const chunkRefs = useRef<Array<THREE.Group | null>>([]);
  // Each chunk's cut-face mesh, held imperatively so the per-frame loop
  // below can drop draws nobody can see without a React render.
  const interiorRefs = useRef<Array<THREE.Mesh | null>>([]);
  // Per chunk, how long it has been adrift (seconds of wall time).
  const adriftRef = useRef<Float32Array>(new Float32Array(0));
  // The opacity last written into the chunks' materials (1 = untouched).
  const appliedFadeRef = useRef(1);
  // One surface and one cut-face material for all the chunks.
  const marble = useMarbleMaterials();
  // The blossom, on the tree only: instanced petals resting on the boughs
  // that fall as the boughs break away (see treePetals). Laid out once per
  // build against the same pose the chunk loop below writes, so a petal
  // lets go from exactly where its bough was.
  const petalRef = useRef<THREE.InstancedMesh>(null);
  const chunkProgressRef = useRef<Float32Array>(new Float32Array(0));
  const petals = useMemo(() => {
    if (figure !== "tree") return null;
    return planPetals(build.chunks, (chunk, progress, position, quaternion, scale) => {
      const travel = travelAt(progress);
      const turn = Math.min(travel, 1.5);
      position.set(...chunk.center).addScaledVector(scratchOffset.set(...chunk.offset), travel);
      quaternion.setFromEuler(
        scratchEuler.set(chunk.spin[0] * turn, chunk.spin[1] * turn, chunk.spin[2] * turn),
      );
      scale.setScalar(THREE.MathUtils.lerp(1, chunk.scale, Math.min(travel, 1)));
    });
  }, [build, figure]);
  const petalGeometry = useMemo(() => (petals ? createPetalGeometry() : null), [petals]);
  const petalMaterial = useMemo(() => (petals ? createPetalMaterial() : null), [petals]);
  useEffect(() => {
    if (petals && petalRef.current) paintPetals(petalRef.current, petals);
    return () => {
      petalGeometry?.dispose();
      petalMaterial?.dispose();
    };
  }, [petalGeometry, petalMaterial, petals]);
  const chunks = useMemo(
    () =>
      build.chunks.map((chunk) => {
        const geometries = makeChunkGeometries(chunk);
        return {
          ...geometries,
          center: new THREE.Vector3(...chunk.center),
          exposedAt: chunk.exposedAt,
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
    // The figure's own measure of the break: the statue's runs from the
    // panel's first beat, the tree's from the cut (see treeBreakupAt).
    // Scrolling back up runs the same number down again, so each figure
    // retraces its own flight — that is all the "reverse" there is now.
    const shown = reducedMotion
      ? 0
      : figure === "tree"
        ? treeBreakupAt()
        : breakupAt(progressRef.current);
    // The last few percent of spread.
    const settled = reducedMotion ? 0 : smoothPhase(BREAK_END, 1, progressRef.current.value);

    // Only the figure the stage is on is drawn — after its warm-up frames.
    const warming =
      warmedRef.current < WARM_FRAMES && progressRef.current.value <= 0;
    if (warming) warmedRef.current += 1;
    if (stageRef.current) {
      stageRef.current.visible =
        warming || figureAt(reducedMotion, treeReady) === figure;
      if (!stageRef.current.visible) return;
    }

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
      chunkProgressRef.current = new Float32Array(chunks.length);
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

      chunkProgressRef.current[index] = localProgress;
      // A piece's interior mesh is its freshly-cut faces, and while the
      // piece is buried in solid marble nobody can see them: that is one of
      // the three draw calls a chunk costs, and the stage is draw-call
      // bound, not fragment-bound (4.6x the pixels cost it only +1.9 ms on
      // an RTX 5060, while 234 more chunk meshes cost +1.7 ms). Counted in
      // the browser: 1431 calls a frame with every face drawn.
      //
      // Buried is NOT the same as seated, which is what this first tested.
      // A seated piece's cut faces are inside solid marble only while the
      // pieces AROUND it are seated too — the moment a neighbour flies off,
      // the wall of the cavity it leaves IS this piece's cut face, and
      // hiding it shows a hole straight through a hollow figure. (The
      // capture ladder that passed the first version only followed pieces
      // that were leaving, never the holes behind them.) So the test is
      // `exposedAt`, baked per chunk: the first release among the piece
      // itself and every piece it shares cut points with.
      //
      // It is `shown` — the same number the position below is built from,
      // read in the same frame — against a moment, so a face is there on
      // the frame its neighbour first has any displacement at all, and it
      // reads the same scrolling back up, which re-seats the pieces. Driven
      // off a timer or a React state change it would be a frame late.
      const interior = interiorRefs.current[index];
      if (interior) interior.visible = shown > chunk.exposedAt;
      const adrift =
        DRIFT_PER_SECOND * adriftRef.current[index] * Math.min(localProgress, 1);
      const travel = (travelAt(localProgress) + adrift) * (1 + settled * 0.06);
      // The tumble. `turn` used to be `Math.min(travel, 1.5)` alone, and the
      // cap was not what held it back: with travelWindow at 0.55 and `shown`
      // never past about 0.34 while the stage is drawn, travel reaches 0.84
      // at the very most on screen and 1.25 at the end of the whole run, so
      // 1.5 never binds. What held it back is that travelAt decelerates
      // (x(2-x), slope 0 at x=1): a piece turns while it is leaving and then
      // sets into a pose. Measured on the bake, the spin magnitudes are
      // 0.263 rad median (p25 0.202, p75 0.318, max 0.424), so at travel
      // 0.84 the median piece turns 12.7 degrees over its whole visible
      // flight — a tilt, not a roll.
      //
      // So the fix is time in the air, not the cap and not the baked spin.
      // `adriftRef` is already seconds since release, and already resets
      // when a piece is scrolled home, so the roll retraces the same way the
      // flight does. 0.3 per second on top of travel is 4.5 degrees a second
      // for the median piece: a slow roll a piece is seen to be in the
      // middle of, not debris. The limit stops a parked scroll winding it
      // round — 2.0 is about seven seconds of roll and 30 more degrees,
      // after which a piece holds its pose.
      const turn =
        Math.min(travel, 1.5) +
        Math.min(adriftRef.current[index] * ROLL_PER_SECOND, ROLL_LIMIT);
      const breathing =
        Math.sin(clock.elapsedTime * 0.22 + index * 0.63) * 0.012 * travel;
      group.position.copy(chunk.center).addScaledVector(chunk.offset, travel);
      group.position.y += breathing;
      group.rotation.set(chunk.spin.x * turn, chunk.spin.y * turn, chunk.spin.z * turn);
      group.scale.setScalar(THREE.MathUtils.lerp(1, chunk.scale, Math.min(travel, 1)));
    });

    if (petals && petalRef.current) {
      updatePetals(
        petalRef.current,
        petals,
        build.chunks,
        (index, out) => {
          const group = chunkRefs.current[index];
          return group ? out.compose(group.position, group.quaternion, group.scale) : null;
        },
        chunkProgressRef.current,
        adriftRef.current,
        // The floor, in the group's own space: its origin sits baseLift
        // above the floor.
        -placement.baseLift,
      );
    }

    if (stageRef.current) {
      const stageScale = stageScaleOf(size.width);
      stageRef.current.scale.setScalar(stageScale);
      // A base on the floor stays there whatever the scale: the group's
      // origin rises with it by the (scaled) height of the base below it.
      stageRef.current.position.y =
        FLOOR_Y + placement.baseLift * (placement.onFloor ? stageScale : 1);
      // The stage's own drift rides the same number, so a figure scrolled
      // back to whole stands at exactly the rotation it was carved at.
      const spread = travelAt(shown);
      stageRef.current.rotation.set(
        placement.rotation[0] + spread * 0.04,
        placement.rotation[1] - spread * 0.05,
        placement.rotation[2],
      );
    }
  });

  return (
    <group
      ref={stageRef}
      position={[0, FLOOR_Y + placement.baseLift, 0]}
      rotation={placement.rotation}
    >
      {figure === "statue" ? <DebugMarkers /> : null}
      {petals && petalGeometry && petalMaterial ? (
        <instancedMesh
          args={[petalGeometry, petalMaterial, petals.count]}
          frustumCulled={false}
          ref={petalRef}
        />
      ) : null}
      {chunks.map((chunk, index) => (
        <group
          key={index}
          ref={(node) => {
            chunkRefs.current[index] = node;
          }}
          position={chunk.center}
        >
          {/* The third draw call is this mesh's shadow, and it is not
              culled: the stage stops being drawn at a spread of about 0.33
              (panel progress 0.35 of BREAK_END's 0.96, just past hero
              fraction 1.0 at 1280x800), where every piece is still part of
              the figure's silhouette. No frame where dropping it is free.

              `receiveShadow` is new, and it is the whole reason any shadow
              is visible. It used to be that the ONLY receiver was the floor
              plane below, whose ShadowMaterial fades as 0.82 * (1 -
              travelAt) — and the floor is not in the frame at the camera
              the break plays on, so the shadow pass ran ~490 draws a frame
              and nothing on screen changed. What reads is the loose pieces
              casting onto the FIGURE: a piece crossing in front of the body
              darkens it as it passes, which is what puts the flight in
              front of the statue rather than beside it. The key light sits
              front-left-above ([-3.4, 3.2, 2.8]) and the pieces fly out
              screen-left and toward the lens, so they cross the light's
              path on their way out.

              It is nearly free, which is the point. Measured on the RTX
              5060 at 1280x800, two runs of the same build with and without
              this one prop, at hero fraction 0.85: p50 7.6 / 7.1 ms
              receiving against 7.4 / 7.0 not, p95 10.1 / 9.0 against
              9.8 / 8.9. Call it 0.1-0.3 ms. The draw calls are identical to
              the decimal (935.4 a frame either way) because the shadow PASS
              was ALREADY being paid for the floor nobody could see; all
              this adds is a map lookup in the marble's fragment shader over
              the third of the frame the figure covers.

              The cut faces do not receive. They are the inside of the
              stone, lit by their own darker material, and a shadow on them
              is not a thing anyone reads. */}
          <mesh
            castShadow
            frustumCulled={false}
            geometry={chunk.surfaceGeometry}
            material={marble.surface}
            receiveShadow
          />
          <mesh
            frustumCulled={false}
            geometry={chunk.interiorGeometry}
            material={marble.interior}
            ref={(node) => {
              interiorRefs.current[index] = node;
            }}
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
  treeReady,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
  treeReady: boolean;
}) {
  const materialRef = useRef<THREE.ShadowMaterial>(null);

  useFrame(() => {
    // The same parameter the chunks of the figure on the stage ride, so
    // the shadow fades with that figure — and is back, whole, under the
    // tree on the cut.
    const spread = reducedMotion
      ? 0
      : travelAt(
          figureAt(reducedMotion, treeReady) === "tree"
            ? treeBreakupAt()
            : breakupAt(progressRef.current),
        );
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
  const build = useChunkBuild(loadThinkerChunks);
  // With the cut off (CUT_TO_TREE) the tree is never asked for: its build
  // would only lengthen the television's hold for a figure nobody sees.
  const treeBuild = useChunkBuild(CUT_TO_TREE ? loadCherryChunks : loadNoTree);
  // RobotOutro used to write this every frame for CameraRig's chase. With
  // the robot unmounted nothing writes it and nothing reads it — the chase
  // branch is behind a `robot > 0` test that can no longer be true — but it
  // is still what CameraRig is typed on, so it stays.
  const robotState = useMemo(createRobotCameraState, []);
  // Where the blow landed, in world space: the build reports it in the
  // figure's own coordinates, so it has to go through the stage group's
  // rotation before the camera can aim at it.
  const openAim = useMemo(() => {
    const point = OPENING_AIM_POINT.clone();

    point.applyEuler(new THREE.Euler(...STAGE_ROTATION));
    point.y += IMPACT_AIM_LIFT;

    return point;
  }, []);
  // Where the cloud ends up, in world space. The build reports the mean of
  // the chunks' offsets in the figure's own coordinates, so it goes through
  // the stage group's rotation like the blow does.
  const cloudDrift = useMemo(() => {
    const drift = build ? new THREE.Vector3(...build.drift) : new THREE.Vector3();

    return drift.applyEuler(new THREE.Euler(...STAGE_ROTATION));
  }, [build]);
  // The statue stands where it always has — its group at the origin, which
  // is 1.6 above the floor; the tree with its flat base on the floor,
  // centred, and framed from its own bounds.
  const statuePlacement = useMemo(
    () => ({ baseLift: -FLOOR_Y, onFloor: false, rotation: STAGE_ROTATION }),
    [],
  );
  const treeShot = useMemo(() => (treeBuild ? treeShotOf(treeBuild) : null), [treeBuild]);
  const treePlacement = useMemo(
    () =>
      treeShot
        ? { baseLift: treeShot.baseLift, onFloor: true, rotation: TREE_ROTATION }
        : null,
    [treeShot],
  );
  // Warm the pipeline as soon as the chunks are in. One frame compiles the
  // materials and uploads the geometry; the shadow map needs its own pass,
  // so draw a few across consecutive frames rather than all in one tick.
  useEffect(() => {
    if (!build && !treeBuild) return undefined;
    let frames = 0;
    let raf = 0;
    const warm = () => {
      invalidate();
      if (++frames < 4) raf = requestAnimationFrame(warm);
    };
    raf = requestAnimationFrame(warm);
    return () => cancelAnimationFrame(raf);
  }, [build, treeBuild]);
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
      // Capped at 1.5x: the stage is a viewport-sized box of ~800 draw
      // calls plus a shadow pass, and 1.75 on a 2x screen was 3.1x the
      // pixels of dpr 1 for marble that is fog-softened and mostly in
      // motion. 1.5 is 2.25x — 27% fewer pixels to shade every frame —
      // with antialias on to keep the chunk edges clean.
      dpr={[1, 1.5]}
      // Live while the panel is open. While it is closed this is "demand",
      // NOT "never": "never" draws literally nothing, so every shader
      // compile, geometry upload and shadow-map pass landed on the first
      // frame after the panel opened and the statue arrived late over a
      // box that had already started growing. On demand the stage still
      // draws once when it mounts and again whenever the scene graph
      // changes (the chunks arriving), which is the warm-up.
      frameloop={active ? "always" : "demand"}
      // "low-power", the same as the hero's canvas behind this one
      // (BareThreeCanvas). The two contexts share the page, and on a
      // dual-GPU laptop a "high-performance" hint here would wake the
      // discrete GPU for the whole tab while the hero had asked for the
      // opposite; the hint only decides which GPU, not how fast it runs.
      gl={{ antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        // 1.18 before: the cleanest control there is for "darker", because
        // ACES rolls the highlights off rather than clipping them, so the
        // whole figure comes down without the lit side flattening. The fill
        // and bounce lights came down with it (1.8 -> 1.0, 0.6 -> 0.25) and
        // the key went UP (17.5 -> 20.5): that is what makes it more
        // contrast rather than only less light. See the hemisphere light
        // above for the measurements.
        gl.toneMappingExposure = 0.82;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
        stageProbe.renderer = gl;
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
      {/* The fog sits beyond the pull-out's end, not the rest distance:
          with the lens opening to 9.3 a fog that began at 5.8 had the
          whole figure three quarters gone into it. */}
      <fog
        args={[STAGE_BLACK, CAMERA_DISTANCE_BROKEN + 0.8, CAMERA_DISTANCE_BROKEN + 5.2]}
        attach="fog"
      />
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
        tree={treeShot}
      />
      <StageLights progressRef={progressRef} reducedMotion={reducedMotion} />
      <StageFloor
        progressRef={progressRef}
        reducedMotion={reducedMotion}
        treeReady={treeBuild !== null}
      />
      {build ? (
        <ChunkedFigure
          build={build}
          figure="statue"
          placement={statuePlacement}
          progressRef={progressRef}
          reducedMotion={reducedMotion}
          treeReady={treeBuild !== null}
        />
      ) : null}
      {treeBuild && treePlacement ? (
        <ChunkedFigure
          build={treeBuild}
          figure="tree"
          placement={treePlacement}
          progressRef={progressRef}
          reducedMotion={reducedMotion}
          treeReady
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
    const debug = {
      camera: cameraProbe,
      // How many frames the stage has drawn so far: for checking that
      // "demand" really draws nothing while the panel is shut.
      get frames() {
        return stageProbe.renderer?.info.render.frame ?? 0;
      },
      progress: progressRef.current,
    };
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
