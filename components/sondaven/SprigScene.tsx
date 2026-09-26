"use client";

import { useEffect, useRef, type JSX } from "react";

import { BAND, BLOSSOM } from "@/components/bandColours";
import {
  createBarCanvas,
  hexToRgb,
  type BarCanvas,
  type BarLayer,
  type BarLayerConfig,
} from "@/components/valley/barShader";

/**
 * The prologue's own scene, copied from the reference.
 *
 * Its initSceneProlog (scratchpad/sonda/app.pretty.js) hangs two poppies at
 * the sides of the quote — prolog-l-c.mp4 and prolog-r-c.mp4, each 44% of the
 * width, 96% of the height, one at x -14% and one at x 70%, graded upside
 * down (blackPoint 200 / whitePoint 25, so a BRIGHT flower draws a WIDE bar)
 * on a 125 x 150 grid, playing once rather than looping. That is what this
 * is, asset for asset and number for number; the files are in public/sonda.
 *
 * Desktop only, and lazily built, both of which the reference also does: it
 * returns early under its breakpoint, and at phone width there is no room
 * beside the column for a stem to stand in.
 */

/** The bars and the ground — the only thing changed from the reference:
 *  the site's shared pair (bandColours), the blossom on the band. */
const BAR_FILL = BLOSSOM;
const BAR_BG = BAND;

/** The reference's own breakpoint. */
const NARROW = 992;

const ASSETS = "/sonda";

export default function SprigScene(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (window.innerWidth < NARROW) return undefined;

    let bar: BarCanvas | null = null;
    let disposed = false;

    const build = () => {
      if (disposed || bar) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const base: BarLayerConfig = {
        x: "0%",
        y: "3%",
        width: "44%",
        height: "96%",
        blackPoint: 200,
        whitePoint: 25,
        threshold: 255,
        xSquares: 125,
        ySquares: 150,
        bgOpacity: 1,
        fillOpacity: 1,
      };
      const stem = (file: string, x: string): BarLayer => ({
        type: "video",
        sources: [{ src: `${ASSETS}/${file}`, type: "video/mp4" }],
        // The reference plays these once: the flower opens and stays open.
        loop: false,
        config: { ...base, x },
      });

      bar = createBarCanvas(
        canvas,
        [stem("prolog-l-c.mp4", "-14%"), stem("prolog-r-c.mp4", "70%")],
        {
          colors: () => ({ bg: hexToRgb(BAR_BG), fill: hexToRgb(BAR_FILL) }),
          // The page's own background field runs behind this; a painted
          // ground would be flat patches over it.
          defaults: { bgOpacity: 0 },
          fps: reduced ? 2 : 60,
        },
      );
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
    };
  }, []);

  return (
    <canvas
      aria-hidden="true"
      className="block h-full w-full"
      data-prolog-scene
      ref={canvasRef}
    />
  );
}
