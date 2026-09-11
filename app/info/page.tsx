import type { Metadata } from "next";
import SubpageShell from "@/components/SubpageShell";
import { selected, stack } from "@/components/siteContent";

export const metadata: Metadata = {
  title: "Info — Kevin He",
  description:
    "Kevin He writes software for things that move: robot autonomy, embedded firmware, and the tooling around both.",
};

/**
 * The work list's hover, for these rows: hovering the list dims the other
 * rows' text and the row under the cursor stays put, its value line
 * stepping 8px right on the site's one curve. The dim is on the row's text
 * rather than on the [data-reveal] wrapper, whose opacity the reveal hook
 * owns as an inline style. Both `group-hover` variants tie on specificity;
 * Tailwind emits opacity utilities in ascending order, so the hovered row's
 * higher value is the later rule and wins.
 */
const ROW_EASE =
  "transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:group-hover/row:translate-x-0";

function Block({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section className="mt-20 sm:mt-28">
      {/* Opacity on the inner span: the reveal ends with inline
          `opacity: 1` on the [data-reveal] element, which would beat the
          45% class for good. */}
      <p className="text-[0.7rem] uppercase tracking-[0.25em]" data-reveal>
        <span className="opacity-45">{label}</span>
      </p>
      {/* The list's top rule: the first row's old border-t, drawn across
          on entry instead of appearing. Each row carries its own bottom
          rule, so this is the only one that is not a row's. */}
      <div
        aria-hidden="true"
        className="mt-7 h-px w-full bg-white/10"
        data-reveal
        data-rule
      />
      <ul className="group/list">{children}</ul>
    </section>
  );
}

function Row({ children, label }: { children: string; label: string }) {
  return (
    <li className="group/row relative">
      <div
        className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-12 sm:items-baseline sm:gap-8"
        data-reveal
      >
        <p
          className={`text-[0.7rem] uppercase tracking-[0.2em] opacity-40 group-hover/list:opacity-25 group-hover/row:opacity-70 sm:col-span-3 ${ROW_EASE}`}
        >
          {label}
        </p>
        <p
          className={`text-[0.9rem] leading-[1.6] opacity-80 group-hover/list:opacity-40 group-hover/row:translate-x-2 group-hover/row:opacity-100 sm:col-span-9 ${ROW_EASE}`}
        >
          {children}
        </p>
      </div>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px bg-white/10"
        data-reveal
        data-rule
      />
    </li>
  );
}

export default function InfoPage() {
  return (
    <SubpageShell current="info">
      <section className="pt-24 sm:pt-36">
        <p className="text-[0.7rem] uppercase tracking-[0.25em]" data-reveal>
          <span className="opacity-45">Info</span>
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
        <div className="mt-8 max-w-[32rem] space-y-4 text-[0.95rem] leading-[1.75] opacity-70">
          <p data-reveal>
            I write software for things that move: robot autonomy, embedded
            firmware, and the tooling around both.
          </p>
          <p data-reveal>
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
