"use client";

import { type JSX, useRef } from "react";

import { clamp01, Stage, useProgress } from "@/components/luke/each/stage";
import { Em } from "@/components/luke/theme";

/**
 * 2. Marquee. The sentence in two huge rows, one above the middle and one
 * below. The first row comes in from the right and the second from the
 * left, each sliding with the scroll, and they meet in the middle of the
 * screen half way through, where the sentence reads whole, centred; then
 * they carry on out the other sides. Nothing moves on its own.
 */

/** How far each row travels, in screen widths, over the section. */
const TRAVEL = 1.6;

export default function E02Marquee(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);

  useProgress(sectionRef, (p, reduced) => {
    // -1 at the start, 0 in the middle, 1 at the end; eased at both ends
    // so the rows slow as they meet and pick up again as they part.
    const q = reduced ? 0 : clamp01(p) * 2 - 1;
    const e = Math.sign(q) * Math.abs(q) ** 1.6;
    rows.current.forEach((el, i) => {
      if (!el) return;
      const dir = i === 0 ? -1 : 1;
      el.style.transform = `translate3d(${(dir * e * TRAVEL * 100).toFixed(2)}vw, 0, 0)`;
    });
  });

  return (
    <Stage heightVh={300} sectionRef={sectionRef}>
      {/* Sized so each row fits the width with room to spare: when they
          meet, the sentence must read whole. At 8.6vw the rows were 2700
          px wide and cut at both edges. */}
      <div className="absolute inset-0 flex flex-col justify-center gap-[1vh] whitespace-nowrap font-sans text-[clamp(30px,5.2vw,140px)] leading-[1] tracking-[-0.04em]">
        <div
          className="flex w-full justify-center will-change-transform"
          ref={(el) => {
            rows.current[0] = el;
          }}
        >
          <span>Each project is an opportunity to</span>
        </div>
        <div
          className="flex w-full justify-center will-change-transform"
          ref={(el) => {
            rows.current[1] = el;
          }}
        >
          <span>
            <Em>learn, build</Em> and show what I can do.
          </span>
        </div>
      </div>
    </Stage>
  );
}
