"use client";

import { type JSX, useRef } from "react";

import { over, Stage, useProgress } from "@/components/luke/each/stage";
import { Em } from "@/components/luke/theme";

/**
 * 9. Stack. The sentence in the italic serif, large, with a stack of
 * outlined copies fanned out behind it down and to the right, like the
 * sheets of a stencil pulled apart. With the scroll the stack closes up
 * into the one solid line, the furthest sheet first.
 */

const COPIES = 7;
/** Each sheet's offset from the last at the start, in em of the type. */
const FAN: [number, number] = [0.085, 0.07];
const AT: [number, number] = [0.08, 0.62];

export default function E09Stack(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const sheets = useRef<(HTMLDivElement | null)[]>([]);

  useProgress(sectionRef, (p, reduced) => {
    sheets.current.forEach((el, j) => {
      if (!el) return;
      // The furthest sheet closes first; each takes a little over half the
      // run and the next starts a little after.
      const k = j + 1;
      const e = reduced ? 1 : over(p, AT[0] + ((COPIES - k) / COPIES) * (AT[1] - AT[0]) * 0.45, AT[1] - (k / COPIES) * 0.05);
      el.style.transform = `translate3d(${(k * FAN[0] * (1 - e)).toFixed(4)}em, ${(k * FAN[1] * (1 - e)).toFixed(4)}em, 0)`;
      el.style.opacity = (0.75 - 0.08 * k + 0.33 * e).toFixed(3);
    });
  });

  const line = (
    <>
      Each project is an opportunity to <Em>learn, build</Em> and show what I can do.
    </>
  );
  return (
    <Stage heightVh={240} sectionRef={sectionRef}>
      <div className="absolute inset-x-[6vw] top-1/2 -translate-y-1/2 font-sans text-[clamp(36px,5.6vw,160px)] leading-[1.08] tracking-[-0.04em]">
        <div className="relative">
          {Array.from({ length: COPIES }, (_, j) => (
            <div
              aria-hidden="true"
              // Outlined: the fill goes clear and the stroke keeps the
              // type's colour. (color: transparent took currentColor with
              // it, and the sheets never showed.)
              className="absolute inset-0 will-change-transform [-webkit-text-fill-color:transparent] [-webkit-text-stroke:1px_currentColor]"
              key={j}
              ref={(el) => {
                sheets.current[j] = el;
              }}
              style={{ zIndex: COPIES - j }}
            >
              {line}
            </div>
          ))}
          <div className="relative" style={{ zIndex: COPIES + 1 }}>
            {line}
          </div>
        </div>
      </div>
    </Stage>
  );
}
