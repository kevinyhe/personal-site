"use client";

import { type CSSProperties, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { BAND, BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource } from "@/components/below/barPicture";
import { type Project, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import { letterPlate, loopRow, type Row, wordRow } from "./plates";

/**
 * Design 34, Letters. After wodniack.dev's work section.
 *
 * Work, one screen: behind everything, the word WORK as four rows of huge
 * heavy letters (a row of W, a row of O, of R, of K), drawn as blossom
 * bars. The rows slide sideways slowly, each the opposite way to the one
 * above. Each row is drawn once; only its canvas moves (a CSS animation).
 * Over the wall, on the left, the five project titles as a plain list.
 * Pointing at a title shows that project's picture, in bars, on a card
 * that follows the cursor, and dims the wall. Clicking a title opens the
 * project over the page; Esc or the close button shuts it.
 *
 * Skills, the second screen: the word SKILLS as one row of bar letters,
 * the five groups in columns under it, then the email and the links.
 *
 * Under reduced motion the rows stand still and the card sits on the
 * cursor instead of easing after it.
 */

const SCREEN = "var(--arbor-screen-h)";
const CELL = 7;
const WORD = "WORK";
const LABEL = "font-mono text-[1.3rem] uppercase tracking-[0.2em]";
const pad2 = (n: number): string => String(n).padStart(2, "0");
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
const KIND: Record<Project["kind"], string> = {
  company: "Company",
  hackathon: "Hackathon",
  library: "Library",
  bot: "Bot",
};

// The rows slide by exactly one letter slot (--b34-slot) and start over.
const CSS = `
@keyframes b34-drift { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(calc(var(--b34-slot) * -1), 0, 0); } }
.b34-track { animation: b34-drift var(--b34-time) linear infinite; will-change: transform; }
.b34-track[data-dir="right"] { animation-direction: reverse; }
.b34-wall { transition: opacity 0.5s ease; }
.b34-wall[data-dim="true"] { opacity: 0.35; }
.b34-card { transition: opacity 0.25s ease; }
.b34-title { transition: color 0.3s ease, transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1); }
.b34-list[data-hover="true"] .b34-title:not([data-on="true"]) { color: rgba(255, 255, 255, 0.45); }
.b34-title[data-on="true"] { transform: translateX(1.2rem); }
@media (prefers-reduced-motion: reduce) {
  .b34-track { animation: none; }
  .b34-wall, .b34-card, .b34-title { transition: none; }
  .b34-title[data-on="true"] { transform: none; }
}
`;

type Plate = { row: Row; canvas: HTMLCanvasElement };

/** The font family a `font-sans` element resolves to, for canvas text. */
function sansFamily(el: HTMLElement | null): string {
  return el ? getComputedStyle(el).fontFamily : "sans-serif";
}

function Detail({ p, source, onClose }: { p: Project; source: BarSource | null; onClose: () => void }): JSX.Element {
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

  const links = [
    p.href ? { href: p.href, text: hostOf(p.href) } : null,
    p.code ? { href: p.code, text: "Source" } : null,
  ].filter((l): l is { href: string; text: string } => l !== null);

  return (
    <div
      aria-label={p.title}
      aria-modal="true"
      className="fixed inset-0 z-[80] overflow-y-auto"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div
        className="mx-auto grid min-h-full max-w-[160rem] items-center gap-x-[4vw] gap-y-[3.2rem] px-[1.6rem] py-[8rem] md:grid-cols-[1.1fr_1fr] md:px-[5vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[4/3] w-full">
          {source ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" fit="contain" source={source} /> : null}
        </div>
        <div className="min-w-0">
          <p className={`${LABEL} opacity-70`}>
            {p.year} · {KIND[p.kind]}
          </p>
          <h3 className="mt-[1.2rem] font-sans text-[clamp(3.6rem,5vw,7.2rem)] font-bold leading-[1] tracking-[-0.03em] text-white">
            {p.title}
          </h3>
          <p className="mt-[2rem] font-sans text-[2rem] font-light leading-[1.4] text-white md:text-[2.2rem]">{p.tagline}</p>
          <ul className="mt-[2.4rem] space-y-[1rem]">
            {p.bullets.map((b) => (
              <li className="flex gap-[1.2rem] font-sans text-[1.6rem] font-light leading-[1.5]" key={b}>
                <span aria-hidden className="mt-[0.9rem] h-[0.5rem] w-[0.5rem] shrink-0" style={{ backgroundColor: BLOSSOM }} />
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-[2.4rem] font-mono text-[1.3rem] leading-[1.6] text-white">{p.stack.join(" / ")}</p>
          {p.award ? <p className="mt-[0.6rem] font-mono text-[1.3rem] leading-[1.6] opacity-80">{p.award}</p> : null}
          {links.length ? (
            <p className="mt-[2rem] flex flex-wrap gap-x-[2.4rem] gap-y-[0.8rem] font-mono text-[1.4rem] leading-[1.6]">
              {links.map((l) => (
                <a className="text-white underline underline-offset-[0.35em]" href={l.href} key={l.href} rel="noreferrer" target="_blank">
                  {l.text} ↗
                </a>
              ))}
            </p>
          ) : null}
        </div>
      </div>
      <button
        className={`fixed right-[1.6rem] top-[1.6rem] cursor-pointer px-[1.2rem] py-[0.8rem] md:right-[3vw] md:top-[3vh] ${LABEL} text-white`}
        onClick={onClose}
        ref={closeRef}
        style={{ border: `0.1rem solid ${BLOSSOM}` }}
        type="button"
      >
        Close ×
      </button>
    </div>
  );
}

export default function B34(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const skillsWordRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [workPlates, setWorkPlates] = useState<Plate[]>([]);
  const [skillPlate, setSkillPlate] = useState<Plate | null>(null);
  const [sources, setSources] = useState<BarSource[] | null>(null);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);

  // Project pictures: made once, in the browser.
  useEffect(() => {
    setSources(projects.map((p) => projectSource(p)));
  }, []);

  // Letter plates: drawn once the fonts are in, and again when the width changes.
  useEffect(() => {
    let gone = false;
    let lastW = -1;
    let timer = 0;
    const build = (): void => {
      const wall = wallRef.current;
      const word = skillsWordRef.current;
      if (gone || !wall || !word) return;
      const w = wall.clientWidth;
      if (w === lastW) return;
      lastW = w;
      const family = sansFamily(rootRef.current);
      const rowH = (wall.firstElementChild as HTMLElement | null)?.clientHeight ?? wall.clientHeight / WORD.length;
      setWorkPlates(
        WORD.split("").map((ch) => {
          const row = loopRow(w, rowH, CELL);
          return { row, canvas: letterPlate(ch, row, CELL, family) };
        }),
      );
      const srow = wordRow(word.clientWidth, word.clientHeight, CELL, 6);
      setSkillPlate({ row: srow, canvas: letterPlate("SKILLS", srow, CELL, family) });
    };
    const onResize = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, 200);
    };
    document.fonts.ready.then(build, build);
    window.addEventListener("resize", onResize);
    return () => {
      gone = true;
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // The card: eases after the cursor (or sits on it under reduced motion).
  const target = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const placed = useRef(false);
  const frame = useRef(0);
  const place = useCallback((): void => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
  }, []);
  const aim = useCallback(
    (cx: number, cy: number): void => {
      const el = cardRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // Right of the cursor and centred on it, kept inside the window.
      const x = Math.min(Math.max(cx + 32, 8), window.innerWidth - w - 8);
      const y = Math.min(Math.max(cy - h / 2, 8), window.innerHeight - h - 8);
      target.current = { x, y };
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!placed.current || still) {
        pos.current = { x, y };
        placed.current = true;
        place();
        return;
      }
      if (frame.current) return;
      const step = (): void => {
        const p = pos.current;
        const t = target.current;
        p.x += (t.x - p.x) * 0.14;
        p.y += (t.y - p.y) * 0.14;
        place();
        if (Math.abs(t.x - p.x) + Math.abs(t.y - p.y) > 0.5) frame.current = requestAnimationFrame(step);
        else frame.current = 0;
      };
      frame.current = requestAnimationFrame(step);
    },
    [place],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    if (hover < 0) placed.current = false;
  }, [hover]);

  const closeDetail = useCallback(() => setOpen(-1), []);
  const shown = hover >= 0 ? hover : -1;

  return (
    <div className="relative w-full font-sans" ref={rootRef} style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <section className="relative" id="work" onPointerMove={(e) => (hover >= 0 ? aim(e.clientX, e.clientY) : undefined)} style={{ height: SCREEN, minHeight: "56rem" }}>
        {/* The wall: WORK, a letter per row, as bars. */}
        <div aria-hidden className="b34-wall pointer-events-none absolute inset-0 flex flex-col justify-between py-[1.4rem]" data-dim={hover >= 0} ref={wallRef}>
          {WORD.split("").map((ch, i) => {
            const plate = workPlates[i];
            return (
              <div className="relative flex-1 overflow-hidden" key={ch}>
                {plate ? (
                  <div
                    className="b34-track absolute left-0"
                    data-dir={i % 2 ? "right" : "left"}
                    style={
                      {
                        width: plate.row.slot * plate.row.count,
                        height: plate.row.height,
                        marginTop: -plate.row.height / 2,
                        top: "50%",
                        "--b34-slot": `${plate.row.slot}px`,
                        "--b34-time": `${16 + i * 3}s`,
                      } as CSSProperties
                    }
                  >
                    <BarPicture black={0.35} cell={CELL} fit="cover" source={plate.canvas} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="absolute inset-x-[1.6rem] top-[2.4rem] flex items-baseline justify-between md:inset-x-[3vw]">
          <h2 className={`${LABEL} px-[0.8rem] py-[0.4rem] text-white`} style={{ backgroundColor: BAND }}>
            Work
          </h2>
          <p className={`${LABEL} hidden px-[0.8rem] py-[0.4rem] md:block`} style={{ backgroundColor: BAND }}>
            {pad2(projects.length)} projects · click to open
          </p>
        </div>

        {/* The list, on a plum panel so the titles stay readable over the wall. */}
        <div className="absolute inset-x-[1.6rem] top-1/2 -translate-y-1/2 md:left-[3vw] md:right-auto md:w-[min(46rem,36vw)]">
          <ol className="b34-list px-[2rem] py-[1.6rem] md:px-[2.4rem]" data-hover={hover >= 0} style={{ backgroundColor: "rgba(42, 13, 30, 0.88)" }}>
            {projects.map((p, i) => (
              <li key={p.title} style={{ borderTop: i ? "0.1rem solid rgba(249, 185, 220, 0.25)" : undefined }}>
                <button
                  className="b34-title flex w-full cursor-pointer items-baseline justify-between gap-[1.6rem] py-[1.3rem] text-left text-white"
                  data-on={hover === i}
                  onBlur={() => setHover((h) => (h === i ? -1 : h))}
                  onClick={() => setOpen(i)}
                  onFocus={(e) => {
                    setHover(i);
                    const r = e.currentTarget.getBoundingClientRect();
                    requestAnimationFrame(() => aim(r.right, r.top + r.height / 2));
                  }}
                  onPointerEnter={(e) => {
                    setHover(i);
                    const { clientX, clientY } = e;
                    requestAnimationFrame(() => aim(clientX, clientY));
                  }}
                  onPointerLeave={() => setHover((h) => (h === i ? -1 : h))}
                  type="button"
                >
                  <span className="min-w-0 font-sans text-[clamp(2.4rem,2.6vw,4.4rem)] font-semibold leading-[1.05] tracking-[-0.02em]">{p.title}</span>
                  <span className="shrink-0 text-right font-mono text-[1.2rem] uppercase leading-[1.4] tracking-[0.14em]" style={{ color: BLOSSOM }}>
                    {p.year}
                    <br />
                    {KIND[p.kind]}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The card that follows the cursor: all five pictures drawn once, one shown. */}
      <div
        aria-hidden
        className="b34-card pointer-events-none fixed left-0 top-0 z-[60] aspect-[4/3] w-[max(26vw,24rem)]"
        ref={cardRef}
        style={{ opacity: shown >= 0 && open < 0 ? 1 : 0, backgroundColor: BAND, outline: `0.1rem solid ${BLOSSOM}` }}
      >
        {sources?.map((s, i) => (
          <div className="absolute inset-0" key={projects[i].title} style={{ visibility: shown === i ? "visible" : "hidden" }}>
            <BarPicture cell={6} fit="cover" source={s} />
          </div>
        ))}
        {shown >= 0 ? (
          <p className="absolute bottom-0 left-0 px-[1rem] py-[0.6rem] font-mono text-[1.1rem] uppercase tracking-[0.16em] text-white" style={{ backgroundColor: BAND }}>
            {pad2(shown + 1)} · {projects[shown].title}
          </p>
        ) : null}
      </div>

      <section className="relative px-[1.6rem] pb-[6vh] pt-[6vh] md:px-[3vw]" id="skills">
        <h2 className={`${LABEL} text-white`}>Skills</h2>
        {/* SKILLS, one row of bar letters. */}
        <div aria-hidden className="relative mt-[2vh] h-[30vh] min-h-[14rem] w-full" ref={skillsWordRef}>
          {skillPlate ? (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: skillPlate.row.slot * skillPlate.row.count, height: skillPlate.row.height }}>
              <BarPicture black={0.35} cell={CELL} fit="cover" source={skillPlate.canvas} />
            </div>
          ) : null}
        </div>

        <div className="mt-[5vh] grid grid-cols-1 gap-x-[2.4vw] gap-y-[3.2rem] sm:grid-cols-2 lg:grid-cols-5">
          {skillGroups.map((g, i) => (
            <div className="min-w-0" key={g.label} style={{ borderTop: `0.1rem solid ${BLOSSOM}` }}>
              <h3 className="flex items-baseline gap-[1rem] pt-[1.2rem] font-sans text-[1.8rem] font-semibold leading-[1.2] text-white">
                <span className="font-mono text-[1.2rem] font-normal" style={{ color: BLOSSOM }}>
                  {pad2(i + 1)}
                </span>
                {g.label}
              </h3>
              <ul className="mt-[1.2rem] font-sans text-[1.5rem] font-light leading-[1.6]">
                {g.skills.map((s) => (
                  <li key={s.name}>{s.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <footer className="mt-[8vh] flex flex-col gap-[3.2rem] pt-[2.4rem] md:flex-row md:items-end md:justify-between" style={{ borderTop: `0.1rem solid ${BLOSSOM}` }}>
          <div className="min-w-0">
            <p className={`${LABEL} opacity-70`}>Write to me</p>
            <a
              className="mt-[1rem] block break-all font-sans text-[clamp(2.4rem,3.6vw,5.6rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white underline-offset-[0.2em] hover:underline"
              href={`mailto:${EMAIL}`}
            >
              {EMAIL}
            </a>
          </div>
          <ul className="flex flex-wrap gap-x-[3.2rem] gap-y-[1.6rem] font-mono text-[1.4rem]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className="group block" href={l.href} rel="noreferrer" target="_blank">
                  <span className="block text-[1.1rem] uppercase tracking-[0.2em] opacity-60">{l.label}</span>
                  <span className="mt-[0.4rem] block leading-[1.4] text-white group-hover:underline">{l.handle} ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </section>

      {open >= 0 ? <Detail onClose={closeDetail} p={projects[open]} source={sources?.[open] ?? null} /> : null}
    </div>
  );
}
