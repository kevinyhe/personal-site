"use client";

import { type JSX, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { awards, experience, projects, skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 52, Tiles (after fiddle.digital).
 *
 * A pill nav floats at the top of the design: "Kevin He ◯" in a rounded
 * pill on the left, then Work (05), Skills and Let's talk spread across
 * the row, each a link down the page. Under it, the awards as a row of
 * rounded tiles laid out like fiddle's award tiles: a small title at the
 * top left, the year at the top right, a large mark in the middle and a
 * small caption at the bottom right.
 *
 * Then the work. The lead project is set the way fiddle sets each case:
 * a picture in the middle of the row, drawn as vertical bars, its name
 * under it on the left, a short line about it lower down on the right,
 * and a huge "Work" behind the bottom of the picture. The other four sit
 * in a two-by-two grid in the same arrangement. Clicking any of them
 * opens its detail over the page; Esc or the close button shuts it.
 *
 * Then the skills as a row of rounded tiles (group, count, icons, list),
 * and a last row with a Toronto clock and the contact tile.
 *
 * Bar pictures draw on 2D canvases made in the browser only, so they wait
 * for a mounted flag and the server render has empty boxes. The clock also
 * waits for it, so server and browser agree on the first render.
 *
 * Under reduced motion nothing slides, fades or scales, and the nav links
 * jump rather than scroll.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const PANEL = "rgba(249, 185, 220, 0.07)";
const TINY = "font-mono text-[1.1rem] uppercase leading-[1.4] tracking-[0.08em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** One tile per award: title and caption split the way fiddle splits them. */
const TILES: { title: string; note: string; mark: string; strong: string; rest: string }[] = [
  { title: "1st overall", note: "King of the Ring", mark: "1st", strong: "Eureka", rest: "Hacks" },
  { title: "Finalist", note: "S‑KBD67, 12 of 1,200+", mark: "Top 12", strong: "Hack", rest: "The North" },
  { title: "Ontario Provincial", note: "Build Award", mark: "Build", strong: "VEX", rest: "82855Z" },
  { title: "USACO", note: "Silver", mark: "Silver", strong: "USACO", rest: "Silver" },
  { title: "Off Season II", note: "1 of 100 from 10,000+", mark: "F.Inc", strong: "Founders,", rest: "Inc." },
];

const PARTS = [
  { id: "b52-work", label: "Work", count: pad2(projects.length) },
  { id: "b52-skills", label: "Skills" },
  { id: "b52-contact", label: "Let’s talk", star: true },
];

const CSS = `
.b52-link { transition: color 0.2s ease, opacity 0.2s ease; }
.b52-link:hover, .b52-link:focus-visible { color: #ffffff; }
.b52-case .b52-pic { transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1); }
.b52-case:hover .b52-pic, .b52-case:focus-visible .b52-pic { transform: scale(0.985); }
.b52-case .b52-name { transition: color 0.25s ease; }
.b52-case:hover .b52-name, .b52-case:focus-visible .b52-name { color: #ffffff; }
.b52-dialog { animation: b52-in 0.4s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b52-in { from { opacity: 0; transform: translateY(1.6rem) scale(0.99); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b52-link, .b52-case .b52-pic, .b52-case .b52-name { transition: none; }
  .b52-case:hover .b52-pic, .b52-case:focus-visible .b52-pic { transform: none; }
  .b52-dialog { animation: none; }
}
`;

function stillMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The small white squares fiddle scatters over its case rows. */
function Dot({ className }: { className: string }): JSX.Element {
  return <span aria-hidden className={`absolute hidden h-[0.7rem] w-[0.7rem] bg-white md:block ${className}`} />;
}

/** An analog clock on Toronto time, after fiddle's clock tile. */
function Clock(): JSX.Element {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = (): void => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  let h = 0;
  let m = 0;
  let s = 0;
  let label = "--:--";
  if (now) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Toronto",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
    h = get("hour") % 24;
    m = get("minute");
    s = get("second");
    label = `${pad2(h)}:${pad2(m)}`;
  }
  const hand = (deg: number, len: number, w: number, colour: string): JSX.Element => (
    <line
      stroke={colour}
      strokeLinecap="round"
      strokeWidth={w}
      transform={`rotate(${deg} 50 50)`}
      x1="50"
      x2="50"
      y1="54"
      y2={50 - len}
    />
  );

  return (
    <div className="relative flex min-h-[24rem] items-center justify-center">
      <p className={`${TINY} absolute left-[8%] top-[6%] flex items-center gap-[0.6rem]`}>
        <span aria-hidden className="h-[0.5rem] w-[0.5rem] rounded-full bg-white" />
        <span>
          {experience[0].where}
          <br />
          <span className="tabular-nums text-white">{label}</span>
        </span>
      </p>
      <svg aria-label={now ? `Toronto time ${label}` : "Toronto time"} className="h-[min(20rem,70%)] w-auto" role="img" viewBox="0 0 100 100">
        <circle cx="50" cy="50" fill={PANEL} r="47" stroke={RULE} strokeWidth="0.6" />
        {Array.from({ length: 60 }, (_, i) => (
          <line
            key={i}
            stroke={BLOSSOM}
            strokeOpacity={i % 5 === 0 ? 0.9 : 0.35}
            strokeWidth={i % 5 === 0 ? 1.1 : 0.5}
            transform={`rotate(${i * 6} 50 50)`}
            x1="50"
            x2="50"
            y1="6"
            y2={i % 5 === 0 ? 10.5 : 8}
          />
        ))}
        {now ? (
          <>
            {hand((h % 12) * 30 + m * 0.5, 22, 2.6, "#ffffff")}
            {hand(m * 6 + s * 0.1, 34, 1.8, "#ffffff")}
            {hand(s * 6, 38, 0.8, BLOSSOM)}
          </>
        ) : null}
        <circle cx="50" cy="50" fill={BLOSSOM} r="2.2" />
      </svg>
    </div>
  );
}

/** A project as fiddle sets a case: picture, name under it, a line on the right.
 *  The lead case also carries the huge "Work", half hidden behind its picture. */
function Case({
  i,
  source,
  lead,
  onOpen,
  setRef,
}: {
  i: number;
  source: BarSource | null;
  lead: boolean;
  onOpen: (i: number) => void;
  setRef: (el: HTMLButtonElement | null) => void;
}): JSX.Element {
  const p = projects[i];
  const [hot, setHot] = useState(false);
  const grid = lead ? "lg:grid-cols-[29fr_33fr_8fr_14fr_16fr]" : "md:grid-cols-[62fr_38fr] md:gap-x-[1.6rem]";
  return (
    <button
      aria-haspopup="dialog"
      className={`b52-case grid w-full cursor-pointer grid-cols-1 text-left ${grid}`}
      onBlur={() => setHot(false)}
      onClick={() => onOpen(i)}
      onFocus={() => setHot(true)}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      ref={setRef}
      type="button"
    >
      <span className={`b52-pic relative z-10 block ${lead ? "lg:col-span-2 lg:col-start-2" : "md:col-start-1 md:row-start-1"}`}>
        <span className="relative block aspect-[16/9] w-full overflow-hidden rounded-[1.2rem]" style={{ backgroundColor: BAND }}>
          <span aria-hidden className="absolute inset-0" style={{ backgroundColor: PANEL }} />
          {source ? <BarPicture alt={p.title} cell={lead ? 6 : 5} className="absolute inset-0" level={hot ? 1 : 0.72} source={source} /> : null}
          <span className={`${TINY} absolute right-[1rem] top-[0.9rem] tabular-nums text-white`}>({pad2(i + 1)})</span>
        </span>
      </span>
      {lead ? (
        <span aria-hidden className="relative z-0 -mt-[0.42em] flex items-end justify-center gap-[1.2rem] leading-[0.8] lg:col-span-5 lg:col-start-1">
          <span className={`${TINY} mb-[0.7em] text-white`}>Featured</span>
          <span className="font-sans text-[clamp(8rem,13vw,25rem)] font-normal tracking-[-0.06em] text-white/90">Work</span>
        </span>
      ) : null}
      <span
        className={`b52-name mt-[1.2rem] block font-sans font-normal leading-[1.1] tracking-[-0.02em] ${
          lead ? "text-[clamp(2.2rem,1.7vw,3.2rem)] lg:col-start-2" : "text-[clamp(1.9rem,1.35vw,2.6rem)] md:col-start-1 md:row-start-2"
        }`}
      >
        {p.title}
      </span>
      <span
        className={`mt-[1.2rem] flex gap-[0.8rem] font-sans text-[1.5rem] font-medium leading-[1.35] text-white ${
          lead ? "lg:col-span-2 lg:col-start-3 lg:mt-[4.8rem]" : "md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:self-end"
        }`}
      >
        <span aria-hidden className="shrink-0 opacity-70">
          ↳
        </span>
        <span>
          {p.tagline}
          <span className={`${TINY} mt-[0.6rem] block font-normal opacity-60`} style={{ color: BLOSSOM }}>
            {p.year} · {p.award ?? p.stack.slice(0, 3).join(", ")}
          </span>
        </span>
      </span>
    </button>
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
      aria-labelledby="b52-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[4vh] md:px-[4vw] md:py-[6vh]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.92)", color: BLOSSOM }}
    >
      <div className="b52-dialog mx-auto grid max-w-[150rem] gap-[0.6rem] lg:grid-cols-[1.25fr_1fr]" onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[1.2rem] lg:aspect-auto lg:min-h-[56rem]" style={{ backgroundColor: PANEL }}>
          {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" fit="contain" source={source} /> : null}
          <span className={`${TINY} absolute left-[1.4rem] top-[1.2rem] tabular-nums text-white`}>
            ({pad2(i + 1)}/{pad2(projects.length)})
          </span>
        </div>
        <div className="flex flex-col rounded-[1.2rem] px-[2rem] py-[1.8rem] md:px-[2.8rem] md:py-[2.4rem]" style={{ backgroundColor: PANEL }}>
          <div className="flex items-start justify-between gap-[1.6rem]">
            <p className={`${TINY} tabular-nums opacity-70`}>{p.year}</p>
            <button
              className="b52-link -mr-[0.6rem] -mt-[0.4rem] flex cursor-pointer items-center gap-[0.8rem] rounded-full px-[1.2rem] py-[0.5rem] font-sans text-[1.4rem]"
              onClick={onClose}
              ref={closeRef}
              style={{ border: `0.1rem solid ${RULE}` }}
              type="button"
            >
              Close <span aria-hidden>✕</span>
            </button>
          </div>
          <h2 className="mt-[1.2rem] font-sans text-[clamp(3rem,3vw,5.2rem)] font-normal leading-[1.02] tracking-[-0.03em] text-white" id="b52-detail-title">
            {p.title}
          </h2>
          <p className="mt-[1.4rem] font-sans text-[1.8rem] leading-[1.4]">{p.tagline}</p>
          <ul className="mt-[2rem] space-y-[1rem] pt-[1.6rem]" style={{ borderTop: `0.1rem solid ${RULE}` }}>
            {p.bullets.map((b) => (
              <li className="flex gap-[1rem] font-sans text-[1.5rem] leading-[1.5]" key={b}>
                <span aria-hidden className="shrink-0 opacity-70">
                  ↳
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-[2rem] flex flex-wrap gap-[0.6rem] pt-[1.6rem]" style={{ borderTop: `0.1rem solid ${RULE}` }}>
            {p.stack.map((s) => (
              <span className={`${TINY} rounded-full px-[1rem] py-[0.4rem]`} key={s} style={{ border: `0.1rem solid ${RULE}` }}>
                {s}
              </span>
            ))}
          </div>
          {p.award ? <p className="mt-[1.6rem] font-sans text-[1.5rem] font-medium leading-[1.4] text-white">{p.award}</p> : null}
          {p.href || p.code ? (
            <p className="mt-auto flex flex-wrap gap-x-[2.4rem] gap-y-[0.6rem] pt-[2.4rem] font-sans text-[1.6rem]">
              {p.href ? (
                <a className="b52-link text-white underline decoration-1 underline-offset-[0.3em]" href={p.href} rel="noreferrer" target="_blank">
                  {hostOf(p.href)} ↗
                </a>
              ) : null}
              {p.code ? (
                <a className="b52-link text-white underline decoration-1 underline-offset-[0.3em]" href={p.code} rel="noreferrer" target="_blank">
                  Code ↗
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function B52(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(-1);
  const caseRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  useEffect(() => setMounted(true), []);

  // Pictures are made in the browser only (Saturn's is drawn on a canvas).
  const pics = useMemo(() => (mounted ? projects.map((p) => projectSource(p)) : null), [mounted]);

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to the case that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      caseRefs.current[lastOpen.current]?.focus();
      lastOpen.current = -1;
    }
  }, [open]);

  const jump = useCallback((id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: stillMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  const setRef = (i: number) => (el: HTMLButtonElement | null): void => {
    caseRefs.current[i] = el;
  };

  return (
    <div className="relative w-full font-sans" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* The pill nav, floating over the design while it is on screen. */}
      <nav aria-label="Sections" className="sticky top-0 z-30 px-[1.2rem] pt-[1.2rem] md:px-[1.2vw]">
        <div className="flex items-center gap-[1.2rem]">
          <a
            className="b52-link flex shrink-0 items-center justify-between gap-[1.2rem] rounded-[1.2rem] py-[0.6rem] pl-[1.2rem] pr-[0.8rem] text-[clamp(1.5rem,1.35vw,2.4rem)] leading-none text-white backdrop-blur-md md:w-[21%]"
            href="#b52-top"
            onClick={jump("b52-top")}
            style={{ backgroundColor: "rgba(249, 185, 220, 0.12)" }}
          >
            <span className="whitespace-nowrap">Kevin He</span>
            <span aria-hidden className="inline-block h-[1.6em] w-[1.6em] rounded-full" style={{ border: "0.15rem solid #ffffff" }} />
          </a>
          <ul className="flex flex-1 items-center justify-end gap-x-[1.6rem] text-[clamp(1.4rem,1.35vw,2.4rem)] leading-none md:grid md:grid-cols-[1.35fr_1fr_1fr_auto] md:justify-items-end md:gap-x-0">
            {PARTS.map((s) => (
              <li key={s.id}>
                <a className="b52-link whitespace-nowrap" href={`#${s.id}`} onClick={jump(s.id)}>
                  {s.label}
                  {s.count ? <sup className="ml-[0.3em] font-mono text-[0.55em] tracking-[0.04em]">({s.count})</sup> : null}
                  {s.star ? <sup className="ml-[0.25em] text-[0.6em]">*</sup> : null}
                </a>
              </li>
            ))}
            <li aria-hidden className="relative hidden h-[3.6rem] w-[3.6rem] md:ml-[4vw] md:mr-[1.6vw] md:block">
              <span className="absolute left-1/2 top-0 h-full w-[0.1rem] bg-white/70" />
              <span className="absolute left-0 top-1/2 h-[0.1rem] w-full bg-white/70" />
            </li>
          </ul>
        </div>
      </nav>

      <div className="scroll-mt-[8rem] px-[1.2rem] pb-[6vh] pt-[5vh] md:px-[1.2vw]" id="b52-top">
        {/* The award tiles. */}
        <section aria-label="Awards" className="grid grid-cols-1 gap-[0.6rem] sm:grid-cols-2 lg:grid-cols-5">
          {awards.map((a, i) => {
            const t = TILES[i];
            return (
              <article
                className="relative flex min-h-[18rem] flex-col justify-between rounded-[1.2rem] px-[1rem] py-[0.9rem] lg:aspect-[17/10] lg:min-h-[16rem]"
                key={a.title}
                style={{ backgroundColor: PANEL }}
              >
                <header className="flex items-start justify-between gap-[1rem]">
                  <div className="min-w-0">
                    <h3 className="font-sans text-[clamp(1.5rem,0.95vw,1.8rem)] leading-[1.2] text-white">
                      {t.title} <span className="opacity-60" style={{ color: BLOSSOM }}>{t.note}</span>
                    </h3>
                  </div>
                  <span className={`${TINY} shrink-0 tabular-nums opacity-70`}>({a.year})</span>
                </header>
                <p
                  aria-hidden
                  className="py-[1.2rem] text-center font-sans text-[clamp(3.6rem,3vw,5.6rem)] font-black uppercase leading-none tracking-[-0.05em] text-white"
                  style={{ transform: "scaleX(0.82)" }}
                >
                  {t.mark}
                </p>
                <p className={`${TINY} text-right`}>
                  <span className="text-white">{t.strong}</span> <span className="opacity-60">{t.rest}</span>
                  <span className="sr-only">: {a.title}</span>
                </p>
              </article>
            );
          })}
        </section>

        {/* The work: the lead case, then the other four. */}
        <section aria-labelledby="b52-work-title" className="relative mt-[8vh] scroll-mt-[8rem]" id="b52-work">
          <h2 className="sr-only" id="b52-work-title">
            Work
          </h2>
          <div className="relative">
            <Dot className="left-[7%] top-[6%]" />
            <Dot className="right-[7%] top-[6%]" />
            <Dot className="left-[88%] top-[70%]" />
            <Case i={0} lead onOpen={setOpen} setRef={setRef(0)} source={pics ? pics[0] : null} />
          </div>

          <div className="mt-[6vh] grid grid-cols-1 gap-[0.6rem] lg:grid-cols-2">
            {projects.slice(1).map((p, k) => (
              <div className="rounded-[1.2rem] p-[1rem] pb-[1.4rem]" key={p.title} style={{ border: `0.1rem solid ${RULE}` }}>
                <Case i={k + 1} lead={false} onOpen={setOpen} setRef={setRef(k + 1)} source={pics ? pics[k + 1] : null} />
              </div>
            ))}
          </div>
        </section>

        {/* The skills as tiles. */}
        <section aria-labelledby="b52-skills-title" className="mt-[10vh] scroll-mt-[8rem]" id="b52-skills">
          <div className="mb-[1.4rem] flex items-baseline justify-between gap-[1.6rem] px-[0.4rem]">
            <h2 className="font-sans text-[clamp(2.2rem,1.7vw,3.2rem)] leading-none tracking-[-0.02em] text-white" id="b52-skills-title">
              Skills<sup className="ml-[0.3em] font-mono text-[0.5em] opacity-70">({pad2(skillGroups.length)})</sup>
            </h2>
            <p className={`${TINY} opacity-60`}>{skillGroups.reduce((n, g) => n + g.skills.length, 0)} tools</p>
          </div>
          <div className="grid grid-cols-1 gap-[0.6rem] sm:grid-cols-2 lg:grid-cols-5">
            {skillGroups.map((g) => {
              const icons = g.skills.map((s) => skillIcon(s.icon)).filter((x): x is NonNullable<typeof x> => x !== null).slice(0, 4);
              return (
                <article className="flex min-h-[26rem] flex-col rounded-[1.2rem] px-[1rem] py-[0.9rem]" key={g.label} style={{ backgroundColor: PANEL }}>
                  <header className="flex items-start justify-between gap-[1rem]">
                    <h3 className="font-sans text-[clamp(1.5rem,0.95vw,1.8rem)] leading-[1.2] text-white">{g.label}</h3>
                    <span className={`${TINY} shrink-0 tabular-nums opacity-70`}>({pad2(g.skills.length)})</span>
                  </header>
                  <div aria-hidden className="flex flex-1 items-center justify-center gap-[1.4rem] py-[2.4rem]">
                    {icons.length > 0
                      ? icons.map((ic) => (
                          <svg className="h-[2.8rem] w-[2.8rem]" fill="#ffffff" key={ic.title} viewBox="0 0 24 24">
                            <path d={ic.path} />
                          </svg>
                        ))
                      : null}
                  </div>
                  <p className={`${TINY} text-right opacity-80`}>{g.skills.map((s) => s.name).join(" · ")}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* The clock and the contact tile. */}
        <section aria-labelledby="b52-contact-title" className="mt-[0.6rem] grid scroll-mt-[8rem] grid-cols-1 gap-[0.6rem] md:grid-cols-[1fr_2fr]" id="b52-contact">
          <Clock />
          <div className="flex min-h-[26rem] flex-col justify-between gap-[3rem] rounded-[1.2rem] px-[1.4rem] py-[1.2rem] md:px-[2rem]" style={{ backgroundColor: PANEL }}>
            <header className="flex items-start justify-between gap-[1rem]">
              <h2 className="font-sans text-[clamp(1.5rem,0.95vw,1.8rem)] leading-[1.2] text-white" id="b52-contact-title">
                Let’s talk<sup className="ml-[0.2em]">*</sup>
              </h2>
              <span className={`${TINY} opacity-70`}>
                {experience[0].role}, {experience[0].org}
              </span>
            </header>
            <a
              className="b52-link block font-sans [overflow-wrap:anywhere] text-[clamp(2.4rem,3.4vw,6.4rem)] font-normal leading-[1] tracking-[-0.04em] text-white"
              href={`mailto:${EMAIL}`}
            >
              {EMAIL} ↗
            </a>
            <ul className="flex flex-wrap justify-end gap-x-[2.4rem] gap-y-[0.8rem]">
              {elsewhere.map((l) => (
                <li key={l.href}>
                  <a className={`${TINY} b52-link whitespace-nowrap`} href={l.href} rel="noreferrer" target="_blank">
                    <span className="text-white">{l.label}</span> <span className="normal-case opacity-60">{l.handle}</span> ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {open >= 0 ? <Detail i={open} onClose={close} source={pics ? pics[open] : null} /> : null}
    </div>
  );
}
