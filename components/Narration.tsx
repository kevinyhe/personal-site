"use client";

/**
 * The page, spoken.
 *
 * etiennepharabot.fr's 2021 portfolio has no body copy. Its whole "about"
 * is one continuous first-person sentence set at 80px — the same size as
 * its section headings — broken across lines and stanzas, with the emphasis
 * carried entirely by weight and slant: light italic for the connective
 * words, roman for the plain facts, bold for the claims. "Selected Works"
 * is set at the same 80px, so the list is a clause of the same sentence
 * rather than a new chapter.
 *
 * That is the whole idea here. What this replaced was a heading that said
 * nothing followed by two small paragraphs, which reads as a page ABOUT
 * someone; this reads as someone talking.
 *
 * The display serif has three usable cuts — roman 400, italic 400, italic
 * 700 — where the reference has four (it also has a bold roman). So the
 * ladder is italic → roman → bold italic rather than the reference's
 * light-italic → roman → bold-italic → bold. Same rising intensity, one
 * rung shorter. `font-bold` is never used without `italic`: there is no
 * bold roman in the family and the browser would synthesise one.
 *
 * NOTHING WITH A DIGIT OR A SYMBOL GOES IN HERE. The cut is a Fontspring
 * DEMO and it draws a "DEMO" flower instead of these:
 *
 *     '  "  $  &  4  @  -  !  (  )  *  +  /  =  #  %
 *
 * Measured, not guessed — including the "4", which is why every date, price
 * and the live clock are set in the sans instead. Safe substitutes that do
 * render: ’ (U+2019), ‑ (U+2011), — (U+2014), · (U+00B7), and the other
 * nine digits. The real fix is licensing the font; see app/layout.tsx.
 */

/** How a run is said. `soft` opens a clause, `strong` lands it. */
export type Voice = "plain" | "soft" | "strong";

export type Run = { text: string; voice?: Voice };

/** A line is one or more runs; a stanza is a group of lines. */
export type Line = { indent: number; runs: Run[] };

const VOICE: Record<Voice, string> = {
  plain: "",
  soft: "italic opacity-70",
  strong: "italic font-bold",
};

/**
 * How a line arrives.
 *
 * `far` is the reference's own reveal: parked at translateY(90px) and
 * opacity 0 until it enters. The default 18 is for captions.
 *
 * `slide` is the narration's, and it is not a reveal at all — the line is
 * carried in from the left or the right and keeps travelling the whole time
 * it is on screen, driven by a scrub in HeroIntro. This only marks it; the
 * scroll animation owns its position. These reading lines stay visible
 * by default rather than depending on the separate reveal observer.
 */
export function Stanza({
  center,
  far,
  lines,
  slide,
}: {
  /**
   * Every line centred on the column, and the staircase indents ignored.
   * The hero narration is set this way on the television's screen, which
   * holds the middle of the frame; a staircase only makes sense with a margin to
   * step into.
   */
  center?: boolean;
  far?: boolean;
  lines: Line[];
  slide?: boolean;
}) {
  return (
    <p className="mt-[1.7em] first:mt-0">
      {lines.map((line, index) => (
        <span
          // The indents are a desktop device. On a phone the column is
          // narrow enough that a 20% indent pushes a four-word line onto
          // two, and a staircase whose steps wrap is just ragged text.
          // w-fit, so the box hugs its text. As a plain block each line's box
          // was the full width of the column however few words were on it,
          // and carrying that box sideways dragged an empty rectangle past
          // the edge of the screen — the page grew a horizontal scrollbar
          // for text that was nowhere near the edge.
          className={
            "block w-fit " +
            (center ? "mx-auto" : "ml-0 sm:ml-[var(--indent)]")
          }
          data-narration-slide={slide ? "" : undefined}
          data-reveal={slide ? undefined : far ? "far" : ""}
          key={index}
          style={{ "--indent": `${line.indent}%` } as React.CSSProperties}
        >
          {line.runs.map((run, runIndex) => (
            <span className={VOICE[run.voice ?? "plain"]} key={runIndex}>
              {runIndex > 0 ? " " : null}
              {run.text}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}

/**
 * The narration's type scale.
 *
 * The default, 5.6vw, lands on the reference's 80px at a 1440 viewport;
 * the line height is its measured 140px over 80px.
 */
export function Narration({
  children,
  stage,
}: {
  children: React.ReactNode;
  /**
   * The hero narration, set on the television's screen at the reference's
   * own size.
   *
   * portfolio-2021.etiennepharabot.fr steps its intro copy by viewport:
   * 60px under 1345, 80px under 1600, 120px under 1920 and 180px above
   * it (Cormorant Garamond, 30px of padding either side of every line).
   * 6.25vw is the 120px at 1920 and runs through those steps within ten
   * pixels; the floor is its 30px phone size and the cap its 180px.
   *
   * This was 4.2vw, sized to leave room beside the figure when the lines
   * sat in a column to its left. Centred over a figure that no longer
   * moves aside there is no column to fit, and the reference's scale is
   * what reads as someone talking rather than a caption.
   */
  stage?: boolean;
}) {
  return (
    // w-full matters: the indents are percentages, so without it they
    // resolve against the widest line rather than the column and the long
    // ones push themselves onto two.
    <div
      className={
        "w-full font-serif-display leading-[1.75] tracking-[-0.02em] " +
        (stage
          ? "text-[clamp(1.78125rem,5.9375vw,10.6875rem)]"
          : "text-[clamp(1.7rem,5.6vw,5rem)]")
      }
    >
      {children}
    </div>
  );
}
