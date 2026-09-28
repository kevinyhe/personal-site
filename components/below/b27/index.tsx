"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { type Mode as SceneMode, startPond } from "./drive";
import { LIST_TOP, LIST_W, RING_SHARE_X, SIDES } from "./layout";

/**
 * Design 27, Pond. A koi pond seen from above, drawn in three.js in greys
 * and put through the site's bar shader with the grade turned over, so the
 * deep water is plum and whatever is bright (koi, petals, lanterns) is
 * blossom. The water is a ripple simulation: the cursor draws wakes in it,
 * it bends the view of the koi under it, and it carries a sakura bough's
 * reflection and the fallen petals on it.
 *
 * Scroll drifts the camera along the pond. Five lily pads, one per
 * project, each with a small thing resting on it, come under the camera in
 * turn with the project beside them. Then 42 floating lanterns, one per
 * skill, gather in five rings. Last, a stone drops, rings spread, and the
 * email comes up in them.
 *
 * Layouts:
 *   journey  the pinned drift, with the words laid over it.
 *   still    one frame over the first pad, then the words as plain blocks.
 *            For reduced motion and for narrow or upright screens.
 *   plain    the words alone. What the server sends, and what stays if
 *            WebGL cannot start.
 */

type Mode = "boot" | "plain" | SceneMode;

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.8rem] uppercase tracking-[0.2em]";
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

function Title({ p, big }: { p: Project; big: boolean }): JSX.Element {
  return serifSafe(p.title) ? (
    <h3 className={`font-serif-display font-normal italic leading-[1.02] text-white ${big ? "text-[8.8rem]" : "text-[6.4rem]"}`}>{p.title}</h3>
  ) : (
    <h3 className={`font-sans font-light leading-[1.05] tracking-[-0.03em] text-white ${big ? "text-[7.6rem]" : "text-[5.6rem]"}`}>{p.title}</h3>
  );
}

function ProjectText({ p, i }: { p: Project; i: number }): JSX.Element {
  return (
    <>
      <p className="font-mono text-[1.8rem] tabular-nums tracking-[0.12em]">
        {`${pad2(i + 1)} / ${pad2(projects.length)}`}
        <span className="ml-[1.6rem] opacity-70">{p.year}</span>
      </p>
      <div className="mt-[1.6rem]">
        <Title big p={p} />
      </div>
      <p className="mt-[2rem] max-w-[62rem] font-sans text-[2.6rem] font-light leading-[1.45] text-white">{p.tagline}</p>
      <p className="mt-[2rem] font-mono text-[1.7rem] uppercase leading-[1.7] tracking-[0.12em] text-white">{p.stack.join("  ·  ")}</p>
      {p.award ? <p className="mt-[0.8rem] font-mono text-[1.7rem] leading-[1.6]">{p.award}</p> : null}
      {p.href ? (
        <a
          className="mt-[0.8rem] inline-block font-mono text-[1.7rem] leading-[1.6] underline underline-offset-[0.35em]"
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

const SCRIM = "rgba(26, 8, 18, 0.94) 0%, rgba(26, 8, 18, 0.82) 60%, rgba(26, 8, 18, 0) 100%";

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-bars />
        {/* Design 20's brush strokes, painted round each pad. */}
        <canvas aria-hidden className="pointer-events-none absolute inset-0 block h-full w-full" data-strokes />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[52vw]" data-scrim="left" style={{ opacity: 0, background: `linear-gradient(90deg, ${SCRIM})` }} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[52vw]" data-scrim="right" style={{ opacity: 0, background: `linear-gradient(270deg, ${SCRIM})` }} />
        <p className={`pointer-events-none absolute bottom-[4vh] left-1/2 -translate-x-1/2 whitespace-nowrap ${LABEL}`} data-hint style={{ opacity: 0.7 }}>
          Scroll to drift across the pond. Move the cursor to stir the water.
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${LABEL}`}>Work</h2>
          {projects.map((p, i) => (
            <article
              className="absolute top-1/2 w-[36vw]"
              data-card={i}
              key={p.title}
              // The pad sits on the other side of the screen from the words.
              style={{ left: SIDES[i] < 0 ? "55vw" : "6vw", opacity: 0, transform: "translateY(-50%)", pointerEvents: "none" }}
            >
              <ProjectText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 2.4)` }}>
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[55%]" style={{ background: "linear-gradient(0deg, rgba(26, 8, 18, 0.82) 0%, rgba(26, 8, 18, 0.6) 60%, rgba(26, 8, 18, 0) 100%)" }} />
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${LABEL}`}>Skills</h2>
          {skillGroups.map((g, r) => (
            <div
              className="absolute -translate-x-1/2"
              key={g.label}
              // Under this group's ring of lanterns.
              style={{ left: `${(RING_SHARE_X[r] * 100).toFixed(2)}%`, top: `${(LIST_TOP * 100).toFixed(2)}%`, width: `${(LIST_W * 100).toFixed(2)}vw` }}
            >
              <h3 className="font-sans text-[2.6rem] font-medium leading-[1.2] text-white">{g.label}</h3>
              <ul className="mt-[1.2rem]">
                {g.skills.map((s) => (
                  <li className="font-mono text-[1.8rem] leading-[1.7]" key={s.name}>
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10" id="contact" style={{ height: `calc(${SCREEN} * 1.6)` }}>
        <div className="sticky top-0 w-full" data-contact-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden", pointerEvents: "none" }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${LABEL}`}>Contact</h2>
          {/* The stone lands at the middle of the screen; the email sits where it fell. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[40vh] w-[76vw] -translate-x-1/2 -translate-y-1/2"
            style={{ background: "radial-gradient(ellipse at center, rgba(26, 8, 18, 0.72) 0%, rgba(26, 8, 18, 0.45) 45%, rgba(26, 8, 18, 0) 72%)" }}
          />
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
            <a className="inline-block font-sans text-[4.8vw] font-light leading-none tracking-[-0.035em] text-white" data-email href={`mailto:${EMAIL}`} style={{ opacity: 0 }}>
              {EMAIL}
            </a>
          </div>
          <Links className="absolute inset-x-0 top-[66%] flex justify-center gap-[3.5vw] text-left" />
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
        <h2 className={`opacity-60 ${LABEL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <ProjectText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="px-[4.5vw] py-[10vh]" id="skills">
        <h2 className={`opacity-60 ${LABEL}`}>Skills</h2>
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
        <h2 className={`opacity-60 ${LABEL}`}>Contact</h2>
        <a className="mt-[5vh] block font-sans text-[6.4vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

export default function B27(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a pad with words beside it. A media query's em is the
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
    try {
      return startPond(root, mode);
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
      {/* The band above is this plum. The first rows under it are plum with
          no bars on them, and the pond comes up out of that. */}
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
