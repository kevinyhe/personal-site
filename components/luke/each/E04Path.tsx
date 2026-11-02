"use client";

import { type JSX, useEffect, useRef } from "react";

import { clamp01, Stage, useProgress } from "@/components/luke/each/stage";

/**
 * 4. Path. The sentence runs along a brush line that bends across the
 * screen, after the koi's stroke: it comes in from the right end of the
 * line, travels along it with the scroll, and goes out at the left, each
 * word turning with the bends as it passes. A hairline draws the line
 * ahead of the words.
 */

/** The line, in a 1000 x 562 frame (16:9, drawn to cover the screen). */
const D = "M -420 310 C 120 210 300 410 520 310 S 880 190 1420 310";
const AT: [number, number] = [0.05, 0.95];

export default function E04Path(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const path = useRef<SVGPathElement | null>(null);
  const textPath = useRef<SVGTextPathElement | null>(null);
  const text = useRef<SVGTextElement | null>(null);
  const lengths = useRef({ path: 1800, text: 1800 });

  useEffect(() => {
    const measure = (): void => {
      if (path.current) lengths.current.path = path.current.getTotalLength();
      if (text.current) lengths.current.text = text.current.getComputedTextLength() || lengths.current.text;
    };
    measure();
    void document.fonts.ready.then(measure);
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    const { path: lp, text: lt } = lengths.current;
    // From the text's start at the line's end to its end at the line's
    // start; at rest, centred.
    const q = reduced ? 0.5 : clamp01((p - AT[0]) / (AT[1] - AT[0]));
    const off = lp - (lp + lt) * q;
    if (textPath.current) textPath.current.setAttribute("startOffset", off.toFixed(1));
    if (path.current) {
      // The hairline draws from the right ahead of the words.
      const drawn = clamp01(q * 1.25 + 0.1);
      path.current.style.strokeDasharray = `${lp} ${lp}`;
      path.current.style.strokeDashoffset = `${(-(1 - drawn) * lp).toFixed(1)}`;
    }
  });

  return (
    <Stage heightVh={320} sectionRef={sectionRef}>
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1000 562">
        <path d={D} fill="none" id="each-path" ref={path} stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.8" />
        <text className="font-sans" fill="currentColor" fontSize="58" letterSpacing="-2.2" ref={text}>
          <textPath href="#each-path" ref={textPath} startOffset="2000">
            Each project is an opportunity to{" "}
            <tspan className="font-serif-display italic" letterSpacing="-0.6">
              learn, build
            </tspan>{" "}
            and show what I can do.
          </textPath>
        </text>
      </svg>
    </Stage>
  );
}
