"use client";

import { useEffect, useRef, type JSX } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { scrollToSection } from "@/components/SectionLink";
import { EMAIL, GITHUB } from "@/components/siteContent";
import { PillButton } from "./pieces";

gsap.registerPlugin(ScrollTrigger);

/**
 * The bar across the top, after the reference's own.
 *
 * The hero carries its own strip, and that strip goes down with the picture
 * when the valley transition shrinks it — which leaves the whole lower half
 * of the page with no way to get anywhere. The reference keeps a fixed
 * header the entire way down: name at the left, the page's sections in the
 * middle, one pill at the right. This is that, in the same type.
 *
 * Its two behaviours are the reference's (initHeaderHide): it is invisible
 * until the reader is past the hero, and once it is showing it hides when
 * they scroll down and comes back when they scroll up, so it is never in
 * the way of the thing they are reading.
 */

/** Where it starts showing: past the hero and its transition. */
const SHOW_AFTER_SCREENS = 3.4;
/** Ignore scroll jitter below this many pixels, as the reference does. */
const DEAD_ZONE = 40;
const DUR_S = 0.4;
const DUR_M = 0.6;

const LINKS = [
  { label: "Prologue", id: "prologue" },
  { label: "About", id: "info" },
  { label: "Work", id: "work" },
  { label: "Contact", id: "contact" },
];

export default function SondavenHeader(): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const header = ref.current;
    if (!header) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = gsap.context(() => {
      let showing = false;
      let hidden = false;
      let last = window.scrollY;

      const trigger = ScrollTrigger.create({
        start: "top top",
        end: "max",
        onUpdate: (self) => {
          const y = self.scroll();
          const past = y > window.innerHeight * SHOW_AFTER_SCREENS;
          if (past !== showing) {
            showing = past;
            gsap.to(header, {
              autoAlpha: past ? 1 : 0,
              duration: reduced ? 0 : DUR_S,
              ease: "power2.out",
            });
            // Out of the tab order as well as out of sight.
            header.inert = !past;
          }
          if (!showing || Math.abs(y - last) < DEAD_ZONE) return;
          const down = y > last;
          last = y;
          // Near the very bottom it always comes back: the contact block is
          // the end of the page and the way back up is in this bar.
          const toEnd = document.documentElement.scrollHeight - (y + window.innerHeight);
          const wantHidden = toEnd > 160 && down;
          if (wantHidden === hidden) return;
          hidden = wantHidden;
          gsap.to(header, {
            yPercent: wantHidden ? -100 : 0,
            duration: reduced ? 0 : DUR_M,
            ease: "power2.out",
          });
        },
      });
      gsap.set(header, { autoAlpha: 0 });
      header.inert = true;
      return () => trigger.kill();
    }, header);

    return () => {
      context.revert();
      header.inert = false;
    };
  }, []);

  return (
    <nav aria-label="Sections" className="sd-header" ref={ref}>
      <div className="container">
        <div className="sd-header_c">
          <button
            className="p6 text-dark sd-header_name"
            onClick={() => scrollToSection(0, 2)}
            type="button"
          >
            Kevin He
          </button>

          <div className="sd-header_nav">
            {LINKS.map((link) => (
              <button
                className="p6 text-dark sd-header_link"
                key={link.id}
                onClick={() => {
                  const el = document.getElementById(link.id);
                  if (el) scrollToSection(el, 1.4);
                }}
                type="button"
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="sd-header_right">
            <a
              className="p6 text-dark sd-header_link"
              href={GITHUB}
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </a>
            {/* PillButton, not hand-written markup: the reference drives the
                pill's rest state from its own [hover-btn] attribute, and
                without it the hover outline sits at full opacity and draws a
                white rectangle beside the capsule. */}
            <PillButton href={`mailto:${EMAIL}`} label="Write to me" small />
          </div>
        </div>
      </div>
    </nav>
  );
}
