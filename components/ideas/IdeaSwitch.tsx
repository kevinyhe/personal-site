import type { JSX } from "react";

import { IDEAS } from "@/components/ideas/list";

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** The pill in the bottom right corner of /i/N for stepping through the ideas. Plain links, so every idea starts from a fresh page. */
export default function IdeaSwitch({ n }: { n: number }): JSX.Element {
  const at = IDEAS.findIndex((idea) => idea.n === n);
  const prev = IDEAS[(at - 1 + IDEAS.length) % IDEAS.length];
  const next = IDEAS[(at + 1) % IDEAS.length];
  return (
    <nav className="fixed right-4 bottom-4 z-[2147483647] flex items-center gap-3 rounded-full bg-black/70 px-4 py-2 font-sans text-[12px] tracking-wide text-white backdrop-blur-sm">
      <a href={`/i/${prev.n}`} aria-label={`Idea ${prev.n}, ${prev.name}`}>
        ←
      </a>
      <span>
        {pad2(n)} · {IDEAS[at].name}
      </span>
      <a href={`/i/${next.n}`} aria-label={`Idea ${next.n}, ${next.name}`}>
        →
      </a>
    </nav>
  );
}
