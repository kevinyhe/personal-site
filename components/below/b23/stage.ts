import { BAND, BLOSSOM } from "@/components/bandColours";
import { type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import {
  activeRing,
  cardAt,
  contactAt,
  GO_TO,
  pinLit,
  pinScreen,
  type Pose,
  poleGlowAt,
  poseAt,
  ringLit,
  robotLon,
  S_END,
  skillsAt,
  starsAt,
  stillPose,
  STOPS,
  TEXT_BOX,
} from "./layout";
import { buildPlanet } from "./scene";

/**
 * Drives the little planet from the page's scroll and the pointer. The
 * bar shader's own frame loop calls back here once a frame while the
 * stage is on screen: read the scroll, turn the planet, draw it, set the
 * words. Nothing runs while the stage is off screen or the tab is
 * hidden, because the bar shader stops its loop then.
 */

export type Mode = "journey" | "still";

/** Cells across the bar grid. */
const X_SQUARES = 320;
const MAX_BAR_W = 2560;
const TURN = Math.PI * 2;

type Handle = { goTo(i: number): void; spin(rad: number): void; readonly state: unknown };

export function startGlobe(root: HTMLElement, mode: Mode): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("canvas[data-bars]");
  const journey = root.querySelector<HTMLElement>("[data-journey]");
  if (!stage || !bars) throw new Error("b23: stage missing");
  const still = mode === "still";

  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
  const tags = Array.from(root.querySelectorAll<HTMLElement>("[data-tag]"));
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const groups = Array.from(root.querySelectorAll<HTMLElement>("[data-group]"));
  const skillItems = Array.from(root.querySelectorAll<HTMLElement>("[data-skill]"));
  const skillList = root.querySelector<HTMLElement>("[data-skill-list]");
  const contactLayer = root.querySelector<HTMLElement>("[data-contact-layer]");
  const contactBody = root.querySelector<HTMLElement>("[data-contact-body]");
  const hint = root.querySelector<HTMLElement>("[data-hint]");

  const aspect = (): number => Math.max(0.4, stage.clientWidth / Math.max(1, stage.clientHeight));
  const scrollS = (): number => {
    if (!journey) return 0;
    const h = Math.max(1, stage.clientHeight);
    return Math.max(0, Math.min(S_END, -journey.getBoundingClientRect().top / h));
  };

  // ------------------------------------------------------------ the drag
  // The drag adds a spin on top of the scroll's. Let go and it keeps
  // turning, slows, and then settles on the nearest whole turn, so the
  // pin the scroll chose faces the camera again.
  let offset = 0;
  let vel = 0;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let quietFor = 10;
  let dragId = -1;
  const radPerPx = (): number => 4 / Math.max(1, stage.clientWidth);
  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || still) return;
    dragging = true;
    dragId = e.pointerId;
    lastX = e.clientX;
    lastT = e.timeStamp;
    vel = 0;
    stage.setPointerCapture?.(e.pointerId);
    stage.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== dragId) return;
    const d = (e.clientX - lastX) * radPerPx();
    const dt = Math.max(1, e.timeStamp - lastT) / 1000;
    offset += d;
    // Smoothed, so one jittery event does not decide the fling.
    vel = vel * 0.6 + (d / dt) * 0.4;
    lastX = e.clientX;
    lastT = e.timeStamp;
    quietFor = 0;
  };
  const onUp = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== dragId) return;
    dragging = false;
    dragId = -1;
    // A hand that stopped before letting go does not fling.
    if (e.timeStamp - lastT > 80) vel = 0;
    stage.releasePointerCapture?.(e.pointerId);
    stage.style.cursor = "";
  };
  const stepDrag = (dt: number): void => {
    if (dragging) return;
    quietFor += dt;
    offset += vel * dt;
    vel *= Math.exp(-dt * 1.8);
    if (Math.abs(vel) < 0.25 && quietFor > 1.4) {
      vel = 0;
      const home = Math.round(offset / TURN) * TURN;
      offset += (home - offset) * Math.min(1, dt * 1.6);
      if (Math.abs(home - offset) < 1e-4) offset = home;
    }
  };

  // ------------------------------------------------------- hover a skill
  let hot = -1;
  const onSkillEnter = (e: Event): void => {
    const i = Number((e.currentTarget as HTMLElement).dataset.skill);
    hot = Number.isFinite(i) ? i : -1;
  };
  const onSkillLeave = (): void => {
    hot = -1;
  };

  // ----------------------------------------------------------- the words
  // Styles are written only when they change, so a still scroll costs no
  // style work.
  const written = new WeakMap<HTMLElement, Record<string, string>>();
  const set = (el: HTMLElement | null | undefined, key: string, value: string): void => {
    if (!el) return;
    const rec = written.get(el) ?? {};
    if (rec[key] === value) return;
    rec[key] = value;
    written.set(el, rec);
    el.style.setProperty(key, value);
  };

  let s = 0;
  let pose: Pose = still ? stillPose(aspect()) : poseAt(0, aspect());
  let time = 0;

  const placeWords = (): void => {
    const a = aspect();
    cards.forEach((el, k) => {
      const v = cardAt(k, s);
      set(el, "opacity", v.toFixed(3));
      set(el, "transform", `translateY(calc(-50% + ${((1 - v) * 1.5).toFixed(2)}vh))`);
      set(el, "pointer-events", v > 0.5 ? "auto" : "none");
      set(el, "visibility", v > 0.001 ? "visible" : "hidden");
    });
    tags.forEach((el, k) => {
      const lit = pinLit(k, s);
      const p = pinScreen(k, pose, a, 1 + 0.3 * lit);
      const show = p.hidden || p.facing < 0.1 ? 0 : cardAt(k, s);
      set(el, "opacity", show.toFixed(3));
      set(el, "left", `${((p.obj.x + p.halfW) * 100 + 0.8).toFixed(2)}%`);
      set(el, "top", `${(p.obj.y * 100).toFixed(2)}%`);
    });
    const sk = skillsAt(s);
    set(skillsLayer, "opacity", sk.toFixed(3));
    set(skillsLayer, "visibility", sk > 0.001 ? "visible" : "hidden");
    // Only the list takes the pointer, so the planet round it can still be dragged.
    set(skillList, "pointer-events", sk > 0.5 ? "auto" : "none");
    const ring = activeRing(s);
    groups.forEach((el, r) => set(el, "opacity", r === ring ? "1" : r < ring ? "0.72" : "0.4"));
    const c = contactAt(s);
    set(contactLayer, "opacity", c.toFixed(3));
    set(contactLayer, "visibility", c > 0.001 ? "visible" : "hidden");
    set(contactBody, "pointer-events", c > 0.5 ? "auto" : "none");
    set(hint, "opacity", (0.7 * (1 - skillsAt(s)) * (1 - c)).toFixed(3));
  };

  const drawAt = (): void => {
    planet.draw({
      pose,
      pins: STOPS.map((_, k) => (still ? (k === 0 ? 1 : 0) : pinLit(k, s))),
      rings: [0, 1, 2, 3, 4].map((r) => (still ? 0 : ringLit(r, s))),
      poleGlow: still ? 0 : poleGlowAt(s),
      stars: still ? 0.35 : starsAt(s),
      hot,
      time,
    });
  };

  const tick = (t: number, dt: number): void => {
    time = t;
    s = scrollS();
    stepDrag(dt);
    const base = poseAt(s, aspect());
    pose = { ...base, yaw: base.yaw + offset };
    drawAt();
    placeWords();
  };

  const glCanvas = document.createElement("canvas");
  const planet = buildPlanet(glCanvas, { animated: !still, update: still ? undefined : tick });
  planet.resize(aspect());
  if (still) drawAt();

  // The bar canvas is never drawn more than MAX_BAR_W device pixels wide.
  // On a wider screen it is drawn smaller and scaled up to fill the stage.
  const fitBars = (): void => {
    const want = stage.clientWidth * Math.min(window.devicePixelRatio || 1, 1.5);
    const k = Math.max(1, want / MAX_BAR_W);
    bars.style.width = `${(100 / k).toFixed(4)}%`;
    bars.style.height = `${(100 / k).toFixed(4)}%`;
    bars.style.transformOrigin = "0 0";
    bars.style.transform = k > 1 ? `scale(${k.toFixed(4)})` : "";
  };
  fitBars();

  const config: BarLayerConfig = {
    x: 0,
    y: 0,
    width: "100%",
    height: "100%",
    // Turned over: a bright grey is a wide blossom bar on the plum, so the
    // lit side of the planet is blossom and the sky is bare plum.
    blackPoint: 255,
    whitePoint: 0,
    threshold: 255,
    xSquares: X_SQUARES,
    ySquares: Math.round(X_SQUARES / aspect()),
    minSquareWidth: "-2%",
    maxSquareWidth: "100%",
    bgOpacity: 1,
    fillOpacity: 1,
  };
  const bar = createBarCanvas(bars, [{ type: "canvas", source: planet.source, config }], {
    colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
    fps: 60,
  });
  if (!bar) {
    planet.dispose();
    throw new Error("b23: bar shader could not start");
  }

  // A still page draws once more when the robot has arrived.
  let alive = true;
  if (still) {
    planet.robotReady.then(() => {
      if (!alive) return;
      drawAt();
      bar.redraw();
    });
  }

  const resizer = new ResizeObserver(() => {
    fitBars();
    planet.resize(aspect());
    config.ySquares = Math.round(X_SQUARES / aspect());
    if (still) {
      pose = stillPose(aspect());
      drawAt();
      bar.redraw();
    }
  });
  resizer.observe(stage);

  if (!still) {
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    for (const el of skillItems) {
      el.addEventListener("pointerenter", onSkillEnter);
      el.addEventListener("pointerleave", onSkillLeave);
    }
  }
  placeWords();

  const dev = process.env.NODE_ENV !== "production";
  const w = window as unknown as { __b23?: Handle; __lenis?: { scrollTo(y: number, o?: object): void } };
  if (dev) {
    w.__b23 = {
      goTo(i: number) {
        if (!journey) return;
        const k = Math.max(0, Math.min(GO_TO.length - 1, Math.round(i)));
        const top = window.scrollY + journey.getBoundingClientRect().top;
        const y = top + GO_TO[k] * stage.clientHeight;
        if (w.__lenis) w.__lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      },
      spin(rad: number) {
        offset += rad;
        vel = 0;
        quietFor = 0;
      },
      get state() {
        const a = aspect();
        return {
          mode,
          s,
          stops: { pins: [...STOPS], skills: GO_TO[5], contact: GO_TO[6] },
          pose,
          drag: { offset, vel, dragging },
          robotLon: robotLon(pose.yaw),
          pins: STOPS.map((_, k) => {
            const lit = still ? (k === 0 ? 1 : 0) : pinLit(k, s);
            const p = pinScreen(k, pose, a, 1 + 0.3 * lit);
            return { lit, obj: p.obj, foot: p.foot, halfW: p.halfW, hidden: p.hidden, facing: p.facing };
          }),
          textBox: TEXT_BOX,
          words: { cards: STOPS.map((_, k) => cardAt(k, s)), skills: skillsAt(s), ring: activeRing(s), contact: contactAt(s) },
          aspect: a,
        };
      },
    };
  }

  return () => {
    alive = false;
    stage.removeEventListener("pointerdown", onDown);
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerup", onUp);
    stage.removeEventListener("pointercancel", onUp);
    for (const el of skillItems) {
      el.removeEventListener("pointerenter", onSkillEnter);
      el.removeEventListener("pointerleave", onSkillLeave);
    }
    resizer.disconnect();
    bar.destroy();
    planet.dispose();
    if (dev && w.__b23) delete w.__b23;
  };
}
