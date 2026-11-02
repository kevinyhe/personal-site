"use client";

import { type JSX, useEffect, useRef } from "react";

import { mountBar } from "@/components/luke/each/bar";
import { createPoppy, FRAME_H, FRAME_W, GRADE, type Hole, loadSheet } from "@/components/luke/each/poppies";
import { applyReveal, clamp01, Stage, useProgress, WORDS } from "@/components/luke/each/stage";
import { Em } from "@/components/luke/theme";
import type { BarLayerConfig } from "@/components/valley/barShader";

/**
 * 23. Poppies. The band's flower at the size of the screen: the two
 * sprays of sondaven's prologue (poppies.ts), each a screen tall,
 * standing on the bottom edge at either side and bleeding off it, in
 * bars as fine as the band's. They come up as buds and open with the
 * scroll, swaying, and the sentence stands between and over them in the
 * band's own italic serif, five lines, at the band's size. Where a word
 * crosses a spray the bars make room for it as it comes in (the koi's
 * holes under the project names).
 */

const BLOOM: [number, number] = [0.0, 0.56];
const WORDS_AT: [number, number] = [0.24, 0.62];
/** Where each spray's middle stands across the screen. */
const SPRAY_X = [0.2, 0.8];
/** A spray's height, in screens. */
const SPRAY_H = 1.0;
/** Bar cell on a wide screen, px. */
const CELL = 5;
/** Room round a word, in ems of the sentence. */
const PAD_X = 0.22;
const PAD_Y = 0.06;

const ROWS: number[][] = [
  [0, 1, 2],
  [3, 4],
  [5, 6, 7],
  [8, 9, 10],
  [11, 12, 13],
];

export default function H23Poppies(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const reveal = useRef<number[]>(WORDS.map(() => 0));
  const bars = useRef<HTMLCanvasElement | null>(null);
  const setOpen = useRef<(t: number) => void>(() => {});

  useEffect(() => {
    const bc = bars.current;
    const stage = stageRef.current;
    if (!bc || !stage) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const sheet = loadSheet();
    const boxH = SPRAY_H * h;
    const boxW = (boxH * FRAME_W) / FRAME_H;
    const cell = w < 1024 ? 4 : CELL;
    const cols = Math.round(boxW / cell);
    const rows = Math.round(boxH / cell);
    const boxes = SPRAY_X.map((cx) => ({ left: cx * w - boxW / 2, top: h - boxH }));
    const sprays = boxes.map((_, i) => createPoppy(sheet, { mirror: i === 0, phase: i * 2.1, still: reduced }));
    const layers = boxes.map((b): BarLayerConfig => ({
      x: `${((b.left / w) * 100).toFixed(3)}%`,
      y: `${((b.top / h) * 100).toFixed(3)}%`,
      width: `${((boxW / w) * 100).toFixed(3)}%`,
      height: `${((boxH / h) * 100).toFixed(3)}%`,
      ...GRADE,
      xSquares: cols,
      ySquares: rows,
      bgOpacity: 0,
      fillOpacity: 1,
    }));
    // The words' boxes, in each spray's frame px, grown as the word comes
    // in: a word not yet there leaves the spray whole.
    const em = () => parseFloat(getComputedStyle(words.current[0] ?? stage).fontSize) || 16;
    sprays.forEach((s, i) => {
      s.setHoles((): Hole[] => {
        const c = stage.getBoundingClientRect();
        const e = em();
        const kx = FRAME_W / boxW;
        const ky = FRAME_H / boxH;
        const out: Hole[] = [];
        words.current.forEach((el, k) => {
          const g = reveal.current[k];
          if (!el || g <= 0) return;
          const r = el.getBoundingClientRect();
          const cx = r.left - c.left + r.width / 2 - boxes[i].left;
          const cy = r.top - c.top + r.height / 2 - boxes[i].top;
          const hw = (r.width / 2 + PAD_X * e) * g;
          const hh = (r.height / 2 + PAD_Y * e) * g;
          out.push({ x: (cx - hw) * kx, y: (cy - hh) * ky, w: 2 * hw * kx, h: 2 * hh * ky });
        });
        return out;
      });
    });
    const mounted = mountBar(
      bc,
      sprays.map((s, i) => ({ type: "canvas" as const, source: s.source, config: layers[i] })),
      reduced ? 4 : 60,
    );
    setOpen.current = (t) => sprays.forEach((s) => s.setOpen(t));
    return () => {
      mounted?.dispose();
      sprays.forEach((s) => s.source.dispose?.());
    };
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    setOpen.current(reduced ? 1 : clamp01((p - BLOOM[0]) / (BLOOM[1] - BLOOM[0])));
    const k0 = reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0]));
    applyReveal(words.current, k0);
    const n = WORDS.length;
    reveal.current = WORDS.map((_, i) => {
      const k = clamp01(k0 * (n + 1.5) - i);
      return k * k * (3 - 2 * k);
    });
  });

  return (
    <Stage heightVh={300} sectionRef={sectionRef}>
      <div className="absolute inset-0" ref={stageRef}>
        <canvas aria-hidden="true" className="absolute inset-0 block h-full w-full" ref={bars} />
        <p className="absolute left-1/2 top-1/2 z-10 w-[92vw] -translate-x-1/2 -translate-y-1/2 text-center font-serif-display text-[clamp(32px,10.5vh,160px)] italic leading-[1.02] tracking-[-0.03em]">
          {ROWS.map((row, r) => (
            <span className="block" key={r}>
              {row.map((i, j) => (
                <span key={i}>
                  <span
                    className="inline-block motion-reduce:!opacity-100"
                    ref={(el) => {
                      words.current[i] = el;
                    }}
                    style={{ opacity: 0.08 }}
                  >
                    {WORDS[i].em ? <Em>{WORDS[i].t}</Em> : WORDS[i].t}
                  </span>
                  {j < row.length - 1 ? " " : null}
                </span>
              ))}
            </span>
          ))}
        </p>
      </div>
    </Stage>
  );
}
