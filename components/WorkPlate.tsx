"use client";

import { useEffect, useRef } from "react";
import {
  createDotPainter,
  dotRamp,
  fitCanvas,
  FRAME_MS,
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
/**
 * Cell size, CSS px. 300x150 at 5 is 1,860 cells, each an arc on the path.
 * The backing store follows the device ratio up to fitCanvas's cap of 2,
 * and stays there deliberately: the cost that shows in a profile is the
 * 1,860 arcs and their sines, which is the same at any ratio, while the
 * fill they produce is 180k device pixels at 2x — nothing. What 2x buys is
 * the edge of a 2.5px dot, which at 1x is four pixels and a stair.
 */
const CELL = 5;
/** Seconds for the dots to settle out of noise into the image. */
const RESOLVE = 0.42;
/*
 * The dots repaint on FRAME_MS (halftone.ts) once the plate has resolved.
 * The only motion left then is the sheen, a diagonal that crosses the plate
 * in about four seconds; at 30fps it moves under a cell a frame. The
 * plate's position still updates every frame — it trails the cursor, and
 * that has to be smooth — but the 1,860-arc repaint underneath it runs at
 * half rate. Full rate during the resolve, which is 0.42 s and has to read
 * as one motion.
 */
/** How far the caption rises as it resolves, CSS px. */
const CAPTION_RISE = 3;

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

/**
 * The corner ticks, as eight hairlines: one along each edge from each
 * corner, so a tick can draw in from its corner (scaleX / scaleY from 0)
 * rather than fade. The border version could only fade.
 *
 * All in CSS, keyed off `data-open` on the root: the 380 ms draw-in is the
 * site's curve, and the corners lag 55 ms each clockwise from top-left on
 * the way in (the delay classes) and pull back together on the way out.
 * Reduced motion drops the transition; the plate's own fade still covers
 * the snap. Written out in full so Tailwind sees every class — which is
 * also why the curve is the literal and not petalGlyphs' SITE_EASE_CSS:
 * the scanner reads source text, and an interpolated class name is not
 * emitted. Same numbers; if one is retuned, retune the other.
 */
const TICK_CLASS =
  "absolute bg-white/45 transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";
const TICK_X = "h-px w-3 scale-x-0 group-data-[open]:scale-x-100";
const TICK_Y = "h-3 w-px scale-y-0 group-data-[open]:scale-y-100";
const TICKS: { axis: "x" | "y"; className: string }[] = [
  { axis: "x", className: "left-[-1px] top-[-1px] origin-left" },
  { axis: "y", className: "left-[-1px] top-[-1px] origin-top" },
  {
    axis: "x",
    className: "right-[-1px] top-[-1px] origin-right group-data-[open]:delay-[55ms]",
  },
  {
    axis: "y",
    className: "right-[-1px] top-[-1px] origin-top group-data-[open]:delay-[55ms]",
  },
  {
    axis: "x",
    className:
      "bottom-[-1px] right-[-1px] origin-right group-data-[open]:delay-[110ms]",
  },
  {
    axis: "y",
    className:
      "bottom-[-1px] right-[-1px] origin-bottom group-data-[open]:delay-[110ms]",
  },
  {
    axis: "x",
    className:
      "bottom-[-1px] left-[-1px] origin-left group-data-[open]:delay-[165ms]",
  },
  {
    axis: "y",
    className:
      "bottom-[-1px] left-[-1px] origin-bottom group-data-[open]:delay-[165ms]",
  },
];

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
    const caption = captionRef.current;
    if (!root || !canvas || !caption) return undefined;
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
    // The sheen is a function of col + row only, so it is one sine per
    // diagonal per paint (about 90) rather than one per cell (1,860).
    const sheen = new Float32Array(grid.cols + grid.rows);

    let values: Float32Array | null = null;
    let shownKey: string | null = null;
    let paintedKey: string | null = null;
    let seed = 0;
    let resolvedAt = 0;
    let opacity = 0;
    let open = false;
    let frame = 0;
    let last = 0;
    let lastPaint = 0;
    /** The resolve value the caption was last styled with; -1 is never. */
    let captionShown = -1;

    // The card's height, for keeping the plate on screen. Read off layout
    // when the caption changes and on resize, not per frame: offsetHeight
    // forces layout, and between those two events nothing can move it. Not
    // at mount: the caption is empty then, and an empty <p> has no line, so
    // the mount-time number is one line (~15px) short and the plate sits
    // that much too low.
    const card = root.firstElementChild as HTMLElement | null;
    let cardHeight = HEIGHT;
    const measureCard = () => {
      cardHeight = card?.offsetHeight || HEIGHT;
    };

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
        caption.textContent = next.tag;
        captionShown = -1;
        // One forced layout per hover, with the caption's line now in it.
        measureCard();
      } else if (!next) {
        shownKey = null;
      }
      // Opening and closing are the two moments the corner ticks move
      // (see TICKS): one attribute, and CSS does the rest.
      if (!!next !== open) {
        open = !!next;
        root.toggleAttribute("data-open", open);
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

        // The caption resolves on the same curve as the dots: it used to
        // swap in the instant the row changed, a hard cut over a dissolve.
        // Written only while the value is moving.
        if (eased !== captionShown) {
          captionShown = eased;
          caption.style.opacity = eased.toFixed(3);
          caption.style.transform = `translateY(${((1 - eased) * CAPTION_RISE).toFixed(2)}px)`;
        }

        // Every frame while resolving; the budget rate for the sheen; and
        // under reduced motion (no sheen, no resolve) only when the image
        // itself has changed — the picture is otherwise identical.
        const due =
          paintedKey !== shownKey ||
          eased < 1 ||
          (!reducedMotion && time - lastPaint >= FRAME_MS);
        if (due) {
          paintedKey = shownKey;
          lastPaint = time;
          const grainLeft = 1 - eased;
          if (!reducedMotion) {
            // A slow diagonal sheen, so a held plate is never quite still.
            const phase = (time / 1000) * 1.6;
            for (let d = 0; d < sheen.length; d += 1) {
              sheen[d] = 0.09 * Math.max(0, Math.sin(d * 0.1 - phase));
            }
          }

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
              if (!reducedMotion) lit += sheen[col + row];
              return lit > 1 ? 1 : lit;
            },
            colours,
            { round: true },
          );
        }
      }

      // Park when there is nothing left to show. The plate is a fixed
      // element, so it is never "off screen" and an IntersectionObserver on
      // it would say visible at the top of the page with the work list
      // thousands of pixels below. What actually decides whether this loop
      // has work is the hover: no entry and the fade already finished means
      // no more frames until a row is pointed at again. A closed plate
      // costs no frames at all — measured, 0 rAF/s with the pointer off the
      // list.
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
    window.addEventListener("resize", measureCard);

    // Nothing is hovered at mount, so there is nothing to draw yet.
    if (content) run();

    return () => {
      stop();
      wakeRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", measureCard);
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
      className="group pointer-events-none fixed left-0 top-0 z-30"
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
          {/* Opacity 0 until the loop has a resolve value for it; the loop
              owns both the text and its fade from then on. */}
          <p
            className="truncate text-[0.62rem] uppercase tracking-[0.24em] text-[#f0f0f0]/70"
            ref={captionRef}
            style={{ opacity: 0 }}
          />
        </div>
        {/* A tick in each corner, the way a monitor's frame marks one. Each
            is two hairlines that draw out from the corner when the plate
            opens (see TICKS). */}
        {TICKS.map((tick) => (
          <span
            className={`${TICK_CLASS} ${tick.axis === "x" ? TICK_X : TICK_Y} ${tick.className}`}
            key={tick.className}
          />
        ))}
      </div>
    </div>
  );
}
