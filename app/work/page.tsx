import type { Metadata } from "next";
import SubpageShell from "@/components/SubpageShell";
import { GITHUB, workEntries } from "@/components/siteContent";

export const metadata: Metadata = {
  title: "Work — Kevin He",
  description:
    "Work by Kevin He: The Actually Company, Founders Inc., VEX 82855Z, and a few hackathon builds.",
};

export default function WorkPage() {
  return (
    <SubpageShell current="work">
      <section className="pt-24 sm:pt-36">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-45"
          data-reveal
        >
          Work
        </p>
        <h1
          className="mt-5 max-w-[14ch] text-[clamp(2.4rem,6.5vw,5rem)] font-light leading-[1.04] tracking-[-0.03em]"
          data-reveal
        >
          {"What I've built."}
        </h1>
      </section>

      <section className="mt-16 sm:mt-24">
        <ul className="border-b border-white/15">
          {workEntries.map((entry) => {
            const inner = (
              <div className="grid grid-cols-1 gap-1.5 py-7 sm:grid-cols-12 sm:items-baseline sm:gap-8 sm:py-9">
                <p className="text-[0.75rem] uppercase tracking-[0.04em] opacity-45 sm:col-span-2">
                  {entry.year}
                </p>
                <h2 className="text-[1.4rem] font-light leading-tight tracking-[-0.015em] transition-transform duration-300 group-hover:translate-x-2 sm:col-span-4 sm:text-[1.75rem]">
                  {entry.title}
                </h2>
                <p className="max-w-[34rem] text-[0.9rem] leading-[1.65] opacity-55 sm:col-span-6">
                  {entry.description}
                </p>
              </div>
            );
            return (
              <li className="group border-t border-white/15" data-reveal key={entry.title}>
                {entry.href ? (
                  <a href={entry.href} rel="noreferrer" target="_blank">
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
        <p
          className="mt-8 text-[0.75rem] uppercase tracking-[0.04em]"
          data-reveal
        >
          <a
            className="opacity-45 transition-opacity duration-200 hover:opacity-100"
            href={GITHUB}
            rel="noreferrer"
            target="_blank"
          >
            More on GitHub {"↗"}
          </a>
        </p>
      </section>
    </SubpageShell>
  );
}
