import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import type { Fonts } from "./faces";
import {
  anchorNear,
  artsFor,
  cardAt,
  clamp,
  corners,
  cssOf,
  ease,
  FAN,
  mix,
  type Pose,
  PROJECTS,
  restPoses,
  sceneAt,
  SHEETS,
  SLOT,
  SPAN,
  STEP_U,
  stepFor,
  STEPS,
  TEXT_WIDTH,
} from "./layout";
import { buildTilt, drawStills, type Tilt } from "./scene";

gsap.registerPlugin(SplitText);

/**
 * Joins the page to the scene. Each frame it reads how far the page has
 * scrolled, decides which step that is, runs the swap to it, and hands
 * layout.ts's answer to the scene.
 *
 * Nothing here goes through React. It changes every frame.
 *
 * The page's scroll picks the step. The swap itself runs on the clock,
 * not on the scroll, so the wave always travels at the same speed. A
 * swap is never cut short: if the page moves on while one is running,
 * the next starts when it ends and goes straight to the newest step.
 */

const SWAP_SECONDS = 1.3;
/** How long the page must be still before it is drawn to the nearest step. */
const SNAP_AFTER_MS = 180;
const SNAP_SECONDS = 0.9;
const GO_SECONDS = 1.1;

type LenisLike = {
  scrollTo(target: number, options?: { duration?: number; immediate?: boolean; force?: boolean; easing?: (t: number) => number }): void;
};

type Handle = {
  goTo(step: number): void;
  jump(step: number): void;
  readonly state: unknown;
};

type Step = {
  el: HTMLElement;
  chars: Element[];
  rises: HTMLElement[];
  links: HTMLElement[];
};

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b09: ${selector} is missing`);
  return el;
}

function fontsOf(root: HTMLElement): Fonts {
  return {
    sans: getComputedStyle(need<HTMLElement>(root, "[data-title]")).fontFamily,
    mono: getComputedStyle(need<HTMLElement>(root, "[data-hint]")).fontFamily,
  };
}

const lenisOf = (): LenisLike | null => {
  const l = (window as unknown as { __lenis?: LenisLike }).__lenis;
  return l && typeof l.scrollTo === "function" ? l : null;
};

/** Draws the five stills for the stacked page. Throws if WebGL cannot start. */
export function startStills(root: HTMLElement): void {
  drawStills(Array.from(root.querySelectorAll<HTMLCanvasElement>("[data-still]")));
}

/** Starts the scene on the page. Returns what stops it. Throws if WebGL
 *  cannot start, before it has changed the page. */
export function startTilt(root: HTMLElement): () => void {
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  // A canvas of our own, made here and thrown away at the end. In
  // development React starts every effect twice, and a canvas whose
  // context was let go the first time cannot be given a new one.
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  const tilt = buildTilt(canvas, fontsOf(root));
  slot.appendChild(canvas);
  const endScene = (): void => {
    tilt.dispose();
    canvas.remove();
  };
  try {
    return bind(root, stage, tilt, endScene);
  } catch (error) {
    // Something on the page was not as expected. Give the GPU back
    // before passing the error on.
    endScene();
    throw error;
  }
}

function bind(root: HTMLElement, stage: HTMLElement, tilt: Tilt, endScene: () => void): () => void {
  let alive = true;
  const journey = need<HTMLElement>(root, "[data-journey]");
  const layers = {
    work: need<HTMLElement>(root, '[data-layer="work"]'),
    skills: need<HTMLElement>(root, '[data-layer="skills"]'),
    contact: need<HTMLElement>(root, '[data-layer="contact"]'),
  };
  const workLabel = need<HTMLElement>(root, "[data-work-label]");
  const marks = Array.from(root.querySelectorAll<HTMLElement>("[data-mark]"));
  const groups = Array.from(root.querySelectorAll<HTMLElement>("[data-group]"));
  const titles = Array.from(root.querySelectorAll<HTMLElement>("[data-title]"));

  // ------------------------------------------------------------ words
  const splits: SplitText[] = [];
  const steps: Step[] = [];
  for (let i = 0; i < STEPS; i += 1) {
    const el = need<HTMLElement>(root, `[data-step="${i}"]`);
    const chars: Element[] = [];
    for (const line of Array.from(el.querySelectorAll<HTMLElement>("[data-letters]"))) {
      // The heading carries the whole title for a screen reader. The
      // letters are for the eye only.
      const split = SplitText.create(line, { type: "words,chars", aria: "none" });
      splits.push(split);
      chars.push(...split.chars);
    }
    steps.push({
      el,
      chars,
      rises: Array.from(el.querySelectorAll<HTMLElement>("[data-rise]")),
      links: Array.from(el.querySelectorAll<HTMLElement>("a, [data-group]")),
    });
  }
  const everything = steps.flatMap((s) => [...s.chars, ...s.rises]);
  gsap.set(everything, { opacity: 0 });

  const reach = (s: Step, on: boolean): void => {
    for (const l of s.links) l.style.pointerEvents = on ? "auto" : "none";
  };
  for (const s of steps) reach(s, false);

  const showStep = (i: number, delay: number): void => {
    const s = steps[i];
    gsap.killTweensOf([...s.chars, ...s.rises]);
    gsap.fromTo(
      s.chars,
      { yPercent: 60, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.8, ease: "power3.out", stagger: s.chars.length > 20 ? 0.018 : 0.035, delay },
    );
    gsap.fromTo(
      s.rises,
      { yPercent: 40, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.06, delay: delay + 0.2 },
    );
    reach(s, true);
  };
  const hideStep = (i: number): void => {
    const s = steps[i];
    const all = [...s.chars, ...s.rises];
    gsap.killTweensOf(all);
    gsap.to(all, { yPercent: -25, opacity: 0, duration: 0.3, ease: "power2.in" });
    reach(s, false);
  };
  const setStep = (i: number): void => {
    steps.forEach((s, n) => {
      const all = [...s.chars, ...s.rises];
      gsap.killTweensOf(all);
      gsap.set(all, { yPercent: 0, opacity: n === i ? 1 : 0 });
      reach(s, n === i);
    });
  };
  const setMarks = (i: number): void => {
    // The work layer follows the stage to the end. Its heading must not
    // stand over the skills' or the contact's.
    workLabel.style.opacity = i < PROJECTS ? "1" : "0";
    marks.forEach((m, n) => {
      const ink = m.firstElementChild as HTMLElement | null;
      if (!ink) return;
      ink.style.transform = `scaleX(${n === i ? 1 : 0.4})`;
      ink.style.opacity = n === i ? "1" : "0.45";
      if (n === i) m.setAttribute("aria-current", "step");
      else m.removeAttribute("aria-current");
    });
  };

  // ------------------------------------------------------------- size
  let stageW = 1;
  let stageH = 1;
  let aspect = 1.85;
  let fanRest: Pose[] = restPoses(FAN, aspect);

  /** The titles' sizes come from the font's own widths. If the page sets
   *  one wider than its space all the same, it is made smaller here. */
  const fitTitles = (): void => {
    const space = (stageW * TEXT_WIDTH) / 100;
    for (const t of titles) {
      t.style.fontSize = "";
      const given = t.dataset.size ? `${t.dataset.size}vw` : "";
      if (given) t.style.fontSize = given;
      let widest = 0;
      for (const line of Array.from(t.querySelectorAll<HTMLElement>("[data-letters]"))) {
        widest = Math.max(widest, line.scrollWidth);
      }
      // Two pixels of grace: the widths read back are whole numbers.
      if (widest > space + 2) {
        const now = parseFloat(getComputedStyle(t).fontSize);
        const fitted = ((now * space) / widest) * 0.99;
        t.style.fontSize = `${((fitted / stageW) * 100).toFixed(2)}vw`;
      }
    }
  };

  const measure = (): void => {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    aspect = stageW / stageH;
    fanRest = restPoses(FAN, aspect);
    tilt.resize(stageW, stageH);
    fitTitles();
  };

  // ------------------------------------------------------------ state
  const swap = { from: 0, to: 0, p: 1, artFrom: 0, artTo: 0 };
  let lastArt = 0;
  let wanted = 0;
  /** The step the page last rested on. */
  let anchor = 0;
  /** A step asked for by a mark or the handle. It holds until the page
   *  has scrolled there, so the steps passed on the way are not shown. */
  let forced = -1;
  let forcedAt = 0;
  let entered = false;
  let time = 0;
  let before = performance.now();
  let lastU = 0;
  let lastMove = before;
  let lastSnap = 0;
  let touching = false;
  let u = 0;

  const pointer = { x: 0, y: 0, clientX: -1, clientY: -1, inside: false };
  const lag = { x: 0, y: 0 };
  const lift = [0, 0, 0, 0, 0];
  let overCard = -1;
  let overGroup = -1;
  let shownCard = -2;

  let shownGround = "";
  let shownInk = "";
  const shownShift = { work: "", skills: "", contact: "" };

  const topOfJourney = (): number => journey.getBoundingClientRect().top + window.scrollY;

  const scrollToStep = (i: number, seconds: number): void => {
    const top = topOfJourney() + STEP_U[i] * stageH;
    const lenis = lenisOf();
    if (lenis) lenis.scrollTo(top, { duration: seconds, easing: ease });
    else window.scrollTo({ top, behavior: "smooth" });
  };

  const goTo = (i: number): void => {
    const step = clamp(Math.round(i), 0, STEPS - 1);
    forced = step;
    forcedAt = performance.now();
    scrollToStep(step, GO_SECONDS);
  };

  /** Goes to a step at once, with nothing left moving. For captures. */
  const jump = (i: number): void => {
    const step = clamp(Math.round(i), 0, STEPS - 1);
    const top = topOfJourney() + STEP_U[step] * stageH;
    const lenis = lenisOf();
    if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
    else window.scrollTo(0, top);
    forced = step;
    forcedAt = performance.now();
    wanted = step;
    anchor = step;
    const [, art] = artsFor(swap.to, step, lastArt);
    lastArt = art;
    swap.from = step;
    swap.to = step;
    swap.p = 1;
    swap.artFrom = art;
    swap.artTo = art;
    entered = true;
    setStep(step);
    setMarks(step);
    frame(0);
  };

  const begin = (to: number): void => {
    const [a, b] = artsFor(swap.to, to, lastArt);
    hideStep(swap.to);
    swap.from = swap.to;
    swap.to = to;
    swap.p = 0;
    swap.artFrom = a;
    swap.artTo = b;
    lastArt = b;
    showStep(to, 0.55);
    setMarks(to);
  };

  const view = { from: 0, to: 0, p: 1, artFrom: 0, artTo: 0, drift: 0, tiltX: 0, tiltY: 0, lift, aspect };
  let lastPoses: Pose[] = [];

  const frame = (dt: number): void => {
    time += dt;
    const box = journey.getBoundingClientRect();
    const scrolled = -box.top;
    u = scrolled / stageH;
    const now = performance.now();
    if (Math.abs(u - lastU) > 0.0005) lastMove = now;
    lastU = u;
    const pinned = clamp(u, 0, SPAN);

    // The first time the stage fills a good part of the window, the
    // words come in.
    if (!entered && u > -0.62) {
      entered = true;
      let nearest = 0;
      for (let i = 1; i < STEPS; i += 1) {
        if (Math.abs(pinned - STEP_U[i]) < Math.abs(pinned - STEP_U[nearest])) nearest = i;
      }
      wanted = nearest;
      anchor = nearest;
      const [, art] = artsFor(wanted, wanted, 0);
      lastArt = art;
      swap.from = wanted;
      swap.to = wanted;
      swap.p = 1;
      swap.artFrom = art;
      swap.artTo = art;
      showStep(wanted, 0.1);
      setMarks(wanted);
    }

    if (forced >= 0) {
      wanted = forced;
      if (Math.abs(u - STEP_U[forced]) < 0.02 || now - forcedAt > 4000) {
        anchor = forced;
        forced = -1;
      }
    } else if (entered) {
      anchor = anchorNear(pinned, anchor);
      wanted = stepFor(pinned, anchor, wanted);
    }

    // The soft snap. Only while the stage is pinned, so the page above
    // and below is left alone, and never under a finger.
    if (
      entered &&
      forced < 0 &&
      !touching &&
      u > 0 &&
      u < SPAN &&
      now - lastMove > SNAP_AFTER_MS &&
      now - lastSnap > 1200 &&
      Math.abs(u - STEP_U[wanted]) > 0.004
    ) {
      lastSnap = now;
      scrollToStep(wanted, SNAP_SECONDS);
    }

    if (entered && swap.p >= 1 && wanted !== swap.to) begin(wanted);
    if (swap.p < 1) swap.p = Math.min(1, swap.p + dt / SWAP_SECONDS);

    // The cursor, followed late.
    const k = 1 - Math.exp(-dt * 3.2);
    lag.x += (pointer.x - lag.x) * k;
    lag.y += (pointer.y - lag.y) * k;

    // Which card the cursor is over. Asked of the cards at rest, so a
    // card that has lifted does not slide out from under the cursor.
    const atFan = swap.to === FAN && swap.p >= 1;
    overCard = -1;
    if (atFan && pointer.inside) {
      const s = stage.getBoundingClientRect();
      overCard = cardAt(fanRest, aspect, ((pointer.clientX - s.left) / s.width) * 100, ((pointer.clientY - s.top) / s.height) * 100);
    }
    const card = atFan ? (overGroup >= 0 ? SLOT.indexOf(overGroup) : overCard) : -1;
    const kLift = 1 - Math.exp(-dt * 9);
    for (let n = 0; n < SHEETS; n += 1) lift[n] += ((n === card ? 1 : 0) - lift[n]) * kLift;
    if (card !== shownCard) {
      shownCard = card;
      stage.style.cursor = card >= 0 && overCard >= 0 ? "pointer" : "";
      groups.forEach((g, n) => {
        g.style.opacity = card < 0 || SLOT[card] === n ? "1" : "0.4";
      });
    }

    const rest = mix(STEP_U[swap.from], STEP_U[swap.to], ease(swap.p));
    view.from = swap.from;
    view.to = swap.to;
    view.p = swap.p;
    view.artFrom = swap.artFrom;
    view.artTo = swap.artTo;
    view.drift = clamp(pinned - rest, -1.2, 1.2);
    view.tiltX = lag.x;
    view.tiltY = lag.y;
    view.aspect = aspect;
    const scene = sceneAt(view);
    lastPoses = scene.poses;
    tilt.draw(scene, time);

    const ground = cssOf(scene.ground);
    if (ground !== shownGround) {
      shownGround = ground;
      stage.style.backgroundColor = ground;
    }
    const ink = cssOf(scene.ink);
    if (ink !== shownInk) {
      shownInk = ink;
      root.style.setProperty("--b09-ink", ink);
    }

    // The words sit in their own sections, so a link to #skills lands on
    // the skills. These moves put each layer over the stage wherever the
    // page is.
    const at = clamp(scrolled, 0, SPAN * stageH);
    const shifts = {
      work: at - clamp(scrolled, 0, 5 * stageH),
      skills: at - 6 * stageH,
      contact: at - 7 * stageH,
    };
    for (const name of ["work", "skills", "contact"] as const) {
      const value = `translate3d(0, ${shifts[name].toFixed(1)}px, 0)`;
      if (value !== shownShift[name]) {
        shownShift[name] = value;
        layers[name].style.transform = value;
      }
    }
  };

  // ------------------------------------------------------------ clock
  // On gsap's clock, after the page's smooth scroll has moved the page
  // in the same tick, so the scene is never a frame behind the scroll.
  let onScreen = false;
  const tick = (): void => {
    const now = performance.now();
    const dt = clamp((now - before) / 1000, 0, 0.1);
    before = now;
    // Draw only while the stage can be seen and the tab is the one in front.
    if (!onScreen || document.hidden) return;
    frame(dt);
  };
  gsap.ticker.add(tick);

  const seen = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
  });
  seen.observe(stage);

  // Changing the canvas's size empties it. Draw at once.
  const sized = new ResizeObserver(() => {
    measure();
    frame(0);
  });
  sized.observe(stage);
  measure();

  // The cards' letters were drawn in whatever font was there at the
  // time. Draw them again when the page's own has arrived.
  void document.fonts.ready.then(() => {
    if (!alive) return;
    tilt.redrawFaces(fontsOf(root));
    fitTitles();
  });

  // ------------------------------------------------------------ input
  const onPointer = (e: PointerEvent): void => {
    pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    pointer.clientX = e.clientX;
    pointer.clientY = e.clientY;
    pointer.inside = e.target instanceof Node && root.contains(e.target);
  };
  const onLeave = (): void => {
    pointer.inside = false;
  };
  const onTouchStart = (): void => {
    touching = true;
  };
  const onTouchEnd = (): void => {
    touching = false;
    lastMove = performance.now();
  };
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });

  const onClick = (e: MouseEvent): void => {
    const mark = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-mark]") : null;
    if (mark) goTo(Number(mark.dataset.mark));
  };
  // A link reached with the Tab key may belong to a step that is not
  // showing. Go to its step, so what has focus can be seen.
  const onFocus = (e: FocusEvent): void => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-step]") : null;
    if (!el) return;
    const step = Number(el.dataset.step);
    if (step !== swap.to && step !== forced) goTo(step);
  };
  root.addEventListener("click", onClick);
  root.addEventListener("focusin", onFocus);

  const overGroups = groups.map((g, n) => {
    const enter = (): void => {
      overGroup = n;
    };
    const leave = (): void => {
      if (overGroup === n) overGroup = -1;
    };
    g.addEventListener("pointerenter", enter);
    g.addEventListener("pointerleave", leave);
    return (): void => {
      g.removeEventListener("pointerenter", enter);
      g.removeEventListener("pointerleave", leave);
    };
  });

  // ----------------------------------------------------------- handle
  const host = window as unknown as { __b09?: Handle };
  if (process.env.NODE_ENV !== "production") {
    host.__b09 = {
      goTo,
      jump,
      get state() {
        return {
          step: swap.to,
          from: swap.from,
          progress: swap.p,
          wanted,
          settled: swap.p >= 1 && wanted === swap.to && forced < 0,
          scrollInScreens: u,
          stepScrollTops: STEP_U.map((s) => Math.round(topOfJourney() + s * stageH)),
          stage: [stageW, stageH],
          ground: shownGround,
          ink: shownInk,
          // Each sheet's four corners, percent of the stage.
          corners: lastPoses.map((p) => (p.a > 0.01 ? corners(p, aspect) : null)),
        };
      },
    };
  }

  // One frame now, so the stage is never an empty canvas while it waits
  // for the observer to say it is on screen.
  setMarks(0);
  frame(0);

  return () => {
    alive = false;
    gsap.ticker.remove(tick);
    seen.disconnect();
    sized.disconnect();
    window.removeEventListener("pointermove", onPointer);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
    root.removeEventListener("click", onClick);
    root.removeEventListener("focusin", onFocus);
    for (const off of overGroups) off();
    gsap.killTweensOf(everything);
    for (const s of splits) s.revert();
    for (const t of titles) t.style.fontSize = t.dataset.size ? `${t.dataset.size}vw` : "";
    if (host.__b09) delete host.__b09;
    root.style.removeProperty("--b09-ink");
    stage.style.cursor = "";
    endScene();
  };
}
