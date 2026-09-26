"use client";

import type { JSX } from "react";
import VariantShell from "@/components/variants/VariantShell";

/** Design 11, Grow. Placeholder until its rebuild lands. */
export default function V11(): JSX.Element {
  return (
    <VariantShell accent="#f9b9dc" ground="#0a0a0a" ink="#f0f0f0" n={11}>
      <section className="px-[3vw] py-[30vh]" id="work">
        <p className="text-[0.75rem] uppercase tracking-[0.3em] opacity-50">Design 11, Grow</p>
        <h1 className="mt-[1rem] font-serif-display text-[4rem] italic">Coming.</h1>
      </section>
      <section id="info" />
      <section id="skills" />
      <section id="contact" />
    </VariantShell>
  );
}
