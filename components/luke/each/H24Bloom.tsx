"use client";

import { type JSX, useEffect, useRef } from "react";

import { onPalette } from "@/components/cloudPalette";
import { applyReveal, clamp01, smooth, Stage, useProgress, Words } from "@/components/luke/each/stage";

/**
 * 24. Bloom. An abstract flower, vectors only: four rings of translucent
 * petal shapes in rose tones, overlapping (multiplied), a screen and a
 * quarter across, behind the sentence. The rings grow out of the middle
 * with the scroll, the inner ring first and the outer last, each petal
 * lengthening to its place and the ring closing up as it does, and the
 * whole flower turns slowly, the outer rings a little faster than the
 * inner ones, so the rings slide over each other. A few loose petals
 * circle it further out, faster. Nothing moves on its own.
 *
 * 26 (Lines) is the same flower with the outer rings drawn as outlines
 * in the type's colour.
 */

/** The flower's radius in viewBox units. */
const R = 1000;
/** Its diameter, in screen heights. */
const SIZE = 1.3;
/** The golden angle: each ring starts this much further round. */
const GOLDEN = 137.508;
const WORDS_AT: [number, number] = [0.22, 0.6];

export type Ring = {
  /** Petals. Fibonacci's counts, so no two rings line up. */
  n: number;
  /** Length and width, and the base's distance from the middle, as
   *  shares of R. */
  len: number;
  width: number;
  base: number;
  fill: string;
  alpha: number;
  /** When it grows, in progress. */
  open: [number, number];
  /** How far it turns over the run, degrees. */
  turn: number;
  /** Drawn as an outline in the type's colour instead of filled. */
  line?: boolean;
};

export const RINGS: Ring[] = [
  { n: 5, len: 0.3, width: 0.19, base: 0.08, fill: "#c9306b", alpha: 0.82, open: [0.04, 0.3], turn: 10 },
  { n: 8, len: 0.46, width: 0.22, base: 0.16, fill: "#dc5a94", alpha: 0.8, open: [0.12, 0.42], turn: 18 },
  { n: 13, len: 0.64, width: 0.24, base: 0.24, fill: "#e87eb1", alpha: 0.8, open: [0.2, 0.56], turn: 27 },
  { n: 21, len: 0.84, width: 0.24, base: 0.32, fill: "#ef9fc6", alpha: 0.8, open: [0.3, 0.7], turn: 38 },
];

/** The loose petals: angle (degrees), distance (share of R), length
 *  (share of R). They come as the outer ring does and circle faster. */
const LOOSE: { a: number; d: number; len: number; fill: string }[] = [
  { a: 20, d: 1.12, len: 0.11, fill: "#dc5a94" },
  { a: 75, d: 1.3, len: 0.08, fill: "#e87eb1" },
  { a: 130, d: 1.08, len: 0.13, fill: "#c9306b" },
  { a: 170, d: 1.34, len: 0.07, fill: "#dc5a94" },
  { a: 215, d: 1.16, len: 0.1, fill: "#e87eb1" },
  { a: 262, d: 1.28, len: 0.12, fill: "#c9306b" },
  { a: 305, d: 1.1, len: 0.08, fill: "#dc5a94" },
  { a: 340, d: 1.36, len: 0.1, fill: "#e87eb1" },
];
const LOOSE_TURN = 70;

/** A petal with its base at the origin and its tip straight up. */
function petal(len: number, width: number): string {
  const L = len * R;
  const w = width * R;
  return `M0 0C${(w * 0.72).toFixed(1)} ${(-L * 0.22).toFixed(1)} ${(w * 0.62).toFixed(1)} ${(-L * 0.72).toFixed(1)} 0 ${(-L).toFixed(1)}C${(-w * 0.62).toFixed(1)} ${(-L * 0.72).toFixed(1)} ${(-w * 0.72).toFixed(1)} ${(-L * 0.22).toFixed(1)} 0 0Z`;
}

const at = (ring: Ring, k: number, i: number, o: number, q: number): string => {
  // Its place, less a little while it grows: the ring closes up as it
  // opens. Length from nothing; width from half.
  const a = k * GOLDEN + ring.turn * q + (i * 360) / ring.n - (1 - o) * 14;
  const sy = 0.06 + 0.94 * o;
  const sx = 0.5 + 0.5 * o;
  return `rotate(${a.toFixed(2)}) translate(0 ${(-ring.base * R).toFixed(1)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`;
};

export function BloomBase({ rings }: { rings: Ring[] }): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const petals = useRef<(SVGGElement | null)[][]>(rings.map(() => []));
  const loose = useRef<(SVGGElement | null)[]>([]);
  const flower = useRef<SVGGElement | null>(null);

  // On the dark ground (narrow screens, where the cloud bank never turns
  // the page pink) the roses are laid on with screen, not multiply.
  useEffect(
    () =>
      onPalette((t) => {
        if (flower.current) flower.current.style.mixBlendMode = t > 0.5 ? "multiply" : "screen";
      }),
    [],
  );

  useProgress(sectionRef, (p, reduced) => {
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
    const q = reduced ? 0.5 : clamp01(p);
    let outer = 1;
    rings.forEach((ring, k) => {
      const o = reduced ? 1 : smooth((p - ring.open[0]) / (ring.open[1] - ring.open[0]));
      outer = o;
      petals.current[k].forEach((el, i) => {
        if (!el) return;
        el.setAttribute("transform", at(ring, k, i, o, q));
        // Not there until it grows: at its smallest a ring of petals read
        // as a ring of beads.
        el.style.opacity = clamp01(o * 4).toFixed(3);
      });
    });
    loose.current.forEach((el, i) => {
      if (!el) return;
      const l = LOOSE[i];
      el.setAttribute("transform", `rotate(${(l.a + LOOSE_TURN * q).toFixed(2)}) translate(0 ${(-l.d * R * (0.9 + 0.1 * outer)).toFixed(1)}) rotate(${(40 * q).toFixed(1)}) scale(${outer.toFixed(3)})`);
    });
  });

  return (
    <Stage heightVh={320} sectionRef={sectionRef}>
      <svg
        aria-hidden="true"
        className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 overflow-visible"
        style={{ width: `${SIZE * 100}vh`, height: `${SIZE * 100}vh` }}
        viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`}
      >
        <g ref={flower} style={{ mixBlendMode: "multiply" }}>
          {rings.map((ring, k) => {
            const d = petal(ring.len, ring.width);
            return Array.from({ length: ring.n }, (_, i) => (
              <g
                key={`${k}-${i}`}
                ref={(el) => {
                  petals.current[k][i] = el;
                }}
                style={{ opacity: 0 }}
                transform={at(ring, k, i, 0, 0)}
              >
                {ring.line ? (
                  <path d={d} fill="none" stroke="currentColor" strokeOpacity={ring.alpha} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                ) : (
                  <path d={d} fill={ring.fill} fillOpacity={ring.alpha} />
                )}
              </g>
            ));
          })}
          {LOOSE.map((l, i) => (
            <g
              key={`l${i}`}
              ref={(el) => {
                loose.current[i] = el;
              }}
              transform={`rotate(${l.a}) translate(0 ${-l.d * R * 0.9}) scale(0)`}
            >
              <path d={petal(l.len, l.len * 0.5)} fill={l.fill} fillOpacity={0.85} />
            </g>
          ))}
        </g>
      </svg>
      <p className="absolute left-1/2 top-1/2 z-10 w-[88vw] max-w-[44rem] -translate-x-1/2 -translate-y-1/2 text-center font-sans text-[clamp(26px,2.9vw,100px)] leading-[1.16] tracking-[-0.03em] [text-wrap:balance] md:w-[42vw] md:max-w-none">
        <Words
          className="inline-block motion-reduce:!opacity-100"
          style={{ opacity: 0.08 }}
          wordRef={(i, el) => {
            words.current[i] = el;
          }}
        />
      </p>
    </Stage>
  );
}

export default function H24Bloom(): JSX.Element {
  return <BloomBase rings={RINGS} />;
}
