"use client";

import { useEffect, type RefObject } from "react";
import gsap from "gsap";

/**
 * Reveals every [data-reveal] element inside `rootRef` as it enters the
 * viewport, in staggered batches. The elements start hidden in CSS (see the
 * [data-reveal] rule in globals.css) so nothing flashes before this runs.
 *
 * Shared by SubpageShell and the home page's sections, which want exactly
 * the same behaviour; `holdForVeil` is the one difference — a subpage
 * arrives under the transition wipe and has to wait for it to clear, the
 * home page does not.
 */
export function useRevealOnScroll(
  rootRef: RefObject<HTMLElement | null>,
  { holdForVeil = false }: { holdForVeil?: boolean } = {},
) {
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
      gsap.set(items, { opacity: 1, scaleX: 1 });
      return undefined;
    }

    // A rule is a hairline: it draws itself across instead of rising into
    // place, which is the one motion the page's own rules (the row borders,
    // the footer line) suggest but never had. `data-reveal="rule"` marks
    // one, the same way "far" and "slide" mark the risers below; a separate
    // [data-rule] attribute is still honoured for anything that used it.
    const isRule = (el: HTMLElement) =>
      el.dataset.reveal === "rule" || el.hasAttribute("data-rule");
    const rules = items.filter(isRule);
    const risers = items.filter((el) => !isRule(el));
    // Guarded: gsap warns "target not found" on an empty list, and a page
    // can legitimately have all of one kind and none of the other.
    // How far a riser travels. `data-reveal="far"` is the narration's, at
    // the reference's own 90px — measured off its markup, where every line
    // sits at translateY(90px) and opacity 0 until it enters. 18 is right
    // for a caption and nothing like enough for type at 80px.
    // "slide" lines are carried sideways by their own scrubbed parallax
    // (see HeroIntro) and must not also be lifted from below — this hook
    // only fades them in. "far" is the reference's 90px rise.
    const travelOf = (el: HTMLElement) =>
      el.dataset.reveal === "far" ? 90 : el.dataset.reveal === "slide" ? 0 : 18;
    if (risers.length) {
      gsap.set(risers, {
        autoAlpha: 0,
        y: (_index: number, el: HTMLElement) => travelOf(el),
      });
    }
    if (rules.length) {
      gsap.set(rules, { autoAlpha: 0, scaleX: 0, transformOrigin: "0% 50%" });
    }

    let observer: IntersectionObserver | null = null;
    let startTimer = 0;
    const waiting = new Set(items);

    // Everything that watches, taken down in one place: on unmount, and as
    // soon as the last element has been revealed. Safe to call twice. It
    // reads bindings declared further down (the listeners, the timers);
    // that is fine only because nothing calls it before start() has run.
    const stop = () => {
      window.clearTimeout(sweepTimer);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      observer = null;
    };

    const reveal = (batch: HTMLElement[]) => {
      if (!batch.length) return;
      batch.forEach((el) => {
        waiting.delete(el);
        observer?.unobserve(el);
      });
      // Nothing left to reveal means nothing left to listen for. Without
      // this the scroll listener, its per-frame document measure and the
      // failsafe timer below all ran for the life of the page — one more
      // rAF and a scrollHeight read on every scrolled frame, forever, to
      // check an empty set. The tweens just started still run; only the
      // watching stops.
      if (!waiting.size) stop();
      const batchRisers = batch.filter((el) => !isRule(el));
      const batchRules = batch.filter(isRule);
      if (batchRisers.length) {
        gsap.to(batchRisers, {
          autoAlpha: 1,
          duration: 0.75,
          ease: "power3.out",
          stagger: 0.09,
          y: 0,
        });
      }
      if (batchRules.length) {
        gsap.to(batchRules, {
          autoAlpha: 1,
          duration: 0.9,
          ease: "power3.inOut",
          scaleX: 1,
          stagger: 0.09,
        });
      }
    };

    const inDocumentOrder = (elements: HTMLElement[]) =>
      elements.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );

    // The bottom margin below holds an element back until it is 8% of a
    // screen INTO the viewport, which reads better than popping in at the
    // very edge — but it also means the last 8% of the document never
    // counts as intersecting. Anything flush with the page bottom (both
    // footers are) could therefore never reveal itself, and sat invisible
    // while still taking up its space. Reaching the end of the document
    // releases whatever is left.
    //
    // Coalesced into a frame. A wheel scroll from the top of the home page
    // to the bottom fired 511 scroll events, and each one measured the
    // document twice — 1022 reads of scrollHeight, which is the property
    // that forces a layout if anything is dirty. One check per painted
    // frame is all this can act on anyway.
    let scrollFrame = 0;
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        atDocumentEnd();
        if (!observerAlive) sweep();
      });
    };

    // scrollHeight, cached. It only moves when the page is relaid out, so
    // re-reading it mid-gesture buys nothing; but images and webfonts land
    // after this hook starts and DO change it, and a stale-too-tall value
    // would mean the footer never counts as reached and never reveals. So
    // it is re-measured on resize and whenever the cached one is older than
    // half a second — cheap during a scroll, never stale for long.
    let docHeight = 0;
    let docHeightAt = -Infinity;
    const measureDoc = () => {
      docHeight = document.documentElement.scrollHeight;
      docHeightAt = performance.now();
    };
    const onResize = () => {
      docHeightAt = -Infinity;
    };

    const atDocumentEnd = () => {
      if (performance.now() - docHeightAt > 500) measureDoc();
      if (window.scrollY + window.innerHeight < docHeight - 2) return;
      reveal(inDocumentOrder([...waiting]));
    };

    // Failsafe. Every word below the hero starts at `opacity: 0` in CSS
    // (globals.css) so nothing flashes before this takes over, which means
    // a page where this never runs is a page with NO TEXT ON IT. That is
    // too sharp a cliff to leave unguarded.
    //
    // `observerAlive` is the test: the callback below sets it the first
    // time it fires at all. Until it has, anything sitting in the viewport
    // and still waiting gets shown outright — on a timer for the first few
    // seconds, and on every scroll after that. Once the observer has proved
    // itself the sweep stops running, so the stagger and the -8% margin are
    // still what everybody actually sees.
    let observerAlive = false;
    let sweeps = 0;
    let sweepTimer = 0;
    const sweep = () => {
      const stranded = [...waiting].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.bottom > 0 && box.top < window.innerHeight;
      });
      if (stranded.length) reveal(inDocumentOrder(stranded));
    };
    const sweepSoon = () => {
      sweeps += 1;
      sweep();
      // Six passes at most, and none once the observer has spoken or the
      // set is empty. (`waiting.size` is checked here as well as in
      // reveal(): a sweep that finds nothing stranded reveals nothing, so
      // reveal() never gets the chance to stop the chain.)
      if (sweeps < 6 && !observerAlive && waiting.size) {
        sweepTimer = window.setTimeout(sweepSoon, 900);
      }
    };

    const start = () => {
      observer = new IntersectionObserver(
        (entries) => {
          observerAlive = true;
          // Reveal everything that entered together as one staggered batch.
          reveal(
            inDocumentOrder(
              entries
                .filter((entry) => entry.isIntersecting)
                .map((entry) => entry.target as HTMLElement),
            ),
          );
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
      );
      items.forEach((el) => observer?.observe(el));
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      // The timer is armed BEFORE the end-of-document check: on a short
      // page, or a reload at the bottom, that check reveals everything and
      // calls stop(), and a timer armed after it would outlive the
      // teardown it was meant to be cleared by.
      sweepTimer = window.setTimeout(sweepSoon, 900);
      atDocumentEnd();
    };

    // If we arrived under the transition wipe, hold the first batch until
    // the panel has mostly cleared so the stagger is actually visible.
    const veil = holdForVeil ? document.getElementById("page-veil") : null;
    if (veil?.dataset.state) {
      startTimer = window.setTimeout(start, 420);
    } else {
      start();
    }

    return () => {
      window.clearTimeout(startTimer);
      stop();
      gsap.killTweensOf(items);
    };
  }, [holdForVeil, rootRef]);
}
