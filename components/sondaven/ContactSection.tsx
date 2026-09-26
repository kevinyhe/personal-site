"use client";

/**
 * How the reference closes: its CTA card, then its footer.
 *
 * From scratchpad/sonda (index.html, `section#cta`), copied element for
 * element:
 *
 *   section#cta[bg=color].section.theme_on-color
 *     .container > .cta-w > .cta-s
 *       .grid-c.mob_8-columns[data-scroll-reveal=w]
 *         > .cta-s_card-w.theme_on-light[parallax=ctn-up][data-scroll-reveal=card]
 *             .cta-s_card
 *               .cta-s_card_top    > p.p6.a-center, .u-24, .title_stars
 *               .cta-s_card_center > h2.h5.a-center, .u-24, .btn-list > .btn
 *               .cta-s_card_bot    > the contact list, .u-16, a divider
 *
 * and the footer under it: the address at the left, the outward links at the
 * right, the contact line across the full width with a rule under it, and a
 * bottom row with the year and the way back to the top.
 *
 * The email is the one thing here NOT set in the display serif. That cut
 * draws a watermark flower for "@", so an address in it would not be the
 * address.
 */

import { useCallback, type JSX } from "react";
import { scrollToSection } from "@/components/SectionLink";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { Divider, PillButton, TitleStars, attrs } from "./pieces";

export default function ContactSection(): JSX.Element {
  // One copy of the Lenis reach and its no-Lenis fallback lives in
  // scrollToSection; 2 s is the whole-page duration the rest of the site
  // uses for a trip back to the top.
  const toTop = useCallback(() => scrollToSection(0, 2), []);

  return (
    <section
      className="section theme_on-color"
      id="contact"
      {...attrs({ bg: "color" })}
    >
      <div className="container">
        <div className="cta-w">
          <div className="cta-s">
            <div className="grid-c mob_8-columns" data-scroll-reveal="w">
              <div
                className="cta-s_card-w theme_on-light"
                data-scroll-reveal="ctn"
                {...attrs({ parallax: "ctn-up" })}
              >
                <div className="cta-s_card">
                  <div className="cta-s_card_top">
                    <p className="p6 text-dark a-center">
                      I like problems that have a right answer and no obvious way
                      to reach it. If you have one of those, I would like to hear
                      about it.
                    </p>
                    <div className="u-24" />
                    <TitleStars />
                  </div>

                  <div className="cta-s_card_center">
                    <h2 className="h5 text-dark a-center">Write to me</h2>
                    <div className="u-24" />
                    <div className="btn-list">
                      <PillButton href={`mailto:${EMAIL}`} label="Write to me" />
                    </div>
                  </div>

                  <div className="cta-s_card_bot">
                    <div className="contact-cms_list">
                      <div className="contact-cms_list_item">
                        <a
                          aria-label={EMAIL}
                          className="nav-item"
                          href={`mailto:${EMAIL}`}
                        >
                          <div className="nav-item_label" {...attrs({ hover: "label" })}>
                            <div className="nav-item_label_text">
                              <p className="p6 text-dark sd-mail" {...attrs({ hover: "text" })}>
                                {EMAIL}
                              </p>
                            </div>
                          </div>
                        </a>
                      </div>
                      <div className="contact-cms_list_item">
                        <a
                          aria-label="Toronto, Ontario"
                          className="nav-item"
                          href="#contact"
                        >
                          <div className="nav-item_label" {...attrs({ hover: "label" })}>
                            <div className="nav-item_label_text">
                              <p className="p6 text-dark" {...attrs({ hover: "text" })}>
                                Toronto, Ontario
                              </p>
                            </div>
                          </div>
                        </a>
                      </div>
                    </div>
                    <div className="u-16" />
                    <Divider reveal={false} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* The footer. */}
          <div className="footer-s">
            <div className="u-104" />
            <div className="grid">
              <div className="footer-s_l">
                <p className="p6 sd-gray">Based in</p>
                <div className="u-8" />
                <p className="p6 text-dark">Toronto, Ontario</p>
              </div>
              <div className="footer-s_r">
                <p className="p6 sd-gray a-right">Elsewhere</p>
                <div className="u-8" />
                {elsewhere.map((link) => (
                  <p className="p6 text-dark a-right" key={link.label}>
                    <a
                      className="sd-underline"
                      href={link.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {link.label}
                    </a>
                  </p>
                ))}
              </div>
            </div>
            <div className="u-104" />
            <a className="footer-s_mail p2 text-dark sd-mail" href={`mailto:${EMAIL}`}>
              {EMAIL}
            </a>
            <div className="u-16" />
            <Divider reveal={false} />
            <div className="u-32" />
            <div className="footer-s_bot">
              <p className="p6 sd-gray">{"©"} 2026 Kevin He</p>
              <button className="p6 text-dark sd-underline" onClick={toTop} type="button">
                Back to top {"↑"}
              </button>
            </div>
            <div className="u-48" />
          </div>
        </div>
      </div>
    </section>
  );
}
