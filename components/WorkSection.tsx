"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Narration, Stanza } from "@/components/Narration";
import Rule from "@/components/Rule";
import { GITHUB, workEntries, type WorkEntry } from "@/components/siteContent";

gsap.registerPlugin(ScrollTrigger);

/**
 * The projects, laid out after etiennepharabot.fr's 2021 portfolio and
 * rendered where that site renders them: straight after the sentence
 * about me, on the same ground. This sits inside HeroIntro's about-and-
 * work run, over the pinned stage — the black the narration ends on, with
 * the tree flowering in as the heading arrives (see HeroIntro's scroll
 * effect and NarrationScene) — so nothing is handed off between the
 * words and the work.
 *
 * Each work in the reference is a counter, a title at heading size and
 * one line under it, centred in a block of its own. That is all a project
 * gets here. (A dithered tile stood beside each one for a round, as the
 * reference's photograph; Kevin had it taken out.)
 */

/**
 * One project.
 *
 * The reference's move is that nothing in the block sits still while you
 * scroll past it: the text drifts sideways (locomotive-scroll's
 * data-scroll-speed, 2 and -2, flipping block by block). Here that is one
 * scrubbed ScrollTrigger per block, on a wrapper the reveal does not
 * touch — the reveal writes y and opacity on the [data-reveal] children
 * as inline styles, and two tweens on one element's transform fight.
 * Skipped under reduced motion.
 */
function WorkItem({ entry, index }: { entry: WorkEntry; index: number }) {
  const rootRef = useRef<HTMLLIElement | null>(null);
  // "01" — the reference's counter, above the title. Two digits in the
  // sans, so "04" is a number and not the display serif's flower.
  const number = String(index + 1).padStart(2, "0");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }
    const text = root.querySelector<HTMLElement>("[data-work-text]");
    if (!text) return undefined;
    const context = gsap.context(() => {
      // Alternating, block by block, the reference's own flip.
      const away = index % 2 === 0 ? 1 : -1;
      // 24px each way, not 36: a drift, not a slide. The reference's own
      // speed-2 lines move about this far over a block's transit.
      gsap.fromTo(
        text,
        { x: -away * 24 },
        {
          ease: "none",
          scrollTrigger: {
            end: "bottom top",
            scrub: 0.4,
            start: "top bottom",
            trigger: root,
          },
          x: away * 24,
        },
      );
    }, root);
    return () => context.revert();
  }, [index]);

  const title = (
    // 7vw, down from 9: 90px at 1280 where it was 115. The reference's
    // titles are 100px at that width, but its lines are one and two words
    // and these run to three and four; at 9vw "The Actually Company" was
    // the full width of the screen. No arrow glyph on hover: the list
    // dimming around the block is the hover, as in the reference.
    <h3 className="font-serif-display text-[clamp(2.2rem,7vw,6.4rem)] leading-[1.05] tracking-[-0.02em] [text-wrap:balance]">
      {entry.title}
    </h3>
  );

  return (
    <li
      className="group relative flex flex-col items-center py-14 sm:min-h-[46vh] sm:justify-center sm:py-12"
      ref={rootRef}
    >
      <div className="relative z-[1] w-full text-center" data-work-text>
        <p
          className="text-[0.8rem] uppercase tracking-[0.1em] opacity-55 transition-opacity duration-300 group-hover:opacity-80 motion-reduce:transition-none"
          data-reveal
        >
          {number}
        </p>
        <div className="mt-4" data-reveal="far">
          {entry.href ? (
            <a
              className="inline-block"
              href={entry.href}
              rel="noreferrer"
              target="_blank"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </div>
        <p
          className="mx-auto mt-5 max-w-[30rem] text-[0.95rem] leading-[1.7] opacity-55 transition-opacity duration-300 group-hover:opacity-85 motion-reduce:transition-none"
          data-reveal
        >
          {entry.description}
        </p>
      </div>
    </li>
  );
}

export default function WorkSection() {
  return (
    // Top padding is the beat between the last line of the narration
    // leaving and the heading arriving — the stretch the tree flowers in
    // over (HeroIntro). Bottom padding is the run's last screen, where the
    // blossom scene fades out before the Contact plate.
    <section className="relative px-6 pb-[18vh] pt-[28vh] sm:px-16" id="work">
      <h2 className="sr-only">Work</h2>
      {/* z-[1] over the run's fixed canvas (NarrationScene), the same way
          the narration's lines sit over it. */}
      <div className="relative z-[1]">
        {/* Same size as the narration, because it is the next clause of it:
            the reference names its own list at the same size as its
            sentence. */}
        <Narration>
          <Stanza
            far
            lines={[
              {
                indent: 4,
                runs: [
                  { text: "Selected", voice: "soft" },
                  { text: "work", voice: "strong" },
                ],
              },
            ]}
          />
        </Narration>

        {/* Projects, each in a block of its own, the way the reference
            gives every work most of a screen. No rules between them; the
            list is closed at the bottom by the one rule before the GitHub
            line. */}
        <ol className="mt-12 sm:mt-16" data-work-list>
          {workEntries.map((entry, index) => (
            <WorkItem entry={entry} index={index} key={entry.title} />
          ))}
        </ol>
        <Rule className="mt-8 sm:mt-12" />
        <p className="mt-12" data-reveal>
          <a
            className={
              "font-serif-display text-[1.05rem] italic opacity-60 transition-opacity duration-200 hover:opacity-100 motion-reduce:transition-none"
            }
            href={GITHUB}
            rel="noreferrer"
            target="_blank"
          >
            The rest is on GitHub {"↗"}
          </a>
        </p>
      </div>
    </section>
  );
}
