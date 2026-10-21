"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { createKoiPair, type KoiPair } from "@/components/koiwork/k10/koi";
import { type Band, type Clearing, drawSeigaiha } from "@/components/koiwork/k10/seigaiha";
import { ACCENT, BLOSSOM, GROUND, INK, RULE, Serif } from "@/components/luke/theme";
import { hostOf, kindOf, resultOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import { useTvUp } from "@/components/tvUp";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k10, "Seigaiha". The page scrolls straight through it.
 *
 * Each project is a tall band: its name large in the italic serif at the
 * left edge, its facts small in the sans under a hairline. Behind each band
 * is a field of seigaiha (seigaiha.ts), the Japanese wave of overlapping
 * ring fans, in pink hairlines. It comes in scale by scale in a sweep from
 * the left as the band rises up the screen, and runs backwards on the way
 * up.
 *
 * The two koi (koi.ts, a copy of the home page's with their positions
 * exposed) swim down over it in the site's pink bars, moved only by the
 * scroll, and the pattern opens in a soft clearing round each fish, so they
 * part the water.
 *
 * Layers, back to front: the seigaiha canvas, the koi canvas, the type.
 * Both canvases are screen-sized and stay put while the section goes by.
 *
 * Reduced motion: every band is fully drawn; the koi and their clearings
 * still go with the scroll, since that is the scroll itself.
 */

/** Characters the display serif cannot draw: set in the sans, small, on
 *  the baseline, so a name like "S‑KBD67" reads as one word. */
const NOT_SERIF = /([0-9'"&@\-\u2010\u2011!()/;]+)/;

function Title({ text }: { text: string }): JSX.Element {
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
    "block w-fit pb-[0.1em] pr-[0.12em] text-[clamp(40px,11vw,72px)] leading-[1.02] tracking-[-0.03em] lg:text-[clamp(56px,6.4vw,240px)]";
  if (!p.href) return <span className={cls}>{children}</span>;
  return (
    <a
      className={`${cls} rounded-sm transition-colors duration-300 hover:text-[color:var(--rose)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8`}
      href={p.href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

/** One fact. On a phone a full-width row, label left and value right of
 *  it, ruled underneath; on a wide screen a column of the 12-column grid. */
function Fact({ label, at, children }: { label: string; at: string; children: ReactNode }): JSX.Element {
  return (
    <div className={`grid min-w-0 grid-cols-[34%_1fr] items-baseline border-b py-[14px] lg:block lg:border-0 lg:py-0 ${at}`} style={{ borderColor: RULE }}>
      <dt className="font-sans text-[clamp(10px,0.62vw,20px)] uppercase tracking-[0.14em] opacity-45">{label}</dt>
      <dd className="font-sans text-[clamp(13px,0.86vw,28px)] leading-[1.4] lg:mt-[max(0.8rem,6px)]">{children}</dd>
    </div>
  );
}

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);
  const bandRefs = useRef<(HTMLLIElement | null)[]>([]);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  const titleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pairRef = useRef<KoiPair | null>(null);

  const tvUp = useTvUp();

  // The koi, as on the home page: two fish through the bar shader, moved
  // only by the scroll.
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
      pairRef.current = pair;
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
      pairRef.current = null;
      ctx?.revert();
      bar?.destroy();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, [tvUp]);

  // The seigaiha. Redrawn on a frame only when the scroll or a fish has
  // moved, and only while the section is on screen.
  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = waveRef.current;
    const section = sectionRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !section || !ctx) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let seen = false;
    let last = "";
    const size = (): void => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      last = "";
    };
    const frame = (): void => {
      raf = seen ? requestAnimationFrame(frame) : 0;
      // The canvas is sticky: its box is the screen while the section
      // covers it, and slides with the section at either end.
      const off = canvas.getBoundingClientRect().top;
      const bodies = pairRef.current?.bodies() ?? [];
      const clear: Clearing[] = bodies.map((b) => ({ x: b.x * w, y: b.y * h, r: Math.max(90, b.len * w * 0.62) }));
      const bands: Band[] = [];
      const holes: { l: number; t: number; r: number; b: number }[] = [];
      bandRefs.current.forEach((el, i) => {
        const t = textRefs.current[i];
        const n = titleRefs.current[i];
        if (!el || !t || !n) return;
        const r = el.getBoundingClientRect();
        const q = t.getBoundingClientRect();
        const m = n.getBoundingClientRect();
        if (m.bottom > -h * 0.2 && m.top < h * 1.2) holes.push({ l: m.left / w, t: m.top / h, r: m.right / w, b: m.bottom / h });
        // Drawn over 40vh of scroll, finished as the name's top passes 55%
        // of the screen, before it reaches the middle.
        const reveal = reduced ? 1 : Math.max(0, Math.min(1, (h * 0.95 - m.top) / (h * 0.4)));
        bands.push({
          top: r.top - off,
          height: r.height,
          fade: h * 0.15,
          text: { left: q.left, top: q.top - off, right: q.right, bottom: q.bottom - off },
          reveal,
        });
      });
      pairRef.current?.setHoles(holes);
      const key = `${off.toFixed(1)}|${bands.map((b) => b.top.toFixed(1)).join(",")}|${clear.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(";")}`;
      if (key === last) return;
      last = key;
      drawSeigaiha(ctx, w, h, dpr, bands, clear);
    };
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      if (seen && !raf) raf = requestAnimationFrame(frame);
    });
    size();
    io.observe(section);
    window.addEventListener("resize", size);
    return () => {
      seen = false;
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, [tvUp]);

  return (
    <section
      aria-labelledby="work-title"
      className="relative"
      id="work"
      ref={sectionRef}
      style={{ color: INK, background: GROUND, ["--rose" as string]: ACCENT }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas className="sticky top-0 block h-screen w-full" ref={waveRef} />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="sticky top-0 block h-screen w-full [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
          ref={koiRef}
        />
      </div>

      <div className="relative px-4 pb-[12vh] pt-[16vh] sm:px-[8vw]">
        <header className="flex items-start gap-[max(2rem,14px)]">
          <h2 className="pb-[0.1em] pr-[0.12em] text-[clamp(64px,17vw,120px)] leading-[0.95] tracking-[-0.03em] lg:text-[min(22vh,9vw)]" id="work-title">
            <Serif text="Work" />
          </h2>
          <span className="mt-[calc(clamp(64px,17vw,120px)*0.2)] font-sans text-[clamp(11px,0.7vw,22px)] tabular-nums opacity-45 lg:mt-[calc(min(22vh,9vw)*0.2)]">
            ({String(projects.length).padStart(2, "0")})
          </span>
        </header>

        <ol className="mt-[12vh]">
          {projects.map((p, i) => {
            const result = resultOf(p);
            return (
              <li
                className="relative pb-[16vh] pt-[18vh]"
                key={p.title}
                ref={(el) => {
                  bandRefs.current[i] = el;
                }}
              >
                <div
                  className="w-full"
                  ref={(el) => {
                    textRefs.current[i] = el;
                  }}
                >
                  <p className="mb-[max(2rem,14px)] font-sans text-[clamp(11px,0.7vw,22px)] tabular-nums opacity-45">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <div
                    className="w-fit max-w-full"
                    ref={(el) => {
                      titleRefs.current[i] = el;
                    }}
                  >
                    <NameLink p={p}>
                      <Title text={p.title} />
                    </NameLink>
                  </div>
                  <p className="mt-[max(1.6rem,12px)] max-w-[34em] font-sans text-[clamp(14px,1vw,32px)] leading-[1.45] opacity-80">{p.tagline}</p>
                  <dl
                    className="relative mt-[max(4rem,28px)] border-t lg:grid lg:w-[84vw] lg:grid-cols-12 lg:gap-x-[max(3rem,20px)] lg:border-0 lg:pt-[max(2.4rem,16px)]"
                    style={{ borderColor: RULE }}
                  >
                    {/* The hairline over columns 1 to 10, the same on every project. */}
                    <span aria-hidden="true" className="absolute left-0 top-0 hidden h-px w-[calc((84vw-11*max(3rem,20px))/12*10+9*max(3rem,20px))] lg:block" style={{ background: RULE }} />
                    <Fact at="lg:col-span-2 lg:col-start-1" label="Year">
                      {p.year}
                    </Fact>
                    <Fact at="lg:col-span-3 lg:col-start-3" label="What">
                      {kindOf(p)}
                    </Fact>
                    {result ? (
                      <Fact at="lg:col-span-3 lg:col-start-6" label="Result">
                        <span aria-hidden="true" className="mr-[0.6em] inline-block size-[5px] translate-y-[-0.2em] rounded-full" style={{ background: ACCENT }} />
                        {result}
                      </Fact>
                    ) : null}
                    {p.href ? (
                      <Fact at="lg:col-span-2 lg:col-start-9" label="Link">
                        <a className="underline decoration-[0.5px] underline-offset-4 hover:opacity-70" href={p.href} rel="noopener noreferrer" target="_blank">
                          {hostOf(p.href)}
                        </a>
                      </Fact>
                    ) : null}
                  </dl>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
