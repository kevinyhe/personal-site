"use client";

import { type JSX, useEffect, useRef, useState } from "react";

import BarPicture from "@/components/below/barPicture";
import { css, ground, ink, onPalette } from "@/components/cloudPalette";
import { subscribeWork, workState } from "@/components/ideas/i05/store";
import { useMedia } from "@/components/luke/work-data";
import { projects } from "@/components/profile";
import { NEAR } from "@/components/useNear";

/**
 * Idea 5's hover preview: the hovered project's picture in bars beside the
 * cursor, following it with a soft lag. Its bars grow up from nothing, left
 * to right, first in wide cells, then the fine ones take over the same way.
 * Mouse only; a project with no picture (Sharingan) shows none.
 */

/** Cell widths, px, of the first pass and the final picture. */
const COARSE = 18;
const FINE = 6;
/** Seconds: each pass's sweep across the picture and each bar's growth. */
const COARSE_SWEEP = 0.3;
const COARSE_GROW = 0.22;
const FINE_AT = 0.25;
const FINE_SWEEP = 0.35;
const FINE_GROW = 0.25;
const GROWN = FINE_AT + FINE_SWEEP + FINE_GROW;
/** How fast the picture closes on the cursor, per second. */
const FOLLOW = 9;
/** Seconds the picture takes to fade once the pointer leaves the rows. */
const FADE = 0.25;
/** px from the cursor to the picture, and from the picture to the screen's edge. */
const GAP = 36;
const MARGIN = 16;

const PICTURED = projects.flatMap((p, index) => (p.image ? [{ index, image: p.image, title: p.title }] : []));

type Colours = { ink: string; ground: string };

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const rise = (q: number): number => 1 - (1 - q) ** 3;

/** A clip that shows each bar's column of the picture up to its own
 *  height (0..1), right of `from` px; columns line up with BarPicture's cells. */
function staircase(w: number, h: number, cell: number, from: number, heightAt: (column: number, columns: number) => number): string {
  const columns = Math.max(1, Math.floor(w / cell));
  const offset = (w - columns * cell) / 2;
  const points = [`${from.toFixed(1)}px ${h}px`];
  for (let c = 0; c < columns; c += 1) {
    const x0 = Math.max(from, c === 0 ? 0 : offset + c * cell);
    const x1 = c === columns - 1 ? w : offset + (c + 1) * cell;
    if (x1 <= x0) continue;
    const top = (h * (1 - heightAt(c, columns))).toFixed(1);
    points.push(`${x0.toFixed(1)}px ${top}px`, `${x1.toFixed(1)}px ${top}px`);
  }
  points.push(`${w}px ${h}px`);
  return `polygon(${points.join(", ")})`;
}

function grow(picture: HTMLElement, t: number): void {
  const coarse = picture.children[0] as HTMLElement;
  const fine = picture.children[1] as HTMLElement;
  if (t >= GROWN) {
    coarse.style.clipPath = "inset(0 0 100% 0)";
    fine.style.clipPath = "";
    return;
  }
  const w = picture.clientWidth;
  const h = picture.clientHeight;
  const fineColumns = Math.max(1, Math.floor(w / FINE));
  const fineStarted = Math.ceil(clamp01((t - FINE_AT) / FINE_SWEEP) * fineColumns);
  const fineFront = fineStarted === 0 ? 0 : (w - fineColumns * FINE) / 2 + fineStarted * FINE;
  coarse.style.clipPath = staircase(w, h, COARSE, fineFront, (c, n) => rise(clamp01((t - (COARSE_SWEEP * c) / n) / COARSE_GROW)));
  fine.style.clipPath = staircase(w, h, FINE, 0, (c, n) => rise(clamp01((t - FINE_AT - (FINE_SWEEP * c) / n) / FINE_GROW)));
}

function paletteNow(): number {
  let now = 0;
  onPalette((t) => {
    now = t;
  })();
  return now;
}

function coloursNow(): Colours {
  const t = paletteNow();
  return { ink: css(ink(t)), ground: css(ground(t)) };
}

function useWorkNear(): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const work = document.querySelector("#work");
    if (!work) throw new Error("idea 5: no #work section on the page");
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        setNear(true);
      },
      { rootMargin: NEAR },
    );
    seen.observe(work);
    return () => seen.disconnect();
  }, []);
  return near;
}

export default function Preview(): JSX.Element | null {
  const canHover = useMedia("(hover: hover) and (pointer: fine)");
  const near = useWorkNear();
  const [colours, setColours] = useState<Colours | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const on = canHover && near;

  useEffect(() => {
    if (on) setColours(coloursNow());
  }, [on]);

  useEffect(() => {
    const box = boxRef.current;
    if (!on || !colours || !box) return undefined;
    const pictures = new Map(
      PICTURED.map(({ index }) => {
        const picture = box.querySelector<HTMLElement>(`[data-picture="${index}"]`);
        if (!picture) throw new Error(`idea 5: no preview picture for project ${index}`);
        return [index, picture] as const;
      }),
    );
    let cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const at = { x: 0, y: 0 };
    let active: number | null = null;
    let grownFrom = 0;
    let wanted = false;
    let opacity = 0;
    let frame = 0;
    let last = 0;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const list = document.querySelector("#work ol");
    if (!list) throw new Error("idea 5: no project list under #work");
    // Left of the cursor and never over the list, so the name being
    // pointed at stays clear; right of the cursor where the list is too
    // wide to leave room beside it.
    const placeFor = (): { x: number; y: number } => {
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const left = Math.min(cursor.x, list.getBoundingClientRect().left) - GAP - w;
      const x = left >= MARGIN ? left : Math.min(cursor.x + GAP, window.innerWidth - w - MARGIN);
      const y = Math.min(Math.max(cursor.y - h / 2, MARGIN), window.innerHeight - h - MARGIN);
      return { x, y };
    };
    const step = (now: number): void => {
      frame = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const want = placeFor();
      const k = reduced ? 1 : 1 - Math.exp(-FOLLOW * dt);
      at.x += (want.x - at.x) * k;
      at.y += (want.y - at.y) * k;
      box.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0)`;
      opacity = wanted ? 1 : Math.max(0, opacity - dt / FADE);
      box.style.opacity = opacity.toFixed(3);
      const picture = active === null ? null : pictures.get(active);
      if (picture) grow(picture, reduced ? GROWN : (now - grownFrom) / 1000);
      if (wanted || opacity > 0) frame = requestAnimationFrame(step);
      else box.style.visibility = "hidden";
    };
    const wake = (): void => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };
    const onState = (): void => {
      const { hovered } = workState();
      const next = hovered !== null && projects[hovered].image ? hovered : null;
      wanted = next !== null;
      if (next !== null && next !== active) {
        if (opacity === 0) Object.assign(at, placeFor());
        active = next;
        grownFrom = performance.now();
        for (const [index, picture] of pictures) {
          picture.style.visibility = index === next ? "" : "hidden";
          if (index === next) grow(picture, 0);
        }
        box.style.visibility = "";
        const fresh = coloursNow();
        if (fresh.ink !== colours.ink || fresh.ground !== colours.ground) setColours(fresh);
      } else if (next !== null && opacity === 0) {
        Object.assign(at, placeFor());
        grownFrom = performance.now();
        box.style.visibility = "";
      }
      wake();
    };
    const onMove = (e: PointerEvent): void => {
      cursor = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    const offWork = subscribeWork(onState);
    onState();
    return () => {
      offWork();
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [on, colours]);

  if (!on || !colours) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[60] aspect-[3/2] w-[min(28vw,520px)]"
      ref={boxRef}
      style={{ opacity: 0, visibility: "hidden" }}
    >
      {PICTURED.map(({ index, image }) => (
        <div className="absolute inset-0" data-picture={index} key={index} style={{ visibility: "hidden" }}>
          {[COARSE, FINE].map((cell) => (
            <div className="absolute inset-0" key={cell} style={{ backgroundColor: colours.ground, clipPath: "inset(0 0 100% 0)" }}>
              <BarPicture cell={cell} ink={colours.ink} source={image} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
