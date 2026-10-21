"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";

import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import { createCluster, type Cluster } from "@/components/below/b02/scene";
import { FRAME, TL, makeStage, smooth, WHITE } from "@/components/below/b02/timeline";
import Ending from "@/components/Ending";
import { projects, skillGroups } from "@/components/profile";

/**
 * The skills, the work and the end of the page: design 02's scene
 * (lusion.co's knot of solid pieces) on the home page's plum, drawn in the
 * valley's bars, as sondaven draws everything.
 *
 * One canvas is pinned for the whole block and the page scrolls past it.
 * The 42 skills are 42 pieces. They start as a knot in a frame beside the
 * skills index (the cursor pushes them apart; a row of the index pulls its
 * group out), fly out round the edge of the screen, then hold the five
 * project cards by their corners while each card leans toward the cursor
 * and ripples under it. Each card is the project's own picture, through
 * the bars. As the night sky comes up (Ending, which lives inside this
 * block so the pieces stay over it) gravity comes on and the pieces rain
 * down onto the hills under the moon.
 *
 * Layers, bottom to top: the sky (z auto), the pinned stage (z 2), the
 * words of the work (z 3). Nothing here makes its own stacking context,
 * so those three interleave. The stage takes no pointer events except on
 * the index; the scene reads the cursor from the window.
 *
 * On a wide screen the first screen of this block comes up over the end
 * of the statement band while its flowers are still pinned, so that
 * screen has no ground of its own.
 *
 * The page-long brush stroke that was here is in components/pageStroke.ts,
 * unused for now.
 */

const screens = (n: number): string => `calc(var(--arbor-screen-h, 100vh) * ${n / 100})`;
const pad = (n: number): string => String(n).padStart(2, "0");
const total = skillGroups.reduce((a, g) => a + g.skills.length, 0);
const bare = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif is a DEMO cut and draws a watermark for these. */
const serifSafe = (t: string): boolean => !/[0-9\-‑'"&@!()/]/.test(t);

/** Where the work ends and the sky begins, in the design's screens x 100:
 *  the cards start at TL.firstCard, one screen each. */
const SKY_TOP = TL.firstCard + projects.length * 100;
/** Gravity comes on as the sky is most of the way up the screen. */
const PILE_AT = SKY_TOP - 40;

/** The frame's ground: the site's deep plum, thin enough for the aurora.
 *  None while the block rises over the band (so no edge crosses the
 *  flowers) and none again under the sky (so the moon is not dimmed). */
const FRAME_ALPHA = 0.55;
const frameGround = (s: number): string =>
  `rgba(26, 8, 18, ${(FRAME_ALPHA * smooth(0, 50, s) * (1 - smooth(SKY_TOP - 120, SKY_TOP - 50, s))).toFixed(3)})`;

/** Saturn has no picture and no page. Its card carries its one number,
 *  set in type, drawn for the bars like any picture. */
function saturnPlate(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 900;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const sans = getComputedStyle(document.body).fontFamily;
  ctx.font = `300 330px ${sans}`;
  ctx.fillText("40,000+", c.width / 2, 540);
  ctx.fillStyle = "#b8b8b8";
  ctx.font = `400 64px ${sans}`;
  ctx.fillText("users", c.width / 2, 690);
  return c;
}

export default function Projects(): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const labelName = useRef<HTMLSpanElement>(null);
  const labelGroup = useRef<HTMLSpanElement>(null);
  const cluster = useRef<Cluster | null>(null);
  const [focus, setFocus] = useState(-1);

  useEffect(() => {
    const r = root.current, s = stage.current, f = frame.current, l = legend.current, h = hint.current;
    const lb = label.current, ln = labelName.current, lg = labelGroup.current, hd = head.current;
    if (!r || !s || !f || !l || !h || !lb || !ln || !lg || !hd) return undefined;
    const stageOpts = { frame: f, ground: frameGround, radius: 0 };
    // The heading goes with the frame: when the frame opens back out to
    // the whole screen it would otherwise show through it behind the cards.
    const applyStage = makeStage({ ...stageOpts, withFrame: [l, h, hd] });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let made: Cluster | null = null;
    let gone = false;
    let cleanup: (() => void) | null = null;
    // Saturn's plate is set in the page's font, so wait for it.
    void document.fonts.ready.then(() => {
      if (gone) return;
      try {
        made = createCluster({
          root: r, stage: s, frame: f, label: lb, labelName: ln, labelGroup: lg,
          slots: Array.from(r.querySelectorAll<HTMLElement>("[data-slot]")),
          texts: Array.from(r.querySelectorAll<HTMLElement>("[data-words]")),
          applyStage, reduced,
          fontFamily: getComputedStyle(document.body).fontFamily,
          // The robot's grade in the band: a lit face is a wide bar.
          bars: { cell: 8, ink: BLOSSOM, black: 0.1, white: 1, maxWidth: 0.62 },
          photos: projects.map((p) => p.image ?? saturnPlate()),
          pileAt: PILE_AT,
          // The foot of the screen, under the hills and the moon.
          floor: 0.45,
          // Under the index on a phone, where the index takes the top.
          knotShift: (w) => (w < 768 ? { x: -0.075, y: -0.2 } : { x: 0, y: 0 }),
          // Smaller in the pile on a phone, or the 42 of them fill the screen.
          pileScale: (w) => (w < 768 ? 0.42 : 0.8),
          // Matches the words' md breakpoint.
          tallCards: (w) => w < 768,
        });
      } catch {
        made = null;
      }
      cluster.current = made;
      if (made) return;
      // No WebGL. The frame still opens and closes with the page.
      const plainStage = makeStage({ ...stageOpts, withFrame: [l, hd], plain: true });
      const onScroll = (): void => {
        plainStage((-r.getBoundingClientRect().top / Math.max(1, s.clientHeight)) * 100);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      onScroll();
      cleanup = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    });
    return () => {
      gone = true;
      (made as Cluster | null)?.dispose();
      cluster.current = null;
      cleanup?.();
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
    <div className="relative" data-projects ref={root} style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style>{`
        @media (min-width: 1024px) {
          [data-projects] { background: linear-gradient(transparent 100vh, ${PLUM_WASH} 100vh) !important; }
        }
      `}</style>
      <div className="pointer-events-none sticky top-0 z-[2] h-screen overflow-hidden" ref={stage}>
        <section className="absolute inset-0" id="skills">
          {/* Over the frame's top margin. */}
          <div
            className="absolute inset-x-[3vw] top-0 z-0 flex items-end justify-between pb-[2.4vh]"
            ref={head}
            style={{ height: `${FRAME.top}vh`, opacity: 0, visibility: "hidden" }}
          >
            <div className="flex items-end gap-[3vw]">
              <p className="pb-[1.2vh] font-mono text-[1.4rem] uppercase tracking-[0.18em] opacity-60">(01)</p>
              <h2 className="pb-[0.12em] font-serif-display text-[min(13vh,7vw)] italic leading-[0.9] tracking-[-0.03em]">Skills</h2>
            </div>
            <p className="hidden max-w-[28vw] pb-[1.2vh] text-right font-mono md:block text-[1.4rem] uppercase leading-[1.6] tracking-[0.16em] opacity-60">
              {total} tools in {skillGroups.length} groups. Each piece is one.
            </p>
          </div>

          {/* The index, in the frame, over the scene. Hidden until the
              frame is at rest. A row pulls its group out of the knot. */}
          <div
            // On a phone the index spans the frame's top and the knot sits
            // under it (knotShift); from md it is the left column.
            className="absolute right-[3vw] z-[2] flex flex-col justify-start px-[4vw] pt-[2.4vh] md:bottom-[3vw] md:right-auto md:w-[30vw] md:justify-center md:px-0 md:pl-[2.4vw] md:pt-0"
            ref={legend}
            style={{ top: `${FRAME.top}vh`, left: `${FRAME.side}vw`, opacity: 0, visibility: "hidden" }}
          >
            <ul className="border-t border-[#f9b9dc]/25">
              {skillGroups.map((g, gi) => {
                const on = focus === gi;
                return (
                  <li className="border-b border-[#f9b9dc]/25" key={g.label}>
                    <button
                      aria-pressed={on}
                      className="pointer-events-auto block w-full py-[1.9vh] text-left transition-opacity duration-300"
                      onClick={() => choose(gi)}
                      style={{ opacity: focus < 0 || on ? 1 : 0.4 }}
                      type="button"
                    >
                      <span className="flex items-baseline gap-[1.4rem] font-mono text-[1.6rem] uppercase tracking-[0.14em]" style={{ color: on ? WHITE : BLOSSOM }}>
                        <span className="tabular-nums opacity-60">{pad(gi + 1)}</span>
                        <span className="flex-1">{g.label}</span>
                        <span className="tabular-nums opacity-60">{pad(g.skills.length)}</span>
                      </span>
                      <span className="mt-[0.8vh] hidden pl-[3.8rem] font-sans text-[1.45rem] font-light leading-[1.5] md:block" style={{ opacity: on ? 0.95 : 0.6 }}>
                        {g.skills.map((k) => k.name).join(", ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <p
            className="absolute z-[2] font-mono text-[1.4rem] uppercase tracking-[0.18em]"
            ref={hint}
            style={{ bottom: `calc(${FRAME.side}vw + 3rem)`, right: `calc(${FRAME.side}vw + 3.4rem)`, opacity: 0, visibility: "hidden" }}
          >
            Move the cursor through it.
          </p>
        </section>

        <div className="absolute inset-0 z-[1]" ref={frame} style={{ backgroundColor: frameGround(-100) }} />

        <div
          aria-hidden="true"
          className="absolute left-0 top-0 z-[3] flex flex-col items-center whitespace-nowrap px-[1.4rem] py-[0.8rem] font-mono uppercase tracking-[0.12em] opacity-0 transition-opacity duration-200"
          ref={label}
          style={{ backgroundColor: BLOSSOM, color: BAND }}
        >
          <span className="text-[1.5rem] font-medium" ref={labelName} />
          <span className="text-[1.05rem] opacity-70" ref={labelGroup} />
        </div>
      </div>

      {/* The page that scrolls past the pinned scene. Not a stacking
          context of its own: its parts sit above or below the stage. */}
      <div className="pointer-events-none relative" style={{ marginTop: screens(-100) }}>
        <div style={{ height: screens(TL.workTop) }} />

        <section id="work">
          <div className="relative z-[3] flex flex-col items-center justify-center" style={{ height: screens(TL.headH) }}>
            <p className="font-mono text-[1.4rem] uppercase tracking-[0.18em] opacity-60">(02)</p>
            <h2 className="mt-[2vh] pb-[0.1em] font-serif-display text-[min(30vh,16vw)] italic leading-[0.9] tracking-[-0.04em]">Work</h2>
          </div>

          {projects.map((p, i) => (
            <article className="relative h-screen" key={p.title}>
              {/* The box the card is drawn in. */}
              <div className="absolute left-[6vw] top-[12vh] h-[76vh] w-[88vw]" data-slot />
              {/* The words, leaning with the card, on the part of it the
                  picture leaves empty (the card's left 42%, or its lower half on a
                  phone). */}
              <div className="absolute left-[6vw] top-[12vh] z-[3] flex h-[76vh] w-[88vw] flex-col justify-end will-change-transform md:block" data-words>
                <div className="flex h-1/2 w-full flex-col gap-[2.4vh] px-[5vw] py-[3vh] md:h-full md:w-[36vw] md:justify-between md:gap-0 md:px-0 md:py-[7vh] md:pl-[3vw]">
                  <p className="font-mono text-[1.5rem] uppercase leading-[1.6] tracking-[0.16em] opacity-75">
                    <span className="tabular-nums">{pad(i + 1)} / {pad(projects.length)}</span>
                    <span className="mx-[1.4rem]">·</span>
                    <span className="tabular-nums">{p.year}</span>
                    {p.award ? (
                      <>
                        <br />
                        <span>{p.award}</span>
                      </>
                    ) : null}
                  </p>
                  <div>
                    <h3
                      className={
                        serifSafe(p.title)
                          ? "pb-[0.08em] font-serif-display text-[9vw] italic leading-[1] tracking-[-0.03em] text-white md:text-[min(11vh,5vw)]"
                          : "pb-[0.08em] font-sans text-[8vw] font-light leading-[1] tracking-[-0.04em] text-white md:text-[min(9.5vh,4.3vw)]"
                      }
                    >
                      {p.title}
                    </h3>
                    <p className="mt-[1.6vh] font-sans text-[1.6rem] font-light leading-[1.4] text-white/90 md:mt-[3vh] md:text-[2.1rem]">{p.tagline}</p>
                    <ul className="mt-[3vh] hidden flex-wrap md:flex gap-x-[1.6rem] gap-y-[0.6rem] font-mono text-[1.4rem] uppercase tracking-[0.12em] opacity-75">
                      {p.stack.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                    {p.href || p.code ? (
                      <p className="mt-[3.4vh] flex flex-wrap gap-x-[2.4rem] gap-y-[0.8rem] font-mono text-[1.5rem] tracking-[0.06em]">
                        {p.href ? (
                          <a className="pointer-events-auto underline underline-offset-[0.45em] hover:text-white" href={p.href} rel="noreferrer" target="_blank">
                            {bare(p.href)} ↗
                          </a>
                        ) : null}
                        {p.code ? (
                          <a className="pointer-events-auto underline underline-offset-[0.45em] hover:text-white" href={p.code} rel="noreferrer" target="_blank">
                            source ↗
                          </a>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>

        {/* The night sky and the moon, with the email. Under the stage, so
            the pieces fall in front of it. */}
        <div className="pointer-events-auto">
          <Ending />
        </div>
      </div>
    </div>
  );
}
