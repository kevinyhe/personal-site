"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, useEffect, useRef } from "react";

import { BLOSSOM, GROUND, INK, RULE } from "@/components/luke/theme";
import { resultOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { useTvUp } from "@/components/tvUp";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

import { type BodyPoint, createKoiPair } from "./koi";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k7: the specimen plate.
 *
 * The section is a page from a naturalist's field guide. The koi swimming
 * down the left are the specimen. Hairline leader lines run from five
 * points on the lead fish (snout, pectoral fin, dorsal fin, pelvic fin,
 * tail; koi.ts reports them every frame) to five labels in the right
 * margin, and the labels are the projects: "Fig. 1" and the body part in
 * sans, the name in the serif, the result under it.
 *
 * As the page scrolls through the section, one figure at a time is the
 * one being read: its label goes full pink and its line draws in from the
 * label to the fish; the others stay faint. On a phone only that one label
 * and line show, low on the screen.
 *
 * Plate furniture: a hairline frame, the plate number and title, the
 * species, and a scale bar one lead body long (measured, so it is true).
 *
 * Nothing is held: the section is tall and its stage is a sticky screen.
 * The fish move only with the scroll. Reduced motion: no line draw-in or
 * fades; the fish still go with the scroll.
 */

/** The fish swims down the screen, so its tail is highest: figures run
 *  tail to snout so the lines to the labels do not cross. Indexes into
 *  koi.ts ANATOMY (snout 0 ... tail 4). */
const PART_OF = [4, 3, 2, 1, 0];
const PARTS = ["tail", "pelvic fin", "dorsal fin", "pectoral fin", "snout"];
const N = projects.length;

/** The result, and the year when the result does not already say it. */
function yearLine(p: Project): string {
  const r = resultOf(p);
  if (!r) return p.year;
  return r.includes(p.year) ? r : `${r}. ${p.year}`;
}

/** Characters the display serif (a DEMO cut) cannot draw. */
const NOT_SERIF = /([0-9'"&@\-\u2010\u2011!()/;]+)/;

/** The display serif, with digits and hyphens in the sans at 0.62em on the
 *  baseline, so they sit like small figures beside the italic. */
function Serif({ text }: { text: string }): JSX.Element {
  return (
    <span className="font-serif-display italic">
      {text.split(NOT_SERIF).map((run, i) =>
        i % 2 === 1 ? (
          <span className="pl-[0.04em] align-baseline font-sans text-[0.62em] not-italic tracking-normal" key={i}>
            {run}
          </span>
        ) : (
          run
        ),
      )}
    </span>
  );
}

function Name({ p }: { p: Project }): JSX.Element {
  const cls =
    "pointer-events-auto block w-fit rounded-sm pb-[0.1em] pr-[0.12em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4";
  if (!p.href) {
    return (
      <span className={cls}>
        <Serif text={p.title} />
      </span>
    );
  }
  return (
    <a className={cls} href={p.href} rel="noopener noreferrer" target="_blank">
      <Serif text={p.title} />
    </a>
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lineRefs = useRef<(SVGLineElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const anchorRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const labelRefs = useRef<(HTMLLIElement | null)[]>([]);
  const scaleRef = useRef<HTMLDivElement | null>(null);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const activeRef = useRef(0);
  const placeRingRef = useRef<() => void>(() => undefined);

  // Which figure is being read, from the scroll. Works without the fish.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    let current = -1;
    const setActive = (p: number): void => {
      const i = Math.max(0, Math.min(N - 1, Math.floor(p * N)));
      if (i === current) return;
      current = i;
      activeRef.current = i;
      placeRingRef.current();
      labelRefs.current.forEach((li, k) => li?.toggleAttribute("data-on", k === i));
      lineRefs.current.forEach((l, k) => l?.toggleAttribute("data-on", k === i));
      dotRefs.current.forEach((d, k) => d?.toggleAttribute("data-on", k === i));
      if (countRef.current) countRef.current.textContent = `Fig. ${i + 1} of ${N}`;
    };
    setActive(0);
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (st) => setActive(st.progress),
        onRefresh: (st) => setActive(st.progress),
      });
    }, section);
    return () => ctx.revert();
  }, []);

  const tvUp = useTvUp();
  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = koiRef.current;
    const section = sectionRef.current;
    const svg = svgRef.current;
    if (!canvas || !section || !svg) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gone = false;
    let bar: BarCanvas | null = null;
    let ctx: gsap.Context | null = null;
    let onResize: (() => void) | null = null;

    // Where each label's line ends, relative to the stage. The labels do
    // not move on screen, so this is measured on load and resize only.
    let ends: { x: number; y: number }[] = [];
    const measure = (): void => {
      const box = svg.getBoundingClientRect();
      ends = anchorRefs.current.map((a) => {
        const r = a?.getBoundingClientRect();
        return r ? { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top } : { x: 0, y: 0 };
      });
    };

    let last: BodyPoint[] = [];
    placeRingRef.current = () => {
      const q = last[PART_OF[activeRef.current]];
      if (!q || !ringRef.current) return;
      ringRef.current.setAttribute("cx", q.x.toFixed(1));
      ringRef.current.setAttribute("cy", q.y.toFixed(1));
    };
    const onFrame = (pts: BodyPoint[], lengthPx: number): void => {
      last = pts;
      placeRingRef.current();
      PART_OF.forEach((part, i) => {
        const q = pts[part];
        const line = lineRefs.current[i];
        const dot = dotRefs.current[i];
        const e = ends[i];
        if (!line || !dot || !e) return;
        // A point off the stage, or under the canvas mask's top fade, has
        // nothing to point at. Keep in step with the mask stops below.
        const top = window.innerHeight * (window.innerWidth >= 1024 ? 0.24 : 0.19);
        const off = q.y < top || q.y > window.innerHeight * 0.9 ? "hidden" : "visible";
        line.setAttribute("visibility", off);
        dot.setAttribute("visibility", off);
        line.setAttribute("x1", e.x.toFixed(1));
        line.setAttribute("y1", e.y.toFixed(1));
        line.setAttribute("x2", q.x.toFixed(1));
        line.setAttribute("y2", q.y.toFixed(1));
        dot.setAttribute("cx", q.x.toFixed(1));
        dot.setAttribute("cy", q.y.toFixed(1));
      });
      if (scaleRef.current) scaleRef.current.style.width = `${Math.round(lengthPx * 0.5)}px`;
    };

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (gone) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      measure();
      const pair = createKoiPair(img, w, h, onFrame);
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
      svg.style.opacity = "1";
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
        measure();
        pair.resize(window.innerWidth, window.innerHeight);
        bar?.redraw();
      };
      window.addEventListener("resize", onResize);
    };
    img.src = "/work/koi.png";
    return () => {
      gone = true;
      placeRingRef.current = () => undefined;
      ctx?.revert();
      bar?.destroy();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, [tvUp]);

  return (
    <section aria-labelledby="k7-title" className="relative h-[620vh]" id="work" ref={sectionRef} style={{ backgroundColor: GROUND, color: INK }}>
      <div className="absolute inset-0">
        <div className="sticky top-0 h-screen w-full overflow-x-clip">
          <canvas
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 block h-full w-full [mask-image:linear-gradient(to_bottom,transparent_13%,black_20%,black_90%,transparent)] lg:[mask-image:linear-gradient(to_bottom,transparent_17%,black_26%,black_92%,transparent)]"
            ref={koiRef}
          />

          {/* Leader lines: from each label to its point on the fish. */}
          <svg aria-hidden="true" className="k7-lines pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700" ref={svgRef}>
            <circle className="k7-ring" fill={GROUND} fillOpacity={0.55} r={9} ref={ringRef} stroke={INK} strokeWidth={1.25} />
            {projects.map((p, i) => (
              <line
                key={p.title}
                pathLength={1}
                ref={(el) => {
                  lineRefs.current[i] = el;
                }}
                stroke={INK}
                strokeWidth={0.75}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {projects.map((p, i) => (
              <circle
                fill={INK}
                key={p.title}
                r={2.4}
                ref={(el) => {
                  dotRefs.current[i] = el;
                }}
              />
            ))}
          </svg>

          {/* The frame. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-[16px] border lg:inset-[2.2vw]" style={{ borderColor: RULE }} />

          {/* Top: plate number, title, species. */}
          <header className="pointer-events-none absolute left-[32px] right-[32px] top-[32px] flex items-start justify-between lg:left-[4.4vw] lg:right-[4.4vw] lg:top-[4.6vh]">
            <div>
              <p className="font-sans text-[clamp(10px,0.7vw,22px)] uppercase tracking-[0.22em] opacity-60">Plate I</p>
              <h2 className="pb-[0.1em] pr-[0.12em] pt-[1vh] text-[clamp(52px,7vw,220px)] leading-[0.9] tracking-[-0.03em]" id="k7-title">
                <Serif text="Work" />
              </h2>
            </div>
            <div className="hidden text-right lg:block">
              <p className="pr-[0.12em] text-[clamp(18px,1.5vw,48px)] leading-tight">
                <Serif text="Cyprinus rubrofuscus" />
              </p>
              <p className="mt-[0.6vh] font-sans text-[clamp(10px,0.7vw,22px)] opacity-60">Koi, seen from above. Five figures.</p>
            </div>
          </header>

          {/* The labels. Wide: a column in the right margin. Phone: one at a
              time, stacked in the same place low on the screen. */}
          <ol className="pointer-events-none absolute bottom-[15vh] left-[32px] right-[32px] grid lg:bottom-auto lg:left-auto lg:right-[6vw] lg:top-[19vh] lg:w-[30vw] lg:gap-[3.6vh]">
            {projects.map((p, i) => (
              <li
                className="k7-label relative col-start-1 row-start-1 border-t pt-[1.2vh] lg:col-auto lg:row-auto"
                key={p.title}
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
                style={{ borderColor: RULE }}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  ref={(el) => {
                    anchorRefs.current[i] = el;
                  }}
                  style={{ backgroundColor: INK }}
                />
                <p className="flex gap-[1.2em] font-sans text-[clamp(10px,0.68vw,22px)] uppercase tracking-[0.18em]">
                  <span className="tabular-nums">Fig. {i + 1}</span>
                  <span className="opacity-55">{PARTS[i]}</span>
                </p>
                <div className="mt-[0.8vh] text-[clamp(30px,2.2vw,84px)] leading-[1.02] tracking-[-0.02em]">
                  <Name p={p} />
                </div>
                <p className="mt-[0.5vh] font-sans text-[clamp(12px,0.82vw,26px)] opacity-60">
                  {yearLine(p)}
                </p>
              </li>
            ))}
          </ol>

          {/* Bottom: scale bar (half a body length, measured) and the count. */}
          <footer className="pointer-events-none absolute bottom-[32px] left-[32px] right-[32px] flex items-end justify-between font-sans text-[clamp(10px,0.68vw,22px)] lg:bottom-[4.6vh] lg:left-[4.4vw] lg:right-[4.4vw]">
            <div>
              <div className="flex h-[5px] w-[120px] border" ref={scaleRef} style={{ borderColor: INK }}>
                <span className="h-full w-1/4" style={{ backgroundColor: INK }} />
                <span className="h-full w-1/4" />
                <span className="h-full w-1/4" style={{ backgroundColor: INK }} />
                <span className="h-full w-1/4" />
              </div>
              <p className="mt-[0.9vh] uppercase tracking-[0.18em] opacity-60">Half a body length</p>
            </div>
            <p className="uppercase tracking-[0.18em] opacity-60">
              <span className="tabular-nums" ref={countRef}>
                Fig. 1 of {N}
              </span>
            </p>
          </footer>
        </div>
      </div>
      <style>{`
        .k7-label { background: ${GROUND}; padding-bottom: 1.2vh; }
        .k7-label { opacity: 0; transition: opacity 600ms ease, transform 600ms ease; transform: translateY(6px); }
        .k7-label[data-on] { opacity: 1; transform: none; }
        .k7-label:not([data-on]) a { pointer-events: none; }
        .k7-lines line { opacity: 0; stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 900ms cubic-bezier(.6,0,.2,1), opacity 400ms; }
        .k7-lines line[data-on] { opacity: 1; stroke-dashoffset: 0; }
        .k7-lines circle { opacity: 0; transition: opacity 400ms; }
        .k7-lines circle[data-on] { opacity: 1; }
        @media (min-width: 1024px) {
          .k7-label { opacity: 0.45; transform: none; background: none; padding-bottom: 0; }
          .k7-label:not([data-on]) a { pointer-events: auto; }
          .k7-lines line:not([data-on]) { opacity: 0.35; stroke-dasharray: 0.004 0.008; stroke-dashoffset: 0; }
          .k7-lines circle { opacity: 0.45; }
        }
        .k7-lines .k7-ring { opacity: 1; }
        @media (prefers-reduced-motion: reduce) {
          .k7-label, .k7-lines line, .k7-lines circle { transition: none; }
        }
      `}</style>
    </section>
  );
}
