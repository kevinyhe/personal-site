"use client";

import { type JSX, useId } from "react";

import css from "./f02.module.css";

/**
 * Luke Baffait's red brush stroke, in blossom, drawn as SVG so no WebGL is
 * added. One thick curved path plus four thin ones beside it for the
 * bristles. Two SVG filters make it look dry: feDisplacementMap roughens
 * the edges with noise, and a second noise cuts small gaps in the paint.
 *
 * Each path draws itself along its length (pathLength = 1 and a dash).
 * The parent remounts this with a new `key` whenever the year changes, so
 * the stroke draws in again.
 */

// Comes in from the top left, swings out to the right through the middle
// (where the active row sits) and curls back to finish lower left.
const PATH = "M 30 22 C 128 40 214 122 200 206 C 191 262 152 306 98 338";

const BRISTLES: { dx: number; dy: number; w: number; o: number }[] = [
  { dx: -15, dy: 4, w: 5, o: 0.75 },
  { dx: 16, dy: -6, w: 7, o: 0.8 },
  { dx: 22, dy: -2, w: 3, o: 0.55 },
  { dx: -22, dy: 8, w: 2.5, o: 0.5 },
];

export default function Brush(): JSX.Element {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const dry = `f02-dry-${id}`;
  const paint = `f02-paint-${id}`;
  return (
    <svg aria-hidden="true" className="h-full w-full overflow-visible" fill="none" viewBox="0 0 240 360">
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={paint} x1="30" x2="110" y1="20" y2="340">
          <stop offset="0" stopColor="#b8174f" />
          <stop offset="0.45" stopColor="#f07aa8" />
          <stop offset="1" stopColor="#f9b9dc" />
        </linearGradient>
        <filter height="140%" id={dry} width="140%" x="-20%" y="-20%">
          <feTurbulence baseFrequency="0.03 0.5" numOctaves="2" result="wobble" seed="7" type="fractalNoise" />
          <feDisplacementMap in="SourceGraphic" in2="wobble" result="rough" scale="10" xChannelSelector="R" yChannelSelector="G" />
          <feTurbulence baseFrequency="0.7 0.06" numOctaves="1" result="grain" seed="3" type="fractalNoise" />
          <feColorMatrix in="grain" result="gaps" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.2 0 0 0 2.6" />
          <feComposite in="rough" in2="gaps" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${dry})`} stroke={`url(#${paint})`} strokeLinecap="round">
        <path className={css.draw} d={PATH} pathLength={1} strokeWidth={30} />
        {BRISTLES.map((b) => (
          <path
            className={css.drawLate}
            d={PATH}
            key={`${b.dx},${b.dy}`}
            opacity={b.o}
            pathLength={1}
            strokeWidth={b.w}
            transform={`translate(${b.dx} ${b.dy})`}
          />
        ))}
      </g>
    </svg>
  );
}
