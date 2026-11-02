"use client";

import { type JSX, useEffect, useRef } from "react";

import { channelSection, type Channel } from "@/components/ideas/i02/channels";
import { runStatic } from "@/components/ideas/i02/staticNoise";
import { setTuner } from "@/components/ideas/i02/tune";

type LenisLike = { scrollTo: (target: number, options: { immediate: boolean }) => void };

const FADE_IN_MS = 70;
const HOLD_AND_FADE_OUT_MS = 180;
const GRAIN_PX = 3;

function landingY(channel: Channel): number {
  const section = channelSection(channel);
  return section.getBoundingClientRect().top + window.scrollY + channel.landAt * window.innerHeight;
}

function jumpTo(channel: Channel, reducedMotion: boolean): void {
  const y = landingY(channel);
  if (reducedMotion) {
    window.scrollTo(0, y);
    return;
  }
  const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
  if (!lenis) throw new Error("Channels: Lenis is not on the page");
  lenis.scrollTo(y, { immediate: true });
}

/** Idea 2: a full-screen burst of static, about 250 ms, under which the page jumps to the channel picked in the hero strip. */
export default function StaticWipe(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Channels: the static canvas did not mount");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tuning = false;
    setTuner(async (channel) => {
      if (reducedMotion) {
        jumpTo(channel, true);
        return;
      }
      if (tuning) return;
      tuning = true;
      canvas.style.visibility = "visible";
      await runStatic(canvas, FADE_IN_MS, GRAIN_PX, (t) => t);
      jumpTo(channel, false);
      await runStatic(canvas, HOLD_AND_FADE_OUT_MS, GRAIN_PX, (t) => (t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6));
      canvas.style.visibility = "hidden";
      tuning = false;
    });
    return () => setTuner(null);
  }, []);

  return (
    <canvas
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70] block h-full w-full [image-rendering:pixelated]"
      ref={canvasRef}
      style={{ opacity: 0, visibility: "hidden" }}
    />
  );
}
