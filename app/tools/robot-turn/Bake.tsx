"use client";

import { useEffect, useState } from "react";

import { mountHeroRobot } from "@/components/heroRobot";
import { ROBOT_TURN } from "@/components/luke/robotFrames";

/**
 * Bakes the robot's turn for Skills (robotTurn.ts): heroRobot's shaded
 * render under ROBOT_TURN.light, its parts in their own colours, standing,
 * seen from ROBOT_TURN.elevation degrees over level, at
 * ROBOT_TURN.frames headings once round, its wheels
 * (hubs, plates and rollers: tools/bake_hero.mjs) rolled as they would
 * be turning on the spot; then ROBOT_TURN.spins more at the heading it
 * drives in on, its wheels rolling through one gap between rollers; laid
 * out in a grid on black; and the same again for how near each part is to
 * the lens (heroRobot's renderDepth). Open /tools/robot-turn under `npm
 * run dev`, wait for the two sheets, save them, and put them through
 * `node tools/robot_turn_levels.mjs <saved.png> <saved-depth.png>`, which
 * writes one picture a frame to public/models/robot-turn/.
 *
 * Baked rather than drawn live: a live robot needs a WebGL context of its
 * own, and one more on the home page put it past the browser's 16, which
 * lost the oldest, the hero's.
 */
export default function Bake() {
  const [url, setUrl] = useState("");
  const [depthUrl, setDepthUrl] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    const { frames, cols, width, height, fill, firstYaw, supersample, elevation, drive, spins, rollers, light, colours, colourSpread } = ROBOT_TURN;
    const robot = mountHeroRobot({
      url: "/models/hero.glb",
      offscreen: { width: width * supersample, height: height * supersample },
      endX: (width * supersample) / 2,
      fill,
      shaded: true,
      light,
      colours,
      colourSpread,
      elevation,
    });
    if (!robot) return undefined;
    let gone = false;
    void robot.ready.then(() => {
      if (gone) return;
      const all = frames + spins;
      const rows = Math.ceil(all / cols);
      // The shading, and how near each part is (renderDepth), each in a
      // sheet of its own.
      const sheets = [0, 1].map(() => {
        const c = document.createElement("canvas");
        c.width = cols * width;
        c.height = rows * height;
        const g = c.getContext("2d");
        if (g) {
          g.fillStyle = "#000";
          g.fillRect(0, 0, c.width, c.height);
          g.imageSmoothingQuality = "high";
        }
        return { c, g };
      });
      const [shade, near] = sheets;
      if (!shade.g || !near.g) return;
      robot.seek(1);
      robot.rise(1);
      // The wheel looks the same every half of a ring's gap. Turning on
      // the spot each wheel rolls its half-track times the turn, about a
      // gap a frame, which strobes; here it rolls an eighth of a gap a
      // frame instead (a quarter of the repeat), and as `frames` is a
      // multiple of 8 a whole turn is whole gaps, and frame 0 follows the
      // last without a jump. The spin frames go through one gap.
      const { radius, halfTrack, height: tall } = robot.measure();
      const gap = (2 * Math.PI) / rollers;
      const k = gap / 8 / ((halfTrack / radius) * ((2 * Math.PI) / frames));
      const at = (i: number) => {
        const x = (i % cols) * width;
        const y = Math.floor(i / cols) * height;
        shade.g?.drawImage(robot.canvas, x, y, width, height);
        robot.renderDepth();
        near.g?.drawImage(robot.canvas, x, y, width, height);
      };
      for (let i = 0; i < frames; i += 1) {
        robot.wheelsTo(0, (k * 2 * Math.PI * i) / frames);
        robot.yaw(firstYaw + (2 * Math.PI * i) / frames);
        at(i);
      }
      robot.yaw(firstYaw + (2 * Math.PI * drive) / frames);
      for (let j = 0; j < spins; j += 1) {
        robot.wheelsTo((radius * gap * j) / spins, (k * 2 * Math.PI * drive) / frames);
        at(frames + j);
      }
      // One frame height of travel, in wheel turns (robotTurn.ts ROLL).
      const roll = tall / fill / (2 * Math.PI * radius);
      setNote(`wheel radius ${radius.toFixed(4)} m, half-track ${halfTrack.toFixed(4)} m, height ${tall.toFixed(4)} m; ROLL ${roll.toFixed(4)}`);
      const out = shade.c.toDataURL("image/png");
      const depth = near.c.toDataURL("image/png");
      (window as unknown as Record<string, unknown>).__robotTurn = out;
      (window as unknown as Record<string, unknown>).__robotTurnDepth = depth;
      (window as unknown as Record<string, unknown>).__robotRoll = roll;
      setDepthUrl(depth);
      setUrl(out);
    });
    return () => {
      gone = true;
      robot.dispose();
    };
  }, []);
  return (
    <main style={{ background: "#333", color: "#fff", minHeight: "100vh", padding: 24, fontFamily: "sans-serif" }}>
      <p>{url ? "Baked. Save both and run tools/robot_turn_levels.mjs on them:" : "Baking..."}</p>
      {note ? <p>{note}</p> : null}
      {url ? (
        <a download="robot-turn.png" href={url}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="The robot's turn, frame by frame" src={url} style={{ maxWidth: "100%" }} />
        </a>
      ) : null}
      {depthUrl ? (
        <a download="robot-turn-depth.png" href={depthUrl}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="How near each part is, frame by frame" src={depthUrl} style={{ maxWidth: "100%" }} />
        </a>
      ) : null}
    </main>
  );
}
