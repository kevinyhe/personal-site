"use client";

import type { JSX } from "react";

import BarCursor from "@/components/ideas/i01/BarCursor";

/** Idea 1's own layer on /i/1: the bar cursor. The bars' push, tap ripple
 *  and scroll smear are touchField.ts, which barShader.ts and
 *  barPicture.tsx read while idea 1 is on. */
export default function Extra(): JSX.Element {
  return <BarCursor />;
}
