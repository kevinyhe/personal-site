"use client";

import { type JSX, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Libre_Baskerville } from "next/font/google";

import BarPicture, { type BarSource } from "@/components/below/barPicture";
import type { Project } from "@/components/profile";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { CHIPS, type Chip, PAGE_COUNT, PAGES, SKILLS, TIMELINE } from "./content";

/**
 * The text panels that float along the strip, set the way lanceyan.com
 * sets its pages: the bold name with the page count and an arrow beside
 * it, short serif paragraphs, organisations after tiny monogram squares,
 * a timeline whose rows open, a quote with a rule down its left, and
 * small lowercase underlined links. Above each block, lukebaffait's small
 * "(03)" label names the section.
 */

export const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap" });

export const pad2 = (n: number): string => String(n).padStart(2, "0");

const LINK = "underline decoration-white/40 underline-offset-[0.25em] transition-colors hover:text-white hover:decoration-white focus-visible:text-white";
const RING = "rounded-[0.2rem] outline-none focus-visible:ring-1 focus-visible:ring-[#f9b9dc] focus-visible:ring-offset-4 focus-visible:ring-offset-[#1a0812]";

type Go = (page: number) => void;

function Arrow({ up = false }: { up?: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" className="h-[1.6rem] w-[1.6rem]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" style={up ? { transform: "rotate(-90deg)" } : undefined} viewBox="0 0 24 24">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/** lanceyan's header: the name in bold, "03 / 06 →" on the right. */
function Header({ page, go, label }: { page: number; go: Go; label: string }): JSX.Element {
  const last = page >= PAGE_COUNT;
  return (
    <>
      <div className="mb-[2.4rem] flex items-center justify-between gap-[1.6rem]">
        <p aria-hidden="true" className="text-[3.4rem] font-bold leading-none text-[#fffafc]">
          Kevin He
        </p>
        <button
          aria-label={last ? "Back to the start" : `Next: ${PAGES[page]}`}
          className={`-mr-[0.8rem] inline-flex min-h-[4.4rem] items-center gap-[0.8rem] px-[0.8rem] text-[1.4rem] tracking-[0.06em] text-white/60 transition-colors hover:text-white ${RING}`}
          onClick={() => go(last ? 1 : page + 1)}
          type="button"
        >
          <span className="whitespace-nowrap tabular-nums">
            {pad2(page)} / {pad2(PAGE_COUNT)}
          </span>
          <Arrow up={last} />
        </button>
      </div>
      <h2 className="mb-[1.4rem] font-sans text-[1.15rem] font-medium uppercase tracking-[0.12em] text-[#f9b9dc]/70">
        ({pad2(page)}) {label}
      </h2>
    </>
  );
}

function ChipMark({ chip }: { chip: Chip }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="mr-[0.4em] inline-flex h-[1.05em] w-[1.05em] translate-y-[0.12em] items-center justify-center rounded-[0.15em] align-baseline font-sans text-[0.6em] font-bold leading-none"
      style={{ background: chip.bg, color: chip.fg }}
    >
      {chip.mark}
    </span>
  );
}

function Org({ chip, children }: { chip: Chip; children: ReactNode }): JSX.Element {
  return (
    <span className="whitespace-nowrap text-[#fffafc]">
      <ChipMark chip={chip} />
      {children}
    </span>
  );
}

/** x, linkedin, github, email: small, lowercase, underlined. */
export function Links({ className = "" }: { className?: string }): JSX.Element {
  const picked = (["X", "LinkedIn", "GitHub"] as const)
    .map((label) => elsewhere.find((l) => l.label === label))
    .filter((l): l is (typeof elsewhere)[number] => Boolean(l));
  return (
    <ul className={`flex flex-wrap items-center gap-x-[2rem] text-[1.4rem] text-white/60 ${className}`}>
      {picked.map((l) => (
        <li key={l.label}>
          <a className={`inline-flex min-h-[4.4rem] items-center ${LINK} ${RING}`} href={l.href} rel="noreferrer" target="_blank">
            {l.label.toLowerCase()}
          </a>
        </li>
      ))}
      <li>
        <a className={`inline-flex min-h-[4.4rem] items-center ${LINK} ${RING}`} href={`mailto:${EMAIL}`}>
          email
        </a>
      </li>
    </ul>
  );
}

const BODY = "space-y-[1.8rem] text-[1.9rem] leading-[1.62] text-white/75";

export function IntroPanel({ go }: { go: Go }): JSX.Element {
  return (
    <>
      <Header go={go} label="Intro" page={2} />
      <div className={BODY}>
        <p>
          I&rsquo;m the co-founder and CTO of <Org chip={CHIPS.actually}>The Actually Company</Org>, a local-first AI speaking coach. I built it in San
          Francisco as a founder in residence at <Org chip={CHIPS.founders}>Founders, Inc.</Org>
        </p>
        <p>
          I study computer engineering at <Org chip={CHIPS.uoft}>University of Toronto</Org>. I&rsquo;m also president of{" "}
          <Org chip={CHIPS.stl}>STL Robotics</Org>, where I captain and program <Org chip={CHIPS.vex}>VEX team 82855Z</Org>.
        </p>
        <p>
          I build systems that bring ideas to life. Here&rsquo;s{" "}
          <button className={`${LINK} ${RING} text-white/90`} onClick={() => go(4)} type="button">
            what I&rsquo;ve built
          </button>{" "}
          and{" "}
          <button className={`${LINK} ${RING} text-white/90`} onClick={() => go(3)} type="button">
            how I got here
          </button>
          .
        </p>
      </div>
      <Links className="mt-[3.2rem]" />
    </>
  );
}

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="h-[1.4rem] w-[1.4rem] text-white/45 transition-transform duration-300 motion-reduce:transition-none"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      style={{ transform: open ? "rotate(180deg)" : undefined }}
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function TimelinePanel({ go }: { go: Go }): JSX.Element {
  const [open, setOpen] = useState(0);
  const id = useId();
  return (
    <>
      <Header go={go} label="Timeline" page={3} />
      <p className="mb-[1.6rem] text-[1.9rem] leading-[1.6] text-white/75">A rough timeline of what I&rsquo;ve done so far:</p>
      <ul className="border-t border-white/10">
        {TIMELINE.map((row, i) => {
          const isOpen = open === i;
          return (
            <li className="border-b border-white/10" key={row.title}>
              <button
                aria-controls={`${id}-${i}`}
                aria-expanded={isOpen}
                className={`grid min-h-[4.6rem] w-full grid-cols-[12rem_1fr_auto] items-baseline gap-x-[1.6rem] py-[1.1rem] text-left text-[1.7rem] leading-[1.4] ${RING}`}
                id={`${id}-b${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                type="button"
              >
                <span className="whitespace-nowrap tabular-nums text-white/45">{row.when}</span>
                <span className={isOpen ? "text-[#fffafc]" : "text-white/85"}>{row.title}</span>
                <span className="self-center">
                  <Chevron open={isOpen} />
                </span>
              </button>
              <div
                aria-hidden={!isOpen}
                aria-labelledby={`${id}-b${i}`}
                className="grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none"
                id={`${id}-${i}`}
                role="region"
                style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <ul className="space-y-[0.4rem] pb-[1.4rem] text-[1.5rem] leading-[1.55] text-white/60 md:pl-[13.6rem]">
                    {row.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function WorkPanel({ go, count }: { go: Go; count: number }): JSX.Element {
  return (
    <>
      <Header go={go} label="Work" page={4} />
      <div className={BODY}>
        <p>
          {count === 5 ? "Five" : count} things I&rsquo;ve built. Each one opens for the details.
        </p>
      </div>
    </>
  );
}

/** One project as a small framed card: its picture in the site's bars,
 *  then lanceyan's caption. The whole card opens the details. */
export function WorkCard({ p, i, source, onOpen }: { p: Project; i: number; source: BarSource | null; onOpen: (i: number, from: HTMLElement) => void }): JSX.Element {
  return (
    <button
      aria-haspopup="dialog"
      className={`group block w-full text-left ${RING}`}
      onClick={(e) => onOpen(i, e.currentTarget)}
      type="button"
    >
      <span className="relative block h-[21rem] overflow-hidden border border-white/15 bg-[#1a0812]/85 transition-colors group-hover:border-[#f9b9dc]/60">
        {source ? <BarPicture alt="" cell={5} source={source} /> : null}
        <span aria-hidden="true" className="absolute left-[0.8rem] top-[0.6rem] font-sans text-[1.1rem] text-white/60">
          +
        </span>
        <span aria-hidden="true" className="absolute bottom-[0.6rem] right-[0.8rem] font-sans text-[1.1rem] text-white/60">
          +
        </span>
      </span>
      <span className="block bg-[#1a0812]/80 px-[1.4rem] pb-[1.4rem] pt-[1.2rem]">
        <span className="flex items-baseline justify-between gap-[1rem] font-sans text-[1.15rem] font-medium uppercase tracking-[0.12em] text-[#f9b9dc]/70">
          <span>({pad2(i + 1)})</span>
          <span className="tabular-nums">{p.year}</span>
        </span>
        <span className="mt-[0.6rem] block text-[2.2rem] font-bold leading-[1.2] text-[#fffafc]">{p.title}</span>
        <span className="mt-[0.6rem] block text-[1.5rem] leading-[1.5] text-white/65">{p.tagline}</span>
        <span className="mt-[1rem] inline-flex items-center gap-[0.6rem] text-[1.4rem] text-white/70 underline decoration-white/40 underline-offset-[0.25em] group-hover:text-white">
          read more <Arrow />
        </span>
      </span>
    </button>
  );
}

export function SkillsPanel({ go }: { go: Go }): JSX.Element {
  return (
    <>
      <Header go={go} label="Skills" page={5} />
      <p className="mb-[1.6rem] text-[1.9rem] leading-[1.6] text-white/75">What I build with:</p>
      <dl className="border-t border-white/10">
        {SKILLS.map((s) => (
          <div className="grid gap-x-[1.6rem] gap-y-[0.2rem] border-b border-white/10 py-[1.2rem] md:grid-cols-[16rem_1fr]" key={s.label}>
            <dt className="text-[1.5rem] leading-[1.5] text-white/45">{s.label}</dt>
            <dd className="text-[1.6rem] leading-[1.55] text-white/85">{s.items}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function ContactPanel({ go }: { go: Go }): JSX.Element {
  return (
    <>
      <Header go={go} label="Contact" page={6} />
      <div className={BODY}>
        <p>What I keep coming back to:</p>
        <blockquote className="border-l border-white/30 pl-[1.6rem] italic text-white/90">&ldquo;I build systems that bring ideas to life.&rdquo;</blockquote>
        <p>
          I&rsquo;m in Toronto. Write to me at{" "}
          <a className={`${LINK} ${RING} break-all text-white/90`} href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          .
        </p>
      </div>
      <Links className="mt-[3.2rem]" />
    </>
  );
}

/** A project's details over the whole page. Escape, the close button or a
 *  click outside the text closes it; focus goes back to the card. */
export function ProjectDialog({ p, i, source, onClose }: { p: Project; i: number; source: BarSource | null; onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !boxRef.current) return;
      // Keep Tab inside the dialog.
      const items = boxRef.current.querySelectorAll<HTMLElement>("a[href], button");
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className={`fixed inset-0 z-[90] overflow-y-auto bg-[#1a0812]/[0.94] ${serif.className}`}
      data-lenis-prevent=""
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      ref={boxRef}
      role="dialog"
    >
      <div className="mx-auto grid min-h-full max-w-[128rem] items-center gap-[4rem] px-[2.4rem] py-[8rem] md:grid-cols-[1fr_1fr] md:px-[6.4rem]">
        <div className="relative h-[28rem] border border-white/15 md:h-[48rem]">
          {source ? <BarPicture alt={`${p.title}, drawn in bars`} cell={6} source={source} /> : null}
        </div>
        <div className="max-w-[60rem]">
          <div className="mb-[2rem] flex items-center justify-between gap-[1.6rem]">
            <p className="font-sans text-[1.15rem] font-medium uppercase tracking-[0.12em] text-[#f9b9dc]/70">
              ({pad2(i + 1)}) {p.year}
            </p>
            <button
              className={`-mr-[0.8rem] inline-flex min-h-[4.4rem] items-center gap-[0.6rem] px-[0.8rem] font-sans text-[1.3rem] font-medium uppercase tracking-[0.08em] text-white/70 hover:text-white ${RING}`}
              onClick={onClose}
              ref={closeRef}
              type="button"
            >
              Close <span aria-hidden="true">✕</span>
            </button>
          </div>
          <h2 className="text-[3.6rem] font-bold leading-[1.15] text-[#fffafc]" id={titleId}>
            {p.title}
          </h2>
          {p.award ? <p className="mt-[0.8rem] text-[1.6rem] italic text-[#f9b9dc]">{p.award}</p> : null}
          <p className="mt-[2rem] text-[1.9rem] leading-[1.6] text-white/85">{p.tagline}</p>
          <ul className="mt-[2rem] space-y-[1.2rem] border-l border-white/20 pl-[1.6rem] text-[1.6rem] leading-[1.6] text-white/65">
            {p.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="mt-[2rem] text-[1.4rem] leading-[1.6] text-white/50">{p.stack.join(", ")}</p>
          {p.href || p.code ? (
            <div className="mt-[2.4rem] flex flex-wrap gap-x-[2rem] text-[1.4rem] text-white/70">
              {p.href ? (
                <a className={`inline-flex min-h-[4.4rem] items-center ${LINK} ${RING}`} href={p.href} rel="noreferrer" target="_blank">
                  {p.href.includes("devpost") ? "devpost" : p.href.includes("github") ? "github" : "website"}
                </a>
              ) : null}
              {p.code ? (
                <a className={`inline-flex min-h-[4.4rem] items-center ${LINK} ${RING}`} href={p.code} rel="noreferrer" target="_blank">
                  code
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
