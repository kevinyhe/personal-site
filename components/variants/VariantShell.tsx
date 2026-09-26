"use client";

import Link from "next/link";
import { useRef, type CSSProperties, type JSX, type ReactNode } from "react";
import { useRevealOnScroll } from "@/components/useRevealOnScroll";

/**
 * The frame every design variant sits in: a top bar with the name, the
 * section links and a switch between the five designs, then the design's
 * own page, then a footer. The palette is the variant's: it hands in its
 * ground and ink and everything in the frame is `currentColor`.
 *
 * [data-reveal] elements inside the page rise in as they enter, the same
 * hook the rest of the site uses.
 */
import { VARIANTS } from "@/components/variants/list";

export const SECTIONS = [
  { id: "work", label: "Work" },
  { id: "info", label: "Info" },
  { id: "skills", label: "Skills" },
  { id: "contact", label: "Contact" },
] as const;

export default function VariantShell({
  n,
  ground,
  ink,
  accent,
  mono = false,
  children,
  className = "",
}: {
  n: number;
  ground: string;
  ink: string;
  accent: string;
  mono?: boolean;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useRevealOnScroll(rootRef);
  const vars = { "--ground": ground, "--ink": ink, "--accent": accent } as CSSProperties;
  return (
    <div
      className={`min-h-screen ${mono ? "font-mono" : "font-sans"} ${className}`}
      ref={rootRef}
      style={{ ...vars, backgroundColor: ground, color: ink }}
    >
      <header className="sticky top-0 z-40 flex items-baseline justify-between px-[3vw] py-[1.4rem] text-[0.78rem] uppercase tracking-[0.18em] backdrop-blur-[2px]" style={{ backgroundColor: `color-mix(in srgb, ${ground} 82%, transparent)` }}>
        <Link className="font-serif-display normal-case tracking-normal text-[1.05rem] italic" href="/">
          Kevin He.
        </Link>
        <nav className="flex items-baseline gap-[2.2rem]">
          {SECTIONS.map((s) => (
            <a className="opacity-55 transition-opacity hover:opacity-100" href={`#${s.id}`} key={s.id}>
              {s.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Design" className="flex items-baseline gap-[0.9rem] tabular-nums">
          {VARIANTS.map((v) => (
            <Link
              aria-current={v.n === n ? "page" : undefined}
              className={v.n === n ? "underline underline-offset-[0.4em]" : "opacity-40 transition-opacity hover:opacity-100"}
              href={`/v/${v.n}`}
              key={v.n}
              title={`${v.name}: ${v.note}`}
            >
              0{v.n}
            </Link>
          ))}
        </nav>
      </header>
      {children}
      <footer className="flex items-baseline justify-between px-[3vw] py-[2rem] text-[0.72rem] uppercase tracking-[0.18em] opacity-50">
        <span>{"©"} 2026 Kevin He</span>
        <span>
          Design 0{n}, {VARIANTS[n - 1]?.name}
        </span>
      </footer>
    </div>
  );
}
