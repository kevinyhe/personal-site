"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import SkillMark from "@/components/variants/SkillMark";
import { startFlat, startJourney } from "./driver";
import { SECTION_SCREENS } from "./layout";

/**
 * Design 14, Paper. The work printed as a broadsheet: a stack of pale
 * blossom pages on a plum desk, each laid out with a masthead, rules,
 * columns, a very large headline and a halftone picture. Scrolling turns
 * the pages. Each lifts at its right edge, rolls over and lands face down
 * on the left, and the back of it is the next project's picture. After
 * the five projects comes a centre fold with the skills, then the back
 * page with the email as its headline.
 *
 * The page has three layouts.
 *   journey  the pinned scene. The words are in the sections as text for
 *            readers and search, hidden from sight because the pages
 *            print them; links are laid over the printed ones.
 *   flat     reduced motion or a narrow screen: the same pages printed
 *            flat, one to a screen, nothing turning.
 *   plain    the words as ordinary blocks. What the server sends, and
 *            what is left if WebGL cannot start.
 */

type Mode = "boot" | "plain" | "flat" | "journey";

const SCREEN = "var(--arbor-screen-h)";
const SMALL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const metaOf = (p: (typeof projects)[number]): string => (p.award ? `${p.year}. ${p.award}` : p.year);

const CSS = `
.b14-hot { border-radius: 0.4rem; cursor: pointer; }
.b14-hot:hover { background: rgba(42, 13, 30, 0.07); box-shadow: inset 0 -0.3rem 0 ${BAND}; }
`;

/** Can this browser give us the kind of canvas the scene needs? Asked of a spare canvas, which is let go again at once. */
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

// ------------------------------------------------------------ the words

function WorkText(): JSX.Element {
  return (
    <>
      {projects.map((p) => (
        <article className="mt-[8vh] max-w-[110rem]" key={p.title}>
          <h3 className="font-sans text-[4.4rem] font-medium leading-[1.08] tracking-[-0.02em] text-white">{p.title}</h3>
          <p className="mt-[1.4rem] font-sans text-[2rem] font-light leading-[1.5]">{p.tagline}</p>
          <ul className="mt-[1.4rem] list-disc pl-[2.4rem] font-sans text-[1.7rem] font-light leading-[1.55] opacity-90">
            {p.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="mt-[1.4rem] font-mono text-[1.4rem] leading-[1.6] text-white">{p.stack.join(", ")}</p>
          <p className="mt-[0.6rem] font-mono text-[1.4rem] leading-[1.6] opacity-80">{metaOf(p)}</p>
          {p.href ? (
            <a className="mt-[0.6rem] inline-block font-mono text-[1.4rem] underline underline-offset-[0.35em]" href={p.href} rel="noreferrer" target="_blank">
              {hostOf(p.href)}
            </a>
          ) : null}
        </article>
      ))}
    </>
  );
}

function SkillsText(): JSX.Element {
  return (
    <div className="mt-[6vh] grid grid-cols-1 gap-x-[4vw] gap-y-[5vh] md:grid-cols-3 xl:grid-cols-5">
      {skillGroups.map((g) => (
        <div key={g.label}>
          <h3 className="font-sans text-[2.2rem] font-medium leading-[1.2] text-white">{g.label}</h3>
          <p className="mt-[0.8rem] font-sans text-[1.5rem] font-light italic leading-[1.4] opacity-80">{g.blurb}</p>
          <ul className="mt-[1.6rem] space-y-[1rem]">
            {g.skills.map((s) => (
              <li className="flex items-center gap-[0.8rem] font-mono text-[1.5rem] leading-none" key={s.name}>
                <SkillMark size="2.2rem" skill={s} tinted={false} />
                {s.name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ContactText(): JSX.Element {
  return (
    <>
      <a className="mt-[5vh] block font-sans text-[6vw] font-light leading-none tracking-[-0.03em] text-white" href={`mailto:${EMAIL}`}>
        {EMAIL}
      </a>
      <ul className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh] font-mono text-[1.6rem]">
        {elsewhere.map((l) => (
          <li key={l.href}>
            <a className="group block" href={l.href} rel="noreferrer" target="_blank">
              <span className="block text-[1.3rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
              <span className="mt-[0.4rem] block text-white group-hover:underline">{l.handle}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

// ------------------------------------------------------------ layouts

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <div className="absolute inset-0" data-canvas />
        <div className="pointer-events-none absolute inset-0 z-10" data-hot />
        {/* On a plum ground of their own: the pages run under both corners. */}
        <p
          aria-hidden
          className={`absolute bottom-[3vh] left-[3vw] z-10 whitespace-pre px-[1.4rem] py-[0.8rem] text-white ${SMALL}`}
          data-count
          style={{ backgroundColor: BAND }}
        >
          01 / 07
        </p>
        <p className={`absolute bottom-[3vh] right-[3vw] z-10 px-[1.4rem] py-[0.8rem] ${SMALL}`} style={{ backgroundColor: BAND }}>
          Scroll to turn the page
        </p>
      </div>

      <section
        className="pointer-events-none relative"
        id="work"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * ${SECTION_SCREENS.work})` }}
      >
        <div className="sr-only">
          <h2>Work</h2>
          <WorkText />
        </div>
      </section>
      <section className="pointer-events-none relative" id="skills" style={{ height: `calc(${SCREEN} * ${SECTION_SCREENS.skills})` }}>
        <div className="sr-only">
          <h2>Skills</h2>
          <SkillsText />
        </div>
      </section>
      <section className="pointer-events-none relative" id="contact" style={{ height: `calc(${SCREEN} * ${SECTION_SCREENS.contact})` }}>
        <div className="sr-only">
          <h2>Contact</h2>
          <ContactText />
        </div>
      </section>
    </div>
  );
}

/** One printed page, flat, as big as a screen allows. `pages` is 1 for a page and 2 for the centre fold. */
function FlatPage({ faces }: { faces: string[] }): JSX.Element {
  const across = faces.length;
  return (
    <div className="flex w-full items-center justify-center" style={{ minHeight: SCREEN }}>
      <div
        className="flex"
        style={{
          height: `min(86vh, calc(90vw * 4 / ${3 * across}))`,
          aspectRatio: `${3 * across} / 4`,
          boxShadow: "0 2vh 6vh rgba(26, 8, 18, 0.7)",
        }}
      >
        {faces.map((f) => (
          <div className="relative h-full" key={f} style={{ aspectRatio: "3 / 4" }}>
            <canvas aria-hidden className="block h-full w-full" data-flat={f} style={{ backgroundColor: "#fde7f3" }} />
            <div className="absolute inset-0" data-flat-hot />
          </div>
        ))}
      </div>
    </div>
  );
}

function Flat(): JSX.Element {
  return (
    <div>
      <section className="relative" id="work">
        <div className="sr-only">
          <h2>Work</h2>
          <WorkText />
        </div>
        {projects.map((p, i) => (
          <FlatPage faces={[`f${i}`]} key={p.title} />
        ))}
      </section>
      <section className="relative" id="skills">
        <div className="sr-only">
          <h2>Skills</h2>
          <SkillsText />
        </div>
        <FlatPage faces={["b4", "f5"]} />
      </section>
      <section className="relative" id="contact">
        <div className="sr-only">
          <h2>Contact</h2>
          <ContactText />
        </div>
        <FlatPage faces={["f6"]} />
      </section>
    </div>
  );
}

function Plain(): JSX.Element {
  return (
    <div>
      <section className="px-[4.5vw] pb-[8vh] pt-[14vh]" id="work">
        <h2 className={`opacity-60 ${SMALL}`}>Work</h2>
        <WorkText />
      </section>
      <section className="px-[4.5vw] py-[10vh]" id="skills">
        <h2 className={`opacity-60 ${SMALL}`}>Skills</h2>
        <SkillsText />
      </section>
      <section className="px-[4.5vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-60 ${SMALL}`}>Contact</h2>
        <ContactText />
      </section>
    </div>
  );
}

export default function B14(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting or turns a tablet on its side.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // In a media query an em is the browser's own 16, not the page's rem, so 56em is 896 wide.
    const narrow = window.matchMedia("(max-width: 56em), (orientation: portrait)");
    const pick = (): void => {
      if (less.matches || narrow.matches) setMode("flat");
      else setMode(webglWorks() ? "journey" : "plain");
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
      return mode === "journey" ? startJourney(root) : startFlat(root);
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* The canvas reads the three faces' family names off these. */}
      <span aria-hidden className="hidden font-serif-display italic" data-font="serif" />
      <span aria-hidden className="hidden font-sans" data-font="sans" />
      <span aria-hidden className="hidden font-mono" data-font="mono" />
      {mode === "journey" ? <Journey /> : mode === "flat" ? <Flat /> : <Plain />}
      {/* The band above is this colour. The desk comes up out of it and the
          join shows no line. It scrolls away with the page. */}
      {mode === "journey" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[14vh]"
          style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 12%, rgba(42, 13, 30, 0) 100%)` }}
        />
      ) : null}
    </div>
  );
}
