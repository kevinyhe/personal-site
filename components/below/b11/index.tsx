"use client";

import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { CONTACT_TEXT_TOP, CONTACT_SCREENS, SKILLS_LIST, SKILLS_SCREENS, WORK_SCREENS } from "./layout";
import { type Mode as RunMode, startPlates } from "./plates";

/**
 * Design 11, Plates. After sondaven.com, further down its page: framed
 * pictures that grow out of the page as you scroll, each drawn in the
 * same bar dither as the valley above, with small mono captions round
 * the frame.
 *
 * Here each project is a small scene built in three.js (a microphone, a
 * blaster, a boxing ring, the robot on its field, a ringed planet among
 * blossom clouds), rendered off screen and redrawn in plum bars on the
 * blossom ground by the valley's own bar shader. As a project's screen
 * scrolls in, its frame opens from a small rectangle in the middle to most
 * of the screen and its bars settle from pale to full. Then the skills as
 * one wide plate of the valley with 42 lanterns in five groups, and last
 * the robot in a small frame over the email.
 *
 * The page has two layouts.
 *   journey  the pinned plates with the words round them. A visitor who
 *            asked for less motion gets the same, with each plate open
 *            and still.
 *   plain    the words as ordinary blocks. What the server sends, what a
 *            narrow screen keeps, and what is left if WebGL cannot start.
 */

type Mode = "boot" | "plain" | RunMode;

const SCREEN = "var(--arbor-screen-h)";
const SMALL = "font-mono text-[1.4rem] uppercase leading-[1.5] tracking-[0.18em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif cannot draw digits, @ or &: those titles are set in the sans. */
const serifSafe = (s: string): boolean => !/[0-9@&'"$!()*+/=#%-]/.test(s);
const titleFont = (s: string): string =>
  serifSafe(s) ? "font-serif-display italic tracking-[-0.025em]" : "font-sans font-light italic tracking-[-0.045em]";

/** Can this browser give us the kind of canvas the scenes need? Asked of a spare canvas, let go at once. */
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

/**
 * The join with the band above: rows of vertical bars, plum on blossom,
 * each row's bars a little thinner than the last. The first rows are
 * solid plum, the band's own colour, and the last are nearly bare
 * blossom. The page's own dither, done with nothing but CSS.
 */
function LeadIn(): JSX.Element {
  const rows = 14;
  return (
    <div aria-hidden className="w-full">
      {Array.from({ length: rows }, (_, r) => {
        const f = r < 3 ? 1 : Math.max(0, 1 - (r - 2) / (rows - 2));
        const w = (1.1 * f).toFixed(3);
        const style: CSSProperties = {
          height: "2.4vh",
          background:
            f >= 1 ? BAND : `repeating-linear-gradient(90deg, ${BAND} 0rem, ${BAND} ${w}rem, ${BLOSSOM} ${w}rem, ${BLOSSOM} 1.1rem)`,
        };
        return <div key={r} style={style} />;
      })}
    </div>
  );
}

function Links({ className }: { className: string }): JSX.Element {
  return (
    <ul className={`font-mono text-[1.5rem] ${className}`}>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.2rem] uppercase tracking-[0.18em] opacity-60">{l.label}</span>
            <span className="mt-[0.3rem] block underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function SkillList(): JSX.Element {
  return (
    <>
      {skillGroups.map((g, i) => (
        <div className="mt-[2.6vh] first:mt-0" key={g.label}>
          <h3 className={SMALL}>
            <span className="opacity-60">{pad2(i + 1)}</span>
            <span className="ml-[1.2rem]">{g.label}</span>
          </h3>
          <ul className="mt-[0.8vh] flex flex-wrap gap-x-[1.8rem] gap-y-[0.3vh] font-sans text-[max(1.5rem,2vh)] font-light leading-[1.45]">
            {g.skills.map((s) => (
              <li key={s.name}>{s.name}</li>
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
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BLOSSOM }}>
        <canvas
          aria-hidden
          className="absolute left-0 top-0 h-full w-full origin-top-left [image-rendering:pixelated]"
          data-bars
        />
        <div
          aria-hidden
          className="pointer-events-none absolute"
          data-frame
          style={{ border: `0.12rem solid ${BAND}`, opacity: 0 }}
        />
        <p aria-hidden className={`absolute bottom-[3.5vh] left-[4.5vw] ${SMALL}`}>
          <span className="tabular-nums" data-count>
            01 / 07
          </span>
          <span className="ml-[1.6rem] opacity-60" data-count-name>
            Work
          </span>
        </p>
      </div>

      <section
        className="pointer-events-none relative z-10"
        id="work"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${WORK_SCREENS})` }}
      >
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4.5vw] top-[4vh] opacity-60 ${SMALL}`}>Work</h2>
          {projects.map((p, i) => (
            <article className="absolute inset-0" data-cap={i} key={p.title} style={{ opacity: 0, visibility: "hidden" }}>
              <p className={`absolute max-w-[52vw] ${SMALL}`} data-part="stack">
                <span className="tabular-nums opacity-60">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</span>
                <span className="ml-[1.4rem]">{p.stack.join(", ")}</span>
              </p>
              <p className={`absolute whitespace-nowrap tabular-nums ${SMALL}`} data-part="year">
                {p.year}
              </p>
              <div className="absolute w-[44vw]" data-part="title">
                <h3 className={`whitespace-nowrap text-[min(8.5vh,4.6vw)] leading-[1] ${titleFont(p.title)}`}>{p.title}</h3>
                <p className="mt-[1.2vh] max-w-[40vw] font-sans text-[max(1.5rem,2.1vh)] font-light leading-[1.45]">{p.tagline}</p>
                {p.href ? (
                  <a
                    className="pointer-events-auto mt-[1vh] inline-block font-mono text-[1.4rem] leading-[1.6] underline underline-offset-[0.35em]"
                    href={p.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {hostOf(p.href)}
                  </a>
                ) : null}
              </div>
              <p className={`absolute whitespace-nowrap text-right ${SMALL}`} data-part="award">
                {p.award ?? ""}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="pointer-events-none relative z-10"
        id="skills"
        style={{ height: `calc(${SCREEN} * ${SKILLS_SCREENS})` }}
      >
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <h2 className={`absolute left-[4.5vw] top-[4vh] opacity-60 ${SMALL}`}>Skills</h2>
          {skillGroups.map((g, i) => (
            <span
              aria-hidden
              className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center font-mono text-[1.3rem] tabular-nums"
              data-mark={i}
              key={g.label}
              style={{ opacity: 0 }}
            >
              {pad2(i + 1)}
              <span className="mt-[0.4rem] block h-[2.2vh] w-[0.12rem]" style={{ backgroundColor: BAND }} />
            </span>
          ))}
          <div
            className="absolute"
            data-skills-list
            style={{
              left: `${SKILLS_LIST.x0 * 100}%`,
              top: `${SKILLS_LIST.y0 * 100}%`,
              width: `${(SKILLS_LIST.x1 - SKILLS_LIST.x0) * 100}%`,
            }}
          >
            <SkillList />
          </div>
        </div>
      </section>

      <section className="relative z-10 w-full" id="contact" style={{ height: `calc(${SCREEN} * ${CONTACT_SCREENS})` }}>
        <h2 className={`absolute left-[4.5vw] top-[4vh] opacity-60 ${SMALL}`}>Contact</h2>
        <div className="absolute inset-x-0 text-center" style={{ top: `${CONTACT_TEXT_TOP * 100}%` }}>
          <a
            className="font-sans text-[5.4vw] font-light leading-none tracking-[-0.035em] underline-offset-[0.2em] hover:underline"
            data-email
            href={`mailto:${EMAIL}`}
          >
            {EMAIL}
          </a>
          <Links className="mt-[5vh] flex justify-center gap-[3.5vw] text-left" />
        </div>
      </section>
    </div>
  );
}

function Plain(): JSX.Element {
  return (
    <div>
      <section className="px-[4.5vw] pb-[10vh] pt-[10vh]" id="work">
        <h2 className={`opacity-60 ${SMALL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <p className={SMALL}>
                <span className="tabular-nums opacity-60">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</span>
                <span className="ml-[1.4rem]">{p.year}</span>
              </p>
              <div className="mt-[1.2rem] h-[0.12rem] w-full" style={{ backgroundColor: BAND }} />
              <h3 className={`mt-[2rem] text-[max(3.6rem,4.6vh)] leading-[1.05] ${titleFont(p.title)}`}>{p.title}</h3>
              <p className="mt-[1.4rem] max-w-[64rem] font-sans text-[max(1.6rem,1.9vh)] font-light leading-[1.5]">{p.tagline}</p>
              <p className={`mt-[1.4rem] ${SMALL}`}>{p.stack.join(", ")}</p>
              {p.award ? <p className={`mt-[0.4rem] opacity-70 ${SMALL}`}>{p.award}</p> : null}
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
        <div className="mt-[5vh] max-w-[120rem]">
          <SkillList />
        </div>
      </section>

      <section className="px-[4.5vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-60 ${SMALL}`}>Contact</h2>
        <a
          className="mt-[5vh] block break-all font-sans text-[max(3.2rem,6vw)] font-light leading-none tracking-[-0.035em]"
          href={`mailto:${EMAIL}`}
        >
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

export default function B11(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once in the browser, and again if the visitor
  // changes their motion setting or turns a tablet on its side.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Too narrow for a plate with words round it. In a media query an em
    // is the browser's own 16, not the page's rem, so 56em is 896 wide.
    const narrow = window.matchMedia("(max-width: 56em), (orientation: portrait)");
    const pick = (): void => {
      if (narrow.matches || !webglWorks()) setMode("plain");
      else setMode(less.matches ? "still" : "journey");
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
    try {
      return startPlates(root, mode);
    } catch {
      // The scenes could not start. The words stand without them.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  const running = mode === "journey" || mode === "still";
  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: BLOSSOM, color: BAND }}>
      <LeadIn />
      {running ? <Journey /> : <Plain />}
    </div>
  );
}
