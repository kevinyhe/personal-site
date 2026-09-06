import type { Metadata } from "next";
import SubpageShell from "@/components/SubpageShell";
import { selected, stack } from "@/components/siteContent";

export const metadata: Metadata = {
  title: "Info — Kevin He",
  description:
    "Kevin He writes software for things that move: robot autonomy, embedded firmware, and the tooling around both.",
};

function Block({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section className="mt-20 sm:mt-28">
      <p
        className="text-[0.7rem] uppercase tracking-[0.25em] opacity-45"
        data-reveal
      >
        {label}
      </p>
      <ul className="mt-7">{children}</ul>
    </section>
  );
}

function Row({ children, label }: { children: string; label: string }) {
  return (
    <li
      className="grid grid-cols-1 gap-1 border-b border-white/10 py-4 first:border-t first:border-white/10 sm:grid-cols-12 sm:items-baseline sm:gap-8"
      data-reveal
    >
      <p className="text-[0.7rem] uppercase tracking-[0.2em] opacity-40 sm:col-span-3">
        {label}
      </p>
      <p className="text-[0.9rem] leading-[1.6] opacity-80 sm:col-span-9">
        {children}
      </p>
    </li>
  );
}

export default function InfoPage() {
  return (
    <SubpageShell current="info">
      <section className="pt-24 sm:pt-36">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-45"
          data-reveal
        >
          Info
        </p>
        {/* The same words the home page's narration says, so the two do
            not describe the same person differently. */}
        <h1
          className="mt-5 max-w-[14ch] font-serif-display text-[clamp(2.4rem,6.5vw,5rem)] leading-[1.1] tracking-[-0.02em]"
          data-reveal
        >
          {"I\u2019m Kevin He, "}
          <em className="font-bold italic">an engineer</em>
          {" based in Toronto"}
        </h1>
        <div
          className="mt-8 max-w-[32rem] space-y-4 text-[0.95rem] leading-[1.75] opacity-70"
          data-reveal
        >
          <p>
            I write software for things that move: robot autonomy, embedded
            firmware, and the tooling around both.
          </p>
          <p>
            Now co-founder and CTO at The Actually Company. Before that, four
            seasons of VEX and a summer in San Francisco. Also computer
            engineering at the University of Toronto.
          </p>
        </div>
      </section>

      <Block label="Stack">
        {stack.map((group) => (
          <Row key={group.label} label={group.label}>
            {group.items}
          </Row>
        ))}
      </Block>

      <Block label="Selected">
        {selected.map((item) => (
          <Row key={item.title} label={item.year}>
            {item.title}
          </Row>
        ))}
      </Block>


    </SubpageShell>
  );
}
