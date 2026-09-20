"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { startStills, startTilt } from "./drive";
import { EMAIL_TRACK, fitEmail, fitTitle, GROUND, INK, TEXT_LEFT, TEXT_WIDTH, TITLE_LEADING, TITLE_TRACK } from "./layout";

/**
 * Design 09, Tilt. One project to a screen. The ground is one colour,
 * edge to edge, and changes with the project. The project's name stands
 * large at the left. At the right a large plane hangs tilted in space and
 * shows a moving picture of the project; smaller planes behind and below
 * it show parts of the same picture. Going to the next project sends a
 * wave through the planes while the picture changes.
 *
 * After the five projects the planes fan out into five cards, one per
 * group of skills. Last, the cards fall into one sheet that covers the
 * screen and is the ground the email stands on.
 *
 * The page has two layouts.
 *   journey  the pinned scene, with the words laid over it.
 *   stacked  the words as ordinary blocks, one project under another. It
 *            is what the server sends, what a visitor who asked for less
 *            motion keeps (with a still of each plane beside its words),
 *            what a narrow window gets, and what is left if WebGL cannot
 *            start.
 */

type Mode = "boot" | "journey" | "still" | "plain";

const SCREEN = "var(--arbor-screen-h)";
const SMALL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const STEP_NAMES = [...projects.map((p) => p.title), "Skills", "Contact"];
const pad2 = (n: number): string => String(n).padStart(2, "0");
const metaOf = (p: (typeof projects)[number]): string => (p.award ? `${p.year}. ${p.award}` : p.year);

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
        <li data-rise key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.3rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
            <span className="mt-[0.4rem] block underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
          </a>
        </li>
      ))}
    </>
  );
}

function Journey(): JSX.Element {
  const email = fitEmail(EMAIL);
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <div aria-hidden className="absolute inset-0" data-canvas />
        <nav aria-label="Steps" className="absolute right-[1.6vw] top-1/2 z-20 flex -translate-y-1/2 flex-col items-end">
          {STEP_NAMES.map((name, i) => (
            <button
              aria-label={`Go to ${name}`}
              className={`flex h-[2.4rem] w-[4rem] items-center ${i === projects.length ? "mt-[2.4rem]" : ""}`}
              data-mark={i}
              key={name}
              type="button"
            >
              <span
                className="block h-[0.25rem] w-full origin-right bg-current transition-[transform,opacity] duration-500"
                style={{ transform: "scaleX(0.4)", opacity: 0.45 }}
              />
            </button>
          ))}
        </nav>
        <p className={`absolute bottom-[3.5vh] left-[5vw] ${SMALL}`} data-hint>
          <span className="opacity-60">Scroll, or click a mark.</span>
        </p>
      </div>

      <section
        className="pointer-events-none relative z-10"
        id="work"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}
      >
        <div className="sticky top-0 w-full will-change-transform" data-layer="work" style={{ height: SCREEN }}>
          <h2 className={`absolute top-[7vh] transition-opacity duration-500 ${SMALL}`} data-work-label style={{ left: `${TEXT_LEFT}vw` }}>
            <span className="opacity-60">Work</span>
          </h2>
          {projects.map((p, i) => {
            const fit = fitTitle(p.title);
            return (
              <article
                className="absolute top-[15vh]"
                data-step={i}
                key={p.title}
                style={{ left: `${TEXT_LEFT}vw`, width: `${TEXT_WIDTH}vw` }}
              >
                <p className="font-mono text-[1.5rem] leading-[1.4] tabular-nums" data-rise>
                  {`${pad2(i + 1)} / ${pad2(projects.length)}`}
                </p>
                <h3
                  aria-label={p.title}
                  className="mt-[2.4rem] font-sans font-medium"
                  data-size={fit.size}
                  data-title
                  style={{ fontSize: `${fit.size}vw`, lineHeight: TITLE_LEADING, letterSpacing: `${TITLE_TRACK}em` }}
                >
                  {fit.lines.map((line) => (
                    <span aria-hidden className="block whitespace-nowrap" data-letters key={line}>
                      {line}
                    </span>
                  ))}
                </h3>
                <p className="mt-[3.2rem] w-[30vw] font-sans text-[2.3rem] leading-[1.45]" data-rise>
                  {p.tagline}
                </p>
                <p className="mt-[2.4rem] w-[30vw] font-mono text-[1.5rem] leading-[1.6]" data-rise>
                  <span className="opacity-80">{p.stack.join(", ")}</span>
                </p>
                <p className="mt-[1rem] font-mono text-[1.5rem] leading-[1.6]" data-rise>
                  {metaOf(p)}
                </p>
                {p.href ? (
                  <a
                    aria-label={`Open ${p.title}`}
                    className={`mt-[3rem] inline-block underline underline-offset-[0.4em] ${SMALL}`}
                    data-rise
                    href={p.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: SCREEN }}>
        <div className="absolute inset-0 will-change-transform" data-layer="skills" data-step={projects.length}>
          <h2 className={`absolute top-[7vh] ${SMALL}`} data-rise style={{ left: `${TEXT_LEFT}vw` }}>
            <span className="opacity-60">Skills</span>
          </h2>
          <div className="absolute left-[12vw] right-[12vw] top-[69vh] grid grid-cols-5 gap-x-[2vw]">
            {skillGroups.map((g, i) => (
              <div className="transition-opacity duration-300" data-group={i} key={g.label}>
                <div data-rise>
                  <h3 className="font-sans text-[2.2rem] font-medium leading-[1.2] tracking-[-0.02em]">{g.label}</h3>
                  <p className="mt-[1rem] font-mono text-[1.35rem] leading-[1.55]">{g.skills.map((s) => s.name).join(", ")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="contact" style={{ height: SCREEN }}>
        <div className="absolute inset-0 will-change-transform" data-layer="contact" data-step={projects.length + 1}>
          <h2 className={`absolute top-[7vh] ${SMALL}`} data-rise style={{ left: `${TEXT_LEFT}vw` }}>
            <span className="opacity-60">Contact</span>
          </h2>
          <a
            aria-label={EMAIL}
            className="absolute top-[30vh] whitespace-nowrap font-sans font-medium leading-none"
            href={`mailto:${EMAIL}`}
            style={{ left: `${TEXT_LEFT}vw`, fontSize: `${email.size}vw`, letterSpacing: `${EMAIL_TRACK}em` }}
          >
            <span aria-hidden className="block" data-letters>
              {EMAIL}
            </span>
          </a>
          <ul className="absolute top-[54vh] flex gap-[4vw] font-mono text-[1.6rem]" style={{ left: `${TEXT_LEFT}vw` }}>
            <Links />
          </ul>
        </div>
      </section>
    </div>
  );
}

/** The tilt of the large plane, for a still that is an ordinary canvas. */
const STILL_TILT = "perspective(160rem) rotateY(-24deg) rotateX(8deg) rotateZ(-3deg)";

function Stacked({ stills }: { stills: boolean }): JSX.Element {
  const email = fitEmail(EMAIL);
  return (
    <div>
      <section id="work">
        {projects.map((p, i) => {
          const fit = fitTitle(p.title);
          return (
            <article
              className="flex min-h-[70vh] flex-col justify-center gap-[6vh] px-[5vw] py-[12vh] md:flex-row md:items-center md:justify-between"
              key={p.title}
              style={{ backgroundColor: GROUND[i], color: INK[i] }}
            >
              <div className="md:w-[41vw]">
                {i === 0 ? (
                  <h2 className={`mb-[6vh] ${SMALL}`}>
                    <span className="opacity-60">Work</span>
                  </h2>
                ) : null}
                <p className="font-mono text-[1.5rem] leading-[1.4] tabular-nums">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
                <h3
                  className="mt-[2.4rem] font-sans font-medium"
                  style={{ fontSize: `max(${fit.size}vw, 4.5rem)`, lineHeight: TITLE_LEADING, letterSpacing: `${TITLE_TRACK}em` }}
                >
                  {p.title}
                </h3>
                <p className="mt-[3.2rem] max-w-[64rem] font-sans text-[2.3rem] leading-[1.45]">{p.tagline}</p>
                <p className="mt-[2.4rem] max-w-[64rem] font-mono text-[1.5rem] leading-[1.6] opacity-80">{p.stack.join(", ")}</p>
                <p className="mt-[1rem] font-mono text-[1.5rem] leading-[1.6]">{metaOf(p)}</p>
                {p.href ? (
                  <a
                    aria-label={`Open ${p.title}`}
                    className={`mt-[3rem] inline-block underline underline-offset-[0.4em] ${SMALL}`}
                    href={p.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open
                  </a>
                ) : null}
              </div>
              {stills ? (
                <div className="md:w-[40vw]">
                  <canvas
                    aria-hidden
                    className="block aspect-[16/10] w-full rounded-[1.2rem] shadow-[1.5rem_3rem_6rem_rgba(10,0,8,0.35)]"
                    data-still={i}
                    style={{ transform: STILL_TILT }}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="px-[5vw] py-[12vh]" id="skills" style={{ backgroundColor: BAND, color: BLOSSOM }}>
        <h2 className={SMALL}>
          <span className="opacity-60">Skills</span>
        </h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[4vw] gap-y-[6vh] md:grid-cols-3">
          {skillGroups.map((g) => (
            <div key={g.label}>
              <h3 className="font-sans text-[2.6rem] font-medium leading-[1.2] tracking-[-0.02em]">{g.label}</h3>
              <p className="mt-[1.2rem] max-w-[62rem] font-mono text-[1.5rem] leading-[1.6]">{g.skills.map((s) => s.name).join(", ")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[5vw] pb-[18vh] pt-[12vh]" id="contact" style={{ backgroundColor: BLOSSOM, color: BAND }}>
        <h2 className={SMALL}>
          <span className="opacity-60">Contact</span>
        </h2>
        <a
          className="mt-[6vh] block break-all font-sans font-medium leading-none"
          href={`mailto:${EMAIL}`}
          style={{ fontSize: `max(${email.size}vw, 3.4rem)`, letterSpacing: `${EMAIL_TRACK}em` }}
        >
          {EMAIL}
        </a>
        <ul className="mt-[7vh] flex flex-wrap gap-x-[4vw] gap-y-[3vh] font-mono text-[1.6rem]">
          <Links />
        </ul>
      </section>
    </div>
  );
}

export default function B09(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting or the window's shape.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // The scene needs room for words at the left and a plane at the
    // right. A tall or narrow window gets the stacked page.
    const roomy = window.matchMedia("(min-aspect-ratio: 5/4) and (min-width: 56.25em)");
    const pick = (): void => setMode(webglWorks() ? (less.matches || !roomy.matches ? "still" : "journey") : "plain");
    pick();
    less.addEventListener("change", pick);
    roomy.addEventListener("change", pick);
    return () => {
      less.removeEventListener("change", pick);
      roomy.removeEventListener("change", pick);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || (mode !== "journey" && mode !== "still")) return undefined;
    try {
      if (mode === "journey") return startTilt(root);
      startStills(root);
      return undefined;
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div
      className="relative w-full"
      ref={rootRef}
      style={{ backgroundColor: BAND, color: mode === "journey" ? `var(--b09-ink, ${BLOSSOM})` : BLOSSOM }}
    >
      {mode === "journey" ? <Journey /> : <Stacked stills={mode === "still"} />}
    </div>
  );
}
