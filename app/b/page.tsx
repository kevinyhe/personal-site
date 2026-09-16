import Link from "next/link";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { BELOWS, pad2 } from "@/components/below/list";

/** The ten, as a list. */
export default function BelowIndex() {
  return (
    <main className="min-h-screen px-[4vw] py-[12vh] font-sans" style={{ backgroundColor: BAND, color: BLOSSOM }}>
      <h1 className="font-serif-display text-[5rem] italic leading-none">Below the statement</h1>
      <ul className="mt-[6vh]">
        {BELOWS.map((b) => (
          <li className="border-t border-current/20" key={b.n}>
            <Link className="grid grid-cols-[6rem_16rem_22rem_1fr] items-baseline gap-[2vw] py-[1.6rem] transition-opacity hover:opacity-60" href={`/b/${b.n}`}>
              <span className="font-mono text-[0.9rem] tabular-nums opacity-60">{pad2(b.n)}</span>
              <span className="text-[2rem] leading-none">{b.name}</span>
              <span className="font-mono text-[0.9rem] opacity-60">{b.after}</span>
              <span className="text-[1.1rem] opacity-80">{b.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
