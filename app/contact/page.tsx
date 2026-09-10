import type { Metadata } from "next";
import FractureText from "@/components/FractureText";
import SubpageShell from "@/components/SubpageShell";
import { elsewhere, EMAIL } from "@/components/siteContent";

export const metadata: Metadata = {
  title: "Contact — Kevin He",
  description:
    "Reach Kevin He by email, or find him on GitHub, LinkedIn, X and Instagram.",
};

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-current";

/** Same curve and dimming as the /work and /info rows; see app/work/page.tsx. */
const ROW_EASE =
  "transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:group-hover/row:translate-x-0";

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

      <section className="mt-16 sm:mt-24">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-45"
          data-reveal
        >
          Write to
        </p>
        <div className="mt-5 inline-flex max-w-full flex-col">
          {/* The same address as the home page, breaking the same way
              (FractureText): each character is a piece and hovering the
              line releases them. Sans, not the serif — the demo cut draws
              its watermark for "@". The aria-label is there because the
              split puts every letter in its own span. */}
          <span className="inline-block" data-reveal>
            <a
              aria-label={`Email ${EMAIL}`}
              className={`inline-block text-[clamp(1.05rem,3.4vw,2.6rem)] font-light leading-none tracking-[-0.02em] transition-opacity duration-300 hover:opacity-70 motion-reduce:transition-none ${FOCUS_RING}`}
              href={`mailto:${EMAIL}`}
            >
              <FractureText className="max-w-full" text={EMAIL} />
            </a>
          </span>
          {/* The underline draws itself under the address rather than
              arriving with it (was a border-b on the link). */}
          <span
            aria-hidden="true"
            className="mt-3 h-px w-full bg-white/25"
            data-reveal
            data-rule
          />
        </div>
      </section>

      <section className="mt-20 sm:mt-28">
        <p
          className="text-[0.7rem] uppercase tracking-[0.25em] opacity-45"
          data-reveal
        >
          Elsewhere
        </p>
        <div
          aria-hidden="true"
          className="mt-7 h-px w-full bg-white/10"
          data-reveal
          data-rule
        />
        <ul className="group/list">
          {elsewhere.map((social) => (
            <li className="group/row relative" key={social.label}>
              <a
                className={`grid grid-cols-1 gap-1 py-4 sm:grid-cols-12 sm:items-baseline sm:gap-8 ${FOCUS_RING}`}
                data-reveal
                href={social.href}
                rel="noreferrer"
                target="_blank"
              >
                <span
                  className={`text-[0.7rem] uppercase tracking-[0.2em] opacity-40 group-hover/list:opacity-25 group-hover/row:opacity-70 sm:col-span-3 ${ROW_EASE}`}
                >
                  {social.label}
                </span>
                <span
                  className={`text-[0.9rem] opacity-80 group-hover/list:opacity-40 group-hover/row:translate-x-1.5 group-hover/row:opacity-100 sm:col-span-9 ${ROW_EASE}`}
                >
                  {social.handle}
                  <span
                    aria-hidden="true"
                    className="ml-2 inline-block opacity-0 transition-opacity duration-300 group-hover/row:opacity-60 motion-reduce:transition-none"
                  >
                    {"↗"}
                  </span>
                </span>
              </a>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-px bg-white/10"
                data-reveal
                data-rule
              />
            </li>
          ))}
        </ul>
      </section>
    </SubpageShell>
  );
}
