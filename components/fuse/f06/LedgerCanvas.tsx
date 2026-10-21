"use client";

import { type JSX, useEffect, useRef } from "react";

import { STREAMS } from "./data";
import { drawLedger } from "./draw";

/**
 * The ledger on a 2D canvas that fills its parent. It grows in left to
 * right the first time it comes into view (at once under reduced motion),
 * and eases each stream toward lit or faded when `highlight` changes. It
 * only runs frames while something is moving.
 */

type Props = {
  /** Stream ids to light; empty lights everything. */
  highlight?: string[];
  hover?: number;
  faint?: boolean;
  className?: string;
};

const GROW_MS = 2200;

export default function LedgerCanvas({ highlight = [], hover = -1, faint = false, className }: Props): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({
    grow: 0,
    growFrom: -1,
    weight: new Float32Array(STREAMS.length).fill(1),
    target: new Float32Array(STREAMS.length).fill(1),
    hover: -1,
    kick: () => {},
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const st = live.current;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) st.grow = 1;
    let raf = 0;
    let last = 0;

    const frame = (now: number): void => {
      raf = 0;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      let moving = false;
      if (st.growFrom >= 0 && st.grow < 1) {
        st.grow = Math.min(1, (now - st.growFrom) / GROW_MS);
        moving = st.grow < 1;
      }
      const k = still ? 1 : 1 - Math.exp(-dt / 110);
      for (let i = 0; i < st.weight.length; i += 1) {
        const d = st.target[i] - st.weight[i];
        if (Math.abs(d) > 0.002) {
          st.weight[i] += d * k;
          moving = true;
        } else st.weight[i] = st.target[i];
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLedger(ctx, w, h, { grow: st.grow, weight: st.weight, hover: st.hover, ground: !faint, alpha: faint ? 0.26 : 1 });
      if (moving) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    st.kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && st.growFrom < 0) {
          st.growFrom = performance.now();
          st.kick();
          seen.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    if (!still) seen.observe(canvas);
    const sized = new ResizeObserver(() => st.kick());
    sized.observe(canvas);
    st.kick();
    return () => {
      cancelAnimationFrame(raf);
      seen.disconnect();
      sized.disconnect();
      st.kick = () => {};
    };
  }, [faint]);

  const key = highlight.join(",");
  useEffect(() => {
    const st = live.current;
    const lit = key ? new Set(key.split(",")) : null;
    STREAMS.forEach((s, i) => {
      st.target[i] = !lit || lit.has(s.id) ? 1 : 0;
    });
    st.kick();
  }, [key]);

  useEffect(() => {
    live.current.hover = hover;
    live.current.kick();
  }, [hover]);

  return <canvas aria-hidden className={className} ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />;
}
