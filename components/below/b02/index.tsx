"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { CARD_LOOK } from "./cards";
import { createCluster, type Cluster } from "./scene";
import { FRAME, PALE, TL, makeStage, WHITE } from "./timeline";

/**
 * Design 02, "Cluster", after lusion.co.
 *
 * One canvas is pinned to the screen for the whole design and the page
 * scrolls over it. The 42 skills are 42 solid pieces in it. They start as
 * a knot in a rounded frame, fly out to hold the five project cards by
 * their corners, and at the end fall into a pile under the email.
 *
 * The frame is the canvas's box clipped to a rounded rectangle. It starts
 * full width in the band's plum, so the top joins the band above, then
 * draws in to show the pale ground round it.
 */

const screens = (n: number): string => `calc(var(--arbor-screen-h, 100vh) * ${n / 100})`;
const pad = (n: number): string => String(n).padStart(2, "0");
const total = skillGroups.reduce((a, g) => a + g.skills.length, 0);
/** A link without its "https://", to show as text. */
const bare = (href: string): string => href.replace(/^https?:\/\//, "");

export default function B02(): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const labelName = useRef<HTMLSpanElement>(null);
  const labelGroup = useRef<HTMLSpanElement>(null);
  const cluster = useRef<Cluster | null>(null);
  const [focus, setFocus] = useState(-1);

  useEffect(() => {
    const r = root.current, s = stage.current, f = frame.current, l = legend.current, h = hint.current;
    const lb = label.current, ln = labelName.current, lg = labelGroup.current;
    if (!r || !s || !f || !l || !h || !lb || !ln || !lg) return undefined;
    const applyStage = makeStage({ frame: f, withFrame: [l, h] });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let made: Cluster | null = null;
    try {
      made = createCluster({
        root: r, stage: s, frame: f, label: lb, labelName: ln, labelGroup: lg,
        slots: Array.from(r.querySelectorAll<HTMLElement>("[data-slot]")),
        texts: Array.from(r.querySelectorAll<HTMLElement>("[data-words]")),
        applyStage, reduced,
        fontFamily: getComputedStyle(document.body).fontFamily,
      });
    } catch {
      made = null;
    }
    cluster.current = made;
    if (made) {
      // The cards are drawn now, so the words give up their plain ground.
      r.dataset.gl = "on";
      return () => {
        made.dispose();
        cluster.current = null;
        delete r.dataset.gl;
      };
    }

    // No WebGL. The frame still opens and closes with the page, and the
    // words stand on plain grounds.
    const onScroll = (): void => {
      applyStage((-r.getBoundingClientRect().top / Math.max(1, s.clientHeight)) * 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const choose = useCallback((g: number) => {
    setFocus((was) => {
      const next = was === g ? -1 : g;
      cluster.current?.setFocus(next);
      return next;
    });
  }, []);

  return (
    <div className="group/b02 relative" ref={root} style={{ backgroundColor: BAND }}>
      <div className="sticky top-0 h-screen overflow-hidden" ref={stage} style={{ backgroundColor: PALE }}>
        <section className="absolute inset-0" id="skills">
          {/* On the pale ground, under the frame: the frame drawing in is
              what uncovers it. */}
          <div
            className="absolute inset-x-[3vw] top-0 z-0 flex items-end justify-between pb-[2.2vh]"
            style={{ color: BAND, height: `${FRAME.top}vh` }}
          >
            <h2 className="font-serif-display text-[min(15vh,8vw)] italic leading-[0.8] tracking-[-0.03em]">Skills</h2>
            <p className="pb-[0.6vh] font-mono text-[1.4rem] uppercase tracking-[0.16em] opacity-70">
              {total} tools in {skillGroups.length} groups
            </p>
          </div>

          {/* In the frame, over the scene. Hidden until the frame is at rest. */}
          <div
            className="absolute z-[2] flex w-[25vw] flex-col justify-center pl-[3.4rem]"
            ref={legend}
            style={{ top: `${FRAME.top}vh`, bottom: `${FRAME.side}vw`, left: `${FRAME.side}vw`, opacity: 0, visibility: "hidden", color: BLOSSOM }}
          >
            <ul className="flex flex-col gap-[3.2vh]">
              {skillGroups.map((g, gi) => (
                <li key={g.label}>
                  <h3>
                    <button
                      aria-pressed={focus === gi}
                      className="flex items-baseline gap-[1.2rem] text-left font-mono text-[1.8rem] uppercase tracking-[0.14em] transition-opacity duration-300 hover:opacity-100"
                      onClick={() => choose(gi)}
                      style={{ opacity: focus < 0 || focus === gi ? 1 : 0.45, color: focus === gi ? WHITE : BLOSSOM }}
                      type="button"
                    >
                      <span className="tabular-nums opacity-60">{pad(gi + 1)}</span>
                      <span className={focus === gi ? "underline underline-offset-[0.4em]" : ""}>{g.label}</span>
                      <span className="tabular-nums opacity-60">{g.skills.length}</span>
                    </button>
                  </h3>
                  <p
                    className="mt-[0.9vh] pl-[3.9rem] font-sans text-[1.5rem] font-light leading-[1.5] transition-opacity duration-300"
                    style={{ opacity: focus < 0 ? 0.62 : focus === gi ? 0.95 : 0.3 }}
                  >
                    {g.skills.map((k) => k.name).join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <p
            className="pointer-events-none absolute z-[2] font-mono text-[1.4rem] uppercase tracking-[0.18em]"
            ref={hint}
            style={{ bottom: `calc(${FRAME.side}vw + 3rem)`, right: `calc(${FRAME.side}vw + 3.4rem)`, opacity: 0, visibility: "hidden", color: BLOSSOM }}
          >
            Move the cursor through it.
          </p>
        </section>

        <div className="absolute inset-0 z-[1]" ref={frame} style={{ backgroundColor: BAND }} />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-[3] flex flex-col items-center whitespace-nowrap rounded-[1.2rem] px-[1.4rem] py-[0.8rem] font-mono uppercase tracking-[0.12em] opacity-0 transition-opacity duration-200"
          ref={label}
          style={{ backgroundColor: BLOSSOM, color: BAND }}
        >
          <span className="text-[1.5rem] font-medium" ref={labelName} />
          <span className="text-[1.05rem] opacity-70" ref={labelGroup} />
        </div>
      </div>

      {/* The page that scrolls over the pinned scene. */}
      <div className="pointer-events-none relative z-[1]" style={{ marginTop: screens(-100) }}>
        <div style={{ height: screens(TL.workTop) }} />

        <section id="work" style={{ color: BLOSSOM }}>
          <div className="flex flex-col items-center justify-center" style={{ height: screens(TL.headH) }}>
            <h2 className="font-serif-display text-[min(36vh,19vw)] italic leading-[0.8] tracking-[-0.04em]">Work</h2>
          </div>

          {projects.map((p, i) => {
            const look = CARD_LOOK[i];
            return (
              <article className="relative h-screen" key={p.title}>
                <div className="absolute left-[6vw] top-[12vh] h-[76vh] w-[88vw]" data-slot />
                <div
                  className="absolute left-[6vw] top-[12vh] flex h-[76vh] w-[88vw] flex-col justify-between rounded-[2rem] bg-[var(--ground)] px-[5vw] py-[9vh] will-change-transform group-data-[gl=on]/b02:!bg-transparent"
                  data-words
                  style={{ "--ground": look.ground, color: look.ink } as CSSProperties}
                >
                  <p className="font-mono text-[1.3rem] uppercase tracking-[0.16em]" style={{ color: look.soft }}>
                    <span className="tabular-nums">{pad(i + 1)} / {pad(projects.length)}</span>
                    <span className="mx-[1.4rem]">·</span>
                    <span className="tabular-nums">{p.year}</span>
                    {p.award ? (
                      <>
                        <span className="mx-[1.4rem]">·</span>
                        <span>{p.award}</span>
                      </>
                    ) : null}
                  </p>
                  <div className="max-w-[33vw]">
                    <h3 className="font-serif-display text-[min(12vh,6vw)] italic leading-[0.92] tracking-[-0.03em]">{p.title}</h3>
                    <p className="mt-[3vh] max-w-[30vw] font-sans text-[2.2rem] font-light leading-[1.34]">{p.tagline}</p>
                    <ul className="mt-[3.4vh] flex max-w-[30vw] flex-wrap gap-x-[1.6rem] gap-y-[0.6rem] font-mono text-[1.25rem] uppercase tracking-[0.12em]" style={{ color: look.soft }}>
                      {p.stack.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                    {p.href ? (
                      <a
                        className="pointer-events-auto mt-[3.4vh] inline-block font-mono text-[1.3rem] tracking-[0.06em] underline underline-offset-[0.5em]"
                        href={p.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {bare(p.href)}
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="relative flex h-screen flex-col items-center px-[4vw] pt-[15vh]" id="contact" style={{ color: BLOSSOM }}>
          <h2 className="font-mono text-[1.4rem] uppercase tracking-[0.18em] opacity-70">Contact</h2>
          <a
            className="pointer-events-auto mt-[3vh] font-sans text-[min(14vh,6.4vw)] font-light leading-[1] tracking-[-0.04em]"
            href={`mailto:${EMAIL}`}
            style={{ color: WHITE }}
          >
            {EMAIL}
          </a>
          <ul className="mt-[4.5vh] flex gap-[4rem] font-mono text-[1.4rem] uppercase tracking-[0.14em]">
            {elsewhere.map((e) => (
              <li key={e.label}>
                <a className="pointer-events-auto underline-offset-[0.5em] hover:underline" href={e.href} rel="noreferrer" target="_blank">
                  {e.label} <span className="normal-case opacity-60">{e.handle}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
