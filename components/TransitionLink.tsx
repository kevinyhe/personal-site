"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ComponentProps, type MouseEvent } from "react";
import gsap from "gsap";

type TransitionLinkProps = ComponentProps<typeof Link> & {
  /** Word shown on the wipe panel while the next route loads. */
  veilLabel?: string;
};

/**
 * Keyboard focus ring for every internal link. An outline rather than a
 * box-shadow ring so it needs no offset colour: it sits 4px outside the
 * text and shows whatever is behind it, dark page or cream contact block.
 */
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-current";

/**
 * How long the covering panel may sit over the outgoing page before this
 * stops waiting for app/template.tsx and clears it itself. The new route
 * normally mounts within a frame or two of the push (the link prefetched
 * it); anything past two seconds is a navigation that is not coming — a
 * push to the route we are already on, or one the router dropped — and a
 * black screen with one word on it is the worst way to find that out.
 */
const COVER_TIMEOUT_MS = 2000;

/**
 * The one armed failsafe, module-wide: there is one panel, so there is at
 * most one cover to watch. Kept here rather than on the panel so a new
 * wipe can cancel the previous wipe's timer — without that, click A's
 * timer (armed for t=2.38 s) would fire during click B's cover and slide
 * the panel off the OLD page while route B was still loading.
 */
let coverTimer = 0;

/**
 * Internal link that plays a full-viewport dark wipe before navigating.
 * The panel (#page-veil, rendered once in the root layout) slides up to
 * cover the screen, the route changes underneath it, and app/template.tsx
 * slides it away on the incoming page.
 *
 * `data-state` on the panel is the handshake between the two ends:
 *   (unset)    parked below the viewport
 *   wiping     sliding up; a push follows when it lands
 *   covering   fully over the page, push issued, waiting for the template
 *   clearing   the template is sliding it off
 * Without the panel, or under prefers-reduced-motion, it is a plain push.
 */
export default function TransitionLink({
  className,
  href,
  onClick,
  veilLabel,
  ...rest
}: TransitionLinkProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // Let the browser handle new-tab / download / non-primary clicks.
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    const target = typeof href === "string" ? href : (href.pathname ?? "/");
    event.preventDefault();
    if (target === pathname) return;

    const veil = document.getElementById("page-veil");
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!veil || prefersReducedMotion) {
      router.push(target);
      return;
    }
    // Ignore repeat clicks while a wipe is already in flight: the first
    // one's push is still coming, and restarting the tween from below the
    // viewport would make the panel jump.
    if (veil.dataset.state === "wiping") return;
    // "clearing" is the template sliding the previous wipe off the top
    // (0 -> -101). Clicking another link then is legitimate — the panel is
    // still partly on screen, so bring it back down from where it is rather
    // than snapping it to the bottom first.
    const fromParked = veil.dataset.state !== "clearing";
    veil.dataset.state = "wiping";

    const labelEl = document.getElementById("page-veil-label");
    if (labelEl) labelEl.textContent = veilLabel ?? "";

    gsap.killTweensOf(veil);
    window.clearTimeout(coverTimer);
    if (fromParked) parkVeil(veil, true);
    gsap.to(veil, {
      duration: 0.38,
      ease: "power3.inOut",
      onComplete: () => {
        veil.dataset.state = "covering";
        router.push(target);
        coverTimer = window.setTimeout(() => {
          // The template took over, or a later click did. Nothing to do.
          if (veil.dataset.state !== "covering") return;
          veil.dataset.state = "clearing";
          gsap.to(veil, {
            duration: 0.45,
            ease: "power3.inOut",
            onComplete: () => parkVeil(veil),
            yPercent: -101,
          });
        }, COVER_TIMEOUT_MS);
      },
      yPercent: 0,
    });
  };

  return (
    <Link
      className={className ? `${FOCUS_RING} ${className}` : FOCUS_RING}
      href={href}
      onClick={handleClick}
      {...rest}
    />
  );
}

/**
 * Put the panel below the viewport. Shared with app/template.tsx so the
 * two ends of a wipe cannot disagree about what "parked" means.
 *
 * `y: 0` is not decoration. The layout parks the panel with an inline
 * `translateY(101%)`; GSAP reads that back from the computed matrix as a
 * pixel `y` (808px on an 800px viewport) and keeps it, so a tween that only
 * touches yPercent runs from 202% to 101% — the wipe played entirely below
 * the screen and nobody ever saw it. Measured on the first e2e run: the
 * panel sat at translateY(1616px) for the whole of a "wipe".
 *
 * `keepLabel` is for the start of a wipe, when the caller has just written
 * the incoming page's word and only wants the panel reset under it.
 */
export function parkVeil(veil: HTMLElement, keepLabel = false) {
  gsap.set(veil, { y: 0, yPercent: 101 });
  if (keepLabel) return;
  delete veil.dataset.state;
  const labelEl = document.getElementById("page-veil-label");
  if (labelEl) labelEl.textContent = "";
}
