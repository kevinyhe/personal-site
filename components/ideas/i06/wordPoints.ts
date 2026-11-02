/** Evenly spread points over a word's glyphs, for the flock to land on. */

export type Point = { x: number; y: number };
/** A point on the word, with the direction of the stroke through it (radians, 0 = across). */
export type Spot = Point & { angle: number };

const LLOYD_ROUNDS = 10;

function inkPixels(text: string, font: string, sizePx: number): Point[] {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("wordPoints: no 2D context");
  probe.font = font;
  const width = Math.ceil(probe.measureText(text).width + sizePx);
  const height = Math.ceil(sizePx * 1.6);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("wordPoints: no 2D context");
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = sizePx * 0.03;
  ctx.fillText(text, width / 2, height / 2);
  ctx.strokeText(text, width / 2, height / 2);
  const alpha = ctx.getImageData(0, 0, width, height).data;
  const grid = Math.max(1, Math.round(sizePx / 70));
  const pixels: Point[] = [];
  for (let y = 0; y < height; y += grid) {
    for (let x = 0; x < width; x += grid) {
      if (alpha[(y * width + x) * 4 + 3] > 128) pixels.push({ x, y });
    }
  }
  if (!pixels.length) throw new Error(`wordPoints: "${text}" drew nothing in ${font}`);
  return pixels;
}

function farthestFirst(pixels: Point[], count: number): Point[] {
  const picked: Point[] = [pixels[0]];
  const nearest = pixels.map((p) => (p.x - pixels[0].x) ** 2 + (p.y - pixels[0].y) ** 2);
  while (picked.length < count) {
    let far = 0;
    for (let i = 1; i < pixels.length; i += 1) if (nearest[i] > nearest[far]) far = i;
    const next = pixels[far];
    picked.push({ x: next.x, y: next.y });
    for (let i = 0; i < pixels.length; i += 1) {
      nearest[i] = Math.min(nearest[i], (pixels[i].x - next.x) ** 2 + (pixels[i].y - next.y) ** 2);
    }
  }
  return picked;
}

function nearestCentre(p: Point, centres: Point[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let c = 0; c < centres.length; c += 1) {
    const d = (p.x - centres[c].x) ** 2 + (p.y - centres[c].y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Lloyd's relaxation. Each centre is then snapped to the ink pixel nearest
 * it, so none lands in a gap, and given the main axis of its own cell's
 * pixels, which is the stroke's direction there.
 */
function relax(pixels: Point[], centres: Point[]): Spot[] {
  for (let round = 0; round < LLOYD_ROUNDS; round += 1) {
    const sums = centres.map(() => ({ x: 0, y: 0, n: 0 }));
    for (const p of pixels) {
      const s = sums[nearestCentre(p, centres)];
      s.x += p.x;
      s.y += p.y;
      s.n += 1;
    }
    sums.forEach((s, c) => {
      if (s.n) centres[c] = { x: s.x / s.n, y: s.y / s.n };
    });
  }
  const spread = centres.map(() => ({ xx: 0, xy: 0, yy: 0, nearest: pixels[0], nearestD: Infinity }));
  for (const p of pixels) {
    const c = nearestCentre(p, centres);
    const dx = p.x - centres[c].x;
    const dy = p.y - centres[c].y;
    const s = spread[c];
    s.xx += dx * dx;
    s.xy += dx * dy;
    s.yy += dy * dy;
    if (dx * dx + dy * dy < s.nearestD) {
      s.nearestD = dx * dx + dy * dy;
      s.nearest = p;
    }
  }
  return spread.map((s) => ({ x: s.nearest.x, y: s.nearest.y, angle: 0.5 * Math.atan2(2 * s.xy, s.xx - s.yy) }));
}

/** `count` points over `text` set in `font`, centred on the ink's own box. */
export function wordPoints(text: string, font: string, sizePx: number, count: number): Spot[] {
  const pixels = inkPixels(text, font, sizePx);
  const points = relax(pixels, farthestFirst(pixels, count));
  const box = pixels.reduce(
    (b, p) => ({ left: Math.min(b.left, p.x), right: Math.max(b.right, p.x), top: Math.min(b.top, p.y), bottom: Math.max(b.bottom, p.y) }),
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity },
  );
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  return points.map((p) => ({ x: p.x - cx, y: p.y - cy, angle: p.angle }));
}
