"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import gsap from "gsap";
import { EMAIL, elsewhere } from "@/components/siteContent";
import { awards, education, experience, projects, skillGroups, type Project, type Skill } from "@/components/profile";
import SkillMark from "@/components/variants/SkillMark";
import VariantShell from "@/components/variants/VariantShell";

/**
 * 12 PRELOADER, after gilhuybrecht.com. No hero: the page opens on a
 * full-screen panel with a percentage on it, and the percentage is real —
 * one unit for the fonts, one for each gallery tile drawn — held to at
 * least 1.2 s so it never flashes past. At 100% the panel slides up and
 * the gallery is the whole page: one block per project, each a row of
 * tiles you scroll sideways. Two blocks render at first; a sentinel under
 * the last one appends the next as you reach it, and the five run twice
 * before the Info, Skills and Contact bands at the bottom.
 *
 * The tiles are canvases. There are no photographs of this work, so the
 * title and each line of the résumé are set large on a muted tone instead,
 * drawn once in the loader and copied into every tile that asks for them.
 */
const GROUND = "#0D0D0F";
const INK = "#FFFFFF";
const META = "rgba(255,255,255,0.45)";
const TONES = ["#1a1a1e", "#1e1a1a", "#1a1e1c", "#1c1a1e", "#1e1c1a"];
const MIN_LOAD_MS = 1200;
/** Each project's block appears this many times before the footer bands. */
const PASSES = 2;
const FIRST_BLOCKS = 2;

type Tile = { kind: "title" } | { kind: "quote"; text: string } | { kind: "stack" };

/** Tile 1 the title, then the tagline and each bullet as a quote, then the stack. */
function tilesOf(p: Project): Tile[] {
  return [{ kind: "title" }, ...[p.tagline, ...p.bullets].map((text) => ({ kind: "quote" as const, text })), { kind: "stack" }];
}

const tileKey = (pi: number, ti: number) => `${pi}-${ti}`;

/**
 * Drawn tiles, by key. A tile's <canvas> attaches here on mount: if the
 * drawing exists it is copied in at once, otherwise the canvas waits and
 * the loader fills it the moment that drawing lands. The same drawing
 * serves both passes of the gallery.
 */
class TileStore {
  private cache = new Map<string, HTMLCanvasElement>();
  private waiting = new Map<string, Set<HTMLCanvasElement>>();

  attach(key: string, el: HTMLCanvasElement) {
    const drawn = this.cache.get(key);
    if (drawn) {
      copy(drawn, el);
      return;
    }
    let set = this.waiting.get(key);
    if (!set) this.waiting.set(key, (set = new Set()));
    set.add(el);
  }

  detach(key: string, el: HTMLCanvasElement) {
    this.waiting.get(key)?.delete(el);
  }

  put(key: string, drawn: HTMLCanvasElement) {
    this.cache.set(key, drawn);
    this.waiting.get(key)?.forEach((el) => copy(drawn, el));
    this.waiting.delete(key);
  }
}

function copy(from: HTMLCanvasElement, to: HTMLCanvasElement) {
  to.width = from.width;
  to.height = from.height;
  to.getContext("2d")?.drawImage(from, 0, 0);
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrinks the type until the text wraps within `maxLines`. */
function fitLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number, size: number, weight: number, family: string) {
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrapWords(ctx, text, maxWidth);
    if (lines.length <= maxLines || size < 8) return { lines, size };
    size *= 0.9;
  }
}

type Fonts = { sans: string; mono: string };

/** One tile's drawing: the title huge, or one line of the résumé as a quote. */
function drawTile(project: Project, tile: Tile, index: number, tone: string, width: number, height: number, fonts: Fonts): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = INK;
  ctx.textBaseline = "alphabetic";
  const pad = width * 0.08;
  const maxWidth = width - pad * 2;

  if (tile.kind === "title") {
    if ("letterSpacing" in ctx) ctx.letterSpacing = "-0.035em";
    const { lines, size } = fitLines(ctx, project.title, maxWidth, 2, height * 0.3, 300, fonts.sans);
    const lineHeight = size * 0.98;
    const top = (height - lineHeight * lines.length) / 2 + size * 0.82;
    lines.forEach((line, i) => ctx.fillText(line, pad, top + i * lineHeight));
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0.14em";
    ctx.fillStyle = META;
    ctx.font = `400 ${height * 0.032}px ${fonts.mono}`;
    ctx.fillText(`${project.year} — ${project.kind}`.toUpperCase(), pad, height - pad * 0.9);
    ctx.textAlign = "right";
    ctx.fillText(String(index + 1).padStart(2, "0"), width - pad, height - pad * 0.9);
  } else if (tile.kind === "quote") {
    if ("letterSpacing" in ctx) ctx.letterSpacing = "-0.01em";
    const { lines, size } = fitLines(ctx, `“${tile.text}”`, maxWidth, 6, height * 0.1, 300, fonts.sans);
    const lineHeight = size * 1.18;
    const top = (height - lineHeight * lines.length) / 2 + size * 0.85;
    lines.forEach((line, i) => ctx.fillText(line, pad, top + i * lineHeight));
  }
  return canvas;
}

/** The skill behind a stack name, or a type mark made from the name. */
function skillFor(name: string): Skill {
  const all = skillGroups.flatMap((g) => g.skills);
  const hit = all.find((s) => s.name === name) ?? all.find((s) => s.name.startsWith(name) || name.startsWith(s.name));
  return hit ?? { name, mark: name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase(), depth: 3 };
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function TileView({ project, tile, n, tone, ckey, store }: { project: Project; tile: Tile; n: number; tone: string; ckey: string; store: TileStore }): JSX.Element {
  // Stable, or React would detach and re-attach (and so clear and redraw)
  // every mounted canvas each time a block is appended.
  const attach = useCallback(
    (el: HTMLCanvasElement | null) => {
      if (!el) return undefined;
      store.attach(ckey, el);
      return () => store.detach(ckey, el);
    },
    [ckey, store],
  );
  return (
    <div className="v12-tile" style={{ backgroundColor: tone }}>
      {tile.kind === "stack" ? (
        <div className="flex h-full flex-col justify-between p-[2.4vw]">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em]" style={{ color: META }}>
            Stack
          </p>
          <ul className="grid grid-cols-4 gap-x-[1vw] gap-y-[1.4vw]">
            {project.stack.map((name) => (
              <li className="flex flex-col items-start gap-[0.6rem]" key={name}>
                <SkillMark size="2.6vw" skill={skillFor(name)} />
                <span className="text-[0.66rem] leading-tight opacity-70">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <canvas
          aria-label={tile.kind === "title" ? project.title : tile.text}
          ref={attach}
          role="img"
        />
      )}
      <span className="v12-mark font-mono tabular-nums">{n}</span>
    </div>
  );
}

/**
 * One project's block: the header row, the sideways gallery, a thin rule
 * under it that tracks how far the row has been scrolled. `show` is when
 * it may appear; the first two wait for the loader, the rest are shown as
 * soon as they mount.
 */
function Block({ project, index, show, delay, store }: { project: Project; index: number; show: boolean; delay: number; store: TileStore }): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const tiles = tilesOf(project);

  useEffect(() => {
    const el = ref.current;
    if (!el || !show) return undefined;
    if (reducedMotion()) {
      gsap.set(el, { autoAlpha: 1 });
      return undefined;
    }
    const tween = gsap.fromTo(el, { autoAlpha: 0, y: "3rem" }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", delay });
    return () => {
      tween.kill();
    };
  }, [show, delay]);

  // The thumb is the visible share of the row, placed where the row is.
  const trackScroll = useCallback(() => {
    const row = rowRef.current;
    const thumb = thumbRef.current;
    if (!row || !thumb || !row.scrollWidth) return;
    thumb.style.width = `${(row.clientWidth / row.scrollWidth) * 100}%`;
    thumb.style.transform = `translateX(${(row.scrollLeft / row.clientWidth) * 100}%)`;
  }, []);
  useEffect(() => {
    trackScroll();
    window.addEventListener("resize", trackScroll);
    return () => window.removeEventListener("resize", trackScroll);
  }, [trackScroll]);

  return (
    <article className="v12-block pt-[3rem]" ref={ref} style={{ opacity: 0 }}>
      <header className="flex flex-wrap items-baseline gap-x-[1.6rem] px-[3vw] pb-[1.2rem] text-[0.7rem] uppercase tracking-[0.16em]">
        <span className="font-mono tabular-nums" style={{ color: META }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2 className="text-[1.05rem] font-normal normal-case tracking-[-0.01em]">{project.title}</h2>
        <span className="tabular-nums" style={{ color: META }}>
          {project.year}
        </span>
        <span style={{ color: META }}>{project.kind}</span>
        {project.award ? <span style={{ color: META }}>{project.award}</span> : null}
        {project.href ? (
          <a className="ml-auto opacity-60 transition-opacity hover:opacity-100" href={project.href} rel="noreferrer" target="_blank">
            Open {"↗"}
          </a>
        ) : null}
      </header>
      <div className="v12-row" onScroll={trackScroll} ref={rowRef}>
        {tiles.map((tile, ti) => (
          <TileView ckey={tileKey(index, ti)} key={ti} n={ti + 1} project={project} store={store} tile={tile} tone={TONES[(index + ti) % TONES.length]} />
        ))}
      </div>
      <div className="mx-[3vw] mt-[1rem] h-[0.1rem]" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
        <span className="block h-full" ref={thumbRef} style={{ backgroundColor: INK, width: "40%" }} />
      </div>
    </article>
  );
}

type LenisLike = { stop(): void; start(): void };

export default function V12(): JSX.Element {
  const store = useMemo(() => new TileStore(), []);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelCountRef = useRef<HTMLSpanElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const stripCountRef = useRef<HTMLSpanElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [rendered, setRendered] = useState(FIRST_BLOCKS);
  // Which project each block shows: the five, in order, PASSES times.
  const order = useMemo(() => Array.from({ length: projects.length * PASSES }, (_, i) => i % projects.length), []);

  // The loader. Units of work: the fonts, then every canvas tile of every
  // project, one per frame so the number is seen to climb. The shown
  // number chases the true one with quickTo and is capped by elapsed time
  // over MIN_LOAD_MS, so it is never ahead of the work and never over in
  // a flash.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const panel = panelRef.current;
    const counters = [panelCountRef.current, stripCountRef.current].filter((el): el is HTMLSpanElement => Boolean(el));
    const reduced = reducedMotion();
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    lenis?.stop();

    const fonts: Fonts = {
      sans: stripRef.current ? getComputedStyle(stripRef.current).fontFamily : "sans-serif",
      mono: panelCountRef.current ? getComputedStyle(panelCountRef.current).fontFamily : "monospace",
    };
    // Drawn at the tile's size on this screen, capped so a 4K screen does
    // not ask for 21 canvases of 2600 px each.
    const width = Math.min(1600, Math.round(window.innerWidth * 0.34 * Math.min(window.devicePixelRatio || 1, 2)));
    const height = Math.round((width * 22) / 34);
    const jobs: (() => void)[] = [];
    projects.forEach((p, pi) =>
      tilesOf(p).forEach((tile, ti) => {
        if (tile.kind === "stack") return;
        jobs.push(() => store.put(tileKey(pi, ti), drawTile(p, tile, pi, TONES[(pi + ti) % TONES.length], width, height, fonts)));
      }),
    );
    const total = 1 + jobs.length;
    let done = 0;
    let finished = false;
    let cancelled = false;
    let raf = 0;
    let revealCall: gsap.core.Tween | null = null;
    const state = { shown: 0 };
    const chase = reduced ? null : gsap.quickTo(state, "shown", { duration: 0.6, ease: "power2.out" });
    const started = performance.now();
    const write = (v: number) => counters.forEach((el) => (el.textContent = `${Math.round(v * 100)}%`));

    const finish = () => {
      if (finished) return;
      finished = true;
      gsap.ticker.remove(tick);
      write(1);
      lenis?.start();
      const reveal = () => setLoaded(true);
      if (reduced || !panel) {
        if (panel) panel.style.display = "none";
        reveal();
        return;
      }
      gsap.to(panel, { yPercent: -100, duration: 0.8, ease: "power3.inOut", onComplete: () => (panel.style.display = "none") });
      // The first block starts rising while the panel is still leaving.
      revealCall = gsap.delayedCall(0.35, reveal);
    };
    const tick = () => {
      const byTime = (performance.now() - started) / MIN_LOAD_MS;
      const v = Math.min(1, state.shown, byTime);
      write(v);
      if (done === total && v >= 0.995) finish();
    };
    gsap.ticker.add(tick);

    const bump = () => {
      done = Math.min(total, done + 1);
      if (chase) chase(done / total);
      else state.shown = done / total;
    };
    const step = () => {
      if (cancelled || finished) return;
      const job = jobs.shift();
      if (!job) return;
      job();
      bump();
      raf = requestAnimationFrame(step);
    };
    // Weight 300 is not on the page until the tiles use it, so ask for it;
    // fonts.ready alone only waits for faces already requested.
    const fontsReady = Promise.all([document.fonts.ready, document.fonts.load(`300 1rem ${fonts.sans}`), document.fonts.load(`400 1rem ${fonts.mono}`)]).catch(() => undefined);
    fontsReady.then(() => {
      if (cancelled || finished) return;
      bump();
      raf = requestAnimationFrame(step);
    });
    // If the fonts never answer, the page must not stay behind the panel.
    const failsafe = window.setTimeout(() => {
      while (jobs.length) jobs.shift()?.();
      done = total;
      state.shown = 1;
      finish();
    }, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
      cancelAnimationFrame(raf);
      gsap.ticker.remove(tick);
      gsap.killTweensOf(state);
      if (panel) gsap.killTweensOf(panel);
      revealCall?.kill();
      lenis?.start();
    };
  }, [store]);

  // The strip sits under the shell's bar. Its offset is the bar's height,
  // measured, since the bar's padding is in rem and its line in text.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    const bar = strip.parentElement?.querySelector<HTMLElement>(":scope > header");
    const place = () => {
      if (!bar) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      strip.style.top = `${bar.offsetHeight / rem}rem`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);

  // Infinite scroll: a sentinel under the last block; reaching it appends
  // the next. The observer is rebuilt after each append, and fires again at
  // once if the sentinel is still in reach, so a tall screen fills itself.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!loaded || !sentinel || rendered >= order.length) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setRendered((r) => Math.min(order.length, r + 1));
      },
      { rootMargin: "0px 0px 60% 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [loaded, rendered, order.length]);

  return (
    <VariantShell accent={INK} ground={GROUND} ink={INK} n={12}>
      <style>{`
        .v12-row { display: flex; gap: 1vw; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; padding: 0.6rem 3vw 0; }
        .v12-row::-webkit-scrollbar { display: none; }
        .v12-tile { position: relative; flex: 0 0 auto; width: 34vw; height: 22vw; overflow: hidden; scroll-snap-align: start; scroll-margin-left: 3vw; transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1); }
        .v12-tile:hover { transform: translateY(-0.4rem); }
        .v12-tile canvas { display: block; width: 100%; height: 100%; }
        .v12-mark { position: absolute; left: 1rem; top: 1rem; display: flex; width: 1.9rem; height: 1.9rem; align-items: center; justify-content: center; border: 0.06rem solid ${META}; border-radius: 50%; font-size: 0.7rem; line-height: 1; color: ${INK}; transition: background-color 0.3s, color 0.3s, border-color 0.3s; }
        .v12-tile:hover .v12-mark { background: ${INK}; color: ${GROUND}; border-color: ${INK}; }
        @media (prefers-reduced-motion: reduce) {
          .v12-tile, .v12-mark { transition: none; }
          .v12-tile:hover { transform: none; }
        }
      `}</style>

      <div className="fixed inset-0 z-[60] flex items-center justify-center" ref={panelRef} style={{ backgroundColor: GROUND }}>
        <span className="font-mono text-[8vw] font-light tabular-nums leading-none tracking-[-0.04em]" ref={panelCountRef}>
          0%
        </span>
      </div>

      <div className="sticky z-30 grid grid-cols-3 items-baseline border-b px-[3vw] py-[0.9rem] text-[0.7rem] uppercase tracking-[0.16em]" ref={stripRef} style={{ backgroundColor: GROUND, borderColor: "rgba(255,255,255,0.1)", top: 0 }}>
        <h1 className="text-[0.7rem] font-normal">Kevin He — engineer, Toronto</h1>
        <span className="text-center font-mono tabular-nums" ref={stripCountRef}>
          0%
        </span>
        <nav className="flex justify-end gap-[1.4rem]" style={{ color: META }}>
          <a className="transition-colors hover:text-white" href="#info">
            Info
          </a>
          <a className="transition-colors hover:text-white" href="#skills">
            Skills
          </a>
        </nav>
      </div>

      <section className="pb-[4rem]" id="work">
        {order.slice(0, rendered).map((pi, i) => (
          <Block delay={i < FIRST_BLOCKS ? i * 0.15 : 0} index={pi} key={`${Math.floor(i / projects.length)}-${pi}`} project={projects[pi]} show={i < FIRST_BLOCKS ? loaded : true} store={store} />
        ))}
        <div aria-hidden="true" ref={sentinelRef} />
      </section>

      <div className="grid grid-cols-2 gap-x-[4vw] border-t px-[3vw] py-[4rem] text-[0.78rem] leading-[1.5]" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
        <section id="info">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.16em]" style={{ color: META }}>
            Info
          </h2>
          <div className="mt-[1.4rem] space-y-[1.4rem]" data-reveal>
            {experience.map((e) => (
              <div className="grid grid-cols-[9rem_1fr] gap-x-[1.5rem]" key={e.org}>
                <span className="tabular-nums" style={{ color: META }}>
                  {e.when}
                </span>
                <div>
                  <p>
                    {e.org} <span style={{ color: META }}>{"·"} {e.role}, {e.where}</span>
                  </p>
                  <ul className="mt-[0.3rem] space-y-[0.15rem] opacity-70">
                    {e.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[9rem_1fr] gap-x-[1.5rem]">
              <span className="tabular-nums" style={{ color: META }}>
                {education.when}
              </span>
              <p>
                {education.school} <span style={{ color: META }}>{"·"} {education.degree}</span>
              </p>
            </div>
            <div className="grid grid-cols-[9rem_1fr] gap-x-[1.5rem]">
              <span style={{ color: META }}>Selected</span>
              <ul className="space-y-[0.15rem]">
                {awards.map((a) => (
                  <li key={a.title}>
                    {a.title} <span className="tabular-nums" style={{ color: META }}>{a.year}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
        <section id="skills">
          <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.16em]" style={{ color: META }}>
            Skills
          </h2>
          <div className="mt-[1.4rem] space-y-[1.2rem]" data-reveal>
            {skillGroups.map((g) => (
              <div key={g.label}>
                <p style={{ color: META }}>{g.label}</p>
                <ul className="mt-[0.4rem] flex flex-wrap gap-x-[1.2rem] gap-y-[0.4rem]">
                  {g.skills.map((s) => (
                    <li className="inline-flex items-center gap-[0.45rem]" key={s.name}>
                      <SkillMark size="0.95rem" skill={s} />
                      {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="border-t px-[3vw] pb-[8vh] pt-[4rem]" id="contact" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.16em]" style={{ color: META }}>
          Contact
        </h2>
        <a className="mt-[1.4rem] block text-[4vw] font-light leading-none tracking-[-0.04em]" data-reveal href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <div className="mt-[1.6rem] flex gap-[1.6rem] text-[0.7rem] uppercase tracking-[0.16em]" data-reveal style={{ color: META }}>
          {elsewhere.map((l) => (
            <a className="transition-colors hover:text-white" href={l.href} key={l.label} rel="noreferrer" target="_blank">
              {l.label} {"↗"}
            </a>
          ))}
        </div>
      </section>
    </VariantShell>
  );
}
