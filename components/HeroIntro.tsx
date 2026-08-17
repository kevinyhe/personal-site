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
import BareThreeCanvas, {
  SCENE_BUILD_MILESTONE_TOTAL,
} from "@/components/BareThreeCanvas";

type HeroIntroProps = {
  children: ReactNode;
};

export default function HeroIntro({ children }: HeroIntroProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
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
    const scrollOptions = {
      capture: true,
      passive: false,
    } as AddEventListenerOptions;

    forceHeroTop();
    window.addEventListener("wheel", preventScrollInput, scrollOptions);
    window.addEventListener("touchmove", preventScrollInput, scrollOptions);

    return () => {
      window.removeEventListener("wheel", preventScrollInput, scrollOptions);
      window.removeEventListener("touchmove", preventScrollInput, scrollOptions);
    };
  }, [shouldLockScroll]);

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
    }, 4300);

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
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!prefersReducedMotion) {
      gsap.set(heroItems, {
        autoAlpha: 0,
        filter: "blur(6px)",
        y: 16,
      });
    }

    if (!revealStarted) {
      return undefined;
    }

    if (prefersReducedMotion) {
      gsap.set(veil, { "--intro-hole": "150vmax" });
      gsap.set(overlay, { autoAlpha: 0, pointerEvents: "none" });
      gsap.set(heroItems, { autoAlpha: 1, clearProps: "filter,y" });
      setRevealComplete(true);
      return undefined;
    }

    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => setRevealComplete(true),
      });

      timeline
        .to(progressEl, {
          autoAlpha: 0,
          duration: 0.3,
          y: 5,
        })
        .to(veil, {
          "--intro-hole": "150vmax",
          duration: 1.18,
          ease: "power3.inOut",
        })
        .to(
          heroItems,
          {
            autoAlpha: 1,
            duration: 0.86,
            ease: "power3.out",
            filter: "blur(0px)",
            stagger: 0.12,
            y: 0,
          },
          "-=0.52",
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

  return (
    <section className="relative min-h-screen" id="top" ref={rootRef}>
      <BareThreeCanvas
        introActive={revealStarted}
        onIntroComplete={handleTreeIntroComplete}
        onProgress={handleSceneProgress}
        onReady={handleSceneReady}
      />

      {children}

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
                className="h-full bg-[#f0f0f0] transition-[width] duration-300 ease-out"
                style={{ width: progressPercent }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
