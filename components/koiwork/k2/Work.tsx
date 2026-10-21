"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { createKoiPair } from "@/components/luke/koi";
import { ACCENT, BLOSSOM, GROUND, INK, RULE, Serif } from "@/components/luke/theme";
import { kindOf, resultOf, whenOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { useTvUp } from "@/components/tvUp";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k2: an editorial page laid around a pond.
 *
 * A thin rail on the left holds the label "Work" and a counter, "01 / 05",
 * that follows the project nearest the middle of the screen. Down the
 * middle of the page runs a column of water (from 30vw to 66vw on a wide
 * screen, the whole width on a phone) where the two koi swim, moved only by
 * the scroll. The project names sit either side of it, big, in the italic
 * serif, alternating left and right, each with its facts in small sans.
 *
 * As a name comes up the screen, one ring opens behind it, its size tied to
 * the scroll: it grows and fades once and is gone. Nothing loops.
 *
 * Reduced motion: no ring, no fade-in; the koi still go with the scroll.
 */

const pad = (n: number): string => String(n).padStart(2, "0");

function NameLink({ p, children }: { p: Project; children: ReactNode }): JSX.Element {
  const cls =
    "inline-block pb-[0.12em] pl-[0.04em] pr-[0.14em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8";
  if (!p.href) return <span className={cls}>{children}</span>;
  return (
    <a className={`${cls} transition-opacity duration-300 hover:opacity-70`} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const ringRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const tvUp = useTvUp();

  // The koi, in the water column, through the band's bar shader.
  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = koiRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gone = false;
    let bar: BarCanvas | null = null;
    let ctx: gsap.Context | null = null;
    let onResize: (() => void) | null = null;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (gone) return;
      const w = canvas.clientWidth || window.innerWidth;
      const h = window.innerHeight;
      const pair = createKoiPair(img, w, h);
      const cols = Math.round(w / (window.innerWidth < 1024 ? 4 : 4.8));
      const config: BarLayerConfig = {
        x: "0%",
        y: "0%",
        width: "100%",
        height: "100%",
        blackPoint: 215,
        whitePoint: 40,
        threshold: 255,
        xSquares: cols,
        ySquares: Math.round((cols * h) / w),
        bgOpacity: 0,
        fillOpacity: 1,
      };
      bar = createBarCanvas(canvas, [{ type: "canvas", source: pair.source, config }], {
        colors: () => ({ bg: hexToRgb(GROUND), fill: hexToRgb(BLOSSOM) }),
        defaults: { bgOpacity: 0 },
        fps: reduced ? 12 : 60,
      });
      ctx = gsap.context(() => {
        ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (st) => pair.setProgress(st.progress),
          onRefresh: (st) => pair.setProgress(st.progress),
        });
      }, section);
      onResize = () => {
        pair.resize(canvas.clientWidth || window.innerWidth, window.innerHeight);
        bar?.redraw();
      };
      window.addEventListener("resize", onResize);
    };
    img.src = "/work/koi.png";
    return () => {
      gone = true;
      ctx?.revert();
      bar?.destroy();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, [tvUp]);

  // The counter, the rings and the fade-ins.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      rowRefs.current.forEach((row, i) => {
        if (!row) return;
        ScrollTrigger.create({
          trigger: row,
          start: "top 60%",
          end: "bottom 40%",
          onToggle: (st) => {
            if (st.isActive && countRef.current) countRef.current.textContent = pad(i + 1);
          },
        });
        if (reduced) return;
        const ring = ringRefs.current[i];
        if (ring) {
          gsap.fromTo(
            ring,
            { scale: 0.15, opacity: 0 },
            {
              keyframes: { scale: [0.15, 0.6, 1.25], opacity: [0, 0.7, 0] },
              ease: "none",
              scrollTrigger: { trigger: row, start: "top 95%", end: "bottom 15%", scrub: true },
            },
          );
        }
        gsap.fromTo(
          row.querySelectorAll("[data-reveal]"),
          { opacity: 0, y: 24, filter: "blur(6px)" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            stagger: 0.08,
            ease: "none",
            scrollTrigger: { trigger: row, start: "top 92%", end: "top 62%", scrub: true },
          },
        );
      });
    }, section);
    return () => ctx.revert();
  }, []);

  const total = pad(projects.length);

  return (
    <section aria-labelledby="k2-work-title" className="relative overflow-x-clip" id="work" ref={sectionRef} style={{ color: INK }}>
      {/* The water: a screen-tall canvas that stays put in its column. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-full lg:left-[30vw] lg:w-[36vw]">
        <canvas
          className="sticky top-0 block h-screen w-full opacity-35 lg:opacity-100 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]"
          ref={koiRef}
        />
      </div>
      {/* The banks of the water column: two hairlines. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-[12vh] left-[30vw] hidden w-px lg:block" style={{ background: RULE }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-[12vh] left-[66vw] hidden w-px lg:block" style={{ background: RULE }} />

      {/* The rail: label and counter, held at the top of the screen. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-full lg:w-[14vw]">
        <div className="sticky top-0 flex items-baseline justify-between px-4 pt-[max(2.4rem,18px)] font-sans text-[clamp(11px,0.7vw,22px)] uppercase tracking-[0.14em] lg:h-screen lg:flex-col lg:justify-between lg:px-0 lg:pb-[6vh] lg:pl-[4vw] lg:pt-[6vh]">
          <span className="flex items-center gap-[0.8em]">
            <span className="inline-block h-[0.45em] w-[0.45em] rounded-full" style={{ background: ACCENT }} />
            Work
          </span>
          <span className="tabular-nums opacity-80">
            <span ref={countRef}>01</span> <span className="opacity-50">/ {total}</span>
          </span>
        </div>
      </div>

      <div className="relative px-4 pb-[36vh] pt-[22vh] lg:px-0">
        <h2
          className="pb-[0.1em] pr-[0.12em] text-[clamp(64px,18vw,120px)] leading-[0.95] tracking-[-0.03em] lg:ml-[14vw] lg:text-[min(20vh,8.4vw)]"
          id="k2-work-title"
        >
          <Serif text="Selected work" />
        </h2>
        <p className="mt-[3vh] max-w-[34ch] font-sans text-[clamp(13px,0.95vw,30px)] leading-[1.5] opacity-60 lg:ml-[14.4vw]">
          A company, two hackathon builds, a robotics library and a Discord bot.
        </p>

        <ol className="mt-[24vh] flex flex-col gap-[22vh] lg:gap-[30vh]">
          {projects.map((p, i) => {
            const right = i % 2 === 1;
            const result = resultOf(p);
            return (
              <li
                className={`relative w-fit max-w-full ${right ? "lg:ml-[52vw] lg:max-w-[42vw]" : "lg:ml-[14vw] lg:max-w-[44vw]"}`}
                key={p.title}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
              >
                {/* One ring, opened by the scroll behind the name. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-[40%] block aspect-square w-[min(80vw,40vw+20vh)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
                  ref={(el) => {
                    ringRefs.current[i] = el;
                  }}
                  style={{ border: `1px solid ${BLOSSOM}` }}
                />
                <div className="relative flex items-baseline gap-[1.2em] font-sans text-[clamp(11px,0.7vw,22px)] uppercase tracking-[0.14em] opacity-70" data-reveal>
                  <span className="tabular-nums" style={{ color: ACCENT }}>
                    {pad(i + 1)}
                  </span>
                  <span>{kindOf(p)}</span>
                </div>
                <h3
                  className="relative mt-[2vh] text-[clamp(44px,12vw,72px)] leading-[1.02] tracking-[-0.03em] lg:text-[clamp(56px,5.6vw,200px)]"
                  data-reveal
                >
                  <NameLink p={p}>
                    <Serif text={p.title} />
                  </NameLink>
                </h3>
                <p className="relative mt-[2vh] max-w-[38ch] font-sans text-[clamp(13px,0.95vw,30px)] leading-[1.5] opacity-75" data-reveal>
                  {p.tagline}
                </p>
                <div
                  className="relative mt-[2.4vh] flex flex-wrap gap-x-[2.4em] gap-y-[0.4em] border-t pt-[1.4vh] font-sans text-[clamp(11px,0.7vw,22px)] uppercase tracking-[0.12em] opacity-60"
                  data-reveal
                  style={{ borderColor: RULE }}
                >
                  <span className="tabular-nums">{whenOf(p)}</span>
                  {result && <span>{result}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
