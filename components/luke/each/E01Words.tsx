"use client";

import { type JSX, useRef } from "react";

import { clamp01, Stage, useProgress, Words } from "@/components/luke/each/stage";

/**
 * 1. Words. lukebaffait.fr's gallery sentence as it is: one sentence in the
 * middle of the held screen, its words coming in one after another with
 * the scroll, each from a blur and a little below its place.
 */

/** Shares of the progress over which the words come in. */
const AT: [number, number] = [0.05, 0.5];

export default function E01Words(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);

  useProgress(sectionRef, (p, reduced) => {
    const k0 = reduced ? 1 : clamp01((p - AT[0]) / (AT[1] - AT[0]));
    const n = words.current.length;
    words.current.forEach((el, i) => {
      if (!el) return;
      // Each word takes a little over its share and overlaps the next.
      const k = clamp01(k0 * (n + 1.5) - i);
      const e = k * k * (3 - 2 * k);
      el.style.opacity = (0.08 + 0.92 * e).toFixed(3);
      el.style.filter = e >= 1 ? "none" : `blur(${((1 - e) * 10).toFixed(2)}px)`;
      el.style.transform = `translate3d(0, ${((1 - e) * 0.18).toFixed(3)}em, 0)`;
    });
  });

  return (
    <Stage heightVh={220} sectionRef={sectionRef}>
      <p className="absolute left-1/2 top-1/2 w-[88vw] max-w-[44rem] -translate-x-1/2 -translate-y-1/2 text-center font-sans text-[clamp(28px,2.6vw,96px)] leading-[1.18] tracking-[-0.03em] md:w-[44vw] md:max-w-none">
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
