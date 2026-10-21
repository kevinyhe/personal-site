"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ComponentType, JSX } from "react";
import { FUSES, pad2 } from "@/components/fuse/list";

/** Concept to component, one chunk each. Rendered in the browser only:
 *  every concept is a canvas piece built on mount, and rendering them on
 *  the server as well made React's generated ids (useId) disagree between
 *  the two, which logged hydration errors on F02 and F03. */
const CONCEPTS: Record<number, ComponentType> = {
  1: dynamic(() => import("@/components/fuse/f01"), { ssr: false }),
  2: dynamic(() => import("@/components/fuse/f02"), { ssr: false }),
  3: dynamic(() => import("@/components/fuse/f03"), { ssr: false }),
  4: dynamic(() => import("@/components/fuse/f04"), { ssr: false }),
  5: dynamic(() => import("@/components/fuse/f05"), { ssr: false }),
  6: dynamic(() => import("@/components/fuse/f06"), { ssr: false }),
  7: dynamic(() => import("@/components/fuse/f07"), { ssr: false }),
  8: dynamic(() => import("@/components/fuse/f08"), { ssr: false }),
};

/** One concept, and a small switch between them in the corner. */
export default function FuseSwitch({ n }: { n: number }): JSX.Element | null {
  const Concept = CONCEPTS[n];
  if (!Concept) return null;
  return (
    <>
      <Concept />
      <nav
        aria-label="Concept"
        className="fixed bottom-[1.6rem] left-1/2 z-[80] flex -translate-x-1/2 items-baseline gap-[1rem] rounded-full px-[1.2rem] py-[0.6rem] font-mono text-[1rem] tabular-nums text-white mix-blend-difference"
      >
        {FUSES.map((f) => (
          <Link
            aria-current={f.n === n ? "page" : undefined}
            className={f.n === n ? "underline underline-offset-[0.4em]" : "opacity-50 transition-opacity hover:opacity-100"}
            href={`/f/${f.n}`}
            key={f.n}
            title={f.name}
          >
            F{pad2(f.n)}
          </Link>
        ))}
      </nav>
    </>
  );
}
