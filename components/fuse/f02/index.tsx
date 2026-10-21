"use client";

import { Libre_Baskerville } from "next/font/google";
import {
  type JSX,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import BarPicture, { textPlate } from "@/components/below/barPicture";
import SectionLink, { scrollToSection } from "@/components/SectionLink";
import { elsewhere, EMAIL } from "@/components/siteContent";

import Brush from "./Brush";
import { type Row, SKILLS, TIMELINE } from "./data";
import css from "./f02.module.css";
import Poppy from "./Poppy";

/**
 * Concept F02, "Index": the whole site as one page of three screens.
 *
 * 1. Home, set like lukebaffait.fr: a slow blossom-and-rose glow on plum,
 *    a small serif paragraph at the top left written the way lanceyan.com
 *    writes (first person, short, each organisation named with a small
 *    square mark before it), the huge "Kevin He." across the bottom, and a
 *    hairline over a footer bar of small capitals.
 *
 * 2. Work, set like Luke's work index, except the rows are Lance's
 *    timeline: one large year per row, dim until it is the active one.
 *    Click a row and its one-line facts open in place. A blossom brush
 *    stroke (SVG, roughened with noise filters) draws itself across the
 *    active row, and the card at the right shows that year's project as
 *    a bar picture, with "MM YYYY" and "PREVIEW" over it.
 *
 * 3. Info and contact: "I build systems that bring ideas to life." set
 *    large in Lance's serif, the skills as rows of small capitals, then the
 *    email and links. Behind it, the site's poppy blooms once as a grid of
 *    diamonds, the way Lance draws his pictures.
 *
 * The site's plum aurora and smooth scroll come from the route's layout.
 */

const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap" });

const ROSE = "#b8174f";
const BLOSSOM = "#f9b9dc";
const PLUM = "#2a0d1e";
const DEEP = "#1a0812";
const WHITE = "#fffafc";

const SOCIALS = (["GitHub", "LinkedIn", "X"] as const)
  .map((label) => elsewhere.find((l) => l.label === label))
  .filter((l): l is (typeof elsewhere)[number] => Boolean(l));

/** True on a screen at least 1024px wide. False on the server. */
function useWide(): boolean {
  return useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** Lance's organisation mark: a tiny square with a monogram, before the
 *  name. No outside logos. */
function Org({ mark, bg, fg, href, children }: { mark: string; bg: string; fg: string; href?: string; children: ReactNode }): JSX.Element {
  const name = href ? (
    <a className="text-white underline decoration-white/35 underline-offset-[0.22em] transition-colors hover:decoration-white" href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  ) : (
    <span className="text-white">{children}</span>
  );
  return (
    <span className="whitespace-nowrap">
      <span
        aria-hidden="true"
        className="mr-[0.35em] inline-grid h-[1.9em] min-w-[1.9em] place-items-center rounded-[0.25em] px-[0.25em] align-[0.2em] font-sans text-[0.58em] font-bold not-italic leading-none tracking-[-0.02em]"
        style={{ background: bg, color: fg }}
      >
        {mark}
      </span>
      {name}
    </span>
  );
}

/** Lance's "01 / 03 →": moves to the next screen (or back to the top). */
function Pager({ n, to, up = false }: { n: number; to: string; up?: boolean }): JSX.Element {
  const go = (): void => {
    const el = document.getElementById(to);
    if (el) scrollToSection(el, 1.6);
  };
  return (
    <button
      aria-label={up ? "Back to the top" : "Next screen"}
      className={`group inline-flex min-h-[4.4rem] shrink-0 items-center gap-[0.8rem] px-[0.4rem] text-[1.4rem] tracking-[0.06em] text-white/70 transition-colors hover:text-white ${serif.className}`}
      onClick={go}
      type="button"
    >
      <span className="whitespace-nowrap tabular-nums">{`0${n} / 03`}</span>
      <svg
        aria-hidden="true"
        className={`h-[1.6rem] w-[1.6rem] transition-transform duration-300 ${up ? "-rotate-90 group-hover:-translate-y-[0.3rem]" : "group-hover:translate-x-[0.3rem]"}`}
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

/** Luke's tiny numeric label, "(07)". */
function Count({ children }: { children: ReactNode }): JSX.Element {
  return <span className="font-sans text-[1rem] font-medium tabular-nums tracking-[0.02em] text-white/55">({children})</span>;
}

/** Luke's footer bar: a hairline, then three groups of small capitals. */
function Bar({ left, right }: { left: ReactNode; right: ReactNode }): JSX.Element {
  return (
    <div className="border-t border-white/25 pt-[1.4rem] font-sans text-[1.2rem] font-medium uppercase tracking-[0.04em] text-white/85 md:text-[1.4rem]">
      <div className="grid grid-cols-2 items-center gap-y-[0.8rem] md:grid-cols-[1fr_auto_1fr]">
        <div className="justify-self-start">{left}</div>
        <ul className="col-span-2 row-start-2 flex items-center justify-center gap-[1.2rem] md:col-span-1 md:row-start-1 md:gap-[2.4rem]">
          {SOCIALS.map((l, i) => (
            <li className="flex items-center gap-[1.2rem] md:gap-[2.4rem]" key={l.label}>
              {i > 0 && (
                <span aria-hidden="true" className="text-white/35">
                  /
                </span>
              )}
              <a className="inline-flex min-h-[4.4rem] items-center transition-colors hover:text-[#f9b9dc]" href={l.href} rel="noreferrer" target="_blank">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="justify-self-end">{right}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Home                                                             */
/* ------------------------------------------------------------------ */

function Home(): JSX.Element {
  return (
    <section aria-label="Kevin He" className="relative flex min-h-[100svh] flex-col overflow-hidden px-[2rem] pb-[5.6rem] md:px-[4.8rem] md:pb-[6.4rem]" id="top">
      {/* The glow: three soft blobs drifting on the plum, brightest at the top. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <div
          className={`${css.blob} ${css.driftA} blur-[5vw] left-[18%] top-[-30%] h-[95vh] w-[70vw]`}
          style={{ background: `radial-gradient(closest-side, ${ROSE} 0%, rgba(184,23,79,0.55) 45%, rgba(184,23,79,0) 100%)` }}
        />
        <div
          className={`${css.blob} ${css.driftB} blur-[4vw] left-[38%] top-[-18%] h-[60vh] w-[38vw]`}
          style={{ background: `radial-gradient(closest-side, rgba(249,185,220,0.95) 0%, rgba(249,185,220,0.35) 50%, rgba(249,185,220,0) 100%)` }}
        />
        <div
          className={`${css.blob} ${css.driftC} blur-[5vw] right-[-14%] top-[8%] h-[80vh] w-[46vw]`}
          style={{ background: `radial-gradient(closest-side, rgba(106,29,68,0.9) 0%, rgba(106,29,68,0.4) 55%, rgba(106,29,68,0) 100%)` }}
        />
        <div className="absolute inset-x-0 bottom-0 h-[55%]" style={{ background: `linear-gradient(to bottom, rgba(26,8,18,0), ${DEEP}cc)` }} />
      </div>

      {/* Lance's paragraph, small, at the top left; the pager at the top right. */}
      <div className="relative z-10 flex items-start justify-between gap-[2rem] pt-[2.4rem] md:pt-[4rem]">
        <div className={`max-w-[44rem] space-y-[1.2rem] text-[1.5rem] leading-[1.75] text-white/80 md:text-[1.6rem] ${serif.className}`}>
          <p>
            I&rsquo;m the co-founder and CTO of{" "}
            <Org bg={ROSE} fg={WHITE} href="https://theactually.company" mark="A">
              The Actually Company
            </Org>
            , a local-first AI speaking coach. I built it in San Francisco this summer, at{" "}
            <Org bg={WHITE} fg={DEEP} mark="F">
              Founders, Inc.
            </Org>{" "}
            Off Season II.
          </p>
          <p>
            I study computer engineering at the{" "}
            <Org bg={BLOSSOM} fg={PLUM} mark="UT">
              University of Toronto
            </Org>{" "}
            and I&rsquo;m president of{" "}
            <Org bg="#6a1d44" fg={BLOSSOM} mark="82">
              STL Robotics
            </Org>
            , where I&rsquo;ve written the robot code since 2022.
          </p>
          <p>
            First overall at{" "}
            <Org bg={BLOSSOM} fg={DEEP} mark="E">
              EurekaHacks
            </Org>
            , finalist at{" "}
            <Org bg={WHITE} fg={ROSE} mark="H">
              Hack the North
            </Org>
            . A rough{" "}
            <SectionLink className="text-white underline decoration-white/35 underline-offset-[0.22em] hover:decoration-white" id="work">
              timeline
            </SectionLink>{" "}
            is below, and how to{" "}
            <SectionLink className="text-white underline decoration-white/35 underline-offset-[0.22em] hover:decoration-white" id="contact">
              reach me
            </SectionLink>
            .
          </p>
        </div>
        <div className="-mt-[1rem] hidden sm:block">
          <Pager n={1} to="work" />
        </div>
      </div>

      <div className="min-h-[6rem] flex-1" />

      {/* Luke's lockup: the first name in light sans, the last in italic serif. */}
      <h1 className="relative z-10 mb-[2.4rem] flex flex-col leading-[0.82] md:mb-[3.2rem] md:flex-row md:items-end md:justify-between">
        <span
          className={`${css.rise} block font-sans text-[29vw] font-light tracking-[-0.06em] md:text-[min(19vw,40rem)]`}
          style={{ backgroundImage: "linear-gradient(180deg, #fffafc 30%, #e6d5de 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
        >
          Kevin
        </span>
        <span
          className={`${css.riseLate} block self-end pb-[0.06em] pr-[0.1em] font-serif-display text-[30vw] italic tracking-[-0.02em] md:text-[min(20vw,42rem)]`}
          style={{ backgroundImage: `linear-gradient(100deg, ${BLOSSOM} 10%, #fde3f0 55%, ${WHITE} 90%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
        >
          He.
        </span>
      </h1>

      <div className="relative z-10">
        <Bar
          left={
            <span className="inline-flex min-h-[4.4rem] items-center gap-[0.6rem]">
              <span aria-hidden="true">&rarr;</span> Toronto
            </span>
          }
          right={
            <nav aria-label="Sections" className="flex items-center gap-[1.6rem] md:gap-[3.2rem]">
              {[
                ["work", "Work"],
                ["info", "Info"],
                ["contact", "Contact"],
              ].map(([id, label]) => (
                <SectionLink className="inline-flex min-h-[4.4rem] items-center transition-colors hover:text-[#f9b9dc]" id={id} key={id}>
                  {label}
                </SectionLink>
              ))}
            </nav>
          }
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Work index                                                       */
/* ------------------------------------------------------------------ */

type Plates = Record<string, HTMLCanvasElement>;

/** The pictures that are words, drawn once the fonts are in. */
function usePlates(): Plates {
  const [plates, setPlates] = useState<Plates>({});
  useEffect(() => {
    let gone = false;
    const make = (): void => {
      if (gone) return;
      const out: Plates = {};
      for (const r of TIMELINE) {
        if (!("plate" in r.picture)) continue;
        const p = r.picture;
        out[p.plate] = textPlate(p.plate, {
          width: 1200,
          height: 900,
          font: p.serif ? `italic 400 {size}px ${serif.style.fontFamily}` : undefined,
        });
      }
      setPlates(out);
    };
    const family = serif.style.fontFamily;
    void Promise.all([document.fonts.load(`italic 400 40px ${family}`), document.fonts.ready]).then(make, make);
    return () => {
      gone = true;
    };
  }, []);
  return plates;
}

function Preview({ row, plates, compact = false }: { row: Row; plates: Plates; compact?: boolean }): JSX.Element {
  const source = "image" in row.picture ? row.picture.image : plates[row.picture.plate];
  return (
    <figure className={css.fade}>
      <div className="mb-[0.8rem] flex items-center justify-between font-sans text-[1rem] font-semibold uppercase tracking-[0.08em] text-white/55">
        <span className="tabular-nums">{row.month}</span>
        <span>Preview</span>
      </div>
      <div className={`relative overflow-hidden rounded-[0.4rem] border border-white/10 bg-[#1a0812]/70 ${compact ? "aspect-[16/10]" : "aspect-[4/3]"}`}>
        {source ? <BarPicture alt={`${row.title}, drawn in bars`} cell={compact ? 4 : 5} ink={BLOSSOM} source={source} /> : null}
      </div>
      <figcaption className="mt-[0.8rem] flex items-baseline justify-between gap-[1.2rem] font-sans text-[1.1rem] font-medium uppercase tracking-[0.06em]">
        <span className="text-white/85">{row.title}</span>
        {row.link ? (
          <a className="inline-flex min-h-[3.2rem] items-center text-white/55 underline-offset-4 transition-colors hover:text-white hover:underline" href={row.link.href} rel="noreferrer" target="_blank">
            {row.link.label} &nearr;
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}

function Work(): JSX.Element {
  const wide = useWide();
  const plates = usePlates();
  const [open, setOpen] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const active = hover ?? open ?? 0;

  const listRef = useRef<HTMLOListElement | null>(null);
  const headRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const brushRef = useRef<HTMLDivElement | null>(null);

  // Keep the brush centred on the active row's heading, also while the
  // rows open and close round it.
  const place = useCallback((): void => {
    const list = listRef.current;
    const head = headRefs.current[active];
    const brush = brushRef.current;
    if (!list || !head || !brush) return;
    const a = list.getBoundingClientRect();
    const b = head.getBoundingClientRect();
    brush.style.transform = `translate3d(0, ${(b.top - a.top + b.height / 2).toFixed(1)}px, 0) translateY(-50%)`;
  }, [active]);

  useLayoutEffect(() => {
    place();
    let raf = 0;
    const until = performance.now() + 700;
    const follow = (): void => {
      place();
      if (performance.now() < until) raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [place, open]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const sized = new ResizeObserver(() => place());
    sized.observe(list);
    return () => sized.disconnect();
  }, [place]);

  const toggle = (i: number): void => setOpen((o) => (o === i ? null : i));

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(TIMELINE.length - 1, i + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TIMELINE.length - 1;
    if (next < 0) return;
    e.preventDefault();
    headRefs.current[next]?.focus();
  };

  return (
    <section aria-labelledby="work-title" className="relative overflow-x-clip px-[2rem] pb-[8rem] pt-[10rem] md:px-[4.8rem] md:pt-[12rem]" id="work">
      {/* Luke's edge label with its hairline. */}
      <div aria-hidden="true" className="absolute right-[2.4rem] top-[12rem] hidden flex-col items-end gap-[1rem] lg:flex">
        <span className="font-sans text-[1rem] font-medium uppercase tracking-[0.08em] text-white/60">Index</span>
        <span className="h-[16rem] w-px bg-white/20" />
      </div>

      <div className="lg:flex lg:items-start lg:gap-[6vw] lg:pl-[8vw]">
        <div className="min-w-0 lg:max-w-[76rem] lg:flex-1">
          {/* Lance's heading: bold serif with the pager on the same line. */}
          <div className={serif.className}>
            <div className="flex items-center justify-between gap-[1.6rem]">
              <h2 className="text-[2.8rem] font-bold leading-none text-white sm:text-[3.6rem]" id="work-title">
                Timeline
              </h2>
              <Pager n={2} to="info" />
            </div>
            <p className="mt-[1.6rem] flex items-baseline gap-[1rem] text-[1.6rem] text-white/80 sm:text-[1.8rem]">
              <span>A rough timeline of what I&rsquo;ve done so far:</span>
              <Count>{String(TIMELINE.length).padStart(2, "0")}</Count>
            </p>
          </div>

          <ol className="relative mt-[3.2rem] border-t border-white/10" onMouseLeave={() => setHover(null)} ref={listRef}>
            {/* The brush, between the dim rows and the active one. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-[-2rem] top-0 z-[1] h-[22rem] w-[14.6rem] opacity-70 transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:right-[2%] sm:h-[30rem] sm:w-[20rem] sm:opacity-90 lg:right-[4%] lg:h-[34rem] lg:w-[22.6rem] motion-reduce:transition-none"
              ref={brushRef}
            >
              <Brush key={active} />
            </div>

            {TIMELINE.map((r, i) => {
              const isOpen = open === i;
              const isActive = active === i;
              const panel = `f02-facts-${i}`;
              return (
                <li className={`relative border-b border-white/10 ${isActive ? "z-[2]" : "z-0"}`} key={`${r.year}-${r.headline}`}>
                  <button
                    aria-controls={panel}
                    aria-expanded={isOpen}
                    className="group block w-full py-[1.4rem] text-left outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[0.4rem] focus-visible:outline-[#f9b9dc] sm:py-[1.6rem]"
                    onBlur={() => setHover(null)}
                    onClick={() => toggle(i)}
                    onFocus={() => setHover(i)}
                    onKeyDown={(e) => onKey(e, i)}
                    onMouseEnter={() => setHover(i)}
                    ref={(el) => {
                      headRefs.current[i] = el;
                    }}
                    type="button"
                  >
                    <span
                      className={`flex origin-left items-start gap-[0.6rem] font-sans text-[clamp(4.4rem,5.6vw,7.2rem)] font-light leading-[0.95] tracking-[-0.045em] transition-[color,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isActive ? "scale-100 text-white" : "scale-[0.86] text-white/25 group-hover:text-white/50"
                      }`}
                    >
                      <span className="whitespace-nowrap">{r.year}</span>
                      <span className="mt-[0.35em] text-[1rem] font-medium tracking-[0.02em] text-white/55">({String(r.facts.length).padStart(2, "0")})</span>
                    </span>
                    <span
                      className={`mt-[0.8rem] flex items-baseline gap-[0.8rem] text-[1.6rem] transition-colors duration-500 sm:text-[1.8rem] ${serif.className} ${
                        isActive ? "text-white" : "text-white/45"
                      }`}
                    >
                      <span>{r.headline}</span>
                      <span aria-hidden="true" className={`inline-block font-sans text-[1.4rem] text-white/60 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}>
                        +
                      </span>
                    </span>
                  </button>

                  {/* Lance's facts, one line each, opening in place. */}
                  <div
                    className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                    id={panel}
                    style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                  >
                    <div className="min-h-0 overflow-hidden" inert={!isOpen}>
                      <ul className={`max-w-[56rem] space-y-[0.6rem] pb-[2.4rem] text-[1.5rem] leading-[1.6] text-white/70 lg:max-w-[64%] ${serif.className}`}>
                        {r.facts.map((f) => (
                          <li className="flex gap-[1rem]" key={f}>
                            <span aria-hidden="true" className="mt-[0.9em] h-px w-[1.2rem] shrink-0 bg-[#f9b9dc]/60" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      {!wide && isOpen ? (
                        <div className="max-w-[36rem] pb-[2.8rem]">
                          <Preview compact plates={plates} row={r} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Luke's preview card, held beside the list while it scrolls. */}
        {wide ? (
          <aside aria-label="Preview" className="sticky top-[22vh] mt-[12rem] w-[clamp(24rem,24vw,34rem)] shrink-0">
            <Preview key={active} plates={plates} row={TIMELINE[active]} />
          </aside>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Info and contact                                                 */
/* ------------------------------------------------------------------ */

function Info(): JSX.Element {
  const top = (): void => {
    const el = document.getElementById("top");
    if (el) scrollToSection(el, 2);
  };
  return (
    <section aria-labelledby="info-title" className="relative isolate overflow-hidden" id="info">
      {/* The picture fades up out of the screen above, as the site's Ending does. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ maskImage: "linear-gradient(transparent, #000 30vh)", WebkitMaskImage: "linear-gradient(transparent, #000 30vh)" }}
      >
        <Poppy className="absolute inset-0 block h-full w-full" />
        {/* Lance's dark gradient behind the words: from the top on a phone, from the left on a wide screen. */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a0812]/90 via-[#1a0812]/70 to-[#1a0812]/45 lg:bg-gradient-to-r lg:from-[#1a0812]/90 lg:via-[#1a0812]/40 lg:to-transparent" />
      </div>

      <div className="flex min-h-[100svh] flex-col px-[2rem] pb-[5.6rem] pt-[10rem] md:px-[4.8rem] md:pb-[6.4rem] md:pt-[12rem]">
        <div className="lg:max-w-[62%] lg:pl-[8vw]">
          <div className={`flex items-center justify-between gap-[1.6rem] ${serif.className}`}>
            <h2 className="text-[2.8rem] font-bold leading-none text-white sm:text-[3.6rem]" id="info-title">
              Info
            </h2>
            <Pager n={3} to="top" up />
          </div>

          {/* The line, large, with Lance's rule on its left. */}
          <blockquote className={`mt-[4rem] border-l border-white/30 pl-[2rem] md:mt-[4.8rem] md:pl-[3.2rem] ${serif.className}`}>
            <p className="text-[clamp(3rem,4.6vw,6.8rem)] leading-[1.18] tracking-[-0.015em] text-white">
              I build systems that <em className="text-[#f9b9dc]">bring ideas to life.</em>
            </p>
          </blockquote>

          {/* Skills as rows of small capitals. */}
          <div className="mt-[5.6rem] md:mt-[6.4rem]">
            <div className="mb-[1.2rem] flex items-baseline gap-[0.8rem] font-sans text-[1rem] font-medium uppercase tracking-[0.08em] text-white/60">
              <span>What I work in</span>
              <Count>{String(SKILLS.length).padStart(2, "0")}</Count>
            </div>
            <dl className="border-t border-white/15">
              {SKILLS.map((s) => (
                <div className="grid gap-[0.4rem] border-b border-white/15 py-[1.4rem] md:grid-cols-[20rem_1fr] md:gap-[2.4rem]" key={s.label}>
                  <dt className="font-sans text-[1.1rem] font-medium uppercase tracking-[0.08em] text-white/50">{s.label}</dt>
                  <dd className="font-sans text-[1.2rem] font-medium uppercase leading-[1.7] tracking-[0.06em] text-white/90">{s.items}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Contact. */}
          <div className="mt-[6.4rem] md:mt-[7.2rem]" id="contact">
            <div className="mb-[1.2rem] font-sans text-[1rem] font-medium uppercase tracking-[0.08em] text-white/60">Contact</div>
            <a
              className="group inline-block max-w-full break-words font-sans text-[clamp(2.2rem,4vw,5.6rem)] font-light leading-[1.1] tracking-[-0.03em] text-white"
              href={`mailto:${EMAIL}`}
            >
              <span className="bg-[linear-gradient(#f9b9dc,#f9b9dc)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-[0.08em] transition-[background-size] duration-500 group-hover:bg-[length:100%_1px] group-focus-visible:bg-[length:100%_1px]">
                {EMAIL}
              </span>
            </a>
            <div className={`mt-[2rem] flex flex-wrap items-center gap-x-[2rem] text-[1.4rem] text-white/60 ${serif.className}`}>
              {SOCIALS.map((l) => (
                <a className="inline-flex min-h-[4.4rem] items-center underline underline-offset-4 transition-colors hover:text-white" href={l.href} key={l.label} rel="noreferrer" target="_blank">
                  {l.label.toLowerCase()}
                </a>
              ))}
              <a className="inline-flex min-h-[4.4rem] items-center underline underline-offset-4 transition-colors hover:text-white" href={`mailto:${EMAIL}`}>
                email
              </a>
            </div>
          </div>
        </div>

        <div className="min-h-[5.6rem] flex-1" />

        <Bar
          left={
            <button className="inline-flex min-h-[4.4rem] items-center gap-[0.6rem] uppercase transition-colors hover:text-[#f9b9dc]" onClick={top} type="button">
              <span aria-hidden="true">&uarr;</span> Top
            </button>
          }
          right={<span className="inline-flex min-h-[4.4rem] items-center">&copy; 2026 Kevin He</span>}
        />
      </div>
    </section>
  );
}

export default function F02(): JSX.Element {
  return (
    <main className="relative text-white">
      <Home />
      <Work />
      <Info />
    </main>
  );
}
