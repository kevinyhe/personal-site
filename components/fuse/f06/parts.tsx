import type { JSX } from "react";

import SectionLink from "@/components/SectionLink";

import { ORGS, type OrgKey, type Run } from "./data";

/** Shared pieces: the organisation chip, sentences with chips in them,
 *  lanceyan's name-and-page header, and lukebaffait's footer bar. */

export const GUTTER = "px-[clamp(16px,4.8rem,96px)]";
export const TINY = "font-sans text-[clamp(10px,1.15rem,16px)] font-medium uppercase tracking-[0.08em]";
export const BODY = "text-[clamp(15px,2.1rem,30px)] leading-[1.62]";
export const LINK = "underline decoration-white/35 decoration-1 underline-offset-[0.22em] transition-colors hover:decoration-white focus-visible:decoration-white";
/** The left column of every period/headline pair, so rows, readout and
 *  facts line up with each other. */
export const PERIOD_COL = "grid-cols-[clamp(96px,24rem,400px)_minmax(0,1fr)]";

export function Chip({ org }: { org: OrgKey }): JSX.Element {
  const o = ORGS[org];
  return (
    <span
      aria-hidden
      className="mr-[0.38em] inline-flex h-[1.02em] w-[1.02em] items-center justify-center rounded-[0.16em] align-[-0.14em] font-sans text-[0.56em] font-bold not-italic leading-none"
      style={{ background: o.bg, color: o.fg, boxShadow: o.ring ? "inset 0 0 0 1px rgba(255,250,252,0.55)" : undefined }}
    >
      {o.mono}
    </span>
  );
}

/** A sentence made of runs: plain text, or an organisation behind its chip.
 *  `links` off inside a button, where an anchor is not allowed. */
export function Runs({ runs, links = true }: { runs: Run[]; links?: boolean }): JSX.Element {
  return (
    <>
      {runs.map((r, i) => {
        if (typeof r === "string") return <span key={i}>{r}</span>;
        return (
          <span className="whitespace-nowrap" key={i}>
            <Chip org={r.org} />
            {links && r.href ? (
              <a className={`${LINK} text-white`} href={r.href} rel="noreferrer" target="_blank">
                {r.text}
              </a>
            ) : (
              <span className="text-white">{r.text}</span>
            )}
          </span>
        );
      })}
    </>
  );
}

/** lanceyan's header: the name in bold, the page count and an arrow. */
export function PageHead({ page, of, to, up = false }: { page: number; of: number; to: string; up?: boolean }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-[2rem]">
      <p className="text-[clamp(24px,3.6rem,52px)] font-bold leading-[1.15] tracking-[-0.01em] text-white">Kevin He</p>
      <SectionLink
        className="group inline-flex items-center gap-[0.6em] text-[clamp(12px,1.35rem,19px)] tabular-nums text-white/70 transition-colors hover:text-white focus-visible:text-white"
        id={to}
      >
        <span>
          {String(page).padStart(2, "0")} / {String(of).padStart(2, "0")}
        </span>
        <span className="sr-only">{up ? ", back to the top" : ", next page"}</span>
        <svg aria-hidden className={`h-[0.9em] w-[0.9em] transition-transform ${up ? "-rotate-90 group-hover:-translate-y-[0.15em]" : "group-hover:translate-x-[0.15em]"}`} fill="none" viewBox="0 0 12 12">
          <path d="M1 6h9.5M6.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </SectionLink>
    </div>
  );
}

const SOCIAL = [
  { label: "GitHub", href: "https://github.com/kevinyhe" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/kevinyhe" },
  { label: "X", href: "https://x.com/thekevinlab" },
];

/** lukebaffait's footer: a hairline, then one row of small capitals. */
export function FootBar({ left, right }: { left: JSX.Element; right: JSX.Element }): JSX.Element {
  return (
    <div className={`${TINY} grid grid-cols-[1fr_auto] items-center gap-[2rem] border-t border-white/25 pb-[clamp(60px,7rem,100px)] pt-[clamp(14px,2.2rem,34px)] text-white/85 md:grid-cols-[1fr_auto_1fr]`}>
      <div className="min-w-0">{left}</div>
      <nav aria-label="Elsewhere" className="hidden items-center gap-[1.4em] md:flex">
        {SOCIAL.map((s, i) => (
          <span className="flex items-center gap-[1.4em]" key={s.href}>
            {i > 0 && (
              <span aria-hidden className="text-white/30">
                /
              </span>
            )}
            <a className="transition-colors hover:text-white focus-visible:text-white" href={s.href} rel="noreferrer" target="_blank">
              {s.label}
            </a>
          </span>
        ))}
      </nav>
      <div className="flex justify-end">{right}</div>
    </div>
  );
}
