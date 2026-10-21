"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import BarPicture from "@/components/below/barPicture";
import { ACCENT, BLOSSOM, Count, Em, GROUND, INK, Rail } from "@/components/luke/theme";

gsap.registerPlugin(ScrollTrigger);

/**
 * Who I am, after lukebaffait.fr's About: one big sentence in sans with
 * its key words in the italic display serif, a tiny paragraph under it,
 * and a portrait in a large rounded frame on the right that runs off the
 * edge of the screen.
 *
 * The sentence comes in a line at a time, each line going from blurred
 * and faint to sharp as it scrolls up the screen; the paragraph does the
 * same after it. The line breaks are set by hand, two lines on a wide
 * screen and four on a narrow one, so the italic phrases never split
 * badly; a screen reader gets the sentence once, whole.
 *
 * The portrait is public/work/s-kbd67.jpg (holding the S-KBD67 blaster)
 * drawn in the site's bars (components/below/barPicture), over a rose glow
 * where lukebaffait has a red wall. It slides in from the right through a
 * blur, a stand-in for his motion blur, and drifts up a little slower than
 * the page on a wide screen. "→ 2026" sits over it where his "→ V3.0" is.
 *
 * At the left edge the bracketed count shows how far down the page you
 * are, in percent, as lukebaffait's does; the "About" rail is on the
 * right. Both hold still while the section passes (sticky), and both are
 * hidden on phones, where the portrait goes under the text.
 *
 * With reduced motion everything is shown sharp and in place.
 */

const PARAGRAPH = [
  "Kevin He. Computer engineering",
  "at the University of Toronto,",
  "co-founder and CTO of",
  "The Actually Company, lead",
  "programmer of VEX team 82855Z.",
];

/** An italic phrase, tinted blossom. */
function Word({ children }: { children: string }): JSX.Element {
  return (
    <span style={{ color: BLOSSOM }}>
      <Em>{children}</Em>
    </span>
  );
}

const lineClass = "block whitespace-nowrap pb-[0.1em] pl-[0.02em] pr-[0.12em]";

export default function About(): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const [count, setCount] = useState(22);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const q = <T extends Element>(sel: string): T[] => Array.from(root.querySelectorAll<T>(sel));

    let shown = -1;
    const updateCount = (): void => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const n = Math.max(0, Math.min(99, Math.round((window.scrollY / Math.max(1, max)) * 100)));
      if (n !== shown) {
        shown = n;
        setCount(n);
      }
    };

    // Lines from faint and blurred to sharp, one after another, scrubbed.
    const reveal = (lines: Element[], trigger: Element, start: string, end: string): void => {
      if (!lines.length) return;
      gsap.fromTo(
        lines,
        { opacity: 0.08, filter: "blur(12px)", y: "0.22em" },
        {
          opacity: 1,
          filter: "blur(0px)",
          y: 0,
          ease: "none",
          stagger: 0.4,
          scrollTrigger: { trigger, start, end, scrub: 0.5 },
        },
      );
    };

    const context = gsap.context(() => {
      ScrollTrigger.create({ trigger: root, start: "top bottom", end: "bottom top", onUpdate: updateCount, onRefresh: updateCount });
      if (reduced) return;

      const para = root.querySelector("[data-para]");
      if (para) reveal(q("[data-para] [data-line]"), para, "top 88%", "bottom 62%");

      const frame = root.querySelector("[data-frame]");
      const pane = root.querySelector("[data-pane]");
      const mark = root.querySelector("[data-mark]");
      if (frame && pane) {
        gsap.fromTo(
          pane,
          { x: "6vw", opacity: 0, filter: "blur(18px)" },
          { x: 0, opacity: 1, filter: "blur(0px)", ease: "power1.out", scrollTrigger: { trigger: frame, start: "top 95%", end: "top 35%", scrub: 0.6 } },
        );
      }
      if (mark) {
        gsap.fromTo(
          mark,
          { opacity: 0, x: "-0.5em", filter: "blur(8px)" },
          { opacity: 1, x: 0, filter: "blur(0px)", ease: "none", scrollTrigger: { trigger: mark, start: "top 88%", end: "top 58%", scrub: 0.5 } },
        );
      }

      // The sentence's two sets of lines (wide and narrow) and the frame's
      // drift: only the set that is showing is animated.
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        const head = root.querySelector("[data-head='wide']");
        if (head) reveal(q("[data-head='wide'] [data-line]"), head, "top 82%", "bottom 48%");
        if (frame) gsap.fromTo(frame, { yPercent: 7 }, { yPercent: -7, ease: "none", scrollTrigger: { trigger: root, start: "top bottom", end: "bottom top", scrub: true } });
      });
      mm.add("(max-width: 1023px)", () => {
        const head = root.querySelector("[data-head='narrow']");
        if (head) reveal(q("[data-head='narrow'] [data-line]"), head, "top 85%", "bottom 55%");
      });
    }, root);

    updateCount();
    return () => context.revert();
  }, []);

  return (
    <section className="relative flex flex-col overflow-x-clip pb-[16vh] pt-[14vh] lg:min-h-[160vh] lg:pb-[20vh] lg:block lg:pt-[32vh]" ref={rootRef} style={{ backgroundColor: GROUND, color: INK }}>
      {/* The count and the rail, held on screen while the section passes. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
        <div className="sticky top-0 h-[100vh]">
          <Count className="absolute left-[max(2vw,16px)] top-1/2 -translate-y-1/2" n={count} />
          <Rail label="About" />
        </div>
      </div>

      {/* The portrait. Under the text on a phone; on a wide screen, the
          right half, from above the sentence to below the paragraph. */}
      <div
        className="relative z-0 ml-[max(4vw,16px)] mr-[-10vw] mt-0 h-[min(118vw,640px)] max-lg:order-last lg:absolute lg:right-[-6vw] lg:top-[6vh] lg:m-0 lg:h-[128vh] lg:w-[55vw]"
        data-frame
      >
        {/* The glow behind it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[12%]"
          style={{ background: `radial-gradient(48% 46% at 40% 45%, ${BLOSSOM}38, ${ACCENT}1f 45%, transparent 72%)` }}
        />
        <div
          className="absolute inset-0 overflow-hidden rounded-l-[18vw] lg:rounded-l-[11vw]"
          data-pane
          style={{ background: `radial-gradient(120% 85% at 78% 22%, ${ACCENT} 0%, #7a1d48 30%, #2a0b1f 66%, ${GROUND} 100%)` }}
        >
          <BarPicture alt="Kevin holding the S-KBD67 blaster controller" cell={6} className="absolute inset-0" ink={INK} source="/work/s-kbd67.jpg" />
          {/* Darker on the left, where the sentence crosses it. */}
          <div aria-hidden="true" className="absolute inset-0 hidden lg:block" style={{ background: `linear-gradient(to right, ${GROUND}b3, transparent 38%)` }} />
        </div>
        <div
          aria-hidden="true"
          className="absolute left-[max(4vw,24px)] top-[40%] flex items-center gap-[0.3em] whitespace-nowrap font-sans text-[max(3.4vw,30px)] font-light leading-none tracking-[-0.02em] lg:left-[3.4vw]"
          data-mark
        >
          <span style={{ color: ACCENT }}>→</span>
          <span>2026</span>
        </div>
      </div>

      <div className="relative z-10 px-[max(4vw,16px)] max-lg:mb-[8vh]">
        <h2 className="font-sans font-normal tracking-[-0.025em]">
          <span className="sr-only">As a computer engineer, I build systems that bring ideas to life.</span>
          <span aria-hidden="true" className="hidden text-[3.4vw] leading-[1.34] lg:block" data-head="wide">
            <span className={lineClass} data-line>
              As a <Word>computer engineer</Word>, I build
            </span>
            <span className={lineClass} data-line>
              systems that bring <Word>ideas to life</Word>.
            </span>
          </span>
          <span aria-hidden="true" className="block text-[max(8.6vw,30px)] leading-[1.22] lg:hidden" data-head="narrow">
            <span className={lineClass} data-line>
              As a <Word>computer</Word>
            </span>
            <span className={lineClass} data-line>
              <Word>engineer</Word>, I build
            </span>
            <span className={lineClass} data-line>
              systems that bring
            </span>
            <span className={lineClass} data-line>
              <Word>ideas to life</Word>.
            </span>
          </span>
        </h2>

        <p className="ml-[16vw] mt-[6vh] font-sans text-[max(1.45vw,15px)] font-normal leading-[1.62] lg:ml-[18.4vw] lg:mt-[14vh]" data-para>
          {PARAGRAPH.map((l) => (
            <span className={lineClass} data-line key={l}>
              {l}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
