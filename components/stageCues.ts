/**
 * The two numbers the hero timeline and the statue's stage have to agree on.
 *
 * They were `export const`s in ThinkerStage, which is fine while both sides
 * are in the same bundle. They are not: ThinkerStage arrives as its own
 * chunk now (it drags three and @react-three/fiber with it), and HeroIntro
 * needs these before it may start the reveal — so reading them off that
 * module meant the name on the front page held until a ~150 kB chunk of
 * WebGL landed, for every visitor, reduced-motion included. There was a
 * hand-copied fallback and a ten-second timeout to bound that wait, and the
 * copy was free to drift from the real values in silence.
 *
 * A leaf module ends all of it: nothing here imports anything, so it costs
 * a few bytes in the first load, both sides read the same constants, and
 * the reveal waits on nothing. This is what robotConstants.ts did for the
 * robot outro's constants, for the same reason.
 */

/**
 * Where the cut to the tree sits in the panel's growth, which is also the
 * stage's own progress (0 at the first pixel of the panel, 1 at the full
 * screen): 60% of the way, with the box a little over half the screen. The
 * statue has been coming apart for most of that. The hero timeline tweens
 * `sceneFx.stageCut` to reach 1 exactly here.
 */
export const STAGE_CUT_AT = 0.6;

/**
 * Where the statue's break ends, as a fraction of the same growth.
 */
export const BREAK_END = 0.96;

/**
 * The tree's break, on the same clock: from a beat after the cut — enough
 * to see the tree whole — to where the statue's break ends, so both figures
 * are fully open on the frame the panel fills the screen. The hero timeline
 * tweens `sceneFx.treeBreak` 0..1 across this (see sceneFx for why it is
 * tweened rather than read off the scroll).
 */
export const TREE_BREAK = { end: BREAK_END, start: STAGE_CUT_AT + 0.03 };
