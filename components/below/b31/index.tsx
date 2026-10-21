"use client";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource, textPlate } from "@/components/below/barPicture";
import { awards, education, experience, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 31, Sheet. After elliott.mangham.dev and wodniack.dev.
 *
 * One screen set like a technical data sheet: a grid of cells split by
 * thin rules, everything in small uppercase mono under "● LABEL" heads.
 * Across the top: Intro, Skills, Recognition, Links. In the middle, one
 * line of large sans between two cells filled with bars (the site's
 * pictures drawn as vertical bars, standing in for wodniack's hatching).
 * Along the bottom: the five projects as a strip of equal bar pictures.
 * Pointing at one brightens it; clicking opens its detail over the page.
 * Two tabs above the strip swap it for a row of award cells.
 *
 * The bar pictures draw on 2D canvases built in the browser only, so they
 * wait for a mounted flag and the server render has empty boxes.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const LABEL = "font-mono text-[1.2rem] uppercase tracking-[0.16em]";
const SMALL = "font-mono text-[1.2rem] uppercase leading-[1.55] tracking-[0.06em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const MONO_FONT = "500 {size}px ui-monospace, SFMono-Regular, Menlo, monospace";

// The two records from the VEX team's entry in experience, kept beside the awards.
const vex = experience.find((e) => e.org.includes("VEX"));
const RECORDS = vex
  ? [
      { title: "World-record VEX autonomous", year: "82855Z" },
      { title: "80th of ~20,000, global Skills", year: "82855Z" },
    ]
  : [];
const RECOGNITION = [...awards, ...RECORDS];

const CSS = `
.b31-cap { transition: color 0.3s ease, opacity 0.3s ease; }
.b31-thumb:hover .b31-cap, .b31-thumb:focus-visible .b31-cap { color: #ffffff; opacity: 1; }
.b31-link { text-decoration: none; }
.b31-link:hover, .b31-link:focus-visible { color: #ffffff; text-decoration: underline; text-underline-offset: 0.3em; }
.b31-dialog { animation: b31-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b31-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b31-cap { transition: none; }
  .b31-dialog { animation: none; }
}
`;

/** "● INTRO" and so on. */
function Head({ children }: { children: string }): JSX.Element {
  return (
    <h3 className={`${LABEL} mb-[1.4rem] flex items-center gap-[0.8rem] text-white`}>
      <span aria-hidden className="inline-block h-[0.6rem] w-[0.6rem] rounded-full" style={{ backgroundColor: BLOSSOM }} />
      {children}
    </h3>
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
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      aria-labelledby="b31-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[4vw] py-[6vh]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.92)", color: BLOSSOM }}
    >
      <div className="b31-dialog mx-auto max-w-[140rem]" onClick={(e) => e.stopPropagation()} style={{ border: LINE }}>
        <div className="flex items-center justify-between px-[2rem] py-[1.2rem]" style={{ borderBottom: LINE }}>
          <p className={LABEL}>
            ● Project {pad2(i + 1)} / {pad2(projects.length)}
          </p>
          <button className={`${LABEL} b31-link cursor-pointer px-[0.4rem] py-[0.4rem]`} onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>
        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="relative aspect-[4/3] w-full lg:aspect-auto lg:min-h-[52rem]" style={{ borderBottom: LINE }}>
            {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className="px-[2rem] py-[2.4rem] lg:border-l" style={{ borderColor: RULE }}>
            <p className={`${SMALL} opacity-70`}>
              {p.year} · {p.kind}
            </p>
            <h2 className="mt-[0.8rem] font-sans text-[clamp(3.2rem,3.4vw,5.6rem)] font-light leading-[1.05] tracking-[-0.02em] text-white" id="b31-detail-title">
              {p.title}
            </h2>
            <p className="mt-[1.4rem] font-sans text-[1.8rem] font-light leading-[1.45]">{p.tagline}</p>
            <ul className="mt-[2rem] space-y-[1rem]" style={{ borderTop: LINE, paddingTop: "1.6rem" }}>
              {p.bullets.map((b) => (
                <li className="flex gap-[1rem] font-sans text-[1.5rem] leading-[1.5]" key={b}>
                  <span aria-hidden className="mt-[0.8rem] h-[0.5rem] w-[0.5rem] shrink-0 rounded-full" style={{ backgroundColor: BLOSSOM }} />
                  {b}
                </li>
              ))}
            </ul>
            <dl className="mt-[2rem] grid grid-cols-[9rem_1fr] gap-y-[0.8rem]" style={{ borderTop: LINE, paddingTop: "1.6rem" }}>
              <dt className={`${SMALL} opacity-60`}>Stack</dt>
              <dd className={`${SMALL} text-white`}>{p.stack.join(", ")}</dd>
              {p.award ? (
                <>
                  <dt className={`${SMALL} opacity-60`}>Award</dt>
                  <dd className={`${SMALL} text-white`}>{p.award}</dd>
                </>
              ) : null}
              {p.href || p.code ? (
                <>
                  <dt className={`${SMALL} opacity-60`}>Links</dt>
                  <dd className={`${SMALL} flex flex-wrap gap-x-[2rem] gap-y-[0.4rem]`}>
                    {p.href ? (
                      <a className="b31-link text-white" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b31-link text-white" href={p.code} rel="noreferrer" target="_blank">
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

export default function B31(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"projects" | "awards">("projects");
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  useEffect(() => setMounted(true), []);

  // Canvases and image paths for the bar pictures, made once in the browser.
  const pics = useMemo(() => {
    if (!mounted) return null;
    return {
      projects: projects.map((p) => projectSource(p)),
      left: textPlate("82855Z", { width: 900, height: 900, font: MONO_FONT }),
      awards: awards.map((a) => textPlate(a.year, { width: 900, height: 500, font: MONO_FONT })),
    };
  }, [mounted]);

  const close = useCallback(() => {
    setOpen(-1);
  }, []);

  // Give focus back to the thumbnail that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      thumbRefs.current[lastOpen.current]?.focus();
      lastOpen.current = -1;
    }
  }, [open]);

  const intro = experience[0];

  return (
    <div className="relative w-full" id="work" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="flex min-h-[100vh] flex-col" style={{ borderTop: LINE }}>
        {/* The top row: four columns of facts. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.7fr_1.2fr_0.9fr]">
          <section className="px-[2rem] py-[2rem]" style={{ borderBottom: LINE, borderRight: LINE }}>
            <Head>Intro</Head>
            <p className="font-mono text-[1.3rem] uppercase leading-[1.5] tracking-[0.06em] text-white">Kevin He</p>
            <p className={`${SMALL} mt-[0.6rem]`}>
              {education.degree.split(",").slice(0, 2).join(",")}, {education.school}.
            </p>
            <p className={`${SMALL} mt-[0.6rem]`}>
              {intro.role}, {intro.org}. {intro.where}.
            </p>
          </section>
          <section className="px-[2rem] py-[2rem]" id="skills" style={{ borderBottom: LINE, borderRight: LINE }}>
            <Head>Skills</Head>
            <dl className="grid grid-cols-[minmax(10rem,13rem)_1fr] gap-x-[1.4rem] gap-y-[0.8rem]">
              {skillGroups.map((g) => (
                <div className="contents" key={g.label}>
                  <dt className={`${SMALL} text-white`}>{g.label}</dt>
                  <dd className={`${SMALL} opacity-80`}>{g.skills.map((s) => s.name).join(", ")}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="px-[2rem] py-[2rem]" style={{ borderBottom: LINE, borderRight: LINE }}>
            <Head>Recognition</Head>
            <ul className="space-y-[0.5rem]">
              {RECOGNITION.map((a) => (
                <li className={`${SMALL} flex justify-between gap-[1.6rem]`} key={a.title}>
                  <span>{a.title}</span>
                  <span className="shrink-0 tabular-nums opacity-60">{a.year}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="px-[2rem] py-[2rem]" id="contact" style={{ borderBottom: LINE }}>
            <Head>Links</Head>
            <a className={`${SMALL} b31-link block normal-case text-white`} href={`mailto:${EMAIL}`}>
              {EMAIL}
            </a>
            <ul className="mt-[1rem] space-y-[0.5rem]">
              {elsewhere.map((l) => (
                <li key={l.href}>
                  <a className={`${SMALL} b31-link flex justify-between gap-[1.6rem]`} href={l.href} rel="noreferrer" target="_blank">
                    <span>{l.label}</span>
                    <span className="normal-case opacity-70">{l.handle} ↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* The middle: one statement between two bar-filled cells. */}
        <div className="grid flex-1 grid-cols-1 md:grid-cols-[1fr_3.4fr_1fr]" style={{ borderBottom: LINE }}>
          <div aria-hidden className="relative hidden min-h-[18rem] md:block" style={{ borderRight: LINE }}>
            {pics ? <BarPicture cell={6} className="absolute inset-0" fit="contain" level={0.7} source={pics.left} /> : null}
          </div>
          <div className="flex flex-col justify-center px-[2rem] py-[5vh]">
            <p className={`${LABEL} mb-[2rem] opacity-60`}>● Statement</p>
            <p className="font-sans text-[clamp(3.2rem,4.4vw,8.4rem)] font-light leading-[1.02] tracking-[-0.03em] text-white">
              I build systems that bring ideas to life: robots, hardware and the software that runs them.
            </p>
          </div>
          <div aria-hidden className="relative hidden min-h-[18rem] md:block" style={{ borderLeft: LINE }}>
            {pics ? <BarPicture cell={6} className="absolute inset-0" level={0.7} source={pics.projects[3]} /> : null}
          </div>
        </div>

        {/* Tabs, then the strip. */}
        <div className="flex items-center justify-between px-[2rem] py-[1.2rem]" style={{ borderBottom: LINE }}>
          <p className={`${LABEL} hidden opacity-60 sm:block`}>● Index</p>
          <div className="flex gap-[0.6rem]" role="tablist">
            {(["projects", "awards"] as const).map((t) => (
              <button
                aria-controls="b31-strip"
                aria-selected={tab === t}
                className={`${LABEL} cursor-pointer px-[1.2rem] py-[0.6rem]`}
                key={t}
                onClick={() => setTab(t)}
                role="tab"
                style={{
                  border: LINE,
                  backgroundColor: tab === t ? BLOSSOM : "transparent",
                  color: tab === t ? "#2a0d1e" : BLOSSOM,
                }}
                type="button"
              >
                {t} {pad2(t === "projects" ? projects.length : awards.length)}
              </button>
            ))}
          </div>
          <p className={`${LABEL} hidden opacity-60 sm:block`}>{tab === "projects" ? "Click to open" : "2025–2026"}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" id="b31-strip" role="tabpanel">
          {tab === "projects"
            ? projects.map((p, i) => (
                <button
                  aria-haspopup="dialog"
                  className="b31-thumb block cursor-pointer text-left"
                  key={p.title}
                  onBlur={() => setHover((h) => (h === i ? -1 : h))}
                  onClick={() => setOpen(i)}
                  onFocus={() => setHover(i)}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? -1 : h))}
                  ref={(el) => {
                    thumbRefs.current[i] = el;
                  }}
                  style={{ borderRight: LINE, borderBottom: LINE }}
                  type="button"
                >
                  <span className="relative block aspect-[16/10] w-full">
                    {pics ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" level={hover === i ? 1 : 0.55} source={pics.projects[i]} /> : null}
                  </span>
                  <span className={`${SMALL} b31-cap flex justify-between gap-[1rem] px-[1.2rem] py-[1rem] opacity-80`} style={{ borderTop: LINE }}>
                    <span className="min-w-0">
                      <span className="tabular-nums opacity-60">{pad2(i + 1)}</span> {p.title}
                    </span>
                    <span className="shrink-0 tabular-nums">{p.year}</span>
                  </span>
                </button>
              ))
            : awards.map((a, i) => (
                <div className="flex flex-col" key={a.title} style={{ borderRight: LINE, borderBottom: LINE }}>
                  <div className="relative aspect-[16/10] w-full">
                    {pics ? <BarPicture cell={6} className="absolute inset-0" fit="contain" level={0.45} source={pics.awards[i]} /> : null}
                    <p className="absolute bottom-[1.2rem] left-[1.2rem] right-[1.2rem] font-sans text-[clamp(1.8rem,1.4vw,2.4rem)] leading-[1.15] text-white">
                      <span className="px-[0.4rem] py-[0.2rem] [box-decoration-break:clone]" style={{ backgroundColor: "rgba(42, 13, 30, 0.85)" }}>
                        {a.title}
                      </span>
                    </p>
                  </div>
                  <p className={`${SMALL} flex justify-between gap-[1rem] px-[1.2rem] py-[1rem] opacity-80`} style={{ borderTop: LINE }}>
                    <span className="tabular-nums opacity-60">{pad2(i + 1)}</span>
                    <span className="tabular-nums">{a.year}</span>
                  </p>
                </div>
              ))}
        </div>
      </div>

      {open >= 0 ? <Detail i={open} onClose={close} source={pics ? pics.projects[open] : null} /> : null}
    </div>
  );
}
