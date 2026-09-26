"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import HalftoneField from "@/components/HalftoneField";
import { Narration, Stanza } from "@/components/Narration";
import WorkSection from "@/components/WorkSection";
import { HERO_NARRATION } from "@/components/siteContent";
import { useRevealOnScroll } from "@/components/useRevealOnScroll";

gsap.registerPlugin(ScrollTrigger);

/**
 * The sentence about me and the projects, on one ground.
 *
 * This is the run that used to live inside HeroIntro, lifted out so it can
 * follow a different opening. There it was welded to the television: the
 * narration's words were painted on the tube and warped with it, and only a
 * spacer of their height stood in the flow. The home page's opening is the
 * valley now (components/valley), which hands the page over the ordinary
 * way — nothing is pinned behind this any more — so the words are simply in
 * the flow and read as themselves.
 *
 * What is kept from the old run, because the pieces below still expect it:
 *   - `data-about-work` on the root. Both halves of the blossom scene gate
 *     their WebGL on it (NarrationScene), and the tree anchors on `#work`
 *     inside it (sakuraTree's makeNarrationTree).
 *   - `--narration-h`, the offset of the Work section, which is where the
 *     dot field starts. Over the sentence it would be dots laid across the
 *     words.
 *   - `--narration-fx` and `--narration-fx-vis`, the blossom scene's fade.
 *     It is set on this element rather than on the holders because the
 *     scene is a lazy chunk that may not have rendered when this effect
 *     runs, and a querySelectorAll then would find nothing to fade.
 */

// Lazy for the same reason HeroIntro loaded it lazily: the tree factory
// pulls in three, and importing it here would put the whole sakura stack in
// the page's first-load chunk. ssr: false — it renders into empty canvases
// on the server anyway.
const NarrationScene = dynamic(() => import("@/components/NarrationScene"), {
  ssr: false,
});

/**
 * How far the blossom scene recedes once the project list is running. The
 * tree is the backdrop to the sentence and to the Work heading; over the
 * list itself it competes with the titles, so it drops to half.
 */
const TREE_UNDER_LIST = 0.5;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default function IntroductionRun() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useRevealOnScroll(rootRef);

  useEffect(() => {
    const run = rootRef.current;
    if (!run) return undefined;

    const context = gsap.context(() => {
      const work = run.querySelector<HTMLElement>("#work");
      if (!work) return;

      // The curve is the one the run had when it lived on the television
      // (HeroIntro), kept to its numbers: in over the Work heading's
      // arrival, which is when the tree flowers, so the flowering is seen;
      // half strength once the first project is up; out over the last
      // screen, before the contact plate takes the page.
      let last = Number.NaN;
      const apply = () => {
        const view = window.innerHeight;
        const workTop = work.getBoundingClientRect().top;
        const runBottom = run.getBoundingClientRect().bottom;
        const fadeIn = clamp01((view * 0.9 - workTop) / (view * 0.3));
        const fadeOut = clamp01((runBottom - view * 0.2) / view);
        const recede =
          1 -
          (1 - TREE_UNDER_LIST) *
            clamp01((-view * 0.2 - workTop) / (view * 0.7));
        const fx = Math.min(fadeIn, fadeOut) * recede;
        if (fx === last) return;
        last = fx;
        run.style.setProperty("--narration-fx", fx.toFixed(3));
        run.style.setProperty(
          "--narration-fx-vis",
          fx > 0.001 ? "visible" : "hidden",
        );
      };

      const measure = () => {
        run.style.setProperty("--narration-h", `${work.offsetTop}px`);
        apply();
      };

      ScrollTrigger.create({
        trigger: run,
        start: "top bottom",
        end: "bottom top",
        onUpdate: apply,
        onRefresh: measure,
      });
      measure();
    }, run);

    return () => context.revert();
  }, []);

  return (
    // relative, and no z-index: the blossom scene's canvas is fixed at z-0
    // and lightens onto whatever is behind it. A z-index here would make
    // this a stacking context and the canvas would blend with nothing,
    // painting its own black over the page.
    <div className="relative text-[#f0f0f0]" data-about-work ref={rootRef}>
      {/* The dot field, starting where the projects do. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0"
        data-introduction-background
        style={{ top: "var(--narration-h, 100%)" }}
      >
        <HalftoneField />
      </div>

      <NarrationScene />

      {/* The sentence. Centred, the same three voices and the same six
          lines it has always had (siteContent's HERO_NARRATION); they rise
          into place on the page's own reveal rather than travelling
          sideways up a television screen. */}
      <section
        className="relative z-[1] px-6 pb-[6vh] pt-[30vh] sm:px-16"
        id="info"
      >
        <h2 className="sr-only">About</h2>
        <Narration>
          {HERO_NARRATION.map((lines, index) => (
            <Stanza center far key={index} lines={lines} />
          ))}
        </Narration>
      </section>

      <WorkSection />
    </div>
  );
}
