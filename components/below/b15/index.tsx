"use client";

import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { startDusk } from "./driver";
import * as P from "./plan";

/**
 * Design 15, Dusk. A full-screen sky drawn in the site's bars: plum on
 * blossom. Scrolling moves the camera slowly forward and up through layers
 * of cloud over a far line of hills, while birds cross. Each project's
 * name is set across the middle in wide-spaced serif; between projects the
 * camera goes through a cloud and the frame fills with bars. After the
 * last one the sky darkens to night and the skills come up as five
 * constellations, one per group. Last, a sliver of moon rises over the
 * hills under the email.
 *
 * Three layouts:
 *   journey  the pinned sky with the words over it.
 *   still    one still frame of the sky, then the words as plain blocks:
 *            for a visitor who asked for less motion.
 *   plain    the words alone, on plum. What the server sends, and what is
 *            left if WebGL cannot start.
 */

type Mode = "boot" | "journey" | "still" | "plain";

const SCREEN = "var(--arbor-screen-h)";
const WHITE = "#ffffff";
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif draws a flower for digits, @, &, hyphens and a few
 *  more. A title with any of those is set in Inter. */
const serifSafe = (text: string): boolean => !/[0-9@&\-‑'"!()/*+=#%$]/.test(text);
const meta = (p: (typeof projects)[number]): string => (p.award ? `${p.year}. ${p.award}` : p.year);

/** A title at wide tracking. CSS puts the spacing after every letter, the
 *  last one too, so the last one's is taken back to keep it centred. */
function Wide({ text, style }: { text: string; style?: CSSProperties }): JSX.Element {
  const serif = serifSafe(text);
  return (
    <span
      className={serif ? "font-serif-display font-normal italic" : "font-sans font-light"}
      style={{ letterSpacing: `${P.TRACKING_EM}em`, marginRight: `-${P.TRACKING_EM}em`, ...style }}
    >
      {text}
    </span>
  );
}

const LABEL = "font-mono text-[1.4rem] uppercase tracking-[0.22em]";

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

function Journey(): JSX.Element {
  const cons = P.buildConstellations(
    skillGroups.map((g) => g.skills.length),
    skillGroups.map((g) => g.skills.map((s) => s.depth)),
  );
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <div className="absolute inset-0" data-canvas />
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" fill="none">
          {cons.map((c) =>
            c.lines.map((_, k) => (
              <line data-line={`${c.group}-${k}`} key={`${c.group}-${k}`} stroke={BLOSSOM} style={{ opacity: 0, strokeWidth: "0.12rem" }} />
            )),
          )}
        </svg>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${P.WORK_SCREENS})` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN, color: BAND }}>
          <h2 className={`absolute inset-x-0 text-center opacity-0 ${LABEL}`} data-work-head style={{ top: `${(P.TITLE_MID - 0.11) * 100}%` }}>
            Work
          </h2>
          {projects.map((p, i) => (
            <article className="absolute inset-0 opacity-0" data-hit data-project={i} key={p.title} style={{ pointerEvents: "none" }}>
              <h3
                className="absolute inset-x-0 -translate-y-1/2 whitespace-nowrap text-center leading-none"
                style={{ top: `${P.TITLE_MID * 100}%`, fontSize: `${P.TITLE_VW}vw` }}
              >
                <Wide text={p.title} />
              </h3>
              <div className="absolute inset-x-0 text-center font-mono" style={{ top: `${P.TAGLINE_TOP * 100}%` }}>
                <p className="mx-auto max-w-[56vw] leading-[1.6]" style={{ fontSize: `${P.TAGLINE_REM}rem` }}>
                  {p.tagline}
                </p>
                <div className="mt-[2rem] leading-[1.7] opacity-80" style={{ fontSize: `${P.DETAIL_REM}rem` }}>
                  <p>{p.stack.join("  /  ")}</p>
                  <p>{meta(p)}</p>
                  {p.href ? (
                    <a className="underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
                      {hostOf(p.href)}
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * ${P.SKILLS_SCREENS})` }}>
        <div className="sticky top-0 w-full opacity-0" data-skills-layer style={{ height: SCREEN }}>
          <h2 className={`absolute left-[4vw] top-[7vh] ${LABEL}`} style={{ color: BLOSSOM }}>
            Skills
          </h2>
          {skillGroups.map((g, i) => (
            <div className="absolute left-0 top-0 will-change-transform" data-group={i} key={g.label} style={{ width: `${P.SKILL_LABEL_W * 100}vw` }}>
              <h3 className="font-mono uppercase tracking-[0.18em]" style={{ color: WHITE, fontSize: `${P.SKILL_GROUP_REM}rem` }}>
                {g.label}
              </h3>
              <p className="mt-[0.8rem] font-mono leading-[1.55]" style={{ color: BLOSSOM, fontSize: `${P.SKILL_NAMES_REM}rem` }}>
                {g.skills.map((s) => s.name).join(", ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10" id="contact" style={{ height: `calc(${SCREEN} * ${P.CONTACT_SCREENS})` }}>
        <div className="pointer-events-none sticky top-0 w-full opacity-0" data-contact-layer data-hit style={{ height: SCREEN }}>
          <h2 className={`absolute inset-x-0 text-center ${LABEL}`} style={{ color: BLOSSOM, top: `${(P.EMAIL_MID - 0.08) * 100}%` }}>
            Contact
          </h2>
          <p className="absolute inset-x-0 -translate-y-1/2 text-center leading-none" style={{ top: `${P.EMAIL_MID * 100}%` }}>
            <a href={`mailto:${EMAIL}`} style={{ color: WHITE }}>
              <Wide style={{ fontSize: `${P.EMAIL_VW}vw` }} text={EMAIL} />
            </a>
          </p>
          <ul className="absolute inset-x-0 flex justify-center gap-[3.5vw] font-mono" style={{ top: `${P.LINKS_TOP * 100}%`, fontSize: `${P.LINK_REM}rem` }}>
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className="group block text-center" href={l.href} rel="noreferrer" target="_blank">
                  <span className="block text-[1.1rem] uppercase tracking-[0.25em] opacity-70" style={{ color: BLOSSOM }}>
                    {l.label}
                  </span>
                  <span className="mt-[0.4rem] block underline-offset-[0.35em] group-hover:underline" style={{ color: WHITE }}>
                    {l.handle}
                  </span>
                </a>
              </li>
            ))}
          </ul>
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
          <div className="absolute inset-0" data-canvas />
        </div>
      ) : null}

      <section className="px-[6vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-70 ${LABEL}`}>Work</h2>
        <div className="mt-[7vh] flex flex-col gap-[9vh]">
          {projects.map((p) => (
            <article key={p.title}>
              <h3 className="text-[3.2vw] leading-[1.1]" style={{ color: WHITE }}>
                <Wide text={p.title} />
              </h3>
              <p className="mt-[2rem] max-w-[70rem] font-mono text-[1.6rem] leading-[1.6]">{p.tagline}</p>
              <p className="mt-[1.4rem] font-mono text-[1.35rem] leading-[1.7] opacity-80">{p.stack.join("  /  ")}</p>
              <p className="font-mono text-[1.35rem] leading-[1.7] opacity-80">{meta(p)}</p>
              {p.href ? (
                <a className="font-mono text-[1.35rem] underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
                  {hostOf(p.href)}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="px-[6vw] py-[10vh]" id="skills">
        <h2 className={`opacity-70 ${LABEL}`}>Skills</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[5vw] gap-y-[5vh] md:grid-cols-3">
          {skillGroups.map((g) => (
            <div key={g.label}>
              <h3 className="font-mono text-[1.5rem] uppercase tracking-[0.18em]" style={{ color: WHITE }}>
                {g.label}
              </h3>
              <p className="mt-[0.8rem] font-mono text-[1.4rem] leading-[1.6]">{g.skills.map((s) => s.name).join(", ")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[6vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-70 ${LABEL}`}>Contact</h2>
        <p className="mt-[5vh] text-[2.2vw] leading-none">
          <a href={`mailto:${EMAIL}`} style={{ color: WHITE }}>
            <Wide text={EMAIL} />
          </a>
        </p>
        <ul className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh] font-mono text-[1.4rem]">
          {elsewhere.map((l) => (
            <li key={l.href}>
              <a className="group block" href={l.href} rel="noreferrer" target="_blank">
                <span className="block text-[1.1rem] uppercase tracking-[0.25em] opacity-70">{l.label}</span>
                <span className="mt-[0.4rem] block underline-offset-[0.35em] group-hover:underline" style={{ color: WHITE }}>
                  {l.handle}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function B15(): JSX.Element {
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
      return startDusk(root, mode === "still");
    } catch {
      // The sky could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
    </div>
  );
}
