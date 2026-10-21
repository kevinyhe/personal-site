import type { Metadata } from "next";
import { notFound } from "next/navigation";

import K1 from "@/components/koiwork/k1/Work";
import K2 from "@/components/koiwork/k2/Work";
import K3 from "@/components/koiwork/k3/Work";
import K4 from "@/components/koiwork/k4/Work";
import K5 from "@/components/koiwork/k5/Work";
import K6 from "@/components/koiwork/k6/Work";
import K7 from "@/components/koiwork/k7/Work";
import K8 from "@/components/koiwork/k8/Work";
import K9 from "@/components/koiwork/k9/Work";
import K10 from "@/components/koiwork/k10/Work";
import K11 from "@/components/koiwork/k11/Work";
import K12 from "@/components/koiwork/k12/Work";
import K13 from "@/components/koiwork/k13/Work";
import { GROUND, INK } from "@/components/luke/theme";

/**
 * Designs for the Work section, each with the koi, at /k/1 to /k/13,
 * on their own so they can be compared without scrolling the home page.
 * The home page keeps components/luke/WorkIndex until one is picked.
 */
const DESIGNS = { "1": K1, "2": K2, "3": K3, "4": K4, "5": K5, "6": K6, "7": K7, "8": K8, "9": K9, "10": K10, "11": K11, "12": K12, "13": K13 } as const;

export function generateStaticParams() {
  return Object.keys(DESIGNS).map((n) => ({ n }));
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n } = await params;
  return { title: `Work, design ${n}. Kevin He` };
}

export default async function KoiWorkPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const Design = DESIGNS[n as keyof typeof DESIGNS];
  if (!Design) notFound();
  return (
    <div style={{ backgroundColor: GROUND, color: INK }}>
      <div className="h-[30vh]" />
      <Design />
      <div className="h-[60vh]" />
    </div>
  );
}
