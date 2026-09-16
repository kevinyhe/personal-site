"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { startJourney } from "./journey";

/**
 * Design 03, Blocks. A night plain in plum. Scrolling moves one camera
 * along a road past five glass blocks, one per project, each with an
 * object inside that says what the project is. Then the camera rises over
 * a field of 42 small glass cubes, the skills, and last tilts up to the
 * glow on the horizon, where the email is.
 *
 * The page has two layouts.
 *   journey  the pinned scene, with the words laid over it as readouts.
 *   plain    the words as ordinary blocks. It is what the server sends,
 *            what a visitor who asked for less motion keeps (under one
 *            still frame of the first block), and what is left if WebGL
 *            cannot start.
 */

type Mode = "boot" | "journey" | "still" | "plain";

const SCREEN = "var(--arbor-screen-h)";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
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

/** Text that types in. See Typed in journey.ts for why it is two spans. */
function Type({ text, className = "" }: { text: string; className?: string }): JSX.Element {
  return (
    <span className={className} data-type>
      <span data-on />
      <span aria-hidden className="absolute h-[1.15em] w-[0.5em] translate-y-[0.12em] bg-current opacity-0" data-caret />
      <span className="opacity-0" data-off>
        {text}
      </span>
    </span>
  );
}

const SMALL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 h-screen w-full overflow-hidden" data-stage style={{ backgroundColor: BAND }}>
        <div className="absolute inset-0" data-canvas />
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" data-lines fill="none">
          {projects.map((p, i) =>
            [0, 1].map((k) => (
              <g key={`${p.title}-${k}`}>
                <path data-lead={`${i}-${k}`} stroke={BLOSSOM} style={{ opacity: 0, strokeWidth: "0.15rem" }} />
                <rect data-end={`${i}-${k}`} stroke="#ffffff" style={{ opacity: 0, strokeWidth: "0.15rem" }} />
              </g>
            )),
          )}
          {skillGroups.map((g, r) =>
            [0, 1].map((k) => (
              <line data-row={`${r}-${k}`} key={`${g.label}-${k}`} stroke={BLOSSOM} style={{ opacity: 0, strokeWidth: "0.15rem" }} />
            )),
          )}
        </svg>
        <div
          aria-hidden
          className="absolute right-[2vw] top-1/2 -translate-y-1/2 text-right font-mono text-[1.5rem] leading-[1.6] tabular-nums"
          data-mono
        >
          <p className="text-white" data-readout-stop>
            01 / 07
          </p>
          <p className="opacity-70" data-readout-frac>
            0.000
          </p>
        </div>
        <p
          className={`absolute bottom-[3.5vh] left-1/2 -translate-x-1/2 transition-opacity duration-500 ${SMALL}`}
          data-hint
          style={{ opacity: 0.6 }}
        >
          Scroll to travel
        </p>
      </div>

      <section
        className="pointer-events-none relative z-10"
        id="work"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}
      >
        <div className="sticky top-0 h-screen w-full" data-work-layer>
          <h2 className={`absolute left-[4vw] top-[6vh] opacity-60 ${SMALL}`}>Work</h2>
          {projects.map((p, i) => (
            <article className="absolute inset-0" data-stop={i} key={p.title} style={{ pointerEvents: "none" }}>
              <div className="absolute left-[4vw] top-[13vh] w-[30vw]">
                <p className="font-mono text-[1.6rem] opacity-80">
                  <Type text={`// ${pad2(i + 1)}`} />
                </p>
                <h3 className="mt-[1rem] font-sans text-[4.6rem] font-medium leading-[1.08] tracking-[-0.02em] text-white">
                  <Type text={p.title} />
                </h3>
                <div className="mt-[1.8rem] h-[0.15rem] w-full" data-rule="0">
                  <div className="h-full w-full origin-left" data-rule-ink style={{ backgroundColor: BLOSSOM, transform: "scaleX(0)" }} />
                </div>
              </div>

              <div className="absolute right-[7vw] top-[13vh] w-[22vw] text-right font-mono">
                <p className="text-[1.4rem] uppercase tracking-[0.2em] opacity-60">
                  <Type text="Stack" />
                </p>
                <ul className="mt-[1rem] text-[1.6rem] leading-[1.55] text-white">
                  {p.stack.map((s) => (
                    <li key={s}>
                      <Type text={s} />
                    </li>
                  ))}
                </ul>
              </div>

              <p className="absolute bottom-[11vh] left-[4vw] w-[30vw] font-mono text-[1.7rem] leading-[1.55]">
                <Type text={p.tagline} />
              </p>

              <div className="absolute bottom-[11vh] right-[7vw] w-[24vw] text-right font-mono text-[1.6rem] leading-[1.55]">
                <div className="mb-[1.8rem] h-[0.15rem] w-full" data-rule="1">
                  <div className="h-full w-full origin-right" data-rule-ink style={{ backgroundColor: BLOSSOM, transform: "scaleX(0)" }} />
                </div>
                <p className="text-white">
                  <Type text={metaOf(p)} />
                </p>
                {p.href ? (
                  <a className="underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
                    <Type text={hostOf(p.href)} />
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 2)` }}>
        <div className="sticky top-0 h-screen w-full opacity-0" data-skills-layer>
          <h2 className="absolute left-[4vw] top-[8vh] font-mono text-[1.6rem]">
            <Type className="opacity-80" text="// 06" />
            <span className="ml-[1.6rem] font-sans text-[3.2rem] font-medium tracking-[-0.02em] text-white">
              <Type text="Skills" />
            </span>
          </h2>
          {skillGroups.map((g, r) => (
            <div data-skill-row={r} key={g.label}>
              <h3
                className="absolute left-0 top-0 w-max text-right font-mono text-[1.6rem] text-white will-change-transform"
                data-skill-label
              >
                <Type text={g.label} />
              </h3>
              <p
                className="absolute left-0 top-0 w-[22vw] font-mono text-[1.4rem] leading-[1.5] will-change-transform"
                data-skill-names
              >
                <Type text={g.skills.map((s) => s.name).join(", ")} />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 h-screen w-full" id="contact">
        <h2 className="absolute left-[4vw] top-[14vh] font-mono text-[1.6rem]">
          <span className="opacity-80">{"// 07"}</span>
          <span className="ml-[1.6rem] uppercase tracking-[0.2em] opacity-80">Contact</span>
        </h2>
        <a
          className="absolute left-[4vw] top-[26vh] font-sans text-[6.2vw] font-light leading-none tracking-[-0.035em] text-white"
          href={`mailto:${EMAIL}`}
        >
          {EMAIL}
        </a>
        <ul className="absolute left-[4vw] top-[45vh] flex gap-[3.5vw] font-mono text-[1.6rem]">
          {elsewhere.map((l) => (
            <li key={l.href}>
              <a className="group block" href={l.href} rel="noreferrer" target="_blank">
                <span className="block text-[1.3rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
                <span className="mt-[0.4rem] block text-white underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Plain({ withStage }: { withStage: boolean }): JSX.Element {
  return (
    <div>
      {withStage ? (
        <div className="relative h-screen w-full overflow-hidden" data-stage style={{ backgroundColor: BAND }}>
          <div className="absolute inset-0" data-canvas />
          <p aria-hidden className={`absolute bottom-[5vh] left-[4vw] opacity-70 ${SMALL}`} data-mono>
            {`// ${pad2(1)} ${projects[0].title}`}
          </p>
        </div>
      ) : null}

      <section className="px-[4vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-60 ${SMALL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article className="border-l-[0.15rem] pl-[2.4rem]" key={p.title} style={{ borderColor: BLOSSOM }}>
              <p className="font-mono text-[1.6rem] opacity-80">{`// ${pad2(i + 1)}`}</p>
              <h3 className="mt-[1rem] font-sans text-[4.2rem] font-medium leading-[1.08] tracking-[-0.02em] text-white">{p.title}</h3>
              <p className="mt-[1.6rem] max-w-[62rem] font-mono text-[1.7rem] leading-[1.55]">{p.tagline}</p>
              <p className="mt-[1.6rem] font-mono text-[1.5rem] leading-[1.55] text-white">{p.stack.join(", ")}</p>
              <p className="mt-[0.8rem] font-mono text-[1.5rem] leading-[1.55] opacity-80">{metaOf(p)}</p>
              {p.href ? (
                <a
                  className="mt-[0.8rem] inline-block font-mono text-[1.5rem] underline underline-offset-[0.35em]"
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

      <section className="px-[4vw] py-[10vh]" id="skills">
        <h2 className={`opacity-60 ${SMALL}`}>Skills</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[6vh] md:grid-cols-2">
          {skillGroups.map((g) => (
            <div className="border-l-[0.15rem] pl-[2.4rem]" key={g.label} style={{ borderColor: BLOSSOM }}>
              <h3 className="font-sans text-[2.8rem] font-medium tracking-[-0.02em] text-white">{g.label}</h3>
              <p className="mt-[1.2rem] max-w-[62rem] font-mono text-[1.6rem] leading-[1.6]">{g.skills.map((s) => s.name).join(", ")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[4vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-60 ${SMALL}`}>Contact</h2>
        <a
          className="mt-[5vh] block font-sans text-[6.2vw] font-light leading-none tracking-[-0.035em] text-white"
          href={`mailto:${EMAIL}`}
        >
          {EMAIL}
        </a>
        <ul className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh] font-mono text-[1.6rem]">
          {elsewhere.map((l) => (
            <li key={l.href}>
              <a className="group block" href={l.href} rel="noreferrer" target="_blank">
                <span className="block text-[1.3rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
                <span className="mt-[0.4rem] block text-white underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function B03(): JSX.Element {
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
      return startJourney(root, mode === "still");
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode !== "plain"} />}
      {/* The band above is this colour. Whatever the sky is doing, the
          first thing under the band is the band's own plum, and the scene
          comes up out of it. It scrolls away with the page. */}
      {mode !== "plain" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[26vh]"
          style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 12%, rgba(42, 13, 30, 0) 100%)` }}
        />
      ) : null}
    </div>
  );
}
