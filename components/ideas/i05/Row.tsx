"use client";

import type { JSX } from "react";

import { hoverRow, openRow } from "@/components/ideas/i05/store";
import { kindOf, resultOf } from "@/components/luke/work-data";
import { Serif } from "@/components/luke/theme";
import type { Project } from "@/components/profile";

/** Idea 5's Work row: number, name, result and two tags, the year on the
 *  right. The whole row is one button that opens the project's case study;
 *  a mouse over it shows the project's picture beside the cursor. */

export function tagsOf(p: Project): string[] {
  return p.stack.slice(0, 2);
}

export function numberOf(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export default function Row({ p, index, rule }: { p: Project; index: number; rule: string }): JSX.Element {
  return (
    <li className="border-b" style={{ borderColor: rule }}>
      <button
        className="group grid w-full grid-cols-[2.4em_1fr_auto] items-baseline gap-x-[0.8em] rounded-sm py-[max(0.9rem,2.1vh)] text-left font-sans text-[clamp(11px,0.72vw,22px)] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4"
        onClick={(e) => openRow(index, e.currentTarget)}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") hoverRow(index);
        }}
        onPointerLeave={() => hoverRow(null)}
        type="button"
      >
        <span className="tabular-nums opacity-60">{numberOf(index)}</span>
        <span className="min-w-0">
          <span
            className="block w-fit pb-[0.06em] pr-[0.12em] text-[clamp(34px,9.5vw,60px)] leading-[1.1] tracking-[-0.03em] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:text-[clamp(36px,3.3vw,120px)] [@media(hover:hover)]:group-hover:translate-x-[24px]"
            data-name
          >
            <Serif text={p.title} />
          </span>
          <span className="mt-[max(0.3rem,4px)] block text-[clamp(12px,0.8vw,26px)] opacity-75">{resultOf(p) ?? kindOf(p)}</span>
          <span className="mt-[max(0.6rem,6px)] flex flex-wrap gap-[0.5em]">
            {tagsOf(p).map((tag) => (
              <span className="rounded-full border px-[0.8em] py-[0.15em] opacity-70" key={tag} style={{ borderColor: rule }}>
                {tag}
              </span>
            ))}
          </span>
        </span>
        <span className="tabular-nums opacity-60">{p.year}</span>
      </button>
    </li>
  );
}
