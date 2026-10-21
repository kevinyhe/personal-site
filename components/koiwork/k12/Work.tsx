"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { createKoiPair } from "@/components/luke/koi";
import { BLOSSOM, DIM, GROUND, INK, RULE, Serif } from "@/components/luke/theme";
import { hostOf, kindOf, resultOf, whenOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import { useTvUp } from "@/components/tvUp";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k12, "numerals".
 *
 * Each project gets a screen of its own on a 12-column grid. Behind it,
 * its index number (01 to 05), half a screen tall in the sans, drawn as a
 * hairline outline only. The project name, in the italic serif, sits over
 * the lower part of the number.
 *
 * The koi swim down the whole section in the bar shader, as on the home
 * page. A second canvas on top fills the numbers in solid pink only where
 * a fish is over one: each frame it draws the numbers where they are on
 * screen, keeps the fish's brightness inside them and nothing outside.
 * So a fish passing through a "03" turns that part of the 3 solid.
 *
 * Both canvases are one screen tall and stay put while the section goes
 * by. Everything moves only with the scroll.
 */

/** The numerals' outline: INK at 28%. */
const NUM_STROKE = "rgba(249, 185, 220, 0.28)";

/** Characters the display serif draws a watermark for, and every dash. */
const NOT_SERIF = /([0-9'"&@\-\u2010-\u2015!()/;]+)/;

/** A name in the italic serif, with digits and dashes set in the sans at
 *  0.62em on the baseline, as /k/10 does. */
function Name({ text }: { text: string }): JSX.Element {
  return (
    <span className="font-serif-display italic">
      {text.split(NOT_SERIF).map((run, i) =>
        i % 2 === 1 ? (
          <span className="pl-[0.04em] font-sans text-[0.62em] not-italic tracking-[-0.01em]" key={i}>
            {run}
          </span>
        ) : (
          run
        ),
      )}
    </span>
  );
}

function NameLink({ p, children }: { p: Project; children: ReactNode }): JSX.Element {
  const cls =
    "block w-fit rounded-sm pb-[0.1em] pr-[0.12em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8";
  if (!p.href) return <span className={cls}>{children}</span>;
  return (
    <a className={cls} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const fillRef = useRef<HTMLCanvasElement | null>(null);
  const numRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Each row's name and facts come in together over the first quarter of
  // the row's way up the screen. The numerals do not move.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const rows = rowRefs.current;
    const ctx = gsap.context(() => {
      for (const row of rows) {
        if (!row) continue;
        gsap.fromTo(
          row.querySelectorAll("[data-reveal]"),
          { opacity: 0, y: "2vh" },
          { opacity: 1, y: 0, ease: "none", scrollTrigger: { trigger: row, start: "top bottom", end: "top 75%", scrub: true } },
        );
      }
    });
    return () => ctx.revert();
  }, []);

  const tvUp = useTvUp();
  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = koiRef.current;
    const fill = fillRef.current;
    const section = sectionRef.current;
    if (!canvas || !fill || !section) return undefined;
    const nums = numRefs.current;
    const fctx = fill.getContext("2d");
    if (!fctx) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gone = false;
    let bar: BarCanvas | null = null;
    let ctx: gsap.Context | null = null;
    let onResize: (() => void) | null = null;
    let raf = 0;
    let visible = false;
    let io: IntersectionObserver | null = null;
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

      // The fill layer, at most 1.5x the CSS pixels: it is redrawn each
      // frame the section is on screen.
      let scale = 1;
      const size = (): void => {
        scale = Math.min(1.5, window.devicePixelRatio || 1);
        fill.width = Math.round(window.innerWidth * scale);
        fill.height = Math.round(window.innerHeight * scale);
      };
      size();

      const drawNumbers = (stroke = false): void => {
        const sh = window.innerHeight;
        for (const el of numRefs.current) {
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > sh) continue;
          const cs = getComputedStyle(el);
          fctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          fctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
          const m = fctx.measureText(el.textContent ?? "");
          // CSS puts the half-leading above and below the font's box.
          const base = r.top + (r.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
          if (stroke) fctx.strokeText(el.textContent ?? "", r.left, base);
          else fctx.fillText(el.textContent ?? "", r.left, base);
        }
      };

      const paint = (): void => {
        raf = visible ? requestAnimationFrame(paint) : 0;
        const fw = fill.width;
        const fh = fill.height;
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.globalCompositeOperation = "source-over";
        fctx.clearRect(0, 0, fw, fh);
        fctx.setTransform(scale, 0, 0, scale, 0, 0);
        fctx.textBaseline = "alphabetic";
        fctx.fillStyle = BLOSSOM;
        drawNumbers();
        // Keep the numbers only where a fish is. The koi canvas is black
        // away from the fish; the filter turns its brightness into alpha.
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.globalCompositeOperation = "destination-in";
        fctx.filter = "url(#k12-luma)";
        fctx.drawImage(pair.source.canvas, 0, 0, fw, fh);
        fctx.filter = "none";
        fctx.setTransform(scale, 0, 0, scale, 0, 0);
        // The outline on top, from the same text, so fill and line agree.
        fctx.globalCompositeOperation = "source-over";
        fctx.strokeStyle = NUM_STROKE;
        fctx.lineWidth = 1;
        drawNumbers(true);
      };
      // The canvas draws the outlines now; the page's own ones step aside.
      for (const el of numRefs.current) if (el) el.style.webkitTextStroke = "0px transparent";

      io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(paint);
      });
      io.observe(section);

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
        size();
        bar?.redraw();
      };
      window.addEventListener("resize", onResize);
    };
    img.src = "/work/koi.png";
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      visible = false;
      io?.disconnect();
      for (const el of nums) if (el) el.style.webkitTextStroke = "";
      ctx?.revert();
      bar?.destroy();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, [tvUp]);

  const count = String(projects.length).padStart(2, "0");

  return (
    <section aria-labelledby="k12-title" className="relative" id="work" ref={sectionRef} style={{ color: INK, background: GROUND }}>
      {/* The koi in bars, and on top the solid fill where a fish is over a
          number. One screen tall, held while the section goes by. */}
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <filter colorInterpolationFilters="sRGB" id="k12-luma">
          <feColorMatrix type="luminanceToAlpha" />
          {/* Brighter part of a fish, firmer fill; the dim wake drops out. */}
          <feComponentTransfer>
            <feFuncA intercept="-0.35" slope="2.6" type="linear" />
          </feComponentTransfer>
        </filter>
      </svg>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="sticky top-0 h-screen w-full [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]">
          <canvas className="absolute inset-0 block h-full w-full" ref={koiRef} />
          <canvas className="absolute inset-0 block h-full w-full" ref={fillRef} />
        </div>
      </div>

      <div className="relative px-4 pb-[24vh] pt-[16vh] sm:px-[5vw]">
        {/* Header: the word, the count, one hairline. */}
        <header className="grid grid-cols-12 items-end gap-x-[1.6vw] pb-[2.4vh]" style={{ borderBottom: `1px solid ${RULE}` }}>
          <h2
            className="col-span-8 pb-[0.1em] pr-[0.12em] text-[clamp(56px,15vw,110px)] leading-[0.9] tracking-[-0.03em] lg:col-span-6 lg:text-[min(18vh,8vw)]"
            id="k12-title"
          >
            <Serif text="Work" />
          </h2>
          <p className="col-span-4 pb-[0.8em] text-right font-sans text-[clamp(11px,0.75vw,24px)] tabular-nums lg:col-span-3 lg:col-start-10" style={{ color: DIM }}>
            Selected projects, {count}
          </p>
        </header>

        <ol>
          {projects.map((p, i) => {
            const n = String(i + 1).padStart(2, "0");
            const right = i % 2 === 1;
            return (
              <li
                className="relative grid grid-cols-12 content-center gap-x-[1.6vw] py-[8vh] [--nm:clamp(32px,9vw,64px)] lg:min-h-[64vh] lg:py-[6vh] lg:[--nm:min(10vh,5.4vw)]"
                key={p.title}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                style={{ borderTop: i > 0 ? `1px solid ${RULE}` : undefined }}
              >
                {/* The numeral, outline only, with the name over its
                    foot. The fill canvas paints the number solid where a
                    fish swims over it. */}
                <div className={`relative col-span-12 lg:col-span-8 lg:row-start-1 lg:w-fit ${right ? "lg:col-start-5 lg:justify-self-end" : "lg:col-start-1"}`}>
                  <span
                    aria-hidden="true"
                    className="block select-none whitespace-nowrap font-sans text-[min(46vh,60vw)] font-[500] leading-[0.8] tracking-[-0.055em] tabular-nums"
                    ref={(el) => {
                      numRefs.current[i] = el;
                    }}
                    style={{ color: "transparent", WebkitTextStroke: `1px ${NUM_STROKE}` }}
                  >
                    {n}
                  </span>
                  <div
                    className={`relative -mt-[0.62em] max-w-[88vw] pl-[6%] text-[length:var(--nm)] leading-[1] tracking-[-0.03em] lg:absolute lg:bottom-[-0.32em] lg:mt-0 lg:max-w-none lg:whitespace-nowrap lg:pl-0 ${
                      right ? "lg:right-[22%] lg:text-right" : "lg:left-[22%]"
                    }`}
                    data-reveal=""
                  >
                    <NameLink p={p}>
                      <Name text={p.title} />
                    </NameLink>
                  </div>
                </div>

                {/* The facts, in the numeral's row, their last line on the
                    name's baseline (the name hangs 0.32em below the row). */}
                <dl
                  className={`relative col-span-12 mt-[4vh] grid grid-cols-[auto_1fr] gap-x-[1.4em] gap-y-[0.5em] font-sans text-[clamp(12px,0.8vw,26px)] leading-[1.4] sm:col-span-8 lg:col-span-3 lg:row-start-1 lg:mb-[calc(var(--nm)*-0.12)] lg:mt-0 lg:self-end ${
                    right ? "lg:col-start-1" : "lg:col-start-10"
                  }`}
                  data-reveal=""
                >
                  <dt style={{ color: DIM }}>No.</dt>
                  <dd className="tabular-nums">{n}</dd>
                  <dt style={{ color: DIM }}>What</dt>
                  <dd>{kindOf(p)}</dd>
                  {resultOf(p) ? (
                    <>
                      <dt style={{ color: DIM }}>Result</dt>
                      <dd>{resultOf(p)}</dd>
                    </>
                  ) : null}
                  <dt style={{ color: DIM }}>When</dt>
                  <dd className="tabular-nums">{whenOf(p)}</dd>
                  {p.href ? (
                    <>
                      <dt style={{ color: DIM }}>Link</dt>
                      <dd>
                        <a className="underline decoration-[1px] underline-offset-[0.25em]" href={p.href} rel="noopener noreferrer" target="_blank">
                          {hostOf(p.href)}
                        </a>
                      </dd>
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
