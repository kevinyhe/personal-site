/**
 * The depth chart behind design k5: contour lines of a smooth noise field,
 * traced once by marching squares onto a canvas and then only moved.
 *
 * Every line is the same fine hairline.
 */

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Three octaves; `s` is the feature size in px. */
function field(x: number, y: number, s: number): number {
  let sum = 0;
  let amp = 1;
  let f = 1 / s;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += amp * valueNoise(x * f, y * f, 7 + o);
    norm += amp;
    amp *= 0.45;
    f *= 2.1;
  }
  return sum / norm;
}

export type ChartColors = { ink: string; ground: string };

/** Draws the chart into `canvas`, sized w x h css px. */
export function drawContours(canvas: HTMLCanvasElement, w: number, h: number, colors: ChartColors): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const step = w < 700 ? 5 : 6;
  const cols = Math.ceil(w / step) + 1;
  const rows = Math.ceil(h / step) + 1;
  const s = Math.max(260, Math.min(w, 1400) * 0.42);
  const vals = new Float32Array(cols * rows);
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = field(i * step, j * step, s);
      vals[j * cols + i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }

  const levels = 24;
  g.lineJoin = "round";
  g.lineCap = "round";

  for (let k = 1; k < levels; k++) {
    const iso = lo + ((hi - lo) * k) / levels;
    const segs: number[] = [];
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = vals[j * cols + i];
        const b = vals[j * cols + i + 1];
        const c = vals[(j + 1) * cols + i + 1];
        const d = vals[(j + 1) * cols + i];
        const code = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const x = i * step;
        const y = j * step;
        // Edge crossings: top, right, bottom, left.
        const t = (): [number, number] => [x + ((iso - a) / (b - a)) * step, y];
        const r = (): [number, number] => [x + step, y + ((iso - b) / (c - b)) * step];
        const bo = (): [number, number] => [x + ((iso - d) / (c - d)) * step, y + step];
        const l = (): [number, number] => [x, y + ((iso - a) / (d - a)) * step];
        const add = (p: [number, number], q: [number, number]): void => {
          segs.push(p[0], p[1], q[0], q[1]);
        };
        switch (code) {
          case 1: case 14: add(l(), bo()); break;
          case 2: case 13: add(bo(), r()); break;
          case 3: case 12: add(l(), r()); break;
          case 4: case 11: add(t(), r()); break;
          case 6: case 9: add(t(), bo()); break;
          case 7: case 8: add(l(), t()); break;
          case 5: add(l(), t()); add(bo(), r()); break;
          case 10: add(t(), r()); add(l(), bo()); break;
        }
      }
    }

    g.beginPath();
    for (let n = 0; n < segs.length; n += 4) {
      g.moveTo(segs[n], segs[n + 1]);
      g.lineTo(segs[n + 2], segs[n + 3]);
    }
    g.strokeStyle = colors.ink;
    g.globalAlpha = w < 1024 ? 0.16 : 0.2;
    g.lineWidth = 0.5;
    g.stroke();
  }
  g.globalAlpha = 1;
}
