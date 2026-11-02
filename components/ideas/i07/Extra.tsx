"use client";

import { type JSX, useEffect, useRef } from "react";

import { startPetals } from "@/components/ideas/i07/petals";
import { useTvUp } from "@/components/tvUp";

/** Idea 7's layer on /i/7: blossom petals falling over the page after the hero (petals.ts). */
export default function Extra(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tvUp = useTvUp();

  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    return startPetals(canvas);
  }, [tvUp]);

  return <canvas aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 block h-full w-full" ref={canvasRef} />;
}
