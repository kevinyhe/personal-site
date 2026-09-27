"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { type Mode as SceneMode, startGarden } from "./garden";
import { PANEL_EDGE, PANEL_W, SKILL_ROW_Y, SKILLS_PANEL, STONES } from "./layout";

/**
 * Design 30, Garden. A dry garden seen from low down: raked sand, five
 * stones on moss, a plastered wall with a tiled roof at the back, and
 * cherry trees leaning over it, dropping petals. It is drawn in the bar
 * dither the valley and the band above use: plum bars on blossom, with
 * the sky left as the band's own plum.
 *
 * Each stone is a project. Scrolling walks the camera along the garden
 * from one stone to the next, and when it arrives the grooves round that
 * stone are redrawn as rings rippling out from it. The words stand in a
 * plum panel on the other half of the screen.
 *
 * Then the camera lifts over forty-two pebbles laid in five lines, one per
 * group of skills, each with its mark; the names are beside them. Last it
 * rises to look straight down, and the grooves ring a smoothed patch of
 * sand with the email on it.
 *
 * The cursor rakes the sand wherever it passes; the grooves settle back.
 *
 * Two layouts.
 *   journey  the pinned walk, the words laid over the canvas.
 *   plain    the words as ordinary blocks: what the server sends, what a
 *            narrow screen and a visitor who asked for less motion keep
 *            (under one still frame of the first stone), and what is
 *            left if WebGL cannot start.
 */

type Mode = "boot" | "plain" | SceneMode;

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const PANEL_STYLE = { backgroundColor: BAND, border: "0.1rem solid rgba(249, 185, 220, 0.3)" } as const;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const metaOf = (p: Project): string => (p.award ? `${p.year}. ${p.award}` : p.year);
/** The display serif draws a watermark for digits, hyphens and a few signs, so those titles are set in Inter. */
const serifSafe = (s: string): boolean => !/[0-9'"$&@!()*+/=#%\-‑]/.test(s);
const pc = (v: number): string => `${(v * 100).toFixed(2)}%`;

/** Can this browser give us the kind of canvas the scene needs? Asked of a spare canvas, let go again at once. */
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
  const serif = serifSafe(p.title);
  const size = big ? (serif ? "text-[7.6rem]" : "text-[6.2rem]") : serif ? "text-[6.4rem]" : "text-[5.2rem]";
  return (
    <h3
      className={`${size} leading-[1.02] text-white ${serif ? "font-serif-display italic tracking-[-0.02em]" : "font-sans font-light tracking-[-0.04em]"}`}
    >
      {p.title}
    </h3>
  );
}

function Details({ p }: { p: Project }): JSX.Element {
  return (
    <>
      <p className="mt-[2rem] font-sans text-[2rem] font-light leading-[1.45]">{p.tagline}</p>
      <p className="mt-[1.6rem] font-mono text-[1.4rem] leading-[1.6] text-white">{p.stack.join(" · ")}</p>
      <p className="mt-[0.6rem] font-mono text-[1.4rem] leading-[1.6] opacity-70">{metaOf(p)}</p>
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

function Links({ className, tone }: { className: string; tone: string }): JSX.Element {
  return (
    <ul className={`font-mono text-[1.5rem] ${className}`}>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.2rem] uppercase tracking-[0.2em] opacity-70">{l.label}</span>
            <span className="mt-[0.4rem] block underline-offset-[0.35em] group-hover:underline" style={{ color: tone }}>
              {l.handle}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <div className="absolute inset-0 overflow-hidden" data-canvas />
        <p
          className={`absolute bottom-[3.5vh] left-1/2 -translate-x-1/2 whitespace-nowrap px-[1.4rem] py-[0.8rem] transition-opacity duration-500 ${LABEL}`}
          data-hint
          style={{ opacity: 0.7, backgroundColor: BAND }}
        >
          Move across the sand to rake it
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] px-[1.4rem] py-[0.8rem] ${LABEL}`} style={{ backgroundColor: BAND }}>
            Work
          </h2>
          {projects.map((p, i) => {
            const right = STONES[i].side === "left";
            return (
              <article
                className="absolute top-1/2 px-[3.6rem] py-[3.2rem]"
                data-panel
                data-words={i}
                key={p.title}
                style={{
                  ...PANEL_STYLE,
                  ...(right ? { right: `${PANEL_EDGE * 100}vw` } : { left: `${PANEL_EDGE * 100}vw` }),
                  width: `${PANEL_W * 100}vw`,
                  opacity: 0,
                  pointerEvents: "none",
                  transform: "translateY(-50%)",
                }}
              >
                <p className="mb-[1.6rem] font-mono text-[1.4rem] tabular-nums opacity-70">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
                <Title big p={p} />
                <Details p={p} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 2)` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <div
            aria-hidden
            className="absolute"
            data-panel
            data-skills-panel
            style={{
              ...PANEL_STYLE,
              left: pc(SKILLS_PANEL.x0),
              width: pc(SKILLS_PANEL.x1 - SKILLS_PANEL.x0),
              top: pc(SKILLS_PANEL.y0),
              height: pc(SKILLS_PANEL.y1 - SKILLS_PANEL.y0),
            }}
          />
          <div className="absolute inset-0" data-skills-words>
            <h2
              className={`absolute opacity-70 ${LABEL}`}
              style={{ left: `calc(${pc(SKILLS_PANEL.x0)} + 3.6rem)`, top: `calc(${pc(SKILLS_PANEL.y0)} + 2.8rem)` }}
            >
              Skills
            </h2>
            {skillGroups.map((g, c) => (
              <div
                className="absolute -translate-y-1/2"
                key={g.label}
                style={{ left: `calc(${pc(SKILLS_PANEL.x0)} + 3.6rem)`, width: `calc(${pc(SKILLS_PANEL.x1 - SKILLS_PANEL.x0)} - 7.2rem)`, top: pc(SKILL_ROW_Y[c]) }}
              >
                <h3 className="font-sans text-[2rem] font-medium leading-[1.2] tracking-[-0.01em] text-white">{g.label}</h3>
                <ul className="mt-[0.6rem] flex flex-wrap gap-x-[1.4rem] font-mono text-[1.3rem] leading-[1.6]">
                  {g.skills.map((s) => (
                    <li key={s.name}>{s.name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 w-full" id="contact" style={{ height: SCREEN, color: BAND }}>
        <div className="absolute left-[15%] right-[15%] top-[36%] flex flex-col items-center text-center" data-calm>
          <h2 className={LABEL}>Contact</h2>
          <a
            className="mt-[3vh] whitespace-nowrap font-sans text-[5vw] font-light leading-none tracking-[-0.035em]"
            data-email
            href={`mailto:${EMAIL}`}
          >
            {EMAIL}
          </a>
          <Links className="mt-[5vh] flex gap-[4vw] text-left" tone={BAND} />
        </div>
      </section>
    </div>
  );
}

function Plain({ withStage }: { withStage: boolean }): JSX.Element {
  return (
    <div>
      {withStage ? (
        <div className="relative w-full overflow-hidden" data-stage style={{ height: `calc(${SCREEN} * 0.8)`, backgroundColor: BAND }}>
          <div className="absolute inset-0 overflow-hidden" data-canvas />
        </div>
      ) : null}

      <section className="px-[4.5vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-70 ${LABEL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <p className="mb-[1.2rem] font-mono text-[1.4rem] tabular-nums opacity-70">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <Title big={false} p={p} />
              <Details p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="px-[4.5vw] py-[10vh]" id="skills">
        <h2 className={`opacity-70 ${LABEL}`}>Skills</h2>
        <div className="mt-[5vh] grid grid-cols-1 gap-x-[3vw] gap-y-[5vh] sm:grid-cols-2 lg:grid-cols-5">
          {skillGroups.map((g) => (
            <div key={g.label}>
              <h3 className="font-sans text-[2.2rem] font-medium leading-[1.2] tracking-[-0.01em] text-white">{g.label}</h3>
              <ul className="mt-[1.4rem] font-mono text-[1.4rem] leading-[1.9]">
                {g.skills.map((s) => (
                  <li className="flex items-center gap-[0.8rem]" key={s.name}>
                    <SkillMark size="1.8rem" skill={s} tinted={false} />
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
        <a
          className="mt-[5vh] inline-block font-sans text-[5vw] font-light leading-none tracking-[-0.035em] text-white underline decoration-[0.2rem] underline-offset-[0.3em]"
          href={`mailto:${EMAIL}`}
          style={{ textDecorationColor: BLOSSOM }}
        >
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[4vw] gap-y-[3vh]" tone="#ffffff" />
      </section>
    </div>
  );
}

export default function B30(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting or turns a tablet on its side.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a stone with its words beside it. In a media query an
    // em is the browser's own 16, not the page's rem, so 56em is 896 wide.
    const narrow = window.matchMedia("(max-width: 56em), (orientation: portrait)");
    const pick = (): void => {
      if (!webglWorks()) setMode("plain");
      else setMode(less.matches || narrow.matches ? "still" : "journey");
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
      return startGarden(root, mode);
    } catch {
      // The garden could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
      {/* The band above is this colour. The garden's sky is the same plum,
          and this keeps the tops of the trees from starting at a hard edge
          right under it. It scrolls away with the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[16vh]"
        style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 14%, rgba(42, 13, 30, 0) 100%)` }}
      />
    </div>
  );
}
