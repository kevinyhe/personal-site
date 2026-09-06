import type { Metadata } from "next";
import SubpageShell from "@/components/SubpageShell";
import { elsewhere, EMAIL } from "@/components/siteContent";

export const metadata: Metadata = {
  title: "Contact — Kevin He",
  description:
    "Reach Kevin He by email, or find him on GitHub, LinkedIn, X and Instagram.",
};

export default function ContactPage() {
  return (
    <SubpageShell current="contact">
      <section className="pt-24 sm:pt-36">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-45"
          data-reveal
        >
          Contact
        </p>
        <h1
          className="mt-5 max-w-[12ch] text-[clamp(2.4rem,6.5vw,5rem)] font-light leading-[1.04] tracking-[-0.03em]"
          data-reveal
        >
          Get in touch.
        </h1>
        <p
          className="mt-8 text-[0.95rem] leading-[1.75] opacity-70"
          data-reveal
        >
          Email is fastest.
        </p>
      </section>

      <section className="mt-16 sm:mt-24" data-reveal>
        <p className="text-[0.7rem] uppercase tracking-[0.25em] opacity-45">
          Write to
        </p>
        <a
          className="mt-5 inline-block break-all border-b border-white/25 pb-2 text-[clamp(1.05rem,3.4vw,2.6rem)] font-light tracking-[-0.02em] transition-opacity duration-200 hover:opacity-60"
          href={`mailto:${EMAIL}`}
        >
          {EMAIL}
        </a>
      </section>

      <section className="mt-20 sm:mt-28">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-45"
          data-reveal
        >
          Elsewhere
        </p>
        <ul className="mt-7">
          {elsewhere.map((social) => (
            <li
              className="group border-b border-white/10 first:border-t first:border-white/10"
              data-reveal
              key={social.label}
            >
              <a
                className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-12 sm:items-baseline sm:gap-8"
                href={social.href}
                rel="noreferrer"
                target="_blank"
              >
                <span className="text-[0.7rem] uppercase tracking-[0.2em] opacity-40 sm:col-span-3">
                  {social.label}
                </span>
                <span className="text-[0.9rem] opacity-80 transition-transform duration-300 group-hover:translate-x-1.5 sm:col-span-9">
                  {social.handle}
                  <span
                    aria-hidden="true"
                    className="ml-2 inline-block opacity-0 transition-opacity duration-300 group-hover:opacity-60"
                  >
                    {"↗"}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </SubpageShell>
  );
}
