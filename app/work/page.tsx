import type { Metadata } from "next";
import SubpageShell from "@/components/SubpageShell";

export const metadata: Metadata = {
  title: "Work — Kevin He",
  description:
    "Selected work by Kevin He: world-record VEX autonomous, Worlds quarterfinals, Hack the North, USACO Silver, and this site.",
};

type WorkEntry = {
  description: string;
  href?: string;
  tag: string;
  title: string;
  year: string;
};

const entries: WorkEntry[] = [
  {
    description:
      "Highest-scoring autonomous program in VEX High Stakes, worldwide.",
    tag: "World record",
    title: "High Stakes autonomous",
    year: "2025",
  },
  {
    description:
      "Quarterfinalist at the VEX Robotics World Championship — top 0.04% combined skills score of roughly 20,000 teams.",
    tag: "Competition",
    title: "VEX Worlds",
    year: "2025",
  },
  {
    description:
      "Captain and lead programmer since 2022 — four seasons of autonomous routines, odometry, and drive code.",
    tag: "Robotics",
    title: "Team 82855Z",
    year: "2022 —",
  },
  {
    description: "Winner and finalist at Canada's largest hackathon.",
    tag: "Hackathon",
    title: "Hack the North",
    year: "2025",
  },
  {
    description: "Perfect 1000/1000 score in the Silver division.",
    tag: "Competitive programming",
    title: "USACO Silver",
    year: "2025",
  },
  {
    description: "Senior 50/75, projected Group II honour roll.",
    tag: "Competitive programming",
    title: "CCC",
    year: "2025",
  },
  {
    description:
      "President, after a year leading software and hardware education for the club.",
    tag: "Leadership",
    title: "STL Robotics",
    year: "2025 —",
  },
  {
    description:
      "This site — a procedural three.js sakura under a halftone dither renderer.",
    href: "https://github.com/kevinyhe",
    tag: "Web",
    title: "kevins.works",
    year: "2026",
  },
];

function EntryRow({ entry }: { entry: WorkEntry }) {
  const inner = (
    <div className="grid grid-cols-1 gap-2 py-6 sm:grid-cols-12 sm:items-baseline sm:gap-6 sm:py-7">
      <p className="text-[0.75rem] uppercase tracking-[0.04em] opacity-50 sm:col-span-2">
        {entry.year}
      </p>
      <h2 className="text-[1.35rem] font-light leading-tight tracking-[-0.01em] transition-transform duration-300 group-hover:translate-x-2 sm:col-span-4 sm:text-[1.6rem]">
        {entry.title}
        {entry.href ? (
          <span
            aria-hidden="true"
            className="ml-2 inline-block text-[0.9rem] opacity-0 transition-opacity duration-300 group-hover:opacity-70"
          >
            {"↗"}
          </span>
        ) : null}
      </h2>
      <p className="max-w-[36rem] text-[0.85rem] leading-[1.7] opacity-60 transition-opacity duration-300 group-hover:opacity-90 sm:col-span-4">
        {entry.description}
      </p>
      <p className="hidden text-right text-[0.7rem] uppercase tracking-[0.2em] opacity-40 transition-opacity duration-300 group-hover:opacity-70 sm:col-span-2 sm:block">
        {entry.tag}
      </p>
    </div>
  );

  if (entry.href) {
    return (
      <li className="group border-t border-white/15" data-reveal>
        <a href={entry.href} rel="noreferrer" target="_blank">
          {inner}
        </a>
      </li>
    );
  }
  return (
    <li className="group border-t border-white/15" data-reveal>
      {inner}
    </li>
  );
}

export default function WorkPage() {
  return (
    <SubpageShell current="work">
      <section className="pt-24 sm:pt-36">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-50"
          data-reveal
        >
          Selected work
        </p>
        <h1
          className="mt-5 max-w-[16ch] text-[clamp(2.4rem,6.5vw,5rem)] font-light leading-[1.04] tracking-[-0.03em]"
          data-reveal
        >
          Robots,{" "}
          <em className="font-serif-display italic tracking-[-0.02em]">
            records
          </em>
          , and a few all-nighters.
        </h1>
        <p
          className="mt-6 max-w-[30rem] text-[0.85rem] leading-[1.7] opacity-60"
          data-reveal
        >
          What I have built and where it landed, 2022 to now.
        </p>
      </section>

      <section className="mt-16 sm:mt-24">
        <ul className="border-b border-white/15">
          {entries.map((entry) => (
            <EntryRow entry={entry} key={entry.title} />
          ))}
        </ul>
        <p
          className="mt-8 text-[0.75rem] uppercase tracking-[0.04em]"
          data-reveal
        >
          <a
            className="opacity-50 transition-opacity duration-200 hover:opacity-100"
            href="https://github.com/kevinyhe"
            rel="noreferrer"
            target="_blank"
          >
            The rest lives on GitHub {"↗"}
          </a>
        </p>
      </section>
    </SubpageShell>
  );
}
