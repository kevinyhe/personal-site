"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import FractureText from "@/components/FractureText";
import HalftoneField from "@/components/HalftoneField";
import Rule from "@/components/Rule";
import SectionHeader from "@/components/SectionHeader";
import { scrollToSection } from "@/components/SectionLink";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { useRevealOnScroll } from "@/components/useRevealOnScroll";

/**
 * The last page: how to reach me.
 *
 * The hero is a sticky stage inside its own scroll room (see HeroIntro);
 * the sentence about me and the projects run over that stage, and it
 * scrolls away at the end of the run and hands the page to this — one
 * dark screen, the words top-left, a cherry spray across the right.
 *
 * Laid out after lanceyan.com's third scene: a black ground, a short
 * column of type in the top-left corner (a heading, a few lines, a row
 * of small underlined links), and a photograph of a flowering branch put
 * through a dither, coming in off the right edge with its flowers
 * hanging into the lower half of the frame. The branch here is the
 * site's own: sakuraBough grows one spray with the hero's generator —
 * the hero's bark, blossoms and wind, in the shape of the reference's
 * orchid stem — hangs it off this block's top edge, off the right of the
 * screen, and opens its buds as the block comes up, drawn through the
 * same halftone as everything else on the page. The dot field runs
 * under it, as under the hero.
 *
 * The panel used to be cream with ink type; Kevin asked for dark with
 * white type, which is also what lets the bough be seen at all — an
 * opaque light panel over a stage at z-0 paints the whole thing out.
 *
 * The hero's two ideas carry down to the end: the dot matrix and the
 * statue's fracture (FractureText on the email).
 */

/**
 * The stage, lazily: sakuraBough pulls in the whole tree generator, and
 * this block is the last thing on the page. Loaded as its own chunk once
 * the page has painted; `ssr: false` because it renders into an empty
 * <canvas> on the server anyway. The elements array is built once, at
 * load, because SakuraStage keys its rebuild on the factories' identity.
 */
const ContactStage = dynamic(
  async () => {
    const [{ default: SakuraStage }, { default: makeBough }] = await Promise.all([
      import("@/components/SakuraStage"),
      import("@/components/sakuraBough"),
    ]);
    const elements = [makeBough];
    return function ContactStage() {
      return <SakuraStage elements={elements} gateSelector="[data-sections]" />;
    };
  },
  { ssr: false },
);

function CopyEmail() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(0);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard refused (insecure origin, or permission denied). The
      // address is right there as a mailto link; nothing needs saying.
    }
  }, []);

  // Both labels are always in the box, stacked on one grid cell, and the
  // state only moves opacity between them: a 200 ms cross-fade on the
  // page's curve instead of the text snapping. The cell is as wide as the
  // wider label, so the button does not change size when the word does.
  //
  // Both visible labels are aria-hidden and the button's name is fixed by
  // aria-label, so nothing is announced twice: a screen reader hears one
  // stable button, and the status span beside it — a live region, visually
  // hidden — says "Copied" once when it happens.
  const label = (text: string, shown: boolean) => (
    <span
      aria-hidden="true"
      className={
        "[grid-area:1/1] transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none " +
        (shown ? "opacity-100" : "opacity-0")
      }
    >
      {text}
    </span>
  );

  return (
    <>
      <button
        aria-label="Copy the email address"
        className={
          "inline-grid font-serif-display text-[1.05rem] italic opacity-50 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-100 motion-reduce:transition-none"
        }
        data-copy-email
        onClick={copy}
        type="button"
      >
        {label("Copy it", !copied)}
        {label("Copied", copied)}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}

/** The reference's link: small, underlined in a quiet rule that fills in on hover. */
const LINK_CLASS =
  "font-serif-display text-[1.05rem] underline decoration-white/30 underline-offset-[5px] transition-[text-decoration-color] duration-200 hover:decoration-white motion-reduce:transition-none";

/**
 * `header` is off when something else on the page already owns the top bar.
 * On the home page that is the valley's own header (components/valley),
 * which covers the same three destinations; two fixed headers would sit on
 * top of each other and fight over hiding on scroll.
 */
export default function HomeSections({ header = true }: { header?: boolean } = {}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useRevealOnScroll(rootRef);

  // One copy of the Lenis reach and its no-Lenis fallback lives in
  // scrollToSection (the fallback is instant on purpose: no Lenis means
  // reduced motion). 2 s is the whole-page duration SectionHeader uses too.
  const toTop = useCallback(() => scrollToSection(0, 2), []);

  return (
    // relative + an opaque ground, both load-bearing: the hero's stage is a
    // sticky box that scrolls up behind this, and the run's fixed canvases
    // sit at z-0 under everything; without them the last frame of either
    // would show through. The bough's own canvas is fixed at z-0 INSIDE
    // this block and lightens onto this ground.
    <div
      className="relative z-10 bg-[#0a0a0a] text-[#f0f0f0]"
      data-sections
      ref={rootRef}
    >
      <HalftoneField />
      <ContactStage />
      {header ? <SectionHeader /> : null}

      {/* One screen, the words in the top-left corner and the footer along
          the bottom; the bough hangs across the right, behind the type's
          empty half (sakuraBough puts its cut end off the right edge for
          exactly this: the column is 34rem wide and the limb crosses no
          words). Transparent, so the stage shows through. */}
      <section
        className="relative z-[1] flex min-h-[var(--arbor-screen-h)] flex-col justify-between px-6 pb-10 pt-32 sm:px-16 sm:pb-14 sm:pt-40"
        id="contact"
      >
        {/* The page's top edge, drawn: a hairline draws itself along the
            seam as the panel comes in, on the same beat as every other
            rule. Absolute so it sits on the edge itself. */}
        <Rule className="absolute inset-x-0 top-0" />
        <div className="max-w-[34rem]">
          <h2 className="sr-only">Contact</h2>
          {/* The reference's column opens with its name in a bold serif at
              a third of its heading size; this opens with the one line the
              page has left to say, at the same size the narration's voices
              are set in, and the same three voices. */}
          <p
            aria-hidden="true"
            className="font-serif-display text-[clamp(2rem,4.4vw,4.25rem)] leading-[1.15] tracking-[-0.02em]"
            data-reveal="far"
          >
            <span className="italic opacity-70">If you have</span>
            <br />
            a hard problem,
            <br />
            <span className="font-bold italic">write to me</span>
          </p>

          <div className="mt-10 sm:mt-14" data-reveal>
            {/* The one thing here NOT in the serif. The demo cut has no "@"
                — it draws its watermark there — and substituting a
                fullwidth one would put a character in the address that is
                not in the address. */}
            <a
              aria-label={`Email ${EMAIL}`}
              className={
                "inline-block text-[clamp(1.05rem,2.2vw,1.6rem)] font-light leading-none tracking-[-0.02em] transition-opacity duration-300 hover:opacity-70 motion-reduce:transition-none"
              }
              href={`mailto:${EMAIL}`}
            >
              <FractureText text={EMAIL} />
            </a>
            <div className="mt-4">
              <CopyEmail />
            </div>
          </div>

          {/* The reference's row of small underlined links, one line.
              data-reveal on each item, not the list: four links arriving
              as one block read as a pasted footer; on the hook's stagger
              they arrive as four things said in turn. */}
          <ul className="mt-12 flex flex-wrap items-baseline gap-x-6 gap-y-2 sm:mt-16">
            {elsewhere.map((social) => (
              <li data-reveal key={social.label}>
                <a
                  className={LINK_CLASS}
                  href={social.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* The same closing line the subpages have (SubpageShell). It draws
            first; the two captions rise under it. */}
        <div className="mt-24 sm:mt-32">
          <Rule />
          <footer
            className="mt-5 flex flex-wrap items-baseline justify-between gap-4 font-serif-display text-[1rem] italic opacity-50"
            data-reveal
          >
            {/* Sans, and not by preference. The serif is the Fontspring DEMO
                cut, which draws its watermark flower instead of "4" — so this
                line renders a flower in 2034 and right through the 2040s. */}
            <p
              aria-label="Copyright"
              className="font-sans text-[0.8rem] uppercase not-italic tracking-[0.1em]"
            >
              {"©"} {new Date().getFullYear()}
            </p>
            <button
              className={
                "transition-opacity duration-200 hover:opacity-100 motion-reduce:transition-none"
              }
              onClick={toTop}
              type="button"
            >
              Back to top {"↑"}
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
