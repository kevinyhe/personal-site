"use client";

import { type JSX, type ReactNode, type RefObject, useEffect, useRef } from "react";

import { css, ink, onPalette } from "@/components/cloudPalette";
import { Em, INK } from "@/components/luke/theme";

/**
 * What the ten displays of the sentence share (components/luke/each): the
 * sentence, the section that holds a stage still while the page goes by,
 * and the scroll's progress through it.
 *
 * The section sits between Work and Skills under the cloud bank
 * (CloudPassage.tsx), above it (z-30), and takes the cloud's colours
 * (cloudPalette.ts): plum type on pink, by the time the page is here.
 */

/** The sentence, a word at a time. `em` words are set in the italic serif. */
export const WORDS: { t: string; em?: boolean }[] = [
  { t: "Each" },
  { t: "project" },
  { t: "is" },
  { t: "an" },
  { t: "opportunity" },
  { t: "to" },
  { t: "learn,", em: true },
  { t: "build", em: true },
  { t: "and" },
  { t: "show" },
  { t: "what" },
  { t: "I" },
  { t: "can" },
  { t: "do." },
];
export const SENTENCE = WORDS.map((w) => w.t).join(" ");

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
/** 0 before a, 1 after b, smooth between. */
export const over = (p: number, a: number, b: number): number => smooth((p - a) / (b - a));

/**
 * The scroll's progress through the section: 0 with its top 60% of the
 * way down the screen (the stage is coming up), 1 with its bottom at the
 * bottom of the screen (it is about to go). Not clamped: it runs on past
 * 1 as the section leaves, to 1 + 1/(height - 0.4) screens. `onFrame`
 * runs once a frame while the scroll moves, and once at the start.
 */
export function useProgress(sectionRef: RefObject<HTMLElement | null>, onFrame: (p: number, reduced: boolean) => void): void {
  const cb = useRef(onFrame);
  cb.current = onFrame;
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const apply = (): void => {
      frame = 0;
      const r = section.getBoundingClientRect();
      const vh = window.innerHeight;
      cb.current((0.6 * vh - r.top) / Math.max(1, r.height - 0.4 * vh), reduced);
    };
    const ask = (): void => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => {
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sectionRef]);
}

/** lukebaffait's word reveal: with `k0` 0..1 through the run, each word
 *  comes in from a blur and a little below its place, a little after the
 *  one before. */
export function applyReveal(els: (HTMLElement | null)[], k0: number): void {
  const n = els.length;
  els.forEach((el, i) => {
    if (!el) return;
    const k = clamp01(k0 * (n + 1.5) - i);
    const e = k * k * (3 - 2 * k);
    el.style.opacity = (0.08 + 0.92 * e).toFixed(3);
    el.style.filter = e >= 1 ? "none" : `blur(${((1 - e) * 10).toFixed(2)}px)`;
    el.style.transform = `translate3d(0, ${((1 - e) * 0.18).toFixed(3)}em, 0)`;
  });
}

/** The section and its held stage. Reduced motion: one screen, still. */
export function Stage({
  heightVh,
  sectionRef,
  children,
  className = "",
}: {
  heightVh: number;
  sectionRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  // The type's colour, with the cloud's.
  useEffect(
    () =>
      onPalette((t) => {
        if (sectionRef.current) sectionRef.current.style.color = css(ink(t));
      }),
    [sectionRef],
  );
  return (
    <section
      aria-label="Approach"
      className="relative z-30 motion-reduce:!h-screen"
      id="each"
      ref={sectionRef}
      style={{ color: INK, height: `${heightVh}vh` }}
    >
      <div className={`sticky top-0 h-screen overflow-clip ${className}`}>{children}</div>
    </section>
  );
}

/** The sentence's words as spans, each handed to `wordRef`, with the
 *  italic ones in the serif. */
export function Words({
  wordRef,
  className = "inline-block",
  style,
}: {
  wordRef: (i: number, el: HTMLSpanElement | null) => void;
  className?: string;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <>
      {WORDS.map((w, i) => (
        <span key={`${w.t}-${i}`}>
          <span className={className} ref={(el) => wordRef(i, el)} style={style}>
            {w.em ? <Em>{w.t}</Em> : w.t}
          </span>
          {i < WORDS.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}
