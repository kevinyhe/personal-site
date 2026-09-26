/**
 * Where a falling petal comes from.
 *
 * The 2D petal field (PetalDrift) and the 3D bough (sakuraBough) have to
 * agree on one thing and nothing else: the screen positions of the twigs
 * that are overhead right now. This file is that agreement, and it is its
 * own module for one reason — sakuraBough imports BareThreeCanvas, all
 * 8,100 lines of it plus three, and PetalDrift must not pull that into its
 * chunk just to read two numbers.
 *
 * No three import here, on purpose. Keep it that way.
 */

/** How many twig tips the bough publishes. */
export const SPAWN_POINT_COUNT = 28;

/** Screen pixels below a twig tip a petal is handed to the field, so it does
 *  not appear on top of the blossom it came off. */
export const SPAWN_DROP_PX = 7;

/**
 * Twig tips of the bough, in viewport CSS pixels, refreshed every frame the
 * stage runs. `count` is how many are usable RIGHT NOW: it drops to 0 when the
 * bough is off screen, when the blossoms have not opened yet, and while the
 * stage is not running at all (off screen, hidden tab, reduced motion, or no
 * WebGL). A consumer that finds count === 0 should fall back to whatever it
 * did before — the bough is simply not overhead.
 *
 * A module singleton on purpose: a shared mutable record is the cheapest wire
 * between a WebGL element and a 2D canvas that does not allocate per frame.
 */
export type BoughSpawnField = {
  /** Usable points; the first `count` xy pairs of `points`. */
  count: number;
  /** x, y, x, y … in viewport CSS px, origin top-left. */
  points: Float32Array;
  /** Stage frame index the points were written on. */
  frame: number;
};

export const boughSpawn: BoughSpawnField = {
  count: 0,
  frame: -1,
  points: new Float32Array(SPAWN_POINT_COUNT * 2),
};

/**
 * Picks one spawn point under the bough. Returns false when the bough is not
 * overhead, in which case the caller should spawn the way it always has.
 *
 * Writes into `out` rather than returning a point: this is called once per
 * recycled petal, which is a few times a second forever.
 */
export function sampleBoughSpawn(rng: () => number, out: { x: number; y: number }) {
  const count = boughSpawn.count;
  if (count <= 0) return false;
  const index = Math.min(count - 1, Math.floor(rng() * count)) * 2;
  out.x = boughSpawn.points[index];
  out.y = boughSpawn.points[index + 1] + SPAWN_DROP_PX;
  return true;
}
