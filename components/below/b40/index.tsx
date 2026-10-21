"use client";

import { type JSX, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { experience, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 40, Orbit. After bleibtgleich.dev.
 *
 * First screen: "Work" on the left and "21–26" on the right, one line, far
 * apart. Between them the five projects spin slowly on a ring, as small
 * tilted cards drawn in bars, with five fainter copies filling the ring's
 * far side. Pointing at a card stops the ring, turns that card to face you,
 * enlarges it and puts its title under it. Clicking opens the detail over
 * the page (Esc or Close shuts it; the page does not scroll behind it).
 *
 * Then "Skills & Recog-nitions" in big sans set on stepped lines, and two
 * ruled tables in bleibtgleich's table style: small sans, each cell ruled
 * on its own, a year only on the first row of its group. Last, a closing
 * sentence on stepped lines with the email and links in small type.
 *
 * The ring is plain CSS 3D transforms, set each frame from one rAF loop,
 * and stops while the ring is off screen. Under reduced motion it does not
 * spin; the hovered card still turns and enlarges, at once. The bar
 * pictures are 2D canvases built in the browser only, so they wait for a
 * mounted flag and the server render has empty cards.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const SMALL = "font-sans text-[1.3rem] font-medium leading-[1.25] md:text-[1.4rem]";
const BIG = "font-sans font-semibold leading-[0.9] tracking-[-0.045em] text-white";
const BIG_SIZE = { fontSize: "clamp(4.4rem, 6.4vw, 12.4rem)" };
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The four columns bleibtgleich's table runs on: year, project, organisation, award. */
const COLS = "md:grid-cols-[12fr_25fr_25fr_12fr]";

// "21–26": the first and last year the projects carry.
const YEARS = projects.flatMap((p) => p.year.match(/\d{4}/g) ?? []).map(Number);
const SPAN = `${String(Math.min(...YEARS)).slice(2)}–${String(Math.max(...YEARS)).slice(2)}`;

const at = (title: string): number => projects.findIndex((p) => p.title === title);
const KING = at("King of the Ring");
const ACTUALLY = at("The Actually Company");
const KBD = projects.findIndex((p) => p.title.startsWith("S"));
const MCLIB = at("mclib");

/**
 * Recognition, grouped by year. Each line is from profile.ts: `awards`,
 * a project's `award`, and mclib's bullet on the VEX world record and the
 * global Skills ranking (no single year given, so the team's years).
 */
type Row = { project: string; open?: number; org: string; result: string };
const RECOGNITION: { year: string; rows: Row[] }[] = [
  {
    year: "’26",
    rows: [
      { project: projects[KING].title, open: KING, org: "EurekaHacks", result: "1st overall" },
      { project: projects[ACTUALLY].title, open: ACTUALLY, org: "Founders, Inc.", result: "Off Season II" },
    ],
  },
  {
    year: "’25",
    rows: [
      { project: projects[KBD].title, open: KBD, org: "Hack The North", result: "Finalist" },
      { project: "VEX 82855Z", org: "Ontario Provincials", result: "Build Award" },
      { project: "—", org: "USACO", result: "Silver" },
    ],
  },
  {
    year: "’22–26",
    rows: [
      { project: projects[MCLIB].title, open: MCLIB, org: "VEX High Stakes", result: "World-record autonomous" },
      { project: projects[MCLIB].title, open: MCLIB, org: "VEX Skills, global", result: "80th of ~20,000" },
    ],
  },
];

/* The ring. Ten places: projects on the even ones, faint copies on the odd. */
const SLOTS = 10;
const LIFT = [-0.1, 0.42, 0.18, -0.3, 0.5, 0.05, -0.2, 0.32, 0.12, -0.38];
const TILT_Z = [-12, 20, -6, 26, 9, -22, 15, -4, 30, -16];
const TILT_X = [14, -18, 8, 22, -10, 16, -24, 6, -12, 20];
const SPIN = (Math.PI * 2) / 70; // one turn in 70 s
const PERSPECTIVE = 1400;
const RING_Y = 0.6; // share of the screen's height

const CSS = `
.b40-card { transform-style: preserve-3d; will-change: transform, opacity; }
.b40-card:focus-visible { outline: 0.1rem solid #ffffff; outline-offset: 0.4rem; }
.b40-link { transition: color 0.2s ease; }
.b40-link:hover, .b40-link:focus-visible { color: #ffffff; }
.b40-row-btn { transition: color 0.2s ease; text-align: left; }
.b40-row-btn:hover, .b40-row-btn:focus-visible { color: #ffffff; }
.b40-circle { transition: background-color 0.25s ease, color 0.25s ease; }
.b40-circle:hover, .b40-circle:focus-visible { background-color: ${BLOSSOM}; color: ${BAND}; }
.b40-dialog { animation: b40-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b40-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b40-link, .b40-row-btn, .b40-circle { transition: none; }
  .b40-dialog { animation: none; }
}
`;

function stillMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

  return (
    <div
      aria-labelledby="b40-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.96)", color: BLOSSOM }}
    >
      <div className="b40-dialog mx-auto w-full max-w-[150rem] px-[1.6rem] py-[3rem] md:px-[6vw] md:py-[6vh]">
        <div className="flex items-baseline justify-between gap-[2rem] pb-[1rem]" style={{ borderBottom: LINE }}>
          <p className={`${SMALL} opacity-70`}>
            ({pad2(i + 1)}) {p.year}
          </p>
          <button className={`${SMALL} b40-link cursor-pointer`} onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>
        <div className="mt-[3rem] grid gap-x-[4vw] gap-y-[3rem] lg:grid-cols-[1.15fr_1fr]">
          <div className="relative aspect-[4/3] w-full">
            {source ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className="min-w-0">
            <h2 className={BIG} id="b40-detail-title" style={{ fontSize: "clamp(3.6rem, 4.4vw, 8rem)" }}>
              {p.title}
            </h2>
            <p className="mt-[2rem] max-w-[56rem] font-sans text-[1.8rem] font-medium leading-[1.3] tracking-[-0.01em] text-white">{p.tagline}</p>
            <ul className="mt-[2.4rem]">
              {p.bullets.map((b) => (
                <li className={`${SMALL} py-[0.8rem] leading-[1.45]`} key={b} style={{ borderBottom: LINE }}>
                  {b}
                </li>
              ))}
            </ul>
            <dl className="mt-[2.4rem] grid grid-cols-[8rem_1fr] gap-x-[1.2rem]">
              <dt className={`${SMALL} py-[0.6rem] opacity-60`} style={{ borderBottom: LINE }}>
                Stack
              </dt>
              <dd className={`${SMALL} py-[0.6rem]`} style={{ borderBottom: LINE }}>
                {p.stack.join(", ")}
              </dd>
              {p.award ? (
                <>
                  <dt className={`${SMALL} py-[0.6rem] opacity-60`} style={{ borderBottom: LINE }}>
                    Award
                  </dt>
                  <dd className={`${SMALL} py-[0.6rem] text-white`} style={{ borderBottom: LINE }}>
                    {p.award}
                  </dd>
                </>
              ) : null}
              {p.href || p.code ? (
                <>
                  <dt className={`${SMALL} py-[0.6rem] opacity-60`} style={{ borderBottom: LINE }}>
                    Links
                  </dt>
                  <dd className={`${SMALL} flex flex-wrap gap-x-[2rem] gap-y-[0.4rem] py-[0.6rem]`} style={{ borderBottom: LINE }}>
                    {p.href ? (
                      <a className="b40-link break-all text-white" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b40-link text-white" href={p.code} rel="noreferrer" target="_blank">
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

/** The first screen: the two words and the ring of cards between them. */
function Orbit({ sources, onOpen, cardRefs }: { sources: BarSource[] | null; onOpen: (i: number) => void; cardRefs: RefObject<(HTMLButtonElement | null)[]> }): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLElement | null)[]>([]);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const hoverRef = useRef(-1);
  const redrawRef = useRef<() => void>(() => {});
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const still = stillMotion();
    const size = { w: stage.clientWidth, h: stage.clientHeight };
    const amt = new Array<number>(SLOTS).fill(0);
    let spin = 0.35;
    let speed = still ? 0 : SPIN;
    let visible = true;

    const place = (): void => {
      const { w, h } = size;
      const R = Math.min(w * (w < 700 ? 0.34 : 0.28), 540);
      const cardW = slotRefs.current[0]?.offsetWidth ?? 100;
      const cardH = cardW * 0.72;
      let caption: { x: number; y: number; a: number } | null = null;
      for (let k = 0; k < SLOTS; k++) {
        const el = slotRefs.current[k];
        if (!el) continue;
        const a = amt[k];
        const main = k % 2 === 0;
        const t = spin + (k * Math.PI * 2) / SLOTS;
        const x = R * Math.sin(t);
        const z = R * Math.cos(t) * (1 - a) + a * R * 0.5;
        const y = LIFT[k] * R * 0.42 * (1 - a);
        const depth = (Math.cos(t) + 1) / 2;
        const scale = (main ? 1 : 0.8) * (1 + 0.9 * a);
        const turn = 1 - a;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${(TILT_X[k] * turn).toFixed(2)}deg) rotateY(${(65 * Math.sin(t) * turn).toFixed(2)}deg) rotateZ(${(TILT_Z[k] * turn).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        const base = main ? 0.35 + 0.65 * depth : 0.12 + 0.28 * depth;
        el.style.opacity = String(base + (1 - base) * a);
        if (main && a > 0.01) {
          const s = PERSPECTIVE / (PERSPECTIVE - z);
          caption = { x: w / 2 + x * s, y: h * RING_Y + (y + (cardH * scale) / 2) * s, a };
        }
      }
      const cap = captionRef.current;
      if (cap) {
        if (caption) {
          cap.style.transform = `translate(${caption.x.toFixed(1)}px, ${(caption.y + 12).toFixed(1)}px) translateX(-50%)`;
          cap.style.opacity = String(caption.a);
        } else {
          cap.style.opacity = "0";
        }
      }
    };

    // Under reduced motion there is no loop: a hover sets the card at once.
    redrawRef.current = () => {
      if (!still) return;
      for (let k = 0; k < SLOTS; k++) amt[k] = hoverRef.current >= 0 && k === hoverRef.current * 2 ? 1 : 0;
      place();
    };

    const ro = new ResizeObserver(() => {
      size.w = stage.clientWidth;
      size.h = stage.clientHeight;
      place();
    });
    ro.observe(stage);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(stage);

    place();
    if (still) {
      return () => {
        ro.disconnect();
        io.disconnect();
        redrawRef.current = () => {};
      };
    }

    let raf = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible) {
        const hovering = hoverRef.current >= 0;
        speed += ((hovering ? 0 : SPIN) - speed) * Math.min(1, dt * 4);
        spin += speed * dt;
        for (let k = 0; k < SLOTS; k++) {
          const target = hovering && k === hoverRef.current * 2 ? 1 : 0;
          amt[k] += (target - amt[k]) * Math.min(1, dt * 9);
        }
        place();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      redrawRef.current = () => {};
    };
  }, [sources]);

  const enter = useCallback((i: number) => {
    hoverRef.current = i;
    setHover(i);
    redrawRef.current();
  }, []);
  const leave = useCallback((i: number) => {
    if (hoverRef.current !== i) return;
    hoverRef.current = -1;
    setHover(-1);
    redrawRef.current();
  }, []);

  const shown = hover >= 0 ? projects[hover] : null;

  return (
    <section aria-label="Work" className="relative h-[max(60rem,90svh)] w-full overflow-hidden" id="work">
      {/* The ring. Cards sit on the ring's centre and are moved out by transform. */}
      <div
        className="absolute inset-0"
        ref={stageRef}
        style={{ perspective: `${PERSPECTIVE}px`, perspectiveOrigin: `50% ${RING_Y * 100}%`, transformStyle: "preserve-3d" }}
      >
        {Array.from({ length: SLOTS }, (_, k) => {
          const i = (Math.floor(k / 2) + (k % 2) * 2) % projects.length;
          const p = projects[i];
          const style = {
            left: "50%",
            top: `${RING_Y * 100}%`,
            width: "clamp(6.4rem, 7vw, 13.6rem)",
            aspectRatio: "1 / 0.72",
            transform: "translate3d(0, 0, 0)",
            opacity: 0,
          } as const;
          const body = (
            <span className="absolute inset-0 block" style={{ backgroundColor: BAND, outline: LINE }}>
              {sources ? <BarPicture cell={3} className="absolute inset-0" level={k % 2 === 0 ? 1 : 0.6} source={sources[i]} /> : null}
            </span>
          );
          if (k % 2 === 1) {
            return (
              <span
                aria-hidden
                className="b40-card pointer-events-none absolute"
                key={`echo-${k}`}
                ref={(el) => {
                  slotRefs.current[k] = el;
                }}
                style={{ ...style, marginLeft: "calc(clamp(6.4rem, 7vw, 13.6rem) / -2)", marginTop: "calc(clamp(6.4rem, 7vw, 13.6rem) * -0.36)" }}
              >
                {body}
              </span>
            );
          }
          return (
            <button
              aria-haspopup="dialog"
              aria-label={`${p.title}, ${p.year}`}
              className="b40-card absolute block cursor-pointer"
              key={p.title}
              onBlur={() => leave(i)}
              onClick={() => onOpen(i)}
              onFocus={() => enter(i)}
              onPointerEnter={() => enter(i)}
              onPointerLeave={() => leave(i)}
              ref={(el) => {
                slotRefs.current[k] = el;
                cardRefs.current[i] = el;
              }}
              style={{ ...style, marginLeft: "calc(clamp(6.4rem, 7vw, 13.6rem) / -2)", marginTop: "calc(clamp(6.4rem, 7vw, 13.6rem) * -0.36)" }}
              type="button"
            >
              {body}
            </button>
          );
        })}
      </div>

      {/* The hovered card's title, kept flat so the type stays sharp. */}
      <p
        aria-hidden
        className={`${SMALL} pointer-events-none absolute left-0 top-0 whitespace-nowrap text-white`}
        ref={captionRef}
        style={{ opacity: 0 }}
      >
        {shown ? (
          <>
            {shown.title} <span className="opacity-60">{shown.year}</span>
          </>
        ) : null}
      </p>

      {/* The two words, one line, far apart. */}
      <h2
        className={`${BIG} pointer-events-none absolute inset-x-[1.6rem] top-[44%] flex -translate-y-1/2 items-baseline justify-between md:inset-x-[19vw]`}
        style={BIG_SIZE}
      >
        <span>Work</span>
        <span className="tabular-nums">{SPAN}</span>
      </h2>
    </section>
  );
}

export default function B40(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(-1);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  useEffect(() => setMounted(true), []);

  // Canvases and image paths for the bar pictures, made once in the browser.
  const sources = useMemo(() => (mounted ? projects.map((p) => projectSource(p)) : null), [mounted]);

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to the card that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      cardRefs.current[lastOpen.current]?.focus({ preventScroll: true });
      lastOpen.current = -1;
    }
  }, [open]);

  const now = experience[0];

  return (
    <div className="relative w-full" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <Orbit cardRefs={cardRefs} onOpen={setOpen} sources={sources} />

      {/* "Skills & Recog-nitions", then the two tables, on one set of columns. */}
      <section aria-labelledby="b40-rec-title" className="mx-auto w-full px-[1.6rem] pb-[10vh] pt-[6vh] md:w-[74%] md:px-0" id="skills">
        <h2 aria-label="Skills and Recognitions" className={`${BIG} grid grid-cols-[4.5rem_1fr] ${COLS}`} id="b40-rec-title" style={BIG_SIZE}>
          <span aria-hidden className="col-start-2">
            Skills
          </span>
          <span aria-hidden className="col-start-1 row-start-2">
            &amp;
          </span>
          <span aria-hidden className="col-start-2 row-start-2 whitespace-nowrap md:col-span-3">
            Recog-
          </span>
          <span aria-hidden className="col-start-2 row-start-3 whitespace-nowrap pl-[18%] md:col-span-3 md:pl-[33.8%]">
            nitions
          </span>
        </h2>

        {/* Skills: group | skills. */}
        <div className="mt-[7vh]" role="table" aria-label="Skills">
          <div className={`grid grid-cols-[11rem_1fr] gap-x-[1.2rem] ${COLS}`} role="row">
            <span className={`${SMALL} py-[0.5rem] opacity-50`} role="columnheader" style={{ borderBottom: LINE }}>
              Group
            </span>
            <span className={`${SMALL} py-[0.5rem] opacity-50 md:col-span-3`} role="columnheader" style={{ borderBottom: LINE }}>
              Skills
            </span>
          </div>
          {skillGroups.map((g) => (
            <div className={`grid grid-cols-[11rem_1fr] gap-x-[1.2rem] ${COLS}`} key={g.label} role="row">
              <span className={`${SMALL} py-[0.5rem] text-white`} role="rowheader" style={{ borderBottom: LINE }}>
                {g.label}
              </span>
              <span className={`${SMALL} py-[0.5rem] md:col-span-3`} role="cell" style={{ borderBottom: LINE }}>
                {g.skills.map((s) => s.name).join(", ")}
              </span>
            </div>
          ))}
        </div>

        {/* Recognition: year | project | organisation | result, grouped by year. */}
        <div className="mt-[5vh]" role="table" aria-label="Recognition">
          <div className={`grid grid-cols-[5.2rem_1fr_1fr_1fr] gap-x-[1rem] md:gap-x-[1.2rem] ${COLS}`} role="row">
            {["Year", "Project", "Organisation", "Result"].map((h) => (
              <span className={`${SMALL} py-[0.5rem] opacity-50`} key={h} role="columnheader" style={{ borderBottom: LINE }}>
                {h}
              </span>
            ))}
          </div>
          {RECOGNITION.map((g, gi) => (
            <div className={gi === 0 ? "" : "mt-[2.4rem]"} key={g.year} role="rowgroup">
              {g.rows.map((r, j) => {
                const same = j > 0 && g.rows[j - 1].project === r.project;
                return (
                  <div className={`grid grid-cols-[5.2rem_1fr_1fr_1fr] gap-x-[1rem] md:gap-x-[1.2rem] ${COLS}`} key={`${r.org}-${r.result}`} role="row">
                    <span className={`${SMALL} py-[0.5rem] text-white`} role="cell" style={{ borderBottom: LINE }}>
                      {j === 0 ? g.year : ""}
                    </span>
                    <span className={`${SMALL} min-w-0 py-[0.5rem]`} role="cell" style={{ borderBottom: LINE }}>
                      {same ? "" : r.open !== undefined ? (
                        <button className="b40-row-btn cursor-pointer" onClick={() => setOpen(r.open ?? -1)} type="button">
                          {r.project}
                        </button>
                      ) : (
                        r.project
                      )}
                    </span>
                    <span className={`${SMALL} min-w-0 py-[0.5rem]`} role="cell" style={{ borderBottom: LINE }}>
                      {r.org}
                    </span>
                    <span className={`${SMALL} min-w-0 py-[0.5rem] text-white`} role="cell" style={{ borderBottom: LINE }}>
                      {r.result}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* The close: a sentence on stepped lines, the email and links small beside it. */}
      <section aria-label="Contact" className="mx-auto w-full px-[1.6rem] pb-[12vh] pt-[6vh] md:w-[74%] md:px-0" id="contact" style={{ borderTop: LINE }}>
        <div className="grid gap-y-[4rem] md:grid-cols-[25fr_49fr] md:items-center">
          <p className={`${BIG} md:order-2`} style={BIG_SIZE}>
            <span className="block pl-[8%] md:pl-[6%]">I build</span>
            <span className="block pl-[20%] md:pl-[20%]">systems that</span>
            <span className="mt-[0.16em] block pl-[32%] md:pl-[42%]">bring ideas</span>
            <span className="block pl-[14%] md:pl-[26%]">to life.</span>
          </p>
          <div className="md:order-1">
            <p className={`${SMALL} text-white`}>
              {now.role},
              <br />
              {now.org}
            </p>
            <p className={`${SMALL} mt-[2.4rem] opacity-60`}>Write directly to:</p>
            <a className={`${SMALL} b40-link mt-[0.6rem] inline-block break-all text-white`} href={`mailto:${EMAIL}`}>
              {EMAIL}
            </a>
          </div>
        </div>
        <ul className="mt-[7vh] flex flex-wrap justify-center gap-[1.2rem]">
          {elsewhere.map((l) => (
            <li key={l.href}>
              <a
                aria-label={`${l.label}, ${l.handle}`}
                className="b40-circle flex h-[7rem] w-[7rem] items-center justify-center rounded-full font-sans text-[1.3rem] font-semibold"
                href={l.href}
                rel="noreferrer"
                style={{ border: `0.1rem solid ${BLOSSOM}` }}
                target="_blank"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {open >= 0 ? <Detail i={open} onClose={close} source={sources ? sources[open] : null} /> : null}
    </div>
  );
}
