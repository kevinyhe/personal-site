"use client";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { awards, education, experience, type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 47, Showroom (after noho.ink).
 *
 * Opens like noho's first screen: one statement in medium sans on the left,
 * a line of small print under it, and on the right a panel with the five
 * projects as small tiles set in two staggered rows. Pointing at a tile
 * shows its title; clicking opens the project.
 *
 * Then noho's product cards: the two newest projects as two big panels side
 * by side, each a bar picture over a caption row (year and kind small, the
 * title large, two small outlined buttons: Details and Visit). The other
 * three follow as a row of smaller cards in the same style.
 *
 * Then three equal stat cards ("● label" top left, the figure in the
 * middle, 01 to 03 bottom left), and noho's awards list twice: Skills&Tools
 * and Awards&Recognitions, each a group label on the left and rows on the
 * right with the count or year at the far right. A small contact footer.
 *
 * Details open over the page; Esc or Close shuts them and gives focus back.
 * The bar pictures draw on 2D canvases built in the browser only, so they
 * wait for a mounted flag and the server render has empty boxes. Under
 * reduced motion nothing fades or slides.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const PANEL = "rgba(249, 185, 220, 0.06)";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const KIND: Record<Project["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

// Two big cards first (the company and the newest win), then the rest.
const FEATURED = [0, 2];
const REST = projects.map((_, i) => i).filter((i) => !FEATURED.includes(i));

// noho's staggered tiles: row 1 holds columns 1-2, row 2 holds columns 2-4.
const TILE_SPOT = [
  "md:col-start-1 md:row-start-1",
  "md:col-start-2 md:row-start-1",
  "md:col-start-2 md:row-start-2",
  "md:col-start-3 md:row-start-2",
  "md:col-start-4 md:row-start-2",
];

const lead = experience[0];
const STATEMENT = `${lead.role} of ${lead.org}, studying Computer Engineering at the ${education.school}.`;
const TOOL_COUNT = skillGroups.reduce((n, g) => n + g.skills.length, 0);
const STATS = [
  { label: "Projects shipped", value: pad2(projects.length) },
  { label: "Tools", value: String(TOOL_COUNT) },
  { label: "Best result", value: awards[0].title },
];

function awardGroup(title: string): string {
  if (/hack/i.test(title)) return "Hackathons";
  if (/build award/i.test(title)) return "Robotics";
  return "Other";
}
const AWARD_GROUPS = ["Hackathons", "Robotics", "Other"]
  .map((label) => ({ label, rows: awards.filter((a) => awardGroup(a.title) === label) }))
  .filter((g) => g.rows.length > 0);

const CSS = `
.b47-tile .b47-cap { opacity: 0; transform: translateY(0.6rem); transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
.b47-tile:hover .b47-cap, .b47-tile:focus-visible .b47-cap { opacity: 1; transform: none; }
@media (hover: none) { .b47-tile .b47-cap { opacity: 1; transform: none; } }
.b47-btn { transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease; }
.b47-btn:hover, .b47-btn:focus-visible { background-color: ${BLOSSOM}; border-color: ${BLOSSOM}; color: #2a0d1e; }
.b47-link { transition: color 0.2s ease; }
.b47-link:hover, .b47-link:focus-visible { color: #ffffff; }
.b47-pic { transition: opacity 0.3s ease; }
.b47-pic:hover, .b47-pic:focus-visible { opacity: 0.85; }
.b47-dialog { animation: b47-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b47-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b47-tile .b47-cap, .b47-btn, .b47-link, .b47-pic { transition: none; }
  .b47-dialog { animation: none; }
}
`;

/** noho's section heading: big medium sans, tight, no space round the "&". */
function Heading({ children, id }: { children: string; id: string }): JSX.Element {
  return (
    <h2 className="font-sans font-medium leading-[1] tracking-[-0.045em] text-white" id={id} style={{ fontSize: "clamp(3.2rem, 3.4vw, 6.4rem)" }}>
      {children}
    </h2>
  );
}

/** Small outlined button, as a button or a link. */
function Pill({ children, href, onClick }: { children: string; href?: string; onClick?: () => void }): JSX.Element {
  const cls = "b47-btn inline-flex h-[3.6rem] items-center justify-center whitespace-nowrap px-[1.8rem] font-sans text-[1.4rem] leading-none";
  if (href) {
    return (
      <a className={cls} href={href} rel="noreferrer" style={{ border: LINE }} target="_blank">
        {children}
      </a>
    );
  }
  return (
    <button className={`${cls} cursor-pointer`} onClick={onClick} style={{ border: LINE }} type="button">
      {children}
    </button>
  );
}

/** A product card: picture on a panel, caption row under it. */
function Card({
  i,
  big,
  source,
  onOpen,
}: {
  i: number;
  big: boolean;
  source: BarSource | null;
  onOpen: (i: number) => void;
}): JSX.Element {
  const p = projects[i];
  return (
    <article className="flex min-w-0 flex-col" style={{ backgroundColor: PANEL }}>
      <button
        aria-label={`${p.title}, details`}
        className={`b47-pic relative w-full cursor-pointer ${big ? "aspect-[4/3] md:aspect-[5/2]" : "aspect-[2/1]"}`}
        onClick={() => onOpen(i)}
        type="button"
      >
        {source ? <BarPicture alt={p.title} cell={big ? 6 : 5} className="absolute inset-0" source={source} /> : null}
      </button>
      <div className={`flex flex-wrap items-end justify-between gap-x-[2.4rem] gap-y-[1.4rem] ${big ? "p-[2rem] md:px-[3.2rem] md:py-[2.4rem]" : "p-[2rem]"}`}>
        <div className="min-w-0">
          <p className="font-sans text-[1.4rem] leading-[1.3] opacity-60">
            {p.year} · {KIND[p.kind]}
          </p>
          <h3
            className={`mt-[0.2rem] font-sans font-medium leading-[1.05] tracking-[-0.035em] text-white ${big ? "text-[clamp(2.4rem,2vw,3.6rem)]" : "text-[clamp(2rem,1.4vw,2.6rem)]"}`}
          >
            {p.title}
          </h3>
        </div>
        {big ? (
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="font-sans text-[1.4rem] leading-[1.3] opacity-60">Built with</p>
            <p className="mt-[0.4rem] font-sans text-[1.4rem] leading-[1.3]">{p.stack.slice(0, 3).join(", ")}</p>
          </div>
        ) : null}
        <div className="flex gap-[1rem]">
          <Pill onClick={() => onOpen(i)}>Details</Pill>
          {p.href ? <Pill href={p.href}>Visit ↗</Pill> : null}
        </div>
      </div>
    </article>
  );
}

/** Group label at left, rows at right with a figure at the far right. */
function Groups({ groups }: { groups: { label: string; rows: { title: string; note?: string; end: string }[] }[] }): JSX.Element {
  return (
    <div className="mt-[3.2rem] space-y-[2.8rem]">
      {groups.map((g) => (
        <div className="grid grid-cols-1 gap-x-[2.4rem] gap-y-[0.8rem] sm:grid-cols-[16rem_1fr]" key={g.label}>
          <h3 className="font-sans text-[clamp(1.6rem,1.1vw,2rem)] leading-[1.3]">{g.label}</h3>
          <ul style={{ borderTop: LINE }}>
            {g.rows.map((r) => (
              <li className="flex items-baseline justify-between gap-[2rem] py-[1rem]" key={r.title} style={{ borderBottom: LINE }}>
                <span className="min-w-0">
                  <span className="block font-sans text-[clamp(1.6rem,1.1vw,2rem)] leading-[1.3] text-white">{r.title}</span>
                  {r.note ? <span className="mt-[0.3rem] block font-sans text-[1.3rem] leading-[1.45] opacity-60">{r.note}</span> : null}
                </span>
                <span className="shrink-0 font-sans text-[clamp(1.6rem,1.1vw,2rem)] tabular-nums leading-[1.3]">{r.end}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
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
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b47-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[4vh] md:px-[4vw]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="b47-dialog mx-auto max-w-[140rem]" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: PANEL }}>
        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="relative aspect-[4/3] w-full lg:aspect-auto lg:min-h-[56rem]">
            {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className="flex flex-col px-[2rem] py-[2.4rem] md:px-[3.2rem] md:py-[3.2rem]">
            <div className="flex items-start justify-between gap-[2rem]">
              <p className="font-sans text-[1.4rem] leading-[1.3] opacity-60">
                {p.year} · {KIND[p.kind]}
              </p>
              <button
                className="b47-btn inline-flex h-[3.6rem] cursor-pointer items-center px-[1.6rem] font-sans text-[1.4rem] leading-none"
                onClick={onClose}
                ref={closeRef}
                style={{ border: LINE }}
                type="button"
              >
                Close ✕
              </button>
            </div>
            <h2 className="mt-[1.2rem] font-sans font-medium leading-[1] tracking-[-0.045em] text-white" id="b47-detail-title" style={{ fontSize: "clamp(3.2rem, 3.2vw, 5.6rem)" }}>
              {p.title}
            </h2>
            <p className="mt-[1.6rem] font-sans text-[1.8rem] leading-[1.4]">{p.tagline}</p>
            <ul className="mt-[2.4rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className="py-[1.2rem] font-sans text-[1.5rem] leading-[1.5]" key={b} style={{ borderBottom: LINE }}>
                  {b}
                </li>
              ))}
            </ul>
            <dl className="mt-[2rem] grid grid-cols-[9rem_1fr] gap-y-[0.8rem] font-sans text-[1.4rem] leading-[1.45]">
              <dt className="opacity-60">Stack</dt>
              <dd className="text-white">{p.stack.join(", ")}</dd>
              {p.award ? (
                <>
                  <dt className="opacity-60">Award</dt>
                  <dd className="text-white">{p.award}</dd>
                </>
              ) : null}
            </dl>
            {p.href || p.code ? (
              <div className="mt-[2.4rem] flex flex-wrap gap-[1rem]">
                {p.href ? <Pill href={p.href}>Visit ↗</Pill> : null}
                {p.code ? <Pill href={p.code}>Code ↗</Pill> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function B47(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(-1);
  const opener = useRef<HTMLButtonElement | null>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => setMounted(true), []);

  // Picture sources, made once in the browser (Saturn's is a canvas).
  const sources = useMemo(() => (mounted ? projects.map((p) => projectSource(p)) : null), [mounted]);

  const openAt = useCallback((i: number, from: HTMLButtonElement | null) => {
    opener.current = from ?? (document.activeElement instanceof HTMLButtonElement ? document.activeElement : null);
    setOpen(i);
  }, []);
  const openCard = useCallback((i: number) => openAt(i, null), [openAt]);

  const close = useCallback(() => {
    setOpen(-1);
    const back = opener.current;
    opener.current = null;
    requestAnimationFrame(() => back?.focus());
  }, []);

  const skillRows = skillGroups.map((g) => ({
    label: g.label,
    rows: [{ title: g.skills.slice(0, 4).map((s) => s.name).join(", "), note: g.skills.length > 4 ? `and ${g.skills.slice(4).map((s) => s.name).join(", ")}` : undefined, end: pad2(g.skills.length) }],
  }));
  const awardRows = AWARD_GROUPS.map((g) => ({ label: g.label, rows: g.rows.map((a) => ({ title: a.title, end: a.year })) }));

  return (
    <div className="relative w-full font-sans" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* First screen: the statement at left, the tiles at right. */}
      <section aria-label="Introduction" className="grid grid-cols-1 md:grid-cols-2">
        <div className="flex flex-col justify-between gap-[4rem] px-[1.6rem] pb-[3.2rem] pt-[5rem] md:px-[2.2vw] md:pt-[7vh]">
          <p className="max-w-[18ch] font-sans font-medium leading-[1.02] tracking-[-0.05em] text-white" style={{ fontSize: "clamp(3.4rem, 4.1vw, 8rem)" }}>
            {STATEMENT}
          </p>
          <p className="font-sans text-[clamp(1.6rem,1.2vw,2rem)] leading-[1.3]">
            {education.degree}, {education.when}. Based in {lead.where}.
          </p>
        </div>
        <div className="px-[1.6rem] py-[3.2rem] md:py-[7vh] md:pl-[3.8vw] md:pr-0" style={{ backgroundColor: PANEL }}>
          <ul className="grid grid-cols-3 gap-[1rem] md:grid-cols-4 md:gap-[1.6rem] md:pr-[2.2vw]">
            {projects.map((p, i) => (
              <li className={TILE_SPOT[i]} key={p.title}>
                <button
                  aria-label={`${p.title}, details`}
                  className="b47-tile relative block aspect-[3/4] w-full cursor-pointer overflow-hidden"
                  onClick={() => openAt(i, tileRefs.current[i])}
                  ref={(el) => {
                    tileRefs.current[i] = el;
                  }}
                  style={{ backgroundColor: PANEL }}
                  type="button"
                >
                  {sources ? <BarPicture cell={4} className="absolute inset-0" source={sources[i]} /> : null}
                  <span
                    className="b47-cap absolute inset-x-0 bottom-0 px-[1rem] pb-[0.9rem] pt-[2.4rem] text-left font-sans text-[1.3rem] font-medium leading-[1.2] text-white"
                    style={{ background: "linear-gradient(to top, rgba(42, 13, 30, 0.92), rgba(42, 13, 30, 0))" }}
                  >
                    {p.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-[192rem] px-[1.6rem] pb-[6vh] md:px-[2.2vw]">
        {/* Two big cards, then three small ones. */}
        <section aria-labelledby="b47-work" className="pt-[6vh]">
          <h2 className="sr-only" id="b47-work">
            Work
          </h2>
          <div className="grid grid-cols-1 gap-[1.6rem] md:grid-cols-2">
            {FEATURED.map((i) => (
              <Card
                big
                i={i}
                key={i}
                onOpen={openCard}
                source={sources ? sources[i] : null}
              />
            ))}
          </div>
          <div className="mt-[1.6rem] grid grid-cols-1 gap-[1.6rem] sm:grid-cols-2 lg:grid-cols-3">
            {REST.map((i) => (
              <Card
                big={false}
                i={i}
                key={i}
                onOpen={openCard}
                source={sources ? sources[i] : null}
              />
            ))}
          </div>
        </section>

        {/* Three stat cards. */}
        <section aria-label="In numbers" className="mt-[1.6rem] grid grid-cols-1 gap-[1.6rem] md:grid-cols-3">
          {STATS.map((s, i) => (
            <div className="flex min-h-[20rem] flex-col justify-between p-[2rem] md:min-h-[24rem] md:px-[2.2rem] md:py-[2.6rem]" key={s.label} style={{ backgroundColor: PANEL }}>
              <p className="flex items-center gap-[0.8rem] font-sans text-[1.6rem] leading-[1.3]">
                <span aria-hidden className="inline-block h-[0.6rem] w-[0.6rem] rounded-full" style={{ backgroundColor: BLOSSOM }} />
                {s.label}
              </p>
              <p className="py-[2rem] text-center font-sans font-medium leading-[1.05] tracking-[-0.04em] text-white" style={{ fontSize: "clamp(2.8rem, 2vw, 3.6rem)" }}>
                {s.value}
              </p>
              <p className="font-sans text-[1.6rem] tabular-nums leading-[1.3]">{pad2(i + 1)}</p>
            </div>
          ))}
        </section>

        {/* noho's grouped rows, twice: side by side on a wide screen. */}
        <div className="mt-[7vh] grid grid-cols-1 gap-x-[4vw] gap-y-[7vh] xl:grid-cols-2">
          <section aria-labelledby="b47-skills">
            <Heading id="b47-skills">Skills&amp;Tools</Heading>
            <Groups groups={skillRows} />
          </section>
          <section aria-labelledby="b47-awards">
            <Heading id="b47-awards">Awards&amp;Recognitions</Heading>
            <Groups groups={awardRows} />
          </section>
        </div>

        {/* Contact, small. */}
        <footer className="mt-[7vh] flex flex-wrap items-baseline justify-between gap-x-[3.2rem] gap-y-[1.6rem] pt-[2rem]" style={{ borderTop: LINE }}>
          <a className="b47-link break-all font-sans text-[1.8rem] font-medium leading-[1.3] tracking-[-0.02em] text-white" href={`mailto:${EMAIL}`}>
            {EMAIL} ↗
          </a>
          <ul className="flex flex-wrap gap-x-[2.4rem] gap-y-[0.8rem] font-sans text-[1.4rem] leading-[1.3]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className="b47-link whitespace-nowrap" href={l.href} rel="noreferrer" target="_blank">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </div>

      {open >= 0 ? <Detail i={open} onClose={close} source={sources ? sources[open] : null} /> : null}
    </div>
  );
}
