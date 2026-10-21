"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type JSX, useEffect, useId, useRef, useState } from "react";

import { RollText } from "@/components/luke/contact-roll";
import SkillTile from "@/components/luke/skills-icon";
import { SKILLS } from "@/components/luke/skills-data";
import { ACCENT, GROUND, INK, RULE, Serif } from "@/components/luke/theme";
import { EMAIL } from "@/components/siteContent";

gsap.registerPlugin(ScrollTrigger);

/**
 * Skills, laid out as lukebaffait.fr lays out his, in this site's type.
 *
 * The header, "Skills", large in the band's italic display serif. Under it,
 * at the left and held in place while the page goes by: one statement in
 * the same serif, a rule, "CONTACT ME", and a big rose arrow that slides
 * right as the page scrolls. At the right, the skill groups as an
 * accordion, the first open, each a large name with a plus (a minus when
 * open); an open group shows its tools as the site's pink icon tiles
 * (skills-icon.tsx) with their names.
 *
 * The page never stops: only the left column sticks, inside the section,
 * while the right column scrolls by.
 *
 * Reduced motion: the arrow stays put and the groups open without easing.
 */

const STATEMENT = "Computer engineering student in Toronto, co‑founder and CTO of The Actually Company, lead programmer of VEX team 82855Z.";

export default function Skills(): JSX.Element {
  const root = useRef<HTMLElement | null>(null);
  const arrow = useRef<SVGSVGElement | null>(null);
  const [open, setOpen] = useState(0);
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ctx = gsap.context(() => {
      if (arrow.current) {
        gsap.fromTo(
          arrow.current,
          { xPercent: -60 },
          { xPercent: 90, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.4 } },
        );
      }
      gsap.from("[data-word]", {
        y: 18,
        opacity: 0,
        filter: "blur(6px)",
        duration: 1,
        ease: "expo.out",
        stagger: 0.025,
        scrollTrigger: { trigger: "[data-statement]", start: "top 85%", once: true },
      });
      gsap.from("[data-group]", {
        y: 30,
        opacity: 0,
        duration: 1,
        ease: "expo.out",
        stagger: 0.06,
        scrollTrigger: { trigger: "[data-groups]", start: "top 85%", once: true },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section aria-labelledby={`${base}-title`} className="relative overflow-x-clip font-sans" ref={root} style={{ backgroundColor: GROUND, color: INK }}>
      <div className="px-4 pb-[30vh] pt-[18vh] sm:px-[8vw]">
        <h2
          className="mb-[10vh] pb-[0.1em] pl-[0.08em] pr-[0.1em] text-[clamp(64px,17vw,120px)] leading-[0.95] tracking-[-0.03em] lg:text-[min(22vh,9vw)]"
          id={`${base}-title`}
        >
          <Serif text="Skills" />
        </h2>

        <div className="grid gap-y-[10vh] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-x-[6vw]">
          {/* Left: held while the groups go by. */}
          <div className="lg:sticky lg:top-[14vh] lg:self-start">
            <p className="max-w-[22ch] text-[clamp(28px,2.8vw,110px)] leading-[1.1] tracking-[-0.02em]" data-statement>
              <span className="sr-only">{STATEMENT}</span>
              <span aria-hidden="true">
                {STATEMENT.split(" ").map((w, i) => (
                  <span className="inline-block pb-[0.08em] pr-[0.06em] align-top" key={i}>
                    <span className="inline-block" data-word>
                      <Serif text={w} />
                    </span>
                    &nbsp;
                  </span>
                ))}
              </span>
            </p>
            <div className="mt-[max(2.4rem,20px)] h-px w-full" style={{ backgroundColor: RULE }} />
            <a
              className="group mt-[max(2.4rem,20px)] inline-flex items-center gap-[0.4em] rounded-sm text-[max(1.1rem,11px)] font-medium uppercase outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4"
              href={`mailto:${EMAIL}`}
            >
              <RollText text="Contact me" />
              <span aria-hidden="true">✦</span>
            </a>
            <svg aria-hidden="true" className="mt-[10vh] block w-[clamp(90px,8vw,260px)]" fill={ACCENT} ref={arrow} viewBox="0 0 100 64">
              <path d="M0 24h62L41 3l9-3 50 32-50 32-9-3 21-21H0z" />
            </svg>
          </div>

          {/* Right: the groups. */}
          <ul data-groups>
            {SKILLS.map((g, i) => {
              const on = open === i;
              const btn = `${base}-b${i}`;
              const panel = `${base}-p${i}`;
              return (
                <li className="border-t py-[max(1.8rem,16px)]" data-group key={g.label} style={{ borderColor: RULE }}>
                  <h3>
                    <button
                      aria-controls={panel}
                      aria-expanded={on}
                      className="flex w-full items-center justify-between gap-6 rounded-sm text-left text-[clamp(26px,2.6vw,100px)] tracking-[-0.02em] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4"
                      id={btn}
                      onClick={() => setOpen(on ? -1 : i)}
                      type="button"
                    >
                      <span className="pb-[0.08em] pr-[0.1em]">
                        <Serif text={g.label} />
                      </span>
                      <span aria-hidden="true" className="font-sans text-[0.6em] font-light opacity-70">
                        {on ? "−" : "+"}
                      </span>
                    </button>
                  </h3>
                  <div
                    aria-labelledby={btn}
                    className="grid transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                    id={panel}
                    inert={!on}
                    role="region"
                    style={{ gridTemplateRows: on ? "1fr" : "0fr" }}
                  >
                    <div className="overflow-hidden">
                      <ul className="flex flex-wrap gap-x-[max(1.2rem,10px)] gap-y-[max(1.4rem,12px)] pb-[0.4rem] pt-[max(1.8rem,16px)]">
                        {g.skills.map((s) => (
                          <li className="flex w-[max(4.6vw,60px)] flex-col items-center gap-[max(0.6rem,6px)] text-center" key={s.name}>
                            <SkillTile size="max(3.2vw,42px)" skill={s} />
                            <span className="text-[clamp(10px,0.78vw,24px)] leading-[1.25] opacity-70">{s.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
