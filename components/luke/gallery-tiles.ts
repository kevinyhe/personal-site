/**
 * Where the gallery's pictures float. x and y are the tile centre's offset
 * from the middle of the screen (vw, vh); w is its width in vw; ratio is
 * width / height; z0 is its depth (px, negative is away from the viewer)
 * at the start of the section. The pictures are the four in public/work;
 * the same picture at a different ratio is a different crop of it.
 *
 * Kept off the middle so that, growing toward the viewer, no tile runs
 * over the sentence for long: perspective pushes an off-centre tile
 * outward as it comes closer.
 */

export type Tile = { src: string; x: number; y: number; w: number; ratio: number; z0: number };

const A = "/work/actually.jpg";
const S = "/work/s-kbd67.jpg";
const K = "/work/king-of-the-ring.jpg";
const M = "/work/mclib.jpg";

export const TILES: Tile[] = [
  { src: S, x: -30, y: -22, w: 15, ratio: 4 / 3, z0: -700 },
  { src: A, x: 32, y: 20, w: 20, ratio: 16 / 10, z0: -1100 },
  { src: K, x: -8, y: 30, w: 22, ratio: 16 / 9, z0: -1500 },
  { src: M, x: 34, y: -18, w: 11, ratio: 3 / 4, z0: -1900 },
  { src: A, x: -36, y: 12, w: 10, ratio: 2 / 3, z0: -2300 },
  { src: K, x: 6, y: -30, w: 14, ratio: 4 / 3, z0: -2700 },
  { src: S, x: 31, y: 4, w: 9, ratio: 1, z0: -3100 },
  { src: M, x: -31, y: -4, w: 12, ratio: 4 / 3, z0: -3500 },
  { src: A, x: -4, y: -24, w: 16, ratio: 16 / 9, z0: -3900 },
  { src: K, x: 18, y: 26, w: 12, ratio: 3 / 4, z0: -4300 },
];

/** On a phone: six, larger, a little closer in. */
export const PHONE_TILES: Tile[] = [
  { src: S, x: -26, y: -24, w: 40, ratio: 4 / 3, z0: -600 },
  { src: A, x: 24, y: 22, w: 46, ratio: 16 / 10, z0: -1200 },
  { src: K, x: -20, y: 26, w: 36, ratio: 1, z0: -1800 },
  { src: M, x: 26, y: -22, w: 30, ratio: 3 / 4, z0: -2400 },
  { src: A, x: -24, y: -8, w: 32, ratio: 4 / 3, z0: -3000 },
  { src: K, x: 22, y: 8, w: 34, ratio: 16 / 9, z0: -3600 },
];
