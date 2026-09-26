"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { GROUPS, WORD_SIDE, WORK } from "./layout";
import { type Mode as SceneMode, startLetters } from "./stage";

/**
 * Design 24, Letters. Each project's name stands on the plum page as a
 * solid word: hundreds of small lit tiles, drawn through the bar dither the
 * band above is drawn in, so the letters are blossom bars with their sides
 * in shade. As the page scrolls the word breaks from its left edge: the
 * tiles bend into petals, a gust carries them right and up, and they come
 * down as the next name. The cursor pushes the tiles near it aside and they
 * rock back into place when it moves on.
 *
 * After the five names the petals spell the five groups of skills in turn,
 * with the skills listed under each, and last the email.
 *
 * Two layouts.
 *   journey  the pinned sequence, the words beside the tiles.
 *   plain    the words as ordinary blocks: what the server sends, what a
 *            narrow screen and a visitor who asked for less motion keep
 *            (under one still word), and what is left if WebGL cannot start.
 */

type Mode = "boot" | "plain" | SceneMode;

const SCREEN = "var(--arbor-screen-h)";
const LABEL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif draws a watermark for digits, hyphens and a few signs, so those names are set in Inter. */
const serifSafe = (s: string): boolean => !/[0-9'"$&@!()*+/=#%\-‑]/.test(s);

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

function Title({ p, size }: { p: Project; size: "small" | "large" }): JSX.Element {
  const serif = serifSafe(p.title);
  const big = size === "large";
  return (
    <h3
      className={`leading-[1.05] text-white ${serif ? "font-serif-display italic tracking-[-0.01em]" : "font-sans font-light tracking-[-0.03em]"} ${
        big ? (serif ? "text-[6.4rem]" : "text-[5.2rem]") : serif ? "text-[4.4rem]" : "text-[3.6rem]"
      }`}
    >
      {p.title}
    </h3>
  );
}

function Details({ p }: { p: Project }): JSX.Element {
  return (
    <>
      <p className="mt-[2rem] font-sans text-[2rem] font-light leading-[1.5]">{p.tagline}</p>
      <p className="mt-[1.8rem] font-mono text-[1.4rem] leading-[1.7] text-white">{p.stack.join(" · ")}</p>
      <p className="mt-[0.6rem] font-mono text-[1.4rem] leading-[1.7] opacity-70">{p.award ? `${p.year} · ${p.award}` : p.year}</p>
      {p.href ? (
        <a
          className="mt-[0.8rem] inline-block font-mono text-[1.4rem] leading-[1.7] underline underline-offset-[0.35em]"
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

function SkillList({ c, center }: { c: number; center: boolean }): JSX.Element {
  return (
    <ul className={`mt-[1.8rem] flex flex-wrap gap-x-[3rem] gap-y-[1.2rem] font-mono text-[1.6rem] leading-[1.4] ${center ? "justify-center" : ""}`}>
      {skillGroups[c].skills.map((s) => (
        <li className="flex items-center gap-[0.8rem]" key={s.name}>
          <SkillMark size="1.8rem" skill={s} tinted={false} />
          {s.name}
        </li>
      ))}
    </ul>
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

/** The serif's family, read by the scene so it can draw the words in it. */
function SerifProbe(): JSX.Element {
  return <span aria-hidden className="hidden font-serif-display italic" data-serif />;
}

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <div className="absolute inset-0 overflow-hidden" data-canvas />
        <p
          className={`absolute bottom-[4vh] left-1/2 -translate-x-1/2 whitespace-nowrap transition-opacity duration-500 ${LABEL}`}
          data-hint
          style={{ opacity: 0.6 }}
        >
          Scroll and the words break into petals. The cursor pushes them.
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${LABEL}`}>Work</h2>
          {projects.map((p, i) => (
            <article
              className={`absolute top-1/2 w-[31vw] ${WORD_SIDE[i] === "left" ? "left-[63vw]" : "left-[6vw]"}`}
              data-form={i}
              key={p.title}
              style={{ opacity: i === 0 ? 1 : 0, pointerEvents: "none", transform: "translateY(-50%)" }}
            >
              <p className="mb-[1.4rem] font-mono text-[1.5rem] tabular-nums opacity-70">{`${pad2(i + 1)} / ${pad2(WORK)}`}</p>
              <Title p={p} size="large" />
              <Details p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 5)` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${LABEL}`}>Skills</h2>
          {skillGroups.map((g, c) => (
            <div
              className="absolute left-[14vw] top-[66%] w-[72vw] text-center"
              data-form={WORK + c}
              key={g.label}
              style={{ opacity: 0, pointerEvents: "none", transform: "translateY(-50%)" }}
            >
              <h3 className="font-mono text-[1.5rem] uppercase tracking-[0.2em] text-white">
                <span className="tabular-nums opacity-70">{`${pad2(c + 1)} / ${pad2(GROUPS)}`}</span>
                <span className="ml-[2rem]">{g.label}</span>
              </h3>
              <SkillList c={c} center />
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 w-full" id="contact" style={{ height: SCREEN }}>
        <h2 className={`absolute left-[4.5vw] top-[7vh] opacity-60 ${LABEL}`}>Contact</h2>
        <div className="absolute inset-x-0 top-[62%] flex flex-col items-center">
          <a className="font-mono text-[2.2rem] text-white underline underline-offset-[0.35em]" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <Links className="mt-[4vh] flex gap-[4vw] text-left" />
        </div>
      </section>
      <SerifProbe />
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
        <h2 className={`opacity-60 ${LABEL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <p className="mb-[1.2rem] font-mono text-[1.5rem] tabular-nums opacity-70">{`${pad2(i + 1)} / ${pad2(WORK)}`}</p>
              <Title p={p} size="small" />
              <Details p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="px-[4.5vw] py-[10vh]" id="skills">
        <h2 className={`opacity-60 ${LABEL}`}>Skills</h2>
        <div className="mt-[5vh] grid grid-cols-1 gap-x-[4vw] gap-y-[6vh] md:grid-cols-2">
          {skillGroups.map((g, c) => (
            <div key={g.label}>
              <h3 className="font-sans text-[2.4rem] font-medium leading-[1.2] tracking-[-0.01em] text-white">{g.label}</h3>
              <SkillList c={c} center={false} />
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
      <SerifProbe />
    </div>
  );
}

export default function B24(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting or turns a tablet on its side.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a word with its text beside it. In a media query an em
    // is the browser's own 16, not the page's rem, so 56em is 896 wide.
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
      return startLetters(root, mode);
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
    </div>
  );
}
