"use client";

/**
 * The small parts the lower sections share, in the reference's markup.
 *
 * These are the reference's own components rebuilt: its four-point star,
 * the `.title` row (stars, a word in the small uppercase sans, stars), its
 * `.divider` rule and its `.btn` pill. components/valley/ValleyMarkup.tsx
 * has the same pieces for the intro and the hero; they are private there,
 * so the shapes are repeated rather than the file being edited.
 */

import type { JSX, ReactNode } from "react";

/* The reference drives its JS from plain (non data-) attributes such as
   hover="line-l". React passes unknown lowercase attributes straight
   through; this spread only stops TypeScript checking them as DOM props. */
export type Attrs = Record<string, string>;
export const attrs = (o: Attrs): Attrs => o;

/** The reference's four-point star, 8x8 in an 8x12 box. */
function StarIcon() {
  return (
    <svg
      fill="none"
      height="100%"
      viewBox="0 0 8 8"
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d="M0 4C2.20914 4 4 2.20914 4 0C4 2.20914 5.79086 4 8 4C5.79086 4 4 5.79086 4 8C4 5.79086 2.20914 4 0 4Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

/** Three of them, which is what the reference puts on each side of a title. */
export function TitleStars(): JSX.Element {
  return (
    <div className="title_stars text-dark">
      {[0, 1, 2].map((i) => (
        <div className="ico-8-12" key={i}>
          <div className="ico">
            <StarIcon />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The reference's section title: stars, one word in the small uppercase
 * sans, stars. The word is an <h2> because it names the section.
 */
export function SectionTitle({ label }: { label: string }): JSX.Element {
  return (
    <div className="title" data-scroll-reveal="ctn">
      <TitleStars />
      <h2 className="p6 text-dark a-center">{label}</h2>
      <TitleStars />
    </div>
  );
}

/**
 * The reference's rule: a 1px hairline with a 2px line above it that fills
 * in on hover. `reveal` gives it the wipe-in from the left, and with it the
 * hidden-until-revealed guard so it does not flash.
 */
export function Divider({ reveal = true }: { reveal?: boolean } = {}): JSX.Element {
  return (
    <div
      className="divider"
      data-prevent-flicker={reveal ? "true" : undefined}
      data-scroll-reveal={reveal ? "line" : undefined}
      {...attrs({ hover: "line" })}
    >
      <div className="line-l" {...attrs({ hover: "line-l" })} />
      <div className="line-s" />
    </div>
  );
}

/** The reference's pill: a filled capsule that squares off under the pointer. */
export function PillButton({
  href,
  label,
  small,
}: {
  href: string;
  label: string;
  small?: boolean;
}): JSX.Element {
  return (
    <a
      aria-label={label}
      className={"btn w-inline-block" + (small ? " is-small" : "")}
      href={href}
      {...attrs({ "hover-btn": "" })}
    >
      <div className="btn_label" {...attrs({ hover: "label" })}>
        <div className="btn_label_text">
          <div className="p6 text-light" {...attrs({ hover: "text" })}>
            {label}
          </div>
        </div>
      </div>
      <div className="btn_hover" {...attrs({ hover: "hover" })} />
      <div className="btn_bg" {...attrs({ hover: "bg" })} />
    </a>
  );
}

/** A section's outer shell: the reference's section > container > content. */
export function SectionShell({
  children,
  id,
}: {
  children: ReactNode;
  id: string;
}): JSX.Element {
  return (
    <section className="section" id={id}>
      <div className="container">
        <div className="sd-s">{children}</div>
      </div>
    </section>
  );
}
