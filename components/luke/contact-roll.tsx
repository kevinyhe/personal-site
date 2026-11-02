import type { CSSProperties, JSX } from "react";

/**
 * Text whose letters roll up, one after another, to a second copy of
 * themselves when the pointer is on it or it has keyboard focus
 * (lukebaffait.fr's CONTACT ME and his GitHub / LinkedIn links).
 *
 * Put it inside an element with Tailwind's `group` class: the roll keys off
 * that element's hover and focus. Screen readers get the plain text once.
 */
export function RollText({ text, step = 18, glyphStyle }: { text: string; step?: number; glyphStyle?: (char: string) => CSSProperties | undefined }): JSX.Element {
  const chars = Array.from(text);
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex">
        {chars.map((c, i) => {
          const glyph = c === " " ? " " : c;
          return (
            <span className="relative -mx-[0.09em] inline-block overflow-hidden px-[0.09em] leading-[1.4]" key={i}>
              <span
                className="block transition-transform duration-[650ms] ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:-translate-y-full group-focus-visible:-translate-y-full motion-reduce:transition-none"
                style={{ ...glyphStyle?.(c), transitionDelay: `${i * step}ms` }}
              >
                {glyph}
                <span className="absolute left-0 top-full">{glyph}</span>
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
