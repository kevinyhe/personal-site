"use client";

import { type JSX, useEffect, useRef } from "react";

import { mountBar } from "@/components/luke/each/bar";
import { applyReveal, clamp01, Stage, useProgress, Words } from "@/components/luke/each/stage";
import type { BarLayerConfig } from "@/components/valley/barShader";
import { createPetalBank } from "@/components/valley/sources/petalBank";

/**
 * 16. Petals. Cherry petals (valley/sources/petalBank.ts: the drift the
 * valley has in place of the reference's sheep) blow across the screen
 * behind the sentence, drawn in bars, near ones big and bright, far ones
 * small and faint. The drift's box is let down the screen by the scroll,
 * so the petals fall past the words as they come in; inside it they
 * drift and turn on their own, as they do in the valley.
 */

const FALL: [number, number] = [0.0, 1.0];
const WORDS_AT: [number, number] = [0.12, 0.5];

export default function G16Petals(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const bars = useRef<HTMLCanvasElement | null>(null);
  const config = useRef<BarLayerConfig | null>(null);

  useEffect(() => {
    const bc = bars.current;
    if (!bc) return undefined;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = w < 1024 ? Math.round(w / 4) : 300;
    const rows = Math.round((cols * h) / w);
    const bank = createPetalBank({ seed: 21, width: 1200, height: Math.round((1200 * h) / w) });
    // petalBank.ts is graded the normal way up: a dark grey draws a wide bar.
    const cfg: BarLayerConfig = {
      x: "0%",
      y: "-40%",
      width: "100%",
      height: "100%",
      blackPoint: 15,
      whitePoint: 255,
      threshold: 255,
      xSquares: cols,
      ySquares: rows,
      bgOpacity: 0,
      fillOpacity: 1,
    };
    config.current = cfg;
    const mounted = mountBar(bc, [{ type: "canvas", source: bank, config: cfg }]);
    return () => {
      mounted?.dispose();
      bank.dispose?.();
    };
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
    if (config.current) {
      const t = reduced ? 0.5 : clamp01((p - FALL[0]) / (FALL[1] - FALL[0]));
      config.current.y = `${(-40 + t * 70).toFixed(2)}%`;
    }
  });

  return (
    <Stage heightVh={300} sectionRef={sectionRef}>
      {/* A soft clearing in the drift round the sentence, so no petal
          crosses the words. */}
      <canvas
        aria-hidden="true"
        className="absolute inset-0 block h-full w-full [mask-image:radial-gradient(ellipse_30vw_14vh_at_50%_50%,transparent_50%,black_100%)]"
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
