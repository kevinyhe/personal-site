/**
 * A sentence's reflection in water: the live text drawn into a canvas in
 * the page's own fonts, then drawn back upside down a row at a time under
 * it, each row slid sideways by a ripple that runs with the scroll and
 * faded with its depth. Used by the Water and Pond designs.
 */
export type Reflection = {
  /** Re-draw the text from the live element (size, fonts, colour). */
  render(): void;
  /** Draw the reflection for scroll progress p. */
  draw(p: number, reduced: boolean): void;
  dispose(): void;
};

export function createReflection(el: HTMLElement, cv: HTMLCanvasElement, strength = 0.45): Reflection | null {
  const ctx = cv.getContext("2d");
  const off = document.createElement("canvas");
  const octx = off.getContext("2d");
  if (!ctx || !octx) return null;
  let dpr = 1;
  let w = 1;
  let h = 1;
  let last = { p: 0, reduced: false };

  const draw = (p: number, reduced: boolean): void => {
    last = { p, reduced };
    const rows = off.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    // The ripple runs with the scroll; still, it is one gentle bend.
    const phase = reduced ? 0 : p * 40;
    const depth = cv.height;
    for (let y = 0; y < rows; y += 1) {
      const t = y / rows;
      const sway = (Math.sin(t * 28 + phase) * 0.55 + Math.sin(t * 9 - phase * 0.6) * 0.45) * (3 + 10 * t) * dpr;
      ctx.globalAlpha = strength * (1 - t) * (1 - t);
      ctx.drawImage(off, 0, rows - 1 - y, off.width, 1, sway, Math.round((y / rows) * depth), off.width, 2);
    }
    ctx.globalAlpha = 1;
  };

  const render = (): void => {
    const r = el.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, w, h);
    octx.fillStyle = getComputedStyle(el).color;
    octx.textBaseline = "alphabetic";
    // Each word where the live one is, in its own font.
    for (const s of Array.from(el.querySelectorAll<HTMLElement>("[data-word]"))) {
      const cs = getComputedStyle(s);
      const b = s.getBoundingClientRect();
      octx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      octx.letterSpacing = cs.letterSpacing;
      const m = octx.measureText(s.textContent ?? "");
      octx.fillText(s.textContent ?? "", b.left - r.left, b.top - r.top + m.fontBoundingBoxAscent);
    }
    cv.width = off.width;
    cv.height = Math.round(h * 1.15 * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${Math.round(h * 1.15)}px`;
    draw(last.p, last.reduced);
  };

  render();
  void document.fonts.ready.then(render);
  const ro = new ResizeObserver(render);
  ro.observe(el);
  return {
    render,
    draw,
    dispose: () => ro.disconnect(),
  };
}
