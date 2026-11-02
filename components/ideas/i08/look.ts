import type { Ink } from "@/components/luke/robotTurn";

/** Idea 8: the Skills robot turning from its scroll heading to face the skill groups while one is pointed at, focused or tapped. */

/** Its heading facing the groups, on its right, a little toward the
 *  viewer (robotTurn.ts: yaw 0 is straight right, -π/2 straight at the
 *  viewer). */
export const FACE_GROUPS = -0.3;
/** Under two columns the groups are below it, so it faces the viewer. */
export const FACE_VIEWER = -Math.PI / 2;
/** Seconds the turn takes, either way. */
const TURN_TIME = 0.5;
/** Px of scroll after a tap that hands the robot back to the scroll. */
const TAP_SCROLL = 40;

export type LookReason = "hover" | "focus" | "tap";

export type Look = {
  /** The heading to draw: `byScroll` turned toward `face` as far as the
   *  look has eased in, times `parked` (0 to 1, how far it has come to a
   *  stop). */
  yaw(byScroll: number, face: number, parked: number): number;
  set(reason: LookReason, on: boolean): void;
  /** How far it last turned toward the groups, 0 to 1. */
  facing: number;
  /** Where its ink was on the screen when last drawn. */
  ink: Ink | null;
  destroy(): void;
};

const easeInOut = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);
const shortestTurn = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

export function createLook(redraw: () => void): Look {
  const reasons = new Set<LookReason>();
  let progress = 0;
  let frame = 0;
  let last = 0;
  let tappedAt = 0;

  const tick = (now: number): void => {
    frame = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const target = reasons.size ? 1 : 0;
    progress = target ? Math.min(1, progress + dt / TURN_TIME) : Math.max(0, progress - dt / TURN_TIME);
    redraw();
    if (progress !== target) frame = requestAnimationFrame(tick);
  };
  const run = (): void => {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };

  const scrolledOff = (): void => {
    if (Math.abs(window.scrollY - tappedAt) > TAP_SCROLL) look.set("tap", false);
  };

  const look: Look = {
    facing: 0,
    ink: null,
    yaw(byScroll, face, parked) {
      look.facing = easeInOut(progress) * parked;
      return byScroll + look.facing * shortestTurn(face - byScroll);
    },
    set(reason, on) {
      if (reason === "tap") {
        window.removeEventListener("scroll", scrolledOff);
        if (on) {
          tappedAt = window.scrollY;
          window.addEventListener("scroll", scrolledOff, { passive: true });
        }
      }
      if (on) reasons.add(reason);
      else reasons.delete(reason);
      run();
    },
    destroy() {
      window.removeEventListener("scroll", scrolledOff);
      if (frame) cancelAnimationFrame(frame);
    },
  };
  return look;
}
