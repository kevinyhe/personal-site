"use client";

import { type JSX, useEffect, useRef } from "react";

import { GROUND } from "@/components/luke/theme";
import { WORDS } from "@/components/luke/each/stage";

/**
 * 22. Windows. The sentence as holes: a sheet of the band's plum comes
 * down over the pink for two screens, and the words are cut out of it,
 * four lines of the display serif at a sixth of the screen's height, so
 * the pink and the cloud bank drifting behind the page show through the
 * letters. Nothing is held; the sheet scrolls by like any section, and
 * each word's window opens (from a slit at its middle) as it comes up
 * the screen. The sheet's top and bottom edges break into bars on the
 * pink, as the valley's land does.
 *
 * Drawn on a canvas: the plum is painted and the letters taken out of it
 * (destination-out), which CSS cannot do with live type. A window opens
 * the way lukebaffait's words come in: from a faint blur a little below
 * its place, sharpening and rising.
 */

/** The type's size, in screen heights. */
const SIZE = 0.17;
/** Line height, in ems. */
const LEAD = 1.0;
/** The lines, as indexes into WORDS: four of about the same measure. */
const ROWS: number[][] = [
  [0, 1, 2, 3],
  [4, 5],
  [6, 7, 8],
  [9, 10, 11, 12, 13],
];
/** A window opens while its word's middle rises from here to here, in
 *  screen heights from the top. */
const OPEN: [number, number] = [0.92, 0.6];
/** Each word a little after the one before it on its line. */
const STAGGER = 0.035;
/** The plum above and below the type, in screen heights. */
const MARGIN = 0.5;
/** The broken edges, in screen heights. */
const EDGE = 0.07;
/** Bar pitch across the edge: 8px at 1920, as the cloud bank's. */
const EDGE_BARS = 240;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

type Laid = { i: number; x: number; w: number; row: number; font: string };

/** The plum breaking into bars: rows of cells, the bars full against the
 *  sheet and gone at the far edge. `up` puts the sheet at the bottom. */
function drawEdge(canvas: HTMLCanvasElement, up: boolean): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = GROUND;
  const pitch = w / EDGE_BARS;
  const cellH = pitch * 1.5;
  const rows = Math.ceil(h / cellH);
  for (let r = 0; r < rows; r += 1) {
    // 1 at the sheet's edge, 0 at the far one.
    const f = (r + 0.5) / rows;
    const k = up ? f : 1 - f;
    const bw = pitch * Math.pow(smooth(k), 1.6);
    if (bw < 0.5) continue;
    const top = Math.round(r * cellH * dpr) / dpr;
    const tall = Math.round((r + 1) * cellH * dpr) / dpr - top;
    for (let x = 0; x < EDGE_BARS; x += 1) ctx.fillRect(x * pitch + (pitch - bw) / 2, top, bw, tall);
  }
}

export default function H22Windows(): JSX.Element {
  const sheet = useRef<HTMLCanvasElement | null>(null);
  const topEdge = useRef<HTMLCanvasElement | null>(null);
  const bottomEdge = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = sheet.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gone = false;
    let frame = 0;
    let laid: Laid[] = [];
    let size = 0;
    let family = "Georgia, serif";

    const layout = (): void => {
      const w = canvas.clientWidth;
      size = SIZE * window.innerHeight;
      ctx.font = `italic ${size}px ${family}`;
      const space = ctx.measureText(" ").width;
      laid = [];
      ROWS.forEach((row, r) => {
        const widths = row.map((i) => {
          const font = `${WORDS[i].em ? "italic " : ""}${size}px ${family}`;
          ctx.font = font;
          return { i, w: ctx.measureText(WORDS[i].t).width, font };
        });
        const total = widths.reduce((s, m) => s + m.w, 0) + space * (row.length - 1);
        let x = (w - total) / 2;
        widths.forEach((m) => {
          laid.push({ i: m.i, x, w: m.w, row: r, font: m.font });
          x += m.w + space;
        });
      });
    };

    const draw = (): void => {
      frame = 0;
      if (gone) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        layout();
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = GROUND;
      ctx.fillRect(0, 0, w, h);
      if (!laid.length) return;
      const vh = window.innerHeight;
      const top = canvas.getBoundingClientRect().top;
      const lineH = size * LEAD;
      const blockTop = (h - ROWS.length * lineH) / 2;
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      ctx.textBaseline = "alphabetic";
      let col = 0;
      let lastRow = -1;
      for (const word of laid) {
        col = word.row === lastRow ? col + 1 : 0;
        lastRow = word.row;
        const lineTop = blockTop + word.row * lineH;
        // Where the word's middle is on the screen, in screen heights.
        const at = (top + lineTop + lineH * 0.5) / vh;
        const e = reduced ? 1 : smooth((OPEN[0] - col * STAGGER - at) / (OPEN[0] - OPEN[1]));
        // Shut, a window is still a ghost of itself, as his words are.
        ctx.globalAlpha = 0.08 + 0.92 * e;
        ctx.filter = e >= 1 ? "none" : `blur(${((1 - e) * 0.1 * size).toFixed(1)}px)`;
        ctx.font = word.font;
        ctx.fillText(WORDS[word.i].t, word.x, lineTop + size * 0.76 + (1 - e) * size * 0.18);
      }
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
    const ask = (): void => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const edges = (): void => {
      if (topEdge.current) drawEdge(topEdge.current, false);
      if (bottomEdge.current) drawEdge(bottomEdge.current, true);
    };

    // The display serif, once it is in: before that the canvas would set
    // the words in the fallback and keep them.
    const fam = getComputedStyle(document.body).getPropertyValue("--font-instrument-serif").trim();
    const want = fam || family;
    Promise.all([document.fonts.load(`italic 100px ${want}`), document.fonts.load(`100px ${want}`)])
      .then(() => {
        family = want;
      })
      .catch(() => undefined)
      .finally(() => {
        if (gone) return;
        layout();
        draw();
      });
    edges();
    draw();
    const onResize = (): void => {
      layout();
      edges();
      ask();
    };
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      gone = true;
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const sentence = WORDS.map((w) => w.t).join(" ");
  return (
    <section aria-label="Approach" className="relative z-30" id="each">
      <canvas aria-hidden="true" className="block w-full" ref={topEdge} style={{ height: `${EDGE * 100}vh` }} />
      <div style={{ backgroundColor: GROUND, height: `${MARGIN * 100}vh` }} />
      <canvas aria-label={sentence} className="block w-full" ref={sheet} role="img" style={{ height: `${(ROWS.length * SIZE * LEAD + 0.08) * 100}vh` }} />
      <div style={{ backgroundColor: GROUND, height: `${MARGIN * 100}vh` }} />
      <canvas aria-hidden="true" className="block w-full" ref={bottomEdge} style={{ height: `${EDGE * 100}vh` }} />
    </section>
  );
}
