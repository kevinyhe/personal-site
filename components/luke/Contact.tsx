"use client";

import { type CSSProperties, type JSX, useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import BarPicture from "@/components/below/barPicture";
import { RollText } from "@/components/luke/contact-roll";
import { BLOSSOM, GROUND, MAUVE } from "@/components/luke/theme";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { useTvUp } from "@/components/tvUp";

gsap.registerPlugin(ScrollTrigger);

/**
 * Contact, after lukebaffait.fr: a pink panel (the band's pink) that opens over the dark page
 * as a circle growing up from the bottom of the screen, then scrolls on like
 * a sheet of paper. On it: a giant "Contact", where Kevin is, his links and
 * his email, and the two hands from Michelangelo's Creation of Adam in plum
 * bars (public/work/hand-adam.png, hand-god.png: the fresco detail from
 * Wikimedia Commons, public domain), Adam's sliding in from the left edge
 * and God's from the right as the page scrolls, as lukebaffait's end page uses the same hands. The panel's rounded bottom edge is the last thing of it to
 * leave, uncovering the dark end page (components/Ending.tsx) below.
 *
 * With reduced motion the panel is simply there, no circle, nothing rising.
 */

const LINKS = elsewhere.filter((l) => l.label === "GitHub" || l.label === "LinkedIn" || l.label === "X");

const TITLE = "Contact";

export default function Contact(): JSX.Element {
  const root = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const disc = useRef<HTMLDivElement | null>(null);

  const tvUp = useTvUp();
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
    // The circle clips the panel, so on its own it would be cut flat at
    // the panel's top edge once it grows past it. The disc is the same
    // circle drawn OUTSIDE the panel, in the panel's colour, so the part
    // above the panel's top edge is still there.
    const dotEl = disc.current;
    const grow = (t: number): void => {
      const dot = dotEl;
      if (t >= 1) {
        sheet.style.clipPath = "none";
        if (dot) dot.style.visibility = "hidden";
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      const full = Math.hypot(w / 2, h) * 1.02;
      const r = full * Math.pow(Math.max(0, t), 1.25);
      const cy = t * h;
      sheet.style.clipPath = `circle(${r.toFixed(1)}px at 50% ${cy.toFixed(1)}px)`;
      if (dot) {
        dot.style.visibility = r > 0.5 ? "visible" : "hidden";
        dot.style.width = `${(2 * r).toFixed(1)}px`;
        dot.style.height = `${(2 * r).toFixed(1)}px`;
        dot.style.transform = `translate(-50%, -50%) translateY(${cy.toFixed(1)}px)`;
      }
    };

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
        const inner = fig.querySelector("[data-fig-inner]");
        if (inner) {
          gsap.fromTo(
            inner,
            { yPercent: -6 },
            { yPercent: 6, ease: "none", scrollTrigger: { trigger: fig, start: "top bottom", end: "bottom top", scrub: true } },
          );
        }
      });

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
      sheet.style.clipPath = "";
      if (dotEl) dotEl.style.visibility = "hidden";
    };
  }, [tvUp]);

  const vars = { "--g": "max(7vw, 20px)", backgroundColor: BLOSSOM, color: MAUVE } as CSSProperties;

  return (
    <section aria-labelledby="contact-panel-title" id="contact" className="relative font-sans" ref={root} style={{ backgroundColor: GROUND }}>
      {/* The opening circle's part above the panel's top edge (see grow). */}
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-1/2 top-0 z-[1] rounded-full motion-reduce:hidden"
        ref={disc}
        style={{ backgroundColor: BLOSSOM }}
      />
      <div className="relative z-[2] overflow-hidden rounded-[max(2.4rem,18px)] px-[var(--g)]" ref={panel} style={vars}>
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[100svh_auto] lg:gap-x-[2vw]">
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
            src="/work/hand-god.png"
          />

          {/* Where. */}
          <div className="mt-[12svh] lg:col-span-3 lg:col-start-6 lg:row-start-2 lg:mt-[14vh] lg:self-start" data-col>
            <p className="text-[clamp(20px,1.9vw,42px)] leading-[1.2] tracking-[-0.02em]">
              Toronto, Canada
            </p>
          </div>

          {/* Links and email. */}
          <div className="mt-[8svh] lg:col-span-4 lg:col-start-9 lg:row-start-2 lg:mb-[16vh] lg:mt-[40vh] lg:self-end" data-col>
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
                      style={{ color: MAUVE }}
                    >
                      {l.handle}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <a
              className="group mt-[clamp(20px,4vh,44px)] inline-block rounded-sm text-[clamp(15px,1.15vw,24px)] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-current"
              href={`mailto:${EMAIL}`}
            >
              <RollText step={10} text={EMAIL} />
            </a>
          </div>

          {/* Adam's hand, reaching in from the left edge. */}
          <Figure
            alt="Adam's hand from Michelangelo's Creation of Adam, drawn in bars"
            className="mb-[14svh] mt-[12svh] h-[66vw] w-[102vw] -ml-[calc(var(--g)_+_10vw)] lg:col-span-5 lg:col-start-1 lg:row-start-2 lg:mb-[16vh] lg:mt-[24vh] lg:h-[33vw] lg:w-[51vw] lg:self-end lg:-ml-[calc(var(--g)_+_4vw)]"
            from="left"
            src="/work/hand-adam.png"
          />
        </div>
      </div>
    </section>
  );
}

/** A picture drawn in rose bars, with lukebaffait's small "+" marks
 *  at its corners. The drawing is a little taller than the frame so it can
 *  drift inside it as the page scrolls. */
function Figure({ src, alt, className, from }: { src: string; alt: string; className: string; from: "left" | "right" }): JSX.Element {
  return (
    <figure className={`relative overflow-hidden ${className}`} data-fig data-fig-from={from}>
      <div className="absolute inset-x-0 -top-[7%] h-[114%]" data-fig-inner>
        <div className="absolute inset-0" data-fig-idle>
          <BarPicture alt={alt} cell={5} ink={MAUVE} source={src} />
        </div>
      </div>
      {["left-[10px] top-[6px]", "right-[10px] top-[6px]", "bottom-[6px] left-[10px]", "bottom-[6px] right-[10px]"].map((pos) => (
        <span aria-hidden="true" className={`absolute ${pos} text-[14px] font-light leading-none opacity-50`} key={pos}>
          +
        </span>
      ))}
    </figure>
  );
}
