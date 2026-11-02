"use client";

import { type JSX, useEffect, useRef } from "react";

import { onPalette } from "@/components/cloudPalette";
import { applyReveal, clamp01, smooth, Stage, useProgress, Words } from "@/components/luke/each/stage";

/**
 * 25. Cut-outs. Five petal shapes the size of the screen, cut from
 * translucent rose paper and laid over each other (multiplied), each
 * hinged at a point off the edge of the screen and swinging across it
 * with the scroll on its own arc, so the overlaps shift and deepen as
 * the page moves; a scatter of small petals turns with them. The
 * sentence sits in the middle, over the paper. Vectors only; nothing
 * moves on its own.
 */

/** Each shape: its hinge (screen widths and heights from the middle),
 *  its length and width (screen heights), the fill, and the angle it
 *  swings from and to over the run (degrees, 0 = up). */
const SHAPES: { at: [number, number]; len: number; width: number; fill: string; alpha: number; from: number; to: number }[] = [
  { at: [-0.62, 0.72], len: 1.35, width: 0.58, fill: "#ef9fc6", alpha: 0.85, from: 62, to: 18 },
  { at: [0.66, 0.78], len: 1.3, width: 0.52, fill: "#ea86b6", alpha: 0.85, from: -58, to: -14 },
  { at: [0.1, -0.95], len: 1.1, width: 0.5, fill: "#e4679f", alpha: 0.8, from: 150, to: 196 },
  { at: [-0.64, -0.3], len: 1.0, width: 0.4, fill: "#d93f7a", alpha: 0.72, from: 148, to: 98 },
  { at: [0.7, 0.05], len: 0.9, width: 0.36, fill: "#e4679f", alpha: 0.75, from: -118, to: -82 },
];
/** The small petals: where they turn about (screen widths and heights
 *  from the middle), their length (screen heights), and their turn. */
const SPRIGS: { at: [number, number]; len: number; from: number; to: number; fill: string }[] = [
  { at: [-0.36, -0.36], len: 0.1, from: -40, to: 30, fill: "#d93f7a" },
  { at: [0.34, 0.32], len: 0.12, from: 160, to: 230, fill: "#d93f7a" },
  { at: [0.4, -0.3], len: 0.08, from: 90, to: 20, fill: "#e4679f" },
  { at: [-0.3, 0.34], len: 0.09, from: 200, to: 250, fill: "#e4679f" },
  { at: [0.0, -0.42], len: 0.07, from: 20, to: -40, fill: "#ea86b6" },
];
const WORDS_AT: [number, number] = [0.2, 0.58];

/** A petal with its base at the origin and its tip straight up, in px. */
function petal(L: number, w: number): string {
  return `M0 0C${(w * 0.72).toFixed(1)} ${(-L * 0.22).toFixed(1)} ${(w * 0.62).toFixed(1)} ${(-L * 0.72).toFixed(1)} 0 ${(-L).toFixed(1)}C${(-w * 0.62).toFixed(1)} ${(-L * 0.72).toFixed(1)} ${(-w * 0.72).toFixed(1)} ${(-L * 0.22).toFixed(1)} 0 0Z`;
}

export default function H25Cutouts(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const shapes = useRef<(SVGPathElement | null)[]>([]);
  const sprigs = useRef<(SVGPathElement | null)[]>([]);
  const svg = useRef<SVGSVGElement | null>(null);
  const paper = useRef<SVGGElement | null>(null);

  useEffect(
    () =>
      onPalette((t) => {
        if (paper.current) paper.current.style.mixBlendMode = t > 0.5 ? "multiply" : "screen";
      }),
    [],
  );

  // The shapes are drawn in screen px, so their paths are set once the
  // screen's size is known (and again when it changes).
  useEffect(() => {
    const size = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      svg.current?.setAttribute("viewBox", `${-w / 2} ${-h / 2} ${w} ${h}`);
      shapes.current.forEach((el, i) => el?.setAttribute("d", petal(SHAPES[i].len * h, SHAPES[i].width * h)));
      sprigs.current.forEach((el, i) => el?.setAttribute("d", petal(SPRIGS[i].len * h, SPRIGS[i].len * h * 0.42)));
    };
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
    const w = window.innerWidth;
    const h = window.innerHeight;
    // One speed with the ends eased a little, over the whole section.
    const q = reduced ? 0.5 : 0.7 * clamp01(p) + 0.3 * smooth(p);
    shapes.current.forEach((el, i) => {
      if (!el) return;
      const s = SHAPES[i];
      const a = s.from + (s.to - s.from) * q;
      el.setAttribute("transform", `translate(${(s.at[0] * w).toFixed(1)} ${(s.at[1] * h).toFixed(1)}) rotate(${a.toFixed(2)})`);
    });
    sprigs.current.forEach((el, i) => {
      if (!el) return;
      const s = SPRIGS[i];
      const a = s.from + (s.to - s.from) * q;
      el.setAttribute("transform", `translate(${(s.at[0] * w).toFixed(1)} ${(s.at[1] * h).toFixed(1)}) rotate(${a.toFixed(2)})`);
    });
  });

  return (
    <Stage heightVh={320} sectionRef={sectionRef}>
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" ref={svg} viewBox="-960 -540 1920 1080">
        <g ref={paper} style={{ mixBlendMode: "multiply" }}>
          {SHAPES.map((s, i) => (
            <path
              d="M0 0"
              fill={s.fill}
              fillOpacity={s.alpha}
              key={i}
              ref={(el) => {
                shapes.current[i] = el;
              }}
            />
          ))}
          {SPRIGS.map((s, i) => (
            <path
              d="M0 0"
              fill={s.fill}
              fillOpacity={0.85}
              key={`s${i}`}
              ref={(el) => {
                sprigs.current[i] = el;
              }}
            />
          ))}
        </g>
      </svg>
      <p className="absolute left-1/2 top-1/2 z-10 w-[88vw] max-w-[44rem] -translate-x-1/2 -translate-y-1/2 text-center font-sans text-[clamp(26px,2.9vw,100px)] leading-[1.16] tracking-[-0.03em] [text-wrap:balance] md:w-[42vw] md:max-w-none">
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
