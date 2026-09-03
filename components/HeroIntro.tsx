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
import { sceneFx } from "@/components/sceneFx";
import BareThreeCanvas from "@/components/BareThreeCanvas";
import ThinkerStage, { type ThinkerTiming } from "@/components/ThinkerStage";
import { loadThinkerChunks } from "@/components/thinkerChunks";

gsap.registerPlugin(ScrollTrigger);

type HeroIntroProps = {
  children: ReactNode;
};

// Scroll-driven orbit of the tree: 60% of the intro's 35-degree sweep, the
// other way round (counter-clockwise from above).
const SCROLL_ORBIT = 0.6 * (35 * Math.PI) / 180;

// The panel starts growing when the name's exit is 60% done and finishes
// at the timeline's end. The hero spacer is stretched (270vh originally,
// now 432vh) so the growth takes 2.25x its original scroll length; the
// other tween fractions below are rescaled by 170/332 so the name, tree
// and orbit keep their old absolute pacing. The Thinker inside the panel
// starts breaking the moment it starts growing.
const PANEL_GROW_AT = 0.123;
const PANEL_GROW_DURATION = 0.877;

// The statue's stretch stays this many viewport-heights long no matter how
// much scroll room follows it — the hero spacer growing must not slow the
// break back down.
const STATUE_STRETCH_VIEWPORTS = 1.64;

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
  screenPower: 0,
  roomLight: 0,
  orbit: 0,
  backdropLevel: 0.4,
};
const HERO_POSE = {
  crtProgress: 0,
  halftone: 1,
  treeDrop: 0,
  glassName: 0,
  screenGlow: 0,
  screenPower: 1,
  roomLight: 1,
  orbit: 0,
  backdropLevel: 1,
};

// Minimum time the television is on screen before the reveal may start:
// the lamp coming on (0.3 s), the tube powering up (0.95 s), the name
// warming in by ~1.4 s, plus 3.4 s with the name up. The tree builds
// behind it; on a slow machine it simply holds the name a little longer —
// the tree is never shown loading.
const TV_DWELL_MS = 4800;

export default function HeroIntro({ children }: HeroIntroProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const heroLayerRef = useRef<HTMLDivElement | null>(null);
  const scrollSpaceRef = useRef<HTMLDivElement | null>(null);
  const statueSpaceRef = useRef<HTMLDivElement | null>(null);
  // The panel is "open" (worth drawing the statue) once it has grown past
  // a sliver; flipped by the scroll timeline, never on every frame.
  const [panelOpen, setPanelOpen] = useState(false);
  const panelOpenRef = useRef(false);
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
  const crtReadyRef = useRef(false);
  crtReadyRef.current = crtReady;
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

  // Loader feel. The television's assets are preloaded from the HTML head,
  // so their progress lands in one or two jumps (the GLB is one item); a
  // bar that mirrors that reads as a glitch. The displayed fill is
  // rate-limited — it can travel at most BAR_RATE of its width per
  // second, so a jump from 0 to 1 plays out over ~0.7 s — and the veil
  // only lifts once the bar has VISIBLY filled, so it always reads as a
  // load that completed. Between real progress it creeps a little so it
  // never sits still.
  useEffect(() => {
    if (tvShown) return undefined;
    const BAR_RATE = 1.4;
    let displayed = 0;
    let creep = 0;
    let raf = 0;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const target = crtProgressRef.current;
      creep = Math.min(creep + 0.12 * dt, 0.08);
      if (target >= 1) creep = 0;
      const goal = Math.min(1, target + (target < 1 ? creep : 0));
      displayed = Math.min(goal, displayed + BAR_RATE * dt);
      const fill = progressFillRef.current;
      if (fill) fill.style.width = `${Math.min(100, displayed * 100).toFixed(2)}%`;
      if (crtReadyRef.current && displayed >= 0.995) {
        tvShownAtRef.current = now;
        setTvShown(true);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [tvShown]);

  // Separate effect so these are only ever killed on unmount: a cleanup
  // tied to the readiness flags above ran the moment tvShown flipped and
  // froze the veil mid-fade.
  useEffect(() => {
    if (!tvShown) return undefined;
    const overlay = overlayRef.current;
    const tweens: gsap.core.Tween[] = [];
    // The veil is black over a black room: it can go quickly, and the lamp
    // then does the revealing.
    if (overlay) {
      tweens.push(
        gsap.to(overlay, {
          autoAlpha: 0,
          duration: 0.25,
          ease: "power2.out",
          pointerEvents: "none",
        }),
      );
    }
    // Switch-on. The room is dark. At 0.3 s the lamp comes on like a
    // filament bulb: it flares to several times its steady level in a few frames,
    // sags back below it, then settles with a small wobble — the overshoot
    // is what reads as incandescent rather than a fade. The tube powers up
    // once the lamp has settled, the name warms onto the phosphor once the
    // picture is steady.
    // Headless captures set ?tvDark to hold the room before the lamp, or
    // ?tvFlare to hold it at the lamp's flare.
    const search = window.location.search;
    const powerOn = gsap.timeline({ paused: search.includes("tvDark") });
    powerOn
      .to(sceneFx, { roomLight: 3.6, duration: 0.07, ease: "power3.in" }, 0.3)
      .to(sceneFx, { roomLight: 0.78, duration: 0.2, ease: "power2.out" }, 0.37)
      .to(sceneFx, { roomLight: 1.1, duration: 0.16, ease: "sine.inOut" }, 0.57)
      .to(sceneFx, { roomLight: 0.95, duration: 0.14, ease: "sine.inOut" }, 0.73)
      .to(sceneFx, { roomLight: 1, duration: 0.3, ease: "sine.out" }, 0.87)
      .to(sceneFx, { screenPower: 1, duration: 0.175, ease: "power1.inOut" }, 0.95)
      .to(sceneFx, { glassName: 1, duration: 0.8, ease: "power2.out" }, 1.4);
    if (search.includes("tvFlare")) {
      powerOn.pause(0.37);
    }
    tweens.push(powerOn as unknown as gsap.core.Tween);
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
    // Each word of the name lockup, with the end its letters start rising
    // from: "Kevin" from its LAST letter and "He." from its FIRST, so the
    // rise begins at the gap between the words and spreads to the outer
    // ends. y is in em so the travel scales with the clamp()ed font size
    // instead of being a fixed pixel drop that vanishes on a large display.
    const letterGroups = gsap.utils
      .toArray<HTMLElement>(root.querySelectorAll("[data-hero-letters]"))
      .map((group) => ({
        from: group.dataset.heroLetters === "rtl" ? "start" : "end",
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
          duration: 1.35,
          ease: "power2.inOut",
          paused: true,
          stagger: { each: 0.09, from: group.from as "start" | "end" },
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
        // The name leads the page. Each letter slides up from below its
        // word's base, starting at the gap between the words and spreading
        // outward. No opacity anywhere in this tween: the letters are
        // masked, not faded, which is what makes them read as rising out
        // of the page rather than materialising in front of it.
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

  // The document is taller than the viewport again (the scroll section
  // below), so until the reveal is done nothing may scroll: wheel, touch,
  // scroll keys, scrollbar drags — and anything that slips through snaps
  // back to the top.
  useLayoutEffect(() => {
    if (revealComplete) return undefined;
    const { body, documentElement } = document;
    const forceTop = () => {
      documentElement.scrollTop = 0;
      body.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    const block = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const SCROLL_KEYS = new Set([" ", "ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);
    const blockKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (SCROLL_KEYS.has(event.key)) event.preventDefault();
    };
    const options = { capture: true, passive: false } as AddEventListenerOptions;
    forceTop();
    window.addEventListener("wheel", block, options);
    window.addEventListener("touchmove", block, options);
    window.addEventListener("keydown", blockKeys, options);
    window.addEventListener("scroll", forceTop, { passive: true });
    return () => {
      window.removeEventListener("wheel", block, options);
      window.removeEventListener("touchmove", block, options);
      window.removeEventListener("keydown", blockKeys, options);
      window.removeEventListener("scroll", forceTop);
    };
  }, [revealComplete]);

  // The next page, on scroll: one scrubbed timeline over 432vh. The top
  // strip fades, the name sinks out of the bottom of the frame, and the
  // tree sinks out too while the camera orbits it counter-clockwise
  // through 60% of the intro's sweep; once the name has gone, a
  // viewport-sized panel grows from the centre until it fills the frame.
  useEffect(() => {
    const root = rootRef.current;
    const scrollSpace = scrollSpaceRef.current;
    if (!revealComplete || !root || !scrollSpace) return undefined;
    const strip = root.querySelector<HTMLElement>("[data-hero-strip]");
    const lockup = root.querySelector<HTMLElement>("[data-hero-lockup]");
    const panel = root.querySelector<HTMLElement>("[data-hero-panel]");
    if (!strip || !lockup || !panel) return undefined;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Exposed so headless captures can read the scrubbed state.
    (window as unknown as Record<string, unknown>).__scrollScene = true;
    const ctx = gsap.context(() => {
      // From the lockup's laid-out top (offsetTop ignores the transform the
      // scrub applies, so this stays right on refresh) to just past the
      // bottom of the viewport.
      const exitOffset = () => window.innerHeight - lockup.offsetTop + 8;
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        onUpdate: () => {
          const open = tl.progress() > 0.38;
          if (open !== panelOpenRef.current) {
            panelOpenRef.current = open;
            setPanelOpen(open);
          }
        },
        scrollTrigger: {
          end: "bottom bottom",
          invalidateOnRefresh: true,
          scrub: prefersReducedMotion ? true : 0.5,
          start: "top top",
          trigger: scrollSpace,
        },
      });
      // Times are fractions of the whole 432vh scroll: the hero's exit in
      // the first 0.205, the panel from 0.123 (see PANEL_GROW_AT).
      gsap.set(panel, { scale: 0, transformOrigin: "50% 50%" });
      tl.to(strip, { autoAlpha: 0, duration: 0.103 }, 0)
        .to(lockup, { y: exitOffset, duration: 0.205, ease: "power1.in" }, 0)
        .to(sceneFx, { treeDrop: 1, duration: 0.292, ease: "power1.in" }, 0)
        .to(sceneFx, { orbit: SCROLL_ORBIT, duration: 0.343 }, 0)
        .to(
          panel,
          { scale: 1, duration: PANEL_GROW_DURATION, ease: "power2.inOut" },
          PANEL_GROW_AT,
        );
    }, root);
    return () => {
      ctx.revert();
      sceneFx.treeDrop = 0;
      sceneFx.orbit = 0;
      delete (window as unknown as Record<string, unknown>).__scrollScene;
    };
  }, [revealComplete]);

  // The Thinker's chunks are cut in a worker from the moment the page
  // mounts, so the statue is ready by the time the scroll reaches it.
  useEffect(() => {
    void loadThinkerChunks().catch(() => undefined);
  }, []);

  // The stretch of scroll the statue's stage owns: from the panel starting
  // to grow to the bottom of the page, breaking from its very first pixel.
  // Read from the layout each time ScrollTrigger refreshes.
  const thinkerTiming = useCallback<ThinkerTiming>(() => {
    const scrollSpace = scrollSpaceRef.current;
    const statueSpace = statueSpaceRef.current;
    const viewportHeight = window.innerHeight;
    const documentTop = (element: HTMLElement | null) =>
      element ? element.getBoundingClientRect().top + window.scrollY : 0;
    // The hero timeline runs from the scroll space's top at the top of the
    // viewport to its bottom at the bottom.
    const heroStart = documentTop(scrollSpace);
    const heroLength = scrollSpace ? scrollSpace.offsetHeight - viewportHeight : 0;
    const growStart = heroStart + heroLength * PANEL_GROW_AT;
    const pageEnd = statueSpace
      ? documentTop(statueSpace) + statueSpace.offsetHeight - viewportHeight
      : growStart;
    // Pinned, not page-relative: the break keeps its pace however much
    // scroll room the growing panel needs after it.
    const end = Math.min(growStart + viewportHeight * STATUE_STRETCH_VIEWPORTS, pageEnd);
    return {
      breakAt: growStart,
      end,
      start: growStart,
    };
  }, []);

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
        // pointer-events-none is load-bearing: this layer sits above the
        // statue's panel, and without it every drag meant for the statue
        // dies here. The links inside re-enable their own events.
        className="pointer-events-none fixed inset-0 z-20"
        ref={heroLayerRef}
        style={{ transformOrigin: "0 0", willChange: "transform" }}
      >
        {children}
      </div>

      {/* The next page's panel: exactly the viewport, grown from the centre
          by the scroll timeline once the name has left. Above the canvas,
          below the type layer. Inside it, The Thinker: its own canvas,
          scaled with the panel, driven by the second spacer's scroll. */}
      <div
        className="pointer-events-none fixed inset-0 z-[15] bg-[#0a0a0a]"
        data-hero-panel
        style={{ transform: "scale(0)", transformOrigin: "50% 50%" }}
      >
        {revealComplete ? (
          <ThinkerStage active={panelOpen} timing={thinkerTiming} />
        ) : null}
      </div>

      {/* Scroll room. Every visible layer is fixed, so these spacers are the
          only thing giving the document height: the first drives the hero's
          exit and the panel's growth, the second gives the statue's breakup
          (which begins with the growth) the rest of its run — kept short on
          purpose, so the break outpaces the box. */}
      <div aria-hidden="true" className="h-[432vh]" ref={scrollSpaceRef} />
      <div aria-hidden="true" className="h-[62vh]" ref={statueSpaceRef} />

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
