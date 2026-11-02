"use client";

import { type JSX, useRef } from "react";

import { over, Stage, useProgress, Words } from "@/components/luke/each/stage";

/**
 * 6. Gather. The words start strewn across the screen, each turned a
 * little and out of focus, and come together with the scroll into the
 * sentence in the middle, each along its own straight line, the ones
 * furthest off arriving last. Then they hold.
 */

/** Where each word starts: across and down in screen widths and heights
 *  from its place, its turn in degrees, and when it sets off. Round a
 *  ring about the middle, each word a golden angle on from the last and
 *  on one of three radii, so they come in from all round without landing
 *  on each other on the way; the first word sets off first, so the
 *  sentence builds in its reading order. (Strewn at random they crossed
 *  and piled up half way.) */
const FROM: [number, number, number, number][] = Array.from({ length: 14 }, (_, i) => {
  const a = ((i * 137.508 + 200) * Math.PI) / 180;
  const r = 0.3 + 0.07 * ((i * 5) % 3);
  return [Math.cos(a) * r * 1.15, Math.sin(a) * r, ((i * 53) % 21) - 10, 0.04 + 0.022 * i];
});
const LEN = 0.3;

export default function E06Gather(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);

  useProgress(sectionRef, (p, reduced) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    words.current.forEach((el, i) => {
      if (!el) return;
      const [dx, dy, rot, at] = FROM[i];
      const e = reduced ? 1 : over(p, at, at + LEN);
      const k = 1 - e;
      el.style.transform = `translate3d(${(dx * vw * k).toFixed(1)}px, ${(dy * vh * k).toFixed(1)}px, 0) rotate(${(rot * k).toFixed(2)}deg)`;
      el.style.opacity = (0.35 + 0.65 * e).toFixed(3);
      el.style.filter = e >= 1 ? "none" : `blur(${(k * 6).toFixed(2)}px)`;
    });
  });

  return (
    <Stage heightVh={240} sectionRef={sectionRef}>
      <p className="absolute left-1/2 top-1/2 w-[92vw] max-w-[60rem] -translate-x-1/2 -translate-y-1/2 text-center font-sans text-[clamp(32px,4vw,120px)] leading-[1.12] tracking-[-0.035em] [text-wrap:balance] md:w-[62vw] md:max-w-none">
        <Words
          className="inline-block will-change-transform motion-reduce:!opacity-100"
          wordRef={(i, el) => {
            words.current[i] = el;
          }}
        />
      </p>
    </Stage>
  );
}
