"use client";

import { type ReactNode, useRef } from "react";
import TransitionLink from "@/components/TransitionLink";
import { sectionLinks, socialLinks } from "@/components/siteContent";
import { useRevealOnScroll } from "@/components/useRevealOnScroll";

const NAV_LINKS = sectionLinks;
const SOCIAL_LINKS = socialLinks;

type SubpageShellProps = {
  children: ReactNode;
  current: "work" | "info" | "contact";
};

/**
 * Frame shared by /work, /info and /contact: top nav (name -> home, page
 * links with the current one marked), footer with the hairline + (c) year
 * motif from the home hero, and viewport-entry reveals for every
 * [data-reveal] element inside.
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
      <header
        className="flex items-baseline justify-between gap-6"
        data-reveal
      >
        <TransitionLink
          className="font-serif-display text-[1.15rem] italic tracking-[-0.02em] transition-opacity duration-200 hover:opacity-60"
          href="/"
          veilLabel="Kevin He."
        >
          Kevin He.
        </TransitionLink>

        <nav
          aria-label="Site"
          className="flex items-baseline gap-5 text-[0.75rem] uppercase tracking-[0.04em] sm:gap-8 sm:text-[0.85rem]"
        >
          {NAV_LINKS.map((item) => {
            const isCurrent = item.href === `/${current}`;
            return (
              <TransitionLink
                aria-current={isCurrent ? "page" : undefined}
                className={
                  isCurrent
                    ? "underline decoration-1 underline-offset-[6px]"
                    : "opacity-50 transition-opacity duration-200 hover:opacity-100"
                }
                href={item.href}
                key={item.href}
                veilLabel={item.label}
              >
                {item.label}
              </TransitionLink>
            );
          })}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-24 sm:mt-32" data-reveal>
        <div className="h-px w-full bg-white/25" />
        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-4 text-[0.75rem] uppercase tracking-[0.04em] sm:text-[0.85rem]">
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
                  className="transition-opacity duration-200 hover:opacity-60"
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
