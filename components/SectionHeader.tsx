"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { scrollWithLenis } from "@/components/SectionLink";
import { sectionLinks } from "@/components/siteContent";

/** Where a section sits in the document, px from the top of the page. */
type Band = { top: number; bottom: number };

/** The band the header's type sits in, px. The cream swap is measured
 *  against this rather than the viewport top, so it lands as the cream edge
 *  reaches the words rather than a screen early. */
const HEADER_BAND = 64;

/** How long the layout has to hold still before the section offsets are
 *  re-read, ms. A phone's URL bar collapsing during a scroll gesture fires
 *  resize and body ResizeObserver callbacks every frame for the length of
 *  its animation; measuring on each one would put the forced layout reads
 *  back into the scroll path this file exists to keep them out of. */
const RELAYOUT_IDLE_MS = 150;

/** Read once and kept: a MediaQueryList's `matches` stays live, so there is
 *  no need to build a new one in every effect that asks. */
let reducedMotionQuery: MediaQueryList | null = null;
const prefersReducedMotion = () =>
  (reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)"))
    .matches;

/** Same focus mark on all four controls. The header has no background of
 *  its own, so a ring (box-shadow) and an outline look the same here; the
 *  outline is the one that does not need an offset colour. */
const FOCUS_RING =
  "rounded-sm focus-visible:outline focus-visible:outline-1 " +
  "focus-visible:outline-offset-4 focus-visible:outline-current ";

/**
 * The header that carries the rest of the page, once the hero has gone.
 *
 * The hero's own strip is painted on the sticky stage and scrolls away with
 * it, so past the statue there was nothing on screen naming the page or
 * letting you move around it. This replaces the right-edge tick rail that
 * stood in for it: name on the left, three words on the right, set in the
 * page's serif at its own size. Same arrangement the reference portfolio
 * keeps at the top of every screen.
 *
 * No uppercase, no letter-spacing. Those were doing the work of making
 * small text look deliberate; at this size the serif does it. The two rules
 * it does have are the page's own hairline: one along the header's bottom
 * edge that draws in with the header, and one under the current word that
 * slides to the next.
 */
export default function SectionHeader() {
  const [active, setActive] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  // Contact is a cream block. A fixed header in the page's off-white would
  // be invisible the moment it crossed into it.
  const [onLight, setOnLight] = useState(false);
  const frameRef = useRef(0);
  const ruleRef = useRef<HTMLSpanElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const markRef = useRef<HTMLSpanElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Whether the underline is currently drawn. Going from nothing to a word
  // it appears under that word; going from one word to another it slides.
  const markShownRef = useRef(false);
  const placeMarkRef = useRef<((animate: boolean) => void) | null>(null);

  useEffect(() => {
    // Section extents in document space. The scroll path used to call
    // getBoundingClientRect() on every section plus Contact per frame —
    // four forced layout reads per scroll event, on a page whose other
    // scroll listeners already force their own. Layout can only change on
    // a resize or when something in the flow changes height, so the rects
    // are read then and the per-scroll work is arithmetic on scrollY.
    const bands = new Map<string, Band>();
    let viewH = window.innerHeight;
    let stale = true;

    const measure = () => {
      stale = false;
      viewH = window.innerHeight;
      const y = window.scrollY;
      bands.clear();
      for (const link of sectionLinks) {
        const element = document.getElementById(link.id);
        if (!element) continue;
        const box = element.getBoundingClientRect();
        bands.set(link.id, { bottom: box.bottom + y, top: box.top + y });
      }
    };

    const read = () => {
      frameRef.current = 0;
      if (stale) measure();
      const y = window.scrollY;
      // Whichever section's top has most recently passed the upper third of
      // the viewport, which is where a reader's eye sits. The middle flips
      // late on a long section and early on a short one.
      const line = y + viewH * 0.34;
      let current: string | null = null;
      let anyOnScreen = false;
      for (const link of sectionLinks) {
        const band = bands.get(link.id);
        if (!band) continue;
        if (band.bottom > y && band.top < y + viewH) anyOnScreen = true;
        if (band.top <= line) current = link.id;
      }
      setActive(current);
      setShown(anyOnScreen);

      const contact = bands.get("contact");
      setOnLight(
        contact !== undefined &&
          contact.top <= y + HEADER_BAND &&
          contact.bottom > y,
      );
    };

    const schedule = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(read);
    };
    // Debounced: the current offsets stay in use until the layout has been
    // still for RELAYOUT_IDLE_MS, then one measure. In a resize burst the
    // header is at worst a few frames behind on the section boundaries.
    let idle = 0;
    const relayout = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        stale = true;
        schedule();
      }, RELAYOUT_IDLE_MS);
    };

    read();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", relayout);
    // The body catches anything above a section growing or shrinking (the
    // hero's screen-height variable, fonts arriving); the sections root and
    // the sections themselves catch their own content. Each fires once on
    // observe, which is one extra measure on mount.
    const observer = new ResizeObserver(relayout);
    observer.observe(document.body);
    const root = document.querySelector("[data-sections]");
    if (root) observer.observe(root);
    for (const link of sectionLinks) {
      const element = document.getElementById(link.id);
      if (element) observer.observe(element);
    }
    return () => {
      window.clearTimeout(idle);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", relayout);
      observer.disconnect();
    };
  }, []);

  // The hairline along the bottom edge draws across as the header arrives
  // and pulls back as it goes, at the same speed the page's other rules
  // draw (useRevealOnScroll: 0.9s power3.inOut). The retract is half that:
  // the header is fading out over 0.5s at the same time and a line still
  // shrinking after the words have gone reads as lag.
  useEffect(() => {
    const rule = ruleRef.current;
    if (!rule) return;
    const reduced = prefersReducedMotion();
    gsap.to(rule, {
      duration: reduced ? 0 : shown ? 0.9 : 0.45,
      ease: "power3.inOut",
      overwrite: true,
      scaleX: shown ? 1 : 0,
      transformOrigin: "0% 50%",
    });
  }, [shown]);

  // The underline under the current word. One element, moved with translate
  // and scaled to the word's width, so the slide between words is two
  // transforms and never a layout. Word offsets are read here, on a change
  // of word or of layout, never on scroll.
  useEffect(() => {
    const mark = markRef.current;
    if (!mark) return;
    const reduced = prefersReducedMotion();

    const place = (animate: boolean) => {
      const item = active ? itemRefs.current[active] : null;
      const duration = animate && !reduced ? 0.5 : 0;
      if (!item) {
        if (markShownRef.current) {
          gsap.to(mark, {
            duration,
            ease: "power3.inOut",
            overwrite: true,
            scaleX: 0,
          });
        }
        markShownRef.current = false;
        return;
      }
      // offsetLeft is relative to the nav, which is the mark's parent.
      const x = item.offsetLeft;
      const width = item.offsetWidth;
      if (!markShownRef.current) {
        // Nothing was underlined: appear under this word rather than
        // sliding in from wherever the mark was last left.
        gsap.set(mark, { scaleX: 0, x });
      }
      gsap.to(mark, {
        duration,
        ease: "power3.inOut",
        overwrite: true,
        scaleX: width,
        transformOrigin: "0% 50%",
        x,
      });
      markShownRef.current = true;
    };

    placeMarkRef.current = place;
    place(true);
    return () => {
      if (placeMarkRef.current === place) placeMarkRef.current = null;
    };
  }, [active]);

  // A resize, or the display serif arriving after the fallback, changes
  // where the words sit. Re-place the mark without a slide.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(() => placeMarkRef.current?.(false));
    observer.observe(nav);
    for (const item of Object.values(itemRefs.current)) {
      if (item) observer.observe(item);
    }
    return () => observer.disconnect();
  }, []);

  // Durations: see scrollWithLenis. These are buttons, not anchors, so
  // without Lenis they have to move the page themselves — and they do it in
  // one step, not with behavior "smooth": Lenis is absent because
  // SmoothScroll stood down for prefers-reduced-motion (or failed), and
  // either way an eased scroll is the wrong answer.
  const jump = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    if (!scrollWithLenis(element, 1.4)) element.scrollIntoView();
  };

  const toTop = () => {
    if (!scrollWithLenis(0, 2)) window.scrollTo(0, 0);
  };

  return (
    <header
      className={
        "fixed inset-x-0 top-0 z-40 flex items-baseline justify-between " +
        "px-6 py-5 transition-[opacity,color] duration-500 motion-reduce:transition-none sm:px-16 sm:py-7 " +
        (onLight ? "text-[#0a0a0a] " : "text-[#f0f0f0] ") +
        (shown ? "opacity-100" : "pointer-events-none opacity-0")
      }
      // Invisible is not the same as gone: without this a keyboard user on
      // the hero could tab into four buttons they cannot see.
      inert={!shown}
    >
      {/* A short fade of the ground behind the bar. The header is fixed, so
          the rows of Info scroll under it and the name landed on top of
          them; the reference has the same fixed header but so much empty
          margin at the top of each screen that nothing ever meets it. The
          gradient is invisible over flat areas and only shows up when there
          is type underneath. It flips with the section, like the text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 transition-opacity duration-500"
        style={{
          // Solid across the band the type actually sits in, then a fade.
          // A gradient that starts falling off immediately was only about
          // half opaque behind the words, so the narration read straight
          // through the bar at heading size.
          background: onLight
            ? "linear-gradient(to bottom, #f4ece1 0%, #f4ece1 48%, rgba(244,236,225,0) 100%)"
            : "linear-gradient(to bottom, #0a0a0a 0%, #0a0a0a 48%, rgba(10,10,10,0) 100%)",
        }}
      />
      {/* The hairline along the bottom edge, in the page's rule weight
          (BranchRule's resting hairline is white at 25%). Inset to the
          type's margins, like the rules under the work rows. currentColor,
          so it flips to black over Contact with the words. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-6 right-6 block h-px origin-left bg-current opacity-25 sm:left-16 sm:right-16"
        ref={ruleRef}
        style={{ transform: "scaleX(0)" }}
      />
      <button
        className={
          "font-serif-display text-[1.05rem] transition-opacity duration-200 hover:opacity-60 motion-reduce:transition-none sm:text-[1.2rem] " +
          FOCUS_RING
        }
        onClick={toTop}
        type="button"
      >
        Kevin He
      </button>

      <nav
        aria-label="Sections"
        className="relative flex items-baseline gap-8 sm:gap-14"
        ref={navRef}
      >
        {sectionLinks.map((link) => (
          <button
            aria-current={active === link.id ? "true" : undefined}
            className={
              "font-serif-display text-[1.05rem] transition-opacity duration-300 motion-reduce:transition-none sm:text-[1.2rem] " +
              (active === link.id ? "opacity-100 " : "opacity-45 hover:opacity-100 ") +
              FOCUS_RING
            }
            key={link.id}
            onClick={() => jump(link.id)}
            ref={(el) => {
              itemRefs.current[link.id] = el;
            }}
            type="button"
          >
            {link.label}
          </button>
        ))}
        {/* The underline. 1px wide and scaled to the word, so width is a
            transform too. Stronger than the edge rule: it is a marker, the
            other is a border. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-1 left-0 block h-px w-px origin-left bg-current opacity-70"
          ref={markRef}
          style={{ transform: "scaleX(0)" }}
        />
      </nav>
    </header>
  );
}
