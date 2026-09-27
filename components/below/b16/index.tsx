"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { CARD_WIDTH, cardRect, CONTACT_SCREENS, SKILLS_SCREENS, TOTAL_SCREENS, WORK_SCREENS } from "./layout";

/**
 * Design 16, Bough. One large cherry, grown by the site's own tree code
 * and drawn in the valley's bars. Scrolling climbs the trunk. Five
 * branches reach out left and right, one per project; as the camera comes
 * level with one its blossoms open, petals fall from it, and the project
 * is set on the other side of the screen. Each branch has a small object
 * hanging from it that stands for the project. At the top is the crown,
 * with the skills on 42 of its blossoms, and above it the sky, where the
 * ground turns blossom and the email is.
 *
 * Three layouts.
 *   journey  the pinned climb, words laid over it.
 *   still    one frame of the whole tree in bloom, then the words as blocks:
 *            reduced motion, and a screen too narrow for words beside a branch.
 *   plain    the words alone. What the server sends, and what stays if WebGL
 *            cannot start.
 */

type Mode = "boot" | "plain" | "still" | "journey";

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const metaOf = (p: Project): string => (p.award ? `${p.year}. ${p.award}` : p.year);
/** The display serif is a demo cut: it draws a flower for these, and for digits. */
const serifSafe = (s: string): boolean => !/[0-9@&'"$!()*+/=#%-]/.test(s);

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

function Title({ text, className = "" }: { text: string; className?: string }): JSX.Element {
  return serifSafe(text) ? (
    <h3 className={`font-serif-display text-[6.4rem] italic leading-[1] tracking-[-0.02em] text-white ${className}`}>{text}</h3>
  ) : (
    <h3 className={`font-sans text-[5.4rem] font-light leading-[1.02] tracking-[-0.03em] text-white ${className}`}>{text}</h3>
  );
}

function ProjectBody({ p, i }: { p: Project; i: number }): JSX.Element {
  return (
    <>
      <p className="font-mono text-[1.4rem] tabular-nums tracking-[0.12em] opacity-70">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
      <Title className="mt-[1.6rem]" text={p.title} />
      <p className="mt-[2rem] font-sans text-[2rem] font-light leading-[1.5]">{p.tagline}</p>
      <p className="mt-[1.8rem] font-mono text-[1.4rem] leading-[1.6] text-white">{p.stack.join(", ")}</p>
      <p className="mt-[0.6rem] font-mono text-[1.4rem] leading-[1.6] opacity-80">{metaOf(p)}</p>
      {p.href ? (
        <a className="mt-[0.6rem] inline-block font-mono text-[1.4rem] leading-[1.6] underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
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
            <span className="mt-[0.4rem] block underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Journey(): JSX.Element {
  let k = -1;
  return (
    <div className="relative" data-journey style={{ height: `calc(${SCREEN} * ${TOTAL_SCREENS})` }}>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <canvas
          aria-hidden
          className="absolute left-0 top-0 block"
          data-bars
          style={{
            width: "calc(100% / var(--b16-k, 1))",
            height: "calc(100% / var(--b16-k, 1))",
            transform: "scale(var(--b16-k, 1))",
            transformOrigin: "0 0",
          }}
        />
        <p className={`absolute bottom-[4vh] left-1/2 -translate-x-1/2 whitespace-nowrap opacity-70 transition-opacity duration-500 ${LABEL}`} data-hint>
          Scroll to climb. The cursor moves the branches.
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${WORK_SCREENS})` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[5vw] top-[7vh] opacity-60 ${LABEL}`}>Work</h2>
          {projects.map((p, i) => {
            const r = cardRect(i);
            return (
              <article
                className="absolute"
                data-card={i}
                key={p.title}
                style={{ left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`, width: `${CARD_WIDTH * 100}%`, opacity: 0, visibility: "hidden" }}
              >
                <ProjectBody i={i} p={p} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * ${SKILLS_SCREENS})` }}>
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <h2 className={`absolute left-[5vw] top-[7vh] opacity-60 ${LABEL}`}>Skills</h2>
          <p className={`absolute right-[5vw] top-[7vh] opacity-60 ${LABEL}`}>Point at a blossom to name it.</p>
          {skillGroups.map((g, gi) => (
            <div key={g.label}>
              <h3
                className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[1.5rem] uppercase tracking-[0.18em] text-white"
                data-group={gi}
                style={{ left: "50%", top: "50%" }}
              >
                {g.label}
              </h3>
              <ul>
                {g.skills.map((s) => {
                  k += 1;
                  return (
                    <li
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      data-group-index={gi}
                      data-skill={k}
                      key={s.name}
                      style={{ left: "50%", top: "50%", pointerEvents: "none" }}
                    >
                      <button className="group relative block rounded-full outline-offset-[0.3rem]" type="button">
                        <span
                          className="flex h-[3.4rem] w-[3.4rem] items-center justify-center rounded-full"
                          style={{ backgroundColor: "rgba(42, 13, 30, 0.78)", color: BLOSSOM }}
                        >
                          <SkillMark size="2rem" skill={s} tinted={false} />
                        </span>
                        <span
                          className="pointer-events-none absolute left-1/2 top-[calc(100%+0.6rem)] -translate-x-1/2 whitespace-nowrap bg-white px-[0.8rem] py-[0.4rem] font-mono text-[1.4rem] leading-none opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
                          style={{ color: BAND }}
                        >
                          {s.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 w-full" id="contact" style={{ height: `calc(${SCREEN} * ${CONTACT_SCREENS})`, color: BAND }}>
        <div className="absolute inset-0" data-contact-body style={{ opacity: 0 }}>
          <h2 className={`absolute left-[5vw] top-[12vh] opacity-70 ${LABEL}`}>Contact</h2>
          <div className="absolute inset-x-0 top-[40%] -translate-y-1/2 text-center">
            <a className="font-sans text-[6.2vw] font-light leading-none tracking-[-0.035em] underline-offset-[0.12em] hover:underline" href={`mailto:${EMAIL}`}>
              {EMAIL}
            </a>
            <Links className="mt-[6vh] flex justify-center gap-[3.5vw] text-left" />
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
          <canvas
            aria-hidden
            className="absolute left-0 top-0 block"
            data-bars
            style={{
              width: "calc(100% / var(--b16-k, 1))",
              height: "calc(100% / var(--b16-k, 1))",
              transform: "scale(var(--b16-k, 1))",
              transformOrigin: "0 0",
            }}
          />
        </div>
      ) : null}

      <section className="px-[5vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-60 ${LABEL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article className="max-w-[70rem]" key={p.title}>
              <ProjectBody i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="px-[5vw] py-[10vh]" id="skills">
        <h2 className={`opacity-60 ${LABEL}`}>Skills</h2>
        {skillGroups.map((g) => (
          <div className="mt-[3.4rem] grid grid-cols-[26rem_1fr] gap-x-[2rem]" key={g.label}>
            <h3 className="font-mono text-[1.5rem] uppercase tracking-[0.18em] text-white">{g.label}</h3>
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
      </section>

      <section className="px-[5vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-60 ${LABEL}`}>Contact</h2>
        <a className="mt-[5vh] block font-sans text-[6.2vw] font-light leading-none tracking-[-0.035em] text-white" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

export default function B16(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Words beside a branch need width. In a media query an em is the
    // browser's 16, not the page's rem: 56em is 896 wide.
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
    if (!root || (mode !== "journey" && mode !== "still")) return undefined;
    let stop: (() => void) | null = null;
    let cancelled = false;
    // The scene and the tree generator load only here, in the browser.
    import("./driver")
      .then(({ startBough }) => {
        if (cancelled) return;
        stop = startBough(root, mode);
      })
      .catch(() => {
        // The scene could not start. The words stand without it.
        if (!cancelled) setMode("plain");
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [mode]);

  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
      {/* The band above is this plum. The first rows under it are plum
          too, whatever the tree is doing, and the bars come up out of it.
          It scrolls away with the page. */}
      {mode === "journey" || mode === "still" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[14vh]"
          style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 12%, rgba(42, 13, 30, 0) 100%)` }}
        />
      ) : null}
    </div>
  );
}
