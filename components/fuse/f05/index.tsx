"use client";

import { Libre_Baskerville } from "next/font/google";
import { type JSX, type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { elsewhere, EMAIL } from "@/components/siteContent";

import { ALONG_THE_WAY, LINE, type Org, ORGS, SECTIONS, TIMELINE, WORK } from "./content";
import { CARD, createPicture, type Picture, type PictureKey } from "./picture";

/**
 * Concept 05, "Diptych": the screen split in two.
 *
 * Left, 42%: lanceyan.com's text, scrolling, on near-black plum. Its serif
 * block (Libre Baskerville): the name with "01 / 04" that follows the
 * section you are reading, short first-person paragraphs with each
 * organisation's tiny monogram chip, the timeline by year with rows that
 * open, the work list, the "books" list (here, what the work won), the
 * ruled italic quote, the lowercase underlined links.
 *
 * Right, 58%: pinned, and pure lukebaffait.fr. Rose and blossom glow
 * drifting over a diamond picture (picture.ts) that changes with the
 * section: the hero's tree, then clouds, then the projects, then the night
 * peak with birds. Hovering or focusing a work row puts that project's
 * picture up with a "PREVIEW / year" label. Across the foot, the huge
 * "Kevin He." (Inter light, italic display serif with a blossom to white
 * gradient), and Luke's footer bar under a hairline.
 *
 * On a phone the two halves stack: the picture pinned across the top half,
 * the text scrolling under it.
 */

const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap" });

const BASE: PictureKey[] = ["tree", "clouds", "p0", "peak"];
const pad2 = (n: number): string => String(n).padStart(2, "0");
const reducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isPhone = (): boolean => typeof window !== "undefined" && window.innerWidth < 1024;

const FOCUS = "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[#f9b9dc]";
const LINK = `underline decoration-white/35 underline-offset-[0.22em] transition-colors hover:decoration-white ${FOCUS}`;

const CHIP: Record<Org["tone"], string> = {
  rose: "bg-[#b8174f] text-[#fffafc]",
  blossom: "bg-[#f9b9dc] text-[#2a0d1e]",
  white: "bg-[#fffafc] text-[#2a0d1e]",
  plum: "bg-[#2a0d1e] text-[#f9b9dc] ring-1 ring-inset ring-[#f9b9dc]/40",
};

/** An organisation named inline after its tiny monogram square, as lanceyan sets them. */
function OrgName({ org }: { org: Org }): JSX.Element {
  const chip = (
    <span
      aria-hidden="true"
      className={`mr-[0.3em] inline-flex h-[1.05em] w-[1.05em] translate-y-[0.12em] items-center justify-center rounded-[0.12em] align-baseline font-sans text-[0.58em] font-bold leading-none ${CHIP[org.tone]}`}
    >
      {org.mark}
    </span>
  );
  return (
    <span className="whitespace-nowrap">
      {chip}
      {org.href ? (
        <a className={`text-white ${LINK}`} href={org.href} rel="noreferrer" target="_blank">
          {org.name}
        </a>
      ) : (
        <span className="text-white">{org.name}</span>
      )}
    </span>
  );
}

/** A section's small Luke label: "(02) Timeline". */
function Label({ i, children }: { i: number; children: ReactNode }): JSX.Element {
  return (
    <h2 className="mb-[2.8rem] flex items-baseline gap-[0.8rem] font-sans text-[1.2rem] font-medium uppercase tracking-[0.12em] text-white/45">
      <span className="tabular-nums">({pad2(i + 1)})</span>
      <span>{children}</span>
    </h2>
  );
}

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={`h-[1.4rem] w-[1.4rem] shrink-0 text-white/50 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Luke's red brush stroke, here in rose, drawn on under a hovered work title. */
function Brush(): JSX.Element {
  return (
    <svg aria-hidden="true" className="f05-brush pointer-events-none absolute -inset-x-[0.4em] -bottom-[0.35em] h-[0.9em] w-[calc(100%+0.8em)]" preserveAspectRatio="none" viewBox="0 0 200 20">
      <path d="M4 13 C 40 6, 90 17, 130 9 S 186 8, 196 12" fill="none" pathLength={1} stroke="#b8174f" strokeLinecap="round" strokeWidth="7" />
    </svg>
  );
}

export default function F05(): JSX.Element {
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [cycle, setCycle] = useState(0);
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const [still, setStill] = useState(false);
  const [noGl, setNoGl] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const pictureRef = useRef<Picture | null>(null);

  // The picture: one dotField canvas for the whole page.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reduced = reducedMotion();
    setStill(reduced);
    const pic = createPicture(canvas, reduced, isPhone());
    if (!pic) {
      setNoGl(true);
      return undefined;
    }
    pictureRef.current = pic;
    return () => {
      pic.dispose();
      pictureRef.current = null;
    };
  }, []);

  // Which section you are reading: the last whose top has passed a line
  // 45% down the screen (on a phone, 72%: the text starts under the picture).
  useEffect(() => {
    let raf = 0;
    const measure = (): void => {
      raf = 0;
      const line = window.innerHeight * (isPhone() ? 0.72 : 0.45);
      let k = 0;
      sectionRefs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) k = i;
      });
      const end = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      setActive(end ? SECTIONS.length - 1 : k);
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // In the work section with nothing hovered, the projects take turns.
  useEffect(() => {
    if (active !== 2 || hover !== null || still) return undefined;
    const id = window.setInterval(() => setCycle((c) => (c + 1) % WORK.length), 4800);
    return () => window.clearInterval(id);
  }, [active, hover, still]);

  const project = hover ?? (active === 2 ? cycle : null);
  const target: PictureKey = project !== null ? `p${project}` : BASE[active];
  useEffect(() => {
    pictureRef.current?.show(target);
  }, [target]);

  const goTo = useCallback((i: number): void => {
    const el = sectionRefs.current[i];
    if (!el) return;
    const panel = panelRef.current;
    const head = headerRef.current;
    // Clear what covers the top: the pinned picture on a phone, the held name on a desktop.
    const offset = isPhone() ? (panel?.offsetHeight ?? 0) : (head?.offsetHeight ?? 0) * 0.5;
    const top = i === 0 ? 0 : el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" });
  }, []);

  const jump = (i: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    goTo(i);
  };

  const toggle = (i: number): void =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const links = (["X", "LinkedIn", "GitHub"] as const)
    .map((label) => elsewhere.find((l) => l.label === label))
    .filter((l): l is (typeof elsewhere)[number] => Boolean(l));

  const shown = project !== null ? WORK[project] : null;
  const counter = `${pad2(active + 1)} / ${pad2(SECTIONS.length)}`;

  return (
    <main className="relative min-h-screen text-[#fffafc] lg:flex lg:items-start">
      <style href="f05" precedence="default">{`
        @keyframes f05-drift-a { 0%,100% { transform: translate3d(-6%, -4%, 0) scale(1); } 50% { transform: translate3d(8%, 6%, 0) scale(1.12); } }
        @keyframes f05-drift-b { 0%,100% { transform: translate3d(6%, 2%, 0) scale(1.05); } 50% { transform: translate3d(-10%, 8%, 0) scale(0.92); } }
        @keyframes f05-drift-c { 0%,100% { transform: translate3d(0, 6%, 0) scale(0.95); } 50% { transform: translate3d(-6%, -6%, 0) scale(1.1); } }
        .f05-blob-a { animation: f05-drift-a 38s ease-in-out infinite; }
        .f05-blob-b { animation: f05-drift-b 51s ease-in-out infinite; }
        .f05-blob-c { animation: f05-drift-c 44s ease-in-out infinite; }
        .f05-brush path { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 0.55s cubic-bezier(0.65, 0, 0.35, 1); }
        .f05-row:hover .f05-brush path, .f05-row:focus-visible .f05-brush path { stroke-dashoffset: 0; }
        .f05-list:hover .f05-row:not(:hover) { opacity: 0.42; }
        .f05-fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.4s cubic-bezier(0.22, 1, 0.36, 1); }
        .f05-fold[data-open] { grid-template-rows: 1fr; }
        @media (prefers-reduced-motion: reduce) {
          .f05-blob-a, .f05-blob-b, .f05-blob-c { animation: none; }
          .f05-brush path, .f05-fold { transition: none; }
        }
      `}</style>

      {/* ── Right: Luke's panel. First in the DOM so it stacks on top on a phone. ── */}
      <aside
        aria-label="Picture"
        className="sticky top-0 z-20 h-[52svh] w-full self-start overflow-hidden bg-[#0c0408] lg:order-2 lg:h-screen lg:w-[58%]"
        ref={panelRef}
      >
        <canvas aria-hidden="true" className={`absolute inset-0 block h-full w-full ${noGl ? "hidden" : ""}`} ref={canvasRef} />

        {/* The foot darkens so the name reads over any picture. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-[#0c0408] via-[#0c0408]/70 to-transparent" />

        {/* Luke's glow: three blurred lights, drifting, laid over the dots. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 mix-blend-screen">
          <div className="f05-blob-a absolute -top-[22%] left-[14%] h-[70%] w-[78%] rounded-full opacity-[0.62]" style={{ background: "radial-gradient(closest-side, rgba(184,23,79,0.95), rgba(184,23,79,0.35) 55%, transparent)" }} />
          <div className="f05-blob-b absolute -top-[14%] right-[-12%] h-[52%] w-[52%] rounded-full opacity-[0.5]" style={{ background: "radial-gradient(closest-side, rgba(249,185,220,0.8), rgba(249,185,220,0.2) 60%, transparent)" }} />
          <div className="f05-blob-c absolute left-[-18%] top-[18%] h-[60%] w-[54%] rounded-full opacity-[0.4]" style={{ background: "radial-gradient(closest-side, rgba(106,29,68,0.95), transparent)" }} />
        </div>

        {/* Top: Luke's two-line tagline, and which section this is. */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-end gap-[2.4rem] lg:justify-between px-[2.4rem] pt-[2.4rem] lg:px-[3.6rem] lg:pt-[3.6rem]">
          <p className="hidden max-w-[34rem] font-sans lg:block text-[1.3rem] leading-[1.45] text-white/85 lg:text-[1.5rem]">
            Engineer in Toronto,{" "}
            <em className="font-serif-display text-[1.12em] italic text-white">building systems that bring ideas to life</em>
          </p>
          <p aria-live="polite" className="shrink-0 font-sans text-[1.2rem] font-medium uppercase tracking-[0.12em] text-white/70">
            <span className="tabular-nums">({pad2(active + 1)})</span> {SECTIONS[active].label}
          </p>
        </div>

        {/* The PREVIEW card's label and corner marks, over the dotted card. */}
        <div
          aria-hidden={shown ? undefined : true}
          className={`pointer-events-none absolute transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`}
          style={{ left: `${CARD.x * 100}%`, top: `${CARD.y * 100}%`, width: `${CARD.w * 100}%`, height: `${CARD.h * 100}%` }}
        >
          <div className="absolute inset-x-0 bottom-full mb-[0.8rem] flex items-baseline justify-between gap-[1.6rem] font-sans text-[1.1rem] font-medium uppercase tracking-[0.12em] text-white/75">
            <span className="truncate">{shown?.title ?? ""}</span>
            <span className="shrink-0 tabular-nums">Preview / {shown?.year ?? ""}</span>
          </div>
          {(["left-0 top-0 -translate-x-1/2 -translate-y-1/2", "right-0 top-0 translate-x-1/2 -translate-y-1/2", "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", "right-0 bottom-0 translate-x-1/2 translate-y-1/2"] as const).map((pos) => (
            <span className={`absolute ${pos} font-sans text-[1.4rem] font-light leading-none text-white/60`} key={pos}>
              +
            </span>
          ))}
        </div>

        {/* Foot: the lockup, a hairline, the footer bar. */}
        <div className="absolute inset-x-0 bottom-0 px-[2.4rem] pb-[1.6rem] lg:px-[3.6rem] lg:pb-[2.4rem]">
          <h1 className="flex items-baseline justify-between leading-[0.86] text-[length:min(21vw,11svh)] lg:text-[length:min(12.4vw,25vh)]">
            <span className="font-sans font-light tracking-[-0.045em] text-white/95">Kevin</span>
            <span
              className="inline-block bg-clip-text pr-[0.1em] font-serif-display italic text-transparent"
              style={{ backgroundImage: "linear-gradient(105deg, #f9b9dc 0%, #fbd3e8 45%, #fffafc 80%)", WebkitBackgroundClip: "text" }}
            >
              He.
            </span>
          </h1>
          <div className="mt-[1.6rem] border-t border-white/30 pt-[1.2rem] lg:mt-[2.4rem] lg:pt-[1.6rem]">
            <div className="flex items-center justify-between gap-[1.6rem] font-sans text-[1.2rem] font-medium uppercase tracking-[0.06em] text-white/85 lg:text-[1.4rem] xl:grid xl:grid-cols-[1fr_auto_1fr]">
              <span className="whitespace-nowrap">&rarr; Toronto</span>
              <span className="hidden items-center gap-[1.4rem] xl:flex">
                {links.map((l, i) => (
                  <span className="flex items-center gap-[1.4rem]" key={l.label}>
                    {i > 0 && <span className="text-white/30">/</span>}
                    <a className={`inline-flex min-h-[3.2rem] items-center transition-colors hover:text-[#f9b9dc] ${FOCUS}`} href={l.href} rel="noreferrer" target="_blank">
                      {l.label}
                    </a>
                  </span>
                ))}
              </span>
              <span className="lg:hidden tabular-nums text-white/70">{counter}</span>
              <nav aria-label="Sections" className="hidden items-center justify-end gap-[2rem] lg:flex">
                {SECTIONS.map((s, i) => (
                  <a
                    aria-current={i === active ? "true" : undefined}
                    className={`inline-flex min-h-[3.2rem] items-center transition-colors ${i === active ? "text-white" : "text-white/45 hover:text-white"} ${FOCUS}`}
                    href={`#${s.id}`}
                    key={s.id}
                    onClick={jump(i)}
                  >
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Left: Lance's column. ── */}
      <div className={`relative z-10 w-full bg-[#14070f]/95 lg:order-1 lg:w-[42%] ${serif.className}`}>
        {/* The name and the section counter, held at the top while you read. */}
        <header ref={headerRef} className="z-10 bg-gradient-to-b from-[#14070f] from-60% to-transparent px-[2.4rem] pb-[2.4rem] pt-[4rem] lg:sticky lg:top-0 lg:px-[6.4rem] lg:pt-[9.6rem] xl:pl-[9.6rem]">
          <div className="flex max-w-[56rem] items-center justify-between gap-[1.6rem]">
            <p className="text-[3.2rem] font-bold leading-none tracking-[-0.01em] lg:text-[3.6rem]">Kevin He</p>
            <button
              aria-label={`Section ${active + 1} of ${SECTIONS.length}. ${active === SECTIONS.length - 1 ? "Back to the top" : "Next section"}`}
              className={`inline-flex min-h-[4.4rem] items-center gap-[0.8rem] px-[0.4rem] text-[1.4rem] tracking-[0.06em] text-white/65 transition-colors hover:text-white ${FOCUS}`}
              onClick={() => goTo((active + 1) % SECTIONS.length)}
              type="button"
            >
              <span className="whitespace-nowrap tabular-nums">{counter}</span>
              <svg aria-hidden="true" className={`h-[1.6rem] w-[1.6rem] transition-transform duration-300 ${active === SECTIONS.length - 1 ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>
        </header>

        <div className="px-[2.4rem] pb-[12rem] lg:px-[6.4rem] lg:pb-[24vh] xl:pl-[9.6rem]">
          <div className="max-w-[56rem] text-[1.9rem] leading-[1.65] text-white/75 lg:text-[2rem]">
            {/* 01 Info */}
            <section className="py-[4rem] lg:min-h-[78vh] lg:pt-[6rem]" id={SECTIONS[0].id} ref={(el) => { sectionRefs.current[0] = el; }}>
              <Label i={0}>{SECTIONS[0].label}</Label>
              <div className="space-y-[2.4rem]">
                <p>
                  I&rsquo;m the co&#8209;founder and CTO of <OrgName org={ORGS.actually} />, a local&#8209;first AI speaking coach. I built it in San Francisco as a Founder in Residence at <OrgName org={ORGS.founders} />, one of 100 picked from 10,000+ applicants.
                </p>
                <p>
                  I study computer engineering at <OrgName org={ORGS.uoft} />. Before that I was president of <OrgName org={ORGS.stl} /> and lead programmer for VEX team 82855Z.
                </p>
                <p>
                  On the side:{" "}
                  <a className={`text-white ${LINK}`} href={`#${SECTIONS[1].id}`} onClick={jump(1)}>robot controls</a> behind a world&#8209;record autonomous routine,{" "}
                  <a className={`text-white ${LINK}`} href={`#${SECTIONS[2].id}`} onClick={jump(2)}>a Nerf blaster</a> wired into a first&#8209;person shooter, and{" "}
                  <a className={`text-white ${LINK}`} href={`#${SECTIONS[2].id}`} onClick={jump(2)}>a boxing game</a> you play by swinging your phone.
                </p>
              </div>
              <Links className="mt-[4.8rem]" links={links} />
            </section>

            {/* 02 Timeline */}
            <section className="py-[4rem] lg:min-h-[100vh] lg:py-[8rem]" id={SECTIONS[1].id} ref={(el) => { sectionRefs.current[1] = el; }}>
              <Label i={1}>{SECTIONS[1].label}</Label>
              <p className="mb-[2.4rem]">
                A rough timeline of what I&rsquo;ve done so far <span className="font-sans text-[1.1rem] tabular-nums text-white/40">({pad2(TIMELINE.length)})</span>
              </p>
              <ul className="border-t border-white/10">
                {TIMELINE.map((row, i) => {
                  const isOpen = open.has(i);
                  return (
                    <li className="border-b border-white/10" key={`${row.year}-${row.title}`}>
                      <button
                        aria-controls={`f05-tl-${i}`}
                        aria-expanded={isOpen}
                        className={`grid w-full grid-cols-[5.6rem_1fr_auto] items-baseline gap-x-[1.6rem] py-[1.4rem] text-left lg:grid-cols-[8rem_1fr_auto] ${FOCUS}`}
                        onClick={() => toggle(i)}
                        type="button"
                      >
                        <span className="text-[1.6rem] tabular-nums text-white/40 lg:text-[1.7rem]">{row.year}</span>
                        <span className={`text-[1.7rem] transition-colors lg:text-[1.8rem] ${isOpen ? "text-white" : "text-white/85"}`}>{row.title}</span>
                        <span className="self-center"><Chevron open={isOpen} /></span>
                      </button>
                      <div className="f05-fold" data-open={isOpen ? "" : undefined} id={`f05-tl-${i}`}>
                        <div className="min-h-0 overflow-hidden">
                          <ul className="space-y-[0.6rem] pb-[1.8rem] pl-[7.2rem] text-[1.5rem] leading-[1.6] text-white/55 lg:pl-[9.6rem] lg:text-[1.6rem]" inert={!isOpen}>
                            {row.details.map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 03 Work */}
            <section className="py-[4rem] lg:min-h-[100vh] lg:py-[8rem]" id={SECTIONS[2].id} ref={(el) => { sectionRefs.current[2] = el; }}>
              <Label i={2}>{SECTIONS[2].label}</Label>
              <p className="mb-[2.4rem]">
                Things I&rsquo;ve built <span className="font-sans text-[1.1rem] tabular-nums text-white/40">({pad2(WORK.length)})</span>
              </p>
              <ul className="f05-list border-t border-white/10">
                {WORK.map((w, i) => {
                  const lit = project === i;
                  const inner = (
                    <>
                      <span className="pt-[0.2rem] text-[1.5rem] tabular-nums text-white/40 lg:text-[1.6rem]">{w.year.replace("–", "–​")}</span>
                      <span className="min-w-0">
                        <span className={`relative inline-block text-[2.1rem] leading-[1.3] transition-colors lg:text-[2.4rem] ${lit ? "text-white" : "text-white/85"}`}>
                          <Brush />
                          <span className="relative">{w.title}</span>
                        </span>
                        <span className="mt-[0.6rem] block text-[1.5rem] leading-[1.55] text-white/50 lg:text-[1.6rem]">{w.tagline}</span>
                        {w.award && <span className="mt-[0.6rem] block font-sans text-[1.1rem] font-medium uppercase tracking-[0.1em] text-[#f9b9dc]/80">{w.award}</span>}
                      </span>
                      <span aria-hidden="true" className="pt-[0.6rem] font-sans text-[1.4rem] text-white/40">{w.href ? "↗" : ""}</span>
                    </>
                  );
                  const cls = `f05-row group grid grid-cols-[5.6rem_1fr_auto] items-start gap-x-[1.6rem] py-[2rem] transition-opacity duration-300 lg:grid-cols-[8rem_1fr_auto] ${FOCUS}`;
                  const handlers = {
                    onBlur: () => setHover(null),
                    onFocus: () => setHover(i),
                    onMouseEnter: () => setHover(i),
                    onMouseLeave: () => setHover(null),
                  };
                  return (
                    <li className="border-b border-white/10" key={w.title}>
                      {w.href ? (
                        <a className={cls} href={w.href} rel="noreferrer" target="_blank" {...handlers}>
                          {inner}
                        </a>
                      ) : (
                        <div className={cls} tabIndex={0} {...handlers}>
                          {inner}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="mb-[1.6rem] mt-[6.4rem]">
                And a few things along the way <span className="font-sans text-[1.1rem] tabular-nums text-white/40">({pad2(ALONG_THE_WAY.length)})</span>
              </p>
              <ul className="space-y-[0.8rem] text-[1.7rem] lg:text-[1.8rem]">
                {ALONG_THE_WAY.map((a) => (
                  <li key={a.title}>
                    <span className="italic text-white/90">{a.title}</span> <span className="text-white/45">&mdash; {a.year}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 04 Contact */}
            <section className="py-[4rem] lg:min-h-[80vh] lg:py-[8rem]" id={SECTIONS[3].id} ref={(el) => { sectionRefs.current[3] = el; }}>
              <Label i={3}>{SECTIONS[3].label}</Label>
              <p>I&rsquo;m based in Toronto. If it all had to fit in one line:</p>
              <blockquote className="my-[3.2rem] border-l border-white/30 pl-[2rem] text-[2.1rem] italic leading-[1.55] text-white/95 lg:text-[2.2rem]">
                &ldquo;{LINE}&rdquo;
              </blockquote>
              <p>
                Write to me at{" "}
                <a className={`break-all text-white ${LINK}`} href={`mailto:${EMAIL}`}>
                  {EMAIL}
                </a>
                .
              </p>
              <Links className="mt-[4.8rem]" links={links} />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

/** lanceyan's links: lowercase, small, underlined. */
function Links({ links, className = "" }: { links: { label: string; href: string }[]; className?: string }): JSX.Element {
  return (
    <div className={`flex flex-wrap items-center gap-x-[2rem] gap-y-[0.4rem] text-[1.4rem] text-white/55 ${className}`}>
      {links.map((l) => (
        <a className={`inline-flex min-h-[4.4rem] items-center ${LINK} hover:text-white`} href={l.href} key={l.label} rel="noreferrer" target="_blank">
          {l.label.toLowerCase()}
        </a>
      ))}
      <a className={`inline-flex min-h-[4.4rem] items-center ${LINK} hover:text-white`} href={`mailto:${EMAIL}`}>
        email
      </a>
    </div>
  );
}
