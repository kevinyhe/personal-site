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
export const CAMERA_OFFSET = new THREE.Vector3(0.42, 0.3, 1).normalize();

// The way the pieces fly: level, toward the viewer, drifting left as they
// come (after lukebaffait.fr, whose fragments stream past the viewer).
// Toward the viewer is what lets the break start at the hand — it is the
// part of the figure nearest the lens, so nothing stands in its way — and
// each piece behind it finds its own path clear once the ones in front
// have gone. The camera sits above the figure, so its own direction has a
// lift in it; the drift takes that out, so that the chest is not in the
// hand's path nor the knees in the chest's. Turned back through the
// stage's yaw so the builder can plan it in the figure's own space.
const FLIGHT_DRIFT_VIEW = new THREE.Vector3(-0.5, -0.26, 0);

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
  armPieces: 12,
  bodyPieces: 19,
  // The statue's left arm, traced on the surface from the hand hanging
  // over the knee, along the forearm on the thigh, round the elbow and up
  // the upper arm to the shoulder (figure space, measured on the model).
  breakPath: [
    fraction(-1.157, -0.229, 0.628),
    fraction(-1.14, -0.119, 0.715),
    fraction(-1.026, 0.055, 0.648),
    fraction(-0.75, 0.148, 0.574),
    fraction(-0.638, 0.299, 0.757),
    fraction(-0.448, 0.415, 0.838),
    fraction(-0.326, 0.603, 0.843),
    fraction(-0.257, 0.849, 0.834),
  ],
  direction: flightDirectionInFigureSpace(),
  headFrom: 0.84,
  headPieces: 7,
  legsFrom: 0.4,
  // The path runs on the arm's camera-facing surface; the seeds sit a
  // little behind it, inside the limb.
  pathInset: [0.04, -0.02, -0.1],
  seed: 211,
  spread: 1.5,
  // Once the arm has gone the body breaks along one sweep (after
  // lukebaffait.fr): the front leaves the head and the tip of the right
  // knee together, then moves down and back to the base's rear-left
  // corner — the figure's 7 o'clock on screen — which goes last
  // (figure space, measured on the model).
  sweepHead: fraction(-0.74, 1.42, 0.47),
  sweepKnee: fraction(-0.55, 0.0, 0.92),
  sweepTail: fraction(-0.75, -1.54, -0.92),
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
