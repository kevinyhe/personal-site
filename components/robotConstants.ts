import * as THREE from "three";

/**
 * The few numbers and the one type the Thinker's stage shares with the
 * robot outro, on their own so the stage can import them without pulling
 * the outro in.
 *
 * ThinkerStage's camera rig keeps a dormant chase branch written against
 * RobotOutro's camera state (it comes back with one line when the robot
 * gets its own section). While that branch imported its constants from
 * RobotOutro.tsx and robotDrift.ts directly, both rode into the home
 * page's bundle for nothing: RobotOutro brought three's RoomEnvironment
 * and, through its template-literal `import()`s, a lazy chunk for every
 * module under components/ (ballTrack.json alone is 476 kB of it), and
 * robotDrift ran its whole rigid-body simulation at module load on every
 * visit. Everything the stage actually reads is here instead; RobotOutro
 * and robotDrift import from here too, so there is one definition.
 */

/** One robot length in stage units. */
export const ROBOT_LENGTH = 1.6;
/** The robot scene's own floor: the statue is faded out, so a clean height. */
export const ROBOT_GROUND_Y = -1.2;

/**
 * Where the drift ends — the robot's final heading (continuous, a full
 * turn past the start; wrap it before comparing) and position in robot
 * lengths. ThinkerStage parks its outro camera square to this.
 *
 * A copy of what robotDrift's simulation arrives at, written down so the
 * stage need not run the simulation to know it. robotDrift checks its own
 * result against this when it loads and warns if the run has been retuned
 * without this being updated; `.scratch-smash/drift.mts` prints the live
 * value.
 */
export const DRIFT_FINISH: { heading: number; position: [number, number] } = {
  heading: 9.355673655934124,
  position: [-2.1899119092266726, -2.120906560537365],
};

/** What the rally camera needs to know about the robot, every frame. */
export type RobotCameraState = {
  /** Lateral acceleration (stage units/s^2), positive toward the robot's left. */
  aLat: number;
  /**
   * The robot's pose a fixed slice of the RUN ago — see CAMERA_ANCHOR_LAG
   * in RobotOutro. The outro camera orbits this rather than the live pose,
   * which is what lets the robot swing across the frame while it is moving
   * and settle back to centre when it stops. Because the lag is in playhead
   * seconds and not wall-clock seconds, the framing is a pure function of
   * the scroll position: it cannot fall behind on a fast flick, cannot
   * overshoot, and scrolling back retraces it exactly.
   */
  anchorHeading: number;
  anchorPosition: THREE.Vector3;
  /**
   * Seconds of the run the scroll moved through this frame. The run is
   * scrubbed, so the robot can cover ground far faster than wall-clock; a
   * camera that integrates only real time is left behind. Sign is dropped —
   * a chase should catch up just as hard when the page scrolls backwards.
   */
  playheadDelta: number;
  /** World yaw, same convention as RobotDriftFrame.heading. */
  heading: number;
  /** Stage-space position (y is the ground height). */
  position: THREE.Vector3;
  /** True once the run has finished and the robot sits still. */
  resting: boolean;
  /** Seconds into the drift the scroll currently sits at, and its length. */
  runDuration: number;
  runTime: number;
  /** |velocity|, stage units/s. */
  speed: number;
  /** Stage-space velocity. */
  velocity: THREE.Vector3;
};

export function createRobotCameraState(): RobotCameraState {
  return {
    aLat: 0,
    anchorHeading: -Math.PI / 2,
    anchorPosition: new THREE.Vector3(9.7, ROBOT_GROUND_Y, 1.5),
    heading: -Math.PI / 2,
    playheadDelta: 0,
    position: new THREE.Vector3(9.7, ROBOT_GROUND_Y, 1.5),
    resting: false,
    runDuration: 1,
    runTime: 0,
    speed: 0,
    velocity: new THREE.Vector3(),
  };
}
