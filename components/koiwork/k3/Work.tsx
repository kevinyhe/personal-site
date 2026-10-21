"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, useEffect, useRef } from "react";

import { ACCENT, BLOSSOM, GROUND, INK, Serif } from "@/components/luke/theme";
import { resultOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { useTvUp } from "@/components/tvUp";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

import { createKoiPair, type KoiPair } from "./koi";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k3: the path.
 *
 * The koi's swimming path is the layout. Each project name sits just right
 * of a point on the path, so the two fish swim past the projects one by
 * one as the page scrolls. When the lead fish reaches a name, the name
 * sharpens to full pink and its result shows; the others stay dim. A very
 * faint hairline traces the path already swum.
 *
 * Nothing is held: the section is tall and its stage (the fish, the
 * hairline and the names) is a sticky screen inside it. The fish move only
 * with the scroll (koi.ts). The names are placed every frame at
 * pair.pointAt(), so they ride up with the water.
 *
 * Before the fish load (or with no WebGL), the names fall back to a plain
 * column down the stage that scrolls by the same progress.
 *
 * Reduced motion: no blur or slide, every result shown; the fish still go
 * with the scroll, since that is the scroll itself.
 */

/** Where along the path (0..1 of the lead's swim) each name sits. */
const FIRST = 0.13;
const LAST = 0.62;
const spotOf = (i: number): number => FIRST + ((LAST - FIRST) * i) / Math.max(1, projects.length - 1);
/** How close the lead must be, in path share, to light a name. */
const NEAR = 0.075;

function Title({ p }: { p: Project }): JSX.Element {
  const cls =
    "block w-fit rounded-sm pb-[0.12em] pr-[0.14em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8";
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lineRef = useRef<SVGPolylineElement | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const pairRef = useRef<KoiPair | null>(null);
  const progRef = useRef(0);
  const tvUp = useTvUp();

  // The scroll's progress through the section, for the fish and the names.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (st) => {
          progRef.current = st.progress;
          pairRef.current?.setProgress(st.progress);
        },
        onRefresh: (st) => {
          progRef.current = st.progress;
          pairRef.current?.setProgress(st.progress);
        },
      });
    }, section);
    return () => ctx.revert();
  }, []);

  // The fish, through the band's bar shader. Waits for the hero (tvUp.ts).
  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gone = false;
    let bar: BarCanvas | null = null;
    let onResize: (() => void) | null = null;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (gone) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pair = createKoiPair(img, w, h);
      pair.setProgress(progRef.current);
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
      try {
        bar = createBarCanvas(canvas, [{ type: "canvas", source: pair.source, config }], {
          colors: () => ({ bg: hexToRgb(GROUND), fill: hexToRgb(BLOSSOM) }),
          defaults: { bgOpacity: 0 },
          fps: reduced ? 12 : 60,
        });
      } catch {
        return;
      }
      pairRef.current = pair;
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
      bar?.destroy();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, [tvUp]);

  // Every frame while the section is on screen: put each name beside its
  // point on the path, light the one the lead is at, and draw the hairline
  // over the path swum so far.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let on = false;
    const frame = (): void => {
      raf = on ? requestAnimationFrame(frame) : 0;
      const pair = pairRef.current;
      const vw = window.innerWidth;
      const narrow = vw < 1024;
      const lead = pair ? pair.lead() : progRef.current;
      const gap = narrow ? 0.08 : 0.1; // name's distance right of the path, in widths
      projects.forEach((_, i) => {
        const row = rowRefs.current[i];
        if (!row) return;
        const spot = spotOf(i);
        const pt = pair ? pair.pointAt(spot) : { x: 0.2, y: 0.55 + (spot - lead) * 3.2 };
        // The last name stays lit once the fish have passed it.
        const d = i === projects.length - 1 ? Math.max(0, spot - lead) : Math.abs(lead - spot);
        const a = Math.max(0, 1 - d / NEAR);
        const e = a * a * (3 - 2 * a);
        row.style.left = `${((pt.x + gap) * 100).toFixed(3)}%`;
        row.style.top = `${(pt.y * 100).toFixed(3)}%`;
        row.style.opacity = (0.26 + 0.74 * e).toFixed(3);
        row.style.filter = reduced || e > 0.98 ? "" : `blur(${((1 - e) * 1.6).toFixed(2)}px)`;
        const result = row.querySelector<HTMLElement>("[data-result]");
        if (result) {
          result.style.opacity = reduced ? "0.7" : (0.7 * e).toFixed(3);
          result.style.transform = reduced ? "" : `translateY(${((1 - e) * 0.6).toFixed(2)}em)`;
        }
        const dot = row.querySelector<HTMLElement>("[data-dot]");
        if (dot) dot.style.opacity = (0.35 + 0.65 * e).toFixed(3);
      });
      const line = lineRef.current;
      if (line) {
        if (!pair) {
          line.setAttribute("points", "");
        } else {
          const pts: string[] = [];
          const n = 90;
          for (let k = 0; k <= n; k += 1) {
            const q = pair.pointAt((k / n) * lead);
            pts.push(`${(q.x * 100).toFixed(2)},${(q.y * 100).toFixed(2)}`);
          }
          line.setAttribute("points", pts.join(" "));
        }
      }
    };
    const io = new IntersectionObserver(([en]) => {
      on = en.isIntersecting;
      if (on && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(section);
    frame();
    return () => {
      on = false;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      aria-labelledby="k3-work-title"
      className="relative"
      ref={sectionRef}
      style={{ color: INK, height: `${110 + projects.length * 75}vh` }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="sticky top-0 h-screen w-full overflow-x-clip">
          {/* The path swum so far: one faint hairline. */}
          <svg aria-hidden="true" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <polyline
              fill="none"
              ref={lineRef}
              stroke={INK}
              strokeOpacity={0.3}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <canvas
            aria-hidden="true"
            className="absolute inset-0 block h-full w-full [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
            ref={canvasRef}
          />
          <ol className="absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]">
            {projects.map((p, i) => (
              <li
                className="pointer-events-auto absolute max-w-[62vw] lg:max-w-[42vw] -translate-y-1/2 pr-4 will-change-[top,left,opacity]"
                key={p.title}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                style={{ left: "20%", top: "120%" }}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-[-8vw] top-1/2 block h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full lg:left-[-10vw]"
                  data-dot
                  style={{ backgroundColor: ACCENT }}
                />
                <span className="block font-sans text-[clamp(11px,0.75vw,24px)] tracking-[0.08em] opacity-60">
                  {String(i + 1).padStart(2, "0")} &nbsp;{p.year}
                </span>
                <span className="mt-[0.2em] block text-[clamp(30px,8.5vw,56px)] leading-[1.05] tracking-[-0.025em] lg:text-[clamp(40px,4.8vw,200px)]">
                  <Title p={p} />
                </span>
                <span className="mt-[0.3em] block font-sans text-[clamp(12px,0.9vw,28px)]" data-result>
                  {resultOf(p)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="relative px-4 pt-[16vh] sm:px-[8vw] lg:pl-[56vw]">
        <h2
          className="w-fit pb-[0.1em] pl-[0.08em] pr-[0.12em] text-[clamp(64px,17vw,120px)] leading-[0.95] tracking-[-0.03em] lg:text-[min(20vh,8vw)]"
          id="k3-work-title"
        >
          <Serif text="Work" />
        </h2>
      </div>
    </section>
  );
}
