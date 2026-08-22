"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { sceneFx } from "@/components/sceneFx";
import BareThreeCanvas, {
  SCENE_BUILD_MILESTONE_TOTAL,
} from "@/components/BareThreeCanvas";

gsap.registerPlugin(ScrollTrigger);

type HeroIntroProps = {
  children: ReactNode;
};

export default function HeroIntro({ children }: HeroIntroProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const heroLayerRef = useRef<HTMLDivElement | null>(null);
  const taglineRef = useRef<HTMLDivElement | null>(null);
  const scrollSpaceRef = useRef<HTMLDivElement | null>(null);
  const [sceneProgress, setSceneProgress] = useState({
    loaded: 0,
    total: SCENE_BUILD_MILESTONE_TOTAL,
  });
  const [sceneReady, setSceneReady] = useState(false);
  const [revealStarted, setRevealStarted] = useState(false);
  const [revealComplete, setRevealComplete] = useState(false);
  const [treeIntroComplete, setTreeIntroComplete] = useState(false);

  const progress = sceneProgress.total
    ? sceneProgress.loaded / sceneProgress.total
    : 0;
  const sceneProgressRef = useRef(0);
  sceneProgressRef.current = progress;
  const progressPercent = `${progress * 100}%`;
  const shouldLockScroll = !(sceneReady && revealComplete && treeIntroComplete);

  const handleSceneProgress = useCallback(
    (nextProgress: { loaded: number; total: number }) => {
      setSceneProgress({
        loaded: Math.min(nextProgress.loaded, nextProgress.total),
        total: nextProgress.total,
      });
    },
    [],
  );

  const handleSceneReady = useCallback(() => {
    setSceneProgress((current) => ({
      loaded: current.total,
      total: current.total,
    }));
    setSceneReady(true);
  }, []);

  const handleTreeIntroComplete = useCallback(() => {
    setTreeIntroComplete(true);
  }, []);

  useLayoutEffect(() => {
    if (!shouldLockScroll) {
      return undefined;
    }

    const { body, documentElement } = document;
    const forceHeroTop = () => {
      documentElement.scrollTop = 0;
      body.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    const preventScrollInput = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    // The document is 360vh tall now (scroll drives the CRT scene), so the
    // wheel/touch block alone is not enough during the intro: Space/PageDown/
    // arrows, scrollbar drags and find-in-page all still move the page and
    // would scrub the CRT timeline mid-veil. Block scroll keys and snap any
    // scroll that slips through back to the top.
    const SCROLL_KEYS = new Set([
      " ",
      "ArrowDown",
      "ArrowUp",
      "End",
      "Home",
      "PageDown",
      "PageUp",
    ]);
    const preventScrollKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (SCROLL_KEYS.has(event.key)) event.preventDefault();
    };
    const scrollOptions = {
      capture: true,
      passive: false,
    } as AddEventListenerOptions;

    forceHeroTop();
    window.addEventListener("wheel", preventScrollInput, scrollOptions);
    window.addEventListener("touchmove", preventScrollInput, scrollOptions);
    window.addEventListener("keydown", preventScrollKeys, scrollOptions);
    window.addEventListener("scroll", forceHeroTop, { passive: true });

    return () => {
      window.removeEventListener("wheel", preventScrollInput, scrollOptions);
      window.removeEventListener("touchmove", preventScrollInput, scrollOptions);
      window.removeEventListener("keydown", preventScrollKeys, scrollOptions);
      window.removeEventListener("scroll", forceHeroTop);
    };
  }, [shouldLockScroll]);

  // Loader feel: milestones arrive seconds apart, and a bar frozen between
  // them reads as a hang. This eases the displayed fill toward the real
  // progress and lets it CREEP most of the way to the next milestone while
  // waiting, so the bar never stops moving; real progress snaps it forward.
  useEffect(() => {
    const fill = progressFillRef.current;
    if (!fill || revealStarted) return undefined;
    let displayed = 0;
    let creep = 0;
    let raf = 0;
    const step = () => {
      const target = sceneProgressRef.current;
      creep = Math.min(creep + 0.0035, 0.85 / SCENE_BUILD_MILESTONE_TOTAL);
      if (target >= 1) creep = 0;
      const goal = Math.min(1, target + (target < 1 ? creep : 0));
      displayed += (goal - displayed) * 0.12;
      fill.style.width = `${Math.min(100, displayed * 100).toFixed(2)}%`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [revealStarted]);

  useEffect(() => {
    if (!sceneReady || revealStarted) return undefined;

    setRevealStarted(true);
    return undefined;
  }, [revealStarted, sceneReady]);

  useEffect(() => {
    if (!revealStarted || (revealComplete && treeIntroComplete)) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setRevealComplete(true);
      setTreeIntroComplete(true);
    }, 6500);

    return () => window.clearTimeout(timeout);
  }, [revealComplete, revealStarted, treeIntroComplete]);

  useEffect(() => {
    const root = rootRef.current;
    const overlay = overlayRef.current;
    const veil = veilRef.current;
    const progressEl = progressRef.current;

    if (!root || !overlay || !veil || !progressEl) {
      return undefined;
    }

    const heroItems = gsap.utils.toArray<HTMLElement>(
      root.querySelectorAll("[data-hero-animate]"),
    );
    // Each word of the name lockup, with the direction its letters should
    // rise in. y is in em so the travel scales with the clamp()ed font size
    // instead of being a fixed pixel drop that vanishes on a large display.
    const letterGroups = gsap.utils
      .toArray<HTMLElement>(root.querySelectorAll("[data-hero-letters]"))
      .map((group) => ({
        from: group.dataset.heroLetters === "rtl" ? "end" : "start",
        letters: gsap.utils.toArray<HTMLElement>(
          group.querySelectorAll("[data-hero-letter]"),
        ),
      }));
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!prefersReducedMotion) {
      gsap.set(heroItems, {
        autoAlpha: 0,
        filter: "blur(6px)",
        y: 16,
      });
      // Parked below the hairline, at full opacity. The reveal is purely
      // positional — the clip-path on each word hides everything below the
      // bar, so the letters are simply out of sight until they rise through
      // it. 180% of their own height clears the bar with margin.
      //
      // `y: 0` is load-bearing. GSAP resolves the CSS translateY(180%) into
      // its PIXEL y component, not into yPercent, so setting yPercent alone
      // leaves a stale 455px y underneath it and a later tween to
      // `yPercent: 0` zeroes the wrong component — the letters complete their
      // tween without ever moving. Zeroing y here converts the start state to
      // pure yPercent so the tween owns the whole offset.
      for (const group of letterGroups) {
        gsap.set(group.letters, { y: 0, yPercent: 180 });
      }
    }

    if (!revealStarted) {
      return undefined;
    }

    if (prefersReducedMotion) {
      gsap.set(veil, { "--intro-hole": "150vmax" });
      gsap.set(overlay, { autoAlpha: 0, pointerEvents: "none" });
      gsap.set(heroItems, { autoAlpha: 1, clearProps: "filter,y" });
      for (const group of letterGroups) {
        gsap.set(group.letters, { y: 0, yPercent: 0 });
      }
      setRevealComplete(true);
      return undefined;
    }

    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => {
          setRevealComplete(true);
          // Re-capture scrubbed start values (the exit-letter tweens) now
          // that the intro has settled the letters at their final pose.
          ScrollTrigger.refresh();
        },
      });

      // Built HERE, paused, not inside the .add() callback below: context
      // only captures tweens created during its synchronous run, so tweens
      // born in a timeline callback would survive ctx.revert() and keep
      // ticking against detached nodes if the user navigates mid-intro.
      const letterTweens = letterGroups.map((group) =>
        gsap.to(group.letters, {
          duration: 1.05,
          ease: "power2.inOut",
          paused: true,
          stagger: { each: 0.07, from: group.from as "start" | "end" },
          yPercent: 0,
        }),
      );

      timeline
        .to(progressEl, {
          autoAlpha: 0,
          duration: 0.3,
          y: 5,
        })
        // Overlaps the progress fade instead of waiting for it — the veil
        // starts opening ~0.3s sooner.
        .to(
          veil,
          {
            "--intro-hole": "150vmax",
            duration: 1.45,
            ease: "power3.inOut",
          },
          0.08,
        )
        // The name leads. Each letter slides up from behind the hairline,
        // "Kevin" running left to right and "He." right to left so the two
        // words resolve toward the centre. No opacity anywhere in this tween:
        // the letters are masked, not faded, which is what makes them read as
        // rising out of the bar rather than materialising in front of it.
        .add(() => {
          for (const tween of letterTweens) tween.play();
        }, "-=0.62")
        .to(
          heroItems,
          {
            autoAlpha: 1,
            duration: 1.25,
            ease: "power3.out",
            filter: "blur(0px)",
            stagger: 0.17,
            y: 0,
          },
          "-=0.34",
        )
        .to(
          overlay,
          {
            autoAlpha: 0,
            duration: 0.2,
            pointerEvents: "none",
          },
          "-=0.18",
        );
    }, root);

    return () => ctx.revert();
  }, [revealStarted]);

  // CRT scroll scene. Scroll drives one scrubbed timeline, but the monitor
  // itself lives in WebGL (a real GLB, see BareThreeCanvas): the tweens here
  // write plain numbers into sceneFx, and the canvas render loop reads them
  // every frame to drive a camera pull-back. The metaphor is a camera that
  // was zoomed all the way into the CRT's glass — the site view IS the
  // screen content — panning outward until the whole monitor is in frame,
  // centred on the screen throughout. Lenis supplies inertia under the
  // native scroll; ScrollTrigger reads the native position, so the two
  // compose without either knowing about the other.
  useEffect(() => {
    const heroLayer = heroLayerRef.current;
    const tagline = taglineRef.current;
    const scrollSpace = scrollSpaceRef.current;
    if (!heroLayer || !tagline || !scrollSpace) {
      return undefined;
    }
    // The name's letters exit the way they arrived: sliding down behind the
    // hairline (each word still carries its clip), staggered from the outer
    // ends inward — the reverse of the intro rise.
    const exitLetterGroups = gsap.utils
      .toArray<HTMLElement>(heroLayer.querySelectorAll("[data-hero-letters]"))
      .map((group) => ({
        from: (group.dataset.heroLetters === "rtl" ? "start" : "end") as
          | "start"
          | "end",
        letters: gsap.utils.toArray<HTMLElement>(
          group.querySelectorAll("[data-hero-letter]"),
        ),
      }));

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Lenis only smooths; skipping it under reduced motion leaves the whole
    // scene fully functional on raw scroll.
    let lenis: Lenis | null = null;
    let rafCallback: ((time: number) => void) | null = null;
    if (!prefersReducedMotion) {
      lenis = new Lenis({ autoRaf: false });
      lenis.on("scroll", ScrollTrigger.update);
      rafCallback = (time: number) => lenis?.raf(time * 1000);
      gsap.ticker.add(rafCallback);
      gsap.ticker.lagSmoothing(0);
      // Exposed so headless captures can jump the smoothed scroll directly;
      // harmless in production.
      (window as unknown as Record<string, unknown>).__lenis = lenis;
    }
    // Also exposed for headless verification (stillness checks read these).
    (window as unknown as Record<string, unknown>).__sceneFx = sceneFx;


    const ctx = gsap.context(() => {
      gsap.set(tagline, { autoAlpha: 0, y: 40 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          end: "bottom bottom",
          invalidateOnRefresh: true,
          scrub: true,
          start: "top top",
          trigger: scrollSpace,
        },
      });

      if (prefersReducedMotion) {
        // Discrete steps instead of a continuous camera move; only opacity
        // actually animates.
        tl.to(heroLayer, { autoAlpha: 0, duration: 0.16 }, 0.02)
          .set(sceneFx, { crtProgress: 1, halftone: 0, treeDrop: 1 }, 0.3)
          .to(tagline, { autoAlpha: 1, duration: 0.14, y: 0 }, 0.78);
        return;
      }

      // The page text leaves FIRST, on the flat site — gone before the
      // pull-back can reveal any of the monitor. The name sinks back behind
      // the hairline letter by letter (reversing its intro rise), staggered
      // outer-ends-inward; the rest of the page fades over the top of it.
      for (const group of exitLetterGroups) {
        // .to, not fromTo: a hard-coded start of 0 replayed the letters
        // fully visible if a scrollbar drag slipped through the intro lock
        // and snapped back. .to captures whatever the letters are actually
        // doing, and the refresh after the reveal re-captures the settled
        // state.
        tl.to(
          group.letters,
          {
            duration: 0.1,
            ease: "power2.in",
            immediateRender: false,
            stagger: { each: 0.012, from: group.from },
            yPercent: 185,
          },
          0.02,
        );
      }
      tl
        .to(heroLayer, { autoAlpha: 0, duration: 0.16 }, 0.06)
        // Camera pull-back: the view first expands UPWARD into the scene
        // above the viewport (real rendered content, full width, no side
        // crop), then the tube edge and the TV reveal from the top.
        .to(
          sceneFx,
          { crtProgress: 1, duration: 0.5, ease: "power1.inOut" },
          0.12,
        )
        // The tree drops straight down out of the frame, starting with the
        // letter exit and moving faster than the text, so it is gone before
        // the text has finished fading. Every strand of the choreography
        // ends at its own time: tree 0.18, text ~0.22, dots 0.48, camera
        // 0.62, tagline 0.92.
        .to(
          sceneFx,
          { treeDrop: 1, duration: 0.16, ease: "power2.in" },
          0.02,
        )
        // The halftone dots dissolve into the smooth render as the pull-back
        // reveals the glass: full-screen the dots are the site's texture,
        // but on the tube the CRT shader's scanlines and phosphor mask take
        // over.
        .to(sceneFx, { halftone: 0, duration: 0.24 }, 0.24)
        .to(tagline, { autoAlpha: 1, duration: 0.14, y: 0 }, 0.78);
    });

    return () => {
      ctx.revert();
      // The canvas owns the homography now (same-frame application); on
      // unmount just clear whatever transform it left behind.
      heroLayer.style.transform = "";
      if (rafCallback) {
        gsap.ticker.remove(rafCallback);
        // lagSmoothing is a GLOBAL gsap setting; left at 0 it makes the
        // subpage reveal and route-wipe tweens jump after any long frame.
        gsap.ticker.lagSmoothing(500, 33);
      }
      lenis?.destroy();
      // ctx.revert() rewinds the scrubbed tweens, but belt-and-braces: a
      // remount must never start with the camera half-pulled-back.
      sceneFx.crtProgress = 0;
      sceneFx.treeDrop = 0;
      sceneFx.halftone = 1;
      delete (window as unknown as Record<string, unknown>).__lenis;
      delete (window as unknown as Record<string, unknown>).__sceneFx;
    };
  }, []);

  return (
    <section className="relative" id="top" ref={rootRef}>
      <BareThreeCanvas
        introActive={revealStarted}
        onIntroComplete={handleTreeIntroComplete}
        onProgress={handleSceneProgress}
        onReady={handleSceneReady}
        screenLayerRef={heroLayerRef}
      />

      {/* The website layer. On scroll this whole viewport — text, nav,
          bar, everything — is warped onto the monitor's screen with a CSS
          homography that tracks the projected WebGL screen quad, so the
          site itself reads as the machine's display, like the reference.
          fixed inset-0 is load-bearing: the transform makes this the
          containing block for the fixed overlay inside, so it must be
          exactly viewport-sized. transform-origin 0 0 because the
          homography maps from the viewport's top-left corner. */}
      <div
        className="fixed inset-0 z-20"
        ref={heroLayerRef}
        style={{ transformOrigin: "0 0", willChange: "transform" }}
      >
        {children}
      </div>

      {/* Post-transition line, centred over the scene, outside the display.
          Same Apparel italic as the "He." lockup. */}
      <div
        className="pointer-events-none fixed inset-0 z-30 grid place-items-center px-6"
        data-hero-tagline
        ref={taglineRef}
      >
        <p className="max-w-[26ch] text-balance text-center font-serif-display text-[clamp(1.9rem,4.4vw,4.2rem)] italic leading-[1.16] tracking-[-0.03em] text-white">
          I build robots, software, and systems that bring ideas to life.
        </p>
      </div>

      {/* Scroll room for the CRT scene; every visible layer is fixed, so this
          spacer is the only thing giving the document height. */}
      <div aria-hidden="true" className="h-[360vh]" ref={scrollSpaceRef} />

      {!revealComplete ? (
        <div
          aria-label="Loading"
          aria-live="polite"
          className="fixed inset-0 z-10 overflow-hidden"
          ref={overlayRef}
          role="status"
        >
          <div
            className="absolute inset-0 bg-[#0a0a0a]"
            ref={veilRef}
            style={{
              WebkitMaskImage:
                "radial-gradient(circle at center, transparent var(--intro-hole, 0vmax), #000 calc(var(--intro-hole, 0vmax) + 1px))",
              maskImage:
                "radial-gradient(circle at center, transparent var(--intro-hole, 0vmax), #000 calc(var(--intro-hole, 0vmax) + 1px))",
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2"
            ref={progressRef}
          >
            <div
              aria-valuemax={sceneProgress.total}
              aria-valuemin={0}
              aria-valuenow={sceneProgress.loaded}
              className="h-px w-full overflow-hidden bg-white/15"
              role="progressbar"
            >
              <div
                className="h-full bg-[#f0f0f0]"
                ref={progressFillRef}
                style={{ width: progressPercent }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
