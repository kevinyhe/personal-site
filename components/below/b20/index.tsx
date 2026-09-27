"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { type Mode as SceneMode, startBrush } from "./brush";
import { SIDES } from "./layout";

/**
 * Design 20, Brush. A deep plum page ruled by a faint blossom grid. As the
 * page scrolls, a brush paints one stroke per project across it: a ribbon
 * in 3D that twists as a brush turns in the hand, dry at its edges and
 * where the ink runs out. When a stroke is finished, blossoms burst from
 * its end and drift down, and the stroke lifts up the page and back into
 * it as a faint ghost, so the work leaves a trail. The project's name
 * stands large beside it.
 *
 * Then five short strokes, one per group of skills, each ending in a
 * cluster of blossoms carrying the skill marks; and one long stroke under
 * the email.
 *
 * The strokes and blossoms go through the bar dither, as the band above
 * does: they are blossom bars, and the grid shows between them. The
 * cursor leaves a faint wet trail on the grid, which dries.
 *
 * Two layouts.
 *   journey  the pinned sequence, the words laid over the canvas.
 *   plain    the words as ordinary blocks: what the server sends, what a
 *            narrow screen and a visitor who asked for less motion keep
 *            (under one still stage of the five strokes), and what is left
 *            if WebGL cannot start.
 */

type Mode = "boot" | "plain" | SceneMode;

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const metaOf = (p: Project): string => (p.award ? `${p.year}. ${p.award}` : p.year);
/** The display serif draws a watermark for digits, hyphens and a few signs, so those titles are set in Inter. */
const serifSafe = (s: string): boolean => !/[0-9'"$&@!()*+/=#%\-‑]/.test(s);

/** Faint blossom hairlines every 8rem, across and down. */
const GRID = {
  backgroundColor: BAND,
  backgroundImage:
    "linear-gradient(to right, rgba(249, 185, 220, 0.07) 0.1rem, transparent 0.1rem), linear-gradient(to bottom, rgba(249, 185, 220, 0.07) 0.1rem, transparent 0.1rem)",
  backgroundSize: "8rem 8rem",
  backgroundPosition: "center center",
} as const;

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
  const size = big ? (serif ? "text-[10rem]" : "text-[8rem]") : serif ? "text-[6.4rem]" : "text-[5.2rem]";
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
      <p className="mt-[2.4rem] font-mono text-[1.6rem] leading-[1.6]">{p.tagline}</p>
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

function Links({ className }: { className: string }): JSX.Element {
  return (
    <ul className={`font-mono text-[1.5rem] ${className}`}>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.2rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
            <span className="mt-[0.4rem] block text-white underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, ...GRID }}>
        <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-trail />
        <div className="absolute inset-0 overflow-hidden" data-canvas />
        <p
          className={`absolute bottom-[4vh] left-1/2 -translate-x-1/2 whitespace-nowrap transition-opacity duration-500 ${LABEL}`}
          data-hint
          style={{ opacity: 0.6 }}
        >
          Scroll to paint. The cursor wets the grid.
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${LABEL}`}>Work</h2>
          {projects.map((p, i) => (
            <article
              className={`absolute top-1/2 w-[34vw] ${SIDES[i] === "left" ? "left-[6vw]" : "right-[6vw]"}`}
              data-title={i}
              key={p.title}
              style={{ opacity: 0, pointerEvents: "none", transform: "translateY(-50%)" }}
            >
              <p className="mb-[1.6rem] font-mono text-[1.5rem] tabular-nums opacity-70">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <Title big p={p} />
              <Details p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 2)` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${LABEL}`}>Skills</h2>
          {skillGroups.map((g, c) => (
            <div className="absolute top-[54%] w-[17vw]" key={g.label} style={{ left: `${5 + 19 * c}vw` }}>
              <h3 className="font-sans text-[2.2rem] font-medium leading-[1.2] tracking-[-0.01em] text-white">{g.label}</h3>
              <ul className="mt-[1.4rem] font-mono text-[1.4rem] leading-[1.9]">
                {g.skills.map((s) => (
                  <li key={s.name}>{s.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 w-full" id="contact" style={{ height: SCREEN }}>
        <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${LABEL}`}>Contact</h2>
        <a
          className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-sans text-[5.2vw] font-light leading-none tracking-[-0.035em] text-white"
          data-email
          href={`mailto:${EMAIL}`}
        >
          {EMAIL}
        </a>
        <Links className="absolute left-1/2 top-[66%] flex -translate-x-1/2 gap-[4vw] text-left" />
      </section>
    </div>
  );
}

function Plain({ withStage }: { withStage: boolean }): JSX.Element {
  return (
    <div>
      {withStage ? (
        <div className="relative w-full overflow-hidden" data-stage style={{ height: `calc(${SCREEN} * 0.8)`, ...GRID }}>
          <div className="absolute inset-0 overflow-hidden" data-canvas />
        </div>
      ) : null}

      <section className="px-[4.5vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-60 ${LABEL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <p className="mb-[1.2rem] font-mono text-[1.5rem] tabular-nums opacity-70">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <Title big={false} p={p} />
              <Details p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="px-[4.5vw] py-[10vh]" id="skills">
        <h2 className={`opacity-60 ${LABEL}`}>Skills</h2>
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
        <h2 className={`opacity-60 ${LABEL}`}>Contact</h2>
        <a
          className="mt-[5vh] inline-block font-sans text-[5.2vw] font-light leading-none tracking-[-0.035em] text-white underline decoration-[0.2rem] underline-offset-[0.3em]"
          href={`mailto:${EMAIL}`}
          style={{ textDecorationColor: BLOSSOM }}
        >
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[4vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

export default function B20(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting or turns a tablet on its side.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a stroke with its text beside it. In a media query an
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
      return startBrush(root, mode);
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
      {/* The band above is this colour. The first thing under it is the
          band's own plum with no grid on it, and the grid comes up out of
          it. It scrolls away with the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[18vh]"
        style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 12%, rgba(42, 13, 30, 0) 100%)` }}
      />
    </div>
  );
}
