import { petalPath } from "@/components/petalGlyphs";
import { skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";

/**
 * Two small pictures the scene samples. Only grey matters: the bar dither
 * reads brightness, so there is no colour here.
 *
 *   flowers  three open blossoms and three loose petals, for the trees
 *            and the petals that fall from them.
 *   marks    one cell per skill: its icon, or its short mark set as type,
 *            white on clear. The pebble shader cuts it out of the pebble
 *            in black, so the plum ground shows through in its shape.
 */

export const FLOWER_COLS = 4;
const FLOWER_CELL = 128;
export const BLOSSOM_CELLS = [0, 1, 2] as const;
export const PETAL_CELLS = [3, 4, 5] as const;

export const MARK_COLS = 8;
const MARK_CELL = 128;

/** Every skill in page order, with its group. */
export const SKILLS = skillGroups.flatMap((g, c) => g.skills.map((s) => ({ ...s, group: c })));

const centre = (i: number, cols: number, cell: number): [number, number] => [((i % cols) + 0.5) * cell, (Math.floor(i / cols) + 0.5) * cell];

/** A petal's grey: pale at the tip, a touch darker at the claw. */
function petalFill(ctx: CanvasRenderingContext2D): CanvasGradient {
  const g = ctx.createLinearGradient(0, -0.5, 0, 0.5);
  g.addColorStop(0, "#c9c9c9");
  g.addColorStop(0.5, "#ececec");
  g.addColorStop(1, "#fbfbfb");
  return g;
}

export function drawFlowers(canvas: HTMLCanvasElement): void {
  canvas.width = FLOWER_COLS * FLOWER_CELL;
  canvas.height = 2 * FLOWER_CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fill = petalFill(ctx);

  // Open blossoms: five petals round a darker heart.
  BLOSSOM_CELLS.forEach((cell, v) => {
    const [cx, cy] = centre(cell, FLOWER_COLS, FLOWER_CELL);
    const petal = FLOWER_CELL * 0.46;
    for (let p = 0; p < 5; p += 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((p / 5) * Math.PI * 2 + v * 0.5);
      ctx.translate(0, petal * 0.5);
      ctx.scale(petal, petal);
      ctx.fillStyle = fill;
      ctx.fill(petalPath((p + v) % 3));
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, FLOWER_CELL * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "#8a8a8a";
    ctx.fill();
  });

  // Loose petals, most of a cell long.
  PETAL_CELLS.forEach((cell, v) => {
    const [cx, cy] = centre(cell, FLOWER_COLS, FLOWER_CELL);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(FLOWER_CELL * 0.84, FLOWER_CELL * 0.84);
    ctx.fillStyle = fill;
    ctx.fill(petalPath(v));
    ctx.restore();
  });
}

export function drawMarks(canvas: HTMLCanvasElement, sansFamily: string): void {
  const rows = Math.ceil(SKILLS.length / MARK_COLS);
  canvas.width = MARK_COLS * MARK_CELL;
  canvas.height = rows * MARK_CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  SKILLS.forEach((skill, i) => {
    const [cx, cy] = centre(i, MARK_COLS, MARK_CELL);
    const icon = skillIcon(skill.icon);
    if (icon) {
      const size = MARK_CELL * 0.58;
      ctx.save();
      ctx.translate(cx - size / 2, cy - size / 2);
      ctx.scale(size / 24, size / 24);
      ctx.fill(new Path2D(icon.path));
      ctx.restore();
    } else {
      const mark = skill.mark ?? skill.name.slice(0, 2);
      ctx.font = `700 ${Math.round(MARK_CELL * (mark.length > 2 ? 0.3 : 0.4))}px ${sansFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mark, cx, cy + MARK_CELL * 0.02);
    }
  });
}

export const markRows = (): number => Math.ceil(SKILLS.length / MARK_COLS);
