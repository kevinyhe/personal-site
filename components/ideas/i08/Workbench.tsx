"use client";

import { type JSX, type RefObject, useEffect, useRef } from "react";

import { type Bench, CHIP_FACE, createBench } from "@/components/ideas/i08/bench";
import type { Look } from "@/components/ideas/i08/look";
import { SKILLS } from "@/components/luke/skills-data";

/** Idea 8: the tray under the skill groups (bench.ts). Its chips are for the eye only; the tags are read from the groups' own lists. */

const NAMES = SKILLS.map((g) => g.skills.map((s) => s.name));
/** The tray's walls and floor, and the bench the robot stands on. */
const LINE = "color-mix(in srgb, currentColor 32%, transparent)";

export default function Workbench({
  group,
  look,
  trayRef,
}: {
  group: number;
  look: RefObject<Look | null>;
  trayRef: RefObject<HTMLDivElement | null>;
}): JSX.Element {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const benchRef = useRef<Bench | null>(null);

  useEffect(() => {
    const tray = trayRef.current;
    const layer = layerRef.current;
    const ruler = rulerRef.current;
    if (!tray || !layer || !ruler) return undefined;
    const bench = createBench({ tray, layer, ruler, look: () => look.current, groups: NAMES });
    benchRef.current = bench;
    return () => {
      bench.destroy();
      benchRef.current = null;
    };
  }, [look, trayRef]);

  useEffect(() => {
    benchRef.current?.show(group);
  }, [group]);

  return (
    // Under the groups on a wide screen, its rim about level with the
    // robot's wheels (most of the grid's row gap taken back); under the
    // robot otherwise.
    <div
      aria-hidden="true"
      className="relative h-[150px] lg:col-start-2 lg:row-start-2 lg:-mt-[calc(6vh-20px)]"
      ref={trayRef}
      style={{ visibility: "hidden" }}
    >
      <div
        className="pointer-events-none absolute right-full top-0 hidden h-px lg:block"
        style={{ width: "calc(var(--robot, 30vw) + 5.4vw)", background: LINE }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-b-[18px] border border-t-0"
        style={{ borderColor: LINE }}
      />
      <div className="absolute inset-0" ref={layerRef} />
      <div className="invisible absolute left-0 top-0 h-0 overflow-hidden" ref={rulerRef}>
        {NAMES.map((names, g) =>
          names.map((name) => (
            <span className={`${CHIP_FACE} block w-max`} data-g={g} key={`${g}-${name}`}>
              {name}
            </span>
          )),
        )}
      </div>
    </div>
  );
}
