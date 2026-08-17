import HeroIntro from "@/components/HeroIntro";

const socialLinks = ["Behance", "LinkedIn", "GitHub"];
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

      <div className="pointer-events-none fixed inset-0 z-20 flex flex-col p-6 text-[#f0f0f0] mix-blend-difference sm:p-12">
        <p
          className="max-w-[28rem] text-[0.75rem] leading-[1.7] sm:text-[0.85rem]"
          data-hero-animate
        >
          Quiet creator,{" "}
          <em className="font-serif-display italic">bringing ideas to life</em>
          ,
          <br />
          through motion, detail and softness.
        </p>

        <div className="flex-1" />

        <div className="flex flex-wrap items-baseline justify-between text-[clamp(3rem,15vw,13rem)] leading-[0.9]">
          <span className="font-light tracking-[-0.05em]">Kevin</span>
          <span className="font-serif-display italic">He.</span>
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
          <p aria-label="Version 3.0" className="hidden sm:block">
            {"→"}V3.0
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
