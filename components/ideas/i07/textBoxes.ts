/** The boxes round the page's text on screen, so petals can keep off it. */

type Box = { left: number; top: number; right: number; bottom: number };

const TEXT = "h1, h2, h3, p, a, li, button";
/** From this font size up, a line box is mostly air above and below the letters, so the letters' own ink is measured instead. */
const DISPLAY_PX = 48;

export function createTextBoxes(pad: number): { refresh: (height: number) => void; covers: (x: number, y: number) => boolean } {
  let candidates: HTMLElement[] = [];
  let found: Box[] = [];
  let refreshes = 0;
  const range = document.createRange();
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("textBoxes: no 2D context");

  const lineBoxes = (el: HTMLElement): void => {
    range.selectNodeContents(el);
    for (const line of range.getClientRects()) {
      if (line.width === 0 || line.height === 0) continue;
      found.push({ left: line.left - pad, top: line.top - pad, right: line.right + pad, bottom: line.bottom + pad });
    }
  };

  /** Each run of large text by its ink: the baseline from the font's own box, the ink above and below it from the run's letters. */
  const inkBoxes = (el: HTMLElement): void => {
    const runs = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = runs.nextNode(); node; node = runs.nextNode()) {
      const run = node.textContent?.trim();
      const owner = node.parentElement;
      if (!run || !owner) continue;
      const style = getComputedStyle(owner);
      measure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const m = measure.measureText(run);
      const fontTall = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        if (line.width === 0 || line.height === 0) continue;
        const baseline = line.top + (line.height * m.fontBoundingBoxAscent) / fontTall;
        const scale = line.height / fontTall;
        found.push({
          left: line.left - pad,
          top: baseline - m.actualBoundingBoxAscent * scale - pad,
          right: line.right + pad,
          bottom: baseline + m.actualBoundingBoxDescent * scale + pad,
        });
      }
    }
  };

  const refresh = (height: number): void => {
    if (refreshes % 10 === 0) candidates = Array.from(document.querySelectorAll<HTMLElement>(TEXT));
    refreshes += 1;
    found = [];
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -pad || r.top > height + pad || r.width === 0) continue;
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      if (parseFloat(getComputedStyle(el).fontSize) >= DISPLAY_PX) inkBoxes(el);
      else lineBoxes(el);
    }
  };

  const covers = (x: number, y: number): boolean => found.some((b) => x > b.left && x < b.right && y > b.top && y < b.bottom);

  return { refresh, covers };
}
