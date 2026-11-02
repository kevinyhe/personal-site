"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { useIdea } from "@/components/ideas/idea";
import PreviewRow from "@/components/ideas/i05/Row";
import { HOLD, heldFor } from "@/components/luke/hold";
import { createKoiPair } from "@/components/luke/koi";
import { GROUND, INK, Serif } from "@/components/luke/theme";
import { css, ground, ink, onPalette } from "@/components/cloudPalette";
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
 * The moment the last row's bottom line has gone off the top, the page is
 * held (hold.ts): their stroke stays where it is on the screen and the
 * koi swim on along it, off the right edge, as the canopy inks in.
 *
 * Reduced motion: the koi still go with the scroll, since that is the
 * scroll itself.
 */

/** The screens of scroll before the hold over which the koi are eased
 *  to the middle of the screen, where they are when the page stops. */
const SETTLE = 0.6;
/** 0 to 1 with no jump in speed at either end. */
const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

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
  const idea = useIdea();

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
      // The fish turn plum with the type as the page takes the cloud's
      // colours; the darker one stays darker on either ground.
      offPalette = onPalette((t) => {
        const fill = ink(t);
        const bg = ground(t);
        pair.setInkDark(fill[0] + fill[1] + fill[2] < bg[0] + bg[1] + bg[2]);
        bar?.setColors(hexToRgb(GROUND), fill);
      });
      // The names, as holes in the water (koi.ts), in the koi canvas's own
      // px: the canvas is only at the screen's top while it is held.
      const names = Array.from(section.querySelectorAll<HTMLElement>(idea === 5 ? "ol li [data-name]" : "ol li > :first-child"));
      pair.setHoles(() => {
        const c = canvas.getBoundingClientRect();
        const pad = 0.012 * window.innerWidth;
        return names.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left - c.left - pad, y: r.top - c.top - pad, w: r.width + 2 * pad, h: r.height + 2 * pad };
        });
      });
      // The section's top that the koi's lag and rise were worked out for
      // (place); NaN to work them out again.
      let settledAt = NaN;
      ctx = gsap.context(() => {
        // Where the section and the koi canvas are, every scroll step from
        // the layer's top (a screen above the section) reaching the bottom
        // of the screen to the section leaving the top. koi.ts lays Luke's
        // stroke on the section and times the fish off where it is. Through
        // the hold the stroke is put back by what has been scrolled since it
        // started, so it stands still, while the fish are still timed off
        // the real scroll and swim on along it.
        //
        // When the page stops the pair is in the middle of the screen,
        // across and down: the box round both fish, fins and all, centred.
        // Left on Luke's stroke and timing it is low and to the right
        // there (its middle 57% of the way down and 57% across at 1888 x
        // 1020, the lead's head off the right edge). So over the last
        // SETTLE screens before the hold the fish fall `lag` screens of
        // scroll behind Luke's timing and the stroke goes `rise` screens
        // further up than the page, and through the hold both stay so. Both
        // are worked out for the screen at hand (settle). (It was a lift
        // after the page had stopped, to a middle 35% of the way down over
        // the swim off, so the koi went on moving up once the page stood
        // still.)
        const list = section.querySelector("ol");
        let lag = 0;
        let rise = 0;
        const settle = (start: number): void => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const across = (l: number): number => {
            const b = pair.extent(start, start + l * vh);
            return (b.left + b.right) / 2 - vw / 2;
          };
          // Further behind is further back along the stroke, to the left.
          let lo = -0.5;
          let hi = 0.5;
          if (across(lo) < 0) hi = lo;
          else if (across(hi) > 0) lo = hi;
          for (let i = 0; i < 24 && hi - lo > 1e-4; i += 1) {
            const mid = (lo + hi) / 2;
            if (across(mid) > 0) lo = mid;
            else hi = mid;
          }
          lag = (lo + hi) / 2;
          const b = pair.extent(start, start + lag * vh);
          rise = ((b.top + b.bottom) / 2 - vh / 2) / vh;
        };
        const place = (): void => {
          const vh = window.innerHeight;
          const top = section.getBoundingClientRect().top;
          // The section's top when the hold starts, with the list's foot
          // at the screen's top; it moves only when the layout does.
          const start = list ? top - list.getBoundingClientRect().bottom : top;
          if (Number.isNaN(settledAt) || Math.abs(start - settledAt) > 0.5) {
            settledAt = start;
            settle(start);
          }
          const e = smooth(1 - (top - start) / (SETTLE * vh));
          const h = Math.min(heldFor(), HOLD);
          pair.setPlace(top + (h - e * rise) * vh, canvas.getBoundingClientRect().top, top + e * lag * vh);
        };
        ScrollTrigger.create({
          trigger: section,
          start: () => `top bottom+=${window.innerHeight}`,
          end: "bottom top",
          onUpdate: place,
          onRefresh: place,
        });
      }, section);
      onResize = () => {
        pair.resize(window.innerWidth, window.innerHeight);
        settledAt = NaN;
        bar?.redraw();
      };
      window.addEventListener("resize", onResize);
    };
    // koi.png as a WebP at q90: 44 KB against 135, and through the bars
    // the same fish.
    img.src = "/work/koi.webp";
    return () => {
      gone = true;
      ctx?.revert();
      offPalette?.();
      bar?.destroy();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, [tvUp, idea]);

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
      // On a wide screen it starts 20vh up the statement's held stage,
      // which the bank has covered by then, so "Work" comes up as the bank
      // opens.
      className="relative z-30 lg:-mt-[20vh]"
      id="work"
     
      ref={sectionRef}
      style={{ color: INK }}
    >
      {/* The koi layer: a screen-sized canvas that stays put while the
          section goes by. Its track starts a screen above the section and
          runs 1.6 screens past its end, so the canvas fills the screen for
          the whole swim: it stays put until 1.44 screens into the hold, and
          the fish are off the right edge by 1.0 of it at 16:9 and 1.2 at
          2560 x 1080 (at 1.3 past its end it started up the screen at
          1.14, with the last fish at its bottom edge on the wide one). With
          the track ending at the section's end the canvas was already
          scrolling off while the fish were on the stroke's last dip, and
          they were cut at its bottom edge; and an edge fade it had for
          that cut them at the top on the first crest. The next section,
          Skills, is above this one (same z-30, later on the page), so the
          overrun shows only where that section is see-through. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 top-0 lg:bottom-[-160vh] lg:top-[-100vh]">
        <canvas className="sticky top-0 block h-screen w-full" ref={koiRef} />
      </div>

      {/* lukebaffait.fr's projects list, compact: the names one under
          another between hairlines, each row the name and its one result,
          on the right of the screen with the fish on the left. Luke sets
          his at 4vw on 0.6em of padding a side, about 15% of the screen a
          row; these are a little smaller, as the serif runs wide. The deep
          foot is space before Skills, under the same cloud bank. */}
      <div className="relative px-[6vw] pb-[84vh] pt-[22vh] lg:pl-[56vw] lg:pr-[6vw]">
        <h2 className="pb-[0.1em] pr-[0.1em] text-[18vw] leading-[1.02] tracking-[-0.03em] lg:text-[min(24vh,9.3vw)]" id="work-title">
          <Serif text="Work" />
        </h2>
        <ol className="mt-[6vh] border-t" style={{ borderColor: HAIRLINE }}>
          {projects.map((p, index) =>
            idea === 5 ? (
              <PreviewRow index={index} key={p.title} p={p} rule={HAIRLINE} />
            ) : (
              <li className="border-b py-[max(0.9rem,2.1vh)]" key={p.title} style={{ borderColor: HAIRLINE }}>
                <RowLink
                  className="block w-fit rounded-sm pb-[0.06em] pr-[0.12em] text-[clamp(34px,9.5vw,60px)] leading-[1.1] tracking-[-0.03em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 lg:text-[clamp(36px,3.3vw,120px)]"
                  p={p}
                >
                  <Serif text={p.title} />
                </RowLink>
                <p className="mt-[max(0.3rem,4px)] font-sans text-[clamp(12px,0.8vw,26px)] opacity-75">{resultOf(p) ?? p.year}</p>
              </li>
            ),
          )}
        </ol>
      </div>
    </section>
  );
}
