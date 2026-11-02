import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

import { createObserver, type Sighting } from "@/components/ideas/i04/observe";

gsap.registerPlugin(SplitText);

/**
 * Idea 4's serif headings: each builds up out of thin vertical bars that
 * thicken and merge into its letters as it comes on screen, and every
 * letter stretches taller from its baseline with the scroll's speed and
 * settles back when the page stops, the left letters first.
 *
 * Only the letters this file wraps are touched (SplitText's, or a span
 * inside each of the statement's own letters), never the elements the
 * page's own animations move.
 */

export const CHAR_CLASS = "i4-ch";
/** On the statement's sentence: its letters' own blur-in is switched off,
 *  as the bars build it instead. */
export const LINE_CLASS = "i4-line";

/** Seconds one letter takes from its first thin bars to whole. */
const BUILD = 0.6;
/** Seconds the build takes to cross a heading, left to right. */
const SWEEP = 0.35;
/** A letter's bars when they first show, as a share of the bar period. */
const FIRST_BAR = 0.12;
/** The bars' period as a share of the font size. */
const PERIOD = 0.075;
/** Tallest stretch, reached at this scroll speed (px a second). */
const STRETCH_MAX = 0.25;
const STRETCH_MAX_AT = 1500;
/** How fast (per second) a letter follows the speed, at the heading's left
 *  and right ends: the left goes first and settles first. */
const FOLLOW_LEFT = 13;
const FOLLOW_RIGHT = 6;
/** Below this a stretch is let go to none. */
const REST = 0.0008;

type LenisLike = { velocity: number };

type Target = {
  el: HTMLElement;
  chars: HTMLElement[];
  /** Whether its section has let it show (Skills fades its groups in),
   *  and the elements whose style says so. */
  shown: () => boolean;
  shownBy: HTMLElement[];
  undo: () => void;
};

type Heading = Target & {
  sighting: Sighting;
  across: number[];
  stretch: number[];
  state: "hidden" | "building" | "whole";
  build: gsap.core.Tween | null;
};

const always = (): boolean => true;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const thicken = gsap.parseEase("power2.inOut");

function lenisNow(): LenisLike {
  const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
  if (!lenis) throw new Error("idea 4: no Lenis on the page (window.__lenis)");
  return lenis;
}

function statementTarget(): Target {
  const line = document.querySelector<HTMLElement>("section[data-statement] p[aria-label]");
  if (!line) throw new Error("idea 4: the statement's sentence is not on the page");
  const letters = [...line.querySelectorAll<HTMLElement>("[data-letter]")];
  const chars = letters.map((letter) => {
    const inner = document.createElement("span");
    inner.className = CHAR_CLASS;
    inner.style.display = "inline-block";
    inner.append(...letter.childNodes);
    letter.append(inner);
    return inner;
  });
  line.classList.add(LINE_CLASS);
  return {
    el: line,
    chars,
    shown: always,
    shownBy: [],
    undo: () => {
      line.classList.remove(LINE_CLASS);
      letters.forEach((letter, i) => {
        letter.append(...chars[i].childNodes);
        chars[i].remove();
      });
    },
  };
}

function splitTarget(el: HTMLElement, shown: () => boolean = always, shownBy: HTMLElement[] = []): Target {
  const split = SplitText.create(el, { type: "words,chars", charsClass: CHAR_CLASS });
  return { el, chars: split.chars as HTMLElement[], shown, shownBy, undo: () => split.revert() };
}

function required<T extends Element>(selector: string): T[] {
  const found = [...document.querySelectorAll<T>(selector)];
  if (!found.length) throw new Error(`idea 4: nothing on the page matches ${selector}`);
  return found;
}

/** A Skills group name shows once Skills has faded its group in (wide) or
 *  wiped its list in (narrow). */
function skillsGroupTarget(name: HTMLElement): Target {
  const group = name.closest<HTMLElement>("[data-group]");
  const list = name.closest<HTMLElement>("[data-groups]");
  if (!group || !list) throw new Error("idea 4: a Skills group name is outside its group");
  const shown = (): boolean =>
    group.style.visibility !== "hidden" && Number(group.style.opacity || 1) > 0.02 && !list.style.clipPath.endsWith("100%)");
  return splitTarget(name, shown, [group, list]);
}

function findTargets(): Target[] {
  return [
    statementTarget(),
    ...required<HTMLElement>("#work-title").map((el) => splitTarget(el)),
    ...required<HTMLElement>("#work ol li > :first-child").map((el) => splitTarget(el)),
    ...required<HTMLElement>("[data-group] h3 button > span:first-child").map(skillsGroupTarget),
  ];
}

/** One bar per `period` px, `width` px wide, centred in its period. */
function setBars(char: HTMLElement, width: number, period: number): void {
  const a = ((period - width) / 2).toFixed(2);
  const b = ((period + width) / 2).toFixed(2);
  char.style.maskImage = `linear-gradient(90deg, transparent ${a}px, #000 ${a}px, #000 ${b}px, transparent ${b}px)`;
}

function clearBars(char: HTMLElement): void {
  char.style.maskImage = "";
  char.style.maskSize = "";
  char.style.maskRepeat = "";
  char.style.maskPosition = "";
}

/** Each letter stretches from its own baseline: a zero-size inline box sits
 *  on the baseline, and its offsetTop ignores the letter's transform. */
function setOrigins(chars: HTMLElement[]): void {
  const probes = chars.map((char) => {
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0";
    char.append(probe);
    return probe;
  });
  const baselines = probes.map((probe) => probe.offsetTop);
  probes.forEach((probe) => probe.remove());
  chars.forEach((char, i) => {
    char.style.transformOrigin = `50% ${baselines[i]}px`;
  });
}

function hide(h: Heading): void {
  h.build?.kill();
  h.build = null;
  h.state = "hidden";
  for (const char of h.chars) {
    clearBars(char);
    char.style.visibility = "hidden";
  }
}

function play(h: Heading): void {
  const rects = h.chars.map((char) => char.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  h.across = rects.map((r) => (r.left - left) / Math.max(1, right - left));
  const period = Math.max(3, Math.round(parseFloat(getComputedStyle(h.chars[0]).fontSize) * PERIOD));
  h.chars.forEach((char, i) => {
    char.style.visibility = "";
    // One period a tile, each letter's tiles shifted onto the heading's
    // grid, so the bars run straight through the letters.
    char.style.maskSize = `${period}px 100%`;
    char.style.maskRepeat = "repeat";
    char.style.maskPosition = `${-((rects[i].left - left) % period)}px 0`;
    setBars(char, 0, period);
  });
  setOrigins(h.chars);
  const clock = { t: 0 };
  h.state = "building";
  h.build = gsap.to(clock, {
    t: SWEEP + BUILD,
    duration: SWEEP + BUILD,
    ease: "none",
    onUpdate: () => {
      h.chars.forEach((char, i) => {
        const q = clamp01((clock.t - SWEEP * h.across[i]) / BUILD);
        setBars(char, q <= 0 ? 0 : period * (FIRST_BAR + (1 - FIRST_BAR) * thicken(q)), period);
      });
    },
    onComplete: () => {
      h.chars.forEach(clearBars);
      h.state = "whole";
      h.build = null;
    },
  });
}

function unstretch(h: Heading): void {
  h.chars.forEach((char, i) => {
    h.stretch[i] = 0;
    char.style.transform = "";
  });
}

export function startHeadings(): () => void {
  const observer = createObserver();
  const headings: Heading[] = [];

  const check = (h: Heading): void => {
    const shown = h.shown();
    if (h.state !== "hidden" && (!h.sighting.present || !shown)) hide(h);
    else if (h.state === "hidden" && h.sighting.entered && shown) play(h);
    if (!h.sighting.present) unstretch(h);
  };

  let awake = false;
  const tick = (_time: number, deltaMs: number): void => {
    const dt = Math.min(0.05, Math.max(1 / 240, deltaMs / 1000));
    const speed = Math.abs(lenisNow().velocity) / dt;
    const target = Math.min(STRETCH_MAX, (STRETCH_MAX * speed) / STRETCH_MAX_AT);
    let moving = target > 0;
    for (const h of headings) {
      if (!h.sighting.present) continue;
      h.chars.forEach((char, i) => {
        const rate = FOLLOW_LEFT + (FOLLOW_RIGHT - FOLLOW_LEFT) * h.across[i];
        let s = h.stretch[i] + (target - h.stretch[i]) * (1 - Math.exp(-rate * dt));
        if (target === 0 && s < REST) s = 0;
        if (s > 0) moving = true;
        if (s === h.stretch[i]) return;
        h.stretch[i] = s;
        char.style.transform = s ? `scaleY(${(1 + s).toFixed(4)})` : "";
      });
    }
    if (!moving) {
      gsap.ticker.remove(tick);
      awake = false;
    }
  };
  const wake = (): void => {
    if (awake) return;
    awake = true;
    gsap.ticker.add(tick);
  };

  const styleWatchers: MutationObserver[] = [];
  for (const target of findTargets()) {
    const h: Heading = {
      ...target,
      sighting: { entered: false, present: false },
      across: target.chars.map(() => 0),
      stretch: target.chars.map(() => 0),
      state: "whole",
      build: null,
    };
    hide(h);
    h.sighting = observer.watch(h.el, () => check(h));
    if (h.shownBy.length) {
      const watcher = new MutationObserver(() => check(h));
      for (const el of h.shownBy) watcher.observe(el, { attributes: true, attributeFilter: ["style"] });
      styleWatchers.push(watcher);
    }
    headings.push(h);
  }

  let resizeFrame = 0;
  const onResize = (): void => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      for (const h of headings) if (h.state !== "hidden") setOrigins(h.chars);
    });
  };
  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("resize", onResize);

  return () => {
    observer.stop();
    for (const watcher of styleWatchers) watcher.disconnect();
    window.removeEventListener("scroll", wake);
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(resizeFrame);
    gsap.ticker.remove(tick);
    for (const h of headings) {
      h.build?.kill();
      for (const char of h.chars) {
        clearBars(char);
        char.style.visibility = "";
        char.style.transform = "";
        char.style.transformOrigin = "";
      }
      h.undo();
    }
  };
}
