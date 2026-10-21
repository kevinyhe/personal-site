import { BAND } from "@/components/bandColours";

/**
 * Where things happen down the page, in screens x 100 past the top of the
 * design. The DOM is laid out from these and the scene reads them, so the
 * two cannot drift apart.
 */
export const TL = {
  /** The full-width plum has drawn in to the frame by here. */
  contractEnd: 50,
  /** The frame starts to open out again. */
  widenStart: 150,
  widenEnd: 215,
  /** The pieces leave the knot for the edges of the screen. */
  toRing: 152,
  /** The first card is coming up from the foot. The pieces go to the cards. */
  toWork: 238,
  /** Where #work starts. Its heading takes headH, then one screen a card. */
  workTop: 250,
  headH: 60,
  firstCard: 310,
  /** Gravity comes on. */
  toPile: 782,
  contactTop: 810,
  total: 910,
} as const;

/** The frame at rest: down from the top, in from the sides and the foot. */
export const FRAME = { top: 20, side: 3, radius: 2 } as const;

export const DEEP = "#1a0812";
/** The two colours of this design's own: a pale ground and one deep rose. */
export const PALE = "#fde9f3";
export const ROSE = "#b8174f";
/** Plum lifted enough to be seen against the deep ground. */
export const LIFT = "#3d1431";
export const WHITE = "#fffafc";

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 is the frame filling the screen, 1 is the frame at rest. */
export function frameAmount(s: number): number {
  return Math.min(smooth(0, TL.contractEnd, s), 1 - smooth(TL.widenStart, TL.widenEnd, s));
}

const hexToRgb = (h: string): [number, number, number] => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const A = hexToRgb(BAND), B = hexToRgb(DEEP);

/** The ground inside the frame: the band's plum at the join, deeper below. */
export function frameGround(s: number): string {
  const t = smooth(0, TL.contractEnd, s);
  const c = A.map((a, i) => Math.round(a + (B[i] - a) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export type StageEls = {
  frame: HTMLElement;
  /** Shown only while the frame is at rest: the legend and the hint. */
  withFrame: HTMLElement[];
  /** No scene to look at. The legend shows from the top, or the first
   *  screen would be an empty one. */
  plain?: boolean;
  /** The frame's ground at s, in place of frameGround. */
  ground?: (s: number) => string;
  /** Corner radius at rest, rem. Default FRAME.radius. */
  radius?: number;
};

/**
 * Sets the frame's shape and what shows with it. Runs with or without
 * WebGL. Writes only when the value changed.
 */
export function makeStage(els: StageEls): (s: number) => number {
  let lastClip = "", lastGround = "", lastShow = -1;
  return (s: number): number => {
    const k = frameAmount(s);
    // The corners round off early, or a thin margin would have square ones.
    const r = Math.min(1, k * 5) * (els.radius ?? FRAME.radius);
    const f = (v: number): string => v.toFixed(3);
    const clip = k <= 0 ? "none" : `inset(${f(k * FRAME.top)}vh ${f(k * FRAME.side)}vw ${f(k * FRAME.side)}vw ${f(k * FRAME.side)}vw round ${f(r)}rem)`;
    if (clip !== lastClip) { els.frame.style.clipPath = clip; lastClip = clip; }
    const ground = (els.ground ?? frameGround)(s);
    if (ground !== lastGround) { els.frame.style.backgroundColor = ground; lastGround = ground; }
    const amount = els.plain && s < TL.widenStart ? 1 : smooth(0.6, 1, k);
    const show = Math.round(amount * 100) / 100;
    if (show !== lastShow) {
      for (const el of els.withFrame) {
        el.style.opacity = String(show);
        el.style.visibility = show === 0 ? "hidden" : "visible";
      }
      lastShow = show;
    }
    return k;
  };
}
