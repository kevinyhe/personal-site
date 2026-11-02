"use client";

import { type CSSProperties, type JSX, useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import BarPicture from "@/components/below/barPicture";
import Reach from "@/components/luke/Reach";
import ReachHand from "@/components/luke/ReachHand";
import { RollText } from "@/components/luke/contact-roll";
import { css, ground, onPalette } from "@/components/cloudPalette";
import { GROUND, INK } from "@/components/luke/theme";
import { useMedia } from "@/components/luke/work-data";
import { elsewhere } from "@/components/siteContent";
import { useTvUp } from "@/components/tvUp";

gsap.registerPlugin(ScrollTrigger);

/**
 * Contact, after lukebaffait.fr: a panel on the page's dark ground that
 * opens through the page above (Work and Skills under the cloud bank, in
 * its colours) as a circle growing up from the bottom of the screen, then
 * scrolls on like a sheet of paper. On it: a giant "Contact", his links,
 * his email between the fingertips with where he is under it (Reach.tsx),
 * and the two hands from Michelangelo's Creation of Adam in pink bars (public/work/hand-adam.webp, hand-god.webp,
 * the PNGs beside them at q90: the fresco detail from Wikimedia Commons,
 * public domain), Adam's sliding
 * in from the left edge and God's from the right as the page scrolls, as
 * lukebaffait's end page uses the same hands. Behind them, faint and in
 * the same bars, the scene again in marble: God with his cherubs flying
 * over, Adam below reaching up to him (public/work/contact-god.webp,
 * contact-adam.webp, made by scripts/contact-statue.mjs), drifting slower
 * than the page. The end page below (components/Ending.tsx) is on the same
 * dark ground.
 *
 * With reduced motion the panel is simply there, no circle, nothing rising.
 */

const LINKS = elsewhere.filter((l) => l.label === "GitHub" || l.label === "LinkedIn" || l.label === "Devpost" || l.label === "X");

const TITLE = "Contact";

/** How much slower than the page the statues go, as a share of it: at
 *  this they move at two thirds of its speed, so they hang back behind the
 *  words. (0.18 was too quick, and 0.5, half its speed, a third too slow.) */
const DRIFT = 0.335;
/** Where the statues sit, in God's widths from his box's top left: Adam's
 *  box's left, top and width. God is at least `god` of the screen wide,
 *  and bigger where it takes that to cover every row the drift shows (see
 *  place). Wide: the layout picked at 1888 by 1020 (God 104.5vw, Adam
 *  82.3vw at 1.6vw, 1075px under him), God's finger over Adam's head. A
 *  phone's rows are about three screens of its width, so there the pair
 *  is about 3.3 screens wide: God's hand runs off the left edge and Adam's
 *  off the right, his head on the left under the cherubs below God's arm. */
const STACK = {
  wide: { god: 1.045, adamX: 0.0153, adamY: 0.5449, adamW: 0.7876 },
  narrow: { god: 1.788, adamX: 0.097, adamY: 0.63, adamW: 0.789 },
};
/** The row God's hair starts on and the right edge of his face, in his
 *  widths (148px down his render, cut 1040 wide, and 560px in), and Adam's
 *  height in his. */
const GOD_HAIR = 148 / 1040;
const GOD_FACE = 560 / 1040;
const ADAM_TALL = 893 / 1270;
/** How far down Adam's box the pair must reach: his legs fade out over the
 *  last eighth of his render (scripts/contact-statue.mjs). */
const ADAM_SHOWN = 0.92;
/** The statues' bars, px: coarser than the hands' 5, so the marble
 *  behind reads as bigger lines than the hands over it (user); finer on a
 *  phone, where the statues are smaller. They were 5 and 4. */
const STATUE_CELL = 8;
const STATUE_CELL_NARROW = 6;
/** The statues' layer runs a screen up past the panel's top, and while
 *  the circle opens only the circle cuts it (see grow). Held back by the
 *  drift, God sits partly above the panel's top edge then, and the circle
 *  reaches past it: cut at that edge he showed a straight line across the
 *  circle, and a fade there hid his top instead. Once the panel is open it
 *  is cut to the panel's box, corners and all. */
const STATUES_OPEN = "inset(100vh 0 0 0 round max(2.4rem, 18px))";
/** The statues' pictures. The query names the cut (scripts/contact-statue.mjs),
 *  so a copy of an earlier cut, kept by the browser or by BarPicture's own
 *  cache of what it has loaded, is not used: drawn into this cut's box it
 *  left a dark strip down each side. Change it with the cut. */
const GOD_SRC = "/work/contact-god.webp?cut=1040";
const ADAM_SRC = "/work/contact-adam.webp?cut=1270";

export default function Contact(): JSX.Element {
  const root = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const cover = useRef<HTMLDivElement | null>(null);
  const statues = useRef<HTMLDivElement | null>(null);

  const tvUp = useTvUp();
  const statueCell = useMedia("(min-width: 1024px)") ? STATUE_CELL : STATUE_CELL_NARROW;
  // Waits for the hero (tvUp.ts) so it does not slow the TV loading.
  useEffect(() => {
    if (!tvUp) return undefined;
    const el = root.current;
    const sheet = panel.current;
    if (!el || !sheet) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    // t = 0 when the panel's top is at the bottom of the screen, 1 when it
    // reaches the top. The circle is centred on the bottom edge of the
    // screen (which, in the panel's own coordinates, is t × screen height
    // down from its top) and grows until it covers the whole screen.
    //
    // The circle is a hole, onto the dark ground: cut out of
    // the page above (the block Skills ends, app/page.tsx, whose bottom is
    // the panel's top) and out of a cover in its colour over this section,
    // and the panel inside it is clipped to it. A clip path, not a mask:
    // the block above is many screens tall, and a mask is drawn at its size.
    const prev = el.previousElementSibling ?? el.parentElement?.previousElementSibling ?? null;
    const above = prev instanceof HTMLElement ? prev : null;
    const coverEl = cover.current;
    const layer = statues.current;
    /** The box with a round hole r across at (its middle, y), and a wide
     *  margin round it, so nothing that hangs over its edges is cut. */
    const hole = (box: HTMLElement, y: number, r: number): string => {
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const m = 1e4;
      const f = (v: number): string => v.toFixed(1);
      return `path(evenodd, "M${-m} ${-m}H${w + m}V${h + m}H${-m}Z M${f(w / 2 - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z")`;
    };
    const cut = (target: HTMLElement | null, y: number, r: number): void => {
      if (target) target.style.clipPath = r > 0 ? hole(target, y, r) : "";
    };
    // Shut, the page above is cut off at its own foot: the cloud bank's
    // track hangs a screen past it, over this panel (CloudPassage.tsx),
    // and would lie over it once the circle has opened.
    const shut = (): void => {
      if (above) above.style.clipPath = "inset(-10000px -10000px 0px -10000px)";
    };
    const grow = (t: number): void => {
      if (coverEl) coverEl.style.visibility = t < 1 ? "visible" : "hidden";
      const w = window.innerWidth;
      const h = window.innerHeight;
      const full = Math.hypot(w / 2, h) * 1.02;
      const r = full * Math.pow(Math.min(1, Math.max(0, t)), 1.25);
      if (t >= 1 || r < 0.5) {
        sheet.style.clipPath = t >= 1 ? "none" : "circle(0px at 50% 0px)";
        if (layer) layer.style.clipPath = t >= 1 ? STATUES_OPEN : "circle(0px at 50% 0px)";
        shut();
        cut(coverEl, 0, 0);
        return;
      }
      const cy = t * h;
      sheet.style.clipPath = `circle(${r.toFixed(1)}px at 50% ${cy.toFixed(1)}px)`;
      if (layer) layer.style.clipPath = `circle(${r.toFixed(1)}px at 50% ${(cy - layer.offsetTop).toFixed(1)}px)`;
      cut(coverEl, cy, r);
      if (above) cut(above, above.offsetHeight + cy, r);
    };
    // The cover is the page above's colour, which turns with the cloud's.
    const offPalette = onPalette((t) => {
      if (coverEl) coverEl.style.backgroundColor = css(ground(t));
    });
    // Undoes the statues' places (set in the context below).
    let unplace = (): void => {};

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sheet,
        start: "top bottom",
        end: "top top",
        onUpdate: (s) => grow(s.progress),
        onRefresh: (s) => grow(s.progress),
      });

      gsap.from("[data-letter]", {
        y: 40,
        opacity: 0,
        filter: "blur(10px)",
        duration: 1.3,
        ease: "power4.out",
        stagger: 0.05,
        scrollTrigger: { trigger: "[data-title]", start: "top 80%", once: true },
      });

      gsap.utils.toArray<HTMLElement>("[data-fig]").forEach((fig) => {
        // Each hand slides in from its own edge towards the other as the
        // page scrolls, Adam's from the left and God's from the right.
        const sign = fig.dataset.figFrom === "left" ? -1 : 1;
        gsap.fromTo(
          fig,
          { xPercent: 55 * sign },
          {
            xPercent: 0,
            ease: "power2.out",
            scrollTrigger: { trigger: fig, start: "top bottom", end: "top 30%", scrub: 0.6 },
          },
        );
        // At rest the hand keeps moving: a slow reach towards the other
        // hand and back, with a little rise and fall, on its own clock.
        const idle = fig.querySelector("[data-fig-idle]");
        if (idle) {
          gsap.to(idle, { xPercent: -2.2 * sign, duration: 3.4 + (sign > 0 ? 0.6 : 0), ease: "sine.inOut", yoyo: true, repeat: -1 });
          gsap.to(idle, { yPercent: 1.6, rotation: -0.8 * sign, duration: 4.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: sign > 0 ? 1.1 : 0 });
        }
        // And the drawing lags the page as it goes by, a third of its
        // height over the figure's pass, so it reads as further back. At
        // an eighth of it the drift was hard to see.
        const inner = fig.querySelector("[data-fig-inner]");
        if (inner) {
          gsap.fromTo(
            inner,
            { yPercent: -16 },
            { yPercent: 16, ease: "none", scrollTrigger: { trigger: fig, start: "top bottom", end: "bottom top", scrub: true } },
          );
        }
      });

      // The statues move up through the panel DRIFT less than the page
      // does, over the panel's whole pass, so they read as far back: both
      // by the same distance, so they are at the same depth whatever their
      // sizes. So of the panel's rows they only ever show the ones from
      // DRIFT/2 of (panel - screen) down to as far from its foot, and place
      // puts them there, not where they sit in the panel: God's hair just
      // under the first, the pair as big as it takes to reach the last.
      const [god, adam] = gsap.utils.toArray<HTMLElement>("[data-statue]");
      const place = (): void => {
        if (!god || !adam) return;
        const s = window.matchMedia("(min-width: 1024px)").matches ? STACK.wide : STACK.narrow;
        const first = (DRIFT / 2) * (sheet.offsetHeight - window.innerHeight);
        const rows = sheet.offsetHeight - 2 * first;
        const gap = 0.03 * window.innerHeight;
        const span = s.adamY + ADAM_SHOWN * s.adamW * ADAM_TALL - GOD_HAIR;
        const wide = Math.max(s.god * sheet.clientWidth, (rows - gap) / span);
        // Flush left, unless that would put his face off the right edge.
        const left = Math.min(0, 0.98 * sheet.clientWidth - GOD_FACE * wide);
        // In the layer, which starts above the panel (see STATUES_OPEN).
        const top = -(layer?.offsetTop ?? 0) + first + gap - GOD_HAIR * wide;
        Object.assign(god.style, { left: `${left}px`, top: `${top}px`, width: `${wide}px` });
        Object.assign(adam.style, { left: `${left + s.adamX * wide}px`, top: `${top + s.adamY * wide}px`, width: `${s.adamW * wide}px` });
      };
      place();
      ScrollTrigger.addEventListener("refreshInit", place);
      unplace = (): void => {
        ScrollTrigger.removeEventListener("refreshInit", place);
        for (const e of [god, adam]) if (e) Object.assign(e.style, { left: "", top: "", width: "" });
      };

      const drift = (): number => (DRIFT / 2) * (sheet.offsetHeight + window.innerHeight);
      gsap.fromTo(
        "[data-statue]",
        { y: () => -drift() },
        {
          y: () => drift(),
          ease: "none",
          scrollTrigger: { trigger: sheet, start: "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true },
        },
      );

      gsap.utils.toArray<HTMLElement>("[data-col]").forEach((col) => {
        gsap.from(col.children, {
          y: 22,
          autoAlpha: 0,
          duration: 1,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: { trigger: col, start: "top 90%", once: true },
        });
      });
    }, el);

    return () => {
      ctx.revert();
      unplace();
      offPalette();
      sheet.style.clipPath = "";
      cut(above, 0, 0);
      cut(coverEl, 0, 0);
      if (coverEl) coverEl.style.visibility = "";
      if (layer) layer.style.clipPath = STATUES_OPEN;
    };
  }, [tvUp]);

  const vars = { "--g": "max(7vw, 20px)", color: INK } as CSSProperties;

  return (
    <section aria-labelledby="contact-panel-title" id="contact" className="relative font-sans" ref={root} style={{ backgroundColor: GROUND }}>
      {/* The dark ground behind the last screen of the page above, seen
          only through the circle cut in it (see grow). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-full h-[100vh]" style={{ backgroundColor: GROUND }} />
      {/* The page above carried on over this section until the circle
          opens it (see grow). Only there while it opens. */}
      <div aria-hidden="true" className="pointer-events-none invisible absolute inset-0 z-[1]" ref={cover} />
      {/* The statues behind it all, drifting slower than the page (see
          the effect), under the panel and running a screen up past its
          top (see STATUES_OPEN). Faint, so the words and hands over them
          read first. The Creation stacked: God flying over, his arm
          across the screen and his finger just over Adam's head, Adam below
          reaching out under him. At one scale: God's head is 1.55 times
          smaller in his render than Adam's in his (ear to nose, 92px
          against 140), so God's whole render would be 1.95 times Adam's
          width; it is cut at x 1040 of 1600, which the screen never gets
          past. Stacked, their fingers do not meet. Held back by the
          drift, the statues only show through a window about 1.7 screens
          tall, and the effect sizes and places the pair to fill it (the
          classes here are only where it is with reduced motion): God's
          hair at its top as the panel opens, Adam down past its foot.
          That shows God's finger over Adam's head for a while before
          Adam's hand in bars comes over it (at 1.18 times this size it
          lay over that spot the whole way down). Adam's hand crosses the
          cherub under God. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-[100vh] bottom-0 z-[2] overflow-hidden opacity-[0.45]" ref={statues} style={{ clipPath: STATUES_OPEN }}>
        <div className="absolute left-0 top-[calc(100vh+37.3svh)] aspect-[1040/1013] w-[178.8vw] lg:top-[92.5vh] lg:w-[104.5vw]" data-statue>
          <BarPicture cell={statueCell} fit="contain" ink={INK} invert={false} source={GOD_SRC} />
        </div>
        <div className="absolute -left-[15vw] top-[calc(100vh+88.8svh)] aspect-[1270/893] w-[141.1vw] lg:left-[1.6vw] lg:top-[197.8vh] lg:w-[82.3vw]" data-statue>
          <BarPicture cell={statueCell} fit="contain" ink={INK} invert={false} source={ADAM_SRC} />
        </div>
      </div>
      <div className="relative z-[2] overflow-hidden rounded-[max(2.4rem,18px)] px-[var(--g)]" ref={panel} style={vars}>
        <div className="relative grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[100svh_auto] lg:gap-x-[2vw]">
          {/* The giant word. */}
          <h2
            className="pt-[26svh] font-serif-display text-[clamp(80px,15vw,340px)] italic leading-[0.95] tracking-[-0.03em] lg:col-span-8 lg:col-start-1 lg:row-start-1 lg:self-center lg:pt-0"
            data-title
            id="contact-panel-title"
          >
            <span className="sr-only">{TITLE}</span>
            <span aria-hidden="true" className="-mb-[0.12em] block pb-[0.14em] pr-[0.12em]">
              {Array.from(TITLE).map((c, i) => (
                <span className="inline-block" data-letter key={i}>
                  {c}
                </span>
              ))}
            </span>
          </h2>

          {/* God's hand, reaching in from the right edge. */}
          <Figure
            alt="God's hand from Michelangelo's Creation of Adam, drawn in bars"
            className="mt-[10svh] h-[66vw] w-[102vw] justify-self-end -mr-[calc(var(--g)_+_10vw)] lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:mt-0 lg:h-[33vw] lg:w-[51vw] lg:translate-y-[30%] lg:self-end lg:-mr-[calc(var(--g)_+_4vw)]"
            from="right"
            src="/work/hand-god.webp"
          />

          {/* The email between the fingers, and where under it. */}
          <Reach className="mt-[12svh] lg:col-span-6 lg:col-start-4 lg:row-start-2 lg:mt-[17vh] lg:self-start" />

          {/* Links; on a phone after Adam's hand. */}
          <div className="order-last mb-[14svh] mt-[8svh] lg:order-none lg:col-span-4 lg:col-start-9 lg:row-start-2 lg:mb-[16vh] lg:mt-[40vh] lg:self-end" data-col>
            <ul className="flex flex-col gap-[0.15em] text-[clamp(24px,2.2vw,48px)] font-medium tracking-[-0.02em]">
              {LINKS.map((l) => (
                <li key={l.label}>
                  <a
                    aria-label={`${l.label}, ${l.handle}`}
                    className="group inline-flex items-baseline gap-[0.5em] rounded-sm outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-current"
                    href={l.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <RollText text={l.label} />
                    <span
                      aria-hidden="true"
                      className="text-[0.4em] font-normal tracking-normal opacity-50 transition-opacity duration-500 group-hover:opacity-100"
                    >
                      {l.handle}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Adam's hand, reaching in from the left edge. */}
          <Figure
            alt="Adam's hand from Michelangelo's Creation of Adam, drawn in bars"
            className="mb-[14svh] mt-[12svh] h-[66vw] w-[102vw] -ml-[calc(var(--g)_+_10vw)] lg:col-span-5 lg:col-start-1 lg:row-start-2 lg:mb-[16vh] lg:mt-[24vh] lg:h-[33vw] lg:w-[51vw] lg:self-end lg:-ml-[calc(var(--g)_+_4vw)]"
            from="left"
            src="/work/hand-adam.webp"
          />
        </div>
      </div>
    </section>
  );
}

/** A picture drawn in pink bars. (lukebaffait's small "+" marks at the
 *  corners are gone: on the dark ground one read as a speck off the top of
 *  Adam's hand.) The drawing drifts up through the frame as the page
 *  scrolls and reaches toward the other hand at rest, so neither the frame
 *  nor the drawing's box cuts it: the whole picture is drawn ("contain";
 *  "cover" cropped the fingertips, which sit at the pictures' edges) and
 *  the frame does not clip. Only the panel's edge cuts the arms, where
 *  they run off the screen. The picture sits in a box that Reach slides
 *  toward the other hand. */
function Figure({ src, alt, className, from }: { src: string; alt: string; className: string; from: "left" | "right" }): JSX.Element {
  return (
    <figure className={`pointer-events-none relative ${className}`} data-fig data-fig-from={from}>
      <div className="absolute inset-x-0 -top-[7%] h-[114%]" data-fig-inner>
        <div className="absolute inset-0" data-fig-idle>
          <ReachHand from={from}>
            <BarPicture alt={alt} cell={5} fit="contain" ink={INK} source={src} />
          </ReachHand>
        </div>
      </div>
    </figure>
  );
}
