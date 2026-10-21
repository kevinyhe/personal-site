"use client";

import { type CSSProperties, type JSX, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource, textPlate } from "@/components/below/barPicture";
import { type Project, projects, skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 45, Timeline (after mariavasilyeva.com).
 *
 * One pinned screen held for about two screens of scroll. Faint rules cut
 * it into eight rows. On the middle rule runs one long line of tiny
 * thumbnails, five per project: crops of its picture and small plates with
 * its year and stack words, all drawn as bars. A thin vertical line stands
 * in the middle of the screen. Scrolling slides the thumbnail line to the
 * left under it, and the project whose thumbnails are under the line opens
 * into a loose pile of six larger bar pictures around the middle (they
 * spring out from the line and their bars grow from nothing), with its name
 * in serif capitals on one of them. When the next project reaches the line
 * the pile folds back in and the next one opens.
 *
 * Round the edges, as on the reference: a pink strip down each side with
 * small rotated type (name and trade on the left; Work, Skills, Contact
 * links on the right), "Scroll" in a drawn oval at the top, and along the
 * bottom the project's number, its name, and "More details" (opens the
 * detail over the page) above "View project" (its site). Clicking a pile
 * picture also opens the detail; clicking a project's thumbnails scrolls
 * to it. After the screen: the skills and the contact links, short.
 *
 * The bar pictures draw on 2D canvases made in the browser only, so they
 * wait for a mounted flag and the server render has empty boxes. Under
 * reduced motion the pile appears and swaps at once.
 */

const SCREEN = "var(--arbor-screen-h)";
/** How tall the pinned part is, in screens. The stage takes one; the rest is scrolled through. */
const STAGE_SCREENS = 1.9;
const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const MONO = "font-mono text-[1.2rem] uppercase leading-[1.4] tracking-[0.12em]";
const HAND = "font-serif-display italic leading-none tracking-[-0.01em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif draws a watermark for these; text holding any is set in Inter. */
const serifSafe = (s: string): boolean => !/[0-9'"&@\-!()/;‑]/.test(s);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const linkOf = (p: Project): string | undefined => p.href ?? p.code;

type Plates = { pic: BarSource; year: BarSource; s0: BarSource; s1: BarSource };
type Face = { src: keyof Plates; zoom?: number; at?: [number, number]; fit?: "cover" | "contain" };

/** The five thumbnails each project puts on the line, and their widths in rem. */
const THUMBS: (Face & { w: number })[] = [
  { src: "pic", zoom: 2, at: [0.3, 0.5], w: 5.8 },
  { src: "year", fit: "contain", w: 4.6 },
  { src: "pic", w: 6.4 },
  { src: "s0", fit: "contain", w: 5.2 },
  { src: "pic", zoom: 3, at: [0.7, 0.4], w: 4.2 },
];

/**
 * The pile: six pictures placed round the middle of the screen, measured
 * off the reference at 1600x900 (x, y of each centre from the playhead
 * on the middle rule; width, height). `z` stacks them.
 */
const PILE: (Face & { x: number; y: number; w: number; h: number; z: number })[] = [
  { src: "pic", x: 30, y: 128, w: 340, h: 205, z: 6 },
  { src: "pic", zoom: 1.9, at: [0.25, 0.35], x: 70, y: -170, w: 273, h: 154, z: 5 },
  { src: "s0", fit: "contain", x: -185, y: -180, w: 190, h: 107, z: 3 },
  { src: "year", fit: "contain", x: -210, y: -46, w: 184, h: 104, z: 4 },
  { src: "pic", zoom: 2.6, at: [0.75, 0.6], x: 236, y: -70, w: 290, h: 196, z: 1 },
  { src: "s1", fit: "contain", x: -270, y: 104, w: 216, h: 121, z: 2 },
];
/** Which pile picture carries the name label. */
const LABELLED = 1;

const CSS = `
.b45-link { transition: color 0.2s ease, opacity 0.2s ease; }
.b45-link:hover, .b45-link:focus-visible { color: #ffffff; opacity: 1; }
.b45-group { transition: opacity 0.3s ease; }
.b45-oval { stroke-dasharray: 520; stroke-dashoffset: 520; animation: b45-draw 1.4s 0.3s cubic-bezier(0.6, 0, 0.3, 1) forwards; }
@keyframes b45-draw { to { stroke-dashoffset: 0; } }
.b45-dialog { animation: b45-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b45-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
.b45-vert { writing-mode: vertical-rl; }
.b45-up { writing-mode: vertical-rl; transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) {
  .b45-link, .b45-group { transition: none; }
  .b45-oval { animation: none; stroke-dashoffset: 0; }
  .b45-dialog { animation: none; }
}
`;

function stillMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Lenis = { scrollTo: (to: number, o?: { duration?: number; immediate?: boolean }) => void };
function scrollToY(y: number): void {
  const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
  const still = stillMotion();
  if (lenis) lenis.scrollTo(y, still ? { immediate: true } : { duration: 1.1 });
  else window.scrollTo({ top: y, behavior: still ? "auto" : "smooth" });
}

/** One picture face: the whole picture, or a zoomed crop of it. Fills its parent. */
function FaceBox({ face, plates, cell, level }: { face: Face; plates: Plates; cell: number; level: number }): JSX.Element {
  const zoom = face.zoom ?? 1;
  const [ax, ay] = face.at ?? [0.5, 0.5];
  const inner: CSSProperties = {
    width: `${zoom * 100}%`,
    height: `${zoom * 100}%`,
    left: `${-(zoom - 1) * ax * 100}%`,
    top: `${-(zoom - 1) * ay * 100}%`,
  };
  return (
    <span aria-hidden className="absolute inset-0 block overflow-hidden">
      <span className="absolute block" style={inner}>
        <BarPicture cell={cell} fit={face.fit ?? "cover"} level={level} source={plates[face.src]} />
      </span>
    </span>
  );
}

/**
 * The pile for the project under the playhead. Each picture has its own
 * spring from the playhead out to its place; a new project folds the old
 * pile in first, then opens its own, one picture after another.
 */
function Pile({ active, plates, size, onOpen }: { active: number; plates: Plates[]; size: { w: number; h: number }; onOpen: (i: number) => void }): JSX.Element {
  const [shown, setShown] = useState(active);
  const [vals, setVals] = useState<number[]>(() => PILE.map(() => 0));
  const shownRef = useRef(active);
  const x = useRef<number[]>(PILE.map(() => 0));
  const v = useRef<number[]>(PILE.map(() => 0));

  useEffect(() => {
    if (stillMotion()) {
      shownRef.current = active;
      x.current = PILE.map(() => 1);
      v.current = PILE.map(() => 0);
      setShown(active);
      setVals(x.current.slice());
      return undefined;
    }
    let phase: "in" | "out" = shownRef.current === active ? "in" : "out";
    let startAt = performance.now();
    let last = startAt;
    let raf = 0;
    const step = (now: number): void => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      let settled = true;
      for (let i = 0; i < PILE.length; i += 1) {
        const target = phase === "in" && now - startAt >= i * 55 ? 1 : 0;
        // Out quickly and flat; in with a little overshoot.
        const k = phase === "in" ? 170 : 520;
        const c = phase === "in" ? 15 : 46;
        v.current[i] += (k * (target - x.current[i]) - c * v.current[i]) * dt;
        x.current[i] += v.current[i] * dt;
        const done = phase === "in" ? target === 1 && Math.abs(1 - x.current[i]) < 0.002 && Math.abs(v.current[i]) < 0.01 : x.current[i] < 0.03;
        if (!done) settled = false;
      }
      if (phase === "out" && settled) {
        x.current = PILE.map(() => 0);
        v.current = PILE.map(() => 0);
        shownRef.current = active;
        setShown(active);
        phase = "in";
        startAt = now;
        settled = false;
      }
      if (phase === "in" && settled) {
        x.current = PILE.map(() => 1);
        v.current = PILE.map(() => 0);
        setVals(x.current.slice());
        return;
      }
      setVals(x.current.slice());
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Scale from the reference's 1600x900; a phone keeps the pictures larger and the pile narrower.
  const narrow = size.w < 768;
  const k = narrow ? Math.min(size.w / 600, size.h / 900) : Math.min(size.w / 1600, size.h / 900);
  const spread = narrow ? 0.78 : 1;
  const p = projects[shown];
  const pl = plates[shown];
  const titleSerif = serifSafe(p.title);

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-[3] h-0 w-0">
      {PILE.map((t, i) => {
        const e = vals[i];
        const w = t.w * k;
        const h = t.h * k;
        const style: CSSProperties = {
          width: w,
          height: h,
          left: -w / 2,
          top: -h / 2,
          zIndex: t.z,
          opacity: clamp01(e * 2.5),
          transform: `translate(${t.x * k * spread * e}px, ${t.y * k * e}px) scale(${0.12 + 0.88 * e})`,
          backgroundColor: BAND,
          outline: LINE,
        };
        return (
          <button
            aria-hidden
            className="pointer-events-auto absolute block cursor-pointer"
            key={i}
            onClick={() => onOpen(shown)}
            style={style}
            tabIndex={-1}
            type="button"
          >
            <FaceBox cell={4} face={t} level={clamp01(e)} plates={pl} />
            {i === LABELLED ? (
              <span
                className="absolute bottom-[-1.4rem] left-[-1rem] flex items-start whitespace-nowrap px-[0.6rem] pt-[0.2rem] text-white"
                style={{ backgroundColor: BAND }}
              >
                <span className={`${titleSerif ? "font-serif-display italic" : "font-sans font-light"} text-[clamp(1.5rem,2.1vw,3.4rem)] uppercase leading-[1.1] tracking-[-0.01em]`}>
                  {p.title}
                </span>
                <span className="ml-[0.2rem] mt-[0.3rem] font-sans text-[1.1rem] font-light">({p.year})</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Detail({ i, source, onClose }: { i: number; source: BarSource | null; onClose: () => void }): JSX.Element {
  const p = projects[i];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b45-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain px-[1.6rem] py-[6vh] md:px-[4vw]"
      data-lenis-prevent
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="b45-dialog mx-auto max-w-[140rem]" onClick={(e) => e.stopPropagation()} style={{ border: LINE }}>
        <div className="flex items-center justify-between px-[2rem] py-[1.2rem]" style={{ borderBottom: LINE }}>
          <p className={MONO}>
            {pad2(i + 1)} / {pad2(projects.length)}
          </p>
          <button className={`${MONO} b45-link cursor-pointer px-[0.4rem] py-[0.4rem]`} onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>
        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="relative aspect-[4/3] w-full lg:aspect-auto lg:min-h-[52rem]" style={{ borderBottom: LINE }}>
            {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className="px-[2rem] py-[2.4rem] lg:border-l" style={{ borderColor: RULE }}>
            <p className={`${MONO} opacity-70`}>
              {p.year} · {p.kind}
            </p>
            <h2
              className={`mt-[0.8rem] ${serifSafe(p.title) ? "font-serif-display italic" : "font-sans font-light"} text-[clamp(3.2rem,3.4vw,5.6rem)] uppercase leading-[1.05] tracking-[-0.01em] text-white`}
              id="b45-detail-title"
            >
              {p.title}
            </h2>
            <p className="mt-[1.4rem] font-sans text-[1.8rem] font-light leading-[1.45]">{p.tagline}</p>
            <ul className="mt-[2rem] space-y-[1rem]" style={{ borderTop: LINE, paddingTop: "1.6rem" }}>
              {p.bullets.map((b) => (
                <li className="flex gap-[1rem] font-sans text-[1.5rem] leading-[1.5]" key={b}>
                  <span aria-hidden className="mt-[0.8rem] h-[0.5rem] w-[0.5rem] shrink-0 rounded-full" style={{ backgroundColor: BLOSSOM }} />
                  {b}
                </li>
              ))}
            </ul>
            <dl className="mt-[2rem] grid grid-cols-[9rem_1fr] gap-y-[0.8rem]" style={{ borderTop: LINE, paddingTop: "1.6rem" }}>
              <dt className={`${MONO} opacity-60`}>Stack</dt>
              <dd className={`${MONO} text-white`}>{p.stack.join(", ")}</dd>
              {p.award ? (
                <>
                  <dt className={`${MONO} opacity-60`}>Award</dt>
                  <dd className={`${MONO} text-white`}>{p.award}</dd>
                </>
              ) : null}
              {p.href || p.code ? (
                <>
                  <dt className={`${MONO} opacity-60`}>Links</dt>
                  <dd className={`${MONO} flex flex-wrap gap-x-[2rem] gap-y-[0.4rem]`}>
                    {p.href ? (
                      <a className="b45-link normal-case text-white" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b45-link text-white" href={p.code} rel="noreferrer" target="_blank">
                        Code ↗
                      </a>
                    ) : null}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function B45(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(-1);
  const [size, setSize] = useState({ w: 1600, h: 900 });
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const geo = useRef<{ a: number[]; b: number[] }>({ a: [], b: [] });
  const moreRef = useRef<HTMLButtonElement>(null);
  const lastOpen = useRef(false);

  useEffect(() => setMounted(true), []);

  // Every picture and plate, made once in the browser.
  const plates = useMemo<Plates[] | null>(() => {
    if (!mounted) return null;
    return projects.map((p) => ({
      pic: projectSource(p),
      year: textPlate(p.year, { width: 800, height: 400 }),
      s0: textPlate(p.stack[0], { width: 800, height: 400 }),
      s1: textPlate(p.stack[1] ?? p.stack[0], { width: 800, height: 400 }),
    }));
  }, [mounted]);

  // Where the playhead is along the thumbnail line, and so which project is open.
  const sOf = useCallback((t: number): number => {
    const { a, b } = geo.current;
    if (!a.length) return 0;
    const s0 = a[0] + 12;
    const s1 = b[b.length - 1] - 12;
    return s0 + clamp01((t - 0.04) / 0.92) * (s1 - s0);
  }, []);

  useEffect(() => {
    let raf = 0;
    const measure = (): void => {
      const a: number[] = [];
      const b: number[] = [];
      groupRefs.current.forEach((g) => {
        if (!g) return;
        a.push(g.offsetLeft);
        b.push(g.offsetLeft + g.offsetWidth);
      });
      geo.current = { a, b };
      const st = stageRef.current;
      if (st) setSize({ w: st.clientWidth, h: st.clientHeight });
    };
    const read = (): void => {
      raf = 0;
      const el = sectionRef.current;
      const strip = stripRef.current;
      if (!el || !strip) return;
      const r = el.getBoundingClientRect();
      const span = Math.max(1, r.height - window.innerHeight);
      const t = clamp01(-r.top / span);
      const s = sOf(t);
      strip.style.transform = `translate3d(${-s}px, -50%, 0)`;
      const { a } = geo.current;
      let i = 0;
      for (let k = 0; k < a.length; k += 1) if (s >= a[k]) i = k;
      setActive(i);
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    const onResize = (): void => {
      measure();
      onScroll();
    };
    measure();
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sOf]);

  /** Scroll so project i's thumbnails sit under the playhead. */
  const goTo = useCallback((i: number): void => {
    const el = sectionRef.current;
    const { a, b } = geo.current;
    if (!el || !a.length) return;
    const s0 = a[0] + 12;
    const s1 = b[b.length - 1] - 12;
    const c = (a[i] + b[i]) / 2;
    const t = 0.04 + clamp01((c - s0) / Math.max(1, s1 - s0)) * 0.92;
    const top = el.getBoundingClientRect().top + window.scrollY;
    scrollToY(top + t * Math.max(0, el.offsetHeight - window.innerHeight));
  }, []);

  const jump = useCallback(
    (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      scrollToY(el.getBoundingClientRect().top + window.scrollY);
    },
    [],
  );

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to "More details" when the detail closes.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = true;
      return;
    }
    if (lastOpen.current) {
      moreRef.current?.focus();
      lastOpen.current = false;
    }
  }, [open]);

  const cur = projects[active];
  const link = linkOf(cur);

  return (
    <div className="relative w-full" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <section aria-label="Work" className="relative" id="b45-work" ref={sectionRef} style={{ height: `calc(${SCREEN} * ${STAGE_SCREENS})` }}>
        <div className="sticky top-0 w-full overflow-hidden" ref={stageRef} style={{ height: SCREEN }}>
          {/* Eight rows of faint rules, the middle one carrying the thumbnails. */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[4.2rem] right-[4.2rem] md:left-[4.8rem] md:right-[4.8rem]">
            {[1, 2, 3, 4, 5, 6, 7].map((r) => (
              <span className="absolute left-0 right-0 block h-px" key={r} style={{ top: `${(r / 8) * 100}%`, backgroundColor: RULE }} />
            ))}
          </div>

          {/* The thumbnail line: starts at the playhead and slides left as the page scrolls. */}
          <div className="absolute left-1/2 top-1/2 z-[2] h-0 w-0">
            <div className="absolute left-0 top-0 flex items-center gap-[0.2rem] will-change-transform" ref={stripRef} style={{ transform: "translate3d(0, -50%, 0)" }}>
              {projects.map((p, i) => (
                <button
                  aria-label={`${p.title}, ${p.year}`}
                  className="b45-group flex cursor-pointer gap-[0.2rem]"
                  key={p.title}
                  onClick={() => goTo(i)}
                  ref={(el) => {
                    groupRefs.current[i] = el;
                  }}
                  style={{ opacity: active === i ? 1 : 0.6 }}
                  type="button"
                >
                  {THUMBS.map((t, k) => (
                    <span className="relative block h-[3.2rem] shrink-0" key={k} style={{ width: `${t.w}rem`, backgroundColor: BAND }}>
                      {plates ? <FaceBox cell={3} face={t} level={1} plates={plates[i]} /> : null}
                    </span>
                  ))}
                </button>
              ))}
            </div>
          </div>

          {/* The playhead. */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 z-[4] w-px -translate-x-1/2" style={{ backgroundColor: "rgba(255, 255, 255, 0.75)" }}>
            <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[0.5rem] border-t-[0.8rem] border-x-transparent border-t-white" />
            <span className="absolute bottom-0 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[0.5rem] border-b-[0.8rem] border-x-transparent border-b-white" />
          </div>

          {plates ? <Pile active={active} onOpen={setOpen} plates={plates} size={size} /> : null}

          {/* "Scroll" in a drawn oval. */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[2.4vh] z-[5] h-[5.6rem] w-[15.6rem] -translate-x-1/2">
            <svg className="absolute inset-0 h-full w-full overflow-visible" fill="none" viewBox="0 0 156 56">
              <path
                className="b45-oval"
                d="M121 4 C 150 6, 160 20, 146 31 C 128 46, 60 55, 22 49 C 2 45, -2 30, 14 19 C 32 7, 82 1, 126 3 L 138 2"
                stroke={BLOSSOM}
                strokeLinecap="round"
                strokeWidth="1.3"
              />
            </svg>
            <span className={`${HAND} absolute inset-0 flex items-center justify-center pb-[0.2rem] text-[2.8rem] text-white`}>Scroll</span>
          </div>

          {/* Left strip: name and trade, read upwards. */}
          <div className="absolute bottom-[1rem] left-[0.8rem] top-[1rem] z-[6] flex w-[2.6rem] flex-col items-center justify-between py-[1.6rem] md:left-[1rem]" style={{ backgroundColor: BLOSSOM, color: BAND }}>
            <p className={`b45-up ${MONO} text-[1.1rem]`}>▸ Kevin He</p>
            <p className={`b45-up ${MONO} text-[1.1rem]`}>Engineer · Toronto</p>
          </div>
          {/* Right strip: the three parts, read downwards. */}
          <nav aria-label="Sections" className="absolute bottom-[1rem] right-[0.8rem] top-[1rem] z-[6] flex w-[2.6rem] flex-col items-center justify-between py-[1.6rem] md:right-[1rem]" style={{ backgroundColor: BLOSSOM, color: BAND }}>
            <a className={`b45-vert ${MONO} text-[1.1rem]`} href="#b45-work" onClick={jump("b45-work")}>
              Work
            </a>
            <a className={`b45-vert ${MONO} text-[1.1rem]`} href="#b45-skills" onClick={jump("b45-skills")}>
              Skills
            </a>
            <a className={`b45-vert ${MONO} text-[1.1rem]`} href="#b45-contact" onClick={jump("b45-contact")}>
              Contact
            </a>
          </nav>

          {/* Along the bottom: number, name, and the two ways in. */}
          <div className="absolute bottom-[3vh] left-[5.2rem] right-[5.2rem] z-[5] grid grid-cols-[auto_1fr] items-end gap-x-[2rem] md:left-[9vw] md:right-[9vw] md:grid-cols-[1fr_auto_1fr]">
            <p className="font-mono text-[1.4rem] tabular-nums tracking-[0.06em]" aria-live="polite">
              {pad2(active + 1)}
              <span className="sr-only">, {cur.title}</span>
            </p>
            <p aria-hidden className="hidden whitespace-nowrap font-mono text-[1.4rem] tracking-[0.06em] md:block">
              <span className="mr-[0.8rem] text-[1rem]">▶</span>
              {cur.title}
            </p>
            <div className="flex flex-col items-end">
              <button
                aria-haspopup="dialog"
                className={`${HAND} b45-link flex cursor-pointer items-start text-[2.6rem]`}
                onClick={() => setOpen(active)}
                ref={moreRef}
                type="button"
              >
                More details
                <svg aria-hidden className="ml-[-0.2rem] mt-[0.2rem] h-[4.4rem] w-[5.4rem] overflow-visible" fill="none" viewBox="0 0 54 44">
                  <path d="M1 14 C 14 4, 34 -2, 44 8 C 52 16, 46 30, 40 40" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
                  <path d="M34 34 L 40 41 L 47 36" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
                </svg>
              </button>
              {link ? (
                <a className="b45-link mr-[0.4rem] mt-[-0.4rem] whitespace-nowrap font-mono text-[1.4rem] tracking-[0.06em]" href={link} rel="noreferrer" target="_blank">
                  View project ↗
                </a>
              ) : (
                <span className="mr-[0.4rem] mt-[-0.4rem] whitespace-nowrap font-mono text-[1.4rem] tracking-[0.06em] opacity-50">No public link</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* After the screen: skills, then contact. */}
      <section className="px-[1.6rem] pt-[6vh] md:px-[9vw]" id="b45-skills">
        <div className="flex items-end justify-between gap-[2rem] pb-[1.6rem]" style={{ borderBottom: LINE }}>
          <h2 className={`${HAND} text-[4.2rem] text-white`}>Skills</h2>
          <p className={`${MONO} opacity-60`}>{pad2(skillGroups.length)} groups</p>
        </div>
        <div className="grid grid-cols-1 gap-x-[3.2rem] gap-y-[2.8rem] pt-[2.4rem] sm:grid-cols-2 lg:grid-cols-5">
          {skillGroups.map((g) => (
            <div className="min-w-0" key={g.label}>
              <h3 className={`${MONO} text-white`}>{g.label}</h3>
              <ul className="mt-[1.2rem] flex flex-wrap gap-x-[1.4rem] gap-y-[0.6rem]">
                {g.skills.map((s) => {
                  const icon = skillIcon(s.icon);
                  return (
                    <li className="flex items-center gap-[0.6rem] font-sans text-[1.4rem] font-light leading-[1.4]" key={s.name}>
                      {icon ? (
                        <svg aria-hidden className="h-[1.2rem] w-[1.2rem] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d={icon.path} />
                        </svg>
                      ) : (
                        <span aria-hidden className="font-mono text-[0.9rem] tracking-[0.04em] opacity-60">
                          {s.mark}
                        </span>
                      )}
                      {s.name}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="px-[1.6rem] pb-[8vh] pt-[6vh] md:px-[9vw]" id="b45-contact">
        <div className="flex items-end justify-between gap-[2rem] pb-[1.6rem]" style={{ borderBottom: LINE }}>
          <h2 className={`${HAND} text-[4.2rem] text-white`}>Contact</h2>
          <p className={`${MONO} opacity-60`}>Toronto</p>
        </div>
        <div className="grid grid-cols-1 items-end gap-x-[4rem] gap-y-[2.4rem] pt-[2.4rem] md:grid-cols-[1fr_auto]">
          <a className="b45-link break-all font-sans text-[clamp(2.4rem,3vw,4.8rem)] font-light leading-[1.1] tracking-[-0.02em] text-white md:break-normal" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <ul className="flex flex-wrap gap-x-[2.8rem] gap-y-[1rem]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className={`${MONO} b45-link whitespace-nowrap`} href={l.href} rel="noreferrer" target="_blank">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {open >= 0 ? <Detail i={open} onClose={close} source={plates ? plates[open].pic : null} /> : null}
    </div>
  );
}
