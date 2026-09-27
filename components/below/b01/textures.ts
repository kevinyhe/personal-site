import * as THREE from "three";
import { BLOSSOM } from "@/components/bandColours";
import type { Skill } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";

/**
 * Every picture in the scene, drawn here on a canvas. Nothing is loaded
 * from a file.
 */

export const DEEP = "#1a0812";
export const PINK = BLOSSOM;
export const WHITE = "#ffffff";
/** The two colours of this design's own: a warm one that goes with the
 *  key light, and a darker pink for the second accent. */
export const APRICOT = "#ffb36b";
export const ROSE = "#d1527f";

export type Fonts = { mono: string; sans: string };

/** A brand colour that would not show on the dark ground: black, and the
 *  deep blues and greens. Those marks are drawn in pink instead. */
export function tooDark(hex: string): boolean {
  const v = parseInt(hex, 16);
  return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255) < 80;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  return [c, ctx];
}

function texture(c: HTMLCanvasElement, anisotropy = 4): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** Four units of floor: plum, a dot at every unit, a brighter one at every
 *  fourth. Repeats. */
export function floorTexture(anisotropy: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = "#2d0d25";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const main = i === 0 && j === 0;
      ctx.fillStyle = main ? "rgba(249,185,220,0.95)" : "rgba(249,185,220,0.5)";
      ctx.beginPath();
      // Drawn at the tile's corner as well as inside it, so the dot at a
      // seam is whole.
      for (const ox of [0, 512]) {
        for (const oz of [0, 512]) {
          ctx.moveTo(i * 128 + ox, j * 128 + oz);
          ctx.arc(i * 128 + ox, j * 128 + oz, main ? 7 : 4.5, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
  }
  const t = texture(c, anisotropy);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A soft round patch of light, for the floor under the robot. */
export function glowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,112,176,0.55)");
  g.addColorStop(0.35, "rgba(240,100,180,0.22)");
  g.addColorStop(1, "rgba(240,100,180,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return texture(c, 1);
}

/** The top of a skill's puck: a dark face, a pink rim, and the skill's
 *  mark in its brand colour, or its letters where it has no mark. */
export function markTexture(skill: Skill, fonts: Fonts): THREE.CanvasTexture {
  const [c, ctx] = canvas(160, 160);
  ctx.fillStyle = PINK;
  ctx.fillRect(0, 0, 160, 160);
  ctx.fillStyle = DEEP;
  ctx.beginPath();
  ctx.arc(80, 80, 69, 0, Math.PI * 2);
  ctx.fill();
  const icon = skillIcon(skill.icon);
  if (icon) {
    ctx.fillStyle = tooDark(icon.hex) ? PINK : `#${icon.hex}`;
    ctx.translate(80, 80);
    ctx.scale(3.5, 3.5);
    ctx.translate(-12, -12);
    ctx.fill(new Path2D(icon.path));
  } else {
    const mark = skill.mark ?? skill.name.slice(0, 2);
    ctx.fillStyle = PINK;
    ctx.font = `700 ${mark.length > 2 ? 46 : 60}px ${fonts.sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark, 80, 84);
  }
  return texture(c, 8);
}

/** Painted on the floor at a site: a dashed circle where the card opens,
 *  and the site's number at the near edge. */
export function zoneTexture(label: string, fonts: Fonts): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 1024);
  ctx.strokeStyle = "rgba(249,185,220,0.85)";
  ctx.lineWidth = 7;
  ctx.setLineDash([10, 26]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(512, 512, 496, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(249,185,220,0.9)";
  ctx.font = `500 120px ${fonts.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, 512, 940);
  return texture(c, 8);
}

/** A word painted on the floor. Returns the texture and its shape, width
 *  over height. */
export function wordTexture(word: string, fonts: Fonts): { map: THREE.CanvasTexture; aspect: number } {
  const size = 96;
  const [probe, pctx] = canvas(8, 8);
  pctx.font = `500 ${size}px ${fonts.mono}`;
  const spaced = word.toUpperCase().split("").join(" ");
  const w = Math.ceil(pctx.measureText(spaced).width) + 48;
  probe.width = 0;
  const [c, ctx] = canvas(w, 160);
  ctx.font = `500 ${size}px ${fonts.mono}`;
  ctx.fillStyle = "rgba(249,185,220,0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spaced, w / 2, 84);
  return { map: texture(c, 8), aspect: w / 160 };
}

/** Arrowheads pointing up the picture, for the lane to the gate. */
export function laneTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.strokeStyle = "rgba(249,185,220,0.8)";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(68, 176);
  ctx.lineTo(128, 96);
  ctx.lineTo(188, 176);
  ctx.stroke();
  const t = texture(c, 8);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A round target: rings, and a warm middle. */
export function targetTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rings = [WHITE, ROSE, WHITE, ROSE, APRICOT];
  rings.forEach((colour, i) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(128, 128, 128 - i * 25, 0, Math.PI * 2);
    ctx.fill();
  });
  return texture(c, 8);
}

/** The ring's floor: a white canvas with a pink square marked on it. */
export function ringFloorTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = "#fbeef4";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = ROSE;
  ctx.lineWidth = 10;
  ctx.strokeRect(96, 96, 320, 320);
  ctx.fillStyle = PINK;
  ctx.beginPath();
  ctx.arc(256, 256, 54, 0, Math.PI * 2);
  ctx.fill();
  return texture(c, 8);
}

/** A robotics field from above: six tiles by six, and a route drawn over
 *  them with its waypoints. `route` is in field units, -0.5..0.5. */
export function fieldTexture(route: Float32Array, stops: { x: number; z: number }[]): THREE.CanvasTexture {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const tile = S / 6;
  for (let i = 0; i < 6; i += 1) {
    for (let j = 0; j < 6; j += 1) {
      ctx.fillStyle = (i + j) % 2 ? "#5b2747" : "#663052";
      ctx.fillRect(i * tile, j * tile, tile, tile);
    }
  }
  ctx.strokeStyle = "rgba(26,8,18,0.7)";
  ctx.lineWidth = 4;
  for (let i = 0; i <= 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * tile, 0);
    ctx.lineTo(i * tile, S);
    ctx.moveTo(0, i * tile);
    ctx.lineTo(S, i * tile);
    ctx.stroke();
  }
  const px = (v: number) => (v + 0.5) * S;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 12;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < route.length / 2; i += 1) {
    if (i === 0) ctx.moveTo(px(route[0]), px(route[1]));
    else ctx.lineTo(px(route[i * 2]), px(route[i * 2 + 1]));
  }
  ctx.closePath();
  ctx.stroke();
  stops.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? APRICOT : WHITE;
    ctx.beginPath();
    ctx.arc(px(s.x), px(s.z), i === 0 ? 30 : 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = DEEP;
    ctx.lineWidth = 5;
    ctx.stroke();
  });
  return texture(c, 8);
}

/** The planet's bands, wrapped round a ball. */
export function planetTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 256);
  const bands: [number, string][] = [
    [0, "#f6d7c2"], [0.12, APRICOT], [0.2, "#f7c9a0"], [0.31, PINK], [0.4, "#fbe3ee"], [0.47, APRICOT],
    [0.55, "#f3b48a"], [0.63, PINK], [0.72, ROSE], [0.78, "#f2a9c4"], [0.88, APRICOT], [1, "#f6d7c2"],
  ];
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [stop, colour] of bands) g.addColorStop(stop, colour);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  // Streaks, so the bands are not ruled lines. A fixed sequence: the same
  // planet every time.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "120,40,80"},${0.05 + rnd() * 0.1})`;
    ctx.fillRect(rnd() * 512, rnd() * 256, 40 + rnd() * 160, 2 + rnd() * 5);
  }
  return texture(c, 4);
}

/** The planet's rings seen flat: circles of pink with gaps between. */
export function ringsTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const lanes: [number, number, string][] = [
    [0.64, 0.7, "rgba(249,185,220,0.55)"],
    [0.71, 0.82, "rgba(255,255,255,0.8)"],
    [0.84, 0.9, "rgba(255,179,107,0.75)"],
    [0.92, 0.99, "rgba(249,185,220,0.6)"],
  ];
  for (const [from, to, colour] of lanes) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = (to - from) * 256;
    ctx.beginPath();
    ctx.arc(256, 256, ((from + to) / 2) * 256, 0, Math.PI * 2);
    ctx.stroke();
  }
  return texture(c, 8);
}
