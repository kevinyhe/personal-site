import HeroIntro from "@/components/HeroIntro";
import TransitionLink from "@/components/TransitionLink";
import TreeTuner from "@/components/TreeTuner";

const socialLinks = [
  { href: "https://x.com/thekevinlab", label: "X" },
  { href: "https://www.linkedin.com/in/kevinyhe", label: "LinkedIn" },
  { href: "https://github.com/kevinyhe", label: "GitHub" },
];
const menuLinks = [
  { href: "/work", label: "Work" },
  { href: "/info", label: "Info" },
  { href: "/contact", label: "Contact" },
];

/**
 * Clips each word of the lockup at the hairline, so letters parked below it
 * are invisible and appear to rise out of it.
 *
 * The lockup's box bottom sits 96px (bottom-24) above the zero-height wrapper
 * on mobile and 72px at sm, and the bar starts 28px (mt-7) / 36px (sm:mt-9)
 * below that wrapper — so the bar is 124px / 108px below the word box, and a
 * negative bottom inset pushes the clip edge exactly onto it. Applied to each
 * word rather than to a shared ancestor: clip-path creates a stacking context,
 * and putting one above "He." would isolate its mix-blend-difference.
 */
const CLIP_AT_HAIRLINE =
  "[clip-path:inset(-200vh_-50vw_-124px_-50vw)] " +
  "sm:[clip-path:inset(-200vh_-50vw_-108px_-50vw)]";

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

export default function Home() {
  return (
    // No data-home-lock any more: the home page scrolls now (the CRT scene
    // lives on scroll). HeroIntro still blocks wheel/touch during the intro.
    <div>
      {/* Renders nothing unless the URL carries ?tune. Visit /?tune to place
          the tree, then Freeze to get the lines that bake it in. */}
      <TreeTuner />
      <HeroIntro>
        <h1 className="sr-only">Kevin He - Creative Developer</h1>

        {/* On phones the canopy reaches the top edge; a faint scrim outside the
            difference-blended layer keeps the top row readable over blossoms. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-black/60 to-transparent sm:hidden"
        />

        {/* Solid type; only the large right serif word carries the (subtle)
            difference effect, matching the reference site. */}
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col p-6 text-[#f0f0f0] sm:p-16">
          {/* Tagline top-left, nav top-right. Both sit above the flex-1
              spacer, which absorbs their height — this row can be any size
              without moving the name lockup or the hairline by a pixel. */}
          <header className="flex items-start justify-between gap-8">
            <p
              className="max-w-[28rem] text-[0.75rem] leading-[1.7] sm:text-[0.85rem]"
              data-hero-animate
              style={{ textShadow: "0 0 8px rgba(255,255,255,0.25)" }}
            >
             Designer, developer, and curator of chaos.
            </p>

            <nav
              className="flex shrink-0 items-center gap-6 text-[0.85rem] uppercase tracking-[0.04em] sm:gap-8"
              data-hero-animate
              style={{ textShadow: "0 0 8px rgba(255,255,255,0.25)" }}
            >
              {menuLinks.map((item) => (
                <TransitionLink
                  className="pointer-events-auto transition-opacity duration-200 hover:opacity-60"
                  href={item.href}
                  key={item.href}
                  veilLabel={item.label}
                >
                  {item.label}
                </TransitionLink>
              ))}
            </nav>
          </header>

          <div className="flex-1" />

          {/* Poster lockup, out of normal flow so its height can never push the
              hairline/bar off-screen. The zero-height wrapper sits just above
              the hairline; the name hangs upward from it. Font-size solves
              "Kevin" ink width (2.165em measured) == content width, and the
              negative side margins trim measured glyph sidebearings so ink, not
              the em box, is flush with the padding edges. */}
          <div className="relative">
            <div className="absolute inset-x-8 bottom-24 flex items-baseline justify-between text-[clamp(4rem,calc((100vw_-_48px)/2.165),54rem)] leading-[0.82] sm:bottom-[72px] sm:text-[clamp(4rem,min(calc((100vw_-_128px)/2.165),72vh),54rem)]">
              {/* One shared baseline, both words the same size (0.62 of the
                  full-width base formula — the largest that keeps a gap
                  between the words on one line). */}
              <span
                className={
                  "ml-[-0.095em] text-[0.58em] font-normal tracking-[-0.05em] " +
                  CLIP_AT_HAIRLINE
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
                  "tracking-[-0.08em] mix-blend-difference " + CLIP_AT_HAIRLINE
                }
                data-hero-letters="rtl"
              >
                <Letters text="He." />
              </span>
            </div>
          </div>

          <div
            className="mt-7 h-px w-full bg-white sm:mt-9"
            data-hero-animate
            style={{ boxShadow: "0 0 6px rgba(255,255,255,0.25)" }}
          />

          {/* Under the hairline: signature on the left, the quick links pushed
              out to the right edge. Deliberately still ONE line at the same
              size and leading as the three-column strip it replaces — the
              whole column is bottom-anchored, so any extra height here would
              push the hairline and the name up off their tuned positions. */}
          <div
            className="mt-5 flex items-center justify-between gap-8 text-[0.85rem] uppercase tracking-[0.04em] text-white sm:mt-6"
            data-hero-animate
            style={{ textShadow: "0 0 8px rgba(255,255,255,0.25)" }}
          >
            <p aria-label="Copyright" className="hidden sm:block">
              {"©"} {new Date().getFullYear()}
            </p>

            <div className="flex items-center justify-center gap-3 sm:justify-end">
              {socialLinks.map((social, index) => (
                <span className="flex items-center gap-3" key={social.label}>
                  {index > 0 ? (
                    <span aria-hidden="true" className="opacity-40">
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
          </div>
        </div>
      </HeroIntro>
    </div>
  );
}
