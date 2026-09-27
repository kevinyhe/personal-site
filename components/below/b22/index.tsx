"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { project, SIDES, SKILLS_POSE, TAB_H, tabletAt } from "./path";
import { type Mode as SceneMode, startWalk } from "./walk";

/**
 * Design 22, Gates. A path through a tunnel of torii set close together,
 * as at Fushimi Inari, curving gently so the far end is never in view.
 * Every gate is built in three.js from posts and beams and the whole
 * scene is put through the bar shader the way the band above is: dark
 * posts are plum, the daylight between them is blossom.
 *
 * Scroll walks the path. Five times the tunnel opens into a small
 * clearing with a larger gate across its far side; that gate's plaque
 * carries a project's name, and the project stands beside it. Between
 * clearings the gates go by quickly and the head sways as walking does.
 * Then a wide clearing where 42 votive tablets hang on a rack, one per
 * skill, and last the tunnel ends on a terrace over the hills, with the
 * email over the sky.
 *
 * Layouts:
 *   journey  the pinned walk, with the words laid over it.
 *   still    one frame down the tunnel, then the words as plain blocks.
 *            For reduced motion and for narrow or upright screens.
 *   plain    the words alone. What the server sends, and what stays if
 *            WebGL cannot start.
 */

type Mode = "boot" | "plain" | SceneMode;

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif is a demo cut that draws a flower for digits and some marks. */
const serifSafe = (t: string): boolean => !/[0-9'"$&@\-!()*+/=#%]/.test(t);

/**
 * How the pinned stage is shared out, in screens of scroll. The work
 * section runs 0 to 6.6, the skills section overlaps its last screen and
 * runs 5.6 to 8.5, the contact section 7.5 to 10. Each one's words sit in
 * a sticky layer, so they stay put for the whole stretch where they show.
 */
const WORK_H = 6.6;
const SKILLS_H = 2.9;
const CONTACT_H = 2.5;

function webglWorks(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function Title({ p }: { p: Project }): JSX.Element {
  return serifSafe(p.title) ? (
    <h3 className="font-serif-display text-[8.4rem] font-normal italic leading-[1.02] text-white">{p.title}</h3>
  ) : (
    <h3 className="font-sans text-[7.2rem] font-light leading-[1.05] tracking-[-0.03em] text-white">{p.title}</h3>
  );
}

function ProjectText({ p, i }: { p: Project; i: number }): JSX.Element {
  return (
    <>
      <p className="font-mono text-[1.4rem] uppercase tabular-nums tracking-[0.16em]">
        {`Gate ${pad2(i + 1)} / ${pad2(projects.length)}`}
        <span className="ml-[1.6rem] opacity-70">{p.year}</span>
      </p>
      <div className="mt-[1.6rem]">
        <Title p={p} />
      </div>
      <p className="mt-[2rem] max-w-[62rem] font-sans text-[2.2rem] font-light leading-[1.45]">{p.tagline}</p>
      <p className="mt-[2rem] font-mono text-[1.4rem] uppercase leading-[1.7] tracking-[0.12em] text-white">{p.stack.join("  ·  ")}</p>
      {p.award ? <p className="mt-[0.8rem] font-mono text-[1.4rem] leading-[1.6]">{p.award}</p> : null}
      {p.href ? (
        <a
          className="mt-[0.8rem] inline-block font-mono text-[1.4rem] leading-[1.6] underline underline-offset-[0.35em]"
          href={p.href}
          rel="noreferrer"
          target="_blank"
        >
          {hostOf(p.href)}
        </a>
      ) : null}
    </>
  );
}

function Links({ className, tone }: { className: string; tone: string }): JSX.Element {
  return (
    <ul className={`font-mono text-[1.6rem] ${className}`}>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.3rem] uppercase tracking-[0.2em] opacity-70">{l.label}</span>
            <span className={`mt-[0.4rem] block underline-offset-[0.35em] group-hover:underline ${tone}`}>{l.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Where the labels sit before the scene first moves them: the rack seen from the skills stop. */
const nameAt = (row: number, col: number) => {
  const t = tabletAt(row, col);
  return project(SKILLS_POSE, { x: t.x, y: t.y - TAB_H / 2 - 0.03, z: t.z }, 1.85);
};
const rowAt = (row: number) => project(SKILLS_POSE, tabletAt(row, 0), 1.85);

function Journey(): JSX.Element {
  let n = 0;
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-bars />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[50vw]"
          data-scrim="left"
          style={{ opacity: 0, background: "linear-gradient(90deg, rgba(26, 8, 18, 0.82) 0%, rgba(26, 8, 18, 0.55) 60%, rgba(26, 8, 18, 0) 100%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-[50vw]"
          data-scrim="right"
          style={{ opacity: 0, background: "linear-gradient(270deg, rgba(26, 8, 18, 0.82) 0%, rgba(26, 8, 18, 0.55) 60%, rgba(26, 8, 18, 0) 100%)" }}
        />
        {/* Behind the group names while the rack is up; narrow, so the tablets keep their light. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[27vw]"
          data-scrim="groups"
          style={{ opacity: 0, background: "linear-gradient(90deg, rgba(26, 8, 18, 0.85) 0%, rgba(26, 8, 18, 0.7) 70%, rgba(26, 8, 18, 0) 100%)" }}
        />
        <p className={`absolute bottom-[4vh] left-1/2 -translate-x-1/2 whitespace-nowrap ${LABEL}`} data-hint style={{ opacity: 0.75 }}>
          Scroll to walk through the gates. The cursor turns your head.
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${WORK_H})` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-70 ${LABEL}`}>Work</h2>
          {projects.map((p, i) => (
            <article
              className="absolute top-1/2 w-[34vw]"
              data-card={i}
              key={p.title}
              style={{ left: SIDES[i] > 0 ? "59vw" : "7vw", opacity: 0, transform: "translateY(-50%)", pointerEvents: "none" }}
            >
              <ProjectText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section
        className="pointer-events-none relative z-10"
        id="skills"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${SKILLS_H})`, scrollMarginTop: `calc(${SCREEN} * -1.2)` }}
      >
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-70 ${LABEL}`}>Skills</h2>
          {skillGroups.map((g, r) => (
            <div key={g.label}>
              <h3
                className="absolute left-[4.5vw] w-[18vw] -translate-y-1/2 font-serif-display text-[3.4rem] font-normal italic leading-[1.1] text-white"
                data-group={r}
                style={{ top: `${(rowAt(r).y * 100).toFixed(2)}%` }}
              >
                {g.label.replace("&", "and")}
              </h3>
              <ul>
                {g.skills.map((s, col) => {
                  const i = n;
                  n += 1;
                  const at = nameAt(r, col);
                  return (
                    <li
                      className="absolute w-[5.6vw] -translate-x-1/2 text-center font-mono text-[1.15rem] leading-[1.25] text-white"
                      data-skill={i}
                      key={s.name}
                      style={{ left: `${(at.x * 100).toFixed(2)}%`, top: `${(at.y * 100).toFixed(2)}%` }}
                    >
                      {s.name}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section
        className="relative z-10"
        id="contact"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${CONTACT_H})`, scrollMarginTop: `calc(${SCREEN} * -1.5)` }}
      >
        <div className="sticky top-0 w-full" data-contact-layer style={{ height: SCREEN, opacity: 0, pointerEvents: "none", color: BAND }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] ${LABEL}`}>Contact</h2>
          <div className="absolute inset-x-0 top-[17%] text-center">
            <a className="font-sans text-[5.6vw] font-light leading-none tracking-[-0.035em]" href={`mailto:${EMAIL}`}>
              {EMAIL}
            </a>
            <Links className="mt-[4.5vh] flex justify-center gap-[3.5vw] text-left" tone="" />
          </div>
        </div>
      </section>
    </div>
  );
}

function Plain({ withStage }: { withStage: boolean }): JSX.Element {
  return (
    <div>
      {withStage ? (
        <div className="relative w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
          <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-bars />
        </div>
      ) : null}

      <section className="px-[4.5vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-70 ${LABEL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <ProjectText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="px-[4.5vw] py-[10vh]" id="skills">
        <h2 className={`opacity-70 ${LABEL}`}>Skills</h2>
        <div className="max-w-[150rem]">
          {skillGroups.map((g) => (
            <div className="mt-[3.4rem] grid grid-cols-[24rem_1fr] gap-x-[2rem]" key={g.label}>
              <h3 className="font-serif-display text-[2.8rem] font-normal italic leading-[1.15] text-white">{g.label.replace("&", "and")}</h3>
              <ul className="flex flex-wrap gap-x-[2.4rem] gap-y-[1.2rem]">
                {g.skills.map((s) => (
                  <li className="flex items-center gap-[0.8rem] font-mono text-[1.5rem] leading-none" key={s.name}>
                    <SkillMark size="2.2rem" skill={s} tinted={false} />
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[4.5vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-70 ${LABEL}`}>Contact</h2>
        <a className="mt-[5vh] block font-sans text-[6.4vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" tone="text-white" />
      </section>
    </div>
  );
}

export default function B22(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a gate with words beside it. A media query's em is
    // the browser's 16, not the page's rem, so 56em is 896 wide.
    const narrow = window.matchMedia("(max-width: 56em), (orientation: portrait)");
    const pick = (): void => {
      if (!webglWorks()) setMode("plain");
      else if (less.matches || narrow.matches) setMode("still");
      else setMode("journey");
    };
    pick();
    less.addEventListener("change", pick);
    narrow.addEventListener("change", pick);
    return () => {
      less.removeEventListener("change", pick);
      narrow.removeEventListener("change", pick);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || mode === "boot" || mode === "plain") return undefined;
    try {
      return startWalk(root, mode);
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
      {/* The band above is this plum. The first rows under it are plum
          with no bars on them, and the tunnel comes up out of that. */}
      {mode !== "plain" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[18vh]"
          style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 10%, rgba(42, 13, 30, 0) 100%)` }}
        />
      ) : null}
    </div>
  );
}
