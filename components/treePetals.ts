import * as THREE from "three";
import type { ThinkerChunkData } from "@/components/thinkerFragments";

/**
 * The petals on the marble tree, and how they come off it.
 *
 * The intro's tree is in blossom; its marble twin on the stage is bare
 * bough, because the bake keeps only the trunk and the first two orders of
 * branch and the flowers sit further out. So the blossom is put back here,
 * as loose petals resting on the boughs — the intro's own petal, the same
 * outline, gradient and tints, at a size that reads from the cut shot.
 *
 * Each petal belongs to one chunk. Until that chunk breaks away the petal
 * rides on it; a beat after the chunk goes the petal shakes loose and
 * falls, carried a little by the burst that took its bough, swaying and
 * tumbling on the way down, and lies where it lands on the floor. All
 * of it is a function of the chunk's own flight progress, so scrolling
 * back up lifts every petal back onto its bough exactly as the boughs
 * come home.
 */

export const PETAL = {
  /**
   * How many petals the tree carries. Enough to read as blossom on the
   * outer boughs from the cut shot without hiding the marble: at ~500
   * about a fifth of the bough surface has a petal on it.
   */
  count: 520,
  /**
   * The petal's length in the figure's units (the tree is normalised to
   * 3.1 across). The intro's petal is 0.245 of its metres; the stage's
   * tree is about half the intro's scale, and the cut shot puts ~280 px
   * on a figure unit, so 0.11 is a 30 px petal — visible, not a leaf.
   */
  length: 0.11,
  /** Size spread, as a multiplier range on `length`. */
  sizeRange: [0.75, 1.15] as const,
  /**
   * Only chunks whose centre sits this far up the tree (as a fraction of
   * its height above its base) carry petals: below it is trunk. The
   * primaries fork off at 9-19% up (cherry-meta.json), so a third clears
   * the fork and the bare stretch of bough just above it.
   */
  boughFrom: 0.34,
  /**
   * How strongly the petals favour the outer boughs: the sampling weight
   * goes from this at the trunk's axis to 1 at the plan's edge, squared.
   * The intro's flowers are on the twig tips, so the outer half of the
   * crown should carry most of them.
   */
  innerWeight: 0.12,
  /** Petals sit this far off the stone, along its normal. */
  lift: 0.008,
  /** The most a petal tilts off its bough's normal, in radians. */
  tilt: 0.7,
  /**
   * How long after its chunk releases a petal hangs on, as a share of the
   * chunk's flight window, spread evenly from 0 to this. Some go with the
   * first jolt, some cling for a while.
   */
  clingMax: 0.35,
  /**
   * The fall, per unit of fall progress: `drop` figure units at t = 1,
   * with the descent accelerating as t^1.6; the sway's amplitude and
   * rate; how much of the chunk's own burst offset the petal is carried
   * along at first; and how fast it tumbles.
   */
  drop: 1.3,
  dropPower: 1.5,
  sway: 0.09,
  swayRate: 5.5,
  carry: 0.35,
  tumble: 3.4,
  /**
   * A petal that reaches the floor stays there, lying flat, this far above
   * it (so it does not fight the floor's shadow plane). The petals then
   * lie around the stump for the rest of the page rather than vanishing
   * the moment they land — with the fall as quick as it is against the
   * scroll, most had gone before the panel was full when they were hidden
   * under the floor instead.
   */
  rest: 0.004,
} as const;

// The intro's petal colours (components/BareThreeCanvas.tsx, PETAL_* and
// BLOSSOM_TINT_*), copied rather than imported so the stage does not pull
// the 7000-line intro module into its own graph. Retune both together.
const PETAL_EDGE = new THREE.Color("#fdeff8");
const PETAL_MID = new THREE.Color("#f7cfe6");
const PETAL_BASE = new THREE.Color("#e79cc8");
const TINTS = ["#f7c4e0", "#f1aed6", "#e693c4", "#fbdff0"].map(
  (hex) => new THREE.Color(hex),
);

const UP_Y = new THREE.Vector3(0, 1, 0);
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * The intro's loose petal (BareThreeCanvas createFallingPetalGeometry,
 * first variant), the same outline, curl and base-to-edge gradient, at
 * unit length along +y with its face on +z. Scaled per instance.
 */
export function createPetalGeometry() {
  const shape = { cleft: 0, peak: 0.5, skew: 0.09, sideBias: 0.1, curl: 0.042, twist: 0.018 };
  const lengthSegments = 4;
  const widthSegments = 4;
  const petalLength = 1;
  const maxHalfWidth = 0.093 / 0.245;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();

  for (let i = 0; i <= lengthSegments; i += 1) {
    const vv = i / lengthSegments;
    for (let j = 0; j <= widthSegments; j += 1) {
      const uu = j / widthSegments;
      const xu = uu * 2 - 1;
      const vvW =
        vv < shape.peak
          ? (vv / shape.peak) * 0.5
          : 0.5 + ((vv - shape.peak) / (1 - shape.peak)) * 0.5;
      const widthProfile = Math.pow(Math.sin(Math.PI * (0.055 + 0.89 * vvW)), 0.72);
      const cleft =
        shape.cleft * Math.pow(Math.max(0, 1 - Math.abs(xu) * 2.3), 2) * smoothstep(0.76, 1, vv);
      const cornerRound = 0.085 * Math.pow(Math.abs(xu), 2.4) * smoothstep(0.5, 1, vv);
      const radial = vv - cleft - cornerRound;
      const lateral =
        xu * (1 + shape.sideBias * xu) * widthProfile + shape.skew * Math.sin(Math.PI * vv);
      const x = lateral * maxHalfWidth;
      const y = (radial - 0.5) * petalLength;
      const z =
        (Math.sin(Math.PI * vv) * shape.curl +
          xu * xu * 0.02 * (0.3 + vv * 0.7) +
          xu * vv * shape.twist) /
        0.245;
      positions.push(x, y, z);
      if (vv < 0.5) color.copy(PETAL_BASE).lerp(PETAL_MID, vv / 0.5);
      else color.copy(PETAL_MID).lerp(PETAL_EDGE, (vv - 0.5) / 0.5);
      const edgePush = clamp01(Math.pow(Math.abs(xu), 2.2) * 0.55 + smoothstep(0.8, 1, vv) * 0.35);
      color.lerp(PETAL_EDGE, edgePush);
      colors.push(color.r, color.g, color.b);
    }
  }
  const row = widthSegments + 1;
  for (let i = 0; i < lengthSegments; i += 1) {
    for (let j = 0; j < widthSegments; j += 1) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The petals' material: the intro's gradient and tint, lit as flat stone. */
export function createPetalMaterial() {
  return new THREE.MeshStandardMaterial({
    emissive: "#ffffff",
    emissiveIntensity: 0.05,
    metalness: 0,
    roughness: 0.72,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
}

export type PetalPlan = {
  /** How many petals there are (instances in the mesh). */
  count: number;
  /** Per petal: the chunk it rests on. */
  chunk: Int32Array;
  /** Per petal: its pose relative to the chunk's centre, at rest. */
  local: THREE.Matrix4[];
  /** Per petal: the share of its chunk's flight it clings on for. */
  cling: Float32Array;
  /** Per petal: where it lets go, in the figure's space, and its pose there. */
  detachPosition: THREE.Vector3[];
  detachQuaternion: THREE.Quaternion[];
  /** Per petal: its size, the sway's phase, and its tumble axis and rate. */
  size: Float32Array;
  swayPhase: Float32Array;
  tumbleAxis: THREE.Vector3[];
  tumbleRate: Float32Array;
  /** Per petal: how it lies once it has landed (flat, at a random turn). */
  restQuaternion: THREE.Quaternion[];
  /** Per petal: its tint, written once into the instance colours. */
  tint: THREE.Color[];
};

/** A small deterministic generator, so the blossom is the same every load. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lays the petals on the boughs of a built figure. `poseAt(chunk, progress)`
 * is the stage's own chunk placement (position, rotation, scale for a given
 * flight progress), so a petal's point of release is exactly where the
 * bough was when it let go.
 */
export function planPetals(
  chunks: ThinkerChunkData[],
  poseAt: (
    chunk: ThinkerChunkData,
    progress: number,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    scale: THREE.Vector3,
  ) => void,
  seed = 7,
): PetalPlan {
  const rng = makeRng(seed);
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const chunk of chunks) {
    for (let i = 0; i + 2 < chunk.surfacePositions.length; i += 3) {
      point.set(
        chunk.surfacePositions[i] + chunk.center[0],
        chunk.surfacePositions[i + 1] + chunk.center[1],
        chunk.surfacePositions[i + 2] + chunk.center[2],
      );
      box.expandByPoint(point);
    }
  }
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const boughY = box.min.y + size.y * PETAL.boughFrom;
  const planReach = Math.max(size.x, size.z) / 2;

  // Every bough triangle, weighted by its area and by how far out in the
  // crown it sits, so the outer boughs carry the blossom.
  const candidates: Array<{ chunk: number; tri: number; weight: number }> = [];
  let total = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  chunks.forEach((chunk, chunkIndex) => {
    if (chunk.center[1] < boughY) return;
    const positions = chunk.surfacePositions;
    for (let tri = 0; tri * 9 + 8 < positions.length; tri += 1) {
      const o = tri * 9;
      a.set(positions[o], positions[o + 1], positions[o + 2]);
      b.set(positions[o + 3], positions[o + 4], positions[o + 5]);
      c.set(positions[o + 6], positions[o + 7], positions[o + 8]);
      const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
      if (area <= 0) continue;
      const cx = (a.x + b.x + c.x) / 3 + chunk.center[0] - centre.x;
      const cz = (a.z + b.z + c.z) / 3 + chunk.center[2] - centre.z;
      const out = clamp01(Math.hypot(cx, cz) / planReach);
      const weight = area * (PETAL.innerWeight + (1 - PETAL.innerWeight) * out * out);
      candidates.push({ chunk: chunkIndex, tri, weight });
      total += weight;
    }
  });

  const count = candidates.length ? PETAL.count : 0;
  const plan: PetalPlan = {
    count,
    chunk: new Int32Array(count),
    local: [],
    cling: new Float32Array(count),
    detachPosition: [],
    detachQuaternion: [],
    size: new Float32Array(count),
    swayPhase: new Float32Array(count),
    tumbleAxis: [],
    tumbleRate: new Float32Array(count),
    restQuaternion: [],
    tint: [],
  };
  if (!count) return plan;

  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);
  const quaternion = new THREE.Quaternion();
  const tiltAxis = new THREE.Vector3();
  const tiltQuat = new THREE.Quaternion();
  const rollQuat = new THREE.Quaternion();
  const posePosition = new THREE.Vector3();
  const poseQuaternion = new THREE.Quaternion();
  const poseScale = new THREE.Vector3();
  const poseMatrix = new THREE.Matrix4();
  const localPosition = new THREE.Vector3();
  const localScale = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    // Pick a triangle by weight, then a point on it.
    let pick = rng() * total;
    let chosen = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      pick -= candidate.weight;
      if (pick <= 0) {
        chosen = candidate;
        break;
      }
    }
    const chunk = chunks[chosen.chunk];
    const positions = chunk.surfacePositions;
    const o = chosen.tri * 9;
    a.set(positions[o], positions[o + 1], positions[o + 2]);
    b.set(positions[o + 3], positions[o + 4], positions[o + 5]);
    c.set(positions[o + 6], positions[o + 7], positions[o + 8]);
    normal.copy(ab.subVectors(b, a).cross(ac.subVectors(c, a))).normalize();
    let u = rng();
    let v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    localPosition
      .copy(a)
      .addScaledVector(ab, u)
      .addScaledVector(ac, v)
      .addScaledVector(normal, PETAL.lift);

    // Face along the stone's normal, tilted and rolled at random.
    quaternion.setFromUnitVectors(up, normal);
    tiltAxis.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    tiltQuat.setFromAxisAngle(tiltAxis, (rng() - 0.5) * 2 * PETAL.tilt);
    rollQuat.setFromAxisAngle(normal, rng() * Math.PI * 2);
    quaternion.premultiply(tiltQuat).premultiply(rollQuat);

    const petalSize =
      PETAL.length * (PETAL.sizeRange[0] + rng() * (PETAL.sizeRange[1] - PETAL.sizeRange[0]));
    localScale.setScalar(petalSize);
    plan.chunk[i] = chosen.chunk;
    plan.local.push(new THREE.Matrix4().compose(localPosition, quaternion, localScale));
    plan.cling[i] = rng() * PETAL.clingMax;
    plan.size[i] = petalSize;
    plan.swayPhase[i] = rng() * Math.PI * 2;
    plan.tumbleAxis.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
    plan.tumbleRate[i] = PETAL.tumble * (0.6 + rng() * 0.8);
    plan.tint.push(TINTS[Math.floor(rng() * TINTS.length)]);
    // Face up on the floor, turned any way, with a little lean so the
    // curl catches the light differently from petal to petal.
    const rest = new THREE.Quaternion().setFromUnitVectors(up, UP_Y);
    rollQuat.setFromAxisAngle(UP_Y, rng() * Math.PI * 2);
    tiltAxis.set(rng() - 0.5, 0, rng() - 0.5).normalize();
    tiltQuat.setFromAxisAngle(tiltAxis, (rng() - 0.5) * 0.5);
    plan.restQuaternion.push(rest.premultiply(tiltQuat).premultiply(rollQuat));

    // Where the petal lets go: its place on the chunk at the moment the
    // cling runs out, in the figure's space.
    poseAt(chunk, plan.cling[i], posePosition, poseQuaternion, poseScale);
    poseMatrix.compose(posePosition, poseQuaternion, poseScale).multiply(plan.local[i]);
    const detachPosition = new THREE.Vector3();
    const detachQuaternion = new THREE.Quaternion();
    poseMatrix.decompose(detachPosition, detachQuaternion, localScale);
    plan.detachPosition.push(detachPosition);
    plan.detachQuaternion.push(detachQuaternion);
  }
  return plan;
}

const scratch = {
  matrix: new THREE.Matrix4(),
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  tumble: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  // A petal with no bough to sit on (its chunk not mounted yet).
  hidden: new THREE.Matrix4().makeScale(0, 0, 0),
};

/**
 * Writes this frame's petal poses into the instanced mesh, in the stage
 * group's space. `chunkMatrix(index)` gives each chunk group's current
 * local matrix; `progress` and `adrift` are the stage's per-chunk flight
 * progress and wall-clock drift; `floorY` is the floor in the group's
 * space; `offset` the chunk's burst direction.
 */
export function updatePetals(
  mesh: THREE.InstancedMesh,
  plan: PetalPlan,
  chunks: ThinkerChunkData[],
  chunkMatrix: (index: number, out: THREE.Matrix4) => THREE.Matrix4 | null,
  progress: Float32Array,
  adrift: Float32Array,
  floorY: number,
) {
  const { matrix, position, quaternion, tumble, scale, hidden } = scratch;
  for (let i = 0; i < plan.count; i += 1) {
    const chunkIndex = plan.chunk[i];
    const t = (progress[chunkIndex] ?? 0) - plan.cling[i];
    if (t <= 0) {
      // Riding its bough.
      const group = chunkMatrix(chunkIndex, matrix);
      if (!group) {
        mesh.setMatrixAt(i, hidden);
        continue;
      }
      mesh.setMatrixAt(i, matrix.multiply(plan.local[i]));
      continue;
    }
    // Falling. The drift keeps a resting scroll's petals sinking, like
    // the pieces; it fades back in with the flight so scrolling up lifts
    // them home. The fall is a function of one number, so the landing is
    // simply the value of that number at which the drop reaches the
    // floor: past it the petal lies where it landed.
    const chunk = chunks[chunkIndex];
    const detach = plan.detachPosition[i];
    const landAt = Math.pow(
      Math.max(detach.y - floorY - PETAL.rest, 0) / PETAL.drop,
      1 / PETAL.dropPower,
    );
    const fall = Math.min(t + adrift[chunkIndex] * 3 * Math.min(t, 1), landAt);
    const landed = fall >= landAt;
    const drop = PETAL.drop * Math.pow(fall, PETAL.dropPower);
    const carry = PETAL.carry * Math.min(fall, 1) * (2 - Math.min(fall, 1));
    position
      .copy(detach)
      .addScaledVector(
        scratch.scale.set(chunk.offset[0], chunk.offset[1], chunk.offset[2]),
        carry,
      );
    position.y -= drop;
    position.x += Math.sin(fall * PETAL.swayRate + plan.swayPhase[i]) * PETAL.sway * Math.min(fall * 2, 1);
    position.z += Math.cos(fall * PETAL.swayRate * 0.8 + plan.swayPhase[i]) * PETAL.sway * 0.6 * Math.min(fall * 2, 1);
    if (landed) {
      position.y = floorY + PETAL.rest;
      quaternion.copy(plan.restQuaternion[i]);
    } else {
      tumble.setFromAxisAngle(plan.tumbleAxis[i], fall * plan.tumbleRate[i]);
      quaternion.copy(plan.detachQuaternion[i]).premultiply(tumble);
    }
    scale.setScalar(plan.size[i]);
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Writes the per-petal tints once. */
export function paintPetals(mesh: THREE.InstancedMesh, plan: PetalPlan) {
  for (let i = 0; i < plan.count; i += 1) mesh.setColorAt(i, plan.tint[i]);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
