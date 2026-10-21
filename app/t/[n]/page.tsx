import type { Metadata } from "next";
import { notFound } from "next/navigation";

import T1 from "@/components/tx/t1/Scene";
import T2 from "@/components/tx/t2/Scene";
import T3 from "@/components/tx/t3/Scene";
import T4 from "@/components/tx/t4/Scene";
import T5 from "@/components/tx/t5/Scene";
import { GROUND, INK } from "@/components/luke/theme";

/**
 * Transitions from the statement band ("I build systems ...") into Work, at
 * /t/1 to /t/5, each on its own so they can be compared without the hero.
 * Each Scene renders its own copy of the statement and the work index.
 */
const DESIGNS = { "1": T1, "2": T2, "3": T3, "4": T4, "5": T5 } as const;

export function generateStaticParams() {
  return Object.keys(DESIGNS).map((n) => ({ n }));
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n } = await params;
  return { title: `Transition ${n}. Kevin He` };
}

export default async function TransitionPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const Design = DESIGNS[n as keyof typeof DESIGNS];
  if (!Design) notFound();
  return (
    <div style={{ backgroundColor: GROUND, color: INK }}>
      <Design />
      <div className="h-[60vh]" />
    </div>
  );
}
