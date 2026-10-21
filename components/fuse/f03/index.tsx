"use client";

import { Fragment, type JSX, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Libre_Baskerville } from "next/font/google";

import BarPicture from "@/components/below/barPicture";
import { createDotField, type DotField } from "@/components/dotField";
import { projects } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

import { LETTER, LINE, ORGS, type OrgKey, type Row, type Run, TIMELINE } from "./content";
import { createFlower, FRAMES } from "./flower";

/**
 * Concept 03, "Letter": the whole site as one letter you read top to bottom.
 *
 * Left: what lanceyan.com's first page says, set the way lukebaffait.fr
 * sets its about line. Three big sentences, upright Inter with a few words
 * in the italic display serif, and each organisation named with a tiny
 * square mark before it, as Lance does. The words light up one by one as
 * you scroll. Under each sentence, a short aside in Lance's serif with the
 * facts behind it. Then the timeline (rows open in place), the work as a
 * short list with a small bar picture each, and the closing quote with the
 * links.
 *
 * Right: one flower, drawn in diamonds (dotField) in plum and blossom, in a
 * rounded frame with a rose glow like Luke's portrait. It stays put while
 * the letter scrolls. It opens as you read and closes again at the end.
 * On a phone there is no room beside the text, so the same canvas sits
 * behind the words, faint, and only its light is added to the page.
 *
 * The end is Luke's: the name across the page, a hairline, and a bar of
 * small capitals.
 *
 * Reduced motion: every word is lit, the flower stands open and still.
 */

const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap" });

const SECTIONS = [
  { id: "f3-letter", name: "Letter" },
  { id: "f3-timeline", name: "Timeline" },
  { id: "f3-work", name: "Work" },
  { id: "f3-close", name: "Postscript" },
] as const;

const WORK = projects.filter((p) => p.kind !== "bot" && p.image);

const LINKS = (["X", "LinkedIn", "GitHub"] as const)
  .map((label) => elsewhere.find((l) => l.label === label))
  .filter((l): l is (typeof elsewhere)[number] => Boolean(l));

const FOCUS = "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#f9b9dc]";

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const pad2 = (n: number): string => String(n).padStart(2, "0");

const reducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Scrolls to a section (or the top) through the site's Lenis when it is
 *  running, and moves keyboard focus there too. */
function goTo(id: string | null): void {
  const el = id ? document.getElementById(id) : null;
  const offset = -Math.round(window.innerHeight * 0.1);
  const lenis = (window as unknown as { __lenis?: { scrollTo: (t: HTMLElement | number, o?: { offset?: number }) => void } }).__lenis;
  if (lenis) lenis.scrollTo(el ?? 0, { offset: el ? offset : 0 });
  else {
    const top = el ? el.getBoundingClientRect().top + window.scrollY + offset : 0;
    window.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" });
  }
  (el ?? document.getElementById(SECTIONS[0].id))?.focus({ preventScroll: true });
}

/* ---------- The big sentences ---------- */

type Piece = { t: string; i?: boolean } | { org: OrgKey };

/** Runs to words. A run that starts without a space joins the word before
 *  it; an organisation is one word, mark and name together. */
function toWords(runs: Run[]): Piece[][] {
  const words: Piece[][] = [];
  let cur: Piece[] = [];
  const cut = (): void => {
    if (cur.length) words.push(cur);
    cur = [];
  };
  for (const run of runs) {
    if ("org" in run) {
      cur.push(run);
      continue;
    }
    run.t.split(" ").forEach((part, k) => {
      if (k > 0) cut();
      if (part) cur.push({ t: part, i: run.i });
    });
  }
  cut();
  return words;
}

/** Lance's tiny square logo, drawn as a monogram. */
function Mark({ k }: { k: OrgKey }): JSX.Element {
  const o = ORGS[k];
  return (
    <span
      aria-hidden="true"
      className="mr-[0.22em] inline-flex h-[0.62em] w-[0.62em] -translate-y-[0.07em] items-center justify-center rounded-[0.12em] align-middle"
      style={{ background: o.bg, color: o.fg, boxShadow: o.ring ? `inset 0 0 0 0.04em ${o.ring}` : undefined }}
    >
      <span className="font-mono text-[0.26em] font-semibold leading-none tracking-[-0.04em]">{o.mark}</span>
    </span>
  );
}

function OrgName({ k }: { k: OrgKey }): JSX.Element {
  const o = ORGS[k];
  const name = <span className="underline decoration-white/30 decoration-[0.04em] underline-offset-[0.14em]">{o.name}</span>;
  return (
    <>
      <Mark k={k} />
      {o.href ? (
        <a className={`rounded-[0.1em] transition-colors hover:text-[#f9b9dc] ${FOCUS}`} href={o.href} rel="noreferrer" target="_blank">
          {name}
        </a>
      ) : (
        name
      )}
    </>
  );
}

function Statement({ n, runs, setRef }: { n: number; runs: Run[]; setRef: (el: HTMLParagraphElement | null) => void }): JSX.Element {
  const words = toWords(runs);
  return (
    <div className="relative">
      <span className="mb-[1.2rem] block font-sans text-[1.2rem] tabular-nums text-white/55 lg:absolute lg:-left-[5.2rem] lg:top-[1.9rem] lg:mb-0">({pad2(n)})</span>
      <p
        className="font-sans text-[3.4rem] font-normal leading-[1.12] tracking-[-0.03em] text-white sm:text-[4.6rem] lg:text-[5.4rem] lg:leading-[1.1]"
        ref={setRef}
      >
        {words.map((w, k) => (
          <Fragment key={k}>
            {k > 0 ? " " : null}
            <span className={`f3w${w.some((p) => "org" in p) ? " whitespace-nowrap" : ""}`}>
              {w.map((p, m) =>
                "org" in p ? (
                  <OrgName k={p.org} key={m} />
                ) : p.i ? (
                  <span className="font-serif-display text-[1.14em] italic leading-none tracking-[-0.01em] text-[#f9b9dc]" key={m}>
                    {p.t}
                  </span>
                ) : (
                  <Fragment key={m}>{p.t}</Fragment>
                ),
              )}
            </span>
          </Fragment>
        ))}
      </p>
    </div>
  );
}

/* ---------- Lance's pieces ---------- */

function Pager({ n }: { n: number }): JSX.Element {
  const last = n === SECTIONS.length;
  return (
    <button
      aria-label={last ? "Back to the top" : `Next: ${SECTIONS[n].name}`}
      className={`group inline-flex min-h-[4.4rem] shrink-0 items-center gap-[0.8rem] rounded-[0.4rem] px-[0.4rem] text-[1.4rem] tracking-[0.06em] text-white/60 transition-colors hover:text-white ${FOCUS}`}
      onClick={() => goTo(last ? null : SECTIONS[n].id)}
      type="button"
    >
      <span className="whitespace-nowrap tabular-nums">
        {pad2(n)} / {pad2(SECTIONS.length)}
      </span>
      <svg
        aria-hidden="true"
        className={`h-[1.6rem] w-[1.6rem] transition-transform duration-300 ${last ? "-rotate-90 group-hover:-translate-y-[0.2rem]" : "group-hover:translate-x-[0.2rem]"}`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </button>
  );
}

function SectionHead({ n, children }: { n: number; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-[1.6rem]">
      {children}
      <Pager n={n} />
    </div>
  );
}

function TimelineRow({ row, first }: { row: Row; first: boolean }): JSX.Element {
  const [open, setOpen] = useState(first);
  const id = useId();
  return (
    <li className="border-b border-white/10">
      <button
        aria-controls={id}
        aria-expanded={open}
        className={`grid min-h-[4.4rem] w-full grid-cols-[7.2rem_minmax(0,1fr)_1.6rem] items-baseline gap-x-[1.6rem] rounded-[0.2rem] py-[1.3rem] text-left transition-colors hover:text-white sm:grid-cols-[11.2rem_minmax(0,1fr)_1.6rem] ${FOCUS}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="tabular-nums text-white/45">{row.when}</span>
        <span className="text-white/90">{row.title}</span>
        <svg
          aria-hidden="true"
          className={`h-[1.4rem] w-[1.4rem] self-center text-white/50 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        aria-hidden={!open}
        className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none"
        id={id}
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <ul className="space-y-[0.4rem] pb-[1.6rem] pl-[8.8rem] pr-[3.2rem] text-[1.7rem] leading-[1.6] text-white/60 sm:pl-[12.8rem] lg:text-[1.5rem]">
            {row.notes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

/* ---------- The page ---------- */

export default function F03(): JSX.Element {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const parasRef = useRef<(HTMLParagraphElement | null)[]>([]);
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const stageRef = useRef<HTMLSpanElement | null>(null);
  const endRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const grid = gridRef.current;
    const canvas = canvasRef.current;
    const end = endRef.current;
    if (!grid || !canvas || !end) return undefined;
    const reduced = reducedMotion();
    const phone = window.innerWidth < 1024;

    // The words, per sentence, and how many of each are lit.
    const paras = parasRef.current.filter((p): p is HTMLParagraphElement => Boolean(p));
    const words = paras.map((p) => Array.from(p.querySelectorAll<HTMLElement>(".f3w")));
    const lit = paras.map(() => -1);
    const light = (j: number, n: number): void => {
      if (n === lit[j]) return;
      words[j].forEach((w, k) => {
        if (k < n) w.setAttribute("data-on", "");
        else w.removeAttribute("data-on");
      });
      lit[j] = n;
    };
    if (reduced) words.forEach((ws, j) => light(j, ws.length));

    // The name at the end rises in once it is on screen.
    const seen = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          end.setAttribute("data-in", "");
          seen.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    seen.observe(end);

    let field: DotField | null = null;
    try {
      field = createDotField(canvas, {
        // Cells about 6 CSS px across, as lanceyan's are at 1600 wide.
        cols: Math.round(Math.max(90, Math.min(200, canvas.clientWidth / (phone ? 3.4 : 6)))),
        threshold: 0.13,
        brightness: 1,
        size: 0.85,
        hue: 0,
        // On a phone the canvas is screen-blended over the page, so black
        // adds nothing; in the frame the ground is the deepest plum.
        ground: phone ? "#000000" : "#12050c",
        ramp: [
          [0, "#2a0d1e"],
          [0.3, "#6a1d44"],
          [0.5, "#b8174f"],
          [0.74, "#f9b9dc"],
          [1, "#fffafc"],
        ],
      });
    } catch {
      field = null;
    }
    const flower = field ? createFlower() : null;
    const sized = new ResizeObserver(() => field?.resize());
    sized.observe(canvas);

    const t0 = performance.now();
    let raf = 0;
    let lastStep = -1;
    let lastFrame = -1;
    let section = -1;
    let stage = "";

    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const vh = window.innerHeight;

      // Words: lit from the first to the last as the sentence crosses the
      // screen, all lit by the time its foot is 60% of the way down. The
      // first sentence also writes itself in on arrival.
      if (!reduced) {
        const arrival = clamp01((now - t0 - 300) / 1800);
        paras.forEach((p, j) => {
          const r = p.getBoundingClientRect();
          let q = clamp01((vh * 0.88 - r.top) / (r.height + vh * 0.28));
          if (j === 0) q = Math.max(q, arrival);
          light(j, Math.round(q * words[j].length));
        });
      }

      // Which part of the letter is being read, for the frame's caption.
      let s = 0;
      SECTIONS.forEach((sec, k) => {
        const el = document.getElementById(sec.id);
        if (el && el.getBoundingClientRect().top < vh * 0.5) s = k;
      });
      if (s !== section) {
        section = s;
        if (nameRef.current) nameRef.current.textContent = SECTIONS[s].name;
        if (countRef.current) countRef.current.textContent = `${pad2(s + 1)} / ${pad2(SECTIONS.length)}`;
      }

      // The flower: a bud at the top, open by a little past half way, and
      // closing over the last fifth, as the letter is signed.
      const gr = grid.getBoundingClientRect();
      const g = clamp01(-gr.top / Math.max(1, gr.height - vh));
      const open = reduced ? 0.92 : clamp01(0.1 + 0.9 * smooth(0, 0.55, g) - 0.84 * smooth(0.8, 1, g));
      const frame = Math.round(open * (FRAMES - 1));
      const label = reduced ? "In bloom" : g > 0.8 ? "Closing" : open > 0.9 ? "In bloom" : open > 0.16 ? "Opening" : "In bud";
      if (label !== stage) {
        stage = label;
        if (stageRef.current) stageRef.current.textContent = label;
      }
      if (!field || !flower) return;
      if (reduced) {
        // Still: one drawing, once the open frame has been decoded.
        if (lastFrame === frame || flower.captured() <= frame) return;
        lastFrame = frame;
        field.render((ctx, c, r) => flower.paint(ctx, c, r, frame, null));
        return;
      }
      // The breeze runs at 30 fps, as lanceyan caps its redraw.
      const step = Math.floor((now - t0) / (1000 / 30));
      if (step === lastStep) return;
      lastStep = step;
      const t = (now - t0) / 1000;
      field.render((ctx, c, r) => flower.paint(ctx, c, r, frame, t));
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      seen.disconnect();
      sized.disconnect();
      flower?.dispose();
      field?.dispose();
    };
  }, []);

  return (
    <main className="relative text-white">
      <style>{`
        .f3w { opacity: 0.14; transition: opacity 0.5s cubic-bezier(0.2, 0.7, 0.2, 1); }
        .f3w[data-on] { opacity: 1; }
        .f3sig { opacity: 0; transform: translateY(14%); transition: opacity 1.1s cubic-bezier(0.2, 0.7, 0.2, 1), transform 1.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .f3sig + .f3sig { transition-delay: 0.12s; }
        [data-in] .f3sig { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: reduce) {
          .f3w, .f3sig { opacity: 1; transform: none; transition: none; }
        }
      `}</style>
      <noscript>
        <style>{`.f3w, .f3sig { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>

      <div className="relative lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" ref={gridRef}>
        {/* The flower. Beside the letter on a wide screen; behind it on a phone. */}
        <aside aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 mix-blend-screen lg:relative lg:mix-blend-normal lg:inset-auto lg:col-start-2 lg:row-start-1">
          <div className="h-full w-full lg:sticky lg:top-0 lg:h-screen lg:py-[2.4rem] lg:pr-[2.4rem]">
            <div className="relative h-full w-full">
              <div className="absolute -inset-[4rem] hidden rounded-[8rem] bg-[radial-gradient(60%_55%_at_55%_60%,rgba(184,23,79,0.38),rgba(42,13,30,0)_70%)] lg:block" />
              <div className="relative h-full w-full lg:overflow-hidden lg:rounded-[4.8rem] lg:shadow-[0_0_0_1px_rgba(255,250,252,0.08),0_3rem_12rem_-2rem_rgba(184,23,79,0.45)]">
                <canvas
                  className="absolute inset-0 block h-full w-full opacity-[0.45] [mask-image:linear-gradient(transparent_8%,#000_55%)] lg:opacity-100 lg:[mask-image:none]"
                  ref={canvasRef}
                />
                <div className="absolute inset-x-[3.2rem] top-[2.8rem] hidden items-center justify-between font-sans text-[1.2rem] uppercase tracking-[0.04em] text-white/70 lg:flex">
                  <span ref={nameRef}>Letter</span>
                  <span className="tabular-nums" ref={countRef}>
                    01 / 04
                  </span>
                </div>
                <div className="absolute inset-x-[3.2rem] bottom-[2.8rem] hidden items-center justify-between font-sans text-[1.2rem] uppercase tracking-[0.04em] text-white/55 lg:flex">
                  <span ref={stageRef}>In bud</span>
                  <span>Toronto, ON</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* The letter. */}
        <div className="relative z-10 px-[2rem] pb-[14rem] pt-[9.6rem] sm:px-[4.8rem] lg:col-start-1 lg:row-start-1 lg:pb-[24rem] lg:pl-[11.4rem] lg:pr-[7.2rem] lg:pt-[12rem]">
          <section aria-label="Letter" className="max-w-[100rem] outline-none" id={SECTIONS[0].id} tabIndex={-1}>
            <SectionHead n={1}>
              <h1 className={`${serif.className} text-[3rem] font-bold leading-none sm:text-[3.6rem]`}>Kevin He</h1>
            </SectionHead>
            <div className="mt-[6.4rem] space-y-[9.6rem] lg:mt-[8rem] lg:space-y-[12rem]">
              {LETTER.map((para, j) => (
                <div key={j}>
                  <Statement
                    n={j + 1}
                    runs={para.runs}
                    setRef={(el) => {
                      parasRef.current[j] = el;
                    }}
                  />
                  <p className={`${serif.className} mt-[3.2rem] max-w-[58rem] text-[2rem] leading-[1.75] text-white/80 lg:mt-[4rem] lg:text-[1.8rem]`}>{para.aside}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="f3-timeline-h" className={`${serif.className} mt-[16rem] max-w-[72rem] outline-none lg:mt-[22rem]`} id={SECTIONS[1].id} tabIndex={-1}>
            <SectionHead n={2}>
              <h2 className="text-[2rem] leading-[1.5] text-white/85 lg:text-[1.8rem]" id="f3-timeline-h">
                A rough timeline of what I&rsquo;ve done so far:
              </h2>
            </SectionHead>
            <ul className="mt-[2.4rem] border-t border-white/10 text-[1.8rem] lg:text-[1.7rem]">
              {TIMELINE.map((row, k) => (
                <TimelineRow first={k === 0} key={`${row.when}-${row.title}`} row={row} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="f3-work-h" className="mt-[16rem] max-w-[72rem] outline-none lg:mt-[20rem]" id={SECTIONS[2].id} tabIndex={-1}>
            <SectionHead n={3}>
              <h2 className={`${serif.className} text-[2rem] leading-[1.5] text-white/85 lg:text-[1.8rem]`} id="f3-work-h">
                A few things I&rsquo;ve built:
              </h2>
            </SectionHead>
            <ul className="group/list mt-[2.4rem] border-t border-white/10">
              {WORK.map((p) => (
                <li key={p.title}>
                  <a
                    className={`flex items-center gap-[1.6rem] border-b border-white/10 py-[1.6rem] transition-opacity duration-300 group-focus-within/list:opacity-[0.4] group-hover/list:opacity-[0.4] hover:!opacity-100 focus-visible:!opacity-100 sm:gap-[2.4rem] ${FOCUS}`}
                    href={p.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="relative h-[5.6rem] w-[8rem] shrink-0 overflow-hidden rounded-[0.8rem] bg-[#12050c] sm:h-[6.4rem] sm:w-[9.6rem]">
                      <BarPicture cell={3} source={p.image ?? ""} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-sans text-[2.4rem] leading-[1.15] tracking-[-0.02em] text-white sm:text-[3rem]">{p.title}</span>
                      <span className={`${serif.className} mt-[0.4rem] block text-[1.6rem] leading-[1.5] text-white/55 lg:text-[1.4rem]`}>{p.tagline}</span>
                    </span>
                    <span className="hidden shrink-0 text-right font-sans text-[1.2rem] uppercase tabular-nums tracking-[0.04em] text-white/50 sm:block">
                      {p.year}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="f3-close-h" className={`${serif.className} mt-[16rem] max-w-[64rem] outline-none lg:mt-[20rem]`} id={SECTIONS[3].id} tabIndex={-1}>
            <SectionHead n={4}>
              <h2 className="text-[2rem] leading-[1.5] text-white/85 lg:text-[1.8rem]" id="f3-close-h">
                Thanks for reading. What I keep coming back to:
              </h2>
            </SectionHead>
            <blockquote className="mt-[3.2rem] max-w-[56rem] border-l border-white/30 pl-[1.6rem] text-[2.4rem] italic leading-[1.5] text-white/90 lg:text-[2.6rem]">
              &ldquo;{LINE}&rdquo;
            </blockquote>
            <div className="mt-[4rem] flex flex-wrap items-center gap-x-[2rem] gap-y-[0.4rem] text-[1.6rem] text-white/60 lg:text-[1.4rem]">
              {LINKS.map((l) => (
                <a className={`inline-flex min-h-[4.4rem] items-center underline underline-offset-4 transition-colors hover:text-white ${FOCUS}`} href={l.href} key={l.label} rel="noreferrer" target="_blank">
                  {l.label.toLowerCase()}
                </a>
              ))}
              <a className={`inline-flex min-h-[4.4rem] items-center underline underline-offset-4 transition-colors hover:text-white ${FOCUS}`} href={`mailto:${EMAIL}`}>
                email
              </a>
            </div>
          </section>
        </div>
      </div>

      {/* Luke's ending: the name across the page, a hairline, small capitals. */}
      <footer className="relative z-10 px-[2rem] pb-[7.2rem] sm:px-[4.8rem]" ref={endRef}>
        <p aria-label="Kevin He" className="flex items-end justify-between gap-[2rem] leading-[0.86]">
          <span aria-hidden="true" className="f3sig block font-sans text-[16vw] font-light tracking-[-0.055em] text-[#fffafc] lg:text-[13vw]">
            Kevin
          </span>
          <span
            aria-hidden="true"
            className="f3sig block bg-[linear-gradient(105deg,#f9b9dc_15%,#fffafc_85%)] bg-clip-text px-[0.08em] pb-[0.04em] font-serif-display text-[18vw] italic tracking-[-0.02em] text-transparent lg:text-[14.5vw]"
          >
            He.
          </span>
        </p>
        <div className="mt-[3.2rem] h-px bg-white/30" />
        <div className="flex flex-col gap-[1.2rem] pt-[2rem] font-sans text-[1.4rem] font-medium uppercase tracking-[0.02em] text-white/85 sm:flex-row sm:items-center sm:justify-between lg:text-[1.3rem]">
          <span>&rarr; Toronto, 2026</span>
          <nav aria-label="Elsewhere" className="flex items-center gap-[1.6rem]">
            {LINKS.map((l, k) => (
              <Fragment key={l.label}>
                {k > 0 ? (
                  <span aria-hidden="true" className="text-white/30">
                    /
                  </span>
                ) : null}
                <a className={`inline-flex min-h-[4.4rem] items-center transition-colors hover:text-[#f9b9dc] ${FOCUS}`} href={l.href} rel="noreferrer" target="_blank">
                  {l.label}
                </a>
              </Fragment>
            ))}
          </nav>
          <nav aria-label="Sections" className="flex items-center gap-[2.4rem]">
            {SECTIONS.slice(1).map((s) => (
              <button className={`inline-flex min-h-[4.4rem] items-center uppercase transition-colors hover:text-[#f9b9dc] ${FOCUS}`} key={s.id} onClick={() => goTo(s.id)} type="button">
                {s.name}
              </button>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}
