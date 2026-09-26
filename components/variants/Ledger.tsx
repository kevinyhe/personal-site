"use client";

import { useState, type JSX } from "react";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

/**
 * 01 LEDGER. An index, the way the editorial portfolios on awwwards do it
 * (Colombel, Sonda): everything is a numbered row in a serif on cream,
 * and a row opens when you ask it to. No cards, no tiles. The skills are
 * a typographic index too, five columns of names with a dot scale.
 */
const GROUND = "#f3ede4";
const INK = "#14110f";
const ACCENT = "#b5426f";

function Caption({ children }: { children: string }): JSX.Element {
  return (
    <p className="text-[0.7rem] uppercase tracking-[0.28em] opacity-50" data-reveal>
      {children}
    </p>
  );
}

function Row({ i, open, onToggle }: { i: number; open: boolean; onToggle: () => void }): JSX.Element {
  const p = projects[i];
  return (
    <li className="border-t" data-reveal style={{ borderColor: "rgba(20,17,15,0.18)" }}>
      <button
        aria-expanded={open}
        className="grid w-full grid-cols-[4rem_1fr_auto] items-baseline gap-x-[2rem] py-[1.6rem] text-left"
        onClick={onToggle}
        type="button"
      >
        <span className="text-[0.75rem] tabular-nums opacity-45">{String(i + 1).padStart(2, "0")}</span>
        <span className="font-serif-display text-[clamp(1.8rem,3.4vw,3.6rem)] leading-[1] tracking-[-0.02em]">
          {p.title}
          {p.award ? <span className="ml-[0.5em] font-sans text-[0.7rem] uppercase tracking-[0.2em] opacity-55">{p.award}</span> : null}
        </span>
        <span className="text-[0.75rem] tabular-nums opacity-45">{p.year}</span>
      </button>
      <div
        className="grid overflow-hidden transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0">
          <div className="grid grid-cols-[4rem_1fr_1fr] gap-x-[2rem] pb-[2rem]">
            <span />
            <div>
              <p className="max-w-[44ch] text-[1.05rem] leading-[1.5]">{p.tagline}</p>
              <ul className="mt-[1rem] max-w-[52ch] space-y-[0.6rem] text-[0.9rem] leading-[1.55] opacity-75">
                {p.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
            <div className="text-[0.78rem] leading-[1.7]">
              <p className="uppercase tracking-[0.2em] opacity-45">Stack</p>
              <p>{p.stack.join(", ")}</p>
              {p.href ? (
                <a className="mt-[1rem] inline-block underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank" style={{ color: ACCENT }}>
                  Open {"↗"}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function Ledger(): JSX.Element {
  const [open, setOpen] = useState(0);
  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} n={1}>
      <section className="px-[3vw] pb-[8vh] pt-[14vh]">
        <Caption>Kevin He, Toronto</Caption>
        <h1 className="mt-[1.5rem] max-w-[14ch] font-serif-display text-[clamp(3rem,7.4vw,8rem)] leading-[0.95] tracking-[-0.03em]" data-reveal>
          Software for <em>things that move.</em>
        </h1>
        <p className="mt-[2.4rem] max-w-[40ch] text-[1.05rem] leading-[1.5] opacity-80" data-reveal>
          Computer engineering at the University of Toronto. Co{"‑"}founder and CTO of The Actually
          Company. Robot autonomy, embedded firmware, and the tools round both.
        </p>
      </section>

      <section className="px-[3vw] py-[8vh]" id="work">
        <Caption>Work</Caption>
        <ul className="mt-[1.5rem] border-b" style={{ borderColor: "rgba(20,17,15,0.18)" }}>
          {projects.map((_, i) => (
            <Row i={i} key={projects[i].title} onToggle={() => setOpen(open === i ? -1 : i)} open={open === i} />
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-[1fr_1fr] gap-[4vw] px-[3vw] py-[8vh]" id="info">
        <div>
          <Caption>Experience</Caption>
          <ol className="mt-[1.5rem]">
            {experience.map((e) => (
              <li className="border-t py-[1.4rem]" data-reveal key={e.org} style={{ borderColor: "rgba(20,17,15,0.18)" }}>
                <div className="flex items-baseline justify-between gap-[2rem]">
                  <p className="font-serif-display text-[1.6rem] leading-none">{e.org}</p>
                  <p className="text-[0.75rem] tabular-nums opacity-45">{e.when}</p>
                </div>
                <p className="mt-[0.4rem] text-[0.85rem] opacity-70">
                  {e.role}, {e.where}
                </p>
                <ul className="mt-[0.8rem] space-y-[0.4rem] text-[0.85rem] leading-[1.5] opacity-75">
                  {e.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <Caption>Education</Caption>
          <div className="mt-[1.5rem] border-t py-[1.4rem]" data-reveal style={{ borderColor: "rgba(20,17,15,0.18)" }}>
            <p className="font-serif-display text-[1.6rem] leading-none">{education.school}</p>
            <p className="mt-[0.4rem] text-[0.85rem] opacity-70">
              {education.degree}, {education.when}
            </p>
          </div>
          <div className="mt-[3rem]">
            <Caption>Selected</Caption>
            <ul className="mt-[1.5rem]">
              {awards.map((a) => (
                <li className="flex items-baseline justify-between border-t py-[0.9rem] text-[0.95rem]" data-reveal key={a.title} style={{ borderColor: "rgba(20,17,15,0.18)" }}>
                  <span>{a.title}</span>
                  <span className="tabular-nums opacity-45">{a.year}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-[3vw] py-[8vh]" id="skills">
        <Caption>Skills</Caption>
        <div className="mt-[1.5rem] grid grid-cols-5 gap-[2vw] border-t pt-[1.5rem]" style={{ borderColor: "rgba(20,17,15,0.18)" }}>
          {skillGroups.map((g) => (
            <div data-reveal key={g.label}>
              <p className="font-serif-display text-[1.3rem] italic leading-none">{g.label}</p>
              <p className="mt-[0.6rem] text-[0.78rem] leading-[1.5] opacity-60">{g.blurb}</p>
              <ul className="mt-[1.2rem] space-y-[0.55rem]">
                {g.skills.map((s) => (
                  <li className="flex items-center justify-between gap-[0.8rem] text-[0.92rem]" key={s.name}>
                    <span className="flex items-center gap-[0.6rem]">
                      <SkillMark onDark={false} size="1rem" skill={s} tinted={false} />
                      {s.name}
                    </span>
                    <span aria-label={`${s.depth} of 5`} className="flex gap-[0.22rem]">
                      {[1, 2, 3, 4, 5].map((d) => (
                        <span className="block h-[0.3rem] w-[0.3rem] rounded-full" key={d} style={{ backgroundColor: d <= s.depth ? ACCENT : "rgba(20,17,15,0.15)" }} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[3vw] pb-[10vh] pt-[8vh]" id="contact">
        <Caption>Contact</Caption>
        <a className="mt-[1.5rem] block font-serif-display text-[clamp(2rem,5.4vw,6rem)] leading-none tracking-[-0.03em]" data-reveal href={`mailto:${EMAIL}`}>
          <span className="font-sans font-light tracking-[-0.04em]">{EMAIL}</span>
        </a>
        <div className="mt-[2rem] flex gap-[2rem] text-[0.85rem]" data-reveal>
          {elsewhere.map((l) => (
            <a className="underline underline-offset-[0.35em] opacity-70 hover:opacity-100" href={l.href} key={l.label} rel="noreferrer" target="_blank">
              {l.label}
            </a>
          ))}
        </div>
      </section>
    </VariantShell>
  );
}
