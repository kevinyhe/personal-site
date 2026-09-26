"use client";

import { useCallback, useRef, useState, type JSX } from "react";

import NeedleSeam from "@/components/NeedleSeam";
import PetalReveal from "@/components/PetalReveal";
import Rule from "@/components/Rule";
import SectionHeader from "@/components/SectionHeader";
import { scrollToSection } from "@/components/SectionLink";
import { EMAIL, elsewhere, workEntries } from "@/components/siteContent";
import { useRevealOnScroll } from "@/components/useRevealOnScroll";
import { BAND, BLOSSOM } from "@/components/bandColours";


/**
 * The rest of the page: the work, and how to reach me. Who I am is the
 * pinned band above (StatementSection), which is where the Info link goes.
 *
 * On the aurora. The band above ends in needles (NeedleSeam, the
 * reference's own device) hanging down over it. Little text, on purpose;
 * each block lands with a petal or two crossing it (PetalReveal).
 */

/** The four lines: one face, one size, four cuts. */
/** A four-point star, the reference's own mark. */
function Star(): JSX.Element {
  return (
    <svg aria-hidden="true" className="h-2 w-2" fill="currentColor" viewBox="0 0 8 8">
      <path d="M0 4C2.2 4 4 2.2 4 0c0 2.2 1.8 4 4 4-2.2 0-4 1.8-4 4 0-2.2-1.8-4-4-4Z" />
    </svg>
  );
}

/** Three stars and one word: the reference's section title. */
function Caption({ children }: { children: string }): JSX.Element {
  return (
    <div className="mb-[10vh]">
      <Rule />
      <p
        className="mt-5 flex items-center gap-3 text-[0.72rem] uppercase tracking-[0.2em]"
        data-reveal="slide"
        style={{ color: BLOSSOM }}
      >
        <span className="flex items-center gap-1.5 opacity-70">
          <Star />
          <Star />
          <Star />
        </span>
        <span className="opacity-80">{children}</span>
      </p>
    </div>
  );
}

export default function BelowIntro(): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  useRevealOnScroll(rootRef);

  // The clipboard call can be refused (no permission, no secure context);
  // the mailto link beside the button still works either way.
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* nothing to do */
    }
  }, []);

  return (
    // z-10, the same as the band above it, so the needles that hang from
    // that band paint on top of it.
    <div className="relative z-10 text-[#f0f0f0]" data-below-intro ref={rootRef}>
      <SectionHeader />

      {/* The band above ends in needles hanging down over the aurora. */}
      <NeedleSeam className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[40vh] w-full" colour={BAND} />

      <section className="relative z-[1] px-6 pb-[18vh] pt-[44vh] sm:px-16" id="work">
        <div className="mx-auto max-w-[68rem]">
          <Caption>Selected work</Caption>
          <ul>
            {workEntries.map((entry, index) => {
              const number = String(index + 1).padStart(2, "0");
              const row = (
                <div className="grid grid-cols-[3rem_1fr] items-baseline gap-x-6 gap-y-3 py-[3.5vh] sm:grid-cols-[4rem_1fr_22rem]">
                  <p className="text-[0.72rem] tabular-nums" style={{ color: BLOSSOM, opacity: 0.6 }}>
                    {number}
                  </p>
                  <h3 className="font-serif-display text-[clamp(1.7rem,3.4vw,3.2rem)] leading-[1.05] tracking-[-0.02em]">
                    {entry.title}
                  </h3>
                  <p className="col-start-2 max-w-[34ch] text-[0.95rem] leading-[1.5] opacity-55 sm:col-start-3">
                    {entry.description}
                  </p>
                </div>
              );
              return (
                <PetalReveal as="li" delay={index * 0.06} key={entry.title} petals={1} travel={36}>
                  <Rule />
                  {entry.href ? (
                    <a
                      className="block transition-opacity duration-300 hover:opacity-60 motion-reduce:transition-none"
                      href={entry.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {row}
                    </a>
                  ) : (
                    row
                  )}
                </PetalReveal>
              );
            })}
            <li>
              <Rule />
            </li>
          </ul>
        </div>
      </section>

      <section className="relative z-[1] px-6 pb-[10vh] sm:px-16" id="contact">
        <div className="mx-auto max-w-[68rem]">
          <Caption>Contact</Caption>
          <PetalReveal
            as="p"
            className="mb-[6vh] max-w-[26ch] font-serif-display text-[clamp(1.8rem,3.8vw,3.6rem)] leading-[1.1] tracking-[-0.02em]"
            petals={2}
            travel={48}
          >
            Got a hard problem? <span className="italic">Write to me.</span>
          </PetalReveal>

          {/* Inter, not the display serif: that cut is a Fontspring DEMO and
              draws a watermark flower for "@", so an address set in it would
              not be the address. */}
          <PetalReveal className="flex flex-wrap items-baseline gap-x-8 gap-y-4" petals={0} travel={32}>
            <a
              className="block break-all text-[clamp(1.4rem,4vw,3.6rem)] leading-[1.05] tracking-[-0.03em] transition-opacity duration-300 hover:opacity-60 motion-reduce:transition-none"
              href={`mailto:${EMAIL}`}
            >
              {EMAIL}
            </a>
            <button
              className="text-[0.78rem] uppercase tracking-[0.18em] transition-opacity duration-200 hover:opacity-100 motion-reduce:transition-none"
              onClick={copy}
              style={{ color: BLOSSOM, opacity: copied ? 1 : 0.7 }}
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </PetalReveal>

          <div
            className="mt-[10vh] flex flex-wrap items-baseline gap-x-8 gap-y-3 text-[0.9rem]"
            data-reveal="slide"
          >
            {elsewhere.map((link) => (
              <a
                className="underline decoration-white/25 underline-offset-[5px] transition-[text-decoration-color] duration-200 hover:decoration-white motion-reduce:transition-none"
                href={link.href}
                key={link.label}
                rel="noreferrer"
                target="_blank"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="mt-[12vh]">
            <Rule />
            <div
              className="mt-4 flex items-baseline justify-between text-[0.72rem] uppercase tracking-[0.18em] opacity-45"
              data-reveal="slide"
            >
              <span>{"©"} 2026 Kevin He</span>
              <button
                className="uppercase tracking-[0.18em] transition-opacity duration-200 hover:opacity-100 motion-reduce:transition-none"
                onClick={() => scrollToSection(0, 2)}
                type="button"
              >
                Back to top {"↑"}
              </button>
            </div>
          </div>
          <div className="h-[8vh]" />
        </div>
      </section>
    </div>
  );
}
