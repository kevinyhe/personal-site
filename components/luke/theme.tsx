import type { JSX, ReactNode } from "react";

/**
 * The home page after the statement band, after lukebaffait.fr: his
 * sections, motion and type, in this site's colours. One dark ground for
 * all of them (no aurora shows through), white type, and the site's rose
 * and blossom where lukebaffait uses red.
 */

/** The ground under every section: the statement band's plum, so the page
 *  is one colour from the band down. */
export const GROUND = "#170a14";
/** The old plum, kept as the type and pictures on the pink contact panel. */
export const MAUVE = "#2a0d1e";
/** Type: the statement band's pink, as its sentence is set. */
export const INK = "#f9b9dc";
/** Dimmed type, lukebaffait's grey rows, in the same pink. */
export const DIM = "rgba(249, 185, 220, 0.38)";
/** lukebaffait's red, as this site's rose: the brush stroke, the arrow. */
export const ACCENT = "#e0457f";
/** The site's blossom, for glows and the italic words. */
export const BLOSSOM = "#f9b9dc";
/** The pale panel the contact section slides up as (his off-white). */
export const PALE = "#fbeef4";
/** Hairlines. */
export const RULE = "rgba(249, 185, 220, 0.16)";

/** lukebaffait's tiny bracketed number, e.g. "(22)", set small and dim. */
export function Count({ n, className = "" }: { n: number; className?: string }): JSX.Element {
  return <span className={`font-sans text-[max(1rem,9px)] tabular-nums text-white/45 ${className}`}>({String(n).padStart(2, "0")})</span>;
}

/** The label that runs down the right edge of each section beside a
 *  vertical hairline ("About", "Projects", "Skills"...). Hidden on phones. */
export function Rail({ label }: { label: string }): JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute right-[max(3.2rem,16px)] top-[12vh] hidden h-[76vh] w-px bg-white/15 lg:block">
      <span className="absolute -left-[0.6rem] top-1/2 -translate-x-full -translate-y-1/2 font-sans text-[max(1.1rem,10px)] text-white/70">{label}</span>
    </div>
  );
}

/** An italic display-serif word inside sans type (his "creative developer").
 *  The display serif is a DEMO cut: never put digits or ' " & @ - ! ( ) / ;
 *  inside this. */
export function Em({ children }: { children: ReactNode }): JSX.Element {
  return <span className="pr-[0.04em] font-serif-display italic tracking-[-0.01em]">{children}</span>;
}

/** Characters the display serif (a DEMO cut) draws a watermark for. */
const NOT_SERIF = /([0-9'"&@\-\u2010\u2011!()/;]+)/;

/** Text in the italic display serif, the way the band's sentence is set,
 *  with the characters that cut cannot draw (digits, & - ( ) / ...) set in
 *  the sans instead, so any string is safe in it. */
export function Serif({ text }: { text: string }): JSX.Element {
  return (
    <span className="font-serif-display italic">
      {text.split(NOT_SERIF).map((run, i) =>
        i % 2 === 1 ? (
          <span className="font-sans text-[0.82em] not-italic" key={i}>
            {run}
          </span>
        ) : (
          run
        ),
      )}
    </span>
  );
}
