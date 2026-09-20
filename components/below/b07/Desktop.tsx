"use client";

import {
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { projects } from "@/components/profile";
import { ContactLinks, pad2, ProjectFacts, SkillGroups } from "./content";
import styles from "./desk.module.css";

/**
 * The desktop on the television's screen. Real page elements, so the text
 * is sharp and the links are links.
 *
 * Three icons open three windows: Work, Skills, Contact. A project chosen
 * in Work opens in a window of its own. Windows are moved by their title
 * bars, with the pointer or with the arrow keys, and closed with the
 * cross or with Escape.
 *
 * Places are kept in rem, from the top left of the part of the picture
 * that is in view, so a window keeps its place when the page is resized.
 */

export type DeskControls = {
  /** "work", "skills", "contact", or "p0" to "p4" for a project. */
  open(name: string, takeFocus?: boolean): void;
  close(name: string): void;
  /** What is open, back to front. */
  state(): { open: string[]; front: string | null };
};

type Win = { id: string; x: number; y: number; z: number };

const BAR_H = 5.2;
const TITLES: Record<string, string> = { work: "Work", skills: "Skills", contact: "Contact" };
const WIDTHS: Record<string, number> = { work: 60, skills: 138, contact: 72, project: 92 };

const isProject = (id: string): boolean => /^p[0-4]$/.test(id);
const projectOf = (id: string): number => Number(id.slice(1));
const titleOf = (id: string): string => (isProject(id) ? projects[projectOf(id)].title : (TITLES[id] ?? id));
const widthOf = (id: string): number => (isProject(id) ? WIDTHS.project : (WIDTHS[id] ?? 60));

/** Where a window opens. */
function homeOf(id: string): { x: number; y: number } {
  if (id === "work") return { x: 20, y: 10 };
  if (id === "skills") return { x: 72, y: 30 };
  if (id === "contact") return { x: 150, y: 72 };
  const n = projectOf(id);
  return { x: 86 + n * 3.5, y: 9 + n * 3.5 };
}

/** "work", "Work", "p2", "2" and a project's title all name a window. */
function idOf(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (n in TITLES || isProject(n)) return n;
  if (/^[0-4]$/.test(n)) return `p${n}`;
  const found = projects.findIndex((p) => p.title.toLowerCase() === n);
  return found >= 0 ? `p${found}` : null;
}

function Glyph({ name }: { name: string }): JSX.Element {
  // Drawn here, square ends, one weight. Not from an icon set.
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinejoin: "miter" as const };
  return (
    <svg aria-hidden viewBox="0 0 48 48">
      <rect fill="#f9b9dc" height="40" stroke="#1a0812" strokeWidth="2.2" width="40" x="4" y="4" />
      {name === "work" ? (
        <g {...common}>
          <path d="M10 17h10l3 4h15v15H10z" />
          <path d="M10 25h28" />
        </g>
      ) : null}
      {name === "skills" ? (
        <g {...common}>
          <rect height="16" width="16" x="16" y="16" />
          <path d="M20 16v-6M28 16v-6M20 38v-6M28 38v-6M16 20h-6M16 28h-6M38 20h-6M38 28h-6" />
        </g>
      ) : null}
      {name === "contact" ? (
        <g {...common}>
          <rect height="20" width="28" x="10" y="14" />
          <path d="M10 14l14 12 14-12" />
        </g>
      ) : null}
    </svg>
  );
}

export default function Desktop({ controls }: { controls: RefObject<DeskControls | null> }): JSX.Element {
  const [wins, setWins] = useState<Win[]>([]);
  const winsRef = useRef<Win[]>([]);
  const areaRef = useRef<HTMLDivElement>(null);
  const top = useRef(10);
  /** The window to put the keyboard in once it has been drawn. */
  const focusNext = useRef<string | null>(null);
  /** What to put the keyboard back on when a window closes. */
  const returnTo = useRef<string | null>(null);

  useEffect(() => {
    winsRef.current = wins;
    const area = areaRef.current;
    if (!area) return;
    if (focusNext.current) {
      area.querySelector<HTMLElement>(`[data-win="${focusNext.current}"]`)?.focus({ preventScroll: true });
      focusNext.current = null;
    } else if (returnTo.current) {
      const back =
        area.querySelector<HTMLElement>(`[data-opens="${returnTo.current}"]`) ?? area.querySelector<HTMLElement>('[data-opens="work"]');
      back?.focus({ preventScroll: true });
      returnTo.current = null;
    }
  }, [wins]);

  /** The size of the part in view, in rem. */
  const room = useCallback((): { w: number; h: number; rem: number } => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 8;
    const area = areaRef.current;
    return { w: (area?.clientWidth ?? 1920) / rem, h: (area?.clientHeight ?? 1038) / rem, rem };
  }, []);

  const fit = useCallback(
    (id: string, x: number, y: number): { x: number; y: number } => {
      const { w, h } = room();
      const width = Math.min(widthOf(id), w - 4);
      return {
        // Some of the bar stays in view whatever happens, or the window
        // could not be brought back.
        x: Math.min(Math.max(x, 12 - width), w - 12),
        y: Math.min(Math.max(y, BAR_H), h - 6),
      };
    },
    [room],
  );

  const open = useCallback(
    (name: string, takeFocus = true): void => {
      const id = idOf(name);
      if (!id) return;
      top.current += 1;
      const z = top.current;
      if (takeFocus) focusNext.current = id;
      setWins((now) => {
        if (now.some((w) => w.id === id)) return now.map((w) => (w.id === id ? { ...w, z } : w));
        const home = homeOf(id);
        const { w } = room();
        // Keep the whole window in view where the view is wide enough.
        const x = Math.max(2, Math.min(home.x, w - Math.min(widthOf(id), w - 4) - 2));
        return [...now, { id, ...fit(id, x, home.y), z }];
      });
    },
    [fit, room],
  );

  const close = useCallback((name: string, fromKeyboard = false): void => {
    const id = idOf(name);
    if (!id) return;
    if (fromKeyboard) returnTo.current = id;
    setWins((now) => now.filter((w) => w.id !== id));
  }, []);

  const raise = useCallback((id: string): void => {
    setWins((now) => {
      const front = now.reduce((m, w) => Math.max(m, w.z), 0);
      const mine = now.find((w) => w.id === id);
      if (!mine || mine.z === front) return now;
      top.current += 1;
      const z = top.current;
      return now.map((w) => (w.id === id ? { ...w, z } : w));
    });
  }, []);

  useEffect(() => {
    controls.current = {
      open,
      close: (name) => close(name),
      state: () => {
        const sorted = [...winsRef.current].sort((a, b) => a.z - b.z);
        return { open: sorted.map((w) => w.id), front: sorted.length ? sorted[sorted.length - 1].id : null };
      },
    };
    return () => {
      controls.current = null;
    };
  }, [close, controls, open]);

  // ------------------------------------------------------------ moving
  const drag = useRef<{ id: string; el: HTMLElement; px: number; py: number; x0: number; y0: number; x: number; y: number; per: number } | null>(null);

  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>, win: Win): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const el = e.currentTarget.parentElement;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // The picture is drawn through the camera. Seated it is at its own
    // size, but measure: how many pixels of the window one rem covers.
    const drawn = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
    drag.current = { id: win.id, el, px: e.clientX, py: e.clientY, x0: win.x, y0: win.y, x: win.x, y: win.y, per: room().rem * drawn };
    raise(win.id);
  };
  const onBarMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    const to = fit(d.id, d.x0 + (e.clientX - d.px) / d.per, d.y0 + (e.clientY - d.py) / d.per);
    d.x = to.x;
    d.y = to.y;
    // Straight to the element: a render for every pointer move is wasted.
    d.el.style.left = `${to.x}rem`;
    d.el.style.top = `${to.y}rem`;
  };
  const onBarUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setWins((now) => now.map((w) => (w.id === d.id ? { ...w, x: d.x, y: d.y } : w)));
  };
  const onBarKey = (e: ReactKeyboardEvent<HTMLDivElement>, win: Win): void => {
    const step = e.shiftKey ? 8 : 2;
    const by: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = by[e.key];
    if (!move) return;
    // The arrow keys move the window and not the page while the bar has
    // the keyboard. Tab leaves it.
    e.preventDefault();
    setWins((now) => now.map((w) => (w.id === win.id ? { ...w, ...fit(w.id, w.x + move[0], w.y + move[1]) } : w)));
  };

  const isOpen = (id: string): boolean => wins.some((w) => w.id === id);

  return (
    <div className={`${styles.screen} font-mono`} data-desktop>
      <div className={styles.safe} data-safe ref={areaRef}>
        <header className="absolute inset-x-0 top-0 flex h-[4.4rem] items-center justify-between bg-[#f9b9dc] pl-[2rem] text-[1.5rem] uppercase tracking-[0.14em] text-[#1a0812]">
          <p>
            <span className="font-bold">Kevin He</span>
            <span aria-hidden className="mx-[1.2rem] opacity-50">
              /
            </span>
            <span>Desk</span>
          </p>
          <nav aria-label="Windows" className="flex h-full">
            {Object.keys(TITLES).map((id) => (
              <button aria-expanded={isOpen(id)} className={`${styles.menu} uppercase tracking-[0.14em]`} key={id} onClick={() => open(id)} type="button">
                {TITLES[id]}
              </button>
            ))}
          </nav>
        </header>

        <ul className="absolute left-[3rem] top-[8rem] space-y-[1.6rem] text-[1.4rem] uppercase tracking-[0.12em]">
          {Object.keys(TITLES).map((id) => (
            <li key={id}>
              <button aria-expanded={isOpen(id)} className={styles.icon} data-opens={id} onClick={() => open(id)} type="button">
                <Glyph name={id} />
                <span className={styles.iconName}>{TITLES[id]}</span>
              </button>
            </li>
          ))}
        </ul>

        {wins.map((win) => (
          <section
            aria-label={titleOf(win.id)}
            className={styles.window}
            data-win={win.id}
            key={win.id}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              close(win.id, true);
            }}
            onPointerDown={() => raise(win.id)}
            role="dialog"
            style={{ left: `${win.x}rem`, top: `${win.y}rem`, zIndex: win.z, width: `${widthOf(win.id)}rem` }}
            tabIndex={-1}
          >
            <div className={styles.bar} onPointerCancel={onBarUp} onPointerDown={(e) => onBarDown(e, win)} onPointerMove={onBarMove} onPointerUp={onBarUp}>
              {isProject(win.id) ? (
                <h3 className="shrink-0 font-mono text-[1.5rem] font-bold uppercase tracking-[0.12em]">{titleOf(win.id)}</h3>
              ) : (
                <h2 className="shrink-0 font-mono text-[1.5rem] font-bold uppercase tracking-[0.12em]">{titleOf(win.id)}</h2>
              )}
              {/* The grip is what the keyboard holds to move the window. */}
              <div
                aria-label={`Move the ${titleOf(win.id)} window with the arrow keys`}
                aria-roledescription="handle"
                className={styles.grip}
                onKeyDown={(e) => onBarKey(e, win)}
                role="button"
                tabIndex={0}
              />
              <button aria-label={`Close ${titleOf(win.id)}`} className={styles.close} onClick={() => close(win.id, true)} type="button" />
            </div>

            <div className="p-[2rem]">
              {win.id === "work" ? (
                <ol className="-m-[0.6rem] text-[1.6rem]">
                  {projects.map((p, i) => (
                    <li key={p.title}>
                      <button aria-expanded={isOpen(`p${i}`)} className={styles.row} data-opens={`p${i}`} onClick={() => open(`p${i}`)} type="button">
                        <span className="opacity-70">{pad2(i + 1)}</span>
                        <span className="font-bold">{p.title}</span>
                        <span className="opacity-70">{p.year}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
              {win.id === "skills" ? <SkillGroups /> : null}
              {win.id === "contact" ? <ContactLinks /> : null}
              {isProject(win.id) ? <ProjectFacts bullets project={projects[projectOf(win.id)]} /> : null}
            </div>
          </section>
        ))}

        <div aria-hidden className={`${styles.fx} ${styles.cornersSlight}`} style={{ zIndex: 100000 }} />
      </div>

      <div aria-hidden className={`${styles.fx} ${styles.corners}`} />
      <div aria-hidden className={`${styles.fx} ${styles.lines}`} />
      <div aria-hidden className={`${styles.fx} ${styles.sheen}`} />
      <div aria-hidden className={`${styles.fx} ${styles.flicker}`} />
    </div>
  );
}
