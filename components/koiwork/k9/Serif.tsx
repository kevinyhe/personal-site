import type { JSX } from "react";

const NOT_SERIF = /([0-9'"&@\-!()/;]+)/;

/** The italic display serif, with digits and hyphens set in the sans at 0.62em on the baseline. */
export default function Serif({ text }: { text: string }): JSX.Element {
  return (
    <span className="font-serif-display italic">
      {text.split(NOT_SERIF).map((run, i) =>
        i % 2 === 1 ? (
          <span className="px-[0.04em] align-baseline font-sans text-[0.62em] not-italic tracking-[0.02em]" key={i}>
            {run}
          </span>
        ) : (
          run
        ),
      )}
    </span>
  );
}
