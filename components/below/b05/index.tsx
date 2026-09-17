"use client";

import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups, type Skill } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { skillIcon } from "@/components/skillIcons";
import SkillMark from "@/components/variants/SkillMark";
import { createField, DEEP, FAR, type Field } from "./scene";
import {
  CONTACT_AT,
  CONTACT_SCREENS,
  contactText,
  groupText,
  nearestPanel,
  nearestWord,
  PANEL_SIDE,
  panelText,
  SKILLS_AT,
  SKILLS_SCREENS,
  smoothstep,
  WORK_SCREENS,
} from "./timeline";

/**
 * Design 05, Field. After activetheory.net: a dark space of drifting
 * points and ribbons of light, the work reached by travelling into it.
 *
 * The page has two arrangements. "plain" is what the server sends and
 * what stays if WebGL cannot start or the visitor asked for less motion:
 * the content as ordinary text on the dark ground, under one still frame
 * of the field when there is one. "travel" is the scene: a canvas pinned
 * to the window for the whole design, and over it three tall sections
 * whose text is shown and hidden by how far the page has scrolled.
 */

const SCREEN = "var(--arbor-screen-h)";
const screens = (n: number): string => `calc(${SCREEN} * ${n})`;
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** The address a link goes to, as a reader would say it. */
const host = (href: string): string => href.replace(/^https?:\/\//, "").replace(/^www\./, "");

/**
 * A brand's own colour, lifted when it is too dark to see here. The
 * shared SkillMark only swaps near-black for the text colour; this ground
 * is darker than the pages it was made for, and navy or deep teal marks
 * (NumPy, Electron) sank into it.
 */
function markColour(hex: string): string {
  const v = parseInt(hex, 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum >= 105) return `#${hex}`;
  const k = lum < 40 ? 1 : 0.5;
  const up = (c: number): number => Math.round(c + (255 - c) * k);
  return `rgb(${up(r)}, ${up(g)}, ${up(b)})`;
}

function Mark({ skill }: { skill: Skill }): JSX.Element {
  const icon = skillIcon(skill.icon);
  if (!icon) return <SkillMark className="shrink-0" size="2.8rem" skill={skill} />;
  return (
    <svg aria-hidden="true" className="h-[2.8rem] w-[2.8rem] shrink-0" fill={markColour(icon.hex)} viewBox="0 0 24 24">
      <path d={icon.path} />
    </svg>
  );
}

/** Show or hide one block of text. Writes to the element only when the
 *  value has changed, so a frame at rest touches no styles. */
function show(el: HTMLElement | null, was: number[], i: number, amount: number, centred: boolean): void {
  if (!el) return;
  const a = Math.round(amount * 200) / 200;
  if (was[i] === a) return;
  was[i] = a;
  el.style.opacity = String(a);
  el.style.visibility = a === 0 ? "hidden" : "visible";
  el.style.pointerEvents = a > 0.6 ? "auto" : "none";
  const rise = `${((1 - a) * 3).toFixed(2)}rem`;
  el.style.transform = centred ? `translateY(calc(-50% + ${rise}))` : `translateY(${rise})`;
}

export default function B05(): JSX.Element {
  const [mode, setMode] = useState<"plain" | "travel">("plain");
  const [hasScene, setHasScene] = useState(true);

  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const workHead = useRef<HTMLElement>(null);
  const workCount = useRef<HTMLSpanElement>(null);
  const skillsHead = useRef<HTMLElement>(null);
  const skillsCount = useRef<HTMLSpanElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const contact = useRef<HTMLDivElement>(null);
  const projectEls = useRef<(HTMLElement | null)[]>([]);
  const groupEls = useRef<(HTMLElement | null)[]>([]);
  // What each block of text was last set to, so `show` can skip repeats.
  const was = useRef<{ live: boolean; project: number[]; group: number[]; other: number[] }>({
    live: false,
    project: [],
    group: [],
    other: [],
  });

  // The scene starts a frame or two before React has laid the travel out.
  // Text set in those frames would be overwritten by the render, so the
  // frame loop only writes once this has run, and starts from nothing.
  useEffect(() => {
    was.current = { live: mode === "travel", project: [], group: [], other: [] };
    if (mode === "travel") return;
    // Back to the plain page (the GPU went away mid-visit): take off what
    // the frame loop wrote, which React does not know about.
    const blocks = [...projectEls.current, ...groupEls.current, contact.current, workHead.current, skillsHead.current];
    blocks.forEach((el) => {
      if (!el) return;
      el.style.opacity = "";
      el.style.visibility = "";
      el.style.pointerEvents = "";
      el.style.transform = "";
    });
  }, [mode]);

  useEffect(() => {
    const rootEl = root.current;
    const stageEl = stage.current;
    if (!rootEl || !stageEl) return undefined;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = getComputedStyle(rootEl);
    const fonts = {
      sans: `${css.getPropertyValue("--font-inter").trim() || "system-ui"}, sans-serif`,
      mono: `${css.getPropertyValue("--font-mono").trim() || "ui-monospace"}, monospace`,
    };

    const counted = { work: -1, skills: -1 };

    const onFrame = (u: number): void => {
      const w0 = was.current;
      if (!w0.live) return;
      projectEls.current.forEach((el, i) => show(el, w0.project, i, panelText(i, u), true));
      groupEls.current.forEach((el, k) => show(el, w0.group, k, groupText(k, u), false));
      show(contact.current, w0.other, 0, contactText(u), false);
      show(workHead.current, w0.other, 1, smoothstep(-0.35, 0.05, u) * (1 - smoothstep(SKILLS_AT - 0.2, SKILLS_AT - 0.04, u)), false);
      show(
        skillsHead.current,
        w0.other,
        2,
        smoothstep(SKILLS_AT + 0.06, SKILLS_AT + 0.3, u) * (1 - smoothstep(CONTACT_AT - 0.2, CONTACT_AT - 0.04, u)),
        false,
      );
      show(hint.current, w0.other, 3, 0.6 * smoothstep(-0.5, -0.1, u) * (1 - smoothstep(CONTACT_AT, CONTACT_AT + 0.4, u)), false);

      const w = nearestPanel(u);
      const s = nearestWord(u);
      if (w !== counted.work && workCount.current) workCount.current.textContent = pad2(w + 1);
      if (s !== counted.skills && skillsCount.current) skillsCount.current.textContent = pad2(s + 1);
      counted.work = w;
      counted.skills = s;
    };

    let field: Field | null = null;
    let gone = false;

    // The titles and the words are drawn with the page's own fonts, so
    // the scene waits for them. A font that fails to load is no reason to
    // show nothing: the canvas falls back to the system's.
    const ready = Promise.all([
      document.fonts.load(`700 120px ${fonts.sans}`, "Software & networking"),
      document.fonts.load(`500 26px ${fonts.mono}`, "0123456789"),
    ]).catch(() => undefined);

    void ready.then(() => {
      if (gone) return;
      field = createField({
        stage: stageEl,
        root: rootEl,
        still,
        fonts,
        titles: projects.map((p) => ({ title: p.title, year: p.year })),
        words: skillGroups.map((g) => g.label),
        onFrame,
        onLost: () => {
          setMode("plain");
          setHasScene(false);
        },
      });
      if (!field) {
        setHasScene(false);
        return;
      }
      if (!still) setMode("travel");
    });

    return () => {
      gone = true;
      field?.dispose();
    };
  }, []);

  const travel = mode === "travel";
  // The three pinned layers lie over one another where the sections meet.
  // None of them takes the pointer; only a block of text that is showing
  // does (see `show`), or the layer on top would eat the clicks.
  const pinned = travel ? "pointer-events-none sticky top-0 w-full overflow-hidden" : "";
  const pinnedStyle: CSSProperties | undefined = travel ? { height: SCREEN } : undefined;
  // In the travel every block starts hidden and the frame loop shows it.
  const hidden: CSSProperties | undefined = travel ? { opacity: 0, visibility: "hidden" } : undefined;
  const label = "font-mono text-[1.5rem] uppercase tracking-[0.16em]";

  return (
    <div
      className="relative w-full font-sans text-white"
      ref={root}
      style={{ background: travel ? FAR : `linear-gradient(to bottom, ${BAND} 0, ${DEEP} 60vh, ${FAR} 160vh)` }}
    >
      {/* The scene. Pinned for the whole design in the travel; one screen
          at the head of the page otherwise. */}
      <div
        aria-hidden="true"
        className={travel ? "sticky top-0 w-full overflow-hidden" : "relative w-full overflow-hidden"}
        ref={stage}
        style={{
          height: SCREEN,
          marginBottom: travel ? `calc(${SCREEN} * -1)` : undefined,
          display: hasScene ? "block" : "none",
        }}
      >
        {travel ? (
          <p className={`absolute bottom-[3.4vh] left-[4vw] ${label}`} ref={hint} style={{ ...hidden, color: BLOSSOM }}>
            Scroll to travel. Move the cursor to stir the field.
          </p>
        ) : null}
      </div>

      {/* The join. The band above is BAND to its last pixel, so this
          design starts as BAND and lets go of it over the first screen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[64vh]"
        style={{ background: `linear-gradient(to bottom, ${BAND} 0%, ${BAND} 4%, rgba(42, 13, 30, 0.72) 30%, rgba(42, 13, 30, 0) 100%)` }}
      />

      <section
        className={travel ? "pointer-events-none relative z-[2]" : "relative z-[2] px-[8vw] pb-[6vh] pt-[12vh]"}
        id="work"
        style={travel ? { height: screens(WORK_SCREENS) } : undefined}
      >
        <div className={pinned} style={pinnedStyle}>
          <header
            className={travel ? "absolute left-[4vw] top-[4.5vh] flex items-baseline gap-[2rem]" : "mb-[7vh] flex items-baseline gap-[2rem]"}
            ref={workHead}
            style={hidden}
          >
            <h2 className="font-serif-display text-[4.6rem] italic leading-none" style={{ color: BLOSSOM }}>
              Work
            </h2>
            {travel ? (
              <p className={`${label} opacity-70`}>
                <span ref={workCount}>01</span> / {pad2(projects.length)}
              </p>
            ) : null}
          </header>

          {projects.map((p, i) => {
            // The text stands on the side the panel is not on.
            const side = PANEL_SIDE[i] === 1 ? "left-[7.5vw]" : "right-[7.5vw]";
            return (
              <article
                className={travel ? `absolute top-1/2 w-[31vw] ${side}` : "mb-[8vh] max-w-[96rem]"}
                key={p.title}
                ref={(el) => {
                  projectEls.current[i] = el;
                }}
                style={hidden}
              >
                <p className={`${label} mb-[2.2rem]`} style={{ color: BLOSSOM }}>
                  {pad2(i + 1)} <span className="opacity-50">/</span> {p.year}
                </p>
                <h3 className="mb-[2.4rem] text-[5.4rem] font-medium leading-[1.02] tracking-[-0.03em]">{p.title}</h3>
                <p className="mb-[3rem] text-[2.5rem] font-light leading-[1.42] text-white/90">{p.tagline}</p>
                {p.award ? (
                  <p className={`${label} mb-[1.6rem]`} style={{ color: BLOSSOM }}>
                    {p.award}
                  </p>
                ) : null}
                <p className="mb-[3rem] font-mono text-[1.5rem] leading-[1.7] tracking-[0.04em] text-white/60">{p.stack.join("  /  ")}</p>
                {p.href ? (
                  <a
                    className="inline-block border-b-[0.125rem] pb-[0.5rem] font-mono text-[1.6rem] tracking-[0.06em] transition-colors hover:text-white"
                    href={p.href}
                    rel="noreferrer"
                    style={{ borderColor: BLOSSOM, color: BLOSSOM }}
                    target="_blank"
                  >
                    {host(p.href)} →
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section
        className={travel ? "pointer-events-none relative z-[2]" : "relative z-[2] px-[8vw] py-[6vh]"}
        id="skills"
        style={travel ? { height: screens(SKILLS_SCREENS), marginTop: `calc(${SCREEN} * -1)` } : undefined}
      >
        <div className={pinned} style={pinnedStyle}>
          <header
            className={travel ? "absolute left-[4vw] top-[4.5vh] flex items-baseline gap-[2rem]" : "mb-[7vh] flex items-baseline gap-[2rem]"}
            ref={skillsHead}
            style={hidden}
          >
            <h2 className="font-serif-display text-[4.6rem] italic leading-none" style={{ color: BLOSSOM }}>
              Skills
            </h2>
            {travel ? (
              <p className={`${label} opacity-70`}>
                <span ref={skillsCount}>01</span> / {pad2(skillGroups.length)}
              </p>
            ) : null}
          </header>

          {skillGroups.map((g, k) => (
            // In the travel the points spell the group's name above this,
            // and the name here is the small caption under the word.
            <div
              className={travel ? "absolute inset-x-[15vw] top-[55%] text-center" : "mb-[7vh]"}
              key={g.label}
              ref={(el) => {
                groupEls.current[k] = el;
              }}
              style={hidden}
            >
              <h3
                className={travel ? `${label} mb-[4rem]` : "mb-[3rem] text-[3.6rem] font-medium tracking-[-0.02em]"}
                style={{ color: BLOSSOM }}
              >
                {g.label}
              </h3>
              <ul className={`flex flex-wrap gap-x-[4.4rem] gap-y-[2.8rem] ${travel ? "justify-center" : ""}`}>
                {g.skills.map((s) => (
                  <li className="flex items-center gap-[1.2rem] text-[2.3rem] font-normal text-white/95" key={s.name}>
                    <Mark skill={s} />
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section
        className={travel ? "pointer-events-none relative z-[2]" : "relative z-[2] px-[8vw] pb-[14vh] pt-[6vh]"}
        id="contact"
        style={travel ? { height: screens(CONTACT_SCREENS), marginTop: `calc(${SCREEN} * -1)` } : undefined}
      >
        <div className={pinned} style={pinnedStyle}>
          <div
            className={travel ? "absolute inset-0 flex flex-col items-center justify-center text-center" : ""}
            ref={contact}
            style={hidden}
          >
            <h2 className="mb-[3rem] font-serif-display text-[4.6rem] italic leading-none" style={{ color: BLOSSOM }}>
              Contact
            </h2>
            <a
              className="mb-[4.4rem] block text-[4.6rem] font-light leading-none tracking-[-0.02em] transition-colors hover:text-white"
              href={`mailto:${EMAIL}`}
            >
              {EMAIL}
            </a>
            <ul className={`grid grid-cols-2 gap-x-[5rem] gap-y-[1.8rem] font-mono text-[1.5rem] tracking-[0.06em] ${travel ? "" : "max-w-[70rem]"}`}>
              {elsewhere.map((e) => (
                <li className={travel ? "text-left" : ""} key={e.href}>
                  <a className="transition-colors hover:text-white" href={e.href} rel="noreferrer" style={{ color: BLOSSOM }} target="_blank">
                    <span className="text-white/55">{e.label}</span> {e.handle}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
