import HeroIntro from "@/components/HeroIntro";

const socialLinks = ["X", "LinkedIn", "GitHub"];
const menuLinks = ["Work", "Info", "Contact"];

export default function Home() {
  return (
    <HeroIntro>
      <h1 className="sr-only">Kevin He - Creative Developer</h1>

      {/* On phones the canopy reaches the top edge; a faint scrim outside the
          difference-blended layer keeps the tagline readable over blossoms. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-black/60 to-transparent sm:hidden"
      />

      {/* Solid type; only the large right serif word carries the (subtle)
          difference effect, matching the reference site. */}
      <div className="pointer-events-none fixed inset-0 z-20 flex flex-col p-6 text-[#f0f0f0] sm:p-16">
        <p
          className="max-w-[28rem] text-[0.75rem] leading-[1.7] sm:text-[0.85rem]"
          data-hero-animate
        >
          I build robots, software, and systems that bring ideas to life.
        </p>

        <div className="flex-1" />

        {/* Poster lockup, out of normal flow so its height can never push the
            hairline/bar off-screen. The zero-height wrapper sits just above
            the hairline; the name hangs upward from it. Font-size solves
            "Kevin" ink width (2.165em measured) == content width, and the
            negative side margins trim measured glyph sidebearings so ink, not
            the em box, is flush with the padding edges. */}
        <div className="relative">
          <div className="absolute inset-x-0 bottom-16 flex items-baseline justify-between text-[clamp(4rem,calc((100vw_-_48px)/2.165),54rem)] leading-[0.82] sm:bottom-10 sm:text-[clamp(4rem,min(calc((100vw_-_128px)/2.165),72vh),54rem)]">
            {/* One shared baseline, both words the same size (0.62 of the
                full-width base formula — the largest that keeps a gap
                between the words on one line). */}
            <span className="ml-[-0.095em] text-[0.58em] font-normal tracking-[-0.05em]">
              Kevin
            </span>
            {/* Bodoni Moda has real italic weights — 500 gives the heavier
                presence without the fake-bold inflation. */}
            <span className="mr-[-0.1em] text-[0.58em] font-medium font-serif-display italic mix-blend-difference">
              He.
            </span>
          </div>
        </div>

        <div
          className="mt-7 h-px w-full bg-white sm:mt-9"
          data-hero-animate
          style={{ boxShadow: "0 0 6px rgba(255,255,255,0.25)" }}
        />

        <div
          className="mt-5 grid grid-cols-1 items-center text-[0.85rem] uppercase tracking-[0.04em] text-white sm:mt-6 sm:grid-cols-3"
          data-hero-animate
          style={{ textShadow: "0 0 8px rgba(255,255,255,0.25)" }}
        >
          <p aria-label="Copyright" className="hidden sm:block">
            {"©"} {new Date().getFullYear()}
          </p>

          <p className="flex items-center justify-center gap-3">
            {socialLinks.map((label, index) => (
              <span className="flex items-center gap-3" key={label}>
                {index > 0 ? (
                  <span aria-hidden="true" className="opacity-40">
                    /
                  </span>
                ) : null}
                <a
                  className="pointer-events-auto transition-opacity duration-200 hover:opacity-60"
                  href="#"
                >
                  {label}
                </a>
              </span>
            ))}
          </p>

          <div className="hidden items-center justify-end gap-8 sm:flex">
            {menuLinks.map((label) => (
              <a
                className="pointer-events-auto transition-opacity duration-200 hover:opacity-60"
                href="#"
                key={label}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </HeroIntro>
  );
}
