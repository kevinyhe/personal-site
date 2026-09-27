"use client";

import type { JSX } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { BELOWS } from "@/components/below/list";

/** Slot 26, waiting for its design. */
export default function B26(): JSX.Element {
  const b = BELOWS[26 - 1];
  return (
    <section className="flex min-h-screen items-center justify-center font-mono text-[1rem]" id="work" style={{ backgroundColor: BAND, color: BLOSSOM }}>
      Design 26, {b.name}. Coming.
    </section>
  );
}
