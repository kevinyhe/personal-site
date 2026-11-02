"use client";

import { type JSX, useRef } from "react";

import { clamp01, Stage, useProgress } from "@/components/luke/each/stage";
import { Em } from "@/components/luke/theme";

/**
 * 8. Phrases. The sentence in six pieces, each taking the whole screen in
 * turn, huge: one rises through the middle as the one before it goes up
 * and out, so the eye reads the sentence as a run of titles. The two
 * italic pieces are set in the serif.
 */

const PHRASES: { el: JSX.Element; em?: boolean }[] = [
  { el: <>Each project</> },
  { el: <>is an opportunity</> },
  { el: <>to learn,</>, em: true },
  { el: <>build</>, em: true },
  { el: <>and show</> },
  { el: <>what I can do.</> },
];
const AT: [number, number] = [0.04, 0.96];

export default function E08Phrases(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);

  useProgress(sectionRef, (p, reduced) => {
    const n = PHRASES.length;
    // Which phrase is in the middle, fractional: 0 the first, n-1 the last.
    const at = reduced ? n - 1 : (n - 1) * clamp01((p - AT[0]) / (AT[1] - AT[0]));
    items.current.forEach((el, i) => {
      if (!el) return;
      // Its place from the middle, in phrases: 1 is a screen below.
      const d = i - at;
      const vis = clamp01(1 - Math.abs(d) * 1.1);
      const e = vis * vis * (3 - 2 * vis);
      el.style.transform = `translate3d(0, ${(d * 70).toFixed(2)}vh, 0) scale(${(0.86 + 0.14 * e).toFixed(4)})`;
      el.style.opacity = e.toFixed(3);
      el.style.filter = e >= 1 ? "none" : `blur(${((1 - e) * 6).toFixed(2)}px)`;
      el.style.visibility = Math.abs(d) > 1.1 ? "hidden" : "";
    });
  });

  return (
    <Stage heightVh={420} sectionRef={sectionRef}>
      <div className="absolute inset-0 flex items-center justify-center text-center font-sans text-[clamp(48px,9vw,260px)] leading-[0.95] tracking-[-0.045em]">
        {PHRASES.map((ph, i) => (
          <div
            className="absolute w-[92vw] will-change-transform motion-reduce:!opacity-100"
            key={i}
            ref={(el) => {
              items.current[i] = el;
            }}
            style={{ opacity: 0 }}
          >
            {ph.em ? <Em>{ph.el}</Em> : ph.el}
          </div>
        ))}
      </div>
    </Stage>
  );
}
