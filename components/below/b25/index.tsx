"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, type SkillGroup, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { CARD, CONTACT_H, ORDER, SKILL_BLOCK_W, SKILL_SLOT_OF, SKILL_SLOTS, SKILLS_H, WORK_H } from "./layout";
import { GROUPS } from "./parts";
import type { Mode as SceneMode } from "./journey";

/**
 * Design 25, Exploded. Kevin's robot, in the band's own bars, taken apart
 * by the scroll the way a product page pulls a device apart into its
 * parts. Five stops: at each one a part group comes off along a clean
 * axis (wheels out to the sides, the drivetrain down, the lift up, the
 * front forward, the rear back), turning slowly, and that group is drawn
 * brighter with a thin leader line to one project. At the skills every
 * part hangs in place and five groups carry the five skill groups. At the
 * contact the parts fly back together and the robot drives off.
 *
 * Layouts:
 *   journey  the pinned scroll, words laid over it.
 *   still    one frame of the robot apart, then the words as plain blocks.
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
const partName = (k: number): string => GROUPS[ORDER[k]].name;

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
    <h3 className="font-serif-display text-[7.2rem] font-normal italic leading-[1.05] text-white">{p.title}</h3>
  ) : (
    <h3 className="font-sans text-[6.4rem] font-light leading-[1.05] tracking-[-0.03em] text-white">{p.title}</h3>
  );
}

function ProjectText({ p, i }: { p: Project; i: number }): JSX.Element {
  return (
    <>
      <p className="font-mono text-[1.4rem] uppercase leading-[1.6] tracking-[0.16em]">
        {`${pad2(i + 1)} / ${pad2(projects.length)}`}
        <span className="ml-[1.6rem] opacity-70">{partName(i)}</span>
      </p>
      <div className="mt-[1.6rem]">
        <Title p={p} />
      </div>
      <p className="mt-[2rem] font-sans text-[2.2rem] font-light leading-[1.45]">{p.tagline}</p>
      <p className="mt-[2rem] font-mono text-[1.4rem] uppercase leading-[1.7] tracking-[0.12em] text-white">{p.stack.join("  ·  ")}</p>
      <p className="font-mono text-[1.4rem] leading-[1.7] opacity-80">{p.year}</p>
      {p.award ? <p className="mt-[0.6rem] font-mono text-[1.4rem] leading-[1.6]">{p.award}</p> : null}
      {p.href ? (
        <a
          className="mt-[0.6rem] inline-block font-mono text-[1.4rem] leading-[1.6] underline underline-offset-[0.35em]"
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

/** A group name in the serif; its "&" set in Inter, which the serif would draw as a flower. */
function GroupHeading({ g }: { g: SkillGroup }): JSX.Element {
  const parts = g.label.split("&");
  if (!parts.every(serifSafe)) {
    return <h3 className="font-sans text-[2.2rem] font-light leading-[1.2] text-white">{g.label}</h3>;
  }
  return (
    <h3 className="font-serif-display text-[2.4rem] font-normal italic leading-[1.2] text-white">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 ? <span className="font-sans font-light not-italic">&amp;</span> : null}
          {part}
        </span>
      ))}
    </h3>
  );
}

function SkillList({ g }: { g: SkillGroup }): JSX.Element {
  return (
    <ul className="mt-[1.6rem] grid grid-cols-2 gap-x-[1.6rem] gap-y-[0.9rem]">
      {g.skills.map((s) => (
        <li className="flex items-center gap-[0.8rem] font-mono text-[1.3rem] leading-[1.5]" key={s.name}>
          <SkillMark className="shrink-0" size="1.8rem" skill={s} tinted={false} />
          {s.name}
        </li>
      ))}
    </ul>
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

const pctOf = (v: number): string => `${(v * 100).toFixed(2)}%`;

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-bars />
        {/* The leaders: one for the work card, five for the skills. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line
              data-leader={i}
              key={i}
              stroke={BLOSSOM}
              style={{ opacity: 0, strokeWidth: "0.12rem" }}
              vectorEffect="non-scaling-stroke"
              x1="0"
              x2="0"
              y1="0"
              y2="0"
            />
          ))}
        </svg>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            aria-hidden
            className="pointer-events-none absolute h-[1.2rem] w-[1.2rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
            data-dot={i}
            key={i}
            style={{ opacity: 0, left: 0, top: 0, border: `0.15rem solid ${BLOSSOM}`, backgroundColor: BAND }}
          />
        ))}
        <p className={`absolute bottom-[4vh] left-1/2 -translate-x-1/2 whitespace-nowrap ${LABEL}`} data-hint style={{ opacity: 0.7 }}>
          Scroll to take it apart.
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${WORK_H})` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[5vw] top-[7vh] opacity-60 ${LABEL}`}>Work</h2>
          {projects.map((p, i) => (
            <article
              className="absolute"
              data-card={i}
              key={p.title}
              style={{ left: pctOf(CARD.left), top: pctOf(CARD.top), width: pctOf(CARD.width), opacity: 0, pointerEvents: "none" }}
            >
              <ProjectText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * ${SKILLS_H})` }}>
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <h2 className={`absolute left-1/2 top-[5vh] -translate-x-1/2 opacity-60 ${LABEL}`}>Skills</h2>
          {skillGroups.map((g, i) => {
            const slot = SKILL_SLOTS[SKILL_SLOT_OF[i]];
            return (
              <div
                className="absolute"
                key={g.label}
                style={{ left: pctOf(slot.left), top: pctOf(slot.top), width: pctOf(SKILL_BLOCK_W) }}
              >
                <GroupHeading g={g} />
                <SkillList g={g} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="relative z-10" id="contact" style={{ height: `calc(${SCREEN} * ${CONTACT_H})` }}>
        <div className="sticky top-0 w-full" data-contact-layer style={{ height: SCREEN, opacity: 0, pointerEvents: "none" }}>
          <h2 className={`absolute left-[5vw] top-[62vh] -translate-y-full pb-[2vh] opacity-60 ${LABEL}`}>Contact</h2>
          <a
            className="absolute left-[5vw] top-[62vh] whitespace-nowrap font-sans text-[6vw] font-light leading-none tracking-[-0.035em] text-white"
            href={`mailto:${EMAIL}`}
          >
            {EMAIL}
          </a>
          <Links className="absolute left-[5vw] top-[80vh] flex gap-[3.5vw]" />
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
        <div className="mt-[4vh] grid grid-cols-1 gap-x-[5vw] gap-y-[6vh] md:grid-cols-2 xl:grid-cols-3">
          {skillGroups.map((g) => (
            <div key={g.label}>
              <GroupHeading g={g} />
              <SkillList g={g} />
            </div>
          ))}
        </div>
      </section>

      <section className="px-[5vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-60 ${LABEL}`}>Contact</h2>
        <a className="mt-[5vh] block font-sans text-[6vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

export default function B25(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a card beside the robot. A media query's em is the
    // browser's 16, not the page's rem, so 56em is 896 wide.
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
    let stop: (() => void) | null = null;
    let cancelled = false;
    // Loaded on demand so three.js stays out of the page's first script.
    import("./journey")
      .then(({ startExploded }) => {
        if (cancelled) return;
        try {
          stop = startExploded(root, mode);
        } catch {
          // The scene could not start. The words stand without it.
          setMode("plain");
        }
      })
      .catch(() => setMode("plain"));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [mode]);

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
    </div>
  );
}
