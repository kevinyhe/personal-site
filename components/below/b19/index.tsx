"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { type Mode as WallMode, startRelief } from "./drive";
import { needsSans, PALE, SKILL, skillCss, skillSpots, skillWidthCss, TITLE } from "./layout";

/**
 * Design 19, Relief. A long pale wall carved in low relief: sakura boughs
 * and blossoms running its whole length, and a sunk frame per project with
 * its thing carved in it (a microphone, a blaster, a boxing glove, Kevin's
 * robot on a field, a ringed planet). One low light moves across it and
 * the cursor pulls the light toward itself, so the carving's shadows
 * swing. The wall is drawn in grey and put through the site's bar dither:
 * the shading comes out as plum bars on the pale ground.
 *
 * Scroll slides the camera along the wall: five projects, then a panel of
 * 42 carved medallions for the skills, then the light narrows to one oval
 * over the email.
 *
 *   journey  the pinned sequence, the words laid over the stage.
 *   still    one frame of the wall above the words as plain blocks, for a
 *            visitor who asked for less motion, or a small screen.
 *   plain    the words alone. What the server sends, and what is left if
 *            WebGL cannot start.
 */

type Mode = "boot" | "plain" | WallMode;

const SCREEN = "var(--arbor-screen-h)";
const SMALL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const metaOf = (p: Project): string => (p.award ? `${p.year}. ${p.award}` : p.year);
const titleFont = (title: string): string => (needsSans(title) ? "font-sans font-light tracking-[-0.03em]" : "font-serif-display italic tracking-[-0.02em]");

/** Can this browser give us the kind of canvas the wall needs? Asked of a spare canvas, let go at once. */
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

function Links({ className }: { className: string }): JSX.Element {
  return (
    <ul className={`font-mono text-[1.5rem] ${className}`}>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.2rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
            <span className="mt-[0.3rem] block underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Details({ p }: { p: Project }): JSX.Element {
  return (
    <>
      <p className="font-mono leading-[1.5]" style={{ fontSize: `${TITLE.taglineRem}rem` }}>
        {p.tagline}
      </p>
      <p className="mt-[0.4rem] font-mono leading-[1.6] opacity-80" style={{ fontSize: `${TITLE.detailRem}rem` }}>
        {p.stack.join(", ")}
      </p>
      <p className="mt-[0.4rem] font-mono leading-[1.6] opacity-80" style={{ fontSize: `${TITLE.detailRem}rem` }}>
        {metaOf(p)}
      </p>
      {p.href ? (
        <a
          className="mt-[0.4rem] inline-block font-mono leading-[1.6] underline underline-offset-[0.35em]"
          href={p.href}
          rel="noreferrer"
          style={{ fontSize: `${TITLE.detailRem}rem` }}
          target="_blank"
        >
          {hostOf(p.href)}
        </a>
      ) : null}
    </>
  );
}

function Journey(): JSX.Element {
  const spots = skillSpots(skillGroups.map((g) => g.skills.length));
  return (
    <div className="relative" data-journey>
      <div
        className="sticky top-0 w-full overflow-hidden"
        data-stage
        style={{ height: SCREEN, background: `linear-gradient(${BAND} 0%, ${BAND} 6%, ${PALE} 30%)` }}
      >
        <div className="absolute inset-0 overflow-hidden" data-canvas />
        <p className={`absolute bottom-[4vh] right-[5vw] ${SMALL}`} data-hint style={{ opacity: 0.7 }}>
          Move the cursor. The light follows it.
        </p>
      </div>

      <section className="pointer-events-none relative z-10" id="work" style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}>
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <div className="absolute bottom-[4vh] left-[5vw] flex items-baseline gap-[1.6rem] px-[1rem] py-[0.6rem]" data-work-label style={{ backgroundColor: PALE }}>
            <h2 className={SMALL}>Work</h2>
            <span aria-hidden className="font-mono text-[1.4rem] tabular-nums opacity-70" data-count>
              01 / 05
            </span>
          </div>
          {projects.map((p, i) => (
            <article
              className="absolute"
              data-title={i}
              key={p.title}
              style={{
                left: `${TITLE.left}vw`,
                top: `${TITLE.middle}%`,
                width: `${TITLE.width}vw`,
                transform: "translateY(-50%)",
                opacity: 0,
                visibility: "hidden",
              }}
            >
              <p className="font-mono tabular-nums leading-[1.4]" style={{ fontSize: `${TITLE.counterRem}rem` }}>{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <h3
                className={titleFont(p.title)}
                style={{ fontSize: `${TITLE.size}vw`, lineHeight: TITLE.line, marginTop: `${TITLE.gapRem}rem` }}
              >
                {p.title}
              </h3>
              <div
                className="inline-block"
                style={{ marginTop: `${TITLE.plateGapRem}rem`, padding: `${TITLE.platePadRem}rem`, maxWidth: `calc(${TITLE.taglineWidth}vw + ${TITLE.platePadRem * 2}rem)`, backgroundColor: PALE }}
              >
                <Details p={p} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 2)` }}>
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0, visibility: "hidden" }}>
          <h2 className={`absolute bottom-[4vh] left-[5vw] px-[1rem] py-[0.6rem] ${SMALL}`} style={{ backgroundColor: PALE }}>
            Skills
          </h2>
          {skillGroups.map((g, gi) => {
            const row = SKILL.rowTop - gi * SKILL.rowPitch;
            const at = skillCss(SKILL.labelX, row);
            return (
              <div key={g.label}>
                <h3 className="absolute -translate-y-1/2 font-sans text-[1.8rem] font-light leading-[1.15]" style={{ left: at.left, top: at.top, width: "11vw" }}>
                  {g.label}
                </h3>
                <ul>
                  {g.skills.map((s, si) => {
                    const spot = spots.find((x) => x.group === gi && x.index === si);
                    const pos = skillCss(spot ? spot.x : 0, (spot ? spot.y : 0) - SKILL.nameDrop);
                    return (
                      <li
                        className="absolute -translate-x-1/2 text-center font-mono text-[1.3rem] leading-[1.25]"
                        key={s.name}
                        style={{ left: pos.left, top: pos.top, width: skillWidthCss }}
                      >
                        {s.name}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="relative z-10 w-full" id="contact" style={{ height: SCREEN }}>
        <div className="absolute inset-0" data-contact style={{ opacity: 0, visibility: "hidden" }}>
          <h2 className={`absolute bottom-[58%] left-1/2 -translate-x-1/2 ${SMALL}`}>Contact</h2>
          <a
            className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-sans text-[4.2vw] font-light leading-none tracking-[-0.03em]"
            href={`mailto:${EMAIL}`}
          >
            {EMAIL}
          </a>
          <Links className="absolute left-1/2 top-[55%] flex -translate-x-1/2 gap-[3.5vw]" />
        </div>
      </section>
    </div>
  );
}

function Plain({ withStage }: { withStage: boolean }): JSX.Element {
  return (
    <div>
      {withStage ? (
        <div
          className="relative w-full overflow-hidden"
          data-stage
          style={{ height: `min(${SCREEN}, 54vw)`, background: `linear-gradient(${BAND} 0%, ${BAND} 6%, ${PALE} 30%)` }}
        >
          <div className="absolute inset-0 overflow-hidden" data-canvas />
        </div>
      ) : null}

      <section className={`px-[5vw] pb-[8vh] ${withStage ? "pt-[10vh]" : "pt-[18vh]"}`} id="work">
        <h2 className={`opacity-70 ${SMALL}`}>Work</h2>
        <div className="mt-[5vh] grid grid-cols-1 gap-x-[6vw] gap-y-[7vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article key={p.title}>
              <p className="font-mono text-[1.4rem] tabular-nums leading-[1.4]">{`${pad2(i + 1)} / ${pad2(projects.length)}`}</p>
              <h3 className={`mt-[1.2rem] text-[6.4rem] leading-[1] ${titleFont(p.title)}`}>{p.title}</h3>
              <div className="mt-[1.6rem] max-w-[64rem]">
                <Details p={p} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="px-[5vw] py-[8vh]" id="skills">
        <h2 className={`opacity-70 ${SMALL}`}>Skills</h2>
        {skillGroups.map((g) => (
          <div className="mt-[3.4rem] grid grid-cols-[24rem_1fr] gap-x-[2rem]" key={g.label}>
            <h3 className="font-sans text-[2rem] font-light leading-[1.2]">{g.label}</h3>
            <ul className="flex flex-wrap gap-x-[2.4rem] gap-y-[1.2rem]">
              {g.skills.map((s) => (
                <li className="flex items-center gap-[0.8rem] font-mono text-[1.4rem] leading-none" key={s.name}>
                  <SkillMark onDark={false} size="2rem" skill={s} tinted={false} />
                  {s.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="px-[5vw] pb-[16vh] pt-[8vh]" id="contact">
        <h2 className={`opacity-70 ${SMALL}`}>Contact</h2>
        <a className="mt-[4vh] block font-sans text-[5.6vw] font-light leading-none tracking-[-0.03em]" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <Links className="mt-[5vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

export default function B19(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting or the window changes shape.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // In a media query an em is the browser's own 16, not the page's rem, so 56em is 896 wide.
    const small = window.matchMedia("(max-width: 56em), (max-aspect-ratio: 13/10)");
    const pick = (): void => {
      if (!webglWorks()) setMode("plain");
      else if (less.matches || small.matches) setMode("still");
      else setMode("journey");
    };
    pick();
    less.addEventListener("change", pick);
    small.addEventListener("change", pick);
    return () => {
      less.removeEventListener("change", pick);
      small.removeEventListener("change", pick);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || mode === "boot" || mode === "plain") return undefined;
    try {
      return startRelief(root, mode);
    } catch {
      // The wall could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: PALE, color: BAND }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
      {/* The band above is this plum. The first rows of the design are the
          same plum, and the pale wall comes up out of it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[14vh]"
        style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 18%, rgba(42, 13, 30, 0) 100%)` }}
      />
    </div>
  );
}
