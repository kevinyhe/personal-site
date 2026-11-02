"use client";

import { type JSX, useEffect, useRef } from "react";

import { clamp01, Stage, useProgress } from "@/components/luke/each/stage";
import { Em } from "@/components/luke/theme";

/**
 * 10. Water. The sentence stands on a waterline across the middle of the
 * screen, and under it lies its reflection, broken up by ripples that
 * run with the scroll, fading down into the ground. The koi's water.
 *
 * The reflection is the sentence drawn into a 2D canvas (the page's own
 * fonts, once they are in), then drawn back upside down a row at a time,
 * each row slid sideways by a ripple and faded with its depth.
 */

const AT: [number, number] = [0.06, 0.4];

export default function E10Water(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const line = useRef<HTMLParagraphElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const state = useRef({ p: 0, reduced: false });
  const draw = useRef<() => void>(() => {});

  useEffect(() => {
    const el = line.current;
    const cv = canvas.current;
    if (!el || !cv) return undefined;
    const ctx = cv.getContext("2d");
    if (!ctx) return undefined;
    const off = document.createElement("canvas");
    const octx = off.getContext("2d");
    if (!octx) return undefined;
    let dpr = 1;
    let w = 1;
    let h = 1;

    // The sentence into the offscreen canvas at the size and in the fonts
    // the live one has, in the type's colour.
    const render = (): void => {
      const r = el.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      off.width = Math.round(w * dpr);
      off.height = Math.round(h * dpr);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, w, h);
      octx.fillStyle = getComputedStyle(el).color;
      octx.textBaseline = "alphabetic";
      // Each word where the live one is, in its own font.
      const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-word]"));
      for (const s of spans) {
        const cs = getComputedStyle(s);
        const b = s.getBoundingClientRect();
        octx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        octx.letterSpacing = cs.letterSpacing;
        // Baseline: the span's bottom less its descent, near enough from
        // the font's own measure.
        const m = octx.measureText(s.textContent ?? "");
        octx.fillText(s.textContent ?? "", b.left - r.left, b.top - r.top + m.fontBoundingBoxAscent);
      }
      cv.width = off.width;
      cv.height = Math.round(h * 1.15 * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${Math.round(h * 1.15)}px`;
      draw.current();
    };

    draw.current = () => {
      const { p, reduced } = state.current;
      const rows = off.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      // The ripple runs with the scroll; still, it is one gentle bend.
      const phase = reduced ? 0 : p * 40;
      const depth = cv.height;
      for (let y = 0; y < rows; y += 1) {
        const t = y / rows;
        const sway = (Math.sin(t * 28 + phase) * 0.55 + Math.sin(t * 9 - phase * 0.6) * 0.45) * (3 + 10 * t) * dpr;
        ctx.globalAlpha = 0.45 * (1 - t) * (1 - t);
        ctx.drawImage(off, 0, rows - 1 - y, off.width, 1, sway, Math.round((y / rows) * depth), off.width, 2);
      }
      ctx.globalAlpha = 1;
    };

    render();
    void document.fonts.ready.then(render);
    const ro = new ResizeObserver(render);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    state.current = { p, reduced };
    const e = reduced ? 1 : clamp01((p - AT[0]) / (AT[1] - AT[0]));
    const k = e * e * (3 - 2 * e);
    if (line.current) {
      line.current.style.opacity = k.toFixed(3);
      line.current.style.transform = `translate3d(0, ${((1 - k) * 0.5).toFixed(3)}em, 0)`;
    }
    if (canvas.current) canvas.current.style.opacity = k.toFixed(3);
    draw.current();
  });

  // Two lines: in one at a size worth having, the sentence ran off the
  // right edge.
  const lines = [
    ["Each", "project", "is", "an", "opportunity", "to"],
    ["learn,", "build", "and", "show", "what", "I", "can", "do."],
  ];
  return (
    <Stage heightVh={240} sectionRef={sectionRef}>
      <div className="absolute inset-x-[6vw] top-1/2 -translate-y-full">
        <p className="whitespace-nowrap text-center font-sans text-[clamp(30px,5vw,150px)] leading-[1.08] tracking-[-0.035em]" ref={line} style={{ opacity: 0 }}>
          {lines.map((ws, j) => (
            <span className="block" key={j}>
              {ws.map((t, i) => (
                <span key={i}>
                  <span data-word>{j === 1 && i < 2 ? <Em>{t}</Em> : t}</span>
                  {i < ws.length - 1 ? " " : null}
                </span>
              ))}
            </span>
          ))}
        </p>
        {/* The waterline. */}
        <div className="mx-auto mt-[0.1em] h-px w-[70%] bg-current opacity-20" />
        <canvas aria-hidden="true" className="block" ref={canvas} style={{ opacity: 0 }} />
      </div>
    </Stage>
  );
}
