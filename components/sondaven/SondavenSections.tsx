"use client";

/**
 * What follows the valley: the reference's own page, from its prologue on.
 *
 * The prologue (QuoteSection), then the sentence about me, the projects and
 * the contact block, each laid out the way the reference lays out the
 * sections after its own prologue — its titled section with stars, its lead
 * on the middle eight columns, its span-3 cards with a rule over them, its
 * closing block and footer. The fixed bar (SondavenHeader) runs over all of
 * it, because the hero's own strip goes down with the picture when the
 * valley transition shrinks it and nothing else would get you anywhere.
 *
 * `valley valley--ink` is the same pair the hero uses: the reference's
 * tokens and scale, with both of its themes collapsed onto the site's
 * near-black ground and blossom pink, and a transparent background so
 * SiteBackground's field runs behind the whole page instead of meeting a
 * flat black at a seam. `sondaven` carries the type sizes valley.css does
 * not have; it is a token holder, not a second scope.
 */

import { useRef, type JSX } from "react";
import "@/components/valley/valley.css";
import "./sondaven.css";
import AboutSection from "./AboutSection";
import ContactSection from "./ContactSection";
import QuoteSection from "./QuoteSection";
import SelectedWorkSection from "./SelectedWorkSection";
import SondavenHeader from "./SondavenHeader";
import { useSondavenReveal } from "./useSondavenReveal";

export default function SondavenSections(): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useSondavenReveal(rootRef);

  return (
    <div className="valley valley--ink sondaven" ref={rootRef}>
      <SondavenHeader />
      <QuoteSection />
      <AboutSection />
      <SelectedWorkSection />
      <ContactSection />
    </div>
  );
}
