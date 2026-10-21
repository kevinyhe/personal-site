"use client";

import { Libre_Baskerville } from "next/font/google";
import { type CSSProperties, type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import BarPicture, { projectSource } from "@/components/below/barPicture";
import { projects } from "@/components/profile";

import { EMAIL, LINE, LINKS, ORGS, type Org, PAGES, TIMELINE, WORK_NOTE } from "./content";
import { createGarden, type Garden, type Point } from "./garden";

/**
 * Concept 08, "Garden": the whole site as four pages, one flower.
 *
 * The pages are lanceyan.com's: a serif text block beside a full-screen
 * picture drawn in diamonds, with "01 / 04 →" to turn the page, and the
 * wheel, a swipe or the arrow keys doing the same. Here the picture on
 * every page is the same sakura at a different stage (garden.ts):
 *
 *   01  Info      a bud, beside the intro, with lukebaffait.fr's huge
 *                 two-word name across the foot.
 *   02  Timeline  a branch. Rows open in place; every open row grows the
 *                 branch further.
 *   03  Work      full bloom. Pointing at a project sends petals off the
 *                 flower to it; choosing one opens it, its picture in bars.
 *   04  Contact   night. Petals fall on a dark ground; the one line, ruled,
 *                 and the links.
 *
 * Turning the page blows a gust across the picture while the words fade
 * across. Under all of it is lukebaffait.fr's footer: a hairline, then
 * small capitals. The page is in the address (#01 to #04).
 */

const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap" });

const N = PAGES.length;
const pad = (n: number): string => String(n).padStart(2, "0");
const parseHash = (h: string): number | null => {
  const m = /^#0?([1-4])$/.exec(h);
  return m ? Number(m[1]) - 1 : null;
};

/** The colour wash behind the diamonds, one per page; they crossfade. */
const SKIES: string[] = [
  "radial-gradient(60% 55% at 62% -4%, rgba(184,23,79,0.5), transparent 72%), radial-gradient(36% 40% at 88% 18%, rgba(249,185,220,0.18), transparent 70%)",
  "linear-gradient(rgba(26,8,18,0.35), rgba(26,8,18,0.35))",
  "radial-gradient(46% 60% at 74% 38%, rgba(249,185,220,0.12), transparent 72%), linear-gradient(rgba(26,8,18,0.25), rgba(26,8,18,0.25))",
  "linear-gradient(180deg, #000 0%, rgba(8,2,6,0.95) 55%, rgba(26,8,18,0.9) 100%)",
];

const LINK = "underline decoration-white/35 underline-offset-[0.22em] transition-colors hover:decoration-white focus-visible:decoration-white";

function Arrow({ className = "" }: { className?: string }): JSX.Element {
  return (
    <svg aria-hidden="true" className={`h-[1em] w-[1em] ${className}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/** An organisation, with its little square in front, as lanceyan names them. */
function OrgName({ org, children }: { org: Org; children: ReactNode }): JSX.Element {
  const chip = (
    <span
      aria-hidden="true"
      className="mr-[0.32em] inline-flex h-[1.05em] w-[1.05em] -translate-y-[0.08em] items-center justify-center rounded-[0.16em] align-middle font-sans text-[0.58em] font-bold not-italic leading-none"
      style={{ background: org.bg, color: org.fg, boxShadow: "inset 0 0 0 1px rgba(255,250,252,0.18)" }}
    >
      {org.mark}
    </span>
  );
  if (!org.href) {
    return (
      <span className="whitespace-nowrap text-white/95">
        {chip}
        {children}
      </span>
    );
  }
  return (
    <a className={`whitespace-nowrap text-white/95 ${LINK}`} href={org.href} rel="noreferrer" target="_blank">
      {chip}
      {children}
    </a>
  );
}

function Links(): JSX.Element {
  return (
    <ul className="mt-[3.6rem] flex flex-wrap gap-x-[2rem] text-[1.5rem] text-white/60 lg:mt-[4.4rem] lg:text-[1.5rem]">
      {LINKS.map((l) => (
        <li key={l.label}>
          <a
            className={`inline-flex min-h-[4.4rem] items-center hover:text-white ${LINK}`}
            href={l.href}
            rel={l.href.startsWith("mailto:") ? undefined : "noreferrer"}
            target={l.href.startsWith("mailto:") ? undefined : "_blank"}
          >
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function F08(): JSX.Element {
  const [page, setPage] = useState(0);
  const [prev, setPrev] = useState(0);
  const [dir, setDir] = useState(1);
  const [booted, setBooted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [open, setOpen] = useState<boolean[]>(() => TIMELINE.map((_, i) => i === 0));
  const [project, setProject] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gardenRef = useRef<Garden | null>(null);
  const pageRef = useRef(0);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const pagerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const detailTitleRef = useRef<HTMLHeadingElement | null>(null);
  const hoverRef = useRef<HTMLElement | null>(null);

  const go = useCallback((n: number, d?: number, instant = false): void => {
    const from = pageRef.current;
    const to = ((n % N) + N) % N;
    if (to === from && !instant) return;
    const way = d ?? (to > from ? 1 : -1);
    pageRef.current = to;
    setPrev(from);
    setDir(way);
    setPage(to);
    gardenRef.current?.go(to, way, instant);
    try {
      window.history.replaceState(window.history.state, "", `#${PAGES[to].id}`);
    } catch {
      /* the address is a convenience */
    }
    setAnnounce(`Page ${to + 1} of ${N}: ${PAGES[to].nav}`);
  }, []);

  // The field, and the page from the address.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(still);
    const garden = createGarden(canvas, still);
    gardenRef.current = garden;
    const start = parseHash(window.location.hash) ?? 0;
    pageRef.current = start;
    setPage(start);
    setPrev(start);
    garden?.go(start, 1, true);
    const id = requestAnimationFrame(() => setBooted(true));
    const sized = new ResizeObserver(() => garden?.resize());
    sized.observe(canvas);
    const onHash = (): void => {
      const n = parseHash(window.location.hash);
      if (n !== null) go(n);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelAnimationFrame(id);
      sized.disconnect();
      window.removeEventListener("hashchange", onHash);
      garden?.dispose();
      gardenRef.current = null;
    };
  }, [go]);

  // Each open row of the timeline grows the branch further.
  useEffect(() => {
    const count = open.filter(Boolean).length;
    gardenRef.current?.grow(0.08 + 0.92 * Math.pow(count / TIMELINE.length, 0.85));
  }, [open]);

  // Page 03's petals gather beside whatever is pointed at or open.
  const aimAt = useCallback((el: HTMLElement | null): void => {
    hoverRef.current = el;
    if (!el) {
      gardenRef.current?.aim(null);
      return;
    }
    gardenRef.current?.aim((): Point | null => {
      const t = hoverRef.current;
      if (!t || !t.isConnected) return null;
      const r = t.getBoundingClientRect();
      if (r.width === 0) return null;
      return { x: r.right, y: r.top + r.height / 2 };
    });
  }, []);
  useEffect(() => {
    if (page !== 2) aimAt(null);
  }, [page, aimAt]);

  // Wheel, swipe and keys turn the page. A text block taller than the
  // screen scrolls first; the page turns once it is at its end.
  useEffect(() => {
    let acc = 0;
    let accAt = 0;
    let lockUntil = 0;
    let panelAt = 0;
    const scrollable = (el: HTMLElement | null | undefined, d: number): boolean => {
      if (!el) return false;
      return d > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 1;
    };

    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey) return;
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (d === 0) return;
      const now = performance.now();
      const panel = panelRefs.current[pageRef.current];
      if (panel && panel.contains(e.target as Node) && Math.abs(e.deltaY) >= Math.abs(e.deltaX) && scrollable(panel, d)) {
        panelAt = now;
        return;
      }
      if (now - panelAt < 450) return; // the tail of a scroll that hit the end
      if (now < lockUntil) {
        lockUntil = Math.max(lockUntil, now + 280);
        return;
      }
      if (now - accAt > 220) acc = 0;
      accAt = now;
      acc += d;
      if (Math.abs(acc) > 46) {
        const to = pageRef.current + (acc > 0 ? 1 : -1);
        acc = 0;
        if (to < 0 || to >= N) return;
        lockUntil = now + 1100;
        go(to);
      }
    };

    let tx = 0;
    let ty = 0;
    let edgeDown = false;
    let edgeUp = false;
    const onStart = (e: TouchEvent): void => {
      const t = e.touches[0];
      tx = t.clientX;
      ty = t.clientY;
      const panel = panelRefs.current[pageRef.current];
      edgeDown = !scrollable(panel, 1);
      edgeUp = !scrollable(panel, -1);
    };
    const onEnd = (e: TouchEvent): void => {
      const t = e.changedTouches[0];
      const dx = t.clientX - tx;
      const dy = t.clientY - ty;
      const cur = pageRef.current;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        const to = cur + (dx < 0 ? 1 : -1);
        if (to >= 0 && to < N) go(to);
      } else if (Math.abs(dy) > 90 && Math.abs(dy) > Math.abs(dx) * 1.6) {
        if (dy < 0 && edgeDown && cur < N - 1) go(cur + 1);
        if (dy > 0 && edgeUp && cur > 0) go(cur - 1);
      }
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const cur = pageRef.current;
      if ((e.key === "ArrowRight" || e.key === "PageDown") && cur < N - 1) {
        e.preventDefault();
        go(cur + 1);
      } else if ((e.key === "ArrowLeft" || e.key === "PageUp") && cur > 0) {
        e.preventDefault();
        go(cur - 1);
      } else if (/^[1-4]$/.test(e.key)) {
        go(Number(e.key) - 1);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [go]);

  // When the page turns under the focus, hand it to the new page's arrow.
  useEffect(() => {
    if (!booted) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || panelRefs.current.some((p, i) => i !== page && p?.contains(active));
    if (lost) pagerRefs.current[page]?.focus({ preventScroll: true });
    panelRefs.current[page]?.scrollTo({ top: 0 });
    // Only when the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Esc closes an open project.
  useEffect(() => {
    if (project === null) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") closeProject();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openProject = (i: number): void => {
    setProject(i);
    requestAnimationFrame(() => {
      detailTitleRef.current?.focus({ preventScroll: true });
      aimAt(detailTitleRef.current);
    });
  };
  const closeProject = (): void => {
    const i = project;
    setProject(null);
    aimAt(null);
    requestAnimationFrame(() => {
      if (i !== null) rowRefs.current[i]?.focus({ preventScroll: true });
    });
  };

  const toggle = (i: number): void => setOpen((o) => o.map((v, k) => (k === i ? !v : v)));
  const allOpen = open.every(Boolean);

  /** How each text block comes and goes: the old one blown off with the
   *  wind, the new one rising into place after it. */
  const panelStyle = (i: number): CSSProperties => {
    const active = i === page;
    if (!booted) return { opacity: active ? 1 : 0, visibility: active ? "visible" : "hidden" };
    if (reduced) {
      return { opacity: active ? 1 : 0, visibility: active ? "visible" : "hidden", transition: active ? "opacity 0.3s" : "opacity 0.2s, visibility 0s 0.2s" };
    }
    if (active) {
      return {
        opacity: 1,
        transform: "none",
        visibility: "visible",
        transition: "opacity 0.8s ease 0.55s, transform 1.1s cubic-bezier(0.2,0.7,0.2,1) 0.5s",
      };
    }
    if (i === prev) {
      return {
        opacity: 0,
        transform: `translate3d(${dir * 6}rem,0,0)`,
        visibility: "hidden",
        transition: "opacity 0.5s ease, transform 0.9s cubic-bezier(0.5,0,0.8,0.4), visibility 0s 0.9s",
      };
    }
    return { opacity: 0, transform: "translate3d(0,2rem,0)", visibility: "hidden", transition: "none" };
  };

  const head = (i: number, title: ReactNode): JSX.Element => (
    <div className="mb-[2.6rem] flex items-center justify-between gap-[1.6rem] lg:mb-[3.2rem]">
      {title}
      <button
        aria-label={i === N - 1 ? `Back to page 1, ${PAGES[0].nav}` : `Next page, ${PAGES[i + 1].nav}`}
        className="group -mr-[0.8rem] inline-flex min-h-[4.4rem] shrink-0 items-center gap-[0.8rem] px-[0.8rem] text-[1.4rem] tracking-[0.06em] text-white/65 transition-colors hover:text-white lg:text-[1.5rem]"
        onClick={() => go(i + 1, 1)}
        ref={(el) => {
          pagerRefs.current[i] = el;
        }}
        type="button"
      >
        <span className="whitespace-nowrap tabular-nums">
          {pad(i + 1)} / {pad(N)}
        </span>
        <Arrow className="transition-transform duration-300 group-hover:translate-x-[0.3rem]" />
      </button>
    </div>
  );

  const name = (sub: string): JSX.Element => (
    <h2 className="text-[2.8rem] font-bold leading-none text-white lg:text-[3.8rem]">
      Kevin He<span className="sr-only">, {sub}</span>
    </h2>
  );

  const BLOCK = "w-full max-w-[60rem] lg:w-[min(60rem,42vw)]";
  const BODY = "text-[1.85rem] leading-[1.68] text-white/75 lg:text-[2.05rem]";

  const shown = project === null ? null : projects[project];
  const picture = useMemo(() => (shown && typeof document !== "undefined" ? projectSource(shown) : null), [shown]);

  return (
    <div className={serif.className}>
      {/* The sky behind the diamonds, one wash per page. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        {SKIES.map((bg, i) => (
          <div
            className="absolute inset-0 transition-opacity duration-[1400ms] ease-out motion-reduce:transition-none"
            key={i}
            style={{ background: bg, opacity: i === page ? 1 : 0 }}
          />
        ))}
      </div>

      {/* The one diamond field. Screen-blended, so its black is clear and
          the site's aurora shows between the diamonds. */}
      <canvas aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] block h-full w-full" ref={canvasRef} style={{ mixBlendMode: "screen" }} />

      {/* Shade under the words: from the left on a wide screen, from the top on a phone. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[2] bg-gradient-to-b from-black/70 via-black/35 to-transparent lg:bg-gradient-to-r lg:from-black/55 lg:via-black/15 lg:to-transparent"
      />

      <div className="fixed inset-0 z-[3] flex flex-col text-white">
        <p aria-live="polite" className="sr-only">
          {announce}
        </p>

        <main className="relative min-h-0 flex-1">
          {/* 01 Info: the bud. */}
          <section
            aria-labelledby="f08-name"
            className="absolute inset-0 overflow-y-auto overscroll-contain"
            data-lenis-prevent=""
            inert={page !== 0}
            ref={(el) => {
              panelRefs.current[0] = el;
            }}
            style={panelStyle(0)}
          >
            <div className="flex min-h-full flex-col">
              <div className="px-[2rem] pt-[5.6rem] sm:px-[4.8rem] lg:pl-[12rem] lg:pt-[10vh]">
              <div className={BLOCK}>
                {head(
                  0,
                  <p className="font-sans text-[1.3rem] font-medium uppercase tracking-[0.04em] text-white/60 lg:text-[1.4rem]">
                    <span className="mr-[0.6rem] text-[0.8em] text-white/40">(01)</span>Info
                  </p>,
                )}
                <div className={`space-y-[2.2rem] ${BODY}`}>
                  <p>
                    I’m co&#8209;founder and CTO of <OrgName org={ORGS.actually}>The Actually Company</OrgName>, a local-first AI speaking coach:
                    record a pitch and get timestamped notes on filler words, pacing and posture. I developed it in San Francisco in summer 2026 at{" "}
                    <OrgName org={ORGS.founders}>Founders, Inc.</OrgName>, one of 100 builders picked from 10,000+ applicants.
                  </p>
                  <p>
                    I study computer engineering at the <OrgName org={ORGS.uoft}>University of Toronto</OrgName>. I’m also president of{" "}
                    <OrgName org={ORGS.stl}>STL Robotics</OrgName>, where I’ve been captain and lead programmer of VEX team 82855Z since 2022.
                  </p>
                  <p>
                    I won first overall at <OrgName org={ORGS.eureka}>EurekaHacks</OrgName> and was a finalist at{" "}
                    <OrgName org={ORGS.htn}>Hack The North</OrgName>.
                  </p>
                </div>
                <Links />
              </div>
              </div>

              {/* lukebaffait.fr's lockup: the first name in the sans, the
                  last in the display serif's italic. No digits or ( ) - in
                  that serif: its demo cut draws a logo for them. */}
              <h1
                className="mt-auto flex items-end justify-between gap-[2vw] px-[2rem] pb-[2.4rem] pt-[4rem] sm:px-[4.8rem] leading-[0.8] tracking-[-0.045em] lg:pb-[3.2rem]"
                id="f08-name"
                style={{ fontSize: "min(17vw, 21vh)" }}
              >
                <span className="font-sans font-light text-[#f3e9ee]">Kevin</span>
                <span
                  className="bg-clip-text pr-[0.06em] font-serif-display italic text-transparent"
                  style={{ backgroundImage: "linear-gradient(100deg, #f9b9dc 10%, #fffafc 70%)", WebkitBackgroundClip: "text" }}
                >
                  He.
                </span>
              </h1>
            </div>
          </section>

          {/* 02 Timeline: the branch. */}
          <section
            aria-label="Timeline"
            className="absolute inset-0 overflow-y-auto overscroll-contain"
            data-lenis-prevent=""
            inert={page !== 1}
            ref={(el) => {
              panelRefs.current[1] = el;
            }}
            style={panelStyle(1)}
          >
            <div className="px-[2rem] pb-[6rem] pt-[5.6rem] sm:px-[4.8rem] lg:pl-[12rem] lg:pt-[10vh]">
              <div className={BLOCK}>
                {head(1, name("timeline"))}
                <div className="mb-[2.4rem] flex flex-wrap items-baseline justify-between gap-x-[1.6rem] gap-y-[0.4rem]">
                  <p className={BODY}>Here’s a rough timeline so far. Every row you open grows the branch.</p>
                  <button
                    className={`min-h-[4.4rem] text-[1.4rem] text-white/55 hover:text-white ${LINK}`}
                    onClick={() => setOpen(TIMELINE.map(() => !allOpen))}
                    type="button"
                  >
                    {allOpen ? "close all" : "open all"}
                  </button>
                </div>
                <ol className="border-t border-white/10">
                  {TIMELINE.map((row, i) => {
                    const on = open[i];
                    return (
                      <li className="border-b border-white/10" key={row.title}>
                        <button
                          aria-controls={`f08-row-${i}`}
                          aria-expanded={on}
                          className="group grid min-h-[4.6rem] w-full grid-cols-[6.4rem_1fr_auto] items-baseline gap-x-[1.2rem] py-[1.1rem] text-left lg:grid-cols-[9.6rem_1fr_auto]"
                          onClick={() => toggle(i)}
                          type="button"
                        >
                          <span className="text-[1.6rem] tabular-nums text-white/45 lg:text-[1.75rem]">{row.when}</span>
                          <span className="text-[1.7rem] leading-[1.45] text-white/90 transition-colors group-hover:text-white lg:text-[1.85rem]">{row.title}</span>
                          <svg
                            aria-hidden="true"
                            className={`h-[1.3rem] w-[1.3rem] self-center text-white/45 transition-transform duration-500 ${on ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                        <div
                          className="grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none"
                          id={`f08-row-${i}`}
                          style={{ gridTemplateRows: on ? "1fr" : "0fr" }}
                        >
                          <div className="overflow-hidden" inert={!on}>
                            <div className="grid grid-cols-[6.4rem_1fr] gap-x-[1.2rem] pb-[1.4rem] lg:grid-cols-[9.6rem_1fr]">
                              <div className="col-start-2 space-y-[0.4rem] pr-[2rem] text-[1.55rem] leading-[1.6] text-white/60 lg:text-[1.65rem]">
                                {row.lines.map((l) => (
                                  <p key={l}>{l}</p>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          </section>

          {/* 03 Work: full bloom. */}
          <section
            aria-label="Work"
            className="absolute inset-0 overflow-y-auto overscroll-contain"
            data-lenis-prevent=""
            inert={page !== 2}
            ref={(el) => {
              panelRefs.current[2] = el;
            }}
            style={panelStyle(2)}
          >
            <div className="px-[2rem] pb-[6rem] pt-[5.6rem] sm:px-[4.8rem] lg:pl-[12rem] lg:pt-[10vh]">
              <div className={BLOCK}>
                {head(2, name("work"))}
                {shown === null ? (
                  <div className="animate-[f08in_0.6s_ease-out] motion-reduce:animate-none">
                    <p className={`mb-[2rem] ${BODY}`}>
                      A few things I’ve built <span className="font-sans text-[0.6em] text-white/40">(05)</span>
                    </p>
                    <ul className="space-y-[0.2rem]">
                      {projects.map((p, i) => (
                        <li key={p.title}>
                          <button
                            className="group flex min-h-[4.4rem] w-full items-baseline gap-[1.2rem] py-[0.6rem] text-left"
                            onBlur={() => aimAt(null)}
                            onClick={() => openProject(i)}
                            onFocus={(e) => aimAt(e.currentTarget.querySelector<HTMLElement>("[data-aim]"))}
                            onMouseEnter={(e) => aimAt(e.currentTarget.querySelector<HTMLElement>("[data-aim]"))}
                            onMouseLeave={() => aimAt(null)}
                            ref={(el) => {
                              rowRefs.current[i] = el;
                            }}
                            type="button"
                          >
                            <span aria-hidden="true" className="text-[1.6rem] text-white/45 transition-colors group-hover:text-[#f9b9dc]">
                              •
                            </span>
                            <span className="text-[1.8rem] leading-[1.5] lg:text-[2rem]" data-aim="">
                              <span className="text-white/95 underline decoration-transparent underline-offset-[0.22em] transition-colors group-hover:decoration-white/50 group-focus-visible:decoration-white">
                                {p.title}
                              </span>
                              <span className="text-white/50"> — {WORK_NOTE[p.title] ?? p.tagline}</span>
                              <span className="ml-[0.8rem] font-sans text-[0.62em] tabular-nums text-white/35">({p.year})</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-[3.2rem] font-sans text-[1.3rem] uppercase tracking-[0.04em] text-white/40">Point at one to call the petals. Choose it to open it.</p>
                  </div>
                ) : (
                  <div aria-label={shown.title} className="animate-[f08in_0.6s_ease-out] motion-reduce:animate-none" role="region">
                    <button
                      className="-ml-[0.4rem] mb-[1.6rem] inline-flex min-h-[4.4rem] items-center gap-[0.8rem] px-[0.4rem] text-[1.5rem] text-white/60 transition-colors hover:text-white"
                      onClick={closeProject}
                      type="button"
                    >
                      <Arrow className="rotate-180" />
                      <span className={LINK}>all work</span>
                    </button>
                    <h3 className="text-[2.8rem] font-bold leading-[1.15] outline-none lg:text-[3.2rem]" ref={detailTitleRef} tabIndex={-1}>
                      {shown.title}
                    </h3>
                    <p className="mt-[0.8rem] text-[1.75rem] leading-[1.6] text-white/70 lg:text-[1.9rem]">{shown.tagline}</p>
                    <figure className="mt-[2.4rem]">
                      <figcaption className="mb-[0.8rem] flex justify-between font-sans text-[1.1rem] font-medium uppercase tracking-[0.06em] text-white/45">
                        <span>({shown.year})</span>
                        <span>{shown.award ?? "Preview"}</span>
                      </figcaption>
                      <div className="aspect-[16/10] w-full overflow-hidden border border-white/10 bg-black/30">
                        {picture && <BarPicture alt={`${shown.title}, drawn in bars`} cell={5} source={picture} />}
                      </div>
                    </figure>
                    <ul className="mt-[2.4rem] space-y-[1rem] text-[1.6rem] leading-[1.62] text-white/65 lg:text-[1.7rem]">
                      {shown.bullets.map((b) => (
                        <li className="border-l border-white/20 pl-[1.4rem]" key={b}>
                          {b}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-[2rem] font-sans text-[1.2rem] uppercase tracking-[0.05em] text-white/45">{shown.stack.join("  ·  ")}</p>
                    <div className="mt-[1.6rem] flex flex-wrap gap-x-[2rem] text-[1.5rem] text-white/65">
                      {shown.href && (
                        <a className={`inline-flex min-h-[4.4rem] items-center hover:text-white ${LINK}`} href={shown.href} rel="noreferrer" target="_blank">
                          {shown.href.includes("github.com") ? "code" : shown.href.includes("devpost") ? "devpost" : "site"}
                        </a>
                      )}
                      {shown.code && (
                        <a className={`inline-flex min-h-[4.4rem] items-center hover:text-white ${LINK}`} href={shown.code} rel="noreferrer" target="_blank">
                          code
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 04 Contact: night. */}
          <section
            aria-label="Contact"
            className="absolute inset-0 overflow-y-auto overscroll-contain"
            data-lenis-prevent=""
            inert={page !== 3}
            ref={(el) => {
              panelRefs.current[3] = el;
            }}
            style={panelStyle(3)}
          >
            <div className="px-[2rem] pb-[6rem] pt-[5.6rem] sm:px-[4.8rem] lg:pl-[12rem] lg:pt-[10vh]">
              <div className={BLOCK}>
                {head(3, name("contact"))}
                <div className={`space-y-[2.4rem] ${BODY}`}>
                  <p>Here’s what I do, in one line:</p>
                  <blockquote className="border-l border-white/30 pl-[1.6rem] italic text-white/90">“{LINE}”</blockquote>
                  <p>
                    I’m in Toronto. Write to me at{" "}
                    <a className={`break-all text-white/95 sm:break-normal ${LINK}`} href={`mailto:${EMAIL}`}>
                      {EMAIL}
                    </a>
                    .
                  </p>
                </div>
                <Links />
              </div>
            </div>
          </section>
        </main>

        {/* lukebaffait.fr's footer: a hairline, then small capitals. */}
        <footer className="relative mx-[2rem] border-t border-white/25 pb-[5.2rem] pt-[1.2rem] font-sans text-[1.3rem] font-medium uppercase tracking-[0.02em] text-white/80 sm:mx-[4.8rem] lg:pb-[5.6rem] lg:pt-[1.6rem] lg:text-[1.7rem]">
          <div className="flex items-center justify-between gap-[1.6rem]">
            <p className="flex min-h-[4.4rem] items-center gap-[0.6rem] whitespace-nowrap">
              <Arrow className="h-[0.95em] w-[0.95em]" />
              <span className="tabular-nums">{PAGES[page].id}</span>
              <span className="text-white/50">{PAGES[page].stage}</span>
            </p>
            <ul className="hidden items-center gap-[1.6rem] text-white/70 lg:flex">
              {LINKS.slice(0, 3).map((l, i) => (
                <li className="flex items-center gap-[1.6rem]" key={l.label}>
                  {i > 0 && (
                    <span aria-hidden="true" className="text-white/30">
                      /
                    </span>
                  )}
                  <a className="inline-flex min-h-[4.4rem] items-center transition-colors hover:text-white" href={l.href} rel="noreferrer" target="_blank">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <nav aria-label="Pages">
              <ul className="flex items-center gap-[1.4rem] sm:gap-[2.4rem]">
                {PAGES.map((p, i) => (
                  <li key={p.id}>
                    <button
                      aria-current={i === page ? "page" : undefined}
                      className={`inline-flex min-h-[4.4rem] items-center uppercase transition-colors ${i === page ? "text-white" : "text-white/50 hover:text-white"}`}
                      onClick={() => go(i)}
                      type="button"
                    >
                      <span className={i === page ? "border-b border-white/70 pb-[0.1rem]" : ""}>{p.nav}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </footer>
      </div>

      <style>{`@keyframes f08in { from { opacity: 0; transform: translateY(1rem); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
