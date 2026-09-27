"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { PALE, ROSE } from "./colours";
import type { Content } from "./scene";
import { startStage } from "./stage";

/**
 * Design 08, Glass. The one light design of the ten. Each screen's
 * headline is very large type on a pale ground, drawn inside a 3D scene,
 * and ten glass solids float in front of it and bend the letters seen
 * through them. Scrolling moves the solids from one arrangement to the
 * next, one per project; then they press flat into 42 small lenses, one
 * over each skill's mark; then they gather in a heap beside the email.
 *
 * The page has two layouts.
 *   journey  the pinned scene. The headlines are in the scene, so here
 *            they are headings only a screen reader meets; the small
 *            text sits over the stage.
 *   plain    the words as ordinary blocks. It is what the server sends,
 *            what a visitor who asked for less motion keeps (under one
 *            still frame of the first arrangement), and what is left if
 *            WebGL cannot start.
 */

type Mode = "boot" | "journey" | "still" | "plain";

const SCREEN = "var(--arbor-screen-h)";
const HINT = "Scroll. The glass follows the cursor.";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const metaOf = (p: (typeof projects)[number]): string => (p.award ? `${p.year}. ${p.award}` : p.year);

const CONTENT: Content = {
  titles: projects.map((p) => p.title),
  email: EMAIL,
  skills: skillGroups.flatMap((g) => g.skills),
  counts: skillGroups.map((g) => g.skills.length),
};

/** The band's plum at the top edge, washing down to the pale ground. */
const WASH = `linear-gradient(to bottom, ${BAND} 0%, ${BAND} 14%, #6a3352 38%, ${ROSE} 62%, ${BLOSSOM} 82%, ${PALE} 100%)`;

const SMALL = "font-mono text-[1.5rem] leading-[1.6]";
const LABEL = "font-mono text-[1.3rem] uppercase tracking-[0.18em]";

/** Can this browser give us the kind of canvas three needs? Asked of a
 *  spare canvas, which is let go again at once. */
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

function Links(): JSX.Element {
  return (
    <>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className={`block opacity-60 ${LABEL}`}>{l.label}</span>
            <span className={`block underline-offset-[0.35em] group-hover:underline ${SMALL}`}>{l.handle}</span>
          </a>
        </li>
      ))}
    </>
  );
}

function Journey(): JSX.Element {
  let cap = 0;
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 h-screen w-full overflow-hidden" data-stage style={{ backgroundColor: PALE }}>
        <div className="absolute inset-0" data-canvas />
        <span aria-hidden className="font-sans" data-sans />
        <p
          className={`pointer-events-none absolute bottom-[3vh] left-1/2 -translate-x-1/2 whitespace-nowrap ${LABEL}`}
          data-hint
          style={{ opacity: 0.7 }}
        >
          {HINT}
        </p>
      </div>

      <section
        className="pointer-events-none relative z-10"
        id="work"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}
      >
        <div className="sticky top-0 h-screen w-full">
          <h2 className={`absolute left-[4vw] top-[5vh] opacity-70 ${LABEL}`} data-work-head>
            Work
          </h2>
          {projects.map((p, i) => (
            <article
              className="absolute bottom-[7vh] left-[4vw] w-[28vw]"
              data-stop={i}
              key={p.title}
              style={{ opacity: 0, visibility: "hidden", pointerEvents: "none" }}
            >
              {/* The title is the headline in the scene. */}
              <h3 className="sr-only">{p.title}</h3>
              <p className={`opacity-70 ${LABEL}`}>{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <p className="mt-[1.2rem] font-sans text-[2.1rem] font-medium leading-[1.35] tracking-[-0.01em]">{p.tagline}</p>
              <p className={`mt-[1.4rem] ${SMALL}`}>{p.stack.join(", ")}</p>
              <p className={`mt-[0.4rem] opacity-80 ${SMALL}`}>{metaOf(p)}</p>
              {p.href ? (
                <a className={`mt-[0.4rem] inline-block underline underline-offset-[0.35em] ${SMALL}`} href={p.href} rel="noreferrer" target="_blank">
                  {hostOf(p.href)}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section
        className="pointer-events-none relative z-10"
        id="skills"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 3)` }}
      >
        <div className="sticky top-0 h-screen w-full" data-skills-layer style={{ opacity: 0, visibility: "hidden" }}>
          <h2 className="absolute left-[4vw] top-[5vh] font-sans text-[3.4rem] font-bold uppercase leading-none tracking-[-0.03em]">Skills</h2>
          {skillGroups.map((g, r) => (
            <div data-row={r} key={g.label}>
              <div className="absolute -translate-y-1/2" data-row-label>
                <h3 className="font-sans text-[2rem] font-bold leading-[1.15] tracking-[-0.01em]">{g.label}</h3>
                <p className={`mt-[0.4rem] opacity-60 ${LABEL}`}>{pad2(g.skills.length)}</p>
              </div>
              <ul>
                {g.skills.map((s) => {
                  cap += 1;
                  return (
                    <li
                      className="absolute w-[6.2vw] -translate-x-1/2 text-center font-mono text-[1.2rem] leading-[1.25]"
                      data-cap={cap - 1}
                      key={s.name}
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

      <section className="relative z-10 h-screen w-full" id="contact">
        <h2 className="sr-only">Contact</h2>
        {/* The email is drawn in the scene, where the glass can bend it.
            This is the same email laid over it, unpainted, to be read
            out, selected and clicked. */}
        <a
          className="absolute block whitespace-nowrap font-sans font-bold leading-none tracking-[-0.04em]"
          data-email
          href={`mailto:${EMAIL}`}
          style={{ color: "transparent", left: "4%", top: "36%", fontSize: "6vw" }}
        >
          {EMAIL}
        </a>
        <ul className="absolute bottom-[7vh] left-[4vw] grid w-[30vw] grid-cols-2 gap-x-[2vw] gap-y-[2.4vh]">
          <Links />
        </ul>
      </section>
    </div>
  );
}

function Plain({ withStage }: { withStage: boolean }): JSX.Element {
  const big = "font-sans font-bold uppercase leading-[0.92] tracking-[-0.04em]";
  return (
    <div>
      {withStage ? (
        <div className="relative h-screen w-full overflow-hidden" data-stage style={{ backgroundColor: PALE }}>
          <div className="absolute inset-0" data-canvas />
          <span aria-hidden className="font-sans" data-sans />
        </div>
      ) : null}

      <section className="px-[4vw] pb-[8vh] pt-[10vh]" id="work">
        <h2 className={`opacity-70 ${LABEL}`}>Work</h2>
        <div className="mt-[5vh] grid grid-cols-1 gap-x-[6vw] gap-y-[9vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <p className={`opacity-70 ${LABEL}`}>{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <h3 className={`mt-[1.2rem] text-[min(5.4vw,9rem)] ${big}`}>{p.title}</h3>
              <p className="mt-[2rem] max-w-[64rem] font-sans text-[2.1rem] font-medium leading-[1.35] tracking-[-0.01em]">{p.tagline}</p>
              <p className={`mt-[1.4rem] ${SMALL}`}>{p.stack.join(", ")}</p>
              <p className={`mt-[0.4rem] opacity-80 ${SMALL}`}>{metaOf(p)}</p>
              {p.href ? (
                <a className={`mt-[0.4rem] inline-block underline underline-offset-[0.35em] ${SMALL}`} href={p.href} rel="noreferrer" target="_blank">
                  {hostOf(p.href)}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="px-[4vw] py-[8vh]" id="skills">
        <h2 className={`opacity-70 ${LABEL}`}>Skills</h2>
        <div className="mt-[5vh] grid grid-cols-1 gap-x-[6vw] gap-y-[6vh] md:grid-cols-2">
          {skillGroups.map((g) => (
            <div key={g.label}>
              <h3 className="font-sans text-[2.8rem] font-bold leading-[1.15] tracking-[-0.02em]">{g.label}</h3>
              <p className={`mt-[1.2rem] max-w-[64rem] ${SMALL}`}>{g.skills.map((s) => s.name).join(", ")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[4vw] pb-[14vh] pt-[8vh]" id="contact">
        <h2 className={`opacity-70 ${LABEL}`}>Contact</h2>
        <a className="mt-[4vh] block break-all font-sans text-[6vw] font-bold leading-none tracking-[-0.04em]" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <ul className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]">
          <Links />
        </ul>
      </section>
    </div>
  );
}

export default function B08(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting while the page is open.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pick = (): void => setMode(webglWorks() ? (less.matches ? "still" : "journey") : "plain");
    pick();
    less.addEventListener("change", pick);
    return () => less.removeEventListener("change", pick);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || (mode !== "journey" && mode !== "still")) return undefined;
    try {
      return startStage(root, CONTENT, mode === "still");
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: PALE, color: BAND }}>
      {/* The band above is plum. The first thing under it is the same
          plum, and the pale ground comes up out of it. */}
      <div aria-hidden className="h-[38vh] w-full" style={{ background: WASH }} />
      {mode === "journey" ? <Journey /> : <Plain withStage={mode !== "plain"} />}
    </div>
  );
}
