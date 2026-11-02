"use client";

import { type JSX, useEffect, useRef, useState } from "react";

import BarPicture from "@/components/below/barPicture";
import { useInk } from "@/components/luke/each/bar";
import { applyReveal, clamp01, Stage, useProgress, Words } from "@/components/luke/each/stage";

/**
 * 14. Moon. A moon, lit from the upper left, rises from below the bottom
 * edge behind the sentence with the scroll, drawn in bars (barPicture, no
 * WebGL): wide bars on its lit side thinning round to nothing at the dark
 * limb, so it reads as a sphere. The words come in as it clears the
 * sentence; it goes on up and out the top as the section leaves.
 */

const RISE: [number, number] = [0.0, 1.2];
const WORDS_AT: [number, number] = [0.1, 0.5];
/** The moon's width as a share of the screen's height. */
const SIZE = 0.72;

/** The shaded disc, white on black, for the bars. */
function moonCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const r = size * 0.47;
  const g = ctx.createRadialGradient(size * 0.36, size * 0.34, r * 0.05, size * 0.5, size * 0.5, r);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.55, "#bdbdbd");
  g.addColorStop(0.85, "#4a4a4a");
  g.addColorStop(1, "#000");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.fill();
  // A few maria: softer patches, so the face is not one smooth ball.
  ctx.globalCompositeOperation = "multiply";
  for (const [x, y, rr, a] of [
    [0.42, 0.4, 0.14, 0.78],
    [0.6, 0.52, 0.1, 0.82],
    [0.5, 0.64, 0.09, 0.85],
    [0.36, 0.58, 0.07, 0.8],
  ] as const) {
    const m = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, rr * size);
    m.addColorStop(0, `rgba(0,0,0,${1 - a})`);
    m.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalCompositeOperation = "source-over";
  return c;
}

export default function G14Moon(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const moon = useRef<HTMLDivElement | null>(null);
  // Made once mounted: made during render it differed between the server
  // and the client, and the page tree was thrown away and rebuilt.
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => setSource(moonCanvas(720)), []);
  const inkCss = useInk();

  useProgress(sectionRef, (p, reduced) => {
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
    if (moon.current) {
      // From its top at the bottom edge to its bottom past the top edge,
      // at one pace: the sky going by.
      const t = reduced ? 0.45 : clamp01((p - RISE[0]) / (RISE[1] - RISE[0]));
      moon.current.style.transform = `translate3d(-50%, ${((1 - t) * 100 - t * SIZE * 100).toFixed(2)}vh, 0)`;
    }
  });

  return (
    <Stage heightVh={300} sectionRef={sectionRef}>
      {/* A soft clearing round the sentence, so it reads as the moon
          passes behind it. */}
      <div aria-hidden="true" className="absolute inset-0 [mask-image:radial-gradient(ellipse_30vw_13vh_at_50%_50%,transparent_50%,black_100%)]">
        <div
          className="absolute left-[58%] top-0 will-change-transform"
          ref={moon}
          style={{ width: `${SIZE * 100}vh`, height: `${SIZE * 100}vh`, transform: "translate3d(-50%, 100vh, 0)" }}
        >
          {source ? <BarPicture alt="" cell={5} className="h-full w-full" fit="contain" ink={inkCss} invert={false} source={source} /> : null}
        </div>
      </div>
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
