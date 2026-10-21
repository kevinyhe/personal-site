"use client";

import { Libre_Baskerville } from "next/font/google";
import type { JSX } from "react";

import SectionLink from "@/components/SectionLink";

import { EMAIL, LINKS, SKILLS, TONE_INK, type Tone } from "./data";
import Ledger from "./Ledger";
import LedgerCanvas from "./LedgerCanvas";
import { BODY, Chip, FootBar, GUTTER, LINK, PageHead, TINY } from "./parts";

/**
 * Concept 06, "Ledger": the timeline is the picture.
 *
 * Three pages, each headed the way lanceyan.com heads its pages (the name in
 * bold serif, "01 / 03" and an arrow):
 *
 * 1. Who I am in three short first-person paragraphs, organisations named
 *    inline behind small monogram squares. Across the foot, lukebaffait's
 *    two-word name ("Kevin" in thin sans, "He." in the italic display
 *    serif) over his hairline footer bar. Behind the name, faint, the same
 *    bar chart page two draws in full, so the first screen's hills are the
 *    résumé.
 * 2. The chart: January 2021 to December 2026, one column of bars a month,
 *    everything running that month stacked as bands (school, robotics,
 *    companies, projects), drawn the way this site draws its hills: vertical
 *    bars whose width is the value. Then lanceyan's timeline rows by year,
 *    which light their bands in the chart (Ledger.tsx).
 * 3. The skills as a row of bars, one per skill, as tall as I know it; then
 *    how to reach me, in lanceyan's lowercase link row.
 *
 * 2D canvas and DOM only, no WebGL. Every fact is from the résumé (data.ts).
 */

const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap" });

const RISE = `
@keyframes f06-rise { from { opacity: 0; transform: translateY(18%); } to { opacity: 1; transform: none; } }
@keyframes f06-fade { from { opacity: 0; } to { opacity: 1; } }
`;

function LinkRow({ className = "" }: { className?: string }): JSX.Element {
  return (
    <ul className={`flex flex-wrap gap-x-[1.5em] gap-y-[0.5em] text-[clamp(13px,1.5rem,21px)] text-white/70 ${className}`}>
      {LINKS.map((l) => (
        <li key={l.label}>
          <a className={`${LINK} hover:text-white`} href={l.href} rel={l.href.startsWith("http") ? "noreferrer" : undefined} target={l.href.startsWith("http") ? "_blank" : undefined}>
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Org({ org, children, href }: { org: Parameters<typeof Chip>[0]["org"]; children: string; href?: string }): JSX.Element {
  return (
    <span className="whitespace-nowrap">
      <Chip org={org} />
      {href ? (
        <a className={`${LINK} text-white`} href={href} rel="noreferrer" target="_blank">
          {children}
        </a>
      ) : (
        <span className="text-white">{children}</span>
      )}
    </span>
  );
}

function Hero(): JSX.Element {
  return (
    <section aria-label="Introduction" className="relative flex min-h-screen flex-col" id="top">
      {/* The ledger again, faint, as the hills behind the name. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[64%] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_38%)]">
        <div className={`absolute inset-y-0 ${GUTTER} inset-x-0`}>
          <LedgerCanvas faint />
        </div>
      </div>

      <div className={`relative flex flex-1 flex-col ${GUTTER} pt-[clamp(28px,8rem,150px)]`}>
        <div className="flex items-start justify-between gap-[4rem]">
          <article className="w-full max-w-[clamp(300px,60rem,820px)] motion-safe:animate-[f06-fade_1.1s_ease-out_both]">
            <PageHead of={3} page={1} to="ledger" />
            <div className={`${BODY} mt-[clamp(16px,2.8rem,40px)] space-y-[0.9em] text-white/70`}>
              <p>
                I&rsquo;m the co&#8209;founder and CTO of <Org href="https://theactually.company" org="actually">The Actually Company</Org>, a local&#8209;first AI speaking coach. This summer I was a Founder in Residence at <Org org="founders">Founders, Inc.</Org> in San Francisco.
              </p>
              <p>
                I study computer engineering at <Org href="https://www.utoronto.ca" org="uoft">University of Toronto</Org>, and I&rsquo;m president of <Org org="stl">STL Robotics</Org>, where I&rsquo;ve written the controls for VEX team 82855Z since 2022.
              </p>
              <p>
                At hackathons: 1st overall at <Org org="eureka">EurekaHacks 2026</Org>, and a finalist at <Org org="htn">Hack The North 2025</Org>.
              </p>
            </div>
            <LinkRow className="mt-[clamp(20px,3.6rem,52px)]" />
          </article>
          <p className="hidden max-w-[34rem] text-right font-sans text-[clamp(12px,1.45rem,21px)] leading-[1.45] text-white/80 md:block">
            Computer engineer in Toronto,
            <br />
            <span className={`${serif.className} italic`}>building systems that bring ideas to life.</span>
          </p>
        </div>

        <h1 aria-label="Kevin He" className="mt-auto flex items-baseline justify-between pt-[clamp(40px,8rem,140px)] text-[18vw] leading-[0.84]">
          <span aria-hidden className="font-sans font-light tracking-[-0.055em] text-[#fffafc] motion-safe:animate-[f06-rise_1.3s_cubic-bezier(.2,.7,.1,1)_0.15s_both]">
            Kevin
          </span>
          <span
            aria-hidden
            className="bg-[linear-gradient(105deg,#f9b9dc_10%,#fffafc_75%)] bg-clip-text pb-[0.04em] pr-[0.08em] font-serif-display text-[1.08em] italic text-transparent motion-safe:animate-[f06-rise_1.3s_cubic-bezier(.2,.7,.1,1)_0.3s_both]"
          >
            He.
          </span>
        </h1>

        <div className="mt-[clamp(16px,2.6rem,40px)]">
          <FootBar
            left={
              <span>
                <span aria-hidden>&rarr; </span>
                <span className="hidden sm:inline">Ledger, </span>2021&ndash;2026
              </span>
            }
            right={
              <nav aria-label="Sections" className="flex gap-[1.6em]">
                <SectionLink className="transition-colors hover:text-white" id="ledger">
                  Timeline
                </SectionLink>
                <SectionLink className="transition-colors hover:text-white" id="skills">
                  Skills
                </SectionLink>
                <SectionLink className="transition-colors hover:text-white" id="contact">
                  Contact
                </SectionLink>
              </nav>
            }
          />
        </div>
      </div>
    </section>
  );
}

/** One skill's bar: a stack of cells, each a centred vertical bar, widest
 *  at the foot. Three cells per step of depth. */
function SkillBar({ depth, tone, seed }: { depth: number; tone: Tone; seed: number }): JSX.Element {
  const rows = depth * 3;
  const cells = Array.from({ length: rows }, (_, r) => {
    const t = rows > 1 ? r / (rows - 1) : 0;
    const n = 0.86 + 0.14 * Math.abs(Math.sin((seed + 1) * 12.9898 + r * 78.233));
    return Math.max(1.4, 8 * (1 - 0.6 * t ** 1.4) * n);
  });
  return (
    <svg
      aria-hidden
      className="block w-[var(--u)] opacity-75 transition-opacity duration-300 group-hover:opacity-100"
      preserveAspectRatio="none"
      style={{ height: `calc(var(--u) * ${rows})` }}
      viewBox={`0 0 10 ${rows * 10}`}
    >
      {cells.map((w, r) => (
        <rect fill={TONE_INK[tone]} fillOpacity={tone === "school" ? 0.6 : 1} height="10" key={r} width={w} x={(10 - w) / 2} y={(rows - 1 - r) * 10} />
      ))}
    </svg>
  );
}

function Skills(): JSX.Element {
  return (
    <section aria-label="Skills and contact" className="relative" id="skills">
      <div className="pt-[clamp(90px,18rem,280px)]">
        <PageHead of={3} page={3} to="top" up />
        <p className={`${BODY} mt-[clamp(14px,2.4rem,36px)] max-w-[64rem] text-white/75`}>What I work with. Each bar is as tall as I know it:</p>
      </div>

      <div className="mt-[clamp(36px,6rem,96px)] flex flex-wrap items-end gap-x-[clamp(28px,6rem,110px)] xl:justify-between gap-y-[clamp(36px,5rem,80px)] [--u:clamp(7px,1.5rem,22px)]">
        {SKILLS.map((g, gi) => (
          <figure className="m-0" key={g.label}>
            <ul className="flex items-end gap-x-[clamp(5px,1.3rem,20px)]">
              {g.skills.map((s, si) => {
                const seed = gi * 16 + si;
                return (
                  <li className="group flex w-[max(var(--u),15px)] flex-col items-center" key={s.name}>
                    <SkillBar depth={s.depth} seed={seed} tone={g.tone} />
                    <span className="mt-[0.9em] rotate-180 whitespace-nowrap font-sans text-[clamp(10.5px,1.2rem,17px)] leading-none text-white/55 transition-colors duration-300 [writing-mode:vertical-rl] group-hover:text-white">
                      {s.name}
                      <span className="sr-only">, depth {s.depth} of 5</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <figcaption className={`${TINY} mt-[1.4em] border-t border-white/25 pt-[0.9em] text-white/70`}>
              <span className="text-white/40">({String(g.skills.length).padStart(2, "0")})</span> {g.label}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-[clamp(80px,14rem,220px)] max-w-[clamp(300px,64rem,880px)]" id="contact">
        <p className={`${BODY} text-white/70`}>
          The quickest way to reach me is email, at{" "}
          <a className={`${LINK} text-white`} href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          . I&rsquo;m in Toronto.
        </p>
        <LinkRow className="mt-[clamp(18px,3rem,44px)]" />
      </div>

      <div className="mt-[clamp(56px,10rem,160px)]">
        <FootBar
          left={
            <SectionLink className="transition-colors hover:text-white" id="top">
              <span aria-hidden>&uarr; </span>Back to top
            </SectionLink>
          }
          right={<span className="text-white/60">Toronto, ON</span>}
        />
      </div>
    </section>
  );
}

export default function F06(): JSX.Element {
  return (
    <main className={`${serif.className} relative overflow-x-clip text-[#fffafc]`}>
      <style>{RISE}</style>
      <Hero />
      <div className={GUTTER}>
        <Ledger />
        <Skills />
      </div>
    </main>
  );
}
