import gsap from "gsap";

import { createObserver, type Sighting } from "@/components/ideas/i04/observe";

/**
 * Idea 4's project subtitles: as a row comes on screen its subtitle tunes
 * in like a TV, each character flickering through ▌▐│ before it lands,
 * left to right; the quantities in it ($1k, 200+, 1st, 80th, ~20,000) roll
 * up digit by digit like an odometer. Years are not quantities, so they
 * tune in with the letters instead of counting up from 0000.
 *
 * The subtitle's own text node is kept, moved into a screen-reader-only
 * span, so it still reads as one string.
 */

export const TUNE_CLASS = "i4-tune";
export const ODO_CLASS = "i4-odo";
export const STRIP_CLASS = "i4-strip";
export const ROLLING_CLASS = "i4-rolling";

const GLYPHS = ["▌", "▐", "│"];
/** Seconds between a flickering character's glyph changes. */
const FLICKER = 0.045;
/** Seconds the tuning takes to cross the line, and each character's
 *  flicker before it lands. */
const SPREAD = 0.3;
const NOISE = 0.2;
/** Seconds a digit rolls. */
const ROLL = 0.95;
/** Seconds after the row comes on screen, so its name has started first. */
const AFTER_ENTER = 0.15;
const DURATION = SPREAD + Math.max(NOISE, ROLL);

const rollEase = gsap.parseEase("power3.out");

type Cell = { el: HTMLElement; at: number; strip: HTMLElement | null; steps: number; height: number; flick: number };

type Subtitle = {
  cells: Cell[];
  sighting: Sighting;
  state: "hidden" | "playing" | "done";
  tween: gsap.core.Tween | null;
  undo: () => void;
};

/** True for the digits that roll: every digit outside a year. */
function rollingDigits(chars: string[]): boolean[] {
  const rolls = chars.map((ch) => /\d/.test(ch));
  for (const run of chars.join("").matchAll(/\d+/g)) {
    if (!/^(?:19|20)\d\d$/.test(run[0])) continue;
    for (let i = run.index; i < run.index + 4; i += 1) rolls[i] = false;
  }
  return rolls;
}

/** Each digit's place in its number counted from the right (units 0),
 *  reading "20,000" as one number. */
function placesFromRight(chars: string[]): number[] {
  const places = chars.map(() => -1);
  let place = 0;
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const ch = chars[i];
    if (/\d/.test(ch)) {
      places[i] = place;
      place += 1;
    } else if (!(ch === "," && /\d/.test(chars[i - 1] ?? "") && /\d/.test(chars[i + 1] ?? ""))) {
      place = 0;
    }
  }
  return places;
}

/** The units roll two whole turns before they land, the higher places
 *  one, so the number reads as counting up. */
function rollSequence(digit: number, place: number): number[] {
  const turns = place === 0 ? 2 : 1;
  const sequence: number[] = [];
  for (let k = 0; k < turns * 10; k += 1) sequence.push(k % 10);
  for (let k = 0; k <= digit; k += 1) sequence.push(k);
  return sequence;
}

function buildSubtitle(p: HTMLElement): Omit<Subtitle, "sighting"> {
  const original = p.firstChild;
  if (p.childNodes.length !== 1 || !(original instanceof Text)) {
    throw new Error(`idea 4: a project subtitle is not plain text: ${p.textContent ?? ""}`);
  }
  const chars = original.data.split("");
  const rolls = rollingDigits(chars);
  const places = placesFromRight(chars);
  const shown = document.createElement("span");
  shown.setAttribute("aria-hidden", "true");
  const spoken = document.createElement("span");
  spoken.className = "sr-only";
  const cells: Cell[] = [];
  chars.forEach((ch, i) => {
    if (ch === " ") {
      shown.append(" ");
      return;
    }
    const el = document.createElement("span");
    el.className = rolls[i] ? ODO_CLASS : TUNE_CLASS;
    const glyph = document.createElement("span");
    glyph.textContent = ch;
    el.append(glyph);
    let strip: HTMLElement | null = null;
    let steps = 0;
    if (rolls[i]) {
      const sequence = rollSequence(Number(ch), places[i]);
      strip = document.createElement("span");
      strip.className = STRIP_CLASS;
      for (const n of sequence) {
        const row = document.createElement("span");
        row.textContent = String(n);
        strip.append(row);
      }
      el.append(strip);
      steps = sequence.length - 1;
    }
    shown.append(el);
    cells.push({ el, at: (SPREAD * i) / Math.max(1, chars.length - 1), strip, steps, height: 0, flick: -1 });
  });
  spoken.append(original);
  p.append(shown, spoken);
  return {
    cells,
    state: "hidden",
    tween: null,
    undo: () => {
      p.append(original);
      shown.remove();
      spoken.remove();
    },
  };
}

function hide(s: Subtitle): void {
  s.tween?.kill();
  s.tween = null;
  s.state = "hidden";
  for (const c of s.cells) {
    c.el.style.visibility = "hidden";
    c.el.removeAttribute("data-g");
    c.el.classList.remove(ROLLING_CLASS);
    c.flick = -1;
  }
}

function draw(s: Subtitle, t: number): void {
  for (const c of s.cells) {
    if (t < c.at) {
      c.el.style.visibility = "hidden";
      continue;
    }
    c.el.style.visibility = "";
    if (c.strip) {
      const q = Math.min(1, (t - c.at) / ROLL);
      c.el.classList.toggle(ROLLING_CLASS, q < 1);
      c.strip.style.transform = `translateY(${(-c.steps * rollEase(q) * c.height).toFixed(2)}px)`;
      continue;
    }
    if (t >= c.at + NOISE) {
      c.el.removeAttribute("data-g");
      continue;
    }
    const flick = Math.floor(t / FLICKER);
    if (flick === c.flick) continue;
    c.flick = flick;
    c.el.dataset.g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    c.el.style.setProperty("--i4-a", (0.35 + Math.random() * 0.65).toFixed(2));
  }
}

function play(s: Subtitle): void {
  for (const c of s.cells) {
    if (!c.strip) continue;
    c.height = c.el.offsetHeight;
    c.el.style.setProperty("--i4-h", `${c.height}px`);
  }
  const clock = { t: 0 };
  s.state = "playing";
  s.tween = gsap.to(clock, {
    t: DURATION,
    duration: DURATION,
    delay: AFTER_ENTER,
    ease: "none",
    onUpdate: () => draw(s, clock.t),
    onComplete: () => {
      s.state = "done";
      s.tween = null;
    },
  });
}

export function startSubtitles(): () => void {
  const observer = createObserver();
  const lines = [...document.querySelectorAll<HTMLElement>("#work ol li > p")];
  if (!lines.length) throw new Error("idea 4: no project subtitles under #work");
  const subtitles = lines.map((p) => {
    const s: Subtitle = { ...buildSubtitle(p), sighting: { entered: false, present: false } };
    hide(s);
    s.sighting = observer.watch(p, () => {
      if (!s.sighting.present && s.state !== "hidden") hide(s);
      else if (s.sighting.entered && s.state === "hidden") play(s);
    });
    return s;
  });
  return () => {
    observer.stop();
    for (const s of subtitles) {
      s.tween?.kill();
      s.undo();
    }
  };
}
