import type { Metadata } from "next";
import Link from "next/link";
import { VARIANTS } from "@/components/variants/list";

export const metadata: Metadata = { title: "Five designs — Kevin He" };

/** The index of the five designs, for picking one. */
export default function VariantIndex() {
  return (
    <main className="min-h-screen px-[3vw] py-[12vh] font-sans text-[#f0f0f0]">
      <p className="text-[0.75rem] uppercase tracking-[0.3em] opacity-50">Five designs for the rest of the site</p>
      <ul className="mt-[2rem] border-t border-white/15">
        {VARIANTS.map((v) => (
          <li className="border-b border-white/15" key={v.n}>
            <Link className="grid grid-cols-[6rem_1fr_1fr] items-baseline gap-[2vw] py-[1.6rem] transition-opacity hover:opacity-60" href={`/v/${v.n}`}>
              <span className="text-[0.8rem] tabular-nums opacity-50">0{v.n}</span>
              <span className="font-serif-display text-[2.4rem] leading-none">{v.name}</span>
              <span className="text-[0.95rem] opacity-70">{v.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
