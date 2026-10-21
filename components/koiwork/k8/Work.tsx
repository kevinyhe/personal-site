"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { createKoiPair } from "@/components/luke/koi";
import { BLOSSOM, GROUND, INK, RULE } from "@/components/luke/theme";
import { resultOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { useTvUp } from "@/components/tvUp";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

gsap.registerPlugin(ScrollTrigger);

/**
 * Work design k8, "moon pool".
 *
 * One screen stays put while the section scrolls by. A large moon, drawn
 * as fine horizontal pink lines, hangs over a hairline of water. Under the
 * line its reflection is the same lines, mirrored, each shifted sideways
 * by a sine of the scroll and broken into dashes, fainter with depth.
 *
 * The projects take turns on the water line, one at a time; each name has
 * a mirrored copy under it, cut into strips that shift the same way. As
 * the page scrolls through the projects the moon sinks toward the water
 * and a shadow sweeps across it, from full to a thin crescent: that is
 * the progress.
 *
 * The koi (koi.ts, through the bar shader) swim under the surface: their
 * canvas only shows below the water line, under the reflection.
 *
 * Reduced motion: the lines and strips do not shift; the moon still sinks
 * and the names still change with the scroll, since that is the scroll.
 */

const N = projects.length;
/** Strips each reflected name is cut into. */
const STRIPS = 7;
/** The water line, as a share of the screen height. */
const WATER = 0.62;

function NameLink({ p, children, className }: { p: Project; children: ReactNode; className: string }): JSX.Element {
  if (!p.href) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

/** Characters the display serif (a DEMO cut) cannot draw. */
const NOT_SERIF = /([0-9'"&@\-\u2010\u2011!()/;]+)/;

/** The italic display serif, with digits and hyphens in the sans at 0.62em on the baseline. */
function Serif({ text }: { text: string }): JSX.Element {
  return (
    <span className="font-serif-display italic">
      {text.split(NOT_SERIF).map((run, i) =>
        i % 2 === 1 ? (
          <span className="pl-[0.04em] align-baseline font-sans text-[0.62em] not-italic tracking-[0]" key={i}>
            {run}
          </span>
        ) : (
          run
        ),
      )}
    </span>
  );
}

const NAME_TYPE = "whitespace-nowrap text-[clamp(30px,8.6vw,64px)] leading-[1] tracking-[-0.03em] lg:text-[clamp(56px,6.2vw,220px)]";

export default function Work(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);
  const moonRef = useRef<HTMLCanvasElement | null>(null);
  const nameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const tvUp = useTvUp();

  // The moon, its reflection, and the names: one paint per scroll frame.
  useEffect(() => {
    const canvas = moonRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return undefined;
    const g = canvas.getContext("2d");
    if (!g) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let progress = 0;
    /** Right edge of the widest name, so the moon never sits over one. */
    let namesRight = 0;
    let raf = 0;

    const size = (): void => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      namesRight = 0;
      nameRefs.current.forEach((el) => {
        const a = el?.querySelector<HTMLElement>("[data-up] > :last-child");
        if (a) namesRight = Math.max(namesRight, a.getBoundingClientRect().right);
      });
    };

    const paint = (): void => {
      raf = 0;
      const p = progress;
      const wide = w >= 1024;
      const R = wide ? Math.min(w * 0.13, h * 0.22) : Math.min(w * 0.3, h * 0.15);
      const cx = wide ? Math.min(w * 0.94 - R, Math.max(w * 0.64, namesRight + R + w * 0.03)) : w * 0.5;
      const water = h * WATER;
      // Sinks from high to just touching the water.
      // On a phone it stays between the header and the name's small facts.
      const cy = water - R - h * (wide ? 0.1 : 0.05) * (1 - p) - h * (wide ? 0.015 : 0.1);
      // The shadow: a circle of the same size sliding in from the left,
      // from fully off (full moon) to leaving a thin crescent.
      const off = -2.15 * R + 1.9 * R * p;
      const step = Math.max(4, Math.round(h / 190));
      const t = reduced ? 0 : p * Math.PI * 2 * (N - 1);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = BLOSSOM;

      // The moon: horizontal hairlines, each the lit part of a chord.
      for (let y = cy - R + step / 2; y < cy + R; y += step) {
        const dy = y - cy;
        const half = Math.sqrt(R * R - dy * dy);
        const a = cx - half;
        const b = cx + half;
        const sb = cx + off + half;
        // Lit = [a, b] minus [sa, sb]; the shadow comes from the left.
        const la = Math.max(a, Math.min(b, sb));
        if (b - la > 0.5) {
          g.globalAlpha = 1;
          g.fillRect(la, y - 0.6, b - la, 1.2);
        }
        // The shadowed part as a faint line, so the whole circle reads.
        const da = a;
        const db = Math.min(b, Math.max(a, sb));
        if (db - da > 0.5) {
          g.globalAlpha = 0.14;
          g.fillRect(da, y - 0.5, db - da, 1);
        }
      }

      // The reflection: the same chords mirrored about the water line,
      // shifted by a sine, broken into dashes, fainter with depth.
      const rcy = 2 * water - cy;
      const rStep = step + 1;
      for (let y = water + rStep; y < Math.min(h, rcy + R); y += rStep) {
        const dy = y - rcy;
        if (Math.abs(dy) >= R) continue;
        const half = Math.sqrt(R * R - dy * dy);
        const depth = (y - water) / (h - water);
        const shift = reduced ? 0 : Math.sin(y * 0.045 + t) * (4 + 26 * depth) + Math.sin(y * 0.013 - t * 0.6) * 8;
        const sb = cx + off + half;
        const la = Math.max(cx - half, Math.min(cx + half, sb));
        const lb = cx + half;
        if (lb - la < 1) continue;
        g.globalAlpha = 0.75 * (1 - depth) + 0.08;
        // Dashes: gaps placed by a hash of the line and the phase.
        const row = Math.round(y / rStep);
        let x = la;
        let k = 0;
        while (x < lb) {
          const hsh = Math.sin(row * 12.9898 + k * 78.233 + Math.floor(t * 0.8)) * 43758.5453;
          const r = hsh - Math.floor(hsh);
          const len = (0.25 + r) * R * (0.5 - 0.3 * depth);
          const end = Math.min(lb, x + len);
          g.fillRect(x + shift, y - 0.6, end - x, 1.2);
          x = end + (4 + r * 18) * (0.5 + depth);
          k += 1;
        }
      }
      g.globalAlpha = 1;

      // The names: the current one on the water, its reflection in strips.
      const f = p * (N - 1);
      nameRefs.current.forEach((el, i) => {
        if (!el) return;
        const d = Math.abs(f - i);
        const o = Math.max(0, 1 - d * 2.4);
        el.style.opacity = o.toFixed(3);
        el.style.visibility = o < 0.01 ? "hidden" : "visible";
        el.style.pointerEvents = o > 0.6 ? "auto" : "none";
        const up = el.querySelector<HTMLElement>("[data-up]");
        if (up) up.style.transform = `translateY(${((f - i) * -1.6).toFixed(2)}vh)`;
        el.querySelectorAll<HTMLElement>("[data-strip]").forEach((s, j) => {
          const amp = reduced ? 0 : 0.12 + 0.8 * Math.min(1, d) + j * 0.06;
          const dx = Math.sin(j * 1.7 + t * 1.3) * amp;
          s.style.transform = `translateX(${dx.toFixed(2)}vw) scaleY(-1)`;
        });
      });
      if (countRef.current) countRef.current.textContent = String(Math.min(N, Math.round(f) + 1)).padStart(2, "0");
    };

    const queue = (): void => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (st) => {
          progress = st.progress;
          queue();
        },
        onRefresh: (st) => {
          progress = st.progress;
          queue();
        },
      });
    }, section);
    const onResize = (): void => {
      size();
      queue();
    };
    size();
    queue();
    window.addEventListener("resize", onResize);
    // The names' widths change once the serif loads.
    void document.fonts.ready.then(onResize);
    return () => {
      cancelAnimationFrame(raf);
      ctx.revert();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // The koi, as on the home page: bar shader, moved only by the scroll.
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

  return (
    <section aria-labelledby="work-title" className="relative" id="work" ref={sectionRef} style={{ color: INK, height: `${(N + 1) * 100}vh` }}>
      <div className="sticky top-0 h-screen w-full overflow-x-clip">
        {/* Under the surface: the koi, shown only below the water line. */}
        <canvas
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 block h-full w-full opacity-70 [mask-image:linear-gradient(to_bottom,transparent_74%,black_80%,black_90%,transparent)]"
          ref={koiRef}
        />
        <canvas aria-hidden="true" className="pointer-events-none absolute inset-0 block h-full w-full" ref={moonRef} />

        {/* The water line. */}
        <div aria-hidden="true" className="absolute inset-x-0 h-px" style={{ top: `${WATER * 100}vh`, background: RULE }} />

        <header className="absolute left-4 right-4 top-[9vh] flex flex-col items-start gap-[1.2vh] sm:left-[6vw] sm:right-[6vw]">
          <h2 className="pb-[0.1em] pr-[0.12em] text-[clamp(44px,12vw,72px)] leading-[0.95] tracking-[-0.03em] lg:text-[min(13vh,6vw)]" id="work-title">
            <Serif text="Work" />
          </h2>
          <p className="font-sans text-[clamp(11px,0.75vw,24px)] tabular-nums opacity-60">
            <span ref={countRef}>01</span> of {String(N).padStart(2, "0")}
          </p>
        </header>

        <ol className="absolute inset-0">
          {projects.map((p, i) => {
            const result = resultOf(p);
            return (
              <li key={p.title}>
                <div
                  className="absolute left-4 right-4 sm:left-[6vw] sm:right-[6vw]"
                  ref={(el) => {
                    nameRefs.current[i] = el;
                  }}
                  style={{ top: `${WATER * 100}vh`, opacity: i === 0 ? 1 : 0 }}
                >
                  {/* On the water: small facts, then the name sitting on the line. */}
                  <div className="absolute bottom-0 left-0 will-change-transform" data-up="">
                    <p className="mb-[1.6vh] font-sans text-[clamp(11px,0.8vw,26px)] opacity-60">
                      {p.year}
                      {result ? <span className="ml-[1.2em]">{result}</span> : null}
                    </p>
                    <NameLink
                      className={`block w-fit pb-[0.12em] pr-[0.12em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8 ${NAME_TYPE}`}
                      p={p}
                    >
                      <Serif text={p.title} />
                      {p.href ? <span className="sr-only"> (opens in a new tab)</span> : null}
                    </NameLink>
                  </div>
                  {/* Its reflection: the name mirrored, cut into shifting strips. */}
                  <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 opacity-30">
                    {Array.from({ length: STRIPS }, (_, j) => (
                      <div
                        className={`absolute left-0 top-0 whitespace-nowrap pb-[0.12em] pr-[0.12em] ${NAME_TYPE}`}
                        data-strip=""
                        key={j}
                        style={{
                          transformOrigin: "50% 50%",
                          clipPath: `inset(${(100 - ((j + 1) * 100) / STRIPS).toFixed(2)}% 0 ${((j * 100) / STRIPS).toFixed(2)}% 0)`,
                          opacity: 1 - j * 0.11,
                        }}
                      >
                        <Serif text={p.title} />
                      </div>
                    ))}
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
