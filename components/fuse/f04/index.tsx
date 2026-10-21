"use client";

import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { Libre_Baskerville } from "next/font/google";

import { EMAIL, socialLinks } from "@/components/siteContent";

import { About, CHANNELS, Contact, Timeline, Work, WORK } from "./content";
import { createScreen, type Screen, STATIC_FULL_UNTIL, SWAP_AT, SWITCH_MS } from "./screen";
import s from "./f04.module.css";

/**
 * Concept F04, "Channel": the whole site on one screen, as a television.
 *
 * A dark plum room. An old set stands in the middle, drawn in CSS and SVG:
 * rounded cabinet, rabbit-ear aerial, a curved glass with scanlines and a
 * dark rim, a "CH 01" readout, two knobs and a speaker grille in the site's
 * bars. The name is set huge and low behind it in lukebaffait.fr's way
 * ("Kevin" in the sans, "He." in the italic display serif), and Luke's
 * footer runs along the foot under a hairline.
 *
 * The glass shows lanceyan.com's four pages as four channels: about, a
 * timeline whose rows open, the work list, and contact with a ruled quote.
 * Lance's serif block sits on the glass over a picture made of diamond dots
 * (./screen.ts, the page's only WebGL canvas). Each channel has its own
 * picture.
 *
 * Changing channel: the pager ("01 / 04 →"), the right knob, the arrow
 * keys, 1 to 4, the mouse wheel, a sideways swipe on the glass, or Work,
 * Info and Contact in the footer. The old picture folds into a white line,
 * the line shrinks to a point, the glass fills with static for a moment,
 * and the new channel comes up through it. About 350 ms. With reduced
 * motion it is a plain quick fade and the pictures hold still.
 *
 * The left knob is the picture knob: three brightness settings.
 */

const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap" });

const COUNT = CHANNELS.length;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const LEVELS = [0.72, 1, 1.28];
const GLOW = ["#b8174f", "#f9b9dc", "#8a1c5c", "#6a1d44"];

const linkLabel = (label: string): string => label.toLowerCase();

export default function F04(): JSX.Element {
  const rootRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenElRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const screen = useRef<Screen | null>(null);

  /** What the words on the glass show. Changes at SWAP_AT into a switch. */
  const [shown, setShown] = useState(0);
  /** What the set is tuned to. Changes on the click. */
  const [tuned, setTuned] = useState(0);
  const tunedRef = useRef(0);
  const busy = useRef(false);
  const [turn, setTurn] = useState(0);
  const [level, setLevel] = useState(1);
  const [project, setProject] = useState(0);
  const [clock, setClock] = useState("");
  const [noPicture, setNoPicture] = useState(false);
  const refocus = useRef(false);
  const timers = useRef<number[]>([]);

  const reducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const go = useCallback((target: number, dir?: 1 | -1) => {
    const next = ((target % COUNT) + COUNT) % COUNT;
    if (busy.current || next === tunedRef.current) return;
    busy.current = true;
    const from = tunedRef.current;
    const d = dir ?? (next > from ? 1 : -1);
    tunedRef.current = next;
    setTuned(next);
    setTurn((t) => t + d * 90);
    // If focus is inside the words that are about to go, put it back on
    // the glass once the new words are in.
    const active = document.activeElement;
    refocus.current = Boolean(active && scrollRef.current?.contains(active));

    const later = (ms: number, fn: () => void): void => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    if (reducedMotion()) {
      screen.current?.setChannel(next);
      textRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
      setShown(next);
      later(160, () => {
        busy.current = false;
      });
      return;
    }

    screen.current?.switchTo(next);
    const a = SWAP_AT / SWITCH_MS;
    const b = STATIC_FULL_UNTIL / SWITCH_MS;
    const fold = 120 / SWITCH_MS;
    screenElRef.current?.animate(
      [
        { transform: "scale(1, 1)", filter: "brightness(1)", easing: "cubic-bezier(0.6, 0, 0.9, 0.5)" },
        { offset: fold, transform: "scale(1, 0.006)", filter: "brightness(2.6)", easing: "ease-in" },
        { offset: a, transform: "scale(0, 0.006)", filter: "brightness(3)" },
        { offset: a + 0.001, transform: "scale(1, 1)", filter: "brightness(1.5)", easing: "ease-out" },
        { offset: 1, transform: "scale(1, 1)", filter: "brightness(1)" },
      ],
      { duration: SWITCH_MS },
    );
    lineRef.current?.animate(
      [
        { opacity: 0, transform: "scaleX(1)" },
        { offset: fold * 0.75, opacity: 0, transform: "scaleX(1)" },
        { offset: fold, opacity: 1, transform: "scaleX(1)", easing: "ease-in" },
        { offset: a, opacity: 1, transform: "scaleX(0.01)" },
        { offset: a + 0.06, opacity: 0, transform: "scaleX(0.01)" },
        { offset: 1, opacity: 0, transform: "scaleX(0.01)" },
      ],
      { duration: SWITCH_MS },
    );
    textRef.current?.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { offset: a, opacity: 1, transform: "translateY(0)" },
        { offset: a + 0.001, opacity: 0, transform: "translateY(0.6%)" },
        { offset: b, opacity: 0, transform: "translateY(0.6%)", easing: "steps(3, end)" },
        { offset: 1, opacity: 1, transform: "translateY(0)" },
      ],
      { duration: SWITCH_MS },
    );
    later(SWAP_AT, () => setShown(next));
    later(SWITCH_MS + 10, () => {
      busy.current = false;
    });
  }, []);

  const step = useCallback((dir: 1 | -1) => go(tunedRef.current + dir, dir), [go]);

  // New words: scroll them to the top, and put focus back if it was lost.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    sc.scrollTop = 0;
    if (refocus.current) {
      refocus.current = false;
      sc.focus({ preventScroll: true });
    }
  }, [shown]);

  // The picture.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const sc = createScreen(canvas, { reduced: reducedMotion(), channel: tunedRef.current });
    if (!sc) {
      setNoPicture(true);
      return undefined;
    }
    screen.current = sc;
    const first = WORK[0]?.project;
    if (first) sc.setProject(first);
    sc.preload(WORK.map((w) => w.project));
    return () => {
      sc.dispose();
      screen.current = null;
    };
  }, []);

  useEffect(() => {
    const w = WORK[project]?.project;
    if (w) screen.current?.setProject(w);
  }, [project]);

  useEffect(() => {
    screen.current?.setLevel(LEVELS[level]);
  }, [level]);

  // Toronto time for the footer, after mount so the server and the first
  // client render agree.
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Toronto" });
    const tick = (): void => setClock(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, []);

  // Keys, wheel and swipes change the channel.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    /** Whether the words on the glass can scroll further that way. */
    const canScroll = (dy: number): boolean => {
      const sc = scrollRef.current;
      if (!sc || sc.scrollHeight <= sc.clientHeight + 1) return false;
      return dy > 0 ? sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1 : sc.scrollTop > 0;
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey || e.metaKey || e.ctrlKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if ((e.key === "ArrowDown" || e.key === "PageDown") && !canScroll(1)) {
        e.preventDefault();
        step(1);
      } else if ((e.key === "ArrowUp" || e.key === "PageUp") && !canScroll(-1)) {
        e.preventDefault();
        step(-1);
      } else if (/^[1-4]$/.test(e.key)) {
        go(Number(e.key) - 1);
      }
    };

    // One channel per wheel gesture: after a change, the wheel has to rest
    // for a moment before it can change again, so a trackpad's long fling
    // is one step and not three.
    let acc = 0;
    let locked = false;
    let idle = 0;
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey) return;
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const sc = scrollRef.current;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        locked = false;
        acc = 0;
      }, 240);
      if (sc && e.target instanceof Node && sc.contains(e.target) && canScroll(dy)) {
        acc = 0;
        return;
      }
      e.preventDefault();
      if (locked) return;
      acc += e.deltaMode === 1 ? dy * 30 : dy;
      if (Math.abs(acc) > 50) {
        locked = true;
        step(acc > 0 ? 1 : -1);
        acc = 0;
      }
    };

    let sx = 0;
    let sy = 0;
    let tracking = false;
    const glass = screenElRef.current?.parentElement ?? null;
    const onTouchStart = (e: TouchEvent): void => {
      if (e.touches.length !== 1) return;
      tracking = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent): void => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    };

    // A little lean towards the pointer, on a mouse only.
    const fine = window.matchMedia("(pointer: fine)").matches && !reducedMotion();
    let leanRaf = 0;
    let px = 0;
    let py = 0;
    const lean = (): void => {
      leanRaf = 0;
      const b = bodyRef.current;
      if (!b) return;
      b.style.setProperty("--ry", `${(px * 2.2).toFixed(2)}deg`);
      b.style.setProperty("--rx", `${(-py * 1.6).toFixed(2)}deg`);
    };
    const onMove = (e: PointerEvent): void => {
      if (!fine || e.pointerType !== "mouse") return;
      px = (e.clientX / window.innerWidth) * 2 - 1;
      py = (e.clientY / window.innerHeight) * 2 - 1;
      if (!leanRaf) leanRaf = requestAnimationFrame(lean);
    };

    window.addEventListener("keydown", onKey);
    root.addEventListener("wheel", onWheel, { passive: false });
    glass?.addEventListener("touchstart", onTouchStart, { passive: true });
    glass?.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      root.removeEventListener("wheel", onWheel);
      glass?.removeEventListener("touchstart", onTouchStart);
      glass?.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("pointermove", onMove);
      window.clearTimeout(idle);
      cancelAnimationFrame(leanRaf);
    };
  }, [go, step]);

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const footerNav: { label: string; ch: number }[] = [
    { label: "Work", ch: 2 },
    { label: "Info", ch: 0 },
    { label: "Contact", ch: 3 },
  ];

  return (
    <main className={s.room} data-lenis-prevent="" ref={rootRef} style={{ ["--glow" as string]: GLOW[tuned] }}>
      <div aria-hidden="true" className={s.wall} />
      <div aria-hidden="true" className={s.floor} />

      <header className={s.head}>
        <p className={s.intro}>
          Engineer in Toronto,
          <br />
          <em className="font-serif-display">building systems that bring ideas to life.</em>
        </p>
        <p className={s.hint}>
          <span className={s.count}>({pad2(COUNT)})</span>
          <span className={s.hintWide}>Channels. Turn the knob, or use the arrow keys</span>
          <span className={s.hintNarrow}>Channels. Swipe the glass</span>
        </p>
      </header>

      <h1 aria-label="Kevin He" className={s.lockup}>
        <span aria-hidden="true" className={s.first}>
          Kevin
        </span>
        <span aria-hidden="true" className={`${s.last} font-serif-display`}>
          He.
        </span>
      </h1>
      <div aria-hidden="true" className={s.spill} />

      <div className={s.tv}>
        <svg aria-hidden="true" className={s.aerial} fill="none" viewBox="0 0 200 70">
          <path className={s.rod} d="M100 64 L28 5" />
          <path className={s.rod} d="M100 64 L174 11" />
          <circle cx="28" cy="5" fill="#f9b9dc" fillOpacity="0.55" r="2.4" />
          <circle cx="174" cy="11" fill="#f9b9dc" fillOpacity="0.55" r="2.4" />
          <path d="M80 70 Q100 50 120 70 Z" fill="#2a0d1e" stroke="rgba(249,185,220,0.25)" strokeWidth="0.8" />
        </svg>

        <div className={s.body} ref={bodyRef}>
          <div className={s.bezel}>
            <div className={`${s.glass} ${serif.className}`}>
              <div className={s.screen} ref={screenElRef}>
                <canvas aria-hidden="true" className={s.canvas} data-off={noPicture} ref={canvasRef} />
                <div className={s.text} ref={textRef}>
                  <div className={s.column} data-wide={shown === 1 || shown === 2}>
                    <div className={s.top}>
                      <h2 className={s.name}>Kevin He</h2>
                      <button aria-label={`Channel ${pad2(tuned + 1)} of ${pad2(COUNT)}. Next channel`} className={s.pager} onClick={() => step(1)} type="button">
                        <span>
                          {pad2(shown + 1)} / {pad2(COUNT)}
                        </span>
                        <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M5 12h14" />
                          <path d="m12 5 7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    <div aria-label={`Channel ${pad2(shown + 1)}, ${CHANNELS[shown]}`} className={s.scroll} data-lenis-prevent="" ref={scrollRef} role="region" tabIndex={0}>
                      {shown === 0 ? <About onTune={(ch) => go(ch)} /> : null}
                      {shown === 1 ? <Timeline /> : null}
                      {shown === 2 ? <Work active={project} onPick={setProject} /> : null}
                      {shown === 3 ? <Contact /> : null}
                    </div>
                    <nav aria-label="Elsewhere" className={s.links}>
                      {[...socialLinks].map((l) => (
                        <a href={l.href} key={l.label} rel="noreferrer" target="_blank">
                          {linkLabel(l.label)}
                        </a>
                      ))}
                      <a href={`mailto:${EMAIL}`}>email</a>
                    </nav>
                  </div>
                </div>
              </div>
              <div aria-hidden="true" className={s.scan} />
              <div aria-hidden="true" className={s.shine} />
              <div aria-hidden="true" className={s.line} ref={lineRef} />
            </div>
            <span aria-hidden="true" className={s.badge}>
              Kevin He
            </span>
          </div>

          <div className={s.panel}>
            <div aria-hidden="true" className={`${s.display} font-mono`}>
              <span className={s.dim}>CH</span> {pad2(tuned + 1)}
            </div>
            <div className={s.knobs}>
              <div className={s.knobWrap}>
                <button
                  aria-label={`Picture brightness, ${["low", "normal", "high"][level]}`}
                  className={s.knob}
                  onClick={() => setLevel((l) => (l + 1) % LEVELS.length)}
                  style={{ ["--turn" as string]: `${(level - 1) * 60}deg` }}
                  type="button"
                >
                  <span className={s.notch} />
                </button>
                <span aria-hidden="true" className={s.knobLabel}>
                  Picture
                </span>
              </div>
              <div className={s.knobWrap}>
                <button aria-label={`Next channel, now ${pad2(tuned + 1)} of ${pad2(COUNT)}`} className={s.knob} onClick={() => step(1)} style={{ ["--turn" as string]: `${turn}deg` }} type="button">
                  <span className={s.notch} />
                </button>
                <span aria-hidden="true" className={s.knobLabel}>
                  Channel
                </span>
              </div>
            </div>
            <div aria-hidden="true" className={s.grille} />
            <div aria-hidden="true" className={s.power}>
              <span className={s.led} />
            </div>
          </div>
        </div>
        <div aria-hidden="true" className={s.feet}>
          <span />
          <span />
        </div>
      </div>

      <footer className={s.foot}>
        <span className={s.version}>
          <span aria-hidden="true">&rarr;</span> Toronto <span className={s.clock}>{clock}</span>
        </span>
        <nav aria-label="Social" className={s.socials}>
          {socialLinks.map((l, i) => (
            <span key={l.label}>
              {i > 0 ? (
                <span aria-hidden="true" className={s.slash}>
                  /
                </span>
              ) : null}
              <a href={l.href} rel="noreferrer" target="_blank">
                {l.label}
              </a>
            </span>
          ))}
        </nav>
        <nav aria-label="Channels" className={s.sections}>
          {footerNav.map((n) => (
            <button aria-current={tuned === n.ch ? "true" : undefined} key={n.label} onClick={() => go(n.ch)} type="button">
              {n.label}
            </button>
          ))}
        </nav>
      </footer>

      <p aria-live="polite" className="sr-only">
        {`Channel ${pad2(tuned + 1)} of ${pad2(COUNT)}: ${CHANNELS[tuned]}`}
      </p>
    </main>
  );
}
