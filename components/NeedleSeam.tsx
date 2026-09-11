import type { JSX } from "react";

/**
 * How the dark band gives way to the page below it: the reference's own
 * device, the one in its transition-light.svg.
 *
 * A field of NEEDLES. The band's colour is solid down to a crest that
 * rises gently from left to right, and below the crest every column
 * carries one tooth of that colour hanging down into whatever is beneath —
 * a shoulder for the top third of its length, then a hair-thin tip. The
 * teeth are of uneven length with a slow drift across the page, so the
 * lower edge is ragged the way the crest is not. Every pixel is the band
 * or nothing, so it can hang over a page that is not a flat colour (the
 * aurora), which a fade could not.
 *
 * Drawn from the band's side rather than the page's: the reference draws
 * the LOWER colour rising in needles, and that is the same picture, since
 * the dark between two rising needles is a tooth hanging down. Only this
 * way round works over a background that has no single colour to draw in.
 */

/** Columns across the width. */
const COLS = 96;
/** The drawing's own units, stretched to whatever box it is given. */
const W = 1440;
const H = 460;
/** The crest: left end, right end (lower = higher on the page), and roll. */
const CREST_L = 150;
const CREST_R = 84;
const ROLL = 14;
/** Tooth lengths, in units, and how far a tooth's shoulder runs before
 *  the tip. */
const LEN_MIN = 120;
const LEN_MAX = 300;
const SHOULDER = 0.34;
/** Widths as a fraction of the column pitch: the shoulder at its base,
 *  and the tip. */
const BASE_W = 0.62;
const TIP_W = 0.07;

/** A stable hash in 0..1; the same page draws the same edge every time. */
function hash(i: number, stream = 0): number {
  const x = Math.sin(i * 12.9898 + stream * 78.233 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
}

function crestAt(u: number): number {
  return (
    CREST_L + (CREST_R - CREST_L) * u -
    ROLL * Math.sin(u * Math.PI * 2.3 + 0.7) -
    ROLL * 0.5 * Math.sin(u * Math.PI * 5.1 + 2.1)
  );
}

export default function NeedleSeam({
  colour,
  className = "",
}: {
  colour: string;
  className?: string;
}): JSX.Element {
  const pitch = W / COLS;
  // The solid band, down to the crest.
  const cap: string[] = ["M0 0"];
  for (let i = 0; i <= COLS; i += 1) {
    cap.push(`L${((i / COLS) * W).toFixed(1)} ${crestAt(i / COLS).toFixed(1)}`);
  }
  cap.push(`L${W} 0Z`);

  const teeth: string[] = [];
  for (let i = 0; i < COLS; i += 1) {
    const u = (i + 0.5) / COLS;
    const top = crestAt(u) - 1;
    const xm = (i + 0.5) * pitch;
    // Length: a slow drift across the page under a per-column jitter, so
    // neighbours differ but the field has weather.
    const drift = 0.55 + 0.45 * Math.sin(u * Math.PI * 2.7 + 1.3);
    const len = LEN_MIN + (LEN_MAX - LEN_MIN) * (0.35 * drift + 0.65 * hash(i));
    const shoulder = top + len * SHOULDER;
    const tip = top + len;
    const hw = (pitch * BASE_W) / 2;
    const tw = (pitch * TIP_W) / 2;
    teeth.push(
      `M${(xm - hw).toFixed(2)} ${top.toFixed(1)}` +
        `L${(xm + hw).toFixed(2)} ${top.toFixed(1)}` +
        `L${(xm + tw).toFixed(2)} ${shoulder.toFixed(1)}` +
        `L${xm.toFixed(2)} ${tip.toFixed(1)}` +
        `L${(xm - tw).toFixed(2)} ${shoulder.toFixed(1)}Z`,
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill={colour}
      preserveAspectRatio="none"
      viewBox={`0 0 ${W} ${H}`}
    >
      <path d={cap.join("")} />
      <path d={teeth.join("")} />
    </svg>
  );
}
