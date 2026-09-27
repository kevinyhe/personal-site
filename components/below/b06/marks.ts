import { skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";
import { markColour, PINK } from "./layout";

/**
 * One sheet with the mark of every skill on it, drawn on a canvas and
 * handed to the scene as a texture. A brand's mark is its simple-icons
 * path. A skill with no brand gets its short name in type.
 */

export const SHEET = { cols: 7, rows: 6, cell: 192 } as const;

export type FlatSkill = { name: string; icon?: string; mark?: string; group: number };

export const flatSkills: FlatSkill[] = skillGroups.flatMap((g, gi) =>
  g.skills.map((s) => ({ name: s.name, icon: s.icon, mark: s.mark, group: gi })),
);

/** Where skill i's cell is on the sheet, as the shader reads it: x, y,
 *  width, height, with y counted up from the foot of the sheet. */
export function cellOf(i: number): [number, number, number, number] {
  const col = i % SHEET.cols;
  const row = Math.floor(i / SHEET.cols);
  return [col / SHEET.cols, 1 - (row + 1) / SHEET.rows, 1 / SHEET.cols, 1 / SHEET.rows];
}

export function newSheet(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SHEET.cols * SHEET.cell;
  canvas.height = SHEET.rows * SHEET.cell;
  return canvas;
}

export function drawSheet(canvas: HTMLCanvasElement, monoFamily: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const c = SHEET.cell;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  flatSkills.forEach((skill, i) => {
    const x = (i % SHEET.cols) * c;
    const y = Math.floor(i / SHEET.cols) * c;
    const icon = skillIcon(skill.icon);
    ctx.save();
    if (icon) {
      // The path is drawn on a 24 by 24 grid. Leave a margin round it so
      // nothing of the next cell is read at the mark's edge.
      const pad = c * 0.14;
      ctx.translate(x + pad, y + pad);
      ctx.scale((c - 2 * pad) / 24, (c - 2 * pad) / 24);
      ctx.fillStyle = markColour(icon.hex);
      ctx.fill(new Path2D(icon.path));
    } else {
      const text = skill.mark ?? skill.name.slice(0, 2).toUpperCase();
      const size = c * (text.length > 2 ? 0.34 : 0.46);
      ctx.font = `700 ${size}px ${monoFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PINK;
      ctx.fillText(text, x + c / 2, y + c / 2 + size * 0.04);
    }
    ctx.restore();
  });
}
