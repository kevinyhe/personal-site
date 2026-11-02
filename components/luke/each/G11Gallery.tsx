"use client";

import { type JSX, useRef } from "react";

import BarPicture, { projectSource } from "@/components/below/barPicture";
import { useInk } from "@/components/luke/each/bar";
import {
  applyReveal,
  clamp01,
  over,
  Stage,
  useProgress,
  Words,
} from "@/components/luke/each/stage";
import { projects } from "@/components/profile";

/**
 * 11. Gallery. lukebaffait.fr's gallery itself: the sentence in the middle
 * of the held screen, its words coming in one by one, and the project
 * pictures flying round it. Each picture is drawn in bars (barPicture, no
 * WebGL), comes in from its own edge along its own arc as the words come,
 * hangs round the sentence a while and goes on out the far side.
 */

/** For each picture: where it comes in from and goes out to, in screen
 *  widths and heights from the middle, its resting place, its width in
 *  screen widths, and when it sets off. */
const FLIGHTS: {
  from: [number, number];
  rest: [number, number];
  to: [number, number];
  w: number;
  at: number;
}[] = [
  {
    from: [-0.62, 0.3],
    rest: [-0.32, -0.22],
    to: [0.1, -0.72],
    w: 0.2,
    at: 0.0,
  },
  {
    from: [0.64, -0.3],
    rest: [0.33, -0.17],
    to: [-0.05, 0.72],
    w: 0.17,
    at: 0.06,
  },
  {
    from: [-0.62, -0.42],
    rest: [-0.3, 0.25],
    to: [0.62, 0.36],
    w: 0.16,
    at: 0.12,
  },
  {
    from: [0.64, 0.42],
    rest: [0.3, 0.24],
    to: [-0.62, -0.2],
    w: 0.19,
    at: 0.18,
  },
];
/** How long a picture's flight takes, in progress: in over the first
 *  half, resting through the middle, out over the last. */
const FLIGHT = 1.1;
const WORDS_AT: [number, number] = [0.08, 0.5];

export default function G11Gallery(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const plates = useRef<(HTMLDivElement | null)[]>([]);
  const pics = projects.filter((p) => p.image).slice(0, FLIGHTS.length);
  const inkCss = useInk();

  useProgress(sectionRef, (p, reduced) => {
    applyReveal(
      words.current,
      reduced ? 1 : clamp01((p - WORDS_AT[0]) / (WORDS_AT[1] - WORDS_AT[0])),
    );
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    plates.current.forEach((el, i) => {
      if (!el) return;
      const f = FLIGHTS[i];
      // In over the first half of its run, resting through the middle,
      // out over the last; a quadratic through the resting place so the
      // path bends.
      const t = reduced ? 0.5 : clamp01((p - f.at) / FLIGHT);
      const u = 1 - t;
      const x = u * u * f.from[0] + 2 * u * t * f.rest[0] + t * t * f.to[0];
      const y = u * u * f.from[1] + 2 * u * t * f.rest[1] + t * t * f.to[1];
      el.style.transform = `translate3d(${(x * vw).toFixed(1)}px, ${(y * vh).toFixed(1)}px, 0) rotate(${((t - 0.5) * -8).toFixed(2)}deg)`;
      el.style.opacity = (over(t, 0, 0.12) * over(1 - t, 0, 0.12)).toFixed(3);
    });
  });

  return (
    <Stage heightVh={320} sectionRef={sectionRef}>
      {/* The pictures fade out in a soft oval round the sentence, so none
          of them sits on the words as it passes. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 [mask-image:radial-gradient(ellipse_52vw_22vh_at_50%_50%,transparent_48%,black_100%)]"
      >
        {pics.map((pr, i) => (
          <div
            className="absolute left-1/2 top-1/2 will-change-transform"
            key={pr.title}
            ref={(el) => {
              plates.current[i] = el;
            }}
            style={{
              width: `${FLIGHTS[i].w * 100}vw`,
              marginLeft: `${-FLIGHTS[i].w * 50}vw`,
              aspectRatio: "4 / 3",
              marginTop: `${-FLIGHTS[i].w * 37.5}vw`,
            }}
          >
            {/* Each picture as a solid plate: whichever tone it has most of
              draws the bars and the other is the gaps, so a pale screenshot
              and a dark scene both read as a plate, not as scattered
              marks. */}
            <BarPicture
              alt=""
              black={0.22}
              cell={4}
              className="h-full w-full"
              fit="cover"
              ink={inkCss}
              invert="plate"
              source={projectSource(pr)}
              white={0.9}
            />
          </div>
        ))}
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
