"use client";

import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource, textPlate } from "@/components/below/barPicture";
import { type Project, projects, skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 51, Stack (after snp.agency). A "↙ THE WORK" label, then the five
 * projects as full-width cards in a screen that stays put while the page
 * scrolls. Each new card slides up from the bottom over the one before.
 * The covered card moves up one tab height and narrows a little, so only
 * a thin strip of it shows at the top with its name in small caps; the
 * strips pile up as cards come in. Each card: its picture drawn as bars
 * over the whole card, the name in the middle with a dot above it, a strip
 * of small bar thumbnails bottom left (crops of the picture and the year),
 * the kind in brackets bottom centre, and two short columns of facts
 * bottom right (stack; year and award). Clicking a card, or a strip,
 * opens its detail over the page. Then the skills and the contact in the
 * same small uppercase type.
 *
 * About 0.36 of a screen of scrolling per card. Under reduced motion the
 * cards are a plain list with no stacking. The bar pictures draw on 2D
 * canvases made in the browser only, so they wait for a mounted flag.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const PANEL = "rgba(26, 8, 18, 0.85)";
const N = projects.length;
/** Scrolling per card, as a share of the screen. */
const PER = 0.36;
/** Tab height and the gap above the top tab, in rem. */
const TAB = 3.2;
const PAD = 1.6;
const TOP0 = PAD + (N - 1) * TAB;

const HEAD = "font-sans uppercase leading-[1.05] tracking-[-0.01em] text-[clamp(2.4rem,2vw,3.6rem)]";
const META = "font-mono text-[1rem] uppercase leading-[1.4] tracking-[0.04em] md:text-[1.1rem]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const KIND: Record<Project["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Discord bot",
};
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const CSS = `
.b51-card { cursor: pointer; }
.b51-card:focus-visible { outline: 0.2rem solid #ffffff; outline-offset: -0.2rem; }
.b51-link { transition: color 0.2s ease; }
.b51-link:hover, .b51-link:focus-visible { color: #ffffff; }
.b51-dialog { animation: b51-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b51-in { from { opacity: 0; transform: translateY(1.6rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b51-link { transition: none; }
  .b51-dialog { animation: none; }
}
`;

type Pics = { main: BarSource[]; thumbs: (BarSource[] | null)[] };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

/** Three portrait crops from different parts of the picture, then its year as type. */
async function thumbsOf(src: BarSource, year: string): Promise<BarSource[]> {
  const im = typeof src === "string" ? await loadImage(src) : src;
  const w = im instanceof HTMLImageElement ? im.naturalWidth : im.width;
  const h = im instanceof HTMLImageElement ? im.naturalHeight : im.height;
  const cw = Math.min(w * 0.3, (h / 1.3) * 0.9);
  const ch = cw * 1.3;
  const spots: [number, number][] = [
    [0.08, 0.2],
    [0.5, 0.6],
    [0.9, 0.3],
  ];
  const crops = spots.map(([fx, fy]) => {
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 312;
    const ctx = c.getContext("2d");
    if (ctx) ctx.drawImage(im, fx * (w - cw), fy * (h - ch), cw, ch, 0, 0, c.width, c.height);
    return c;
  });
  return [...crops, textPlate(year, { width: 600, height: 780 })];
}

function Detail({ i, source, onClose }: { i: number; source: BarSource | null; onClose: () => void }): JSX.Element {
  const p = projects[i];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = was;
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b51-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[4vh] md:px-[4vw] md:py-[6vh]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.92)", color: BLOSSOM }}
    >
      <div className="b51-dialog mx-auto max-w-[140rem]" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: PANEL, border: LINE }}>
        <div className="flex items-center justify-between gap-[1.6rem] px-[2rem] py-[1.2rem]" style={{ borderBottom: LINE }}>
          <p className={META}>
            {pad2(i + 1)} / {pad2(N)} &middot; {KIND[p.kind]}
          </p>
          <button className={`${META} b51-link cursor-pointer p-[0.4rem]`} onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>
        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="relative aspect-[4/3] w-full lg:aspect-auto lg:min-h-[52rem]" style={{ borderBottom: LINE }}>
            {source ? <BarPicture alt={p.title} cell={7} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className="px-[2rem] py-[2.4rem] lg:border-l" style={{ borderColor: RULE }}>
            <p className={`${META} opacity-70`}>{p.year}</p>
            <h2 className="mt-[0.8rem] font-sans text-[clamp(3.2rem,3.4vw,5.6rem)] uppercase leading-[1.02] tracking-[-0.02em] text-white" id="b51-detail-title">
              {p.title}
            </h2>
            <p className="mt-[1.4rem] font-sans text-[1.8rem] font-light leading-[1.45]">{p.tagline}</p>
            <ul className="mt-[2rem] space-y-[1rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className="flex gap-[1rem] font-sans text-[1.5rem] leading-[1.5]" key={b}>
                  <span aria-hidden className="mt-[0.8rem] h-[0.5rem] w-[0.5rem] shrink-0 rounded-full" style={{ backgroundColor: BLOSSOM }} />
                  {b}
                </li>
              ))}
            </ul>
            <dl className="mt-[2rem] grid grid-cols-[8rem_1fr] gap-y-[0.8rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              <dt className={`${META} opacity-60`}>Stack</dt>
              <dd className={`${META} text-white`}>{p.stack.join(", ")}</dd>
              {p.award ? (
                <>
                  <dt className={`${META} opacity-60`}>Award</dt>
                  <dd className={`${META} text-white`}>{p.award}</dd>
                </>
              ) : null}
              {p.href || p.code ? (
                <>
                  <dt className={`${META} opacity-60`}>Links</dt>
                  <dd className={`${META} flex flex-wrap gap-x-[2rem] gap-y-[0.4rem]`}>
                    {p.href ? (
                      <a className="b51-link text-white" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b51-link text-white" href={p.code} rel="noreferrer" target="_blank">
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

/** What sits on a card: picture, name, thumbnails, facts. Shared by the stack and the plain list. */
function Face({ p, i, main, thumbs }: { p: Project; i: number; main: BarSource | null; thumbs: BarSource[] | null }): JSX.Element {
  return (
    <>
      <span aria-hidden className="absolute inset-y-0 left-1/2 block -translate-x-1/2" data-b51-inner style={{ width: "100%" }}>
        {main ? <BarPicture cell={6} className="absolute inset-0" level={0.9} source={main} /> : null}
        <span className="absolute inset-x-0 bottom-0 block h-[40%]" style={{ background: "linear-gradient(to top, rgba(26,8,18,0.85), rgba(26,8,18,0))" }} />
      </span>
      <span className="absolute inset-0 block" data-b51-face>
        {/* Name in the middle, a dot above it. */}
        <span className="absolute inset-x-[1.6rem] top-1/2 flex -translate-y-1/2 flex-col items-center gap-[2rem] text-center">
          <span aria-hidden className="block h-[1.2rem] w-[1.2rem] rounded-full" style={{ backgroundColor: BLOSSOM }} />
          <span
            className="font-sans text-[clamp(2.4rem,2vw,4rem)] uppercase leading-[1.05] tracking-[-0.01em] text-white"
            style={{ textShadow: "0 0 2.4rem rgba(26,8,18,0.9)" }}
          >
            {p.title}
          </span>
        </span>
        {/* Thumbnails, bottom left. */}
        <span aria-hidden className="absolute bottom-[1.2rem] left-[1.2rem] flex gap-[0.6rem] md:bottom-[2.4rem] md:left-[2.4rem] md:gap-[1rem]">
          {[0, 1, 2, 3].map((k) => (
            <span
              className={`relative block h-[5.7rem] w-[4.4rem] md:h-[8.8rem] md:w-[6.8rem] ${k === 3 ? "hidden sm:block" : ""}`}
              key={k}
              style={{ backgroundColor: PANEL, border: LINE }}
            >
              {thumbs ? <BarPicture cell={3} className="absolute inset-0" source={thumbs[k]} /> : null}
            </span>
          ))}
        </span>
        {/* Kind, bottom centre. */}
        <span className={`${META} absolute bottom-[2.4rem] left-1/2 hidden -translate-x-1/2 whitespace-nowrap sm:block`}>({KIND[p.kind]})</span>
        {/* Facts, bottom right. */}
        <span className={`${META} absolute bottom-[1.2rem] right-[1.2rem] flex gap-[3.2rem] text-left md:bottom-[2.4rem] md:right-[8vw] md:gap-[6vw]`}>
          <span className="hidden w-[12rem] md:block">
            {p.stack.slice(0, 4).map((s) => (
              <span className="block" key={s}>
                {s}
              </span>
            ))}
          </span>
          <span className="block w-[12rem] md:w-[14rem]">
            <span className="block sm:hidden">{KIND[p.kind]}</span>
            <span className="block tabular-nums">{p.year}</span>
            <span className="block text-white">{p.award ?? `${pad2(i + 1)} / ${pad2(N)}`}</span>
          </span>
        </span>
      </span>
    </>
  );
}

export default function B51(): JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [still, setStill] = useState(false);
  const [pics, setPics] = useState<Pics | null>(null);
  const [open, setOpen] = useState(-1);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setStill(mq.matches);
    const on = (): void => setStill(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Pictures and thumbnail crops, made once in the browser.
  useEffect(() => {
    if (!mounted) return undefined;
    let gone = false;
    const main = projects.map((p) => projectSource(p));
    setPics({ main, thumbs: projects.map(() => null) });
    projects.forEach((p, i) => {
      thumbsOf(main[i], p.year).then(
        (t) => {
          if (gone) return;
          setPics((prev) => (prev ? { ...prev, thumbs: prev.thumbs.map((x, k) => (k === i ? t : x)) } : prev));
        },
        () => {},
      );
    });
    return () => {
      gone = true;
    };
  }, [mounted]);

  // The stack: scroll position places every card.
  useEffect(() => {
    if (still) return undefined;
    let raf = 0;
    const frame = (): void => {
      raf = 0;
      const track = trackRef.current;
      const stage = stageRef.current;
      if (!track || !stage) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
      const stageH = stage.clientHeight;
      const W = stage.clientWidth;
      const span = Math.max(1, track.offsetHeight - stageH);
      const p = clamp(-track.getBoundingClientRect().top / span, 0, 1) * (N - 1);
      const side = Math.max(1.2 * rem, W * 0.01);
      const inset = W < 640 ? 0.8 * rem : W * 0.023;
      const tab = TAB * rem;
      const drop = stageH - TOP0 * rem + 8;
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const e = i === 0 ? 1 : clamp(p - (i - 1), 0, 1);
        const d = clamp(p - i, 0, N - 1 - i);
        const x = side + d * inset;
        el.style.left = `${x}px`;
        el.style.right = `${x}px`;
        el.style.transform = `translate3d(0, ${(1 - e) * drop - d * tab}px, 0)`;
        const inner = el.querySelector<HTMLElement>("[data-b51-inner]");
        if (inner) inner.style.width = `${W - 2 * side}px`;
        const show = clamp(d * 1.6, 0, 1);
        const label = el.querySelector<HTMLElement>("[data-b51-tab]");
        if (label) label.style.opacity = String(show);
        const face = el.querySelector<HTMLElement>("[data-b51-face]");
        if (face) face.style.opacity = String(1 - show);
      });
    };
    const ask = (): void => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    frame();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => {
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      cancelAnimationFrame(raf);
    };
  }, [still]);

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to the card that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      cardRefs.current[lastOpen.current]?.focus({ preventScroll: true });
      lastOpen.current = -1;
    }
  }, [open]);

  const cardProps = (p: Project, i: number) => ({
    "aria-haspopup": "dialog" as const,
    "aria-label": `${p.title}, ${KIND[p.kind]}, ${p.year}. Open details`,
    onClick: () => setOpen(i),
    ref: (el: HTMLButtonElement | null) => {
      cardRefs.current[i] = el;
    },
    type: "button" as const,
  });

  return (
    <div className="relative w-full" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* The label, right of centre as on snp. */}
      <div className="px-[1.6rem] pb-[4vh] pt-[8vh] md:pl-[57%] md:pr-[4vw]">
        <h2 className={`${HEAD} flex items-center gap-[1rem]`}>
          <span aria-hidden>↙</span> The work
        </h2>
        <p className={`${META} mt-[1.2rem] flex max-w-[34rem] justify-between gap-[2rem] opacity-80`}>
          <span>
            {pad2(N)} projects,
            <br />
            2021 to 2026
          </span>
          <span className="text-right">Click one to open</span>
        </p>
      </div>

      {still ? (
        <ol className="space-y-[1.2rem] px-[1.2rem] md:px-[1vw]">
          {projects.map((p, i) => (
            <li key={p.title}>
              <button
                {...cardProps(p, i)}
                className="b51-card relative block h-[70svh] w-full overflow-hidden text-left md:h-auto md:aspect-[16/7]"
                style={{ backgroundColor: PANEL, border: LINE }}
              >
                <Face i={i} main={pics ? pics.main[i] : null} p={p} thumbs={pics ? pics.thumbs[i] : null} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="relative" ref={trackRef} style={{ height: `calc(100svh + ${(N - 1) * PER * 100}svh)` }}>
          <div className="sticky top-0 h-[100svh] overflow-hidden" ref={stageRef}>
            {projects.map((p, i) => (
              <button
                {...cardProps(p, i)}
                className="b51-card absolute block overflow-hidden text-left"
                key={p.title}
                style={{
                  top: `${TOP0}rem`,
                  bottom: "max(1.2rem, 1vw)",
                  left: "max(1.2rem, 1vw)",
                  right: "max(1.2rem, 1vw)",
                  transform: i === 0 ? undefined : "translate3d(0, 100svh, 0)",
                  zIndex: i + 1,
                  backgroundColor: PANEL,
                  border: LINE,
                  willChange: "transform",
                }}
              >
                <Face i={i} main={pics ? pics.main[i] : null} p={p} thumbs={pics ? pics.thumbs[i] : null} />
                {/* The tab: shows once the card is covered. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 flex items-center justify-center px-[1.6rem]"
                  data-b51-tab
                  style={{ height: `${TAB}rem`, opacity: 0, backgroundColor: "rgba(26, 8, 18, 0.72)", borderBottom: LINE }}
                >
                  <span className="truncate py-[0.2em] font-sans text-[1.3rem] uppercase leading-[1.2] tracking-[0.08em] text-white">
                    <span className="mr-[0.8rem] font-mono text-[1rem] opacity-70">{pad2(i + 1)}</span>
                    {p.title}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Skills and contact, in the same small uppercase. */}
      <div className="grid grid-cols-1 gap-y-[4rem] px-[1.6rem] pb-[8vh] pt-[8vh] md:grid-cols-[57fr_43fr] md:px-[4vw]">
        <section className="md:pr-[4vw]">
          <h2 className={`${HEAD} flex items-center gap-[1rem]`}>
            <span aria-hidden>↙</span> Skills
          </h2>
          <div className="mt-[2.4rem] grid grid-cols-2 gap-x-[2.4rem] gap-y-[2.4rem] pt-[1.6rem] sm:grid-cols-3 lg:grid-cols-5" style={{ borderTop: LINE }}>
            {skillGroups.map((g) => (
              <div className="min-w-0" key={g.label}>
                <h3 className={`${META} text-white`}>{g.label}</h3>
                <ul className="mt-[0.8rem] space-y-[0.3rem]">
                  {g.skills.map((s) => {
                    const icon = skillIcon(s.icon);
                    return (
                      <li className={`${META} flex items-center gap-[0.6rem] opacity-80`} key={s.name}>
                        {icon ? (
                          <svg aria-hidden className="h-[1rem] w-[1rem] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d={icon.path} />
                          </svg>
                        ) : (
                          <span aria-hidden className="block h-[0.4rem] w-[1rem] shrink-0 rounded-full" style={{ backgroundColor: RULE }} />
                        )}
                        <span className="min-w-0">{s.name}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={`${HEAD} flex items-center gap-[1rem]`}>
            <span aria-hidden>↙</span> Contact
          </h2>
          <div className="mt-[2.4rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
            <a className="b51-link break-all font-sans text-[clamp(2rem,1.8vw,3.2rem)] leading-[1.2] text-white" href={`mailto:${EMAIL}`}>
              {EMAIL} ↗
            </a>
            <ul className="mt-[2rem] grid max-w-[40rem] grid-cols-[auto_1fr] gap-x-[3.2rem] gap-y-[0.4rem]">
              {elsewhere.map((l) => (
                <li className="contents" key={l.href}>
                  <span className={`${META} opacity-60`}>{l.label}</span>
                  <a className={`${META} b51-link normal-case`} href={l.href} rel="noreferrer" target="_blank">
                    {l.handle} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {open >= 0 ? <Detail i={open} onClose={close} source={pics ? pics.main[open] : null} /> : null}
    </div>
  );
}
