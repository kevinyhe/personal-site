"use client";

import { useState, type JSX } from "react";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

/**
 * 02 GRID. Swiss: a twelve-column grid, mono captions in the gutters,
 * everything on the lines. The skills are the tile wall from the brief —
 * rounded squares with the brands' own marks in their own colours — with
 * the name on hover. Projects are cards with a metadata table.
 */
const GROUND = "#0f1115";
const INK = "#e8e6e1";
const ACCENT = "#f9b9dc";
const LINE = "rgba(232,230,225,0.14)";

function Mono({ children, className = "" }: { children: string; className?: string }): JSX.Element {
  return <span className={`font-mono text-[0.68rem] uppercase tracking-[0.16em] opacity-50 ${className}`}>{children}</span>;
}

export default function Grid(): JSX.Element {
  const [hover, setHover] = useState<string | null>(null);
  const allSkills = skillGroups.flatMap((g) => g.skills.map((s) => ({ ...s, group: g.label })));
  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} n={2}>
      <section className="grid grid-cols-12 gap-x-[1.5vw] border-b px-[3vw] pb-[6vh] pt-[14vh]" style={{ borderColor: LINE }}>
        <div className="col-span-2" data-reveal>
          <Mono>Kevin He</Mono>
          <br />
          <Mono>Toronto, ON</Mono>
        </div>
        <h1 className="col-span-8 text-[clamp(2.6rem,6vw,6.4rem)] font-light leading-[1] tracking-[-0.04em]" data-reveal>
          Software for things that move: robot autonomy, embedded firmware, and the tooling round both.
        </h1>
        <div className="col-span-2 text-right" data-reveal>
          <Mono>CTO, The Actually Company</Mono>
          <br />
          <Mono>BASc CE, U of T</Mono>
        </div>
      </section>

      <section className="px-[3vw] py-[8vh]" id="work">
        <div className="grid grid-cols-12 gap-x-[1.5vw]">
          <Mono className="col-span-2">01 Work</Mono>
          <Mono className="col-span-10">{`${projects.length} projects, 2021 to 2026`}</Mono>
        </div>
        <div className="mt-[2rem] grid grid-cols-12 gap-[1.5vw]">
          {projects.map((p, i) => (
            <article
              className={`${i === 0 ? "col-span-12" : "col-span-6"} grid grid-cols-12 gap-x-[1.5vw] border-t py-[1.8rem]`}
              data-reveal
              key={p.title}
              style={{ borderColor: LINE }}
            >
              <div className={i === 0 ? "col-span-7" : "col-span-12"}>
                <p className="flex items-baseline gap-[1rem]">
                  <Mono>{String(i + 1).padStart(2, "0")}</Mono>
                  <span className={`${i === 0 ? "text-[clamp(2rem,4.6vw,5rem)]" : "text-[clamp(1.5rem,2.6vw,2.8rem)]"} font-light leading-[1] tracking-[-0.03em]`}>
                    {p.title}
                  </span>
                </p>
                <p className="mt-[1rem] max-w-[46ch] text-[1rem] leading-[1.5] opacity-80">{p.tagline}</p>
                {i === 0 ? (
                  <ul className="mt-[1rem] max-w-[60ch] space-y-[0.5rem] text-[0.88rem] leading-[1.55] opacity-65">
                    {p.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <dl className={`${i === 0 ? "col-span-5 mt-0" : "col-span-12 mt-[1.4rem]"} grid grid-cols-[6rem_1fr] gap-y-[0.5rem] self-start border-t pt-[0.9rem] text-[0.82rem]`} style={{ borderColor: LINE }}>
                <dt><Mono>Year</Mono></dt>
                <dd className="tabular-nums">{p.year}</dd>
                <dt><Mono>Stack</Mono></dt>
                <dd>{p.stack.join(" / ")}</dd>
                {p.award ? (
                  <>
                    <dt><Mono>Award</Mono></dt>
                    <dd style={{ color: ACCENT }}>{p.award}</dd>
                  </>
                ) : null}
                {p.href ? (
                  <>
                    <dt><Mono>Link</Mono></dt>
                    <dd>
                      <a className="underline underline-offset-[0.3em] opacity-80 hover:opacity-100" href={p.href} rel="noreferrer" target="_blank">
                        {p.href.replace(/^https?:\/\//, "")}
                      </a>
                    </dd>
                  </>
                ) : null}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="px-[3vw] py-[8vh]" id="info">
        <div className="grid grid-cols-12 gap-x-[1.5vw]">
          <Mono className="col-span-2">02 Info</Mono>
          <div className="col-span-6">
            {experience.map((e) => (
              <div className="grid grid-cols-[8rem_1fr] gap-x-[1.5vw] border-t py-[1.4rem]" data-reveal key={e.org} style={{ borderColor: LINE }}>
                <Mono>{e.when}</Mono>
                <div>
                  <p className="text-[1.25rem] font-light leading-[1.1]">{e.org}</p>
                  <p className="mt-[0.3rem] text-[0.85rem] opacity-60">
                    {e.role} · {e.where}
                  </p>
                  <ul className="mt-[0.8rem] space-y-[0.35rem] text-[0.85rem] leading-[1.5] opacity-70">
                    {e.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
          <div className="col-span-4">
            <div className="border-t py-[1.4rem]" data-reveal style={{ borderColor: LINE }}>
              <Mono>Education</Mono>
              <p className="mt-[0.6rem] text-[1.25rem] font-light leading-[1.1]">{education.school}</p>
              <p className="mt-[0.3rem] text-[0.85rem] opacity-60">
                {education.degree}, {education.when}
              </p>
            </div>
            <div className="border-t py-[1.4rem]" data-reveal style={{ borderColor: LINE }}>
              <Mono>Selected</Mono>
              <ul className="mt-[0.6rem] space-y-[0.4rem] text-[0.9rem]">
                {awards.map((a) => (
                  <li className="flex justify-between" key={a.title}>
                    <span>{a.title}</span>
                    <span className="tabular-nums opacity-45">{a.year}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="px-[3vw] py-[8vh]" id="skills">
        <div className="grid grid-cols-12 gap-x-[1.5vw]">
          <Mono className="col-span-2">03 Skills</Mono>
          <p className="col-span-6 text-[1.1rem] leading-[1.45] opacity-80" data-reveal>
            {hover ? allSkills.find((s) => s.name === hover)?.group + " / " + hover : `${allSkills.length} tools, five groups. Hover one.`}
          </p>
        </div>
        <div className="mt-[2rem] grid grid-cols-9 gap-[0.8vw]" data-reveal>
          {allSkills.map((s) => (
            <div
              className="group relative aspect-square rounded-[22%] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[0.3rem]"
              key={s.name}
              onMouseEnter={() => setHover(s.name)}
              onMouseLeave={() => setHover(null)}
              style={{ backgroundColor: "#1b1e25", boxShadow: "inset 0 0 0 1px rgba(232,230,225,0.06)", containerType: "size" }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <SkillMark size="46%" skill={s} />
              </div>
              <span className="pointer-events-none absolute inset-x-0 -bottom-[1.6rem] text-center font-mono text-[0.62rem] uppercase tracking-[0.12em] opacity-0 transition-opacity group-hover:opacity-70">
                {s.name}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-[4rem] grid grid-cols-5 gap-x-[1.5vw] border-t pt-[1.2rem]" style={{ borderColor: LINE }}>
          {skillGroups.map((g) => (
            <div data-reveal key={g.label}>
              <Mono>{g.label}</Mono>
              <p className="mt-[0.5rem] text-[0.82rem] leading-[1.5] opacity-65">{g.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-12 gap-x-[1.5vw] border-t px-[3vw] pb-[10vh] pt-[8vh]" id="contact" style={{ borderColor: LINE }}>
        <Mono className="col-span-2">04 Contact</Mono>
        <div className="col-span-10">
          <a className="block text-[clamp(1.8rem,4.6vw,5.2rem)] font-light leading-none tracking-[-0.04em]" data-reveal href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <div className="mt-[1.6rem] flex gap-[2rem]" data-reveal>
            {elsewhere.map((l) => (
              <a className="font-mono text-[0.75rem] uppercase tracking-[0.14em] opacity-60 hover:opacity-100" href={l.href} key={l.label} rel="noreferrer" target="_blank">
                {l.label} {"↗"}
              </a>
            ))}
          </div>
        </div>
      </section>
    </VariantShell>
  );
}
