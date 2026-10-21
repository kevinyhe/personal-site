"use client";

import { type CSSProperties, type FocusEvent, type JSX, useCallback, useEffect, useRef, useState } from "react";

import { type BarSource, projectSource } from "@/components/below/barPicture";
import { createDotField, type DotField } from "@/components/dotField";
import { projects } from "@/components/profile";
import { socialLinks } from "@/components/siteContent";
import { PAGE_COUNT } from "./content";
import { createPanorama, TRAVEL } from "./panorama";
import { ContactPanel, IntroPanel, pad2, ProjectDialog, serif, SkillsPanel, TimelinePanel, WorkCard, WorkPanel } from "./Panels";

/**
 * Concept 07, "Strip".
 *
 * The page opens as lukebaffait.fr's home: "Kevin He." huge along the
 * foot, a short line top left, and Luke's footer bar (an arrow and a
 * number on the left, socials with slashes in the middle, Work Info
 * Contact on the right) fixed under a hairline for the whole page. The
 * number on the left counts the six stops: "01 / 06".
 *
 * Scrolling down pulls "Kevin" and "He." apart, and a small framed window
 * between them, showing a dotted tree, grows to fill the screen. From then
 * on the page scroll moves the view sideways along one long picture, six
 * screens wide (tree, flowers opening, clouds, sheep, birds, the night
 * peak), drawn as lanceyan.com's diamonds by the one dotField canvas.
 * lanceyan's text panels float over it at intervals: intro, timeline,
 * five project cards, skills, and the closing quote with the links. Each
 * panel moves a little faster than the picture, so it slides in over it.
 * At the far end the window shrinks back around the peak and the two
 * halves of the name close up again.
 *
 * Narrower than 768px, or with reduced motion, the same panels stack and
 * scroll down the page as normal, over the same picture held behind them
 * (still, and stepping from scene to scene, when motion is reduced).
 */

type Lenis = { scrollTo(y: number, o?: { immediate?: boolean; duration?: number }): void; stop(): void; start(): void };
const lenisOf = (): Lenis | undefined => (window as unknown as { __lenis?: Lenis }).__lenis;

const WIDE = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";

/** Shares of the wide page's scroll: the name opens, the strip pans, the
 *  name closes. */
const OPEN_END = 0.11;
const PAN_START = 0.13;
const PAN_END = 0.89;
const CLOSE_START = 0.91;

/** Where each stop sits along the strip, in screens of travel. */
const PAGE_O: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 4, 6: TRAVEL };

type Slide = { key: string; page: number; s: number; top: number; w: number; depth: number; card?: number };

/** The panels and cards along the strip: `s` is the left edge in screens
 *  from the start of the picture, `top` in vh, `w` in rem, `depth` how
 *  much faster than the picture it moves. */
const SLIDES: Slide[] = [
  { key: "intro", page: 2, s: 0.1, top: 17, w: 60, depth: 0.12 },
  { key: "timeline", page: 3, s: 1.08, top: 11, w: 64, depth: 0.12 },
  { key: "work", page: 4, s: 2.08, top: 20, w: 46, depth: 0.12 },
  ...[15, 42, 21, 45, 25].map((top, i) => ({ key: `card${i}`, page: 4, s: 2.56 + i * 0.33, top, w: 34, depth: [0.22, 0.1, 0.28, 0.14, 0.24][i], card: i })),
  { key: "skills", page: 5, s: 4.1, top: 15, w: 64, depth: 0.12 },
  { key: "contact", page: 6, s: 5.1, top: 19, w: 58, depth: 0.12 },
];

const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const CSS = `
.f7-track { position: relative; z-index: 10; overflow-x: clip; }
.f7-slide { position: relative; isolation: isolate; margin: 0 auto; max-width: 64rem; padding: 10rem 2.4rem; }
.f7-slide::before { content: ""; position: absolute; inset: 0 -50vw; z-index: -1; pointer-events: none;
  background: linear-gradient(rgba(26,8,18,0), rgba(26,8,18,.88) 16%, rgba(26,8,18,.88) 84%, rgba(26,8,18,0)); }
.f7-card { max-width: 46rem; padding: 2rem 2.4rem; }
.f7-card::before { display: none; }
.f7-open, .f7-close { height: 180svh; }
@media ${WIDE} {
  .f7-root { height: 720vh; }
  .f7-open, .f7-close { display: none; }
  .f7-track { position: fixed; inset: 0; overflow: clip; pointer-events: none; }
  .f7-mover { position: absolute; inset: 0; will-change: transform; }
  .f7-slide { position: absolute; margin: 0; padding: 0; left: calc(var(--s) * 100vw); top: var(--top);
    width: var(--w); max-width: calc(100vw - 9.6rem); pointer-events: auto; will-change: transform, opacity; }
  .f7-slide::before { inset: -7rem -9rem; background: radial-gradient(closest-side, rgba(26,8,18,.88), rgba(26,8,18,.62) 55%, rgba(26,8,18,0)); }
  .f7-card { padding: 0; }
  .f7-card::before { display: block; inset: -3rem; }
}
`;

export default function F07(): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const winRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLHeadingElement | null>(null);
  const kevinRef = useRef<HTMLSpanElement | null>(null);
  const heRef = useRef<HTMLSpanElement | null>(null);
  const tagRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const moverRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLDivElement | null>(null);
  const readRef = useRef<HTMLSpanElement | null>(null);
  const readBtnRef = useRef<HTMLButtonElement | null>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const pageRef = useRef(1);
  const openerRef = useRef<HTMLElement | null>(null);

  const [sources, setSources] = useState<BarSource[] | null>(null);
  const [dialog, setDialog] = useState<number | null>(null);

  // The cards' pictures. Saturn has none and is drawn as type, which needs
  // the document, so this waits for the browser.
  useEffect(() => {
    setSources(projects.map((p) => projectSource(p)));
  }, []);

  /** Scrolls to one of the six stops. */
  const go = useCallback((page: number): void => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vh = window.innerHeight;
    let y = 0;
    if (page > 1) {
      if (window.matchMedia(WIDE).matches) {
        const total = root.offsetHeight - vh;
        const p = PAGE_O[page] >= TRAVEL ? PAN_END : PAN_START + (PAGE_O[page] / TRAVEL) * (PAN_END - PAN_START);
        y = root.offsetTop + p * total + 1;
      } else {
        const i = SLIDES.findIndex((s) => s.page === page);
        const el = slideRefs.current[i];
        if (el) y = window.scrollY + el.getBoundingClientRect().top - vh * 0.04;
      }
    }
    const lenis = lenisOf();
    if (lenis) lenis.scrollTo(y, { immediate: reduced });
    else window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
  }, []);

  // The one loop: reads the scroll, moves the name, the window and the
  // panels, and redraws the picture.
  useEffect(() => {
    const root = rootRef.current;
    const win = winRef.current;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    const row = rowRef.current;
    const kevin = kevinRef.current;
    const he = heRef.current;
    const tag = tagRef.current;
    const track = trackRef.current;
    const mover = moverRef.current;
    if (!root || !win || !canvas || !frame || !row || !kevin || !he || !tag || !track || !mover) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wideQ = window.matchMedia(WIDE);
    let wide = wideQ.matches;
    let dirty = true;

    let field: DotField | null = null;
    try {
      field = createDotField(canvas, {
        cols: window.innerWidth < 768 ? 180 : 280,
        threshold: 0.13,
        brightness: 1,
        size: 0.85,
        hue: 0,
        ground: "#1a0812",
        ramp: [
          [0, "#2a0d1e"],
          [0.3, "#6a1d44"],
          [0.5, "#b8174f"],
          [0.72, "#f9b9dc"],
          [1, "#fffafc"],
        ],
      });
    } catch {
      field = null;
    }
    const pano = createPanorama({
      still: reduced,
      onFrame: () => {
        dirty = true;
      },
    });

    // Name and window geometry, measured without the transforms.
    let vw = 1;
    let vh = 1;
    let kRight = 0;
    let hLeft = 0;
    let gapL = 0;
    let gapR = 0;
    let midY = 0;
    let nameH = 0;
    let widths: number[] = [];
    const measure = (): void => {
      vw = document.documentElement.clientWidth || window.innerWidth;
      vh = window.innerHeight;
      kRight = kevin.offsetLeft + kevin.offsetWidth;
      hLeft = he.offsetLeft;
      gapL = row.offsetLeft + kRight;
      gapR = row.offsetLeft + hLeft;
      nameH = kevin.offsetHeight;
      midY = row.offsetTop + kevin.offsetTop + nameH * 0.52;
      wide = wideQ.matches;
      widths = slideRefs.current.map((el) => el?.offsetWidth ?? 0);
      field?.resize();
      dirty = true;
    };
    measure();

    let lastO = -1;
    let lastOpen = -1;
    let lastDraw = 0;
    let raf = 0;
    const start = performance.now();

    const frameOnce = (now: number): void => {
      raf = requestAnimationFrame(frameOnce);

      // 1. Where are we: how open the name is (0 shut, 1 apart), and how
      // far along the strip the view is, in screens.
      let openT = 0;
      let closeT = 0;
      let o = 0;
      let page = 1;
      if (wide) {
        const total = Math.max(1, root.offsetHeight - vh);
        const p = clamp((window.scrollY - root.offsetTop) / total);
        openT = ease(clamp(p / OPEN_END));
        closeT = ease(clamp((p - CLOSE_START) / (1 - CLOSE_START)));
        o = TRAVEL * clamp((p - PAN_START) / (PAN_END - PAN_START));
        if (openT >= 0.5) page = o < 0.6 ? 2 : o < 1.6 ? 3 : o < 3.5 ? 4 : o < 4.5 ? 5 : 6;
      } else {
        const op = openRef.current?.getBoundingClientRect();
        const cl = closeRef.current?.getBoundingClientRect();
        const tr = track.getBoundingClientRect();
        if (op) openT = clamp(-op.top / Math.max(1, op.height - vh));
        if (cl) closeT = clamp(-cl.top / Math.max(1, cl.height - vh));
        o = TRAVEL * clamp((vh - tr.top) / Math.max(1, tr.height));
        SLIDES.forEach((s, i) => {
          const el = slideRefs.current[i];
          if (el && el.getBoundingClientRect().top < vh * 0.55) page = s.page;
        });
        if (closeT > 0) page = PAGE_COUNT;
        if (reduced) {
          // Step, never slide: the name is either shut or gone, and the
          // picture jumps to the scene of the panel being read.
          openT = openT > 0.5 ? 1 : 0;
          closeT = closeT > 0.5 ? 1 : 0;
          o = PAGE_O[page];
        } else {
          openT = ease(openT);
          closeT = ease(closeT);
        }
      }
      const openness = openT * (1 - closeT);

      // 2. The readout in the footer bar.
      if (page !== pageRef.current) {
        pageRef.current = page;
        if (readRef.current) readRef.current.textContent = `${pad2(page)} / ${pad2(PAGE_COUNT)}`;
        readBtnRef.current?.setAttribute("aria-label", page >= PAGE_COUNT ? "Back to the start" : `Next section, now ${pad2(page)} of ${pad2(PAGE_COUNT)}`);
      }

      // 3. The name: "Kevin" leaves to the left, "He." to the right.
      const n = ease(clamp(openness * 1.25));
      kevin.style.transform = `translate3d(${(-n * (gapL + 40)).toFixed(1)}px,0,0)`;
      he.style.transform = `translate3d(${(n * (vw - gapR + 40)).toFixed(1)}px,0,0)`;
      tag.style.opacity = (1 - smooth(0, 0.4, openness)).toFixed(3);

      // 4. The window: from a small frame between the words to the whole
      // screen. The picture is scaled to cover the frame, centred on the
      // tree on the way in and on the peak on the way out.
      const g = ease(clamp((openness - 0.08) / 0.92));
      const gap = Math.max(48, gapR - gapL);
      const w0 = Math.max(48, gap * 0.72);
      const h0 = vw > vh ? Math.min(w0 * 0.62, nameH * 1.1) : Math.min(w0 * 1.3, nameH * 1.6);
      const rw = lerp(w0, vw, g);
      const rh = lerp(h0, vh, g);
      const rx = lerp((gapL + gapR) / 2 - w0 / 2, 0, g);
      const ry = lerp(midY - h0 / 2, 0, g);
      const late = o > TRAVEL / 2;
      const k = lerp(Math.max(w0 / vw, h0 / vh), 1, g);
      const fx = lerp(late ? 0.53 : 0.74, 0.5, g);
      const fy = lerp(late ? 0.74 : 0.5, 0.5, g);
      const tx = clamp(rx + rw / 2 - k * vw * fx, rx + rw - k * vw, rx);
      const ty = clamp(ry + rh / 2 - k * vh * fy, ry + rh - k * vh, ry);
      win.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${k.toFixed(5)})`;
      const ins = [(ry - ty) / k, (tx + k * vw - rx - rw) / k, (ty + k * vh - ry - rh) / k, (rx - tx) / k].map((v) => `${Math.max(0, v).toFixed(2)}px`);
      win.style.clipPath = g >= 0.999 ? "none" : `inset(${ins.join(" ")})`;
      frame.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`;
      frame.style.width = `${rw.toFixed(1)}px`;
      frame.style.height = `${rh.toFixed(1)}px`;
      frame.style.opacity = (1 - smooth(0.4, 0.9, g)).toFixed(3);

      // 5. The panels (wide only): the strip moves by the view, each panel
      // a little faster by its depth, fading in as it arrives.
      if (wide) {
        mover.style.transform = `translate3d(${(-o * vw).toFixed(1)}px,0,0)`;
        const show = smooth(0.7, 1, openness);
        track.style.opacity = show.toFixed(3);
        SLIDES.forEach((s, i) => {
          const el = slideRefs.current[i];
          if (!el) return;
          const rel = s.s - o - 0.1;
          const ws = (widths[i] ?? 0) / vw;
          const xs = s.s - o + rel * s.depth;
          const op = (1 - smooth(0.74, 1.02, xs)) * smooth(-ws - 0.02, -ws * 0.35, xs);
          el.style.transform = `translate3d(${(rel * s.depth * vw).toFixed(1)}px,${(-rel * s.depth * 0.3 * vh).toFixed(1)}px,0)`;
          el.style.opacity = op.toFixed(3);
          // Invisible panels must not catch clicks; they stay focusable.
          el.style.pointerEvents = op * show > 0.3 ? "" : "none";
        });
      } else {
        mover.style.transform = "";
        track.style.opacity = "";
        SLIDES.forEach((_, i) => {
          const el = slideRefs.current[i];
          if (el) {
            el.style.transform = "";
            el.style.opacity = "";
            el.style.pointerEvents = "";
          }
        });
      }

      // 6. The picture.
      pano.sync(o);
      if (!field) return;
      const moved = Math.abs(o - lastO) > 1e-4 || Math.abs(openness - lastOpen) > 1e-4;
      const due = reduced ? dirty || moved : moved || now - lastDraw > 33;
      if (!due) return;
      lastO = o;
      lastOpen = openness;
      lastDraw = now;
      dirty = false;
      const t = (now - start) / 1000;
      field.render((x, W, H) => pano.paint(x, W, H, o, t));
    };
    raf = requestAnimationFrame(frameOnce);

    const sized = new ResizeObserver(measure);
    sized.observe(row);
    window.addEventListener("resize", measure);
    wideQ.addEventListener("change", measure);
    void document.fonts?.ready.then(measure);

    return () => {
      cancelAnimationFrame(raf);
      sized.disconnect();
      window.removeEventListener("resize", measure);
      wideQ.removeEventListener("change", measure);
      pano.dispose();
      field?.dispose();
    };
  }, []);

  // Tabbing into a panel that is off along the strip brings it into view.
  const onFocus = (e: FocusEvent<HTMLDivElement>): void => {
    if (!window.matchMedia(WIDE).matches) return;
    const host = (e.target as HTMLElement).closest<HTMLElement>("[data-slide]");
    const root = rootRef.current;
    if (!host || !root) return;
    const s = SLIDES[Number(host.dataset.slide)];
    const total = root.offsetHeight - window.innerHeight;
    const target = clamp(s.s - 0.1 - (s.card !== undefined ? 0.3 : 0), 0, TRAVEL);
    const y = root.offsetTop + (PAN_START + (target / TRAVEL) * (PAN_END - PAN_START)) * total + 1;
    if (Math.abs(window.scrollY - y) < window.innerHeight * 0.2) return;
    const lenis = lenisOf();
    if (lenis) lenis.scrollTo(y, { immediate: true });
    else window.scrollTo({ top: y });
  };

  const openCard = useCallback((i: number, from: HTMLElement): void => {
    openerRef.current = from;
    lenisOf()?.stop();
    setDialog(i);
  }, []);
  const closeCard = useCallback((): void => {
    lenisOf()?.start();
    setDialog(null);
    openerRef.current?.focus({ preventScroll: true });
  }, []);

  const NAV = "inline-flex min-h-[4.4rem] items-center px-[0.4rem] uppercase transition-colors hover:text-white rounded-[0.2rem] outline-none focus-visible:ring-1 focus-visible:ring-[#f9b9dc]";

  return (
    <div className={`f7-root relative text-white ${serif.className}`} ref={rootRef}>
      <style>{CSS}</style>

      {/* The picture: the one dotField canvas, scaled and clipped to the
          window between the words, then the whole screen. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute left-0 top-0 h-[100vh] w-full origin-top-left bg-[#1a0812] will-change-transform"
          ref={winRef}
          style={{ transform: "scale(0.0001)" }}
        >
          <canvas className="block h-full w-full" ref={canvasRef} />
        </div>
        <div className="absolute left-0 top-0 border border-white/40" ref={frameRef} style={{ width: 0, height: 0 }}>
          {(["left-0 top-0", "left-full top-0", "left-0 top-full", "left-full top-full"] as const).map((c) => (
            <span className={`absolute -translate-x-1/2 -translate-y-1/2 font-sans text-[1.4rem] leading-none text-white/70 ${c}`} key={c}>
              +
            </span>
          ))}
        </div>
      </div>

      {/* Luke's home: the line top left, the name across the foot. */}
      <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
        <div className="absolute left-[2.4rem] top-[2.8rem] font-sans text-[1.5rem] leading-[1.45] text-white/85 md:left-[4.8rem] md:top-[4.8rem] md:text-[1.9rem]" ref={tagRef}>
          <p>
            I build systems that <em className="font-serif-display text-[1.15em] italic">bring ideas to life</em>,
          </p>
          <p>co-founder and CTO at The Actually Company.</p>
        </div>
        <h1
          className="absolute bottom-[12rem] left-[2.4rem] right-[2.4rem] flex items-end justify-between whitespace-nowrap leading-[0.82] md:bottom-[15rem] md:left-[4.8rem] md:right-[4.8rem]"
          ref={rowRef}
          style={{ fontSize: "min(17vw, 40vh)" } as CSSProperties}
        >
          <span className="inline-block font-sans font-light tracking-[-0.045em] text-[#fffafc] will-change-transform" ref={kevinRef}>
            Kevin
          </span>{" "}
          <span
            className="inline-block pr-[0.08em] font-serif-display text-[1.14em] italic tracking-[-0.02em] will-change-transform"
            ref={heRef}
            style={{
              backgroundImage: "linear-gradient(105deg, #f9b9dc 5%, #fffafc 75%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            He.
          </span>
        </h1>
      </div>

      {/* Phones and reduced motion: room to open the name before the
          panels, and to close it after. Hidden on the wide strip. */}
      <div aria-hidden="true" className="f7-open" ref={openRef} />

      <div className="f7-track" onFocus={onFocus} ref={trackRef}>
        <div className="f7-mover" ref={moverRef}>
          {SLIDES.map((s, i) => {
            const style = { "--s": s.s, "--top": `${s.top}vh`, "--w": `${s.w}rem` } as CSSProperties;
            const card = s.card;
            return (
              <section
                aria-label={card !== undefined ? projects[card].title : undefined}
                className={`f7-slide ${card !== undefined ? "f7-card" : ""}`}
                data-slide={i}
                id={card === undefined ? `f7-${s.key}` : undefined}
                key={s.key}
                ref={(el) => {
                  slideRefs.current[i] = el;
                }}
                style={style}
              >
                {s.key === "intro" ? <IntroPanel go={go} /> : null}
                {s.key === "timeline" ? <TimelinePanel go={go} /> : null}
                {s.key === "work" ? <WorkPanel count={projects.length} go={go} /> : null}
                {card !== undefined ? <WorkCard i={card} onOpen={openCard} p={projects[card]} source={sources?.[card] ?? null} /> : null}
                {s.key === "skills" ? <SkillsPanel go={go} /> : null}
                {s.key === "contact" ? <ContactPanel go={go} /> : null}
              </section>
            );
          })}
        </div>
      </div>

      <div aria-hidden="true" className="f7-close" ref={closeRef} />

      {/* Luke's footer bar, along the foot for the whole page. Sits above
          the concept switcher at the very bottom. */}
      <footer className="fixed inset-x-[2.4rem] bottom-[4.4rem] z-30 border-t border-white/35 font-sans text-[1.5rem] font-medium tracking-[0.02em] text-white/80 md:inset-x-[4.8rem] md:text-[1.9rem]">
        <div className="flex items-center justify-between gap-[1.6rem] pt-[0.4rem]">
          <button
            aria-label={`Next section, now 01 of ${pad2(PAGE_COUNT)}`}
            className={`${NAV} gap-[0.6rem] tabular-nums`}
            onClick={() => go(pageRef.current >= PAGE_COUNT ? 1 : pageRef.current + 1)}
            ref={readBtnRef}
            type="button"
          >
            <span aria-hidden="true">→</span>
            <span ref={readRef}>01 / {pad2(PAGE_COUNT)}</span>
          </button>
          <ul aria-label="Elsewhere" className="hidden items-center gap-[1.6rem] lg:flex">
            {socialLinks.map((l, i) => (
              <li className="flex items-center gap-[1.6rem]" key={l.label}>
                {i > 0 ? (
                  <span aria-hidden="true" className="text-white/35">
                    /
                  </span>
                ) : null}
                <a className={NAV} href={l.href} rel="noreferrer" target="_blank">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <nav aria-label="Sections" className="flex items-center gap-[1.2rem] md:gap-[2.4rem]">
            <button className={NAV} onClick={() => go(4)} type="button">
              Work
            </button>
            <button className={NAV} onClick={() => go(2)} type="button">
              Info
            </button>
            <button className={NAV} onClick={() => go(6)} type="button">
              Contact
            </button>
          </nav>
        </div>
      </footer>

      {dialog !== null ? <ProjectDialog i={dialog} onClose={closeCard} p={projects[dialog]} source={sources?.[dialog] ?? null} /> : null}
    </div>
  );
}
