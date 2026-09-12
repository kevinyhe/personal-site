"use client";

import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

type LenisLike = {
  scrollTo: (target: HTMLElement | string | number, options?: object) => void;
};

/**
 * Scrolls the page to a section, or to a document offset in px.
 *
 * With Lenis (components/SmoothScroll) on the page the ride is eased, the
 * same way a wheel scroll is, so the scrubbed scenes between here and there
 * play out. Without it the page moves in one step. Not `behavior: "smooth"`:
 * Lenis is absent because SmoothScroll stood down for prefers-reduced-motion
 * (or because it failed, or has not mounted yet), and in each case an eased
 * scroll is the wrong answer. Every section control on the page — the hero
 * strip's anchors, the fixed header's buttons — comes through here, so there
 * is one copy of the window.__lenis reach and one of the fallback.
 *
 * `duration` is seconds. The scenes are scrubbed by scroll position, so a
 * longer distance gets a longer ride rather than a faster one: 1.4 between
 * neighbouring sections (the header), 1.6 from the hero strip (which is at
 * least the hero's four screens from anything), 2 for the whole page back to
 * the top.
 */
export function scrollToSection(
  target: HTMLElement | number,
  duration: number,
): void {
  const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
  if (lenis) {
    lenis.scrollTo(target, { duration });
    return;
  }
  if (typeof target === "number") window.scrollTo(0, target);
  else target.scrollIntoView();
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
 *
 * Both handlers take the event over whenever the target is in the
 * document, and write the hash themselves (see scrollTo) so the URL says
 * where the reader is whichever scroll ran.
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
  /** False only when the section is not in the document, which leaves the
   *  anchor to the browser. */
  const scrollTo = () => {
    const target = document.getElementById(id);
    if (!target) return false;
    scrollToSection(target, 1.6);
    // Put the hash back. Taking the click means the browser never sets it,
    // so the URL stayed bare: reload, Back, or a copied link all landed at
    // the top of the page instead of the section the reader was on.
    // replaceState rather than pushState, which is what the anchor would
    // have done: the App Router owns this history entry and a one-pager
    // that stacks an entry per section makes Back walk up the page.
    window.history.replaceState(null, "", `#${id}`);
    return true;
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
    if (scrollTo()) event.preventDefault();
  };

  return (
    <a
      className={className}
      href={`#${id}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </a>
  );
}
