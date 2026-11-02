"use client";

import { type JSX } from "react";

import { BloomBase, type Ring, RINGS } from "@/components/luke/each/H24Bloom";

/**
 * 26. Lines. The bloom (24) as a drawing: the two inner rings filled in
 * rose, the two outer ones outlined in the type's colour, so the
 * flower is a botanical plate more than a cut-out.
 */

const LINE_RINGS: Ring[] = RINGS.map((r, k) => (k < 2 ? r : { ...r, line: true, alpha: k === 2 ? 0.7 : 0.45 }));

export default function H26Lines(): JSX.Element {
  return <BloomBase rings={LINE_RINGS} />;
}
