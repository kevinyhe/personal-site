"use client";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource, textPlate } from "@/components/below/barPicture";
import { education, experience, projects, skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 48, Works (after noth.in).
 *
 * A two-line sentence in large medium-weight sans at the top left. Under it
 * a small "( The short version )" label, one short paragraph beside it, and
 * one bar picture on the right. Then a deeper plum band: "WORKS" in bold
 * caps at the top left and a two-line sentence at the right. Under that the
 * five projects are pictures of different sizes, set on a twelve-column
 * grid, each one pushed down by a different amount so the rows do not line
 * up. Above each picture: a tiny mono line (name, number, year) and one
 * line of sans (the tagline, cut to its first sentence). Pointing at a
 * picture turns its bars up; clicking opens its detail over the page.
 * A footer row reads "View all ↳ (05) © 21–26"; "View all" opens a plain
 * list of the projects under it. Last, the skills and contact in small
 * sans under bracketed labels, as noth.in sets its small text.
 *
 * The bar pictures draw on 2D canvases made in the browser only, so they
 * wait for a mounted flag and the server render has empty boxes. Under
 * reduced motion nothing fades or slides.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const DEEP = "rgba(26, 8, 18, 0.7)";
const TINY = "font-mono text-[1.1rem] uppercase leading-[1.4] tracking-[0.08em]";
const SMALL = "font-sans text-[1.6rem] leading-[1.35] tracking-[-0.01em]";
const MONO_FONT = "500 {size}px ui-monospace, SFMono-Regular, Menlo, monospace";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");

const KIND: Record<(typeof projects)[number]["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

/** The tagline's first sentence, or the part before its colon. */
function shortLine(tagline: string): string {
  const cut = tagline.split(/[.:]/)[0].trim();
  return `${cut}.`;
}

// "© 21–26": the first and last years any project runs over.
const YEARS = projects.flatMap((p) => (p.year.match(/\d{4}/g) ?? []).map(Number));
const SPAN = `${String(Math.min(...YEARS)).slice(2)}–${String(Math.max(...YEARS)).slice(2)}`;

const LEAD = experience[0];
const VEX = experience.find((e) => e.org.includes("VEX"));
const STATEMENT = [`${LEAD.role}, ${LEAD.org}.`, `Computer Engineering, ${education.school}.`];
const WORKS_LINE = skillGroups[1].blurb.split(". ").map((l, i, all) => (i < all.length - 1 ? `${l}.` : l));
const SHORT_VERSION = [
  LEAD.bullets[0],
  `${experience[1].role.split(",")[0]} at ${experience[1].org}, one of 100 from 10,000+ applicants.`,
  VEX ? `Captain and lead programmer of ${VEX.org.split(", ")[1]}: odometry, feedback control and motion profiling in C++.` : "",
].join(" ");

/**
 * Where each picture sits on the twelve columns, its shape, and how far it
 * drops below the top of its row. Row one: 0, 1, 2. Row two: 3, 4.
 * Below 1024px wide they stack, alternating wide and narrow, left and right.
 */
const LAYOUT = [
  { cell: "lg:col-start-1 lg:col-end-5 lg:mt-0", phone: "w-full", aspect: "aspect-[16/10]" },
  { cell: "lg:col-start-6 lg:col-end-9 lg:mt-[10rem]", phone: "ml-auto w-[78%]", aspect: "aspect-[4/3]" },
  { cell: "lg:col-start-11 lg:col-end-13 lg:mt-[4rem]", phone: "w-[64%]", aspect: "aspect-[3/4]" },
  { cell: "lg:col-start-3 lg:col-end-7 lg:mt-[4rem]", phone: "ml-auto w-[86%]", aspect: "aspect-[16/10]" },
  { cell: "lg:col-start-9 lg:col-end-12 lg:mt-[10rem]", phone: "w-[80%]", aspect: "aspect-[16/10]" },
];

const CSS = `
.b48-link { transition: color 0.25s ease, opacity 0.25s ease; }
.b48-link:hover, .b48-link:focus-visible { color: #ffffff; opacity: 1; }
.b48-work .b48-cap { transition: color 0.3s ease; }
.b48-work:hover .b48-cap, .b48-work:focus-visible .b48-cap { color: #ffffff; }
.b48-work .b48-pic { transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1); }
.b48-work:hover .b48-pic, .b48-work:focus-visible .b48-pic { transform: translateY(-0.6rem); }
.b48-arrow { display: inline-block; transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
.b48-all:hover .b48-arrow, .b48-all:focus-visible .b48-arrow { transform: translateX(0.6rem); }
.b48-dialog { animation: b48-in 0.4s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b48-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b48-link, .b48-work .b48-cap, .b48-work .b48-pic, .b48-arrow { transition: none; }
  .b48-work:hover .b48-pic, .b48-work:focus-visible .b48-pic, .b48-all:hover .b48-arrow, .b48-all:focus-visible .b48-arrow { transform: none; }
  .b48-dialog { animation: none; }
}
`;

function Detail({ i, source, onClose }: { i: number; source: BarSource | null; onClose: () => void }): JSX.Element {
  const p = projects[i];
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b48-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[1.6rem] md:px-[2.4rem] md:py-[2.4rem]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(26, 8, 18, 0.94)", color: BLOSSOM }}
    >
      <div className="b48-dialog mx-auto max-w-[160rem]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between gap-[1.6rem]">
          <p className={`${TINY} opacity-70`}>
            {p.title} — ({pad2(i + 1)}) · {p.year}
          </p>
          <button className="b48-link cursor-pointer font-sans text-[1.4rem] font-bold uppercase tracking-[-0.01em] text-white" onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>

        <div className="mt-[3.2rem] grid grid-cols-1 gap-x-[2.4rem] gap-y-[3.2rem] md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="relative aspect-[4/3] w-full">
              {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" fit="contain" source={source} /> : null}
            </div>
          </div>
          <div className="min-w-0 md:col-span-5">
            <h2 className="font-sans text-[clamp(3.2rem,4vw,6.4rem)] font-medium leading-[1] tracking-[-0.04em] text-white" id="b48-detail-title">
              {p.title}
            </h2>
            <p className="mt-[1.6rem] font-sans text-[2rem] font-medium leading-[1.25] tracking-[-0.02em]">{p.tagline}</p>
            <ul className="mt-[2.4rem] space-y-[1.2rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className={`${SMALL} flex gap-[1rem]`} key={b}>
                  <span aria-hidden className="shrink-0 opacity-60">
                    —
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-[2.4rem] grid grid-cols-[8rem_1fr] gap-y-[0.8rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              <dt className={`${TINY} pt-[0.3rem] opacity-60`}>Stack</dt>
              <dd className={SMALL}>{p.stack.join(", ")}</dd>
              {p.award ? (
                <>
                  <dt className={`${TINY} pt-[0.3rem] opacity-60`}>Award</dt>
                  <dd className={`${SMALL} text-white`}>{p.award}</dd>
                </>
              ) : null}
              {p.href || p.code ? (
                <>
                  <dt className={`${TINY} pt-[0.3rem] opacity-60`}>Links</dt>
                  <dd className={`${SMALL} flex flex-wrap gap-x-[2rem] gap-y-[0.4rem]`}>
                    {p.href ? (
                      <a className="b48-link break-all text-white" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b48-link text-white" href={p.code} rel="noreferrer" target="_blank">
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

export default function B48(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);
  const [listOpen, setListOpen] = useState(false);
  const lastOpener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Canvases and image paths for the bar pictures, made once in the browser.
  const pics = useMemo(() => {
    if (!mounted) return null;
    return {
      projects: projects.map((p) => projectSource(p)),
      aside: textPlate("82855Z", { width: 1200, height: 750, font: MONO_FONT }),
    };
  }, [mounted]);

  const show = useCallback((i: number, from: HTMLButtonElement | null) => {
    lastOpener.current = from;
    setOpen(i);
  }, []);

  const close = useCallback(() => {
    setOpen(-1);
    lastOpener.current?.focus();
  }, []);

  const count = pad2(projects.length);

  return (
    <div className="relative w-full font-sans" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* The two-line sentence, then the short version beside one picture. */}
      <div className="px-[1.6rem] pb-[7vh] pt-[7vh] md:px-[2.4rem]">
        <h2 className="font-medium leading-[0.98] tracking-[-0.045em] text-white" style={{ fontSize: "clamp(3.4rem, 5vw, 10rem)" }}>
          {STATEMENT.map((l) => (
            <span className="block" key={l}>
              {l}
            </span>
          ))}
        </h2>

        <div className="mt-[6vh] grid grid-cols-1 gap-x-[2.4rem] gap-y-[2.4rem] md:grid-cols-12">
          <p className="text-[1.8rem] leading-[1.2] tracking-[-0.02em] md:col-span-3 md:self-end md:pb-[3rem] lg:col-span-2">( The short version )</p>
          <p className="max-w-[44rem] text-[1.8rem] leading-[1.2] tracking-[-0.02em] md:col-span-5 md:self-end md:pb-[3rem] lg:col-span-4">{SHORT_VERSION}</p>
          <div className="relative aspect-[16/10] w-full md:col-start-9 md:col-end-13 lg:col-start-10">
            {pics ? <BarPicture alt="82855Z" cell={6} className="absolute inset-0" fit="contain" level={0.8} source={pics.aside} /> : null}
          </div>
        </div>
      </div>

      {/* The deeper band: WORKS. */}
      <section aria-labelledby="b48-works" className="px-[1.6rem] pb-[6vh] pt-[2.4rem] md:px-[2.4rem]" style={{ backgroundColor: DEEP }}>
        <h2 className="text-[clamp(2.4rem,2vw,3.6rem)] font-bold uppercase leading-[1] tracking-[-0.04em] text-white" id="b48-works">
          Works
        </h2>
        <div className="mt-[4vh] grid grid-cols-1 md:grid-cols-12">
          <p className="font-medium leading-[1.08] tracking-[-0.035em] text-white md:col-start-8 md:col-end-13" style={{ fontSize: "clamp(2.6rem, 2.6vw, 5rem)" }}>
            {WORKS_LINE.map((l) => (
              <span className="block" key={l}>
                {l}
              </span>
            ))}
          </p>
        </div>

        {/* The staggered pictures. */}
        <ul className="mt-[6vh] grid grid-cols-1 items-start gap-x-[2.4rem] gap-y-[6rem] lg:grid-cols-12 lg:gap-y-[4rem]">
          {projects.map((p, i) => {
            const at = LAYOUT[i % LAYOUT.length];
            return (
              <li className={`${at.phone} ${at.cell} lg:ml-0 lg:w-auto`} key={p.title}>
                <button
                  aria-haspopup="dialog"
                  className="b48-work block w-full cursor-pointer text-left"
                  onBlur={() => setHover((h) => (h === i ? -1 : h))}
                  onClick={(e) => show(i, e.currentTarget)}
                  onFocus={() => setHover(i)}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? -1 : h))}
                  type="button"
                >
                  <span className={`${TINY} flex justify-between gap-[1rem] opacity-70`}>
                    <span className="min-w-0">{p.title}</span>
                    <span className="shrink-0 tabular-nums">
                      ({pad2(i + 1)}) {p.year}
                    </span>
                  </span>
                  <span className="b48-cap mt-[1rem] block text-[clamp(1.8rem,1.4vw,2.6rem)] font-medium leading-[1.15] tracking-[-0.03em]">{shortLine(p.tagline)}</span>
                  <span className={`b48-pic relative mt-[1.4rem] block w-full ${at.aspect}`}>
                    {pics ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" level={hover === i ? 1 : 0.6} source={pics.projects[i]} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* WORKS  View all ↳  (05)  © 21–26 */}
        <div className="mt-[8vh]">
          <p className="text-[clamp(2.4rem,2vw,3.6rem)] font-bold uppercase leading-[1] tracking-[-0.04em] text-white" aria-hidden>
            Works
          </p>
          <div className="mt-[3vh] grid grid-cols-[1fr_auto_1fr] items-baseline gap-[1.6rem]">
            <button
              aria-controls="b48-all"
              aria-expanded={listOpen}
              className="b48-all b48-link cursor-pointer justify-self-start whitespace-nowrap text-left font-normal leading-[1] tracking-[-0.04em] text-white"
              onClick={() => setListOpen((v) => !v)}
              style={{ fontSize: "clamp(3rem, 2.8vw, 5.2rem)" }}
              type="button"
            >
              {listOpen ? "Close" : "View all"} <span className="b48-arrow text-[0.45em]">{listOpen ? "↑" : "↳"}</span>
            </button>
            <span className="text-[1.8rem] tabular-nums tracking-[-0.01em] text-white">({count})</span>
            <span className="justify-self-end text-[1.8rem] tabular-nums tracking-[-0.01em] text-white">© {SPAN}</span>
          </div>

          {listOpen ? (
            <ol className="mt-[4vh]" id="b48-all" style={{ borderTop: LINE }}>
              {projects.map((p, i) => (
                <li key={p.title} style={{ borderBottom: LINE }}>
                  <button
                    aria-haspopup="dialog"
                    className="b48-link grid w-full cursor-pointer grid-cols-[4rem_1fr_auto] items-baseline gap-x-[1.6rem] py-[1.2rem] text-left md:grid-cols-[6rem_3fr_4fr_12rem_8rem]"
                    onClick={(e) => show(i, e.currentTarget)}
                    type="button"
                  >
                    <span className={`${TINY} tabular-nums opacity-60`}>({pad2(i + 1)})</span>
                    <span className="min-w-0 text-[1.8rem] font-medium tracking-[-0.02em] text-white">{p.title}</span>
                    <span className="hidden min-w-0 text-[1.6rem] leading-[1.3] tracking-[-0.01em] opacity-80 md:block">{shortLine(p.tagline)}</span>
                    <span className={`${TINY} hidden opacity-70 md:block`}>{KIND[p.kind]}</span>
                    <span className={`${TINY} text-right tabular-nums opacity-70`}>{p.year}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>

      {/* Skills and contact, in small type under bracketed labels. */}
      <div className="px-[1.6rem] pb-[7vh] pt-[7vh] md:px-[2.4rem]">
        <div className="grid grid-cols-1 gap-x-[2.4rem] gap-y-[2rem] md:grid-cols-12">
          <p className="text-[1.8rem] leading-[1.2] tracking-[-0.02em] md:col-span-3 lg:col-span-2">( Skills )</p>
          <dl className="grid gap-y-[1.4rem] md:col-span-9 lg:col-span-10">
            {skillGroups.map((g) => (
              <div className="grid grid-cols-1 gap-x-[2.4rem] gap-y-[0.6rem] sm:grid-cols-[18rem_1fr]" key={g.label}>
                <dt className={`${TINY} pt-[0.3rem] opacity-60`}>{g.label}</dt>
                <dd className="flex flex-wrap gap-x-[2rem] gap-y-[0.4rem]">
                  {g.skills.map((s) => {
                    const icon = skillIcon(s.icon);
                    return (
                      <span className="inline-flex items-center gap-[0.6rem] whitespace-nowrap text-[1.6rem] leading-[1.3] tracking-[-0.01em]" key={s.name}>
                        {icon ? (
                          <svg aria-hidden className="h-[1.2rem] w-[1.2rem] shrink-0 opacity-70" fill="currentColor" viewBox="0 0 24 24">
                            <path d={icon.path} />
                          </svg>
                        ) : null}
                        {s.name}
                      </span>
                    );
                  })}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-[6vh] grid grid-cols-1 gap-x-[2.4rem] gap-y-[2rem] pt-[2.4rem] md:grid-cols-12" style={{ borderTop: LINE }}>
          <p className="text-[1.8rem] leading-[1.2] tracking-[-0.02em] md:col-span-3 lg:col-span-2">( Contact )</p>
          <div className="min-w-0 md:col-span-9 lg:col-span-10">
            <a
              className="b48-link break-all font-medium leading-[1] tracking-[-0.04em] text-white"
              href={`mailto:${EMAIL}`}
              style={{ fontSize: "clamp(2.4rem, 3.2vw, 6rem)" }}
            >
              {EMAIL}
            </a>
            <ul className="mt-[3.2rem] flex flex-wrap gap-x-[3.2rem] gap-y-[1rem] text-[1.6rem] leading-[1.3] tracking-[-0.01em]">
              {elsewhere.map((l) => (
                <li key={l.href}>
                  <a className="b48-link whitespace-nowrap" href={l.href} rel="noreferrer" target="_blank">
                    {l.label} <span className="opacity-60">{l.handle}</span> ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {open >= 0 ? <Detail i={open} onClose={close} source={pics ? pics.projects[open] : null} /> : null}
    </div>
  );
}
