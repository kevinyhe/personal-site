"use client";

/**
 * The valley's behaviour: the reference page's JS (sondaven.com/en, up to
 * its prologue) ported with the same numbers, driving our generated scenes.
 *
 * One call, mountValley(root), sets up everything and returns the teardown.
 * The order matches the reference's page load: the wordmarks and the
 * preloader's sprig first, then the intro timeline, which builds every
 * scene in the middle (the percent counter) and, once it finishes, runs
 * the page scripts (theme, header, reveals, hover, magnetic, scrubs).
 */

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import type Lenis from "lenis";

import { createBarCanvas, hexToRgb, readThemeColors, renderTextSource } from "./barShader";
import type { BarCanvas, BarLayer, BarLayerConfig, CanvasSource, Rgb } from "./barShader";
import { createHutScene } from "./hutScene";
import type { HutScene } from "./hutScene";
import { createAsciiTree } from "./sources/asciiTree";
import { createBirds } from "./sources/birds";
import { createBlossomCloud } from "./sources/blossomCloud";
import { createHutSilhouette } from "./sources/hutSilhouette";
import { createMountains } from "./sources/mountains";
import { createPetalBank } from "./sources/petalBank";
import { createSprig } from "./sources/sprig";

// The reference's constants (app.pretty.js L4500+).
const DUR_S = 0.4;
const DUR_M = 0.8;
const DUR_L = 1.2;
const STAGGER = 0.1;
const DELAY_REVEAL = 0.2;
const BREAKPOINT = 992;
const VISITED_KEY = "hasVisited";
// A source that never resolves must not hold the preloader forever.
const LOAD_TIMEOUT_MS = 20000;
const HUT_FRAMES = 119;

// One seed per generated source, so every visit draws the same valley.
const SEED = {
  mountainsNear: 11,
  mountainsFar: 23,
  hut: 37,
  tree: 41,
  petals: 53,
  cloudA: 67,
  cloudB: 71,
  birdsA: 83,
  birdsB: 89,
  sprigLeft: 97,
  sprigRight: 101,
  sprigPreloader: 103,
  hutScene: 7,
};

// The wordmark: "KEVIN HE" rasterised at 2240x240 (aspect 224/24 like the
// reference's SVG) and drawn as 224x24 bars. White-on-black text is
// brightness 1, which the shader maps to the thinnest bar, so the grade is
// inverted (blackPoint 255 / whitePoint 0) to get solid letters.
const WORDMARK_TEXT = "KEVIN HE";
const WORDMARK_W = 2240;
const WORDMARK_H = 240;
const WORDMARK_DILATE_PX = 6;
// Both ranges take one grade, and it is the one sources/mountains.ts is
// written against: only 96..200 draws anything, 200 and over is the widest
// bar, and bgOpacity 1 paints every cell the shader keeps, which is what
// makes the land solid. No gamma — every grey in that file assumes 1, and
// at anything else the whole scheme collapses. The hills separate by mark
// density, not by tone: every opaque cell is the same colour, so the
// distance between ranges is carried by how far apart their bars are.
// The reference's own grade for the landscape plates, the right way up: a
// DARK grey draws a WIDE bar, so the plate's tone ladder carries the depth
// (see components/valley/sources/mountains.ts). bgOpacity 1 keeps the land
// opaque; the sky is black in the source and dropped by the shader.
const HILL_GRADE = {
  blackPoint: 25,
  whitePoint: 200,
  bgOpacity: 1,
} as const;
/** The far plate is near white; it takes the reference's far grade. */
const FAR_HILL_GRADE = { ...HILL_GRADE, blackPoint: 0, whitePoint: 255 } as const;
const WORDMARK_CONFIG: BarLayerConfig = {
  x: 0,
  y: 0,
  width: "100%",
  height: "100%",
  xSquares: 224,
  ySquares: 24,
  minSquareWidth: "30%",
  maxSquareWidth: "100%",
  bgOpacity: 0,
  blackPoint: 255,
  whitePoint: 0,
};

type Mode = "reveal" | "hide" | "initial";
type Targets = Element | Element[] | NodeListOf<Element> | null | undefined;
type Scene = { loaded: Promise<void>; destroy: () => void };
type Box = { w: number; h: number };

let registered = false;
function registerOnce() {
  if (registered) return;
  registered = true;
  gsap.registerPlugin(ScrollTrigger, SplitText, Flip, CustomEase);
  gsap.config({ nullTargetWarn: false });
  CustomEase.create("InOut", "0.76,0,0.24,1");
  CustomEase.create("Out", "0.25,1,0.5,1");
  CustomEase.create("In", "0.5,0,0.75,0");
  CustomEase.create("Ease", "0.25,0.1,0.25,1");
}

const getLenis = () => (window as unknown as { __lenis?: Lenis }).__lenis;

// Percent strings against the layer's box, "vw" against the box width (the
// scene canvases are full-bleed, so that is the viewport width), px as is.
function toPx(v: string | number, ref: number, boxW: number): number {
  if (typeof v === "number") return v;
  if (v.endsWith("vw")) return (parseFloat(v) / 100) * boxW;
  if (v.endsWith("%")) return (parseFloat(v) / 100) * ref;
  return parseFloat(v);
}

// The pixel size to generate a source at: the layer's box on screen, scaled
// down so its longer side is at most `cap`. The bar grid never needs more.
function sizeFor(cfg: BarLayerConfig, box: Box, cap: number): { width: number; height: number } {
  const w = Math.abs(toPx(cfg.width, box.w, box.w));
  const h = Math.abs(toPx(cfg.height, box.h, box.w));
  const s = Math.min(1, cap / Math.max(1, w, h));
  return { width: Math.max(2, Math.round(w * s)), height: Math.max(2, Math.round(h * s)) };
}

function boxOf(canvas: HTMLCanvasElement): Box {
  return {
    w: canvas.offsetWidth || window.innerWidth,
    h: canvas.offsetHeight || window.innerHeight,
  };
}

function withTimeout(p: Promise<unknown>): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, LOAD_TIMEOUT_MS);
    p.then(
      () => {
        clearTimeout(t);
        resolve();
      },
      () => {
        clearTimeout(t);
        resolve();
      },
    );
  });
}

/**
 * Mounts the behaviour on the `.valley` root. The heavy work starts one
 * frame later: React's strict mode runs mount, unmount, mount in a row, and
 * deferring keeps the first (discarded) run from building scenes.
 */
export function mountValley(root: HTMLElement): () => void {
  registerOnce();
  let teardown: (() => void) | null = null;
  let cancelled = false;
  const raf = requestAnimationFrame(() => {
    if (!cancelled) teardown = start(root);
  });

  // start() decides once whether this is the desktop or the phone build: the
  // hut scene attaches to one canvas or the other, the prologue sprigs and
  // the hero-bg scene are desktop-only, and the scroll scrub only exists on
  // desktop. The CSS flips at the same width on its own, so dragging a
  // window across the breakpoint used to leave an empty canvas on one side
  // of it. Rebuilding is cheap here because sessionStorage already says the
  // visitor has been, so the rebuild takes the short path with no intro.
  const mq = window.matchMedia(`(min-width: ${BREAKPOINT}px)`);
  const onBreakpoint = () => {
    if (cancelled) return;
    teardown?.();
    teardown = start(root);
  };
  mq.addEventListener("change", onBreakpoint);

  return () => {
    cancelled = true;
    mq.removeEventListener("change", onBreakpoint);
    cancelAnimationFrame(raf);
    teardown?.();
    teardown = null;
  };
}

function start(root: HTMLElement): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isDesktop = window.innerWidth >= BREAKPOINT;
  const ctx = gsap.context(() => {}, root);
  const splitMap = new Map<Element, SplitText>();
  const extraSplits: SplitText[] = [];
  const scenes: Scene[] = [];
  const loads: Promise<void>[] = [];
  // What the preloader waits for, as opposed to what it counts. The bar
  // landscape and the prologue's sprigs are two and four screens down; the
  // valley behind the hero is the first thing anybody sees, so it is the
  // only scene worth holding the page for. Everything else keeps building
  // while the reader looks at the hero.
  const criticalLoads: Promise<void>[] = [];
  const cleanups: (() => void)[] = [];
  const wordmarkByEl = new Map<Element, BarCanvas>();
  // Where each wordmark's colours currently sit, so a theme flip tweens from
  // them rather than snapping (see recolourWordmarks).
  const wordmarkColour = new Map<Element, { bg: Rgb; fill: Rgb }>();
  let hut: HutScene | null = null;
  let done = false;

  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends Element = HTMLElement>(sel: string) =>
    Array.from(root.querySelectorAll<T>(sel));

  // ------------------------------------------------------------------
  // Scroll lock (reference lockScroll/unlockScroll): the scrollbar's width
  // becomes body padding so the layout does not shift while it is hidden.
  // ------------------------------------------------------------------
  const lockScroll = () => {
    const sb = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty("--scrollbar-width", `${sb}px`);
    document.body.style.paddingRight = "var(--scrollbar-width)";
    document.documentElement.style.overflow = "hidden";
    getLenis()?.stop();
  };
  const unlockScroll = () => {
    document.documentElement.style.removeProperty("--scrollbar-width");
    document.body.style.paddingRight = "";
    document.documentElement.style.overflow = "";
    getLenis()?.start();
  };

  // ------------------------------------------------------------------
  // Text animations (reference animateTextH / animateTextP / animateCtn /
  // animateLine). A split is made once per element and reused.
  // ------------------------------------------------------------------
  const splitOnce = (el: Element, vars: SplitText.Vars, after?: (s: SplitText) => void) => {
    let s = splitMap.get(el);
    if (!s) {
      s = new SplitText(el, vars);
      splitMap.set(el, s);
      after?.(s);
    }
    return s;
  };

  const textH = (targets: Targets, mode: Mode, delay?: number) => {
    if (!targets) return;
    gsap.utils.toArray<Element>(targets).forEach((el, index) => {
      const split = splitOnce(el, {
        type: "words",
        tag: "span",
        wordsClass: "split-word",
        smartWrap: true,
      });
      const offset = index * STAGGER * 0.5;
      if (mode === "reveal") {
        gsap.fromTo(
          split.words,
          { yPercent: gsap.utils.wrap([-150, 75, -75, 150]), scale: 0, opacity: 0 },
          {
            yPercent: 0,
            scale: 1,
            opacity: 1,
            duration: DUR_L,
            delay: (delay ?? DELAY_REVEAL) + offset,
            stagger: { each: 0.25 * STAGGER, from: "random" },
            ease: "Out",
            overwrite: true,
          },
        );
      } else if (mode === "hide") {
        gsap.to(split.words, {
          yPercent: gsap.utils.wrap([75, -75, 75, -75]),
          scale: 0,
          opacity: 0,
          duration: DUR_S,
          delay: delay ?? 0,
          stagger: { each: 0.25 * STAGGER, from: "random" },
          ease: "In",
          overwrite: true,
        });
      } else {
        gsap.set(split.words, {
          yPercent: gsap.utils.wrap([-150, 75, -75, 150]),
          scale: 0,
          opacity: 0,
        });
      }
    });
  };

  const textP = (targets: Targets, mode: Mode, delay?: number) => {
    if (!targets) return;
    gsap.utils.toArray<Element>(targets).forEach((el, index) => {
      const split = splitOnce(
        el,
        { type: "lines", linesClass: "split-line", aria: "none" },
        () => {
          // A <br> leaves an empty line behind; put the break back so the
          // copy keeps its two lines.
          el.querySelectorAll(".split-line").forEach((line) => {
            if ((line.textContent ?? "").trim() === "") {
              line.replaceWith(document.createElement("br"));
            }
          });
        },
      );
      const offset = index * STAGGER * 0.25;
      if (mode === "reveal") {
        gsap.fromTo(
          split.lines,
          { yPercent: 250, opacity: 0 },
          {
            yPercent: 0,
            opacity: 1,
            duration: DUR_L,
            delay: (delay ?? DELAY_REVEAL) + offset,
            stagger: 0.5 * STAGGER,
            ease: "Out",
            overwrite: true,
          },
        );
      } else if (mode === "hide") {
        gsap.to(split.lines, {
          yPercent: 0,
          opacity: 0,
          duration: DUR_S,
          delay: delay ?? 0,
          stagger: 0.5 * STAGGER,
          ease: "In",
          overwrite: true,
        });
      } else {
        gsap.set(split.lines, { yPercent: 0, opacity: 0 });
      }
    });
  };

  const ctn = (targets: Targets, mode: Mode, delay?: number) => {
    if (!targets) return;
    const list = gsap.utils.toArray<Element>(targets);
    if (!list.length) return;
    if (mode === "reveal") {
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
    } else if (mode === "hide") {
      gsap.to(list, {
        opacity: 0,
        yPercent: 0,
        duration: DUR_S,
        delay: delay ?? 0,
        stagger: 0.5 * STAGGER,
        ease: "In",
        overwrite: true,
      });
    } else {
      gsap.set(list, { opacity: 0, yPercent: 0 });
    }
  };

  const line = (targets: Targets, mode: Mode, delay?: number) => {
    if (!targets) return;
    const list = gsap.utils.toArray<Element>(targets);
    if (!list.length) return;
    if (mode === "reveal") {
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
    } else if (mode === "hide") {
      gsap.to(list, {
        clipPath: "inset(0% 0% -1px 100%)",
        duration: DUR_S,
        delay: delay ?? 0,
        stagger: 0.5 * STAGGER,
        ease: "In",
        overwrite: true,
      });
    } else {
      gsap.set(list, { clipPath: "inset(0% 0% -1px 100%)" });
    }
  };

  // ------------------------------------------------------------------
  // Page transition grid (reference animateTransition).
  // ------------------------------------------------------------------
  const transition = q(".transition");
  const animateTransition = (mode: "in" | "out" | "init") => {
    if (!transition) return;
    const cells = transition.querySelectorAll(".transition_cell");
    const over = transition.querySelectorAll(".transition_over");
    if (mode === "init") {
      gsap.set(transition, { display: "flex" });
      gsap.set(cells, { scaleX: 1 });
      gsap.set(over, { opacity: 1 });
      return;
    }
    const out = mode === "out";
    gsap
      .timeline({
        onComplete: out ? () => gsap.set(transition, { display: "none" }) : undefined,
      })
      .set(transition, { display: "flex" })
      .fromTo(
        cells,
        { scaleX: out ? 1 : 0 },
        {
          scaleX: out ? 0 : 1,
          duration: DUR_S,
          ease: "InOut",
          stagger: { each: 0.03, from: "end", grid: [20, 12] },
        },
      )
      .fromTo(
        over,
        { opacity: out ? 1 : 0 },
        { opacity: out ? 0 : 1, duration: DUR_L, ease: "InOut" },
        0,
      );
  };

  // ------------------------------------------------------------------
  // Bar scenes
  // ------------------------------------------------------------------
  const disposeLayers = (layers: BarLayer[]) => {
    for (const l of layers) if (l.type === "canvas") l.source.dispose?.();
  };

  // Under reduced motion an animated source is drawn once at t = 0 and then
  // treated as a still.
  const still = (s: CanvasSource): CanvasSource => {
    if (!reduced || !s.animated) return s;
    return {
      canvas: s.canvas,
      animated: false,
      // The braces matter: update() now reports whether it redrew, and
      // returning that would make this a Promise<boolean>.
      ready: (s.ready ?? Promise.resolve()).then(() => {
        s.update?.(0, 0);
      }),
      dispose: s.dispose,
    };
  };

  const canvasLayer = (source: CanvasSource, config: BarLayerConfig): BarLayer => ({
    type: "canvas",
    source: still(source),
    config,
  });

  const barScene = (
    canvas: HTMLCanvasElement | null,
    layers: BarLayer[],
    colors?: () => ReturnType<typeof readThemeColors>,
    fps = 60,
    // The engine's default reaches 20% of the viewport past the canvas in
    // both directions, which is right for a small mark but not for a scene
    // two screens tall: on a phone the hero landscape starts drawing at 60
    // fps while it is entirely below the fold. The big scenes pass "0px" and
    // wake only when a pixel of them is actually on screen.
    visibleRootMargin?: string,
  ): BarCanvas | null => {
    if (!canvas) {
      disposeLayers(layers);
      return null;
    }
    const bc = createBarCanvas(canvas, layers, {
      colors,
      fps: reduced ? 2 : fps,
      // Only the bars are drawn; the rest of every cell is left alone. The
      // reference paints the cell's background in the page colour, which is
      // invisible on a flat page and would be a patch of flat black on this
      // one, where the page is a drifting field.
      defaults: { bgOpacity: 0 },
      ...(visibleRootMargin ? { visibleRootMargin } : {}),
    });
    if (!bc) {
      disposeLayers(layers);
      return null;
    }
    scenes.push({ loaded: bc.loaded, destroy: bc.destroy });
    loads.push(bc.loaded);
    return bc;
  };

  // The looping bird tweens only run while their canvas is on screen.
  const watchLoop = (el: Element, tl: gsap.core.Timeline) => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            if (tl.paused()) tl.play();
          } else if (!tl.paused()) {
            tl.pause();
          }
        }
      },
      { threshold: 0.01, rootMargin: "20% 0px 20% 0px" },
    );
    io.observe(el);
    cleanups.push(() => {
      io.disconnect();
      tl.kill();
    });
  };

  // Wordmarks: one text raster shared by every wordmark canvas. Painted now
  // with whatever face resolves and again once the serif has really loaded.
  const wordmarkSource = document.createElement("canvas");
  wordmarkSource.width = WORDMARK_W;
  wordmarkSource.height = WORDMARK_H;
  const h5 = q(".h5");
  const serifFamily = h5 ? getComputedStyle(h5).fontFamily : "Georgia, serif";
  const paintWordmark = () => {
    const rendered = renderTextSource(WORDMARK_TEXT, {
      fontFamily: serifFamily,
      width: WORDMARK_W,
      height: WORDMARK_H,
      letterSpacingEm: -0.04,
    });
    const c2 = wordmarkSource.getContext("2d");
    if (!c2) return;
    c2.fillStyle = "#000";
    c2.fillRect(0, 0, WORDMARK_W, WORDMARK_H);
    // The serif's hairlines are thinner than one bar cell (10 px of this
    // raster), so a 24-row grid loses them. Stamping the text at a ring of
    // offsets fattens every stroke by 2 * WORDMARK_DILATE_PX, the way the
    // reference's heavy wordmark fills its cells.
    c2.globalCompositeOperation = "lighter";
    const d = WORDMARK_DILATE_PX;
    const ring = [
      [0, 0], [d, 0], [-d, 0], [0, d], [0, -d],
      [d * 0.7, d * 0.7], [-d * 0.7, d * 0.7], [d * 0.7, -d * 0.7], [-d * 0.7, -d * 0.7],
      [d * 0.5, 0], [-d * 0.5, 0], [0, d * 0.5], [0, -d * 0.5],
    ];
    for (const [dx, dy] of ring) c2.drawImage(rendered, dx, dy);
    c2.globalCompositeOperation = "source-over";
  };

  // `skipPreloader` is the short path: the preloader is display:none before
  // it ever paints, so its wordmark would be a WebGL context and a 2240x240
  // upload spent on something nobody sees.
  const initWordmarks = (skipPreloader: boolean) => {
    paintWordmark();
    for (const el of qa("[data-wordmark]")) {
      if (skipPreloader && el.closest("[data-preloader]")) continue;
      const canvas = el.querySelector("canvas");
      if (!canvas || reduced) {
        el.classList.add("is-fallback");
        continue;
      }
      const source: CanvasSource = {
        canvas: wordmarkSource,
        animated: false,
        ready: Promise.resolve(),
      };
      const bc = barScene(canvas, [{ type: "canvas", source, config: { ...WORDMARK_CONFIG } }], undefined, 30);
      if (!bc) {
        el.classList.add("is-fallback");
        continue;
      }
      wordmarkByEl.set(el, bc);
    }
    const fontsIn = (async () => {
      try {
        await document.fonts.ready;
        await document.fonts.load(`400 100px ${serifFamily}`);
      } catch {
        // No FontFaceSet, or the face refused to load: the fallback stays.
      }
    })();
    fontsIn.then(() => {
      if (done) return;
      paintWordmark();
      wordmarkByEl.forEach((bc) => bc.redraw());
    });
  };

  // The header's wordmark takes the theme the header currently carries.
  // Tweened, not set: everything else in the header (the nav labels, the
  // menu lines, the pill) cross-fades over DUR_M in CSS, and a mark that
  // snapped to the new colour arrived a beat before the rest of the bar.
  const recolourWordmarks = (within: Element) => {
    within.querySelectorAll("[data-wordmark]").forEach((el) => {
      const bc = wordmarkByEl.get(el);
      const canvas = el.querySelector("canvas");
      if (!bc || !canvas) return;
      const to = readThemeColors(canvas);
      const from = wordmarkColour.get(el);
      wordmarkColour.set(el, to);
      if (!from || reduced) {
        bc.setColors(to.bg, to.fill);
        bc.redraw();
        return;
      }
      const p = { t: 0 };
      const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ];
      gsap.to(p, {
        t: 1,
        duration: DUR_M,
        ease: "Out",
        overwrite: true,
        onUpdate: () => {
          bc.setColors(mix(from.bg, to.bg, p.t), mix(from.fill, to.fill, p.t));
          bc.redraw();
        },
      });
    });
  };

  // The preloader's sprig is the one scene with a life shorter than the
  // page: once the intro has handed over, its WebGL context and its 600px
  // source are dead weight. finish() drops it (and on the short path it is
  // never built at all).
  let preloaderScene: BarCanvas | null = null;
  const dropPreloaderScene = () => {
    if (!preloaderScene) return;
    const i = scenes.findIndex((s) => s.destroy === preloaderScene?.destroy);
    if (i >= 0) scenes.splice(i, 1);
    preloaderScene.destroy();
    preloaderScene = null;
  };

  const initScenePreloader = () => {
    const canvas = q<HTMLCanvasElement>("[data-preloader-canvas]");
    if (!canvas) return;
    const cfg: BarLayerConfig = {
      x: "0%",
      y: "0%",
      width: "100%",
      height: "100%",
      blackPoint: 200,
      whitePoint: 25,
      xSquares: 100,
      ySquares: 100,
    };
    const sprig = createSprig({ seed: SEED.sprigPreloader, width: 600, height: 600, side: "center" });
    preloaderScene = barScene(canvas, [canvasLayer(sprig, cfg)], lightColors);
  };

  // Hero scenes read the LIGHT colours from the valley root (bg pink, fill
  // ink), like the reference reads the document root: the landscape is ink
  // bars on the pink page even though #hero carries the dark theme class.
  //
  // A page may name its own scene colours instead (--v-scene-bg /
  // --v-scene-fill). The home page does: it is one near-black ground from
  // the hero to the contact plate, and a landscape drawn in the same bone
  // as the type reads as a diagram rather than as a place, so its bars are
  // blossom pink.
  const lightColors = () => {
    const cs = getComputedStyle(root);
    const bg = cs.getPropertyValue("--v-scene-bg").trim();
    const fill = cs.getPropertyValue("--v-scene-fill").trim();
    if (bg && fill) return { bg: hexToRgb(bg), fill: hexToRgb(fill) };
    return readThemeColors(root);
  };

  const initSceneHeroOver = () => {
    const canvas = q<HTMLCanvasElement>("[data-intro-over-scene]");
    if (!canvas) return;
    const box = boxOf(canvas);
    const birdW = isDesktop ? 33.33 : 66.66;
    const mountains: BarLayerConfig = { ...HILL_GRADE, x: "0%", y: "42%", width: "100%", height: "58%" };
    const hutCfg: BarLayerConfig = { x: "56%", y: "72.6%", width: "14%", height: "12%", blackPoint: 25, whitePoint: 200 };
    // The reference's fir box is portrait (43.5% x 52%); our weeping cherry
    // is 1.2:1 wide, so the boxes keep the reference's bottom edge (94%) and
    // take the tree's own aspect, or the top half would be empty. They are
    // WIDE rather than tall for the same reason: at the reference's width the
    // tree came out 620 x 522 and read as a shrub tucked into the ridge,
    // where the reference's fir stands 690 px up the frame. These span 62%
    // and 58% of the canvas and hang off their edge, so the canopy crosses
    // the skyline the way the fir does.
    const treeR: BarLayerConfig = { x: "60%", y: "53%", width: "62%", height: "41%", blackPoint: 55, whitePoint: 175, xSquares: 150, ySquares: 100 };
    const treeL: BarLayerConfig = { x: "-22%", y: "55.5%", width: "58%", height: "38.5%", blackPoint: 55, whitePoint: 175, xSquares: 150, ySquares: 100, mirrorX: true };
    const petals: BarLayerConfig = { x: "0%", y: "72%", width: "72%", height: "32%", blackPoint: 15, whitePoint: 255, xSquares: 200, ySquares: 150 };
    // Twice the sampling of the rest of the scene: a flower in these clouds
    // is eight or nine cells across, and on the default grid the whole
    // cluster fused into one mass — a cloud, which is the one thing it is
    // not supposed to be.
    const cloud: BarLayerConfig = { x: "5%", y: "25%", width: "65%", height: "45vw", blackPoint: 25, whitePoint: 255, xSquares: 200, ySquares: 200 };
    const birds: BarLayerConfig = { x: `${-birdW}%`, y: "30%", width: `${birdW}%`, height: `${birdW}vw`, blackPoint: 255, whitePoint: 0 };

    const layers: BarLayer[] = [
      canvasLayer(
        createMountains({ seed: SEED.mountainsNear, ...sizeFor(mountains, box, 1200), ridges: 4, variant: "near" }),
        mountains,
      ),
      canvasLayer(createHutSilhouette({ seed: SEED.hut, ...sizeFor(hutCfg, box, 320) }), hutCfg),
    ];
    if (isDesktop) {
      const tree = createAsciiTree({ seed: SEED.tree, ...sizeFor(treeR, box, 960), quality: "low" });
      layers.push(canvasLayer(tree, treeR));
      // The left tree is the same render mirrored by the shader: one WebGL
      // context and one build instead of two.
      layers.push(canvasLayer({ canvas: tree.canvas, animated: true, ready: tree.ready }, treeL));
    }
    layers.push(canvasLayer(createPetalBank({ seed: SEED.petals, ...sizeFor(petals, box, 1100) }), petals));
    // The blossoms are the thing Kevin asked for in place of the reference's
    // clouds, and the reference carries its cloud layer at every width, so
    // this is not desktop-only. Only the scroll tween on it is.
    layers.push(canvasLayer(createBlossomCloud({ seed: SEED.cloudA, ...sizeFor(cloud, box, 960) }), cloud));
    layers.push(canvasLayer(createBirds({ seed: SEED.birdsA, ...sizeFor(birds, box, 480) }), birds));

    const bc = barScene(canvas, layers, lightColors, 60, "0px");
    if (!bc) return;
    // Scroll-scrubbed tweens follow the reader's own scrolling, so they stay
    // under reduced motion; only the self-running bird loop is dropped. The
    // onUpdate repaint is for reduced motion, where the engine is throttled
    // to 2 fps: without it a config the reader is scrubbing only lands every
    // half second and the grade moves in visible steps.
    // reupload:false — the tween only moves the grade, the source pixels are
    // untouched, so there is no reason to push the textures again.
    const repaint = () => bc.redraw({ reupload: false });
    ctx.add(() => {
      gsap
        .timeline({ scrollTrigger: { trigger: canvas, start: "50% bottom", end: "bottom top", scrub: true, onUpdate: repaint } })
        .to(mountains, { blackPoint: 45, whitePoint: 175, ease: "none" }, 0)
        .to(hutCfg, { blackPoint: 75, whitePoint: 150, ease: "none" }, 0);
      if (isDesktop) {
        gsap
          .timeline({ scrollTrigger: { trigger: canvas, start: "top bottom", end: "bottom 50%", scrub: true, onUpdate: repaint } })
          .to(cloud, { x: "-30%", ease: "none" }, 0);
      }
      if (reduced) return;
      const loop = gsap
        .timeline({ paused: true })
        .to(birds, { x: "100%", duration: 5, ease: "none", delay: 5, repeat: -1, repeatDelay: 5 }, 0);
      watchLoop(canvas, loop);
    });
  };

  const initSceneHeroBg = () => {
    if (!isDesktop) return;
    const canvas = q<HTMLCanvasElement>("[data-intro-bg-scene]");
    if (!canvas) return;
    const box = boxOf(canvas);
    // Raised above the near range's box rather than level with it. At the
    // reference's own 45% the far crests sat entirely behind the near
    // skyline: only their top tenth ever showed, and all it did was fill
    // the near range's gaps and muddy it. From 33% the distant peaks stand
    // above the near crest and the depth reads.
    const mountains: BarLayerConfig = { ...FAR_HILL_GRADE, x: "0%", y: "30%", width: "100%", height: "64%" };
    const cloud: BarLayerConfig = { x: "30%", y: "0%", width: "65%", height: "45vw", blackPoint: 25, whitePoint: 255, xSquares: 200, ySquares: 200 };
    const birds: BarLayerConfig = { x: "-33.33%", y: "0%", width: "33.33%", height: "33.33vw", blackPoint: 255, whitePoint: 0 };
    const layers: BarLayer[] = [
      canvasLayer(
        createMountains({ seed: SEED.mountainsFar, ...sizeFor(mountains, box, 1200), variant: "far" }),
        mountains,
      ),
      canvasLayer(createBlossomCloud({ seed: SEED.cloudB, ...sizeFor(cloud, box, 960) }), cloud),
      canvasLayer(createBirds({ seed: SEED.birdsB, ...sizeFor(birds, box, 480) }), birds),
    ];
    const bc = barScene(canvas, layers, lightColors, 60, "0px");
    if (!bc) return;
    // reupload:false — the tween only moves the grade, the source pixels are
    // untouched, so there is no reason to push the textures again.
    const repaint = () => bc.redraw({ reupload: false });
    ctx.add(() => {
      gsap
        .timeline({ scrollTrigger: { trigger: canvas, start: "top bottom", end: "bottom 50%", scrub: true, onUpdate: repaint } })
        .to(cloud, { x: "60%", ease: "none" }, 0);
      if (reduced) return;
      const loop = gsap
        .timeline({ paused: true })
        .to(birds, { x: "100%", duration: 5, ease: "none", repeat: -1, repeatDelay: 5 }, 0);
      watchLoop(canvas, loop);
    });
  };

  // Prologue and preloader keep the default colours (their own dark theme:
  // bg dark, fill pink) and an inverted grade, so bright blossoms become
  // wide pink bars on the dark page.
  const initSceneProlog = () => {
    if (!isDesktop) return;
    const canvas = q<HTMLCanvasElement>("[data-prolog-scene]");
    if (!canvas) return;
    const box = boxOf(canvas);
    const base: BarLayerConfig = {
      x: "0%",
      y: "3%",
      width: "44%",
      height: "96%",
      blackPoint: 200,
      whitePoint: 25,
      xSquares: 125,
      ySquares: 150,
    };
    const left: BarLayerConfig = { ...base, x: "-14%" };
    const right: BarLayerConfig = { ...base, x: "70%" };
    const layers: BarLayer[] = [
      canvasLayer(createSprig({ seed: SEED.sprigLeft, ...sizeFor(left, box, 980), side: "left" }), left),
      canvasLayer(createSprig({ seed: SEED.sprigRight, ...sizeFor(right, box, 980), side: "right" }), right),
    ];
    barScene(canvas, layers);
  };

  // The live valley behind the hero. Desktop scrubs it by scroll; phones
  // and reduced motion get one still frame.
  const initHut = () => {
    const canvas = isDesktop
      ? q<HTMLCanvasElement>("[data-scroll-video]")
      : q<HTMLCanvasElement>("[data-hero-img]");
    if (!canvas) return;
    const stillFrame = reduced || !isDesktop;
    const scene = createHutScene(canvas, {
      quality: isDesktop ? "medium" : "low",
      seed: SEED.hutScene,
      reducedMotion: stillFrame,
    });
    hut = scene;
    // Set once the scene has drawn its first frame; before that there is
    // nothing to repaint and the buffer is meant to be empty.
    let built = false;
    // Resizing a WebGL drawing buffer clears it. On the phone and under
    // reduced motion the scene draws one frame and stops, so a later resize
    // — the observer fires once on attach, and again whenever the URL bar
    // collapses — left a black canvas with nothing to repaint it. Anything
    // with a running loop repaints itself.
    const fit = () => {
      scene.resize(
        canvas.offsetWidth || window.innerWidth,
        canvas.offsetHeight || window.innerHeight,
      );
      if (stillFrame && built) scene.renderOnce();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas.parentElement ?? canvas);
    let visible = false;
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? false;
        if (!built || stillFrame) return;
        if (visible) scene.start();
        else scene.stop();
      },
      { threshold: 0.01, rootMargin: "20% 0px 20% 0px" },
    );
    io.observe(canvas);
    const t0 = performance.now();
    const ready = scene.ready.then(() => {
      // Profiling hook, the same idiom as __treeBuildTimings: the valley is
      // the one scene the preloader waits for, so its cost IS the wait.
      (window as unknown as Record<string, unknown>).__hutBuildMs = Math.round(
        performance.now() - t0,
      );
      built = true;
      if (stillFrame) {
        scene.renderOnce();
        return;
      }
      if (visible) scene.start();
    });
    loads.push(ready);
    criticalLoads.push(ready);
    scenes.push({
      loaded: ready,
      destroy: () => {
        ro.disconnect();
        io.disconnect();
        scene.dispose();
      },
    });
  };

  // The valley first: it is what the preloader waits for, and everything
  // here yields cooperatively, so whatever starts first gets the thread.
  const initAllScenes = () => {
    initHut();
    initSceneHeroOver();
    initSceneHeroBg();
    initSceneProlog();
  };

  const whenReady = () =>
    withTimeout(Promise.all([...criticalLoads, document.fonts.ready]));

  // Percent counter: one step per scene promise.
  const trackProgress = (report: (n: number, total: number) => void) => {
    const total = loads.length;
    if (!total) return;
    let n = 0;
    for (const p of loads) {
      p.then(
        () => report(++n, total),
        () => report(++n, total),
      );
    }
  };

  // ------------------------------------------------------------------
  // Page scripts (reference initScripts, the parts the page uses).
  // ------------------------------------------------------------------
  const initThemeChange = () => {
    const themed = qa("[theme]");
    if (!themed.length) return;
    const bind = (band: HTMLElement, add: string, remove: string) => {
      if (getComputedStyle(band).display === "none") return;
      themed.forEach((el) => {
        const h = el.offsetHeight;
        const top = el.getBoundingClientRect().top;
        const apply = () => {
          el.classList.add(add);
          el.classList.remove(remove);
          recolourWordmarks(el);
        };
        ScrollTrigger.create({
          trigger: band,
          start: () => `top top+=${top + h / 2}`,
          end: () => `bottom top+=${top + h / 2}`,
          onEnter: apply,
          onEnterBack: apply,
        });
      });
    };
    qa('[bg="light"]').forEach((b) => bind(b, "theme_on-light", "theme_on-dark"));
    qa('[bg="dark"]').forEach((b) => bind(b, "theme_on-dark", "theme_on-light"));
  };

  const initHeaderHide = () => {
    const header = q(".header");
    if (!header) return;
    const bg = header.querySelector(".header_bg");
    let last = window.scrollY;
    let hidden = false;
    let past = window.scrollY > 1000;
    gsap.set(bg, { opacity: past ? 1 : 0 });
    ScrollTrigger.create({
      start: "top top",
      end: "max",
      onUpdate: (self) => {
        const y = self.scroll();
        const delta = Math.abs(y - last);
        const toEnd = document.documentElement.scrollHeight - (y + window.innerHeight);
        if (y > 1000) {
          past = true;
          gsap.to(bg, { opacity: 1, duration: DUR_S, ease: "Out", overwrite: true });
        } else {
          gsap.to(bg, { opacity: 0, duration: DUR_S, ease: "Out", overwrite: true });
        }
        if (delta < 40) return;
        if (y > last && past && !hidden) {
          gsap.to(header, { yPercent: -100, duration: DUR_M, ease: "Out", onComplete: () => { hidden = true; } });
        } else if (y < last && hidden) {
          gsap.to(header, { yPercent: 0, duration: DUR_M, ease: "Out", onComplete: () => { hidden = false; } });
        }
        if (toEnd <= 160) {
          gsap.to(header, { yPercent: 0, duration: DUR_M, ease: "Out", onComplete: () => { hidden = false; } });
        }
        last = y;
      },
    });
  };

  const initAllParallax = () => {
    qa('[parallax="ctn-down"]').forEach((el) => {
      if (getComputedStyle(el).display === "none") return;
      gsap.fromTo(
        el,
        { yPercent: -10 },
        {
          yPercent: 10,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
        },
      );
    });
  };

  const initScrollElementsReveal = () => {
    const kinds: [string, (t: Targets, m: Mode, d?: number) => void][] = [
      ["h", textH],
      ["p", textP],
      ["ctn", ctn],
      ["line", line],
    ];
    for (const [kind, fn] of kinds) {
      qa(`[data-scroll-reveal="${kind}"]`).forEach((el) => {
        const wrapper = el.closest('[data-scroll-reveal="w"]');
        if (reduced) {
          gsap.set(el, { visibility: "visible" });
          return;
        }
        fn(el, "initial");
        gsap.set(el, { visibility: "visible" });
        ScrollTrigger.create({
          trigger: wrapper || el,
          start: "top bottom",
          once: true,
          onEnter: () => fn(el, "reveal", 0),
        });
      });
    }
    const header = q("[header]");
    if (header) {
      if (!reduced) gsap.timeline().from(header, { yPercent: -100, duration: DUR_L, ease: "InOut" });
      gsap.set(header, { visibility: "visible" });
    }
  };

  // The quote's letters brighten as the block passes the middle of the
  // screen (reference initHighlightText).
  const initHighlightText = () => {
    qa("[data-highlight-text]").forEach((el) => {
      const split = new SplitText(el, { type: "chars", smartWrap: true, charsClass: "split-char" });
      extraSplits.push(split);
      if (!split.chars.length) return;
      const wrapper = el.closest("[data-highlight-wrapper]") || el;
      // The reference ends this at "bottom 50%" because it has sections below
      // the prologue to scroll through. Ours ends AT the prologue, so the
      // quote's bottom never reaches the middle of the screen and the last
      // words stayed at 10% opacity for good. Tying the end to the page end
      // makes the sentence finish exactly as the reader runs out of page.
      gsap
        .timeline({
          scrollTrigger: { trigger: wrapper, start: "top 75%", end: "max", scrub: true },
        })
        .from(split.chars, { opacity: 0.1, duration: DUR_S, ease: "Out", stagger: STAGGER });
    });
  };

  const initMagneticEffect = () => {
    if (!isDesktop || reduced) return;
    const reset = (el: Element, immediate: boolean) => {
      gsap.killTweensOf(el);
      const vars = { x: "0em", y: "0em", rotate: "0deg", clearProps: "all" };
      if (immediate) gsap.set(el, vars);
      else gsap.to(el, { ...vars, ease: "elastic.out(1, 0.3)", duration: 1.6 });
    };
    qa("[data-magnetic-strength]").forEach((el) => {
      const inner = Array.from(el.querySelectorAll("[data-magnetic-inner-target]"));
      const onEnter = () => {
        reset(el, true);
        inner.forEach((i) => reset(i, true));
      };
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const strength = parseFloat(el.getAttribute("data-magnetic-strength") || "") || 25;
        const strengthInner =
          parseFloat(el.getAttribute("data-magnetic-strength-inner") || "") || strength;
        const fx = (e.clientX - r.left) / el.offsetWidth - 0.5;
        const fy = (e.clientY - r.top) / el.offsetHeight - 0.5;
        gsap.to(el, {
          x: `${fx * (strength / 16)}em`,
          y: `${fy * (strength / 16)}em`,
          rotate: "0.001deg",
          ease: "power4.out",
          duration: 1.6,
        });
        inner.forEach((i) => {
          gsap.to(i, {
            x: `${fx * (strengthInner / 16)}em`,
            y: `${fy * (strengthInner / 16)}em`,
            rotate: "0.001deg",
            ease: "power4.out",
            duration: 2,
          });
        });
      };
      const onLeave = () => {
        gsap.to(el, { x: "0em", y: "0em", ease: "elastic.out(1, 0.3)", duration: 1.6, clearProps: "all" });
        inner.forEach((i) => {
          gsap.to(i, { x: "0em", y: "0em", ease: "elastic.out(1, 0.3)", duration: 2, clearProps: "all" });
        });
      };
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
      });
    });
  };

  const initNavItemHover = () => {
    if (!isDesktop || reduced) return;
    qa("[hover-nav-item]").forEach((item) => {
      const texts = item.querySelectorAll('[hover="text"]');
      if (texts.length < 2) return;
      const first = new SplitText(texts[0], { type: "chars", tag: "span", charsClass: "split-char", smartWrap: true });
      const second = new SplitText(texts[1], { type: "chars", tag: "span", charsClass: "split-char", smartWrap: true });
      extraSplits.push(first, second);
      gsap.set(second.chars, { yPercent: 75, opacity: 0, scale: 0 });
      const onEnter = () => {
        gsap.fromTo(
          first.chars,
          { opacity: 1, yPercent: 0, scale: 1 },
          {
            opacity: 0,
            yPercent: -75,
            scale: 0,
            duration: DUR_M,
            ease: "Out",
            stagger: { each: 0.25 * STAGGER, from: "random" },
            overwrite: true,
          },
        );
        gsap.fromTo(
          second.chars,
          { opacity: 0, yPercent: 75, scale: 0 },
          {
            opacity: 1,
            yPercent: 0,
            scale: 1,
            duration: DUR_M,
            delay: DELAY_REVEAL,
            ease: "Out",
            stagger: { each: 0.25 * STAGGER, from: "random" },
            overwrite: true,
          },
        );
      };
      const onLeave = () => {
        gsap.to(first.chars, {
          opacity: 1,
          yPercent: 0,
          scale: 1,
          duration: DUR_M,
          delay: DELAY_REVEAL,
          ease: "Out",
          stagger: { each: 0.25 * STAGGER, from: "random" },
          overwrite: true,
        });
        gsap.to(second.chars, {
          opacity: 0,
          yPercent: 75,
          scale: 0,
          duration: DUR_M,
          ease: "Out",
          stagger: { each: 0.25 * STAGGER, from: "random" },
          overwrite: true,
        });
      };
      const trigger = item.closest("[hover-nav-item-trigger]") || item;
      trigger.addEventListener("mouseenter", onEnter);
      trigger.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        trigger.removeEventListener("mouseenter", onEnter);
        trigger.removeEventListener("mouseleave", onLeave);
      });
    });
  };

  // Scroll drives the hut camera (the reference's 120 frames become a
  // progress 0..1) and shrinks the hero content away (reference initScrollVideo).
  // Under reduced motion the camera stays put (the scene renders one still)
  // but the hero still scales away with the scroll, or the sticky hero would
  // sit full size under the bar scene that scrolls over it.
  const initScrollVideo = () => {
    if (!isDesktop) return;
    const area = q(".hero-scroll-area");
    if (!area) return;
    const scene = hut;
    if (scene && !reduced) {
      const frame = { frame: 0 };
      gsap.to(frame, {
        frame: HUT_FRAMES,
        snap: "frame",
        ease: "none",
        scrollTrigger: { trigger: area, start: "top top", end: "75% bottom", scrub: 0.25 },
        onUpdate: () => scene.setProgress(frame.frame / HUT_FRAMES),
      });
    }
    const heroW = area.querySelector(".hero-w");
    const heroS = area.querySelector(".hero-s");
    // Last render scale handed to the valley, so the repaint below only
    // fires when the hero's size really changed.
    let lastRenderScale = 1;
    if (!heroW || !heroS) return;
    gsap.to(heroS, {
      scrollTrigger: { trigger: area, start: "top top", end: "70% bottom", scrub: 0.25 },
      scale: 0.5,
      yPercent: 12,
      ease: "none",
    });
    gsap
      .timeline({
        scrollTrigger: {
          trigger: area,
          start: "70% bottom",
          end: "bottom bottom",
          scrub: 1,
          // The hero shrinks to 0.3 here but the valley behind it kept
          // drawing a full-size buffer, so the last stretch of the page was
          // paying for ten times the pixels it could show. The scene clamps
          // the scale itself.
          //
          // The repaint is not optional: resizing a WebGL drawing buffer
          // clears it, and by this point in the page the scene's camera has
          // settled and its idle policy has stopped rendering — so without
          // one the shrunken hero was a black rectangle. Only on a real
          // change, so a still page does no work.
          onUpdate: () => {
            if (!scene) return;
            const next = gsap.getProperty(heroW, "scale") as number;
            if (Math.abs(next - lastRenderScale) < 0.01) return;
            lastRenderScale = next;
            scene.setRenderScale(next);
            scene.renderOnce();
          },
        },
      })
      .to(heroW, { scale: 0.3, ease: "Out", duration: 1 }, 0)
      .to(heroS, { opacity: 0, ease: "Out", duration: 0.33 }, 0);
  };

  const initScripts = () => {
    if (done) return;
    ctx.add(() => {
      initThemeChange();
      initHeaderHide();
      initAllParallax();
      initScrollElementsReveal();
      initHighlightText();
      initMagneticEffect();
      initNavItemHover();
      initScrollVideo();
      ScrollTrigger.refresh();
    });
  };

  // ------------------------------------------------------------------
  // Preloader (reference animatePreloaederIntro / animatePreloaederShort)
  // ------------------------------------------------------------------
  const preloader = q("[data-preloader]");
  const master = q("[data-master-preloader]");
  const logo = q('[data-preloader="logo"]');
  const logoStatic = q('[preloader="logo-static"]');
  const logoFinish = q('[preloader="logo-w-finish"]');
  // Where the preloader's wordmark came from, so unmount can put it back.
  let logoHome: { parent: Node; next: Node | null } | null = null;

  const setVisited = () => {
    try {
      sessionStorage.setItem(VISITED_KEY, "true");
    } catch {
      // Private mode: every visit gets the intro.
    }
  };

  const finish = () => {
    if (done) return;
    const introP = qa('[data-intro="p"]');
    const introCtn = qa('[data-intro="ctn"]');
    const video = q('[data-intro="video"]');
    if (logoFinish && logo && logoStatic) {
      logoStatic.classList.add("d-none");
      const state = Flip.getState(logo);
      logoHome = { parent: logo.parentNode as Node, next: logo.nextSibling };
      logoFinish.appendChild(logo);
      textP(introP, "initial");
      ctn(introCtn, "initial");
      ctx.add(() => {
        gsap
          .timeline()
          .fromTo(video, { scale: 1.5 }, { scale: 1, duration: 2 * DUR_L, ease: "Out" })
          .add(Flip.from(state, { duration: 1.5 * DUR_L, ease: "InOut" }), 0)
          .add(() => {
            textP(introP, "reveal");
            ctn(introCtn, "reveal");
          }, DUR_L)
          .add(() => {
            gsap.set(preloader, { display: "none" });
            dropPreloaderScene();
            transition?.classList.remove("theme_on-dark");
            initScripts();
            unlockScroll();
          });
      });
    } else {
      ctx.add(() => {
        gsap
          .timeline()
          .to(logo, { yPercent: 120, duration: DUR_L, ease: "Out" })
          .add(() => {
            gsap.set(preloader, { display: "none" });
            dropPreloaderScene();
            transition?.classList.remove("theme_on-dark");
            initScripts();
            unlockScroll();
          }, DUR_S);
      });
    }
  };

  const runIntro = () => {
    if (!preloader) {
      runShort();
      return;
    }
    const texts = preloader.querySelectorAll('[data-preloader="p"]');
    const ctns = preloader.querySelectorAll('[data-preloader="ctn"]');
    const scene = preloader.querySelector('[data-preloader="scene"]');
    const bg = preloader.querySelector('[data-preloader="bg"]');
    const percent = preloader.querySelector("[data-preloader-percent]");
    // The scenes start building NOW, not at the pause below. The reference
    // starts its at the pause because all it has to load is a folder of
    // images; ours generates a valley, and the two and a half seconds the
    // preloader spends introducing itself are two and a half seconds the
    // generator could have been running. The pause still waits for them, so
    // nothing about the sequence changes — it just starts sooner.
    initAllScenes();
    ctx.add(() => {
      const tl = gsap
        .timeline()
        .add(() => {
          setVisited();
          lockScroll();
          transition?.classList.add("theme_on-dark");
          animateTransition("init");
          textP(texts, "reveal");
          ctn(ctns, "reveal");
          // The solid sheet goes once the preloader's own first frame is set.
          master?.remove();
        })
        .fromTo(scene, { opacity: 0 }, { opacity: 1, duration: DUR_L, delay: DELAY_REVEAL, ease: "Out" })
        .fromTo(
          logo,
          { opacity: 0, yPercent: 25 },
          { opacity: 1, yPercent: 0, duration: DUR_L, delay: DELAY_REVEAL, ease: "Out" },
          "<",
        )
        .to({}, { duration: DUR_L })
        .add(() => {
          if (percent) percent.textContent = "0%";
          trackProgress((n, total) => {
            if (percent) percent.textContent = `${Math.round((n / total) * 100)}%`;
          });
          whenReady().then(() => {
            if (done) return;
            if (percent) percent.textContent = "100%";
            tl.resume();
          });
          tl.pause();
        })
        .add(() => {
          textP(texts, "hide");
          ctn(ctns, "hide");
        })
        .to(bg, { opacity: 0, duration: DUR_M, ease: "Out" })
        .add(() => animateTransition("out"))
        .to({}, { duration: DUR_S })
        .add(finish);
    });
  };

  const runShort = () => {
    setVisited();
    if (preloader) gsap.set(preloader, { display: "none" });
    transition?.classList.add("theme_on-dark");
    initAllScenes();
    // The short path shows no preloader — no counter, no sprig, nothing to
    // look at — so holding the curtain until the valley has finished
    // generating is a blank screen for several seconds. It lifts on the
    // fonts instead, and the valley fades in behind the hero when it
    // arrives, which is what its canvas already does on first paint.
    withTimeout(document.fonts.ready).then(() => {
      if (done) return;
      // Everything else on this path is gated on `reduced`; the 240-cell
      // wipe was not, so a reader who asked for less motion still got the
      // one big animation on the page. Hide it in a frame instead.
      if (reduced) gsap.set(transition, { display: "none" });
      else ctx.add(() => animateTransition("out"));
      initScripts();
      const t = setTimeout(() => transition?.classList.remove("theme_on-dark"), 1000 * DUR_L);
      cleanups.push(() => clearTimeout(t));
      master?.remove();
    });
  };

  // ------------------------------------------------------------------
  // Go
  // ------------------------------------------------------------------
  let visited = false;
  try {
    visited = sessionStorage.getItem(VISITED_KEY) === "true";
  } catch {
    visited = false;
  }
  // Decided before anything is built: on the short path the preloader never
  // paints, so neither its wordmark nor its sprig is worth a WebGL context.
  const shortPath = visited || reduced;
  initWordmarks(shortPath);
  if (!shortPath) initScenePreloader();
  if (shortPath) runShort();
  else runIntro();

  return () => {
    done = true;
    cleanups.forEach((fn) => fn());
    ctx.revert();
    for (const s of extraSplits) s.revert();
    for (const s of splitMap.values()) s.revert();
    splitMap.clear();
    for (const s of scenes) s.destroy();
    hut = null;
    if (logoHome && logo) {
      logoHome.parent.insertBefore(logo, logoHome.next);
      logoStatic?.classList.remove("d-none");
    }
    transition?.classList.remove("theme_on-dark");
    qa("[data-wordmark]").forEach((el) => el.classList.remove("is-fallback"));
    unlockScroll();
  };
}
