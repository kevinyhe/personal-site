import { useSyncExternalStore } from "react";

import type { Project } from "@/components/profile";

/**
 * The facts the work section prints on each project's sheet, and a
 * media-query hook the gallery shares.
 *
 * Every value is from components/profile.ts or the résumé: the month and
 * year each project is dated by, a short name for the progress bar, what
 * kind of thing it is, and its one result (the award, or the number).
 */

const WHEN: Record<string, string> = {
  "The Actually Company": "05 2026",
  "S‑KBD67": "09 2025",
  "King of the Ring": "05 2026",
  mclib: "2022–2026",
};

/** "05 2026", or the project's year when the résumé gives no month. */
export function whenOf(p: Project): string {
  return WHEN[p.title] ?? p.year;
}

const SHORT: Record<string, string> = {
  "The Actually Company": "Actually",
};

/** The name under its tick on the progress bar. */
export function shortOf(p: Project): string {
  return SHORT[p.title] ?? p.title;
}

const KIND: Record<Project["kind"], string> = {
  company: "Company, co‑founder and CTO",
  hackathon: "Hackathon build",
  library: "C++ library for VEX V5",
  bot: "Discord bot",
};

/** What it is, and Kevin's part in it where that is not obvious. */
export function kindOf(p: Project): string {
  return KIND[p.kind];
}

/** Results with no `award` field, from the résumé bullets. */
const RESULT: Record<string, string> = {
  "The Actually Company": "$1k MRR, 200+ active users",
  mclib: "80th of ~20,000 teams in global Skills",
};

/** The award if there is one, else its number. */
export function resultOf(p: Project): string | undefined {
  return p.award ?? RESULT[p.title];
}

/** The site name a link goes to, e.g. "devpost.com". */
export function hostOf(href: string): string {
  try {
    return new URL(href).host.replace(/^www\./, "");
  } catch {
    return href;
  }
}

/** True while the media query matches. False on the server and on the
 *  first client render, so the server's markup always matches. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
