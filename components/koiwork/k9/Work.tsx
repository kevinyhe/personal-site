"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, useEffect, useRef } from "react";

import { createKoiPair } from "@/components/luke/koi";
import { BLOSSOM, GROUND, INK, RULE } from "@/components/luke/theme";
import { kindOf, resultOf, whenOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import { useTvUp } from "@/components/tvUp";

import Mist from "./Mist";
import Serif from "./Serif";

/** A ground-coloured plate: the koi and the mist pass behind it, so
 *  nothing crosses the text on it. */
const PLATE = { background: GROUND, outline: `max(10px, 0.6vw) solid ${GROUND}` };

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k9, "Byobu": a folding screen.
 *
 * The section is one tall screen of five panels, one per project, joined
 * by double hairlines like a screen's hinges. The koi swim behind the
 * whole screen, so the hinges cut through the pond the way they cut
 * through a painted byobu. Pink hairline mist bands (suyari-gasumi) run
 * across the panels as the one ornament.
 *
 * As the page scrolls, each panel leans a little, alternately left and
 * right, and its contents drift at its own speed: light moving across a
 * folded screen. One scroll listener writes the transforms; no React
 * state per frame.
 *
 * Phone: the panels stack, hinges turn horizontal, no lean.
 * Reduced motion: no lean, no drift; the koi still go with the scroll.
 */

function NameLink({ p, className, children }: { p: Project; className: string; children: JSX.Element }): JSX.Element {
  if (!p.href) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

/** A screen hinge: two hairlines a few px apart. */
function Hinge({ className }: { className: string }): JSX.Element {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute ${className}`} style={{ borderColor: RULE }} />
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadeRefs = useRef<(HTMLDivElement | null)[]>([]);

  const tvUp = useTvUp();
  // The koi, as in components/luke/WorkIndex.tsx.
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

  // The fold. p runs 0..1 while the section crosses the screen; each
  // panel leans by a sine of it, alternate panels the other way, and its
  // contents drift at a speed of their own.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const wide = window.matchMedia("(min-width: 1024px)");
    let raf = 0;
    const paint = (): void => {
      raf = 0;
      const s = sectionRef.current;
      if (!s) return;
      const r = s.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (r.height + vh)));
      panelRefs.current.forEach((el, i) => {
        const inner = innerRefs.current[i];
        const shade = shadeRefs.current[i];
        if (!el || !inner || !shade) return;
        if (!wide.matches) {
          el.style.transform = "";
          inner.style.transform = "";
          shade.style.opacity = "0";
          return;
        }
        const side = i % 2 === 0 ? 1 : -1;
        // The light crosses the screen from left to right: a panel is
        // flattest as it passes.
        const phase = Math.sin((p * 1.6 - i * 0.18) * Math.PI);
        const lean = side * phase * 3.2;
        el.style.transform = `perspective(140vw) rotateY(${lean.toFixed(2)}deg)`;
        inner.style.transform = `translate3d(0, ${((p - 0.5) * (i % 2 === 0 ? -9 : 7)).toFixed(2)}vh, 0)`;
        shade.style.opacity = (0.08 + 0.22 * Math.max(0, side * phase)).toFixed(3);
      });
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
    <section aria-labelledby="k9-work-title" className="relative" id="work" ref={sectionRef} style={{ color: INK }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="sticky top-0 block h-screen w-full [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
          ref={koiRef}
        />
      </div>

      <div className="relative px-4 pb-[20vh] pt-[16vh] sm:px-[6vw]">
        {/* Head: the title, and a one-line caption like a museum label. */}
        <header className="flex flex-col gap-[3vh] lg:flex-row lg:items-end lg:justify-between">
          <h2 className="pb-[0.1em] pl-[0.08em] pr-[0.12em] text-[clamp(64px,17vw,120px)] leading-[0.95] tracking-[-0.03em] lg:text-[min(20vh,9vw)]" id="k9-work-title">
            <Serif text="Work" />
          </h2>
          <p className="max-w-[34ch] pb-[1.4vh] font-sans text-[clamp(12px,0.8vw,26px)] leading-[1.5] opacity-60">
            A company, two hackathon builds, a robotics library and a Discord bot, 2021 to 2026.
          </p>
        </header>

        {/* The screen. A double hairline frames it top and bottom. */}
        <div className="relative mt-[8vh] border-y-[3px] border-double lg:h-[170vh]" style={{ borderColor: RULE }}>
          <Mist className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" />
          <ol className="relative flex h-full flex-col lg:flex-row">
            {projects.map((p, i) => (
              <li className="relative lg:h-full lg:flex-1" key={p.title}>
                {i > 0 && (
                  <Hinge className="left-0 right-0 top-0 h-[3px] border-t-[3px] border-double lg:bottom-0 lg:left-[-1.5px] lg:right-auto lg:h-auto lg:w-[3px] lg:border-l-[3px] lg:border-t-0" />
                )}
                <div
                  className={`relative h-full will-change-transform ${i % 2 === 0 ? "origin-left" : "origin-right"}`}
                  ref={(el) => {
                    panelRefs.current[i] = el;
                  }}
                >
                  {/* The fold's shadow: a panel turned from the light is darker. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-0"
                    ref={(el) => {
                      shadeRefs.current[i] = el;
                    }}
                    style={{ background: GROUND }}
                  />
                  <div
                    className={`relative flex h-full flex-col justify-between gap-[5vh] py-[7vh] pr-2 lg:px-[1.6vw] lg:py-[6vh] ${i % 2 === 0 ? "lg:pt-[8vh]" : "lg:pt-[30vh]"}`}
                  >
                    <span className="font-sans text-[clamp(11px,0.7vw,24px)] tabular-nums opacity-50">
                      {String(i + 1).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}
                    </span>
                    <div
                      className="w-fit"
                      ref={(el) => {
                        innerRefs.current[i] = el;
                      }}
                      style={PLATE}
                    >
                    <NameLink
                      className="block w-fit pb-[0.1em] pr-[0.12em] text-[clamp(40px,11vw,64px)] leading-[1.02] tracking-[-0.03em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 lg:pb-[0.12em] lg:pl-[0.14em] lg:text-[clamp(40px,4.4vw,170px)] lg:[text-orientation:mixed] lg:[writing-mode:vertical-rl]"
                      p={p}
                    >
                      <Serif text={p.title} />
                    </NameLink>
                    </div>
                    <dl style={PLATE} className="grid w-fit gap-[1.2vh] font-sans text-[clamp(12px,0.78vw,26px)] leading-[1.4]">
                      <div className="border-t pt-[1vh]" style={{ borderColor: RULE }}>
                        <dt className="sr-only">What</dt>
                        <dd className="opacity-60">{kindOf(p)}</dd>
                      </div>
                      <div>
                        <dt className="sr-only">When</dt>
                        <dd className="tabular-nums opacity-60">{whenOf(p)}</dd>
                      </div>
                      {resultOf(p) && (
                        <div>
                          <dt className="sr-only">Result</dt>
                          <dd>{resultOf(p)}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
