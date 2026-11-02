"use client";

import { type JSX, useEffect, useRef } from "react";

import { mountBar } from "@/components/luke/each/bar";
import { applyReveal, clamp01, Stage, useProgress, Words } from "@/components/luke/each/stage";
import type { BarLayerConfig } from "@/components/valley/barShader";
import { createBirds } from "@/components/valley/sources/birds";

/**
 * 15. Birds. A skein of birds (valley/sources/birds.ts: the ones that
 * cross the cloud bank) flies across the screen behind the sentence,
 * drawn in bars. The flock's box is carried from the right edge to the
 * left by the scroll; inside it the birds flap and drift on their own
 * slow circles, as they do over the clouds. The words come in as the
 * flock passes.
 */

const CROSS: [number, number] = [0.0, 1.0];
const WORDS_AT: [number, number] = [0.12, 0.5];
/** The flock's box: a share of the width, and where it flies, a share of
 *  the height from the top. */
const BOX_W = 0.72;
const BOX_Y = 0.04;
const CELL = 3.5;

export default function G15Birds(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const bars = useRef<HTMLCanvasElement | null>(null);
  const config = useRef<BarLayerConfig | null>(null);

  useEffect(() => {
    const bc = bars.current;
    if (!bc) return undefined;
    const w = window.innerWidth;
    const boxPx = BOX_W * w;
    // A wide, low box, so the flock flies over the sentence, not through it.
    const flock = createBirds({ seed: 7, width: 1000, height: 400, count: 7 });
    const cols = Math.round((BOX_W * w) / (w < 1024 ? 4 : CELL));
    const cfg: BarLayerConfig = {
      x: "110%",
      y: `${BOX_Y * 100}%`,
      width: `${BOX_W * 100}%`,
      height: `${(boxPx * 0.4 * 100) / window.innerHeight}%`,
      // birds.ts is graded upside down: a bright grey draws a wide bar.
      blackPoint: 255,
      whitePoint: 0,
      threshold: 255,
      xSquares: cols,
      ySquares: Math.round(cols * 0.4),
      bgOpacity: 0,
      fillOpacity: 1,
    };
    config.current = cfg;
    const mounted = mountBar(bc, [{ type: "canvas", source: flock, config: cfg }]);
    return () => {
      mounted?.dispose();
      flock.dispose?.();
    };
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
    if (config.current) {
      const t = reduced ? 0.5 : clamp01((p - CROSS[0]) / (CROSS[1] - CROSS[0]));
      config.current.x = `${(100 - t * (100 + BOX_W * 100 + 10)).toFixed(2)}%`;
      config.current.y = `${(BOX_Y * 100 + t * 10).toFixed(2)}%`;
    }
  });

  return (
    <Stage heightVh={300} sectionRef={sectionRef}>
      {/* A soft clearing round the sentence, for the bird that strays. */}
      <canvas
        aria-hidden="true"
        className="absolute inset-0 block h-full w-full [mask-image:radial-gradient(ellipse_28vw_12vh_at_50%_50%,transparent_55%,black_100%)]"
        ref={bars}
      />
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
