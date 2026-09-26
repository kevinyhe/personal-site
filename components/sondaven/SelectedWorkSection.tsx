"use client";

/**
 * The projects, in the reference's factoid grid.
 *
 * From scratchpad/sonda (index.html, `section#factoids`), copied element for
 * element:
 *
 *   section#factoids[bg=dark].section.bg-light.theme_on-dark
 *     .container > .factoids-w > .factoids-s
 *       .u-136
 *       .grid > .factoid-card[parallax=ctn-up|ctn-down][mob=false]
 *                 > .factoid-card
 *                     .mob_factoid-card_line.b-mob > .line-s
 *                     .factoid-card_number.b-desk > h3.h1.a-center + .u-48
 *                     .factoid-card_desc.b-desk   > p.p6.a-center
 *                     .factoid-card_desc.b-mob    > p.p6
 *                     .factoid-card_number.b-mob  > p.h2.a-right
 *
 * Its four cards are numbers with a caption under them; ours are the four
 * projects, counted the same way. The counter stays in the sans: the display
 * serif is a Fontspring DEMO cut and draws a watermark flower for "4".
 * Alternate cards drift the opposite way against the scroll, which is the
 * reference's own parallax pairing.
 */

import type { JSX, ReactNode } from "react";
import { workEntries, type WorkEntry } from "@/components/siteContent";
import { Divider, SectionTitle, attrs } from "./pieces";

function Card({ entry, index }: { entry: WorkEntry; index: number }): JSX.Element {
  const number = String(index + 1).padStart(2, "0");
  const inner: ReactNode = (
    <div className="factoid-card">
      <div className="mob_factoid-card_line b-mob">
        <div className="line-s" />
      </div>
      <div className="factoid-card_number b-desk">
        <p className="p6 sd-gray sd-counter" data-scroll-reveal="p">
          {number}
        </p>
        <div className="u-16" />
        <div className="divider-full">
          <Divider />
        </div>
        <div className="u-24" />
        <h3 className="h4 text-dark" data-scroll-reveal="h">
          {entry.title}
        </h3>
        <div className="u-24" />
      </div>
      <div className="factoid-card_desc b-desk">
        <p className="p6 text-dark sd-gray" data-scroll-reveal="p">
          {entry.description}
        </p>
      </div>
      <div className="factoid-card_desc b-mob">
        <h3 className="h4 text-dark" data-scroll-reveal="h">
          {entry.title}
        </h3>
        <div className="u-8" />
        <div className="u-8" />
        <p className="p6 text-dark sd-gray" data-scroll-reveal="p">
          {entry.description}
        </p>
      </div>
      <div className="factoid-card_number b-mob">
        <p className="p6 sd-gray a-right sd-counter" data-scroll-reveal="p">
          {number}
        </p>
      </div>
    </div>
  );

  return (
    <div
      className="factoid-card sd-hover-line"
      {...attrs({ parallax: index % 2 === 0 ? "ctn-up" : "ctn-down", mob: "false" })}
    >
      {entry.href ? (
        <a
          aria-label={entry.title}
          className="sd-card-link"
          href={entry.href}
          rel="noreferrer"
          target="_blank"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}

export default function SelectedWorkSection(): JSX.Element {
  return (
    <section
      className="section bg-light theme_on-dark"
      id="work"
      {...attrs({ bg: "dark" })}
    >
      <div className="container">
        <div className="factoids-w">
          <div className="factoids-s">
            <div className="u-136" />
            <SectionTitle label="selected work" />
            <div className="u-104" />
            <div className="grid">
              {workEntries.map((entry, index) => (
                <Card entry={entry} index={index} key={entry.title} />
              ))}
            </div>
            <div className="u-136" />
          </div>
        </div>
      </div>
    </section>
  );
}
