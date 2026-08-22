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
import { sceneFx } from "@/components/sceneFx";
import BareThreeCanvas from "@/components/BareThreeCanvas";

type HeroIntroProps = {
  children: ReactNode;
};

// The two poses of the scene. The page LOADS as the television shot: camera
// pulled all the way back, the tube showing the name, the tree parked below
// the frame. The reveal then runs the old scroll choreography in reverse,
// automatically, into the flat hero.
const LOADING_POSE = {
  crtProgress: 1,
  halftone: 0,
  treeDrop: 1,
  glassName: 0,
  screenGlow: 1,
  backdropLevel: 0.4,
};
const HERO_POSE = {
  crtProgress: 0,
  halftone: 1,
  treeDrop: 0,
  glassName: 0,
  screenGlow: 0,
  backdropLevel: 1,
};

// Minimum time the television is on screen (name up) before the reveal may
// start. The tree builds behind it; on a slow machine it simply holds the
// name a little longer — the tree is never shown loading.
const TV_DWELL_MS = 2700;

export default function HeroIntro({ children }: HeroIntroProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const heroLayerRef = useRef<HTMLDivElement | null>(null);
  // The veil's bar is for the television's own assets only (GLB + four
  // textures): the thing the page is actually waiting on before it can
  // show anything.
  const [crtLoad, setCrtLoad] = useState({ loaded: 0, total: 100 });
  const [sceneReady, setSceneReady] = useState(false);
  const [crtReady, setCrtReady] = useState(false);
  const [tvShown, setTvShown] = useState(false);
  const [revealStarted, setRevealStarted] = useState(false);
  const [revealComplete, setRevealComplete] = useState(false);

  const crtProgress = crtLoad.total ? crtLoad.loaded / crtLoad.total : 0;
  const crtProgressRef = useRef(0);
  crtProgressRef.current = crtReady ? 1 : crtProgress;
  const tvShownAtRef = useRef(0);

  const handleCrtProgress = useCallback(
    (next: { loaded: number; total: number }) => {
      setCrtLoad({ loaded: Math.min(next.loaded, next.total), total: next.total });
    },
    [],
  );
  const handleSceneReady = useCallback(() => setSceneReady(true), []);
  const handleCrtReady = useCallback(() => setCrtReady(true), []);

  // The scene must be in the loading pose before its first frame. Children
  // mount first, but the canvas builds its scene asynchronously, so this
  // runs long before anything is drawn. Reset on unmount so a remount (or
  // the tuner) never starts half-way into the television.
  useLayoutEffect(() => {
    Object.assign(sceneFx, LOADING_POSE);
    // Exposed for headless verification (captures read and write these).
    (window as unknown as Record<string, unknown>).__sceneFx = sceneFx;
    return () => {
      Object.assign(sceneFx, HERO_POSE);
      delete (window as unknown as Record<string, unknown>).__sceneFx;
    };
  }, []);

  // Loader feel: the five asset loads land at irregular intervals, and a
  // bar frozen between them reads as a hang. Ease the displayed fill toward
  // the real progress and let it CREEP most of the way to the next item
  // while waiting; real progress snaps it forward.
  useEffect(() => {
    if (tvShown) return undefined;
    let displayed = 0;
    let creep = 0;
    let raf = 0;
    const step = () => {
      const target = crtProgressRef.current;
      creep = Math.min(creep + 0.002, 0.08);
      if (target >= 1) creep = 0;
      const goal = Math.min(1, target + (target < 1 ? creep : 0));
      displayed += (goal - displayed) * 0.14;
      const fill = progressFillRef.current;
      if (fill) fill.style.width = `${Math.min(100, displayed * 100).toFixed(2)}%`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [tvShown]);

  // The television appears as soon as the canvas reports it drawn with the
  // model and its textures in (before that the rig renders a crude
  // placeholder body, which must never be seen). The veil fades off and the
  // name comes up on the tube.
  useEffect(() => {
    if (crtReady && !tvShown) {
      setTvShown(true);
      tvShownAtRef.current = performance.now();
    }
  }, [crtReady, tvShown]);

  // Separate effect so these are only ever killed on unmount: a cleanup
  // tied to the readiness flags above ran the moment tvShown flipped and
  // froze the veil mid-fade.
  useEffect(() => {
    if (!tvShown) return undefined;
    const overlay = overlayRef.current;
    const tweens: gsap.core.Tween[] = [];
    if (overlay) {
      tweens.push(
        gsap.to(overlay, {
          autoAlpha: 0,
          duration: 0.5,
          ease: "power2.out",
          pointerEvents: "none",
        }),
      );
    }
    // The tube comes up empty, glowing and unsteady; the name warms onto
    // the phosphor half a second in.
    tweens.push(
      gsap.to(sceneFx, {
        delay: 0.5,
        duration: 0.8,
        ease: "power2.out",
        glassName: 1,
      }),
    );
    return () => {
      for (const tween of tweens) tween.kill();
    };
  }, [tvShown]);

  // Never strand the page: if the model fails to report (network, a stuck
  // decode), carry on with whatever the rig has after a grace period. The
  // canvas also reports "ready" on load failure, so this is belt and braces.
  useEffect(() => {
    if (crtReady) return undefined;
    const timeout = window.setTimeout(() => setCrtReady(true), 10000);
    return () => window.clearTimeout(timeout);
  }, [crtReady]);

  // The reveal starts once the tree scene is built AND the television has
  // had its minimum time on screen. Nothing about the tree's loading is
  // shown; the name simply holds until it is ready.
  useEffect(() => {
    if (!tvShown || !sceneReady || revealStarted) return undefined;
    let timeout = 0;
    const tryStart = () => {
      const remaining =
        TV_DWELL_MS - (performance.now() - tvShownAtRef.current);
      // Headless captures set __heroHold to keep the television shot open.
      const hold = (window as unknown as Record<string, unknown>).__heroHold;
      if (remaining > 0 || hold) {
        timeout = window.setTimeout(tryStart, Math.max(50, remaining));
        return;
      }
      setRevealStarted(true);
    };
    tryStart();
    return () => window.clearTimeout(timeout);
  }, [revealStarted, sceneReady, tvShown]);

  useEffect(() => {
    if (!revealStarted || revealComplete) return undefined;
    const timeout = window.setTimeout(() => setRevealComplete(true), 4000);
    return () => window.clearTimeout(timeout);
  }, [revealComplete, revealStarted]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

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
      Object.assign(sceneFx, HERO_POSE);
      gsap.set(heroItems, { autoAlpha: 1, clearProps: "filter,y" });
      for (const group of letterGroups) {
        gsap.set(group.letters, { y: 0, yPercent: 0 });
      }
      setRevealComplete(true);
      return undefined;
    }

    const ctx = gsap.context(() => {
      // Built HERE, paused, not inside the .add() callback below: context
      // only captures tweens created during its synchronous run, so tweens
      // born in a timeline callback would survive ctx.revert() and keep
      // ticking against detached nodes if the user navigates mid-intro.
      const letterTweens = letterGroups.map((group) =>
        gsap.to(group.letters, {
          duration: 0.9,
          ease: "power2.inOut",
          paused: true,
          stagger: { each: 0.06, from: group.from as "start" | "end" },
          yPercent: 0,
        }),
      );

      // Two seconds, automatic. Every strand ends at its own time: the name
      // leaves the glass first (0.45), the camera pushes in from the room to
      // nose-against-the-glass (0.15 -> 1.75) while the halftone dots come
      // up under it (0.95 -> 1.65) so the flat page's texture is fully in
      // before the switch to the flat path; the tree rises from below the
      // frame (0.1 -> 1.7) while the canvas runs its own orbit-and-bloom
      // intro over the same two seconds; the name rises through the
      // hairline (0.85 -> ~2.0) and the rest of the page fades in over the
      // top of it (1.0 -> 2.1).
      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => setRevealComplete(true),
      });
      timeline
        .to(sceneFx, { glassName: 0, duration: 0.45, ease: "power2.out" }, 0)
        .to(sceneFx, { screenGlow: 0, duration: 0.9, ease: "power2.out" }, 0)
        .to(
          sceneFx,
          { backdropLevel: 1, duration: 1.3, ease: "power2.inOut" },
          0.15,
        )
        .to(
          sceneFx,
          { crtProgress: 0, duration: 1.6, ease: "power2.inOut" },
          0.15,
        )
        .to(sceneFx, { halftone: 1, duration: 0.7, ease: "power1.in" }, 0.95)
        .to(sceneFx, { treeDrop: 0, duration: 1.6, ease: "power3.out" }, 0.1)
        // The name leads the page. Each letter slides up from behind the
        // hairline, "Kevin" running left to right and "He." right to left
        // so the two words resolve toward the centre. No opacity anywhere
        // in this tween: the letters are masked, not faded, which is what
        // makes them read as rising out of the bar rather than
        // materialising in front of it.
        .add(() => {
          for (const tween of letterTweens) tween.play();
        }, 0.85)
        .to(
          heroItems,
          {
            autoAlpha: 1,
            duration: 0.8,
            ease: "power3.out",
            filter: "blur(0px)",
            stagger: 0.1,
            y: 0,
          },
          1.0,
        );
      // Exposed so headless captures can scrub the reveal to a fixed time.
      (window as unknown as Record<string, unknown>).__heroTimeline = timeline;
    }, root);

    return () => {
      ctx.revert();
      delete (window as unknown as Record<string, unknown>).__heroTimeline;
    };
  }, [revealStarted]);

  // The canvas owns the DOM homography (same-frame application); on unmount
  // just clear whatever transform it left behind.
  useEffect(() => {
    const heroLayer = heroLayerRef.current;
    return () => {
      if (heroLayer) heroLayer.style.transform = "";
    };
  }, []);

  return (
    <section className="relative" id="top" ref={rootRef}>
      <BareThreeCanvas
        introActive={revealStarted}
        onCrtProgress={handleCrtProgress}
        onCrtReady={handleCrtReady}
        onReady={handleSceneReady}
        screenLayerRef={heroLayerRef}
      />

      {/* The website layer. While the camera is pulled back this whole
          viewport — text, nav, bar, everything — is warped onto the
          monitor's screen with a CSS homography that tracks the projected
          WebGL screen quad, so the site itself is the machine's display.
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

      {/* Black veil with the bar while the television's own assets load; it
          lifts to the television, which then shows the name while the tree
          builds behind it. Removed from the DOM when the reveal is done. */}
      {!revealComplete ? (
        <div
          aria-label="Loading"
          aria-live="polite"
          className="fixed inset-0 z-10 overflow-hidden bg-[#0a0a0a]"
          ref={overlayRef}
          role="status"
        >
          <div className="absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2">
            <div
              aria-valuemax={crtLoad.total}
              aria-valuemin={0}
              aria-valuenow={crtReady ? crtLoad.total : crtLoad.loaded}
              className="h-px w-full overflow-hidden bg-white/15"
              role="progressbar"
            >
              <div
                className="h-full bg-[#f0f0f0]"
                ref={progressFillRef}
                style={{ width: 0 }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
