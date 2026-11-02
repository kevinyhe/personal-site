"use client";

import { type JSX, useEffect, useRef } from "react";

import { LIGHT_ON_BLACK, mountBar } from "@/components/luke/each/bar";
import { createFish } from "@/components/luke/each/fish";
import { createReflection, type Reflection } from "@/components/luke/each/reflection";
import { clamp01, Stage, useProgress } from "@/components/luke/each/stage";
import { Em } from "@/components/luke/theme";
import type { BarLayerConfig } from "@/components/valley/barShader";

/**
 * 12. Pond. The sentence stands on a waterline across the middle of the
 * screen with its reflection rippling under it, and a koi swims the pond
 * beneath, drawn in bars like the Work koi (fish.ts): it comes in from
 * the left as the words come and crosses under the sentence with the
 * scroll, its reflection and the water's ripple running together.
 */

const AT: [number, number] = [0.06, 0.4];
const SWIM: [number, number] = [0.0, 1.0];

export default function G12Pond(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const line = useRef<HTMLParagraphElement | null>(null);
  const mirror = useRef<HTMLCanvasElement | null>(null);
  const bars = useRef<HTMLCanvasElement | null>(null);
  const reflection = useRef<Reflection | null>(null);
  const fishT = useRef<(t: number) => void>(() => {});

  useEffect(() => {
    const el = line.current;
    const cv = mirror.current;
    const bc = bars.current;
    if (!el || !cv || !bc) return undefined;
    reflection.current = createReflection(el, cv, 0.4);
    let dispose: (() => void) | null = null;
    const img = new Image();
    img.onload = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const fish = createFish(img, 1280, Math.round((1280 * h) / w), 1280 * 0.5);
      const cols = w < 1024 ? Math.round(w / 4) : 300;
      const config: BarLayerConfig = {
        x: "0%",
        y: "0%",
        width: "100%",
        height: "100%",
        ...LIGHT_ON_BLACK,
        xSquares: cols,
        ySquares: Math.round((cols * h) / w),
        bgOpacity: 0,
        fillOpacity: 1,
      };
      const mounted = mountBar(bc, [{ type: "canvas", source: fish.source, config }]);
      fishT.current = (t) => fish.setT(t);
      dispose = () => {
        mounted?.dispose();
        fish.dispose();
      };
    };
    img.src = "/work/koi.png";
    return () => {
      reflection.current?.dispose();
      dispose?.();
    };
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    const e = reduced ? 1 : clamp01((p - AT[0]) / (AT[1] - AT[0]));
    const k = e * e * (3 - 2 * e);
    if (line.current) {
      line.current.style.opacity = k.toFixed(3);
      line.current.style.transform = `translate3d(0, ${((1 - k) * 0.5).toFixed(3)}em, 0)`;
    }
    if (mirror.current) mirror.current.style.opacity = k.toFixed(3);
    reflection.current?.draw(p, reduced);
    fishT.current(reduced ? 0.55 : clamp01((p - SWIM[0]) / (SWIM[1] - SWIM[0])));
  });

  const lines = [
    ["Each", "project", "is", "an", "opportunity", "to"],
    ["learn,", "build", "and", "show", "what", "I", "can", "do."],
  ];
  return (
    <Stage heightVh={300} sectionRef={sectionRef}>
      {/* The pond: the koi in bars, under the waterline. */}
      <canvas
        aria-hidden="true"
        className="absolute inset-0 block h-full w-full [mask-image:linear-gradient(to_bottom,transparent_50%,black_56%,black_92%,transparent)]"
        ref={bars}
      />
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
        <canvas aria-hidden="true" className="block" ref={mirror} style={{ opacity: 0 }} />
      </div>
    </Stage>
  );
}
