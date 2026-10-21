import { hexToRgb, type Rgb } from "@/components/valley/barShader";
import { GROUND, INK } from "@/components/luke/theme";

/**
 * The colour change the cloud bank brings. At 0 the page is the band's:
 * plum ground, pink ink. At 1 it is the cloud's: pink ground, plum ink, as
 * in the closed bank where the birds are dark on pink. CloudPassage.tsx sets the
 * amount from the scroll; WorkIndex.tsx and the cloud layer read it.
 */

const plum = hexToRgb(GROUND);
const pink = hexToRgb(INK);
/** The clouds once they are Work's backdrop: a deeper rose on the pink
 *  ground, faint enough that the plum type stays readable over them. */
const rose = hexToRgb("#eea6cc");

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const ground = (t: number): Rgb => mix(plum, pink, t);
/** WCAG relative luminance. */
const lum = (c: Rgb): number => {
  const ch = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
};
/** WCAG contrast ratio of two colours. */
export const contrast = (a: Rgb, b: Rgb): number => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** The least contrast the type may have with the ground (WCAG AA, 4.5,
 *  with a little room). */
const FLOOR = 4.6;
const black: Rgb = [0, 0, 0];
const white: Rgb = [1, 1, 1];

/**
 * The type's colour, for the ground at t. NOT a straight mix of the two
 * inks: half way between plum and pink the ground is a mid mauve that
 * neither plum nor pink reads on (3.8:1 and 3.1:1). So the type stays plum
 * while plum reads, deepens toward black as the ground darkens, flips to
 * white at the one point where black stops reading and white starts, and
 * then cools back to pink. The ground moves smoothly; the type takes the
 * single quick step, where the contrast is lowest.
 */
export const ink = (t: number): Rgb => {
  const g = ground(t);
  if (contrast(plum, g) >= FLOOR) return plum;
  if (contrast(pink, g) >= FLOOR) return pink;
  // How far toward black (dark side) or white (light side) the type must
  // go to clear the floor: the smallest step that does.
  const dark = contrast(black, g) >= contrast(white, g);
  const from = dark ? plum : pink;
  const to = dark ? black : white;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i += 1) {
    const m = (lo + hi) / 2;
    if (contrast(mix(from, to, m), g) >= FLOOR) hi = m;
    else lo = m;
  }
  return mix(from, to, hi);
};
export const cloud = (t: number): Rgb => mix(pink, rose, t);

export const css = (c: Rgb): string =>
  `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

type Listener = (t: number) => void;
const listeners = new Set<Listener>();
let current = 0;

export function setPalette(t: number): void {
  if (Math.abs(t - current) < 0.001) return;
  current = t;
  for (const l of listeners) l(t);
}

/** Calls back now and on every change; returns the unsubscribe. */
export function onPalette(l: Listener): () => void {
  listeners.add(l);
  l(current);
  return () => {
    listeners.delete(l);
  };
}
