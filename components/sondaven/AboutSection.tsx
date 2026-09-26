"use client";

/**
 * The reference's own About section, copied element for element.
 *
 * From scratchpad/sonda (index.html, `section#about`) and the strip that
 * runs into it (frag-transition-about.html):
 *
 *   .about-s_transition            the sawtooth band between the prologue
 *                                  and this section, + .about-s_transition_bg
 *   section#about[bg=light].section.bg-light.theme_on-light
 *     .container > .about-w
 *       .about-s
 *         .u-136
 *         .grid > .about-s_title > .about-s_title_ > h2.h1[data-scroll-reveal=h]
 *                                 .u-32
 *                                 .p3-list[data-scroll-reveal=ctn] > .ico-24 + p.p3
 *         .u-104
 *         .grid > .about-s_about[parallax=ctn-up]      h3.h4, divider, p.p6, btn
 *               > .about-s_concept[parallax=ctn-down]  .u-136, h3.h4, divider, p.p6
 *         .about-s_img
 *       .about-w_scene.b-desk[parallax=ctn-down] > canvas
 *
 * Two things of the reference's are not here because there is nothing to put
 * in them: its photograph of the resort (.about-s_img holds only the scene's
 * transition edge) and its video card under Concept. Everything else is its
 * markup with Kevin's words in it — "Son Daven / by blago" becomes his name
 * and what he does, "About Us" and "Concept" become About and Now.
 */

import type { JSX } from "react";
import { EMAIL } from "@/components/siteContent";
import { Divider, PillButton, attrs } from "./pieces";
import AboutScene from "./AboutScene";

export default function AboutSection(): JSX.Element {
  return (
    <>
      {/* frag-transition-about.html: the band that carries the light section
          up out of the dark one above it. */}
      <div className="about-s_transition">
        <div className="about-s_transition_edge" />
        <div className="about-s_transition_bg" />
      </div>

      <section
        className="section bg-light theme_on-light"
        id="info"
        {...attrs({ bg: "light" })}
      >
        <div className="container">
          <div className="about-w">
            <div className="about-s">
              <div className="u-136" />
              <div className="grid">
                <div className="about-s_title">
                  <div className="about-s_title_">
                    <h2 className="h1 text-dark" data-scroll-reveal="h">
                      Kevin He
                    </h2>
                  </div>
                  <div className="u-32" />
                  <div className="p3-list" data-scroll-reveal="ctn">
                    <div className="ico-24">
                      <div className="ico">
                        <svg fill="none" viewBox="0 0 24 24">
                          <path
                            d="M12 1c0 3.9 2.6 6.5 6.5 6.5C14.6 7.5 12 10.1 12 14c0-3.9-2.6-6.5-6.5-6.5C9.4 7.5 12 4.9 12 1ZM12 10c0 3.9 2.6 6.5 6.5 6.5C14.6 16.5 12 19.1 12 23c0-3.9-2.6-6.5-6.5-6.5C9.4 16.5 12 13.9 12 10Z"
                            fill="currentColor"
                          />
                        </svg>
                      </div>
                    </div>
                    <p className="p3 text-dark">engineer, toronto</p>
                  </div>
                </div>
              </div>

              <div className="u-104" />

              <div className="grid">
                <div
                  className="about-s_about"
                  {...attrs({ parallax: "ctn-up", mob: "false" })}
                >
                  <h3 className="h4 text-dark" data-scroll-reveal="h">
                    About
                  </h3>
                  <div className="u-24" />
                  <div className="divider-48">
                    <Divider />
                  </div>
                  <div className="u-24" />
                  <p className="p6 text-dark" data-scroll-reveal="p">
                    I build software for things that move — hardware that has to
                    answer in milliseconds, interfaces that have to feel like
                    they were always there. Computer engineering at the
                    University of Toronto, and a company of my own in the
                    evenings.
                  </p>
                  <div className="u-32" />
                  <div className="about-s_about_btn">
                    <div className="btn-list" data-scroll-reveal="ctn">
                      <PillButton href={`mailto:${EMAIL}`} label="Write to me" />
                    </div>
                  </div>
                </div>

                <div
                  className="about-s_concept"
                  {...attrs({ parallax: "ctn-down", mob: "false" })}
                >
                  <div className="u-136" />
                  <h3 className="h4 text-dark" data-scroll-reveal="h">
                    Now
                  </h3>
                  <div className="u-24" />
                  <div className="divider-48">
                    <Divider />
                  </div>
                  <div className="u-24" />
                  <p className="p6 text-dark" data-scroll-reveal="p">
                    Co-founder and CTO of The Actually Company, an on-device
                    speaking coach: it records a pitch and hands back timestamped
                    notes on filler, pacing and posture, without a single word
                    leaving the phone.
                    <br />
                    <br />
                    Before that: a robotics library used by teams across North
                    America, a Nerf blaster wired into a first-person shooter,
                    and a boxing game you play by swinging your phone.
                  </p>
                </div>
              </div>

              <div className="about-s_img" />
            </div>

            {/* The reference's own .about-w_scene: a bar-drawn scene running
                the full bleed of the section, behind the type, drifting
                against the scroll. */}
            <div className="about-w_scene b-desk" data-parallax="ctn-down">
              <AboutScene />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
