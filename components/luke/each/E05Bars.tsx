"use client";

import { type JSX, useRef } from "react";

import { clamp01, Stage, useProgress } from "@/components/luke/each/stage";

/**
 * 5. Bars. The sentence in the italic serif, large, drawn the way the
 * site draws its pictures: as a comb of thin vertical bars in the shape of
 * the letters. With the scroll the ink fills the comb from the left along
 * each line in turn, in reading order, with a soft edge, until the
 * sentence stands solid; the comb drifts a little under it as the page
 * moves.
 */

const AT: [number, number] = [0.05, 0.6];
/** Bar pitch and the comb's bar width, in the SVG's units (1000 wide). */
const PITCH = 4.5;
const COMB = 1.3;
/** The three lines, sized so the longest fits the 1000-unit frame; at 92
 *  units in two lines they ran off both edges. */
const LINES = ["Each project is an", "opportunity to learn, build", "and show what I can do."];
const SIZE = 76;
const BASELINES = [222, 302, 382];

export default function E05Bars(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stops = useRef<(SVGStopElement | null)[][]>(LINES.map(() => []));
  const comb = useRef<SVGPatternElement | null>(null);

  useProgress(sectionRef, (p, reduced) => {
    const q = reduced ? 1 : clamp01((p - AT[0]) / (AT[1] - AT[0]));
    // Each line's fill edge sweeps from before its left end to past its
    // right, a tenth of the width wide, the lines one after another with
    // a little overlap.
    LINES.forEach((_, i) => {
      const qi = clamp01((q * (LINES.length + 0.6) - i) / 1.6);
      const edge = -0.1 + 1.2 * qi;
      stops.current[i][0]?.setAttribute("offset", clamp01(edge - 0.1).toFixed(3));
      stops.current[i][1]?.setAttribute("offset", clamp01(edge).toFixed(3));
    });
    comb.current?.setAttribute("patternTransform", `translate(${(-p * 30).toFixed(2)} 0)`);
  });

  return (
    <Stage heightVh={240} sectionRef={sectionRef}>
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" viewBox="0 0 1000 562">
        <defs>
          <pattern height="1" id="each-comb" patternUnits="userSpaceOnUse" ref={comb} width={PITCH}>
            <rect fill="currentColor" height="1" width={COMB} x={(PITCH - COMB) / 2} />
          </pattern>
          {LINES.map((_, i) => (
            <linearGradient id={`each-fill-${i}`} key={i} x1="0" x2="1" y1="0" y2="0">
              <stop
                offset="0"
                ref={(el) => {
                  stops.current[i][0] = el;
                }}
                stopColor="#fff"
              />
              <stop
                offset="0"
                ref={(el) => {
                  stops.current[i][1] = el;
                }}
                stopColor="#000"
              />
            </linearGradient>
          ))}
          {LINES.map((_, i) => (
            <mask id={`each-fill-mask-${i}`} key={i} maskContentUnits="userSpaceOnUse">
              <rect fill={`url(#each-fill-${i})`} height="562" width="1000" />
            </mask>
          ))}
        </defs>
        <g className="font-serif-display italic" fontSize={SIZE} letterSpacing="-1.2" textAnchor="middle">
          {/* The comb: the letters as thin bars. */}
          <g fill="url(#each-comb)" opacity="0.8">
            {LINES.map((l, i) => (
              <text key={i} x="500" y={BASELINES[i]}>
                {l}
              </text>
            ))}
          </g>
          {/* The ink, swept in over it, a line at a time. */}
          <g fill="currentColor">
            {LINES.map((l, i) => (
              <text key={i} mask={`url(#each-fill-mask-${i})`} x="500" y={BASELINES[i]}>
                {l}
              </text>
            ))}
          </g>
        </g>
      </svg>
    </Stage>
  );
}
