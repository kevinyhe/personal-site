"use client";

import { type JSX, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { type BarCanvas, type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import SkillMark from "@/components/variants/SkillMark";
import { CARD_TONES } from "./channels";
import { DIAL_RING_REM, dotAt, type Layout, smooth, stateAt, STOPS } from "./layout";
import { buildTv, type Tv } from "./scene";

/**
 * Design 18, Channels. The page opens on the hero's television; this ends
 * on it. The set stands alone on the plum ground, turned three-quarters,
 * drawn in the site's blossom bars, and turns a little with the cursor.
 *
 * Its screen shows a channel per project: a small 3D scene drawn into the
 * glass, with scanlines and a slight curve. Scrolling turns the dial
 * beside it; between channels the picture goes to snow, rolls, and
 * settles. Channel six is a test card for the skills. At the end the set
 * moves to the middle and switches off, the picture shrinking to a line
 * and then a dot, and the email comes up where the dot was.
 *
 * Layouts:
 *   journey  the pinned sequence.
 *   still    reduced motion, or a narrow or upright screen: channel one,
 *            drawn once, with the words as ordinary blocks under it.
 *   plain    the words alone: what the server sends, and what is left if
 *            WebGL cannot start.
 */

type Mode = "boot" | "plain" | "still" | "journey";

const SCREEN = "var(--arbor-screen-h)";
const SMALL = "font-mono text-[1.4rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif draws a DEMO flower for these, so a title with any of them is set in sans. */
const SERIF_UNSAFE = /[0-9'"$&@\-!()*+/=#%]/;
/** How strong the blossom is behind each skills bar, over the plum. */
const BAR_TINT = [0.2, 0.15, 0.11, 0.08, 0.05];
/** The dial: seven stops, OFF and six channels, 45 degrees apart. */
const DIAL_LABELS = ["OFF", "1", "2", "3", "4", "5", "6"];
const dialAngle = (d: number): number => -135 + d * 45;

/** Can this browser give both canvases the scene needs? Asked of spare canvases, let go again at once. */
function webglWorks(): boolean {
  try {
    const a = document.createElement("canvas").getContext("webgl2");
    const b = document.createElement("canvas").getContext("webgl");
    const ok = Boolean(a && b);
    a?.getExtension("WEBGL_lose_context")?.loseContext();
    b?.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

function Title({ text }: { text: string }): JSX.Element {
  return SERIF_UNSAFE.test(text) ? (
    <h3 className="font-sans text-[5.6rem] font-medium leading-[1.05] tracking-[-0.03em] text-white">{text}</h3>
  ) : (
    <h3 className="font-serif-display text-[6.4rem] italic leading-[1.05] text-white">{text}</h3>
  );
}

function WorkText({ p, i }: { p: Project; i: number }): JSX.Element {
  return (
    <>
      <p className={SMALL}>
        CH {pad2(i + 1)} <span className="opacity-60">/ {pad2(projects.length)}</span>
      </p>
      <div className="mt-[2.4rem]">
        <Title text={p.title} />
      </div>
      <p className="mt-[2.4rem] font-sans text-[2.2rem] font-light leading-[1.5]">{p.tagline}</p>
      <p className="mt-[2.4rem] font-mono text-[1.5rem] leading-[1.6] text-white">{p.stack.join(", ")}</p>
      <p className="mt-[0.8rem] font-mono text-[1.5rem] leading-[1.6] opacity-80">
        {p.year}
        {p.award ? (
          <>
            <br />
            {p.award}
          </>
        ) : null}
      </p>
      {p.href ? (
        <a
          className="mt-[0.8rem] inline-block font-mono text-[1.5rem] leading-[1.6] underline underline-offset-[0.35em]"
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

/** The skills as the test card's bars: one band per group, a tone each, its skills listed with their marks. */
function SkillBars(): JSX.Element {
  return (
    <ul className="flex flex-col gap-[0.6rem]">
      {skillGroups.map((g, i) => (
        <li
          className="px-[2rem] py-[1.4rem]"
          key={g.label}
          style={{ backgroundColor: `rgba(249, 185, 220, ${BAR_TINT[i]})`, borderLeft: `0.6rem solid ${CARD_TONES[i]}` }}
        >
          <h3 className="font-mono text-[1.4rem] uppercase tracking-[0.2em] text-white">{g.label}</h3>
          <ul className="mt-[1rem] flex flex-wrap gap-x-[2.2rem] gap-y-[0.8rem]">
            {g.skills.map((s) => (
              <li className="flex items-center gap-[0.7rem] font-mono text-[1.35rem] leading-none" key={s.name}>
                <SkillMark size="1.9rem" skill={s} tinted={false} />
                {s.name}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function Links({ className }: { className: string }): JSX.Element {
  return (
    <ul className={`font-mono text-[1.6rem] ${className}`}>
      {elsewhere.map((l) => (
        <li key={l.href}>
          <a className="group block" href={l.href} rel="noreferrer" target="_blank">
            <span className="block text-[1.3rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
            <span className="mt-[0.4rem] block text-white underline-offset-[0.35em] group-hover:underline">{l.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The channel dial, drawn beside the set. The knob turns; the numbers stay. */
function Dial(): JSX.Element {
  const size = `${DIAL_RING_REM * 2}rem`;
  return (
    <div
      aria-hidden
      className="absolute -translate-x-1/2 -translate-y-1/2"
      data-dial
      style={{ left: "53.3%", top: "50%", width: size }}
    >
      <svg className="block" style={{ width: size, height: size }} viewBox="-100 -100 200 200">
        {DIAL_LABELS.map((l, k) => {
          const a = (dialAngle(k) * Math.PI) / 180;
          return (
            <g key={l}>
              <line
                stroke={BLOSSOM}
                strokeOpacity={0.6}
                strokeWidth={1.4}
                x1={(Math.sin(a) * 66).toFixed(2)}
                x2={(Math.sin(a) * 72).toFixed(2)}
                y1={(-Math.cos(a) * 66).toFixed(2)}
                y2={(-Math.cos(a) * 72).toFixed(2)}
              />
              <text
                className="font-mono"
                dominantBaseline="central"
                fill={BLOSSOM}
                fontSize={l === "OFF" ? 10 : 13}
                textAnchor="middle"
                x={(Math.sin(a) * 86).toFixed(2)}
                y={(-Math.cos(a) * 86).toFixed(2)}
              >
                {l}
              </text>
            </g>
          );
        })}
        <circle fill="#1a0812" r={61} stroke={BLOSSOM} strokeOpacity={0.8} strokeWidth={1.2} />
        <g data-knob transform={`rotate(${dialAngle(1)})`}>
          {Array.from({ length: 24 }, (_, k) => {
            const a = (k / 24) * Math.PI * 2;
            return (
              <line
                key={k}
                stroke={BLOSSOM}
                strokeOpacity={0.45}
                strokeWidth={1}
                x1={(Math.sin(a) * 52).toFixed(2)}
                x2={(Math.sin(a) * 58).toFixed(2)}
                y1={(-Math.cos(a) * 52).toFixed(2)}
                y2={(-Math.cos(a) * 58).toFixed(2)}
              />
            );
          })}
          <line stroke="#ffffff" strokeLinecap="round" strokeWidth={5} x1={0} x2={0} y1={-14} y2={-46} />
        </g>
      </svg>
      <p className={`mt-[0.6rem] text-center tabular-nums ${SMALL}`} data-ch>
        CH 01
      </p>
    </div>
  );
}

function Journey(): JSX.Element {
  return (
    <div className="relative" data-journey>
      <div className="sticky top-0 w-full overflow-hidden" data-stage style={{ height: SCREEN, backgroundColor: BAND }}>
        <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-bars />
        <Dial />
        <p className={`absolute bottom-[4vh] left-[5.5vw] opacity-70 ${SMALL}`}>Scroll turns the dial.</p>
      </div>

      <section
        className="pointer-events-none relative z-10"
        id="work"
        style={{ marginTop: `calc(${SCREEN} * -1)`, height: `calc(${SCREEN} * 6)` }}
      >
        <div className="sticky top-0 w-full" style={{ height: SCREEN }}>
          <h2 className={`absolute left-[5.5vw] top-[7vh] opacity-60 ${SMALL}`}>Work</h2>
          <div className="absolute top-1/2" data-text style={{ left: "61.6%", width: "33.9%" }}>
            {projects.map((p, i) => (
              <article
                className="absolute inset-x-0 top-0 -translate-y-1/2"
                data-work={i}
                key={p.title}
                style={{ opacity: i === 0 ? 1 : 0, pointerEvents: i === 0 ? "auto" : "none" }}
              >
                <WorkText i={i} p={p} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pointer-events-none relative z-10" id="skills" style={{ height: `calc(${SCREEN} * 2)` }}>
        <div className="sticky top-0 w-full" data-skills-layer style={{ height: SCREEN, opacity: 0 }}>
          <div className="absolute top-1/2 -translate-y-1/2" data-text style={{ left: "61.6%", width: "33.9%" }}>
            <p className={SMALL}>CH 06</p>
            <h2 className="mt-[1.6rem] font-serif-display text-[6.4rem] italic leading-[1.05] text-white">Skills</h2>
            <div className="mt-[3rem]">
              <SkillBars />
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10" id="contact" style={{ height: `calc(${SCREEN} * 2)` }}>
        <div className="sticky top-0 w-full" data-contact-layer style={{ height: SCREEN, opacity: 0, pointerEvents: "none" }}>
          <h2 className={`absolute left-[5.5vw] top-[7vh] opacity-60 ${SMALL}`}>Contact</h2>
          <a
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-sans text-[5vw] font-light leading-none tracking-[-0.035em] text-white"
            data-email
            href={`mailto:${EMAIL}`}
            style={{ top: "42.5%" }}
          >
            {EMAIL}
          </a>
          <div className="absolute inset-x-0" data-links style={{ top: "calc(42.5% + 8vh)" }}>
            <Links className="flex justify-center gap-[3.5vw] text-left" />
          </div>
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
          <canvas aria-hidden className="absolute inset-0 block h-full w-full" data-bars />
          <Dial />
        </div>
      ) : null}

      <section className="px-[5.5vw] pb-[10vh] pt-[14vh]" id="work">
        <h2 className={`opacity-60 ${SMALL}`}>Work</h2>
        <div className="mt-[6vh] grid grid-cols-1 gap-x-[6vw] gap-y-[8vh] md:grid-cols-2">
          {projects.map((p, i) => (
            <article className="max-w-[80rem]" key={p.title}>
              <WorkText i={i} p={p} />
            </article>
          ))}
        </div>
      </section>

      <section className="px-[5.5vw] py-[10vh]" id="skills">
        <p className={SMALL}>CH 06</p>
        <h2 className="mt-[1.6rem] font-serif-display text-[6.4rem] italic leading-[1.05] text-white">Skills</h2>
        <div className="mt-[3rem] max-w-[120rem]">
          <SkillBars />
        </div>
      </section>

      <section className="px-[5.5vw] pb-[16vh] pt-[10vh]" id="contact">
        <h2 className={`opacity-60 ${SMALL}`}>Contact</h2>
        <a
          className="mt-[5vh] block font-sans text-[5vw] font-light leading-none tracking-[-0.035em] text-white"
          href={`mailto:${EMAIL}`}
        >
          {EMAIL}
        </a>
        <Links className="mt-[6vh] flex flex-wrap gap-x-[3.5vw] gap-y-[3vh]" />
      </section>
    </div>
  );
}

type Handle = {
  goTo(i: number): void;
  readonly state: unknown;
  grade(blackPoint: number, whitePoint: number): void;
};

/** Starts the set on the stage. Returns the teardown. Throws if it cannot start. */
function start(root: HTMLElement, mode: "still" | "journey"): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("[data-bars]");
  if (!stage || !bars) throw new Error("b18: no stage");
  const still = mode === "still";
  const fontOf = (cls: string): string => {
    const probe = document.createElement("span");
    probe.className = cls;
    root.appendChild(probe);
    const f = getComputedStyle(probe).fontFamily;
    probe.remove();
    return f || "monospace";
  };
  const mono = fontOf("font-mono");
  const sans = fontOf("font-sans");

  const tv: Tv = buildTv({ still, mono, sans });
  const config: BarLayerConfig = {
    x: "0%",
    y: "0%",
    width: "100%",
    height: "100%",
    // Upside down, as the band above does it: a bright texel is a wide
    // blossom bar. Over 215 grey is a full bar, under 35 none.
    blackPoint: 215,
    whitePoint: 35,
    threshold: 255,
    xSquares: 300,
    ySquares: 190,
    maxSquareWidth: "82%",
    bgOpacity: 0,
    fillOpacity: 1,
  };
  const bar: BarCanvas | null = createBarCanvas(bars, [{ type: "canvas", source: tv.source, config }], {
    colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
    defaults: { bgOpacity: 0 },
    fps: 60,
  });
  if (!bar) {
    tv.dispose();
    throw new Error("b18: no bar canvas");
  }

  const q = <T extends Element>(sel: string): T | null => root.querySelector<T>(sel);
  const dial = q<HTMLElement>("[data-dial]");
  const knob = q<SVGGElement>("[data-knob]");
  const ch = q<HTMLElement>("[data-ch]");
  const texts = Array.from(root.querySelectorAll<HTMLElement>("[data-text]"));
  const works = Array.from(root.querySelectorAll<HTMLElement>("[data-work]"));
  const skillsLayer = q<HTMLElement>("[data-skills-layer]");
  const contactLayer = q<HTMLElement>("[data-contact-layer]");
  const email = q<HTMLElement>("[data-email]");
  const links = q<HTMLElement>("[data-links]");
  const journey = q<HTMLElement>("[data-journey]");

  let layout: Layout = tv.layout();
  let s = 0;
  const last = new Map<Element, string>();
  // Writes a style only when it changed, so a scroll frame touches little.
  const put = (el: HTMLElement | SVGElement | null, prop: "opacity" | "left" | "width" | "top", v: string): void => {
    if (!el || last.get(el) === `${prop}:${v}`) return;
    last.set(el, `${prop}:${v}`);
    el.style[prop] = v;
  };
  const place = (): void => {
    layout = tv.layout();
    const pct = (v: number): string => `${(v * 100).toFixed(2)}%`;
    if (dial) {
      dial.style.left = pct(layout.dial.x);
      dial.style.top = pct(layout.dial.y);
    }
    for (const t of texts) {
      t.style.left = pct(layout.text.x0);
      t.style.width = pct(layout.text.x1 - layout.text.x0);
    }
    const dot = dotAt(layout);
    if (email) email.style.top = pct(dot.y);
    if (links) links.style.top = `calc(${pct(dot.y)} + 8vh)`;
  };

  const apply = (): void => {
    const st = stateAt(s);
    tv.setState(st);
    knob?.setAttribute("transform", `rotate(${dialAngle(st.dial).toFixed(2)})`);
    const label = st.dial < 0.5 ? "OFF" : `CH ${pad2(Math.round(st.dial))}`;
    if (ch && ch.textContent !== label) ch.textContent = label;
    works.forEach((el, i) => {
      const o = i === st.work ? st.workShow : 0;
      put(el, "opacity", o.toFixed(3));
      el.style.pointerEvents = o > 0.5 ? "auto" : "none";
    });
    put(skillsLayer, "opacity", st.skillsShow.toFixed(3));
    put(contactLayer, "opacity", st.contactShow.toFixed(3));
    if (contactLayer) contactLayer.style.pointerEvents = st.contactShow > 0.5 ? "auto" : "none";
    // Switched off, the set stays as a faint shape behind the email.
    config.fillOpacity = 1 - 0.72 * smooth(7.6, 8.1, s);
  };

  const readScroll = (): void => {
    if (!journey) return;
    const h = stage.clientHeight || window.innerHeight;
    s = -journey.getBoundingClientRect().top / h;
    apply();
  };

  const onPointer = (e: PointerEvent): void => {
    const r = stage.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const cx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const cy = ((e.clientY - r.top) / r.height) * 2 - 1;
    tv.pointer(Math.max(-1, Math.min(1, cx)), Math.max(-1, Math.min(1, cy)));
  };

  const resize = (): void => {
    tv.resize(stage.clientWidth, stage.clientHeight);
    place();
    if (still) {
      tv.renderNow();
      bar.redraw();
    }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  // The card is drawn once at start with whatever font is there; again
  // once the page's own fonts are in.
  let alive = true;
  document.fonts?.ready
    .then(() => {
      if (!alive) return;
      tv.redrawCard(fontOf("font-mono"), fontOf("font-sans"));
    })
    .catch(() => undefined);

  type Lenis = { on(e: "scroll", f: () => void): () => void };
  let offLenis: (() => void) | null = null;
  let lookup = 0;
  if (!still) {
    readScroll();
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    // Lenis may not be up at the first effect; look for it a frame later.
    // The window's own scroll event already covers the case where it never comes.
    lookup = requestAnimationFrame(() => {
      const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
      const off = lenis?.on("scroll", readScroll);
      if (typeof off === "function") offLenis = off;
    });
  } else {
    tv.setState(stateAt(STOPS[0]));
  }

  if (process.env.NODE_ENV !== "production") {
    const handle: Handle = {
      goTo(i) {
        if (!journey) return;
        const stop = STOPS[Math.max(0, Math.min(STOPS.length - 1, i))];
        const top = journey.getBoundingClientRect().top + window.scrollY + stop * stage.clientHeight;
        const lenis = (window as unknown as { __lenis?: { scrollTo(y: number, o: { immediate: boolean }): void } }).__lenis;
        if (lenis) lenis.scrollTo(top, { immediate: true });
        else window.scrollTo(0, top);
      },
      get state() {
        const st = stateAt(s);
        const box = (el: Element | null): { x0: number; y0: number; x1: number; y1: number } | null => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const p = stage.getBoundingClientRect();
          return { x0: (r.left - p.left) / p.width, y0: (r.top - p.top) / p.height, x1: (r.right - p.left) / p.width, y1: (r.bottom - p.top) / p.height };
        };
        return {
          mode,
          s,
          stops: STOPS,
          scroll: st,
          layout,
          onStage: tv.measure(),
          text: box(works[st.work] ?? null),
          skills: box(skillsLayer?.querySelector("[data-text]") ?? null),
          dial: box(dial),
          email: box(email),
          grade: { blackPoint: config.blackPoint, whitePoint: config.whitePoint },
        };
      },
      grade(bp, wp) {
        config.blackPoint = bp;
        config.whitePoint = wp;
        bar.redraw({ reupload: false });
      },
    };
    (window as unknown as { __b18?: Handle }).__b18 = handle;
  }

  return () => {
    alive = false;
    cancelAnimationFrame(lookup);
    offLenis?.();
    window.removeEventListener("scroll", readScroll);
    window.removeEventListener("pointermove", onPointer);
    ro.disconnect();
    bar.destroy();
    tv.dispose();
    if (process.env.NODE_ENV !== "production") delete (window as unknown as { __b18?: Handle }).__b18;
  };
}

export default function B18(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("boot");

  // Which layout: asked once the page is in a browser, and again if the
  // visitor changes their motion setting or turns a tablet on its side.
  useEffect(() => {
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");
    // In a media query an em is the browser's own 16, not the page's rem, so 56em is 896 wide.
    const narrow = window.matchMedia("(max-width: 56em), (orientation: portrait)");
    const pick = (): void => {
      if (!webglWorks()) setMode("plain");
      else if (less.matches || narrow.matches) setMode("still");
      else setMode("journey");
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
    if (!root || (mode !== "still" && mode !== "journey")) return undefined;
    try {
      return start(root, mode);
    } catch {
      // The set could not start. The words stand without it.
      setMode("plain");
      return undefined;
    }
  }, [mode]);

  return (
    <div className="relative w-full" data-mode={mode} ref={rootRef} style={{ backgroundColor: BAND, color: BLOSSOM }}>
      {mode === "journey" ? <Journey /> : <Plain withStage={mode === "still"} />}
    </div>
  );
}
