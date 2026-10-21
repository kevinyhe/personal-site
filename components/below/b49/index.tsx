"use client";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { education, experience, type Project, projects, type Skill, skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 49, Works (after pensatori-irrazionali.com).
 *
 * A title line set between two full-width rules: "Work" in the italic
 * serif with a small "(05)" beside it, a bar picture where pensatori has
 * its engraved angel, then "By Kevin He" in huge sans. Under it the five
 * projects in two columns of large sans titles, each on a ruled row with
 * two tiny columns (kind, year), a small mark (the icon of the first
 * thing in its stack) and an arrow at the right. Pointing at a row puts
 * its picture in the title line and lights it in the row of five bar
 * pictures under the list. Clicking a row or a picture opens the project
 * over the page; Esc or Close shuts it.
 *
 * Then a thin band that runs "SEE THE WORK — LET’S TALK —" sideways, and
 * the skills set as pensatori's numbered services: "Number / Service"
 * over a rule, a huge italic numeral spelled out on the left ("One",
 * because the serif cannot draw digits), and on the right "● Languages"
 * over a ruled list of skill against its mark and depth ("5 / 5"), then
 * an "EMAIL ME →" button. Five small buttons under the numeral switch the
 * group, which keeps the page short. The group's one-line blurb sits
 * under it at left, pensatori's "(About it)" paragraph. Contact last.
 *
 * Bar pictures are 2D canvases made in the browser only, after a mounted
 * flag, so the server render has empty boxes. Under reduced motion the
 * band stands still and the numeral swaps without fading.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const TEXT = "font-sans leading-[1.4]";
const TINY = `${TEXT} text-[1.3rem]`;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const KIND: Record<Project["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};
const NUMERALS = ["One", "Two", "Three", "Four", "Five", "Six"];
const MARQUEE = "SEE THE WORK — LET’S TALK — ";

// Every skill by name, so a project's stack item can find its icon.
const SKILLS = new Map<string, Skill>(skillGroups.flatMap((g) => g.skills.map((s) => [s.name, s] as const)));

/** The first stack item with an icon, or the first with a mark. */
function projectMark(p: Project): { icon: ReturnType<typeof skillIcon>; mark?: string; name: string } {
  for (const name of p.stack) {
    const icon = skillIcon(SKILLS.get(name)?.icon);
    if (icon) return { icon, name };
  }
  const withMark = p.stack.map((n) => SKILLS.get(n)).find((s) => s?.mark);
  return { icon: null, mark: withMark?.mark, name: withMark?.name ?? p.stack[0] };
}

const CSS = `
.b49-row .b49-title { transition: color 0.3s ease, transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1); display: inline-block; }
.b49-row[data-on="true"] .b49-title { color: #ffffff; transform: translateX(0.8rem); }
.b49-row .b49-arrow { transition: transform 0.3s ease; display: inline-block; }
.b49-row[data-on="true"] .b49-arrow { transform: translateX(0.4rem); color: #ffffff; }
.b49-link { transition: color 0.2s ease; }
.b49-link:hover, .b49-link:focus-visible { color: #ffffff; }
.b49-btn { transition: background-color 0.2s ease, color 0.2s ease; }
.b49-btn:hover, .b49-btn:focus-visible { background-color: #ffffff; }
.b49-track { display: flex; width: max-content; animation: b49-run 28s linear infinite; }
.b49-band:hover .b49-track { animation-play-state: paused; }
@keyframes b49-run { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.b49-fade { animation: b49-in 0.45s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b49-in { from { opacity: 0; transform: translateY(1.2rem); } to { opacity: 1; transform: none; } }
.b49-dialog { animation: b49-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@media (prefers-reduced-motion: reduce) {
  .b49-row .b49-title, .b49-row .b49-arrow, .b49-link, .b49-btn { transition: none; }
  .b49-row[data-on="true"] .b49-title, .b49-row[data-on="true"] .b49-arrow { transform: none; }
  .b49-track { animation: none; }
  .b49-fade, .b49-dialog { animation: none; }
}
`;

/** A 24x24 simple-icons glyph drawn in the text colour. */
function Glyph({ path, size, title }: { path: string; size: string; title: string }): JSX.Element {
  return (
    <svg aria-label={title} className="shrink-0" role="img" style={{ width: size, height: size }} viewBox="0 0 24 24">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/** pensatori's "+ (Websites)" label. */
function Plus({ children }: { children: string }): JSX.Element {
  return (
    <p className={`${TEXT} flex items-center gap-[0.8rem] text-[1.5rem]`}>
      <span aria-hidden className="font-light">
        +
      </span>
      <span>({children})</span>
    </p>
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
    window.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b49-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[6vh] md:px-[4vw]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="b49-dialog mx-auto max-w-[140rem]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-[1.6rem] pb-[1.2rem]" style={{ borderBottom: LINE }}>
          <Plus>{`Work ${pad2(i + 1)} of ${pad2(projects.length)}`}</Plus>
          <button className={`${TINY} b49-btn cursor-pointer px-[1.6rem] py-[0.8rem] uppercase tracking-[0.04em]`} onClick={onClose} ref={closeRef} style={{ backgroundColor: BLOSSOM, color: BAND }} type="button">
            Close ✕
          </button>
        </div>
        <div className="mt-[3.2rem] grid gap-x-[4vw] gap-y-[3.2rem] lg:grid-cols-[1.15fr_1fr]">
          <div className="relative aspect-[4/3] w-full">
            {source ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className="min-w-0">
            <p className={`${TINY} opacity-70`}>
              ({KIND[p.kind]}) &nbsp; {p.year}
            </p>
            <h2 className="mt-[0.8rem] font-sans text-[clamp(3.6rem,4vw,7.2rem)] font-normal leading-[1] tracking-[-0.04em] text-white" id="b49-detail-title">
              {p.title}
            </h2>
            <p className="mt-[1.6rem] font-sans text-[1.9rem] leading-[1.4] tracking-[-0.01em]">{p.tagline}</p>
            <ul className="mt-[2.4rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className="py-[1.2rem] font-sans text-[1.5rem] leading-[1.5]" key={b} style={{ borderBottom: LINE }}>
                  {b}
                </li>
              ))}
            </ul>
            <dl className="mt-[2.4rem]" style={{ borderTop: LINE }}>
              <div className="flex justify-between gap-[2rem] py-[0.9rem]" style={{ borderBottom: LINE }}>
                <dt className={TINY}>Stack</dt>
                <dd className={`${TINY} text-right text-white`}>{p.stack.join(", ")}</dd>
              </div>
              {p.award ? (
                <div className="flex justify-between gap-[2rem] py-[0.9rem]" style={{ borderBottom: LINE }}>
                  <dt className={TINY}>Award</dt>
                  <dd className={`${TINY} text-right text-white`}>{p.award}</dd>
                </div>
              ) : null}
            </dl>
            {p.href || p.code ? (
              <div className="mt-[2.4rem] flex flex-wrap gap-[1rem]">
                {p.href ? (
                  <a className={`${TINY} b49-btn px-[1.6rem] py-[0.8rem] uppercase tracking-[0.04em]`} href={p.href} rel="noreferrer" style={{ backgroundColor: BLOSSOM, color: BAND }} target="_blank">
                    {hostOf(p.href)} ↗
                  </a>
                ) : null}
                {p.code ? (
                  <a className={`${TINY} b49-btn px-[1.6rem] py-[0.8rem] uppercase tracking-[0.04em]`} href={p.code} rel="noreferrer" style={{ backgroundColor: BLOSSOM, color: BAND }} target="_blank">
                    Code ↗
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One ruled project row: large title, two tiny columns, a mark, an arrow. */
function Row({
  i,
  on,
  onOpen,
  onEnter,
  onLeave,
  setRef,
}: {
  i: number;
  on: boolean;
  onOpen: () => void;
  onEnter: () => void;
  onLeave: () => void;
  setRef: (el: HTMLButtonElement | null) => void;
}): JSX.Element {
  const p = projects[i];
  const m = projectMark(p);
  return (
    <li className="b49-row" data-on={on} style={{ borderBottom: LINE }}>
      <button
        aria-haspopup="dialog"
        className="grid w-full cursor-pointer grid-cols-[1fr_auto_2.4rem_1.6rem] items-center gap-x-[1.6rem] py-[0.9rem] text-left sm:grid-cols-[1fr_10rem_7.6rem_4.4rem_1.6rem]"
        onBlur={onLeave}
        onClick={onOpen}
        onFocus={onEnter}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        ref={setRef}
        type="button"
      >
        <span className="min-w-0 font-sans text-[clamp(3rem,2.9vw,6rem)] font-normal leading-[1.02] tracking-[-0.045em]">
          <span className="b49-title">{p.title}</span>
        </span>
        <span className={`${TINY} hidden opacity-80 sm:block`}>({KIND[p.kind]})</span>
        <span className={`${TINY} whitespace-nowrap text-right tabular-nums opacity-80 sm:text-left`}>{p.year}</span>
        <span className="flex justify-end">
          {m.icon ? (
            <Glyph path={m.icon.path} size="clamp(2rem, 2.2vw, 3.6rem)" title={m.name} />
          ) : (
            <span className="font-mono text-[1.3rem] font-bold">{m.mark ?? ""}</span>
          )}
        </span>
        <span aria-hidden className={`${TINY} b49-arrow text-right`}>
          →
        </span>
      </button>
    </li>
  );
}

export default function B49(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState(-1);
  const [last, setLast] = useState(0);
  const [open, setOpen] = useState(-1);
  const [group, setGroup] = useState(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  useEffect(() => setMounted(true), []);

  // Bar picture sources, made once in the browser.
  const pics = useMemo(() => (mounted ? projects.map((p) => projectSource(p)) : null), [mounted]);

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

  const enter = (i: number) => (): void => {
    setHover(i);
    setLast(i);
  };
  const leave = (i: number) => (): void => setHover((h) => (h === i ? -1 : h));

  const shown = hover >= 0 ? hover : last;
  const half = Math.ceil(projects.length / 2);
  const columns = [projects.slice(0, half).map((_, k) => k), projects.slice(half).map((_, k) => k + half)];
  const g = skillGroups[group];
  const intro = experience[0];

  return (
    <div className="relative w-full overflow-hidden font-sans" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* The title line, between two full-width rules. */}
      <div className="pt-[8vh]">
        <div className="relative grid grid-cols-1 items-center gap-x-[3vw] px-[1.6rem] md:grid-cols-[auto_16vw_1fr] md:px-[3vw]" style={{ borderTop: LINE, borderBottom: LINE }}>
          <h2 className="flex items-start gap-[0.6rem] text-white">
            <span className="font-serif-display pb-[0.1em] text-[clamp(8rem,10vw,19rem)] italic leading-[1] tracking-[-0.02em]">Work</span>
            <span className="mt-[1.2em] font-sans text-[1.8rem] font-light italic opacity-80">({pad2(projects.length)})</span>
          </h2>
          <div aria-hidden className="relative my-[-4vw] hidden aspect-square w-full md:block">
            {pics ? <BarPicture cell={5} className="absolute inset-0" fit="contain" source={pics[shown]} /> : null}
          </div>
          <p className="whitespace-nowrap pb-[1.6rem] font-sans text-[clamp(5.6rem,7.4vw,14.4rem)] font-normal leading-[1] tracking-[-0.055em] text-white md:pb-0">By Kevin He</p>
        </div>
      </div>

      <div className="mx-auto px-[1.6rem] md:px-[3vw]">
        {/* Two columns of ruled project rows. */}
        <div className="mt-[9vh] grid grid-cols-1 gap-x-[2.4rem] lg:grid-cols-2">
          {columns.map((col, c) => (
            <ul className={c === 1 ? "lg:border-t-[0.1rem]" : ""} key={c} style={{ borderTop: c === 0 ? LINE : undefined, borderColor: RULE }}>
              {col.map((i) => (
                <Row
                  i={i}
                  key={projects[i].title}
                  on={hover === i}
                  onEnter={enter(i)}
                  onLeave={leave(i)}
                  onOpen={() => setOpen(i)}
                  setRef={(el) => {
                    rowRefs.current[i] = el;
                  }}
                />
              ))}
            </ul>
          ))}
        </div>

        {/* The row of pictures: the one being pointed at is lit. */}
        <div className="mt-[4.8rem] grid grid-cols-3 gap-[1rem] sm:grid-cols-5">
          {projects.map((p, i) => (
            <button
              aria-haspopup="dialog"
              aria-label={`${p.title}, open`}
              className="relative block aspect-[4/3] w-full cursor-pointer"
              key={p.title}
              onBlur={leave(i)}
              onClick={() => setOpen(i)}
              onFocus={enter(i)}
              onPointerEnter={enter(i)}
              onPointerLeave={leave(i)}
              style={{ backgroundColor: "rgba(42, 13, 30, 0.55)" }}
              type="button"
            >
              {pics ? <BarPicture alt={p.title} cell={5} className="absolute inset-0" level={shown === i ? 1 : 0.4} source={pics[i]} /> : null}
            </button>
          ))}
        </div>
      </div>

      {/* The band. */}
      <a aria-label={`Email ${EMAIL}`} className="b49-band mt-[9vh] block overflow-hidden py-[0.7rem]" href={`mailto:${EMAIL}`} style={{ backgroundColor: BAND, borderTop: LINE, borderBottom: LINE }}>
        <span aria-hidden className="b49-track">
          {[0, 1].map((k) => (
            <span className="flex shrink-0" key={k}>
              {Array.from({ length: 6 }, (_, n) => (
                <span className="whitespace-pre font-sans text-[1.6rem] uppercase leading-[1.4] tracking-[0.01em]" key={n} style={{ color: BLOSSOM, textShadow: "0 0 0.8rem rgba(249, 185, 220, 0.55)" }}>
                  {MARQUEE}
                </span>
              ))}
            </span>
          ))}
        </span>
      </a>

      {/* The skills as numbered services. */}
      <section className="px-[1.6rem] pt-[10vh] md:px-[3vw]" id="skills">
        <div className={`${TEXT} grid grid-cols-2 pb-[1rem] text-[1.5rem]`} style={{ borderBottom: LINE }}>
          <span>Number</span>
          <span>Service</span>
        </div>

        <div className="mt-[7vh] grid grid-cols-1 gap-x-[3vw] gap-y-[4rem] md:grid-cols-2">
          <div className="min-w-0">
            <p aria-hidden className="b49-fade font-serif-display pb-[0.1em] text-[clamp(9rem,11vw,21rem)] italic leading-[0.9] tracking-[-0.02em] text-white" key={group}>
              {NUMERALS[group]}
            </p>
            <div aria-label="Skill groups" className="mt-[3.2rem] flex flex-wrap gap-[0.6rem]" role="tablist">
              {skillGroups.map((sg, k) => (
                <button
                  aria-controls="b49-service"
                  aria-selected={group === k}
                  className={`${TINY} cursor-pointer px-[1.2rem] py-[0.5rem] tabular-nums`}
                  key={sg.label}
                  onClick={() => setGroup(k)}
                  role="tab"
                  style={{
                    border: LINE,
                    backgroundColor: group === k ? BLOSSOM : "transparent",
                    color: group === k ? BAND : BLOSSOM,
                  }}
                  title={sg.label}
                  type="button"
                >
                  {pad2(k + 1)}
                </button>
              ))}
            </div>
          </div>

          <div className="b49-fade min-w-0" id="b49-service" key={group} role="tabpanel">
            <Plus>{`Skills ${pad2(group + 1)} of ${pad2(skillGroups.length)}`}</Plus>
            <h3 className="mt-[2.4rem] flex items-center gap-[1rem] font-sans text-[clamp(2.8rem,2vw,3.6rem)] font-normal leading-[1.1] tracking-[-0.03em] text-white">
              <span aria-hidden className="inline-block h-[0.6em] w-[0.6em] shrink-0 rounded-full" style={{ backgroundColor: BLOSSOM, boxShadow: "0 0 1.2rem rgba(249, 185, 220, 0.6)" }} />
              {g.label}
            </h3>
            <ul className="mt-[2.4rem]" style={{ borderTop: LINE }}>
              {g.skills.map((s) => {
                const icon = skillIcon(s.icon);
                return (
                  <li className="flex items-center justify-between gap-[2rem] py-[0.7rem]" key={s.name} style={{ borderBottom: LINE }}>
                    <span className="font-sans text-[1.6rem] leading-[1.35]">{s.name}</span>
                    <span className="flex items-center gap-[1.2rem] font-sans text-[1.6rem] leading-[1.35] opacity-90">
                      {icon ? <Glyph path={icon.path} size="1.5rem" title={icon.title} /> : <span className="font-mono text-[1.2rem] font-bold">{s.mark}</span>}
                      <span className="tabular-nums">{s.depth} / 5</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <a className={`${TEXT} b49-btn mt-[2.4rem] inline-block px-[3.2rem] py-[0.8rem] text-[1.2rem] uppercase tracking-[0.02em]`} href={`mailto:${EMAIL}`} style={{ backgroundColor: BLOSSOM, color: BAND }}>
              Email me →
            </a>
          </div>
        </div>

        {/* The group's one line, pensatori's "(About it)" paragraph. */}
        <div className="b49-fade mt-[7vh] max-w-[64rem]" key={`about-${group}`}>
          <Plus>In short</Plus>
          <p className="mt-[1.6rem] font-sans text-[clamp(2.4rem,1.9vw,3.4rem)] leading-[1.08] tracking-[-0.045em] text-white">{g.blurb}</p>
        </div>
      </section>

      {/* Contact. */}
      <footer className="mt-[10vh] px-[1.6rem] pb-[6vh] md:px-[3vw]" id="contact">
        <div className={`${TEXT} grid grid-cols-2 pb-[1rem] text-[1.5rem]`} style={{ borderBottom: LINE }}>
          <span>Contact</span>
          <span>Elsewhere</span>
        </div>
        <div className="mt-[3.2rem] grid grid-cols-1 gap-x-[3vw] gap-y-[3.2rem] md:grid-cols-2">
          <div className="min-w-0">
            <a className="b49-link block break-all font-sans text-[clamp(2.6rem,2.6vw,5rem)] leading-[1.05] tracking-[-0.04em] text-white" href={`mailto:${EMAIL}`}>
              {EMAIL} ↗
            </a>
            <p className={`${TINY} mt-[1.6rem] opacity-80`}>
              {intro.role}, {intro.org}. {education.degree}, {education.school}.
            </p>
          </div>
          <ul style={{ borderTop: LINE }}>
            {elsewhere.map((l) => (
              <li key={l.href} style={{ borderBottom: LINE }}>
                <a className="b49-link flex items-center justify-between gap-[2rem] py-[0.7rem] font-sans text-[1.6rem] leading-[1.35]" href={l.href} rel="noreferrer" target="_blank">
                  <span>{l.label}</span>
                  <span className="opacity-80">{l.handle} ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </footer>

      {open >= 0 ? <Detail i={open} onClose={close} source={pics ? pics[open] : null} /> : null}
    </div>
  );
}
