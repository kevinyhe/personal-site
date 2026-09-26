"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { CONTACT_H, SKILLS_BOX, SKILLS_H, TEXT_BOX, WORK_H } from "./layout";
import { type Mode as StageMode, startGlobe } from "./stage";

/**
 * Design 23, Globe. A tiny planet of hills, sakura, shrines and torii,
 * with a river, a thin ring of cloud, and Kevin's robot on the road
 * round its equator. Drawn in three.js in greys and put through the bar
 * shader turned over, so the lit ground is blossom and the sky plum.
 *
 * Scroll spins the planet: five pins stand on it, one per project, each
 * with a small thing on top that stands for it, and each comes round to
 * face the camera in turn with its project beside it. Dragging spins it
 * too. At the skills the planet tips its pole toward you, where 42
 * lanterns stand in five rings, one ring per group, lit in turn. Last, it
 * shrinks to a moon in a plum sky over the email.
 *
 * Layouts:
 *   journey  the pinned scene, with the words laid over it.
 *   still    one frame of the planet, then the words as plain blocks.
 *            For reduced motion and for narrow or upright screens.
 *   plain    the words alone. What the server sends, and what stays if
 *            WebGL cannot start.
 */

type Mode = "boot" | "plain" | StageMode;

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif is a demo cut that draws a flower for digits and some marks. */
const serifSafe = (t: string): boolean => !/[0-9'"$&@\-!()*+/=#%‑]/.test(t);
const pc = (v: number): string => `${(v * 100).toFixed(2)}%`;

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

function Heading({ children }: { children: string }): JSX.Element {
  return <h2 className="font-serif-display text-[4.8rem] font-normal italic leading-none text-white">{children}</h2>;
}

function Title({ p }: { p: Project }): JSX.Element {
  return serifSafe(p.title) ? (
    <h3 className="font-serif-display text-[8rem] font-normal italic leading-[1.02] text-white">{p.title}</h3>
  ) : (
    <h3 className="font-sans text-[7rem] font-light leading-[1.05] tracking-[-0.03em] text-white">{p.title}</h3>
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

function Journey(): JSX.Element {
  let n = 0;
  return (
    <div className="relative" data-journey>
      <div
        className="sticky top-0 w-full cursor-grab select-none overflow-hidden"
        data-stage
        style={{ height: SCREEN, backgroundColor: BAND, touchAction: "pan-y" }}
      >
        <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-bars />
        {projects.map((p, i) => (
          <p
            aria-hidden
            className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap font-mono text-[1.4rem] tracking-[0.16em] text-white"
            data-tag={i}
            key={p.title}
            style={{ opacity: 0, left: "30%", top: "15%" }}
          >
            {pad2(i + 1)}
          </p>
        ))}
        <p className={`absolute bottom-[4vh] left-1/2 -translate-x-1/2 whitespace-nowrap ${LABEL}`} data-hint style={{ opacity: 0.7 }}>
          Scroll turns the planet. Drag to spin it.
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${WORK_H})` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <div className="absolute left-[4.5vw] top-[7vh]">
            <Heading>Work</Heading>
          </div>
          {projects.map((p, i) => (
            <article
              className="absolute top-1/2"
              data-card={i}
              key={p.title}
              style={{
                left: pc(TEXT_BOX.x0),
                width: pc(TEXT_BOX.x1 - TEXT_BOX.x0),
                opacity: 0,
                visibility: "hidden",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            >
              <ProjectText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * ${SKILLS_H})` }}>
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <div className="absolute left-[4.5vw] top-[7vh]">
            <Heading>Skills</Heading>
          </div>
          <div
            className="absolute flex flex-col justify-center"
            data-skill-list
            style={{
              left: pc(SKILLS_BOX.x0),
              width: pc(SKILLS_BOX.x1 - SKILLS_BOX.x0),
              top: pc(SKILLS_BOX.y0),
              height: pc(SKILLS_BOX.y1 - SKILLS_BOX.y0),
              pointerEvents: "none",
            }}
          >
            {skillGroups.map((g, r) => (
              <div className="mt-[3.2rem] first:mt-0" data-group={r} key={g.label} style={{ opacity: 0.4, transition: "opacity 0.4s" }}>
                <h3 className="flex items-baseline gap-[1.6rem] font-sans text-[2.4rem] font-medium leading-[1.2] text-white">
                  <span className="font-mono text-[1.3rem] font-normal tracking-[0.16em] opacity-70">{pad2(r + 1)}</span>
                  {g.label}
                </h3>
                <ul className="mt-[1.2rem] flex flex-wrap gap-x-[2.2rem] gap-y-[0.9rem] pl-[4rem]">
                  {g.skills.map((sk) => {
                    const i = n;
                    n += 1;
                    return (
                      <li className="cursor-default font-mono text-[1.5rem] leading-[1.3] hover:text-white" data-skill={i} key={sk.name}>
                        {sk.name}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="contact" style={{ height: `calc(${SCREEN} * ${CONTACT_H})` }}>
        <div className="sticky top-0 w-full" data-contact-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <div className="absolute left-[4.5vw] top-[7vh]">
            <Heading>Contact</Heading>
          </div>
          <div className="absolute left-[6vw] top-[54%]" data-contact-body style={{ pointerEvents: "none" }}>
            <a className="font-sans text-[5.4vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
              {EMAIL}
            </a>
            <Links className="mt-[5vh] flex gap-[3.5vw] text-left" />
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
        <Heading>Work</Heading>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <ProjectText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="px-[4.5vw] py-[10vh]" id="skills">
        <Heading>Skills</Heading>
        <div className="max-w-[150rem]">
          {skillGroups.map((g) => (
            <div className="mt-[3.4rem] grid grid-cols-[22rem_1fr] gap-x-[2rem]" key={g.label}>
              <h3 className="font-sans text-[2.2rem] font-medium leading-[1.2] text-white">{g.label}</h3>
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
        <Heading>Contact</Heading>
        <a className="mt-[5vh] block font-sans text-[6.4vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

export default function B23(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a planet with words beside it. A media query's em is
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
      return startGlobe(root, mode);
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
      {/* The band above is this plum. The first rows under it are bare
          plum, and the planet comes up out of that. */}
      {mode !== "plain" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[14vh]"
          style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 12%, rgba(42, 13, 30, 0) 100%)` }}
        />
      ) : null}
    </div>
  );
}
