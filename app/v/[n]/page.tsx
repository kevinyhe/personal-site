import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Grid from "@/components/variants/Grid";
import Ledger from "@/components/variants/Ledger";
import Poster from "@/components/variants/Poster";
import Sakura from "@/components/variants/Sakura";
import Terminal from "@/components/variants/Terminal";
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

export default async function VariantPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  switch (n) {
    case "1":
      return <Ledger />;
    case "2":
      return <Grid />;
    case "3":
      return <Terminal />;
    case "4":
      return <Sakura />;
    case "5":
      return <Poster />;
    default:
      notFound();
  }
}
