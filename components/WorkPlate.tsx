"use client";

import { useEffect, useRef } from "react";
import {
  createDotPainter,
  dotRamp,
  fitCanvas,
  sampleLuminance,
  type DotGrid,
} from "@/components/halftone";

/**
 * The plate that follows the cursor over the work list.
 *
 * A portfolio row usually reveals a photograph on hover. There are no
 * photographs here, and inventing an abstract pattern per entry would be
 * decoration with nothing behind it. So the plate shows the entry's own
 * data — its year, large, and what kind of thing it was — but PUT THROUGH
 * the page's own renderer: the type is rasterised, averaged into cells and
 * redrawn as a grid of dots, which is exactly what the hero does to the
 * tree. Same machine, different subject.
 *
 * One canvas for the whole list, not one per row: the plate is a single
 * element that moves and swaps its contents. Each entry's luminance grid is
 * rasterised once and cached, so hovering costs a map lookup; the resolve
 * and the sheen are modulations of those cached numbers.
 */

const WIDTH = 300;
const HEIGHT = 150;
const CELL = 5;
/** Seconds for the dots to settle out of noise into the image. */
const RESOLVE = 0.42;

export type PlateContent = {
  key: string;
  lead: string;
  tag: string;
};

/** Rasterised luminance per entry. Built on demand, kept for the session. */
const plateCache = new Map<string, Float32Array>();

function contentGrid(grid: DotGrid, content: PlateContent) {
  const cached = plateCache.get(content.key);
  if (cached) return cached;
  // Only the numeral is dithered. Small type does not survive a 5px cell —
  // the tag rasterised to about three cells a letter and came out as
  // texture — so the caption is left as real type under the canvas.
  const values = sampleLuminance(grid, (ctx, width, height) => {
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `300 ${Math.round(height * 0.62)}px Inter, system-ui, sans-serif`;
    ctx.fillText(content.lead, width / 2, height * 0.54);
  });
  plateCache.set(content.key, values);
  return values;
}

/** Stable per entry, so the noise differs between plates but not between frames. */
function seedOf(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 9973;
  }
  return hash;
}

export default function WorkPlate({ content }: { content: PlateContent | null }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captionRef = useRef<HTMLParagraphElement | null>(null);
  // Read by the render loop. Routing the pointer through React state would
  // re-render the whole work list on every mouse move.
  const contentRef = useRef<PlateContent | null>(null);
  contentRef.current = content;
  // Set by the effect below, called when a row starts being hovered. The
  // loop parks itself when there is nothing to draw, so something has to
  // wake it, and it cannot be React state — see contentRef.
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    // No cursor, no plate. Pinning it to the last tap would be worse than
    // not having it.
    if (!window.matchMedia("(hover: hover)").matches) return undefined;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${HEIGHT}px`;
    const grid = fitCanvas(canvas, WIDTH, HEIGHT, CELL);
    const painter = createDotPainter();
    const colours = dotRamp({ minAlpha: 0.06, maxAlpha: 1 });

    let values: Float32Array | null = null;
    let shownKey: string | null = null;
    let seed = 0;
    let resolvedAt = 0;
    let opacity = 0;
    let frame = 0;
    let last = 0;

    // The plate trails the cursor rather than being nailed to it, so it
    // reads as something being carried.
    const pos = { seeded: false, tx: 0, ty: 0, x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pos.tx = event.clientX;
      pos.ty = event.clientY;
      if (!pos.seeded) {
        pos.seeded = true;
        pos.x = pos.tx;
        pos.y = pos.ty;
      }
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const draw = (time: number) => {
      const dt = last ? Math.min((time - last) / 1000, 0.05) : 0.016;
      last = time;

      const next = contentRef.current;
      if (next && next.key !== shownKey) {
        shownKey = next.key;
        seed = seedOf(next.key);
        values = contentGrid(grid, next);
        resolvedAt = time;
        if (captionRef.current) captionRef.current.textContent = next.tag;
      } else if (!next) {
        shownKey = null;
      }

      opacity += ((next ? 1 : 0) - opacity) * Math.min(1, dt * 12);
      pos.x += (pos.tx - pos.x) * Math.min(1, dt * 9);
      pos.y += (pos.ty - pos.y) * Math.min(1, dt * 9);

      if (opacity > 0.004) {
        // Up and to the right of the cursor, and never off an edge, so the
        // row being read is not the row under the plate.
        const left = Math.min(
          Math.max(pos.x + 28, 12),
          Math.max(12, window.innerWidth - WIDTH - 12),
        );
        // Against the CARD's height, not the canvas's: the caption bar
        // adds about 36px under it.
        const card = root.firstElementChild as HTMLElement | null;
        const cardHeight = card?.offsetHeight || HEIGHT;
        const top = Math.min(
          Math.max(pos.y - cardHeight - 18, 12),
          Math.max(12, window.innerHeight - cardHeight - 12),
        );
        const lean = (pos.tx - pos.x) * 0.035;
        root.style.transform =
          `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0) ` +
          `rotate(${lean.toFixed(2)}deg) scale(${(0.94 + opacity * 0.06).toFixed(3)})`;
        root.style.opacity = opacity.toFixed(3);
      } else if (root.style.opacity !== "0") {
        root.style.opacity = "0";
      }

      if (opacity > 0.004 && values) {
        const source = values;
        // 0 the instant the plate changes, 1 once it has settled.
        const settle = reducedMotion
          ? 1
          : Math.min(1, (time - resolvedAt) / (RESOLVE * 1000));
        const eased = settle * settle * (3 - 2 * settle);
        const grainLeft = 1 - eased;
        const t = time / 1000;

        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        painter.paint(
          ctx,
          grid,
          (col, row, index) => {
            // The image is there from the first frame; what drains away is
            // the noise buried over it.
            let lit = (source[index] ?? 0) * (0.35 + 0.65 * eased);
            if (grainLeft > 0.001) {
              const raw =
                (Math.sin(col * 12.9898 + row * 78.233 + seed) * 43758.5453) % 1;
              lit += (raw < 0 ? raw + 1 : raw) * grainLeft * 0.5;
            }
            if (!reducedMotion) {
              // A slow diagonal sheen, so a held plate is never quite still.
              lit += 0.09 * Math.max(0, Math.sin((col + row) * 0.1 - t * 1.6));
            }
            return lit > 1 ? 1 : lit;
          },
          colours,
          { round: true },
        );
      }

      // Park when there is nothing left to show. The plate is a fixed
      // element, so it is never "off screen" and an IntersectionObserver on
      // it would say visible at the top of the page with the work list
      // thousands of pixels below. What actually decides whether this loop
      // has work is the hover: no entry and the fade already finished means
      // no more frames until a row is pointed at again.
      const idle = !contentRef.current && opacity <= 0.004;
      frame = idle || document.hidden ? 0 : requestAnimationFrame(draw);
    };

    const run = () => {
      if (frame || document.hidden) return;
      // A parked loop stops lerping the plate toward the cursor, so its
      // position is wherever the pointer was when the last row was left.
      // Snap before the first frame or the plate flies in across the page
      // instead of fading up under the cursor.
      last = 0;
      pos.x = pos.tx;
      pos.y = pos.ty;
      frame = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };
    wakeRef.current = run;

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (contentRef.current || opacity > 0.004) run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Nothing is hovered at mount, so there is nothing to draw yet.
    if (content) run();

    return () => {
      stop();
      wakeRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
    };
    // `content` is read through contentRef; the mount-time run() above only
    // needs whatever it was on the one pass this effect makes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hovering a row is the one thing that has to restart a parked loop.
  useEffect(() => {
    if (content) wakeRef.current?.();
  }, [content]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-30"
      ref={rootRef}
      style={{ opacity: 0, willChange: "transform, opacity" }}
    >
      {/* Opaque, deliberately. The plate sits over the work list, and a
          translucent one let the row behind it read straight through the
          dots — which made both unreadable rather than either. */}
      <div
        className="relative border border-white/15"
        style={{ background: "#0a0a0a" }}
      >
        <div className="relative">
          <canvas ref={canvasRef} />
          {/* The television, still in the room. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(to bottom, rgba(0,0,0,0.30) 0px, rgba(0,0,0,0.30) 1px, transparent 1px, transparent 3px)",
            }}
          />
        </div>
        <div className="border-t border-white/12 px-3 py-2.5">
          <p
            className="truncate text-[0.62rem] uppercase tracking-[0.24em] text-[#f0f0f0]/70"
            ref={captionRef}
          />
        </div>
        {/* A tick in each corner, the way a monitor's frame marks one. */}
        <span className="absolute left-[-1px] top-[-1px] h-3 w-3 border-l border-t border-white/45" />
        <span className="absolute right-[-1px] top-[-1px] h-3 w-3 border-r border-t border-white/45" />
        <span className="absolute bottom-[-1px] left-[-1px] h-3 w-3 border-b border-l border-white/45" />
        <span className="absolute bottom-[-1px] right-[-1px] h-3 w-3 border-b border-r border-white/45" />
      </div>
    </div>
  );
}
