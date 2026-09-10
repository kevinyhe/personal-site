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
 * the whole move reads right-to-left). The eye has been raised twice, by
 * a fifth and then a quarter of the offset's length (y 0.18 -> 0.46 ->
 * 0.82 per unit, before normalising): from below the hand the face was
 * cut off by the top of the frame and the shot opened on a chin; now it
 * looks down on the head from above the hand.
 */
export const CAMERA_OFFSET_CLOSE = new THREE.Vector3(0.95, 0.82, 1).normalize();
/**
 * Far enough back that the blow reads in context — the base and the legs
 * above it — rather than filling the frame with anatomy you cannot place.
 */
export const CAMERA_DISTANCE_CLOSE = 2.6;
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

/** The blow, in the figure's own units: the hand, nearest the lens. */
const IMPACT_POINT = new THREE.Vector3(-1.157, -0.229, 0.628);

/**
 * The camera's opening eye in the figure's own space: the aim (the blow,
 * lifted) plus the opening offset at its distance, turned back through
 * the stage's yaw. The pieces come loose in order of their distance from
 * here, nearest the lens first (see `releaseFrom`).
 */
const OPENING_EYE = (() => {
  const eye = CAMERA_OFFSET_CLOSE.clone()
    .multiplyScalar(CAMERA_DISTANCE_CLOSE)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -THINKER_BASE_YAW)
    .add(IMPACT_POINT);
  eye.y += IMPACT_AIM_LIFT;
  return [eye.x, eye.y, eye.z] as [number, number, number];
})();

// The way the pieces fly: level, toward the viewer, drifting left as they
// come (after lukebaffait.fr, whose fragments stream past the viewer).
// Toward the viewer is what lets the break start at the hand — it is the
// part of the figure nearest the lens, so nothing stands in its way — and
// each piece behind it finds its own path clear once the ones in front
// have gone. The camera sits above the figure, so its own direction has a
// lift in it; the drift takes that out, so that the chest is not in the
// hand's path nor the knees in the chest's. Turned back through the
// stage's yaw so the builder can plan it in the figure's own space.
// Compensated when the camera moved right (0.42 -> 0.85): the flight is
// defined as CAMERA_OFFSET + this, so moving the camera would otherwise have
// swung the pieces' path with it — and the pieces' motion was to stay exactly
// as it was. Solved so the sum, and therefore the flight direction in figure
// space, is unchanged to 0.0000 degrees.
const FLIGHT_DRIFT_VIEW = new THREE.Vector3(-0.758, -0.216, 0.146);

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
  // Where the figure struck: the HAND itself, hanging over the knee. It is
  // the part of the figure nearest the lens, so it is both what a forward
  // topple lands on and the one place the break can start with nothing in
  // front of it. Measured on the model surface (it was the first point of
  // the arm path this fracture replaced). The break radiates from here, so
  // this is also what comes apart first — put it up the forearm instead and
  // the whole arm goes at once rather than the hand alone.
  impact: fraction(IMPACT_POINT.x, IMPACT_POINT.y, IMPACT_POINT.z),
  // The order of the break runs from the lens outward: the pieces nearest
  // the camera's opening eye go first, the far side of the figure last.
  // The blow was the origin before, and it was placed as the point nearest
  // the lens, so the two orders mostly agree; this makes the rule the
  // camera's rather than the blow's.
  releaseFrom: OPENING_EYE,
  // The cells, after lukebaffait.fr's own break (frames of its hero
  // sequence, a Blender cell fracture of The Creation of Adam): blocky,
  // convex, nearly all the same size — about a tenth of the figure's
  // height across — with no slivers, no rings and no radial grain, coming
  // apart in a front that sweeps from the nearest point to the farthest.
  // Cell width at the blow and far from it, in figure units (height 3.1):
  // near-uniform, only a little finer at the hand so the first pieces off
  // are the smaller ones, as the reference's fingertips are.
  //
  // This replaces a long run of shard tuning (0.055 / 0.275 with a 3x
  // radial stretch and size variation 3.0: ~290 slivers and slabs, a
  // 32-36 s build) with the reference's look. The build's cost is the seed
  // count, ~70 ms a seed in a worker: 0.22 / 0.3 came to ~170 seeds and
  // 179 pieces (17 s in Node, mean piece radius 0.34); this, asked for as
  // "smaller on average", is about a quarter finer on each axis: 283 seeds
  // and 291 pieces, mean radius 0.30, 28 s in Node, volume still exact.
  spacingNear: 0.17,
  spacingFar: 0.23,
  // Cells reach full size within about a third of the figure's height of
  // the blow; with near and far this close it hardly shows.
  spacingFalloff: 0.9,
  // No rings: the reference's cells show no concentric structure.
  shellBias: 0,
  // No radial grain: the reference's cells are as wide as they are long
  // (1 is none; the sampler clamps below it).
  radialStretch: 1,
  // A little unevenness so the cells are not a lattice — e^±0.5 on the
  // target spacing — against the reference's near-uniform pieces with the
  // odd small fragment.
  sizeVariation: 0.5,
  // Safety cap; the spacing stops the sampler first.
  maxPieces: 320,
  // The hand, placed by hand. The break has to open with the hand itself
  // coming apart into several pieces before anything else moves, and left
  // to the sampler it only ever put two cells there — the third piece to go
  // was already most of a figure-unit away. These five sit across the palm
  // and knuckles (measured on the model; they are the hand seeds the
  // original arm-path fracture used), they are the closest seeds to the
  // blow, so they are the first things to release.
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
    const attempt =
      typeof Worker === "undefined"
        ? buildOnMainThread(options)
        : buildInWorker(options).catch((error: unknown) => {
            if (error instanceof ChunkBuildError) throw error;
            console.warn(`Chunk worker failed for "${key}"; building on the main thread.`, error);
            return buildOnMainThread(options);
          });

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
