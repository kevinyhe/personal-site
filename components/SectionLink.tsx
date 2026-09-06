"use client";

import { type MouseEvent, type ReactNode } from "react";

type LenisLike = {
  scrollTo: (target: HTMLElement | string | number, options?: object) => void;
};

/**
 * Link to a section of the home page.
 *
 * The hero's nav used to point at /work, /info and /contact — separate
 * routes, through TransitionLink's wipe. Those pages still exist, but the
 * same material is now on the home page below the hero, and navigating away
 * from a section you can simply scroll to is the wrong move.
 *
 * A plain `href="#work"` would work, and is what this falls back to: the
 * anchor is real, so it survives with JavaScript off and middle-click opens
 * it. But the page's scroll is eased by Lenis (components/SmoothScroll), and
 * a native anchor jump teleports past every scrubbed scene between here and
 * there. Handing the target to Lenis instead scrolls to it the same way a
 * wheel does.
 */
export default function SectionLink({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id: string;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Leave new-tab / non-primary clicks to the browser.
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    if (!lenis) return;
    event.preventDefault();
    lenis.scrollTo(target, { duration: 1.6 });
  };

  return (
    <a className={className} href={`#${id}`} onClick={handleClick}>
      {children}
    </a>
  );
}
