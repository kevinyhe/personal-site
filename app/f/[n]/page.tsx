import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FuseSwitch from "@/components/fuse/FuseSwitch";
import { FUSES, pad2 } from "@/components/fuse/list";

/** Whole-site concepts, one per route: /f/1 to /f/8. */
export function generateStaticParams() {
  return FUSES.map((f) => ({ n: String(f.n) }));
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n } = await params;
  const f = FUSES.find((x) => String(x.n) === n);
  return { title: f ? `${f.name}, concept ${pad2(f.n)}. Kevin He` : "Kevin He" };
}

export default async function FusePage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const f = FUSES.find((x) => String(x.n) === n);
  if (!f) notFound();
  return <FuseSwitch n={f.n} />;
}
