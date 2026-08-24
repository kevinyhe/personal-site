/**
 * Loads the two VEX Push Back props produced by scripts/extract-props.mjs:
 * the game ball and the Long Goal.
 *
 * Both GLBs are in the same stage units as the robot (one unit = 261.9375 mm,
 * the scale that makes the robot's forward extent 1.6). The ball is centred on
 * the origin so rotating its object spins it in place. The goal stands with
 * its base at y = 0, centred on x and z, its tube running along local z.
 *
 * No DOM globals at module scope, so this is importable in Node with a fetch
 * polyfill the same way components/robotModel.ts is.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type GoalModel = {
  object: THREE.Object3D;
  length: number; // stage units along its long axis
  troughHeight: number; // stage units above its base
  openings: Array<{ position: [number, number, number]; inward: [number, number, number] }>;
};

type BallMeta = { radius: number };

type GoalMeta = {
  boundsSize: [number, number, number];
  length: number;
  openings: GoalModel["openings"];
  troughHeight: number;
};

const BALL_URL = "/model/props/ball.glb";
const GOAL_URL = "/model/props/goal.glb";

async function loadGlb(url: string, rootName: string): Promise<THREE.Object3D> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${rootName} model fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buf, url.slice(0, url.lastIndexOf("/") + 1));
  return gltf.scene.getObjectByName(rootName) ?? gltf.scene;
}

export async function loadBallModel(): Promise<{ object: THREE.Object3D; radius: number }> {
  const object = await loadGlb(BALL_URL, "ball");
  // The extract script embeds the meta as glTF extras on the root node, which
  // three surfaces as userData.
  const meta = object.userData as BallMeta;
  if (typeof meta.radius !== "number") throw new Error("ball model is missing its embedded meta");
  return { object, radius: meta.radius };
}

/**
 * The whole goal is clear plastic, so every surface on it is turned
 * translucent — not just the body panel. Fusion exports each appearance as
 * "Opaque(...)" regardless of the real finish, so this cannot come from the
 * file and has to be applied on load.
 *
 * depthWrite is off so the balls inside are not culled by the wall in front
 * of them, which is the whole point of it being see-through, and the
 * material is double-sided so the far wall still reads.
 */
function makeGoalTranslucent(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      const standard = material as THREE.MeshStandardMaterial;
      standard.transparent = true;
      standard.opacity = 0.32;
      standard.depthWrite = false;
      standard.roughness = 0.1;
      standard.metalness = 0;
      standard.side = THREE.DoubleSide;
    }
  });
}

export async function loadGoalModel(): Promise<GoalModel> {
  const object = await loadGlb(GOAL_URL, "goal");
  const meta = object.userData as GoalMeta;
  if (typeof meta.length !== "number" || typeof meta.troughHeight !== "number" || !Array.isArray(meta.openings)) {
    throw new Error("goal model is missing its embedded meta");
  }
  if (meta.openings.length !== 2) {
    throw new Error(`goal model has ${meta.openings.length} openings, expected the tube's two ends`);
  }
  makeGoalTranslucent(object);
  return {
    length: meta.length,
    object,
    openings: meta.openings,
    troughHeight: meta.troughHeight,
  };
}
