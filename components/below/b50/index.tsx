"use client";

import { type CSSProperties, type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { awards, education, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 50, Podium (after podium.global). Three parts on a deeper plum.
 *
 * Work: the five projects in four columns, each column pushed down a
 * different amount so the pictures step, and each picture a different
 * shape. Under each picture its title in heavy condensed caps, and at the
 * right its year and kind in tiny caps. Pointing at one brings its bars up
 * to full width; clicking opens its detail over the page (Esc or Close
 * shuts it, and the page does not scroll while it is open).
 *
 * Then the hero's sentence in heavy condensed caps over a faint grid of
 * dashed lines. Then podium's panels on the same grid: Skills (the group
 * names) beside a taller Recognition (the awards), Tools under both (every
 * skill in one caps paragraph), and "Let's build something / Email me".
 *
 * Pictures are 2D canvases made in the browser only, so they wait for a
 * mounted flag and the server render has empty boxes. Under reduced
 * motion nothing fades or slides.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const DASH = "rgba(249, 185, 220, 0.16)";
const DEEP = "rgba(26, 8, 18, 0.7)";
const PANEL = ["rgba(249, 185, 220, 0.06)", "rgba(249, 185, 220, 0.09)", "rgba(249, 185, 220, 0.12)"];
const LINE = `0.1rem solid ${RULE}`;
const HEAVY = "font-sans font-black uppercase tracking-tight";
const TINY = "font-sans text-[1.1rem] font-semibold uppercase leading-[1.3] tracking-[0.02em]";
const LABEL = "font-sans text-[1.2rem] font-medium uppercase leading-[1.3] tracking-[0.04em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");

const KIND: Record<(typeof projects)[number]["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

/** The statement, from the band's own line and the résumé's first line. */
const STATEMENT =
  "I build systems that bring ideas to life: robots, sensors and the software between them. Co\u2011founder and CTO of The Actually Company, studying computer engineering in Toronto.";

/**
 * Where each project sits in the four columns on a wide screen, and its
 * shape. The first column holds two (the lead and the last); the other
 * three span both rows and start lower, so the pictures step.
 */
const PLACE: { box: string; aspect: string }[] = [
  { box: "lg:col-start-1 lg:row-start-1", aspect: "aspect-[4/3]" },
  { box: "sm:mt-[8rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-[12vw]", aspect: "aspect-[4/5]" },
  { box: "lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:mt-[4vw]", aspect: "aspect-square" },
  { box: "sm:mt-[8rem] lg:col-start-4 lg:row-span-2 lg:row-start-1 lg:mt-[10vw]", aspect: "aspect-[4/3]" },
  { box: "lg:col-start-1 lg:row-start-2", aspect: "aspect-[16/10]" },
];

const CSS = `
.b50-card .b50-title { transition: color 0.25s ease; }
.b50-card:hover .b50-title, .b50-card:focus-visible .b50-title { color: #ffffff; }
.b50-link { transition: color 0.2s ease; }
.b50-link:hover, .b50-link:focus-visible { color: #ffffff; }
.b50-dialog { animation: b50-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b50-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b50-card .b50-title, .b50-link { transition: none; }
  .b50-dialog { animation: none; }
}
`;

/**
 * Heavy caps squeezed to 86% width. The inner block is laid out wider by
 * the same factor, so text wraps at the width it is drawn at.
 */
function Condensed({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }): JSX.Element {
  const k = 0.86;
  return (
    <span className={`block origin-left ${className}`} style={{ width: `${100 / k}%`, transform: `scaleX(${k})`, ...style }}>
      {children}
    </span>
  );
}

/** Small black squares at a panel's corners, as podium marks its boxes. */
function Corners(): JSX.Element {
  const dot = "absolute h-[0.5rem] w-[0.5rem]";
  const bg = { backgroundColor: BLOSSOM };
  return (
    <>
      <span aria-hidden className={`${dot} -left-[0.25rem] -top-[0.25rem]`} style={bg} />
      <span aria-hidden className={`${dot} -right-[0.25rem] -top-[0.25rem]`} style={bg} />
      <span aria-hidden className={`${dot} -bottom-[0.25rem] -left-[0.25rem]`} style={bg} />
      <span aria-hidden className={`${dot} -bottom-[0.25rem] -right-[0.25rem]`} style={bg} />
    </>
  );
}

/** The faint dashed grid behind the statement and the panels. */
function DashedGrid(): JSX.Element {
  const v = (left: string, extra = ""): JSX.Element => (
    <span aria-hidden className={`absolute bottom-0 top-0 ${extra}`} key={left} style={{ left, borderLeft: `0.1rem dashed ${DASH}` }} />
  );
  const box = (style: CSSProperties, key: string): JSX.Element => (
    <span aria-hidden className="absolute hidden h-[2.4rem] w-[2.4rem] md:block" key={key} style={{ border: `0.1rem dashed ${RULE}`, ...style }} />
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {v("13.4%", "hidden md:block")}
      {v("31.5%")}
      {v("67.8%")}
      {v("85.8%", "hidden md:block")}
      <span
        className="absolute left-1/2 top-[6%] aspect-square w-[120vw] -translate-x-1/2 rounded-full md:w-[82vw]"
        style={{ border: `0.1rem dashed ${DASH}` }}
      />
      <span
        className="absolute left-1/2 top-[14%] aspect-square w-[80vw] -translate-x-1/2 rounded-full md:w-[52vw]"
        style={{ border: `0.1rem dashed ${DASH}`, opacity: 0.6 }}
      />
      {box({ right: "8.2%", top: "18%" }, "a")}
      {box({ left: "20%", top: "72%" }, "b")}
      {box({ left: "8.6%", top: "86%" }, "c")}
      {box({ right: "2%", top: "58%" }, "d")}
    </div>
  );
}

function Detail({ i, source, onClose }: { i: number; source: BarSource | null; onClose: () => void }): JSX.Element {
  const p = projects[i];
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b50-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[4vh] md:px-[4vw] md:py-[6vh]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(26, 8, 18, 0.94)", color: BLOSSOM }}
    >
      <div className="b50-dialog relative mx-auto max-w-[140rem]" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: PANEL[0] }}>
        <Corners />
        <div className="flex items-center justify-between px-[2rem] py-[1.4rem]" style={{ borderBottom: LINE }}>
          <p className={LABEL}>
            Project {pad2(i + 1)} / {pad2(projects.length)}
          </p>
          <button className={`${HEAVY} b50-link cursor-pointer px-[0.4rem] py-[0.4rem] text-[1.4rem]`} onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>
        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="relative aspect-[4/3] w-full lg:aspect-auto lg:min-h-[52rem]" style={{ backgroundColor: DEEP }}>
            {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className="min-w-0 px-[2rem] py-[2.4rem] md:px-[3.2rem]">
            <div className="flex items-start justify-between gap-[1.6rem]">
              <h2 className={`${HEAVY} min-w-0 flex-1 text-[clamp(3.2rem,3.6vw,6.4rem)] leading-[0.95] text-white`} id="b50-detail-title">
                <Condensed>{p.title}</Condensed>
              </h2>
              <p className={`${TINY} shrink-0 pt-[0.6rem] text-right`}>
                {p.year}
                <br />
                {KIND[p.kind]}
              </p>
            </div>
            <p className="mt-[1.6rem] font-sans text-[1.8rem] leading-[1.45]">{p.tagline}</p>
            <ul className="mt-[2rem] space-y-[1rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className="flex gap-[1rem] font-sans text-[1.5rem] leading-[1.5]" key={b}>
                  <span aria-hidden className="mt-[0.8rem] h-[0.5rem] w-[0.5rem] shrink-0" style={{ backgroundColor: BLOSSOM }} />
                  {b}
                </li>
              ))}
            </ul>
            <dl className="mt-[2rem] grid grid-cols-[9rem_1fr] gap-y-[1rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              <dt className={`${LABEL} opacity-70`}>Stack</dt>
              <dd className={`${HEAVY} text-[1.4rem] leading-[1.3] text-white`}>{p.stack.join(", ")}</dd>
              {p.award ? (
                <>
                  <dt className={`${LABEL} opacity-70`}>Award</dt>
                  <dd className={`${HEAVY} text-[1.4rem] leading-[1.3] text-white`}>{p.award}</dd>
                </>
              ) : null}
              {p.href || p.code ? (
                <>
                  <dt className={`${LABEL} opacity-70`}>Links</dt>
                  <dd className="flex flex-wrap gap-x-[2.4rem] gap-y-[0.6rem]">
                    {p.href ? (
                      <a className={`${HEAVY} b50-link break-all text-[1.4rem] leading-[1.3] text-white underline underline-offset-[0.3em]`} href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className={`${HEAVY} b50-link text-[1.4rem] leading-[1.3] text-white underline underline-offset-[0.3em]`} href={p.code} rel="noreferrer" target="_blank">
                        Code ↗
                      </a>
                    ) : null}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function B50(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  useEffect(() => setMounted(true), []);

  // The bar pictures' sources, made once in the browser (Saturn's is a canvas).
  const pics = useMemo(() => (mounted ? projects.map((p) => projectSource(p)) : null), [mounted]);

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to the card that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      cardRefs.current[lastOpen.current]?.focus();
      lastOpen.current = -1;
    }
  }, [open]);

  const allSkills = skillGroups.flatMap((g) => g.skills.map((s) => s.name));

  return (
    <div className="relative w-full" id="work" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ backgroundColor: DEEP }}>
        {/* Work: four stepped columns of pictures. */}
        <section aria-label="Work" className="px-[1.6rem] pb-[10vh] pt-[8vh] md:px-[2.5vw]">
          <div className="grid grid-cols-1 gap-x-[1.6vw] gap-y-[5rem] sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto] lg:gap-y-[6rem]">
            {projects.map((p, i) => (
              <button
                aria-haspopup="dialog"
                className={`b50-card block cursor-pointer self-start text-left ${PLACE[i].box}`}
                key={p.title}
                onBlur={() => setHover((h) => (h === i ? -1 : h))}
                onClick={() => setOpen(i)}
                onFocus={() => setHover(i)}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? -1 : h))}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                type="button"
              >
                <span className={`relative block w-full ${PLACE[i].aspect}`} style={{ backgroundColor: PANEL[0] }}>
                  {pics ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" level={hover === i ? 1 : 0.6} source={pics[i]} /> : null}
                </span>
                <span className="mt-[1rem] flex items-start justify-between gap-[1.2rem]">
                  <span className={`${HEAVY} b50-title min-w-0 flex-1 text-[clamp(2.2rem,1.7vw,3.4rem)] leading-[1]`}>
                    <Condensed>{p.title}</Condensed>
                  </span>
                  <span className={`${TINY} shrink-0 pt-[0.2rem] text-right`}>
                    {p.year}
                    <br />
                    {KIND[p.kind]}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* The statement, then the panels, on one dashed grid. */}
        <div className="relative" style={{ borderTop: `0.1rem dashed ${RULE}` }}>
          <DashedGrid />

          <section aria-label="Statement" className="relative px-[1.6rem] py-[12vh] md:px-[2.5vw]" style={{ borderBottom: `0.1rem dashed ${RULE}` }}>
            <p className={`${LABEL} mb-[2rem]`}>
              Computer Engineering, {education.school}
            </p>
            <p className={`${HEAVY} max-w-[82vw] text-[clamp(3.4rem,4.6vw,9.6rem)] leading-[0.98] text-white lg:max-w-[78vw]`}>
              <Condensed className="lg:text-justify">{STATEMENT}</Condensed>
            </p>
          </section>

          <section aria-label="Skills, recognition and contact" className="relative px-[1.6rem] pb-[12vh] pt-[10vh] md:px-[2.5vw]">
            <div className="mx-auto grid w-full grid-cols-1 md:w-[90%] lg:w-[72%] md:grid-cols-2">
              {/* Skills sits lower than Recognition, as Services does beside Clients. */}
              <div className="relative self-end px-[2.4rem] py-[3.2rem] md:px-[5rem] md:py-[5rem]" style={{ backgroundColor: PANEL[0] }}>
                <Corners />
                <h3 className={LABEL}>Skills</h3>
                <ul className={`${HEAVY} mt-[2rem] space-y-[0.2rem] text-[1.7rem] leading-[1.2] text-white`}>
                  {skillGroups.map((g) => (
                    <li key={g.label}>{g.label}</li>
                  ))}
                </ul>
              </div>
              <div className="relative px-[2.4rem] py-[3.2rem] md:px-[5rem] md:pb-[5rem] md:pt-[10rem]" style={{ backgroundColor: PANEL[1] }}>
                <Corners />
                <h3 className={LABEL}>Recognition</h3>
                <ul className={`${HEAVY} mt-[2rem] space-y-[0.2rem] text-[1.7rem] leading-[1.2] text-white`}>
                  {awards.map((a) => (
                    <li key={a.title}>
                      {a.title} <span className={`${TINY} align-middle font-semibold opacity-70`}>{a.year}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative px-[2.4rem] py-[3.2rem] md:col-span-2 md:px-[5rem] md:py-[5rem]" style={{ backgroundColor: PANEL[2] }}>
                <Corners />
                <h3 className={LABEL}>Tools</h3>
                <p className={`${HEAVY} mt-[2rem] text-[1.7rem] leading-[1.25] text-white`}>
                  {allSkills.map((s, k) => (
                    <span className="whitespace-nowrap" key={s}>
                      {s}
                      {k < allSkills.length - 1 ? ",  " : ""}
                    </span>
                  ))}
                </p>
              </div>
            </div>

            {/* The end: one underlined link, and the other places. */}
            <div className="mx-auto mt-[8vh] flex w-full flex-col gap-[2.4rem] md:w-[90%] lg:w-[72%] md:flex-row md:items-end md:justify-between">
              <div>
                <p className={LABEL}>Let&rsquo;s build something</p>
                <a
                  className={`${HEAVY} b50-link mt-[0.8rem] inline-block text-[clamp(4rem,5vw,9.6rem)] leading-[0.95] text-white underline decoration-[0.3rem] underline-offset-[0.12em]`}
                  href={`mailto:${EMAIL}`}
                >
                  Email me ↗
                </a>
              </div>
              <ul className="flex flex-wrap gap-x-[2.4rem] gap-y-[0.8rem]">
                {elsewhere.map((l) => (
                  <li key={l.href}>
                    <a className={`${HEAVY} b50-link whitespace-nowrap text-[1.4rem]`} href={l.href} rel="noreferrer" target="_blank">
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>

      {open >= 0 ? <Detail i={open} onClose={close} source={pics ? pics[open] : null} /> : null}
    </div>
  );
}
