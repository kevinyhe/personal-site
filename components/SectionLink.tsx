"use client";

import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

type LenisLike = {
  scrollTo: (target: HTMLElement | string | number, options?: object) => void;
};

/**
 * Hands a scroll target to Lenis (components/SmoothScroll), which eases the
 * page there the same way a wheel does. Returns false when Lenis is not on
 * the page — before it mounts, or with JavaScript that failed — and leaves
 * the fallback to the caller, because the right one differs: an anchor can
 * just be an anchor, a button has to scroll something itself.
 *
 * Every section link on the page goes through here (the hero strip, the
 * fixed header) so there is one copy of the window.__lenis reach.
 *
 * `duration` is seconds. The page's scrubbed scenes play out under an eased
 * scroll, so a longer distance gets a longer ride rather than a faster one:
 * 1.4 between neighbouring sections, 1.6 from the hero strip (which is at
 * least the hero's four screens from anything), 2 for the whole page back
 * to the top.
 */
export function scrollWithLenis(
  target: HTMLElement | number,
  duration: number,
): boolean {
  const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
  if (!lenis) return false;
  lenis.scrollTo(target, { duration });
  return true;
}

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
 * it. But the page's scroll is eased by Lenis, and a native anchor jump
 * teleports past every scrubbed scene between here and there. Handing the
 * target to Lenis instead scrolls to it the same way a wheel does.
 *
 * Keyboard: Enter on a focused anchor fires click natively and lands in
 * the same handler. Space does not — on a link the browser scrolls the page
 * a screen instead — so it is caught here: the strip reads as three
 * buttons, and someone who has tabbed onto one and pressed Space meant the
 * link, not a page-down through the pinned hero.
 */

/** The focus mark, in the strip's own colour. The strip is painted on the
 *  hero stage, so an outline is the one mark that is visible over whatever
 *  the stage is showing behind it. */
const FOCUS_RING =
  "rounded-sm focus-visible:outline focus-visible:outline-1 " +
  "focus-visible:outline-offset-4 focus-visible:outline-current";

export default function SectionLink({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id: string;
}) {
  /** True when Lenis took the scroll; false leaves it to the browser. */
  const scrollTo = () => {
    const target = document.getElementById(id);
    if (!target) return false;
    return scrollWithLenis(target, 1.6);
  };

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
    if (scrollTo()) event.preventDefault();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== " ") return;
    // Without Lenis there is nothing better than the native jump, which
    // Space would not do on a link anyway; Enter still does.
    if (scrollTo()) event.preventDefault();
  };

  return (
    <a
      className={`${className ?? ""} ${FOCUS_RING}`}
      href={`#${id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </a>
  );
}
