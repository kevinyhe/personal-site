"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useMemo, useRef } from "react";

import { brushStroke, ensoSpine, lineSpine } from "@/components/koiwork/k4/brush";
import { createKoiPair } from "@/components/luke/koi";
import { BLOSSOM, DIM, GROUND, INK, RULE } from "@/components/luke/theme";
import { kindOf, resultOf, whenOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { useTvUp } from "@/components/tvUp";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work, design k4: sumi-e.
 *
 * Each project gets one brush stroke in pink ink, drawn from a bundle of
 * bristles that run dry at the tail (brush.ts). The stroke paints itself
 * in, start to tail, as its project comes up the screen. The first
 * project sits inside an ensō, the open circle; the others each sit on
 * one pulled horizontal stroke.
 *
 * Beside each name a narrow column of small sans runs top to bottom, like
 * the caption on a hanging scroll: number, date, what it is. On phones it
 * lies flat above the name.
 *
 * The koi swim behind it all through the site's pink bars, on a canvas
 * that stays put while the section goes by. They move only with the
 * scroll.
 *
 * Reduced motion: every stroke is drawn from the start.
 */

function Name({ p, className, children }: { p: Project; className: string; children: ReactNode }): JSX.Element {
  if (!p.href) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

// The display serif has no digits or hyphens; those go in the sans,
// smaller, on the same baseline.
const NOT_SERIF = /([0-9'"&@\-\u2010\u2011!()/;]+)/;

function Display({ text }: { text: string }): JSX.Element {
  return (
    <span className="font-serif-display italic">
      {text.split(NOT_SERIF).map((run, i) =>
        i % 2 === 1 ? (
          <span className="pl-[0.04em] pr-[0.06em] align-baseline font-sans text-[0.62em] not-italic tracking-[-0.01em]" key={i}>
            {run}
          </span>
        ) : (
          run
        ),
      )}
    </span>
  );
}

/** A soft pool of ground colour under text, so the koi never swim across it. */
function Pool(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -inset-x-[6vw] -inset-y-[7vh] -z-10"
      style={{ background: `radial-gradient(closest-side, ${GROUND} 74%, transparent)` }}
    />
  );
}

/** One stroke, masked by its own centre line so it can be painted in. */
function Ink({ kind, seed, id, className }: { kind: "enso" | "line"; seed: number; id: string; className: string }): JSX.Element {
  const enso = kind === "enso";
  const s = useMemo(() => brushStroke(enso ? ensoSpine(seed) : lineSpine(seed), enso ? 92 : 46, seed), [enso, seed]);
  return (
    <svg aria-hidden="true" className={className} data-ink="" viewBox={enso ? "0 0 1000 1000" : "0 0 1000 160"}>
      <defs>
        <mask height={enso ? 1000 : 160} id={id} maskUnits="userSpaceOnUse" width={1000} x={0} y={0}>
          <path
            d={s.spine}
            data-brush=""
            fill="none"
            stroke="#fff"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={s.maxWidth * 1.3}
          />
        </mask>
      </defs>
      <g fill={BLOSSOM} fillOpacity={0.62} mask={`url(#${id})`}>
        {s.bristles.map((d, i) => (
          <path d={d} key={i} />
        ))}
      </g>
    </svg>
  );
}

/** The scroll caption: small sans, top to bottom on a wide screen. */
function Caption({ i, p }: { i: number; p: Project }): JSX.Element {
  return (
    <div className="flex flex-row flex-wrap items-center gap-x-[14px] gap-y-1 font-sans text-[clamp(11px,0.72vw,22px)] uppercase tracking-[0.18em] lg:flex-col lg:items-start lg:gap-y-[1.6vh] lg:[writing-mode:vertical-rl]">
      <span className="tabular-nums" style={{ color: INK }}>
        {String(i + 1).padStart(2, "0")}
      </span>
      <span aria-hidden="true" className="h-px w-[18px] lg:h-[4vh] lg:w-px" style={{ background: RULE }} />
      <span className="tabular-nums" style={{ color: DIM }}>
        {whenOf(p)}
      </span>
      <span style={{ color: DIM }}>{kindOf(p)}</span>
    </div>
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const [lead, ...rest] = projects;

  // The koi, as on the home page's work index.
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

  // Each stroke paints in as its project rises from the bottom of the
  // screen to a little above the middle. The text settles in with it.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      section.querySelectorAll<HTMLElement>("[data-work]").forEach((row) => {
        const reveal = row.querySelector<SVGPathElement>("[data-brush]");
        const text = row.querySelectorAll<HTMLElement>("[data-settle]");
        if (!reveal || reduced || location.search.includes("still")) return;
        const len = Math.ceil(reveal.getTotalLength()) + 2;
        gsap.set(reveal, { strokeDasharray: `${len} ${len}`, strokeDashoffset: len });
        gsap.to(reveal, {
          strokeDashoffset: 0,
          ease: "power2.inOut",
          scrollTrigger: { trigger: row, start: "top 88%", end: "center 45%", scrub: 0.6 },
        });
        gsap.from(text, {
          opacity: 0,
          y: 24,
          filter: "blur(6px)",
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: { trigger: row, start: "top 85%", end: "top 50%", scrub: 0.6 },
        });
      });
    }, section);
    return () => ctx.revert();
  }, []);

  return (
    <section aria-labelledby="k4-work" className="relative overflow-x-clip" ref={sectionRef} style={{ color: INK }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="sticky top-0 block h-screen w-full opacity-[0.7] [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
          ref={koiRef}
        />
      </div>

      <div className="relative px-4 pb-[24vh] pt-[16vh] sm:px-[8vw]">
        {/* Header: the word, and a hairline that runs to the right edge. */}
        <header className="flex items-end gap-[3vw]">
          <h2 className="pb-[0.1em] pl-[0.06em] pr-[0.12em] text-[clamp(64px,17vw,120px)] leading-[0.9] tracking-[-0.03em] lg:text-[min(20vh,9vw)]" id="k4-work">
            <Display text="Work" />
          </h2>
          <div className="mb-[2.2vh] hidden h-px flex-1 lg:block" style={{ background: RULE }} />
          <p className="mb-[1.6vh] hidden font-sans text-[clamp(11px,0.72vw,22px)] uppercase tracking-[0.18em] lg:block" style={{ color: DIM }}>
            Five projects, 2021 to 2026
          </p>
        </header>

        {/* The first project: the name, and beside it an ensō that holds what it did. */}
        <article className="relative mt-[12vh] grid grid-cols-1 items-center lg:mt-[10vh] lg:grid-cols-[auto_auto_1fr] lg:gap-x-[2.4vw]" data-work="">
          <div className="relative z-10 mb-6 self-start lg:mb-0 lg:pt-[2vh]" data-settle="">
            <Caption i={0} p={lead} />
          </div>
          <div className="relative isolate w-fit">
            <Pool />
            <Name
              className="block w-fit rounded-sm pb-[0.1em] pr-[0.12em] text-[clamp(40px,11vw,72px)] leading-[0.98] tracking-[-0.03em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 lg:text-[clamp(48px,6vw,220px)]"
              p={lead}
            >
              <span className="block" data-settle="">
                <Display text="The Actually" />
              </span>
              <span className="block pl-[1.2em]" data-settle="">
                <Display text="Company" />
              </span>
            </Name>
          </div>
          <div className="relative isolate mt-[6vh] w-[78vw] max-w-[420px] justify-self-center lg:mt-0 lg:w-[min(30vw,62vh)] lg:max-w-none">
            <Pool />
            <Ink className="pointer-events-none block w-full" id="k4-ink-0" kind="enso" seed={7} />
            <div className="absolute inset-[22%] flex flex-col justify-center" data-settle="">
              <p className="font-sans text-[clamp(14px,1.05vw,32px)] leading-[1.45]">{resultOf(lead)}</p>
              <p className="mt-2 font-sans text-[clamp(12px,0.85vw,28px)] leading-[1.5]" style={{ color: DIM }}>
                {lead.tagline}
              </p>
            </div>
          </div>
        </article>

        {/* The rest, each on one stroke, alternating sides. */}
        <div className="mt-[18vh] flex flex-col gap-[20vh] lg:mt-[22vh]">
          {rest.map((p, j) => {
            const right = j % 2 === 0;
            return (
              <article
                className={`relative grid grid-cols-1 lg:w-[48vw] lg:grid-cols-[auto_1fr] lg:gap-x-[2.4vw] ${right ? "lg:ml-[36vw]" : "lg:ml-[4vw]"}`}
                data-work=""
                key={p.title}
              >
                <div className="relative z-10 mb-5 lg:mb-0 lg:pt-[1vh]" data-settle="">
                  <Caption i={j + 1} p={p} />
                </div>
                <div className="relative isolate">
                  <Pool />
                  <div className="relative">
                    <Name
                      className="relative block w-fit rounded-sm pb-[0.1em] pr-[0.12em] text-[clamp(38px,10.5vw,64px)] leading-[1.05] tracking-[-0.03em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 lg:text-[clamp(44px,4.8vw,170px)]"
                      p={p}
                    >
                      <span className="block" data-settle="">
                        <Display text={p.title} />
                      </span>
                    </Name>
                  </div>
                  <Ink className="pointer-events-none -ml-[3%] -mt-[0.4em] block lg:-mt-[1.2vh] w-[100%] lg:-ml-[2vw] lg:w-[40vw]" id={`k4-ink-${j + 1}`} kind="line" seed={31 + j * 17} />
                  <div className="mt-[clamp(8px,1.4vh,32px)] w-full max-w-[34ch] lg:max-w-[24vw] lg:w-[24vw]" data-settle="">
                    <p className="font-sans text-[clamp(14px,1.05vw,32px)] leading-[1.45]">{resultOf(p) ?? p.year}</p>
                    <p className="mt-2 font-sans text-[clamp(13px,0.9vw,28px)] leading-[1.5]" style={{ color: DIM }}>
                      {p.tagline}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
