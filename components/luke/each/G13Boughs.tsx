"use client";

import { type JSX, useEffect, useRef } from "react";

import { createBloomField } from "@/components/bloomField";
import { LIGHT_ON_BLACK, mountBar } from "@/components/luke/each/bar";
import { applyReveal, clamp01, Stage, useProgress, Words } from "@/components/luke/each/stage";
import type { BarLayerConfig } from "@/components/valley/barShader";

/**
 * 13. Boughs. The statement band's cherry boughs (bloomField.ts): one
 * spray grows up out of each lower corner, leaning in toward the middle,
 * and blossoms as the sentence's words come in between them, in bars.
 * The right one is the left one mirrored. Grown, they stand; nothing
 * moves on its own.
 */

const GROW: [number, number] = [0.02, 0.5];
const WORDS_AT: [number, number] = [0.14, 0.52];
/** Each spray's box: a share of the width, from the bottom edge. */
const BOX_W = 0.42;
const BOX_H = 1.0;
/** Bar cell on a wide screen, px: finer than the koi's, so a blossom is
 *  more than a block or two. */
const CELL = 3.5;

export default function G13Boughs(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const bars = useRef<HTMLCanvasElement | null>(null);
  const setOpen = useRef<(t: number) => void>(() => {});

  useEffect(() => {
    const bc = bars.current;
    if (!bc) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fieldH = 720;
    const field = createBloomField({ width: Math.round((BOX_W * w * fieldH) / (BOX_H * h)), height: fieldH, still: reduced, tilt: 0.3 });
    const cols = Math.round((BOX_W * w) / (w < 1024 ? 4 : CELL));
    const rows = Math.round((cols * BOX_H * h) / (BOX_W * w));
    const base: BarLayerConfig = {
      x: "0%",
      y: `${(1 - BOX_H) * 100}%`,
      width: `${BOX_W * 100}%`,
      height: `${BOX_H * 100}%`,
      ...LIGHT_ON_BLACK,
      xSquares: cols,
      ySquares: rows,
      bgOpacity: 0,
      fillOpacity: 1,
    };
    const right: BarLayerConfig = { ...base, x: `${(1 - BOX_W) * 100}%`, mirrorX: true };
    const mounted = mountBar(bc, [
      { type: "canvas", source: field.source, config: base },
      { type: "canvas", source: field.source, config: right },
    ]);
    setOpen.current = (t) => field.set(t);
    return () => {
      mounted?.dispose();
      field.dispose();
    };
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    setOpen.current(reduced ? 1 : clamp01((p - GROW[0]) / (GROW[1] - GROW[0])));
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
  });

  return (
    <Stage heightVh={260} sectionRef={sectionRef}>
      <canvas aria-hidden="true" className="absolute inset-0 block h-full w-full" ref={bars} />
      <p className="absolute left-1/2 top-1/2 z-10 w-[88vw] max-w-[44rem] -translate-x-1/2 -translate-y-1/2 text-center font-sans text-[clamp(28px,2.6vw,96px)] leading-[1.18] tracking-[-0.03em] md:w-[44vw] md:max-w-none">
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
