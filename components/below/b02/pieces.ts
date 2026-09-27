import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { projects, skillGroups, type Skill } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { LIFT, ROSE, WHITE } from "./timeline";

/**
 * The 42 skills as 42 solid pieces: what each one is, which colour it is
 * cast in, which card it goes to when the knot comes apart, and the two
 * shapes and the face texture they are made from.
 */

export type BodyColour = "white" | "blossom" | "plum" | "rose";
const BODY_HEX: Record<BodyColour, string> = { white: WHITE, blossom: BLOSSOM, plum: LIFT, rose: ROSE };

export type Piece = {
  skill: Skill;
  group: number;
  groupLabel: string;
  cube: boolean;
  colour: BodyColour;
  /** Half its width in the knot, in scene units (the screen is 10 high). */
  size: number;
  /** The card it goes to, or -1 for the few that stay loose. */
  card: number;
  role: "corner" | "orbit" | "loose";
  /** Which corner, which place in the orbit, which loose spot. */
  place: number;
};

/** A stack entry that is a skill under another name. */
const ALIAS: Record<string, string> = { ESP32: "ESP32 / ESP8266", MPU6050: "IMUs & sensor fusion" };

const lum = (hex: string): number => {
  const v = parseInt(hex.replace("#", ""), 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a: string, b: string): number => {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** The colour a mark is drawn in on a body: the brand's, unless it would
 *  not show there. */
export function markColour(p: Piece): string {
  const body = BODY_HEX[p.colour];
  const fallback = p.colour === "plum" ? BLOSSOM : p.colour === "rose" ? WHITE : BAND;
  if (p.colour === "rose") return fallback;
  const icon = skillIcon(p.skill.icon);
  if (!icon) return fallback;
  const brand = `#${icon.hex}`;
  return contrast(brand, body) >= 2.4 ? brand : fallback;
}

export function makePieces(): Piece[] {
  const list: Piece[] = [];
  skillGroups.forEach((g, gi) => {
    g.skills.forEach((skill) => {
      const i = list.length;
      list.push({
        skill, group: gi, groupLabel: g.label,
        cube: (i * 7 + gi * 3) % 5 < 2,
        colour: "white",
        size: 0.6 + 0.07 * skill.depth,
        card: -1, role: "loose", place: 0,
      });
    });
  });

  // Colours. Each piece takes the body its brand colour shows best on,
  // while that body has any left. The counts keep the knot mixed.
  const left: Record<BodyColour, number> = { white: 13, blossom: 12, plum: 11, rose: 6 };
  const order: BodyColour[] = ["white", "blossom", "plum", "rose"];
  // Pieces with a brand colour choose first; the type marks take the rest.
  const byNeed = [...list].sort((a, b) => Number(Boolean(b.skill.icon)) - Number(Boolean(a.skill.icon)));
  byNeed.forEach((p, k) => {
    const icon = skillIcon(p.skill.icon);
    let pick: BodyColour | null = null;
    if (icon) {
      let best = 0;
      for (const c of order) {
        if (c === "rose" || left[c] <= 0) continue;
        const v = contrast(`#${icon.hex}`, BODY_HEX[c]) * (0.85 + 0.3 * (((k * 13) % 7) / 7));
        if (v > best) { best = v; pick = c; }
      }
    }
    if (!pick) pick = [...order].sort((a, b) => left[b] - left[a])[0];
    left[pick] -= 1;
    p.colour = pick;
  });

  // Cards. A project's own tools orbit it; a tool two projects share goes
  // to the one with fewer to choose from.
  const byName = new Map(list.map((p) => [p.skill.name, p]));
  const wanted = projects.map((pr) => pr.stack.map((s) => byName.get(ALIAS[s] ?? s)).filter((p): p is Piece => Boolean(p)));
  const wants = new Map<Piece, number>();
  wanted.forEach((ps) => ps.forEach((p) => wants.set(p, (wants.get(p) ?? 0) + 1)));
  const cards = projects.map((_, i) => i).sort((a, b) => wanted[a].length - wanted[b].length);
  for (const c of cards) {
    const mine = wanted[c].filter((p) => p.role === "loose").sort((a, b) => (wants.get(a) ?? 0) - (wants.get(b) ?? 0));
    mine.slice(0, 3).forEach((p, k) => { p.card = c; p.role = "orbit"; p.place = k; });
  }
  // Four more hold each card by its corners: what is left of its own
  // stack first, then whatever has no card yet.
  for (const c of cards) {
    const own = wanted[c].filter((p) => p.role === "loose");
    const rest = list.filter((p) => p.role === "loose" && !own.includes(p) && !wants.has(p));
    [...own, ...rest].slice(0, 4).forEach((p, k) => { p.card = c; p.role = "corner"; p.place = k; });
  }
  list.filter((p) => p.role === "loose").forEach((p, k) => { p.place = k; });
  return list;
}

/** How many pieces orbit each card, for spacing them round it. */
export function orbitCounts(list: Piece[]): number[] {
  return projects.map((_, c) => list.filter((p) => p.card === c && p.role === "orbit").length);
}

/** The cube: bevelled, 1.6 across at size 1. */
export function makeCube(): THREE.BufferGeometry {
  return new RoundedBoxGeometry(1.6, 1.6, 1.6, 5, 0.3);
}

/**
 * The puck: a thick disc with rolled edges, 2 across and 1 thick at size
 * 1, turned from a profile. The caps carry the mark, seen from above on
 * the top and from below on the bottom, so neither is mirrored. The ring
 * at the waist is doubled because the two halves map the texture
 * opposite ways and must not share a vertex.
 */
export function makePuck(): THREE.BufferGeometry {
  const R = 1, T = 0.5, B = 0.2, AROUND = 56, ARC = 7;
  type Ring = { r: number; y: number; nr: number; ny: number; top: boolean };
  const rings: Ring[] = [];
  rings.push({ r: 0, y: T, nr: 0, ny: 1, top: true });
  rings.push({ r: R - B, y: T, nr: 0, ny: 1, top: true });
  for (let i = 1; i <= ARC; i += 1) {
    const a = (i / ARC) * (Math.PI / 2);
    rings.push({ r: R - B + Math.sin(a) * B, y: T - B + Math.cos(a) * B, nr: Math.sin(a), ny: Math.cos(a), top: true });
  }
  rings.push({ r: R, y: 0, nr: 1, ny: 0, top: true });
  rings.push({ r: R, y: 0, nr: 1, ny: 0, top: false });
  for (let i = 0; i <= ARC; i += 1) {
    const a = (i / ARC) * (Math.PI / 2);
    rings.push({ r: R - B + Math.cos(a) * B, y: -(T - B) - Math.sin(a) * B, nr: Math.cos(a), ny: -Math.sin(a), top: false });
  }
  rings.push({ r: 0, y: -T, nr: 0, ny: -1, top: false });

  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const g of rings) {
    for (let k = 0; k <= AROUND; k += 1) {
      const a = (k / AROUND) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      pos.push(cx * g.r, g.y, cz * g.r);
      nor.push(cx * g.nr, g.ny, cz * g.nr);
      const u = (cx * g.r) / (2 * R);
      uv.push(g.top ? 0.5 + u : 0.5 - u, 0.5 - (cz * g.r) / (2 * R));
    }
  }
  const row = AROUND + 1;
  for (let i = 0; i < rings.length - 1; i += 1) {
    // Nothing to join between the two rings at the waist.
    if (rings[i].top !== rings[i + 1].top) continue;
    for (let k = 0; k < AROUND; k += 1) {
      const a = i * row + k, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/** The ball a piece collides as, as a share of its size. */
export const colliderOf = (cube: boolean): number => (cube ? 0.95 : 0.9);

const SIDE = 384;

/**
 * One face: the body colour, a ring pressed into it, and the mark. The
 * canvas is drawn in pixels of its own, which have nothing to do with the
 * page's.
 */
export function drawFace(canvas: HTMLCanvasElement, p: Piece, family: string): void {
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const body = BODY_HEX[p.colour];
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, SIDE, SIDE);

  const dark = p.colour === "plum" || p.colour === "rose";
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(42,13,30,0.16)";
  ctx.lineWidth = SIDE * 0.012;
  ctx.beginPath();
  if (p.cube) ctx.roundRect(SIDE * 0.13, SIDE * 0.13, SIDE * 0.74, SIDE * 0.74, SIDE * 0.12);
  else ctx.arc(SIDE / 2, SIDE / 2, SIDE * 0.35, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = markColour(p);
  const icon = skillIcon(p.skill.icon);
  if (icon) {
    const w = SIDE * (p.cube ? 0.44 : 0.4);
    ctx.save();
    ctx.translate((SIDE - w) / 2, (SIDE - w) / 2);
    ctx.scale(w / 24, w / 24);
    ctx.fill(new Path2D(icon.path));
    ctx.restore();
    return;
  }
  const mark = p.skill.mark ?? p.skill.name.slice(0, 2);
  const h = SIDE * (mark.length > 2 ? 0.2 : 0.27);
  ctx.font = `700 ${h}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(mark, SIDE / 2, SIDE / 2 + h * 0.04);
}
