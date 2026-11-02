"use client";

import { type JSX, useEffect } from "react";

import { CHAR_CLASS, LINE_CLASS, startHeadings } from "@/components/ideas/i04/headings";
import { ODO_CLASS, ROLLING_CLASS, STRIP_CLASS, startSubtitles, TUNE_CLASS } from "@/components/ideas/i04/subtitles";

/** Idea 4, "Type": the page's headings and project subtitles, animated in place. */

// The odometer's window is cut to about the digits' height, so a rolling
// digit shows one number and slivers of its neighbours, not two whole ones.
//
// Each letter's box is let out round the italic's overhang (and back in
// with a margin, so nothing moves): a mask only covers the box, and the
// bars would cut the overhang off.
const CSS = `
.${CHAR_CLASS} { position: relative; padding: 0.22em 0.16em; margin: -0.22em -0.16em; }
.${LINE_CLASS} [data-letter] { opacity: 1 !important; filter: none !important; }
.${TUNE_CLASS}, .${ODO_CLASS} { position: relative; display: inline-block; }
.${TUNE_CLASS}[data-g] > span { opacity: 0; }
.${TUNE_CLASS}[data-g]::after { content: attr(data-g); position: absolute; left: 50%; top: 0; transform: translateX(-50%); opacity: var(--i4-a, 1); }
.${ODO_CLASS} { clip-path: inset(0.28em -0.3em 0.3em); }
.${ODO_CLASS}.${ROLLING_CLASS} > span:first-child { opacity: 0; }
.${STRIP_CLASS} { display: none; position: absolute; left: 0; right: 0; top: 0; text-align: center; }
.${ODO_CLASS}.${ROLLING_CLASS} > .${STRIP_CLASS} { display: block; }
.${STRIP_CLASS} > span { display: block; height: var(--i4-h); line-height: var(--i4-h); }
`;

export default function Extra(): JSX.Element {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const stopHeadings = startHeadings();
    const stopSubtitles = startSubtitles();
    return () => {
      stopHeadings();
      stopSubtitles();
    };
  }, []);
  return <style>{CSS}</style>;
}
