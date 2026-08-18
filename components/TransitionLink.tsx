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
 * Internal link that plays a full-viewport dark wipe before navigating.
 * The panel (#page-veil, rendered once in the root layout) slides up to
 * cover the screen, the route changes underneath it, and app/template.tsx
 * slides it away on the incoming page.
 */
export default function TransitionLink({
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
    // Ignore repeat clicks while a wipe is already in flight.
    if (veil.dataset.state === "wiping") return;
    veil.dataset.state = "wiping";

    const labelEl = document.getElementById("page-veil-label");
    if (labelEl) labelEl.textContent = veilLabel ?? "";

    gsap.killTweensOf(veil);
    gsap.fromTo(
      veil,
      { yPercent: 101 },
      {
        duration: 0.38,
        ease: "power3.inOut",
        onComplete: () => {
          veil.dataset.state = "covering";
          router.push(target);
        },
        yPercent: 0,
      },
    );
  };

  return <Link href={href} onClick={handleClick} {...rest} />;
}
