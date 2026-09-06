"use client";

import { useEffect, useRef, useState } from "react";
import { sectionLinks } from "@/components/siteContent";

type LenisLike = {
  scrollTo: (target: HTMLElement | string | number, options?: object) => void;
};

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
 * No uppercase, no letter-spacing, no rules. Those were doing the work of
 * making small text look deliberate; at this size the serif does it.
 */
export default function SectionHeader() {
  const [active, setActive] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  // Contact is a cream block. A fixed header in the page's off-white would
  // be invisible the moment it crossed into it.
  const [onLight, setOnLight] = useState(false);
  const frameRef = useRef(0);

  useEffect(() => {
    const read = () => {
      frameRef.current = 0;
      // Whichever section's top has most recently passed the upper third of
      // the viewport, which is where a reader's eye sits. The middle flips
      // late on a long section and early on a short one.
      const line = window.innerHeight * 0.34;
      let current: string | null = null;
      let anyOnScreen = false;
      for (const link of sectionLinks) {
        const element = document.getElementById(link.id);
        if (!element) continue;
        const box = element.getBoundingClientRect();
        if (box.bottom > 0 && box.top < window.innerHeight) anyOnScreen = true;
        if (box.top <= line) current = link.id;
      }
      setActive(current);
      setShown(anyOnScreen);

      const contact = document.getElementById("contact");
      if (contact) {
        const box = contact.getBoundingClientRect();
        // Measured against the header's own band, not the viewport top, so
        // the swap lands as the cream edge reaches the type rather than a
        // screen early.
        setOnLight(box.top <= 64 && box.bottom > 0);
      }
    };

    const schedule = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const jump = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    if (lenis) lenis.scrollTo(element, { duration: 1.4 });
    else element.scrollIntoView({ behavior: "smooth" });
  };

  const toTop = () => {
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    if (lenis) lenis.scrollTo(0, { duration: 2 });
    else window.scrollTo({ behavior: "smooth", top: 0 });
  };

  return (
    <header
      className={
        "fixed inset-x-0 top-0 z-40 flex items-baseline justify-between " +
        "px-6 py-5 transition-[opacity,color] duration-500 sm:px-16 sm:py-7 " +
        (onLight ? "text-[#0a0a0a] " : "text-[#f0f0f0] ") +
        (shown ? "opacity-100" : "pointer-events-none opacity-0")
      }
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
      <button
        className="font-serif-display text-[1.05rem] transition-opacity duration-200 hover:opacity-60 sm:text-[1.2rem]"
        onClick={toTop}
        type="button"
      >
        Kevin He
      </button>

      <nav aria-label="Sections" className="flex items-baseline gap-8 sm:gap-14">
        {sectionLinks.map((link) => (
          <button
            aria-current={active === link.id ? "true" : undefined}
            className={
              "font-serif-display text-[1.05rem] transition-opacity duration-300 sm:text-[1.2rem] " +
              (active === link.id ? "opacity-100" : "opacity-45 hover:opacity-100")
            }
            key={link.id}
            onClick={() => jump(link.id)}
            type="button"
          >
            {link.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
