"use client";

import { type ReactNode, useEffect, useRef } from "react";
import gsap from "gsap";
import TransitionLink from "@/components/TransitionLink";

const NAV_LINKS = [
  { href: "/work", label: "Work" },
  { href: "/info", label: "Info" },
  { href: "/contact", label: "Contact" },
] as const;

const SOCIAL_LINKS = [
  { href: "https://x.com/thekevinlab", label: "X" },
  { href: "https://www.linkedin.com/in/kevinyhe", label: "LinkedIn" },
  { href: "https://github.com/kevinyhe", label: "GitHub" },
];

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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const items = Array.from(
      root.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    if (!items.length) return undefined;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      gsap.set(items, { opacity: 1 });
      return undefined;
    }

    gsap.set(items, { autoAlpha: 0, y: 18 });

    let observer: IntersectionObserver | null = null;
    let startTimer = 0;

    const start = () => {
      observer = new IntersectionObserver(
        (entries, obs) => {
          // Reveal everything that entered together as one staggered batch.
          const batch = entries
            .filter((entry) => entry.isIntersecting)
            .map((entry) => entry.target as HTMLElement)
            .sort((a, b) =>
              a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
                ? -1
                : 1,
            );
          if (!batch.length) return;
          batch.forEach((el) => obs.unobserve(el));
          gsap.to(batch, {
            autoAlpha: 1,
            duration: 0.75,
            ease: "power3.out",
            stagger: 0.09,
            y: 0,
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
      );
      items.forEach((el) => observer?.observe(el));
    };

    // If we arrived under the transition wipe, hold the first batch until
    // the panel has mostly cleared so the stagger is actually visible.
    const veil = document.getElementById("page-veil");
    if (veil?.dataset.state) {
      startTimer = window.setTimeout(start, 420);
    } else {
      start();
    }

    return () => {
      window.clearTimeout(startTimer);
      observer?.disconnect();
      gsap.killTweensOf(items);
    };
  }, []);

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
