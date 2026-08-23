import { preload } from "react-dom";
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

// The television model and its textures go out with the HTML, not after
// the bundle has parsed and the canvas has mounted: the page loads AS the
// television shot, so these are the first things the page needs.
const CRT_ASSETS: { href: string; as: "fetch" | "image" }[] = [
  { href: "/models/crt.glb", as: "fetch" },
  { href: "/models/tv-old-tv-retro-tv/textures/crt-basecolor.webp", as: "image" },
  { href: "/models/tv-old-tv-retro-tv/textures/crt-normal.webp", as: "image" },
  { href: "/models/tv-old-tv-retro-tv/textures/crt-metallic.webp", as: "image" },
  { href: "/models/tv-old-tv-retro-tv/textures/crt-roughness.webp", as: "image" },
];

export default function Home() {
  for (const asset of CRT_ASSETS) {
    preload(asset.href, {
      as: asset.as,
      ...(asset.as === "fetch" ? { crossOrigin: "anonymous" } : {}),
    });
  }
  return (
    // No data-home-lock any more: the home page scrolls now (the CRT scene
    // lives on scroll). HeroIntro still blocks wheel/touch during the intro.
    <div>
      {/* Renders nothing unless the URL carries ?tune. Visit /?tune to place
          the tree, then Freeze to get the lines that bake it in. */}
      <TreeTuner />
      <HeroIntro>
        <h1 className="sr-only">Kevin He - Creative Developer</h1>

        {/* Solid type; only the large right serif word carries the (subtle)
            difference effect, matching the reference site. */}
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col p-6 text-[#f0f0f0] sm:p-16">
          {/* Name lockup across the very top. Font-size solves "Kevin" ink
              width (2.165em measured) == content width, and the negative
              side margins trim measured glyph sidebearings so ink, not the
              em box, is flush with the padding edges. */}
          <div className="flex items-baseline justify-between text-[clamp(4rem,calc((100vw_-_48px)/2.165),54rem)] leading-[0.82] sm:text-[clamp(4rem,min(calc((100vw_-_128px)/2.165),72vh),54rem)]">
            {/* One shared baseline, both words the same size (0.58 of the
                full-width base formula — the largest that keeps a gap
                between the words on one line). */}
            <span
              className={
                "ml-[-0.095em] text-[0.58em] font-normal tracking-[-0.05em] " +
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

          <div className="flex-1" />

          {/* Bottom strip: signature left, the pages centred, the quick
              links right. A 3-column grid so the nav is centred on the
              page, not between its neighbours. */}
          <div
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 text-[0.85rem] uppercase tracking-[0.04em] text-white"
            data-hero-animate
            style={{ textShadow: "0 0 8px rgba(255,255,255,0.25)" }}
          >
            <p aria-label="Copyright" className="hidden sm:block">
              {"©"} {new Date().getFullYear()}
            </p>
            <p aria-hidden="true" className="sm:hidden" />

            <nav className="flex items-center justify-center gap-6 sm:gap-8">
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

            <div className="flex items-center justify-end gap-3">
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
