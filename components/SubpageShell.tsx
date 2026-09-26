"use client";

import { type ReactNode, useRef } from "react";
import Rule from "@/components/Rule";
import TransitionLink from "@/components/TransitionLink";
import { sectionLinks, socialLinks } from "@/components/siteContent";
import { useRevealOnScroll } from "@/components/useRevealOnScroll";

const NAV_LINKS = sectionLinks;
const SOCIAL_LINKS = socialLinks;


type SubpageShellProps = {
  children: ReactNode;
  /** Which nav item is this page. Unset on the 404, which is none of them. */
  current?: "work" | "info" | "contact";
};

/**
 * Frame shared by /work, /info, /contact and the 404: top nav (name ->
 * home, page links with the current one marked), footer with the hairline
 * + (c) year motif from the home hero, and viewport-entry reveals for every
 * [data-reveal] element inside.
 *
 * Every hairline in here is its own [data-reveal][data-rule] element, a
 * sibling of the text it underlines rather than a child of a fading
 * wrapper. Nested, the parent's fade-in would hide the start of the draw
 * (the rule spends its first 0.3 s of power3.inOut barely moving, exactly
 * while the parent is still near opacity 0) and the line would just fade
 * in like everything else.
 */
export default function SubpageShell({ children, current }: SubpageShellProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useRevealOnScroll(rootRef, { holdForVeil: true });

  const year = new Date().getFullYear();

  return (
    <div
      className="flex min-h-screen flex-col px-6 pb-6 pt-7 text-[#f0f0f0] sm:px-16 sm:pb-9 sm:pt-12"
      ref={rootRef}
    >
      {/* The [data-reveal] risers here are plain wrappers, never the links:
          the reveal ends by writing `opacity: 1` inline, and on a link that
          would beat its own opacity-50 and hover:opacity-* classes for good. */}
      <header className="flex items-baseline justify-between gap-6">
        <span className="inline-block" data-reveal>
          <TransitionLink
            className="font-serif-display text-[1.15rem] italic tracking-[-0.02em] transition-opacity duration-200 hover:opacity-60 motion-reduce:transition-none"
            href="/"
            veilLabel="Kevin He."
          >
            Kevin He.
          </TransitionLink>
        </span>

        <nav
          aria-label="Site"
          className="flex items-baseline gap-5 text-[0.75rem] uppercase tracking-[0.04em] sm:gap-8 sm:text-[0.85rem]"
        >
          {NAV_LINKS.map((item) => {
            const isCurrent = current !== undefined && item.href === `/${current}`;
            return (
              <span className="relative" key={item.href}>
                <span className="inline-block" data-reveal>
                  <TransitionLink
                    aria-current={isCurrent ? "page" : undefined}
                    className={
                      isCurrent
                        ? "inline-block"
                        : "inline-block opacity-50 transition-opacity duration-200 hover:opacity-100 motion-reduce:transition-none"
                    }
                    href={item.href}
                    veilLabel={item.label}
                  >
                    {item.label}
                  </TransitionLink>
                </span>
                {/* The current-page mark: a hairline that draws itself under
                    the word, where the old one was a text-underline that
                    could only appear. Same 6px offset. */}
                {isCurrent ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[6px] h-px bg-current"
                    data-reveal
                    data-rule
                  />
                ) : null}
              </span>
            );
          })}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-24 sm:mt-32">
        <Rule />
        <div
          className="mt-5 flex flex-wrap items-baseline justify-between gap-4 text-[0.75rem] uppercase tracking-[0.04em] sm:text-[0.85rem]"
          data-reveal
        >
          <p aria-label="Copyright">
            {"©"} {year}
          </p>
          <p className="flex items-baseline gap-3">
            {SOCIAL_LINKS.map((social, index) => (
              <span className="flex items-baseline gap-3" key={social.label}>
                {index > 0 ? (
                  <span aria-hidden="true" className="opacity-40">
                    /
                  </span>
                ) : null}
                <a
                  className="transition-opacity duration-200 hover:opacity-60 motion-reduce:transition-none"
                  href={social.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {social.label}
                </a>
              </span>
            ))}
          </p>
        </div>
      </footer>
    </div>
  );
}
