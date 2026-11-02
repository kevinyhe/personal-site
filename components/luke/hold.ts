/**
 * The hold between Work and Skills.
 *
 * The moment the bottom line of Work's last row (Sharingan's hairline) has
 * gone off the top of the screen, the page stops: for HOLD screens of
 * scroll nothing on it moves with the scroll, and the scroll runs the way
 * into Skills instead. The clouds start going sideways at once
 * (CloudPassage.tsx); the koi's stroke stops where it is and the koi swim
 * on along it, off the screen (WorkIndex.tsx); the "Each project..."
 * sentence comes up word by word, and the robot drives in from the right
 * and across to its place on the left, wiping the sentence away in front
 * of it and leaving Skills behind it, and starts to turn on the spot
 * (Skills.tsx). Then the page scrolls again, Skills with it.
 *
 * There is no pin. Skills starts at the screen's top when the hold does,
 * and what is on the screen through it is sticky.
 */

/** Screens of scroll the page is held for. */
export const HOLD = 2.8;
/** Work's foot under its list, in screens (pb-[84vh], WorkIndex.tsx):
 *  where Skills' top would be, down the screen, when the hold starts.
 *  Skills is pulled up over it. */
export const WORK_FOOT = 0.84;

/** Screens scrolled since the last row's bottom line left the top of the
 *  screen: 0 before, past HOLD once the hold is over. */
export function heldFor(): number {
  const list = document.querySelector("#work ol");
  if (!list) return 0;
  return Math.max(0, -list.getBoundingClientRect().bottom / window.innerHeight);
}
