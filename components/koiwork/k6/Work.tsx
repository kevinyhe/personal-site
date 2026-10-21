"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { ACCENT, BLOSSOM, GROUND, INK, RULE } from "@/components/luke/theme";
import { kindOf, resultOf, whenOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import { useTvUp } from "@/components/tvUp";

import { createKoiPair } from "./koi";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k6, "Seals". An editorial index: one project per row on a
 * twelve-column grid, divided by hairlines. Each row carries a hanko, a
 * square seal drawn in fine pink lines: a double frame, split down the
 * middle, the project's initials on the right and its year read top to
 * bottom on the left, as a seal reads. The seal sits in its own column,
 * never over a name. Its lines draw in with the scroll as the row comes up.
 * Rose appears once: the small filled square in the header.
 *
 * The koi swim behind in the site's pink bars and move only with the scroll.
 * The type blocks sit on solid ground, so the fish pass under them.
 */

const SMALL = "font-sans text-[clamp(10px,0.62vw,20px)] uppercase tracking-[0.2em]";

/** Characters the display serif cannot draw; set in the sans instead. */
const NOT_SERIF = /([0-9'"&@\-\u2010\u2011!()/;]+)/;

/** The display serif, with digits and hyphens in the sans at 0.62em on the
 *  baseline, so "S-KBD67" reads as one name. */
function Serif({ text }: { text: string }): JSX.Element {
  return (
    <span className="font-serif-display italic">
      {text.split(NOT_SERIF).map((run, i) =>
        i % 2 === 1 ? (
          <span className="pl-[0.04em] align-baseline font-sans text-[0.62em] not-italic tracking-[0.02em]" key={i}>
            {run}
          </span>
        ) : (
          run
        ),
      )}
    </span>
  );
}

function Name({ p, children }: { p: Project; children: ReactNode }): JSX.Element {
  const cls =
    "block w-fit pb-[0.1em] pr-[0.12em] text-[clamp(40px,11vw,64px)] leading-[1.02] tracking-[-0.03em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8 lg:text-[clamp(56px,4.4vw,170px)]";
  if (!p.href) return <span className={cls}>{children}</span>;
  return (
    <a className={cls} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

/** "TAC" for The Actually Company, "KR" for King of the Ring, "M" for mclib. */
function initialsOf(title: string): string {
  const caps = title.split(/\s+/).map((w) => w[0]).filter((c) => c && c === c.toUpperCase() && /[A-Z]/.test(c));
  return (caps.length ? caps.join("") : title[0].toUpperCase()).slice(0, 3);
}

/** The hanko: hairline double frame, a centre rule, initials and year. */
function Seal({ p }: { p: Project }): JSX.Element {
  const ini = initialsOf(p.title);
  const year = (p.year.match(/\d{4}/g) ?? [p.year]).pop() ?? "";
  const line = { pathLength: 1, className: "k6-line" };
  return (
    <svg aria-hidden="true" className="k6-seal block aspect-square w-[clamp(84px,8.4vw,300px)]" fill="none" stroke={INK} strokeWidth="0.7" viewBox="0 0 100 100">
      <rect height="98" width="98" x="1" y="1" {...line} />
      <rect height="86" strokeOpacity="0.6" width="86" x="7" y="7" {...line} />
      <path d="M50 14V86" strokeOpacity="0.6" {...line} />
      <g className="k6-glyphs" fill={INK} fontFamily="var(--font-sans, sans-serif)" stroke="none" textAnchor="middle">
        {ini.split("").map((c, k) => (
          <text fontSize={ini.length > 2 ? 15 : 18} fontWeight="300" key={k} x="71.5" y={50 + (k - (ini.length - 1) / 2) * (ini.length > 2 ? 21 : 26) + 7}>
            {c}
          </text>
        ))}
        {year.split("").map((c, k) => (
          <text fillOpacity="0.75" fontSize="12.5" key={k} x="28.5" y={50 + (k - 1.5) * 15 + 4}>
            {c}
          </text>
        ))}
      </g>
    </svg>
  );
}

function Row({ p, i }: { p: Project; i: number }): JSX.Element {
  const facts: [string, string | undefined][] = [
    ["When", whenOf(p)],
    ["What", kindOf(p)],
    ["Result", resultOf(p)],
    ["Built with", p.stack.slice(0, 3).join(", ")],
  ];
  return (
    <li className="k6-row grid grid-cols-[auto_1fr] gap-x-[20px] gap-y-[28px] border-t py-[clamp(40px,9vh,200px)] lg:grid-cols-12 lg:gap-x-[2vw]" style={{ borderColor: RULE }}>
      <div className="-m-[12px] flex w-fit flex-col gap-[14px] self-start p-[12px] lg:col-span-2 lg:justify-self-end" style={{ backgroundColor: GROUND }}>
        <Seal p={p} />
        <span className={`${SMALL} tabular-nums opacity-55`}>No. {String(i + 1).padStart(2, "0")}</span>
      </div>
      <div className="col-span-2 -m-[12px] min-w-0 justify-self-start p-[12px] lg:col-span-6 lg:row-start-auto" style={{ backgroundColor: GROUND }}>
        <Name p={p}>
          <Serif text={p.title} />
        </Name>
        <p className="mt-[clamp(14px,1.8vh,44px)] max-w-[38ch] font-sans text-[clamp(14px,0.92vw,30px)] leading-[1.55] opacity-75">{p.tagline}</p>
      </div>
      <dl style={{ backgroundColor: GROUND }} className="col-span-2 -m-[12px] p-[12px] justify-self-start grid grid-cols-[auto_1fr] gap-x-[1.6em] gap-y-[0.9em] self-start lg:col-span-4 lg:pt-[0.6vw]">
        {facts
          .filter((f): f is [string, string] => Boolean(f[1]))
          .map(([k, v]) => (
            <div className="contents" key={k}>
              <dt className={`${SMALL} pt-[0.25em] opacity-45`}>{k}</dt>
              <dd className="font-sans text-[clamp(13px,0.8vw,26px)] leading-[1.45] opacity-85">{v}</dd>
            </div>
          ))}
      </dl>
    </li>
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);

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

  // Each seal's lines draw in once as its row comes up, then the glyphs
  // follow. Played, not scrubbed, so a seal is never left half drawn.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ctx = gsap.context(() => {
      for (const row of gsap.utils.toArray<HTMLElement>(".k6-row", section)) {
        const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 85%", once: true } });
        tl.fromTo(row.querySelectorAll(".k6-line"), { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "power2.inOut", stagger: 0.12, duration: 0.9, clearProps: "strokeDasharray,strokeDashoffset" });
        tl.fromTo(row.querySelectorAll(".k6-glyphs"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, ">-0.2");
      }
    }, section);
    return () => ctx.revert();
  }, []);

  return (
    <section aria-labelledby="k6-title" className="relative" id="work" ref={sectionRef} style={{ color: INK }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="sticky top-0 block h-screen w-full [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
          ref={koiRef}
        />
      </div>

      <div className="relative px-[20px] pb-[24vh] pt-[16vh] sm:px-[6vw]">
        <header className="grid grid-cols-1 gap-y-[24px] pb-[8vh] lg:grid-cols-12 lg:gap-x-[2vw]">
          <h2 className="pb-[0.1em] pr-[0.12em] text-[clamp(72px,20vw,120px)] leading-[0.95] tracking-[-0.03em] lg:col-span-8 lg:text-[min(20vh,9vw)]" id="k6-title">
            <Serif text="Work" />
          </h2>
          <div className="flex items-start gap-[14px] self-end lg:col-span-4">
            <span aria-hidden="true" className="mt-[0.35em] block h-[8px] w-[8px] shrink-0" style={{ backgroundColor: ACCENT }} />
            <p className="max-w-[34ch] font-sans text-[clamp(13px,0.8vw,26px)] leading-[1.55] opacity-70">
              Selected projects, {projects.length} in all. Each is sealed with its initials and the year it was made.
            </p>
          </div>
        </header>

        <ol className="border-b" style={{ borderColor: RULE }}>
          {projects.map((p, i) => (
            <Row i={i} key={p.title} p={p} />
          ))}
        </ol>
      </div>
    </section>
  );
}
