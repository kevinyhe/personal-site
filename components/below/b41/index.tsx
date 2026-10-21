"use client";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource, textPlate } from "@/components/below/barPicture";
import { awards, experience, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 41, Capabilities (after formandfun.co).
 *
 * A row of five square project pictures with rounded corners, drawn as
 * vertical bars. Pointing at one brightens it; clicking opens its detail
 * over the page. Under the row, "WORK" in huge caps, and on the line below
 * the four kinds of work in the same size but dim, sliding sideways in a
 * loop; "Selected work (21–26)" sits small at the right.
 *
 * Then "Expertise & Capabilities": the five skill groups as columns. Each
 * has a tinted block on top (the group's first skill set as type, drawn as
 * bars), the group name large, and its skills in two short lists.
 *
 * Then "RECOGNISED WORK" in huge caps over formandfun's ruled table:
 * number, award, project, category, year. Contact is one small row last.
 *
 * On a phone the squares scroll sideways and the columns stack. Under
 * reduced motion the kinds line stands still and wraps instead of sliding.
 *
 * The bar pictures draw on 2D canvases built in the browser only, so they
 * wait for a mounted flag and the server render has empty boxes.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const DIM = "rgba(249, 185, 220, 0.55)";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const HUGE = "font-sans font-normal uppercase leading-[0.9] tracking-[-0.035em] text-[clamp(4.4rem,7.3vw,16rem)]";
const SMALL = "font-sans text-[1.5rem] leading-[1.6]";

const KIND: Record<(typeof projects)[number]["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};
const KINDS = Array.from(new Set(projects.map((p) => KIND[p.kind].toUpperCase())));

// "21–26" from the projects' years.
const YEARS = projects.flatMap((p) => (p.year.match(/\d{4}/g) ?? []).map(Number));
const SPAN = `${String(Math.min(...YEARS)).slice(2)}–${String(Math.max(...YEARS)).slice(2)}`;

const byAward = (needle: string): string => projects.find((p) => p.award?.includes(needle))?.title ?? "";
const awardYear = (needle: string): string => awards.find((a) => a.title.includes(needle))?.year ?? "";
const vex = experience.find((e) => e.org.includes("VEX"));
const mclib = projects.find((p) => p.kind === "library");

/** formandfun's table: award | project | category (a line or two) | year. */
const RECOGNITION: { award: string; project: string; category: string[]; year: string }[] = [
  { award: "1st overall, EurekaHacks", project: byAward("EurekaHacks"), category: ["Hackathon"], year: awardYear("EurekaHacks") },
  {
    award: "Founders, Inc. Off Season II",
    project: projects[0].title,
    category: ["Residency", "1 of 100 from 10,000 applicants"],
    year: awardYear("Founders"),
  },
  {
    award: "Finalist, Hack The North",
    project: byAward("Hack The North"),
    category: ["Hackathon", "1 of 12 finalists from 1,200+ hackers"],
    year: awardYear("Hack The North"),
  },
  { award: "Ontario Provincial Build Award", project: vex ? "VEX 82855Z" : "", category: ["Robotics", "Mechanism design"], year: awardYear("Provincial") },
  { award: "USACO Silver", project: "—", category: ["Competitive programming"], year: awardYear("USACO") },
  {
    award: "World-record autonomous",
    project: mclib?.title ?? "",
    category: ["VEX High Stakes", "80th of ~20,000 teams, global Skills"],
    year: mclib?.year ?? "",
  },
];

// Block tints, standing in for formandfun's three pastels.
const TINTS = [0.14, 0.08, 0.18, 0.1, 0.16];

const CSS = `
.b41-sq .b41-box { transition: background-color 0.35s ease; }
.b41-sq .b41-cap { transition: color 0.3s ease, opacity 0.3s ease; }
.b41-sq:hover .b41-box, .b41-sq:focus-visible .b41-box { background-color: rgba(249, 185, 220, 0.12) !important; }
.b41-sq:hover .b41-cap, .b41-sq:focus-visible .b41-cap { color: #ffffff; opacity: 1; }
.b41-link { transition: color 0.2s ease; }
.b41-link:hover, .b41-link:focus-visible { color: #ffffff; text-decoration: underline; text-underline-offset: 0.25em; text-decoration-thickness: 0.1rem; }
.b41-rows { scrollbar-width: none; }
.b41-rows::-webkit-scrollbar { display: none; }
.b41-track { display: flex; width: max-content; animation: b41-slide 38s linear infinite; }
.b41-track > span { padding-right: 0.45em; white-space: nowrap; }
@keyframes b41-slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.b41-dialog { animation: b41-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b41-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b41-sq .b41-box, .b41-sq .b41-cap, .b41-link { transition: none; }
  .b41-track { animation: none; width: auto; flex-wrap: wrap; }
  .b41-track > [data-copy] { display: none; }
  .b41-dialog { animation: none; }
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const facts: { label: string; body: JSX.Element }[] = [
    { label: "Stack", body: <>{p.stack.join(", ")}</> },
    ...(p.award ? [{ label: "Award", body: <>{p.award}</> }] : []),
  ];

  return (
    <div
      aria-labelledby="b41-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[1.6rem] md:py-[6vh]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="b41-dialog mx-auto max-w-[150rem]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between gap-[1.6rem] pb-[1.6rem]">
          <p className={SMALL} style={{ color: DIM }}>
            {pad2(i + 1)} / {pad2(projects.length)} · {KIND[p.kind]}
          </p>
          <button className={`${SMALL} b41-link cursor-pointer`} onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>
        <div className="grid gap-[1.6rem] lg:grid-cols-[1.15fr_1fr]">
          <div className="relative aspect-square w-full overflow-hidden rounded-[0.8rem]" style={{ backgroundColor: "rgba(249, 185, 220, 0.08)" }}>
            {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className="min-w-0 lg:pl-[2.4rem]">
            <h2
              className="font-sans text-[clamp(3.6rem,4vw,7.2rem)] font-normal leading-[1] tracking-[-0.03em] text-white"
              id="b41-detail-title"
            >
              {p.title}
            </h2>
            <p className="mt-[2rem] max-w-[60rem] font-sans text-[1.9rem] leading-[1.4]">{p.tagline}</p>
            <ul className="mt-[2.8rem] space-y-[1.2rem] pt-[2rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className="flex max-w-[64rem] gap-[1.2rem] font-sans text-[1.5rem] leading-[1.55]" key={b}>
                  <span aria-hidden style={{ color: DIM }}>
                    —
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-[2.8rem] grid grid-cols-2 gap-x-[2.4rem] gap-y-[2rem] pt-[2rem] sm:grid-cols-3" style={{ borderTop: LINE }}>
              {facts.map((f) => (
                <div className="min-w-0" key={f.label}>
                  <dt className="font-sans text-[1.3rem] leading-[1.5]" style={{ color: DIM }}>
                    {f.label}
                  </dt>
                  <dd className={`${SMALL} mt-[0.4rem] text-white`}>{f.body}</dd>
                </div>
              ))}
              <div className="min-w-0">
                <dt className="font-sans text-[1.3rem] leading-[1.5]" style={{ color: DIM }}>
                  Year
                </dt>
                <dd className={`${SMALL} mt-[0.4rem] tabular-nums text-white`}>{p.year}</dd>
              </div>
              {p.href || p.code ? (
                <div className="min-w-0">
                  <dt className="font-sans text-[1.3rem] leading-[1.5]" style={{ color: DIM }}>
                    Links
                  </dt>
                  <dd className={`${SMALL} mt-[0.4rem] flex flex-col`}>
                    {p.href ? (
                      <a className="b41-link break-all text-white" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b41-link text-white" href={p.code} rel="noreferrer" target="_blank">
                        Code ↗
                      </a>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function B41(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);
  const squareRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  useEffect(() => setMounted(true), []);

  // Picture sources, made once in the browser.
  const pics = useMemo(() => {
    if (!mounted) return null;
    return {
      projects: projects.map((p) => projectSource(p)),
      groups: skillGroups.map((g) => textPlate(g.skills[0].name, { width: 1000, height: 800 })),
    };
  }, [mounted]);

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to the square that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      squareRefs.current[lastOpen.current]?.focus();
      lastOpen.current = -1;
    }
  }, [open]);

  return (
    <div className="relative w-full font-sans" id="work" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="px-[1.6rem] pb-[3.2rem] pt-[6vh]">
        {/* The row of squares. */}
        <div className="b41-rows -mx-[1.6rem] flex snap-x snap-mandatory gap-[1.6rem] overflow-x-auto px-[1.6rem] md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
          {projects.map((p, i) => (
            <button
              aria-haspopup="dialog"
              className="b41-sq block w-[72vw] shrink-0 cursor-pointer snap-start text-left md:w-auto"
              key={p.title}
              onBlur={() => setHover((h) => (h === i ? -1 : h))}
              onClick={() => setOpen(i)}
              onFocus={() => setHover(i)}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? -1 : h))}
              ref={(el) => {
                squareRefs.current[i] = el;
              }}
              type="button"
            >
              <span className="b41-box relative block aspect-square w-full overflow-hidden rounded-[0.8rem]" style={{ backgroundColor: "rgba(249, 185, 220, 0.06)" }}>
                {pics ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" level={hover === i ? 1 : 0.6} source={pics.projects[i]} /> : null}
              </span>
              <span className={`${SMALL} b41-cap mt-[0.8rem] flex justify-between gap-[1rem] opacity-80`}>
                <span className="min-w-0">{p.title}</span>
                <span className="shrink-0 tabular-nums" style={{ color: DIM }}>
                  {pad2(i + 1)}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* WORK, and the kinds sliding under it. */}
        <div className="mt-[9vh]">
          <div className="flex items-start justify-between gap-[1.6rem]">
            <h2 className={`${HUGE} text-white`}>Work</h2>
            <p className={`${SMALL} shrink-0 pt-[0.4rem] text-right`}>
              Selected work
              <br />
              <span className="tabular-nums" style={{ color: DIM }}>
                ({SPAN})
              </span>
            </p>
          </div>
          <p className="sr-only">{KINDS.join(", ")}</p>
          <div aria-hidden className="-mx-[1.6rem] overflow-hidden">
            <div className={`${HUGE} b41-track pt-[0.08em]`} style={{ color: "rgba(249, 185, 220, 0.22)" }}>
              {KINDS.map((k) => (
                <span key={k}>{k}</span>
              ))}
              {KINDS.map((k) => (
                <span data-copy key={`${k}-copy`}>
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Capabilities: five columns. */}
        <section className="mt-[12vh]" id="skills">
          <h2 className={`${SMALL} mb-[1.6rem]`}>Expertise &amp; Capabilities</h2>
          <div className="grid grid-cols-1 gap-x-[1.6rem] gap-y-[4.8rem] sm:grid-cols-2 xl:grid-cols-5">
            {skillGroups.map((g, gi) => {
              const half = Math.ceil(g.skills.length / 2);
              const lists = [g.skills.slice(0, half), g.skills.slice(half)];
              return (
                <div className="min-w-0" key={g.label}>
                  <div
                    aria-hidden
                    className="relative aspect-[16/9] w-full overflow-hidden rounded-[0.8rem] sm:aspect-[10/9]"
                    style={{ backgroundColor: `rgba(249, 185, 220, ${TINTS[gi % TINTS.length]})` }}
                  >
                    {pics ? <BarPicture cell={6} className="absolute inset-0" fit="contain" source={pics.groups[gi]} /> : null}
                  </div>
                  <h3 className="mt-[2.4rem] font-sans text-[clamp(3rem,2vw,4.2rem)] font-normal leading-[1.05] tracking-[-0.03em] text-white xl:min-h-[2.1em]">
                    {g.label}
                  </h3>
                  <div className="mt-[1.6rem] grid grid-cols-2 gap-x-[1.6rem]">
                    {lists.map((l, li) => (
                      <ul className={SMALL} key={li}>
                        {l.map((s) => (
                          <li key={s.name}>{s.name}</li>
                        ))}
                      </ul>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recognition: the ruled table. */}
        <section className="mt-[12vh]">
          <h2 className={`${HUGE} text-white`}>Recognised work</h2>
          <ol className="mt-[6vh]" style={{ borderBottom: LINE }}>
            {RECOGNITION.map((r, i) => (
              <li
                className="grid grid-cols-[3.6rem_1fr] gap-x-[1.6rem] gap-y-[1.6rem] py-[2.4rem] md:grid-cols-[1fr_4fr_2.15fr_2.15fr_0.8fr]"
                key={r.award}
                style={{ borderTop: LINE }}
              >
                <span className="font-sans text-[1.4rem] leading-[1.6] tabular-nums">{pad2(i + 1)}</span>
                <span className="font-sans text-[clamp(2rem,1.45vw,2.8rem)] leading-[1.2] tracking-[-0.01em] text-white">{r.award}</span>
                <div className="col-span-2 grid grid-cols-[1fr_1fr_auto] gap-x-[1.6rem] pl-[5.2rem] md:contents">
                  <div className="min-w-0">
                    <p className="font-sans text-[1.3rem] leading-[1.5]" style={{ color: DIM }}>
                      Project
                    </p>
                    <p className={`${SMALL} mt-[0.4rem]`}>{r.project}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-sans text-[1.3rem] leading-[1.5]" style={{ color: DIM }}>
                      Category
                    </p>
                    <div className="mt-[0.4rem]">
                      {r.category.map((c) => (
                        <p className={SMALL} key={c}>
                          {c}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-sans text-[1.3rem] leading-[1.5]" style={{ color: DIM }}>
                      Year
                    </p>
                    <p className={`${SMALL} mt-[0.4rem] whitespace-nowrap tabular-nums`}>{r.year}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Contact, small. */}
        <footer className="mt-[10vh] flex flex-col gap-[1.2rem] md:flex-row md:items-baseline md:justify-between" id="contact">
          <p className={SMALL} style={{ color: DIM }}>
            Contact
          </p>
          <a className={`${SMALL} b41-link break-all text-white`} href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <ul className="flex flex-wrap gap-x-[2.4rem] gap-y-[0.6rem]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className={`${SMALL} b41-link whitespace-nowrap`} href={l.href} rel="noreferrer" target="_blank">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </div>

      {open >= 0 ? <Detail i={open} onClose={close} source={pics ? pics.projects[open] : null} /> : null}
    </div>
  );
}
