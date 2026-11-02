/** Idea 10: the colour schemes the knob turns through. Each is a full-screen layer blended over the page; the site's own plum has none. */

export type Scheme = {
  name: string;
  /** The tick by the knob, and the label when it is picked. */
  mark: string;
  /** The layer over the page: a solid colour and how it blends. Null for the site's own colours. */
  tint: { colour: string; blend: "color" | "saturation" } | null;
  scanlines: boolean;
};

export const SCHEMES: Scheme[] = [
  { name: "Plum", mark: "#e0457f", tint: null, scanlines: false },
  { name: "Phosphor", mark: "#3dff5c", tint: { colour: "hsl(125, 42%, 50%)", blend: "color" }, scanlines: true },
  { name: "Amber", mark: "#ffa31a", tint: { colour: "hsl(34, 68%, 50%)", blend: "color" }, scanlines: true },
  { name: "Print", mark: "#e8e8e8", tint: { colour: "#808080", blend: "saturation" }, scanlines: false },
];
