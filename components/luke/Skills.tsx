"use client";

import gsap from "gsap";
import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type JSX,
  type LiHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { css, ground, ink, onPalette } from "@/components/cloudPalette";
import { useIdea } from "@/components/ideas/idea";
import { createLook, FACE_GROUPS, FACE_VIEWER, type Look } from "@/components/ideas/i08/look";
import Workbench from "@/components/ideas/i08/Workbench";
import { HOLD, WORK_FOOT } from "@/components/luke/hold";
import { ROBOT_TURN } from "@/components/luke/robotFrames";
import { createRobotTurn, type Ink, type Rect, WIDEST } from "@/components/luke/robotTurn";
import { SKILLS } from "@/components/luke/skills-data";
import { Em, INK, Serif } from "@/components/luke/theme";
import { useTvUp } from "@/components/tvUp";
import { useNear } from "@/components/useNear";

/**
 * Skills, and the way into it.
 *
 * THE WAY IN is the hold after Work (hold.ts): the page stops the moment
 * Work's last row has gone off the top, and the scroll runs this instead.
 * Skills is pulled up over Work's empty foot so its top is at the screen's
 * top as the hold starts, and its first screen is stuck there for the
 * hold. As the koi swim off, the sentence ("Each project is an
 * opportunity...") comes up word by word in the middle of the screen,
 * lukebaffait.fr's blur reveal. Then the robot (robotTurn.ts, no plinth)
 * drives in from off the right edge, facing where it is going, its wheels
 * rolling, and slows to a stop at its place on the left; as it slows it
 * starts to turn on the spot, and it keeps turning with the scroll from
 * there on (TURN_RATE). The sentence is cut away along the robot's own
 * outline, row by row, as its front gets there. Under two columns the
 * robot stops above the groups, and the groups come in after it from the
 * right, a straight edge, all there when it stops. When the page scrolls
 * again Skills goes up with it, the robot with it.
 *
 * On a wide screen the robot stops beside the groups, its body their
 * height (less if there is not the room), level with them, seen side on
 * from a little over level; the two together are in the middle of the
 * screen, across and down. None of the groups shows
 * round it as it comes: each fades in once its back has gone past the
 * whole group, and they are all there when it stops. It is in the koi's
 * grade, in the type's colour, in bars over a faint copy of itself
 * (robotTurn.ts), stuck over the section. There is no header on the screen: the robot is where it was.
 * The groups are an accordion, the first open,
 * each a large name with a plus (a minus when open); an open group lists
 * its tools by name in the sans.
 *
 * It is under the cloud bank with Work, in the same colours: on a wide
 * screen the bank has turned the page pink with plum type by here
 * (cloudPalette.ts), and it stays turned. The section has no ground of its
 * own; the bank's is behind it.
 *
 * Reduced motion: no hold; the sentence at the section's top in the flow,
 * then Skills, the robot parked.
 */

/** The sentence's words coming up, in screens into the hold, one after the
 *  other, each over WORD. */
const WORDS_IN: [number, number] = [0.25, 0.7];
const WORD = 0.16;
/** The robot's drive from off the right edge to its place, eased out on
 *  a sine: coming in at an easy pace and slowing to a stop. The sentence
 *  is gone by about 2.1. */
const DRIVE: [number, number] = [0.95, 2.45];
/** Its turn on the spot: from here to the drive's end it gets up to
 *  TURN_RATE, and keeps it as long as the page scrolls. */
const TURN_IN = 0.45;
/** Radians a screen of scroll: one turn in 1.45 screens, the rate of the
 *  turn it made under the header before it drove in. */
const TURN_RATE = (2 * Math.PI) / 1.45;
/** Side on, facing left (heroRobot.ts: yaw ±π is straight left): the
 *  sheet's drive frame, with its wheels rolling. */
const DRIVE_YAW = ROBOT_TURN.firstYaw + (ROBOT_TURN.drive * 2 * Math.PI) / ROBOT_TURN.frames;
/** Idea 8: the robot turns to the groups only once it has stopped, over
 *  this last stretch of the drive. */
const PARKING: [number, number] = [DRIVE[1] - 0.15, DRIVE[1]];
/** Idea 8: ms the pointer rests on a group before its chips come. */
const HOVER_INTENT = 140;
/** The sentence fades over the drive's last stretch, so nothing of it the
 *  robot's front did not get to is left once it stops. */
const FADE = 0.3;
/** The wipe's clearance off the robot's outline, as a share of the
 *  screen's width, so no type touches its bars. */
const CLEAR = 0.008;
const WORDS: { t: string; em?: boolean }[] = [
  { t: "Each" },
  { t: "project" },
  { t: "is" },
  { t: "an" },
  { t: "opportunity" },
  { t: "to" },
  { t: "learn,", em: true },
  { t: "build", em: true },
  { t: "and" },
  { t: "show" },
  { t: "what" },
  { t: "I" },
  { t: "can" },
  { t: "do." },
];

/** The rules: the type's own colour, faint, so they turn with it. */
const HAIRLINE = "color-mix(in srgb, currentColor 18%, transparent)";
/** Hidden until the wipe gets to it. */
const UNWIPED = "inset(0 0 0 100%)";
/** Far enough past any box to be off the screen, px. */
const FAR = 1e4;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const ramp = (v: number, [a, b]: [number, number]): number => clamp01((v - a) / (b - a));

/** One side of the robot's outline as points down the screen, `by` px
 *  out from it (negative is left): each row as wide as it and its two
 *  neighbours, so a thin part's edge does not cut in and out; a row with
 *  nothing in it between the rows either side of it; the first and last
 *  rows run on up and down. Null if it has no rows. */
function edge(o: Ink, side: "lefts" | "rights", by: number): [number, number][] | null {
  const xs = o[side];
  const pick = side === "lefts" ? Math.min : Math.max;
  const wide = xs.map((_, i) => {
    const near = [xs[i - 1], xs[i], xs[i + 1]].filter((x) => x !== undefined && !Number.isNaN(x));
    return near.length ? pick(...near) + by : NaN;
  });
  const set = wide.flatMap((x, i) => (Number.isNaN(x) ? [] : [i]));
  if (!set.length) return null;
  // Across an empty row the polygon goes straight from one side to the
  // other.
  const pts = set.map((i): [number, number] => [wide[i], o.rowsTop + (i + 0.5) * o.step]);
  pts.unshift([pts[0][0], -FAR]);
  pts.push([pts[pts.length - 1][0], FAR]);
  return pts;
}

/** The robot's back, the furthest right of its outline, over the screen
 *  rows `top` to `bottom` and a row either side; its ink box's right if it
 *  has nothing there. */
function backOver(o: Ink, top: number, bottom: number): number {
  const from = Math.max(0, Math.floor((top - o.rowsTop) / o.step) - 1);
  const to = Math.min(o.rights.length, Math.ceil((bottom - o.rowsTop) / o.step) + 1);
  let most = -Infinity;
  for (let i = from; i < to; i++) if (!Number.isNaN(o.rights[i])) most = Math.max(most, o.rights[i]);
  return most > -Infinity ? most : o.right;
}

/** Cuts `el` to the side of `line` (screen points down the screen) that
 *  `keep` says. */
function cutAlong(el: HTMLElement, line: [number, number][], keep: "left" | "right"): void {
  const r = el.getBoundingClientRect();
  const out = keep === "left" ? -FAR : FAR;
  const pts = [[out, -FAR], ...line.map(([x, y]) => [x - r.left, y - r.top]), [out, FAR]];
  el.style.clipPath = `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(", ")})`;
}

/** Cuts `el` away left of screen x `at` (nothing once `at` is left of it).
 *  The other sides are let out past the box so the italic's overhang is
 *  not cut with it. */
function showRightOf(el: HTMLElement, at: number): void {
  const r = el.getBoundingClientRect();
  const cut = at - r.left;
  el.style.clipPath = cut <= 0 ? "" : cut >= r.width ? UNWIPED : `inset(-50% -50% -50% ${cut.toFixed(1)}px)`;
}

/** Cuts `el` away right of screen x `at`. */
function showLeftOf(el: HTMLElement, at: number): void {
  const r = el.getBoundingClientRect();
  const cut = r.right - at;
  el.style.clipPath = cut <= 0 ? "" : cut >= r.width ? "inset(0 100% 0 0)" : `inset(-50% ${cut.toFixed(1)}px -50% -50%)`;
}

export default function Skills(): JSX.Element {
  const root = useRef<HTMLElement | null>(null);
  const robotStageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sentenceRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const listRef = useRef<HTMLUListElement | null>(null);
  const robotBoxRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(0);
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // Idea 8 (/i/8): the robot turns to the group pointed at, and its tags
  // are thrown into a tray as chips (components/ideas/i08).
  const bench = useIdea() === 8;
  const lookRef = useRef<Look | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef(0);
  const hoverGroup = useRef(-1);
  const pointerKind = useRef("mouse");

  // The hold's run, off the scroll. Waits for the hero (tvUp.ts) so the
  // robot's frames do not slow the TV loading, and for the section to be
  // near (useNear.ts), so their 3.9 MB is not in the first load at all.
  const tvUp = useTvUp();
  const near = useNear(root);
  useEffect(() => {
    if (!tvUp || !near) return undefined;
    const stage = robotStageRef.current;
    const track = trackRef.current;
    const sentence = sentenceRef.current;
    const list = listRef.current;
    const box = robotBoxRef.current;
    const grid = gridRef.current;
    const tray = bench ? trayRef.current : null;
    const words = wordRefs.current.filter((w): w is HTMLSpanElement => !!w);
    if (!stage || !track || !sentence || !list || !box || !grid) return undefined;
    const groups = [...list.querySelectorAll<HTMLElement>("[data-group]")];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Two columns: the groups are beside the robot, in its path.
    const wide = window.matchMedia("(min-width: 1024px)");
    const robot = createRobotTurn(stage);
    const out = gsap.parseEase("sine.out");
    let gone = false;
    let frame = 0;
    const look = bench && !reduced ? createLook(() => ask()) : null;
    lookRef.current = look;
    // Where the drive was last frame, px from its start: the wheels roll
    // by the way it has come since. Null when it is not driving.
    let was: number | null = null;
    // The groups' height is the robot's on a wide screen, taken every
    // frame, and the list is watched, so whatever changes it (the fonts
    // coming in, a group opening) the robot changes with it. Taken only
    // before the drive, a list that grew after it was left taller than the
    // robot.
    const setVar = (name: string, px: number): void => {
      const v = `${px.toFixed(1)}px`;
      if (grid.style.getPropertyValue(name) !== v) grid.style.setProperty(name, v);
    };
    const apply = (): void => {
      frame = 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Screens into the hold: the track's top is the screen's top when it
      // starts, and stays there while the first screen is stuck.
      const p = reduced ? HOLD : -track.getBoundingClientRect().top / vh;

      words.forEach((w, i) => {
        const from = WORDS_IN[0] + ((WORDS_IN[1] - WORDS_IN[0] - WORD) * i) / Math.max(1, words.length - 1);
        const q = ramp(p, [from, from + WORD]);
        w.style.opacity = q.toFixed(3);
        w.style.filter = q < 1 ? `blur(${((1 - q) * 10).toFixed(2)}px)` : "";
        w.style.transform = q < 1 ? `translateY(${((1 - q) * 0.3).toFixed(3)}em)` : "";
      });

      const d = ramp(p, DRIVE);
      const e = out(d);
      // Without the robot (before its sheet is in) the wipe is a straight
      // edge.
      let front = vw * (1 - e);
      let back = front;
      let now: Ink | null = null;
      // Where it would be, at its place, on the heading it is on now.
      let rested: Ink | null = null;
      if (box.offsetWidth > 0) {
        // On a wide screen beside the groups: their height, level with
        // them, its column (--robot) as wide as it needs to turn in or as
        // there is room for, and the two in the middle of the screen
        // (--top). Under two columns, its own box.
        let rest: Rect = box.getBoundingClientRect();
        if (wide.matches && groups.length) {
          const tall = groups[groups.length - 1].getBoundingClientRect().bottom - groups[0].getBoundingClientRect().top;
          const cs = getComputedStyle(grid);
          const room =
            grid.clientWidth -
            parseFloat(cs.paddingLeft) -
            parseFloat(cs.paddingRight) -
            parseFloat(cs.columnGap) -
            list.offsetWidth;
          setVar("--robot", Math.max(0, Math.min(tall * WIDEST, room)));
          // Idea 8: the groups and the tray under them are in the middle.
          const below = tray ? tray.getBoundingClientRect().bottom - groups[groups.length - 1].getBoundingClientRect().bottom : 0;
          setVar("--top", Math.max(0, (vh - tall - below) / 2));
          const column = box.getBoundingClientRect();
          rest = { left: column.left, top: groups[0].getBoundingClientRect().top, width: column.width, height: tall };
        }
        // The turn's rate comes up from nothing over TURN_IN, so what it
        // has turned is the ramp's integral, then TURN_RATE a screen.
        const t0 = DRIVE[1] - TURN_IN;
        const into = Math.max(0, p - t0);
        const turned = reduced ? 0 : TURN_RATE * (into < TURN_IN ? (into * into) / (2 * TURN_IN) : into - TURN_IN / 2);
        const byScroll = reduced ? ROBOT_TURN.firstYaw : DRIVE_YAW + turned;
        const yaw = look ? look.yaw(byScroll, wide.matches ? FACE_GROUPS : FACE_VIEWER, ramp(p, PARKING)) : byScroll;
        // From its front just past the right edge to its place.
        const parked = robot.ink(rest, DRIVE_YAW);
        const run = vw * 1.02 - (parked ? parked.left : rest.left);
        const at = {
          left: rest.left + (1 - e) * run,
          top: rest.top,
          width: rest.width,
          height: rest.height,
        };
        // Its wheels roll by the way it has come, while it comes.
        const driving = d > 0 && d < 1;
        if (driving && was !== null) robot.roll(at, e * run - was);
        was = driving ? e * run : null;
        robot.place(at, stage.getBoundingClientRect(), yaw, driving);
        now = robot.ink(at, yaw, driving);
        rested = robot.ink(rest, yaw, driving);
        if (look) look.ink = now;
        front = now ? now.left : at.left;
        back = now ? now.right : at.left + at.width;
      }

      // The sentence is left of the robot's front, along its outline.
      // Beside it, each group fades in from when the robot's back over it
      // has gone past its left edge to when the robot is at its place;
      // under two columns the groups are below it, and are a wipe from
      // the right. Reduced motion: no wipe.
      const fadeIn = (g: HTMLElement, q: number | null): void => {
        g.style.opacity = q === null ? "" : q.toFixed(3);
        g.style.visibility = q === null || q > 0 ? "" : "hidden";
      };
      if (reduced) {
        sentence.style.clipPath = "";
        sentence.style.opacity = "";
        list.style.clipPath = "";
        groups.forEach((g) => fadeIn(g, null));
        if (tray) fadeIn(tray, null);
        return;
      }
      sentence.style.opacity = (1 - ramp(p, [DRIVE[1] - FADE, DRIVE[1]])).toFixed(3);
      const by = CLEAR * vw;
      const fore = now && edge(now, "lefts", -by);
      if (fore) cutAlong(sentence, fore, "left");
      else showLeftOf(sentence, front);
      if (wide.matches) {
        list.style.clipPath = "";
        let lastQ = 1;
        for (const g of groups) {
          const r = g.getBoundingClientRect();
          let q = 1;
          if (d < 1 && now && rested) {
            const gone = r.left - by - backOver(now, r.top, r.bottom);
            const toGo = r.left - by - backOver(rested, r.top, r.bottom);
            q = clamp01(gone / Math.max(1, toGo));
          } else if (d < 1) q = back + by < r.left ? 1 : 0;
          fadeIn(g, q);
          lastQ = q;
        }
        if (tray) {
          tray.style.clipPath = "";
          fadeIn(tray, lastQ);
        }
      } else {
        // The groups are under the robot here, so its outline (which runs
        // on down from its feet) would cut them where it stops; they come
        // in from the right on a straight edge that is across the screen
        // when it stops.
        groups.forEach((g) => fadeIn(g, null));
        showRightOf(list, vw * (1 - e));
        if (tray) {
          fadeIn(tray, null);
          showRightOf(tray, vw * (1 - e));
        }
      }
    };
    const ask = (): void => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    // Plum on the pink page or pink on the dark one: which faces of the
    // robot are inked (robotTurn.ts).
    const offPalette = onPalette((t) => {
      robot.setColors(ground(t), ink(t));
      ask();
    });
    void robot.ready.then(() => {
      if (!gone) ask();
    });
    const watch = new ResizeObserver(ask);
    watch.observe(list);
    if (tray) watch.observe(tray);
    apply();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => {
      gone = true;
      watch.disconnect();
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      if (frame) cancelAnimationFrame(frame);
      offPalette();
      robot.destroy();
      look?.destroy();
      lookRef.current = null;
    };
  }, [tvUp, near, bench]);

  // Idea 8: a pointer over the groups, a key's focus on one or a tap
  // turns the robot to them; a mouse moving on a group puts its chips in
  // the tray. On a move, not on entering: a chip let go of over a group
  // puts the pointer on it, and that group's chips took the tray at once.
  const benchList: HTMLAttributes<HTMLUListElement> = bench
    ? {
        onPointerDown: (e: ReactPointerEvent): void => {
          pointerKind.current = e.pointerType;
        },
        onPointerEnter: (e: ReactPointerEvent): void => {
          if (e.pointerType === "mouse") lookRef.current?.set("hover", true);
        },
        onPointerLeave: (): void => lookRef.current?.set("hover", false),
      }
    : {};
  const benchGroup = (i: number): LiHTMLAttributes<HTMLLIElement> =>
    bench
      ? {
          onPointerMove: (e: ReactPointerEvent): void => {
            if (e.pointerType !== "mouse" || e.buttons || hoverGroup.current === i) return;
            hoverGroup.current = i;
            window.clearTimeout(hoverTimer.current);
            hoverTimer.current = window.setTimeout(() => setOpen(i), HOVER_INTENT);
          },
          onPointerLeave: (): void => {
            hoverGroup.current = -1;
            window.clearTimeout(hoverTimer.current);
          },
        }
      : {};
  const benchButton = (i: number): ButtonHTMLAttributes<HTMLButtonElement> =>
    bench
      ? {
          onClick: (e): void => {
            setOpen(i);
            if (e.detail > 0 && pointerKind.current !== "mouse") lookRef.current?.set("tap", true);
          },
          onFocus: (e): void => {
            if (e.currentTarget.matches(":focus-visible")) lookRef.current?.set("focus", true);
          },
          onBlur: (): void => lookRef.current?.set("focus", false),
        }
      : {};

  // The type's colour, with the cloud's.
  useEffect(
    () =>
      onPalette((t) => {
        if (root.current) root.current.style.color = css(ink(t));
      }),
    [],
  );

  return (
    // Above the cloud bank (CloudPassage.tsx, z-20), as Work is, and pulled
    // up over Work's empty foot (WORK_FOOT), so its top is the screen's top
    // when the hold starts.
    <section
      aria-labelledby={`${base}-title`}
      className="relative z-30 overflow-x-clip font-sans motion-reduce:!mt-0"
      ref={root}
      style={{ color: INK, marginTop: `${-WORK_FOOT * 100}vh` }}
    >
      {/* The hold's track: the grid's first screen stuck for HOLD screens
          (the spacer after it), then going up with the page. */}
      <div className="relative" ref={trackRef}>
        {/* The sentence: its own screen, stuck for the hold, cut away
            from the right as the robot comes. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 motion-reduce:static motion-reduce:!h-auto"
          style={{ height: `${(HOLD + 1) * 100}vh` }}
        >
          <div
            className="sticky top-0 flex h-screen items-center justify-center px-4 motion-reduce:static motion-reduce:h-auto motion-reduce:pt-[14vh]"
            ref={sentenceRef}
          >
            <p className="max-w-[40rem] text-center text-[clamp(26px,6.4vw,44px)] leading-[1.16] tracking-[-0.03em] [text-wrap:balance] lg:max-w-[50vw] lg:text-[clamp(30px,3vw,110px)]">
              {WORDS.map((w, i) => (
                <span key={`${w.t}-${i}`}>
                  <span
                    className="inline-block"
                    ref={(el) => {
                      wordRefs.current[i] = el;
                    }}
                    style={{ opacity: 0 }}
                  >
                    {w.em ? <Em>{w.t}</Em> : w.t}
                  </span>
                  {i < WORDS.length - 1 ? " " : null}
                </span>
              ))}
            </p>
          </div>
        </div>

        {/* On a wide screen two columns in the middle: the robot's
            (--robot, set with the groups' height) and the groups', 5.4vw
            apart, the groups' top so that they are halfway down (--top).
            The robot is centred in its column, so the gap from its ink to
            the groups is more than the columns' and goes with its heading:
            at 3vw it was 36 to 174 px at 1888 wide, 91 on average; at
            5.4vw it is half as much again on average, 137. */}
        <div
          className="sticky top-0 grid gap-y-[6vh] px-4 pb-[30vh] pt-[10vh] sm:px-[8vw] lg:grid-cols-[var(--robot,30vw)_31vw] lg:justify-center lg:gap-x-[5.4vw] lg:pt-[var(--top,22vh)]"
          ref={gridRef}
        >
          {/* Left: the robot's place. The header is for screen readers
              only. */}
          <div>
            <h2 className="sr-only" id={`${base}-title`}>
              Skills
            </h2>
            {/* Under two columns, the robot's body, centred in it
                (robotTurn.ts draws it on the stage). On a wide screen its
                column, flat: its top and height are the groups'. */}
            <div aria-hidden="true" className="h-[42vh] w-full sm:h-[70vh] lg:h-0" ref={robotBoxRef} />
          </div>

          {bench ? <Workbench group={open} look={lookRef} trayRef={trayRef} /> : null}

          {/* Right: the groups, the robot beside them and their height. */}
          <ul
            className={bench ? "lg:col-start-2 lg:row-start-1" : undefined}
            data-groups
            ref={listRef}
            style={{ clipPath: UNWIPED }}
            {...benchList}
          >
            {SKILLS.map((g, i) => {
              const on = open === i;
              const btn = `${base}-b${i}`;
              const panel = `${base}-p${i}`;
              return (
                <li
                  className="border-t py-[max(1.8rem,16px)]"
                  data-group
                  key={g.label}
                  style={{ borderColor: HAIRLINE }}
                  {...benchGroup(i)}
                >
                  <h3>
                    <button
                      aria-controls={panel}
                      aria-expanded={on}
                      className="flex w-full items-center justify-between gap-6 rounded-sm text-left text-[clamp(26px,2.6vw,100px)] tracking-[-0.02em] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4"
                      id={btn}
                      onClick={() => setOpen(on ? -1 : i)}
                      type="button"
                      {...benchButton(i)}
                    >
                      <span className="pb-[0.08em] pr-[0.1em]">
                        <Serif text={g.label} />
                      </span>
                      <span aria-hidden="true" className="font-sans text-[0.6em] font-light opacity-70">
                        {on ? "−" : "+"}
                      </span>
                    </button>
                  </h3>
                  <div
                    aria-labelledby={btn}
                    className="grid transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                    id={panel}
                    inert={!on}
                    role="region"
                    style={{ gridTemplateRows: on ? "1fr" : "0fr" }}
                  >
                    <div className="overflow-hidden">
                      <ul
                        className={
                          bench
                            ? "sr-only"
                            : "flex flex-wrap gap-x-[max(1.6rem,14px)] gap-y-[max(0.6rem,6px)] pb-[0.6rem] pt-[max(1.2rem,10px)] text-[clamp(14px,1.05vw,30px)] leading-[1.4] opacity-75"
                        }
                      >
                        {g.skills.map((s) => (
                          <li key={s.name}>{s.name}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div aria-hidden="true" className="motion-reduce:hidden" style={{ height: `${HOLD * 100}vh` }} />
      </div>

      {/* The robot's stage, stuck over the whole section, over the type. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="sticky top-0 h-screen w-full overflow-clip" ref={robotStageRef} />
      </div>
    </section>
  );
}
