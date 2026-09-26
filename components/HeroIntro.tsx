"use client";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { sceneFx } from "@/components/sceneFx";
import BareThreeCanvas from "@/components/BareThreeCanvas";
import HalftoneField from "@/components/HalftoneField";
import { Narration, Stanza } from "@/components/Narration";
import { HERO_NARRATION } from "@/components/siteContent";
import WorkSection from "@/components/WorkSection";
import { useRevealOnScroll } from "@/components/useRevealOnScroll";

gsap.registerPlugin(ScrollTrigger);

/**
 * What is split out of the page's first load, and what is not.
 *
 * OUT: NarrationScene (the blossom scene's sakura stack). It is not
 * rendered until the reveal is done, several seconds after mount on any
 * machine (the television has to load and the name has to hold its
 * minimum), so its chunk is fetched under the intro and is long in by then.
 *
 * NOT out: BareThreeCanvas, and with it three itself. Two reasons. The
 * page LOADS as the television shot, so the canvas' code is needed on the
 * first client render — a dynamic() there is a round trip added before
 * the veil's bar can start, not a saving. And SakuraStage, sakuraTree and
 * sakuraBlossomMarks import the halftone shaders and resolveSceneQuality
 * from it, so it is in the narration's chunk anyway; splitting it here
 * would only have moved it, not shed it. A dynamic() on it was tried and
 * measured: 430 kB, with three's core still in the route's initial chunk
 * list.
 *
 * `ssr: false` because the lazy piece renders nothing the server could
 * usefully emit (a canvas).
 */
const NarrationScene = dynamic(() => import("@/components/NarrationScene"), {
  ssr: false,
});

/**
 * A lazy chunk that fails to load (offline, a deploy swapped the hashes
 * under a stale tab) throws from render. There is no app/error.tsx, so
 * without this the whole page would unmount to Next's default error
 * screen — for a decoration. The lazy piece renders nothing instead, and
 * the black it would have drawn over stands in for it.
 */
class StageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[HeroIntro] a stage failed to load", error, info.componentStack);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type HeroIntroProps = {
  children: ReactNode;
  /**
   * What fills the pin container after the hero's own scroll room, and so
   * how long the stage stays on screen.
   *
   * Left out, it is the run this component was built around: the narration
   * painted on the television's glass, then the projects, with the camera
   * backing out of the tube underneath them (/crt still has that page).
   *
   * Given, that run is replaced wholesale — the narration window, the sheet
   * over the stage and the about-and-work block are all skipped, and the
   * scroll effect's narration and pull-back passes find nothing to drive
   * and quietly do nothing. The home page passes the valley transition,
   * which shrinks the stage into a framed picture instead (see
   * components/ValleyTransition).
   */
  tail?: ReactNode;
};

// The hero's scroll room is one scrubbed timeline over a short spacer (see
// the markup: 200vh, so the timeline is one screen of scroll), and these
// are fractions of it. Everything in it happens together: the name's
// letters drop back under the line they rose through, the tree sinks out
// of the bottom of the frame while the camera swings a little round it,
// and the pink curtains behind it stay as they are. The narration's first line comes over the fold a beat
// after, and the moment it does the camera starts backing straight out of
// the television's glass (sceneFx.crtOut, driven from the narration run's
// own trigger, further down) until the set is about 70% of the screen. The
// words scroll up its screen the whole way.
//
// The letters' exit, start to finish, stagger included.
const NAME_EXIT_DURATION = 0.45;
// The tree's fall, and the swing round it that goes with it: 60% of the
// intro's 35-degree sweep, the other way round (counter-clockwise from
// above). Both as they were when the statue followed the tree.
const TREE_DROP_DURATION = 0.62;
const SCROLL_ORBIT = 0.6 * (35 * Math.PI) / 180;
const SCROLL_ORBIT_DURATION = 0.7;
// The way out of the glass, in screens of scroll from the narration's first
// line reaching the fold. Slow is the brief; the whole narration goes by
// on the way.
const CRT_OUT_OVER_SCREENS = 1.4;
// The dot matrix goes over the first part of it, where the tube's own
// raster takes over from it: scaled down, the dots moire against the
// scanlines (the loading shot does the same the other way round). And the
// backdrop comes down to this on the tube, which blooms and glows what it
// shows; the loading shot holds it at 0.4 for the same reason.
const HALFTONE_OUT_OVER = 0.45;
const TUBE_BACKDROP_LEVEL = 0.42;
// How far past the column's edge a line may sit at the start of its trip,
// as a fraction of the viewport's width. Two thoughts to a line makes a
// wide line, and a wide line has little room inside the column to move
// in; the block clips what crosses the edge (overflow-x-clip, below), so
// the overshoot never grows the page a scrollbar.
const NARRATION_OVERSHOOT = 0.06;
/**
 * Where a line sits at `edge`: -1 as it enters at the bottom, 0 mid-screen,
 * 1 as it leaves at the top. Lines alternate — even lines come in from the
 * left and travel right, odd lines from the right and travel left, each
 * reaching the centre as it leaves. That is the reference's own rule (its
 * data-scroll-speed flips sign line by line) and what was asked for: each
 * line moves the opposite way to the one before it. The old table of six
 * positions repeated a side at its fourth and fifth entries, so two lines
 * in a row went the same way.
 */
const narrationX = (line: HTMLElement, index: number, edge: -1 | 0 | 1) => {
  const width = window.innerWidth;
  const narrow = width < 700;
  const room = Math.max(0, ((line.parentElement?.clientWidth ?? 0) - line.offsetWidth) / 2);
  const span = Math.min(
    room + width * (narrow ? 0.03 : NARRATION_OVERSHOOT),
    width * 0.28,
  );
  const direction = index % 2 === 0 ? 1 : -1;
  return (-direction * span * (1 - edge)) / 2;
};

// The stretch of the Work section's approach the sheet shuts over: from
// its top at the bottom of the viewport to this far up it. Short, so the
// black is a beat and not a screen; the tree flowers in over it.
const SCRIM_SHUT_OVER = 0.25;
// Opacity past which the sheet counts as shut: the tree canvas stops
// drawing (sceneFx.covered).
// The last percent is invisible.
const SCRIM_SHUT_AT = 0.99;
// What the blossom scene settles to behind the project list, once the
// heading has gone by: the tree flowers in at full strength for the
// transition and then recedes, so the titles and their lines are read
// against a dim canopy and not a bright one. 1 is the tree as it bloomed.
const TREE_UNDER_LIST = 0.5;
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
// the lamp and tube coming on together (0.3 s), the name
// warming in by ~1.4 s, plus ~2.3 s with the name up. The tree builds
// behind it; on a slow machine it simply holds the name a little longer —
// the tree is never shown loading.
const TV_DWELL_MS = 3700;

export default function HeroIntro({ children, tail }: HeroIntroProps) {
  // Whether a tail replaces the television's own run. A boolean, not the
  // node: the node is a fresh element on every render and would retrigger
  // the scroll effect it gates.
  const hasTail = tail != null;
  const rootRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const heroLayerRef = useRef<HTMLDivElement | null>(null);
  const scrollSpaceRef = useRef<HTMLDivElement | null>(null);
  const narrationSpaceRef = useRef<HTMLDivElement | null>(null);
  // The narration itself, which is NOT in the flow: it lives in the layer
  // the canvas warps onto the television's glass, in a viewport-sized
  // window (`narrationWindowRef`), and is moved up through it by the scroll
  // (`narrationTrackRef`). The flow keeps a spacer of the same height
  // (`narrationSpaceRef`), so the page scrolls exactly as far as it would
  // have with the words in it.
  const narrationWindowRef = useRef<HTMLDivElement | null>(null);
  const narrationTrackRef = useRef<HTMLDivElement | null>(null);
  // The about-and-work run: the narration block and the Work section, one
  // element in the flow over the pinned stage. The scrim, the blossom
  // scene's fade and the camera's creep are all measured against it.
  const aboutWorkRef = useRef<HTMLDivElement | null>(null);
  const narrationScrimRef = useRef<HTMLDivElement | null>(null);
  // The black scrim over the stage has closed completely (the hand-over to
  // the Work section, below). Behind an opaque sheet the tree's canvas was
  // drawing a full-screen WebGL scene nobody could see; sceneFx.covered
  // stops its draw for as long as the sheet is shut. Flipped by the scrim's
  // trigger at SCRIM_SHUT_AT, never on every frame.
  const [scrimCovered, setScrimCovered] = useState(false);
  const scrimCoveredRef = useRef(false);
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
    sceneFx.dolly = 0;
    // Exposed for headless verification (captures read and write these).
    (window as unknown as Record<string, unknown>).__sceneFx = sceneFx;
    return () => {
      Object.assign(sceneFx, HERO_POSE);
      sceneFx.dolly = 0;
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
    // filament bulb: it overshoots its steady level by about half in a few
    // frames, sags back below it, then settles with a small wobble — the
    // overshoot is what reads as incandescent rather than a fade.
    //
    // The peak is held under the clipping point ON PURPOSE. roomLight is a
    // linear multiplier on every light in the room AND on what the glass
    // reflects of them (uRoomGlass), so the flare scales the whole shot.
    // Measured on the held television shot (1920x1080, sweeping roomLight
    // by hand): pure-white pixels are 0.00% of the frame up to 2.5, 0.76%
    // at 3.0 and 1.35% at 3.6, where the lamp's reflection in the glass
    // blows out and the room runs 3.4x its settled brightness. That read as
    // the whole page flashing white rather than a lamp coming on. 1.55
    // keeps the overshoot visible with no clipped pixels anywhere.
    //
    // The tube powers up WITH the lamp — one switch throws both — and the
    // name warms onto the phosphor once the picture is steady.
    // Headless captures set ?tvDark to hold the room before the lamp, or
    // ?tvFlare to hold it at the lamp's flare.
    const search = window.location.search;
    const powerOn = gsap.timeline({ paused: search.includes("tvDark") });
    powerOn
      .to(sceneFx, { roomLight: 1.55, duration: 0.07, ease: "power3.in" }, 0.3)
      .to(sceneFx, { roomLight: 0.88, duration: 0.2, ease: "power2.out" }, 0.37)
      .to(sceneFx, { roomLight: 1.05, duration: 0.16, ease: "sine.inOut" }, 0.57)
      .to(sceneFx, { roomLight: 0.98, duration: 0.14, ease: "sine.inOut" }, 0.73)
      .to(sceneFx, { roomLight: 1, duration: 0.3, ease: "sine.out" }, 0.87)
      // The tube's attack is the LAMP's attack: same start, same
      // back-loaded ease, so both surge in the same frames — the line
      // flashes as the filament bangs on and the raster opens through
      // the flare. Any mismatch in ramp shape read as one turning on
      // before the other, whichever way it leaned.
      .to(sceneFx, { screenPower: 1, duration: 0.1, ease: "power3.in" }, 0.3)
      .to(sceneFx, { glassName: 1, duration: 0.8, ease: "power2.out" }, 1.4);
    if (search.includes("tvFlare")) {
      powerOn.pause(0.37);
    }
    // Holds the raster mid-opening (the band about two thirds grown).
    if (search.includes("tvOpen")) {
      powerOn.pause(0.383);
    }
    // Holds the power-on at an arbitrary timeline second, for measuring
    // that the lamp and the tube light up in the same frames.
    const tvAt = /tvAt=([0-9.]+)/.exec(search);
    if (tvAt) {
      powerOn.pause(Number(tvAt[1]));
    }
    tweens.push(powerOn as unknown as gsap.core.Tween);
    return () => {
      for (const tween of tweens) tween.kill();
    };
  }, [tvShown]);

  // Never strand the page: if the model fails to report (network, a stuck
  // decode), carry on with whatever the rig has after a grace period. The
  // canvas also reports "ready" on load failure, so this is belt and braces.
  // Counted from mount, unconditionally: it must not wait on anything that
  // could itself hang, or it is no failsafe.
  useEffect(() => {
    if (crtReady) return undefined;
    const timeout = window.setTimeout(() => setCrtReady(true), 10000);
    return () => window.clearTimeout(timeout);
  }, [crtReady]);

  // The reveal starts once the tree scene is built AND the television has
  // had its minimum
  // time on screen. Nothing about any of that loading is shown; the name
  // simply holds until it is ready.
  useEffect(() => {
    if (!tvShown || !sceneReady || revealStarted) {
      return undefined;
    }
    let timeout = 0;
    const tryStart = () => {
      const remaining = TV_DWELL_MS - (performance.now() - tvShownAtRef.current);
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
      // Everything the television needs: the name leaving the glass, the
      // tube's glow dying, the room coming up, the camera pushing in
      // through the screen, the dot matrix arriving under it. This is the
      // page's own opening and it runs whatever follows the hero — a tail
      // replaces the way OUT of the television (the camera backing out with
      // the narration on the glass), not the way in.
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
        .to(sceneFx, { halftone: 1, duration: 0.7, ease: "power1.in" }, 0.95);
      timeline
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

  // The next page, on scroll: one scrubbed timeline over the hero's scroll
  // room. The top strip fades, the name drops back under the line it rose
  // through, the tree sinks out of frame as the camera swings a little
  // round it, and the camera
  // then backs straight out of the television's glass (see the constants
  // at the top of the file).
  useEffect(() => {
    const root = rootRef.current;
    const scrollSpace = scrollSpaceRef.current;
    // gate waits for it); the check is for the types.
    if (!revealComplete || !root || !scrollSpace) return undefined;
    const strip = root.querySelector<HTMLElement>("[data-hero-strip]");
    const lockup = root.querySelector<HTMLElement>("[data-hero-lockup]");
    if (!strip || !lockup) return undefined;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Exposed so headless captures can read the scrubbed state.
    (window as unknown as Record<string, unknown>).__scrollScene = true;
    // Set inside the context below; undone in this effect's cleanup.
    let removeNarrationRefresh = () => {};
    const ctx = gsap.context(() => {
      // The name leaves the way it came. On the reveal each letter rises
      // from under its word's base, starting at the gap between the two
      // words and spreading outward; here each drops back under it in the
      // same order. No opacity and no movement of the lockup itself: the
      // words are clipped at their base (CLIP_AT_BASE in app/page.tsx), so
      // a letter below the line is simply out of sight.
      const letterGroups = gsap.utils
        .toArray<HTMLElement>(lockup.querySelectorAll("[data-hero-letters]"))
        .map((group) => ({
          from: group.dataset.heroLetters === "rtl" ? "start" : "end",
          letters: gsap.utils.toArray<HTMLElement>(
            group.querySelectorAll("[data-hero-letter]"),
          ),
        }));
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          end: "bottom bottom",
          invalidateOnRefresh: true,
          // Small now that the PAGE itself glides (components/SmoothScroll).
          // This used to carry all the smoothing at 1.4, which on top of an
          // eased scroll would smooth twice and read as the scene dragging
          // behind the page. Enough is left to take the edge off.
          scrub: prefersReducedMotion ? true : 0.3,
          start: "top top",
          trigger: scrollSpace,
        },
      });
      // A timeline is only as long as its longest child, and every offset
      // here is written as a fraction of the WHOLE scroll — so the length
      // is pinned to 1 explicitly, or the scrub would stretch whatever
      // the longest tween happens to be over the full scroll.
      tl.set({}, {}, 1);
      // The name leaves the way it came — but only when the stage is going
      // to scroll away under it. With a tail the stage does not leave, it
      // shrinks into a framed picture, and the name is part of the picture:
      // it goes down with the whole screen rather than dropping out of it
      // first. Same for the strip; a page that fades its own furniture and
      // then shrinks is doing the move twice.
      if (!hasTail) {
        tl.to(strip, { autoAlpha: 0, duration: 0.25 }, 0);
        for (const group of letterGroups) {
          const each = 0.018;
          tl.to(
            group.letters,
            {
              duration: NAME_EXIT_DURATION - each * (group.letters.length - 1),
              ease: "power2.in",
              stagger: { each, from: group.from as "start" | "end" },
              yPercent: 180,
            },
            0,
          );
        }
      }
      // The tree sinks and the camera swings, as one move — but only when
      // the run below is the television's. When a tail takes over, the
      // stage does not scroll away, it shrinks into a framed picture
      // (ValleyTransition), and a picture of the scene the tree has just
      // sunk out of is a picture of nothing. The tree stays; the camera
      // still swings, so the picture is not a frozen frame.
      if (!hasTail) {
        tl.to(
          sceneFx,
          { treeDrop: 1, duration: TREE_DROP_DURATION, ease: "power1.in" },
          0,
        );
      }
      // The camera used to swing round the tree as the page scrolled. With a
      // tail it does not: the move there is a straight pull-back down the
      // view axis (sceneFx.dolly, driven by ValleyTransition), and a turn on
      // top of it reads as the tree spinning rather than as the camera
      // leaving. The television's own run still swings, which is where the
      // orbit was written for.
      if (!hasTail) {
        tl.to(sceneFx, { orbit: SCROLL_ORBIT, duration: SCROLL_ORBIT_DURATION }, 0);
      }


      // ------------------------------------------------------------------
      // The narration, on the glass.
      //
      // The words are in the layer the canvas warps onto the television
      // (see the markup), so they cannot scroll by being in the flow. The
      // track they are set in is moved instead: its top is kept where the
      // flow's spacer is, which is where it would have been. Same page
      // speed, same distance, and the homography carries all of it onto
      // the tube.
      //
      // Each line travels sideways over its own trip through the window
      // (in from its side at the bottom, to the centre as it leaves at the
      // top, alternate lines from alternate sides: narrationX) and fades
      // over the first and last eighth of it. These were a ScrollTrigger a
      // line; a trigger measures its element in the document, and these
      // are no longer anywhere in it. The numbers are the same ones, read
      // off the track's own layout on refresh.
      const track = narrationTrackRef.current;
      const narrationWindow = narrationWindowRef.current;
      const narrationSpace = narrationSpaceRef.current;
      const slides = gsap.utils.toArray<HTMLElement>(
        root.querySelectorAll("[data-narration-slide]"),
      );
      const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
      const offsetWithin = (element: HTMLElement, ancestor: HTMLElement) => {
        let top = 0;
        let node: HTMLElement | null = element;
        while (node && node !== ancestor) {
          top += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        return top;
      };
      let lineLayout: { from: number; height: number; top: number }[] = [];
      const measureNarration = () => {
        if (!track || !narrationSpace) return;
        narrationSpace.style.height = `${track.offsetHeight}px`;
        lineLayout = slides.map((line, index) => ({
          from: narrationX(line, index, -1),
          height: line.offsetHeight,
          top: offsetWithin(line, track),
        }));
      };
      let lastTrackY = Number.NaN;
      const placeNarration = (trackY: number, vh: number) => {
        if (!track || !narrationWindow || trackY === lastTrackY) return;
        lastTrackY = trackY;
        const onScreen = trackY < vh && trackY + track.offsetHeight > 0;
        narrationWindow.style.visibility = onScreen ? "visible" : "hidden";
        if (!onScreen) return;
        track.style.transform = `translate3d(0, ${trackY.toFixed(2)}px, 0)`;
        slides.forEach((line, index) => {
          const layout = lineLayout[index];
          if (!layout) return;
          const trip = clamp01(
            (vh - (trackY + layout.top)) / (vh + layout.height),
          );
          const travel = prefersReducedMotion ? 0.5 : trip;
          const fade = prefersReducedMotion
            ? 1
            : Math.min(1, trip / 0.125, (1 - trip) / 0.125);
          line.style.transform = `translate3d(${(layout.from * (1 - travel)).toFixed(2)}px, 0, 0)`;
          line.style.opacity = Math.max(0, fade).toFixed(3);
        });
      };

      // ------------------------------------------------------------------
      // The black, then the tree again.
      //
      // Nothing dims the television while the narration runs: the words
      // are on its screen, not over the picture of it.
      //
      // The sheet shuts over the quarter screen before the Work section's
      // top (SCRIM_SHUT_OVER), and the blossom scene comes up over it as
      // the tree flowers in: sakuraTree anchors the tree's bloom on #work's
      // top rising through the first nine tenths of the viewport, and the
      // scene's holders are faded in over the first third of that rise.
      // Out again over the last screen before the run's bottom, where the
      // Contact plate takes over.
      //
      // One trigger over the whole run and no tweens: the numbers are
      // arithmetic on the trigger's own start and end and the Work
      // section's offset in the run — measured on refresh, never per
      // update — and each style is written only when it moved.
      const run = aboutWorkRef.current;
      const scrim = narrationScrimRef.current;
      const work = run?.querySelector<HTMLElement>("#work");
      if (run && scrim && work) {
        // The spacer has to have its height before anything below it is
        // measured, on the first pass and on every refresh after it.
        measureNarration();
        ScrollTrigger.addEventListener("refreshInit", measureNarration);
        removeNarrationRefresh = () =>
          ScrollTrigger.removeEventListener("refreshInit", measureNarration);
        let workOffset = work.offsetTop;
        let lastAlpha = -1;
        let lastFx = -1;
        const apply = (self: ScrollTrigger) => {
          const vh = window.innerHeight;
          const scroll = self.scroll();
          const runTop = self.start + vh - scroll;
          const runBottom = self.end - scroll;
          const workTop = runTop + workOffset;
          const shut = clamp01((vh - workTop) / (vh * SCRIM_SHUT_OVER));
          const alpha = shut;
          // The way out of the glass, from the first line reaching the
          // fold. Eased at both ends: it gathers way as the words arrive
          // and settles at the far end, where a linear one starts and
          // stops with the wheel. Written straight, no scrub: the page
          // itself glides (SmoothScroll).
          const outRaw = clamp01(
            (vh - runTop - lineLayout[0]?.top) / (vh * CRT_OUT_OVER_SCREENS),
          );
          const out = 0.5 - 0.5 * Math.cos(Math.PI * outRaw);
          sceneFx.crtOut = out;
          sceneFx.halftone = 1 - clamp01(out / HALFTONE_OUT_OVER);
          sceneFx.backdropLevel =
            1 - (1 - TUBE_BACKDROP_LEVEL) * clamp01(out / 0.6);
          // The spacer is the run's first child, so the run's top IS where
          // the words would be in the flow.
          placeNarration(runTop, vh);
          if (alpha !== lastAlpha) {
            lastAlpha = alpha;
            // Hidden as well as clear at rest: a sheet at opacity 0 still
            // composites over two WebGL canvases every frame.
            scrim.style.opacity = alpha.toFixed(3);
            scrim.style.visibility = alpha > 0.001 ? "visible" : "hidden";
            // The words sit in a layer ABOVE the sheet, so they go out with
            // it rather than being left standing on the black.
            if (narrationWindow) {
              narrationWindow.style.opacity = (1 - alpha).toFixed(3);
            }
            const covered = alpha >= SCRIM_SHUT_AT;
            if (covered !== scrimCoveredRef.current) {
              scrimCoveredRef.current = covered;
              sceneFx.covered = covered;
              setScrimCovered(covered);
            }
          }
          const fadeIn = clamp01((vh * 0.9 - workTop) / (vh * 0.3));
          const fadeOut = clamp01((runBottom - vh * 0.2) / vh);
          // Recedes over the first project's arrival: from the heading's
          // block leaving the top to a screen later (TREE_UNDER_LIST).
          const recede =
            1 - (1 - TREE_UNDER_LIST) * clamp01((-vh * 0.2 - workTop) / (vh * 0.7));
          const fx = Math.min(fadeIn, fadeOut) * recede;
          if (fx !== lastFx) {
            lastFx = fx;
            run.style.setProperty("--narration-fx", fx.toFixed(3));
            run.style.setProperty(
              "--narration-fx-vis",
              fx > 0.001 ? "visible" : "hidden",
            );
          }
        };
        const trigger = ScrollTrigger.create({
          end: "bottom top",
          onRefresh: (self) => {
            workOffset = work.offsetTop;
            run.style.setProperty("--narration-h", `${workOffset}px`);
            lastTrackY = Number.NaN;
            apply(self);
          },
          onUpdate: apply,
          start: "top bottom",
          trigger: run,
        });
        run.style.setProperty("--narration-h", `${workOffset}px`);
        apply(trigger);
      }
    }, root);
    // The display serif is loaded with font-display: swap, and when it
    // lands the narration's stanzas change height, which moves every
    // trigger start below them. ScrollTrigger measures on its own
    // schedule (load, resize); a font swap is neither. One refresh once
    // the fonts have settled — a no-op if they were in before this ran.
    let fontsLive = true;
    if (typeof document.fonts?.ready?.then === "function") {
      void document.fonts.ready.then(() => {
        if (fontsLive) ScrollTrigger.refresh();
      });
    }
    return () => {
      fontsLive = false;
      removeNarrationRefresh();
      ctx.revert();
      // The next run's trigger starts at 0 and only reports changes, so a
      // flag left shut here would keep the canvas from drawing for good.
      scrimCoveredRef.current = false;
      setScrimCovered(false);
      sceneFx.covered = false;
      sceneFx.treeDrop = 0;
      sceneFx.orbit = 0;
      sceneFx.crtOut = 0;
      sceneFx.backdropLevel = 1;
      sceneFx.halftone = 1;
      delete (window as unknown as Record<string, unknown>).__scrollScene;
    };
  }, [hasTail, revealComplete]);

  // Reveal the section rules; the scrolling narration stays visible
  // independently of this observer.
  useRevealOnScroll(rootRef);

  // Exposed so headless captures can tell whether the canvas is drawing
  // once the scrim has closed.
  useEffect(() => {
    const debug = { covered: scrimCovered };
    (window as unknown as Record<string, unknown>).__narrationScrim = debug;
    return () => {
      delete (window as unknown as Record<string, unknown>).__narrationScrim;
    };
  }, [scrimCovered]);

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
      {/* The pin container, and everything pinned inside it: the tree
          canvas, the type, the narration's sheet over them. Its
          height is the two spacers at the bottom of this file — the hero's
          own run, then the narration's — so the stage stays on screen
          across both and only scrolls away at the end of the second.

          Its height is deliberately NOT what the choreography is measured
          against. That is the first spacer, which the timeline triggers on
          on; the container being longer is what
          buys the narration its scroll without stretching the intro. */}
      <div className="relative">
        {/* Exactly one viewport, pinned to the top of it. The height comes
            from the same custom property the canvases size against, so the
            stage, the type layer and the WebGL drawing buffer cannot
            disagree about how tall a screen is on mobile. */}
        <div
          className={
            "sticky top-0 h-[var(--arbor-screen-h)] w-full overflow-hidden" +
            // An explicit layer only when a tail is driving the stage. The
            // valley transition puts one canvas of hills behind the stage
            // and another in front of it, which needs all three to be on a
            // stated z, not on document order.
            (hasTail ? " z-[1]" : "")
          }
          data-hero-stage
        >
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
          absolute inset-0 is load-bearing: `will-change: transform` makes
          this the containing block for the fixed overlay inside, so it must
          be exactly viewport-sized. transform-origin 0 0 because the
          homography maps from the viewport's top-left corner. (It was
          `fixed inset-0`, which came to the same thing while the stage was
          pinned and the wrong thing once the stage scrolled away.) */}
      <div
        // pointer-events-none: the layer covers the whole stage. The links
        // inside re-enable their own events.
        className="pointer-events-none absolute inset-0 z-20"
        ref={heroLayerRef}
        style={{ transformOrigin: "0 0", willChange: "transform" }}
      >
        {children}
        {/* The narration, on the glass. A window the size of the screen,
            and in it the track the scroll moves up through it (see the
            scroll effect). In THIS layer because this is the layer the
            canvas warps onto the television: whatever is in it is on the
            tube, at whatever size the tube is. The flow keeps a spacer of
            the track's height under #info. overflow-hidden clips the
            sideways overshoot too (narrationX). Hidden until the scroll
            reaches it. Skipped entirely when a `tail` replaces the run
            these words belong to. */}
        {tail ? null : (
          <div
            className="absolute inset-0 overflow-hidden text-[#f0f0f0]"
            data-narration-window
            ref={narrationWindowRef}
            // The shadow is for the stretch of a line that crosses the aurora's
            // highlights, where white on near-white was lost. Wide and soft,
            // so it darkens the picture behind the words without drawing a
            // box round them.
            style={{
              textShadow:
                "0 0 0.3em rgba(4, 4, 10, 0.9), 0 0 1.1em rgba(4, 4, 10, 0.7)",
              visibility: "hidden",
            }}
          >
            <div
              className="px-6 pb-[35vh] pt-[10vh] text-center will-change-transform sm:px-16"
              ref={narrationTrackRef}
            >
              <Narration stage>
                {HERO_NARRATION.map((lines, index) => (
                  <Stanza center key={index} lines={lines} slide />
                ))}
              </Narration>
            </div>
          </div>
        )}
      </div>

      {/* The sheet over the stage: clear while the narration runs on the
          television, shut to black for the hand-over to the Work section
          (the scrim's trigger, above). Above the canvas, below the type
          layer, which is why the narration's window fades with it.
          Hidden as well as clear at rest: a sheet at opacity 0 still
          composites over the canvas every frame. */}
      {tail ? null : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[17] bg-[#0a0a0a]"
          data-narration-scrim
          ref={narrationScrimRef}
          style={{ opacity: 0, visibility: "hidden" }}
        />
      )}
      {/* Black veil with the bar while the television's own assets load; it
          lifts to the television, which then shows the name while the tree
          builds behind it. Removed from the DOM when the reveal is done. */}
      {!revealComplete ? (
        <div
          aria-label="Loading"
          aria-live="polite"
          className="absolute inset-0 z-10 overflow-hidden bg-[#0a0a0a]"
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
        </div>

        {/* Scroll room, in two parts, both inside the pin container above so
            the stage stays put across the whole of it.

            The first is the hero's own run and nothing about it has moved:
            the timeline below triggers on THIS element, so its length still
            sets every cue from the name's exit to the end of the pull-back. The
            second is the narration's, and it only exists because the
            container is taller than the trigger — lengthening the trigger
            would have stretched the whole intro to fit it.

            The negative margin cancels the sticky stage's own place in the
            flow, so these two are what give the container its height. */}
        <div style={{ marginTop: "calc(var(--arbor-screen-h) * -1)" }}>
          {/* With a tail, the hero's own scroll room is gone: every tween it
              held (the strip, the letters, the tree drop, the orbit) is
              skipped with a tail, so its two screens were two screens of
              scrolling where nothing moved. The transition's own lead is
              the pause before the landscape; this only has to be as tall as
              its lead is short of a screen, so the pull-back starts on the
              first wheel tick. */}
          <div
            aria-hidden="true"
            className={hasTail ? "h-[40vh]" : "h-[200vh]"}
            ref={scrollSpaceRef}
          />
          {/* The about-and-work run, IN FLOW, over the pinned stage: the
              narration, then the projects, on one ground.

              The narration's words are not in it (they are on the
              television, in the stage above); its spacer is, so the scroll
              is as long as the words are. The projects follow straight on
              — the reference's own order, with nothing between the sentence
              and the list — over the black the television shot ends on,
              with the tree flowering in behind the heading
              (NarrationScene).

              The run's height is what extends the pin container, so the
              stage stays behind it for exactly as long as there are words
              and work. relative so it paints over the sticky stage (later
              in the tree, so it wins), but NO z-index: a z-index would make
              this block a stacking context, and the tree's canvas inside it
              (SakuraStage, fixed, mix-blend-lighten) would then blend with
              nothing and paint its black frame over the stage — measured
              as a black screen the moment the narration came within a
              screen of the fold. Without one the canvas lightens the stage
              itself, and its black adds nothing. */}
          {tail ?? (
            <div
              className="relative text-[#f0f0f0]"
              data-about-work
              ref={aboutWorkRef}
            >
              {/* The dot field under the projects. It starts where the Work
                  section does (--narration-h, set by the scroll effect): over
                  the narration's stretch it would be dots laid across the
                  picture of the television. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0"
                data-introduction-background
                style={{ top: "var(--narration-h, 100%)" }}
              >
                <HalftoneField />
              </div>
              {/* The tree behind the projects, in the landing page's own
                  style: its own stage, booted as the run comes within a
                  screen of the fold and gated on it, drawn through the same
                  halftone as the hero. The stage's canvas is fixed at z-0 and
                  the type sits at z-[1] over it. Its holders are faded by the
                  scroll effect (see the note there). A lazy chunk, not
                  mounted until the reveal is done. */}
              {revealComplete ? (
                <StageErrorBoundary>
                  <NarrationScene />
                </StageErrorBoundary>
              ) : null}
              {/* Where the narration would be in the flow. The words are on
                  the television (see the narration window in the stage); this
                  is their height, set from the track's by the scroll effect,
                  so the page scrolls as far as it would with them in it, and
                  #info still lands where they start. */}
              <div className="relative" id="info" ref={narrationSpaceRef}>
                <h2 className="sr-only">About</h2>
              </div>
              <WorkSection />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
