"use client";

/**
 * The reference's scroll reveals, for the sections below the valley.
 *
 * components/valley/valleyBehaviour.ts already ports these from the
 * reference's app.js (animateTextH / animateTextP / animateCtn /
 * animateLine, initScrollElementsReveal, initHighlightText). That module is
 * not importable here: it is one function that also builds the preloader,
 * the hero's scrubbed scene, the bar canvases and the header, all bound to
 * the valley page's markup. So the four text animations and the two
 * initialisers are rewritten here on their own, with the reference's
 * numbers: durL 1.2, durS 0.4, stagger 0.1, delay 0.2, and the four
 * CustomEase curves.
 *
 * Markup contract, the reference's own:
 *   [data-scroll-reveal="h"]     split into words, thrown in from four
 *                                directions at scale 0
 *   [data-scroll-reveal="p"]     split into lines, lifted from 250% down
 *   [data-scroll-reveal="ctn"]   the element itself, from 100% down
 *   [data-scroll-reveal="line"]  a rule, wiped in from the left
 *   [data-scroll-reveal="w"]     an ancestor whose top edge triggers the
 *                                children inside it, so a block arrives as
 *                                one thing
 *   [data-highlight-text]        letters brighten from 10% as the block
 *                                crosses the middle of the screen
 */

import { useEffect, useLayoutEffect, type RefObject } from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

// The reference's constants (app.pretty.js L4500+), the same values
// valleyBehaviour uses.
const DUR_S = 0.4;
const DUR_L = 1.2;
const STAGGER = 0.1;
const DELAY_REVEAL = 0.2;

type Mode = "reveal" | "initial";
type Targets = Element | Element[] | NodeListOf<Element> | null | undefined;

let registered = false;
function registerOnce() {
  if (registered) return;
  registered = true;
  gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);
  // The same four curves the valley registers, by the same names and with
  // the same control points, so registering twice is a no-op either way.
  CustomEase.create("InOut", "0.76,0,0.24,1");
  CustomEase.create("Out", "0.25,1,0.5,1");
  CustomEase.create("In", "0.5,0,0.75,0");
  CustomEase.create("Ease", "0.25,0.1,0.25,1");
}

// The initial states are written before the browser paints, so a block
// never shows at full strength for one frame and then drops out to be
// animated in. useLayoutEffect does not exist on the server.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Runs the reference's reveals over everything inside `rootRef`.
 *
 * Under prefers-reduced-motion nothing is split and nothing moves: the
 * elements are simply made visible where they stand.
 */
export function useSondavenReveal(rootRef: RefObject<HTMLElement | null>): void {
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    registerOnce();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const splits: SplitText[] = [];
    const ctx = gsap.context(() => {
      const qa = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

      const keep = (s: SplitText) => {
        splits.push(s);
        return s;
      };

      /* animateTextH: words thrown in from alternating directions. */
      const textH = (targets: Targets, mode: Mode, delay?: number) => {
        if (!targets) return;
        gsap.utils.toArray<Element>(targets).forEach((el, index) => {
          const split = keep(
            new SplitText(el, {
              type: "words",
              tag: "span",
              wordsClass: "split-word",
              smartWrap: true,
            }),
          );
          const from = {
            yPercent: gsap.utils.wrap([-150, 75, -75, 150]),
            scale: 0,
            opacity: 0,
          };
          if (mode === "initial") {
            gsap.set(split.words, from);
            return;
          }
          gsap.fromTo(split.words, from, {
            yPercent: 0,
            scale: 1,
            opacity: 1,
            duration: DUR_L,
            delay: (delay ?? DELAY_REVEAL) + index * STAGGER * 0.5,
            stagger: { each: 0.25 * STAGGER, from: "random" },
            ease: "Out",
            overwrite: true,
          });
        });
      };

      /* animateTextP: lines lifted from 250% down. */
      const textP = (targets: Targets, mode: Mode, delay?: number) => {
        if (!targets) return;
        gsap.utils.toArray<Element>(targets).forEach((el, index) => {
          const split = keep(
            new SplitText(el, { type: "lines", linesClass: "split-line", aria: "none" }),
          );
          // A <br> leaves an empty line behind; put the break back so the
          // copy keeps the lines it was written with.
          el.querySelectorAll(".split-line").forEach((lineEl) => {
            if ((lineEl.textContent ?? "").trim() === "") {
              lineEl.replaceWith(document.createElement("br"));
            }
          });
          if (mode === "initial") {
            gsap.set(split.lines, { yPercent: 0, opacity: 0 });
            return;
          }
          gsap.fromTo(
            split.lines,
            { yPercent: 250, opacity: 0 },
            {
              yPercent: 0,
              opacity: 1,
              duration: DUR_L,
              delay: (delay ?? DELAY_REVEAL) + index * STAGGER * 0.25,
              stagger: 0.5 * STAGGER,
              ease: "Out",
              overwrite: true,
            },
          );
        });
      };

      /* animateCtn: the element itself, up from 100% of its own height. */
      const ctn = (targets: Targets, mode: Mode, delay?: number) => {
        if (!targets) return;
        const list = gsap.utils.toArray<Element>(targets);
        if (!list.length) return;
        if (mode === "initial") {
          gsap.set(list, { opacity: 0, yPercent: 0 });
          return;
        }
        gsap.fromTo(
          list,
          { opacity: 0, yPercent: 100 },
          {
            opacity: 1,
            yPercent: 0,
            duration: DUR_L,
            delay: delay ?? DELAY_REVEAL,
            stagger: 0.5 * STAGGER,
            ease: "Out",
            overwrite: true,
          },
        );
      };

      /* animateLine: a rule wiped in from the left. */
      const line = (targets: Targets, mode: Mode, delay?: number) => {
        if (!targets) return;
        const list = gsap.utils.toArray<Element>(targets);
        if (!list.length) return;
        if (mode === "initial") {
          gsap.set(list, { clipPath: "inset(0% 0% -1px 100%)" });
          return;
        }
        gsap.fromTo(
          list,
          { clipPath: "inset(0% 100% -1px 0%)" },
          {
            clipPath: "inset(0% 0% -1px 0%)",
            duration: DUR_L,
            delay: delay ?? DELAY_REVEAL,
            stagger: STAGGER,
            ease: "Out",
            overwrite: true,
          },
        );
      };

      const kinds: [string, (t: Targets, m: Mode, d?: number) => void][] = [
        ["h", textH],
        ["p", textP],
        ["ctn", ctn],
        ["line", line],
      ];
      for (const [kind, fn] of kinds) {
        for (const el of qa(`[data-scroll-reveal="${kind}"]`)) {
          if (reduced) {
            gsap.set(el, { visibility: "visible" });
            continue;
          }
          fn(el, "initial");
          gsap.set(el, { visibility: "visible" });
          ScrollTrigger.create({
            trigger: el.closest('[data-scroll-reveal="w"]') || el,
            start: "top bottom",
            once: true,
            onEnter: () => fn(el, "reveal", 0),
          });
        }
      }

      /* initParallax: [data-parallax="ctn-down"] drifts against the scroll
         over its own trip through the viewport, the reference's own -10%
         to 10% of its own height. The prologue's scene is the one element
         that has it, and it is what stops the sprigs from standing dead
         still while the type moves past them. */
      if (!reduced) {
        for (const el of qa('[data-parallax="ctn-down"]')) {
          gsap.fromTo(
            el,
            { yPercent: -10 },
            {
              yPercent: 10,
              ease: "none",
              scrollTrigger: {
                trigger: el,
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            },
          );
        }
      }

      /* initHighlightText: the quote's letters come up from 10% as the
         block crosses the screen, scrubbed by scroll. */
      if (!reduced) {
        for (const el of qa("[data-highlight-text]")) {
          const split = keep(
            new SplitText(el, { type: "chars", smartWrap: true, charsClass: "split-char" }),
          );
          if (!split.chars.length) continue;
          gsap
            .timeline({
              scrollTrigger: {
                trigger: el.closest("[data-highlight-wrapper]") || el,
                start: "top 75%",
                end: "bottom 50%",
                scrub: true,
              },
            })
            .from(split.chars, {
              opacity: 0.1,
              duration: DUR_S,
              ease: "Out",
              stagger: STAGGER,
            });
        }
      }

      ScrollTrigger.refresh();
    }, root);

    return () => {
      ctx.revert();
      // revert() kills the tweens; the splits have to be undone too or the
      // word and char spans stay in the DOM. Innermost first: the quote is
      // split into words and then those into characters, and undoing the
      // words first would leave the characters with nothing to go back to.
      for (let i = splits.length - 1; i >= 0; i -= 1) splits[i].revert();
    };
  }, [rootRef]);
}
