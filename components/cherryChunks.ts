import { type BuildSolidChunkOptions } from "@/components/thinkerFragments";
import {
  flightDirectionInFigureSpace,
  loadChunks,
  loadThinkerChunks,
} from "@/components/thinkerChunks";

/**
 * The cherry tree's chunks: the intro's tree, baked to a single closed
 * surface (public/model/cherry — the upper trunk from about 45% of its
 * height up, with its primary and secondary boughs, cut flat at the base),
 * carved into solid pieces by the same fracture the statue uses. It takes
 * the stage from the statue when the panel's growth cuts (see `stageCut`
 * in sceneFx and the cut in ThinkerStage) and breaks from there, the same
 * marble, the same flight, while the panel finishes filling the screen.
 */

export const CHERRY_MODEL_PATH = "/model/cherry/scene.gltf";

/**
 * The tree's resting turn on the stage, about the vertical.
 *
 * The intro draws the tree from +z (its camera sits on the +z axis looking
 * at the origin, see sakuraStage), so the model's +z side is the side the
 * page has already shown. The shot this figure is first seen from is the
 * statue's cut angle, 55 degrees clockwise of +z (CUT_AZIMUTH in
 * ThinkerStage); turning the tree by the same angle puts the side the page
 * knows in front of the lens.
 */
export const CHERRY_BASE_YAW = -55 * (Math.PI / 180);

export const CHERRY_CHUNK_OPTIONS: BuildSolidChunkOptions = {
  modelPath: CHERRY_MODEL_PATH,
  // Where the tree broke: the junction, where the primary boughs leave the
  // trunk. Given as fractions of the model's own bounding box, which the
  // fracture measures off the loaded geometry, so this holds through any
  // re-bake of the model at the same proportions. Measured off the bake
  // (scripts/bake-cherry.mjs, see cherry-meta.json): the six primaries fork
  // between 9% and 19% of the way up the cut-down trunk, on the box's
  // centre line in plan, and their mean fork point is this. The trunk's
  // top is at half height; everything above it is bough.
  impact: [0.505, 0.143, 0.526],
  // Finer than the statue's cells (0.08 / 0.4 there): the boughs are thin,
  // and a cell the width of a bough cuts it into rings rather than pieces,
  // so the tree wants smaller cells to read as breaking rather than
  // unscrewing. Every seed costs about 70 ms of worker time whatever the
  // model, and this build sits on the television hold behind the
  // statue's, which is why this is not finer still. Finest at the
  // junction, coarsening out along the boughs.
  spacingNear: 0.055,
  spacingFar: 0.18,
  spacingFalloff: 0.9,
  shellBias: 0.5,
  sizeVariation: 2.1,
  // The statue's shard stretch, unchanged: pieces run long towards the
  // junction, the way the statue's run towards the blow.
  radialStretch: 3.0,
  // A safety cap, not a target: the spacing above stops the sampler
  // first. The tree is cut AFTER the statue in the same worker (see
  // loadCherryChunks), and the reveal waits on both, so every piece here
  // is added straight onto the television's hold.
  maxPieces: 200,
  // No hand to place by hand: the junction is on the trunk's axis, and the
  // graded scatter already puts the finest cells there.
  guardSeeds: [],
  // The stage's flight, in the tree's own space: the world direction is
  // the statue's, turned back through the tree's yaw rather than the
  // statue's.
  direction: flightDirectionInFigureSpace(CHERRY_BASE_YAW),
  // The release phases are the statue's head / body / legs, by height.
  // On the tree: the tips of the boughs (the top quarter), the boughs and
  // junction, and the trunk below, so the tips go first and the trunk
  // last — the same top-down order as the statue.
  headFrom: 0.75,
  legsFrom: 0.25,
  seed: 211,
  spread: 1.5,
};

/**
 * The tree's chunks, built once per page. The statue's build is asked for
 * first, in the same tick, so the worker's queue (see thinkerChunks) has
 * the statue ahead of the tree whoever asks first: the statue, which the
 * television shot is waiting on, is never slowed by the tree, and the tree
 * follows it in the same worker rather than starting a second one. (Not
 * chained on the statue's promise: by the time a `.then` on it ran, the
 * queue had already seen itself empty and dropped the worker.)
 */
export function loadCherryChunks() {
  void loadThinkerChunks().catch(() => undefined);

  return loadChunks("cherry", CHERRY_CHUNK_OPTIONS);
}
