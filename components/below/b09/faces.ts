import { skillGroups } from "@/components/profile";
import { iconColour, skillIcon } from "@/components/skillIcons";
import { BLOSSOM, CREAM, PLUM, WHITE, WINE } from "./layout";

/**
 * The faces of the five skill cards, drawn on canvases. Each shows one
 * group's marks in a grid: the brand's own mark where there is one, two
 * or three letters where there is not.
 */

export const FACE_W = 640;
export const FACE_H = 896;
const GROUNDS = [CREAM, BLOSSOM, WHITE, BLOSSOM, CREAM];
const pad2 = (n: number): string => String(n).padStart(2, "0");

export type Fonts = { sans: string; mono: string };

export function drawFace(canvas: HTMLCanvasElement, group: number, fonts: Fonts): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const g = skillGroups[group];
  canvas.width = FACE_W;
  canvas.height = FACE_H;

  ctx.fillStyle = GROUNDS[group % GROUNDS.length];
  ctx.fillRect(0, 0, FACE_W, FACE_H);

  const edge = 52;
  ctx.fillStyle = PLUM;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `500 26px ${fonts.mono}`;
  ctx.fillText(pad2(group + 1), edge, 84);
  ctx.textAlign = "right";
  ctx.fillText(String(g.skills.length), FACE_W - edge, 84);
  ctx.textAlign = "left";
  ctx.font = `500 40px ${fonts.sans}`;
  ctx.fillText(g.label, edge, 150);
  ctx.fillStyle = WINE;
  ctx.fillRect(edge, 180, FACE_W - edge * 2, 3);

  const cols = 3;
  const rows = Math.ceil(g.skills.length / cols);
  const top = 216;
  const cellW = (FACE_W - edge * 2) / cols;
  const cellH = Math.min(cellW, (FACE_H - top - edge) / rows);
  const size = Math.min(104, cellH * 0.62);

  g.skills.forEach((skill, n) => {
    const cx = edge + cellW * ((n % cols) + 0.5);
    const cy = top + cellH * (Math.floor(n / cols) + 0.5);
    const icon = skillIcon(skill.icon);
    if (icon) {
      // On a light face a mark that is nearly white is drawn in plum.
      const colour = iconColour(icon, false);
      ctx.save();
      ctx.translate(cx - size / 2, cy - size / 2);
      ctx.scale(size / 24, size / 24);
      ctx.fillStyle = colour === "currentColor" ? PLUM : colour;
      ctx.fill(new Path2D(icon.path));
      ctx.restore();
      return;
    }
    const r = size * 0.18;
    ctx.beginPath();
    // An older browser has no rounded box. It gets a square one.
    if (typeof ctx.roundRect === "function") ctx.roundRect(cx - size / 2, cy - size / 2, size, size, r);
    else ctx.rect(cx - size / 2, cy - size / 2, size, size);
    ctx.lineWidth = 4;
    ctx.strokeStyle = PLUM;
    ctx.stroke();
    const mark = skill.mark ?? skill.name.slice(0, 2);
    ctx.fillStyle = PLUM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${Math.round(size * (mark.length > 2 ? 0.34 : 0.42))}px ${fonts.mono}`;
    ctx.fillText(mark, cx, cy + size * 0.03);
  });
}
