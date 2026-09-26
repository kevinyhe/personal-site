import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import Grid from "@/components/variants/Grid";
import Ledger from "@/components/variants/Ledger";
import Poster from "@/components/variants/Poster";
import Sakura from "@/components/variants/Sakura";
import Terminal from "@/components/variants/Terminal";
import v06 from "@/components/variants/v06";
import v07 from "@/components/variants/v07";
import v08 from "@/components/variants/v08";
import v09 from "@/components/variants/v09";
import v10 from "@/components/variants/v10";
import v11 from "@/components/variants/v11";
import v12 from "@/components/variants/v12";
import v13 from "@/components/variants/v13";
import v14 from "@/components/variants/v14";
import v15 from "@/components/variants/v15";
import { VARIANTS } from "@/components/variants/list";

/**
 * Five designs for the rest of the site — Work, Info, Skills, Contact —
 * at /v/1 to /v/5, each with a switch between them in its top bar. The
 * content is one file (components/profile.ts), from the résumé.
 */
export function generateStaticParams() {
  return VARIANTS.map((v) => ({ n: String(v.n) }));
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n } = await params;
  const v = VARIANTS.find((x) => String(x.n) === n);
  return { title: v ? `${v.name} — design 0${v.n} — Kevin He` : "Kevin He" };
}

/** Slot → design. One file per design under components/variants. */
const DESIGNS: Record<string, ComponentType> = {
  "1": Ledger,
  "2": Grid,
  "3": Terminal,
  "4": Sakura,
  "5": Poster,
  "6": v06,
  "7": v07,
  "8": v08,
  "9": v09,
  "10": v10,
  "11": v11,
  "12": v12,
  "13": v13,
  "14": v14,
  "15": v15,
};

export default async function VariantPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const Design = DESIGNS[n];
  if (!Design) notFound();
  return <Design />;
}
