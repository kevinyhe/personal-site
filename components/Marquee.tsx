"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * A line of type running sideways across the page, forever.
 *
 * The reference portfolio puts one of these between its sections: a phrase
 * set at heading size, repeated, sliding at a constant speed with a hairline
 * over and under it. It does two things at once — it is the only horizontal
 * movement on a page that otherwise only goes down, and it is a rule with
 * words in it, so a section break says something instead of just spacing.
 *
 * Its own trick is that the scroll STEERS it: rolling down pushes the line
 * along faster, rolling up drags it back and can turn it around. That is
 * what makes it read as part of the page rather than as a banner pasted on
 * top, and it is the one piece of motion here the reader is driving.
 *
 * Two identical rows sit side by side and the pair is translated by half its
 * own width, wrapping at the halfway mark — so the seam is always off screen
 * and there is no jump to hide.
 */

/** Pixels a second at rest. Slow: it is furniture, not a ticker. */
const DRIFT = 34;
/** How hard the scroll pushes, in pixels of travel per pixel scrolled. */
const PUSH = 1.9;
/** How fast the push bleeds off once the scroll stops, per second. */
const DECAY = 3.4;

export default function Marquee({
  words,
  className = "",
}: {
  words: string[];
  className?: string;
}): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    let offset = 0;
    let push = 0;
    // Half the track is one full copy of the row; wrapping there is why the
    // seam never shows.
    let span = track.scrollWidth / 2 || 1;
    const remeasure = () => {
      span = track.scrollWidth / 2 || 1;
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(track);

    const context = gsap.context(() => {
      const trigger = ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => {
          // getVelocity is px/s; a frame of it is what the reader just did.
          push += (self.getVelocity() / 1000) * PUSH;
        },
      });
      const tick = (_t: number, dt: number) => {
        const seconds = dt / 1000;
        offset -= (DRIFT + push) * seconds;
        push -= push * Math.min(1, DECAY * seconds);
        // Wrap into [-span, 0) so the transform never grows without bound.
        offset = ((offset % span) + span) % span - span;
        track.style.transform = `translate3d(${offset.toFixed(2)}px,0,0)`;
      };
      gsap.ticker.add(tick);
      return () => {
        gsap.ticker.remove(tick);
        trigger.kill();
      };
    }, track);

    return () => {
      ro.disconnect();
      context.revert();
      track.style.transform = "";
    };
  }, []);

  const row = (key: string) => (
    <div className="flex shrink-0 items-baseline" key={key}>
      {words.map((word, index) => (
        <span className="flex items-baseline" key={index}>
          <span className="whitespace-nowrap font-serif-display italic">
            {word}
          </span>
          {/* A middle dot, not a slash: the display serif is a Fontspring
              DEMO cut and draws its watermark flower for "/". */}
          <span aria-hidden="true" className="px-[0.5em] opacity-40">
            {"·"}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      aria-hidden="true"
      className={
        "relative overflow-hidden border-y border-white/15 py-[0.35em] " +
        "text-[clamp(2rem,6vw,5rem)] leading-[1.1] text-[#f0f0f0] " +
        className
      }
      data-marquee
    >
      <div className="flex w-max will-change-transform" ref={trackRef}>
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}
