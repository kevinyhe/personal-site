import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups } from "@/components/profile";
import { type BarLayerConfig, createBarCanvas, hexToRgb } from "@/components/valley/barShader";
import {
  bigAt,
  bigLitAt,
  camAt,
  cardAt,
  CONTACT_ARRIVE,
  contactAt,
  fieldDownAt,
  GO_TO,
  groundLamp,
  LABEL_DX,
  type Pose,
  project,
  rowLitAt,
  S_END,
  SIDES,
  skillsAt,
  STOPS,
} from "./path";
import { buildNight } from "./scene";

/**
 * Drives the lantern night from the page's scroll. The bar shader's own
 * frame loop calls back here once a frame while the stage is on screen:
 * read the scroll, place the camera, draw the scene, set the words.
 * Nothing runs while the stage is off screen or the tab is hidden, because
 * the bar shader stops its loop then.
 */

export type Mode = "journey" | "still";

/** Cells across the bar grid. */
const X_SQUARES = 300;
const MAX_BAR_W = 2560;

type Handle = { goTo(i: number): void; readonly state: unknown };

export function startLanterns(root: HTMLElement, mode: Mode): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("canvas[data-bars]");
  const journey = root.querySelector<HTMLElement>("[data-journey]");
  if (!stage || !bars) throw new Error("b26: stage missing");
  const still = mode === "still";

  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
  const scrims = Array.from(root.querySelectorAll<HTMLElement>("[data-scrim]"));
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const skillItems = Array.from(root.querySelectorAll<HTMLElement>("[data-skill]"));
  const groupItems = Array.from(root.querySelectorAll<HTMLElement>("[data-group]"));
  const contactLayer = root.querySelector<HTMLElement>("[data-contact-layer]");
  const hint = root.querySelector<HTMLElement>("[data-hint]");

  // Which ground lantern each skill label belongs to.
  const lamps: { row: number; j: number; n: number }[] = [];
  skillGroups.forEach((g, row) => g.skills.forEach((_, j) => lamps.push({ row, j, n: g.skills.length })));

  const aspect = (): number => Math.max(0.4, stage.clientWidth / Math.max(1, stage.clientHeight));
  const scrollS = (): number => {
    if (!journey) return 0;
    const h = Math.max(1, stage.clientHeight);
    return Math.max(0, Math.min(S_END, -journey.getBoundingClientRect().top / h));
  };

  // The cursor, in the stage's -1..1 with y up, and whether it is over the
  // stage. Both are eased every frame so the lanterns part smoothly.
  let wantX = 0;
  let wantY = 0;
  let wantPush = 0;
  const pointer = { x: 0, y: 0, push: 0 };
  const onPointer = (e: PointerEvent): void => {
    const r = stage.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    wantPush = inside ? 1 : 0;
    if (!inside) return;
    wantX = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
    wantY = 1 - ((e.clientY - r.top) / Math.max(1, r.height)) * 2;
  };
  const onLeave = (): void => {
    wantPush = 0;
  };

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
  let pose: Pose = camAt(0);

  const placeWords = (): void => {
    const a = aspect();
    cards.forEach((el, k) => {
      const v = still ? 0 : cardAt(k, s);
      set(el, "opacity", v.toFixed(3));
      set(el, "transform", `translateY(calc(-50% + ${((1 - v) * 1.5).toFixed(2)}vh))`);
      set(el, "pointer-events", v > 0.5 ? "auto" : "none");
    });
    scrims.forEach((el) => {
      const which = el.dataset.scrim;
      let v = 0;
      if (which === "contact") v = still ? 0 : contactAt(s);
      else {
        // A side scrim darkens behind the words, on the side away from the lantern.
        const side = which === "left" ? 1 : -1;
        STOPS.forEach((_, k) => {
          if (SIDES[k] === side) v = Math.max(v, still ? 0 : cardAt(k, s));
        });
      }
      set(el, "opacity", v.toFixed(3));
    });
    const sk = still ? 0 : skillsAt(s);
    set(skillsLayer, "opacity", sk.toFixed(3));
    set(skillsLayer, "visibility", sk > 0.001 ? "visible" : "hidden");
    if (sk > 0.001) {
      lamps.forEach((l, i) => {
        const p = project(pose, groundLamp(l.row, l.j, l.n), a);
        set(skillItems[i], "left", `${((p.x + LABEL_DX) * 100).toFixed(2)}%`);
        set(skillItems[i], "top", `${(p.y * 100).toFixed(2)}%`);
      });
      groupItems.forEach((el, r) => {
        const n = skillGroups[r].skills.length;
        const p = project(pose, groundLamp(r, 0, n), a);
        set(el, "left", `${((p.x - 0.02) * 100).toFixed(2)}%`);
        set(el, "top", `${((p.y - 0.035) * 100).toFixed(2)}%`);
      });
    }
    const c = still ? 0 : contactAt(s);
    set(contactLayer, "opacity", c.toFixed(3));
    set(contactLayer, "pointer-events", c > 0.5 ? "auto" : "none");
    set(hint, "opacity", still ? "0" : (0.7 * (1 - Math.min(1, s / 0.3))).toFixed(3));
  };

  const drawAt = (time: number): void => {
    const down = fieldDownAt(s);
    night.draw({
      pose,
      time,
      bigs: projects.map((_, k) => ({ ...bigAt(k, s), lit: still ? 1 : bigLitAt(k, s) })),
      rows: [0, 1, 2, 3, 4].map((r) => (still ? 0.6 : rowLitAt(r, s))),
      // The floor climbs from below the lanterns' band to just under the camera.
      floor: down > 0.001 ? pose.y - 3 - (1 - down) * 60 : -1000,
      pointer,
    });
  };

  const tick = (time: number, dt: number): void => {
    s = scrollS();
    const ease = Math.min(1, dt * 5);
    pointer.x += (wantX - pointer.x) * ease;
    pointer.y += (wantY - pointer.y) * ease;
    pointer.push += (wantPush - pointer.push) * Math.min(1, dt * 3);
    pose = camAt(s);
    drawAt(time);
    placeWords();
  };

  const fontOf = (sel: string, fallback: string): string => {
    const el = root.querySelector<HTMLElement>(sel);
    return (el && getComputedStyle(el).fontFamily) || fallback;
  };
  const fonts = (): { serif: string; sans: string } => ({
    serif: fontOf("[data-serif]", "Georgia, serif"),
    sans: getComputedStyle(root).fontFamily || "sans-serif",
  });

  const glCanvas = document.createElement("canvas");
  const night = buildNight(glCanvas, { animated: !still, fonts: fonts(), update: still ? undefined : tick });
  night.resize(aspect());

  // The still frame: the first project lantern, with the field about it.
  const stillFrame = (): void => {
    s = STOPS[0];
    pose = camAt(s);
    drawAt(6);
  };
  if (still) stillFrame();

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
    // Upside down: a bright grey is a wide blossom bar on the plum, so the
    // lanterns draw the widest bars and the night sky almost none.
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
  const bar = createBarCanvas(bars, [{ type: "canvas", source: night.source, config }], {
    colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
    fps: 60,
  });
  if (!bar) {
    night.dispose();
    throw new Error("b26: bar shader could not start");
  }

  // The names on the paper are painted again once the page's fonts land.
  let alive = true;
  document.fonts?.ready
    .then(() => {
      if (!alive) return;
      night.repaint(fonts());
      if (still) {
        stillFrame();
        bar.redraw();
      }
    })
    .catch(() => undefined);

  const resizer = new ResizeObserver(() => {
    fitBars();
    night.resize(aspect());
    config.ySquares = Math.round(X_SQUARES / aspect());
    if (still) {
      stillFrame();
      bar.redraw();
    }
  });
  resizer.observe(stage);

  if (!still) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
  }
  placeWords();

  const dev = process.env.NODE_ENV !== "production";
  const w = window as unknown as { __b26?: Handle; __lenis?: { scrollTo(y: number, o?: object): void } };
  if (dev) {
    w.__b26 = {
      goTo(i: number) {
        if (!journey) return;
        const k = Math.max(0, Math.min(GO_TO.length - 1, Math.round(i)));
        const top = window.scrollY + journey.getBoundingClientRect().top;
        const y = top + GO_TO[k] * stage.clientHeight;
        if (w.__lenis) w.__lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      },
      get state() {
        const a = aspect();
        return {
          mode,
          s,
          stops: { projects: [...STOPS], skills: GO_TO[5], contact: GO_TO[6], contactArrive: CONTACT_ARRIVE },
          pose,
          pointer: { ...pointer },
          lanterns: projects.map((_, k) => {
            const at = bigAt(k, s);
            return { lit: still ? 1 : bigLitAt(k, s), at, screen: project(pose, at, a) };
          }),
          words: { cards: STOPS.map((_, k) => cardAt(k, s)), skills: skillsAt(s), contact: contactAt(s) },
          fieldDown: fieldDownAt(s),
          aspect: a,
        };
      },
    };
  }

  return () => {
    alive = false;
    window.removeEventListener("pointermove", onPointer);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    resizer.disconnect();
    bar.destroy();
    night.dispose();
    if (dev && w.__b26) delete w.__b26;
  };
}
