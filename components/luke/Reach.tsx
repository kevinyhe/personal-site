"use client";

import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import gsap from "gsap";

import { RollText } from "@/components/luke/contact-roll";
import { EMAIL } from "@/components/siteContent";

/**
 * Contact's email, large, in the gap between God's finger and Adam's (the
 * hands are Contact's own, each in a ReachHand box), and where Kevin is
 * under it. With a mouse, the hands slide in as the cursor nears the
 * email, their fingertips meet on hover and the bars there flash, and the
 * letters roll like the links beside it (contact-roll.tsx). On a touch
 * screen the hands meet as the email scrolls to the middle of the screen.
 * A click or tap copies the email.
 */

type Picture = { w: number; h: number; tipX: number; tipY: number };
type Point = [number, number];
type Hand = { box: HTMLElement; reach: HTMLElement; picture: Picture; turn: number };

/** Each hand's picture, px, and its index fingertip in it (public/work/hand-*.webp). */
const GOD: Picture = { w: 740, h: 480, tipX: 17, tipY: 238 };
const ADAM: Picture = { w: 665, h: 460, tipX: 656, tipY: 240 };
/** How far each hand slides toward the other as the cursor nears, and from
 *  how far off the email that starts, as shares of the screen's width. */
const NEAR_SLIDE = 0.03;
const NEAR_FROM = 0.22;
const NEAR_EASE_SECONDS = 0.18;
/** Seconds the hands take to meet, or part. */
const TOUCH_SECONDS = 0.85;
/** Where the fingertips meet, down the email's line box. */
const MEET_DOWN = 0.34;
/** Touch screens: the hands meet while the email is within MEET_BAND of
 *  the screen's middle, and start toward each other CLOSE_SPAN further out
 *  (shares of the screen's height). */
const MEET_BAND = 0.06;
const CLOSE_SPAN = 0.3;
const COPIED_MS = 1500;
const GLOW = "radial-gradient(closest-side, #fffafd, rgba(252,214,234,0.78) 20%, rgba(249,185,220,0.36) 46%, rgba(224,69,127,0.12) 72%, rgba(224,69,127,0))";
/** The display serif is a DEMO cut that draws a logo for "@" (app/layout.tsx). */
const AT_FONT = { fontFamily: "Georgia, serif" };
const atInGeorgia = (c: string): CSSProperties | undefined => (c === "@" ? AT_FONT : undefined);
/** A dark ground round the type, so it reads where the hands' bars cross it. */
const HALO = "0 0 2px #170a14, 0 0 6px #170a14, 0 0 14px #170a14, 0 0 28px rgba(23,10,20,0.85)";

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);

function findHand(section: Element, from: "left" | "right", picture: Picture): Hand {
  const fig = section.querySelector(`[data-fig-from="${from}"]`);
  const box = fig?.querySelector("[data-fig-idle]");
  const reach = fig?.querySelector("[data-fig-reach]");
  if (!(box instanceof HTMLElement) || !(reach instanceof HTMLElement)) throw new Error(`Contact has no ${from} hand to reach with`);
  return { box, reach, picture, turn: 0 };
}

/** Where the hand's fingertip is on screen at rest, before Reach moves it:
 *  the picture is drawn "contain" in the box, which Contact's idle sway
 *  turns a little about its centre. */
function fingertip(hand: Hand): Point {
  const r = hand.box.getBoundingClientRect();
  const { w, h, tipX, tipY } = hand.picture;
  const scale = Math.min(hand.box.offsetWidth / w, hand.box.offsetHeight / h);
  const lx = (tipX - w / 2) * scale;
  const ly = (tipY - h / 2) * scale;
  hand.turn = (Number(gsap.getProperty(hand.box, "rotation")) * Math.PI) / 180;
  const cos = Math.cos(hand.turn);
  const sin = Math.sin(hand.turn);
  return [r.left + r.width / 2 + lx * cos - ly * sin, r.top + r.height / 2 + lx * sin + ly * cos];
}

function distanceToBox([x, y]: Point, box: DOMRect): number {
  return Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom));
}

export default function Reach({ className }: { className: string }): JSX.Element {
  const lineRef = useRef<HTMLButtonElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const copiedTimer = useRef(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const line = lineRef.current;
    const glow = glowRef.current;
    const section = line?.closest("section");
    if (!line || !glow || !section) throw new Error("Reach needs its line, its glow and Contact's section");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const god = findHand(section, "right", GOD);
    const adam = findHand(section, "left", ADAM);
    let glowHalf = 0;
    const measure = (): void => {
      glowHalf = glow.offsetWidth / 2;
    };
    measure();

    let cursor: Point | null = null;
    let pointerOver = false;
    let focused = false;
    let near = 0;
    let touch = 0;
    let glowLevel = 0;
    let metAt = -1;
    let onScreen = false;
    let raf = 0;
    let last = 0;

    const moveHand = (hand: Hand, tip: Point, meet: Point, closed: number): void => {
      const dx = meet[0] - tip[0];
      const dy = meet[1] - tip[1];
      const d = Math.hypot(dx, dy) || 1;
      const slide = Math.min(d, NEAR_SLIDE * window.innerWidth) * near * (1 - closed);
      const x = dx * closed + (dx / d) * slide;
      const y = dy * closed + (dy / d) * slide;
      // Into the box's own frame, which the idle sway turns.
      const cos = Math.cos(hand.turn);
      const sin = Math.sin(hand.turn);
      hand.reach.style.transform = `translate3d(${(x * cos + y * sin).toFixed(1)}px, ${(y * cos - x * sin).toFixed(1)}px, 0)`;
    };

    const frame = (now: number): void => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const box = line.getBoundingClientRect();
      const tipGod = fingertip(god);
      const tipAdam = fingertip(adam);
      const meet: Point = [(tipGod[0] + tipAdam[0]) / 2, box.top + box.height * MEET_DOWN];

      let closed: number;
      let busy: boolean;
      if (pointer) {
        const nearGoal = cursor ? smoothstep(1 - distanceToBox(cursor, box) / (NEAR_FROM * window.innerWidth)) : 0;
        near += (nearGoal - near) * (1 - Math.exp(-dt / NEAR_EASE_SECONDS));
        const touching = pointerOver || focused;
        touch = clamp01(touch + ((touching ? 1 : -1) * dt) / TOUCH_SECONDS);
        closed = easeInOutSine(touch);
        busy = touching || touch > 0 || nearGoal > 0 || near > 0.002;
      } else {
        const off = Math.abs(box.top + box.height / 2 - window.innerHeight / 2) / window.innerHeight;
        closed = smoothstep(1 - Math.max(0, off - MEET_BAND) / CLOSE_SPAN);
        busy = closed > 0;
      }
      moveHand(god, tipGod, meet, closed);
      moveHand(adam, tipAdam, meet, closed);

      // The flash: bright as the fingertips meet, settling to a low glow
      // while they stay together, fading once they part.
      if (closed > 0.995) {
        if (metAt < 0) metAt = now;
        const t = (now - metAt) / 1000;
        glowLevel = t < 0.09 ? t / 0.09 : 0.3 + 0.7 * Math.exp(-(t - 0.09) / 0.28);
      } else {
        metAt = -1;
        glowLevel = Math.max(0, glowLevel - dt * 2.5);
      }
      glow.style.opacity = glowLevel.toFixed(3);
      glow.style.transform = `translate3d(${(meet[0] - glowHalf).toFixed(1)}px, ${(meet[1] - glowHalf).toFixed(1)}px, 0)`;

      if (onScreen && (busy || glowLevel > 0)) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = (): void => {
      if (onScreen && !raf) raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent): void => {
      if (e.pointerType === "touch") return;
      cursor = [e.clientX, e.clientY];
      wake();
    };
    const onEnter = (e: PointerEvent): void => {
      if (e.pointerType === "touch") return;
      pointerOver = true;
      wake();
    };
    const onLeave = (): void => {
      pointerOver = false;
      wake();
    };
    const onFocus = (): void => {
      focused = line.matches(":focus-visible");
      wake();
    };
    const onBlur = (): void => {
      focused = false;
      wake();
    };
    const listen = (on: boolean): void => {
      if (on) {
        window.addEventListener("scroll", wake, { passive: true });
        if (pointer) window.addEventListener("pointermove", onMove, { passive: true });
      } else {
        window.removeEventListener("scroll", wake);
        if (pointer) window.removeEventListener("pointermove", onMove);
      }
    };

    line.addEventListener("pointerenter", onEnter);
    line.addEventListener("pointerleave", onLeave);
    line.addEventListener("focus", onFocus);
    line.addEventListener("blur", onBlur);
    const seen = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting === onScreen) return;
        onScreen = e.isIntersecting;
        listen(onScreen);
        if (onScreen) {
          wake();
        } else {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { rootMargin: "50% 0px" },
    );
    seen.observe(line);
    const sized = new ResizeObserver(() => {
      measure();
      wake();
    });
    sized.observe(line);

    return () => {
      cancelAnimationFrame(raf);
      seen.disconnect();
      sized.disconnect();
      listen(false);
      line.removeEventListener("pointerenter", onEnter);
      line.removeEventListener("pointerleave", onLeave);
      line.removeEventListener("focus", onFocus);
      line.removeEventListener("blur", onBlur);
      for (const hand of [god, adam]) hand.reach.style.transform = "";
    };
  }, []);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const copy = (): void => {
    void navigator.clipboard.writeText(EMAIL).then(() => {
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    });
  };

  return (
    <div className={`relative text-center ${className}`}>
      {/* The flash where the fingertips meet, screened over the hands'
          bars (Contact's panel is the blend's group), under the type. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[1] aspect-square w-[clamp(180px,20vw,380px)] opacity-0 mix-blend-screen"
        ref={glowRef}
        style={{ background: GLOW }}
      />
      <div className="relative z-[2] flex flex-col items-center" data-col>
        <button
          aria-label={`Copy ${EMAIL}`}
          className="group relative inline-block cursor-pointer whitespace-nowrap rounded-sm px-[0.2em] font-serif-display text-[clamp(22px,3vw,64px)] italic leading-[1.15] tracking-[-0.02em] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-current"
          onClick={copy}
          ref={lineRef}
          type="button"
        >
          <span aria-hidden="true" className={`relative inline-block transition-opacity duration-300 ${copied ? "opacity-0" : "opacity-100"}`}>
            {/* The halo on a still copy underneath: each rolling letter clips to its own box, which would cut a shadow of its own. */}
            <span className="absolute inset-0 flex items-center text-transparent" style={{ textShadow: HALO }}>
              {Array.from(EMAIL).map((c, i) => (
                <span key={i} style={atInGeorgia(c)}>
                  {c}
                </span>
              ))}
            </span>
            <RollText glyphStyle={atInGeorgia} step={10} text={EMAIL} />
          </span>
          <span
            aria-hidden="true"
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${copied ? "opacity-100" : "opacity-0"}`}
            style={{ textShadow: HALO }}
          >
            Copied
          </span>
        </button>
        <span aria-live="polite" className="sr-only">
          {copied ? "Email copied" : ""}
        </span>
        <p className="mt-[clamp(10px,1.4vh,18px)] font-sans text-[clamp(13px,0.95vw,19px)] tracking-[-0.01em] opacity-80" style={{ textShadow: HALO }}>
          Toronto, Canada
        </p>
      </div>
    </div>
  );
}
