"use client";

import { type JSX, useEffect, useRef } from "react";

import { startFlock } from "@/components/ideas/i06/flock";
import { useTvUp } from "@/components/tvUp";

/** Idea 6's flock, drawn in the cloud passage's screen (CloudPassage.tsx) in place of the bird clip. */
export default function Flock(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tvUp = useTvUp();

  useEffect(() => {
    if (!tvUp) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    return startFlock(canvas);
  }, [tvUp]);

  return <canvas aria-hidden="true" className="absolute inset-0 block h-full w-full" ref={canvasRef} />;
}
