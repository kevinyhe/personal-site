import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BAND, BLOSSOM } from "@/components/bandColours";
import BelowSwitch from "@/components/below/BelowSwitch";
import { BELOWS, pad2 } from "@/components/below/list";

/**
 * The ten designs for the part of the home page under the statement band,
 * each on its own at /b/1 to /b/10 so it can be looked at without
 * scrolling through the hero first. The band's last screen stands above
 * it as a still, so the join is the one the home page will have.
 * /?below=N shows the same design in place on the home page.
 */
export function generateStaticParams() {
  return BELOWS.map((b) => ({ n: String(b.n) }));
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n } = await params;
  const b = BELOWS.find((x) => String(x.n) === n);
  return { title: b ? `${b.name}, design ${pad2(b.n)}. Kevin He` : "Kevin He" };
}

export default async function BelowPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const b = BELOWS.find((x) => String(x.n) === n);
  if (!b) notFound();
  return (
    <div>
      <div className="relative flex h-[60vh] flex-col justify-between px-[4vw] py-[9vh]" id="info" style={{ backgroundColor: BAND, color: BLOSSOM }}>
        <p className="font-serif-display text-[min(15vh,5.8vw)] italic leading-[1] tracking-[-0.03em]">
          I write software for
          <br />
          <span className="ml-[2vw]">things that move.</span>
        </p>
        <p className="font-mono text-[0.8rem] uppercase tracking-[0.18em] opacity-60">
          Design {pad2(b.n)}, {b.name}. After {b.after}. In place on the home page at /?below={b.n}
        </p>
      </div>
      <BelowSwitch base="/b/" n={b.n} />
    </div>
  );
}
