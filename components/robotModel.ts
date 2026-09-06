/**
 * Loads the VEX robot model produced by scripts/robot-from-fbx.mjs.
 *
 * The GLB at /model/robot/robot.glb holds a chassis node, four wheel nodes
 * that share one wheel mesh, and one node per part that has to turn on screen
 * (the gears bolted to the drive wheels, and the intake rollers and sprockets
 * that carry a ball up to the indexer). All of those are pre-pivoted: the axle
 * passes through the node origin along local +X, so setting `object.rotation.x`
 * spins the part. The robot frame is +Z forward, +Y up, ground at y = 0, and
 * the forward extent (length) is 1.6 units.
 *
 * Wheels and spinners come back as SIBLINGS of the chassis -- they are children
 * of the "robot" node, not of the chassis -- with positions in the robot frame.
 * A caller that wants them parented somewhere else (to make the chassis the
 * thing that moves, say) has to re-home them itself and keep the world
 * transform right; nothing here does that for you.
 *
 * No DOM globals at module scope: this module is importable in Node with a
 * fetch polyfill, the same way the Thinker geometry loader is.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type RobotSpinner = {
  object: THREE.Object3D;
  category: "drive" | "intake" | "indexer";
  /** Local axis to rotate about. Always "x" today; read it, do not assume. */
  axis: "x" | "y" | "z";
  /** Outer radius in stage units, for gear-ratio maths. */
  radius: number;
  side: "left" | "right" | "center";
};

export type RobotModel = {
  chassis: THREE.Object3D;
  wheels: Array<{ object: THREE.Object3D; radius: number; side: "left" | "right" }>;
  length: number;
  spinners: RobotSpinner[];
};

type WheelMeta = {
  axleDirection: [number, number, number];
  axlePosition: [number, number, number];
  radius: number;
  side: "left" | "right";
};

type PartMeta = {
  axis: "x" | "y" | "z";
  axlePosition: [number, number, number];
  category: "drive" | "intake" | "indexer";
  name: string;
  radius: number;
  side: "left" | "right" | "center";
};

type RobotMeta = {
  boundsSize: [number, number, number];
  length: number;
  parts: PartMeta[];
  wheels: WheelMeta[];
};

const MODEL_URL = "/model/robot/robot.glb";

export async function loadRobotModel(): Promise<RobotModel> {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`robot model fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buf, "/model/robot/");

  const root = gltf.scene.getObjectByName("robot") ?? gltf.scene;
  // The extract script embeds the meta as glTF extras on the robot node.
  // public/model/robot/robot-meta.json is the same data dumped for debugging;
  // it is never fetched at runtime.
  const meta = root.userData as RobotMeta;
  if (!Array.isArray(meta.wheels) || typeof meta.length !== "number") {
    throw new Error("robot model is missing its embedded meta");
  }
  if (!Array.isArray(meta.parts)) {
    throw new Error("robot model predates the spinning-part split: no meta.parts");
  }

  const chassis = root.getObjectByName("chassis");
  if (!chassis) throw new Error("robot model has no chassis node");

  // Wheel nodes are named wheel_<side>_<front|back>; radius comes from the
  // meta entry whose axle position matches the node translation.
  const wheels: RobotModel["wheels"] = [];
  // Spinner nodes are named part_<category>_<type>_<index>, which is also the
  // key in meta.parts, so they match by name rather than by position.
  const partByName = new Map(meta.parts.map((p) => [p.name, p]));
  const spinners: RobotSpinner[] = [];
  for (const object of root.children) {
    if (object.name.startsWith("wheel_")) {
      const side: "left" | "right" = object.name.includes("_left_") ? "left" : "right";
      const wm =
        meta.wheels.find(
          (w) =>
            Math.abs(w.axlePosition[0] - object.position.x) < 1e-4 &&
            Math.abs(w.axlePosition[2] - object.position.z) < 1e-4,
        ) ?? meta.wheels[0];
      wheels.push({ object, radius: wm.radius, side });
      continue;
    }
    if (!object.name.startsWith("part_")) continue;
    const pm = partByName.get(object.name);
    if (!pm) throw new Error(`robot model node ${object.name} has no meta.parts entry`);
    spinners.push({ axis: pm.axis, category: pm.category, object, radius: pm.radius, side: pm.side });
  }
  if (wheels.length !== meta.wheels.length) {
    throw new Error(`robot model has ${wheels.length} wheel nodes, meta lists ${meta.wheels.length}`);
  }
  if (spinners.length !== meta.parts.length) {
    throw new Error(`robot model has ${spinners.length} part nodes, meta lists ${meta.parts.length}`);
  }

  return { chassis, length: meta.length, spinners, wheels };
}
