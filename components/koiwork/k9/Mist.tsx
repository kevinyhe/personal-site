import type { JSX } from "react";

import { BLOSSOM } from "@/components/luke/theme";

/**
 * Suyari-gasumi: the long flat mist bands painted across a byobu, here as
 * pink hairline outlines. Each band is a run of rounded steps, wider in
 * the middle than at its ends, and crosses one or more hinges.
 *
 * Drawn in a 1000 x 1700 box stretched over the screen; the strokes keep
 * one width whatever the stretch.
 */

/** A band from x0 to x1 centred on y: a long rounded bar with a stepped
 *  top and bottom, h tall at its widest. */
function band(x0: number, x1: number, y: number, h: number, steps: number[]): string {
  // steps: fractions of the length where the outline steps in or out.
  const r = h * 0.5;
  const len = x1 - x0;
  const top: string[] = [];
  const bot: string[] = [];
  let level = 0.35;
  top.push(`M ${x0 + r} ${y - h * level}`);
  steps.forEach((f, i) => {
    const nx = x0 + len * f;
    const next = i % 2 === 0 ? 1 : 0.55;
    top.push(`H ${nx - 6}`, `Q ${nx} ${y - h * level} ${nx} ${y - h * (level + next) / 2}`, `Q ${nx} ${y - h * next} ${nx + 6} ${y - h * next}`);
    level = next;
  });
  top.push(`H ${x1 - r}`, `A ${r * level} ${h * level} 0 0 1 ${x1 - r} ${y + h * 0.35}`);
  // The bottom edge runs back, flatter: a single soft step.
  const mid = x0 + len * 0.42;
  bot.push(`H ${mid + 6}`, `Q ${mid} ${y + h * 0.35} ${mid} ${y + h * 0.2}`, `Q ${mid} ${y + h * 0.1} ${mid - 6} ${y + h * 0.1}`);
  bot.push(`H ${x0 + r}`, `A ${r * 0.4} ${h * 0.4} 0 0 1 ${x0 + r} ${y - h * 0.35}`, "Z");
  return [...top, ...bot].join(" ");
}

const BANDS = [
  band(-40, 520, 300, 46, [0.22, 0.58]),
  band(380, 1040, 690, 38, [0.3, 0.7]),
  band(-40, 360, 1080, 34, [0.45]),
  band(470, 960, 1290, 44, [0.18, 0.5, 0.8]),
];

export default function Mist({ className }: { className: string }): JSX.Element {
  return (
    <svg aria-hidden="true" className={className} preserveAspectRatio="none" viewBox="0 0 1000 1700">
      <g fill="none" stroke={BLOSSOM} strokeOpacity={0.28} strokeWidth={1}>
        {BANDS.map((d, i) => (
          <path d={d} key={i} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
