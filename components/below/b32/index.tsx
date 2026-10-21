"use client";

import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 32, Filmstrip (after iamrossmason.com). The work is one row of
 * five pictures drawn as bars, each labelled above with its title, its
 * kind in brackets and its year. Pointing at one widens it (flex-grow
 * 1 to 3.2) and narrows the rest; its tagline and award show under the
 * row. "Strip, List" swaps the row for a plain list. A very large "Work"
 * in the display serif sits at the bottom, where Ross Mason puts his name.
 * Clicking a project opens it over the page; Esc or Close shuts it.
 *
 * Under it, the skills: five columns, then the email and the links.
 *
 * On a phone the row stacks into a column of shorter pictures.
 */

const SCREEN = "var(--arbor-screen-h)";
const RULE = "rgba(249, 185, 220, 0.25)";
const LABEL = "font-mono text-[1.2rem] uppercase tracking-[0.2em]";
const GROW = 3.2;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const KIND: Record<Project["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

// Width changes only from md up; on a phone the frames are a column.
// Under reduced motion nothing slides or fades: the widths jump.
const CSS = `
.b32-frame { transition: opacity 0.5s ease; }
@media (min-width: 768px) {
  .b32-frame { flex: var(--b32-grow) 1 0%; min-width: 0; transition: flex-grow 0.8s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.5s ease; }
}
.b32-strip[data-hover="true"] .b32-frame:not([data-on="true"]) { opacity: 0.5; }
.b32-cap { transition: opacity 0.4s ease; }
.b32-row { transition: background-color 0.3s ease; }
.b32-row:hover, .b32-row:focus-visible { background-color: rgba(249, 185, 220, 0.06); }
.b32-sheet { animation: b32-in 0.45s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b32-in { from { opacity: 0; transform: translateY(2rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b32-frame, .b32-cap, .b32-row { transition: none; }
  .b32-sheet { animation: none; }
}
`;

/** A link with its arrow; external links open in a new tab. */
function Out({ href, label }: { href: string; label: string }): JSX.Element {
  return (
    <a className="font-mono text-[1.4rem] leading-[1.6] text-white underline-offset-[0.35em] hover:underline" href={href} rel="noreferrer" target="_blank">
      {label} <span className="font-sans">↗</span>
    </a>
  );
}

/** The open project, over the page. */
function Detail({ p, source, onClose }: { p: Project; source: BarSource | null; onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      back?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b32-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div
        className="b32-sheet mx-auto grid min-h-full max-w-[180rem] grid-cols-1 content-center gap-[3.2rem] px-[1.6rem] py-[6rem] md:grid-cols-[1.2fr_1fr] md:gap-[5vw] md:px-[5vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-[34vh] w-full md:h-[72vh]" style={{ backgroundColor: BAND }}>
          {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" source={source} /> : null}
        </div>
        <div className="flex flex-col justify-center">
          <p className={`${LABEL} opacity-70`}>
            <span className="font-sans">[</span>
            {KIND[p.kind]}
            <span className="font-sans">]</span> {p.year}
          </p>
          <h3 className="mt-[1.2rem] font-sans text-[4rem] font-light leading-[1.05] text-white md:text-[5.6rem]" id="b32-detail-title">
            {p.title}
          </h3>
          <p className="mt-[1.6rem] font-sans text-[1.9rem] font-light leading-[1.45]">{p.tagline}</p>
          <ul className="mt-[2.4rem] space-y-[1rem] border-t pt-[2rem]" style={{ borderColor: RULE }}>
            {p.bullets.map((b) => (
              <li className="flex gap-[1.2rem] font-sans text-[1.5rem] font-light leading-[1.55]" key={b}>
                <span aria-hidden className="mt-[0.8rem] h-[0.4rem] w-[0.4rem] shrink-0 rounded-full" style={{ backgroundColor: BLOSSOM }} />
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-[2rem] font-mono text-[1.3rem] leading-[1.6] text-white">{p.stack.join(", ")}</p>
          {p.award ? <p className="mt-[0.6rem] font-mono text-[1.3rem] leading-[1.6] opacity-80">{p.award}</p> : null}
          <div className="mt-[1.6rem] flex flex-wrap gap-x-[2.4rem] gap-y-[0.8rem]">
            {p.href ? <Out href={p.href} label={hostOf(p.href)} /> : null}
            {p.code ? <Out href={p.code} label="Source" /> : null}
          </div>
          <button
            className={`${LABEL} mt-[3.2rem] self-start border-b pb-[0.4rem] text-white`}
            onClick={onClose}
            ref={closeRef}
            style={{ borderColor: RULE }}
            type="button"
          >
            Close <span className="font-sans normal-case tracking-normal opacity-60">Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function B32(): JSX.Element {
  const [sources, setSources] = useState<BarSource[] | null>(null);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);
  const [mode, setMode] = useState<"strip" | "list">("strip");

  // The pictures are canvases for Saturn: made in the browser only.
  useEffect(() => {
    setSources(projects.map(projectSource));
  }, []);

  const close = useCallback(() => setOpen(-1), []);
  const enter = (i: number) => () => setHover(i);
  const leave = (i: number) => () => setHover((h) => (h === i ? -1 : h));
  const shown = hover >= 0 ? projects[hover] : null;

  return (
    <div className="relative w-full font-sans" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <section className="flex flex-col px-[1.6rem] pb-[2rem] pt-[4rem] md:px-[3vw] md:pt-[5vh]" id="work" style={{ minHeight: SCREEN }}>
        <div className="flex items-baseline justify-between">
          <h2 className={`${LABEL} opacity-70`}>Selected work</h2>
          <p className={`${LABEL} opacity-70`}>
            {pad2(projects.length)} <span className="font-sans">/</span> 2021<span className="font-sans">–</span>2026
          </p>
        </div>

        {mode === "strip" ? (
          <div className="mt-[3.2rem] md:mt-[5vh]">
            <ul
              className="b32-strip flex flex-col gap-[2.4rem] md:flex-row md:gap-[1.2rem]"
              data-hover={hover >= 0}
              onPointerLeave={() => setHover(-1)}
            >
              {projects.map((p, i) => (
                <li
                  className="b32-frame"
                  data-on={hover === i}
                  key={p.title}
                  onPointerEnter={enter(i)}
                  style={{ ["--b32-grow" as string]: hover === i ? GROW : 1 }}
                >
                  <button
                    aria-haspopup="dialog"
                    className="block w-full cursor-pointer text-left"
                    onBlur={leave(i)}
                    onClick={() => setOpen(i)}
                    onFocus={enter(i)}
                    type="button"
                  >
                    <span className="flex min-h-[4.4rem] flex-col justify-end pb-[0.8rem] text-[1.3rem] leading-[1.3]">
                      <span className={hover === i ? "text-white" : undefined}>{p.title}</span>
                      <span className="opacity-70">
                        [{KIND[p.kind].toUpperCase()}] {p.year}
                      </span>
                    </span>
                    <span className="relative block h-[22rem] w-full md:h-[44vh]" style={{ backgroundColor: "rgba(42, 13, 30, 0.5)" }}>
                      {sources ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" source={sources[i]} /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {/* The pointed-at project's line; empty space held so nothing jumps. */}
            <div aria-live="polite" className="b32-cap mt-[1.6rem] hidden min-h-[5.6rem] md:block" style={{ opacity: shown ? 1 : 0.6 }}>
              {shown ? (
                <>
                  <p className="max-w-[80rem] text-[1.8rem] font-light leading-[1.4] text-white">{shown.tagline}</p>
                  {shown.award ? <p className="mt-[0.4rem] font-mono text-[1.3rem] leading-[1.6] opacity-80">{shown.award}</p> : null}
                </>
              ) : (
                <p className="font-mono text-[1.3rem] leading-[1.6]">Point at a picture. Click it to open.</p>
              )}
            </div>
          </div>
        ) : (
          <ol className="mt-[3.2rem] border-t md:mt-[5vh]" style={{ borderColor: RULE }}>
            {projects.map((p, i) => (
              <li className="border-b" key={p.title} style={{ borderColor: RULE }}>
                <button
                  aria-haspopup="dialog"
                  className="b32-row grid w-full cursor-pointer grid-cols-[1fr_auto] items-baseline gap-x-[2.4rem] gap-y-[0.4rem] py-[1.8rem] text-left md:grid-cols-[4rem_minmax(0,1.1fr)_minmax(0,2fr)_10rem_2rem]"
                  onClick={() => setOpen(i)}
                  type="button"
                >
                  <span className="hidden font-mono text-[1.3rem] tabular-nums opacity-60 md:block">{pad2(i + 1)}</span>
                  <span className="text-[2.2rem] font-light leading-[1.2] text-white">{p.title}</span>
                  <span className="order-last col-span-2 text-[1.5rem] font-light leading-[1.45] opacity-80 md:order-none md:col-span-1">{p.tagline}</span>
                  <span className="font-mono text-[1.3rem] tabular-nums opacity-70 md:text-right">{p.year}</span>
                  <span aria-hidden className="hidden text-right text-[1.6rem] md:block">
                    ↗
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-auto pt-[4vh]">
          <div className="flex items-baseline justify-between text-[1.4rem]">
            <p>
              <button className={mode === "strip" ? "text-white" : "opacity-40 hover:opacity-80"} onClick={() => setMode("strip")} type="button">
                Strip
              </button>
              ,{" "}
              <button className={mode === "list" ? "text-white" : "opacity-40 hover:opacity-80"} onClick={() => setMode("list")} type="button">
                List
              </button>
            </p>
            <p className="hidden opacity-70 sm:block">Click a project to open it</p>
          </div>
          <p
            aria-hidden
            className="font-serif-display pb-[0.1em] italic text-white"
            style={{ fontSize: "clamp(10rem, 24vw, 46rem)", lineHeight: 0.9, letterSpacing: "-0.02em" }}
          >
            Work
          </p>
        </div>
      </section>

      <section className="border-t px-[1.6rem] pb-[6rem] pt-[5rem] md:px-[3vw] md:pb-[8vh] md:pt-[8vh]" id="skills" style={{ borderColor: RULE }}>
        <h2 className={`${LABEL} opacity-70`}>Skills</h2>
        <div className="mt-[3.2rem] grid grid-cols-1 gap-x-[3vw] gap-y-[3.2rem] sm:grid-cols-2 md:grid-cols-5">
          {skillGroups.map((g) => (
            <div className="border-t pt-[1.2rem]" key={g.label} style={{ borderColor: RULE }}>
              <h3 className="flex items-baseline justify-between gap-[1rem] font-mono text-[1.15rem] uppercase leading-[1.4] tracking-[0.16em]">
                <span>{g.label}</span>
                <span className="tabular-nums opacity-60">{pad2(g.skills.length)}</span>
              </h3>
              <ul className="mt-[1.4rem] space-y-[0.4rem] text-[1.5rem] font-light leading-[1.45]">
                {g.skills.map((s) => (
                  <li key={s.name}>{s.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-[6rem] flex flex-col gap-[2rem] border-t pt-[2rem] md:flex-row md:items-baseline md:justify-between" id="contact" style={{ borderColor: RULE }}>
          <a className="break-all text-[2.4rem] font-light leading-[1.2] text-white underline-offset-[0.3em] hover:underline md:text-[3.2rem]" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <ul className="flex flex-wrap gap-x-[2.8rem] gap-y-[1rem] text-[1.4rem]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className="underline-offset-[0.3em] hover:text-white hover:underline" href={l.href} rel="noreferrer" target="_blank">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {open >= 0 ? <Detail onClose={close} p={projects[open]} source={sources ? sources[open] : null} /> : null}
    </div>
  );
}
