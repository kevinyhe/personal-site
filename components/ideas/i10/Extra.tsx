"use client";

import { type JSX, useRef, useState } from "react";

import { runStatic } from "@/components/ideas/i02/staticNoise";
import Knob from "@/components/ideas/i10/Knob";
import { SCHEMES } from "@/components/ideas/i10/schemes";

const FLICKER_MS = 200;
const SWITCH_AT_MS = 70;
const GRAIN_PX = 3;

function flickerOpacity(t: number): number {
  return t < 0.35 ? 0.6 * (t / 0.35) : 0.6 * (1 - (t - 0.35) / 0.65);
}

/**
 * Idea 10, "Knob": the knob in the corner turns the whole site through four
 * colour schemes. Not a re-tint of each picture: one fixed layer over the
 * page, blended by `color` (keeps each pixel's lightness, takes the layer's
 * hue) or by `saturation` (grey takes the colour out). Each switch happens
 * under 200 ms of static, which the new scheme tints too. The scheme is
 * not remembered.
 */
export default function Extra(): JSX.Element {
  const [scheme, setScheme] = useState(0);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const wantedRef = useRef(0);
  const switchPendingRef = useRef(false);
  const flickeringRef = useRef(false);

  const turn = (next: number): void => {
    wantedRef.current = next;
    if (switchPendingRef.current) return;
    if (flickeringRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setScheme(next);
      return;
    }
    const canvas = staticRef.current;
    if (!canvas) throw new Error("Knob: the static canvas did not mount");
    flickeringRef.current = true;
    switchPendingRef.current = true;
    canvas.style.visibility = "visible";
    window.setTimeout(() => {
      switchPendingRef.current = false;
      setScheme(wantedRef.current);
    }, SWITCH_AT_MS);
    void runStatic(canvas, FLICKER_MS, GRAIN_PX, flickerOpacity).then(() => {
      canvas.style.visibility = "hidden";
      flickeringRef.current = false;
    });
  };

  const { tint, scanlines } = SCHEMES[scheme];

  return (
    <>
      <canvas
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[2147483400] block h-full w-full [image-rendering:pixelated]"
        ref={staticRef}
        style={{ opacity: 0, visibility: "hidden" }}
      />
      {scanlines ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[2147483450]"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.16) 0 1px, transparent 1px 3px)" }}
        />
      ) : null}
      {tint ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[2147483500]"
          style={{ backgroundColor: tint.colour, mixBlendMode: tint.blend }}
        />
      ) : null}
      <Knob onTurn={turn} scheme={scheme} />
    </>
  );
}
