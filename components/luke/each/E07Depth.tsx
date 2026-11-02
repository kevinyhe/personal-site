"use client";

import { type JSX, useRef } from "react";

import { clamp01, Stage, useProgress, WORDS } from "@/components/luke/each/stage";
import { Em } from "@/components/luke/theme";

/**
 * 7. Depth. The words stand one behind another down a long room, each a
 * little off the middle, and the scroll carries the eye forward through
 * them: the next word comes up out of the haze, passes at full size and
 * goes by, so the sentence is read one word at a time in order. At the
 * end the eye is past the last word and they all hang behind, small.
 */

/** Where each word sits off the middle, in screen widths and heights. */
const OFF: [number, number][] = [
  [-0.12, -0.08],
  [0.14, 0.06],
  [-0.05, 0.12],
  [0.1, -0.12],
  [-0.14, 0.02],
  [0.06, 0.1],
  [-0.08, -0.1],
  [0.12, 0.0],
  [-0.1, 0.08],
  [0.04, -0.12],
  [-0.12, 0.1],
  [0.1, 0.06],
  [-0.04, -0.08],
  [0.0, 0.0],
];
/** Depth between words, px of the perspective's room. */
const STEP = 900;
/** The lens: perspective distance. */
const LENS = 800;
const AT: [number, number] = [0.02, 0.98];

export default function E07Depth(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);

  useProgress(sectionRef, (p, reduced) => {
    const n = WORDS.length;
    // The eye's position, in words: from a little before the first to a
    // little past the last.
    const eye = reduced ? n + 2 : -1.2 + (n + 2.6) * clamp01((p - AT[0]) / (AT[1] - AT[0]));
    words.current.forEach((el, i) => {
      if (!el) return;
      // Distance from the eye to this word, in words; past it is negative.
      const d = i - eye;
      const z = d * STEP;
      if (z < -LENS * 0.6) {
        el.style.visibility = "hidden";
        return;
      }
      el.style.visibility = "";
      const scale = LENS / (LENS + z);
      // Clear within a word of the eye each way, hazy beyond.
      const near = clamp01(1 - (Math.abs(d) - 0.6) / 3);
      const [ox, oy] = OFF[i];
      el.style.transform = `translate3d(${(ox * 100 * scale).toFixed(2)}vw, ${(oy * 100 * scale).toFixed(2)}vh, 0) scale(${scale.toFixed(4)})`;
      el.style.opacity = (0.08 + 0.92 * near * (d < -0.5 ? clamp01(1 + (d + 0.5) / 0.4) : 1)).toFixed(3);
      el.style.filter = near >= 1 ? "none" : `blur(${((1 - near) * 8).toFixed(2)}px)`;
    });
  });

  return (
    <Stage heightVh={420} sectionRef={sectionRef}>
      <div className="absolute inset-0 flex items-center justify-center font-sans text-[clamp(44px,7vw,200px)] leading-none tracking-[-0.04em]">
        {WORDS.map((w, i) => (
          <span
            className="absolute will-change-transform motion-reduce:!opacity-100"
            key={`${w.t}-${i}`}
            ref={(el) => {
              words.current[i] = el;
            }}
            style={{ opacity: 0.08 }}
          >
            {w.em ? <Em>{w.t}</Em> : w.t}
          </span>
        ))}
      </div>
    </Stage>
  );
}
