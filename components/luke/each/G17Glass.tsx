"use client";

import { type JSX, useEffect, useRef } from "react";

import { clamp01, SENTENCE, Stage, useProgress } from "@/components/luke/each/stage";
import { GROUND, INK } from "@/components/luke/theme";

/**
 * 17. Glass. The television from the top of the page, as a glass: a dark
 * curved screen in the middle of the pink, with scanlines and a little
 * static in it, and the sentence typed onto it in the TV's pink phosphor
 * a letter at a time with the scroll, a block cursor at the end. The
 * static is a small canvas of noise, redrawn as the page moves (no
 * WebGL).
 */

const TYPE_AT: [number, number] = [0.08, 0.6];

export default function G17Glass(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const letters = useRef<(HTMLSpanElement | null)[]>([]);
  const cursor = useRef<HTMLSpanElement | null>(null);
  const noise = useRef<HTMLCanvasElement | null>(null);
  const chars = Array.from(SENTENCE);

  useEffect(() => {
    const cv = noise.current;
    if (!cv) return undefined;
    cv.width = 192;
    cv.height = 108;
    return undefined;
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    const k = reduced ? 1 : clamp01((p - TYPE_AT[0]) / (TYPE_AT[1] - TYPE_AT[0]));
    const shown = Math.round(k * chars.length);
    letters.current.forEach((el, i) => {
      if (el) el.style.visibility = i < shown ? "" : "hidden";
    });
    if (cursor.current) cursor.current.style.opacity = shown >= chars.length ? "0" : "1";
    // The static: new grain each step of the scroll, faint.
    const cv = noise.current;
    const ctx = cv?.getContext("2d");
    if (cv && ctx) {
      const img = ctx.createImageData(cv.width, cv.height);
      const d = img.data;
      let s = Math.floor(p * 1000) * 9973 + 17;
      for (let i = 0; i < d.length; i += 4) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const v = (s >>> 24) & 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
  });

  return (
    <Stage heightVh={260} sectionRef={sectionRef}>
      <div className="absolute inset-0 flex items-center justify-center">
        {/* The glass. */}
        <div
          className="relative h-[56vh] w-[74vw] max-w-[96vh] overflow-hidden rounded-[3.2vw/5.6vh] shadow-[0_2vh_8vh_rgba(23,10,20,0.35)]"
          style={{ backgroundColor: GROUND, color: INK }}
        >
          <canvas aria-hidden="true" className="absolute inset-0 h-full w-full opacity-[0.08] [image-rendering:pixelated]" ref={noise} />
          {/* Scanlines and the glass's own shine. */}
          <div aria-hidden="true" className="absolute inset-0 [background:repeating-linear-gradient(to_bottom,rgba(0,0,0,0.22)_0_2px,transparent_2px_4px)]" />
          <div aria-hidden="true" className="absolute inset-0 [background:radial-gradient(ellipse_at_50%_45%,transparent_55%,rgba(0,0,0,0.5)_100%)]" />
          <div aria-hidden="true" className="absolute inset-0 [background:linear-gradient(115deg,rgba(255,255,255,0.09)_0%,transparent_38%)]" />
          <p className="absolute left-[8%] top-1/2 w-[84%] -translate-y-1/2 font-mono text-[clamp(18px,2.5vw,56px)] leading-[1.45] tracking-[0.01em] [text-shadow:0_0_0.5em_rgba(249,185,220,0.55)]">
            {chars.map((c, i) => (
              <span
                className="motion-reduce:!visible"
                key={i}
                ref={(el) => {
                  letters.current[i] = el;
                }}
                style={{ visibility: "hidden" }}
              >
                {c}
              </span>
            ))}
            <span aria-hidden="true" className="ml-[0.1em] inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-current align-baseline" ref={cursor} />
          </p>
        </div>
      </div>
    </Stage>
  );
}
