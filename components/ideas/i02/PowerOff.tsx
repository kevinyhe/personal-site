"use client";

import { type JSX, useEffect, useRef } from "react";

/** Extra scroll added to the end page, in screens, over which the picture switches off. */
const RUN_SCREENS = 1;
/** Shares of that run: the end page held as it is, the picture squashing to a line, the line closing to a dot, the dot going out. */
const HOLD_UNTIL = 0.12;
const LINE_AT = 0.55;
const DOT_AT = 0.8;
const OUT_AT = 0.96;
const LINE_PX = 3;
const DOT_PX = 7;

function share(value: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (value - from) / (to - from)));
}

function easeIn(t: number): number {
  return t * t;
}

/**
 * Idea 2: the page ends the way the site begins, with the television, but
 * switching off. The end page gets one more screen of scroll, during which
 * its pinned screen (the section's sticky child) squashes to a bright line,
 * the line closes to a dot and the dot goes out, leaving black. Scrubbed by
 * the scroll, so scrolling back up switches it on again.
 */
export default function PowerOff(): JSX.Element {
  const beamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const beam = beamRef.current;
    const end = document.querySelector<HTMLElement>("#end");
    const screen = end?.firstElementChild;
    if (!beam || !end || !(screen instanceof HTMLElement)) throw new Error("Power off: no #end screen on the page");
    if (getComputedStyle(screen).position !== "sticky") throw new Error("Power off: #end's screen is no longer sticky");
    const root = document.documentElement;
    const groundColour = end.style.backgroundColor;
    end.style.height = `${(1 + RUN_SCREENS) * 100}vh`;

    const switchOn = (): void => {
      screen.style.transform = "";
      screen.style.filter = "";
      screen.style.visibility = "";
      end.style.backgroundColor = groundColour;
      beam.style.visibility = "hidden";
      root.style.setProperty("--i02-picture", "1");
    };

    const show = (progress: number): void => {
      if (progress <= HOLD_UNTIL) {
        switchOn();
        return;
      }
      const squash = share(progress, HOLD_UNTIL, LINE_AT);
      const close = share(progress, LINE_AT, DOT_AT);
      const out = share(progress, DOT_AT, OUT_AT);
      const lineScale = LINE_PX / screen.offsetHeight;
      screen.style.transform = `scaleY(${1 - (1 - lineScale) * easeIn(squash)})`;
      screen.style.filter = `brightness(${1 + 2.2 * squash}) saturate(${1 - 0.6 * squash})`;
      screen.style.visibility = close > 0 ? "hidden" : "";
      end.style.backgroundColor = "#000";
      const width = window.innerWidth - (window.innerWidth - DOT_PX) * easeIn(close);
      beam.style.visibility = "visible";
      beam.style.width = `${width}px`;
      beam.style.height = `${LINE_PX + (DOT_PX - LINE_PX) * close}px`;
      beam.style.opacity = String(share(squash, 0.55, 1) * (1 - out));
      root.style.setProperty("--i02-picture", String(1 - squash));
    };

    let frame = 0;
    const update = (): void => {
      frame = 0;
      const run = end.offsetHeight - screen.offsetHeight;
      show(share(-end.getBoundingClientRect().top, 0, run));
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const listen = (): void => {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    };
    const stopListening = (): void => {
      cancelAnimationFrame(frame);
      frame = 0;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    const onScreen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        listen();
        update();
      } else {
        stopListening();
        switchOn();
      }
    });
    onScreen.observe(end);
    return () => {
      onScreen.disconnect();
      stopListening();
      switchOn();
      end.style.height = "";
      root.style.removeProperty("--i02-picture");
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-1/2 top-1/2 z-[55] -translate-x-1/2 -translate-y-1/2 rounded-full"
      ref={beamRef}
      style={{
        visibility: "hidden",
        backgroundColor: "#fff6fb",
        boxShadow: "0 0 6px 2px rgba(255, 236, 246, 0.95), 0 0 22px 6px rgba(249, 185, 220, 0.75), 0 0 60px 14px rgba(224, 69, 127, 0.45)",
      }}
    />
  );
}
