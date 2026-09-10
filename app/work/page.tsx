import type { Metadata } from "next";
import SubpageShell from "@/components/SubpageShell";
import { GITHUB, workEntries } from "@/components/siteContent";

export const metadata: Metadata = {
  title: "Work — Kevin He",
  description:
    "Work by Kevin He: The Actually Company, Founders Inc., VEX 82855Z, and a few hackathon builds.",
};

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-current";

/**
 * The home page's work-list hover, in Tailwind rather than the
 * [data-work-list] rules in globals.css: hovering the list dims every
 * row's text to 30-40% and the row under the cursor stays put, so a hover
 * reads as picking one out rather than as one row twitching.
 *
 * The dim goes on the row's TEXT, never on the [data-reveal] wrapper: the
 * reveal (components/useRevealOnScroll) drives that wrapper's opacity as
 * an inline style, which a stylesheet cannot reach and must not fight.
 * Both variants are `group-hover`, so when a row is hovered the two rules
 * tie on specificity and the later one in the sheet wins — Tailwind emits
 * opacity utilities in ascending order, so the row's (higher) value does.
 */
const ROW_EASE =
  "transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:group-hover/row:translate-x-0";

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
        <ul className="group/list">
          {workEntries.map((entry) => {
            const inner = (
              <div
                className="grid grid-cols-1 gap-1.5 py-7 sm:grid-cols-12 sm:items-baseline sm:gap-8 sm:py-9"
                data-reveal
              >
                <p
                  className={`text-[0.75rem] uppercase tracking-[0.04em] opacity-45 group-hover/list:opacity-30 group-hover/row:translate-x-1 group-hover/row:opacity-70 sm:col-span-2 ${ROW_EASE}`}
                >
                  {entry.year}
                </p>
                <h2
                  className={`text-[1.4rem] font-light leading-tight tracking-[-0.015em] group-hover/list:opacity-40 group-hover/row:translate-x-3 group-hover/row:opacity-100 sm:col-span-4 sm:text-[1.75rem] ${ROW_EASE}`}
                >
                  {entry.title}
                  {entry.href ? (
                    <span
                      aria-hidden="true"
                      className="ml-3 inline-block align-middle text-[0.9rem] opacity-0 transition-opacity duration-300 group-hover/row:opacity-60 motion-reduce:transition-none"
                    >
                      {"↗"}
                    </span>
                  ) : null}
                </h2>
                <p
                  className={`max-w-[34rem] text-[0.9rem] leading-[1.65] opacity-55 group-hover/list:opacity-30 group-hover/row:translate-x-1 group-hover/row:opacity-80 sm:col-span-6 ${ROW_EASE}`}
                >
                  {entry.description}
                </p>
              </div>
            );
            return (
              <li className="group/row relative" key={entry.title}>
                {/* The row's rule draws itself across (data-rule) instead
                    of being a border that is simply there. A sibling of the
                    revealed content, not a child, so the fade-in of the
                    text cannot hide the start of the draw. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-px bg-white/15"
                  data-reveal
                  data-rule
                />
                {entry.href ? (
                  <a
                    className={`block ${FOCUS_RING}`}
                    href={entry.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
        <div
          aria-hidden="true"
          className="h-px w-full bg-white/15"
          data-reveal
          data-rule
        />
        <p
          className="mt-8 text-[0.75rem] uppercase tracking-[0.04em]"
          data-reveal
        >
          <a
            className={`group/more inline-block opacity-45 transition-opacity duration-200 hover:opacity-100 motion-reduce:transition-none ${FOCUS_RING}`}
            href={GITHUB}
            rel="noreferrer"
            target="_blank"
          >
            More on GitHub{" "}
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/more:-translate-y-0.5 group-hover/more:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/more:translate-x-0 motion-reduce:group-hover/more:translate-y-0"
            >
              {"↗"}
            </span>
          </a>
        </p>
      </section>
    </SubpageShell>
  );
}
