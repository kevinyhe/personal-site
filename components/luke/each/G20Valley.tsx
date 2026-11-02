"use client";

import { type JSX, useEffect, useRef } from "react";

import { css, ink, onPalette } from "@/components/cloudPalette";
import { applyReveal, clamp01, Stage, useProgress, Words } from "@/components/luke/each/stage";
import { fbm1 } from "@/components/valley/sources/noise";

/**
 * 20. Valley. The valley of bars the hero's picture sinks into
 * (ValleyTransition): two ridgelines of vertical bars, one behind the
 * other, rise out of the bottom edge with the scroll until the sentence
 * stands over them in the sky. Each bar is as wide as its ridge is near:
 * the front ridge in full bars, the one behind in thin ones, as the site
 * draws depth. Drawn on a 2D canvas, no WebGL; nothing moves on its own.
 */

const RISE: [number, number] = [0.0, 0.7];
const WORDS_AT: [number, number] = [0.12, 0.5];
/** Bar pitch in CSS px. */
const PITCH = 6;

export default function G20Valley(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const colour = useRef(css(ink(1)));
  const last = useRef(-1);

  useEffect(
    () =>
      onPalette((t) => {
        colour.current = css(ink(t));
        last.current = -1;
      }),
    [],
  );

  useProgress(sectionRef, (p, reduced) => {
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const t = reduced ? 1 : clamp01((p - RISE[0]) / (RISE[1] - RISE[0]));
    const e = 1 - (1 - t) * (1 - t);
    if (e === last.current) return;
    last.current = e;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colour.current;
    const n = Math.ceil(w / PITCH);
    // Two ridges: the far one higher and gentler, the near one lower and
    // rougher; both rise from under the bottom edge.
    const ridges = [
      { base: 0.62, amp: 0.2, scale: 0.0016, seed: 11, width: 0.3, alpha: 0.45, rise: 0.9 },
      { base: 0.8, amp: 0.16, scale: 0.0028, seed: 29, width: 0.62, alpha: 1, rise: 1 },
    ];
    for (const r of ridges) {
      ctx.globalAlpha = r.alpha;
      const lift = (1 - e * r.rise) * h;
      for (let i = 0; i < n; i += 1) {
        const x = i * PITCH;
        const top = (r.base - r.amp * fbm1(x * r.scale, 4, r.seed)) * h + lift;
        if (top >= h) continue;
        const bw = PITCH * r.width;
        ctx.fillRect(x + (PITCH - bw) / 2, top, bw, h - top);
      }
    }
    ctx.globalAlpha = 1;
  });

  return (
    <Stage heightVh={280} sectionRef={sectionRef}>
      <canvas aria-hidden="true" className="absolute inset-0 block h-full w-full" ref={canvas} />
      <p className="absolute left-1/2 top-[32%] z-10 w-[88vw] max-w-[44rem] -translate-x-1/2 -translate-y-1/2 text-center font-sans text-[clamp(28px,2.6vw,96px)] leading-[1.18] tracking-[-0.03em] md:w-[44vw] md:max-w-none">
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
