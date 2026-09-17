/**
 * The sky's colours along the flight, as keys to blend between.
 *
 * Every value is a colour as it should appear on screen. The shaders do
 * no colour-space conversion, so #2a0d1e here is #2a0d1e in the picture,
 * which is what lets the first frame meet the band above it.
 *
 * Plum, deeper plum, blossom and white are the site's. Two are this
 * design's own: a rose between plum and blossom (#b04a84) and a warm
 * cream for the sun and the dawn (#fff0e0).
 */
import { BAND } from "@/components/bandColours";

const SLOTS = ["top", "horizon", "low", "cloudLit", "cloudShade", "sun", "objLight", "objShade"] as const;
export type Slot = (typeof SLOTS)[number];

type Key = { p: number; stars: number } & Record<Slot, string>;

const KEYS: Key[] = [
  // Plum night. The top is the band's own colour.
  { p: 0.0, top: BAND, horizon: "#3a122d", low: "#1f0a17", cloudLit: "#7a3062", cloudShade: "#260c1d", sun: "#8a3a6a", objLight: "#ffe3f2", objShade: "#6a3358", stars: 1 },
  // Wine.
  { p: 0.17, top: "#2d0e24", horizon: "#74214f", low: "#2a0d1e", cloudLit: "#c4568f", cloudShade: "#43153a", sun: "#d8639a", objLight: "#fff0f7", objShade: "#7c3a66", stars: 0.7 },
  // Rose.
  { p: 0.3, top: "#4b1740", horizon: "#b04a84", low: "#5c1d4a", cloudLit: "#f09ac6", cloudShade: "#6b2453", sun: "#ffb6d6", objLight: "#ffffff", objShade: "#a3567f", stars: 0.15 },
  // Blossom pink. The ground turns from dark to light between these two.
  { p: 0.39, top: "#d382b3", horizon: "#f9b9dc", low: "#ea98c6", cloudLit: "#ffffff", cloudShade: "#e592c0", sun: "#fff0e0", objLight: "#ffffff", objShade: "#c77aa6", stars: 0 },
  { p: 0.58, top: "#e39ac4", horizon: "#fbc6e2", low: "#f0a3cd", cloudLit: "#ffffff", cloudShade: "#eba0ca", sun: "#fff0e0", objLight: "#ffffff", objShade: "#cf86b0", stars: 0 },
  // Still pink enough under the lanterns for their light to show.
  { p: 0.86, top: "#eaa6cc", horizon: "#fdd3e6", low: "#f4b2d4", cloudLit: "#ffffff", cloudShade: "#f0add1", sun: "#fff0e0", objLight: "#ffffff", objShade: "#d692b9", stars: 0 },
  // Pale dawn, where it lands.
  { p: 1.0, top: "#fbdcea", horizon: "#fff4ee", low: "#fdeaf1", cloudLit: "#ffffff", cloudShade: "#f1b9d6", sun: "#fff0e0", objLight: "#ffffff", objShade: "#e3a9c8", stars: 0 },
];

const rgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

const PARSED = KEYS.map((k) => ({ p: k.p, stars: k.stars, c: SLOTS.map((s) => rgb(k[s])) }));

export type Palette = Record<Slot, { x: number; y: number; z: number }> & { stars: number };

/** Blend the keys at `p` into `out`. Allocates nothing. */
export function paletteAt(p: number, out: Palette): void {
  const q = Math.min(Math.max(p, 0), 1);
  let i = 0;
  while (i < PARSED.length - 2 && q > PARSED[i + 1].p) i += 1;
  const a = PARSED[i];
  const b = PARSED[i + 1];
  const f = Math.min(Math.max((q - a.p) / (b.p - a.p), 0), 1);
  const t = f * f * (3 - 2 * f);
  for (let s = 0; s < SLOTS.length; s += 1) {
    const o = out[SLOTS[s]];
    o.x = a.c[s][0] + (b.c[s][0] - a.c[s][0]) * t;
    o.y = a.c[s][1] + (b.c[s][1] - a.c[s][1]) * t;
    o.z = a.c[s][2] + (b.c[s][2] - a.c[s][2]) * t;
  }
  out.stars = a.stars + (b.stars - a.stars) * t;
}

export const hexToRgb = rgb;

/** The ground is light from here on, so type over it is plum, not white. */
export const LIGHT_FROM = 0.36;
