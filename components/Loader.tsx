"use client";

import { type JSX, useEffect, useRef } from "react";

import { BAND, BLOSSOM } from "@/components/bandColours";
import { createBloomField } from "@/components/bloomField";

/**
 * The loading screen, laid out the way sondaven.com's is: the plum ground,
 * a small mark and a label at the top left, one thing in the middle drawn
 * in the site's bars (sondaven's is a sheep walking; this is a sakura
 * bough that grows and opens while the page loads), a line of small caps in each bottom corner with the
 * percentage on the right, and the name set huge across the foot in
 * bar-cut type.
 *
 * HeroIntro owns the progress: it writes the percentage into
 * [data-loader-pct] and the rule's width into its own fill, and lifts the
 * whole veil once the television is ready.
 */

const NAME = "KEVIN HE";

export default function Loader(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The name, drawn white on black once the font is in, as a layer the
    // bars cut into columns with ragged tops, as sondaven's wordmark is.
    const name = document.createElement("canvas");
    name.width = 2400;
    name.height = 360;
    const drawName = () => {
      const ctx = name.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, name.width, name.height);
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "alphabetic";
      const family = getComputedStyle(document.body).fontFamily || "sans-serif";
      let size = 400;
      ctx.font = `700 ${size}px ${family}`;
      const wide = ctx.measureText(NAME).width;
      size *= (name.width * 0.99) / wide;
      ctx.font = `700 ${size}px ${family}`;
      const m = ctx.measureText(NAME);
      const x = (name.width - m.width) / 2;
      ctx.fillText(NAME, x, name.height - (name.height - m.actualBoundingBoxAscent) / 2);
    };
    drawName();
    void document.fonts?.ready.then(drawName);
    // The bars are drawn here with a plain 2D canvas, the same rule as the
    // site's bar shader (one vertical bar a cell, as wide as the cell is
    // bright), because a WebGL canvas here cost the television its context
    // and the page flashed white as the veil lifted.
    const bough = createBloomField({ width: 900, height: 700, still: reduced, tilt: 0.12 });
    const ctx = canvas.getContext("2d");
    const sample = document.createElement("canvas");
    const sctx = sample.getContext("2d", { willReadFrequently: true });
    const fill = BLOSSOM;
    type Box = { src: HTMLCanvasElement; x: number; y: number; w: number; h: number; cols: number; rows: number; cap: number };
    const boxes = (): Box[] => [
      { src: bough.source.canvas, x: 0.34, y: 0.12, w: 0.32, h: 0.54, cols: 110, rows: 150, cap: 1 },
      { src: name, x: 0.015, y: 0.8, w: 0.97, h: 0.16, cols: 260, rows: 26, cap: 0.92 },
    ];
    const paint = () => {
      if (!ctx || !sctx) return;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (canvas.width !== Math.round(W * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = fill;
      for (const b of boxes()) {
        // Shrink the source to one pixel a cell, then read each cell's grey.
        sample.width = b.cols;
        sample.height = b.rows;
        sctx.drawImage(b.src, 0, 0, b.cols, b.rows);
        const data = sctx.getImageData(0, 0, b.cols, b.rows).data;
        const cw = (b.w * W) / b.cols;
        const ch = (b.h * H) / b.rows;
        for (let r = 0; r < b.rows; r += 1) {
          for (let c = 0; c < b.cols; c += 1) {
            const v = data[(r * b.cols + c) * 4] / 255;
            if (v < 0.1) continue;
            const bw = cw * Math.min(b.cap, v);
            ctx.fillRect(b.x * W + c * cw + (cw - bw) / 2, b.y * H + r * ch, bw, ch + 0.5);
          }
        }
      }
    };

    // The bough grows and opens while the page loads, then holds open.
    let raf = 0;
    const t0 = performance.now();
    const frame = () => {
      const time = (performance.now() - t0) / 1000;
      bough.set(reduced ? 1 : Math.min(1, time / 2.6));
      bough.source.update?.(time, 1 / 60);
      paint();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // The site is ready and the veil is about to lift: stop drawing.
    const onLoaded = () => cancelAnimationFrame(raf);
    window.addEventListener("arbor:loaded", onLoaded);

    return () => {
      window.removeEventListener("arbor:loaded", onLoaded);
      cancelAnimationFrame(raf);
      bough.dispose();
      name.width = 1;
      name.height = 1;
      sample.width = 1;
    };
  }, []);

  const label = "font-mono text-[1.5rem] uppercase leading-[1.5] tracking-[0.18em]";
  return (
    <div className="absolute inset-0" style={{ backgroundColor: BAND, color: BLOSSOM }}>
      <canvas aria-hidden className="absolute inset-0 block h-full w-full" ref={canvasRef} />
      <div className="absolute left-[3vw] top-[4vh]">
        {/* Three stepped bars, the site's own mark for things drawn in bars. */}
        <svg aria-hidden className="h-[3.2rem] w-[4.4rem]" fill="currentColor" viewBox="0 0 22 16">
          <rect height="10" width="3" x="0" y="6" />
          <rect height="13" width="3" x="5" y="3" />
          <rect height="16" width="3" x="10" y="0" />
          <rect height="8" width="3" x="15" y="8" />
          <rect height="1.2" width="22" x="0" y="14.8" />
        </svg>
        <p className={`mt-[1.6rem] ${label}`}>Kevin He · engineer</p>
      </div>
      <div className="absolute inset-x-[3vw] bottom-[21vh] flex items-end justify-between">
        <p className={label}>
          Software for
          <br />
          things that move
        </p>
        <p className={`text-right ${label}`}>
          Loading site
          <br />
          please wait · <span className="tabular-nums" data-loader-pct>0%</span>
        </p>
      </div>
    </div>
  );
}
