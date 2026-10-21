"use client";

import { type CSSProperties, type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { awards, education, experience, projects, type Skill, skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 46, Grid (after nickho-motorsports.nl).
 *
 * Seven equal columns across the full width, marked by faint vertical
 * lines that run the whole design. Four parts:
 *
 * 1. A full-width picture (the S-KBD67 blaster, drawn as bars) with a
 *    stack of small stats at the left, the VEX team number huge in the
 *    middle, three facts at the right, "KEVIN HE" in heavy condensed caps
 *    at the bottom left and a live Toronto clock at the bottom right.
 * 2. A heavy condensed caps statement in the middle three columns, with
 *    three phrases in white, and two small pictures at the corners.
 * 3. The skills: every logo (or a short mark where there is no logo) in
 *    columns 1, 2, 6 and 7, staggered, around the team's robot in the
 *    middle. Pointing at a logo shows its name, under the logo and under
 *    the robot. "ALL SKILLS" under the robot opens a plain list.
 * 4. The five projects as chapter rows: a heavy caps title, a picture, one
 *    paragraph and a "1/5" counter. Pointing at a row brings its picture
 *    up to full strength; clicking opens its detail over the page (Esc or
 *    Close shut it; the page does not scroll while it is open).
 * Then the contact links.
 *
 * Heavy condensed caps are Inter Black squeezed sideways (scaleX). The box
 * inside is made wider by the same factor, so lines wrap as if the type
 * were narrow. Bar pictures are made in the browser only, after a mounted
 * flag. Under reduced motion nothing animates; the clock still ticks.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const SQUEEZE = 0.62;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");

const KIND: Record<(typeof projects)[number]["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

const vex = experience.find((e) => e.org.includes("VEX"));
const allSkills: (Skill & { group: string })[] = skillGroups.flatMap((g) => g.skills.map((s) => ({ ...s, group: g.label })));
const eureka = awards.find((a) => a.title.includes("EurekaHacks"));

const STATS = [
  { value: pad2(projects.length), label: "Projects" },
  { value: String(allSkills.length), label: "Tools" },
  { value: "1st", label: eureka ? `EurekaHacks ${eureka.year}` : "EurekaHacks" },
  { value: "80th", label: "of ~20,000, VEX Skills" },
];
const FACTS = [
  { value: "Toronto", label: "Based in" },
  { value: education.when.replace(/\s/g, ""), label: "BASc, Computer Engineering" },
  { value: "82855Z", label: "VEX team number" },
];

// The statement; `hi` parts are set in white.
const STATEMENT: { text: string; hi?: boolean }[] = [
  { text: "I build systems that " },
  { text: "bring ideas to life", hi: true },
  { text: ". A " },
  { text: "world-record autonomous routine", hi: true },
  { text: ", a Nerf blaster wired into a shooter, a boxing game you play by swinging your phone. Now co-founder and CTO at " },
  { text: "The Actually Company", hi: true },
  { text: "." },
];

const CSS = `
.b46-link { transition: color 0.2s ease; }
.b46-link:hover, .b46-link:focus-visible { color: #ffffff; }
.b46-logo { transition: color 0.25s ease, transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
.b46-skill:hover .b46-logo, .b46-skill:focus-visible .b46-logo { color: #ffffff; transform: scale(1.12); }
.b46-tip { opacity: 0; transform: translateY(-0.4rem); transition: opacity 0.2s ease, transform 0.25s ease; }
.b46-skill:hover .b46-tip, .b46-skill:focus-visible .b46-tip { opacity: 1; transform: none; }
.b46-row .b46-title { transition: color 0.25s ease; }
.b46-row:hover .b46-title, .b46-row:focus-visible .b46-title { color: #ffffff; }
.b46-btn { transition: background-color 0.2s ease; }
.b46-btn:hover, .b46-btn:focus-visible { background-color: #ffffff; }
.b46-dialog { animation: b46-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b46-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b46-link, .b46-logo, .b46-tip, .b46-row .b46-title, .b46-btn { transition: none; }
  .b46-skill:hover .b46-logo, .b46-skill:focus-visible .b46-logo { transform: none; }
  .b46-dialog { animation: none; }
}
`;

/**
 * Heavy condensed caps. The inner box is 1/SQUEEZE as wide as its parent
 * and squeezed back to fit, so text wraps as if the letters were narrow.
 */
function Caps({
  children,
  align = "left",
  className = "",
  style,
}: {
  children: ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const wide = 100 / SQUEEZE;
  const shift = align === "left" ? 0 : align === "center" ? (100 - wide) / 2 : 100 - wide;
  const origin = align === "left" ? "0 0" : align === "center" ? "50% 0" : "100% 0";
  return (
    <span className="block w-full">
      <span
        className={`block font-sans font-black uppercase tracking-[-0.01em] ${className}`}
        style={{ width: `${wide}%`, marginLeft: `${shift}%`, transform: `scaleX(${SQUEEZE})`, transformOrigin: origin, textAlign: align, ...style }}
      >
        {children}
      </span>
    </span>
  );
}

/** Two squares corner to corner, before a counter. */
function Checker(): JSX.Element {
  return (
    <span aria-hidden className="inline-grid h-[1.4rem] w-[1.4rem] grid-cols-2 grid-rows-2">
      <span style={{ backgroundColor: "#ffffff" }} />
      <span />
      <span />
      <span style={{ backgroundColor: "#ffffff" }} />
    </span>
  );
}

/** A skill's logo, or its short mark set in a thin box where there is none. */
function Logo({ s, size }: { s: Skill; size: string }): JSX.Element {
  const icon = skillIcon(s.icon);
  if (icon) {
    return (
      <svg aria-hidden className="b46-logo block" style={{ width: size, height: size }} viewBox="0 0 24 24">
        <path d={icon.path} fill="currentColor" />
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      className="b46-logo block whitespace-nowrap px-[0.6rem] py-[0.2rem] font-sans text-[1.5rem] font-black uppercase leading-[1.2] tracking-[0.04em]"
      style={{ border: "0.15rem solid currentColor" }}
    >
      {s.mark}
    </span>
  );
}

function SkillButton({ s, onPick }: { s: Skill & { group: string }; onPick: (name: string | null) => void }): JSX.Element {
  return (
    <button
      aria-label={`${s.name}, ${s.group}`}
      className="b46-skill relative flex h-[5.6rem] w-full cursor-default items-center justify-center"
      onBlur={() => onPick(null)}
      onClick={() => onPick(s.name)}
      onFocus={() => onPick(s.name)}
      onPointerEnter={() => onPick(s.name)}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onPick(null);
      }}
      type="button"
    >
      <Logo s={s} size="3rem" />
      <span className="b46-tip pointer-events-none absolute left-1/2 top-[calc(50%+2.2rem)] -translate-x-1/2 whitespace-nowrap font-sans text-[1.1rem] font-semibold uppercase tracking-[0.08em] text-white">
        {s.name}
      </span>
    </button>
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
      aria-labelledby="b46-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[4vh] md:px-[5.25vw] md:py-[6vh]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="b46-dialog mx-auto max-w-[150rem]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-[1.6rem] pb-[1.6rem]" style={{ borderBottom: LINE }}>
          <p className="flex items-center gap-[1rem] font-sans text-[1.3rem] font-semibold uppercase tracking-[0.08em] text-white">
            <Checker />
            <span className="tabular-nums">
              {i + 1}/{projects.length}
            </span>
          </p>
          <button
            className="b46-btn cursor-pointer px-[1.4rem] py-[0.8rem] font-sans text-[1.3rem] font-black uppercase tracking-[0.06em]"
            onClick={onClose}
            ref={closeRef}
            style={{ backgroundColor: BLOSSOM, color: BAND }}
            type="button"
          >
            Close ✕
          </button>
        </div>
        <div className="grid gap-[3.2rem] pt-[3.2rem] lg:grid-cols-[1.1fr_1fr] lg:gap-[5.25vw]">
          <div className="relative aspect-[4/3] w-full">
            {source ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className="min-w-0">
            <p className="font-sans text-[1.3rem] font-semibold uppercase tracking-[0.08em] opacity-70">
              {p.year} · {KIND[p.kind]}
            </p>
            <h2 className="mt-[1rem] text-white" id="b46-detail-title">
              <Caps className="text-[clamp(4.8rem,6vw,11rem)] leading-[0.92]">{p.title}</Caps>
            </h2>
            <p className="mt-[1.6rem] font-sans text-[1.8rem] leading-[1.45] text-white">{p.tagline}</p>
            <ul className="mt-[2rem] space-y-[1rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className="flex gap-[1rem] font-sans text-[1.5rem] leading-[1.55]" key={b}>
                  <span aria-hidden className="mt-[0.8rem] h-[0.5rem] w-[0.5rem] shrink-0" style={{ backgroundColor: BLOSSOM }} />
                  {b}
                </li>
              ))}
            </ul>
            <dl className="mt-[2rem] grid grid-cols-[8rem_1fr] gap-y-[0.8rem] pt-[1.6rem] font-sans text-[1.4rem] leading-[1.5]" style={{ borderTop: LINE }}>
              <dt className="font-semibold uppercase tracking-[0.06em] opacity-60">Stack</dt>
              <dd className="text-white">{p.stack.join(", ")}</dd>
              {p.award ? (
                <>
                  <dt className="font-semibold uppercase tracking-[0.06em] opacity-60">Award</dt>
                  <dd className="text-white">{p.award}</dd>
                </>
              ) : null}
              {p.href || p.code ? (
                <>
                  <dt className="font-semibold uppercase tracking-[0.06em] opacity-60">Links</dt>
                  <dd className="flex flex-wrap gap-x-[2rem] gap-y-[0.4rem]">
                    {p.href ? (
                      <a className="b46-link underline underline-offset-[0.3em]" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b46-link underline underline-offset-[0.3em]" href={p.code} rel="noreferrer" target="_blank">
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

const clockFormat = (): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default function B46(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [clock, setClock] = useState("--:--:--");
  const [picked, setPicked] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  useEffect(() => setMounted(true), []);

  // Pictures, made once in the browser (Saturn's is drawn on a canvas).
  const pics = useMemo(() => {
    if (!mounted) return null;
    return { projects: projects.map((p) => projectSource(p)) };
  }, [mounted]);

  // The Toronto clock, bottom right of the first part.
  useEffect(() => {
    const fmt = clockFormat();
    const tick = (): void => setClock(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to the row that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      rowRefs.current[lastOpen.current]?.focus();
      lastOpen.current = -1;
    }
  }, [open]);

  // Columns 1, 2, 6 and 7 take the logos in turn, row by row.
  const columns = useMemo(() => [0, 1, 2, 3].map((c) => allSkills.filter((_, k) => k % 4 === c)), []);
  const pickedSkill = picked ? allSkills.find((s) => s.name === picked) : undefined;

  const skillColumn = (c: number, offset: boolean): JSX.Element => (
    <ul className={`hidden flex-col md:flex ${offset ? "pt-[2.8rem]" : ""}`}>
      {columns[c].map((s) => (
        <li key={s.name}>
          <SkillButton onPick={setPicked} s={s} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative w-full overflow-x-clip font-sans" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* 1. Picture, stats, number, name. */}
      <section className="relative flex flex-col gap-[3.2rem] overflow-hidden px-[1.6rem] py-[4rem] md:block md:h-[max(64rem,66vh)] md:p-0">
        <div aria-hidden className="absolute inset-0">
          {pics ? <BarPicture cell={6} className="absolute inset-0" level={0.5} source={projects[1].image ?? ""} /> : null}
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(42,13,30,0.7) 0%, rgba(42,13,30,0.15) 35%, rgba(42,13,30,0.15) 65%, rgba(42,13,30,0.7) 100%)" }} />
        </div>

        <dl className="relative grid grid-cols-2 gap-x-[1.6rem] gap-y-[1.8rem] md:absolute md:left-[5.25vw] md:top-[16%] md:grid-cols-1 md:gap-y-[1.4rem]">
          {STATS.map((s) => (
            <div className="flex flex-col-reverse" key={s.label}>
              <dt className="mt-[0.2rem] text-[1.4rem] leading-[1.3]">{s.label}</dt>
              <dd className="w-[12rem] text-white">
                <Caps className="text-[3.8rem] leading-[1]">{s.value}</Caps>
              </dd>
            </div>
          ))}
        </dl>

        <p className="relative text-white md:absolute md:left-[28.57%] md:right-[28.57%] md:top-1/2 md:-translate-y-1/2">
          <Caps align="center" className="text-[clamp(9rem,14vw,28rem)] leading-[0.9]">
            82855Z
          </Caps>
        </p>

        <div className="relative grid grid-cols-2 gap-x-[1.6rem] gap-y-[1.8rem] md:absolute md:right-[5.25vw] md:top-[16%] md:block md:text-right">
          <p className="col-span-2 max-w-[24rem] text-[1.4rem] leading-[1.4] text-white md:ml-auto">Sensors in, motion out.</p>
          <dl className="contents md:mt-[2rem] md:block md:space-y-[2rem]">
            {FACTS.map((f) => (
              <div className="flex flex-col-reverse" key={f.label}>
                <dt className="text-[1.4rem] leading-[1.3]">{f.label}</dt>
                <dd className="text-[1.4rem] font-bold leading-[1.3] text-white">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative md:absolute md:bottom-[6%] md:left-[5.25vw] md:w-[28vw] md:max-w-[46rem]">
          <h2 className="w-[24rem] text-white md:w-full">
            <Caps className="text-[clamp(5.6rem,4.6vw,9rem)] leading-[0.95]">Kevin He</Caps>
          </h2>
          <p className="mt-[0.8rem] max-w-[40rem] text-[1.4rem] leading-[1.45] md:text-[1.5rem]">
            Co-founder and CTO at The Actually Company. {vex ? `Team captain and lead programmer of ${vex.org.replace("STL Robotics, ", "")} since 2022.` : null}
          </p>
        </div>

        <div className="relative md:absolute md:bottom-[6%] md:right-[5.25vw] md:text-right">
          <p className="text-[1.4rem] leading-[1.3]">Toronto, local time</p>
          <p className="w-[22rem] text-white md:ml-auto">
            <Caps align="right" className="text-[4.4rem] leading-[1] tabular-nums">
              {clock}
            </Caps>
          </p>
        </div>
      </section>

      {/* 2. The statement, with a picture at two corners. */}
      <section className="relative px-[1.6rem] py-[8vh] md:px-0 md:py-[12vh]">
        <p className="mx-auto md:w-[42.86%]" style={{ color: "rgba(249, 185, 220, 0.8)" }}>
          <Caps align="center" className="text-[clamp(3.4rem,3.9vw,8rem)] leading-[0.94]">
            {STATEMENT.map((part) =>
              part.hi ? (
                <span className="text-white" key={part.text}>
                  {part.text}
                </span>
              ) : (
                <span key={part.text}>{part.text}</span>
              ),
            )}
          </Caps>
        </p>
        <div className="mt-[4rem] flex justify-between gap-[1.6rem] md:contents">
          <div className="relative aspect-[3/2] w-[48%] md:absolute md:left-[5.25vw] md:top-[22%] md:mt-0 md:w-[15.8vw]">
            {pics ? <BarPicture alt={projects[2].title} cell={4} className="absolute inset-0" source={pics.projects[2]} /> : null}
          </div>
          <div className="relative mt-[6rem] aspect-[3/2] w-[48%] md:absolute md:bottom-[6vh] md:right-[5.25vw] md:mt-0 md:w-[15.8vw]">
            {pics ? <BarPicture alt={projects[0].title} cell={4} className="absolute inset-0" source={pics.projects[0]} /> : null}
          </div>
        </div>
      </section>

      {/* 3. Skills round the robot. */}
      <section aria-label="Skills" className="relative flex flex-col px-[1.6rem] pb-[6vh] md:grid md:grid-cols-7 md:px-0 md:pb-[8vh]">
        {skillColumn(0, false)}
        {skillColumn(1, true)}
        <div className="md:col-span-3 md:px-[2vw]">
          <div className="md:sticky md:top-[12vh]">
            <div className="relative mx-auto aspect-[940/690] w-full max-w-[64rem]">
              {pics ? <BarPicture alt="The 82855Z robot" cell={5} className="absolute inset-0" fit="contain" source={pics.projects[3]} /> : null}
            </div>
            <p aria-live="polite" className="mt-[1.6rem] text-center text-[1.4rem] leading-[1.4]">
              {pickedSkill ? (
                <>
                  <span className="font-bold text-white">{pickedSkill.name}</span> · {pickedSkill.group}
                </>
              ) : (
                <>
                  <span className="font-bold text-white">82855Z</span> · the team&rsquo;s VEX V5 robot
                </>
              )}
            </p>
            <div className="mt-[2rem] flex justify-center">
              <button
                aria-controls="b46-skill-list"
                aria-expanded={listOpen}
                className="b46-btn cursor-pointer px-[1.8rem] py-[1rem]"
                onClick={() => setListOpen((o) => !o)}
                style={{ backgroundColor: BLOSSOM, color: BAND }}
                type="button"
              >
                <Caps align="center" className="w-[13rem] text-[2.2rem] leading-[1]">
                  {listOpen ? "Close list ×" : "All skills »"}
                </Caps>
              </button>
            </div>
            {listOpen ? (
              <div className="mt-[3.2rem] grid grid-cols-1 gap-x-[2.4rem] gap-y-[2rem] pt-[2rem] sm:grid-cols-2 lg:grid-cols-3" id="b46-skill-list" style={{ borderTop: LINE }}>
                {skillGroups.map((g) => (
                  <div className="min-w-0" key={g.label}>
                    <h3 className="text-[1.3rem] font-bold uppercase tracking-[0.06em] text-white">{g.label}</h3>
                    <ul className="mt-[0.6rem] text-[1.4rem] leading-[1.5]">
                      {g.skills.map((s) => (
                        <li key={s.name}>{s.name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {skillColumn(2, true)}
        {skillColumn(3, false)}
        {/* On a phone, the logos in one grid under the robot. */}
        <ul className="mt-[4rem] grid grid-cols-5 gap-y-[0.8rem] sm:grid-cols-7 md:hidden">
          {allSkills.map((s) => (
            <li key={s.name}>
              <SkillButton onPick={setPicked} s={s} />
            </li>
          ))}
        </ul>
      </section>

      {/* 4. The projects as chapters. */}
      <section aria-label="Work" style={{ borderTop: LINE }}>
        <ol>
          {projects.map((p, i) => (
            <li key={p.title} style={{ borderBottom: LINE }}>
              <button
                aria-haspopup="dialog"
                className={`b46-row grid w-full cursor-pointer grid-cols-1 gap-[1.6rem] py-[2.4rem] text-left md:grid-cols-7 md:items-center md:gap-0 md:px-0 md:py-[2rem] px-[1.6rem]`}
                onBlur={() => setHover((h) => (h === i ? -1 : h))}
                onClick={() => setOpen(i)}
                onFocus={() => setHover(i)}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? -1 : h))}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                type="button"
              >
                <span className="b46-title block w-[80%] md:col-span-2 md:w-full md:pl-[5.25vw] md:pr-[2vw]">
                  <Caps className="text-[clamp(4rem,3.6vw,7.2rem)] leading-[0.95]">{p.title}</Caps>
                </span>
                <span className="relative block aspect-[4/3] w-full md:col-span-2 md:col-start-3 md:mx-auto md:h-[15rem] md:w-[20rem]">
                  {pics ? <BarPicture alt={p.title} cell={4} className="absolute inset-0" level={hover === i ? 1 : 0.5} source={pics.projects[i]} /> : null}
                </span>
                <span className="block md:col-span-3 md:col-start-5 md:pr-[5.25vw]">
                  <span className="block text-[1.5rem] leading-[1.5]">{p.tagline}</span>
                  <span className="mt-[1rem] flex items-end justify-between gap-[1.6rem]">
                    <span className="text-[1.2rem] font-semibold uppercase leading-[1.4] tracking-[0.08em] opacity-70">
                      {p.year} · {KIND[p.kind]}
                      {p.award ? ` · ${p.award}` : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-[0.8rem] text-white">
                      <Checker />
                      <span className="w-[4.4rem]">
                        <Caps className="text-[2.8rem] leading-[1] tabular-nums">
                          {i + 1}/{projects.length}
                        </Caps>
                      </span>
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* Contact. */}
      <footer className={`grid grid-cols-1 gap-[2.4rem] py-[6vh] md:grid-cols-7 md:gap-0 md:px-0 px-[1.6rem]`}>
        <h2 className="w-[22rem] text-white md:col-span-2 md:w-full md:pl-[5.25vw]">
          <Caps className="text-[clamp(4rem,3.6vw,7.2rem)] leading-[0.95]">Contact</Caps>
        </h2>
        <div className="md:col-span-5 md:col-start-3 md:flex md:items-end md:justify-between md:pr-[5.25vw]">
          <a className="b46-link block break-all text-[2rem] font-bold leading-[1.3] text-white md:text-[2.4rem]" href={`mailto:${EMAIL}`}>
            {EMAIL} ↗
          </a>
          <ul className="mt-[1.6rem] flex flex-wrap gap-x-[2.4rem] gap-y-[0.8rem] text-[1.4rem] font-semibold uppercase tracking-[0.06em] md:mt-0">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className="b46-link whitespace-nowrap" href={l.href} rel="noreferrer" target="_blank">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      </footer>

      {/* The seven columns' lines, over everything and very faint. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block" style={{ opacity: 0.45 }}>
        {[1, 2, 3, 4, 5, 6].map((k) => (
          <span className="absolute bottom-0 top-0 w-[0.1rem]" key={k} style={{ left: `${(k / 7) * 100}%`, backgroundColor: RULE }} />
        ))}
      </div>

      {open >= 0 ? <Detail i={open} onClose={close} source={pics ? pics.projects[open] : null} /> : null}
    </div>
  );
}
