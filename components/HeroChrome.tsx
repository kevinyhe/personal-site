import SectionLink from "@/components/SectionLink";
import { sectionLinks, socialLinks } from "@/components/siteContent";

/**
 * Clips each word of the lockup at its own bottom edge, so letters parked
 * below it are invisible and rise up into view. Applied to each word rather
 * than to a shared ancestor: clip-path creates a stacking context, and
 * putting one above "He." would isolate its mix-blend-difference. The small
 * negative bottom inset keeps the italic's overhang from being shaved.
 */
const CLIP_AT_BASE = "[clip-path:inset(-200vh_-50vw_-0.06em_-50vw)]";

/**
 * Splits a word into per-letter spans so each can be animated on its own.
 *
 * inline-block is required — transforms do not apply to non-replaced inline
 * elements. It does cost kerning between the split pairs, since browsers only
 * kern within a single text run. That is safe HERE specifically because the
 * lockup is justify-between: "Kevin" is pinned to the left inset and "He." to
 * the right, so any width change lands in the gap between the two words rather
 * than moving either word's outer ink edge.
 */
function Letters({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((character, index) => (
        <span className="inline-block" data-hero-letter key={index}>
          {character}
        </span>
      ))}
    </>
  );
}

/**
 * The type over the hero stage: the strip along the top (copyright, the
 * section links, the socials) and the name lockup across the bottom. One
 * component because the home page and /crt both put exactly this over
 * HeroIntro, and HeroIntro finds its parts by the data-hero-* attributes
 * set here.
 */
export default function HeroChrome() {
  return (
    <>
      <h1 className="sr-only">Kevin He — engineer, Toronto</h1>

      {/* Solid type; only the large right serif word carries the (subtle)
          difference effect, matching the reference site. */}
      <div className="pointer-events-none fixed inset-0 z-20 flex flex-col px-6 pb-[max(2.8rem,env(safe-area-inset-bottom))] pt-3 text-[#f0f0f0] sm:px-[8rem] sm:py-[4rem]">
        {/* Top strip, set as lukebaffait.fr sets its bar: small uppercase
            sans, medium weight. Signature left, the socials centred with
            slashes between them (the sans has a plain "/", unlike the
            display serif), the pages right. A 3-column grid so the middle
            group is centred on the page, not between its neighbours. */}
        <div
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 font-sans text-[0.9rem] font-medium uppercase leading-none tracking-[0.01em] text-white sm:text-[1.2rem]"
          data-hero-animate
          data-hero-strip
        >
          <p aria-label="Copyright" className="hidden sm:block">
            {"©"} {new Date().getFullYear()}
          </p>
          <p aria-hidden="true" className="sm:hidden" />

          <div className="flex items-center justify-center gap-[1.1rem] sm:gap-[1.8rem]">
            {socialLinks.map((social, index) => (
              <span className="flex items-center gap-[1.1rem] sm:gap-[1.8rem]" key={social.label}>
                {index > 0 ? (
                  <span aria-hidden="true" className="font-normal opacity-40">
                    /
                  </span>
                ) : null}
                <a
                  className="pointer-events-auto transition-opacity duration-200 hover:opacity-60"
                  href={social.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {social.label}
                </a>
              </span>
            ))}
          </div>

          {/* These scroll to the sections below rather than navigating:
              Work, Info and Contact are on this page now. /work, /info and
              /contact still exist and still link to each other; nothing
              here reaches them any more. */}
          <nav className="flex items-center justify-end gap-[1.1rem] sm:gap-[2.2rem]">
            {sectionLinks.map((item) => (
              <SectionLink
                className="pointer-events-auto transition-opacity duration-200 hover:opacity-60"
                id={item.id}
                key={item.id}
              >
                {item.label}
              </SectionLink>
            ))}
          </nav>
        </div>

        <div className="flex-1" />

        {/* Name lockup across the bottom, on the same padding as the strip
            above (side insets 24px / 64px at sm, vertical half that).
            Font-size solves "Kevin" ink width
            (2.165em measured) == content width on a phone. On a wider
            screen the words are 1.5 times their first size (the 108vh
            and 81rem caps), unless that would not fit: 1.566 is both
            words' ink per px of container, and dividing by 1.566 / 0.75
            keeps the same share of the width at this size. The negative
            side margins trim measured glyph sidebearings so ink, not the
            em box, is flush with the padding edges. */}
        <div
          // relative is load-bearing: it makes this the words' offsetParent
          // from the first frame, so HeroIntro's measurements of them do
          // not change meaning the moment the scroll gives the lockup a
          // transform (which would make it their offsetParent anyway).
          className="relative flex items-baseline justify-between text-[clamp(4rem,calc((100vw_-_48px)/2.165),54rem)] leading-[0.82] sm:text-[clamp(4rem,min(calc((100vw_-_22rem)/2.088),108vh),81rem)]"
          data-hero-lockup
        >
          {/* One shared baseline, both words the same size (0.58 of the
              full-width base formula — the largest that keeps a gap
              between the words on one line). */}
          <span
            className={
              "ml-[-0.095em] text-[0.58em] font-normal tracking-[-0.077em] " +
              CLIP_AT_BASE
            }
            data-hero-letters="ltr"
          >
            <Letters text="Kevin" />
          </span>
          {/* Apparel Regular Italic — the reference site's own cut; a real
              Bold Italic (700) is loaded too if more weight is wanted. */}
          <span
            className={
              "mr-0 text-[0.58em] font-normal font-serif-display italic " +
              "tracking-[-0.08em] mix-blend-difference " + CLIP_AT_BASE
            }
            data-hero-letters="rtl"
          >
            <Letters text="He." />
          </span>
        </div>
      </div>
    </>
  );
}
