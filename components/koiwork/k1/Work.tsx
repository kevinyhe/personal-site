"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef, useState } from "react";

import { createKoiPair } from "@/components/luke/koi";
import { ACCENT, BLOSSOM, GROUND, INK, RULE, Serif } from "@/components/luke/theme";
import { kindOf, resultOf, whenOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { useTvUp } from "@/components/tvUp";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k1: a numbered index of project names.
 *
 * A small header line ("Work", the count, a hairline), then one row per
 * project between thin rules: its number, its name large in the italic
 * serif, and on the right what it is and when. The row nearest the middle
 * of the screen is the active one: full pink, its result slides in under
 * the name and a short rose mark draws in by the number. The others dim.
 * Nothing is held; the page scrolls straight through.
 *
 * Behind the list, the two koi (koi.ts) in the band's pink bars, on a
 * screen-sized canvas that stays put while the section goes by. They move
 * only with the scroll.
 *
 * Reduced motion: every row is shown full, results included, with no
 * transitions; the koi still follow the scroll.
 */

function RowLink({ p, className, children }: { p: Project; className: string; children: ReactNode }): JSX.Element {
  if (!p.href) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [active, setActive] = useState(-1);
  const [still, setStill] = useState(false);

  // The koi, wired as in components/luke/WorkIndex.tsx.
  const tvUp = useTvUp();
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

  // The active row: the one whose middle is nearest the middle of the
  // screen, while any row is within 40% of a screen of it.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      return undefined;
    }
    let raf = 0;
    const pick = (): void => {
      raf = 0;
      const mid = window.innerHeight / 2;
      let best = -1;
      let bestD = window.innerHeight * 0.4;
      rowRefs.current.forEach((row, i) => {
        if (!row) return;
        const r = row.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      setActive(best);
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const ease = "duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

  return (
    <section aria-labelledby="k1-work-title" className="relative" ref={sectionRef} style={{ color: INK }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="sticky top-0 block h-screen w-full opacity-70 [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]"
          ref={koiRef}
        />
      </div>

      <div className="relative px-4 pb-[36vh] pt-[16vh] sm:px-[6vw]">
        <div className="flex items-baseline justify-between gap-4 pb-[max(1.6rem,14px)] font-sans text-[clamp(11px,0.75vw,24px)] uppercase tracking-[0.14em]">
          <h2 className="font-sans" id="k1-work-title">
            Selected work
          </h2>
          <span className="tabular-nums opacity-55">{String(projects.length).padStart(2, "0")} projects, 2021 to 2026</span>
        </div>

        <ol style={{ borderTop: `1px solid ${RULE}` }}>
          {projects.map((p, i) => {
            const on = still || active === i;
            const result = resultOf(p);
            return (
              <li
                className={`relative grid grid-cols-[2.6em_1fr] items-start gap-x-[2vw] py-[max(4.2vh,22px)] font-sans transition-opacity sm:grid-cols-[4.5vw_1fr_auto] ${ease} ${on ? "opacity-100" : "opacity-[0.34]"}`}
                key={p.title}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                style={{ borderBottom: `1px solid ${RULE}` }}
              >
                <span className="relative pt-[0.9em] text-[clamp(11px,0.75vw,24px)] tabular-nums tracking-[0.08em]">
                  {String(i + 1).padStart(2, "0")}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-[2.6em] block h-px w-[1.6em] origin-left transition-transform ${ease} ${on ? "scale-x-100" : "scale-x-0"}`}
                    style={{ backgroundColor: ACCENT }}
                  />
                </span>

                <div className="min-w-0">
                  <RowLink
                    className="inline-block rounded-sm pb-[0.1em] pr-[0.12em] text-[clamp(38px,10vw,72px)] leading-[1.02] tracking-[-0.03em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 lg:text-[min(6.4vw,15vh)]"
                    p={p}
                  >
                    <Serif text={p.title} />
                    {p.href ? (
                      <span
                        aria-hidden="true"
                        className={`ml-[0.25em] inline-block align-top font-sans text-[0.28em] not-italic transition-[opacity,transform] ${ease} ${on ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"}`}
                        style={{ color: ACCENT }}
                      >
                        ↗
                      </span>
                    ) : null}
                  </RowLink>
                  {result ? (
                    <p
                      className={`mt-[max(0.8rem,6px)] text-[clamp(13px,0.95vw,30px)] transition-[opacity,transform,filter] ${ease} ${on ? "translate-y-0 opacity-100 blur-0" : "translate-y-2 opacity-0 blur-[3px]"}`}
                    >
                      {result}
                    </p>
                  ) : null}
                  <p className="mt-[max(0.5rem,4px)] text-[clamp(11px,0.75vw,24px)] opacity-55 sm:hidden">
                    {kindOf(p)}, {whenOf(p)}
                  </p>
                </div>

                <div className="hidden pt-[0.9em] text-right text-[clamp(11px,0.75vw,24px)] leading-[1.7] tracking-[0.04em] sm:block">
                  <p className="opacity-70">{kindOf(p)}</p>
                  <p className="tabular-nums opacity-55">{whenOf(p)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
