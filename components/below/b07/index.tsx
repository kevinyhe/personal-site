"use client";

import { type JSX, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BAND } from "@/components/bandColours";
import { projects } from "@/components/profile";
import { ContactLinks, pad2, ProjectBullets, ProjectFacts, SkillGroups } from "./content";
import styles from "./desk.module.css";
import Desktop, { type DeskControls } from "./Desktop";
import { ARRIVE, TRACK_SCREENS } from "./rig";
import { startMoveIn, startStill } from "./stage";

/**
 * Design 07, Desk. The home page opens on an old television, so it ends
 * on one too. A dark plum room, a desk, a lamp, the television from the
 * hero with a keyboard in front of it. Scrolling brings the camera round
 * to the front and in, until the screen fills the window. The screen is a
 * small desktop made of real page elements: three windows, Work, Skills
 * and Contact.
 *
 * The page has three layouts.
 *   scene  the pinned move in, the desktop on the television.
 *   still  one frame of the desk from the front, the desktop laid flat
 *          under it. For a visitor who asked for less motion, and for a
 *          window too narrow for a desktop.
 *   plain  the flat desktop alone. What the server sends, and what is
 *          left if WebGL cannot start.
 */

type Mode = "boot" | "scene" | "still" | "plain";

const SCREEN = "var(--arbor-screen-h)";
const DEEP = "#1a0812";
const SMALL = "font-mono text-[1.5rem] uppercase tracking-[0.18em]";

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

function MoveIn(): JSX.Element {
  return (
    <div className="relative" data-track style={{ height: `calc(${SCREEN} * ${TRACK_SCREENS})` }}>
      <section className="h-full" id="work">
        <h2 className="sr-only">Work</h2>
        <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: DEEP }}>
          {/* The desktop goes in here, behind the canvas. It shows through
              the one place the canvas is clear: the television's screen. */}
          <div className="absolute inset-0" data-behind />
          <div className="pointer-events-none absolute inset-0" data-canvas />
          <p
            className={`pointer-events-none absolute bottom-[4vh] left-1/2 -translate-x-1/2 text-white transition-opacity duration-500 ${SMALL}`}
            data-hint
            style={{ opacity: 0.8 }}
          >
            Scroll to sit down.
          </p>
        </div>
      </section>
      {/* Two places along the track, after the camera is seated. A link to
          either scrolls here, and the window of that name opens. */}
      <section className="pointer-events-none absolute left-0 w-full" id="skills" style={{ top: `calc(${SCREEN} * ${ARRIVE.skills})`, height: `calc(${SCREEN} * 0.3)` }}>
        <h2 className="sr-only">Skills</h2>
      </section>
      <section className="pointer-events-none absolute left-0 w-full" id="contact" style={{ top: `calc(${SCREEN} * ${ARRIVE.contact})`, height: `calc(${SCREEN} * 0.3)` }}>
        <h2 className="sr-only">Contact</h2>
      </section>
    </div>
  );
}

function Pane({ id, title, children }: { id: string; title: string; children: ReactNode }): JSX.Element {
  return (
    <section className={styles.pane} id={id}>
      <div className={styles.paneBar}>
        <h2 className="font-mono text-[1.5rem] font-bold uppercase tracking-[0.12em]">{title}</h2>
        <span aria-hidden className={styles.grip} />
      </div>
      <div className="p-[2.4rem]">{children}</div>
    </section>
  );
}

function Flat({ withStage }: { withStage: boolean }): JSX.Element {
  return (
    <div>
      {withStage ? (
        <div className="relative w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: DEEP }}>
          <div className="absolute inset-0" data-canvas />
        </div>
      ) : null}

      <div className="px-[4vw] pb-[14vh] pt-[12vh]">
        <div className={`${styles.flat} font-mono`}>
          <div aria-hidden className={`${styles.fx} ${styles.lines}`} />
          <p className="relative flex h-[4.4rem] items-center bg-[#f9b9dc] pl-[2rem] text-[1.5rem] uppercase tracking-[0.14em] text-[#1a0812]">
            <span className="font-bold">Kevin He</span>
            <span aria-hidden className="mx-[1.2rem] opacity-50">
              /
            </span>
            <span>Desk</span>
          </p>
          <div className="relative space-y-[5rem] p-[3vw]">
            <Pane id="work" title="Work">
              <div className="grid grid-cols-1 gap-x-[4rem] gap-y-[4rem] lg:grid-cols-2">
                {projects.map((p, i) => (
                  <article key={p.title}>
                    <p className="font-mono text-[1.4rem] opacity-70">{pad2(i + 1)}</p>
                    <h3 className="mb-[1.2rem] mt-[0.4rem] font-sans text-[3rem] font-medium leading-[1.1] tracking-[-0.02em] text-white">{p.title}</h3>
                    <ProjectFacts bullets={false} project={p} />
                    <details className={`${styles.more} mt-[1.6rem] font-mono text-[1.4rem]`}>
                      <summary className="uppercase tracking-[0.14em]">More</summary>
                      <div className="mt-[1.4rem]">
                        <ProjectBullets project={p} />
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            </Pane>
            <Pane id="skills" title="Skills">
              <SkillGroups />
            </Pane>
            <Pane id="contact" title="Contact">
              <ContactLinks />
            </Pane>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function B07(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const controls = useRef<DeskControls | null>(null);
  const [mode, setMode] = useState<Mode>("boot");
  const [host, setHost] = useState<HTMLElement | null>(null);

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting or the window's width.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 45em)");
    const pick = (): void => setMode(webglWorks() ? (less.matches || narrow.matches ? "still" : "scene") : "plain");
    pick();
    less.addEventListener("change", pick);
    narrow.addEventListener("change", pick);
    return () => {
      less.removeEventListener("change", pick);
      narrow.removeEventListener("change", pick);
    };
  }, []);

  // The element the desktop is drawn into. It is made by hand and not by
  // React, because the scene moves it about the page to place it in 3D.
  useEffect(() => {
    if (mode !== "scene") return undefined;
    const el = document.createElement("div");
    setHost(el);
    return () => {
      setHost(null);
      el.remove();
    };
  }, [mode]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    try {
      if (mode === "still") return startStill(root);
      if (mode === "scene" && host) return startMoveIn(root, host, () => controls.current);
    } catch {
      // The scene could not start. The words stand without it.
      setMode("plain");
    }
    return undefined;
  }, [mode, host]);

  return (
    <div className="relative w-full" ref={rootRef} style={{ backgroundColor: BAND, color: "#f9b9dc" }}>
      {mode === "scene" ? <MoveIn /> : <Flat withStage={mode === "still"} />}
      {mode === "scene" && host ? createPortal(<Desktop controls={controls} />, host) : null}
      {/* The band above is this colour. The first thing under it is the
          band's own plum, and the room comes up out of that. It scrolls
          away with the page. */}
      {mode === "scene" || mode === "still" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[24vh]"
          style={{ background: `linear-gradient(${BAND} 0%, ${BAND} 10%, rgba(42, 13, 30, 0) 100%)` }}
        />
      ) : null}
    </div>
  );
}
