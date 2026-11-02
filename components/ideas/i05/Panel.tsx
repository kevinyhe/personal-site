"use client";

import gsap from "gsap";
import { type JSX, useId, useLayoutEffect, useRef, useState } from "react";

import BarPicture from "@/components/below/barPicture";
import { css, ground, ink, onPalette } from "@/components/cloudPalette";
import { numberOf } from "@/components/ideas/i05/Row";
import { closeRow, useWorkState } from "@/components/ideas/i05/store";
import { Serif } from "@/components/luke/theme";
import { hostOf, kindOf, resultOf } from "@/components/luke/work-data";
import { projects } from "@/components/profile";

/**
 * Idea 5's case study: a click on a Work row (a tap on a phone) brings in a
 * wall of vertical bars in the type's colour, each growing to the screen's
 * full height and thickening until they close into one plate; the project
 * is set on it, its picture in bars. Close (or Esc) takes the text away
 * and the bars go back down. The page does not scroll while it is open.
 */

/** Seconds the bars take to cover the screen, and the share of that over
 *  which the columns start, left to right. */
const WIPE = 0.9;
const STAGGER = 0.45;

type LenisLike = { stop: () => void; start: () => void };

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const tallEase = gsap.parseEase("power3.inOut");
const wideEase = gsap.parseEase("power2.in");

function paletteNow(): number {
  let now = 0;
  onPalette((t) => {
    now = t;
  })();
  return now;
}

function lockScroll(): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
  if (!reduced && !lenis) throw new Error("idea 5: no Lenis on the page (window.__lenis)");
  lenis?.stop();
  const root = document.documentElement;
  const overflow = root.style.overflow;
  root.style.overflow = "hidden";
  return () => {
    root.style.overflow = overflow;
    lenis?.start();
  };
}

/** The bars at `p` (0 none, 1 a solid plate), in device px so neighbours
 *  meet with no seam. */
function drawWipe(canvas: HTMLCanvasElement, colour: string, p: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("idea 5: no 2D context for the wipe");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colour;
  const columns = w < 768 ? 10 : 24;
  const column = w / columns;
  for (let c = 0; c < columns; c += 1) {
    const q = clamp01((p - (STAGGER * c) / (columns - 1)) / (1 - STAGGER));
    if (q <= 0) continue;
    const tall = tallEase(q) * h;
    const wide = column * (0.3 + 0.7 * wideEase(q));
    const x0 = Math.floor((c * column + (column - wide) / 2) * dpr);
    const x1 = Math.ceil((c * column + (column + wide) / 2) * dpr);
    ctx.fillRect(x0, Math.floor((h - tall) * dpr), x1 - x0, Math.ceil(tall * dpr));
  }
}

function CaseStudy({ index }: { index: number }): JSX.Element {
  const p = projects[index];
  const titleId = useId();
  const [colours] = useState(() => {
    const t = paletteNow();
    return { plate: css(ink(t)), type: css(ground(t)) };
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<() => void>(() => {});
  const setLevelRef = useRef<(level: number) => void>(() => {});

  // Before the first paint, so the text never shows ahead of the bars.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const content = contentRef.current;
    if (!canvas || !content) throw new Error("idea 5: the case study did not mount");
    const unlock = lockScroll();
    // Reduced motion: the plate and the text are there at once.
    const pace = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
    closeButtonRef.current?.focus({ preventScroll: true });
    const pieces = content.querySelectorAll<HTMLElement>("[data-in]");
    const wipe = { p: 0 };
    const level = { v: 0 };
    const draw = (): void => drawWipe(canvas, colours.plate, wipe.p);
    gsap.set(pieces, { opacity: 0, y: 24 });
    const enter = gsap.timeline();
    enter.to(wipe, { p: 1, duration: WIPE * pace, ease: "none", onUpdate: draw });
    enter.to(pieces, { opacity: 1, y: 0, duration: 0.6 * pace, ease: "power3.out", stagger: 0.07 * pace }, `>-${0.1 * pace}`);
    enter.to(level, { v: 1, duration: 0.9 * pace, ease: "power2.out", onUpdate: () => setLevelRef.current(level.v) }, "<");
    let leave: gsap.core.Timeline | null = null;
    closeRef.current = () => {
      if (leave) return;
      enter.kill();
      leave = gsap.timeline({ onComplete: closeRow });
      leave.to(pieces, { opacity: 0, y: -12, duration: 0.25 * pace, ease: "power2.in" });
      leave.to(wipe, { p: 0, duration: WIPE * 0.8 * pace, ease: "none", onUpdate: draw });
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", draw);
    return () => {
      enter.kill();
      leave?.kill();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", draw);
      unlock();
    };
  }, [colours]);

  const result = resultOf(p) ?? kindOf(p);
  return (
    <>
      <canvas aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] block h-screen w-screen" ref={canvasRef} />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="fixed inset-0 z-[81] overflow-y-auto overscroll-contain [scrollbar-width:none]"
        data-lenis-prevent
        role="dialog"
        style={{ color: colours.type }}
      >
        <button
          className="fixed right-[max(4vw,16px)] top-[max(4vh,16px)] z-[1] rounded-sm font-sans text-[clamp(12px,0.8vw,22px)] uppercase tracking-[0.08em] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4"
          onClick={() => closeRef.current()}
          ref={closeButtonRef}
          type="button"
        >
          Close <span aria-hidden="true">×</span>
        </button>
        <div
          className={`mx-auto grid min-h-full items-center gap-[5vh] px-[6vw] py-[14vh] lg:gap-[5vw] ${p.image ? "lg:grid-cols-[1.2fr_1fr]" : "max-w-[60rem]"}`}
          ref={contentRef}
        >
          {p.image ? (
            <div className="aspect-[3/2] w-full" data-in>
              <BarPicture
                alt={p.title}
                bind={(setLevel) => {
                  setLevelRef.current = setLevel;
                }}
                cell={7}
                ink={colours.type}
                level={0}
                source={p.image}
              />
            </div>
          ) : null}
          <div className="font-sans">
            <p className="flex gap-[1.2em] text-[clamp(11px,0.72vw,22px)] tabular-nums opacity-70" data-in>
              <span>{numberOf(index)}</span>
              <span>{p.year}</span>
            </p>
            <h2
              className="mt-[2vh] pb-[0.08em] pr-[0.1em] text-[clamp(44px,5.4vw,160px)] leading-[1.02] tracking-[-0.03em]"
              data-in
              id={titleId}
            >
              <Serif text={p.title} />
            </h2>
            <p className="mt-[1.5vh] text-[clamp(13px,0.9vw,28px)] opacity-80" data-in>
              {result}
            </p>
            <p className="mt-[4vh] text-[clamp(17px,1.25vw,38px)] leading-[1.35]" data-in>
              {p.tagline}
            </p>
            <p className="mt-[2vh] text-[clamp(14px,0.95vw,28px)] leading-[1.55] opacity-80" data-in>
              {p.bullets.join(" ")}
            </p>
            <p className="mt-[3vh] text-[clamp(12px,0.8vw,24px)] opacity-70" data-in>
              {p.stack.join(", ")}
            </p>
            <p className="mt-[4vh] flex flex-wrap gap-x-[2em] gap-y-[1vh] text-[clamp(13px,0.9vw,28px)]" data-in>
              {p.href ? (
                <a className="underline decoration-1 underline-offset-[0.3em]" href={p.href} rel="noopener noreferrer" target="_blank">
                  {hostOf(p.href)} <span aria-hidden="true">↗</span>
                </a>
              ) : null}
              {p.code ? (
                <a className="underline decoration-1 underline-offset-[0.3em]" href={p.code} rel="noopener noreferrer" target="_blank">
                  Code <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Panel(): JSX.Element | null {
  const { opened } = useWorkState();
  return opened === null ? null : <CaseStudy index={opened} key={opened} />;
}
