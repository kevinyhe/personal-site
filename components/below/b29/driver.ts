import * as THREE from "three";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { type BarCanvas, type BarLayerConfig, type CanvasSource, createBarCanvas, hexToRgb, type Rgb } from "@/components/valley/barShader";
import * as L from "./layout";
import { buildScene } from "./scene";

/**
 * Runs the page: reads the scroll, works out the season and the camera,
 * hands the frame to the scene, and places the words. The bar canvas owns
 * the loop: it draws only while it is on screen and the tab is in front,
 * and each of its frames asks the scene for a new picture first
 * (source.update below).
 *
 *   journey  the pinned year round the tree, words laid over it.
 *   still    one frame of the tree in bloom, the words as blocks below.
 */

export type Mode = "journey" | "still";

type LenisLike = { scrollTo(y: number, o?: { immediate?: boolean }): void };
type Share = { x: number; y: number };
type DevHandle = {
  goTo(i: number): void;
  readonly state: unknown;
  stops: { name: string; u: number; scrollY: number }[];
};

/** The page's deeper plum, for the night. */
const DEEP = "#1a0812";
const WHITE: Rgb = [1, 1, 1];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: Rgb): string => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
/** The bars are this many across at any width, about one rem each. */
const BAR_COLUMNS = 240;
/** No drawing buffer wider than this. */
const MAX_BUFFER_W = 2560;

export function startSeasons(root: HTMLElement, mode: Mode): () => void {
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const bars = root.querySelector<HTMLCanvasElement>("[data-bars]");
  if (!stage || !bars) throw new Error("b29: stage missing");
  const journey = mode === "journey" ? root.querySelector<HTMLElement>("[data-journey]") : null;
  const still = mode === "still";

  const scene = buildScene();
  // Set once the bar canvas exists; the colours are painted through it.
  let bar: BarCanvas | null = null;

  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
  const skillsLayer = root.querySelector<HTMLElement>("[data-skills-layer]");
  const markers = Array.from(root.querySelectorAll<HTMLElement>("[data-skill]"));
  const groupLabels = Array.from(root.querySelectorAll<HTMLElement>("[data-group]"));
  const contact = root.querySelector<HTMLElement>("[data-contact-body]");
  const hint = root.querySelector<HTMLElement>("[data-hint]");
  const seasonMarks = Array.from(root.querySelectorAll<HTMLElement>("[data-season]"));
  const seasonRow = root.querySelector<HTMLElement>("[data-season-row]");

  // ------------------------------------------------------------ sizes
  let stageW = 1;
  let stageH = 1;
  let dirty = true;
  const config: BarLayerConfig = {
    x: "0%",
    y: "0%",
    width: "100%",
    height: "100%",
    // Upside down, as the band's robot is: a bright face is a wide bar,
    // so blossom and snow are solid and the dark between them is empty.
    blackPoint: 200,
    whitePoint: 38,
    threshold: 255,
    xSquares: BAR_COLUMNS,
    ySquares: 130,
    minSquareWidth: "-2%",
    maxSquareWidth: "80%",
    bgOpacity: 0,
    fillOpacity: 1,
  };
  const measure = (): void => {
    const r = stage.getBoundingClientRect();
    stageW = Math.max(2, r.width);
    stageH = Math.max(2, r.height);
    scene.setSize(stageW, stageH);
    config.ySquares = Math.max(20, Math.round((BAR_COLUMNS * stageH) / stageW));
    // The bar canvas sizes its buffer from its own CSS box. On a very wide
    // screen that box is drawn smaller and scaled up, so the buffer stays
    // under MAX_BUFFER_W. The bars are the same count either way.
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const k = Math.max(1, (stageW * ratio) / MAX_BUFFER_W);
    stage.style.setProperty("--b29-k", k.toFixed(4));
    dirty = true;
  };
  measure();

  // ----------------------------------------------------------- cursor
  let aimX = 0;
  let aimY = 0;
  let px = 0;
  let py = 0;
  let moved = 0;
  let stir = 0;
  const onPointer = (e: PointerEvent): void => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    moved += Math.hypot(x - aimX, y - aimY);
    aimX = x;
    aimY = y;
  };
  if (!still) window.addEventListener("pointermove", onPointer, { passive: true });

  // Skill blossoms: the one under the cursor or in focus grows and is named.
  let hover = -1;
  const off: (() => void)[] = [];
  markers.forEach((m, k) => {
    const on = (): void => {
      hover = k;
    };
    const out = (): void => {
      if (hover === k) hover = -1;
    };
    m.addEventListener("pointerenter", on);
    m.addEventListener("pointerleave", out);
    m.addEventListener("focusin", on);
    m.addEventListener("focusout", out);
    off.push(() => {
      m.removeEventListener("pointerenter", on);
      m.removeEventListener("pointerleave", out);
      m.removeEventListener("focusin", on);
      m.removeEventListener("focusout", out);
    });
  });

  // ------------------------------------------------------------ frame
  const pose: L.Pose = { pos: [0, 0, 0], target: [0, 0, 0] };
  const look: L.Look = { bloom: 0, leaves: 0, turn: 0, snow: 0, petalFall: 0, leafFall: 0 };
  const at = { x: 0, y: 0, z: 0 };
  const world = new THREE.Vector3();
  let u = 0;
  let season = 0;
  let night = 0;
  let wasBuilt = false;
  const painted = { cards: cards.map(() => -1), skills: -1, colours: "", contact: -1, hint: -1, season: -1 };

  const readU = (): number => {
    if (!journey) return 0;
    return L.clamp(-journey.getBoundingClientRect().top / stageH, 0, L.U_END);
  };

  const place = (el: HTMLElement, s: Share): void => {
    el.style.left = `${(s.x * 100).toFixed(2)}%`;
    el.style.top = `${(s.y * 100).toFixed(2)}%`;
  };

  const paintColours = (snow: number, dark: number): void => {
    const key = `${snow.toFixed(3)} ${dark.toFixed(3)}`;
    if (key === painted.colours) return;
    painted.colours = key;
    const ground = mixRgb(hexToRgb(BAND), hexToRgb(DEEP), dark);
    // Snow draws in white; the rest of the year in blossom.
    const ink = mixRgb(hexToRgb(BLOSSOM), WHITE, snow * 0.85);
    stage.style.backgroundColor = css(ground);
    bar?.setColors(ground, ink);
  };

  const frame = (time: number, dt: number): boolean => {
    const built = scene.built();
    if (built !== wasBuilt) {
      wasBuilt = built;
      dirty = true;
    }
    if (still) {
      if (!dirty) return false;
      dirty = false;
      L.lookAt(5, look);
      look.petalFall = 0;
      scene.render({ u: L.U_END, time: 0, dt: 0, pose: L.STILL_POSE, look, night: 0, pointerX: 0, pointerY: 0, stir: 0, still: true, hover: -1, skills: 0 });
      paintColours(0, 0);
      return true;
    }
    dirty = false;
    u = readU();
    season = L.seasonAt(u);
    L.lookAt(season, look);
    night = L.nightAt(u);
    const ease = 1 - Math.exp(-dt * 2.5);
    px += (aimX - px) * ease;
    py += (aimY - py) * ease;
    // How much the cursor moved lately, eased so a flick stirs the twigs for a moment.
    stir += (Math.min(1, moved * 3) - stir) * (1 - Math.exp(-dt * 3));
    moved = 0;
    L.poseAt(u, pose);
    // The camera leans a little with the cursor too, so the tree has depth.
    pose.target[0] += px * 0.25;
    pose.target[1] -= py * 0.15;
    const sk = L.skillsAmount(u);
    scene.render({ u, time, dt, pose, look, night, pointerX: px, pointerY: py, stir, still: false, hover, skills: Math.max(sk, L.smooth(5.5, 6.1, u)) });

    // Project text, on the side away from its plaque.
    for (let i = 0; i < cards.length; i += 1) {
      const a = L.cardAmount(i, u);
      const q = Math.round(a * 100) / 100;
      if (q === painted.cards[i]) continue;
      painted.cards[i] = q;
      const c = cards[i];
      c.style.opacity = q.toFixed(2);
      c.style.transform = `translateY(${((1 - q) * 3).toFixed(2)}vh)`;
      c.style.visibility = q > 0 ? "visible" : "hidden";
      c.style.pointerEvents = q > 0.6 ? "auto" : "none";
    }

    // The season's name, in the row at the foot of the stage.
    const si = u > L.SKILLS_FROM - 0.6 ? -1 : Math.round(L.clamp(season, 0, 4));
    if (si !== painted.season) {
      painted.season = si;
      seasonMarks.forEach((el, k) => {
        el.style.opacity = k === si ? "1" : "0.35";
      });
      if (seasonRow) seasonRow.style.opacity = si < 0 ? "0" : "1";
    }

    // Skills: the layer fades in while the skills section is pinned, and each mark sits on its blossom.
    if (skillsLayer && Math.abs(sk - painted.skills) > 0.004) {
      painted.skills = sk;
      skillsLayer.style.opacity = sk.toFixed(3);
      skillsLayer.style.visibility = sk > 0 ? "visible" : "hidden";
    }
    if (sk > 0) {
      const lowest = [0, 0, 0, 0, 0];
      const centre = [0, 0, 0, 0, 0].map(() => ({ x: 0, n: 0 }));
      for (let k = 0; k < markers.length && k < scene.skillCount; k += 1) {
        scene.toScreen(scene.skillWorld(k, world), at);
        place(markers[k], at);
        const g = Number(markers[k].dataset.groupIndex ?? 0);
        lowest[g] = Math.max(lowest[g], at.y);
        centre[g].x += at.x;
        centre[g].n += 1;
        markers[k].style.pointerEvents = sk > 0.7 ? "auto" : "none";
      }
      groupLabels.forEach((el, g) => {
        const c = centre[g];
        if (!c.n) return;
        place(el, { x: c.x / c.n, y: lowest[g] + 0.035 });
      });
    }

    paintColours(look.snow * (1 - night), night);
    const ct = L.smooth(7.25, 7.7, u);
    if (contact && Math.abs(ct - painted.contact) > 0.004) {
      painted.contact = ct;
      contact.style.opacity = ct.toFixed(3);
      contact.style.visibility = ct > 0 ? "visible" : "hidden";
    }
    const h = u < 0.3 ? 1 : 0;
    if (hint && h !== painted.hint) {
      painted.hint = h;
      hint.style.opacity = h ? "0.7" : "0";
    }
    return true;
  };

  // ------------------------------------------------------- the canvas
  const source: CanvasSource = { canvas: scene.canvas, animated: true, update: (time, dt) => frame(time, dt) };
  bar = createBarCanvas(bars, [{ type: "canvas", source, config }], {
    colors: () => ({ bg: hexToRgb(BAND), fill: hexToRgb(BLOSSOM) }),
    defaults: { bgOpacity: 0 },
    fps: still ? 4 : 60,
    powerPreference: "high-performance",
  });
  if (!bar) {
    window.removeEventListener("pointermove", onPointer);
    for (const f of off) f();
    scene.dispose();
    throw new Error("b29: bar canvas could not start");
  }

  const sized = new ResizeObserver(() => measure());
  sized.observe(stage);

  // ---------------------------------------------------- the dev handle
  const host = window as unknown as { __b29?: DevHandle; __lenis?: LenisLike };
  let handle: DevHandle | null = null;
  if (process.env.NODE_ENV === "development") {
    const names = ["work 1 winter", "work 2 spring", "work 3 summer", "work 4 autumn", "work 5 winter", "skills", "contact"];
    const us = [...L.STOP_U, (L.SKILLS_FROM + L.SKILLS_TO) / 2, L.U_END];
    const scrollFor = (v: number): number => (journey ? journey.getBoundingClientRect().top + window.scrollY + v * stageH : 0);
    const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
    handle = {
      goTo(i: number) {
        const v = us[Math.max(0, Math.min(us.length - 1, i))];
        const y = scrollFor(v);
        if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      },
      get state() {
        const box = stage.getBoundingClientRect();
        const rect = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return { x0: pct((r.left - box.left) / box.width), y0: pct((r.top - box.top) / box.height), x1: pct((r.right - box.left) / box.width), y1: pct((r.bottom - box.top) / box.height) };
        };
        const v = new THREE.Vector3();
        return {
          mode,
          u: Number(u.toFixed(3)),
          season: Number(season.toFixed(3)),
          look: Object.fromEntries(Object.entries(look).map(([k, x]) => [k, Number(x.toFixed(3))])),
          night: Number(night.toFixed(3)),
          treeBuilt: scene.built(),
          camera: { pos: pose.pos.map((x) => Number(x.toFixed(2))), target: pose.target.map((x) => Number(x.toFixed(2))) },
          cards: cards.map((c, i) => ({ i, shown: painted.cards[i], rect: rect(c) })),
          plaques: [0, 1, 2, 3, 4].map((i) => {
            const o = { x: 0, y: 0, z: 0 };
            scene.toScreen(scene.plaqueWorld(i, v), o);
            return { x: pct(o.x), y: pct(o.y), behind: o.z > 1 };
          }),
          skillsShown: painted.skills,
          hover,
        };
      },
      stops: names.map((name, i) => ({ name, u: us[i], scrollY: Math.round(scrollFor(us[i])) })),
    };
    host.__b29 = handle;
  }

  const barCanvas = bar;
  return () => {
    sized.disconnect();
    window.removeEventListener("pointermove", onPointer);
    for (const f of off) f();
    barCanvas.destroy();
    scene.dispose();
    if (handle && host.__b29 === handle) delete host.__b29;
  };
}
