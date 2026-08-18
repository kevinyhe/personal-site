import type { Metadata } from "next";
import SubpageShell from "@/components/SubpageShell";

export const metadata: Metadata = {
  title: "Info — Kevin He",
  description:
    "About Kevin He: high-school engineer, designer, developer, and curator of chaos. Skills, roles, and interests.",
};

const skillGroups = [
  {
    items: ["C++", "Java", "JavaScript", "Python", "HTML / CSS"],
    label: "Languages",
  },
  {
    items: [
      "React",
      "Next.js",
      "Node.js",
      "Django",
      "Three.js",
      "MongoDB",
      "PostgreSQL",
      "Git",
      "Arduino",
      "Blender",
      "LaTeX",
    ],
    label: "Frameworks & tools",
  },
  {
    items: ["English", "Mandarin", "French"],
    label: "Spoken",
  },
];

const roles = [
  {
    detail: "STL Robotics",
    period: "2025 —",
    title: "President",
  },
  {
    detail: "Team 82855Z",
    period: "2022 —",
    title: "Captain & lead programmer",
  },
  {
    detail: "Jazz band & senior concert band",
    period: "",
    title: "First-chair alto sax, section leader",
  },
];

const facts = [
  { label: "Based in", value: "Greater Toronto, Canada" },
  { label: "School", value: "St. Theresa of Lisieux CHS" },
  { label: "Alumni", value: "Shad 2024 @ UNB" },
  { label: "Status", value: "High-school student" },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[0.7rem] uppercase tracking-[0.25em] opacity-50">
      {children}
    </p>
  );
}

export default function InfoPage() {
  return (
    <SubpageShell current="info">
      <section className="pt-24 sm:pt-36">
        <div data-reveal>
          <SectionLabel>Info</SectionLabel>
        </div>
        <h1
          className="mt-5 max-w-[18ch] text-[clamp(2.4rem,6.5vw,5rem)] font-light leading-[1.04] tracking-[-0.03em]"
          data-reveal
        >
          Engineer first,{" "}
          <em className="font-serif-display italic tracking-[-0.02em]">
            designer
          </em>{" "}
          close behind.
        </h1>
        <div
          className="mt-8 max-w-[34rem] space-y-5 text-[0.9rem] leading-[1.8] opacity-70"
          data-reveal
        >
          <p>
            I am Kevin He — a high-school engineer, developer, and aspiring
            curator of chaos. I build things that have to work in the real
            world first, then obsess over how they look and feel.
          </p>
          <p>
            Most of my time goes to robotics and programming: autonomous
            routines, control loops, and interfaces people actually enjoy
            using. Most of the rest goes to jazz.
          </p>
        </div>
      </section>

      <section className="mt-20 border-t border-white/15 pt-10 sm:mt-28">
        <div data-reveal>
          <SectionLabel>Toolbox</SectionLabel>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
          {skillGroups.map((group) => (
            <div data-reveal key={group.label}>
              <p className="text-[0.7rem] uppercase tracking-[0.2em] opacity-40">
                {group.label}
              </p>
              <ul className="mt-4 space-y-2 text-[0.9rem] leading-[1.6] opacity-80">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20 border-t border-white/15 pt-10 sm:mt-28">
        <div data-reveal>
          <SectionLabel>Roles</SectionLabel>
        </div>
        <ul className="mt-8">
          {roles.map((role) => (
            <li
              className="grid grid-cols-1 gap-1 border-b border-white/10 py-5 first:border-t first:border-white/10 sm:grid-cols-12 sm:items-baseline sm:gap-6"
              data-reveal
              key={role.title}
            >
              <p className="text-[0.75rem] uppercase tracking-[0.04em] opacity-50 sm:col-span-2">
                {role.period || "—"}
              </p>
              <p className="text-[1.05rem] font-light sm:col-span-5">
                {role.title}
              </p>
              <p className="text-[0.85rem] opacity-60 sm:col-span-5">
                {role.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20 border-t border-white/15 pt-10 sm:mt-28">
        <div data-reveal>
          <SectionLabel>Off the clock</SectionLabel>
        </div>
        <p
          className="mt-6 max-w-[34rem] text-[1.1rem] font-light leading-[1.7]"
          data-reveal
        >
          Jazz, basketball, control theory, and long detours into arcane
          topics.
        </p>
      </section>

      <section className="mt-20 border-t border-white/15 pt-10 sm:mt-28">
        <div data-reveal>
          <SectionLabel>Currently</SectionLabel>
        </div>
        <ul className="mt-8 max-w-[34rem]">
          {facts.map((fact) => (
            <li
              className="flex items-baseline justify-between gap-6 border-b border-white/10 py-4 first:border-t first:border-white/10"
              data-reveal
              key={fact.label}
            >
              <p className="text-[0.7rem] uppercase tracking-[0.2em] opacity-40">
                {fact.label}
              </p>
              <p className="text-right text-[0.9rem] opacity-80">
                {fact.value}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </SubpageShell>
  );
}
