/**
 * The two colours the joins between the home page's blocks depend on.
 *
 * The valley's bars fill to BAND at the foot of the hills and run straight
 * into the statement band, whose needles then hang down over BelowIntro on
 * the same colour; BLOSSOM is the ground the bars stand on, the first
 * screen's ground and the captions below. Where the blocks meet, the two
 * sides MUST be the same value or the join shows as a line, so every block
 * reads them from here rather than carrying its own copy.
 */
export const BAND = "#170a14";
export const BLOSSOM = "#f9b9dc";

/** The light plum laid over the site's aurora below the band, so the
 *  aurora shows through everywhere at the strength the band ends on. */
export const PLUM_WASH = "rgba(42, 13, 30, 0.4)";

/** The site aurora's own colours (AuroraBackground's uBase, uDeep, uCore,
 *  uHot), as brightness stops for the dot fields, so a dotted scene reads
 *  in the same plum, mauve and blossom as the light behind the page. */
export const AURORA_RAMP: [number, string][] = [
  [0, "#1f0916"],
  [0.3, "#58304f"],
  [0.55, "#9c6890"],
  [0.78, "#e3a8ce"],
  [1, "#fbe6f2"],
];
