"use client";

import { useEffect, useRef, type JSX } from "react";

import {
  createBarCanvas,
  hexToRgb,
  type BarCanvas,
  type BarLayer,
  type BarLayerConfig,
  type CanvasSource,
} from "@/components/valley/barShader";
import { createPetalBank } from "@/components/valley/sources/petalBank";

/**
 * The About section's scene, in the reference's own slot.
 *
 * Every section below its hero carries a bar-drawn canvas behind the type
 * ([data-about-scene], [data-prolog-scene], and so on), full bleed past the
 * container's padding and drifting against the scroll. Its own is a
 * photograph; ours is the petal bank the valley uses, which is the same
 * generator and the same shader.
 *
 * This section is the light band, so the grade is the right way up here —
 * dark ink on the pink page, the way the reference draws on its tan.
 */

const BAR_FILL = "#180a14"; // --v-base-1000 of the light theme
const BAR_BG = "#e8b7d3";

/** Below this the column fills the screen and a full-bleed scene is noise. */
const NARROW = 992;

export default function AboutScene(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (window.innerWidth < NARROW) return undefined;

    let bar: BarCanvas | null = null;
    let sources: CanvasSource[] = [];
    let disposed = false;

    const build = () => {
      if (disposed || bar) return;
      const w = canvas.offsetWidth || window.innerWidth;
      const h = canvas.offsetHeight || window.innerHeight;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const config: BarLayerConfig = {
        x: "0%",
        y: "18%",
        width: "100%",
        height: "82%",
        blackPoint: 15,
        whitePoint: 255,
        xSquares: 220,
        ySquares: 160,
        fillOpacity: 0.42,
      };
      const petals = createPetalBank({
        seed: 59,
        width: Math.max(2, Math.round(Math.min(1400, w))),
        height: Math.max(2, Math.round(Math.min(1400, h * 0.82))),
      });
      const kept: CanvasSource =
        !reduced || !petals.animated
          ? petals
          : {
              canvas: petals.canvas,
              animated: false,
              ready: (petals.ready ?? Promise.resolve()).then(() => {
                petals.update?.(0, 0);
              }),
              dispose: petals.dispose,
            };
      sources.push(kept);
      const layers: BarLayer[] = [{ type: "canvas", source: kept, config }];

      bar = createBarCanvas(canvas, layers, {
        colors: () => ({ bg: hexToRgb(BAR_BG), fill: hexToRgb(BAR_FILL) }),
        // The section paints its own ground; a painted cell ground would be
        // flat patches on top of it.
        defaults: { bgOpacity: 0 },
        fps: reduced ? 2 : 60,
      });
      if (!bar) {
        for (const s of sources) s.dispose?.();
        sources = [];
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          build();
        }
      },
      { rootMargin: "100% 0px 100% 0px" },
    );
    io.observe(canvas);

    return () => {
      disposed = true;
      io.disconnect();
      bar?.destroy();
      for (const s of sources) s.dispose?.();
      sources = [];
    };
  }, []);

  return (
    <canvas aria-hidden="true" className="scene" data-about-scene ref={canvasRef} />
  );
}
