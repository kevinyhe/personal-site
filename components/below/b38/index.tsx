"use client";

import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { awards, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { skillIcon } from "@/components/skillIcons";

/**
 * Design 38, Pills (after adcker.com). One huge centred statement in heavy
 * uppercase sans, eight short lines: "I build / ✱ ( ■ ) / systems that /
 * bring ( ■ ) / ( ■ ) ideas / to life, ( ■ ) / ( ■ ) robots / to products." Each ■
 * is a small square picture of one project, drawn as vertical bars, set in
 * brackets inside the text. Small serif notes ("Click me") float just past
 * the end of some lines, as adcker's do. Clicking a picture opens that
 * project's detail over the page.
 *
 * Under the statement, a row of five small pictures numbered (01)…(05),
 * with each title and year. Then a darker block, adcker's dark footer: one
 * centred serif paragraph, the skills in five small columns, the awards,
 * and the email and links.
 *
 * The side notes hide below 768px, where the lines fill the width. The
 * bar pictures draw on 2D canvases built in the browser only, so they wait
 * for a mounted flag and the server render has empty boxes. Under reduced
 * motion nothing scales or slides.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const SMALL = "font-sans text-[1.3rem] font-medium leading-[1.4] tracking-[0.02em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const DARK = "rgba(42, 13, 30, 0.82)";

const CSS = `
.b38-pill { transition: transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1); }
.b38-pill:hover, .b38-pill:focus-visible { transform: scale(1.08) rotate(-2deg); }
.b38-thumb .b38-img { transition: transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1); }
.b38-thumb:hover .b38-img, .b38-thumb:focus-visible .b38-img { transform: translateY(-0.6rem); }
.b38-thumb .b38-cap { transition: color 0.25s ease; }
.b38-thumb:hover .b38-cap, .b38-thumb:focus-visible .b38-cap { color: #ffffff; }
.b38-link { transition: color 0.2s ease; }
.b38-link:hover, .b38-link:focus-visible { color: #ffffff; }
.b38-under { background: linear-gradient(currentColor, currentColor) 0 100% / 100% 0.1rem no-repeat; padding-bottom: 0.2rem; }
.b38-dialog { animation: b38-in 0.4s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b38-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b38-pill, .b38-thumb .b38-img, .b38-thumb .b38-cap, .b38-link { transition: none; }
  .b38-pill:hover, .b38-pill:focus-visible, .b38-thumb:hover .b38-img, .b38-thumb:focus-visible .b38-img { transform: none; }
  .b38-dialog { animation: none; }
}
`;

/** One piece of a statement line: a word run, or a bracketed picture of project `pic`. */
type Piece = string | { pic: number } | { star: true };
type Line = { parts: Piece[]; note?: { text: string; side: "left" | "right"; arrow?: "left" | "right" } };

// The statement, in the order the lines read. Pictures: 0 Actually, 1 S-KBD67,
// 2 King of the Ring, 3 mclib, 4 Saturn.
const LINES: Line[] = [
  { parts: ["I build"], note: { text: "Kevin He", side: "left" } },
  { parts: [{ star: true }, { pic: 0 }], note: { text: "Click me", side: "right", arrow: "left" } },
  { parts: ["Systems that"] },
  { parts: ["Bring", { pic: 1 }], note: { text: "Click me", side: "right", arrow: "left" } },
  { parts: [{ pic: 2 }, "ideas"], note: { text: "Click me", side: "left", arrow: "right" } },
  { parts: ["to life,", { pic: 3 }], note: { text: "What I build", side: "right" } },
  { parts: [{ pic: 4 }, "robots"], note: { text: "Click me", side: "left", arrow: "right" } },
  { parts: ["to products."] },
];

/** A side note in the upright serif. Arrows are set in sans (the serif is a demo cut). */
function Note({ note }: { note: NonNullable<Line["note"]> }): JSX.Element {
  const pos = note.side === "right" ? "left-full ml-[2.2vw]" : "right-full mr-[2.2vw]";
  return (
    <span
      aria-hidden
      className={`absolute top-1/2 hidden -translate-y-1/2 whitespace-nowrap font-serif-display normal-case leading-[1.2] tracking-[-0.01em] md:inline ${pos}`}
      style={{ fontSize: "clamp(1.6rem, 1.3vw, 2.6rem)", fontWeight: 400, letterSpacing: "-0.01em" }}
    >
      {note.arrow === "left" ? <span className="mr-[0.3em] font-sans font-light">←</span> : null}
      {note.text}
      {note.arrow === "right" ? <span className="ml-[0.3em] font-sans font-light">→</span> : null}
    </span>
  );
}

/** adcker's big six-armed asterisk, drawn, since Inter's sits small and high. */
function Star(): JSX.Element {
  return (
    <svg aria-hidden className="inline-block h-[0.62em] w-[0.62em] self-center" viewBox="-50 -50 100 100">
      {[0, 60, 120].map((a) => (
        <rect fill="currentColor" height="100" key={a} transform={`rotate(${a})`} width="17" x="-8.5" y="-50" />
      ))}
    </svg>
  );
}

/** "( ■ )": brackets in the display type, a square bar picture between them. */
function Pill({ i, source, onOpen, register }: { i: number; source: BarSource | null; onOpen: (i: number) => void; register: (i: number, el: HTMLButtonElement | null) => void }): JSX.Element {
  const p = projects[i];
  return (
    <span className="inline-flex items-baseline whitespace-nowrap">
      <span aria-hidden>(</span>
      <button
        aria-haspopup="dialog"
        aria-label={`${p.title}, open`}
        className="b38-pill relative mx-[0.32em] inline-block h-[0.74em] w-[0.74em] cursor-pointer align-baseline"
        onClick={() => onOpen(i)}
        ref={(el) => register(i, el)}
        style={{ outline: `0.1rem solid ${RULE}` }}
        type="button"
      >
        {source ? <BarPicture alt={p.title} cell={4} className="absolute inset-0" source={source} /> : null}
      </button>
      <span aria-hidden>)</span>
    </span>
  );
}

function Detail({ i, source, onClose }: { i: number; source: BarSource | null; onClose: () => void }): JSX.Element {
  const p = projects[i];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b38-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[6vh] md:px-[4vw]"
      data-lenis-prevent
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="b38-dialog mx-auto max-w-[136rem]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-[1.6rem]">
          <p className={SMALL}>({pad2(i + 1)})</p>
          <button className={`${SMALL} b38-link b38-under cursor-pointer`} onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>
        <h2
          className="mt-[3vh] text-center font-sans font-bold uppercase leading-[0.9] tracking-[-0.045em] text-white"
          id="b38-detail-title"
          style={{ fontSize: "clamp(4rem, 7vw, 12rem)", paddingBottom: "0.06em" }}
        >
          {p.title}
        </h2>
        <p className="mx-auto mt-[1.6rem] max-w-[80rem] text-center font-sans text-[clamp(1.7rem,1.5vw,2.4rem)] font-light leading-[1.35]">{p.tagline}</p>
        <div className="mt-[4vh] grid gap-[4vw] lg:grid-cols-[1.1fr_1fr]">
          <div className="relative aspect-[4/3] w-full" style={{ outline: LINE }}>
            {source ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div>
            <p className={`${SMALL} opacity-70`}>
              {p.year} · {p.kind}
            </p>
            <ul className="mt-[1.6rem] space-y-[1.2rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className="font-sans text-[1.5rem] leading-[1.55]" key={b}>
                  {b}
                </li>
              ))}
            </ul>
            <dl className="mt-[2rem] grid grid-cols-[8rem_1fr] gap-y-[0.8rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              <dt className={`${SMALL} opacity-60`}>Stack</dt>
              <dd className={`${SMALL} text-white`}>{p.stack.join(", ")}</dd>
              {p.award ? (
                <>
                  <dt className={`${SMALL} opacity-60`}>Award</dt>
                  <dd className={`${SMALL} text-white`}>{p.award}</dd>
                </>
              ) : null}
              {p.href || p.code ? (
                <>
                  <dt className={`${SMALL} opacity-60`}>Links</dt>
                  <dd className={`${SMALL} flex flex-wrap gap-x-[2rem] gap-y-[0.4rem]`}>
                    {p.href ? (
                      <a className="b38-link b38-under text-white" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b38-link b38-under text-white" href={p.code} rel="noreferrer" target="_blank">
                        Code ↗
                      </a>
                    ) : null}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillColumn({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="min-w-0">
      <h3 className={`${SMALL} text-white`}>{label}</h3>
      <div className="mt-[1rem]">{children}</div>
    </div>
  );
}

export default function B38(): JSX.Element {
  const [sources, setSources] = useState<BarSource[] | null>(null);
  const [open, setOpen] = useState(-1);
  const openers = useRef<(HTMLElement | null)[]>([]);
  const lastOpener = useRef<HTMLElement | null>(null);

  // Pictures are made in the browser only, after mount (Saturn's is drawn on a canvas).
  useEffect(() => {
    setSources(projects.map(projectSource));
  }, []);

  const openAt = useCallback((i: number, el?: HTMLElement | null) => {
    lastOpener.current = el ?? openers.current[i] ?? null;
    setOpen(i);
  }, []);
  const close = useCallback(() => {
    setOpen(-1);
    lastOpener.current?.focus();
  }, []);
  const register = useCallback((i: number, el: HTMLButtonElement | null) => {
    openers.current[i] = el;
  }, []);

  return (
    <div className="relative w-full" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* The statement. */}
      <section aria-label="Statement" className="px-[1.6rem] pb-[8vh] pt-[6vh] md:px-[4vw]">
        <h2
          className="text-center font-sans font-bold uppercase text-white"
          style={{ fontSize: "clamp(3.6rem, 7.6vw, 15rem)", lineHeight: 0.9, letterSpacing: "-0.045em" }}
        >
          {LINES.map((line, li) => (
            <span className="flex justify-center" key={li}>
              <span className="relative inline-flex items-baseline gap-x-[0.22em] pb-[0.04em]">
                {line.parts.map((part, pi) =>
                  typeof part === "string" ? (
                    <span className="whitespace-nowrap" key={pi}>
                      {part}
                    </span>
                  ) : "star" in part ? (
                    <Star key={pi} />
                  ) : (
                    <Pill i={part.pic} key={pi} onOpen={(i) => openAt(i, openers.current[i])} register={register} source={sources ? sources[part.pic] : null} />
                  ),
                )}
                {line.note ? <Note note={line.note} /> : null}
              </span>
            </span>
          ))}
        </h2>
      </section>

      {/* The numbered row. */}
      <section aria-label="Work" className="px-[1.6rem] pb-[9vh] md:px-[1vw]">
        <ol className="grid grid-cols-2 gap-x-[1.6rem] gap-y-[3.2rem] sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-[1vw]">
          {projects.map((p, i) => (
            <li key={p.title}>
              <button aria-haspopup="dialog" className="b38-thumb block w-full cursor-pointer text-left" onClick={(e) => openAt(i, e.currentTarget)} type="button">
                <span className={`${SMALL} block tabular-nums`}>({pad2(i + 1)})</span>
                <span className="b38-img relative mt-[1.2rem] block aspect-[4/3] w-full lg:w-[66%]">
                  {sources ? <BarPicture alt={p.title} cell={4} className="absolute inset-0" source={sources[i]} /> : null}
                </span>
                <span className={`${SMALL} b38-cap mt-[1rem] flex justify-between gap-[1rem] lg:w-[66%]`}>
                  <span className="min-w-0">{p.title}</span>
                  <span className="shrink-0 tabular-nums opacity-70">{p.year}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* The dark block: paragraph, skills, contact. */}
      <section aria-label="About" style={{ backgroundColor: DARK }}>
        <div className="mx-auto max-w-[168rem] px-[1.6rem] pb-[5vh] pt-[9vh] md:px-[4vw]">
          <p
            className="mx-auto max-w-[130rem] text-center font-serif-display leading-[1.08] tracking-[-0.02em] text-white"
            style={{ fontSize: "clamp(2.4rem, 3.2vw, 6rem)", paddingBottom: "0.1em" }}
          >
            I study computer engineering at the University of Toronto and I am CTO of The Actually Company, a speaking coach that runs on your own machine. Before that I led the programming for a VEX robotics team, and one of its autonomous routines set a world record.
          </p>
          <p className="mt-[4vh] text-center">
            <a className={`${SMALL} b38-link b38-under`} href={`mailto:${EMAIL}`}>
              Get in touch
            </a>
          </p>

          <div className="mt-[7vh] grid grid-cols-2 gap-x-[2.4rem] gap-y-[3.2rem] pt-[2.4rem] sm:grid-cols-3 lg:grid-cols-5" style={{ borderTop: LINE }}>
            {skillGroups.map((g) => (
              <SkillColumn key={g.label} label={g.label}>
                <ul className="space-y-[0.4rem]">
                  {g.skills.map((s) => {
                    const icon = skillIcon(s.icon);
                    return (
                      <li className="flex items-center gap-[0.8rem] font-sans text-[1.3rem] leading-[1.45] opacity-80" key={s.name}>
                        {icon ? (
                          <svg aria-hidden className="h-[1.2rem] w-[1.2rem] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d={icon.path} />
                          </svg>
                        ) : (
                          <span aria-hidden className="w-[1.2rem] shrink-0 text-center font-mono text-[0.7rem] leading-none tracking-[-0.04em] opacity-70">
                            {s.mark ?? "·"}
                          </span>
                        )}
                        <span className="min-w-0">{s.name}</span>
                      </li>
                    );
                  })}
                </ul>
              </SkillColumn>
            ))}
          </div>

          <ul className="mt-[5vh] flex flex-wrap justify-center gap-x-[3.2rem] gap-y-[0.8rem]">
            {awards.map((a) => (
              <li className={`${SMALL} opacity-80`} key={a.title}>
                {a.title} <span className="tabular-nums opacity-60">({a.year})</span>
              </li>
            ))}
          </ul>

          {/* Footer: the email large, the links small. */}
          <div className="mt-[5vh] pt-[4vh]" style={{ borderTop: LINE }}>
            <a
              className="b38-link block break-words text-center font-sans font-bold leading-[0.95] tracking-[-0.04em] text-white"
              href={`mailto:${EMAIL}`}
              style={{ fontSize: "clamp(2.4rem, 4.4vw, 8.4rem)", paddingBottom: "0.08em" }}
            >
              {EMAIL}
            </a>
            <div className="mt-[4vh] flex flex-col items-center justify-between gap-[1.6rem] sm:flex-row">
              <p className={`${SMALL} opacity-70`}>© Kevin He</p>
              <ul className="flex flex-wrap justify-center gap-x-[2.4rem] gap-y-[0.8rem]">
                {elsewhere.map((l) => (
                  <li key={l.href}>
                    <a className={`${SMALL} b38-link b38-under`} href={l.href} rel="noreferrer" target="_blank">
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {open >= 0 ? <Detail i={open} onClose={close} source={sources ? sources[open] : null} /> : null}
    </div>
  );
}
