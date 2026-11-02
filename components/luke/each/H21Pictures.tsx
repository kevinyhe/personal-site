"use client";

import { type JSX, useEffect, useRef } from "react";

import BarPicture from "@/components/below/barPicture";
import { useInk } from "@/components/luke/each/bar";
import { applyReveal, clamp01, smooth, Stage, useProgress, Words } from "@/components/luke/each/stage";
import { GROUND, INK } from "@/components/luke/theme";
import { projects } from "@/components/profile";
import { hexToRgb } from "@/components/valley/barShader";

/**
 * 21. Pictures. lukebaffait.fr's gallery done his way: the sentence big in
 * the middle of the held screen, and the project photographs, crisp and
 * a third of the screen wide with rounded corners, going up past it at
 * either side on slow curves. Two depths: the near pair are bigger and
 * go by faster than the far pair behind them. Each comes up from the
 * bottom edge as a plate of bars and resolves into the photograph on
 * the way up: the photograph comes through the bars, and the bars thin
 * away.
 *
 * The photographs are printed in the page's two colours, plum for the
 * darks and pink for the lights (a duotone), so they belong to the page:
 * in their own colours a cream screenshot and a red game screen were
 * four foreign rectangles on the pink.
 */

/** Each picture: where its middle runs across the screen (screen widths
 *  from the middle), its width in screen widths, where it hangs round
 *  the sentence (screen heights from the middle), how long its run takes
 *  (in progress; the near pair's is shorter, so they go by faster), and
 *  its lean. Every run is centred on MID, so all four are round the
 *  sentence together, one in each corner. */
const PLATES: { x: number; w: number; rest: number; run: number; lean: number }[] = [
  // Near, left, high.
  { x: -0.32, w: 0.3, rest: -0.25, run: 0.9, lean: -2.5 },
  // Far, right, high, behind.
  { x: 0.3, w: 0.2, rest: -0.26, run: 1.2, lean: 2 },
  // Near, right, low.
  { x: 0.32, w: 0.3, rest: 0.25, run: 0.9, lean: 2.5 },
  // Far, left, low, behind.
  { x: -0.3, w: 0.2, rest: 0.26, run: 1.2, lean: -2 },
];
/** The progress at which every picture is at its resting place. */
const MID = 0.58;
/** A picture's run: from here to here, in screen heights from the middle. */
const FROM = 1.05;
const TO = -1.05;
/** How much a run slows through its resting place: 0 is one speed
 *  throughout, 1 a stop. */
const LINGER = 0.82;
const WORDS_AT: [number, number] = [0.16, 0.56];
/** When on its run the photograph comes through, and the bars thin away. */
const PHOTO_IN: [number, number] = [0.1, 0.3];
const BARS_OUT: [number, number] = [0.18, 0.4];
/** Draw order: the far pair first, so the near pair pass in front. */
const ORDER = [1, 3, 0, 2];

/** The photograph printed in plum and pink: its brightness, with a
 *  little more contrast, picks the mix. Drawn onto `canvas` at the
 *  picture's own size. */
function printDuotone(canvas: HTMLCanvasElement, src: string): () => void {
  let gone = false;
  const im = new Image();
  im.decoding = "async";
  im.onload = () => {
    if (gone) return;
    const w = Math.min(im.naturalWidth, 1200);
    const h = Math.round((im.naturalHeight * w) / im.naturalWidth);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(im, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const dark = hexToRgb(GROUND).map((c) => c * 255);
    // The lights a shade paler than the ground's pink, so a pale picture
    // (the Actually screenshot) still reads as a card on it.
    const light = hexToRgb(INK).map((c) => (c + (1 - c) * 0.35) * 255);
    for (let k = 0; k < d.length; k += 4) {
      const L = (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255;
      const t = smooth(L * 1.15 - 0.05);
      d[k] = dark[0] + (light[0] - dark[0]) * t;
      d[k + 1] = dark[1] + (light[1] - dark[1]) * t;
      d[k + 2] = dark[2] + (light[2] - dark[2]) * t;
    }
    ctx.putImageData(img, 0, 0);
  };
  im.src = src;
  return () => {
    gone = true;
  };
}

export default function H21Pictures(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const plates = useRef<(HTMLDivElement | null)[]>([]);
  const photos = useRef<(HTMLCanvasElement | null)[]>([]);
  const levels = useRef<((l: number) => void)[]>([]);
  const pics = projects.filter((p) => p.image).slice(0, PLATES.length);
  const inkCss = useInk();

  useEffect(() => {
    const stops = pics.map((pr, i) => {
      const c = photos.current[i];
      return c && pr.image ? printDuotone(c, pr.image) : () => undefined;
    });
    return () => stops.forEach((stop) => stop());
    // The pictures are the profile's: fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useProgress(sectionRef, (p, reduced) => {
    applyReveal(words.current, reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    plates.current.forEach((el, i) => {
      if (!el) return;
      const f = PLATES[i];
      const t = reduced ? 0.5 : clamp01((p - (MID - f.run / 2)) / f.run);
      // Quick in, slow past its resting place, quick out: one speed with
      // a sine taken off it, never a stop.
      const u = t - (LINGER * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
      const y = u < 0.5 ? f.rest + (FROM - f.rest) * (1 - 2 * u) : f.rest + (TO - f.rest) * (2 * u - 1);
      const x = f.x + 0.025 * Math.sin(Math.PI * t) * Math.sign(f.x);
      el.style.transform = `translate3d(${(x * vw).toFixed(1)}px, ${(y * vh).toFixed(1)}px, 0) rotate(${(f.lean * (2 * t - 1)).toFixed(2)}deg)`;
      const photo = photos.current[i];
      if (photo) photo.style.opacity = (reduced ? 1 : smooth((t - PHOTO_IN[0]) / (PHOTO_IN[1] - PHOTO_IN[0]))).toFixed(3);
      levels.current[i]?.(reduced ? 0 : 1 - smooth((t - BARS_OUT[0]) / (BARS_OUT[1] - BARS_OUT[0])));
    });
  });

  return (
    <Stage heightVh={340} sectionRef={sectionRef}>
      {ORDER.map((i) => {
        const pr = pics[i];
        if (!pr) return null;
        return (
          <div
            className="absolute left-1/2 top-1/2 overflow-hidden rounded-[1.6vw] will-change-transform"
            key={pr.title}
            ref={(el) => {
              plates.current[i] = el;
            }}
            style={{
              width: `${PLATES[i].w * 100}vw`,
              marginLeft: `${-PLATES[i].w * 50}vw`,
              aspectRatio: "4 / 3",
              marginTop: `${-PLATES[i].w * 37.5}vw`,
              transform: `translate3d(${PLATES[i].x * 100}vw, ${FROM * 100}vh, 0)`,
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 16%, transparent)",
            }}
          >
            <canvas
              aria-label={pr.title}
              className="absolute inset-0 h-full w-full object-cover"
              ref={(el) => {
                photos.current[i] = el;
              }}
              role="img"
              style={{ opacity: 0 }}
            />
            {/* The plate of bars it arrives as: whichever tone the picture
                has most of draws them, so a pale screenshot and a dark
                scene both come up as a plate. */}
            <BarPicture
              alt=""
              bind={(set) => {
                levels.current[i] = set;
              }}
              black={0.22}
              cell={5}
              className="absolute inset-0 h-full w-full"
              fit="cover"
              ink={inkCss}
              invert="plate"
              source={pr.image ?? ""}
              white={0.9}
            />
          </div>
        );
      })}
      <p className="absolute left-1/2 top-1/2 z-10 w-[88vw] max-w-[44rem] -translate-x-1/2 -translate-y-1/2 text-center font-sans text-[clamp(28px,3.3vw,120px)] leading-[1.14] tracking-[-0.03em] md:w-[40vw] md:max-w-none">
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
