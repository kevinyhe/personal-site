"use client";

import type { JSX, ReactNode } from "react";

import { elsewhere, EMAIL } from "@/components/siteContent";
import { SCENES } from "./content";

/**
 * The small pieces concept 01 repeats: lanceyan's inline organisation mark
 * and his row of links, the arrow, lukebaffait's name lockup and its
 * footer bar.
 */

export const FOCUS = "rounded-[0.2em] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white/80";

export function Arrow({ className = "h-[1.1em] w-[1.1em]" }: { className?: string }): JSX.Element {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={`h-[1.2em] w-[1.2em] shrink-0 text-white/50 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

/**
 * An organisation named in a sentence, lanceyan's way: its mark, then its
 * name, kept together on one line. The mark is a small blossom square with
 * the initials in plum (no outside logos). Underlined when it links out.
 */
export function Org({ mark, href, children }: { mark: string; href?: string; children: ReactNode }): JSX.Element {
  const chip = (
    <span
      aria-hidden="true"
      className="mr-[0.4em] inline-flex h-[1.05em] w-[1.05em] items-center justify-center rounded-[0.22em] bg-[#f9b9dc] align-[-0.16em] shadow-[0_0_0.6em_rgba(249,185,220,0.35)]"
    >
      <span className={`font-sans font-bold leading-none tracking-[-0.04em] text-[#2a0d1e] ${mark.length > 1 ? "text-[0.42em]" : "text-[0.58em]"}`}>{mark}</span>
    </span>
  );
  if (!href) {
    return (
      <span className="whitespace-nowrap">
        {chip}
        <span className="text-white">{children}</span>
      </span>
    );
  }
  return (
    <a className={`whitespace-nowrap text-white underline decoration-white/35 underline-offset-[0.25em] transition-colors hover:decoration-white ${FOCUS}`} href={href} rel="noreferrer" target="_blank">
      {chip}
      {children}
    </a>
  );
}

/** A word in a sentence that takes you to another scene. */
export function SceneLink({ to, go, children }: { to: number; go: (n: number) => void; children: ReactNode }): JSX.Element {
  return (
    <button className={`inline text-white underline decoration-white/35 underline-offset-[0.25em] transition-colors hover:decoration-white ${FOCUS}`} onClick={() => go(to)} type="button">
      {children}
    </button>
  );
}

/** lanceyan's links: small, lowercase, underlined, spaced. */
export function Links(): JSX.Element {
  const links = (["X", "LinkedIn", "GitHub"] as const)
    .map((label) => elsewhere.find((l) => l.label === label))
    .filter((l): l is (typeof elsewhere)[number] => Boolean(l));
  const cls = `inline-flex min-h-[44px] items-center underline decoration-white/40 underline-offset-[0.3em] transition-colors hover:text-white hover:decoration-white ${FOCUS}`;
  return (
    <div className="mt-[max(3.2rem,20px)] flex flex-wrap items-center gap-x-[max(2rem,16px)] text-[max(1.4rem,13px)] text-white/60">
      {links.map((l) => (
        <a className={cls} href={l.href} key={l.label} rel="noreferrer" target="_blank">
          {l.label.toLowerCase()}
        </a>
      ))}
      <a className={cls} href={`mailto:${EMAIL}`}>
        email
      </a>
    </div>
  );
}

/**
 * lukebaffait's name: the first name in light Inter at the left, the last
 * in the italic display serif at the right with a gradient through it,
 * both huge, sitting on the footer's hairline. Decorative (the text block
 * already says the name), so it is hidden from screen readers.
 *
 * Sized off the width and capped by the height, so a short window keeps
 * room for the words above it.
 */
export function Lockup(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none flex select-none items-baseline justify-between gap-[0.12em] px-[max(4.8rem,16px)] text-[min(16.5vw,22vh)] leading-[1.12]"
    >
      <span className="f01-rise block font-sans font-light tracking-[-0.055em] text-[#fffafc]">Kevin</span>
      <span
        className="f01-rise block bg-[linear-gradient(105deg,#f9b9dc_0%,#fffafc_55%,#f9b9dc_100%)] bg-clip-text pb-[0.1em] pl-[0.04em] pr-[0.1em] font-serif-display italic tracking-[-0.02em] text-transparent"
        style={{ animationDelay: "90ms" }}
      >
        He.
      </span>
    </div>
  );
}

/**
 * lukebaffait's footer: a hairline, then small uppercase type in three
 * places: where I am at the left, the socials in the middle with slashes
 * between, the scenes at the right. The middle is dropped on a phone (the
 * text block carries the same links).
 */
export function FooterBar({ page, go }: { page: number; go: (n: number) => void }): JSX.Element {
  const socials = (["X", "LinkedIn", "GitHub"] as const)
    .map((label) => elsewhere.find((l) => l.label === label))
    .filter((l): l is (typeof elsewhere)[number] => Boolean(l));
  return (
    <footer className="shrink-0 px-[max(4.8rem,16px)] pb-[max(5.6rem,46px)] font-sans text-[max(1.3rem,11px)] font-medium uppercase tracking-[0.02em]">
      <div className="h-px bg-white/30" />
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-[1.6rem] pt-[max(1.2rem,8px)] lg:grid-cols-[1fr_auto_1fr]">
        <span className="hidden items-center gap-[0.4em] text-white/90 sm:inline-flex">
          <Arrow className="h-[1.15em] w-[1.15em]" />
          Toronto
        </span>
        <nav aria-label="Elsewhere" className="hidden items-center gap-[1.4em] lg:flex">
          {socials.map((l, i) => (
            <span className="flex items-center gap-[1.4em]" key={l.label}>
              {i > 0 && (
                <span aria-hidden="true" className="text-white/35">
                  /
                </span>
              )}
              <a className={`inline-flex min-h-[32px] items-center text-white/85 transition-colors hover:text-white ${FOCUS}`} href={l.href} rel="noreferrer" target="_blank">
                {l.label}
              </a>
            </span>
          ))}
        </nav>
        <nav aria-label="Scenes" className="col-start-2 flex items-center justify-end gap-[max(2.4rem,12px)] sm:col-start-auto lg:col-start-3">
          {SCENES.map((s, i) => (
            <button
              aria-current={i === page ? "page" : undefined}
              className={`relative inline-flex min-h-[32px] items-center transition-colors ${i === page ? "text-white" : "text-white/55 hover:text-white"} ${FOCUS}`}
              key={s.n}
              onClick={() => go(i)}
              type="button"
            >
              {s.label}
              <span className="ml-[0.3em] self-start pt-[0.35em] text-[0.62em] tabular-nums tracking-normal text-white/50">({String(s.n).padStart(2, "0")})</span>
            </button>
          ))}
        </nav>
      </div>
    </footer>
  );
}
