"use client";

import { type CSSProperties, type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource, textPlate } from "@/components/below/barPicture";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 33, Numbered. After gregorylalle.com.
 *
 * Work: a section about two screens tall with a stage pinned inside it.
 * "Work," sits top left in large Inter. Scrolling steps through the five
 * projects, one fifth of the extra screen each. For the current project a
 * small grid of five tiles shows its picture as bars: the whole picture,
 * two close crops of it, and two cards of type (the year, and the award or
 * the first stack word). The tiles fade out and back in as bars when the
 * step changes. Beside the grid, the project's number, 01 to 05. On the
 * right, all five names in small mono caps; the current one is white with
 * a ◂ after it. Clicking a name scrolls to its step. Clicking a tile opens
 * the project in a panel over the page (Esc or Close shuts it).
 *
 * Skills: under the pinned part, "Skills," at the same size, five short
 * columns, then the email and the links.
 */

const SCREEN = "var(--arbor-screen-h)";
/** How tall the Work section is, in screens. The stage takes one; the rest is scrolled through. */
const WORK_SCREENS = 1.9;
const RULE = "rgba(249, 185, 220, 0.25)";
const TILE_BG = "rgba(249, 185, 220, 0.05)";
const HEAD = "font-sans font-medium leading-[0.95] tracking-[-0.045em] text-[clamp(5.6rem,9vw,16rem)]";
const CAPS = "font-mono text-[1.1rem] uppercase tracking-[0.18em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** The display serif draws a watermark for these; text holding any is set in Inter. */
const serifSafe = (s: string): boolean => !/[0-9'"&@\-!()/;‑]/.test(s);

type Plates = { main: BarSource; year: BarSource; tag: BarSource };

const CSS = `
.b33-tile { transition: background-color 0.3s ease; }
.b33-tile:hover, .b33-tile:focus-visible { background-color: rgba(249, 185, 220, 0.12); }
.b33-name { transition: color 0.3s ease, opacity 0.3s ease; }
.b33-panel { animation: b33-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b33-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b33-tile, .b33-name { transition: none; }
  .b33-panel { animation: none; }
}
`;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Shows part of a picture: the picture drawn `zoom` times the box, shifted so the point (x, y) in 0..1 shows. */
function Crop({ zoom, x, y, children }: { zoom: number; x: number; y: number; children: ReactNode }): JSX.Element {
  const inner: CSSProperties = {
    position: "absolute",
    width: `${zoom * 100}%`,
    height: `${zoom * 100}%`,
    left: `${-x * (zoom - 1) * 100}%`,
    top: `${-y * (zoom - 1) * 100}%`,
  };
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div style={inner}>{children}</div>
    </div>
  );
}

type TileSpec = { key: string; area: CSSProperties; aspect: string; draw: (pl: Plates, level: number) => JSX.Element };

// The grid is four columns; tiles leave gaps, like thumbnails laid on a table.
const TILES: TileSpec[] = [
  {
    key: "whole",
    area: { gridColumn: "1 / span 2", gridRow: "1" },
    aspect: "16 / 10",
    draw: (pl, lv) => <BarPicture cell={6} fit="cover" level={lv} source={pl.main} />,
  },
  {
    key: "tall",
    area: { gridColumn: "3", gridRow: "1" },
    aspect: "3 / 4",
    draw: (pl, lv) => (
      <Crop x={0.3} y={0.5} zoom={1.8}>
        <BarPicture cell={6} fit="cover" level={lv} source={pl.main} />
      </Crop>
    ),
  },
  {
    key: "year",
    area: { gridColumn: "2", gridRow: "2" },
    aspect: "4 / 3",
    draw: (pl, lv) => <BarPicture cell={5} fit="contain" invert={false} level={lv} source={pl.year} />,
  },
  {
    key: "close",
    area: { gridColumn: "3", gridRow: "2" },
    aspect: "1 / 1",
    draw: (pl, lv) => (
      <Crop x={0.75} y={0.35} zoom={2.6}>
        <BarPicture cell={6} fit="cover" level={lv} source={pl.main} />
      </Crop>
    ),
  },
  {
    key: "tag",
    area: { gridColumn: "4", gridRow: "2" },
    aspect: "4 / 3",
    draw: (pl, lv) => <BarPicture cell={5} fit="contain" invert={false} level={lv} source={pl.tag} />,
  },
];

/** The word on the second type card: the award's first half, else the first stack word. */
const tagOf = (p: Project): string => (p.award ? p.award.split(",")[0] : p.stack[0]);

function Title({ text, className }: { text: string; className: string }): JSX.Element {
  if (serifSafe(text)) return <span className={`font-serif-display italic pb-[0.1em] ${className}`}>{text}</span>;
  return <span className={`font-sans font-medium tracking-[-0.03em] ${className}`}>{text}</span>;
}

function Detail({ p, i, source, onClose }: { p: Project; i: number; source: BarSource | null; onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      back?.focus?.();
    };
  }, [onClose]);

  const links: { label: string; href: string }[] = [];
  if (p.href) links.push({ label: hostOf(p.href), href: p.href });
  if (p.code && p.code !== p.href) links.push({ label: `code, ${hostOf(p.code)}`, href: p.code });

  return (
    <div
      aria-labelledby="b33-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain"
      data-lenis-prevent
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div
        className="b33-panel mx-auto grid min-h-full max-w-[160rem] content-center gap-[4rem] px-[1.6rem] py-[8rem] md:grid-cols-[1.1fr_1fr] md:px-[4vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-full" style={{ aspectRatio: "4 / 3", backgroundColor: TILE_BG }}>
          {source ? <BarPicture alt={p.title} cell={7} fit="cover" source={source} /> : null}
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-[2rem]">
            <p className="font-sans text-[clamp(3.2rem,4vw,6rem)] font-medium leading-[1] tracking-[-0.04em] text-white">{pad2(i + 1)}</p>
            <button
              className={`${CAPS} border px-[1.2rem] py-[0.8rem] text-white`}
              onClick={onClose}
              ref={closeRef}
              style={{ borderColor: RULE }}
              type="button"
            >
              Close, Esc
            </button>
          </div>
          <h3 className="mt-[2.4rem] text-[clamp(3.6rem,4.4vw,7.2rem)] leading-[1] text-white" id="b33-detail-title">
            <Title className="inline-block" text={p.title} />
          </h3>
          <p className="mt-[1.6rem] font-sans text-[clamp(1.7rem,1.5vw,2.2rem)] font-light leading-[1.4] text-white">{p.tagline}</p>
          <ul className="mt-[2.4rem] space-y-[1.2rem] border-t pt-[2.4rem]" style={{ borderColor: RULE }}>
            {p.bullets.map((b) => (
              <li className="flex gap-[1.2rem] font-sans text-[1.6rem] font-light leading-[1.55]" key={b}>
                <span aria-hidden className="mt-[0.85rem] h-[0.5rem] w-[0.5rem] shrink-0" style={{ backgroundColor: BLOSSOM }} />
                {b}
              </li>
            ))}
          </ul>
          <dl className={`mt-[2.4rem] grid grid-cols-[9rem_1fr] gap-y-[0.8rem] border-t pt-[2rem] ${CAPS} leading-[1.6]`} style={{ borderColor: RULE }}>
            <dt className="opacity-60">Year</dt>
            <dd className="text-white">{p.year}</dd>
            <dt className="opacity-60">Stack</dt>
            <dd className="text-white">{p.stack.join(", ")}</dd>
            {p.award ? (
              <>
                <dt className="opacity-60">Award</dt>
                <dd className="text-white">{p.award}</dd>
              </>
            ) : null}
          </dl>
          {links.length ? (
            <ul className="mt-[2.4rem] flex flex-wrap gap-x-[2.4rem] gap-y-[1rem]">
              {links.map((l) => (
                <li key={l.href}>
                  <a className="font-mono text-[1.4rem] leading-[1.6] text-white underline underline-offset-[0.35em]" href={l.href} rel="noreferrer" target="_blank">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function B33(): JSX.Element {
  const workRef = useRef<HTMLElement>(null);
  const markRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(-1);
  // 0 at a step change, rising; each tile's bar level is read off it with a small lag.
  const [fade, setFade] = useState(0);

  useEffect(() => setMounted(true), []);

  // Pictures: built once, in the browser.
  const plates = useMemo<Plates[] | null>(() => {
    if (!mounted) return null;
    return projects.map((p) => ({
      main: projectSource(p),
      year: textPlate(p.year, { width: 1200, height: 900 }),
      tag: textPlate(tagOf(p), { width: 1200, height: 900 }),
    }));
  }, [mounted]);

  // Which step: how far the pinned stage has travelled through the section.
  useEffect(() => {
    let raf = 0;
    const read = (): void => {
      raf = 0;
      const el = workRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = Math.max(1, r.height - window.innerHeight);
      const t = Math.max(0, Math.min(0.9999, -r.top / span));
      setStep(Math.floor(t * projects.length));
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // The bar fade: out to nothing and back up over about half a second.
  useEffect(() => {
    if (!mounted) return undefined;
    if (reducedMotion()) {
      setFade(2);
      return undefined;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number): void => {
      const f = (now - t0) / 520;
      setFade(Math.min(2, f));
      if (f < 2) raf = requestAnimationFrame(tick);
    };
    setFade(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, mounted]);

  const levelOf = (k: number): number => {
    const x = Math.max(0, Math.min(1, (fade - k * 0.12) / 0.7));
    return 1 - (1 - x) * (1 - x);
  };

  const jump = useCallback((i: number): void => {
    const to = markRefs.current[i];
    if (!to) return;
    const lenis = (window as unknown as { __lenis?: { scrollTo: (el: HTMLElement, o?: { duration?: number; immediate?: boolean }) => void } }).__lenis;
    const still = reducedMotion();
    if (lenis) lenis.scrollTo(to, still ? { immediate: true } : { duration: 1 });
    else to.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }, []);

  const close = useCallback(() => setOpen(-1), []);
  const cur = projects[step];

  return (
    <div className="relative w-full" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <section className="relative" id="work" ref={workRef} style={{ height: `calc(${SCREEN} * ${WORK_SCREENS})` }}>
        {/* One marker per step, at the middle of its stretch of scroll: what a name click scrolls to. */}
        {projects.map((p, i) => (
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 h-px w-px"
            key={p.title}
            ref={(el) => {
              markRefs.current[i] = el;
            }}
            style={{ top: `calc(${SCREEN} * ${WORK_SCREENS - 1} * ${(i + 0.5) / projects.length})` }}
          />
        ))}

        <div className="sticky top-0 flex w-full flex-col px-[1.6rem] pb-[3vh] pt-[4vh] md:px-[4vw]" style={{ height: SCREEN }}>
          <div className="flex items-start justify-between gap-[2rem]">
            <h2 className={HEAD}>Work,</h2>
            <p className={`${CAPS} hidden pt-[1.2rem] opacity-60 md:block`}>Skills, Contact</p>
          </div>

          <div className="grid flex-1 content-center items-center gap-[3.2rem] md:grid-cols-[1fr_24rem] md:gap-[4vw]">
            {/* The tiles and the number. */}
            <div className="grid w-full max-w-[min(100%,95vh)] grid-cols-4 items-end gap-[0.8rem] md:gap-[1.2vw]">
              {TILES.map((t, k) => (
                <button
                  aria-label={`Open ${cur.title}`}
                  className="b33-tile relative block w-full cursor-pointer"
                  key={t.key}
                  onClick={() => setOpen(step)}
                  style={{ ...t.area, aspectRatio: t.aspect, backgroundColor: TILE_BG, alignSelf: k === 1 ? "end" : "start" }}
                  type="button"
                >
                  {plates ? t.draw(plates[step], levelOf(k)) : null}
                </button>
              ))}
              <p
                aria-live="polite"
                className="self-end font-sans text-[clamp(4rem,6.4vw,12rem)] font-medium leading-[0.95] tracking-[-0.05em] text-white tabular-nums"
                style={{ gridColumn: "4", gridRow: "1", paddingLeft: "0.2em" }}
              >
                {pad2(step + 1)}
              </p>
              <p className={`${CAPS} self-start leading-[1.5] opacity-80`} style={{ gridColumn: "1", gridRow: "2" }}>
                {cur.year}
                <br />
                <span className="opacity-70">{cur.kind}</span>
              </p>
            </div>

            {/* All five names. */}
            <ol className="w-full max-w-[32rem]">
              {projects.map((p, i) => {
                const on = i === step;
                return (
                  <li key={p.title}>
                    <button
                      aria-current={on ? "step" : undefined}
                      className={`b33-name grid w-full grid-cols-[1fr_1.6rem] items-baseline gap-[1rem] py-[0.35rem] text-left ${CAPS} leading-[1.4]`}
                      onClick={() => jump(i)}
                      style={{ color: on ? "#ffffff" : BLOSSOM, opacity: on ? 1 : 0.55 }}
                      type="button"
                    >
                      <span>{p.title}</span>
                      <span aria-hidden className="font-sans text-[1.1rem]">
                        {on ? "◂" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li className={`${CAPS} mt-[1.6rem] leading-[1.6] opacity-50`}>Scroll, or pick a name. Click a picture to open it.</li>
            </ol>
          </div>

          <div className={`${CAPS} flex justify-between border-t pt-[1.2rem] opacity-60`} style={{ borderColor: RULE }}>
            <span>Kevin He</span>
            <span className="tabular-nums">
              {pad2(step + 1)} / {pad2(projects.length)}
            </span>
          </div>
        </div>
      </section>

      <section className="px-[1.6rem] pb-[6vh] pt-[6vh] md:px-[4vw]" id="skills">
        <h2 className={HEAD}>Skills,</h2>
        <div className="mt-[4vh] grid grid-cols-2 gap-x-[2.4rem] gap-y-[3.2rem] md:grid-cols-5 md:gap-x-[2vw]">
          {skillGroups.map((g, i) => (
            <div className="border-t pt-[1.2rem]" key={g.label} style={{ borderColor: RULE }}>
              <p className={`${CAPS} opacity-60`}>{pad2(i + 1)}</p>
              <h3 className="mt-[0.8rem] font-sans text-[1.8rem] font-medium leading-[1.2] tracking-[-0.02em] text-white">{g.label}</h3>
              <ul className="mt-[1.2rem] font-mono text-[1.25rem] leading-[1.7]">
                {g.skills.map((s) => (
                  <li key={s.name}>{s.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-[5vh] flex flex-wrap items-end justify-between gap-x-[4rem] gap-y-[2.4rem] border-t pt-[2rem]" id="contact" style={{ borderColor: RULE }}>
          <a className="break-all font-sans text-[clamp(2.2rem,2.6vw,4.4rem)] font-medium leading-[1.1] tracking-[-0.03em] text-white underline-offset-[0.2em] hover:underline" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
          <ul className="flex flex-wrap gap-x-[2.8rem] gap-y-[1rem]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className={`${CAPS} leading-[1.6] hover:text-white`} href={l.href} rel="noreferrer" target="_blank">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {open >= 0 ? <Detail i={open} onClose={close} p={projects[open]} source={plates ? plates[open].main : null} /> : null}
    </div>
  );
}
