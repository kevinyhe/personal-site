"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

gsap.registerPlugin(ScrollTrigger);

/**
 * 05 POSTER. Kinetic type on white: the tagline at the width of the
 * screen, projects as cards that stack under each other as you scroll —
 * each one sticks and shrinks a step as the next arrives — and the skills
 * as marquee rows running opposite ways, every tool with its mark. One
 * accent, used for numbers and awards.
 */
const GROUND = "#f4f4f2";
const INK = "#0a0a0a";
const ACCENT = "#c7326e";

function Marquee({ items, reverse = false, seconds = 40 }: { items: { name: string; el: JSX.Element }[]; reverse?: boolean; seconds?: number }): JSX.Element {
  const row = (k: string) => (
    <div className="flex shrink-0 items-center gap-[3vw] pr-[3vw]" key={k}>
      {items.map((it) => (
        <span className="flex items-center gap-[0.8rem] whitespace-nowrap text-[clamp(1.6rem,3.2vw,3.6rem)] font-medium tracking-[-0.03em]" key={it.name}>
          {it.el}
          {it.name}
        </span>
      ))}
    </div>
  );
  return (
    <div className="marquee flex overflow-hidden border-y py-[1.1rem]" style={{ borderColor: "rgba(10,10,10,0.14)", ["--marquee-s" as string]: `${seconds}s`, ["--marquee-dir" as string]: reverse ? "reverse" : "normal" }}>
      <div className="flex">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

export default function Poster(): JSX.Element {
  const stackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = stackRef.current;
    if (!root) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
    const ctx = gsap.context(() => {
      cards.forEach((card, i) => {
        if (i === cards.length - 1) return;
        const next = cards[i + 1];
        gsap.to(card, {
          scale: 0.94,
          opacity: 0.35,
          ease: "none",
          scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true },
        });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  const rows = skillGroups.map((g) => g.skills.map((s) => ({ name: s.name, el: <SkillMark onDark={false} size="0.85em" skill={s} /> })));

  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} n={5}>
      <section className="px-[3vw] pb-[6vh] pt-[12vh]">
        <p className="text-[0.75rem] uppercase tracking-[0.3em]" data-reveal style={{ color: ACCENT }}>
          Kevin He · Toronto
        </p>
        <h1 className="mt-[1.4rem] text-[clamp(3.6rem,10.4vw,11.5rem)] font-medium leading-[0.88] tracking-[-0.05em]" data-reveal>
          Software
          <br />
          for things
          <br />
          <span className="font-serif-display font-normal italic tracking-[-0.03em]">that move.</span>
        </h1>
        <div className="mt-[3rem] grid grid-cols-[1fr_1fr_1fr] gap-[3vw] border-t pt-[1.4rem] text-[0.95rem] leading-[1.5]" data-reveal style={{ borderColor: "rgba(10,10,10,0.14)" }}>
          <p>Computer engineering at the University of Toronto.</p>
          <p>Co{"‑"}founder and CTO of The Actually Company.</p>
          <p>Robot autonomy, embedded firmware, and the tools round both.</p>
        </div>
      </section>

      <section className="px-[3vw] py-[8vh]" id="work">
        <p className="text-[0.75rem] uppercase tracking-[0.3em] opacity-50" data-reveal>
          Work
        </p>
        <div className="mt-[2rem]" ref={stackRef}>
          {projects.map((p, i) => (
            <article
              className="sticky mb-[4vh] grid min-h-[52vh] grid-cols-[1fr_1fr] gap-[3vw] rounded-[1.6rem] border p-[3rem]"
              data-card
              key={p.title}
              style={{ top: `calc(8vh + ${i * 1.4}rem)`, backgroundColor: GROUND, borderColor: "rgba(10,10,10,0.16)", transformOrigin: "50% 0%" }}
            >
              <div>
                <p className="text-[clamp(3rem,7vw,8rem)] font-medium leading-none tracking-[-0.05em]" style={{ color: ACCENT }}>
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h2 className="mt-[1.2rem] text-[clamp(2rem,4.4vw,5rem)] font-medium leading-[0.95] tracking-[-0.04em]">{p.title}</h2>
                {p.award ? <p className="mt-[0.9rem] text-[0.78rem] uppercase tracking-[0.22em]" style={{ color: ACCENT }}>{p.award}</p> : null}
              </div>
              <div className="flex flex-col justify-between">
                <div>
                  <p className="text-[1.2rem] leading-[1.45]">{p.tagline}</p>
                  <ul className="mt-[1.2rem] space-y-[0.5rem] text-[0.92rem] leading-[1.55] opacity-70">
                    {p.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-[2rem] flex items-baseline justify-between border-t pt-[1rem] text-[0.78rem] uppercase tracking-[0.18em]" style={{ borderColor: "rgba(10,10,10,0.14)" }}>
                  <span className="opacity-55">{p.stack.join(" · ")}</span>
                  <span className="flex gap-[1.5rem]">
                    <span className="opacity-55">{p.year}</span>
                    {p.href ? (
                      <a className="underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
                        Open {"↗"}
                      </a>
                    ) : null}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="px-[3vw] py-[8vh]" id="info">
        <p className="text-[0.75rem] uppercase tracking-[0.3em] opacity-50" data-reveal>
          Info
        </p>
        <div className="mt-[2rem] grid grid-cols-[2fr_1fr] gap-[4vw]">
          <div>
            {experience.map((e) => (
              <div className="grid grid-cols-[10rem_1fr] gap-[2vw] border-t py-[1.6rem]" data-reveal key={e.org} style={{ borderColor: "rgba(10,10,10,0.14)" }}>
                <p className="text-[0.78rem] uppercase tracking-[0.18em] opacity-55">{e.when}</p>
                <div>
                  <p className="text-[1.6rem] font-medium leading-[1] tracking-[-0.03em]">{e.org}</p>
                  <p className="mt-[0.4rem] text-[0.9rem] opacity-70">
                    {e.role}, {e.where}
                  </p>
                  <ul className="mt-[0.8rem] space-y-[0.35rem] text-[0.9rem] leading-[1.5] opacity-70">
                    {e.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="border-t py-[1.6rem]" data-reveal style={{ borderColor: "rgba(10,10,10,0.14)" }}>
              <p className="text-[0.78rem] uppercase tracking-[0.18em] opacity-55">Education</p>
              <p className="mt-[0.6rem] text-[1.6rem] font-medium leading-[1] tracking-[-0.03em]">{education.school}</p>
              <p className="mt-[0.4rem] text-[0.9rem] opacity-70">
                {education.degree}, {education.when}
              </p>
            </div>
            <div className="border-t py-[1.6rem]" data-reveal style={{ borderColor: "rgba(10,10,10,0.14)" }}>
              <p className="text-[0.78rem] uppercase tracking-[0.18em] opacity-55">Selected</p>
              <ul className="mt-[0.6rem] space-y-[0.5rem] text-[0.95rem]">
                {awards.map((a) => (
                  <li className="flex justify-between" key={a.title}>
                    <span>{a.title}</span>
                    <span className="tabular-nums" style={{ color: ACCENT }}>{a.year}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-[8vh]" id="skills">
        <p className="px-[3vw] text-[0.75rem] uppercase tracking-[0.3em] opacity-50" data-reveal>
          Skills
        </p>
        <div className="mt-[2rem] space-y-[-1px]" data-reveal>
          {rows.map((items, i) => (
            <Marquee items={items} key={skillGroups[i].label} reverse={i % 2 === 1} seconds={34 + i * 6} />
          ))}
        </div>
        <div className="mt-[3rem] grid grid-cols-5 gap-[2vw] px-[3vw]">
          {skillGroups.map((g) => (
            <div data-reveal key={g.label}>
              <p className="text-[0.78rem] uppercase tracking-[0.18em]" style={{ color: ACCENT }}>{g.label}</p>
              <p className="mt-[0.5rem] text-[0.88rem] leading-[1.5] opacity-70">{g.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[3vw] pb-[12vh] pt-[8vh]" id="contact">
        <a className="block text-[clamp(2.4rem,7.6vw,8.6rem)] font-medium leading-[0.9] tracking-[-0.05em]" data-reveal href={`mailto:${EMAIL}`}>
          Write to me{" "}
          <span className="font-serif-display font-normal italic tracking-[-0.03em]" style={{ color: ACCENT }}>
            {"↗"}
          </span>
        </a>
        <p className="mt-[1.6rem] text-[1.2rem] font-light tracking-[-0.02em]" data-reveal>
          {EMAIL}
        </p>
        <div className="mt-[2rem] flex gap-[2rem] text-[0.85rem] uppercase tracking-[0.18em]" data-reveal>
          {elsewhere.map((l) => (
            <a className="underline underline-offset-[0.35em] opacity-60 hover:opacity-100" href={l.href} key={l.label} rel="noreferrer" target="_blank">
              {l.label}
            </a>
          ))}
        </div>
      </section>
    </VariantShell>
  );
}
