"use client";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { education, experience, projects, skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 39, Ashfall (after ashfall.studio).
 *
 * A small mono label, then one big grey paragraph whose first words are
 * white; its first line starts a quarter of the way in, under a thin rule
 * with a "+" on it. Then "Featured work": the projects as large pictures
 * drawn as bars, one on the right, one on the left, one across the full
 * width. Under each picture sits a two-line caption, "Title: tagline", and
 * on the right up to four outlined tags from its stack. Three show at
 * first; the square "+" button under them shows the other two in place.
 *
 * To keep the page short, the left picture starts halfway down the right
 * one (ashfall stacks them one after the other). Clicking a project opens
 * its detail over the page; Esc or the close button shuts it.
 *
 * Then a strip of skill logos that drifts slowly sideways, like ashfall's
 * client logos, a short list of skills and the contact links.
 *
 * The bar pictures draw on 2D canvases built in the browser only, so they
 * wait for a mounted flag and the server render has empty boxes. Under
 * reduced motion the strip stands still and nothing fades in.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const GREY = "rgba(249, 185, 220, 0.62)";
const LABEL = "font-mono text-[1.3rem] uppercase leading-[1.4] tracking-[0.08em]";
const GUTTER = "px-[1.6rem] md:px-[max(2.2rem,1.4vw)]";
const FIRST = 3;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const firstSentence = (s: string): string => {
  const cut = s.indexOf(". ");
  return cut > 0 ? s.slice(0, cut + 1) : s;
};

const lead = experience[0];
const STATEMENT_BRIGHT = "I build things that sense, move and answer in time:";
const STATEMENT_REST = ` robot controls, embedded hardware and the software round them. ${lead.role} of ${lead.org}; computer engineering at the ${education.school}.`;

const LOGOS = skillGroups.flatMap((g) =>
  g.skills.flatMap((s) => {
    const icon = skillIcon(s.icon);
    return icon ? [{ name: s.name, path: icon.path }] : [];
  }),
);

const CSS = `
.b39-item .b39-cap { transition: color 0.3s ease; }
.b39-item:hover .b39-cap, .b39-item:focus-visible .b39-cap { color: #ffffff; }
.b39-item:focus-visible { outline: 0.1rem solid ${BLOSSOM}; outline-offset: 0.8rem; }
.b39-tag { transition: border-color 0.3s ease; }
.b39-item:hover .b39-tag { border-color: rgba(249, 185, 220, 0.6); }
.b39-link { transition: color 0.2s ease, border-color 0.2s ease; }
.b39-link:hover, .b39-link:focus-visible { color: #ffffff; border-color: rgba(249, 185, 220, 0.6); }
.b39-sq { transition: background-color 0.25s ease, color 0.25s ease; }
.b39-more:hover .b39-sq, .b39-more:focus-visible .b39-sq, .b39-sq:hover, .b39-sq:focus-visible { background-color: ${BLOSSOM}; color: ${BAND}; }
.b39-in { animation: b39-rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.b39-dialog { animation: b39-rise 0.4s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b39-rise { from { opacity: 0; transform: translateY(2.4rem); } to { opacity: 1; transform: none; } }
.b39-track { display: flex; width: max-content; animation: b39-drift 90s linear infinite; }
.b39-strip:hover .b39-track { animation-play-state: paused; }
@keyframes b39-drift { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) {
  .b39-item .b39-cap, .b39-tag, .b39-link, .b39-sq { transition: none; }
  .b39-in, .b39-dialog, .b39-track { animation: none; }
}
`;

/** A thin rule with a small "+" where the second column starts. */
function Cross(): JSX.Element {
  return (
    <div aria-hidden className="relative" style={{ borderTop: LINE }}>
      <span className="absolute left-[25%] top-0 hidden -translate-x-1/2 -translate-y-1/2 font-mono text-[1.4rem] leading-none md:block">+</span>
    </div>
  );
}

function Tags({ items, className = "" }: { items: string[]; className?: string }): JSX.Element {
  return (
    <span className={`flex flex-wrap gap-[0.6rem] ${className}`}>
      {items.map((t) => (
        <span
          className={`${LABEL} b39-tag inline-flex h-[4rem] items-center whitespace-nowrap rounded-[0.2rem] px-[1rem] text-[1.25rem]`}
          key={t}
          style={{ border: LINE }}
        >
          {t}
        </span>
      ))}
    </span>
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
      aria-labelledby="b39-detail-title"
      aria-modal="true"
      className={`fixed inset-0 z-50 overflow-y-auto ${GUTTER} py-[2.2rem]`}
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="b39-dialog mx-auto max-w-[150rem]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-[1.6rem]">
          <p className={LABEL}>
            Featured work · {pad2(i + 1)} / {pad2(projects.length)}
          </p>
          <div className="flex items-center gap-[1.2rem]">
            <span aria-hidden className={`${LABEL} hidden sm:inline`}>
              Close
            </span>
            <button
              aria-label="Close"
              className="b39-sq flex h-[4.2rem] w-[4.2rem] cursor-pointer items-center justify-center rounded-[0.2rem] font-mono text-[2rem] leading-none text-white"
              onClick={onClose}
              ref={closeRef}
              style={{ backgroundColor: "rgba(249, 185, 220, 0.2)" }}
              type="button"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="relative mt-[2rem] aspect-[4/3] w-full overflow-hidden rounded-[0.3rem] md:aspect-[21/9]" style={{ backgroundColor: BAND }}>
          {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" source={source} /> : null}
        </div>

        <div className="mt-[2rem] flex flex-col gap-[1.6rem] md:flex-row md:items-start md:justify-between md:gap-[4rem]">
          <h2
            className="font-sans text-[clamp(2.6rem,2.6vw,4.8rem)] font-medium leading-[1.04] tracking-[-0.035em] md:max-w-[62%]"
            id="b39-detail-title"
            style={{ color: GREY }}
          >
            <span className="text-white">{p.title}:</span> {p.tagline}
          </h2>
          <Tags className="md:max-w-[36%] md:justify-end" items={p.stack} />
        </div>

        <div className="mt-[4rem] grid gap-y-[2.4rem] pb-[4rem] pt-[2.4rem] lg:grid-cols-[25%_1fr]" style={{ borderTop: LINE }}>
          <p className={`${LABEL} opacity-80`}>
            {p.year} · {p.kind}
          </p>
          <div className="min-w-0">
            <ul className="max-w-[88rem] space-y-[1.2rem]">
              {p.bullets.map((b) => (
                <li className="flex gap-[1.2rem] font-sans text-[1.7rem] leading-[1.5]" key={b}>
                  <span aria-hidden className="font-mono opacity-60">
                    +
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            {p.award ? <p className={`${LABEL} mt-[2.4rem] text-white`}>{p.award}</p> : null}
            {p.href || p.code ? (
              <p className="mt-[2.4rem] flex flex-wrap gap-[0.8rem]">
                {p.href ? (
                  <a className={`${LABEL} b39-link inline-flex h-[4rem] items-center rounded-[0.2rem] px-[1.2rem] text-white`} href={p.href} rel="noreferrer" style={{ border: LINE }} target="_blank">
                    Visit ↗
                  </a>
                ) : null}
                {p.code ? (
                  <a className={`${LABEL} b39-link inline-flex h-[4rem] items-center rounded-[0.2rem] px-[1.2rem] text-white`} href={p.code} rel="noreferrer" style={{ border: LINE }} target="_blank">
                    Code ↗
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function B39(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [more, setMore] = useState(false);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);
  const opened = useRef(false);

  useEffect(() => setMounted(true), []);

  // Picture sources, made once in the browser (Saturn's is drawn on a canvas).
  const sources = useMemo(() => (mounted ? projects.map((p) => projectSource(p)) : null), [mounted]);

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to the project that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      itemRefs.current[lastOpen.current]?.focus();
      lastOpen.current = -1;
    }
  }, [open]);

  // After "show more work", focus the first project it showed.
  useEffect(() => {
    if (more && opened.current) itemRefs.current[FIRST]?.focus({ preventScroll: true });
  }, [more]);

  const shown = more ? projects : projects.slice(0, FIRST);

  return (
    <div className="relative w-full font-sans" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Label, rule, statement. */}
      <section className={`${GUTTER} pt-[2.2rem]`}>
        <p className={LABEL}>Robotics, hardware &amp; software · {lead.where}</p>
        <div className="mt-[9vh]">
          <Cross />
        </div>
        <p
          className="pt-[3.6rem] font-medium leading-[1.04] tracking-[-0.045em] md:indent-[25%]"
          style={{ color: GREY, fontSize: "clamp(3rem, 3.6vw, 7.2rem)" }}
        >
          <span className="text-white">{STATEMENT_BRIGHT}</span>
          {STATEMENT_REST}
        </p>
      </section>

      {/* Featured work. */}
      <section aria-labelledby="b39-work" className={`${GUTTER} relative mt-[12vh]`}>
        <h2 className={`${LABEL} mb-[2rem] lg:absolute lg:left-[max(2.2rem,1.4vw)] lg:top-0 lg:mb-0`} id="b39-work">
          Featured work · {projects.length} projects
        </h2>
        <ul>
          {shown.map((p, i) => {
            const place = i % 3; // 0 right, 1 left (starts halfway down the one before), 2 full width
            const wrap =
              place === 0
                ? `lg:ml-auto lg:w-[48%] ${i > 0 ? "mt-[5rem] md:mt-[8rem]" : ""}`
                : place === 1
                  ? "mt-[5rem] md:mt-[8rem] lg:mt-[calc(-12%-8rem)] lg:w-[48%]"
                  : "mt-[5rem] md:mt-[8rem]";
            const aspect = place === 2 ? "aspect-[4/3] md:aspect-[16/9] lg:aspect-[34/10]" : "aspect-[4/3] md:aspect-[16/9] lg:aspect-[2/1]";
            return (
              <li className={`${wrap} ${i >= FIRST ? "b39-in" : ""}`} key={p.title}>
                <button
                  aria-haspopup="dialog"
                  className="b39-item block w-full cursor-pointer text-left"
                  onBlur={() => setHover((h) => (h === i ? -1 : h))}
                  onClick={() => setOpen(i)}
                  onFocus={() => setHover(i)}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? -1 : h))}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                >
                  <span className={`relative block w-full overflow-hidden rounded-[0.3rem] ${aspect}`} style={{ backgroundColor: "rgba(42, 13, 30, 0.5)" }}>
                    {sources ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" level={hover === i ? 1 : 0.8} source={sources[i]} /> : null}
                  </span>
                  <span className="mt-[1.8rem] flex flex-col gap-[1.4rem] md:flex-row md:items-start md:justify-between md:gap-[3rem]">
                    <span
                      className="b39-cap block font-medium leading-[1.04] tracking-[-0.035em] md:max-w-[min(46rem,55%)]"
                      style={{ color: GREY, fontSize: "clamp(2rem, 1.5vw, 3rem)" }}
                    >
                      {p.title}: {firstSentence(p.tagline)}
                    </span>
                    <Tags className="md:justify-end" items={p.stack.slice(0, 4)} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-[7rem] flex justify-center">
          <button
            aria-expanded={more}
            className="b39-more flex cursor-pointer flex-col items-center gap-[2rem]"
            onClick={() => {
              opened.current = true;
              setMore((m) => !m);
            }}
            type="button"
          >
            <span
              aria-hidden
              className="b39-sq flex h-[4.2rem] w-[4.2rem] items-center justify-center rounded-[0.2rem] font-mono text-[1.8rem] leading-none text-white"
              style={{ backgroundColor: "rgba(249, 185, 220, 0.2)" }}
            >
              {more ? "−" : "+"}
            </span>
            <span className={LABEL}>{more ? "Show less work" : "Show more work"}</span>
          </button>
        </div>
      </section>

      {/* The drifting strip of skill logos. */}
      <section aria-label="Tools" className="b39-strip mt-[10vh] overflow-hidden py-[5rem]">
        <ul className="sr-only">
          {LOGOS.map((l) => (
            <li key={l.name}>{l.name}</li>
          ))}
        </ul>
        <div aria-hidden className="b39-track">
          {[0, 1].map((half) => (
            <div className="flex shrink-0 items-center" key={half}>
              {LOGOS.map((l) => (
                <span className="flex shrink-0 items-center gap-[1.2rem] pr-[7rem] opacity-80" key={l.name}>
                  <svg className="h-[3rem] w-[3rem] shrink-0" fill={BLOSSOM} viewBox="0 0 24 24">
                    <path d={l.path} />
                  </svg>
                  <span className="whitespace-nowrap text-[2.6rem] font-medium leading-none tracking-[-0.04em]">{l.name}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Skills. */}
      <section aria-labelledby="b39-skills" className={`${GUTTER} mt-[8vh]`}>
        <h2 className={`${LABEL} mb-[2.4rem]`} id="b39-skills">
          Skills
        </h2>
        <Cross />
        <dl className="pt-[1rem]">
          {skillGroups.map((g, gi) => (
            <div
              className="grid gap-y-[0.6rem] py-[1.2rem] lg:grid-cols-[25%_1fr]"
              key={g.label}
              style={gi > 0 ? { borderTop: LINE } : undefined}
            >
              <dt className={`${LABEL} lg:pt-[0.5rem]`}>{g.label}</dt>
              <dd className="text-[clamp(1.7rem,1.25vw,2.4rem)] font-medium leading-[1.25] tracking-[-0.02em]" style={{ color: GREY }}>
                {g.skills.map((s) => s.name).join(", ")}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Contact. */}
      <section aria-labelledby="b39-contact" className={`${GUTTER} mt-[8vh] pb-[6vh]`}>
        <h2 className={`${LABEL} mb-[2.4rem]`} id="b39-contact">
          Contact
        </h2>
        <Cross />
        <div className="grid gap-y-[2.4rem] pt-[3.6rem] lg:grid-cols-[25%_1fr]">
          <p className={`${LABEL} opacity-80`}>
            {education.degree.split(",")[1]?.trim()}, {education.school}
          </p>
          <div className="min-w-0">
            <a
              className="b39-link font-medium [overflow-wrap:anywhere] leading-[1.04] tracking-[-0.045em] text-white"
              href={`mailto:${EMAIL}`}
              style={{ fontSize: "clamp(2.2rem, 3.6vw, 7.2rem)" }}
            >
              {EMAIL} ↗
            </a>
            <ul className="mt-[3rem] flex flex-wrap gap-[0.8rem]">
              {elsewhere.map((l) => (
                <li key={l.href}>
                  <a
                    className={`${LABEL} b39-link inline-flex h-[4rem] items-center rounded-[0.2rem] px-[1.2rem]`}
                    href={l.href}
                    rel="noreferrer"
                    style={{ border: LINE }}
                    target="_blank"
                  >
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {open >= 0 ? <Detail i={open} onClose={close} source={sources ? sources[open] : null} /> : null}
    </div>
  );
}
