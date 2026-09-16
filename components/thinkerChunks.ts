import * as THREE from "three";

import {
  type BuildSolidChunkOptions,
  type ThinkerChunkBuild,
  buildSolidThinkerChunks,
  loadThinkerGeometry,
} from "@/components/thinkerFragments";

/**
 * One build of each figure's chunks per page, started early and shared:
 * the page kicks the builds off as it mounts (the fracture runs in a worker
 * while the television plays), and the stage picks up the same promises
 * when it appears. Builds are keyed by figure name — "thinker" for the
 * statue, "cherry" for the tree (see cherryChunks) — and run one after
 * another in a single worker, so a second figure never slows the first.
 * Falls back to building on the main thread if the worker cannot start.
 */

/** The figure's resting turn on the stage, about the vertical. */
export const THINKER_BASE_YAW = Math.PI / 3;

/**
 * Where the camera sits relative to what it looks at, per unit of
 * distance: to the right and above, looking down and across at the figure.
 */
export const CAMERA_OFFSET = new THREE.Vector3(0.85, 0.3, 1).normalize();

/**
 * The opening shot. Where the camera sits for it, per unit of distance:
 * hard to the RIGHT of the figure, so the move out to CAMERA_OFFSET's high
 * three-quarter view is a real tilt and swing rather than a straight
 * dolly back (both sit well to the right, and the swing runs leftward, so
 * the whole move reads right-to-left). The eye was raised twice, by a
 * fifth and then a quarter of the offset's length (y 0.18 -> 0.46 ->
 * 0.82 per unit, before normalising) to get the face into the frame,
 * then brought back down to 0.55 with the aim left where it was
 * (IMPACT_AIM_LIFT): the shot looked too steeply down on the head, and
 * lowering the eye against a fixed aim levels it without losing the face.
 */
export const CAMERA_OFFSET_CLOSE = new THREE.Vector3(0.95, 0.55, 1).normalize();
/**
 * Close on the head: 2.2 rather than the 2.6 that framed the hand with
 * the base and legs around it, since the shot now opens on the face.
 *
 * Do not bring it closer. 8516a66 opened at 1.55 on an aim between the
 * head and the shoulder, pulled back 26% by breakup 0.34 and climbed the
 * aim towards the cloud, after lukebaffait.fr's close-up (pieces on screen
 * at breakup 0.34 went 47 -> 74, their median size 14.5% -> 23% of the
 * frame's width). Kevin rejected it and asked for this camera back, so the
 * whole of that move, the narrow screen's 2.7 and IMPACT_AIM_LIFT's
 * removal were reverted.
 */
export const CAMERA_DISTANCE_CLOSE = 2.2;
/**
 * The opening aim sits well above the blow rather than straight at it, so
 * the face — the hand is under the chin — is in the frame rather than
 * above it. It was 0.2, which gave the arms headroom but not the head,
 * and 0.42 once the eye was raised, which still cropped the frame at the
 * neck from the higher viewpoint (measured on the 1280x800 capture); 0.45
 * when the blow was on the floor and half the frame would otherwise have
 * been bare ground.
 */
export const IMPACT_AIM_LIFT = 0.78;

/**
 * The blow, in the figure's own units: the figure's LEFT SHOULDER, which
 * is where the break now begins (the diagonal plane in
 * `releaseSweep` below enters the figure at this corner). The cells are graded around this point, so the first pieces the
 * eye sees are the fine ones. It used to be the HAND (-1.157, -0.229,
 * 0.628), from when the break started there; that left the shoulder on
 * the coarse end of the grading, and the pieces coming off first read as
 * too big.
 */
const IMPACT_POINT = new THREE.Vector3(0.06, 0.95, 0.4);
/**
 * The hand, the nearest point of the figure to the lens, and where the
 * opening shot still aims: the camera used to follow the build's own
 * `breakOrigin`, which was the same point, but the grading has moved up
 * to the shoulder and the shot should not follow it there — lifted by
 * IMPACT_AIM_LIFT the aim would sit above the head.
 */
export const OPENING_AIM_POINT = new THREE.Vector3(-1.157, -0.229, 0.628);

/**
 * The camera's opening eye in the figure's own space: the aim plus the
 * opening offset at its distance, turned back through the stage's yaw.
 * The break's order was once measured from here — see `releaseSweep`,
 * which is a plane across the figure now — so nothing reads this; it is kept because
 * the eye is the only place a camera-relative order could be measured
 * from if one is wanted again.
 */
const OPENING_EYE = (() => {
  const eye = CAMERA_OFFSET_CLOSE.clone()
    .multiplyScalar(CAMERA_DISTANCE_CLOSE)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -THINKER_BASE_YAW)
    .add(OPENING_AIM_POINT);
  eye.y += IMPACT_AIM_LIFT;
  return [eye.x, eye.y, eye.z] as [number, number, number];
})();

// The way the pieces fly: level, out to the viewer's LEFT and toward the
// lens (after lukebaffait.fr, whose fragments stream past the viewer).
// Turned back through the stage's yaw so the builder can plan it in the
// figure's own space, where it comes to about (-1.00, -0.02, -0.03):
// straight out of the figure's own RIGHT side, which is the side the
// camera is on and the side that reads as SCREEN LEFT.
//
// Asked for the pieces to break off to the statue's own right, for the
// break front to travel from its left shoulder to its right, and for both
// to read as movement toward the left of the frame. Those three are the
// same thing: with the base yaw at 60 degrees, figure -x maps to view
// (-0.5, 0, +0.87) — screen left AND toward the lens.
//
// This is the drift plus CAMERA_OFFSET, so the sum is what the pieces
// actually follow: (-0.553, -0.018, +0.889) in view space, 32 degrees off
// the camera axis to the viewer's left. It used to be 20 degrees (drift
// x -0.95) and the stream did not read as leftward at all against the
// camera's own push; 32 puts the figure-space flight on -x almost
// exactly. Straight, from the first frame — no spiral, no late curve.
//
// The direction no longer settles the ORDER of the break. It did: the
// constraint graph in planReleaseOrder made the break start at the end
// the flight points AT and travel back against it, which is why an
// earlier pass had to mirror this drift to the viewer's right (0.336,
// -0.241, -0.995) to force a leftward front. That graph is graded now
// (RELEASE_ORDER_TOLERANCE_* in thinkerFragments), so the sweep and the
// flight can run the same way and this is free to be what it should be.
//
// (A version that sent the pieces climbing at ~30 degrees, y +0.3, was
// tried and put back to level; the drift's y takes out the lift the
// camera's own direction carries, leaving the small fall of -0.018 that
// the "30% less lift" pass settled on.)
const FLIGHT_DRIFT_VIEW = new THREE.Vector3(-1.184, -0.241, 0.146);

function inFigureSpace(view: THREE.Vector3, yaw: number): [number, number, number] {
  const direction = view
    .clone()
    .normalize()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);

  return [direction.x, direction.y, direction.z];
}

/**
 * The pieces' flight in a figure's own space, for a figure standing on the
 * stage at `yaw`. The same direction in the WORLD for every figure — it is
 * the stage's flight, not the statue's — so the tree's pieces stream the
 * way the statue's did.
 */
export function flightDirectionInFigureSpace(yaw = THINKER_BASE_YAW) {
  return inFigureSpace(CAMERA_OFFSET.clone().add(FLIGHT_DRIFT_VIEW), yaw);
}



// The figure's bounding box, for turning model points into fractions.
const FIGURE_MIN = new THREE.Vector3(-1.315, -1.55, -0.923);
const FIGURE_SIZE = new THREE.Vector3(2.63, 3.1, 1.846);

function fraction(x: number, y: number, z: number): [number, number, number] {
  return [
    (x - FIGURE_MIN.x) / FIGURE_SIZE.x,
    (y - FIGURE_MIN.y) / FIGURE_SIZE.y,
    (z - FIGURE_MIN.z) / FIGURE_SIZE.z,
  ];
}

export const THINKER_CHUNK_OPTIONS: BuildSolidChunkOptions = {
  // Cut ahead of time by `npm run bake:chunks`; re-run it after changing
  // anything below (the loader checks, and cuts live if the bake is stale).
  bakedPath: "/model/thinker/chunks",
  // Where the figure struck, and the point the CELLS are graded around:
  // finest here, coarsening away. It is the figure's LEFT SHOULDER, the
  // corner the break's plane enters at (releaseSweep), because the pieces
  // coming off first are the ones the eye is on and they read as too big
  // when the fine grading sat at the hand instead. Which pieces come
  // apart first is releaseSweep's business, not this one's.
  impact: fraction(IMPACT_POINT.x, IMPACT_POINT.y, IMPACT_POINT.z),
  // The order of the break: ONE PLANE. Pieces come loose in order of how
  // far along its axis they sit, so the axis is the direction the break's
  // front TRAVELS. A flat front, not a ball: the version before this
  // ranked pieces by a weighted distance from the shoulder (releaseFrom
  // [0.06, 0.95, 0.8] with up 4.5 / down 2.5 / across 1.35) and that
  // expands as a lopsided sphere, which reads as a hole opening and
  // growing rather than as one motion.
  //
  // MEASURE THIS ON SCREEN, NOT IN THE FIGURE'S AXES. Three rounds of
  // tuning missed because every number was a correlation against the
  // figure's own x/y/z. The figure is yawed 60 degrees and leans, and the
  // camera looks down on it, so those axes are not what is seen. Taking
  // the chunk centres through the stage group's rotation and then through
  // the camera the page actually used at the break (read out of
  // window.__thinkerStage.camera in a headless capture at breakup 0.15;
  // rebuilding it from the constants here agrees to 4%), one figure unit
  // moves on screen by:
  //
  //   +x -> 0.77 right, 0.06 UP        +y -> 0.08 right, 0.90 up
  //   +z -> 0.52 right, 0.23 DOWN
  //
  // So the figure's own +x IS most of screen-sideways, and its +z — the
  // depth, the front of the figure — moves sideways at two thirds of that
  // while ALSO moving DOWN. That last part is what makes the depth term
  // pay for itself twice here: the sweep runs -y (down the figure) and -z
  // (front to back), and -z's screen-UP cancels -y's screen-DOWN. Leaning
  // the plane into depth therefore starts the break at the FRONT and
  // FLATTENS its path at the same time.
  //
  // THE ANGLE ASKED FOR IS 40 DEGREES OFF HORIZONTAL ON SCREEN, after
  // lukebaffait.fr, whose break runs as a clear diagonal across the frame.
  // Not 40 degrees in the figure's axes: in the figure's own frame this
  // line is 55 degrees off horizontal, and the two numbers are unrelated
  // because of the projection above.
  //
  // Against that projection, over the pieces the plane still owns (the
  // body, less the base on `lateFrom` and less the head on `earlyBand`),
  // the BAKED release correlates -0.64 with screen x and +0.75 with screen
  // y, and the plane's own front travels 39.9 degrees BELOW horizontal:
  // upper right to lower left. Fitting the baked release as a linear
  // function of screen x and y over those same pieces — which is the angle
  // the eye is actually offered — puts the front's path at 46.3 degrees
  // below horizontal and the CRACK, the line between gone and still there,
  // at 43.7 degrees from horizontal. The two are complements, so near 45
  // it does not matter which of them "40 degrees" meant; at the flat sweep
  // they were 2.8 and 87.2, a front sliding sideways behind a vertical
  // edge. That is the change: the edge rotated 43 degrees. Going DOWN and not up is the only sign
  // available — the sweep has to reach the plinth, `lateFrom` holds the
  // plinth back rather than reordering it, and a statue that was dropped
  // opens downward — and it is the sign the reference runs.
  //
  // The three rounds this line went through, kept because each set of
  // numbers is what the next was bought against:
  //   z -0.570, y -0.244:  -0.93 / +0.54,  8.7 deg BELOW horizontal
  //   z -1.250, y -0.200:  -0.83 / +0.26,  0.7 deg ABOVE  (asked flatter)
  //   z -1.870, y -2.010:  -0.64 / +0.75, 39.9 deg BELOW  (asked for 40)
  // The sideways correlation HAS to fall going from flat to 40 degrees:
  // at 40 degrees only cos 40 = 0.77 of the travel is sideways at all.
  // -0.64 is what a clean 40-degree diagonal measures, not a loss of the
  // leftward read; the front still crosses the frame right to left. (The
  // two correlations taken together give atan2(0.75, 0.64) = 49.6 degrees,
  // steeper than the travel angle, because they are rank correlations over
  // a figure that is taller than it is wide; the travel angle is the one
  // that says what the front's path on screen looks like.)
  //
  // Two other counts, because they read worse and the reason matters.
  // Over the whole BODY the numbers are -0.33 / +0.40 against -0.92 /
  // +0.12: that is the head band, which is the top of the screen going
  // early on purpose, and it is the price of the third ask. Over the whole
  // FIGURE they are +0.29 / +0.79 against +0.04 / +0.72, and that is the
  // base: 40% of the pieces are below y -0.31 and all of them go last, so
  // the last third of the break is a drop to the plinth whatever the plane
  // does. Neither is the plane's path, which is what "sideways, not down"
  // is about; the plane-only figures above are.
  //
  // WHERE IT STARTS is the depth term's other job, and it is why the 40
  // degrees was bought by growing y AND z together rather than by adding y
  // alone. At [-0.887, -1.6, -1.25] — y alone, the same 40 degrees — the
  // first 45 pieces fall to mean z 0.540 with 33 of 45 forward of z 0.4
  // and two behind z 0.15: the plane is steep enough that it stops caring
  // which way the figure faces. Scaling both terms holds the depth's share
  // of the axis, and at [-0.887, -2.01, -1.87] the first 45 are back to
  // mean z 0.599, 38 of 45 forward, none behind.
  //
  // On the bake the first 45 pieces off average z 0.610 against the figure's
  // own 0.322, with 41 of 45 forward of z 0.4 and not one behind z 0.15;
  // the flat version was 0.704 and 45 of 45, and at z -0.570 it was 0.380
  // against 0.246, with 20 forward and 8 behind, and the break was still
  // read as opening on the shoulder BLADE rather than the chest. The four
  // pieces that are no longer forward of 0.4 are the cost of the 40
  // degrees and they are the whole of it. Their mean y is 1.22, up from
  // 0.96: a plane this steep enters at the CROWN of the left shoulder
  // rather than across the chest, and runs down the front from there.
  //
  // The earlier record of this line, kept because it is what the numbers
  // above were bought against: the plane was 13 degrees off horizontal IN
  // THE FIGURE'S FRAME and measured, over the shoulder band, +0.80 with -x
  // and +0.22 with -z, against +0.90 and -0.02 at 15 degrees and z -0.385,
  // and +0.86 with -x at the 34 degrees before that. The claim that a z
  // term past about -0.6 cost the sideways read came from those figure-frame
  // correlations and does not survive the projection: at z -1.25 the screen
  // sideways read is -0.86, which is the flattest the break has been.
  //
  // What used to stop the plane being flat was the plinth. The plinth is
  // the +x mass at the bottom, so a flat -x sweep reaches it at once; only
  // the downward tilt held it back, and that same tilt starts the break at
  // the head. Measured over the chunk centres, mean release percentile of
  // the plinth (y < -0.45) and of the head (y > 1.2) against the tilt: 25
  // deg gave 0.46 / 0.64, 35 deg 0.60 / 0.35, 45 deg 0.70 / 0.17. One plane
  // could not do both. `lateFrom` below takes the plinth out of the plane's
  // hands, `earlyBand` does the same for the head, and the plane is free to
  // be as flat as it is.
  //
  // The y term went -0.244, then -0.200 (with the depth term this large the
  // plane's screen path already sat a shade above horizontal, and taking
  // more y out slid the START down the figure — at y -0.10 the first 45
  // averaged y 0.83, no longer the shoulder), and now -2.010, because the
  // ask changed from "flatter" to a 40-degree diagonal. Screen travel
  // against the y term at z -1.25: -0.2 gives -0.7 deg, -0.8 gives 20.7,
  // -1.2 gives 32.0, -1.6 gives 40.7. Then z was scaled with it to hold the
  // front-opening, see above.
  //
  // (An earlier plane sweep was tried and always started at the head.
  // That was a level axis, and it was also before the flight's constraint
  // graph was graded — ungraded, the graph overrode any sweep outright.
  // A spread from the camera's opening eye, OPENING_EYE, came before
  // that.)
  releaseSweep: [-0.887, -2.01, -1.87],
  // The base and the legs are ordered after the whole body, whatever the
  // plane says: 0.4 of the figure's height is the same floor `legsFrom`
  // uses, y = -0.31. That is what lets the plane above be flat. Measured
  // over the chunk centres, with the base held back like this the first
  // twelve pieces stay at the left shoulder down to about 12 degrees of
  // tilt and slide to mid-torso by 5; without it they had left the
  // shoulder by 20 degrees and were at the knee by 10. On the bake the
  // plinth's mean release percentile is 0.790 and the earliest plinth piece
  // is at 0.557 — it is still the last thing to go, as it was, and the
  // 40-degree plane did not move it (0.78 / 0.57 at the flat sweep).
  lateFrom: 0.4,
  // The head, ordered BEFORE the plane reaches it. Above 0.84 of the
  // figure's height (y = 1.05) and past 0.27 of its width from the
  // figure's right (x = -0.61): 83 of 493 pieces, measured off the bake's
  // own chunk centres rather than guessed — the top of the figure splits
  // cleanly in x into the head (x -0.65 to -1.24, z 0.23 to 0.78) and the
  // crown of the left shoulder (26 pieces, x -0.56 to 0.09), and the
  // shoulder is already the first thing off, so only the head needs
  // bringing forward.
  //
  // It has to be a band and not a steeper plane. The head sits 0.66 above
  // the mid torso and 0.91 further toward the figure's right, which is the
  // plane's LATE end; buying head-before-torso out of tilt alone needs the
  // vertical term above 0.58 of the sideways one, about 30 degrees off
  // horizontal — steeper than the 13 degrees that was already too steep.
  // Depth does not buy it either: even at z -2.2 the head only drew LEVEL
  // with the torso (0.308 against 0.296) and the screen sideways read had
  // fallen to -0.58. This is the mirror of `lateFrom`, and the same
  // argument.
  //
  // The window it lands in (EARLY_START / EARLY_END in thinkerFragments)
  // overlaps the body's on purpose: the head comes apart while the front
  // is still crossing the shoulder and the upper chest, so it reads as the
  // break continuing upward, not as a separate event. Measured on the
  // bake: head percentile 0.174 (80 pieces at y > 1.05, x < -0.6), mid
  // torso 0.397 (48 pieces at 0.2 < y < 0.85, x > -0.6). Before the band it
  // was 0.45 against 0.24 — the wrong way round; at the flat sweep it was
  // 0.201 against 0.306, and the 40-degree plane widens the gap on its own
  // (a downward plane reaches the head first anyway).
  earlyBand: { above: 0.84, toward: 0.27 },
  // WHEN pieces go, within the plane: patches and small clusters instead of
  // a clean line. Asked for "more natural selection of when pieces break"
  // after the order above measured 0.990 against the sweep, which read as
  // mechanical.
  //
  // What lukebaffait.fr does, measured off its hero (a pre-rendered
  // 341-frame JPEG sequence the page scrubs with the scroll): the frame at
  // which each block of the figure first changes, with the camera tracked
  // out, fits a straight front with a rank correlation of 0.62 (0.70 at
  // blocks the size of its pieces), 0.65 over the first quarter of the
  // front alone. What is left after the fit correlates 0.53 between blocks
  // a piece apart, 0.34 at one and a half, 0.13 at two to three, 0 past
  // that: patches of a few pieces going together. It does not accelerate:
  // 5-25% of the area goes in 41 frames, 25-50% in 24, 50-75% in 24, 75-95%
  // in 49.
  //
  // `grain` is about one of the pieces seen breaking (they are ~0.2 across)
  // and `shared` puts 70% of the unevenness in patches. At a grain of 0.28
  // (a piece and a half, the reference's own patch size) the patches were
  // big enough to hold back the whole chest while the head went: the
  // front's path, fitted on pixels with the camera held still, steepened
  // from 42-45 degrees below horizontal to 53-54. At 0.2 it measured 42-43.
  // `amount` is held to what keeps the break cohesive, since the cohesive
  // front was asked for over several rounds: on the bake the plane's rank
  // correlation is 0.962 over the body and 0.925 over the part seen to
  // break (0.990 / 0.970 without it). More costs the flights: at grain 0.28,
  // 0.12 and 0.14 put 7 and 10 flights a quarter or more inside standing
  // marble at some moment, against 4 at 0.1. The reference, measured on
  // pixels, scores about 0.6-0.7 on the same test. The clusters take the
  // spread of the gaps between releases over the visible break from 0.12
  // to 0.31 (coefficient of variation).
  //
  // What it costs the asks above, on the bake with the scatter below: the
  // first 45 pieces off average z 0.625 (0.610 without), 43 of 45 forward
  // of z 0.4 (41); head percentile 0.168 against mid torso 0.403 (0.174 /
  // 0.397); plinth 0.790, earliest 0.555 (0.790 / 0.557); the front's path
  // fitted on screen 46 degrees below horizontal (44), 42-43 on pixels
  // (42-45); pieces released by the time the statue stops being drawn, 91
  // (91).
  //
  // `amount` 0.05, from 0.1, when Kevin said the pieces "sort of just
  // uniformly break off all at once". Two things made that: the even
  // release (see RELEASE_ACCELERATION in thinkerFragments) and this loose
  // front. A loose front at an even rate reads as everything going
  // everywhere. Half the amount keeps the patches and the clusters and puts
  // the plane's rank correlation over the body at 0.984 (from 0.962).
  // Measured on screen (chunk centres through the projection above; release
  // fitted as a straight line in screen x and y, then the rank correlation
  // of release against position along that line), on the new schedule:
  // over everything released while the stage is clear (panel value to
  // 0.317) 0.657 at 0.1 and 0.764 at 0.05; over the body released while it
  // is drawn at all (to 0.49) 0.794 and 0.822. 0.07 measured 0.738 / 0.816.
  // Held: the first 45 pieces off average z 0.627 with 42 of 45 forward of
  // z 0.4 (43 at 0.1: one piece), head percentile 0.172 against mid torso
  // 0.399, plinth 0.790. A taper of 0.1 kept 43 of 45 but dropped the clear
  // stretch's front to 0.669. Moving the head band later in the order was
  // also tried (0.05 and 0.1 of rank): the front over the drawn stretch
  // rose to 0.746, but the first 45 fell to 40 forward at z 0.593, so the
  // break stopped opening on the front of the figure.
  releaseTexture: { amount: 0.05, grain: 0.2, shared: 0.7, taper: 0.15, clusters: 3 },
  // WHICH WAY pieces fly: a smooth field of turns over the figure, so pieces
  // near each other fly nearly parallel and pieces apart differ. See
  // scatterFlights for the reference's numbers (13 / 20 / 38 degrees off its
  // cloud's mean, median / p75 / p90, where ours were 4 / 10 / 12), and the
  // repairs in planReleaseOrder and straightenCrossingFlights for why only
  // part of it survives: before them the first 120 pieces off measured
  // 13 / 21 / 33 degrees on screen, after them 5 / 8 / 18 against the old
  // 3.5 / 5 / 7 (computed from the bake through the stage's camera). Left
  // where it is: a wider field buys no separation on screen and costs
  // pass-through — see scatterFlights for the measurement. The
  // turns taken back are the ones that flew pieces from the shoulder down
  // through the body or through each other, so what survives leans up: the
  // seen stream's mean direction lifts by 5 degrees. Still straight paths.
  //
  // `outwardPush` below now carries the spread this field could not: the
  // first 120 pieces off measure 17.5 / 27.2 / 38.0 degrees, which is the
  // reference's own 13 / 20 / 38, and the pass-through went DOWN rather than
  // up. That is not an argument for widening this field, which is random
  // where the outward push is structured — it is why the field can stay
  // where it is.
  flightScatter: { tilt: 0.4, yaw: 0.2, grain: 0.8, shares: [0.97, 0, 0.03] },
  // The pieces' spin rates spread out: most turn a little slower, a few
  // clearly faster. The reference's pieces turned, in the picture plane,
  // 0.08 / 0.23 / 0.62 / 1.41 degrees a frame pair at p25 / median / p75 /
  // p90; ours measured the same way turned 0.11 / 0.30 / 0.67 / 1.31, with
  // the baked spin itself tight (p75 over p25 1.57). This takes the baked
  // spin to p10 0.119, median 0.216, p90 0.394 radians, from 0.149 / 0.267
  // / 0.356: a lower middle and a longer top, the reference's shape.
  //
  // [0.4, 2.0], from [0.6, 1.5], when Kevin asked for more variation in the
  // pieces: the middle holds and the tail lengthens, so the tumble stays
  // subtle for most pieces and a few turn clearly. Baked spin over the pieces
  // released while the stage is drawn, p10 / median / p90: 0.119 / 0.216 /
  // 0.394 -> 0.094 / 0.200 / 0.506 radians. The reference's own spread is
  // wide at the top (p90 six times its median, per frame pair).
  spinSpread: [0.4, 2.0],
  // The cells are graded along the order rather than around a point: see
  // the spacing notes below.
  gradeAlongSweep: true,
  // The cells. They were cut after lukebaffait.fr's own break (frames of its
  // hero sequence, a Blender cell fracture of The Creation of Adam): blocky,
  // convex, nearly all the same size — about a tenth of the figure's height
  // across — with no slivers, no rings and no radial grain, coming apart in
  // a front that sweeps from the nearest point to the farthest. That reading
  // of the reference still holds; what no longer holds is copying it. Kevin
  // looked at the result and said the pattern left behind reads as if small
  // chunks had been carved out at random rather than as something that
  // shattered, so the cells now carry the rings and the radial grain the
  // reference does not have (see `shellBias` and `radialStretch`) and are
  // half again bigger.
  //
  // Cell width at the blow and far from it, in figure units (height 3.1):
  // finer at the blow, which is the shoulder the break starts at, so the
  // first pieces off are the smaller ones, as the reference's fingertips
  // are.
  //
  // This replaces a long run of shard tuning (0.055 / 0.275 with a 3x
  // radial stretch and size variation 3.0: ~290 slivers and slabs, a
  // 32-36 s build) with the reference's look. The build's cost is the seed
  // count, ~70 ms a seed in a worker: 0.22 / 0.3 came to ~170 seeds and
  // 179 pieces (17 s in Node, mean piece radius 0.34); 0.17 / 0.23 was a
  // quarter finer (291 pieces, mean radius 0.30, 28 s). Asked for pieces
  // two thirds of THAT size: 0.112 / 0.152 measured only 0.24 (600 pieces,
  // 62 s — the sampler packs finer cells less than proportionally), so
  // this is the spacing that lands the mean radius at ~0.2. A cut this
  // fine is what made baking it necessary (bakedPath).
  //
  // The spread is now wide because the grading follows the ORDER
  // (`gradeAlongSweep`), not the distance from a point. Every chunk costs
  // draw calls whether it ever moves or not — about 2 a frame seated — and
  // the stage stops being drawn about one screen past the cut, by which
  // time only ~45 of the pieces have ever released. So the fineness is
  // spent on the first tenth of the break, which is the shoulder and the
  // upper body, and the plinth, the legs and the far side are cut coarse:
  // they are drawn intact for the whole shot and never seen to break.
  // 0.075/0.155 graded around the shoulder was 476 pieces, mean radius
  // 0.230 and 0.260 among the first 45 released; at the flat sweep this was
  // 493 pieces, mean radius 0.217 and 0.162 among the first 45. At the
  // 40-degree sweep it is 421 pieces, 0.223 and 0.169, in a 54 s cut: the
  // order changed, so the fine end of the grading moved with it and 72
  // coarse pieces in the never-seen part of the figure merged away. The
  // pieces the break opens with are the same size they were.
  //
  // The near end only bites with the two settings below it. At 4200
  // candidates and variationNear 1 (the field at full strength), halving
  // spacingNear from 0.075 to 0.05 moved the pieces within 0.55 of the
  // shoulder by nothing at all: mean radius 0.232 either way.
  //
  // ASKED FOR LARGER PIECES, and this is most of where they came from —
  // together with the radial grain below, which lengthens every cell along
  // the line from the blow and so takes a third of the seeds out on its own.
  // Measured on the bake: 421 pieces at a median radius of 0.194 -> 269 at
  // 0.240, and on screen through the stage's camera at panel value 0.317 the
  // median flying piece goes from 29 to 38 pixels wide (1280x800). Half again
  // the area, and a third fewer draw calls for the shadow pass to walk.
  // 4200 candidates are no longer needed for it: at 3600 they sit about 0.061
  // apart, still finer than `spacingNear`, and the cut is 33 s instead of 54.
  //
  // AND THEN ASKED FOR THE OPPOSITE, which is what the four numbers below
  // are now: "some pieces can be really small but the largest pieces should
  // be around the average sized ones right now". That is a ceiling and a
  // floor, and only one of them is free. The ceiling is what the eye is on —
  // measured over the pieces the stage is drawn long enough to show leaving
  // (releaseAt <= 0.52, which is 121 of the 269 that cut had), their radius
  // ran p10 0.120 / median 0.210 / p90 0.327 / max 0.534, with the smallest
  // at 0.057, against a whole-figure mean of 0.267. It now runs 0.091 /
  // 0.160 / 0.278 / 0.318 over 141 such pieces, smallest 0.024: the biggest
  // piece anyone sees fly is 40% smaller, the p90 is that old whole-figure
  // average, and the small end reaches less than half as far up.
  //
  // THE COUNT IS THE WALL. Every chunk costs about 2.3 GL draws a frame
  // whether it ever moves or not, and the frame only came back inside 8.3 ms
  // when the last round took the pieces from 421 to 269. Capping the radius
  // of EVERY piece at 0.24 — today's median — takes at least 770 pieces,
  // because the volume has to go somewhere; a cut that measured the
  // distribution above at its best (spacingNear 0.09, sizeVariation 2.2)
  // came out at 524. So the fineness is spent where it is seen and paid for
  // where it is not: the base and the legs, 40% of the pieces, are drawn
  // intact for the whole shot and never seen to break, and they are now cut
  // in lumps (the whole figure's max radius is 0.854 against 0.755). 320
  // pieces, up 19%.
  //
  // `spacingHold` is what makes that trade possible at all; see the option.
  //
  // What the four settle at, and what each was bought against, measured over
  // the seen pieces (p10 / median / p90 / max radius) with the piece count
  // and the front's fitted path on screen:
  //   0.105 near, hold 1.0, far 0.55, up 1.0, down 2.3: 426 pieces, -46.6
  //     deg, 0.094 / 0.170 / 0.246 / 0.284 — the distribution, over budget
  //   0.125 near, hold 1.05, far 0.60, up 1.0, down 2.5: 320 pieces, -43.9
  //     deg, 0.091 / 0.127 / 0.278 / 0.318 — as shipped
  //   0.13 near, hold 1.0, far 0.65, up 1.0, down 2.7:  316 pieces, -41.6
  //     deg, 0.076 / 0.149 / 0.274 / 0.320 — a finer small end, and the
  //     front's coherence while the stage is clear falls to 0.506 with it
  //   0.132 near, hold 1.05, far 0.62, up 1.0, down 2.8: 305 pieces, -37.5
  //     deg, 0.079 / 0.100 / 0.268 / 0.356
  //   0.125 near, hold 1.15, far 0.65, up 0.6, down 2.9: 456 pieces, -47.7
  //     deg, 0.070 / 0.099 / 0.262 / 0.297 — the smallest small end anyone
  //     measured, and 70% more pieces than the budget has
  // Below about 300 pieces the front's path starts to go: at 295 it fitted
  // 36.5 degrees below horizontal against the 41 the shot is built on.
  //
  // 5000 candidates, from 3600: the cloud is a FLOOR on cell size (a seed can
  // only sit where there is a candidate), and 3600 of them sit 0.061 apart,
  // which is coarser than the small end asked for here. At 5000 they sit
  // about 0.052 apart. The cut is 44 s.
  candidateTarget: 5000,
  spacingNear: 0.125,
  spacingFar: 0.6,
  // How far the fine spacing runs before it opens out at all, in figure
  // units of the order (see `spacingHold` in thinkerFragments for why the
  // old exponential could not do this). The stage is drawn through about the
  // first 45% of the order, and the base starts at 72% of it, so a hold that
  // covers the first and stops before the second is what puts every fine
  // piece where it is seen and every lump where it is not. 1.05 measured: no
  // piece released inside the drawn window is bigger than 0.318, where the
  // exponential grading let a 0.534 through.
  spacingHold: 1.05,
  // The width of the ramp that follows the hold, in the same units: the
  // cells go from `spacingNear` to `spacingFar` over it, so full coarseness
  // lands at 1.75 along the order — past the drawn window, short of the
  // base.
  // (Before `spacingHold` this was the exponential's own falloff, where the
  // cells were 63% of the way out at this distance: 0.20/0.45 came to 565
  // pieces and a 58 s cut, 0.24/0.40 to 383, and 0.43 was 506.)
  spacingFalloff: 0.7,
  // RINGS AND RADIAL GRAIN, both of which were off. The comments here used
  // to read "no rings: the reference's cells show no concentric structure"
  // and "no radial grain: the reference's cells are as wide as they are
  // long", and both were true readings of lukebaffait.fr. They are struck
  // out because Kevin looked at what they produced and said the pattern left
  // behind "does not resemble patterns from shattering, more as if small
  // chunks were just randomly carved out". He is describing an even convex
  // cell fracture, which is exactly what the reference is and exactly what
  // those two lines asked for. His words outrank the reference.
  //
  // What a real impact fracture has instead: cracks running OUT from the
  // blow, rings crossing them, and cells that are longer along the line from
  // the blow than they are across it. `shellBias` pulls seeds onto the
  // concentric shells around the impact, so their bisectors line up into
  // rings with spokes between; `radialStretch` shrinks the radial part of
  // the sampler's room test, so a cell has to be that much longer toward the
  // blow than it is wide.
  //
  // Measured on the bake, over the 45 pieces released first (the ones the
  // eye is on): the median piece's long axis against the line from the blow,
  // |cos|, 0.446 -> 0.638, and the share of pieces past 0.8 of it 0.244 ->
  // 0.289. A direction with no grain at all measures 0.5. Rendered, that is
  // the difference between a scoop and a splinter: the cut faces left on the
  // standing figure at panel value 0.254 go from about thirty small dents
  // scattered over the head and shoulder to a dozen long angular planes
  // meeting along one edge.
  //
  // The numbers here are where the pattern reads as broken stone and the
  // cells are still pieces rather than slabs. Baked with the spacing above:
  // stretch 1.6 / 2.0 / 2.4 gave 155 / 205 / 274 pieces at 0.55 spacing near
  // and alignment 0.615 / 0.625 / 0.638; stretch 2.0 at a coarser 0.085 /
  // 0.30 spacing came out at 87 pieces, which is the whole shoulder leaving
  // as four slabs. shellBias 1.2 / 1.8 / 2.5 moved the alignment 0.612 /
  // 0.638 / 0.677 and, past about 2, started taking the front's coherence
  // with it (0.679 at 2.5).
  shellBias: 1.8,
  radialStretch: 2.4,
  // Unevenness on the target spacing, e^±this: the reference's pieces are
  // nearly uniform, but at 0.5 ours read as a lattice ("too uniform"), so
  // this is back up to where slabs sit beside small fragments without the
  // slivers the old 3.0 made — 1.5 first, then 2.2 when 1.5 still read as
  // even, and 2.5 for the "really small" pieces of the round above — the
  // smallest piece that is seen to fly is a 0.024 speck against 0.057. That
  // is the small side; the large side is NARROWER now (`sizeVariationUp`).
  //
  // The small side is also where the piece count is decided, and it is not
  // linear: the room test makes neighbours keep the LARGER spacing, so a
  // trough in the field comes out as a PATCH of fine cells rather than one
  // small piece among big ones, and the count grows as the field's troughs
  // deepen. At 3.0 with a 8000-point candidate cloud the sampler filled to
  // the 800-piece cap whatever `spacingNear` was set to (0.055 and 0.085
  // both did it). 2.5 is the deepest trough this budget pays for: at 2.8
  // (and a coarser `spacingNear` to pay for it) the seen median falls
  // 0.160 -> 0.138 and the front's path flattens to 37.5 degrees.
  //
  // The field's up-swing is an 11x spacing at the top (e^4.8 * 0.5), and the
  // sampler measures a candidate's room against the LARGER of the two
  // spacings, so one coarse seed sets the size of everything around it —
  // which is why the shoulder stayed at a mean radius of 0.232 however fine
  // the spacing asked it to be. At 0.25 the first 45 pieces released came out
  // at 0.198 and the whole-limb lumps stayed in the part that is never seen
  // to break.
  //
  // 0.45, from 0.25: asked TWICE for more variation in the pieces' SIZE, and
  // at 0.25 the part that is seen had none to speak of. Measured over the
  // first 45 released, the ratio of the p90 piece radius to the p10: 1.93 at
  // 0.25 (and 1.93 on the cut this replaces — the last round did not move it
  // at all), 2.38 at 0.45. Over the whole figure, 3.36 -> 3.48. What it costs
  // is the front: the rank correlation of release against position along the
  // front's own line, over everything released while the stage is clear,
  // 0.762 -> 0.737 — a coarse seed near the break carries its neighbours'
  // release with it. That is the whole of the bend, and it is Kevin's ask
  // against my number.
  //
  // 1, from 0.45: all of the variation, everywhere. This was held down
  // because the field's up-swing was e^4.8 and one such seed swallowed its
  // neighbourhood — with the up-swing at 1.0 the worst a coarse patch can do
  // is 1.6x, and holding the variation down was then only holding the SMALL
  // pieces back where they are most wanted. Over the first 45 released the
  // p90/p10 radius ratio goes 2.38 -> 2.95, and over the whole figure
  // 3.48 -> 3.56.
  variationNear: 1,
  sizeVariation: 2.5,
  // The up-swing, e^+this, and it is the direct reverse of the round before:
  // it was 4.8, which is an 11x spacing at the field's top and is where the
  // whole-limb lumps came from ("the biggest pieces 150% bigger, the
  // smallest left alone", after lukebaffait.fr's cloud of even pieces with a
  // few limbs among them). Kevin looked at that and asked for the largest
  // pieces to come down to the size of the average one. At 1.0 the worst a
  // coarse patch can do is about 1.6x its target spacing, and the biggest
  // piece released inside the drawn window measures 0.318 where 4.8 let
  // 0.534 through. Dropping it further (0.6) is worth another 0.02 on that
  // max and costs 140 pieces, because the seeds it takes off the top have to
  // go somewhere.
  sizeVariationUp: 1.0,
  // Safety cap; the spacing stops the sampler first. A cut this fine is
  // only affordable because it is baked (bakedPath): live it would be
  // minutes in a worker, longer than the reveal's failure net.
  maxPieces: 800,
  // The hand, placed by hand. The break has to open with the hand itself
  // coming apart into several pieces before anything else moves, and left
  // to the sampler it only ever put two cells there — the third piece to go
  // was already most of a figure-unit away. These five sit across the palm
  // and knuckles (measured on the model; they are the hand seeds the
  // original arm-path fracture used), they are the closest seeds to the
  // blow. (They were also the first things to release, back when the
  // break started at the hand; the order starts at the shoulder now and
  // these only decide that the hand comes apart rather than leaving as
  // one lump.)
  guardSeeds: [
    fraction(-1.22, -0.38, 0.58),
    fraction(-1.1, -0.2, 0.68),
    fraction(-1.24, -0.31, 0.71),
    fraction(-1.06, -0.33, 0.59),
    fraction(-1.15, -0.08, 0.7),
  ],
  direction: flightDirectionInFigureSpace(),
  // Each piece also flies a little along its OWN way out of the stone — the
  // mean of the skin it owned — on top of the common push above.
  //
  // Asked for "a pattern that doesn't have the pieces phasing through each
  // other". Every piece flew the SAME way, so a piece's straight path could
  // run through marble that was still standing, and two pieces that left
  // from different places at different moments could cross. A piece that
  // carries its own outward normal leaves the body the short way and
  // neighbours on a curved surface separate by construction.
  //
  // Measured with the sampled-point audit over the drawn break (a quarter or
  // more of one piece's points inside another at some moment): pairs of
  // FLYING pieces 10 -> 4, and those overlapping for 0.06 of the break or
  // longer 10 -> 2; pieces a quarter or more inside STANDING marble 7 -> 3.
  // Separation on screen at panel value 0.317 improves with it rather than
  // against it: flying pixels covered by two or more pieces 0.337 -> 0.203,
  // the nearest other piece 0.549 -> 0.624 piece sizes, the share of a
  // piece's outline bordering black 0.28 -> 0.402.
  //
  // It costs the stream's tightness, and that is the trade: the first 120
  // pieces off spread 5 / 8.3 / 17.5 degrees about the stream's mean on
  // screen (median / p75 / p90) and now spread 17.5 / 27.2 / 38.0 — which is
  // lukebaffait.fr's own cloud, measured at 13 / 20 / 38. The stream still
  // reads leftward: its mean direction is 150 degrees on screen, from 147,
  // and the paths are as straight as they were. 0.18 left 4 pairs lasting;
  // 0.32 took the standing count to 3 but pulled the mean another degree
  // off and started to read as a puff rather than a stream.
  outwardPush: 0.24,
  headFrom: 0.84,
  legsFrom: 0.4,
  seed: 211,
  spread: 1.5,
};


/**
 * A build that ran and failed — the model missing, a parse error, the
 * fracture throwing — as opposed to the worker itself failing to start.
 * The main-thread fallback is for the latter only: the same build on the
 * main thread would fail the same way, after a fetch and a multi-second
 * freeze.
 */
class ChunkBuildError extends Error {}

async function buildOnMainThread(options: BuildSolidChunkOptions) {
  const geometry = await loadThinkerGeometry(options.modelPath, options.normalizeHeight);
  const build = buildSolidThinkerChunks(geometry, options);

  geometry.dispose();

  return build;
}

// One worker for every figure. It is made on the first request, handles the
// requests one at a time in the order they arrived (the fracture is CPU
// bound, so two at once would only slow each other down — and the statue
// is the one the reveal is waiting on), and is dropped once the last one
// has been answered, so nothing idles in the background on the page.
let worker: Worker | null = null;
let queued = 0;
let queue: Promise<unknown> = Promise.resolve();

function runInWorker(options: BuildSolidChunkOptions) {
  return new Promise<ThinkerChunkBuild>((resolve, reject) => {
    const instance =
      worker ??
      (worker = new Worker(new URL("./thinkerFragments.worker.ts", import.meta.url)));

    instance.onmessage = (event: MessageEvent<{ build?: ThinkerChunkBuild; error?: string }>) => {
      if (event.data.build) resolve(event.data.build);
      else reject(new ChunkBuildError(event.data.error ?? "Chunk worker returned nothing."));
    };
    instance.onerror = (event) => {
      // The worker itself is broken — its script failed to load, or it
      // crashed — rather than one build having failed. Throw it away so the
      // next request starts a fresh one instead of posting into the void.
      instance.terminate();
      if (worker === instance) worker = null;
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };
    instance.postMessage(options);
  });
}

function buildInWorker(options: BuildSolidChunkOptions) {
  queued += 1;
  const run = queue
    .then(() => runInWorker(options))
    .finally(() => {
      queued -= 1;
      if (queued === 0 && worker) {
        worker.terminate();
        worker = null;
      }
    });

  queue = run.catch(() => undefined);

  return run;
}

/**
 * A fingerprint of everything that decides a build's result, so a baked
 * copy is only trusted while it matches: the options (minus where the bake
 * lives) and a version of the cut itself, bumped by hand when the fracture
 * code changes what it makes from the same options.
 */
// 9: the release texture, the flight scatter and its repairs, the spin
// spread (all option-gated, but the order's guard was restructured).
// 10: cut-face normals rebuilt from the bent triangles, seal lids wound
// outward (same pieces, same release order; only the normals differ).
// 11: RELEASE_ACCELERATION 6 -> 1.5 (same order, even gaps).
// 12: the release rate ramps 1 -> 10 over breakup 0 to 0.51, then holds;
// releaseTexture.amount 0.1 -> 0.05 (same pieces, new order and times).
// 13: TRAVEL_WINDOW 0.55 -> 0.35, crossing checks run to 0.52, standing
// blockers are released a moment sooner (clearStandingBlockers), spinSpread
// [0.6, 1.5] -> [0.4, 2.0] (same pieces; new flights, spins and times).
// 14: `outwardPush` (a new term in every flight), and stageTravelAt now
// carries the stage's unstick, which is what the crossing checks pose
// pieces with. The options changed too, but those are fingerprinted; this
// is for the code that reads them.
// 15: `neighbours` (which piece's cut faces are the wall of which cavity)
// is found by POSITION rather than by Vector3 identity, so a piece whose
// shared face never reaches the skin is exposed when its neighbour leaves
// instead of when it leaves itself. Same pieces, same order, same flights;
// 110 of the 269 chunks get an earlier `exposedAt`.
// 16: the pieces have weight. The crossing checks pose them with the fall
// (stageFallAt) and with a travel curve that stops slowing at the knee
// rather than at the window's end (stageTravelAt), which is what the stage
// draws now. Same pieces and same order; the flights the checks straighten
// differ.
export const FRACTURE_VERSION = 16;

export function chunkOptionsFingerprint(options: BuildSolidChunkOptions) {
  const rest: Partial<BuildSolidChunkOptions> = { ...options };
  delete rest.bakedPath;
  const text = `${FRACTURE_VERSION}:${JSON.stringify(rest)}`;
  // FNV-1a, 32-bit; the same in scripts/bake-chunks.mjs by construction
  // (it imports this function).
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The bake's binary layout; a bake in any other layout is cut live instead. */
export const BAKED_FORMAT = "q16n8";

type BakedChunkRecord = {
  center: [number, number, number];
  exposedAt: number;
  offset: [number, number, number];
  phase: "head" | "upper" | "lower";
  radius: number;
  releaseAt: number;
  scale: number;
  spin: [number, number, number];
  travel: number;
  /**
   * Byte offset and element count of each array in the .bin: positions as
   * int16 against `positionRange` (about the chunk's centre), normals as
   * int8 over -1..1.
   */
  surfacePositions: [number, number];
  surfaceNormals: [number, number];
  interiorPositions: [number, number];
  interiorNormals: [number, number];
};

export type BakedChunksHeader = {
  format: string;
  fingerprint: string;
  /** The largest |coordinate| of any position about its chunk's centre. */
  positionRange: number;
  breakOrigin: [number, number, number];
  drift: [number, number, number];
  stats: ThinkerChunkBuild["stats"];
  chunks: BakedChunkRecord[];
  byteLength: number;
};

/**
 * A build that was cut ahead of time (scripts/bake-chunks.mjs): the JSON
 * header and one binary of every chunk's arrays. The cut is deterministic,
 * so this is the same build the worker would make, in a fraction of a
 * second instead of tens of them — and the television no longer holds on
 * the fracture. Rejected, and the live cut used instead, when the header's
 * fingerprint is not these options'.
 */
async function loadBakedChunks(options: BuildSolidChunkOptions): Promise<ThinkerChunkBuild> {
  const path = options.bakedPath;
  if (!path) throw new Error("no baked path");
  // Low priority: this is asked for as the page mounts, while the
  // television's model and textures — what the first frame is waiting
  // on — are still coming down, and the statue is not seen until the
  // panel opens after the intro. (The page used to <link rel=preload> the
  // statue's glTF at the textures' priority: 1.9 MB this path never
  // reads.) `priority` is a hint Chromium honours and others ignore.
  const low: RequestInit = { priority: "low" };
  const [headerResponse, binResponse] = await Promise.all([
    fetch(`${path}.json`, low),
    fetch(`${path}.bin`, low),
  ]);
  if (!headerResponse.ok || !binResponse.ok) {
    throw new Error(`baked chunks missing at ${path}`);
  }
  const header = (await headerResponse.json()) as BakedChunksHeader;
  if (header.format !== BAKED_FORMAT) {
    throw new Error(`baked chunks are in layout ${header.format}, want ${BAKED_FORMAT}`);
  }
  const expected = chunkOptionsFingerprint(options);
  if (header.fingerprint !== expected) {
    throw new Error(`baked chunks are stale (${header.fingerprint}, want ${expected})`);
  }
  const bin = await binResponse.arrayBuffer();
  if (bin.byteLength !== header.byteLength) {
    throw new Error(`baked chunks binary is ${bin.byteLength} bytes, header says ${header.byteLength}`);
  }
  // Back to floats: the geometry wants float32 attributes, and the file
  // is a third the size for the trip.
  const positionScale = header.positionRange / 32767;
  const positions = ([offset, count]: [number, number]) => {
    const packed = new Int16Array(bin, offset, count);
    const out = new Float32Array(count);
    for (let i = 0; i < count; i += 1) out[i] = packed[i] * positionScale;
    return out;
  };
  const normals = ([offset, count]: [number, number]) => {
    const packed = new Int8Array(bin, offset, count);
    const out = new Float32Array(count);
    for (let i = 0; i < count; i += 1) out[i] = packed[i] / 127;
    return out;
  };
  return {
    breakOrigin: header.breakOrigin,
    chunks: header.chunks.map((record, index) => ({
      center: record.center,
      debug: { capStats: [], sourceIndex: index },
      exposedAt: record.exposedAt,
      interiorNormals: normals(record.interiorNormals),
      interiorPositions: positions(record.interiorPositions),
      offset: record.offset,
      phase: record.phase,
      radius: record.radius,
      releaseAt: record.releaseAt,
      scale: record.scale,
      spin: record.spin,
      surfaceNormals: normals(record.surfaceNormals),
      surfacePositions: positions(record.surfacePositions),
      travel: record.travel,
    })),
    drift: header.drift,
    stats: header.stats,
  };
}

const pending = new Map<string, Promise<ThinkerChunkBuild>>();

/**
 * The chunks for one figure, built once per page under `key` and shared by
 * everyone who asks for that key. A failed build is remembered as failed —
 * logged once, here — rather than retried: the page asks for each figure
 * as it mounts and the stage asks again when it appears, and a model that
 * is missing is still missing the second time.
 */
export function loadChunks(key: string, options: BuildSolidChunkOptions) {
  let promise = pending.get(key);

  if (!promise) {
    const cutLive = () =>
      typeof Worker === "undefined"
        ? buildOnMainThread(options)
        : buildInWorker(options).catch((error: unknown) => {
            if (error instanceof ChunkBuildError) throw error;
            console.warn(`Chunk worker failed for "${key}"; building on the main thread.`, error);
            return buildOnMainThread(options);
          });
    // The baked copy first, when there is one; a live cut only as the
    // fallback, with a warning so a stale bake is noticed in development.
    const attempt = options.bakedPath
      ? loadBakedChunks(options).catch((error: unknown) => {
          console.warn(`Baked chunks unusable for "${key}"; cutting live.`, error);
          return cutLive();
        })
      : cutLive();

    promise = attempt.catch((error: unknown) => {
      console.error(`Unable to build the "${key}" chunks.`, error);
      throw error;
    });
    pending.set(key, promise);
  }

  return promise;
}

/** The statue's chunks. */
export function loadThinkerChunks(options = THINKER_CHUNK_OPTIONS) {
  return loadChunks("thinker", options);
}
