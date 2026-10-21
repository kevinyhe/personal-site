"use client";

import { type CSSProperties, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource, textPlate } from "@/components/below/barPicture";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 35, Recognition. After wodniack.dev's awards grid: one screen of
 * ruled cells, each an award with the organiser's name in huge heavy caps
 * and the result small under it in mono. The cells differ in width; three
 * empty ones are filled with bars (a hatch, and Saturn's one number) as
 * texture. The four cells that belong to a project show that project's
 * picture as bars on hover and open it on click.
 *
 * Then one short screen: the five projects as a ruled table (each row opens
 * the same detail), the five skill groups as short columns, and the email
 * and links at the foot.
 *
 * The detail is a full-window panel over the page: Esc, the close button or
 * a click on the backdrop shuts it and puts focus back where it was.
 */

const LABEL = "font-mono text-[1.3rem] uppercase tracking-[0.2em]";
const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const KIND: Record<Project["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

/** Project indices in profile.ts, looked up by title so a reorder there cannot mislink a cell. */
const at = (title: string): number => projects.findIndex((p) => p.title === title);

type Cell =
  | {
      kind: "award";
      /** The organiser, one entry per line. */
      lines: string[];
      result: string;
      /** Index into projects, or -1. */
      project: number;
      span: 1 | 2 | 3;
    }
  | { kind: "texture"; source: "hatch" | "saturn"; span: 1 }
  | { kind: "note"; text: string; span: 1 };

// Every fact below is in components/profile.ts.
const CELLS: Cell[] = [
  { kind: "award", lines: ["Hack the", "North"], result: "Finalist · 12 of 1,200+ · 2025", project: at("S‑KBD67"), span: 3 },
  { kind: "award", lines: ["Eureka", "Hacks"], result: "1st overall · 2026", project: at("King of the Ring"), span: 2 },
  { kind: "texture", source: "hatch", span: 1 },
  { kind: "texture", source: "saturn", span: 1 },
  { kind: "award", lines: ["VEX"], result: "World-record autonomous · 80th of ~20,000", project: at("mclib"), span: 2 },
  { kind: "award", lines: ["Founders,", "Inc."], result: "1 of 100 from 10,000+ · 2026", project: at("The Actually Company"), span: 3 },
  { kind: "award", lines: ["Ontario"], result: "Provincial Build Award · 2025", project: -1, span: 2 },
  { kind: "texture", source: "hatch", span: 1 },
  { kind: "award", lines: ["USACO"], result: "Silver · 2025", project: -1, span: 2 },
  { kind: "note", text: "Off Season II, San Francisco, Jun – Aug 2026", span: 1 },
];
const AWARD_COUNT = CELLS.filter((c) => c.kind === "award").length;
/** Each cell's running number among the awards (0 for the others). */
const NUMS = CELLS.map((c, i) => (c.kind === "award" ? CELLS.slice(0, i + 1).filter((d) => d.kind === "award").length : 0));

/**
 * Name size: the longest line fills the cell's width (Inter Black caps run
 * about 0.74em a letter), capped by the row's height so two lines, the
 * result and the padding still fit a quarter screen.
 */
function nameSize(lines: string[]): string {
  const longest = Math.max(...lines.map((l) => l.length));
  const cap = lines.length > 1 ? "9.5vh" : "13vh";
  return `min(calc((100cqi - 5rem) / ${(longest * 0.74).toFixed(2)}), ${cap})`;
}

const CSS = `
.b35-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: minmax(max(25vh, 22rem), auto); border-top: ${LINE}; border-left: ${LINE}; }
.b35-cell { position: relative; container-type: inline-size; border-right: ${LINE}; border-bottom: ${LINE}; min-width: 0; }
.b35-s1 { grid-column: span 1; }
.b35-s2 { grid-column: span 2; }
.b35-s3 { grid-column: span 3; }
.b35-pic { opacity: 0; transition: opacity 0.5s ease; }
.b35-name { transition: color 0.35s ease; }
.b35-link:hover .b35-pic, .b35-link:focus-visible .b35-pic { opacity: 0.85; }
.b35-link:hover .b35-name, .b35-link:focus-visible .b35-name { color: #ffffff; }
.b35-row { transition: color 0.3s ease, background-color 0.3s ease; }
.b35-row:hover, .b35-row:focus-visible { color: #ffffff; background-color: rgba(249, 185, 220, 0.06); }
.b35-arrow { display: inline-block; transition: transform 0.3s ease; }
.b35-row:hover .b35-arrow, .b35-row:focus-visible .b35-arrow { transform: translate(0.3rem, -0.3rem); }
.b35-table { grid-template-columns: 6rem minmax(0, 1fr) 16rem 12rem 3rem; }
.b35-skills { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@keyframes b35-in { from { opacity: 0; } to { opacity: 1; } }
.b35-panel { animation: b35-in 0.35s ease both; }
@media (max-width: 900px) {
  .b35-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: row dense; grid-auto-rows: minmax(18rem, auto); }
  .b35-s3 { grid-column: span 2; }
  .b35-table { grid-template-columns: 4rem minmax(0, 1fr) 9rem 2rem; }
  .b35-kind { display: none; }
  .b35-skills { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  .b35-pic, .b35-name, .b35-row, .b35-arrow { transition: none; }
  .b35-row:hover .b35-arrow, .b35-row:focus-visible .b35-arrow { transform: none; }
  .b35-panel { animation: none; }
}
`;

/** Diagonal hatching, white on black, for BarPicture to redraw as bars. */
function hatchPlate(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 600;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 600, 600);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 14;
  for (let x = -600; x < 1200; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 600);
    ctx.lineTo(x + 600, 0);
    ctx.stroke();
  }
  return c;
}

type Sources = { projects: BarSource[]; hatch: HTMLCanvasElement; saturn: BarSource };

/** Every picture the design draws, made once in the browser after the fonts load. */
function useSources(): Sources | null {
  const [src, setSrc] = useState<Sources | null>(null);
  useEffect(() => {
    let gone = false;
    const make = (): void => {
      if (gone) return;
      const all = projects.map((p) => projectSource(p));
      const saturn = projects.findIndex((p) => p.title === "Saturn");
      setSrc({
        projects: all,
        hatch: hatchPlate(),
        saturn: saturn >= 0 ? all[saturn] : textPlate("40,000+"),
      });
    };
    if (document.fonts?.ready) document.fonts.ready.then(make, make);
    else make();
    return () => {
      gone = true;
    };
  }, []);
  return src;
}

function AwardBody({ cell, n }: { cell: Extract<Cell, { kind: "award" }>; n: number }): JSX.Element {
  const style: CSSProperties = { fontSize: nameSize(cell.lines), lineHeight: 0.92 };
  return (
    <span className="relative z-10 flex h-full flex-col justify-between p-[2.4rem] text-left">
      <span className="flex items-baseline justify-between gap-[1.6rem] font-mono text-[1.2rem] uppercase tracking-[0.18em] opacity-70">
        <span className="tabular-nums">{pad2(n)}</span>
        {cell.project >= 0 ? <span>Open ↗</span> : null}
      </span>
      <span className="mt-[2.4rem] block">
        <span className="b35-name block font-sans font-black uppercase tracking-tight" style={style}>
          {cell.lines.map((l) => (
            <span className="block" key={l}>
              {l}
            </span>
          ))}
        </span>
        <span className="mt-[1.4rem] block font-mono text-[1.3rem] leading-[1.5] tracking-[0.04em] opacity-90">{cell.result}</span>
      </span>
    </span>
  );
}

function Detail({ p, source, onClose }: { p: Project; source: BarSource | null; onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const links = [
    p.href ? { label: "Site", href: p.href } : null,
    p.code ? { label: "Code", href: p.code } : null,
  ].filter((l): l is { label: string; href: string } => l !== null);

  return (
    <div
      aria-labelledby="b35-detail-title"
      aria-modal="true"
      className="b35-panel fixed inset-0 z-[100] overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.96)", color: BLOSSOM }}
    >
      <div className="mx-auto w-full max-w-[160rem] px-[1.6rem] py-[3rem] md:px-[4vw] md:py-[5vh]">
        <div className="flex items-baseline justify-between gap-[2rem] pb-[1.6rem]" style={{ borderBottom: LINE }}>
          <p className={`${LABEL} opacity-70`}>
            {KIND[p.kind]} · {p.year}
          </p>
          <button className={`${LABEL} cursor-pointer text-white underline-offset-[0.35em] hover:underline`} onClick={onClose} ref={closeRef} type="button">
            Close (Esc)
          </button>
        </div>
        <div className="mt-[3rem] grid gap-[3rem] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-[4vw]">
          <div className="relative aspect-[4/3] w-full" style={{ border: LINE }}>
            {source ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" level={1} source={source} /> : null}
          </div>
          <div>
            <h3
              className="font-sans font-black uppercase tracking-tight text-white"
              id="b35-detail-title"
              style={{ fontSize: "clamp(3.6rem, 5vw, 8.4rem)", lineHeight: 0.95 }}
            >
              {p.title}
            </h3>
            <p className="mt-[2rem] font-sans text-[2rem] font-light leading-[1.4] text-white">{p.tagline}</p>
            <ul className="mt-[2.4rem] space-y-[1.2rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className="pt-[1.2rem] font-sans text-[1.6rem] font-light leading-[1.55]" key={b}>
                  {b}
                </li>
              ))}
            </ul>
            <p className="mt-[2.4rem] font-mono text-[1.3rem] leading-[1.6] text-white">{p.stack.join(" · ")}</p>
            {p.award ? <p className="mt-[0.8rem] font-mono text-[1.3rem] leading-[1.6] opacity-85">{p.award}</p> : null}
            {links.length ? (
              <ul className="mt-[2rem] flex flex-wrap gap-x-[3rem] gap-y-[1rem]">
                {links.map((l) => (
                  <li key={l.href}>
                    <a className="font-mono text-[1.4rem] leading-[1.6] text-white underline underline-offset-[0.35em]" href={l.href} rel="noreferrer" target="_blank">
                      {l.label}: {hostOf(l.href)} ↗
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function B35(): JSX.Element {
  const src = useSources();
  const [open, setOpen] = useState(-1);
  const openerRef = useRef<HTMLElement | null>(null);

  const show = useCallback((i: number, el: HTMLElement) => {
    openerRef.current = el;
    setOpen(i);
  }, []);
  const close = useCallback(() => {
    setOpen(-1);
    openerRef.current?.focus();
  }, []);

  return (
    <div className="relative w-full" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <section className="px-[1.6rem] pb-[6vh] pt-[5vh] md:px-[3vw]" id="recognition">
        <div className="mb-[2.4rem] flex flex-wrap items-baseline justify-between gap-x-[3rem] gap-y-[0.8rem]">
          <h2 className={`${LABEL} opacity-80`}>Recognition · {pad2(AWARD_COUNT)}</h2>
          <p className={`${LABEL} opacity-60`}>Four of these open the project behind them</p>
        </div>
        <div className="b35-grid">
          {CELLS.map((c, i) => {
            if (c.kind === "texture") {
              const source = src ? (c.source === "hatch" ? src.hatch : src.saturn) : null;
              return (
                <div aria-hidden className="b35-cell b35-s1" key={i}>
                  {source ? <BarPicture cell={6} className="absolute inset-0" level={c.source === "hatch" ? 0.7 : 1} source={source} /> : null}
                </div>
              );
            }
            if (c.kind === "note") {
              return (
                <div className="b35-cell b35-s1 flex items-center justify-center p-[2rem]" key={i}>
                  <p className="text-center font-sans text-[1.8rem] font-light leading-[1.3]">{c.text}</p>
                </div>
              );
            }
            const num = NUMS[i];
            const span = `b35-s${c.span}`;
            if (c.project < 0) {
              return (
                <div className={`b35-cell ${span}`} key={i}>
                  <AwardBody cell={c} n={num} />
                </div>
              );
            }
            const p = projects[c.project];
            return (
              <button
                aria-haspopup="dialog"
                aria-label={`${c.lines.join(" ")}, ${c.result}. Open ${p.title}`}
                className={`b35-cell b35-link ${span} cursor-pointer`}
                key={i}
                onClick={(e) => show(c.project, e.currentTarget)}
                type="button"
              >
                {src ? (
                  <span aria-hidden className="b35-pic absolute inset-0 block">
                    <BarPicture cell={6} source={src.projects[c.project]} />
                  </span>
                ) : null}
                <AwardBody cell={c} n={num} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="px-[1.6rem] pb-[8vh] pt-[4vh] md:px-[3vw]" id="work">
        <h2 className={`${LABEL} mb-[1.6rem] opacity-80`}>Work · {pad2(projects.length)}</h2>
        <ol style={{ borderTop: LINE }}>
          {projects.map((p, i) => (
            <li key={p.title} style={{ borderBottom: LINE }}>
              <button
                aria-haspopup="dialog"
                className="b35-row b35-table grid w-full cursor-pointer items-baseline gap-x-[1.6rem] py-[1.4rem] text-left"
                onClick={(e) => show(i, e.currentTarget)}
                type="button"
              >
                <span className="font-mono text-[1.3rem] tabular-nums opacity-70">{pad2(i + 1)}</span>
                <span className="font-sans font-black uppercase tracking-tight" style={{ fontSize: "clamp(2.4rem, 3.2vw, 5rem)", lineHeight: 0.95 }}>
                  {p.title}
                </span>
                <span className="b35-kind font-mono text-[1.3rem] uppercase tracking-[0.16em] opacity-80">{KIND[p.kind]}</span>
                <span className="font-mono text-[1.3rem] tabular-nums opacity-80">{p.year}</span>
                <span aria-hidden className="b35-arrow font-sans text-[1.8rem] leading-none">
                  ↗
                </span>
              </button>
            </li>
          ))}
        </ol>

        <h2 className={`${LABEL} mb-[1.6rem] mt-[6vh] opacity-80`} id="skills">
          Skills · {pad2(skillGroups.length)}
        </h2>
        <div className="b35-skills grid gap-x-[2.4rem] gap-y-[3rem]" style={{ borderTop: LINE }}>
          {skillGroups.map((g, i) => (
            <div className="pt-[1.6rem]" key={g.label}>
              <h3 className="font-mono text-[1.2rem] uppercase leading-[1.5] tracking-[0.16em] text-white">
                {pad2(i + 1)} {g.label}
              </h3>
              <ul className="mt-[1.2rem]">
                {g.skills.map((s) => (
                  <li className="font-sans text-[1.5rem] font-light leading-[1.55]" key={s.name}>
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-[7vh] flex flex-wrap items-end justify-between gap-x-[4rem] gap-y-[2.4rem] pt-[2.4rem]" id="contact" style={{ borderTop: LINE }}>
          <a
            className="break-all font-sans font-black tracking-tight text-white underline-offset-[0.2em] hover:underline"
            href={`mailto:${EMAIL}`}
            style={{ fontSize: "clamp(2.2rem, 3.4vw, 5.2rem)", lineHeight: 1 }}
          >
            {EMAIL}
          </a>
          <ul className="flex flex-wrap gap-x-[3rem] gap-y-[1.2rem] font-mono text-[1.4rem]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className="group block" href={l.href} rel="noreferrer" target="_blank">
                  <span className="block text-[1.1rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
                  <span className="mt-[0.4rem] block text-white underline-offset-[0.35em] group-hover:underline">{l.handle} ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {open >= 0 ? <Detail onClose={close} p={projects[open]} source={src ? src.projects[open] : null} /> : null}
    </div>
  );
}
