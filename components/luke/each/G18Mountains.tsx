"use client";

import { type JSX, useEffect, useRef } from "react";

import { mountBar } from "@/components/luke/each/bar";
import { applyReveal, clamp01, Stage, useProgress, Words } from "@/components/luke/each/stage";
import type { BarLayerConfig } from "@/components/valley/barShader";
import { createMountains } from "@/components/valley/sources/mountains";

/**
 * 18. Mountains. The valley's mountain country (valley/sources/
 * mountains.ts, the ranges the hero's hills and the end page are cut
 * from): a pale far ridge and four near ranges rise up out of the bottom
 * edge with the scroll, the near ones faster than the far, so the land
 * comes up under the sentence as its words come in, and it stands in the
 * sky over the ranges. Drawn in bars; nothing moves on its own.
 */

const RISE: [number, number] = [0.0, 0.7];
const WORDS_AT: [number, number] = [0.12, 0.5];

export default function G18Mountains(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const bars = useRef<HTMLCanvasElement | null>(null);
  const far = useRef<BarLayerConfig | null>(null);
  const near = useRef<BarLayerConfig | null>(null);
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const bc = bars.current;
    if (!bc) return undefined;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = w < 1024 ? Math.round(w / 4) : 300;
    const rowsFar = Math.round((cols * 0.4 * h) / w);
    const rowsNear = Math.round((cols * 0.36 * h) / w);
    const farSrc = createMountains({ seed: 3, width: 1200, height: Math.round((1200 * 0.4 * h) / w), variant: "far", xSquares: cols, ySquares: rowsFar });
    const nearSrc = createMountains({ seed: 5, width: 1200, height: Math.round((1200 * 0.36 * h) / w), variant: "near", ridges: 4, xSquares: cols, ySquares: rowsNear });
    // The ranges are painted in pale greys on black, the front range
    // darkest (mountains.ts). Graded the right way up over a narrow band
    // of greys, so a darker range draws a wider bar and the pale rim along
    // each crest draws a hairline; the black sky draws none. (Upside down,
    // or over the full range, the land was one solid block.)
    const farCfg: BarLayerConfig = {
      x: "0%",
      y: "100%",
      width: "100%",
      height: "40%",
      blackPoint: 60,
      whitePoint: 255,
      threshold: 255,
      xSquares: cols,
      ySquares: rowsFar,
      maxSquareWidth: "40%",
      bgOpacity: 0,
      fillOpacity: 1,
    };
    const nearCfg: BarLayerConfig = {
      x: "0%",
      y: "100%",
      width: "100%",
      height: "36%",
      blackPoint: 140,
      whitePoint: 235,
      threshold: 255,
      xSquares: cols,
      ySquares: rowsNear,
      // Capped under the cell, so the nearest range is dense bars, not a
      // solid block, and the ones behind it step back in thinner ones.
      maxSquareWidth: "70%",
      bgOpacity: 0,
      fillOpacity: 1,
    };
    far.current = farCfg;
    near.current = nearCfg;
    const mounted = mountBar(bc, [
      { type: "canvas", source: farSrc, config: farCfg },
      { type: "canvas", source: nearSrc, config: nearCfg },
    ]);
    // Stills: with nothing animated the bar canvas draws once and then
    // only when asked, so each move of the ranges asks.
    redraw.current = () => mounted?.bar.redraw();
    return () => {
      mounted?.dispose();
      farSrc.dispose?.();
      nearSrc.dispose?.();
    };
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
    const t = reduced ? 1 : clamp01((p - RISE[0]) / (RISE[1] - RISE[0]));
    const e = 1 - (1 - t) * (1 - t);
    if (far.current) far.current.y = `${(100 - e * 52).toFixed(2)}%`;
    if (near.current) near.current.y = `${(100 - e * 40).toFixed(2)}%`;
    redraw.current();
  });

  return (
    <Stage heightVh={280} sectionRef={sectionRef}>
      <canvas aria-hidden="true" className="absolute inset-0 block h-full w-full" ref={bars} />
      <p className="absolute left-1/2 top-[30%] z-10 w-[88vw] max-w-[44rem] -translate-x-1/2 -translate-y-1/2 text-center font-sans text-[clamp(28px,2.6vw,96px)] leading-[1.18] tracking-[-0.03em] md:w-[44vw] md:max-w-none">
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
