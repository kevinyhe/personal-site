/**
 * What happens when, as plain functions of one number.
 *
 * `u` is how far the page has scrolled past the top of the design, in
 * screens: 0 when the design's top edge meets the top of the window, 1 one
 * screen later. The scene and the DOM text both read these, so a panel and
 * the words beside it can never disagree about who is on.
 *
 *   0 .. 5      the travel: panel i is in front of the camera at u = i + 0.5
 *   5 .. 10     the points form the five skill group names, one per screen
 *   10 .. 11.5  the ribbons close into a ring round the email
 */

export const PANELS = 5;
export const WORDS = 5;

export const WORK_SCREENS = 6;
export const SKILLS_SCREENS = 6;
export const CONTACT_SCREENS = 2.5;

export const SKILLS_AT = 5;
export const CONTACT_AT = 10;
export const END_AT = 11.5;

/** World units between one panel and the next, along z. */
export const SPACING = 22;
/** How far in front of a panel the camera stands when the panel is on. */
export const VIEW_DIST = 9;
/** World units the camera drifts per screen once the travel is over. */
const DRIFT = 4.4;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * How far the camera has gone, in world units (it moves towards -z, so its
 * z is minus this).
 *
 * A straight line would pass each panel at full speed and give nobody time
 * to read. This is a line with a slow wave taken off it: nearly still at
 * each panel (a fifth of the average speed), quick in between.
 */
export function travel(u: number): number {
  if (u <= 4.5) {
    const x = u - 0.5;
    return SPACING * (x - (0.8 * Math.sin(2 * Math.PI * x)) / (2 * Math.PI));
  }
  // Past the last panel: one more push to put it behind the camera (it
  // would otherwise hang in front of the words), then a slow drift. Both
  // ends of the push have the drift's speed, so nothing jerks.
  return SPACING * 4 + DRIFT * (u - 4.5) + 13 * smoothstep(4.5, 5.25, u);
}

/** The u at which panel i is on. */
export const panelAt = (i: number): number => i + 0.5;

/** 1 while panel i faces the camera, 0 when it hangs at rest. */
export function panelFocus(i: number, u: number): number {
  return 1 - smoothstep(0.22, 0.5, Math.abs(u - panelAt(i)));
}

/** Opacity of the text beside panel i. Narrower than the focus: the words
 *  come in after the panel has turned and go before it turns away. */
export function panelText(i: number, u: number): number {
  return 1 - smoothstep(0.17, 0.34, Math.abs(u - panelAt(i)));
}

/** Which panel the travel is nearest to. */
export function nearestPanel(u: number): number {
  return Math.max(0, Math.min(PANELS - 1, Math.round(u - 0.5)));
}

/**
 * The words. `from` and `to` are the two group indices the points are
 * between, `mix` how far from one to the other, `form` how far the points
 * have left the field for the word at all.
 */
export function wordState(u: number): { from: number; mix: number; form: number } {
  const x = u - (SKILLS_AT + 0.5);
  const from = Math.max(0, Math.min(WORDS - 2, Math.floor(x)));
  const mix = smoothstep(0.3, 0.7, x - from);
  const form = smoothstep(SKILLS_AT - 0.02, SKILLS_AT + 0.3, u) * (1 - smoothstep(CONTACT_AT - 0.12, CONTACT_AT + 0.2, u));
  return { from, mix, form };
}

/** Opacity of the list under word k. The first holds from the moment its
 *  word has formed and the last until its word lets go. */
export function groupText(k: number, u: number): number {
  const x = u - (SKILLS_AT + 0.5);
  const near = 1 - smoothstep(0.2, 0.32, Math.abs(x - k));
  if (k === 0 && x < 0) return smoothstep(SKILLS_AT + 0.2, SKILLS_AT + 0.34, u);
  if (k === WORDS - 1 && x > k) return 1 - smoothstep(CONTACT_AT - 0.2, CONTACT_AT - 0.06, u);
  return near;
}

/** Which word the scroll is nearest to. */
export function nearestWord(u: number): number {
  return Math.max(0, Math.min(WORDS - 1, Math.round(u - (SKILLS_AT + 0.5))));
}

/** 0 while the ribbons run free, 1 when they are the ring. */
export function ringAmount(u: number): number {
  return smoothstep(CONTACT_AT - 0.1, CONTACT_AT + 0.7, u);
}

/** Opacity of the email and links. They wait for the ring. */
export function contactText(u: number): number {
  return smoothstep(CONTACT_AT + 0.4, CONTACT_AT + 0.8, u);
}

/** Which side of the travel each panel hangs on: 1 right, -1 left. The
 *  text for a panel stands on the other side. */
export const PANEL_SIDE = [1, -1, 1, -1, 1] as const;
