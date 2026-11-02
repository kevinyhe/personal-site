import type { Rgb } from "@/components/valley/barShader";

/** The robot's baked turn, for the page's side of it (robotTurn.ts), the
 *  worker that paints it (robotPaint.worker.ts) and its bake. */

export const ROBOT_TURN = {
  frames: 72,
  cols: 8,
  /** One frame, px. Wide enough for the robot across its diagonal. At
   *  400 by 340 the robot was soft at 1888 wide, drawn over 800 px tall. */
  width: 800,
  height: 680,
  /** Robot height as a share of the frame: its near side stands closer to
   *  the lens than its box and rises past it: at 0.92, and at 0.76, the
   *  headings facing away had their tops cut off. */
  fill: 0.64,
  /** Rendered at this many times the frame, then scaled down into it. */
  supersample: 2,
  /** The camera looks down at its middle from this many degrees over
   *  level. Level from the axles, end on it was a few thin rods, half the
   *  ink it is side on; from 8 degrees its deck and rails fill it in, and
   *  the wheels still show under the rail. 20 looked down on it. */
  elevation: 8,
  /** The lights it is baked under (heroRobot's `light`): the key from the
   *  upper left and in front, 45 degrees round from the lens and 43 up,
   *  some sky, and a dim fill from the front right, so the shadows have
   *  shape in them. Tops and the faces toward the key are lit, the far
   *  side is in shade, and the robot casts shadows on itself. Under the
   *  band's key, from nearly behind the lens, every face toward the lens
   *  came out the same light grey; with the key 58 degrees round and next
   *  to no sky, its shadows were flat black. At sky 0.35 and fill 0.3 the
   *  shade was a fifth of the lit side, and the parts' own colours (20 to
   *  1 between them) decided most of the picture; at these, with the
   *  parts drawn closer together (colourSpread), the light does. */
  light: {
    key: [-3, 4, 3] as [number, number, number],
    keyI: 3.2,
    sky: 0.15,
    fill: 0.12,
    fillAt: [3, 1, 2] as [number, number, number],
  },
  /** Each part baked in its own colour from the model (heroRobot's
   *  `colours`): the motors, wheels and number plate black, the metal
   *  light. In the one grey every part was the same stuff, and the robot
   *  came out one even texture, its wheels lost in it. */
  colours: true,
  /** How far apart the parts' greys stay (heroRobot's `colourSpread`): at
   *  0.5 black plastic is 0.10 and the light metal 0.45, 4.5 to 1 rather
   *  than 20 to 1, still darker but no longer the main thing in it. */
  colourSpread: 0.5,
  /** The frame it drives in on: side on, facing left, 55 degrees short
   *  of frame 0, the rail and the wheels at both ends of it in view. */
  drive: 61,
  /** Rollers in each of an omni wheel's two rings (tools/bake_hero.mjs);
   *  the rings are offset by half a gap, so it looks the same every half
   *  of 1/rollers of a turn. */
  rollers: 11,
  /** Frames after the turn's: the drive frame with its wheels (hubs,
   *  plates and rollers) rolled on through one ring's gap, 1/rollers of a
   *  turn, in this many steps. At a twenty-fourth of a turn a step was
   *  nearly a whole repeat, and they seemed still. */
  spins: 16,
  /** The heading of frame 0, radians: the band's three-quarter view, its
   *  front to the left and toward the viewer. Yaw ±π faces straight left
   *  (heroRobot.ts: forward is +x at yaw 0, the camera on its right). */
  firstYaw: -0.6 - Math.PI / 2,
};

export const frameSrc = (k: number): string => `/models/robot-turn/${String(k).padStart(2, "0")}.webp`;

/** What the page tells the worker. Sizes in the canvas's own pixels. */
export type PaintRequest =
  | { kind: "start"; under: OffscreenCanvas; bars: OffscreenCanvas }
  | { kind: "outlines"; ink: number[][] }
  | { kind: "size"; w: number; h: number; spacing: number }
  | { kind: "colours"; ground: Rgb; ink: Rgb }
  | { kind: "want"; k: number };

export type PaintReply = { kind: "firstFrameIn" } | { kind: "failed"; message: string };
