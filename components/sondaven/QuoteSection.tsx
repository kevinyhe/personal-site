"use client";

/**
 * The quote, which is the reference's own prologue section.
 *
 * The DOM is the reference's, element for element (scratchpad frag-prolog):
 *
 *   section#prolog > .container > .prolog-w
 *                                  ├── .prolog-s   (z 1, one screen tall)
 *                                  │    └── .grid.fill > .about-s_content
 *                                  │         .u-136, .title, .u-32,
 *                                  │         .about-s_content_lead, .u-32,
 *                                  │         .btn-list, .u-48
 *                                  └── .prolog-w_scene[parallax="ctn-down"]
 *                                       └── canvas.scene
 *
 * .prolog-w is the RELATIVE wrapper the scene is hung off; the scene is
 * absolute inside it, full bleed past the container's own padding, from the
 * top of the section to 120 below it, and drifts against the scroll
 * (useSondavenReveal's parallax). An earlier version of this file hung the
 * scene straight off .prolog-w and made that absolute instead, which left
 * the type with no wrapper to sit in front of and the scene with no room to
 * drift in.
 *
 * Where the reference stands two poppies, this stands two cherry sprigs
 * (SprigScene). Where it has a button to its PDF, this has the attribution.
 * components/valley/ValleyMarkup.tsx renders the same block for the /valley
 * page; this is the copy that runs on the home page, so its scene is its own
 * and its id does not collide with that one's.
 */

import type { JSX } from "react";
import { SectionTitle } from "./pieces";
import SprigScene from "./SprigScene";

/* Set in the display serif, which is a Fontspring DEMO cut: it draws a
   watermark flower for ' " $ & 4 @ - ! ( ) * + / = # %. The curly quotes
   are safe and there is nothing else here to avoid. */
const QUOTE =
  "“Lack of originality, everywhere, all over the world, from time immemorial, has always been considered the foremost quality and the recommendation of the active, efficient and practical man.”";

export default function QuoteSection(): JSX.Element {
  return (
    <section className="section" data-prolog-band="" id="prologue">
      <div className="container">
        <div className="prolog-w">
          <div className="prolog-s">
            <div className="grid fill">
              <div className="about-s_content">
                <div className="u-136" />
                <SectionTitle label="prologue" />
                <div className="u-32" />
                <div className="about-s_content_lead">
                  <h3
                    className="h5 text-dark a-center text-pretty"
                    data-highlight-text=""
                    data-scroll-reveal="h"
                  >
                    {QUOTE}
                  </h3>
                </div>
                <div className="u-32" />
                {/* Where the reference has its PDF button: the attribution,
                    a plain line, not a button. */}
                <div className="btn-list" data-scroll-reveal="ctn">
                  <p className="p6 text-dark a-center">Fyodor Dostoevsky, The Idiot</p>
                </div>
                <div className="u-48" />
              </div>
            </div>
          </div>
          <div className="prolog-w_scene b-desk" data-parallax="ctn-down">
            <SprigScene />
          </div>
        </div>
      </div>
    </section>
  );
}
