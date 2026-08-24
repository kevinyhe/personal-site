/**
 * Loads the VEX robot model produced by scripts/robot-from-fbx.mjs.
 *
 * The GLB at /model/robot/robot.glb holds a chassis node plus four wheel
 * nodes that share one wheel mesh. Each wheel's geometry is pre-pivoted: the
 * axle passes through the node origin along local +X, so setting
 * `wheel.object.rotation.x` spins it. The robot frame is +Z forward, +Y up,
 * ground at y = 0, and the forward extent (length) is 1.6 units.
 *
 * No DOM globals at module scope: this module is importable in Node with a
 * fetch polyfill, the same way the Thinker geometry loader is.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type RobotModel = {
  chassis: THREE.Object3D;
  wheels: Array<{ object: THREE.Object3D; radius: number; side: "left" | "right" }>;
  length: number;
};

type WheelMeta = {
  axleDirection: [number, number, number];
  axlePosition: [number, number, number];
  radius: number;
  side: "left" | "right";
};

type RobotMeta = {
  boundsSize: [number, number, number];
  length: number;
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
  const meta = root.userData as RobotMeta;
  if (!Array.isArray(meta.wheels) || typeof meta.length !== "number") {
    throw new Error("robot model is missing its embedded meta");
  }

  const chassis = root.getObjectByName("chassis");
  if (!chassis) throw new Error("robot model has no chassis node");

  // Wheel nodes are named wheel_<side>_<front|back>; radius comes from the
  // meta entry whose axle position matches the node translation.
  const wheels: RobotModel["wheels"] = [];
  for (const object of root.children) {
    if (!object.name.startsWith("wheel_")) continue;
    const side: "left" | "right" = object.name.includes("_left_") ? "left" : "right";
    const wm =
      meta.wheels.find(
        (w) =>
          Math.abs(w.axlePosition[0] - object.position.x) < 1e-4 &&
          Math.abs(w.axlePosition[2] - object.position.z) < 1e-4,
      ) ?? meta.wheels[0];
    wheels.push({ object, radius: wm.radius, side });
  }
  if (wheels.length !== meta.wheels.length) {
    throw new Error(`robot model has ${wheels.length} wheel nodes, meta lists ${meta.wheels.length}`);
  }

  return { chassis, length: meta.length, wheels };
}
