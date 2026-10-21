"use client";

import { type JSX, type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { awards, education, experience, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 37, Mono (after olhalazarieva.com). Everything is small uppercase
 * mono. A row of bracketed links at the top jumps to the four parts. Work
 * is five one-line rows; the row under the cursor puts its picture, drawn
 * as vertical bars, in the one picture box on the right (the bars thin to
 * nothing, the picture swaps, the bars grow back). Clicking a row opens its
 * detail under it; clicking again or Esc closes it. While a row is open the
 * picture box shows that project. Then the skills in five short columns,
 * one larger line (degree and role), the awards and the contact links.
 *
 * Under reduced motion the picture swaps at once and rows do not slide.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LABEL = "font-mono text-[1.2rem] uppercase leading-[1.4] tracking-[0.12em] opacity-70";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const KIND: Record<(typeof projects)[number]["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};
const PARTS = [
  { id: "b37-work", label: "Work" },
  { id: "b37-skills", label: "Skills" },
  { id: "b37-recognition", label: "Recognition" },
  { id: "b37-contact", label: "Contact" },
];
const STATEMENT = `Computer Engineering, ${education.school} — ${experience[0].role}, ${experience[0].org}`;

const CSS = `
.b37-row .b37-slide { display: inline-block; transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1), color 0.25s ease; }
.b37-row[data-on="true"] .b37-slide { color: #ffffff; transform: translateX(0.8rem); }
.b37-link { transition: color 0.2s ease; }
.b37-link:hover, .b37-link:focus-visible { color: #ffffff; }
@media (prefers-reduced-motion: reduce) {
  .b37-row .b37-slide, .b37-link { transition: none; }
  .b37-row[data-on="true"] .b37-slide { transform: none; }
}
`;

function stillMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The one picture box: fades its bars out, swaps the picture, fades them back in. */
function Picture({ sources, target }: { sources: BarSource[] | null; target: number }): JSX.Element {
  const [shown, setShown] = useState(target);
  const [level, setLevel] = useState(1);
  const shownRef = useRef(target);
  const levelRef = useRef(1);

  useEffect(() => {
    if (stillMotion()) {
      shownRef.current = target;
      levelRef.current = 1;
      setShown(target);
      setLevel(1);
      return undefined;
    }
    let phase: "out" | "in" = shownRef.current === target ? "in" : "out";
    let last = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let l = levelRef.current;
      if (phase === "out") {
        l = Math.max(0, l - dt / 0.14);
        if (l === 0) {
          shownRef.current = target;
          setShown(target);
          phase = "in";
        }
      } else {
        l = Math.min(1, l + dt / 0.22);
      }
      levelRef.current = l;
      setLevel(l);
      if (phase === "in" && l >= 1) return;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const p = projects[shown];
  return (
    <figure className="w-full">
      <div className="relative aspect-[4/5] w-full overflow-hidden" style={{ outline: `0.1rem solid ${RULE}`, outlineOffset: "0.6rem" }}>
        {sources ? <BarPicture alt={p.title} cell={5} className="absolute inset-0" level={level} source={sources[shown]} /> : null}
      </div>
      <figcaption className="mt-[1.4rem] flex justify-between gap-[1rem] font-mono text-[1.2rem] uppercase leading-[1.4] tracking-[0.12em]">
        <span className="opacity-70">{pad2(shown + 1)}</span>
        <span className="text-right">{p.title}</span>
      </figcaption>
    </figure>
  );
}

export default function B37(): JSX.Element {
  const [sources, setSources] = useState<BarSource[] | null>(null);
  const [hover, setHover] = useState(-1);
  const [lastHover, setLastHover] = useState(0);
  const [open, setOpen] = useState(-1);

  // Pictures are made in the browser only (Saturn's is drawn on a canvas).
  useEffect(() => {
    setSources(projects.map(projectSource));
  }, []);

  useEffect(() => {
    if (open < 0) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const enter = useCallback(
    (i: number) => () => {
      setHover(i);
      setLastHover(i);
    },
    [],
  );
  const leave = useCallback((i: number) => () => setHover((h) => (h === i ? -1 : h)), []);

  const jump = useCallback((id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: stillMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  const target = open >= 0 ? open : hover >= 0 ? hover : lastHover;

  return (
    <div className="relative w-full font-mono uppercase" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mx-auto max-w-[168rem] px-[1.6rem] pb-[8vh] pt-[7vh] md:px-[4vw]">
        {/* Bracketed links to the parts. */}
        <nav aria-label="Sections" className="flex flex-wrap justify-center gap-x-[3.2rem] gap-y-[1rem] text-[1.3rem] leading-[1.4] tracking-[0.1em]">
          {PARTS.map((s) => (
            <a className="b37-link whitespace-nowrap" href={`#${s.id}`} key={s.id} onClick={jump(s.id)}>
              [&nbsp;&nbsp;{s.label}&nbsp;&nbsp;]
            </a>
          ))}
        </nav>

        <div className="mt-[6vh] grid grid-cols-1 gap-x-[4vw] gap-y-[5rem] md:grid-cols-[1fr_22vw]">
          {/* The picture: above the list on a phone, a sticky box on the right otherwise. */}
          <div className="mx-auto w-[62vw] md:order-2 md:mx-0 md:w-full">
            <div className="md:sticky md:top-[6vh]">
              <Picture sources={sources} target={target} />
            </div>
          </div>

          <div className="min-w-0 md:order-1">
            <section className="scroll-mt-[4vh]" id="b37-work">
              <h2 className={LABEL}>Work &#8600;</h2>
              <ol className="mt-[1.6rem]" style={{ borderTop: `0.1rem solid ${RULE}` }}>
                {projects.map((p, i) => {
                  const isOpen = open === i;
                  return (
                    <li
                      className="b37-row"
                      data-on={hover === i || isOpen}
                      key={p.title}
                      onPointerEnter={enter(i)}
                      onPointerLeave={leave(i)}
                      style={{ borderBottom: `0.1rem solid ${RULE}` }}
                    >
                      <div className="flex items-baseline gap-[1.6rem] text-[1.4rem] leading-[1.4] tracking-[0.08em]">
                        <button
                          aria-controls={`b37-p${i}`}
                          aria-expanded={isOpen}
                          className="grid min-w-0 flex-1 cursor-pointer grid-cols-[3.2rem_1fr_auto] items-baseline gap-x-[1.6rem] py-[1.2rem] text-left md:grid-cols-[4rem_1fr_12rem_10rem]"
                          onBlur={leave(i)}
                          onClick={() => setOpen((o) => (o === i ? -1 : i))}
                          onFocus={enter(i)}
                          type="button"
                        >
                          <span className="tabular-nums opacity-60">{pad2(i + 1)}</span>
                          <span className="min-w-0">
                            <span className="b37-slide">{p.title}</span>
                          </span>
                          <span className="hidden opacity-70 md:inline">{KIND[p.kind]}</span>
                          <span className="text-right tabular-nums opacity-80">{p.year}</span>
                        </button>
                        {p.href ? (
                          <a aria-label={`${p.title}, open site`} className="b37-link w-[2rem] text-right" href={p.href} rel="noreferrer" target="_blank">
                            &#8599;
                          </a>
                        ) : (
                          <span aria-hidden className="w-[2rem]" />
                        )}
                      </div>
                      {isOpen ? (
                        <div className="grid gap-[1.2rem] pb-[2.4rem] pt-[0.4rem] md:pl-[5.6rem]" id={`b37-p${i}`}>
                          <p className="max-w-[76rem] text-[1.4rem] leading-[1.5] tracking-[0.04em] text-white">{p.tagline}</p>
                          <ul className="max-w-[76rem] space-y-[0.8rem]">
                            {p.bullets.map((b) => (
                              <li className="flex gap-[1rem] text-[1.2rem] leading-[1.55] tracking-[0.04em] opacity-90" key={b}>
                                <span aria-hidden>&mdash;</span>
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="text-[1.2rem] leading-[1.5] tracking-[0.08em] opacity-70">[ {p.stack.join(" / ")} ]</p>
                          {p.award ? <p className="text-[1.2rem] leading-[1.5] tracking-[0.08em] text-white">{p.award}</p> : null}
                          {p.href || p.code ? (
                            <p className="flex flex-wrap gap-x-[2.4rem] gap-y-[0.6rem] text-[1.2rem] leading-[1.5] tracking-[0.08em]">
                              {p.href ? (
                                <a className="b37-link" href={p.href} rel="noreferrer" target="_blank">
                                  [ Visit &#8599; ]
                                </a>
                              ) : null}
                              {p.code ? (
                                <a className="b37-link" href={p.code} rel="noreferrer" target="_blank">
                                  [ Code &#8599; ]
                                </a>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="mt-[6vh] scroll-mt-[4vh]" id="b37-skills">
              <h2 className={LABEL}>Skills &#8600;</h2>
              <div className="mt-[1.6rem] grid grid-cols-2 gap-x-[2.4rem] gap-y-[2.8rem] pt-[1.6rem] sm:grid-cols-3 lg:grid-cols-5" style={{ borderTop: `0.1rem solid ${RULE}` }}>
                {skillGroups.map((g) => (
                  <div className="min-w-0" key={g.label}>
                    <h3 className="text-[1.2rem] leading-[1.4] tracking-[0.1em] text-white">{g.label}</h3>
                    <ul className="mt-[1rem] space-y-[0.3rem] text-[1.2rem] leading-[1.4] tracking-[0.06em] opacity-80">
                      {g.skills.map((s) => (
                        <li key={s.name}>{s.name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* The one larger line. */}
        <p
          className="mt-[8vh] pt-[4vh] leading-[1.15] tracking-[0.02em] text-white"
          style={{ borderTop: `0.1rem solid ${RULE}`, fontSize: "clamp(2.2rem, 3.2vw, 6.4rem)" }}
        >
          {STATEMENT}
        </p>

        <div className="mt-[7vh] grid grid-cols-1 gap-x-[4vw] gap-y-[5rem] md:grid-cols-2">
          <section className="scroll-mt-[4vh]" id="b37-recognition">
            <h2 className={LABEL}>Recognition &#8600;</h2>
            <ul className="mt-[1.6rem]" style={{ borderTop: `0.1rem solid ${RULE}` }}>
              {awards.map((a) => (
                <li
                  className="flex items-baseline justify-between gap-[1.6rem] py-[0.9rem] text-[1.3rem] leading-[1.4] tracking-[0.08em]"
                  key={a.title}
                  style={{ borderBottom: `0.1rem solid ${RULE}` }}
                >
                  <span className="min-w-0">{a.title}</span>
                  <span className="tabular-nums opacity-70">{a.year}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="scroll-mt-[4vh]" id="b37-contact">
            <h2 className={LABEL}>Contact &#8600;</h2>
            <div className="mt-[1.6rem] pt-[1.6rem]" style={{ borderTop: `0.1rem solid ${RULE}` }}>
              <a className="b37-link break-all text-[1.6rem] leading-[1.4] tracking-[0.06em] text-white" href={`mailto:${EMAIL}`}>
                [ {EMAIL} &#8599; ]
              </a>
              <ul className="mt-[2rem] flex flex-wrap gap-x-[2.4rem] gap-y-[1rem] text-[1.3rem] leading-[1.4] tracking-[0.1em]">
                {elsewhere.map((l) => (
                  <li key={l.href}>
                    <a className="b37-link whitespace-nowrap" href={l.href} rel="noreferrer" target="_blank">
                      [ {l.label} &#8599; ]
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
