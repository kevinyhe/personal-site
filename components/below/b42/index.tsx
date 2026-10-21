"use client";

import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { BLOSSOM, PLUM_WASH } from "@/components/bandColours";
import BarPicture, { type BarSource, projectSource, textPlate } from "@/components/below/barPicture";
import { awards, education, experience, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";

/**
 * Design 42, Runs (after gilhuybrecht.com). One dense screen in small
 * medium-weight sans. Across the top, one row of short text columns: the
 * name, what Kevin does now, Skills (the five group labels, indented),
 * Recognition (each award with its year, indented), Links, Email me.
 *
 * Then the work. Each project is one run of 3 to 5 small pictures in a
 * grid of equal columns, numbered 1..n at their top right, the project's
 * name at the top left of its first picture. Runs follow each other and
 * wrap across the rows, as on the reference. The pictures are drawn as
 * vertical bars: the project's picture whole, zoomed in, cropped, and
 * type cards of its year, award and first stack word. Pointing at a run
 * brightens it and dims the others; clicking any picture of a run opens
 * that project over the page (Esc or Close shuts it). A tiny footer row
 * of links ends it.
 *
 * The bar pictures draw on 2D canvases made in the browser only (crops
 * need the image loaded), so the server render has empty boxes. Under
 * reduced motion the dimming and the detail snap instead of fading.
 */

const RULE = "rgba(249, 185, 220, 0.25)";
const LINE = `0.1rem solid ${RULE}`;
const BOX = "rgba(42, 13, 30, 0.55)";
const TEXT = "font-sans text-[clamp(1.3rem,0.95vw,1.9rem)] font-medium leading-[1.2] tracking-[-0.01em]";
const hostOf = (href: string): string => href.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** Crop rectangles as shares of the picture: x, y, width, height. */
type Rect = [number, number, number, number];
type Frame = { kind: "crop"; rect: Rect; aspect: string } | { kind: "plate"; text: string; aspect: string };

const FULL: Rect = [0, 0, 1, 1];
const ZOOM: Rect = [0.3, 0.25, 0.4, 0.5];
const SIDE: Rect = [0, 0.3, 0.55, 0.7];

/** The pictures in one project's run. Five for the lead, four for the rest, three for Saturn. */
function framesOf(i: number): Frame[] {
  const p = projects[i];
  const word = p.award ? p.award.split(",")[0] : p.stack[0];
  if (!p.image) {
    return [
      { kind: "crop", rect: FULL, aspect: "16 / 10" },
      { kind: "plate", text: p.year, aspect: "4 / 3" },
      { kind: "plate", text: p.stack[1] ?? p.stack[0], aspect: "1 / 1" },
    ];
  }
  const run: Frame[] = [
    { kind: "crop", rect: FULL, aspect: "16 / 10" },
    { kind: "crop", rect: ZOOM, aspect: "1 / 1" },
    { kind: "plate", text: word, aspect: "4 / 3" },
  ];
  if (i === 0) run.push({ kind: "crop", rect: SIDE, aspect: "5 / 4" });
  run.push({ kind: "plate", text: p.year, aspect: "3 / 2" });
  return run;
}

const RUNS: Frame[][] = projects.map((_, i) => framesOf(i));

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

/** A crop of a picture on its own canvas, for BarPicture. */
async function cropOf(source: BarSource, rect: Rect): Promise<BarSource> {
  if (rect === FULL) return source;
  const im = typeof source === "string" ? await loadImage(source) : source;
  const iw = im instanceof HTMLImageElement ? im.naturalWidth : im.width;
  const ih = im instanceof HTMLImageElement ? im.naturalHeight : im.height;
  const [x, y, w, h] = rect;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(iw * w));
  c.height = Math.max(1, Math.round(ih * h));
  c.getContext("2d")?.drawImage(im, iw * x, ih * y, iw * w, ih * h, 0, 0, c.width, c.height);
  return c;
}

const CSS = `
.b42-thumb { transition: opacity 0.35s ease; }
.b42-grid[data-dim="true"] .b42-thumb[data-on="false"] { opacity: 0.3; }
.b42-link { transition: color 0.2s ease; }
.b42-link:hover, .b42-link:focus-visible { color: #ffffff; }
.b42-dialog { animation: b42-in 0.3s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes b42-in { from { opacity: 0; transform: translateY(1.2rem); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .b42-thumb, .b42-link { transition: none; }
  .b42-dialog { animation: none; }
}
`;

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
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [onClose]);

  return (
    <div
      aria-labelledby="b42-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto px-[1.6rem] py-[1.6rem] md:px-[2.4rem]"
      onClick={onClose}
      role="dialog"
      style={{ backgroundColor: "rgba(42, 13, 30, 0.94)", color: BLOSSOM }}
    >
      <div className="b42-dialog mx-auto max-w-[180rem]" onClick={(e) => e.stopPropagation()}>
        {/* The same top row as the page: name left, close right. */}
        <div className={`${TEXT} flex items-baseline justify-between gap-[2rem]`}>
          <p className="text-white">
            {p.title} <span className="opacity-60">({p.year})</span>
          </p>
          <button className="b42-link cursor-pointer text-white" onClick={onClose} ref={closeRef} type="button">
            Close ✕
          </button>
        </div>
        <div className="mt-[2.4rem] grid gap-x-[2.4rem] gap-y-[2.4rem] lg:grid-cols-[1.6fr_1fr]">
          <div className="relative aspect-[16/10] w-full" style={{ backgroundColor: BOX }}>
            {source ? <BarPicture alt={p.title} cell={6} className="absolute inset-0" fit="contain" source={source} /> : null}
          </div>
          <div className={`${TEXT} min-w-0`}>
            <h2 className="font-sans text-[clamp(2.6rem,2.4vw,4.4rem)] font-medium leading-[1.08] tracking-[-0.02em] text-white" id="b42-detail-title">
              {p.tagline}
            </h2>
            <ul className="mt-[2.4rem] space-y-[1rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              {p.bullets.map((b) => (
                <li className="flex gap-[1rem] font-normal leading-[1.4]" key={b}>
                  <span aria-hidden className="opacity-60">
                    –
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-[2rem] grid grid-cols-[9rem_1fr] gap-y-[0.6rem] pt-[1.6rem]" style={{ borderTop: LINE }}>
              <dt className="opacity-60">Stack</dt>
              <dd className="pl-[1.2rem] text-white">{p.stack.join(", ")}</dd>
              {p.award ? (
                <>
                  <dt className="opacity-60">Award</dt>
                  <dd className="pl-[1.2rem] text-white">{p.award}</dd>
                </>
              ) : null}
              {p.href || p.code ? (
                <>
                  <dt className="opacity-60">Links</dt>
                  <dd className="flex flex-wrap gap-x-[2rem] gap-y-[0.4rem] pl-[1.2rem]">
                    {p.href ? (
                      <a className="b42-link text-white" href={p.href} rel="noreferrer" target="_blank">
                        {hostOf(p.href)} ↗
                      </a>
                    ) : null}
                    {p.code ? (
                      <a className="b42-link text-white" href={p.code} rel="noreferrer" target="_blank">
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

export default function B42(): JSX.Element {
  const [pics, setPics] = useState<(BarSource | null)[][] | null>(null);
  const [hover, setHover] = useState(-1);
  const [open, setOpen] = useState(-1);
  const firstRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastOpen = useRef(-1);

  // Build every picture in the browser: whole pictures and type cards at
  // once, crops once their image has loaded.
  useEffect(() => {
    let gone = false;
    const base = projects.map((p) => projectSource(p));
    const build = (f: Frame, i: number): Promise<BarSource | null> =>
      f.kind === "plate"
        ? Promise.resolve(textPlate(f.text, { width: 900, height: 600 }))
        : cropOf(base[i], f.rect).catch(() => null);
    Promise.all(RUNS.map((run, i) => Promise.all(run.map((f) => build(f, i))))).then((all) => {
      if (!gone) setPics(all);
    });
    return () => {
      gone = true;
    };
  }, []);

  const close = useCallback(() => setOpen(-1), []);

  // Give focus back to the run that opened the detail.
  useEffect(() => {
    if (open >= 0) {
      lastOpen.current = open;
      return;
    }
    if (lastOpen.current >= 0) {
      firstRefs.current[lastOpen.current]?.focus();
      lastOpen.current = -1;
    }
  }, [open]);

  const leave = (i: number) => () => setHover((h) => (h === i ? -1 : h));

  return (
    <div className="relative w-full" style={{ backgroundColor: PLUM_WASH, color: BLOSSOM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className={`${TEXT} px-[1.6rem] pb-[2rem] pt-[2.4rem] md:px-[2.4rem]`}>
        {/* The top row of short columns. */}
        <header className="grid grid-cols-2 gap-x-[2rem] gap-y-[2.4rem] md:grid-cols-3 xl:grid-cols-[1fr_1.45fr_1.5fr_1.8fr_1fr_auto]">
          <p className="text-white">Kevin He</p>
          <div>
            <p className="text-white">{experience[0].role}</p>
            <p>{experience[0].org}</p>
            <p className="mt-[0.2rem] opacity-70">
              {education.school}, {education.when}
            </p>
          </div>
          <div>
            <p className="text-white">Skills</p>
            <ul className="pl-[1.6rem]">
              {skillGroups.map((g) => (
                <li key={g.label}>{g.label}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-white">Recognition</p>
            <ul className="pl-[1.6rem]">
              {awards.map((a) => (
                <li key={a.title}>
                  {a.title} <span className="tabular-nums opacity-60">({a.year})</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-white">Links</p>
            <ul className="pl-[1.6rem]">
              {elsewhere.map((l) => (
                <li key={l.href}>
                  <a className="b42-link" href={l.href} rel="noreferrer" target="_blank">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <a className="b42-link self-start text-white xl:text-right" href={`mailto:${EMAIL}`}>
            Email me
          </a>
        </header>

        {/* The work: runs of numbered pictures, wrapping across the grid. */}
        <div
          className="b42-grid mt-[7vh] grid grid-cols-2 items-start gap-x-[1.2rem] gap-y-[3.6rem] md:grid-cols-4 lg:grid-cols-5 lg:gap-y-[4.8rem] xl:grid-cols-7"
          data-dim={hover >= 0}
          onPointerLeave={() => setHover(-1)}
        >
          {RUNS.map((run, i) => {
            const p = projects[i];
            return run.map((f, k) => (
              <button
                aria-haspopup={k === 0 ? "dialog" : undefined}
                aria-hidden={k === 0 ? undefined : true}
                aria-label={k === 0 ? `${p.title}, ${p.year}. Open project` : undefined}
                className="b42-thumb block w-full min-w-0 cursor-pointer text-left"
                data-on={hover === i}
                key={`${p.title}-${k}`}
                onBlur={k === 0 ? leave(i) : undefined}
                onClick={() => setOpen(i)}
                onFocus={k === 0 ? () => setHover(i) : undefined}
                onPointerEnter={() => setHover(i)}
                ref={
                  k === 0
                    ? (el) => {
                        firstRefs.current[i] = el;
                      }
                    : undefined
                }
                tabIndex={k === 0 ? 0 : -1}
                type="button"
              >
                <span className="flex items-baseline justify-between gap-[1rem] pb-[0.5rem]">
                  <span className="min-w-0 whitespace-nowrap text-white">{k === 0 ? p.title : ""}</span>
                  <span className="shrink-0 tabular-nums text-white">{k + 1}</span>
                </span>
                <span className="relative block w-full" style={{ aspectRatio: f.aspect, backgroundColor: BOX }}>
                  {pics?.[i][k] ? (
                    <BarPicture
                      cell={5}
                      className="absolute inset-0"
                      fit={f.kind === "plate" ? "contain" : "cover"}
                      level={hover === i ? 1 : 0.72}
                      source={pics[i][k] as BarSource}
                    />
                  ) : null}
                </span>
              </button>
            ));
          })}
        </div>

        {/* The tiny footer row. */}
        <footer className="mt-[6vh] flex flex-wrap items-baseline justify-between gap-x-[2.4rem] gap-y-[0.8rem] pt-[1.2rem]" style={{ borderTop: LINE }}>
          <p className="opacity-70">
            {projects.length} projects, {RUNS.reduce((n, r) => n + r.length, 0)} pictures
          </p>
          <ul className="flex flex-wrap gap-x-[2rem] gap-y-[0.4rem]">
            {elsewhere.map((l) => (
              <li key={l.href}>
                <a className="b42-link" href={l.href} rel="noreferrer" target="_blank">
                  {l.handle}
                </a>
              </li>
            ))}
          </ul>
          <a className="b42-link break-all text-white" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
        </footer>
      </div>

      {open >= 0 ? <Detail i={open} onClose={close} source={pics ? pics[open][0] : null} /> : null}
    </div>
  );
}
