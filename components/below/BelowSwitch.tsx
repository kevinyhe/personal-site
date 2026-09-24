"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ComponentType, JSX } from "react";
import { BELOWS, pad2 } from "@/components/below/list";

/**
 * Slot to design. Each is its own chunk, so a page only downloads the
 * scene it shows: this many three.js scenes in one bundle would be the whole
 * cost of the home page several times over.
 */
const DESIGNS: Record<number, ComponentType> = {
  1: dynamic(() => import("@/components/below/b01")),
  2: dynamic(() => import("@/components/below/b02")),
  3: dynamic(() => import("@/components/below/b03")),
  4: dynamic(() => import("@/components/below/b04")),
  5: dynamic(() => import("@/components/below/b05")),
  6: dynamic(() => import("@/components/below/b06")),
  7: dynamic(() => import("@/components/below/b07")),
  8: dynamic(() => import("@/components/below/b08")),
  9: dynamic(() => import("@/components/below/b09")),
  10: dynamic(() => import("@/components/below/b10")),
  11: dynamic(() => import("@/components/below/b11")),
  12: dynamic(() => import("@/components/below/b12")),
  13: dynamic(() => import("@/components/below/b13")),
  14: dynamic(() => import("@/components/below/b14")),
  15: dynamic(() => import("@/components/below/b15")),
  16: dynamic(() => import("@/components/below/b16")),
  17: dynamic(() => import("@/components/below/b17")),
  18: dynamic(() => import("@/components/below/b18")),
  19: dynamic(() => import("@/components/below/b19")),
  20: dynamic(() => import("@/components/below/b20")),
  21: dynamic(() => import("@/components/below/b21")),
  22: dynamic(() => import("@/components/below/b22")),
  23: dynamic(() => import("@/components/below/b23")),
  24: dynamic(() => import("@/components/below/b24")),
  25: dynamic(() => import("@/components/below/b25")),
  26: dynamic(() => import("@/components/below/b26")),
  27: dynamic(() => import("@/components/below/b27")),
  28: dynamic(() => import("@/components/below/b28")),
  29: dynamic(() => import("@/components/below/b29")),
  30: dynamic(() => import("@/components/below/b30")),
};

export const hasBelow = (n: number): boolean => Boolean(DESIGNS[n]);

/**
 * One of the ten, and a small switch between them pinned to the corner.
 * `base` is where the switch's links go: "/b/" on the designs' own route,
 * "/?below=" on the home page.
 */
export default function BelowSwitch({ n, base }: { n: number; base: string }): JSX.Element | null {
  const Design = DESIGNS[n];
  if (!Design) return null;
  return (
    <>
      <Design />
      <nav
        aria-label="Design"
        className="fixed bottom-[1.6rem] right-[2rem] z-[60] flex items-baseline gap-[0.8rem] rounded-full px-[1.2rem] py-[0.6rem] font-mono text-[0.8rem] tabular-nums text-white mix-blend-difference"
      >
        {BELOWS.map((b) => (
          <Link
            aria-current={b.n === n ? "page" : undefined}
            className={b.n === n ? "underline underline-offset-[0.4em]" : "opacity-50 transition-opacity hover:opacity-100"}
            href={`${base}${b.n}`}
            key={b.n}
            scroll={base.startsWith("/b/")}
            title={`${b.name}, after ${b.after}`}
          >
            {pad2(b.n)}
          </Link>
        ))}
      </nav>
    </>
  );
}
