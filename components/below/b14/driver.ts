import { education, projects, skillGroups } from "@/components/profile";
import { elsewhere, EMAIL } from "@/components/siteContent";
import * as L from "./layout";
import { createPrinter, type Fonts, type Printer } from "./print";
import { buildPaper } from "./scene";
import { type Content, FACE_KEYS, type Hot, type Printed, printFace } from "./sheet";

/**
 * Joins the page to the paper. Each frame it reads how far the page has
 * scrolled, turns that into a number of turned sheets, moves the camera,
 * and lays the links over the page that is showing. Nothing here goes
 * through React: it all changes every frame.
 *
 *   journey  the pinned scene, driven by scroll.
 *   flat     reduced motion or a narrow screen: each page printed flat,
 *            one to a screen, no turning. No WebGL needed.
 */

export const CONTENT: Content = {
  projects,
  skillGroups,
  email: EMAIL,
  links: elsewhere,
  school: education.school,
  degree: `${education.degree}, ${education.when}`,
};

type LenisLike = { scrollTo(target: number, options?: { immediate?: boolean }): void };
type Box = { x0: number; y0: number; x1: number; y1: number };
type DevState = {
  mode: "journey" | "flat";
  u: number;
  turns: number;
  sheet: number;
  t: number;
  aspect: number;
  camera: L.Cam;
  /** The page in view on the right, and the one turning: corners as % of the stage, and depth in front of the lens. */
  corners: { name: string; points: { x: number; y: number; depth: number }[] }[];
  links: { href: string; box: Box }[];
  faces: string[];
  printed: Record<string, { headline: Printed["headline"]; overflow: number }>;
};
type DevHandle = { goTo(i: number): void; turn(t: number): void; readonly state: DevState };

const pct = (v: number): number => Math.round(v * 1000) / 10;

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`b14: ${selector} is missing`);
  return el;
}

/** The families next/font gave the three faces, read off hidden spans the page carries. */
export function readFonts(root: HTMLElement): Fonts {
  const fam = (face: string): string => getComputedStyle(need<HTMLElement>(root, `[data-font="${face}"]`)).fontFamily;
  return { serif: fam("serif"), sans: fam("sans"), mono: fam("mono") };
}

/** Resolves once the weights the pages use are loaded, or after a second and a half either way. */
function fontsIn(f: Fonts): Promise<void> {
  const loads = [
    `italic 400 100px ${f.serif}`,
    `300 100px ${f.sans}`,
    `italic 300 100px ${f.sans}`,
    `400 100px ${f.sans}`,
    `500 100px ${f.sans}`,
    `400 100px ${f.mono}`,
    `500 100px ${f.mono}`,
  ].map((s) => document.fonts.load(s).catch(() => []));
  return Promise.race([Promise.all(loads).then(() => undefined), new Promise<void>((done) => setTimeout(done, 1500))]);
}

/** An invisible link laid over a printed one. The real link is in the section's text; this is for the pointer. */
function hotAnchor(h: Hot): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = h.href;
  if (!h.href.startsWith("mailto:")) {
    a.target = "_blank";
    a.rel = "noreferrer";
  }
  a.className = "b14-hot";
  a.title = h.label;
  a.setAttribute("aria-hidden", "true");
  a.tabIndex = -1;
  a.style.cssText = "position:absolute;display:none;pointer-events:auto";
  return a;
}

// ------------------------------------------------------------ flat

/** Prints every page onto the canvases the flat layout carries, and lays the links over them. */
export function startFlat(root: HTMLElement): () => void {
  const fonts = readFonts(root);
  const printer = createPrinter(fonts);
  let alive = true;
  const made: HTMLAnchorElement[] = [];
  const draw = (): void => {
    if (!alive) return;
    for (const a of made) a.remove();
    made.length = 0;
    root.querySelectorAll<HTMLCanvasElement>("canvas[data-flat]").forEach((canvas) => {
      const key = canvas.dataset.flat ?? "";
      const printed = printFace(key, CONTENT, printer.measure);
      printer.print(canvas, printed);
      const layer = canvas.parentElement?.querySelector<HTMLElement>("[data-flat-hot]");
      if (!layer) return;
      for (const h of printed.hot) {
        const a = hotAnchor(h);
        a.style.display = "block";
        a.style.left = `${(h.x0 / L.TEX_W) * 100}%`;
        a.style.top = `${(h.y0 / L.TEX_H) * 100}%`;
        a.style.width = `${((h.x1 - h.x0) / L.TEX_W) * 100}%`;
        a.style.height = `${((h.y1 - h.y0) / L.TEX_H) * 100}%`;
        layer.appendChild(a);
        made.push(a);
      }
    });
  };
  void fontsIn(fonts).then(draw);
  return () => {
    alive = false;
    for (const a of made) a.remove();
    printer.dispose();
  };
}

// ------------------------------------------------------------ journey

/** Starts the scene. Returns what stops it. Throws if WebGL cannot start, before it has touched the page. */
export function startJourney(root: HTMLElement): () => void {
  const journey = need<HTMLElement>(root, "[data-journey]");
  const stage = need<HTMLElement>(root, "[data-stage]");
  const slot = need<HTMLElement>(stage, "[data-canvas]");
  const hotLayer = need<HTMLElement>(stage, "[data-hot]");
  const count = root.querySelector<HTMLElement>("[data-count]");
  const fonts = readFonts(root);
  const printer: Printer = createPrinter(fonts);
  let ready = false;
  const printed: Record<string, Printed> = {};

  const paint = (key: string, canvas: HTMLCanvasElement): void => {
    const p = printFace(key, CONTENT, printer.measure);
    printed[key] = p;
    // Until the fonts are in, the face is left as bare paper rather than
    // printed in a stand-in face and then visibly swapped.
    if (ready) printer.print(canvas, p);
    else {
      canvas.width = L.TEX_W;
      canvas.height = L.TEX_H;
      canvas.getContext("2d")?.drawImage(printer.paper, 0, 0);
    }
  };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  const paper = ((): ReturnType<typeof buildPaper> => {
    try {
      return buildPaper(canvas, printer.paper, paint);
    } catch (error) {
      printer.dispose();
      throw error;
    }
  })();
  slot.appendChild(canvas);

  let alive = true;
  let stageW = 1;
  let stageH = 1;
  let aspect = 1.85;
  let u = 0;
  let turns = 0;
  const cam = L.makeCam();
  const spot: L.Spot = { x: 0, y: 0, depth: 0 };
  const point: L.Vec3 = { x: 0, y: 0, z: 0 };
  const curl: L.Curl = { xc: 0, r: 0, skew: 0, base: 0 };

  void fontsIn(fonts).then(() => {
    if (!alive) return;
    ready = true;
    paper.reprint();
    // The links were measured in the stand-in face; lay them out again.
    setLinks("");
    dirty = true;
  });

  // Links over the page on the right, while it lies still.
  type Link = { a: HTMLAnchorElement; hot: Hot; box: Box };
  let links: Link[] = [];
  let linksFor = "";
  const setLinks = (key: string): void => {
    if (key === linksFor) return;
    for (const l of links) l.a.remove();
    links = [];
    linksFor = key;
    const p = key ? printed[key] : undefined;
    if (!p) return;
    links = p.hot.map((hot) => {
      const a = hotAnchor(hot);
      hotLayer.appendChild(a);
      return { a, hot, box: { x0: 0, y0: 0, x1: 0, y1: 0 } };
    });
  };
  /** Screen box of a rectangle on the front of sheet j, lying on the right pile. */
  const frontBox = (j: number, r: Box, out: Box): void => {
    L.curlAt(j, 0, curl);
    const jit = L.offsetAt(j, 0);
    out.x0 = Infinity;
    out.y0 = Infinity;
    out.x1 = -Infinity;
    out.y1 = -Infinity;
    for (const [x, y] of [
      [r.x0, r.y0],
      [r.x1, r.y0],
      [r.x0, r.y1],
      [r.x1, r.y1],
    ]) {
      L.sheetPoint((x / L.TEX_W) * L.PAGE_W, y / L.TEX_H, curl, jit, point);
      L.project(point, cam, aspect, spot);
      out.x0 = Math.min(out.x0, spot.x);
      out.y0 = Math.min(out.y0, spot.y);
      out.x1 = Math.max(out.x1, spot.x);
      out.y1 = Math.max(out.y1, spot.y);
    }
  };
  const placeLinks = (): void => {
    const k = Math.round(turns);
    const still = Math.abs(turns - k) < 0.015 && ready;
    setLinks(still ? `f${k}` : "");
    for (const l of links) {
      frontBox(k, l.hot, l.box);
      const s = l.a.style;
      s.display = "block";
      s.left = `${(l.box.x0 * 100).toFixed(3)}%`;
      s.top = `${(l.box.y0 * 100).toFixed(3)}%`;
      s.width = `${((l.box.x1 - l.box.x0) * 100).toFixed(3)}%`;
      s.height = `${((l.box.y1 - l.box.y0) * 100).toFixed(3)}%`;
    }
  };

  let shownCount = -1;
  const TITLES = [...projects.map((p) => p.title), "Skills", "Contact"];
  let dirty = true;
  let lastU = NaN;

  const frame = (): void => {
    u = -journey.getBoundingClientRect().top / stageH;
    // A still page is drawn once, not sixty times a second.
    if (u === lastU && !dirty) return;
    lastU = u;
    dirty = false;
    turns = L.turnsAt(u);
    L.cameraAt(turns, aspect, cam);
    paper.frame(turns, cam);
    placeLinks();
    const step = Math.round(turns);
    if (count && step !== shownCount) {
      shownCount = step;
      count.textContent = `${String(step + 1).padStart(2, "0")} / ${String(L.SHEETS).padStart(2, "0")}   ${TITLES[step]}`;
    }
  };

  const measure = (): void => {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    aspect = stageW / stageH;
    paper.resize(stageW, stageH);
    dirty = true;
  };

  // ---------------------------------------------------------- the loop
  let raf = 0;
  let running = false;
  let onScreen = false;
  const tick = (): void => {
    raf = requestAnimationFrame(tick);
    frame();
  };
  // Draw only while the stage can be seen and the tab is the one in front.
  const sync = (): void => {
    const should = onScreen && !document.hidden;
    if (should && !running) {
      running = true;
      dirty = true;
      raf = requestAnimationFrame(tick);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  };
  const seen = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    sync();
  });
  seen.observe(stage);
  document.addEventListener("visibilitychange", sync);
  // Changing the canvas's size empties it, so draw at once.
  const sized = new ResizeObserver(() => {
    measure();
    frame();
  });
  sized.observe(stage);
  measure();
  frame();

  // ---------------------------------------------------- the dev handle
  const host = window as unknown as { __b14?: DevHandle; __lenis?: LenisLike };
  let handle: DevHandle | null = null;
  if (process.env.NODE_ENV === "development") {
    const scrollToU = (target: number): void => {
      const y = journey.getBoundingClientRect().top + window.scrollY + target * stageH;
      if (host.__lenis) host.__lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    };
    const corners = (name: string, j: number, tj: number): DevState["corners"][number] => {
      L.curlAt(j, tj, curl);
      const jit = L.offsetAt(j, tj);
      const points: DevState["corners"][number]["points"] = [];
      for (const [s, zn] of [
        [0, 0],
        [L.PAGE_W, 0],
        [L.PAGE_W, 1],
        [0, 1],
        [L.PAGE_W / 2, 0.5],
      ]) {
        L.sheetPoint(s, zn, curl, jit, point);
        L.project(point, cam, aspect, spot);
        points.push({ x: pct(spot.x), y: pct(spot.y), depth: Math.round(spot.depth * 100) / 100 });
      }
      return { name, points };
    };
    handle = {
      goTo(i: number): void {
        scrollToU(L.STOPS_U[L.clamp(Math.round(i), 0, L.STOPS_U.length - 1)]);
      },
      turn(t: number): void {
        scrollToU(L.scrollFor(t));
      },
      get state(): DevState {
        const k = Math.min(L.SHEETS - 1, Math.floor(turns));
        const t = turns - k;
        const list = [corners(`front of sheet ${k}`, k, 0)];
        if (t > 0) list.push(corners(`sheet ${k} turning`, k, t));
        const out: DevState["printed"] = {};
        for (const key of FACE_KEYS) if (printed[key]) out[key] = { headline: printed[key].headline, overflow: printed[key].overflow };
        return {
          mode: "journey",
          u: Math.round(u * 1000) / 1000,
          turns: Math.round(turns * 1000) / 1000,
          sheet: k,
          t: Math.round(t * 1000) / 1000,
          aspect,
          camera: JSON.parse(JSON.stringify(cam)) as L.Cam,
          corners: list,
          links: links.map((l) => ({ href: l.hot.href, box: { x0: pct(l.box.x0), y0: pct(l.box.y0), x1: pct(l.box.x1), y1: pct(l.box.y1) } })),
          faces: paper.resident(),
          printed: out,
        };
      },
    };
    host.__b14 = handle;
  }

  return () => {
    alive = false;
    running = false;
    cancelAnimationFrame(raf);
    seen.disconnect();
    sized.disconnect();
    document.removeEventListener("visibilitychange", sync);
    setLinks("");
    if (handle && host.__b14 === handle) delete host.__b14;
    paper.dispose();
    printer.dispose();
    canvas.remove();
  };
}
