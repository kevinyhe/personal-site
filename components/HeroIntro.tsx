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
import ThinkerStage, {
  STAGE_CUT_AT,
  TREE_BREAK,
  type ThinkerTiming,
} from "@/components/ThinkerStage";
import { Narration, Stanza } from "@/components/Narration";
import { HERO_NARRATION } from "@/components/siteContent";
import HalftoneField from "@/components/HalftoneField";
import PetalDrift from "@/components/PetalDrift";
import SakuraStage from "@/components/SakuraStage";
import { makeNarrationBlossomMarks } from "@/components/sakuraBlossomMarks";
import { makeNarrationTree } from "@/components/sakuraTree";
import { useRevealOnScroll } from "@/components/useRevealOnScroll";
import { CUT_TO_TREE, loadCherryChunks } from "@/components/cherryChunks";
import { loadThinkerChunks } from "@/components/thinkerChunks";

gsap.registerPlugin(ScrollTrigger);

type HeroIntroProps = {
  children: ReactNode;
};

// Scroll-driven orbit of the tree: 60% of the intro's 35-degree sweep, the
// other way round (counter-clockwise from above).
const SCROLL_ORBIT = 0.6 * (35 * Math.PI) / 180;

// How long the tree takes to drop out of frame. The name's rise to the
// middle is pinned to exactly this, so the two land together: the tree is
// gone and the name has arrived on the same frame.
const TREE_DROP_DURATION = 0.292;
// The panel starts the instant that happens — no gap — and finishes at the
// timeline's end. The hero spacer is stretched (270vh originally, now
// 432vh); the other tween fractions below are rescaled by 170/332 so the
// name, tree and orbit keep their old absolute pacing. The Thinker inside
// the panel starts breaking the moment it starts growing.
const PANEL_GROW_AT = TREE_DROP_DURATION;
// Where the box finishes growing and the statue's run ends, both on this
// one frame. Everything from PANEL_GROW_AT to here is the statue's section
// of the page; it was 0.712, and the whole section was stretched by a fifth
// (0.42 of the timeline to 0.504) to scroll 20% slower. Nothing before
// PANEL_GROW_AT moved, and the spacer below is the same height, so the
// television, the tree's fall and the name's rise keep their exact pacing.
const HERO_CUT_AT = 0.796;
// How many times the visible stretch of the stage (the panel's first beat
// to the black) the break is paced against. 2: the break is half done when
// the black shuts.
const BREAK_STRETCH = 2;
const PANEL_GROW_DURATION = HERO_CUT_AT - PANEL_GROW_AT;
/**
 * The room the box leaves between its left edge and the last letter of
 * "Kevin", as a fraction of the viewport's width, for the whole of its
 * growth. The box grows from the middle of the screen, and "Kevin" is set
 * so wide that its "n" sits past the middle; so the words go first, and
 * the box only starts once "Kevin" has cleared this much of the centre
 * (see boxPlanOf and the growth tween).
 */
const BOX_CLEARANCE = 0.1;

/**
 * The box's growth against the words' exit, from the laid-out type.
 *
 * Over the growth window the two words move outward at one speed, a
 * total of `travel` px each; the box starts at `startAt` (0..1 of the
 * window) and its half width then grows at that same speed, so the gap
 * between its left edge and "Kevin" holds at BOX_CLEARANCE throughout.
 * Solved so the box fills the screen on the window's last frame: with
 * kevinRight the "n"'s edge from the left of the viewport,
 *   startAt = (kevinRight - (W/2 - clearance)) / travel
 *   travel  = kevinRight + clearance
 * which puts "Kevin" a clearance past the left edge at the end. Offsets,
 * not rects: the scrub's transforms must not feed back into the plan.
 */
function boxPlanOf(root: HTMLElement | null) {
  const lockup = root?.querySelector<HTMLElement>("[data-hero-lockup]");
  const word = lockup?.querySelector<HTMLElement>("[data-hero-letters]");
  const width = window.innerWidth;
  const clearance = width * BOX_CLEARANCE;
  if (!lockup || !word) return { startAt: 0, travel: width / 2 + clearance };
  const kevinRight = lockup.offsetLeft + word.offsetLeft + word.offsetWidth;
  const travel = kevinRight + clearance;
  return {
    startAt: clampStart((kevinRight - (width / 2 - clearance)) / travel),
    travel,
  };
}
// Never past 0.9: a layout so wide the words could not clear the centre
// in time would otherwise leave the box no window at all.
const clampStart = (value: number) => Math.min(Math.max(value, 0), 0.9);
/**
 * How far a narration line is carried sideways, as a fraction of the
 * viewport's width, either side of its centred rest, alternate lines the
 * opposite way.
 *
 * It was 0.07 for a staircase in a column beside the figure, 0.02 once
 * the lines were centred ("much less"), and is 0.045 now: asked for more
 * of the movement portfolio-2021.etiennepharabot.fr's intro has, whose
 * lines are carried sideways by the scroll at alternating speeds, without
 * scattering their resting positions. Nine percent of the width of travel
 * per line, centred, keeps every line on the screen.
 */
const NARRATION_DRIFT = 0.045;
/**
 * And less again on a phone, where 2% of the width is under 8px and the
 * lines already fill the screen: measured before, the leftmost line sat
 * 12px off the side of the screen at 9%, and content pushed off the LEFT
 * is clipped rather than added to scrollWidth, so an overflow check does
 * not catch it.
 */
const NARRATION_DRIFT_NARROW = 0.02;
const narrationDrift = () =>
  window.innerWidth *
  (window.innerWidth < 700 ? NARRATION_DRIFT_NARROW : NARRATION_DRIFT);

// When the statue's canvas starts drawing, as a fraction of the same
// timeline. It MUST lead PANEL_GROW_AT: the canvas is frozen while the
// panel is closed, so whatever scroll passes between this and the panel's
// first pixel is the stage's only chance to compile its shaders and upload
// the chunk geometry. It matters more now than it did — the box grows
// linearly out of nothing, so it is big enough to see what is inside it
// within a few vh rather than tens.
const PANEL_OPEN_AT = 0.22;
// Fraction of the narration's black-out (its own scrubbed stretch, below)
// past which the sheet counts as shut: the statue's loop stops and the
// blur under the sheet is dropped. The last percent is invisible.
const SCRIM_SHUT_AT = 0.99;
// How far into the panel's growth the statue waits before it starts coming
// apart, in viewport heights of scroll.
const CHUNK_DELAY_VIEWPORTS = 0.3;

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

export default function HeroIntro({ children }: HeroIntroProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const heroLayerRef = useRef<HTMLDivElement | null>(null);
  const scrollSpaceRef = useRef<HTMLDivElement | null>(null);
  const narrationSpaceRef = useRef<HTMLDivElement | null>(null);
  const narrationScrimRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Whether the pinned stage is anywhere on screen. False once the hero's
  // scroll room has gone by and the sections below own the viewport: the
  // statue's canvas draws on "always" while its panel is open, and without
  // this it kept running a full-screen WebGL scene, off screen, for the
  // whole length of the page under it.
  const [stageVisible, setStageVisible] = useState(true);
  // The panel is "open" (the statue's canvas runs its live loop) from a
  // little BEFORE the panel starts growing, so the stage is already drawn
  // when the first pixel of the box appears; flipped by the scroll
  // timeline, never on every frame.
  const [panelOpen, setPanelOpen] = useState(false);
  const panelOpenRef = useRef(false);
  // The black scrim over the stage has closed completely (the narration's
  // entry, below). Behind an opaque sheet the statue's canvas was still
  // drawing a full-screen WebGL scene nobody could see; this puts its loop
  // on "demand" for as long as the sheet is shut. Flipped by the scrim's
  // timeline at SCRIM_SHUT_AT, never on every frame.
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
  // The statue's chunks are cut and ready (or gave up trying).
  const [thinkerReady, setThinkerReady] = useState(false);

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
  useEffect(() => {
    if (crtReady) return undefined;
    const timeout = window.setTimeout(() => setCrtReady(true), 10000);
    return () => window.clearTimeout(timeout);
  }, [crtReady]);

  // The reveal starts once the tree scene is built AND the television has
  // had its minimum time on screen. Nothing about the tree's loading is
  // shown; the name simply holds until it is ready.
  useEffect(() => {
    if (!tvShown || !sceneReady || !thinkerReady || revealStarted) return undefined;
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
  }, [revealStarted, sceneReady, thinkerReady, tvShown]);

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
  // through 60% of the intro's sweep; once the name has arrived in the
  // middle its two words are pushed off the sides, and a viewport-sized
  // panel grows from the centre behind them until it fills the frame.
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
      // The lockup no longer leaves down the bottom. It rises from its
      // bottom-anchored rest to the MIDDLE of the viewport, arriving exactly
      // as the panel starts to grow; the two words are then pushed apart to
      // the edges by the growing box.
      //
      // All three measurements come from offsetTop/offsetLeft/offsetWidth,
      // never getBoundingClientRect: offset* is the laid-out box and ignores
      // the transform the scrub has already applied, so a refresh mid-scroll
      // re-reads the same numbers instead of compounding them.
      //
      // The words are measured THROUGH the lockup: their offsetLeft is
      // relative to it (it is positioned, see the markup) and the lockup's
      // own offsetLeft is relative to the viewport-sized type layer. Read
      // straight off the words, the number changed meaning mid-page — a
      // transformed lockup becomes their offsetParent whether positioned
      // or not, so the same call gave viewport coordinates before the
      // scroll started and lockup coordinates after, 64px apart.
      const centreOffset = () =>
        (window.innerHeight - lockup.offsetHeight) / 2 - lockup.offsetTop;
      const words = gsap.utils.toArray<HTMLElement>(
        lockup.querySelectorAll("[data-hero-letters]"),
      );
      // The box grows from the MIDDLE of the screen, once the words are
      // out of its way: see boxPlanOf. One scrubbed number, `growth`,
      // drives both the words' exit and the box's scale, so the two
      // cannot drift apart under the scrub; the plan is re-read from the
      // layout on every refresh.
      const growth = { progress: 0 };
      let plan = boxPlanOf(root);
      const replan = () => {
        plan = boxPlanOf(root);
      };
      const applyGrowth = () => {
        const p = growth.progress;
        gsap.set(panel, { scale: Math.max((p - plan.startAt) / (1 - plan.startAt), 0) });
        gsap.set(words[0], { x: -plan.travel * p });
        gsap.set(words[1], { x: plan.travel * p });
      };
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        onUpdate: () => {
          const open = tl.progress() > PANEL_OPEN_AT;
          if (open !== panelOpenRef.current) {
            panelOpenRef.current = open;
            setPanelOpen(open);
          }
        },
        scrollTrigger: {
          end: "bottom bottom",
          invalidateOnRefresh: true,
          // Small now that the PAGE itself glides (components/SmoothScroll).
          // This used to carry all the smoothing at 1.4, which on top of an
          // eased scroll would smooth twice and read as the scene dragging
          // behind the page. Enough is left to take the edge off.
          onRefreshInit: replan,
          scrub: prefersReducedMotion ? true : 0.3,
          start: "top top",
          trigger: scrollSpace,
        },
      });
      // Times are fractions of the whole 432vh scroll: the hero's exit in
      // the first 0.205, the panel from TREE_DROP_DURATION.
      //
      // A timeline is only as long as its longest child, and every offset
      // here is written as a fraction of the WHOLE scroll — so the length
      // has to be pinned to 1 explicitly. It used to come out right by
      // accident, because the panel's growth ran to the end; the moment that
      // stopped being true the scrub stretched the whole choreography over
      // the full scroll and every cue landed ~1.4x later than it reads here,
      // with the robot cutting in before the name had finished leaving.
      tl.set({}, {}, 1);
      gsap.set(panel, { scale: 0, transformOrigin: "50% 50%" });
      tl.to(strip, { autoAlpha: 0, duration: 0.103 }, 0)
        // Up to the middle over the WHOLE of the tree's fall, on the TREE'S
        // OWN EASE so the two move as one thing. Sharing only a start and an
        // end is not enough: with power2.out on the name and power1.in on
        // the tree they crossed the same window at completely different
        // rates — half way through, the name was 87% of the way up and the
        // tree had barely gone a quarter. The name rushed, then dawdled.
        .to(
          lockup,
          { y: centreOffset, duration: TREE_DROP_DURATION, ease: "power1.in" },
          0,
        )
        .to(
          sceneFx,
          { treeDrop: 1, duration: TREE_DROP_DURATION, ease: "power1.in" },
          0,
        )
        .to(sceneFx, { orbit: SCROLL_ORBIT, duration: 0.343 }, 0)
        // The dot matrix is the last of the television left on the page.
        // It thins out over the name's rise and is gone by the time the box
        // appears, so nothing inside the box is seen through it.
        .to(
          sceneFx,
          { halftone: 0, duration: PANEL_GROW_AT, ease: "power1.in" },
          0,
        )
        // The growth, linear on the scroll: the box grows out of NOTHING —
        // it starts at scale 0 and is never set to any other size, so there
        // is nothing to pop — and the ease is linear on purpose: an ease
        // with no slope at its start leaves the box under 1% of the screen
        // for tens of vh, which reads as a gap rather than a growth. The
        // words leave first, pushed outward at the pace the box's edges
        // will have; the box opens at the middle once "Kevin" is a tenth
        // of the screen clear of it, and from then on a word and its edge
        // move as one thing, that tenth between them to the last frame.
        .to(
          growth,
          {
            progress: 1,
            duration: PANEL_GROW_DURATION,
            ease: "none",
            onUpdate: applyGrowth,
          },
          PANEL_GROW_AT,
        )
        // The box's growth as a number the stage can cut on: the same
        // start and the same linear ease as the box's own tween, over the
        // first 60% of its length (STAGE_CUT_AT), so this reaches exactly
        // 1 on the frame the box is 60% grown — whatever the scrub is
        // doing. (It used to cut on the name clearing the sides, about 90%
        // of the way; the words still ride the box out, the cut no longer
        // waits for them.)
        .to(
          sceneFx,
          {
            stageCut: 1,
            duration: PANEL_GROW_DURATION * STAGE_CUT_AT,
            ease: "none",
          },
          PANEL_GROW_AT,
        )
        // And the tree's break, on the same clock: from a beat after the
        // cut to where the statue's break ends, both as fractions of the
        // growth (TREE_BREAK). Tweened here rather than read off the scroll
        // in the stage so that it cannot run ahead of the cut it follows.
        .to(
          sceneFx,
          {
            treeBreak: 1,
            duration: PANEL_GROW_DURATION * (TREE_BREAK.end - TREE_BREAK.start),
            ease: "none",
          },
          PANEL_GROW_AT + PANEL_GROW_DURATION * TREE_BREAK.start,
        );

      // ------------------------------------------------------------------
      // The narration's sideways travel.
      //
      // Each line is carried across the screen as it scrolls, alternate
      // lines from opposite sides, and it never stops: a line enters offset
      // one way, passes through its true indent as it crosses the middle of
      // the screen, and leaves offset the other way. So the staircase is
      // always moving sideways under the reading position rather than
      // arriving and then sitting still.
      //
      // One trigger per line, each scrubbed over that line's own trip
      // through the viewport, which is what keeps every line's phase tied
      // to where IT is rather than to where the block is. The reveal hook
      // fades the same elements in and is told not to move them
      // (`data-reveal="slide"`), so the two never write the same property.
      const slides = gsap.utils.toArray<HTMLElement>(
        root.querySelectorAll('[data-reveal="slide"]'),
      );
      slides.forEach((line, index) => {
        const from = index % 2 === 0 ? -1 : 1;
        gsap.fromTo(
          line,
          { x: () => from * narrationDrift() },
          {
            ease: "none",
            scrollTrigger: {
              end: "bottom top",
              invalidateOnRefresh: true,
              scrub: prefersReducedMotion ? true : 0.4,
              start: "top bottom",
              trigger: line,
            },
            x: () => -from * narrationDrift(),
          },
        );
      });

      // ------------------------------------------------------------------
      // The cut to black under the narration.
      //
      // This is what lukebaffait.fr does where its own frame sequence gives
      // way to the about text: over the next section's approach — its top
      // crossing from the bottom of the viewport to the top — a full-screen
      // sheet over the sequence goes to 0.7, and on desktop the frames
      // under it blur out (16px), while the sequence keeps playing its last
      // stretch underneath. Here the sheet goes all the way to black: the
      // narration runs over black now, not over the figure. Whatever the
      // stage is still doing plays on under the rising black in just the
      // same way, and once the sheet is shut the stage stops drawing (see
      // scrimCovered).
      //
      // The stretch ends with the block's top a fifth of the way down, so
      // the black is two thirds closed as the first line starts to fade in
      // (components/useRevealOnScroll shows a line 8% up from the bottom;
      // the block's padding puts the first line 45vh under its top) and is
      // shut before that line has climbed to the middle. The reference is
      // at 0.7 at that same two-thirds point.
      //
      // autoAlpha rather than opacity: at zero it also sets visibility
      // hidden, and a hidden sheet has no backdrop to blur, so the filter
      // costs nothing across the whole of the hero before this runs.
      //
      // Every width. This used to dim only phones, because on a wide screen
      // the camera panned the figure out from under the words instead; that
      // pan is gone.
      const narrationSpace = narrationSpaceRef.current;
      const scrim = narrationScrimRef.current;
      // The blossom scene's fades, in and out, from the block's own
      // position each update rather than from a tween: in over the half
      // screen after the scrim shuts (the block's top at a fifth of the
      // viewport, see the scrim below), out over the last screen before
      // the block's bottom reaches that same fifth — by which point the
      // work sections' backdrop, which boots a screen ahead, is up.
      const narrationFx = root.querySelectorAll<HTMLElement>("[data-narration-fx]");
      if (narrationSpace && narrationFx.length) {
        const applyFade = () => {
          const rect = narrationSpace.getBoundingClientRect();
          const vh = window.innerHeight;
          const shut = vh * 0.2;
          const fadeIn = Math.min(Math.max((shut - rect.top) / (vh * 0.5), 0), 1);
          const fadeOut = Math.min(Math.max((rect.bottom - shut) / (vh * 1.0), 0), 1);
          const alpha = Math.min(fadeIn, fadeOut);
          narrationFx.forEach((holder) => {
            holder.style.opacity = alpha.toFixed(3);
            holder.style.visibility = alpha > 0.001 ? "visible" : "hidden";
          });
        };
        ScrollTrigger.create({
          end: "bottom top",
          onRefresh: applyFade,
          onUpdate: applyFade,
          start: "top bottom",
          trigger: narrationSpace,
        });
        applyFade();
      }
      if (narrationSpace && scrim) {
        const scrimTrigger = {
          end: "top 20%",
          invalidateOnRefresh: true,
          scrub: prefersReducedMotion ? true : 0.3,
          start: "top bottom",
          trigger: narrationSpace,
        };
        const scrimTl = gsap.timeline({
          defaults: { ease: "none" },
          onUpdate: () => {
            const covered = scrimTl.progress() >= SCRIM_SHUT_AT;
            if (covered !== scrimCoveredRef.current) {
              scrimCoveredRef.current = covered;
              setScrimCovered(covered);
            }
          },
          scrollTrigger: scrimTrigger,
        });
        scrimTl.fromTo(scrim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 0);

        // The blur, on the same stretch, desktop only (the reference's own
        // rule: phones skip it, and a phone blurring two full-screen WebGL
        // canvases through a sheet is exactly why). Its own timeline under
        // gsap.matchMedia rather than a width check made once here, so a
        // phone turned on its side and back gets the right answer each
        // time instead of the one it loaded with; the context reverts it
        // with everything else. Dropped to none once the sheet is shut —
        // the browser blurs the backdrop of an opaque sheet all the same,
        // for every frame of the narration, and nobody can see it. Going
        // back up, the set renders backwards to the blur it replaced.
        const canBlur =
          !prefersReducedMotion &&
          (CSS.supports("backdrop-filter", "blur(1px)") ||
            CSS.supports("-webkit-backdrop-filter", "blur(1px)"));
        if (canBlur) {
          gsap.matchMedia().add("(min-width: 700px)", () => {
            gsap
              .timeline({
                defaults: { ease: "none" },
                scrollTrigger: { ...scrimTrigger },
              })
              .fromTo(
                scrim,
                { backdropFilter: "blur(0px)" },
                { backdropFilter: "blur(16px)", duration: 1 },
                0,
              )
              .set(scrim, { backdropFilter: "none" }, 1);
          });
        }
      }
    }, root);
    return () => {
      ctx.revert();
      // The next run's timeline starts at 0 and only reports changes, so
      // a flag left shut here would keep the statue's loop off for good.
      scrimCoveredRef.current = false;
      setScrimCovered(false);
      sceneFx.treeDrop = 0;
      sceneFx.orbit = 0;
      sceneFx.halftone = 1;
      sceneFx.stageCut = 0;
      sceneFx.treeBreak = 0;
      delete (window as unknown as Record<string, unknown>).__scrollScene;
    };
  }, [revealComplete]);

  // The Thinker's chunks are cut in a worker from the moment the page
  // mounts, and the tree's straight after them in the same worker. The
  // television shot then HOLDS until both are ready (see the reveal gate
  // below): the cuts take a few seconds, and the panel starts growing only
  // 40vh into the scroll, so on a slower machine the scroll reached the
  // panel before the statue existed and grew over an empty box. Nothing is
  // ever shown loading — the name simply holds. A figure that FAILS to
  // build (the model missing, a parse error) is logged once, by the
  // loader, and not waited for: without the tree the stage keeps the
  // statue past the cut (see ThinkerStage).
  useEffect(() => {
    let live = true;
    const ready = () => {
      if (live) setThinkerReady(true);
    };
    const settled = (build: Promise<unknown>) => build.catch(() => undefined);
    const builds = [settled(loadThinkerChunks())];
    if (CUT_TO_TREE) builds.push(settled(loadCherryChunks()));
    void Promise.all(builds).then(ready);
    // Never strand the page on a fracture that FAILS — but this must not be
    // reachable by one that is merely slow. It was 15 s, and the statue's
    // cut alone measured 12.5 s in the worker at the time: slower machines
    // crossed the line, the reveal went ahead without the chunks, and the
    // box opened on an empty stage (nothing is drawn at all while `build`
    // is null). Then 45 s, three and a half times that. The statue's cut is
    // now ~220 seeds of shards (the page's scroll scene was ready 41 s
    // after load on the dev box under software GL, most of it this build;
    // ~70 ms a seed in a worker), and the tree's would follow it in the
    // same worker if the cut were on (CUT_TO_TREE). This is the failure
    // net, not a deadline — the fractures should always win the race; if
    // a slower machine ever loses it, the fix is the seed count, not this.
    const timeout = window.setTimeout(ready, 80000);
    return () => {
      live = false;
      window.clearTimeout(timeout);
    };
  }, []);

  // Capture aid: ?robotView jumps the page to its bottom once the reveal is
  // done, which opens the panel, completes the statue and drives the robot
  // phase to 1 through the real scroll path — arming and starting the run
  // without hand-scrolling. Twice, because ThinkerStage schedules its own
  // ScrollTrigger refresh ~250 ms after it mounts.
  useEffect(() => {
    if (!revealComplete) return undefined;
    if (!window.location.search.includes("robotView")) return undefined;
    const jump = () => window.scrollTo(0, document.documentElement.scrollHeight);
    const first = window.setTimeout(jump, 600);
    const second = window.setTimeout(jump, 1600);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [revealComplete]);

  // The stretch of scroll the statue's stage owns: from the panel starting
  // to grow to the bottom of the page, breaking from its very first pixel.
  // Read from the layout each time ScrollTrigger refreshes.
  const thinkerTiming = useCallback<ThinkerTiming>(() => {
    const scrollSpace = scrollSpaceRef.current;
    const viewportHeight = window.innerHeight;
    const documentTop = (element: HTMLElement | null) =>
      element ? element.getBoundingClientRect().top + window.scrollY : 0;
    // The hero timeline runs from the scroll space's top at the top of the
    // viewport to its bottom at the bottom.
    const heroStart = documentTop(scrollSpace);
    const heroLength = scrollSpace ? scrollSpace.offsetHeight - viewportHeight : 0;
    // The box's first pixel: a way into the growth window, after the words
    // have made room for it (boxPlanOf).
    const growStart =
      heroStart +
      heroLength * (PANEL_GROW_AT + PANEL_GROW_DURATION * boxPlanOf(rootRef.current).startAt);
    const pageEnd = heroStart + heroLength;
    const narrationSpace = narrationSpaceRef.current;
    // The last frame of the stage anyone sees is where the black shuts:
    // the narration scrim is opaque once the narration's top reaches a
    // fifth of the way down the viewport (its timeline's `end: "top 20%"`,
    // above). The break is paced against TWICE that stretch — the panel's
    // growth and the scroll under the narration, and as much again that
    // nobody scrolls — so it runs at half speed and is half done, the
    // camera half way through its pull-out and swing, when the black
    // closes over it. It used to finish as the box reached the full screen
    // (HERO_CUT_AT), then at the black; each halving was asked for after
    // watching it. No cut anywhere in it.
    const blackAt = narrationSpace
      ? documentTop(narrationSpace) - viewportHeight * 0.2
      : Math.min(heroStart + heroLength * HERO_CUT_AT, pageEnd);
    const statueEnd = growStart + (blackAt - growStart) * BREAK_STRETCH;
    const end = pageEnd;
    // The story's stretch, which only the camera reads now (and only after
    // a cut, see ThinkerStage): from the break's end to the narration's.
    const storyStart = statueEnd;
    const storyEnd = narrationSpace
      ? documentTop(narrationSpace) + narrationSpace.offsetHeight - viewportHeight
      : end + 1;
    return {
      // The stage opens with the box; the figure holds together for a beat
      // of scroll after that before the first piece goes.
      breakAt: growStart + viewportHeight * CHUNK_DELAY_VIEWPORTS,
      end,
      start: growStart,
      statueEnd,
      storyEnd,
      storyStart,
    };
  }, []);

  // The narration's lines are [data-reveal] like everything else on the
  // page; this is the only tree outside HomeSections that has any.
  useRevealOnScroll(rootRef);

  // The statue's canvas runs its live loop only while there is something
  // to see: the panel is open, the stage is on screen, and the black scrim
  // has not shut over it.
  const stageActive = panelOpen && stageVisible && !scrimCovered;

  // Exposed so headless captures can tell whether the canvas is drawing
  // once the scrim has closed (the stage's own hook only reports the
  // scrubbed progress, which keeps moving either way).
  useEffect(() => {
    const debug = { active: stageActive, covered: scrimCovered };
    (window as unknown as Record<string, unknown>).__narrationScrim = debug;
    return () => {
      delete (window as unknown as Record<string, unknown>).__narrationScrim;
    };
  }, [scrimCovered, stageActive]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setStageVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
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
      {/* The pin container, and everything pinned inside it: the tree
          canvas, the type, the statue's panel, the narration over it. Its
          height is the two spacers at the bottom of this file — the hero's
          own run, then the narration's — so the stage stays on screen
          across both and only scrolls away at the end of the second.

          Its height is deliberately NOT what the choreography is measured
          against. That is the first spacer, which the timeline triggers on
          and thinkerTiming measures; the container being longer is what
          buys the narration its scroll without stretching the intro. */}
      <div className="relative">
        {/* Exactly one viewport, pinned to the top of it. The height comes
            from the same custom property the canvases size against, so the
            stage, the type layer and the WebGL drawing buffer cannot
            disagree about how tall a screen is on mobile. */}
        <div
          className="sticky top-0 h-[var(--arbor-screen-h)] w-full overflow-hidden"
          data-hero-stage
          ref={stageRef}
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
        // pointer-events-none is load-bearing: this layer sits above the
        // statue's panel, and without it every drag meant for the statue
        // dies here. The links inside re-enable their own events.
        className="pointer-events-none absolute inset-0 z-20"
        ref={heroLayerRef}
        style={{ transformOrigin: "0 0", willChange: "transform" }}
      >
        {children}
      </div>

      {/* The next page's panel: exactly the stage, grown from the centre
          by the scroll timeline once the name has made room. Above the canvas,
          below the type layer. Inside it, The Thinker: its own canvas,
          scaled with the panel. */}
      <div
        className="pointer-events-none absolute inset-0 z-[15] bg-[#0a0a0a]"
        data-hero-panel
        style={{ transform: "scale(0)", transformOrigin: "50% 50%" }}
      >
        {revealComplete ? (
          <ThinkerStage active={stageActive} timing={thinkerTiming} />
        ) : null}
      </div>

      {/* The black the narration runs over: shut by the scrim's timeline as
          the narration block arrives, at every width. Above the statue's
          panel, below the type layer. Hidden as well as clear at rest, so
          its blur has no backdrop to work on until it is needed. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[17] bg-[#0a0a0a]"
        data-narration-scrim
        ref={narrationScrimRef}
        style={{ opacity: 0, visibility: "hidden" }}
      />
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
            sets every cue from the television to the statue's cut. The
            second is the narration's, and it only exists because the
            container is taller than the trigger — lengthening the trigger
            would have stretched the whole intro to fit it.

            The negative margin cancels the sticky stage's own place in the
            flow, so these two are what give the container its height. */}
        <div style={{ marginTop: "calc(var(--arbor-screen-h) * -1)" }}>
          <div aria-hidden="true" className="h-[432vh]" ref={scrollSpaceRef} />
          {/* The narration, IN FLOW, over the pinned statue, each line
              centred on the figure, which holds the middle of the frame.
              
              It scrolls at page speed and reveals a line at a time on
              entry, which is what the reference does — measured off it: its
              lines track the scroll exactly 1:1, their staircase offsets
              are static translates, and the only motion is each line coming
              up ninety pixels as it arrives. Nothing is pinned and nothing
              cross-fades.

              Its own height is what extends the pin container, so the
              statue stays behind it for exactly as long as there are words,
              and the padding is the beat before the first line and after
              the last. relative so it paints over the sticky stage (later
              in the tree, so it wins), but NO z-index: a z-index would make
              this block a stacking context, and the tree's canvas inside it
              (SakuraStage, fixed, mix-blend-lighten) would then blend with
              nothing and paint its black frame over the statue — measured
              as a black screen the moment the narration came within a
              screen of the fold. Without one the canvas lightens the stage
              itself, and its black adds nothing. */}
          <div
            className="relative px-6 py-[45vh] text-center text-[#f0f0f0] sm:px-16"
            id="info"
            ref={narrationSpaceRef}
          >
            <h2 className="sr-only">About</h2>
            {/* The intro's tree behind the words, in the landing page's
                own style: its own stage, booted as this block comes within
                a screen of the fold and gated on it, drawn through the
                same halftone as the hero. The stage's canvas is fixed at
                z-0 and the lines sit at z-[1] over it; the block itself
                has no z-index, so the stage's lighten blend meets the page
                rather than an empty context (see the note on the block).
                (The work sections' bough-and-dot-field backdrop stood here
                briefly and was the wrong tree for this part.) */}
            {/* Every layer of the blossom scene sits in a holder the scroll
                fades: in over the half screen after the scrim has shut
                over the statue, out over the last screen before the work
                sections' own backdrop takes over (see the narration fades
                in the scroll effect). The dot field is the work sections'
                (HalftoneField); the petals fall out of the tree's lowest
                twigs (it publishes them the way the bough does). */}
            <div data-narration-fx style={{ opacity: 0, visibility: "hidden" }}>
              <HalftoneField />
            </div>
            <div data-narration-fx style={{ opacity: 0, visibility: "hidden" }}>
              <SakuraStage
                elements={[makeNarrationTree, makeNarrationBlossomMarks]}
                gateSelector="#info"
              />
            </div>
            <div data-narration-fx style={{ opacity: 0, visibility: "hidden" }}>
              <PetalDrift gateSelector="#info" />
            </div>
            <div className="relative z-[1]">
              <Narration stage>
                {HERO_NARRATION.map((lines, index) => (
                  <Stanza center key={index} lines={lines} slide />
                ))}
              </Narration>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
