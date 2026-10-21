"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { GROUND, INK, Serif } from "@/components/luke/theme";
import { startFlower, type Flower } from "@/components/tx/t5/flower";
import Work from "@/components/tx/t5/Work";

gsap.registerPlugin(ScrollTrigger);

/**
 * Transition 5: the statement turns over like a venetian blind.
 *
 * The held screen is cut into tall upright slats. A wave runs across them
 * left to right: each slat turns half a revolution on its own upright axis,
 * a little after its left neighbour, and the face it turns to carries
 * Work's ground with a slice of the "Work" header on it. When the last
 * slat lands, the slices line up into the whole word, exactly where the
 * work section's own (invisible) header sits, and the page carries on: the
 * project list rises under the header and the stage scrolls away with it.
 *
 * The slats' faces are transparent apart from their type, so the flower
 * (one canvas behind them) is clipped to the visible width of each slat's
 * front, cos of its angle, and goes when the front goes edge-on.
 *
 * Over the track (ScrollTrigger progress p):
 *   before       the sentence writes in, a letter at a time, as it arrives;
 *   0.00 - 0.10  the introduction comes in under it;
 *   0.18 - 0.62  the wave: slat i turns over 0.22 of p, starts staggered;
 *   0.50 - 1.00  the work list rises under the header (from 0.81 a name
 *                is on screen, after the last slat has landed).
 *
 * Reduced motion: the slats do not turn; the statement fades out and the
 * header fades in over the same span.
 */

const LINE = "I build systems that bring ideas to life.";
const LINE_ROWS = ["I build systems", "that bring ideas", "to life."];
const INTRO =
  "font-sans text-[1.75rem] font-light leading-[1.6] tracking-[0.01em] lg:text-[min(2.2vh,0.93vw)]";
const NARROW = 1024;

const WAVE_FROM = 0.18;
const WAVE_SPREAD = 0.22;
const TURN = 0.22;

function Statement(): JSX.Element {
  return (
    <div className="flex h-[100vh] w-full items-center">
      <div className="mx-[6vw] lg:ml-[50vw] lg:mr-0" style={{ color: INK }}>
        <p className="pb-[0.1em] font-serif-display italic text-[12vw] leading-[1.02] tracking-[-0.03em] lg:whitespace-nowrap lg:text-[min(16vh,6.2vw)]">
          {LINE_ROWS.map((row, r) => (
            <span className="block" key={r}>
              {row.split(" ").map((word, index, all) => (
                <span className="inline-block" key={index}>
                  {Array.from(word).map((glyph, at) => (
                    <span className="inline-block" data-letter key={at}>
                      {glyph}
                    </span>
                  ))}
                  {index < all.length - 1 ? " " : ""}
                </span>
              ))}
            </span>
          ))}
        </p>
        <p className={`${INTRO} mt-[5vh] max-w-[46rem] lg:w-[22vw] lg:max-w-none`} data-intro>
          My name is Kevin. I{"’"}m a computer engineering student at the University of Toronto. I design and
          build software, hardware and robots, for the love of the craft and the people who use what I make.
        </p>
      </div>
    </div>
  );
}

/** The header on Work's own column and padding, so it lands on Work.tsx's. */
function Header(): JSX.Element {
  return (
    <div className="px-[6vw] pt-[24vh] lg:pl-[50vw] lg:pr-[8vw]" style={{ color: INK }}>
      <div className="pb-[0.1em] pr-[0.1em] text-[18vw] leading-[1.02] tracking-[-0.03em] lg:text-[min(24vh,9.3vw)]">
        <Serif text="Work" />
      </div>
    </div>
  );
}

export default function Scene(): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const slatsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    const holder = slatsRef.current;
    if (!track || !holder) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.innerWidth >= NARROW;
    const canvas = canvasRef.current;
    const flower: Flower | null = wide && canvas ? startFlower(canvas, GROUND, INK, reduced) : null;

    const slats = Array.from(holder.querySelectorAll<HTMLElement>("[data-slat]"));
    const n = slats.length;
    const parts = slats.map((s) => ({
      slat: s,
      front: s.querySelector<HTMLElement>("[data-front]"),
      back: s.querySelector<HTMLElement>("[data-back]"),
      frontSheen: s.querySelector<HTMLElement>("[data-front] [data-sheen]"),
      backSheen: s.querySelector<HTMLElement>("[data-back] [data-sheen]"),
    }));
    // Letters by copy: every slat holds the whole sentence, so letter k is
    // the k-th [data-letter] of each copy.
    const copies = parts.map((p) => Array.from(p.front?.querySelectorAll<HTMLElement>("[data-letter]") ?? []));
    const intros = parts.map((p) => p.front?.querySelector<HTMLElement>("[data-intro]") ?? null);
    const L = copies[0]?.length ?? 1;

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const turnEase = gsap.parseEase("power3.inOut");
    const soft = gsap.parseEase("power2.out");

    const write = (q: number) => {
      for (let k = 0; k < L; k += 1) {
        const t = reduced ? 1 : clamp01(q * 1.7 - (0.7 * k) / Math.max(1, L - 1));
        const op = (0.06 + 0.94 * t).toFixed(3);
        const blur = `blur(${(7 * (1 - t)).toFixed(2)}px)`;
        for (const c of copies) {
          const el = c[k];
          if (!el) continue;
          el.style.opacity = op;
          el.style.filter = t >= 1 ? "" : blur;
        }
      }
    };

    const apply = (p: number) => {
      const q = soft(clamp01(p / 0.1));
      for (const el of intros) {
        if (!el) continue;
        el.style.opacity = String(reduced ? 1 : q);
        el.style.transform = `translateY(${((1 - q) * 28).toFixed(1)}px)`;
      }
      const vw = window.innerWidth;
      const sw = vw / n;
      const rects: string[] = [];
      parts.forEach((part, i) => {
        const start = WAVE_FROM + (WAVE_SPREAD * i) / Math.max(1, n - 1);
        const t = turnEase(clamp01((p - start) / TURN));
        if (reduced) {
          if (part.front) part.front.style.opacity = String(1 - t);
          if (part.back) {
            part.back.style.transform = "none";
            part.back.style.opacity = String(t);
          }
          if (t < 1) rects.push(`M${(i * sw).toFixed(1)} 0h${sw.toFixed(1)}V${window.innerHeight}h-${sw.toFixed(1)}Z`);
          return;
        }
        const deg = 180 * t;
        const lift = Math.sin(Math.PI * t);
        part.slat.style.transform = `perspective(1600px) translateZ(${(lift * 24).toFixed(1)}px) rotateY(${deg.toFixed(2)}deg)`;
        // Light catches the slat as it turns: a pink sheen across the face,
        // stronger on the edge that comes toward you.
        if (part.frontSheen) part.frontSheen.style.opacity = lift.toFixed(3);
        if (part.backSheen) part.backSheen.style.opacity = lift.toFixed(3);
        const c = Math.cos((Math.PI * deg) / 180);
        if (c > 0.002) {
          const w = sw * c;
          rects.push(`M${(i * sw + (sw - w) / 2).toFixed(1)} 0h${w.toFixed(1)}V${window.innerHeight}h-${w.toFixed(1)}Z`);
        }
      });
      if (canvas) {
        if (reduced) canvas.style.opacity = String(1 - clamp01((p - WAVE_FROM) / (WAVE_SPREAD + TURN)));
        else canvas.style.clipPath = rects.length ? `path('${rects.join(" ")}')` : "inset(50%)";
      }
      flower?.setVisible(rects.length > 0);
    };

    const ctx = gsap.context(() => {
      // Arrival: the sentence writes in and the flower opens as the stage
      // comes up the screen.
      ScrollTrigger.create({
        trigger: track,
        start: "top bottom",
        end: "top top",
        scrub: 0.5,
        onUpdate: (st) => {
          write(st.progress);
          flower?.setOpen(reduced ? 1 : st.progress);
        },
        onRefresh: (st) => {
          write(st.progress);
          flower?.setOpen(reduced ? 1 : st.progress);
        },
      });
      ScrollTrigger.create({
        trigger: track,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.4,
        onUpdate: (st) => apply(st.progress),
        onRefresh: (st) => apply(st.progress),
      });
    }, track);
    apply(0);
    return () => {
      ctx.revert();
      flower?.destroy();
    };
  }, []);

  const N = 14;
  const face = "absolute inset-0 overflow-hidden [backface-visibility:hidden]";
  return (
    <>
      {/* A lead-in, so the sentence has a screen to arrive and write in. */}
      <div className="h-[70vh]" />
      <div className="relative z-10 h-[300vh]" ref={trackRef} style={{ backgroundColor: "transparent" }}>
        <div className="sticky top-0 h-[100vh] overflow-hidden">
          <span className="sr-only">{LINE}</span>
          <canvas
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
            ref={canvasRef}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0" ref={slatsRef}>
            {Array.from({ length: N }, (_, i) => (
              <div
                className="absolute top-0 h-full will-change-transform [transform-style:preserve-3d]"
                data-slat
                key={i}
                style={{ left: `${(100 * i) / N}%`, width: `${100 / N}%` }}
              >
                <div className={face} data-front>
                  <div className="absolute top-0 h-full" style={{ left: `${-100 * i}%`, width: `${100 * N}%` }}>
                    <Statement />
                  </div>
                  <div
                    className="absolute inset-0 opacity-0"
                    data-sheen
                    style={{ background: "linear-gradient(90deg, rgba(10,3,8,0.55), rgba(249,185,220,0.08) 80%, rgba(249,185,220,0.45))" }}
                  />
                </div>
                <div className={face} data-back style={{ transform: "rotateY(180deg)" }}>
                  <div className="absolute top-0 h-full" style={{ left: `${-100 * i}%`, width: `${100 * N}%` }}>
                    <Header />
                  </div>
                  <div
                    className="absolute inset-0 opacity-0"
                    data-sheen
                    style={{ background: "linear-gradient(90deg, rgba(249,185,220,0.45), rgba(249,185,220,0.12) 20%, rgba(10,3,8,0.5))" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Work />
    </>
  );
}
