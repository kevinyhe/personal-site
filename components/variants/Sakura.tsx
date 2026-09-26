"use client";

import { type JSX } from "react";
import NeedleSeam from "@/components/NeedleSeam";
import PetalReveal from "@/components/PetalReveal";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

/**
 * 04 SAKURA. The site's own language carried down the whole page: the
 * plum and the blossom, the serif italic, the needle seam between bands,
 * petals crossing each block as it lands. Projects are a row of tall
 * cards you scroll sideways through; skills are chips that drift a little
 * on their own phase, the way the blossoms beside the robot do.
 */
const GROUND = "#2a0d1e";
const INK = "#f9b9dc";
const DEEP = "#1a0812";
const ACCENT = "#ffffff";
const LINE = "rgba(249,185,220,0.2)";

function Head({ children, n }: { children: string; n: string }): JSX.Element {
  return (
    <div className="flex items-baseline gap-[1.2rem]">
      <span className="font-sans text-[0.7rem] uppercase tracking-[0.3em] opacity-55">{n}</span>
      <h2 className="font-serif-display text-[clamp(2rem,4.2vw,4.6rem)] italic leading-none tracking-[-0.02em]">{children}</h2>
    </div>
  );
}

export default function Sakura(): JSX.Element {
  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} n={4}>
      <section className="relative z-[5] px-[3vw] pb-[10vh] pt-[14vh]">
        <PetalReveal as="div" petals={3} travel={40}>
          <p className="font-sans text-[0.7rem] uppercase tracking-[0.3em] opacity-55">Kevin He · Toronto</p>
          <h1 className="mt-[1.4rem] max-w-[12ch] font-serif-display text-[clamp(3rem,8vw,9rem)] italic leading-[0.92] tracking-[-0.03em]">
            Software for things that move.
          </h1>
        </PetalReveal>
        <PetalReveal as="p" className="mt-[2.4rem] max-w-[40ch] font-sans text-[1.02rem] font-light leading-[1.55] opacity-85" delay={0.15} petals={1} travel={28}>
          Computer engineering at the University of Toronto and co{"‑"}founder and CTO of The Actually
          Company. Robot autonomy, embedded firmware, and the tools round both.
        </PetalReveal>
        <NeedleSeam className="pointer-events-none absolute inset-x-0 top-full h-[22vh] w-full" colour={GROUND} />
      </section>

      <section className="relative z-[4] pb-[6vh] pt-[8vh]" id="work" style={{ backgroundColor: DEEP }}>
        <div className="px-[3vw]">
          <PetalReveal petals={1} travel={24}>
            <Head n="01">Work</Head>
          </PetalReveal>
        </div>
        <div className="mt-[3rem] flex snap-x snap-mandatory gap-[1.5vw] overflow-x-auto px-[3vw] pb-[2rem]" style={{ scrollbarWidth: "none" }}>
          {projects.map((p, i) => (
            <PetalReveal
              as="article"
              className="flex w-[34vw] shrink-0 snap-start flex-col justify-between rounded-[1.2rem] border p-[2rem]"
              delay={i * 0.08}
              key={p.title}
              petals={1}
              style={{ borderColor: LINE, minHeight: "58vh" }}
              travel={36}
            >
              <div>
                <p className="flex items-baseline justify-between font-sans text-[0.7rem] uppercase tracking-[0.24em] opacity-55">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>{p.year}</span>
                </p>
                <h3 className="mt-[1.6rem] font-serif-display text-[clamp(1.8rem,3vw,3.4rem)] leading-[1] tracking-[-0.02em]">{p.title}</h3>
                <p className="mt-[1rem] font-sans text-[0.98rem] font-light leading-[1.5] opacity-85">{p.tagline}</p>
                <ul className="mt-[1.2rem] space-y-[0.5rem] font-sans text-[0.84rem] font-light leading-[1.5] opacity-65">
                  {p.bullets.slice(0, 2).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-[2rem]">
                {p.award ? <p className="font-serif-display text-[1rem] italic" style={{ color: ACCENT }}>{p.award}</p> : null}
                <p className="mt-[0.5rem] font-sans text-[0.72rem] uppercase tracking-[0.16em] opacity-55">{p.stack.join(" · ")}</p>
                {p.href ? (
                  <a className="mt-[1rem] inline-block font-sans text-[0.8rem] underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
                    Open {"↗"}
                  </a>
                ) : null}
              </div>
            </PetalReveal>
          ))}
        </div>
        <NeedleSeam className="pointer-events-none absolute inset-x-0 top-full h-[22vh] w-full" colour={DEEP} />
      </section>

      <section className="relative z-[3] px-[3vw] pb-[8vh] pt-[24vh]" id="info" style={{ backgroundColor: GROUND }}>
        <PetalReveal petals={1} travel={24}>
          <Head n="02">Info</Head>
        </PetalReveal>
        <div className="mt-[3rem] grid grid-cols-[1.3fr_1fr] gap-[5vw]">
          <div>
            {experience.map((e, i) => (
              <PetalReveal as="div" className="border-t py-[1.6rem]" delay={i * 0.08} key={e.org} petals={1} style={{ borderColor: LINE }} travel={28}>
                <div className="flex items-baseline justify-between gap-[2rem]">
                  <p className="font-serif-display text-[1.7rem] leading-none">{e.org}</p>
                  <p className="font-sans text-[0.72rem] uppercase tracking-[0.2em] opacity-55">{e.when}</p>
                </div>
                <p className="mt-[0.5rem] font-sans text-[0.88rem] font-light opacity-75">
                  {e.role}, {e.where}
                </p>
                <ul className="mt-[0.9rem] space-y-[0.4rem] font-sans text-[0.86rem] font-light leading-[1.5] opacity-70">
                  {e.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </PetalReveal>
            ))}
          </div>
          <div>
            <PetalReveal as="div" className="border-t py-[1.6rem]" petals={1} style={{ borderColor: LINE }} travel={28}>
              <p className="font-sans text-[0.7rem] uppercase tracking-[0.3em] opacity-55">Education</p>
              <p className="mt-[0.8rem] font-serif-display text-[1.7rem] leading-none">{education.school}</p>
              <p className="mt-[0.5rem] font-sans text-[0.88rem] font-light opacity-75">
                {education.degree}, {education.when}
              </p>
            </PetalReveal>
            <PetalReveal as="div" className="border-t py-[1.6rem]" delay={0.1} petals={1} style={{ borderColor: LINE }} travel={28}>
              <p className="font-sans text-[0.7rem] uppercase tracking-[0.3em] opacity-55">Selected</p>
              <ul className="mt-[0.8rem] space-y-[0.5rem] font-sans text-[0.92rem] font-light">
                {awards.map((a) => (
                  <li className="flex justify-between" key={a.title}>
                    <span>{a.title}</span>
                    <span className="tabular-nums opacity-50">{a.year}</span>
                  </li>
                ))}
              </ul>
            </PetalReveal>
          </div>
        </div>
        <NeedleSeam className="pointer-events-none absolute inset-x-0 top-full h-[22vh] w-full" colour={GROUND} />
      </section>

      <section className="relative z-[2] px-[3vw] pb-[8vh] pt-[24vh]" id="skills" style={{ backgroundColor: DEEP }}>
        <PetalReveal petals={1} travel={24}>
          <Head n="03">Skills</Head>
        </PetalReveal>
        <div className="mt-[3rem] space-y-[3rem]">
          {skillGroups.map((g, gi) => (
            <PetalReveal as="div" className="grid grid-cols-[16rem_1fr] gap-[3vw] border-t pt-[1.6rem]" delay={gi * 0.06} key={g.label} petals={1} style={{ borderColor: LINE }} travel={28}>
              <div>
                <p className="font-serif-display text-[1.5rem] italic leading-none">{g.label}</p>
                <p className="mt-[0.7rem] font-sans text-[0.82rem] font-light leading-[1.5] opacity-65">{g.blurb}</p>
              </div>
              <ul className="flex flex-wrap gap-[0.7rem]">
                {g.skills.map((s, i) => (
                  <li
                    className="blossom-float flex items-center gap-[0.6rem] rounded-full border px-[1rem] py-[0.55rem] font-sans text-[0.86rem]"
                    key={s.name}
                    style={
                      {
                        borderColor: LINE,
                        "--r": `${((i * 37) % 7) - 3}deg`,
                        "--p": `${(i * 0.7) % 4}s`,
                        "--d": `${7 + (i % 3)}s`,
                      } as React.CSSProperties
                    }
                  >
                    <SkillMark size="1rem" skill={s} />
                    {s.name}
                  </li>
                ))}
              </ul>
            </PetalReveal>
          ))}
        </div>
        <NeedleSeam className="pointer-events-none absolute inset-x-0 top-full h-[22vh] w-full" colour={DEEP} />
      </section>

      <section className="relative z-[1] px-[3vw] pb-[12vh] pt-[24vh]" id="contact" style={{ backgroundColor: GROUND }}>
        <PetalReveal petals={2} travel={40}>
          <Head n="04">Write to me</Head>
        </PetalReveal>
        <PetalReveal className="mt-[2rem]" delay={0.1} petals={0} travel={28}>
          <a className="block font-sans text-[clamp(1.6rem,4.4vw,5rem)] font-light leading-none tracking-[-0.04em]" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
        </PetalReveal>
        <div className="mt-[2rem] flex gap-[2rem] font-sans text-[0.85rem]" data-reveal>
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
