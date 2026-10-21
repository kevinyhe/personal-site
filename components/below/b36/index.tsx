"use client";

import { type CSSProperties, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 36, Years. After art-yakushev.com.
 *
 * Work is one pinned screen. "21–26", the years the work spans, runs
 * across the middle in very large light sans. Five small pictures of the
 * projects, drawn as vertical bars, sit over and around the numbers at
 * set places, each with a "00‑1 … PREVIEW" line above it and the title
 * and year below. While the screen is pinned, scrolling slides the
 * numbers a little sideways and moves each card up or down at its own
 * rate. One scroll listener writes all the transforms; under reduced
 * motion nothing moves.
 *
 * Pointing at a card draws it full and the other four at half. Clicking
 * one opens its detail over the page; Esc or the close button shuts it.
 *
 * After the pinned screen, one short screen: the skill groups as five
 * narrow columns, the email large, and the other links.
 *
 * Below 768px wide there is no pin: the numbers sit on top and the cards
 * stack in two columns under them.
 *
 * Digits and the en dash are always in Inter: the display serif draws a
 * watermark for them.
 */

const SCREEN = "var(--arbor-screen-h, 100vh)";
const LABEL = "font-mono text-[1.2rem] uppercase tracking-[0.18em]";
const HAIR = "rgba(249, 185, 220, 0.3)";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** "00‑1": U+2011, so the label never breaks at the hyphen. */
const cardNo = (i: number): string => `00‑${i + 1}`;

/** First and last year across the projects, as two digits each: "21", "26". */
function span(list: Project[]): [string, string] {
  const ys = list.flatMap((p) => p.year.match(/\d{4}/g) ?? []).map(Number);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  return [String(lo).slice(2), String(hi).slice(2)];
}
const [FROM, TO] = span(projects);

/**
 * Where each card sits on the pinned screen (left and top as a share of
 * the screen), how wide it is (vw, capped by a vh size so a short, wide
 * window does not push cards off the bottom), and how far it drifts over
 * the whole pin (vh; the sign is the direction).
 */
const PLACES: { left: number; top: number; w: number; drift: number }[] = [
  { left: 5, top: 13, w: 17, drift: -14 },
  { left: 57, top: 8, w: 15, drift: 10 },
  { left: 31, top: 57, w: 16, drift: -7 },
  { left: 77, top: 49, w: 16, drift: 16 },
  { left: 9, top: 63, w: 14, drift: 5 },
];
/** How far the numbers slide sideways over the pin, vw. */
const SLIDE_VW = 7;
/** The pinned screen's scroll room, in screens. */
const PIN_SCREENS = 1.8;

const CSS = `
.b36-pin { position: relative; height: calc(${SCREEN} * ${PIN_SCREENS}); }
.b36-stage { position: sticky; top: 0; height: ${SCREEN}; }
.b36-card { position: absolute; will-change: transform; }
.b36-card-pic { transition: opacity 0.4s ease; }
.b36-years { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); will-change: transform; }
.b36-grid { display: contents; }
.b36-card button:focus-visible { outline: 0.1rem solid #fff; outline-offset: 0.6rem; }
@media (max-width: 767px) {
  .b36-pin { height: auto; }
  .b36-stage { position: relative; height: auto; padding: 9rem 1.6rem 6rem; }
  .b36-years { position: relative; left: auto; top: auto; transform: none !important; text-align: center; margin-bottom: 4rem; }
  .b36-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3.2rem 1.6rem; }
  .b36-card { position: relative; left: auto !important; top: auto !important; width: auto !important; transform: none !important; }
}
.b36-shade { animation: b36-in 0.35s ease both; }
@keyframes b36-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .b36-card-pic { transition: none; }
  .b36-shade { animation: none; }
}
`;

/** One preview card: the label line, the bar picture at 4:3, the title and year. */
function Card({
  p,
  i,
  source,
  level,
  onEnter,
  onLeave,
  onOpen,
}: {
  p: Project;
  i: number;
  source: BarSource | null;
  level: number;
  onEnter: () => void;
  onLeave: () => void;
  onOpen: (el: HTMLButtonElement) => void;
}): JSX.Element {
  return (
    <button
      aria-haspopup="dialog"
      className="block w-full cursor-pointer text-left"
      onBlur={onLeave}
      onClick={(e) => onOpen(e.currentTarget)}
      onFocus={onEnter}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      type="button"
    >
      <span className="flex items-baseline justify-between pb-[0.6rem] font-mono text-[1rem] uppercase leading-[1.4] tracking-[0.14em] opacity-70">
        <span>{cardNo(i)}</span>
        <span>Preview</span>
      </span>
      <span className="b36-card-pic relative block aspect-[4/3] w-full" style={{ backgroundColor: "rgba(42, 13, 30, 0.55)" }}>
        {source ? <BarPicture alt={p.title} cell={5} level={level} source={source} /> : null}
      </span>
      <span className="mt-[0.8rem] flex items-baseline justify-between gap-[1rem] font-sans text-[1.3rem] leading-[1.4]">
        <span className="text-white">{p.title}</span>
        <span className="shrink-0 tabular-nums opacity-70">{p.year}</span>
      </span>
    </button>
  );
}

/** The open project, over the page. */
function Detail({ p, i, source, onClose }: { p: Project; i: number; source: BarSource | null; onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const links: { label: string; href: string }[] = [];
  if (p.href) links.push({ label: hostOf(p.href), href: p.href });
  if (p.code && p.code !== p.href) links.push({ label: "Code", href: p.code });

  return (
    <div
      aria-labelledby="b36-detail-title"
      aria-modal="true"
      className="b36-shade fixed inset-0 z-[60] overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="mx-auto grid max-w-[150rem] gap-[4rem] px-[1.6rem] pb-[8rem] pt-[8rem] md:grid-cols-[1.1fr_1fr] md:px-[5vw] md:pt-[10vh]">
        <div>
          <p className="flex items-baseline justify-between pb-[0.8rem] font-mono text-[1.1rem] uppercase leading-[1.4] tracking-[0.14em] opacity-70">
            <span>{cardNo(i)}</span>
            <span className="tabular-nums">{p.year}</span>
          </p>
          <div className="relative aspect-[4/3] w-full" style={{ backgroundColor: BAND }}>
            {source ? <BarPicture alt={p.title} cell={6} source={source} /> : null}
          </div>
        </div>
        <div className="md:pt-[2.4rem]">
          <h3 className="font-sans text-[clamp(3.2rem,4vw,6.4rem)] font-light leading-[1.1] tracking-[-0.02em] text-white" id="b36-detail-title">
            {p.title}
          </h3>
          <p className="mt-[1.6rem] font-sans text-[1.9rem] font-light leading-[1.45]">{p.tagline}</p>
          <ul className="mt-[2.4rem] space-y-[1.2rem]">
            {p.bullets.map((b) => (
              <li className="flex gap-[1.2rem] font-sans text-[1.5rem] font-light leading-[1.55]" key={b}>
                <span aria-hidden className="mt-[0.8rem] h-[0.4rem] w-[0.4rem] shrink-0 rounded-full" style={{ backgroundColor: BLOSSOM }} />
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-[2.4rem] font-mono text-[1.2rem] uppercase leading-[1.7] tracking-[0.1em] text-white">{p.stack.join(" / ")}</p>
          {p.award ? <p className="mt-[0.8rem] font-sans text-[1.4rem] leading-[1.5] opacity-80">{p.award}</p> : null}
          {links.length ? (
            <ul className="mt-[2rem] flex flex-wrap gap-x-[2.4rem] gap-y-[1rem] font-mono text-[1.3rem] leading-[1.6]">
              {links.map((l) => (
                <li key={l.href}>
                  <a className="text-white underline underline-offset-[0.35em]" href={l.href} rel="noreferrer" target="_blank">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <button
        className={`${LABEL} fixed right-[1.6rem] top-[1.6rem] cursor-pointer px-[1.2rem] py-[0.8rem] text-white md:right-[3vw] md:top-[3vh]`}
        onClick={onClose}
        ref={closeRef}
        style={{ border: `0.1rem solid ${HAIR}`, backgroundColor: BAND }}
        type="button"
      >
        Close (Esc)
      </button>
    </div>
  );
}

export default function B36(): JSX.Element {
  const pinRef = useRef<HTMLDivElement>(null);
  const yearsRef = useRef<HTMLParagraphElement>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const [sources, setSources] = useState<BarSource[] | null>(null);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);

  // The pictures: made once, in the browser (Saturn's is drawn on a canvas).
  useEffect(() => {
    setSources(projects.map((p) => projectSource(p)));
  }, []);

  // The parallax: one scroll listener, transforms only. Off under reduced
  // motion and below 768px, where the cards are a plain grid.
  useEffect(() => {
    const pin = pinRef.current;
    if (!pin) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 768px)");
    let frame = 0;
    const apply = (): void => {
      frame = 0;
      const years = yearsRef.current;
      if (still.matches || !wide.matches) {
        if (years) years.style.transform = "";
        cardRefs.current.forEach((el) => {
          if (el) el.style.transform = "";
        });
        return;
      }
      const r = pin.getBoundingClientRect();
      const room = Math.max(1, r.height - window.innerHeight);
      const t = Math.max(0, Math.min(1, -r.top / room)) - 0.5;
      if (years) years.style.transform = `translate(calc(-50% + ${(-t * SLIDE_VW).toFixed(3)}vw), -50%)`;
      cardRefs.current.forEach((el, i) => {
        if (el) el.style.transform = `translate3d(0, ${(t * PLACES[i].drift).toFixed(3)}vh, 0)`;
      });
    };
    const ask = (): void => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    still.addEventListener("change", ask);
    wide.addEventListener("change", ask);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      still.removeEventListener("change", ask);
      wide.removeEventListener("change", ask);
    };
  }, []);

  const enter = useCallback((i: number) => () => setHover(i), []);
  const leave = useCallback((i: number) => () => setHover((h) => (h === i ? -1 : h)), []);
  const openAt = useCallback(
    (i: number) => (el: HTMLButtonElement) => {
      openerRef.current = el;
      setOpen(i);
    },
    [],
  );
  const close = useCallback(() => {
    setOpen(-1);
    openerRef.current?.focus();
  }, []);

  const levelFor = (i: number): number => (hover < 0 || hover === i ? 1 : 0.5);

  return (
    <div className="relative w-full" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <section className="b36-pin" id="work" ref={pinRef}>
        <div className="b36-stage">
          {/* Corner marks, as on the reference: monogram, mark, label, the span. */}
          <span aria-hidden className="absolute left-[1.6rem] top-[2.4rem] font-sans text-[2rem] font-semibold leading-[1.2] md:left-[2.4vw] md:top-[3vh]">
            K
          </span>
          <span aria-hidden className="absolute right-[1.6rem] top-[2.4rem] font-sans text-[2rem] leading-[1.2] md:right-[2.4vw] md:top-[3vh]">
            ©
          </span>
          <h2 className={`${LABEL} absolute left-[1.6rem] top-[6rem] leading-[1.4] opacity-80 md:bottom-[3vh] md:left-[2.4vw] md:top-auto`}>
            Work ({pad2(projects.length)})
          </h2>
          <p className={`${LABEL} absolute bottom-[3vh] right-[2.4vw] hidden leading-[1.4] opacity-60 md:block`}>Click a card to open it</p>

          <p
            aria-label={`20${FROM} to 20${TO}`}
            className="b36-years pointer-events-none select-none whitespace-nowrap font-sans font-light tabular-nums"
            ref={yearsRef}
            style={{ fontSize: "min(30vw, 62vh)", lineHeight: 0.92, letterSpacing: "-0.05em", padding: "0.06em 0.08em" }}
          >
            {FROM}–{TO}
          </p>

          <ol className="b36-grid">
            {projects.map((p, i) => {
              const at = PLACES[i];
              const style: CSSProperties = { left: `${at.left}vw`, top: `${at.top}%`, width: `min(${at.w}vw, ${(at.w * 1.55).toFixed(1)}vh)` };
              return (
                <li
                  className="b36-card"
                  key={p.title}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  style={style}
                >
                  <Card
                    i={i}
                    level={levelFor(i)}
                    onEnter={enter(i)}
                    onLeave={leave(i)}
                    onOpen={openAt(i)}
                    p={p}
                    source={sources ? sources[i] : null}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="px-[1.6rem] pb-[10vh] pt-[8vh] md:px-[2.4vw]" id="skills">
        <h2 className={`${LABEL} leading-[1.4] opacity-80`}>Skills ({pad2(skillGroups.length)})</h2>
        <div className="mt-[3rem] grid grid-cols-2 gap-x-[2.4rem] gap-y-[3.2rem] md:grid-cols-5 md:gap-x-[2.4vw]" style={{ borderTop: `0.1rem solid ${HAIR}` }}>
          {skillGroups.map((g) => (
            <div className="pt-[1.6rem]" key={g.label}>
              <h3 className="font-sans text-[1.4rem] font-medium leading-[1.4] text-white">{g.label}</h3>
              <ul className="mt-[1rem] space-y-[0.3rem] font-sans text-[1.3rem] font-light leading-[1.5] opacity-85">
                {g.skills.map((s) => (
                  <li key={s.name}>{s.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-[9vh]" id="contact">
          <p className={`${LABEL} leading-[1.4] opacity-80`}>Contact</p>
          <a
            className="mt-[1.6rem] inline-block font-sans font-light text-white underline-offset-[0.15em] hover:underline"
            href={`mailto:${EMAIL}`}
            style={{ fontSize: "max(4vw, 2rem)", lineHeight: 1.15, letterSpacing: "-0.02em", overflowWrap: "anywhere" }}
          >
            {EMAIL}
          </a>
          <ul className="mt-[3.2rem] flex flex-wrap gap-x-[3.2rem] gap-y-[1.6rem] font-mono text-[1.3rem] leading-[1.5]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className="group block" href={l.href} rel="noreferrer" target="_blank">
                  <span className="block text-[1.1rem] uppercase tracking-[0.18em] opacity-60">{l.label}</span>
                  <span className="mt-[0.3rem] block text-white group-hover:underline">{l.handle} ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {open >= 0 ? <Detail i={open} onClose={close} p={projects[open]} source={sources ? sources[open] : null} /> : null}
    </div>
  );
}
