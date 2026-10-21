import type { SkillGroup } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";

/**
 * A skill group as a picture for BarPicture: up to eight of its skills in
 * two centred rows on black, each as its brand icon in white, or as its
 * short mark set in bold type when it has no icon. Browser only.
 */
export function groupPlate(g: SkillGroup): HTMLCanvasElement {
  const w = 1200;
  const h = 800;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const family = getComputedStyle(document.body).fontFamily;

  const items = g.skills.slice(0, 8);
  const perRow = Math.ceil(items.length / 2);
  const rows = [items.slice(0, perRow), items.slice(perRow)];
  const size = 150;
  const pitch = 260;
  rows.forEach((row, r) => {
    const cy = h / 2 + (r - 0.5) * 300;
    row.forEach((s, k) => {
      const cx = w / 2 + (k - (row.length - 1) / 2) * pitch;
      const icon = skillIcon(s.icon);
      if (icon) {
        ctx.save();
        ctx.translate(cx - size / 2, cy - size / 2);
        ctx.scale(size / 24, size / 24);
        ctx.fill(new Path2D(icon.path));
        ctx.restore();
        return;
      }
      const mark = s.mark ?? s.name.slice(0, 2);
      let fs = size * 0.7;
      ctx.font = `700 ${fs}px ${family}`;
      const m = ctx.measureText(mark).width;
      if (m > size * 1.4) fs *= (size * 1.4) / m;
      ctx.font = `700 ${Math.round(fs)}px ${family}`;
      ctx.fillText(mark, cx, cy);
    });
  });
  return c;
}
