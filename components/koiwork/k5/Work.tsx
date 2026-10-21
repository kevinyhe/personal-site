"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { drawContours } from "@/components/koiwork/k5/contours";
import { createKoiPair } from "@/components/luke/koi";
import { Serif } from "@/components/koiwork/k5/Serif";
import { ACCENT, BLOSSOM, GROUND, INK, RULE } from "@/components/luke/theme";
import { kindOf, resultOf, whenOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { useTvUp } from "@/components/tvUp";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k5: the pond as a depth chart.
 *
 * Behind the section, contour lines of the pond floor in even pink hairlines
 * (contours.ts). They sit on
 * a screen-sized layer that stays put and slides up a little slower than
 * the page, so the map seems to lie below the type. The two koi swim over
 * the map in the bar shader, moved only by the scroll.
 *
 * Each project is a surveyed point on the chart: a cross, a leader line
 * out to its name, and its facts set like a sounding (year, kind, result).
 * The leader draws itself and the name comes up as the point reaches the
 * screen, tied to the scroll.
 *
 * Reduced motion: everything drawn from the start, the map does not slide,
 * the koi hold still.
 */

const pad = (n: number): string => String(n).padStart(2, "0");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "May 2026" for "05 2026"; a range as "2022 – 2026". */
function dateOf(p: Project): string {
  const w = whenOf(p);
  const m = /^(\d\d) (\d{4})$/.exec(w);
  if (m) return `${MONTHS[Number(m[1]) - 1]} ${m[2]}`;
  return w.replace(/\s*[–-]\s*/, " – ");
}

/** Where each point sits across the page on a wide screen, in vw. */
const SPOTS = [4, 40, 16, 46, 8];

function NameLink({ p, children }: { p: Project; children: ReactNode }): JSX.Element {
  const cls = "inline-block pb-[0.1em] pl-[0.04em] pr-[0.14em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8";
  if (!p.href) return <span className={cls}>{children}</span>;
  return (
    <a className={`${cls} transition-opacity duration-300 hover:opacity-70`} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

/** The survey mark: a ring with a cross through it and a rose centre. */
function Mark(): JSX.Element {
  return (
    <svg aria-hidden="true" className="absolute left-0 top-0 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 overflow-visible" viewBox="-11 -11 22 22">
      <circle cx="0" cy="0" fill="none" r="5.5" stroke={INK} strokeWidth="0.75" />
      <path d="M-11 0H-3M3 0H11M0 -11V-3M0 3V11" stroke={INK} strokeWidth="0.75" />
      <circle cx="0" cy="0" fill={ACCENT} r="1.4" />
    </svg>
  );
}

function Fact({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <>
      <dt className="opacity-50">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </>
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<HTMLCanvasElement | null>(null);
  const tvUp = useTvUp();

  // The koi, as on the home page.
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
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pair = createKoiPair(img, w, h);
      const cols = Math.round(w / (w < 1024 ? 4 : 4.8));
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
      // Reduced motion: the koi hold still, part way down their path.
      if (reduced) pair.setProgress(0.35);
      ctx = gsap.context(() => {
        if (reduced) return;
        ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (st) => pair.setProgress(st.progress),
          onRefresh: (st) => pair.setProgress(st.progress),
        });
      }, section);
      onResize = () => {
        pair.resize(window.innerWidth, window.innerHeight);
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

  // The map: drawn once per size, 1.5 screens tall, slid up 0.5 screen
  // over the section's whole scroll.
  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = mapRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastW = 0;
    const draw = (): void => {
      const w = window.innerWidth;
      if (w === lastW) return;
      lastW = w;
      drawContours(canvas, w, Math.round(window.innerHeight * 1.5), { ink: INK, ground: GROUND });
    };
    draw();
    const ctx = gsap.context(() => {
      gsap.fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: "power1.out" });
      if (!reduced) {
        gsap.fromTo(
          canvas,
          { yPercent: 0 },
          { yPercent: -100 / 3, ease: "none", scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: true } },
        );
      }
    }, section);
    window.addEventListener("resize", draw);
    return () => {
      ctx.revert();
      window.removeEventListener("resize", draw);
    };
  }, [tvUp]);

  // Each point: its leader draws, then its name and facts come up.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ctx = gsap.context(() => {
      for (const row of gsap.utils.toArray<HTMLElement>("[data-point]", section)) {
        const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 90%", end: "top 55%", scrub: 0.6 } });
        tl.fromTo(row.querySelectorAll("[data-mark]"), { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, ease: "power2.out", duration: 0.25 })
          .fromTo(row.querySelectorAll("[data-leader]"), { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "none", duration: 0.4 }, 0.1)
          .fromTo(row.querySelectorAll("[data-label]"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, ease: "power2.out", duration: 0.45 }, 0.35);
      }
      gsap.fromTo(
        section.querySelectorAll("[data-head]"),
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, stagger: 0.08, ease: "power2.out", scrollTrigger: { trigger: section, start: "top 80%", end: "top 30%", scrub: 0.6 } },
      );
    }, section);
    return () => ctx.revert();
  }, []);

  const first = projects[projects.length - 1]?.year.slice(0, 4);
  const last = projects.reduce((m, p) => Math.max(m, Number(p.year.slice(-4))), 0);

  return (
    <section aria-labelledby="work-title" className="relative overflow-x-clip" id="work" ref={sectionRef} style={{ color: INK }}>
      {/* The chart, then the koi over it: both screen-sized and held while
          the section goes by. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="sticky top-0 h-screen w-full overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]">
          <canvas className="absolute left-0 top-0 block h-[150vh] w-full opacity-0" ref={mapRef} />
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="sticky top-0 block h-screen w-full [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
          ref={koiRef}
        />
      </div>

      <div className="relative px-4 pb-[16vh] pt-[12vh] sm:px-[8vw]">
        {/* The chart's title block. */}
        <header className="grid grid-cols-1 gap-y-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7" data-head>
            <p className="font-sans text-[clamp(10px,0.7vw,22px)] uppercase tracking-[0.22em] opacity-60">Chart of work</p>
            <h2 className="mt-[2vh] pb-[0.1em] pl-[0.06em] pr-[0.12em] text-[clamp(72px,19vw,130px)] leading-[0.92] tracking-[-0.03em] lg:text-[min(24vh,10vw)]" id="work-title">
              <Serif text="Work" />
            </h2>
          </div>
          <div className="w-fit font-sans text-[clamp(11px,0.75vw,24px)] lg:col-span-4 lg:col-start-9" data-head>
            <dl className="grid w-full grid-cols-[auto_auto] gap-x-6 gap-y-[0.6em] border-t pt-[1.2em]" style={{ borderColor: RULE }}>
              <Fact k="Surveyed" v={`${first} – ${last}`} />
              <Fact k="Points" v={pad(projects.length)} />
              <Fact k="Based" v="Toronto" />
            </dl>
            {/* Scale bar: alternating bars, like a chart's. */}
            <div aria-hidden="true" className="mt-[1.6em] flex h-[3px] w-full border-[1px]" style={{ borderColor: INK }}>
              {[0, 1, 2, 3, 4].map((n) => (
                <span className="flex-1" key={n} style={{ background: n % 2 ? "transparent" : INK }} />
              ))}
            </div>
          </div>
        </header>

        <ol className="mt-[10vh] flex flex-col gap-y-[clamp(56px,10vh,220px)] lg:mt-[12vh]">
          {projects.map((p, i) => {
            const result = resultOf(p);
            const lead = i === 0;
            return (
              <li className="relative" data-point key={p.title} style={{ "--x": `${SPOTS[i % SPOTS.length]}vw` } as React.CSSProperties}>
                <div className="relative isolate w-fit max-w-full pl-[28px] lg:ml-[var(--x)] lg:pl-[6vw]">
                  {/* A dark pool under the name so no line crosses it. */}
                  <div
                    aria-hidden="true"
                    className="absolute -inset-x-[clamp(48px,6vw,160px)] -inset-y-[clamp(56px,7vh,160px)] -z-10"
                    style={{ background: `radial-gradient(farthest-side, ${GROUND} 78%, transparent)` }}
                  />
                  {/* The point, then a level leader to the name. */}
                  <div className="absolute left-[6px] top-[0.62em] lg:left-0" data-mark>
                    <Mark />
                    <span className="absolute left-[10px] top-[-20px] whitespace-nowrap font-sans text-[clamp(9px,0.6vw,20px)] tabular-nums tracking-[0.12em] opacity-60">
                      {pad(i + 1)}
                    </span>
                  </div>
                  <svg aria-hidden="true" className="absolute left-[17px] top-[0.62em] h-px w-[8px] overflow-visible lg:left-[11px] lg:w-[calc(6vw-26px)]" preserveAspectRatio="none" viewBox="0 0 100 1">
                    <path d="M0 0.5H100" data-leader fill="none" pathLength={1} stroke={INK} strokeDasharray="1" strokeOpacity="0.7" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div data-label>
                    <h3
                      className={`leading-[1.02] tracking-[-0.03em] ${
                        lead ? "text-[clamp(44px,12vw,84px)] lg:text-[clamp(52px,5.6vw,208px)]" : "text-[clamp(34px,9vw,64px)] lg:text-[clamp(40px,3.8vw,150px)]"
                      }`}
                    >
                      <NameLink p={p}>
                        <Serif text={p.title} />
                      </NameLink>
                    </h3>
                    <dl className="mt-[clamp(10px,1.4vh,28px)] grid w-fit grid-cols-[auto_auto] gap-x-[1.6em] gap-y-[0.45em] border-t pt-[0.9em] font-sans text-[clamp(11px,0.72vw,24px)]" style={{ borderColor: RULE }}>
                      <Fact k="Year" v={dateOf(p)} />
                      <Fact k="Kind" v={kindOf(p)} />
                      {result ? <Fact k="Result" v={result} /> : null}
                    </dl>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
