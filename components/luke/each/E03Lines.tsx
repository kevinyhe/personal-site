"use client";

import { type JSX, useRef } from "react";

import { over, Stage, useProgress } from "@/components/luke/each/stage";
import { Em } from "@/components/luke/theme";

/**
 * 3. Lines. The sentence set large on the left in three lines, as
 * lukebaffait.fr's hero text comes up: each line rises out of its own
 * clip, one after another, with a hairline over the top and a small
 * label. Then it stands.
 */

const LINES: JSX.Element[] = [
  <>Each project is an</>,
  <>
    opportunity to <Em>learn, build</Em>
  </>,
  <>and show what I can do.</>,
];
/** Shares of the progress over which the lines come up, each 0.22 long. */
const FROM = [0.08, 0.18, 0.28];

export default function E03Lines(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const lines = useRef<(HTMLSpanElement | null)[]>([]);
  const rule = useRef<HTMLDivElement | null>(null);

  useProgress(sectionRef, (p, reduced) => {
    lines.current.forEach((el, i) => {
      if (!el) return;
      const e = reduced ? 1 : over(p, FROM[i], FROM[i] + 0.22);
      el.style.transform = `translate3d(0, ${((1 - e) * 110).toFixed(2)}%, 0)`;
    });
    if (rule.current) rule.current.style.transform = `scaleX(${(reduced ? 1 : over(p, 0.04, 0.3)).toFixed(3)})`;
  });

  return (
    <Stage heightVh={220} sectionRef={sectionRef}>
      <div className="absolute inset-x-[6vw] top-1/2 -translate-y-1/2">
        <div className="mb-[4vh] flex items-baseline justify-between font-sans text-[clamp(12px,0.85vw,20px)] uppercase tracking-[0.12em] opacity-70">
          <span>Approach</span>
        </div>
        <div className="mb-[5vh] h-px origin-left bg-current opacity-30" ref={rule} />
        <h2 className="font-sans text-[clamp(34px,6.4vw,170px)] leading-[1.02] tracking-[-0.04em]">
          {LINES.map((line, i) => (
            <span className="block overflow-hidden pb-[0.08em]" key={i}>
              <span
                className="block will-change-transform"
                ref={(el) => {
                  lines.current[i] = el;
                }}
              >
                {line}
              </span>
            </span>
          ))}
        </h2>
      </div>
    </Stage>
  );
}
