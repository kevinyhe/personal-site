import * as THREE from "three";

import {
  type BuildSolidChunkOptions,
  type ThinkerChunkBuild,
  buildSolidThinkerChunks,
  loadThinkerGeometry,
} from "@/components/thinkerFragments";

/**
 * One build of The Thinker's chunks per page, started early and shared:
 * the page kicks it off as it mounts (the fracture runs in a worker while
 * the television plays), and the stage picks up the same promise when it
 * appears. Falls back to building on the main thread if the worker cannot
 * start.
 */

/** The figure's resting turn on the stage, about the vertical. */
export const THINKER_BASE_YAW = Math.PI / 3;

/**
 * Where the camera sits relative to what it looks at, per unit of
 * distance: to the right and above, looking down and across at the figure.
 */
export const CAMERA_OFFSET = new THREE.Vector3(0.85, 0.3, 1).normalize();

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

function inFigureSpace(view: THREE.Vector3): [number, number, number] {
  const direction = view
    .clone()
    .normalize()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -THINKER_BASE_YAW);

  return [direction.x, direction.y, direction.z];
}

function flightDirectionInFigureSpace() {
  return inFigureSpace(CAMERA_OFFSET.clone().add(FLIGHT_DRIFT_VIEW));
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
  impact: fraction(-1.157, -0.229, 0.628),
  // Cell width at the blow and far from it; it is the RATIO, not the
  // absolute sizes, that reads as an impact. Sized against a measured wall:
  // past ~110 seeds the carve starts losing whole cells (1.4% of the
  // figure's volume goes missing as holes, at any dust-floor setting), and
  // the build passes 6 s, which the television shot has to sit through.
  // This lands at ~90 seeds — everything the density can buy before that.
  spacingNear: 0.1,
  spacingFar: 0.5,
  // Cells are most of the way to full size about a third of the figure's
  // height away from the blow.
  spacingFalloff: 0.9,
  // Enough shell pull to line the cuts up into rings and spokes, not so
  // much that they stop covering the figure evenly.
  shellBias: 0.5,
  // Cells vary either side of what their distance asks for, so the figure
  // does not break into evenly sized tiles. Measured as the volume p75/p25
  // between neighbouring chunks with the distance grading divided out: an
  // even break is 1.78x, and this is 6.73x — slabs and shards side by side.
  //
  // This used to be capped at 0.45 by the fracture losing whole cells above
  // it. That turned out to be a piece-size test measuring only a chunk's
  // SKIN (see `faceArea` in thinkerFragments): a fragment from inside the
  // figure is nearly all cut face, so it measured as nothing and was binned,
  // taking up to 2.75% of the figure's volume with it as holes. Judged by
  // all of its faces, nothing is lost at any setting tried up to 2.5.
  sizeVariation: 2.1,
  // Time budget, not a target: the carve is super-quadratic in seed count
  // and the television shot holds until the build finishes.
  maxPieces: 110,
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


let pending: Promise<ThinkerChunkBuild> | null = null;

async function buildOnMainThread(options: BuildSolidChunkOptions) {
  const geometry = await loadThinkerGeometry();
  const build = buildSolidThinkerChunks(geometry, options);

  geometry.dispose();

  return build;
}

function buildInWorker(options: BuildSolidChunkOptions) {
  return new Promise<ThinkerChunkBuild>((resolve, reject) => {
    const worker = new Worker(
      new URL("./thinkerFragments.worker.ts", import.meta.url),
    );
    const finish = () => worker.terminate();

    worker.onmessage = (event: MessageEvent<{ build?: ThinkerChunkBuild; error?: string }>) => {
      finish();
      if (event.data.build) resolve(event.data.build);
      else reject(new Error(event.data.error ?? "Thinker chunk worker returned nothing."));
    };
    worker.onerror = (event) => {
      finish();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };
    worker.postMessage(options);
  });
}

export function loadThinkerChunks(options = THINKER_CHUNK_OPTIONS) {
  if (!pending) {
    const attempt =
      typeof Worker === "undefined"
        ? buildOnMainThread(options)
        : buildInWorker(options).catch((error: unknown) => {
            console.warn("Thinker chunk worker failed; building on the main thread.", error);
            return buildOnMainThread(options);
          });

    pending = attempt.catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }

  return pending;
}
