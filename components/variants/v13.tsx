"use client";

import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups, type Project, type Skill } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

gsap.registerPlugin(SplitText);

/**
 * 13 EDITORIAL. After noahlesage.com: white paper, black ink, and each
 * project brings its own colour and its own typeface. There the page
 * re-themes per case-study route; here it re-themes per entry, in place:
 * hover or open a project and the titles, the metadata rules, the name at
 * the top and the ground all take that project's accent, and the display
 * face swaps between the serif and the sans. Leave, and it all goes back.
 *
 * A pale accent set as type on white is unreadable (the reference uses
 * its yellow as a whole-page ground, not as text), so type takes the
 * accent with four-tenths of ink mixed in, and the hairlines a little
 * less; only the ground tint takes it raw.
 */
const GROUND = "#ffffff";
const INK = "#0a0a0a";
const ACCENTS = ["#F7FF9D", "#F5D6DA", "#B4CEFB", "#E8262A", "#EFE533"];
const SERIF = "var(--font-instrument-serif)";
const SANS = "var(--font-inter)";

/** The skill behind a stack name, so its mark is the brand's icon; a name
 *  with no entry ("MPU6050", "Discord API") falls back to two letters. */
const skillByName = (name: string): Skill =>
  skillGroups.flatMap((g) => g.skills).find((s) => s.name === name || s.name.startsWith(`${name} `)) ?? {
    name,
    depth: 1,
  };

const DISCIPLINE: Record<Project["kind"], string> = {
  company: "Product",
  hackathon: "Hardware",
  library: "Library",
  bot: "Bot",
};

const CSS = `
.v13-root {
  --v13-display: ${SANS};
  --v13-text: color-mix(in srgb, var(--v13-accent, ${INK}) 60%, ${INK});
  /* At rest the accent is unset, so the mix is 40% of a half-ink: a 0.22
     ink hairline. Active, it is the accent darkened the same way. */
  --v13-line: color-mix(in srgb, var(--v13-accent, transparent) 60%, rgba(10, 10, 10, 0.55));
  --v13-rule: rgba(10, 10, 10, 0.16);
  background-color: color-mix(in srgb, var(--v13-accent, #fff) 12%, #fff);
  transition: background-color 0.4s;
}
.v13-tint {
  color: var(--v13-text);
  transition: color 0.4s, background-color 0.4s;
}
.v13-themed {
  color: var(--v13-text);
  font-family: var(--v13-display), Georgia, serif;
  transition: color 0.4s, background-color 0.4s, font-family 0s;
}
.v13-meta {
  display: inline-grid;
  grid-auto-flow: column;
  border-top: 1px solid var(--v13-line);
  border-bottom: 1px solid var(--v13-line);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.08em;
  transition: border-color 0.4s;
}
.v13-meta > span {
  padding: 0.45rem 1.1rem;
  transition: border-color 0.4s;
}
.v13-meta > span:first-child { padding-left: 0; }
.v13-meta > span + span { border-left: 1px solid var(--v13-line); }
.v13-title { overflow: hidden; padding-bottom: 0.08em; }
.v13-char { display: inline-block; will-change: transform; }
.v13-entry { border-top: 1px solid var(--v13-rule); }
.v13-more {
  display: grid;
  grid-template-rows: 0fr;
  overflow: hidden;
  transition: grid-template-rows 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.v13-entry[data-open] .v13-more { grid-template-rows: 1fr; }
@media (prefers-reduced-motion: reduce) {
  .v13-root, .v13-root * { transition: none !important; }
}
`;

function Caption({ children }: { children: string }): JSX.Element {
  return (
    <h2 className="font-mono text-[0.78rem] opacity-55" data-reveal>
      [{children}]
    </h2>
  );
}

export default function V13(): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const loaderRef = useRef<HTMLParagraphElement | null>(null);
  const splitsRef = useRef<SplitText[]>([]);
  const reducedRef = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  // The hovered entry wins over the open one so a mouse moving down the
  // list always shows the entry under it; with nothing hovered, an open
  // entry keeps its theme.
  const active = hover ?? open;
  const theme =
    active === null
      ? undefined
      : ({
          "--v13-accent": ACCENTS[active % ACCENTS.length],
          "--v13-display": active % 2 === 0 ? SERIF : SANS,
        } as CSSProperties);

  useEffect(() => {
    const root = rootRef.current;
    const loader = loaderRef.current;
    if (!root || !loader) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = reduced;
    if (reduced) {
      loader.style.display = "none";
      return undefined;
    }
    const ctx = gsap.context(() => {
      const count = { n: 0 };
      gsap.to(count, {
        n: 100,
        duration: 0.9,
        ease: "none",
        snap: { n: 1 },
        onUpdate: () => {
          loader.textContent = `${count.n}%`;
        },
        onComplete: () => {
          loader.style.display = "none";
        },
      });
    }, root);
    // Split every title once and keep the pieces: the rise on hover
    // re-tweens the same chars instead of re-splitting each time.
    const titles = Array.from(root.querySelectorAll<HTMLElement>(".v13-title"));
    splitsRef.current = titles.map((el) => new SplitText(el, { type: "chars", charsClass: "v13-char" }));
    return () => {
      ctx.revert();
      splitsRef.current.forEach((s) => {
        gsap.killTweensOf(s.chars);
        s.revert();
      });
      splitsRef.current = [];
      loader.style.display = "";
    };
  }, []);

  const enter = (i: number) => {
    setHover(i);
    const split = splitsRef.current[i];
    if (reducedRef.current || !split) return;
    gsap.fromTo(
      split.chars,
      { yPercent: 100 },
      { yPercent: 0, duration: 0.5, ease: "power3.out", stagger: 0.02, overwrite: true },
    );
  };

  return (
    <VariantShell accent={INK} ground={GROUND} ink={INK} n={13}>
      <style>{CSS}</style>
      <div className="v13-root" ref={rootRef} style={theme}>
        <section className="relative px-[3vw] pb-[10vh] pt-[14vh]">
          <p aria-hidden="true" className="v13-tint absolute left-[3vw] top-[1rem] font-mono text-[0.78rem]" ref={loaderRef}>
            0%
          </p>
          <h1 className="v13-themed text-[6vw] leading-[1] tracking-[-0.03em]" data-reveal>
            Kevin He.
          </h1>
          <nav className="mt-[2rem] flex gap-[1.6rem] font-mono text-[0.9rem]" data-reveal>
            <a className="hover:underline hover:underline-offset-[0.35em]" href="#work">[work]</a>
            <a className="hover:underline hover:underline-offset-[0.35em]" href="#info">[info]</a>
            <a className="hover:underline hover:underline-offset-[0.35em]" href="#contact">[say hello]</a>
          </nav>
        </section>

        <section className="px-[3vw] py-[8vh]" id="work">
          <Caption>work</Caption>
          <ul className="mt-[2rem]">
            {projects.map((p, i) => (
              <li
                className="v13-entry py-[3.5rem]"
                data-open={open === i ? "" : undefined}
                data-project={i}
                data-reveal
                key={p.title}
                onMouseEnter={() => enter(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              >
                <p className="v13-meta text-[0.8rem]">
                  <span>{DISCIPLINE[p.kind]}</span>
                  <span className="tabular-nums">{p.year}</span>
                  <span>{p.stack.slice(0, 2).join(" / ")}</span>
                </p>
                <h3 className="v13-themed mt-[1.4rem] text-[4.6vw] leading-[1.02] tracking-[-0.03em]">
                  <button
                    aria-controls={`v13-more-${i}`}
                    aria-expanded={open === i}
                    className="v13-title block w-full text-left"
                    onClick={() => setOpen((o) => (o === i ? null : i))}
                    type="button"
                  >
                    {p.title}
                  </button>
                </h3>
                <p className="mt-[1.2rem] max-w-[48ch] text-[1.15rem] leading-[1.45]">{p.tagline}</p>
                <ul className="mt-[1rem] max-w-[60ch] space-y-[0.4rem] text-[0.92rem] leading-[1.5] opacity-70">
                  {p.bullets.slice(0, 1).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <div className="v13-more" id={`v13-more-${i}`}>
                  {/* Closed, the panel is clipped, not gone: inert keeps its
                      link out of the tab order and the bullets out of the
                      accessibility tree. */}
                  <div className="min-h-0" inert={open !== i}>
                    <div className="grid grid-cols-[1fr_1fr] gap-[4vw] pt-[1.6rem]">
                      <ul className="max-w-[60ch] space-y-[0.4rem] text-[0.92rem] leading-[1.5] opacity-70">
                        {p.bullets.slice(1).map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                        {p.award ? <li className="font-mono text-[0.8rem] opacity-100">{p.award}</li> : null}
                      </ul>
                      <div>
                        <p className="font-mono text-[0.78rem] opacity-55">stack</p>
                        <ul className="mt-[0.8rem] flex flex-wrap gap-x-[1.4rem] gap-y-[0.6rem] text-[0.9rem]">
                          {p.stack.map((name) => (
                            <li className="flex items-center gap-[0.5rem]" key={name}>
                              <SkillMark onDark={false} size="1rem" skill={skillByName(name)} tinted={false} />
                              {name}
                            </li>
                          ))}
                        </ul>
                        {p.href ? (
                          <a className="mt-[1.4rem] inline-block font-mono text-[0.85rem] underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
                            [open {"↗"}]
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="px-[3vw] py-[8vh]" id="info">
          <Caption>info</Caption>
          <p className="mt-[2rem] max-w-[38ch] text-[2vw] leading-[1.25] tracking-[-0.02em]" data-reveal>
            One person, one practice: robot autonomy, embedded firmware, and the tools that hold them
            together. Computer engineering at the University of Toronto; co{"‑"}founder and CTO of The
            Actually Company; president and lead programmer of VEX team 82855Z. A summer in San Francisco
            on Founders, Inc. Off Season II.
          </p>
          <div className="mt-[6vh] grid grid-cols-[1.4fr_1fr] gap-[5vw]">
            <ol>
              {experience.map((e) => (
                <li className="v13-entry grid grid-cols-[9rem_1fr] gap-x-[2rem] py-[1.2rem] text-[0.92rem] leading-[1.5]" data-reveal key={e.org}>
                  <span className="font-mono text-[0.78rem] opacity-55">{e.when}</span>
                  <div>
                    <p>
                      {e.org} <span className="opacity-55">{"·"} {e.role}, {e.where}</span>
                    </p>
                    <ul className="mt-[0.4rem] space-y-[0.3rem] opacity-70">
                      {e.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
              <li className="v13-entry grid grid-cols-[9rem_1fr] gap-x-[2rem] py-[1.2rem] text-[0.92rem] leading-[1.5]" data-reveal>
                <span className="font-mono text-[0.78rem] opacity-55">{education.when}</span>
                <p>
                  {education.school} <span className="opacity-55">{"·"} {education.degree}</span>
                </p>
              </li>
            </ol>
            <div>
              <p className="font-mono text-[0.78rem] opacity-55" data-reveal>
                selected
              </p>
              <ul className="mt-[0.8rem] space-y-[0.5rem] text-[0.92rem]">
                {awards.map((a) => (
                  <li className="flex justify-between gap-[2rem]" data-reveal key={a.title}>
                    <span>{a.title}</span>
                    <span className="font-mono text-[0.78rem] tabular-nums opacity-55">{a.year}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="px-[3vw] py-[8vh]" id="skills">
          <Caption>skills</Caption>
          <ul className="mt-[2rem] space-y-[1rem] font-mono text-[1rem] leading-[1.6]">
            {skillGroups.map((g) => (
              <li className="flex flex-wrap items-center gap-x-[0.8rem]" data-reveal key={g.label}>
                <span className="flex items-center gap-[0.35rem] opacity-70">
                  {g.skills.slice(0, 3).map((s) => (
                    <SkillMark key={s.name} onDark={false} size="1rem" skill={s} tinted={false} />
                  ))}
                </span>
                <span>
                  {g.label} {"—"} <span className="opacity-70">{g.skills.map((s) => s.name).join(", ")}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="px-[3vw] pb-[12vh] pt-[8vh]" id="contact">
          <Caption>say hello</Caption>
          <p className="mt-[2rem] font-serif-display text-[6vw] italic leading-[0.95] tracking-[-0.02em]" data-reveal>
            say hello
          </p>
          <a className="mt-[1.5rem] inline-block text-[1.6rem] font-light tracking-[-0.02em] underline underline-offset-[0.3em]" data-reveal href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <div className="mt-[2rem] flex gap-[1.6rem] font-mono text-[0.9rem]" data-reveal>
            {elsewhere.map((l) => (
              <a className="hover:underline hover:underline-offset-[0.35em]" href={l.href} key={l.label} rel="noreferrer" target="_blank">
                [{l.label.toLowerCase()}]
              </a>
            ))}
          </div>
        </section>
      </div>
    </VariantShell>
  );
}
