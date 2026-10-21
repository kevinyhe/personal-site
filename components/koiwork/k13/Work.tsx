"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, useEffect, useRef } from "react";

import { ACCENT, BLOSSOM, GROUND, INK, RULE, Serif } from "@/components/luke/theme";
import { hostOf, kindOf, resultOf, whenOf } from "@/components/luke/work-data";
import { projects } from "@/components/profile";
import { useTvUp } from "@/components/tvUp";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

import { createKoiPair, type KoiPair } from "./koi";
import { createSurface, type Surface } from "./surface";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work, design k13: the surface.
 *
 * The whole screen is still water, drawn as a regular grid of faint pink
 * dots (surface.ts). The two koi glide over it in the site's pink bars,
 * moved only by the scroll, and as the lead fish swims it leaves rings in
 * the water that spread through the grid and die away.
 *
 * The projects are a quiet column down the right: each one a hairline,
 * its number and date, its name in the serif, and its facts. The one
 * nearest the middle of the screen is full pink; the rest sit back. On a
 * wide screen the water also writes the active number in brighter dots on
 * the left and runs a line of brighter dots under the active title.
 *
 * Both canvases are screen-sized and stay put while the section scrolls.
 * Reduced motion: no rings, all rows full; the koi still follow the scroll.
 */

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const waterRef = useRef<HTMLCanvasElement | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const surfaceRef = useRef<Surface | null>(null);
  const tvUp = useTvUp();

  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = koiRef.current;
    const water = waterRef.current;
    const section = sectionRef.current;
    if (!canvas || !water || !section) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gone = false;
    let bar: BarCanvas | null = null;
    let pair: KoiPair | null = null;
    let ctx: gsap.Context | null = null;
    const [r, g, b] = hexToRgb(INK).map((c) => Math.round(c * 255));
    const surface: Surface = createSurface(water, `${r},${g},${b}`, () => pair?.lead() ?? null, reduced);
    surfaceRef.current = surface;
    // So the numeral and guide line are drawn straight away.
    window.dispatchEvent(new Event("scroll"));
    const onResize = (): void => {
      surface.resize();
      pair?.resize(window.innerWidth, window.innerHeight);
      bar?.redraw();
    };
    window.addEventListener("resize", onResize);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (gone) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const koi = createKoiPair(img, w, h);
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
      bar = createBarCanvas(canvas, [{ type: "canvas", source: koi.source, config }], {
        colors: () => ({ bg: hexToRgb(GROUND), fill: hexToRgb(BLOSSOM) }),
        defaults: { bgOpacity: 0 },
        fps: reduced ? 12 : 60,
      });
      ctx = gsap.context(() => {
        ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (st) => koi.setProgress(st.progress),
          onRefresh: (st) => koi.setProgress(st.progress),
        });
      }, section);
      pair = koi;
    };
    img.src = "/work/koi.png";
    return () => {
      gone = true;
      ctx?.revert();
      bar?.destroy();
      surface.destroy();
      surfaceRef.current = null;
      window.removeEventListener("resize", onResize);
    };
  }, [tvUp]);

  // The row nearest the middle of the screen is full; the rest sit back.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = 0;
    const paint = (): void => {
      raf = 0;
      const mid = window.innerHeight / 2;
      let best = -1;
      let bestD = Infinity;
      rowRefs.current.forEach((row, i) => {
        if (!row) return;
        const rc = row.getBoundingClientRect();
        const d = Math.abs(rc.top + rc.height / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      rowRefs.current.forEach((row, i) => {
        if (row) row.dataset.on = i === best ? "1" : "0";
      });
      // The water draws the active number on the left and a guide line
      // under its title; wide screens only, where the left is free.
      const row = rowRefs.current[best];
      const wide = window.innerWidth >= 1024;
      const title = row?.querySelector<HTMLElement>("[data-title]");
      const col = row?.parentElement?.getBoundingClientRect().left ?? null;
      surfaceRef.current?.setActive(
        wide ? best + 1 : 0,
        wide && title ? title.getBoundingClientRect().bottom : null,
        wide ? col : null,
      );
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section aria-labelledby="k13-title" className="relative" id="work" ref={sectionRef} style={{ color: INK }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="sticky top-0 h-screen w-full [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]">
          <canvas className="absolute inset-0 block h-full w-full" ref={waterRef} />
          <canvas className="absolute inset-0 block h-full w-full" ref={koiRef} />
        </div>
      </div>

      <div className="relative px-4 pb-[30vh] pt-[16vh] sm:px-[8vw]">
        <header className="flex items-end justify-between gap-6 border-b pb-[3vh]" style={{ borderColor: RULE }}>
          <h2
            className="pb-[0.1em] pl-[0.06em] pr-[0.12em] text-[clamp(64px,17vw,120px)] leading-[0.95] tracking-[-0.03em] lg:text-[min(20vh,9vw)]"
            id="k13-title"
          >
            <Serif text="Work" />
          </h2>
          <p className="pb-[1.2vh] text-right font-sans text-[clamp(11px,0.75vw,24px)] uppercase tracking-[0.14em] opacity-60">
            Selected projects
            <br />
            {String(projects.length).padStart(2, "0")} entries, 2021–2026
          </p>
        </header>

        <ol className="ml-auto mt-[22vh] flex w-full flex-col gap-[10vh] lg:w-[34vw] lg:gap-[14vh]">
          {projects.map((p, i) => {
            const result = resultOf(p);
            return (
              <li
                className="group transition-opacity duration-500 max-lg:bg-[rgba(23,10,20,0.85)] max-lg:px-[4vw] max-lg:py-[2vh] data-[on='0']:opacity-[0.22] max-lg:data-[on='0']:blur-[1px] motion-reduce:!opacity-100 motion-reduce:!blur-none"
                data-on="0"
                key={p.title}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
              >
                <div className="flex items-center justify-between border-t pt-[1.4vh] font-sans text-[clamp(11px,0.7vw,22px)] tabular-nums tracking-[0.08em]" style={{ borderColor: RULE }}>
                  <span className="flex items-center gap-[0.8em]">
                    <span
                      className="inline-block h-[5px] w-[5px] opacity-0 transition-opacity duration-500 group-data-[on='1']:opacity-100"
                      style={{ backgroundColor: ACCENT }}
                    />
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{whenOf(p)}</span>
                </div>
                {p.href ? (
                  <a
                    className="mt-[2vh] block w-fit rounded-sm pb-[0.1em] pr-[0.12em] text-[clamp(36px,2.8vw,120px)] leading-[1.05] tracking-[-0.025em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8"
                    data-title
                    href={p.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Serif text={p.title} />
                  </a>
                ) : (
                  <span className="mt-[2vh] block w-fit pb-[0.1em] pr-[0.12em] text-[clamp(36px,2.8vw,120px)] leading-[1.05] tracking-[-0.025em]" data-title>
                    <Serif text={p.title} />
                  </span>
                )}
                <dl className="mt-[1.6vh] grid grid-cols-[auto_1fr] gap-x-[1.6em] gap-y-[0.5em] font-sans text-[clamp(12px,0.78vw,24px)] leading-snug">
                  <dt className="opacity-50">What</dt>
                  <dd>{kindOf(p)}</dd>
                  {result ? (
                    <>
                      <dt className="opacity-50">Result</dt>
                      <dd>{result}</dd>
                    </>
                  ) : null}
                  {p.href ? (
                    <>
                      <dt className="opacity-50">Link</dt>
                      <dd>{hostOf(p.href)}</dd>
                    </>
                  ) : null}
                </dl>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
