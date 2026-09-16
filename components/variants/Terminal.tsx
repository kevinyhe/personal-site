"use client";

import { useEffect, useState, type JSX } from "react";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups } from "@/components/profile";
import VariantShell from "@/components/variants/VariantShell";

/**
 * 03 TERMINAL. Monospace, black, one colour of ink. A prompt at the top
 * that types the tagline, sections as commands, projects as a table with
 * aligned columns, skills as bars drawn in block characters. The kind of
 * page that says what it is in the first line.
 */
const GROUND = "#050505";
const INK = "#f9b9dc";
const DIM = "rgba(249,185,220,0.45)";
const ACCENT = "#ffffff";

const TAGLINE = "software for things that move.";

function Prompt({ cmd }: { cmd: string }): JSX.Element {
  return (
    <p className="text-[0.95rem]" data-reveal>
      <span style={{ color: DIM }}>kevin@works:~$ </span>
      {cmd}
    </p>
  );
}

function Rule(): JSX.Element {
  return (
    <p aria-hidden="true" className="my-[1.2rem] overflow-hidden whitespace-nowrap text-[0.8rem]" style={{ color: DIM }}>
      {"─".repeat(200)}
    </p>
  );
}

function Bar({ depth }: { depth: number }): JSX.Element {
  return (
    <span aria-label={`${depth} of 5`} className="tabular-nums">
      {"█".repeat(depth * 2)}
      <span style={{ color: "rgba(249,185,220,0.18)" }}>{"█".repeat(10 - depth * 2)}</span>
    </span>
  );
}

export default function Terminal(): JSX.Element {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(TAGLINE.length);
      return undefined;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= TAGLINE.length) window.clearInterval(id);
    }, 45);
    return () => window.clearInterval(id);
  }, []);
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 2) + "… " : s + " ".repeat(n - s.length));

  return (
    <VariantShell accent={ACCENT} ground={GROUND} ink={INK} mono n={3}>
      <section className="px-[3vw] pb-[6vh] pt-[14vh]">
        <Prompt cmd="whoami" />
        <p className="mt-[1.2rem] text-[clamp(1.6rem,4.2vw,4.6rem)] leading-[1.1] tracking-[-0.02em]" data-reveal>
          Kevin He. I write{" "}
          <span style={{ color: ACCENT }}>{TAGLINE.slice(0, typed)}</span>
          <span aria-hidden="true" className="animate-pulse">{"▌"}</span>
        </p>
        <p className="mt-[1.4rem] max-w-[64ch] text-[0.95rem] leading-[1.6]" data-reveal style={{ color: DIM }}>
          # computer engineering, University of Toronto. co-founder and CTO, The Actually Company.
          <br /># robot autonomy, embedded firmware, and the tooling round both.
        </p>
      </section>

      <section className="px-[3vw] py-[6vh]" id="work">
        <Prompt cmd="ls -la ./work" />
        <Rule />
        <div className="overflow-x-auto">
          <pre className="text-[0.95rem] leading-[1.9]" data-reveal>
            <span style={{ color: DIM }}>{`${pad("#", 4)}${pad("year", 12)}${pad("project", 26)}${pad("stack", 44)}award\n`}</span>
            {projects.map((p, i) => (
              <span key={p.title}>
                {pad(String(i + 1).padStart(2, "0"), 4)}
                {pad(p.year, 12)}
                <span style={{ color: ACCENT }}>{pad(p.title, 26)}</span>
                {pad(p.stack.join(", "), 44)}
                {p.award ?? "—"}
                {"\n"}
              </span>
            ))}
          </pre>
        </div>
        <div className="mt-[3rem] grid grid-cols-2 gap-x-[4vw] gap-y-[2.4rem]">
          {projects.slice(0, 4).map((p) => (
            <div data-reveal key={p.title}>
              <p className="text-[0.85rem]" style={{ color: DIM }}>
                cat ./work/{p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md
              </p>
              <p className="mt-[0.6rem] text-[1.15rem]" style={{ color: ACCENT }}>
                # {p.title}
              </p>
              <p className="mt-[0.5rem] text-[0.92rem] leading-[1.55]">{p.tagline}</p>
              <ul className="mt-[0.6rem] space-y-[0.3rem] text-[0.86rem] leading-[1.55]" style={{ color: DIM }}>
                {p.bullets.map((b) => (
                  <li key={b}>- {b}</li>
                ))}
              </ul>
              {p.href ? (
                <a className="mt-[0.6rem] inline-block text-[0.86rem] underline underline-offset-[0.3em]" href={p.href} rel="noreferrer" target="_blank">
                  {p.href}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="px-[3vw] py-[6vh]" id="info">
        <Prompt cmd="cat ./info.md" />
        <Rule />
        <div className="grid grid-cols-2 gap-x-[4vw]">
          <div>
            {experience.map((e) => (
              <div className="mb-[2rem]" data-reveal key={e.org}>
                <p className="text-[1.05rem]" style={{ color: ACCENT }}>
                  ## {e.org} <span style={{ color: DIM }}>({e.when})</span>
                </p>
                <p className="mt-[0.3rem] text-[0.9rem]">{e.role}, {e.where}</p>
                <ul className="mt-[0.5rem] space-y-[0.3rem] text-[0.86rem] leading-[1.55]" style={{ color: DIM }}>
                  {e.bullets.map((b) => (
                    <li key={b}>- {b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div>
            <div data-reveal>
              <p className="text-[1.05rem]" style={{ color: ACCENT }}>## education</p>
              <p className="mt-[0.3rem] text-[0.9rem]">{education.school}</p>
              <p className="text-[0.86rem]" style={{ color: DIM }}>{education.degree}, {education.when}</p>
            </div>
            <div className="mt-[2rem]" data-reveal>
              <p className="text-[1.05rem]" style={{ color: ACCENT }}>## selected</p>
              <ul className="mt-[0.5rem] text-[0.9rem] leading-[1.8]">
                {awards.map((a) => (
                  <li key={a.title}>
                    <span style={{ color: DIM }}>{a.year}</span> {a.title}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="px-[3vw] py-[6vh]" id="skills">
        <Prompt cmd="skills --graph" />
        <Rule />
        <div className="grid grid-cols-2 gap-x-[4vw] gap-y-[2rem]">
          {skillGroups.map((g) => (
            <div data-reveal key={g.label}>
              <p className="text-[1.05rem]" style={{ color: ACCENT }}>## {g.label.toLowerCase()}</p>
              <p className="mt-[0.2rem] text-[0.84rem]" style={{ color: DIM }}># {g.blurb}</p>
              <pre className="mt-[0.8rem] text-[0.9rem] leading-[1.8]">
                {g.skills.map((s) => (
                  <span key={s.name}>
                    {pad(s.name, 22)}
                    <Bar depth={s.depth} />
                    {"\n"}
                  </span>
                ))}
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[3vw] pb-[10vh] pt-[6vh]" id="contact">
        <Prompt cmd="mail kevin" />
        <Rule />
        <a className="block text-[clamp(1.4rem,3.6vw,4rem)] tracking-[-0.02em]" data-reveal href={`mailto:${EMAIL}`} style={{ color: ACCENT }}>
          {EMAIL}
        </a>
        <p className="mt-[1.2rem] text-[0.9rem]" data-reveal>
          {elsewhere.map((l, i) => (
            <span key={l.label}>
              {i > 0 ? <span style={{ color: DIM }}> | </span> : null}
              <a className="underline underline-offset-[0.3em]" href={l.href} rel="noreferrer" target="_blank">
                {l.label.toLowerCase()}
              </a>
            </span>
          ))}
        </p>
      </section>
    </VariantShell>
  );
}
