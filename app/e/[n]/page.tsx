import { notFound } from "next/navigation";

import { css, ground, ink } from "@/components/cloudPalette";
import EachSwitch from "@/components/luke/each/EachSwitch";
import { EACH } from "@/components/luke/each/list";
import PinkPalette from "@/components/luke/each/PinkPalette";

/**
 * /e/N: design N of the "Each project..." sentence (components/luke/each)
 * on its own, on the pink ground the home page has there, with a screen
 * of room before and after it to scroll through. For looking at the
 * designs side by side; the home page shows one at /?each=N.
 */
export function generateStaticParams(): { n: string }[] {
  return EACH.map((e) => ({ n: String(e.n) }));
}

export default async function EachPage({ params }: { params: Promise<{ n: string }> }): Promise<React.JSX.Element> {
  const { n } = await params;
  const pick = EACH.find((e) => String(e.n) === n);
  if (!pick) notFound();
  return (
    <div style={{ backgroundColor: css(ground(1)), color: css(ink(1)) }}>
      <PinkPalette />
      <div className="flex h-screen items-end px-[6vw] pb-[8vh] font-sans text-[clamp(14px,1vw,22px)] opacity-60">
        {pick.n} — {pick.name}
      </div>
      <EachSwitch n={pick.n} />
      <div className="h-screen" />
    </div>
  );
}
