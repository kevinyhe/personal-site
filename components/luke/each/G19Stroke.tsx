"use client";

import { type JSX, useEffect, useRef } from "react";

import { LIGHT_ON_BLACK, mountBar } from "@/components/luke/each/bar";
import { applyReveal, clamp01, Stage, useProgress, Words } from "@/components/luke/each/stage";
import { ACCENT } from "@/components/luke/theme";
import { type BarLayerConfig, type CanvasSource, hexToRgb } from "@/components/valley/barShader";
import { makeRng } from "@/components/valley/sources/noise";

/**
 * 19. Stroke. lukebaffait.fr's red brush line, in this site's bars and
 * its rose: one long stroke of a loaded brush, thin where it lands,
 * swelling through two bends and lifting off thin at the far side, drawn
 * across the screen by the scroll, with the sentence's words coming in
 * over its first bend. The stroke's edge is a little dry, as a brush is.
 */

const DRAW: [number, number] = [0.02, 0.72];
const WORDS_AT: [number, number] = [0.14, 0.52];
const W = 1280;
const H = 720;
const SAMPLES = 420;

/** The stroke on a black canvas, white, drawn to `k` of its length. */
function createStroke(): { source: CanvasSource; set(k: number): void } {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const rand = makeRng(5);
  // The line, as cubic Béziers, and its half width along it.
  const P: [number, number][] = [
    [-80, 300],
    [260, 120],
    [420, 560],
    [660, 390],
    [900, 220],
    [1040, 180],
    [1380, 470],
  ];
  const pts: { x: number; y: number; nx: number; ny: number; hw: number; jl: number; jr: number }[] = [];
  const segs = (P.length - 1) / 3;
  for (let i = 0; i <= SAMPLES; i += 1) {
    const g = (i / SAMPLES) * segs;
    const k = Math.min(segs - 1, Math.floor(g));
    const t = g - k;
    const [a, b, c, d] = [P[3 * k], P[3 * k + 1], P[3 * k + 2], P[3 * k + 3]];
    const u = 1 - t;
    const x = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
    const y = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
    const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
    const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
    const len = Math.hypot(dx, dy) || 1;
    const s = i / SAMPLES;
    // Thin on and off, fullest a third of the way in, a second swell late.
    const hw = 6 + 34 * Math.pow(Math.sin(Math.PI * s), 0.7) * (1 - 0.35 * Math.pow(Math.sin(Math.PI * s * 2 + 0.4), 2));
    pts.push({ x, y, nx: -dy / len, ny: dx / len, hw, jl: (rand() - 0.5) * 5, jr: (rand() - 0.5) * 5 });
  }
  let drawn = -1;
  const draw = (k: number): void => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const n = Math.round(k * SAMPLES);
    if (n < 2) return;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    for (let i = 0; i <= n; i += 1) {
      const q = pts[i];
      const w = q.hw + q.jl;
      if (i === 0) ctx.moveTo(q.x + q.nx * w, q.y + q.ny * w);
      else ctx.lineTo(q.x + q.nx * w, q.y + q.ny * w);
    }
    // Round the tip, then back along the other edge.
    const tip = pts[n];
    ctx.arc(tip.x, tip.y, tip.hw, Math.atan2(tip.ny, tip.nx), Math.atan2(-tip.ny, -tip.nx), false);
    for (let i = n; i >= 0; i -= 1) {
      const q = pts[i];
      const w = q.hw + q.jr;
      ctx.lineTo(q.x - q.nx * w, q.y - q.ny * w);
    }
    ctx.closePath();
    ctx.fill();
    // Dry streaks along the stroke: a few hairlines of black.
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.4;
    for (let s = 0; s < 4; s += 1) {
      const off = (s - 1.5) * 0.34;
      ctx.beginPath();
      for (let i = Math.round(n * 0.25); i <= n; i += 1) {
        const q = pts[i];
        const w = q.hw * off + Math.sin(i * 0.11 + s) * 1.5;
        if (i === Math.round(n * 0.25)) ctx.moveTo(q.x + q.nx * w, q.y + q.ny * w);
        else ctx.lineTo(q.x + q.nx * w, q.y + q.ny * w);
      }
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };
  let want = 0;
  draw(0);
  return {
    source: {
      canvas,
      animated: true,
      update: () => {
        if (want === drawn) return false;
        drawn = want;
        draw(want);
        return true;
      },
    },
    set: (k) => {
      want = Math.max(0, Math.min(1, k));
    },
  };
}

export default function G19Stroke(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const bars = useRef<HTMLCanvasElement | null>(null);
  const setK = useRef<(k: number) => void>(() => {});

  useEffect(() => {
    const bc = bars.current;
    if (!bc) return undefined;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const stroke = createStroke();
    const cols = w < 1024 ? Math.round(w / 4) : 300;
    // The stroke's frame is 16:9, laid over the middle of the screen at
    // the screen's width.
    const boxH = (w * 9) / 16;
    const config: BarLayerConfig = {
      x: "0%",
      y: `${((h - boxH) / 2 / h) * 100}%`,
      width: "100%",
      height: `${(boxH / h) * 100}%`,
      ...LIGHT_ON_BLACK,
      xSquares: cols,
      ySquares: Math.round((cols * 9) / 16),
      bgOpacity: 0,
      fillOpacity: 1,
    };
    const mounted = mountBar(bc, [{ type: "canvas", source: stroke.source, config }], 60, hexToRgb(ACCENT));
    setK.current = stroke.set;
    return () => mounted?.dispose();
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    setK.current(reduced ? 1 : clamp01((p - DRAW[0]) / (DRAW[1] - DRAW[0])));
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
  });

  return (
    <Stage heightVh={280} sectionRef={sectionRef}>
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
