"use client";

import type { JSX } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { BELOWS } from "@/components/below/list";

/** Slot 20, waiting for its design. */
export default function B20(): JSX.Element {
  const b = BELOWS[20 - 1];
  return (
    <section className="flex min-h-screen items-center justify-center font-mono text-[1rem]" id="work" style={{ backgroundColor: BAND, color: BLOSSOM }}>
      Design 20, {b.name}. Coming.
    </section>
  );
}
