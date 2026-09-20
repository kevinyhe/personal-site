"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { SIDES } from "./layout";
import { type Mode as SceneMode, startReveal } from "./reveal";

/**
 * Design 10, Reveal. Kevin's robot stands large in the middle of the
 * screen over a ground of contour lines. It is drawn twice from the same
 * camera: solid and lit, and as an engineer's drawing. The cursor leaves
 * a trail that behaves like liquid, and inside the trail the drawing
 * shows in place of the solid robot.
 *
 * Scrolling turns the robot through five sides, one project called out
 * at each. Then it moves aside for the skills, and last drives off and
 * leaves the email.
 *
 * The page has two layouts.
 *   journey  the pinned sequence, with the words laid over the canvas.
 *   plain    the words as ordinary blocks. It is what the server sends,
 *            what a narrow screen and a visitor who asked for less
 *            motion keep (under one stage), and what is left if WebGL
 *            cannot start.
 */

type Mode = "boot" | "plain" | SceneMode;

const SCREEN = "var(--arbor-screen-h)";
const SMALL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const metaOf = (p: (typeof projects)[number]): string => (p.award ? `${p.year}. ${p.award}` : p.year);

/** The rows of large type run sideways by half their own width, which is one copy of their words. */
const CSS = `
@keyframes b10-run { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.b10-row { animation: b10-run linear infinite; animation-play-state: var(--b10-run, paused); will-change: transform; }
`;

/** Can this browser give us the kind of canvas the scene needs? Asked of a spare canvas, which is let go again at once. */
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

function SkillRows(): JSX.Element {
  return (
    <>
      {skillGroups.map((g) => (
        <div className="mt-[3.4rem] grid grid-cols-[22rem_1fr] gap-x-[2rem]" key={g.label}>
          <h3 className="font-sans text-[2.2rem] font-medium leading-[1.2] tracking-[-0.01em] text-white">{g.label}</h3>
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
    </>
  );
}

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        {/* Under the canvas. The canvas lets it through the ground at the
            skills step, so the robot stands in front of the type. */}
        <div
          aria-hidden
          className="absolute inset-0 flex flex-col justify-center overflow-hidden"
          data-ticker
          style={{ visibility: "hidden" }}
        >
          {skillGroups.map((g, r) => {
            const words = `${g.skills.map((s) => s.name).join("  ·  ")}  ·  `;
            return (
              <div
                className="b10-row flex w-max whitespace-pre font-sans text-[15vh] font-bold leading-[1.1] tracking-[-0.02em]"
                key={g.label}
                style={{
                  animationDuration: `${110 + r * 17}s`,
                  animationDirection: r % 2 ? "reverse" : "normal",
                  color: "transparent",
                  WebkitTextStroke: `0.14rem ${BLOSSOM}`,
                }}
              >
                <span>{words}</span>
                <span>{words}</span>
              </div>
            );
          })}
        </div>
        <div className="absolute inset-0" data-canvas />
        <p aria-hidden className={`absolute bottom-[4vh] left-[4.5vw] ${SMALL}`} data-mono>
          <span className="tabular-nums text-white" data-count>
            01 / 07
          </span>
          <span className="ml-[1.6rem] opacity-70" data-view>
            Front
          </span>
        </p>
        <p
          className={`absolute bottom-[4vh] left-1/2 -translate-x-1/2 transition-opacity duration-500 ${SMALL}`}
          data-hint
          style={{ opacity: 0.7 }}
        >
          Move the cursor across it.
        </p>
      </div>

      <section
        className="pointer-events-none relative z-10"
        id="work"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}
      >
        <div className="sticky top-0 w-full" data-work-layer style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${SMALL}`}>Work</h2>
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" fill="none">
            {projects.map((p, i) => (
              <g key={p.title}>
                <path
                  data-lead={i}
                  pathLength={1}
                  stroke={BLOSSOM}
                  style={{ opacity: 0, strokeWidth: "0.15rem", strokeDasharray: "1", strokeDashoffset: "1" }}
                />
                <circle data-ring={i} stroke={BLOSSOM} style={{ opacity: 0, strokeWidth: "0.15rem" }} />
                <circle data-dot={i} fill="#ffffff" style={{ opacity: 0 }} />
              </g>
            ))}
          </svg>
          {projects.map((p, i) => (
            <article
              className={`absolute top-1/2 w-[23vw] -translate-y-1/2 ${SIDES[i] === "left" ? "left-[4.5vw]" : "right-[4.5vw]"}`}
              data-callout={i}
              key={p.title}
              style={{ opacity: 0, pointerEvents: "none" }}
            >
              <p className="font-mono text-[1.5rem] leading-[1.4] tabular-nums">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <div className="mt-[1.2rem] h-[0.15rem] w-full" data-rule style={{ backgroundColor: BLOSSOM }} />
              <h3 className="mt-[1.6rem] font-sans text-[4.4rem] font-medium leading-[1.08] tracking-[-0.02em] text-white">{p.title}</h3>
              <p className="mt-[1.6rem] font-sans text-[1.9rem] leading-[1.5]">{p.tagline}</p>
              <p className="mt-[1.6rem] font-mono text-[1.4rem] leading-[1.6] text-white">{p.stack.join(", ")}</p>
              <p className="mt-[0.8rem] font-mono text-[1.4rem] leading-[1.6] opacity-80">{metaOf(p)}</p>
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
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 2)` }}>
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0 }}>
          <div className="absolute right-[4.5vw] top-1/2 w-[50vw] -translate-y-1/2">
            <h2 className={`opacity-60 ${SMALL}`}>Skills</h2>
            <SkillRows />
          </div>
        </div>
      </section>

      <section className="relative z-10 w-full" id="contact" style={{ height: SCREEN }}>
        <h2 className={`absolute left-[4.5vw] top-[14vh] opacity-60 ${SMALL}`}>Contact</h2>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <a className="font-sans text-[6.4vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <Links className="mt-[6vh] flex justify-center gap-[3.5vw] text-left" />
        </div>
      </section>
    </div>
  );
}

function Plain({ withStage, hint }: { withStage: boolean; hint: boolean }): JSX.Element {
  return (
    <div>
      {withStage ? (
        <div className="relative w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
          <div className="absolute inset-0" data-canvas />
          {/* Always there, with or without words: the scene reads the mono font's name from it. */}
          <p className={`absolute bottom-[4vh] left-1/2 -translate-x-1/2 opacity-70 ${SMALL}`} data-mono>
            {hint ? "Move the cursor across it." : null}
          </p>
        </div>
      ) : null}

      <section className="px-[4.5vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-60 ${SMALL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <p className="font-mono text-[1.5rem] leading-[1.4] tabular-nums">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <div className="mt-[1.2rem] h-[0.15rem] w-full" style={{ backgroundColor: BLOSSOM }} />
              <h3 className="mt-[1.6rem] font-sans text-[4.4rem] font-medium leading-[1.08] tracking-[-0.02em] text-white">{p.title}</h3>
              <p className="mt-[1.6rem] max-w-[64rem] font-sans text-[1.9rem] leading-[1.5]">{p.tagline}</p>
              <p className="mt-[1.6rem] font-mono text-[1.4rem] leading-[1.6] text-white">{p.stack.join(", ")}</p>
              <p className="mt-[0.8rem] font-mono text-[1.4rem] leading-[1.6] opacity-80">{metaOf(p)}</p>
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
            </article>
          ))}
        </div>
      </section>

      <section className="px-[4.5vw] py-[10vh]" id="skills">
        <h2 className={`opacity-60 ${SMALL}`}>Skills</h2>
        <div className="max-w-[150rem]">
          <SkillRows />
        </div>
      </section>

      <section className="px-[4.5vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-60 ${SMALL}`}>Contact</h2>
        <a
          className="mt-[5vh] block font-sans text-[6.4vw] font-light leading-none tracking-[-0.035em] text-white"
          href={`mailto:${EMAIL}`}
        >
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

export default function B10(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting or turns a tablet on its side.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a robot with text beside it. In a media query an em
    // is the browser's own 16, not the page's rem, so 56em is 896 wide.
    const narrow = window.matchMedia("(max-width: 56em), (orientation: portrait)");
    const pick = (): void => {
      if (!webglWorks()) setMode("plain");
      else if (less.matches) setMode("still");
      else setMode(narrow.matches ? "compact" : "journey");
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
      return startReveal(root, mode);
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {mode === "journey" ? <Journey /> : <Plain hint={mode === "compact"} withStage={mode !== "plain"} />}
      {/* The band above is this colour. The first thing under it is the
          band's own plum, with no lines on it, and the ground comes up
          out of that. It scrolls away with the page. */}
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
