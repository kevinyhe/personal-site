import type { Metadata } from "next";
import SubpageShell from "@/components/SubpageShell";

export const metadata: Metadata = {
  title: "Contact — Kevin He",
  description:
    "Get in touch with Kevin He — email, GitHub, LinkedIn, X, and Instagram.",
};

const elsewhere = [
  {
    handle: "@kevinyhe",
    href: "https://github.com/kevinyhe",
    label: "GitHub",
  },
  {
    handle: "/in/kevinyhe",
    href: "https://www.linkedin.com/in/kevinyhe",
    label: "LinkedIn",
  },
  {
    handle: "@thekevinlab",
    href: "https://x.com/thekevinlab",
    label: "X",
  },
  {
    handle: "@kevin.h_3",
    href: "https://instagram.com/kevin.h_3",
    label: "Instagram",
  },
];

const facts = [
  { label: "Based in", value: "Greater Toronto, Canada" },
  { label: "Status", value: "Student, open to collaborations" },
];

export default function ContactPage() {
  return (
    <SubpageShell current="contact">
      <section className="pt-24 sm:pt-36">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-50"
          data-reveal
        >
          Contact
        </p>
        <h1
          className="mt-5 max-w-[14ch] text-[clamp(2.4rem,7vw,5.5rem)] font-light leading-[1.04] tracking-[-0.03em]"
          data-reveal
        >
          Bring me a{" "}
          <em className="font-serif-display italic tracking-[-0.02em]">
            hard
          </em>{" "}
          problem.
        </h1>
        <p
          className="mt-8 max-w-[32rem] text-[0.9rem] leading-[1.8] opacity-70"
          data-reveal
        >
          Robots, web, control theory, or something stranger — if it is
          interesting, I want to hear about it. The fastest way to reach me is
          email.
        </p>
      </section>

      <section className="mt-16 sm:mt-24" data-reveal>
        <p className="text-[0.7rem] uppercase tracking-[0.25em] opacity-50">
          Write to
        </p>
        <a
          className="mt-4 inline-block break-all border-b border-white/30 pb-2 text-[clamp(1.3rem,3.6vw,2.8rem)] font-light tracking-[-0.02em] transition-opacity duration-200 hover:opacity-60"
          href="mailto:kevin.yuhan.he@gmail.com"
        >
          kevin.yuhan.he@gmail.com
        </a>
      </section>

      <section className="mt-20 border-t border-white/15 pt-10 sm:mt-28">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-50"
          data-reveal
        >
          Elsewhere
        </p>
        <ul className="mt-8 max-w-[36rem]">
          {elsewhere.map((social) => (
            <li
              className="border-b border-white/10 first:border-t first:border-white/10"
              data-reveal
              key={social.label}
            >
              <a
                className="group flex items-baseline justify-between gap-6 py-5"
                href={social.href}
                rel="noreferrer"
                target="_blank"
              >
                <span className="text-[1.05rem] font-light transition-transform duration-300 group-hover:translate-x-2">
                  {social.label}
                </span>
                <span className="text-[0.85rem] opacity-50 transition-opacity duration-300 group-hover:opacity-90">
                  {social.handle}{" "}
                  <span aria-hidden="true" className="ml-1 inline-block">
                    {"↗"}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20 border-t border-white/15 pt-10 sm:mt-28">
        <ul className="max-w-[36rem]">
          {facts.map((fact) => (
            <li
              className="flex items-baseline justify-between gap-6 border-b border-white/10 py-4"
              data-reveal
              key={fact.label}
            >
              <p className="text-[0.7rem] uppercase tracking-[0.2em] opacity-40">
                {fact.label}
              </p>
              <p className="text-right text-[0.9rem] opacity-80">
                {fact.value}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </SubpageShell>
  );
}
