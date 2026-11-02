"use client";

import { type JSX, useEffect, useRef } from "react";

import { ACCENT } from "@/components/luke/theme";

/** The cursor's three bars, CSS px: wider in the middle, like a bar picture's. */
const BAR_WIDTHS = [2, 4, 2];
const BAR_TALL = 20;
const BAR_GAP = 4;
/** Px/s of up-down speed that adds one bar height, and of sideways speed
 *  that spreads the bars 1 px further apart. */
const TALL_SPEED = 1400;
const SPREAD_SPEED = 180;
const MAX_STRETCH = 1.2;
const MAX_SPREAD = 8;
/** The share of each move's own speed in the smoothed speed. */
const SPEED_BLEND = 0.35;
/** How fast the stretch falls back once the cursor stops, s. */
const SETTLE = 0.08;

const INTERACTIVE = "a, button, [role=button], input, select, textarea, label, summary";

const CURSOR_CSS = `
html.i01-cursor, html.i01-cursor * { cursor: none !important; }
html.i01-cursor :is(${INTERACTIVE}), html.i01-cursor :is(${INTERACTIVE}) * { cursor: pointer !important; }
html.i01-cursor :is(input, textarea) { cursor: text !important; }
`;

/** Idea 1's cursor: three short bars in the site's rose that stretch with
 *  the cursor's speed. Rose, not the pink or plum of the pictures, so the
 *  cursor does not sink into the bars it parts.
 *  Over a link or a button the bars fade and the native pointer shows.
 *  Only where there is a mouse. */
export default function BarCursor(): JSX.Element {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const box = boxRef.current;
    const bars = barRefs.current.filter((b): b is HTMLSpanElement => b !== null);
    if (!box || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    root.classList.add("i01-cursor");

    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let lastMoveAt: number | null = null;
    let movedThisFrame = false;
    let rafId: number | null = null;
    let lastFrameAt: number | null = null;

    const stretchBars = (): void => {
      const stretch = reduced ? 0 : Math.min(MAX_STRETCH, Math.abs(vy) / TALL_SPEED);
      const spread = reduced ? 0 : Math.min(MAX_SPREAD, Math.abs(vx) / SPREAD_SPEED);
      bars.forEach((bar, i) => {
        bar.style.transform = `translateX(${((i - 1) * spread).toFixed(2)}px) scaleY(${(1 + stretch).toFixed(3)})`;
      });
    };

    const frame = (now: number): void => {
      rafId = null;
      const dt = lastFrameAt === null ? 1 / 60 : Math.min(0.1, (now - lastFrameAt) / 1000);
      lastFrameAt = now;
      if (!movedThisFrame) {
        const fall = Math.exp(-dt / SETTLE);
        vx *= fall;
        vy *= fall;
        if (Math.hypot(vx, vy) < 4) {
          vx = 0;
          vy = 0;
        }
      }
      movedThisFrame = false;
      stretchBars();
      if (vx !== 0 || vy !== 0) rafId = requestAnimationFrame(frame);
      else lastFrameAt = null;
    };

    const wake = (): void => {
      if (rafId === null) rafId = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent): void => {
      if (e.pointerType === "touch") return;
      if (lastMoveAt !== null) {
        const dt = Math.max(1, e.timeStamp - lastMoveAt) / 1000;
        vx += ((e.clientX - x) / dt - vx) * SPEED_BLEND;
        vy += ((e.clientY - y) / dt - vy) * SPEED_BLEND;
      }
      lastMoveAt = e.timeStamp;
      x = e.clientX;
      y = e.clientY;
      box.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      movedThisFrame = true;
      const overControl = e.target instanceof Element && e.target.closest(INTERACTIVE) !== null;
      box.style.opacity = overControl ? "0" : "1";
      wake();
    };

    const onLeave = (): void => {
      box.style.opacity = "0";
      lastMoveAt = null;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      root.classList.remove("i01-cursor");
    };
  }, []);

  const across = BAR_WIDTHS.reduce((a, b) => a + b, 0) + BAR_GAP * (BAR_WIDTHS.length - 1);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CURSOR_CSS }} />
      <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[2147483646] transition-opacity duration-150" ref={boxRef} style={{ opacity: 0 }}>
        <div className="absolute flex items-center" style={{ left: -across / 2, top: -BAR_TALL / 2, gap: BAR_GAP, height: BAR_TALL }}>
          {BAR_WIDTHS.map((w, i) => (
            <span
              className="block"
              key={i}
              ref={(el) => {
                barRefs.current[i] = el;
              }}
              style={{ width: w, height: BAR_TALL, backgroundColor: ACCENT }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
