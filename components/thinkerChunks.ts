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
  // The cells are graded along the order rather than around a point: see
  // the spacing notes below.
  gradeAlongSweep: true,
  // The cells, after lukebaffait.fr's own break (frames of its hero
  // sequence, a Blender cell fracture of The Creation of Adam): blocky,
  // convex, nearly all the same size — about a tenth of the figure's
  // height across — with no slivers, no rings and no radial grain, coming
  // apart in a front that sweeps from the nearest point to the farthest.
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
  candidateTarget: 4200,
  spacingNear: 0.05,
  spacingFar: 0.22,
  // Cells reach full size within this far ALONG THE ORDER (the rank turned
  // back into figure units, so it still reads as a distance). Steep: it is
  // what decides how much of the figure is cut fine, and so most of the
  // piece count. 0.20/0.45 came to 565 pieces and a 58 s cut, 0.24/0.40 to
  // 383; 0.22/0.43 is 506, within 10% of the 476 this replaces.
  spacingFalloff: 0.43,
  // No rings: the reference's cells show no concentric structure.
  shellBias: 0,
  // No radial grain: the reference's cells are as wide as they are long
  // (1 is none; the sampler clamps below it).
  radialStretch: 1,
  // Unevenness on the target spacing, e^±this: the reference's pieces are
  // nearly uniform, but at 0.5 ours read as a lattice ("too uniform"), so
  // this is back up to where slabs sit beside small fragments without the
  // slivers the old 3.0 made — 1.5 first, then 2.2 when 1.5 still read as
  // even. That is the small side; the large side is wider still.
  //
  // A quarter of it over the part the break opens with. The field's
  // up-swing is an 11x spacing at the top (e^4.8 * 0.5), and the sampler
  // measures a candidate's room against the LARGER of the two spacings, so
  // one coarse seed sets the size of everything around it — which is why
  // the shoulder stayed at a mean radius of 0.232 however fine the spacing
  // asked it to be. At 0.25 the first 45 pieces released come out at 0.198
  // and the whole-limb lumps stay in the part that is never seen to break.
  variationNear: 0.25,
  sizeVariation: 2.2,
  // The biggest pieces asked for at 150% bigger with the smallest left
  // alone. The field is a product of sines and rarely leaves +-0.5, so
  // the swing has to be steep to move the top end: 3.1 (e^3.1 against
  // e^2.2, "2.5x" on paper) measured +6% on the ten biggest pieces; this
  // is what it takes for 2.5x. After lukebaffait.fr, whose cloud is
  // mostly even pieces with a few whole limbs among them.
  sizeVariationUp: 4.8,
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
export const FRACTURE_VERSION = 8;

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
