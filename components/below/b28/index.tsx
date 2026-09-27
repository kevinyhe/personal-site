"use client";

import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { startJourney, startStill } from "./driver";
import { CONTACT_STOP, SECTION_SCREENS, SKILLS_STOP } from "./layout";

/**
 * Design 28, Screen. A six-panel folding screen standing in a dim plum
 * room, lit from one side. Each panel is painted in plum halftone on pale
 * blossom paper: one landscape of hills running across all six, and in
 * each panel its own subject (a sakura tree, a torii, a pagoda, the
 * robot, a ringed planet over lanterns), one per project. The sixth
 * panel carries the 42 skill marks in five columns.
 *
 * Scroll opens the screen from folded shut, one panel at a time on real
 * hinges, and the camera moves along to face each panel as it opens. The
 * words for that panel stand on the left. At the end the screen opens
 * flat, the camera backs away, and the email sits in front of it. The
 * cursor moves the lamp, so the folds' shading changes under the hand.
 *
 * Layouts:
 *   journey  the pinned room, with the words laid over it.
 *   still    one frame of the screen standing open, then the words as
 *            plain blocks. Reduced motion, narrow or upright screens.
 *   plain    the words alone. What the server sends, and what stays if
 *            WebGL cannot start.
 */

type Mode = "boot" | "plain" | "still" | "journey";

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif is a demo cut that draws a flower for digits and some marks. */
const serifSafe = (t: string): boolean => !/[0-9'"$&@\-!()*+/=#%]/.test(t);

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

// ------------------------------------------------------------ the words

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
      <p className="font-mono text-[1.4rem] tabular-nums tracking-[0.12em]">
        {`${pad2(i + 1)} / ${pad2(projects.length)}`}
        <span className="ml-[1.6rem] opacity-70">{p.year}</span>
      </p>
      <div className="mt-[1.6rem]">
        <Title p={p} />
      </div>
      <p className="mt-[2rem] max-w-[60rem] font-sans text-[2.2rem] font-light leading-[1.45]">{p.tagline}</p>
      <p className="mt-[2rem] font-mono text-[1.4rem] uppercase leading-[1.7] tracking-[0.12em] text-white">{p.stack.join("  ·  ")}</p>
      {p.award ? <p className="mt-[0.8rem] font-mono text-[1.4rem] leading-[1.6]">{p.award}</p> : null}
      {p.href ? (
        <a className="mt-[0.8rem] inline-block font-mono text-[1.4rem] leading-[1.6] underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
          {hostOf(p.href)}
        </a>
      ) : null}
    </>
  );
}

/** Five columns, a group to a column, in the order the last panel paints them. */
function SkillColumns({ marks }: { marks: boolean }): JSX.Element {
  return (
    <div className="grid grid-cols-5 gap-x-[1.6vw]">
      {skillGroups.map((g) => (
        <div key={g.label}>
          <h3 className="font-sans text-[1.7rem] font-medium leading-[1.2] text-white">{g.label}</h3>
          <ul className="mt-[1.6rem] space-y-[1rem]">
            {g.skills.map((s) => (
              <li className="flex items-center gap-[0.8rem] font-mono text-[1.35rem] leading-[1.25]" key={s.name}>
                {marks ? <SkillMark size="1.8rem" skill={s} tinted={false} /> : null}
                {s.name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Links({ className }: { className: string }): JSX.Element {
  return (
    <ul className={`font-mono text-[1.6rem] ${className}`}>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.3rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
            <span className="mt-[0.4rem] block text-white underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ layouts

/** Where a stop's words start: the first stop's are up, the rest wait. The driver takes over from here. */
const wait = (k: number, extra: CSSProperties = {}): CSSProperties => ({
  opacity: k === 0 ? 1 : 0,
  visibility: k === 0 ? "visible" : "hidden",
  pointerEvents: "none",
  ...extra,
});

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-gl />
        {/* The panels already open run left under the words; this keeps the words on plum. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[60vw]"
          data-scrim
          style={{ background: "linear-gradient(90deg, rgba(26, 8, 18, 0.9) 0%, rgba(26, 8, 18, 0.82) 55%, rgba(26, 8, 18, 0) 100%)" }}
        />
        <p className={`absolute bottom-[4vh] right-[3vw] whitespace-nowrap opacity-70 ${LABEL}`} data-hint>Scroll to open the screen. The cursor moves the light.</p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${SECTION_SCREENS.work})` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[5vw] top-[7vh] opacity-60 ${LABEL}`}>Work</h2>
          {projects.map((p, i) => (
            <article
              className="absolute left-[5vw] top-1/2 w-[33vw]"
              data-words={i}
              key={p.title}
              style={wait(i, { transform: "translateY(calc(-50% + var(--b28-rise, 0vh)))" })}
            >
              <ProjectText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * ${SECTION_SCREENS.skills})` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <div
            className="absolute left-[5vw] top-1/2 w-[44vw]"
            data-words={SKILLS_STOP}
            style={wait(SKILLS_STOP, { transform: "translateY(calc(-50% + var(--b28-rise, 0vh)))" })}
          >
            <h2 className="mb-[4vh] font-serif-display text-[7.2rem] font-normal italic leading-[1.02] text-white">Skills</h2>
            <SkillColumns marks={false} />
          </div>
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="contact" style={{ height: `calc(${SCREEN} * ${SECTION_SCREENS.contact})` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <div className="absolute inset-x-0 top-[63%] text-center" data-words={CONTACT_STOP} style={wait(CONTACT_STOP, { transform: "translateY(var(--b28-rise, 0vh))" })}>
            <h2 className={`opacity-60 ${LABEL}`}>Contact</h2>
            <a className="mt-[2.4vh] inline-block font-sans text-[5.6vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
              {EMAIL}
            </a>
            <Links className="mt-[4.5vh] flex justify-center gap-[3.5vw] text-left" />
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
          <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-gl />
        </div>
      ) : null}

      <section className="px-[5vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-60 ${LABEL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <ProjectText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="px-[5vw] py-[10vh]" id="skills">
        <h2 className={`opacity-60 ${LABEL}`}>Skills</h2>
        <div className="mt-[5vh] max-w-[160rem] overflow-x-auto">
          <div className="min-w-[90rem]">
            <SkillColumns marks />
          </div>
        </div>
      </section>

      <section className="px-[5vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-60 ${LABEL}`}>Contact</h2>
        <a className="mt-[5vh] block break-all font-sans text-[6.4vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

export default function B28(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a panel with words beside it. A media query's em is
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
      return mode === "journey" ? startJourney(root) : startStill(root);
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {/* The canvas reads the mono face's family name off this, for the seals and marks. */}
      <span aria-hidden className="hidden font-mono" data-font="mono" />
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
      {/* The band above is this plum. The room comes up out of it and the join shows no line. */}
      {mode !== "plain" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[16vh]"
          style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 12%, rgba(42, 13, 30, 0) 100%)` }}
        />
      ) : null}
    </div>
  );
}
