import { BAND, BLOSSOM } from "@/components/bandColours";
import { skillGroups } from "@/components/profile";
import { type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import {
  camAt,
  cardAt,
  contactAt,
  CONTACT_ARRIVE,
  GO_TO,
  LAYOUT,
  PLAQUE_OUT,
  PLAQUE_Y,
  placeAt,
  forwardAt,
  type Pose,
  poseAtU,
  project,
  S_END,
  SIDES,
  skillsAt,
  STOPS,
  TAB_H,
  tabletAt,
  uAt,
  type Walk,
} from "./path";
import { buildTunnel } from "./scene";

/**
 * Drives the walk through the gates from the page's scroll. The bar
 * shader's own frame loop calls back here once a frame while the stage is
 * on screen: read the scroll, place the camera, draw the scene, set the
 * words. Nothing runs while the stage is off screen or the tab is hidden,
 * because the bar shader stops its loop then.
 */

export type Mode = "journey" | "still";

/** How far the cursor turns the head, in radians: about four degrees across, two and a half up and down. */
const HEAD_YAW = 0.07;
const HEAD_PITCH = 0.045;
/** Cells across the bar grid. */
const X_SQUARES = 320;
const MAX_BAR_W = 2560;
/** Walking speed (metres a second) at which the sway is full. */
const FULL_SWAY_AT = 14;
/** The still frame: halfway down the first run, looking along the tunnel. */
const STILL_U = 12;

type Handle = { goTo(i: number): void; readonly state: unknown };

export function startWalk(root: HTMLElement, mode: Mode): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("canvas[data-bars]");
  const journey = root.querySelector<HTMLElement>("[data-journey]");
  if (!stage || !bars) throw new Error("b22: stage missing");
  const still = mode === "still";

  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
  const scrims = Array.from(root.querySelectorAll<HTMLElement>("[data-scrim]"));
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const skillItems = Array.from(root.querySelectorAll<HTMLElement>("[data-skill]"));
  const groupItems = Array.from(root.querySelectorAll<HTMLElement>("[data-group]"));
  const contactLayer = root.querySelector<HTMLElement>("[data-contact-layer]");
  const hint = root.querySelector<HTMLElement>("[data-hint]");

  const tablets: { row: number; col: number }[] = [];
  skillGroups.forEach((g, row) => g.skills.forEach((_, col) => tablets.push({ row, col })));

  const aspect = (): number => Math.max(0.4, stage.clientWidth / Math.max(1, stage.clientHeight));
  const scrollS = (): number => {
    if (!journey) return 0;
    const h = Math.max(1, stage.clientHeight);
    return Math.max(0, Math.min(S_END, -journey.getBoundingClientRect().top / h));
  };

  // The cursor's pull on the head, eased so it never snaps.
  let wantYaw = 0;
  let wantPitch = 0;
  let headYaw = 0;
  let headPitch = 0;
  const onPointer = (e: PointerEvent): void => {
    wantYaw = -((e.clientX / Math.max(1, window.innerWidth)) * 2 - 1) * HEAD_YAW;
    wantPitch = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1) * HEAD_PITCH;
  };

  // Styles are written only when they change, so a still scroll costs no style work.
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
  let u = uAt(0);
  let pose: Pose = camAt(0);
  // The walking sway: how strong it is (follows the walking speed) and where in the step it is.
  let sway = 0;
  let phase = 0;
  let settle = false;
  let walk: Walk = { lat: 0, bob: 0, roll: 0 };

  const placeWords = (): void => {
    const a = aspect();
    cards.forEach((el, k) => {
      const v = still ? 0 : cardAt(k, s);
      set(el, "opacity", v.toFixed(3));
      set(el, "transform", `translateY(calc(-50% + ${((1 - v) * 1.5).toFixed(2)}vh))`);
      set(el, "pointer-events", v > 0.5 ? "auto" : "none");
    });
    const sk = still ? 0 : skillsAt(s);
    scrims.forEach((el) => {
      const side = el.dataset.scrim === "right" ? 1 : -1;
      let v = 0;
      STOPS.forEach((_, k) => {
        if (SIDES[k] === side) v = Math.max(v, cardAt(k, s));
      });
      // The group names sit on the left while the rack is up.
      if (side < 0) v = Math.max(v, sk * 0.85);
      set(el, "opacity", v.toFixed(3));
    });
    set(skillsLayer, "opacity", sk.toFixed(3));
    set(skillsLayer, "visibility", sk > 0.001 ? "visible" : "hidden");
    if (sk > 0.001) {
      tablets.forEach((t, i) => {
        const c = tabletAt(t.row, t.col);
        const p = project(pose, { x: c.x, y: c.y - TAB_H / 2 - 0.03, z: c.z }, a);
        set(skillItems[i], "left", `${(p.x * 100).toFixed(2)}%`);
        set(skillItems[i], "top", `${(p.y * 100).toFixed(2)}%`);
      });
      groupItems.forEach((el, r) => {
        const p = project(pose, tabletAt(r, 0), a);
        set(el, "top", `${(p.y * 100).toFixed(2)}%`);
      });
    }
    const c = still ? 0 : contactAt(s);
    set(contactLayer, "opacity", c.toFixed(3));
    set(contactLayer, "pointer-events", c > 0.5 ? "auto" : "none");
    set(hint, "opacity", still ? "0" : (0.75 * (1 - Math.min(1, s / 0.3))).toFixed(3));
  };

  const tick = (time: number, dt: number): void => {
    s = scrollS();
    const nu = uAt(s);
    const speed = dt > 0 ? Math.abs(nu - u) / dt : 0;
    u = nu;
    if (settle) {
      // A jump (goTo) is not a walk.
      sway = 0;
      settle = false;
    } else {
      const want = Math.min(1, speed / FULL_SWAY_AT);
      sway += (want - sway) * Math.min(1, dt * 3);
    }
    // One step to each side a second or so, a little quicker when walking fast.
    if (sway > 0.005) phase += dt * Math.PI * 2 * (0.7 + 0.35 * sway);
    walk = {
      lat: 0.05 * sway * Math.sin(phase),
      bob: 0.03 * sway * Math.sin(phase * 2),
      roll: 0.01 * sway * Math.sin(phase),
    };
    const ease = Math.min(1, dt * 4);
    headYaw += (wantYaw - headYaw) * ease;
    headPitch += (wantPitch - headPitch) * ease;
    const base = poseAtU(u, walk);
    pose = { ...base, yaw: base.yaw + headYaw, pitch: base.pitch + headPitch };
    tunnel.draw(pose, time);
    placeWords();
  };

  const sansFamily = getComputedStyle(root).fontFamily || "sans-serif";
  const glCanvas = document.createElement("canvas");
  const tunnel = buildTunnel(glCanvas, { animated: !still, sansFamily, update: still ? undefined : tick });
  tunnel.resize(aspect());

  const drawStill = (): void => {
    pose = poseAtU(STILL_U);
    tunnel.draw(pose, 3);
  };
  if (still) drawStill();

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
    // Upside down, as the band above is: a light grey is a wide blossom
    // bar on the plum, so the daylight between the posts draws the widest
    // bars and the dark posts almost none.
    blackPoint: 235,
    whitePoint: 18,
    threshold: 255,
    xSquares: X_SQUARES,
    ySquares: Math.round(X_SQUARES / aspect()),
    minSquareWidth: "-2%",
    maxSquareWidth: "100%",
    bgOpacity: 1,
    fillOpacity: 1,
  };
  const bar = createBarCanvas(bars, [{ type: "canvas", source: tunnel.source, config }], {
    colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
    fps: 60,
  });
  if (!bar) {
    tunnel.dispose();
    throw new Error("b22: bar shader could not start");
  }

  // The plaques and tablets were painted with whatever font was ready; paint them again once Inter is in.
  let alive = true;
  document.fonts?.ready
    .then(() => {
      if (!alive) return;
      tunnel.repaint();
      if (still) {
        drawStill();
        bar.redraw();
      }
    })
    .catch(() => {});

  const resizer = new ResizeObserver(() => {
    fitBars();
    tunnel.resize(aspect());
    config.ySquares = Math.round(X_SQUARES / aspect());
    if (still) {
      drawStill();
      bar.redraw();
    }
  });
  resizer.observe(stage);

  if (!still) window.addEventListener("pointermove", onPointer, { passive: true });
  placeWords();

  const dev = process.env.NODE_ENV !== "production";
  const w = window as unknown as { __b22?: Handle; __lenis?: { scrollTo(y: number, o?: object): void } };
  if (dev) {
    w.__b22 = {
      goTo(i: number) {
        if (!journey) return;
        const k = Math.max(0, Math.min(GO_TO.length - 1, Math.round(i)));
        const top = window.scrollY + journey.getBoundingClientRect().top;
        const y = top + GO_TO[k] * stage.clientHeight;
        settle = true;
        if (w.__lenis) w.__lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      },
      get state() {
        const a = aspect();
        const plaques = LAYOUT.plaqueU.map((pu) => {
          const c = placeAt(pu, 0);
          const f = forwardAt(pu);
          return project(pose, { x: c.x - f.x * PLAQUE_OUT, y: PLAQUE_Y, z: c.z - f.z * PLAQUE_OUT }, a);
        });
        return {
          mode,
          s,
          u,
          sway,
          stops: { projects: [...STOPS], skills: GO_TO[5], contact: GO_TO[6], contactArrive: CONTACT_ARRIVE },
          pose,
          plaques,
          words: { cards: STOPS.map((_, k) => cardAt(k, s)), skills: skillsAt(s), contact: contactAt(s) },
          aspect: a,
        };
      },
    };
  }

  return () => {
    alive = false;
    window.removeEventListener("pointermove", onPointer);
    resizer.disconnect();
    bar.destroy();
    tunnel.dispose();
    if (dev && w.__b22) delete w.__b22;
  };
}
