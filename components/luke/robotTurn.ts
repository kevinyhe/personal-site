import { type PaintReply, type PaintRequest, ROBOT_TURN } from "@/components/luke/robotFrames";
import { MAX_DPR, type Rgb } from "@/components/valley/barShader";

/**
 * The robot in Skills (Skills.tsx).
 *
 * Its turn is baked: heroRobot's shaded render (no plinth), in the
 * model's own colours, standing, seen
 * from a little over level, at ROBOT_TURN.frames headings once round, then
 * ROBOT_TURN.spins more at the heading it drives in on with its wheels
 * rolling, one picture a frame (public/models/robot-turn/00.webp to
 * 87.webp, made by /tools/robot-turn and tools/robot_turn_levels.mjs).
 * Drawn live it needed a WebGL context of its own, and one more on the
 * home page went past the browser's 16: the oldest, the hero's, was lost.
 * In the turn's frames the wheels are rolled as they would be turning on
 * the spot, so they turn as it does.
 *
 * One frame at a time is painted, by a worker (robotPaint.worker.ts), into
 * two canvases laid over the frame's place on the screen: the frame is
 * sized so the robot's body is the height of the box it is handed (less,
 * if the box is too narrow for it), centred in it both ways.
 *
 * With the frames comes each frame's ink box and outline, row by row
 * (public/models/robot-turn.json), so Skills can wipe along the robot's
 * own shape as it drives.
 */

const BOXES = "/models/robot-turn.json";
/** The bars across the screen's width: twice the koi's 200, since the
 *  robot's channels are a few px wide and at 200 ran together. */
const BARS_ACROSS = 400;
/** The bars' least spacing, px: on a phone 400 across is under a pixel
 *  each, and a bar that size is no bar, only the picture. */
const BAR_LEAST = 2;
/** The bars' spacing in the canvas's pixels: BARS_ACROSS to the width,
 *  BAR_LEAST at least, and under 4 of them a whole number. At 820 wide a
 *  bar was 2.05 px, so every 20th gap fell across a pixel line and drew a
 *  dark stripe down the robot. */
function barSpacing(dpr: number): number {
  const spacing = Math.max(window.innerWidth / BARS_ACROSS, BAR_LEAST) * dpr;
  return spacing < 4 ? Math.round(spacing) : spacing;
}

/** The robot in a frame, as shares of its height down
 *  (tools/robot_turn_levels.mjs prints them): the rows that show it at
 *  every heading, so the box it is handed is covered whichever way it
 *  faces; at most headings it runs a little past it, up and down. Framed
 *  by its median top and its lowest wheels, it stopped short of the
 *  groups' foot facing some ways. */
const TOP = 0.165;
const FOOT = 0.878;
/** Its widest ink over the turn against its body's height: a box this
 *  much wider than it is tall holds the robot at every heading. */
export const WIDEST = 1.076;
/** Wheel turns in one frame height of travel (the baker prints it). */
const ROLL = 2.762;
/** The most the wheels turn in one go, in ring gaps: a third of what
 *  they look the same after (half a gap). At their real speed on a fast
 *  scroll they went on about a roller a frame and seemed to stand still
 *  or run backwards, so past this they turn at this. Shown at a quarter
 *  of their real speed instead, they seemed not to turn at all. */
const MOST = 1 / 6;

export type Rect = { left: number; top: number; width: number; height: number };
export type Ink = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Its left and right edges row by row, `step` px tall from
   *  `rowsTop` (the frame's top); NaN where a row has none. */
  rowsTop: number;
  step: number;
  lefts: number[];
  rights: number[];
};

export type RobotTurn = {
  /** Its outlines and the frame it drives in on are in. */
  ready: Promise<void>;
  /** Lays its canvases on `stage` (both screen rects) with the robot's
   *  body in `box`, turned to `yaw` radians; `driving`, on the drive
   *  heading, with its wheels where roll() has rolled them. */
  place(box: Rect, stage: Rect, yaw: number, driving?: boolean): void;
  /** Where its ink is on the screen when placed so. Null until the
   *  outlines are in. */
  ink(box: Rect, yaw: number, driving?: boolean): Ink | null;
  /** Rolls its wheels on by `dx` px of travel (back if negative) with the
   *  body in `box`, at most MOST at a time. */
  roll(box: Rect, dx: number): void;
  /** The page's ground and ink: plum on the cloud's pink, or pink on
   *  plum, which decides which of its faces get the ink. */
  setColors(ground: Rgb, ink: Rgb): void;
  destroy(): void;
};

/** The frame round a body in `box`: the box's height, or its width over
 *  WIDEST if that is less; centred in it both ways. */
function frameRect(box: Rect): Rect {
  const body = Math.min(box.height, box.width / WIDEST);
  const height = body / (FOOT - TOP);
  const width = (height * ROBOT_TURN.width) / ROBOT_TURN.height;
  const foot = box.top + (box.height + body) / 2;
  return { left: box.left + box.width / 2 - width / 2, top: foot - FOOT * height, width, height };
}

/** The frame for a heading: the turn's, or on the drive heading while
 *  `driving`, the spin for its wheels' `gaps` (ring gaps rolled, which
 *  the spin frames run through once). */
function frameOf(yaw: number, driving: boolean, gaps: number): number {
  const { frames, drive, spins } = ROBOT_TURN;
  const turn = (yaw - ROBOT_TURN.firstYaw) / (2 * Math.PI);
  const k = (Math.round((turn - Math.floor(turn)) * frames) % frames + frames) % frames;
  if (k !== drive || !driving) return k;
  return frames + (Math.floor((gaps - Math.floor(gaps)) * spins) % spins);
}

export function createRobotTurn(stage: HTMLElement): RobotTurn {
  const { width, height } = ROBOT_TURN;
  // Made here, since a canvas can be handed to a worker only once and an
  // effect can run twice.
  const under = document.createElement("canvas");
  const bars = document.createElement("canvas");
  for (const layer of [under, bars]) {
    layer.className = "absolute left-0 top-0 block";
    stage.append(layer);
  }
  const stop = new AbortController();
  const worker = new Worker(new URL("./robotPaint.worker.ts", import.meta.url));
  worker.onerror = (e) => {
    throw new Error(`The robot's painter failed: ${e.message}`);
  };
  const tell = (request: PaintRequest, moved: Transferable[] = []): void => worker.postMessage(request, moved);
  const offscreenUnder = under.transferControlToOffscreen();
  const offscreenBars = bars.transferControlToOffscreen();
  tell({ kind: "start", under: offscreenUnder, bars: offscreenBars }, [offscreenUnder, offscreenBars]);

  const firstIn = new Promise<void>((resolve) => {
    worker.onmessage = ({ data: answer }: MessageEvent<PaintReply>) => {
      if (answer.kind === "failed") throw new Error(answer.message);
      resolve();
    };
  });

  let boxes: { row: number; ink: number[][]; rows: number[][] } | null = null;
  const boxesIn = fetch(BOXES, { signal: stop.signal })
    .then((r) => {
      if (!r.ok) throw new Error(`The robot's outlines did not load: ${r.status}`);
      return r.json() as Promise<{ frame: number[]; row: number; ink: number[][]; rows: number[][] }>;
    })
    .then((j) => {
      if (j.frame[0] !== width || j.frame[1] !== height) throw new Error(`The robot's outlines are for ${j.frame.join(" by ")} frames, not ${width} by ${height}`);
      boxes = { row: j.row, ink: j.ink, rows: j.rows };
      tell({ kind: "outlines", ink: j.ink });
    });
  const ready = Promise.all([boxesIn, firstIn]).then(
    () => {},
    (e: unknown) => {
      if (!stop.signal.aborted) throw e;
    },
  );

  let gaps = 0;
  const roll = (box: Rect, dx: number): void => {
    const turned = (ROLL * ROBOT_TURN.rollers * dx) / frameRect(box).height;
    gaps += Math.max(-MOST, Math.min(MOST, turned));
  };

  let laid = "";
  let sized = "";
  let wanted = -1;
  const place = (box: Rect, stage: Rect, yaw: number, driving = false): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const f = frameRect(box);
    const w = Math.max(1, Math.round(f.width * dpr));
    const h = Math.max(1, Math.round(f.height * dpr));
    const spacing = barSpacing(dpr);
    const size = `${w}:${h}:${spacing}`;
    if (size !== sized) {
      sized = size;
      tell({ kind: "size", w, h, spacing });
    }
    // On whole screen pixels, so a bar is not blurred across two.
    const x = Math.round((f.left - stage.left) * dpr) / dpr;
    const y = Math.round((f.top - stage.top) * dpr) / dpr;
    const at = `${x}:${y}:${w}:${h}:${dpr}`;
    if (at !== laid) {
      laid = at;
      for (const layer of [under, bars]) {
        layer.style.width = `${w / dpr}px`;
        layer.style.height = `${h / dpr}px`;
        layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    }
    const k = frameOf(yaw, driving, gaps);
    if (k !== wanted) {
      wanted = k;
      tell({ kind: "want", k });
    }
  };

  const ink = (box: Rect, yaw: number, driving = false): Ink | null => {
    if (!boxes) return null;
    const f = frameRect(box);
    const k = frameOf(yaw, driving, gaps);
    const b = boxes.ink[k];
    const rows = boxes.rows[k];
    if (!b || !rows) return null;
    const [l, t, r, bottom] = b;
    const sx = f.width / width;
    const sy = f.height / height;
    const lefts: number[] = [];
    const rights: number[] = [];
    for (let i = 0; i < rows.length; i += 2) {
      lefts.push(rows[i] < 0 ? NaN : f.left + rows[i] * sx);
      rights.push(rows[i] < 0 ? NaN : f.left + (rows[i + 1] + 1) * sx);
    }
    return {
      left: f.left + l * sx,
      right: f.left + (r + 1) * sx,
      top: f.top + t * sy,
      bottom: f.top + (bottom + 1) * sy,
      rowsTop: f.top,
      step: boxes.row * sy,
      lefts,
      rights,
    };
  };

  const setColors = (ground: Rgb, inkColour: Rgb): void => {
    tell({ kind: "colours", ground, ink: inkColour });
  };

  const destroy = (): void => {
    stop.abort();
    worker.terminate();
    under.remove();
    bars.remove();
  };

  return { ready, place, ink, roll, setColors, destroy };
}
