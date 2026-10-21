"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { createKoiPair } from "@/components/luke/koi";
import { GROUND, INK, Serif } from "@/components/luke/theme";
import { css, ink, onPalette } from "@/components/cloudPalette";
import { useTvUp } from "@/components/tvUp";
import { resultOf } from "@/components/luke/work-data";
import { type Project, projects } from "@/components/profile";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";

gsap.registerPlugin(ScrollTrigger);

/**
 * The work section. Nothing is held: the page scrolls straight through it.
 *
 * At the top, its header, "Work", large in the band's italic display serif.
 * Then the project names down the right half as lukebaffait.fr's projects
 * list: one under another between hairlines, each with its one result
 * under it, the whole list about one screen.
 *
 * Behind the names, two big koi swim down the left (koi.ts), in the same
 * bars as the band's flower, in the type's colour. Their layer is a full-screen canvas that
 * stays put while the section goes by; they move only with the scroll.
 *
 * It follows the statement band, behind a bank of cloud (CloudPassage.tsx) that
 * stays on as its backdrop. While the bank is closed the colours turn over
 * (cloudPalette.ts): the section ends up plum type on the cloud's pink. Laid out
 * as the band: "Work" on the sentence's column at one and a half times
 * the sentence's size, at the same leading, a quarter of the way down so it
 * lands where the sentence stood.
 *
 * Every project name opens its link in a new tab (Saturn has none).
 *
 * Reduced motion: the koi still go with the scroll, since that is the
 * scroll itself.
 */

/** The rules between rows: the type's own colour, faint, so they turn with it. */
const HAIRLINE = "color-mix(in srgb, currentColor 18%, transparent)";

function RowLink({ p, className, children }: { p: Project; className: string; children: ReactNode }): JSX.Element {
  if (!p.href) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={p.href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

export default function WorkIndex(): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const koiRef = useRef<HTMLCanvasElement | null>(null);

  // The koi: two of them, through the same bar shader as the band's
  // flower, and moved only by the scroll.
  const tvUp = useTvUp();
  // Waits for the hero (tvUp.ts) so it does not slow the TV loading.
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
    let offPalette: (() => void) | null = null;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (gone) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pair = createKoiPair(img, w, h);
      // Bars sized in screen widths, not pixels: 200 across a wide screen,
      // so 1920 draws what 960 does, twice the size. At a fixed 4.8px the
      // big screen got twice as many bars, each too thin for the fish to
      // read as one shape.
      const cols = w < 1024 ? Math.round(w / 4) : 200;
      const config: BarLayerConfig = {
        x: "0%",
        y: "0%",
        width: "100%",
        height: "100%",
        // The flower's grade: a bright part of the fish draws a wide bar.
        blackPoint: 215,
        whitePoint: 40,
        threshold: 255,
        xSquares: cols,
        ySquares: Math.round((cols * h) / w),
        bgOpacity: 0,
        fillOpacity: 1,
      };
      bar = createBarCanvas(canvas, [{ type: "canvas", source: pair.source, config }], {
        colors: () => ({ bg: hexToRgb(GROUND), fill: ink(0) }),
        defaults: { bgOpacity: 0 },
        fps: reduced ? 12 : 60,
      });
      // The fish turn plum with the type as the page takes the cloud's colours.
      offPalette = onPalette((t) => bar?.setColors(hexToRgb(GROUND), ink(t)));
      ctx = gsap.context(() => {
        ScrollTrigger.create({
          // While the koi layer fills the screen: from the section's top
          // reaching the top of the screen to its bottom reaching the
          // bottom. Outside that the layer's edge is on screen.
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
      offPalette?.();
      bar?.destroy();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, [tvUp]);

  // The type's colour, with the cloud's.
  useEffect(
    () =>
      onPalette((t) => {
        if (sectionRef.current) sectionRef.current.style.color = css(ink(t));
      }),
    [],
  );

  return (
    <section
      aria-labelledby="work-title"
      // Above the cloud bank (CloudPassage.tsx, z-20), which is its backdrop.
      className="relative z-30"
      id="work"
     
      ref={sectionRef}
      style={{ color: INK }}
    >
      {/* The koi layer: a screen-sized canvas that stays put while the
          section goes by, faded at its top and bottom edges. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas
          className="sticky top-0 block h-screen w-full [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
          ref={koiRef}
        />
      </div>

      {/* lukebaffait.fr's projects list, compact: the names one under
          another between hairlines, each row the name and its one result,
          on the right of the screen with the fish on the left. Luke sets
          his at 4vw on 0.6em of padding a side, about 15% of the screen a
          row; these are a little smaller, as the serif runs wide. The deep
          foot is where the colours turn back to plum (CloudPassage). */}
      <div className="relative px-[6vw] pb-[84vh] pt-[22vh] lg:pl-[56vw] lg:pr-[6vw]">
        <h2 className="pb-[0.1em] pr-[0.1em] text-[18vw] leading-[1.02] tracking-[-0.03em] lg:text-[min(24vh,9.3vw)]" id="work-title">
          <Serif text="Work" />
        </h2>
        <ol className="mt-[6vh] border-t" style={{ borderColor: HAIRLINE }}>
          {projects.map((p) => (
            <li className="border-b py-[max(0.9rem,2.1vh)]" key={p.title} style={{ borderColor: HAIRLINE }}>
              <RowLink
                className="block w-fit rounded-sm pb-[0.06em] pr-[0.12em] text-[clamp(34px,9.5vw,60px)] leading-[1.1] tracking-[-0.03em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 lg:text-[clamp(36px,3.3vw,120px)]"
                p={p}
              >
                <Serif text={p.title} />
              </RowLink>
              <p className="mt-[max(0.3rem,4px)] font-sans text-[clamp(12px,0.8vw,26px)] opacity-75">{resultOf(p) ?? p.year}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
