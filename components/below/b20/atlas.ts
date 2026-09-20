import { BLOSSOM_TINT_PALE, petalGradient, petalPath } from "@/components/petalGlyphs";
import { skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";

/**
 * One picture holding every small shape the scene draws: the three loose
 * petals, and a five-petal blossom for each skill with its mark in the
 * middle. Grey levels matter, not colour: the bar dither reads brightness.
 * The mark is drawn black so the dither cuts it out of the blossom and the
 * plum ground shows through in its shape.
 */

export const ATLAS_COLS = 8;
const CELL = 128;
export const ATLAS_SIZE = ATLAS_COLS * CELL;
export const PETAL_CELLS = 3;
export const SKILL_CELL0 = PETAL_CELLS;

/** Every skill in page order, with its group, so blossoms can be matched to cells. */
export const SKILLS = skillGroups.flatMap((g, c) => g.skills.map((s) => ({ ...s, group: c })));

export function drawAtlas(canvas: HTMLCanvasElement, sansFamily: string): void {
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  const fill = petalGradient(ctx, BLOSSOM_TINT_PALE);

  const cellCentre = (i: number): [number, number] => [((i % ATLAS_COLS) + 0.5) * CELL, (Math.floor(i / ATLAS_COLS) + 0.5) * CELL];

  // The loose petals, one cell each, length most of the cell.
  for (let v = 0; v < PETAL_CELLS; v += 1) {
    const [cx, cy] = cellCentre(v);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(CELL * 0.86, CELL * 0.86);
    ctx.fillStyle = fill;
    ctx.fill(petalPath(v));
    ctx.restore();
  }

  // A blossom per skill.
  SKILLS.forEach((skill, i) => {
    const [cx, cy] = cellCentre(SKILL_CELL0 + i);
    const petal = CELL * 0.44;
    for (let p = 0; p < 5; p += 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((p / 5) * Math.PI * 2 + i * 0.7);
      // The petal's claw at the centre, its tip outward.
      ctx.translate(0, petal * 0.5);
      ctx.scale(petal, petal);
      ctx.fillStyle = fill;
      ctx.fill(petalPath(p % 3));
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.23, 0, Math.PI * 2);
    ctx.fillStyle = "#fdeff8";
    ctx.fill();

    ctx.fillStyle = "#000000";
    const icon = skillIcon(skill.icon);
    if (icon) {
      const size = CELL * 0.3;
      ctx.save();
      ctx.translate(cx - size / 2, cy - size / 2);
      ctx.scale(size / 24, size / 24);
      ctx.fill(new Path2D(icon.path));
      ctx.restore();
    } else {
      const mark = skill.mark ?? skill.name.slice(0, 2);
      ctx.font = `700 ${Math.round(CELL * (mark.length > 2 ? 0.13 : 0.17))}px ${sansFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mark, cx, cy + CELL * 0.01);
    }
  });
}
