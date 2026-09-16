import * as THREE from "three";

const COMPONENT_BYTE_SIZE: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const ACCESSOR_ITEM_SIZE: Record<string, number> = {
  MAT4: 16,
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

type GltfAccessor = {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
};

type GltfBufferView = {
  buffer: number;
  byteLength: number;
  byteOffset?: number;
  byteStride?: number;
};

type GltfBuffer = {
  uri: string;
};

type GltfPrimitive = {
  attributes: {
    NORMAL?: number;
    POSITION: number;
    TEXCOORD_0?: number;
  };
  indices?: number;
};

type GltfMesh = {
  primitives: GltfPrimitive[];
};

type GltfNode = {
  children?: number[];
  matrix?: number[];
  mesh?: number;
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  translation?: [number, number, number];
};

type GltfScene = {
  nodes: number[];
};

type GltfDocument = {
  accessors: GltfAccessor[];
  buffers: GltfBuffer[];
  bufferViews: GltfBufferView[];
  meshes: GltfMesh[];
  nodes: GltfNode[];
  scene?: number;
  scenes: GltfScene[];
};

type AccessorValues = {
  componentType: number;
  count: number;
  itemSize: number;
  values: number[];
};


async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to load ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to load ${url}: ${response.status}`);
  }

  return response.arrayBuffer();
}

function readComponent(view: DataView, offset: number, componentType: number) {
  switch (componentType) {
    case 5120:
      return view.getInt8(offset);
    case 5121:
      return view.getUint8(offset);
    case 5122:
      return view.getInt16(offset, true);
    case 5123:
      return view.getUint16(offset, true);
    case 5125:
      return view.getUint32(offset, true);
    case 5126:
      return view.getFloat32(offset, true);
    default:
      throw new Error(`Unsupported GLTF component type: ${componentType}`);
  }
}

function readAccessor(
  gltf: GltfDocument,
  buffers: ArrayBuffer[],
  accessorIndex: number,
): AccessorValues {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const itemSize = ACCESSOR_ITEM_SIZE[accessor.type];
  const componentByteSize = COMPONENT_BYTE_SIZE[accessor.componentType];

  if (!itemSize || !componentByteSize) {
    throw new Error(`Unsupported GLTF accessor type: ${accessor.type}`);
  }

  const dataView = new DataView(buffers[bufferView.buffer]);
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const byteStride = bufferView.byteStride ?? itemSize * componentByteSize;
  const values: number[] = [];

  for (let index = 0; index < accessor.count; index++) {
    const elementOffset = baseOffset + index * byteStride;

    for (let item = 0; item < itemSize; item++) {
      values.push(
        readComponent(
          dataView,
          elementOffset + item * componentByteSize,
          accessor.componentType,
        ),
      );
    }
  }

  return {
    componentType: accessor.componentType,
    count: accessor.count,
    itemSize,
    values,
  };
}

function getNodeMatrix(node: GltfNode) {
  if (node.matrix) {
    return new THREE.Matrix4().fromArray(node.matrix);
  }

  const translation = new THREE.Vector3(...(node.translation ?? [0, 0, 0]));
  const rotation = new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1]));
  const scale = new THREE.Vector3(...(node.scale ?? [1, 1, 1]));

  return new THREE.Matrix4().compose(translation, rotation, scale);
}

function findMeshWorldMatrix(gltf: GltfDocument, meshIndex: number) {
  const scene = gltf.scenes[gltf.scene ?? 0];
  let foundMatrix: THREE.Matrix4 | null = null;

  const visitNode = (nodeIndex: number, parentMatrix: THREE.Matrix4) => {
    const node = gltf.nodes[nodeIndex];
    const worldMatrix = parentMatrix.clone().multiply(getNodeMatrix(node));

    if (node.mesh === meshIndex) {
      foundMatrix = worldMatrix.clone();
      return;
    }

    node.children?.forEach((childIndex) => visitNode(childIndex, worldMatrix));
  };

  scene.nodes.forEach((nodeIndex) =>
    visitNode(nodeIndex, new THREE.Matrix4()),
  );

  return foundMatrix ?? new THREE.Matrix4();
}

/**
 * The figure's longest extent after loading. Everything below — cell
 * spacings, the flight's spread, the stage's camera distances — is tuned in
 * these units, so a second model is scaled to the same size rather than
 * the fracture being retuned for it.
 */
export const FIGURE_EXTENT = 3.1;

function normalizeGeometry(geometry: THREE.BufferGeometry, extent: number) {
  geometry.computeBoundingBox();

  if (!geometry.boundingBox) {
    return geometry;
  }

  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const scale = extent / Math.max(size.x, size.y, size.z);

  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.normalizeNormals();

  return geometry;
}

/**
 * Loads one glTF (its first mesh's first primitive) as a geometry centred
 * on the origin with its longest extent scaled to `extent`. The statue by
 * default; the stage's other figures pass their own path (see the
 * `modelPath` option).
 */
export async function loadThinkerGeometry(
  modelPath = "/model/thinker/scene.gltf",
  extent = FIGURE_EXTENT,
) {
  const gltf = await fetchJson<GltfDocument>(modelPath);
  const modelBasePath = modelPath.slice(0, modelPath.lastIndexOf("/") + 1);
  const buffers = await Promise.all(
    gltf.buffers.map((buffer) => fetchBuffer(`${modelBasePath}${buffer.uri}`)),
  );
  const meshIndex = 0;
  const primitive = gltf.meshes[meshIndex].primitives[0];
  const position = readAccessor(gltf, buffers, primitive.attributes.POSITION);
  const normal =
    primitive.attributes.NORMAL !== undefined
      ? readAccessor(gltf, buffers, primitive.attributes.NORMAL)
      : null;
  const uv =
    primitive.attributes.TEXCOORD_0 !== undefined
      ? readAccessor(gltf, buffers, primitive.attributes.TEXCOORD_0)
      : null;
  const indices =
    primitive.indices !== undefined
      ? readAccessor(gltf, buffers, primitive.indices)
      : null;
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position.values, position.itemSize),
  );

  if (normal) {
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normal.values, normal.itemSize),
    );
  }

  if (uv) {
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(uv.values, uv.itemSize),
    );
  }

  if (indices) {
    geometry.setIndex(
      indices.componentType === 5125
        ? new THREE.Uint32BufferAttribute(indices.values, 1)
        : new THREE.Uint16BufferAttribute(indices.values, 1),
    );
  }

  geometry.applyMatrix4(findMeshWorldMatrix(gltf, meshIndex));

  if (!normal) {
    geometry.computeVertexNormals();
  }

  return normalizeGeometry(geometry, extent);
}

// ---------------------------------------------------------------------------
// Fracture
//
// The figure is cut by planes, one piece at a time, into solid chunks: the
// clipped surface plus a flat cap on each cut. Every cut point (an edge of
// the mesh meeting the plane) is computed once and shared, by object, by
// the two polygons on either side of that edge and by the cap, so the cap
// boundary matches the surface boundary exactly and the chunk is closed.
// Pieces that come apart into several islands under a cut are separated at
// once and each island is size-checked, so no sliver ever reaches the
// stage.
// ---------------------------------------------------------------------------

// A vertex lies on the plane if within this distance of it. Tiny on
// purpose: a vertex that is merely close makes a thin sliver polygon, which
// is harmless, whereas treating it as on-plane can leave a spurious cut
// segment when its whole edge lies in the plane.
const CLIP_EPSILON = 1e-9;
// Cap loops with less area than this are dropped (a few mesh triangles).
const MIN_CAP_LOOP_AREA = 1e-7;
// A cut graph with odd-degree nodes is patched by joining the closest pair
// if they are within this distance. With shared cut points it should never
// be needed on a closed mesh; it is a safety net for a damaged scan.
const MAX_CAP_REPAIR_DISTANCE = 0.002;

type FragmentVertex = {
  normal: THREE.Vector3;
  point: THREE.Vector3;
};

type FragmentPolygon = {
  /** Set on `sealPiece`'s lids only: marks them for `smoothCutNormals`. */
  group?: number;
  kind: "cap" | "surface";
  vertices: FragmentVertex[];
};

type FragmentPiece = {
  box: THREE.Box3;
  capStats: CapBuildStats[];
  center: THREE.Vector3;
  depth: number;
  /** The source figure only: every triangle's corners, flat, for fast passes. */
  flat?: Float64Array;
  id: number;
  polygons: FragmentPolygon[];
  /** Area of the piece's SKIN only — what the flight's origin is weighted by. */
  totalArea: number;
  /**
   * Area of every face, cut faces included. This, not `totalArea`, is what
   * says how big a piece actually is: a fragment from inside the figure is
   * nearly all cut face and has almost no skin, so judging it by `totalArea`
   * called a real chunk dust and left a hole where it should have been.
   */
  faceArea: number;
};

type SplitPlane = {
  constant: number;
  key: string;
  normal: THREE.Vector3;
};

type CapNode = {
  id: number;
  point: THREE.Vector3;
  uv: THREE.Vector2;
};

type CapLoop = {
  area: number;
  edgeChains: THREE.Vector3[][];
  points: THREE.Vector3[];
  uv: THREE.Vector2[];
};

export type CapBuildStats = {
  danglingVertices: number;
  holeLoops: number;
  loopCount: number;
  planeKey: string;
  repairedGaps: number;
  rejectedLoops: number;
  segmentCount: number;
};

export type SplitStats = {
  /** Islands too small to keep. */
  dust: number;
  /** Of those, how many were dropped for being all cut face and no skin. */
  interior: number;
  /** Extra pieces from cells that came apart into more than one island. */
  islands: number;
  seedCount: number;
  sourceOpenEdges: number;
};

/** One chunk as typed arrays: what a worker can hand back by transfer. */
export type ThinkerChunkData = {
  center: [number, number, number];
  debug: {
    capStats: CapBuildStats[];
    sourceIndex: number;
  };
  /**
   * Breakup progress (0..1) at which this chunk's cut faces can first be
   * seen: its own release, or its first neighbour's, whichever is sooner.
   */
  exposedAt: number;
  interiorNormals: Float32Array;
  interiorPositions: Float32Array;
  /** Full travel, in the figure's own space, once the chunk has released. */
  offset: [number, number, number];
  /** Half the bounding-box diagonal, for the stage's own sanity checks. */
  radius: number;
  /** Which part of the figure the chunk belongs to, for the break's order. */
  phase: "head" | "upper" | "lower";
  /** Breakup progress (0..1) at which this chunk starts moving. */
  releaseAt: number;
  scale: number;
  spin: [number, number, number];
  surfaceNormals: Float32Array;
  surfacePositions: Float32Array;
  /** How much of the breakup (0..1) the chunk's flight takes. */
  travel: number;
  /**
   * The cut faces, as [moment, triangles], in order: once the break has
   * passed `moment`, the first `triangles` of the interior geometry are
   * drawn. The faces are sorted by the moment the piece on the other side of
   * them leaves, so this is a DRAW RANGE and not a per-face visibility — one
   * draw call, as before.
   *
   * Why per face and not per piece: a piece has ten neighbours on average,
   * and `exposedAt` lit ALL of its cut faces the moment ANY of them went.
   * The nine faces still buried in marble are hidden by that marble almost
   * everywhere — but not at a grazing junction, where a face pokes out as a
   * hairline, and not where a gap opens somewhere else on the figure and the
   * far side of a cavity is suddenly on view. Kevin: "make sure the lines
   * separating the individual chunks are not visible."
   */
  wall: Array<[number, number]>;
};

export type ThinkerChunkBuild = {
  /** Where the pieces break away from, in the figure's space. */
  breakOrigin: [number, number, number];
  chunks: ThinkerChunkData[];
  /** The mean of the chunks' full offsets: where the cloud's centre ends. */
  drift: [number, number, number];
  stats: SplitStats;
};

export type BuildSolidChunkOptions = {
  /**
   * The glTF to cut, as a URL under public/. The statue
   * (/model/thinker/scene.gltf) when left out. Read by the worker, which
   * loads the model itself; the options are the whole of its message.
   */
  modelPath?: string;
  /**
   * Where a baked copy of this build lives, as a URL under public/ without
   * its extension (`<path>.json` and `<path>.bin`, written by
   * scripts/bake-chunks.mjs). Loaded instead of cutting live when its
   * fingerprint matches these options; otherwise the cut runs as before.
   * Not read by the cut itself.
   */
  bakedPath?: string;
  /**
   * What the model's longest extent is scaled to before the cut, in figure
   * units. FIGURE_EXTENT (3.1) when left out, and there is no reason to
   * pass anything else: the spacings below are in these units.
   */
  normalizeHeight?: number;
  /**
   * Where the figure struck the floor, as fractions of its bounding box
   * (0..1 on each axis). Everything about the break is measured from here:
   * cells are finest at this point and coarsen away from it. It is also
   * the order's origin when `releaseFrom` is left out.
   */
  impact: [number, number, number];
  /**
   * Where the break starts, in figure units: pieces are ranked by their
   * distance from HERE rather than from the impact. The rank only orders
   * the pieces that the flight's own constraint graph has already freed
   * (planReleaseOrder), so it decides where the break starts among the
   * free pieces, not which way it travels — that is the flight's.
   * Left out, the impact itself is the origin.
   */
  releaseFrom?: [number, number, number];
  /**
   * How distance from `releaseFrom` is measured for the order: a step
   * UP counts `up` times, a step down `down` times, a step in depth (z)
   * `across` times, a sideways step once. With `up` above 1 the parts
   * above the origin come later than the parts level with it — so a
   * break that starts at a shoulder spreads across the body before it
   * reaches the head. All 1 when left out.
   */
  releaseWeights?: { up: number; down: number; across: number };
  /**
   * A direction in figure units: when set, the break is a plane sweeping
   * along it — pieces come loose in order of how far along this axis they
   * sit, from the far end back. Given the flight's own direction reversed,
   * the front starts at the head (the part furthest along the flight) and
   * slices down the figure at the angle the pieces leave at. Overrides
   * `releaseFrom`.
   */
  releaseSweep?: [number, number, number];
  /**
   * Fraction of the figure's height below which a piece is ranked AFTER
   * the whole body, whatever the sweep says. The plinth is low and on the
   * figure's LEFT (+x out to 1.22, y below -0.45), so a sweep flat enough
   * to read as left-to-right reaches it in the first few moments; only a
   * steep downward tilt held it back, and that same tilt starts the break
   * at the head. One plane cannot do both, so the base is simply ordered
   * last and the plane is free to be flat. Left out, nothing is held back.
   */
  lateFrom?: number;
  /**
   * The head's corner of the figure: above `above` of the height and past
   * `toward` of the width from the figure's RIGHT (its -x edge), a piece is
   * ranked EARLY whatever the sweep says. The mirror of `lateFrom`, and
   * needed for the same reason.
   *
   * The head sits ABOUT 0.66 above the mid torso and 0.9 further toward the
   * figure's right, which is the LATE end of the sweep, so the plane
   * reaches it near the end of the body. Measured on the chunk centres,
   * buying head-before-torso out of the plane's own tilt needs the vertical
   * term above 0.58 of the sideways one — steeper than the 13 degrees that
   * was already being called too steep — and even at a depth term of 2.2
   * (with the sideways read down to -0.58) the head still came out level
   * with the torso, not before it. So the band does it and the plane stays
   * flat: on the bake the head is at percentile 0.20 against the torso's
   * 0.31, and the plane's own rank correlation against the sweep axis over
   * the pieces it still owns is 0.968, against 0.972 before. A piece
   * releases 0.046 of the break from its six nearest neighbours, against
   * 0.043 — the band's edge costs 0.003 of that.
   *
   * Left out, nothing is brought forward.
   */
  earlyBand?: { above: number; toward: number };
  /**
   * Unevenness in WHEN pieces go, on top of the plane's order: each seed's
   * rank is moved by `amount` (in rank units, 0..1 across the order) times
   * a mix of a smooth field over the figure, whose values at two points a
   * distance d apart correlate as exp(-d² / 2·grain²), and a per-seed
   * jitter that shares nothing with its neighbours. `shared` is the field's
   * share of the variance. Nearby pieces move together, so the front comes
   * through in patches rather than as a clean line; the first `taper` of the
   * order gets less of it, so the break still opens in one place. The base
   * (`lateFrom`) gets none. Left out, the order is the plane's own.
   *
   * `clusters` then lets up to that many touching pieces that sit close in
   * the order leave on one beat: see planReleaseOrder.
   */
  releaseTexture?: {
    amount: number;
    grain: number;
    shared: number;
    taper: number;
    clusters: number;
  };
  /**
   * Unevenness in which WAY pieces fly: each flight is tilted up or down by
   * `tilt` radians and swung about the vertical by `yaw` radians, times a
   * unit-variance mix of a smooth field over the figure (correlation length
   * `grain`, figure units), a fan (pieces above the cloud's middle tilt up,
   * pieces below it down) and a per-piece part. `shares` are the three
   * parts' shares of the variance, in that order. Paths stay straight; only
   * their directions differ. Left out, every piece flies the one direction
   * plus the cloud's small expansion.
   */
  flightScatter?: {
    tilt: number;
    yaw: number;
    grain: number;
    shares: [number, number, number];
  };
  /**
   * Spread of the pieces' spin rates: each piece's spin is scaled by
   * low + (high - low)·h² for a per-piece h uniform in 0..1, so most pieces
   * turn a little less and a few turn clearly more. Left out, 1 for all.
   */
  spinSpread?: [number, number];
  /**
   * Grade the CELLS along `releaseSweep` instead of by distance from the
   * impact: a piece's target size follows its place in the break's order,
   * so the pieces the break opens with are the fine ones and the rest of
   * the figure is coarse. Only the first ~45 of 476 pieces ever release
   * while the stage is on screen, and every piece costs draw calls whether
   * it moves or not, so fineness spent anywhere else is paid for and never
   * seen. Needs `releaseSweep`; without it this does nothing.
   */
  gradeAlongSweep?: boolean;
  /**
   * How many points on the figure's skin a seed may be placed at. It is a
   * floor on how fine the cells can be (see CANDIDATE_TARGET), and the
   * sampler is O(candidates x seeds), so it is also most of the cut's cost.
   */
  candidateTarget?: number;
  /**
   * How much of the size variation applies at the front of the break, 0..1,
   * easing to all of it over `spacingFalloff`. Below 1 the pieces the break
   * opens with come out near their target spacing instead of being swallowed
   * by a coarse patch; the whole-limb lumps the variation is there for stay
   * in the part of the figure that is never seen to break. 1 when left out.
   */
  variationNear?: number;
  /** Target cell width at the impact, in figure units. */
  spacingNear: number;
  /** Target cell width far from the impact. */
  spacingFar: number;
  /**
   * How quickly the spacing opens out, in figure units: at this distance
   * from the impact the cells are ~63% of the way from near to far — or,
   * with `spacingHold`, the width of the ramp that follows the hold.
   */
  spacingFalloff: number;
  /**
   * How far the grading stays at `spacingNear` before it opens out at all,
   * in figure units (the rank turned back into them, with
   * `gradeAlongSweep`). Left out, the spacing eases out exponentially from
   * the blow, which is concave: whatever the falloff, the spacing at 2.2
   * can be at most 1.76x the spacing at 1.25, so the part of the ORDER the
   * stage is drawn through cannot be held fine while the base is cut
   * coarse. With it the grading holds flat and then ramps over
   * `spacingFalloff`, which is what lets the pieces that are seen to fly be
   * small while the base — 40% of the pieces, drawn intact for the whole
   * shot and never seen to break — is cut in lumps that cost one draw call
   * each.
   */
  spacingHold?: number;
  /**
   * The target cell width right where the break OPENS, easing to
   * `spacingNear` over `spacingHold`. Left out, the grading is flat at
   * `spacingNear` until the hold runs out, which is what `spacingHold`
   * first shipped as — and it took the fineness away from the one place
   * the reference has it and the eye is on. Asked for: "have less bigger
   * pieces at the start of the breaking, the big pieces are too big."
   */
  spacingOpening?: number;
  /**
   * 0..1 pull of seeds onto the concentric shells around the impact. 0 is
   * a plain graded scatter; higher lines the cuts up into rings around the
   * blow with spokes between them.
   */
  shellBias: number;
  /**
   * How much further apart two seeds must sit along the line from the
   * impact than across it: the sampler's room test shrinks the part of
   * their separation that runs along that line by this, so a radial
   * neighbour has to be this many times further away to pass. 1 is a plain
   * round cell. At 3 the seeds pack three times tighter across the line
   * than along it, and the cells between them run about that much longer
   * towards the blow than they are wide, so shards come out as slivers
   * pointing at the impact instead of as even patches. This is the
   * sampler's own distance only: the carve still cuts plain Euclidean
   * Voronoi cells between the seeds it is given.
   */
  radialStretch: number;
  /**
   * How much cell size varies on top of the distance grading. Each seed
   * gets its own target-spacing multiplier of e^±sizeVariation, so at 0.6 a
   * seed may want anything from 0.55x to 1.8x the spacing its distance from
   * the blow asks for — a ~6x range in cell volume between neighbours.
   *
   * 0 gives the even, soap-bubble cells that a plain Poisson-disc sampling
   * produces: real stone does not break that regularly.
   */
  sizeVariation: number;
  /**
   * The same, for the LARGE side only: where the field is positive the
   * multiplier is e^(field * this) instead. Left out, `sizeVariation`
   * applies both ways. Lets the biggest pieces grow without the smallest
   * shrinking with them.
   */
  sizeVariationUp?: number;
  /**
   * Hard ceiling on seeds. The carve is super-quadratic in seed count and
   * the television shot holds until the build finishes, so this is a time
   * budget, not a target.
   */
  maxPieces: number;
  /**
   * Extra seeds placed by hand (bounding-box fractions), for anywhere the
   * grading needs help. They repel the sampled ones.
   */
  guardSeeds: Array<[number, number, number]>;
  /** The way the pieces fly, in the figure's own space. */
  direction: [number, number, number];
  /** Above this fraction of the figure's height is the head. */
  headFrom: number;
  /** Below this fraction of the figure's height are the legs and the base. */
  legsFrom: number;
  seed: number;
  /** Distance scale of the flight, in the figure's units (it is 3.1 tall). */
  spread: number;
  /**
   * How much of each piece's flight runs along its OWN way out of the stone:
   * the area-weighted mean of the skin it owned before the break, in units of
   * `spread`, added to the common push. Neighbours on a curved surface point
   * apart, so this separates pieces by construction instead of relying on the
   * expansion about the figure's centre, and it aims a piece out of the body
   * rather than through what is still standing. 0 when left out.
   */
  outwardPush?: number;
};

// Roughly how many surface points are offered to the sampler. It has to be
// dense enough that the finest spacing near the impact has candidates to
// choose between, and no denser — every candidate costs work in the sampler.
const CANDIDATE_TARGET = 2200;
// Candidates are the only places a seed can sit, so their spacing is a
// FLOOR on cell size: 2200 points over the figure's skin sit about 0.074
// figure units apart, and asking for cells finer than that just gets cells
// of that size. Measured: with spacingNear at 0.05 and 2200 candidates the
// pieces within 0.55 of the shoulder came out at a mean radius of 0.232,
// three times the target, whatever the spacing said.
// Sampling stops once no candidate has this much room relative to what its
// own distance from the impact asks for: the figure is covered at the
// density the grading wanted, and more seeds would only shave slivers.
const SEED_STOP_RATIO = 0.75;
// Two seeds closer than this are treated as one. `carveCell` builds a
// bisector by normalising the vector between two seeds with no zero guard,
// so a coincident pair is a NaN plane and a corrupt cell.
const SEED_MIN_SEPARATION = 0.02;
// The first concentric shell sits this many near-spacings out from the
// impact; the rest step outward by the local spacing times the radial
// stretch, the same distance the room test makes radial neighbours keep.
const SHELL_START = 0.75;
// The last piece releases this far into the breakup.
const RELEASE_END = 0.86;
// How the releases are paced: the RATE of pieces coming off climbs in a
// straight line from 1 to RELEASE_ACCELERATION times itself between the
// first release and RELEASE_RAMP_END of the breakup, then holds there to
// RELEASE_END. A few pieces, then more, then many, and the build lasts as
// long as the stage is drawn.
//
// Kevin rejected the even release (1.5, 8516a66): the pieces "sort of just
// uniformly break off all at once". Do not bring it back, even though
// lukebaffait.fr's own release does not accelerate (measured off its
// frames: 5-25% of the figure's area goes in 41 frames, 25-50% in 24,
// 50-75% in 24, 75-95% in 49). His ask overrides the reference.
//
// Earlier values of the old geometric schedule, for the record: 3 and 10
// (spread too evenly), 50 (a piece now and then for a long while, then the
// figure at once, almost none of it while the stage was drawn), 6
// (ad5861e), 1.5 (8516a66).
//
// Measured over the stretch the stage is drawn in (panel value 0 to 0.49,
// 1280x800; the narration's black starts rising at 0.317): the share of
// that stretch's released pieces gone by 25% / 50% / 75% of it. Even is
// 25 / 50 / 75.
//   even, 1.5 geometric (8516a66)            23.1 / 44.4 / 68.4, 234 pieces
//   6 geometric, 0.1 vh delay (ad5861e)      19.5 / 41.6 / 67.8, 149
//   12 and 25 geometric, no delay            21.1 / 43.0 / 67.2 and
//                                            21.7 / 43.4 / 67.0
//   10, linear ramp to 0.51 (this)           11.7 / 30.7 / 58.1, 179
// A geometric schedule (each gap a fixed fraction of the one before, which
// is what this was) cannot do it at any strength: its pace climbs slowly
// for most of the run and runs away at the end, where the room is dark, so
// the drawn stretch always comes out near even. Ramping the rate and then
// holding it puts the build where it is seen. Per quarter of the drawn
// stretch the new schedule releases 11.7 / 19.0 / 27.4 / 41.9% of it.
// Pieces off by panel value 0.05 / 0.1 / 0.2 / 0.317 / 0.49: 8 / 17 / 40 /
// 82 / 179 (8516a66: 24 / 44 / 85 / 138 / 234). 16 instead of 10 moved the
// quarters by a point (10.9 / 29.7 / 57.1) and thinned the opening to 7
// pieces by 0.05; ramping to 0.34 instead of 0.51 held the rate flat for
// the whole of the black's rise and put 211 pieces off.
//
// It does NOT change when the break finishes: RELEASE_END still holds the
// last slot.
const RELEASE_ACCELERATION = 10;
// Where the rate reaches RELEASE_ACCELERATION, as breakup: where the stage
// stops being drawn at 1280x800 (panel value 0.49).
const RELEASE_RAMP_END = 0.51;
// How much of the breakup a piece's flight takes once released: the stage's
// travel curve is quick off the mark and slows to a crawl at the end of it.
//
// 0.35, from 0.55, because the pieces read as one packed layer. Measured
// with a software ID render of the bake through the stage's own camera
// (1280x800, panel value 0.317, the last frame before the black starts to
// rise), 0.55 -> this with the pass below: the share of flying-piece pixels
// that two or more flying pieces cover 0.473 -> 0.388, the median distance
// from a flying piece's centre to the nearest other one 0.39 -> 0.53 piece
// sizes, the share of a flying piece's visible outline that borders black
// 0.15 -> 0.25, and black inside the flying cloud's hull (where it is not
// over the standing figure) 0.34 -> 0.54. A piece in frame there has moved
// 2.3 of its own diameters since it left (median), from 1.7.
//
// Speed is not the only thing that separates them, though until
// `outwardPush` it was. Turning the flights from 3 / 6 / 9 degrees off the
// stream's mean on screen (median / p75 / p90) to 10 / 19 / 32 with the
// smooth field in `flightScatter` moved the overlap share at that frame by
// nothing (0.557 -> 0.555): a smooth field turns neighbours TOGETHER, so
// pieces that start touching stay stacked on the screen. What pulls them
// apart is how far a piece gets before the next one along leaves, which is
// this — and a flight that is each piece's own way out of the stone, which
// turns neighbours APART. See `outwardPush` in thinkerChunks.
//
// What it costs: the pieces reach the top-left of the frame sooner, so 48
// flying pieces are in frame at 0.317 where there were 63.
const TRAVEL_WINDOW = 0.35;
// How far through the gap to the next beat the last member of a cluster
// goes (see planReleaseOrder): the members of a beat peel off over this
// share of it instead of leaving on the same frame.
const CLUSTER_STAGGER = 0.5;
// The most a piece's texture may bring it EARLIER, in units of
// `releaseTexture.amount` (the noise itself has unit spread): see planSeeds.
const RELEASE_TEXTURE_LEAD = -0.3;
// How far into the order (rank, 0..1) the texture's local lean is taken out:
// past the pieces released while the stage was drawn when this was set (~91,
// about 0.2 of the body's rank). See planSeeds.
const RELEASE_TEXTURE_SEEN = 0.3;
// How much later than the plane put it a piece in a mover's path may be
// made by the texture (see planReleaseOrder), in rank.
const STRIKE_SLACK = 0.01;
// Islands smaller than this are dropped as dust. The real correctness
// filter is the third condition at the call site (an island with no surface
// polygon at all is a cap-only solid, which the carve should never have
// produced); these two only exist to bin slivers. They were 40 / 0.01,
// which was fine when the smallest cell was a knuckle — but an impact
// fracture's whole point is fine shards near the blow, and at those floors
// the shards were being deleted: 1.9% of the figure's volume at 113 seeds,
// 3.0% at 150, as holes.
const ISLAND_MIN_POLYGONS = 8;
const ISLAND_MIN_AREA = 0.0015;
// How far along its flight a piece is probed for running into a
// neighbour (figure units), and the share of its shared face that must
// land inside the neighbour for that to count.
const RELEASE_PROBE_STEP = 0.08;
const RELEASE_PROBE_FRACTION = 0.03;
// How much later in the wanted order (`releaseSweep`'s plane rank, 0..1
// across the figure) a blocker has to sit before it is allowed to hold a
// piece back. Without this the graph reverses any break asked to travel
// the same way the pieces fly, because the leading piece always has
// unbroken marble in front of it: measured, moving the order's origin
// right across the body shifted the first fifteen pieces' mean x by 0.02
// and two plane sweeps were overridden outright. A blocker only a little
// later goes a moment after the mover anyway, so the overlap is brief and
// inside the cloud; a blocker much later is the "piece emerges through
// the chest" case the guard was written for, and that edge is kept.
// Touching neighbours are the worst case — they start with faces in
// contact — so they get a tighter tolerance than pieces the mover only
// flies past.
//
// The numbers are what it takes for the plane to survive. Spearman of the
// baked `releaseAt` against the sweep axis, which is 1.0 for a plane the
// graph has not touched: 0.12/0.4 gave 0.868, 0.25/0.7 gives 0.960. At
// 0.25/0.7 a piece releases 0.056 of the break from its six nearest
// neighbours, which is the figure a perfect plane over these 476 pieces
// gives (0.057) — the graph is no longer costing cohesion.
const RELEASE_ORDER_TOLERANCE_TOUCHING = 0.25;
const RELEASE_ORDER_TOLERANCE_DISTANT = 0.7;

// The grid two cut points are snapped to when asking whether two pieces
// share a face (see `neighbours` in planReleaseOrder): 1/3100 of the
// figure's height, 1/240 of a median piece's radius.
const CUT_POINT_GRID = 1e-3;

/**
 * ONE DIRECTION FOR EVERY PIECE. Asked for: "make the pieces all move in the
 * same direction". Every term that turned a piece off the common line is off
 * — the sideways expansion (FLIGHT_SPREAD), each piece's own way out of the
 * stone (`outwardPush`), the smooth random field (`flightScatter`), the
 * per-piece jitter, and the repair pass that steered pieces round each other
 * (`steerClearOfSolids`). What is left is the direction and FLIGHT_STRETCH,
 * which gives a piece further along the flight a longer offset: that is a
 * difference of PACE along one line, not of direction, so the paths stay
 * parallel.
 *
 * Measured on the bake, the first 120 pieces off deviate 0.0 / 0.0 / 0.0
 * degrees from the stream's mean on screen, against 8.5 / 13.7 / 22.7. The
 * stream still runs leftward: its mean direction is 185 degrees on screen,
 * five below horizontal-left, where it was 144. All of the lift it used to
 * have was the sideways expansion pushing the pieces high on the figure up.
 *
 * WHAT IT COSTS, because every one of these was bought by that divergence
 * and Kevin is trading them away knowingly:
 *
 * Pass-through. `outwardPush` made it go away by construction — neighbours
 * on a curved surface point apart, and a piece leaving along its own skin
 * normal leaves the short way. On one common line a piece deep in the body
 * flies through whatever is in front of it. Sampled-point audit over the
 * drawn break, pairs a tenth or more inside each other once the mover has
 * left its socket: inside standing marble 1 -> 186, flying through flying
 * 0 -> 95; a quarter or more, 0 -> 50 and 0 -> 25.
 *
 * Separation on screen at panel value 0.317: flying pixels two or more
 * pieces deep 0.112 -> 0.466, the nearest other piece 0.99 -> 0.36 piece
 * sizes, a piece's outline on black 0.60 -> 0.23. Slower on top of that
 * (see `spread`) takes them to 0.663, 0.33 and 0.095.
 *
 * The one remedy left that does not touch direction is letting a piece in
 * the way go sooner (clearStandingBlockers, which moves the ORDER). It was
 * tried wide: at CLEAR_MAX_SHIFT 0.10 / CLEAR_FROM 0.05 the standing pairs
 * went 160 -> 157 and the build's shape collapsed forward — the share of the
 * drawn stretch released by half of it went 31 -> 40%, by three quarters
 * 59 -> 71% — so it is left where it was.
 */
const ONE_DIRECTION = true;

// The flight, in multiples of `spread`: the push every piece gets along the
// direction; the extra the piece furthest along it gets over the piece
// furthest behind; and the fraction of a piece's sideways distance from the
// centre it moves outward. The push was 0.15 and the sideways share 0.3
// until the pieces were asked, twice, to sit further apart in the air:
// the push now carries every piece further along the flight and the
// sideways share doubles, so the cloud opens along and across.
//
// The sideways share is 0.55, from 0.6, with the cloud asked to stop
// spreading ("fix the path of all the pieces, it is getting too spread out").
// It is the term that fans the cloud with no pass-through bought back, so it
// is the first one to come down — but only a little, because the fanning was
// nearly all `steerClearOfSolids` chasing pieces that had not left their
// sockets. Fixing that took the first 120 pieces from 14.4 / 25.2 / 34.3
// degrees about the stream's mean to 8.8 / 13.2 / 23.3; this took the last
// half degree and left the cloud's own expansion where it was tuned.
const FLIGHT_PUSH = 0.28;
const FLIGHT_STRETCH = 1.0;
const FLIGHT_SPREAD = 0.55;

// Every distinct point on a piece is one Vector3 object, shared by all the
// polygons that meet there; these ids let maps key on them cheaply.
const pointIds = new WeakMap<THREE.Vector3, number>();
let nextPointId = 1;

function idOf(point: THREE.Vector3) {
  let id = pointIds.get(point);

  if (id === undefined) {
    id = nextPointId++;
    pointIds.set(point, id);
  }

  return id;
}

function hash01(index: number, seed: number) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453123;

  return value - Math.floor(value);
}

function signedHash(index: number, seed: number) {
  return hash01(index, seed) * 2 - 1;
}

/** A standard normal sample from two hashes (Box-Muller). */
function gaussianHash(index: number, seed: number) {
  const u = Math.max(hash01(index, seed), 1e-9);
  const v = hash01(index, seed + 17);

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

/**
 * A smooth random field over figure space with mean 0 and variance about 1,
 * whose values at two points d apart correlate as exp(-d² / 2·grain²):
 * random Fourier features, cosines whose frequencies are drawn from a
 * normal distribution of spread 1/grain. Deterministic per seed. Used where
 * NEIGHBOURING pieces should agree (what the reference's break does with
 * both its timing and its flight directions) and far ones need not.
 */
function makeSmoothField(seed: number, grain: number, waves = 32) {
  const frequencies = Array.from({ length: waves }, (_, wave) =>
    new THREE.Vector3(
      gaussianHash(wave * 3 + 1, seed),
      gaussianHash(wave * 3 + 2, seed),
      gaussianHash(wave * 3 + 3, seed),
    ).multiplyScalar(1 / Math.max(grain, 1e-6)),
  );
  const phases = frequencies.map((_, wave) => hash01(wave, seed + 29) * Math.PI * 2);
  const norm = Math.sqrt(2 / waves);

  return (point: THREE.Vector3) => {
    let sum = 0;

    for (let wave = 0; wave < waves; wave++) {
      sum += Math.cos(frequencies[wave].dot(point) + phases[wave]);
    }

    return sum * norm;
  };
}

/**
 * Least-squares fit of values as a + b·x + c·y + d·z over points; returns
 * the fitted function. Solved by Gaussian elimination on the 4x4 normal
 * equations, which is all a handful of hundred points needs.
 */
function fitLinear(points: THREE.Vector3[], values: number[]) {
  const matrix = Array.from({ length: 4 }, () => new Array<number>(5).fill(0));

  points.forEach((point, index) => {
    const row = [1, point.x, point.y, point.z];

    for (let a = 0; a < 4; a++) {
      matrix[a][4] += row[a] * values[index];
      for (let b = 0; b < 4; b++) matrix[a][b] += row[a] * row[b];
    }
  });

  for (let column = 0; column < 4; column++) {
    let pivot = column;

    for (let row = column + 1; row < 4; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }

    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    if (Math.abs(matrix[column][column]) < 1e-12) return () => 0;

    for (let row = 0; row < 4; row++) {
      if (row === column) continue;
      const factor = matrix[row][column] / matrix[column][column];
      for (let k = column; k < 5; k++) matrix[row][k] -= factor * matrix[column][k];
    }
  }

  const [a, b, c, d] = matrix.map((row, index) => row[4] / row[index]);

  return (point: THREE.Vector3) => a + b * point.x + c * point.y + d * point.z;
}

function randomUnitVector(seed: number, salt: number) {
  const z = signedHash(seed, salt);
  const angle = hash01(seed, salt + 3) * Math.PI * 2;
  const radius = Math.sqrt(Math.max(1 - z * z, 0));

  return new THREE.Vector3(Math.cos(angle) * radius, z, Math.sin(angle) * radius);
}

function polygonArea(vertices: FragmentVertex[]) {
  if (vertices.length < 3) {
    return 0;
  }

  let area = 0;
  const origin = vertices[0].point;
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();

  for (let index = 1; index < vertices.length - 1; index++) {
    edgeA.subVectors(vertices[index].point, origin);
    edgeB.subVectors(vertices[index + 1].point, origin);
    area += edgeA.cross(edgeB).length() * 0.5;
  }

  return area;
}

function makePiece({
  capStats,
  depth,
  id,
  polygons,
}: {
  capStats: CapBuildStats[];
  depth: number;
  id: number;
  polygons: FragmentPolygon[];
}): FragmentPiece {
  const box = new THREE.Box3();
  let totalArea = 0;
  let faceArea = 0;

  polygons.forEach((polygon) => {
    const area = polygonArea(polygon.vertices);

    faceArea += area;
    if (polygon.kind === "surface") {
      totalArea += area;
    }
    polygon.vertices.forEach((vertex) => box.expandByPoint(vertex.point));
  });

  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());

  return { box, capStats, center, depth, faceArea, id, polygons, totalArea };
}

// The source mesh as one piece, welded: every distinct position becomes one
// shared Vector3, whatever the glTF's own indexing did at seams.
function makeSourcePiece(sourceGeometry: THREE.BufferGeometry): FragmentPiece {
  const geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry.clone();

  if (!geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }

  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const weld = new Map<string, THREE.Vector3>();
  const polygons: FragmentPolygon[] = [];
  const triangleCount = Math.floor(position.count / 3);
  const fallback = new THREE.Vector3(0, 1, 0);

  const pointAt = (index: number) => {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const key = `${x},${y},${z}`;
    let point = weld.get(key);

    if (!point) {
      point = new THREE.Vector3(x, y, z);
      weld.set(key, point);
    }

    return point;
  };

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const start = triangle * 3;
    const vertices: FragmentVertex[] = [];

    for (let corner = 0; corner < 3; corner++) {
      const index = start + corner;
      const n = new THREE.Vector3(normal.getX(index), normal.getY(index), normal.getZ(index));

      vertices.push({
        normal: n.lengthSq() > 1e-12 ? n.normalize() : fallback.clone(),
        point: pointAt(index),
      });
    }

    if (
      vertices[0].point !== vertices[1].point &&
      vertices[1].point !== vertices[2].point &&
      vertices[0].point !== vertices[2].point
    ) {
      polygons.push({ kind: "surface", vertices });
    }
  }

  geometry.dispose();

  const piece = makePiece({ capStats: [], depth: 0, id: 0, polygons });
  const flat = new Float64Array(polygons.length * 9);

  polygons.forEach((polygon, index) => {
    for (let corner = 0; corner < 3; corner++) {
      const point = polygon.vertices[corner].point;

      flat[index * 9 + corner * 3] = point.x;
      flat[index * 9 + corner * 3 + 1] = point.y;
      flat[index * 9 + corner * 3 + 2] = point.z;
    }
  });
  piece.flat = flat;

  return piece;
}

// Union-find over shared points: the islands a piece is made of. Points
// are matched by position (to a fraction of a micron), not by object: a
// cut across an already-cut edge, or two caps meeting along a line, make
// the same point twice over.
const COMPONENT_KEY_SCALE = 1e5;

function componentKey(point: THREE.Vector3) {
  return `${Math.round(point.x * COMPONENT_KEY_SCALE)},${Math.round(point.y * COMPONENT_KEY_SCALE)},${Math.round(point.z * COMPONENT_KEY_SCALE)}`;
}

function splitConnectedComponents(piece: FragmentPiece) {
  if (piece.polygons.length <= 1) {
    return [piece];
  }

  const ids = new Map<string, number>();
  const idOfPoint = (point: THREE.Vector3) => {
    const key = componentKey(point);
    let id = ids.get(key);

    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }

    return id;
  };
  const parent = new Map<number, number>();
  const find = (id: number) => {
    let root = id;

    while (parent.get(root) !== root) {
      root = parent.get(root) as number;
    }

    let cursor = id;

    while (cursor !== root) {
      const next = parent.get(cursor) as number;
      parent.set(cursor, root);
      cursor = next;
    }

    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);

    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  };

  piece.polygons.forEach((polygon) => {
    const first = idOfPoint(polygon.vertices[0].point);

    if (!parent.has(first)) parent.set(first, first);

    for (let index = 1; index < polygon.vertices.length; index++) {
      const id = idOfPoint(polygon.vertices[index].point);

      if (!parent.has(id)) parent.set(id, id);
      union(first, id);
    }
  });

  const groups = new Map<number, FragmentPolygon[]>();

  piece.polygons.forEach((polygon) => {
    const root = find(idOfPoint(polygon.vertices[0].point));
    const group = groups.get(root);

    if (group) {
      group.push(polygon);
    } else {
      groups.set(root, [polygon]);
    }
  });

  if (groups.size === 1) {
    return [piece];
  }

  return Array.from(groups.values()).map((polygons, componentIndex) =>
    makePiece({
      capStats: piece.capStats,
      depth: piece.depth,
      id: piece.id * 8 + componentIndex,
      polygons,
    }),
  );
}

function getPlaneBasis(normal: THREE.Vector3) {
  const reference =
    Math.abs(normal.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(reference, normal).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();

  return { u, v };
}

function signedLoopArea(points: THREE.Vector2[]) {
  let area = 0;

  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const next = points[(index + 1) % points.length];

    area += point.x * next.y - next.x * point.y;
  }

  return area * 0.5;
}

function pointInLoop(point: THREE.Vector2, loop: THREE.Vector2[]) {
  let inside = false;

  for (let index = 0, previous = loop.length - 1; index < loop.length; previous = index++) {
    const a = loop[index];
    const b = loop[previous];

    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

// Orients a traced loop counter-clockwise in the plane and strips the
// points that sit exactly on a straight run (a cut across an earlier, flat
// cap makes those). The stripped points are kept in `edgeChains`, one chain
// per surviving edge, so the cap can still be stitched to the surface
// vertex for vertex.
function cleanLoop(points: THREE.Vector3[], plane: SplitPlane) {
  const { u, v } = getPlaneBasis(plane.normal);
  const loop = points.filter((point, index) => index === 0 || point !== points[index - 1]);

  if (loop.length > 1 && loop[0] === loop[loop.length - 1]) {
    loop.pop();
  }

  const toUv = (point: THREE.Vector3) => new THREE.Vector2(point.dot(u), point.dot(v));

  if (signedLoopArea(loop.map(toUv)) < 0) {
    loop.reverse();
  }

  const uv = loop.map(toUv);
  let cornerIndices = loop
    .map((_, index) => index)
    .filter((index) => {
      const previous = uv[(index - 1 + uv.length) % uv.length];
      const point = uv[index];
      const next = uv[(index + 1) % uv.length];
      const before = point.clone().sub(previous);
      const after = next.clone().sub(point);

      if (before.lengthSq() <= 1e-20 || after.lengthSq() <= 1e-20) {
        return false;
      }

      before.normalize();
      after.normalize();

      return !(Math.abs(before.x * after.y - before.y * after.x) < 1e-5 && before.dot(after) > 0.999);
    });

  if (cornerIndices.length < 3) {
    cornerIndices = loop.map((_, index) => index);
  }

  const cleaned = cornerIndices.map((index) => loop[index]);
  const edgeChains = cornerIndices.map((startIndex, cornerIndex) => {
    const endIndex = cornerIndices[(cornerIndex + 1) % cornerIndices.length];
    const chain = [loop[startIndex]];
    let index = (startIndex + 1) % loop.length;

    while (index !== endIndex) {
      chain.push(loop[index]);
      index = (index + 1) % loop.length;
    }

    chain.push(loop[endIndex]);

    return chain;
  });

  return {
    edgeChains,
    points: cleaned,
    uv: cornerIndices.map((index) => uv[index]),
  };
}

// Joins the cut segments into closed loops in the plane. Nodes are the
// shared cut points themselves, so on a closed piece every node has even
// degree and the loops close without any tolerance.
function traceCapLoops(
  segments: Array<readonly [FragmentVertex, FragmentVertex]>,
  plane: SplitPlane,
) {
  const { u, v } = getPlaneBasis(plane.normal);
  const nodes = new Map<number, CapNode>();
  const edges: Array<{ a: number; b: number }> = [];
  const edgeKeys = new Set<string>();
  const adjacency = new Map<number, number[]>();

  const nodeOf = (point: THREE.Vector3) => {
    const id = idOf(point);
    const existing = nodes.get(id);

    if (existing) {
      return existing;
    }

    const node = { id, point, uv: new THREE.Vector2(point.dot(u), point.dot(v)) };

    nodes.set(id, node);

    return node;
  };

  const addEdge = (a: THREE.Vector3, b: THREE.Vector3) => {
    const from = nodeOf(a);
    const to = nodeOf(b);

    if (from.id === to.id) {
      return false;
    }

    const edgeKey = from.id < to.id ? `${from.id}|${to.id}` : `${to.id}|${from.id}`;

    if (edgeKeys.has(edgeKey)) {
      return false;
    }

    const edgeIndex = edges.length;

    edgeKeys.add(edgeKey);
    edges.push({ a: from.id, b: to.id });
    adjacency.set(from.id, [...(adjacency.get(from.id) ?? []), edgeIndex]);
    adjacency.set(to.id, [...(adjacency.get(to.id) ?? []), edgeIndex]);

    return true;
  };

  segments.forEach(([a, b]) => {
    addEdge(a.point, b.point);
  });

  let repairedGaps = 0;
  let oddIds = Array.from(adjacency.entries())
    .filter(([, edgeIndices]) => edgeIndices.length % 2 === 1)
    .map(([id]) => id);

  while (oddIds.length >= 2) {
    let bestPair: [number, number] | null = null;
    let bestDistance = Infinity;

    for (let fromIndex = 0; fromIndex < oddIds.length - 1; fromIndex++) {
      const from = nodes.get(oddIds[fromIndex]) as CapNode;

      for (let toIndex = fromIndex + 1; toIndex < oddIds.length; toIndex++) {
        const to = nodes.get(oddIds[toIndex]) as CapNode;
        const distance = from.point.distanceToSquared(to.point);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestPair = [fromIndex, toIndex];
        }
      }
    }

    if (!bestPair || bestDistance > MAX_CAP_REPAIR_DISTANCE * MAX_CAP_REPAIR_DISTANCE) {
      break;
    }

    const from = nodes.get(oddIds[bestPair[0]]) as CapNode;
    const to = nodes.get(oddIds[bestPair[1]]) as CapNode;

    if (!addEdge(from.point, to.point)) {
      break;
    }

    repairedGaps += 1;
    oddIds = oddIds.filter((_, index) => index !== bestPair?.[0] && index !== bestPair?.[1]);
  }

  const danglingVertices = Array.from(adjacency.values()).filter(
    (edgeIndices) => edgeIndices.length % 2 === 1,
  ).length;
  const stats: CapBuildStats = {
    danglingVertices,
    holeLoops: 0,
    loopCount: 0,
    planeKey: plane.key,
    repairedGaps,
    rejectedLoops: 0,
    segmentCount: edges.length,
  };

  if (edges.length < 3) {
    return { loops: [] as CapLoop[], stats };
  }
  // Nodes of odd degree are the ends of open chains: the plane leaving the
  // patch of mesh being cut (see carveCell). Those chains are dropped by
  // the walk below; only closed loops become caps.

  // At each node, pair each arriving edge with the one leaving most nearly
  // opposite to it; a node of degree two has only one pairing, and a node
  // where the section touches itself (degree four) is crossed straight.
  const pairings = new Map<string, number>();

  adjacency.forEach((edgeIndices, id) => {
    const node = nodes.get(id) as CapNode;
    const remaining = [...edgeIndices];

    while (remaining.length >= 2) {
      const edgeIndex = remaining.shift() as number;
      const edge = edges[edgeIndex];
      const other = nodes.get(edge.a === id ? edge.b : edge.a) as CapNode;
      const incoming = other.uv.clone().sub(node.uv).normalize();
      let bestCandidate = 0;
      let bestDot = Infinity;

      remaining.forEach((candidateEdgeIndex, candidateIndex) => {
        const candidateEdge = edges[candidateEdgeIndex];
        const candidateOther = nodes.get(
          candidateEdge.a === id ? candidateEdge.b : candidateEdge.a,
        ) as CapNode;
        const dot = incoming.dot(candidateOther.uv.clone().sub(node.uv).normalize());

        if (dot < bestDot) {
          bestDot = dot;
          bestCandidate = candidateIndex;
        }
      });

      const paired = remaining.splice(bestCandidate, 1)[0];

      pairings.set(`${id}|${edgeIndex}`, paired);
      pairings.set(`${id}|${paired}`, edgeIndex);
    }
  });

  const visited = new Set<number>();
  const loops: CapLoop[] = [];

  edges.forEach((edge, edgeIndex) => {
    if (visited.has(edgeIndex)) {
      return;
    }

    const loopPoints: THREE.Vector3[] = [];
    let currentId = edge.a;
    let nextId = edge.b;
    let currentEdgeIndex = edgeIndex;

    for (let guard = 0; guard <= edges.length + 1; guard++) {
      if (visited.has(currentEdgeIndex)) {
        break;
      }

      loopPoints.push((nodes.get(currentId) as CapNode).point);
      visited.add(currentEdgeIndex);

      if (nextId === edge.a) {
        const cleaned = cleanLoop(loopPoints, plane);
        const area = Math.abs(signedLoopArea(cleaned.uv));

        if (cleaned.points.length >= 3 && area >= MIN_CAP_LOOP_AREA) {
          loops.push({ area, edgeChains: cleaned.edgeChains, points: cleaned.points, uv: cleaned.uv });
        } else {
          stats.rejectedLoops += 1;
        }

        return;
      }

      const nextEdgeIndex = pairings.get(`${nextId}|${currentEdgeIndex}`);

      if (nextEdgeIndex === undefined || visited.has(nextEdgeIndex)) {
        break;
      }

      const nextEdge = edges[nextEdgeIndex];

      currentId = nextId;
      nextId = nextEdge.a === currentId ? nextEdge.b : nextEdge.a;
      currentEdgeIndex = nextEdgeIndex;
    }

    stats.rejectedLoops += 1;
  });

  stats.loopCount = loops.length;

  return { loops, stats };
}

// Which loops are the outline of solid material and which are holes in it
// (the gap between an arm and the chest, say): a loop nested inside an odd
// number of others is a hole of its innermost container.
function groupCapRegions(loops: CapLoop[]) {
  const containers = loops.map((loop, index) =>
    loops
      .map((_, otherIndex) => otherIndex)
      .filter(
        (otherIndex) =>
          otherIndex !== index &&
          loops[otherIndex].area > loop.area &&
          pointInLoop(loop.uv[0], loops[otherIndex].uv),
      ),
  );
  const regions: Array<{ contour: CapLoop; holes: CapLoop[] }> = [];
  const regionByLoop = new Map<number, number>();

  loops.forEach((loop, index) => {
    if (containers[index].length % 2 === 0) {
      regionByLoop.set(index, regions.length);
      regions.push({ contour: loop, holes: [] });
    }
  });

  loops.forEach((loop, index) => {
    if (containers[index].length % 2 === 1) {
      // Innermost container: the one with the smallest area.
      const parentIndex = containers[index].reduce((best, candidate) =>
        loops[candidate].area < loops[best].area ? candidate : best,
      );
      const region = regionByLoop.get(parentIndex);

      if (region !== undefined) {
        regions[region].holes.push(loop);
      }
    }
  });

  return regions;
}

function makeCapPolygons(loops: CapLoop[], normal: THREE.Vector3) {
  const polygons: FragmentPolygon[] = [];
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();

  const pushCapTriangle = (points: THREE.Vector3[]) => {
    edgeA.subVectors(points[1], points[0]);
    edgeB.subVectors(points[2], points[0]);
    const triangleNormal = edgeA.cross(edgeB);

    // Only a truly collinear triangle is dropped: the ear triangles earcut
    // makes along the boundary are routinely thinner than any of the
    // mesh's own, and rejecting them punches holes in the cap.
    if (triangleNormal.lengthSq() <= 1e-24) {
      return;
    }

    const ordered = triangleNormal.dot(normal) < 0 ? [points[0], points[2], points[1]] : points;

    polygons.push({
      kind: "cap",
      vertices: ordered.map((point) => ({ normal: normal.clone(), point })),
    });
  };

  groupCapRegions(loops).forEach(({ contour, holes }) => {
    const rings = [contour, ...holes];
    const owner: Array<{ local: number; ring: number }> = [];

    rings.forEach((ring, ringIndex) => {
      ring.uv.forEach((_, local) => owner.push({ local, ring: ringIndex }));
    });

    const triangles = THREE.ShapeUtils.triangulateShape(
      contour.uv,
      holes.map((hole) => hole.uv),
    );

    const chainFor = (from: number, to: number) => {
      const a = owner[from];
      const b = owner[to];

      if (a.ring === b.ring) {
        const ring = rings[a.ring];
        const count = ring.points.length;

        if ((a.local + 1) % count === b.local) {
          return ring.edgeChains[a.local];
        }

        if ((b.local + 1) % count === a.local) {
          return [...ring.edgeChains[b.local]].reverse();
        }
      }

      return [rings[a.ring].points[a.local], rings[b.ring].points[b.local]];
    };

    triangles.forEach((indices) => {
      const corners = indices.map((index) => rings[owner[index].ring].points[owner[index].local]);
      const chains = indices.map((from, edge) => chainFor(from, indices[(edge + 1) % 3]));
      const enriched = chains
        .map((chain, edge) => ({ chain, edge }))
        .filter(({ chain }) => chain.length > 2);

      if (enriched.length === 0) {
        pushCapTriangle(corners);
        return;
      }

      if (enriched.length === 1) {
        const { chain, edge } = enriched[0];
        const opposite = corners[(edge + 2) % 3];

        for (let index = 0; index < chain.length - 1; index++) {
          pushCapTriangle([chain[index], chain[index + 1], opposite]);
        }

        return;
      }

      const boundary: THREE.Vector3[] = [];

      chains.forEach((chain, edge) => {
        boundary.push(...(edge === 0 ? chain : chain.slice(1)));
      });

      if (boundary.length > 1 && boundary[0] === boundary[boundary.length - 1]) {
        boundary.pop();
      }

      const centroid = corners
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .multiplyScalar(1 / 3);

      boundary.forEach((point, index) => {
        pushCapTriangle([point, boundary[(index + 1) % boundary.length], centroid]);
      });
    });
  });

  return polygons;
}

// Cuts a set of polygons by a plane: the polygons on each side (crossing
// ones clipped), and the segments where the plane meets them. Every point
// where an edge meets the plane is computed once, from the same end,
// whichever polygon asks for it, and shared by object.
function cutPolygons(
  polygons: FragmentPolygon[],
  plane: SplitPlane,
  memo: Map<number, FragmentVertex> = new Map(),
) {
  const { constant, normal } = plane;
  const negative: FragmentPolygon[] = [];
  const positive: FragmentPolygon[] = [];
  const segments: Array<readonly [FragmentVertex, FragmentVertex]> = [];

  const intersect = (a: FragmentVertex, b: FragmentVertex, da: number, db: number) => {
    const ia = idOf(a.point);
    const ib = idOf(b.point);
    const canonical = ia < ib;
    const key = canonical ? ia * 67108864 + ib : ib * 67108864 + ia;
    const existing = memo.get(key);

    if (existing) {
      return existing;
    }

    const [p, q, dp, dq] = canonical ? [a, b, da, db] : [b, a, db, da];
    const t = THREE.MathUtils.clamp(dp / (dp - dq), 0, 1);
    const point = p.point.clone().lerp(q.point, t);

    point.addScaledVector(normal, constant - normal.dot(point));

    const vertex = {
      normal: p.normal.clone().lerp(q.normal, t).normalize(),
      point,
    };

    memo.set(key, vertex);

    return vertex;
  };

  const nx = normal.x;
  const ny = normal.y;
  const nz = normal.z;

  for (const polygon of polygons) {
    const vertices = polygon.vertices;
    const count = vertices.length;
    let hasNegative = false;
    let hasPositive = false;

    // Most polygons lie wholly on one side: sort those out without
    // allocating anything.
    for (let index = 0; index < count; index++) {
      const p = vertices[index].point;
      const d = nx * p.x + ny * p.y + nz * p.z - constant;

      if (d < -CLIP_EPSILON) hasNegative = true;
      else if (d > CLIP_EPSILON) hasPositive = true;
    }

    if (!hasNegative) {
      // Coplanar polygons go to one side only.
      (hasPositive ? positive : negative).push(polygon);
      continue;
    }

    if (!hasPositive) {
      negative.push(polygon);
      continue;
    }

    const distances = vertices.map((vertex) => normal.dot(vertex.point) - constant);
    const sides = distances.map((d) => (d > CLIP_EPSILON ? 1 : d < -CLIP_EPSILON ? -1 : 0));

    const negativeVertices: FragmentVertex[] = [];
    const positiveVertices: FragmentVertex[] = [];
    const cutPoints: FragmentVertex[] = [];

    for (let index = 0; index < count; index++) {
      const current = vertices[index];
      const nextIndex = (index + 1) % count;
      const next = vertices[nextIndex];
      const side = sides[index];

      if (side <= 0) negativeVertices.push(current);
      if (side >= 0) positiveVertices.push(current);
      if (side === 0) cutPoints.push(current);

      if (side * sides[nextIndex] < 0) {
        const crossing = intersect(current, next, distances[index], distances[nextIndex]);

        negativeVertices.push(crossing);
        positiveVertices.push(crossing);
        cutPoints.push(crossing);
      }
    }

    if (negativeVertices.length >= 3) {
      negative.push({ kind: polygon.kind, vertices: negativeVertices });
    }

    if (positiveVertices.length >= 3) {
      positive.push({ kind: polygon.kind, vertices: positiveVertices });
    }

    // Our polygons are all convex, so a crossing one meets the plane in
    // exactly two distinct points.
    const distinct = cutPoints.filter(
      (vertex, index) => cutPoints.findIndex((other) => other.point === vertex.point) === index,
    );

    if (distinct.length === 2) {
      segments.push([distinct[0], distinct[1]] as const);
    }
  }

  return { negative, positive, segments };
}

// The whole figure's section on a plane: its cut points (shared by object
// with whatever else is cut on the plane) and its closed loops. Cached per
// plane, as the two cells either side of a bisector both need it.
type PlaneSection = {
  loops: CapLoop[];
  memo: Map<number, FragmentVertex>;
  stats: CapBuildStats;
};

function sectionOf(source: FragmentPiece, plane: SplitPlane, cache: Map<string, PlaneSection>) {
  const cached = cache.get(plane.key);

  if (cached) return cached;

  const memo = new Map<number, FragmentVertex>();
  const segments = sectionSegments(source, plane, memo);
  const { loops, stats } = traceCapLoops(segments, plane);
  const section = { loops, memo, stats };

  cache.set(plane.key, section);

  return section;
}

// Only the segments where the plane meets the polygons: the same cut
// points as cutPolygons (same memo), without building either side. This
// runs over the whole figure once per bisector, so it is kept lean.
function sectionSegments(
  source: FragmentPiece,
  plane: SplitPlane,
  memo: Map<number, FragmentVertex>,
) {
  const polygons = source.polygons;
  const flat = source.flat;
  const { constant, normal } = plane;
  const nx = normal.x;
  const ny = normal.y;
  const nz = normal.z;
  const segments: Array<readonly [FragmentVertex, FragmentVertex]> = [];

  const intersect = (a: FragmentVertex, b: FragmentVertex, da: number, db: number) => {
    const ia = idOf(a.point);
    const ib = idOf(b.point);
    const canonical = ia < ib;
    const key = canonical ? ia * 67108864 + ib : ib * 67108864 + ia;
    const existing = memo.get(key);

    if (existing) return existing;

    const [p, q, dp, dq] = canonical ? [a, b, da, db] : [b, a, db, da];
    const t = THREE.MathUtils.clamp(dp / (dp - dq), 0, 1);
    const point = p.point.clone().lerp(q.point, t);

    point.addScaledVector(normal, constant - normal.dot(point));

    const vertex = { normal: p.normal.clone().lerp(q.normal, t).normalize(), point };

    memo.set(key, vertex);

    return vertex;
  };

  for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
    // Triangles wholly on one side, sorted out on the flat array.
    if (flat) {
      const base = polygonIndex * 9;
      const d0 = nx * flat[base] + ny * flat[base + 1] + nz * flat[base + 2] - constant;
      const d1 = nx * flat[base + 3] + ny * flat[base + 4] + nz * flat[base + 5] - constant;
      const d2 = nx * flat[base + 6] + ny * flat[base + 7] + nz * flat[base + 8] - constant;

      if (
        (d0 < -CLIP_EPSILON && d1 < -CLIP_EPSILON && d2 < -CLIP_EPSILON) ||
        (d0 > CLIP_EPSILON && d1 > CLIP_EPSILON && d2 > CLIP_EPSILON)
      ) {
        continue;
      }
    }

    const polygon = polygons[polygonIndex];
    const vertices = polygon.vertices;
    const count = vertices.length;
    let first: FragmentVertex | null = null;
    let second: FragmentVertex | null = null;

    for (let index = 0; index < count; index++) {
      const current = vertices[index];
      const next = vertices[(index + 1) % count];
      const pc = current.point;
      const pn = next.point;
      const dc = nx * pc.x + ny * pc.y + nz * pc.z - constant;
      const dn = nx * pn.x + ny * pn.y + nz * pn.z - constant;
      const sc = dc > CLIP_EPSILON ? 1 : dc < -CLIP_EPSILON ? -1 : 0;
      const sn = dn > CLIP_EPSILON ? 1 : dn < -CLIP_EPSILON ? -1 : 0;
      let hit: FragmentVertex | null = null;

      if (sc === 0) hit = current;
      else if (sc * sn < 0) hit = intersect(current, next, dc, dn);

      if (!hit) continue;

      if (!first) first = hit;
      else if (hit.point !== first.point && !second) second = hit;
    }

    if (first && second) segments.push([first, second] as const);
  }

  return segments;
}

// Keeps the side of the plane its normal points away from, capped. The
// cap is the whole figure's section on the plane (so its loops are always
// closed, however little of the figure `polygons` covers), trimmed by the
// piece's other planes; the same shared cut points are used for cap and
// surface, so they meet vertex for vertex.
function clipToHalfSpace(
  polygons: FragmentPolygon[],
  plane: SplitPlane,
  otherPlanes: SplitPlane[],
  source: FragmentPiece,
  sections: Map<string, PlaneSection>,
) {
  const section = sectionOf(source, plane, sections);
  const { negative } = cutPolygons(polygons, plane, section.memo);
  let cap = makeCapPolygons(section.loops, plane.normal);

  for (const other of otherPlanes) {
    if (cap.length === 0) break;
    // Skip planes the cap is wholly inside of.
    let crosses = false;

    for (const polygon of cap) {
      if (polygon.vertices.some((vertex) => other.normal.dot(vertex.point) - other.constant > CLIP_EPSILON)) {
        crosses = true;
        break;
      }
    }

    if (crosses) cap = cutPolygons(cap, other).negative;
  }

  negative.push(...cap);

  return { polygons: negative, stats: section.stats };
}

function countOpenGeometryEdges(geometry: THREE.BufferGeometry) {
  const triangleGeometry = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = triangleGeometry.getAttribute("position") as THREE.BufferAttribute;
  const edgeCounts = new Map<string, number>();
  const keyAt = (index: number) =>
    `${position.getX(index)},${position.getY(index)},${position.getZ(index)}`;

  for (let index = 0; index + 2 < position.count; index += 3) {
    const keys = [keyAt(index), keyAt(index + 1), keyAt(index + 2)];

    [
      [0, 1],
      [1, 2],
      [2, 0],
    ].forEach(([from, to]) => {
      if (keys[from] === keys[to]) return;
      const key = keys[from] < keys[to] ? `${keys[from]}|${keys[to]}` : `${keys[to]}|${keys[from]}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    });
  }

  triangleGeometry.dispose();

  let openEdges = 0;

  edgeCounts.forEach((count) => {
    if (count % 2 === 1) openEdges += 1;
  });

  return openEdges;
}

// ---------------------------------------------------------------------------
// Seeds: where the pieces are centred, and the order they break in
// ---------------------------------------------------------------------------

type BreakPhase = "head" | "upper" | "lower";

type Seed = {
  phase: BreakPhase;
  point: THREE.Vector3;
  /** 0..1 along the break: how far the seed sits from the impact, so the
   * cascade travels outward from where the figure struck. */
  position: number;
  /**
   * The same before `releaseTexture` moved it: the plane's own rank. The
   * order's guard reads both (see planReleaseOrder).
   */
  planePosition: number;
};

// Ray parity along +x against the whole mesh: is the point inside the
// figure? Only used for placing seeds, so plain loops are fine.
function makeInsideTest(piece: FragmentPiece) {
  const triangles: THREE.Vector3[][] = [];

  piece.polygons.forEach((polygon) => {
    for (let index = 1; index < polygon.vertices.length - 1; index++) {
      triangles.push([
        polygon.vertices[0].point,
        polygon.vertices[index].point,
        polygon.vertices[index + 1].point,
      ]);
    }
  });

  // Triangles bucketed on y and z, since the ray runs along x.
  const box = piece.box;
  const bins = 48;
  const binY = (y: number) =>
    THREE.MathUtils.clamp(Math.floor(((y - box.min.y) / Math.max(box.max.y - box.min.y, 1e-6)) * bins), 0, bins - 1);
  const binZ = (z: number) =>
    THREE.MathUtils.clamp(Math.floor(((z - box.min.z) / Math.max(box.max.z - box.min.z, 1e-6)) * bins), 0, bins - 1);
  const buckets: number[][] = Array.from({ length: bins * bins }, () => []);

  triangles.forEach(([a, b, c], index) => {
    const y0 = binY(Math.min(a.y, b.y, c.y));
    const y1 = binY(Math.max(a.y, b.y, c.y));
    const z0 = binZ(Math.min(a.z, b.z, c.z));
    const z1 = binZ(Math.max(a.z, b.z, c.z));

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) buckets[y * bins + z].push(index);
    }
  });

  return (point: THREE.Vector3) => {
    let crossings = 0;

    for (const index of buckets[binY(point.y) * bins + binZ(point.z)]) {
      const [a, b, c] = triangles[index];

      if (
        (a.y < point.y && b.y < point.y && c.y < point.y) ||
        (a.y > point.y && b.y > point.y && c.y > point.y) ||
        (a.z < point.z && b.z < point.z && c.z < point.z) ||
        (a.z > point.z && b.z > point.z && c.z > point.z) ||
        (a.x < point.x && b.x < point.x && c.x < point.x)
      ) {
        continue;
      }

      const e1y = b.y - a.y;
      const e1z = b.z - a.z;
      const e2y = c.y - a.y;
      const e2z = c.z - a.z;
      const det = e1y * -e2z + e1z * e2y;

      if (Math.abs(det) < 1e-12) continue;

      const f = 1 / det;
      const sy = point.y - a.y;
      const sz = point.z - a.z;
      const u = f * (sy * -e2z + sz * e2y);

      if (u < 0 || u > 1) continue;

      const sx = point.x - a.x;
      const e1x = b.x - a.x;
      const e2x = c.x - a.x;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = f * qx;

      if (v < 0 || u + v > 1) continue;

      const t = f * (e2x * qx + e2y * qy + e2z * qz);

      if (t > 1e-9) crossings += 1;
    }

    return crossings % 2 === 1;
  };
}

const TAU = Math.PI * 2;
// How far from the blow the size variation is held off, in figure units, so
// the first thing to break always breaks small.
const IMPACT_FINE_RADIUS = 0.55;

/** Smoothstep on an already-normalised 0..1 input. */
function smoothstep01(x: number) {
  const t = THREE.MathUtils.clamp(x, 0, 1);

  return t * t * (3 - 2 * t);
}

/**
 * How much bigger or smaller the cells want to be HERE, on top of the
 * grading around the impact.
 *
 * This has to vary smoothly through space, not per seed. Giving every seed
 * its own random size only produces salt-and-pepper: the sampler places all
 * the small-spacing seeds first, they spread out evenly, and the Voronoi
 * relaxes the difference away — measured, it moved the spread within a
 * distance band from 2.2x to 2.9x, which is nothing. A smooth field means
 * neighbouring seeds agree, so the figure comes apart in coarse patches and
 * fine patches the way stone actually breaks.
 *
 * Sine products rather than a noise library: deterministic, cheap, and
 * phased off the build seed so it is stable per build.
 */
function sizeFieldAt(point: THREE.Vector3, options: BuildSolidChunkOptions) {
  const seed = options.seed;
  const coarse =
    Math.sin(point.x * 1.9 + hash01(1, seed) * TAU) *
    Math.sin(point.y * 1.3 + hash01(2, seed) * TAU) *
    Math.sin(point.z * 2.3 + hash01(3, seed) * TAU);
  const finer =
    Math.sin(point.x * 3.7 + hash01(4, seed) * TAU) *
    Math.sin(point.y * 3.1 + hash01(5, seed) * TAU);

  const field = (coarse + 0.55 * finer) / 1.55;
  const swing = field > 0 ? (options.sizeVariationUp ?? options.sizeVariation) : options.sizeVariation;
  return Math.exp(field * swing);
}

/**
 * Seeds graded around the impact: a greedy Poisson-disc sampling whose
 * target spacing GROWS with distance from the blow, so cells are fine where
 * the figure struck and coarse away from it. That grading, more than any
 * single crack, is what reads as smashed rather than taken apart.
 *
 * Candidates are surface points pushed inward, and that is load-bearing
 * rather than incidental: `carveCell` sizes a cell's surface patch from the
 * polygons nearest its seed, so a seed floating deep in the interior owns no
 * surface, comes out as a cap-only solid, and is then dropped by the dust
 * filter in `fractureIntoPieces` — a hole in the figure, silently. Every
 * seed has to sit under skin.
 */
function sampleGradedSeeds(
  candidates: THREE.Vector3[],
  impact: THREE.Vector3,
  spacingAt: (distance: number) => number,
  /**
   * What each candidate's cell size is graded on — plain distance from the
   * impact, or, with `gradeAlongSweep`, how far along the break's own order
   * it sits (see planSeeds). Separate from `distances` below, which is the
   * real distance from the blow and stays what the shells and the blow's
   * own fine neighbourhood are measured with.
   */
  gradeDistances: number[],
  shellRadii: number[],
  existing: THREE.Vector3[],
  stretch: number,
  options: BuildSolidChunkOptions,
) {
  if (candidates.length === 0) return [];

  const distances = candidates.map((candidate) => candidate.distanceTo(impact));
  // Cell size is the distance grading times a SMOOTH field over the figure
  // (see sizeFieldAt): coarse patches and fine patches, not per-seed noise.
  // Cell size is the distance grading times the smooth field — but the
  // field is held OFF right at the blow and eased in over
  // IMPACT_FINE_RADIUS. The field swings cell size by e^±sizeVariation, and
  // at 2.1 that is enough to drop a coarse patch straight onto the hand and
  // take the whole thing off as one lump. The break has to start with the
  // hand coming apart into pieces, so the blow's own neighbourhood keeps the
  // fine spacing the grading asks for and the variation takes over outside
  // it.
  //
  // The field is also held DOWN over the part of the figure the break opens
  // with (`variationNear`, graded on the same distance as the spacing). It
  // has to be: the room test measures a candidate against the LARGER of the
  // two spacings, so one coarse seed sets the size of everything around it,
  // and the field's up-swing (e^4.8 at the top, an 11x spacing) drops such
  // seeds anywhere. Measured with the field at full strength everywhere:
  // pieces within 0.55 of the shoulder came out at a mean radius of 0.23
  // whether spacingNear was 0.075 or 0.05, and whether there were 2200
  // candidates to place them on or 4200.
  const variationNear = options.variationNear ?? 1;
  const spacings = candidates.map((candidate, index) => {
    const fieldIn = smoothstep01(distances[index] / IMPACT_FINE_RADIUS);
    const varyIn =
      variationNear +
      (1 - variationNear) *
        (1 - Math.exp(-gradeDistances[index] / Math.max(options.spacingFalloff, 1e-6)));

    return (
      spacingAt(gradeDistances[index]) *
      Math.pow(sizeFieldAt(candidate, options), fieldIn * varyIn)
    );
  });
  // How close a candidate sits to one of the concentric shells around the
  // impact: 1 on a shell, 0 midway between two. Pulling seeds onto shells
  // lines their bisectors up into rings around the blow with spokes between
  // them, which is the signature of an impact fracture. The band either
  // side of a shell is half the radial gap between seeds, which is the
  // spacing times the stretch (see `gap` below): the shells themselves step
  // that far apart, and a band of half the plain spacing would leave the
  // pull dead across two thirds of each gap.
  const shell = distances.map((distance, index) => {
    let nearestShell = Infinity;

    for (const radius of shellRadii) {
      nearestShell = Math.min(nearestShell, Math.abs(distance - radius));
    }

    return 1 - Math.min(nearestShell / Math.max(spacings[index] * 0.5 * stretch, 1e-6), 1);
  });
  // The room between two points, with the part of it that runs along the
  // line from the impact shrunk by `stretch` (the caller's `radialStretch`):
  // a seed then has to sit that much further from its neighbour along that
  // line than across it to count as clear, and the (plain Euclidean)
  // Voronoi cells the carve cuts between them come out that much longer
  // towards the blow than they are wide. The line is taken at the pair's
  // midpoint so the distance is the same seen from either end.
  //
  // Right at the blow there is no line to take: a pair straddling the
  // impact has a midpoint a hair from it, pointing wherever rounding
  // says, and the split into along and across would then be decided by
  // noise. So the stretch eases in from 1 (plain distance) to full over
  // the first half-spacing of midpoint distance from the impact — a ramp,
  // not a threshold, so no pair's room jumps as the midpoint crosses it.
  const between = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const gap = (a: THREE.Vector3, b: THREE.Vector3) => {
    between.subVectors(b, a);
    radial.addVectors(a, b).multiplyScalar(0.5).sub(impact);

    const reach = radial.length();

    if (reach < 1e-6) return between.length();

    const local = 1 + (stretch - 1) * smoothstep01(reach / (0.5 * spacingAt(reach)));
    const along = between.dot(radial) / reach;
    const across = Math.max(between.lengthSq() - along * along, 0);

    return Math.sqrt(across + (along * along) / (local * local));
  };
  const nearest = candidates.map((candidate) =>
    existing.reduce((best, point) => Math.min(best, gap(candidate, point)), Infinity),
  );
  const chosen: THREE.Vector3[] = [];
  const take = (index: number) => {
    chosen.push(candidates[index]);

    for (let other = 0; other < candidates.length; other++) {
      // The room a candidate has from this seed is measured against the
      // LARGER of the two spacings, folded in here so the room test below
      // (nearest / own spacing) comes out as gap / max(own, seed's). A
      // fine candidate next to a coarse seed must keep the coarse seed's
      // distance: otherwise the fine seeds crowd the coarse cell's edges
      // and bound it, and a wide target spacing only ever thinned the
      // seeds inside the cell without making the cell any bigger —
      // measured: doubling the large side's swing moved the biggest
      // pieces by 6%. With this the coarse patches really are one piece.
      const share = Math.min(spacings[other] / spacings[index], 1);
      nearest[other] = Math.min(nearest[other], gap(candidates[other], candidates[index]) * share);
    }
  };

  // Start at the blow itself, so the first cell is the one it made and the
  // release order below begins there.
  let first = 0;
  for (let index = 1; index < candidates.length; index++) {
    if (distances[index] < distances[first]) first = index;
  }
  take(first);

  while (chosen.length < options.maxPieces) {
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let index = 0; index < candidates.length; index++) {
      // Room measured against what this distance from the impact asks for,
      // so a gap that is generous out at the base still loses to a gap that
      // is merely adequate next to the blow.
      const room = nearest[index] / spacings[index];

      if (room < SEED_STOP_RATIO) continue;

      // Coarse candidates first. Room is RELATIVE to spacing, so a fine
      // candidate always had the more room and went first, and by the
      // time a coarse one was placed its ground was already taken by fine
      // seeds around it — a coarse patch never came out as one big piece
      // however wide its target spacing (measured: 6% on the biggest).
      // Weighting the score by the spacing lets the coarse seeds claim
      // their ground while it is empty and the fine ones fill in after;
      // the room is capped so an untouched candidate's infinite room does
      // not swamp the weighting.
      const score =
        Math.min(room, 4) *
        (spacings[index] / options.spacingFar) *
        (1 + options.shellBias * shell[index]) *
        // +-8%: widening this to +-25% was measured to change nothing.
        (0.92 + hash01(index + chosen.length * 7, options.seed + 311) * 0.16);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    // Every candidate is now closer to a seed than its own spacing wanted:
    // the figure is covered at the density the grading asked for.
    if (bestIndex < 0) break;

    take(bestIndex);
  }

  return chosen;
}

/**
 * Where the pieces are centred and the order they come loose in, both
 * measured from the impact.
 */
function planSeeds(source: FragmentPiece, options: BuildSolidChunkOptions) {
  const modelBox = source.box;
  const size = modelBox.getSize(new THREE.Vector3());
  const toModel = (fraction: [number, number, number]) =>
    new THREE.Vector3(
      modelBox.min.x + size.x * fraction[0],
      modelBox.min.y + size.y * fraction[1],
      modelBox.min.z + size.z * fraction[2],
    );
  const impact = toModel(options.impact);
  const headFloor = modelBox.min.y + size.y * options.headFrom;
  const legsCeiling = modelBox.min.y + size.y * options.legsFrom;
  const inside = makeInsideTest(source);

  // Target cell width against distance from the impact: tight at the blow,
  // easing out to `spacingFar`. Flat over `spacingHold` first when there is
  // one, then a smoothstep over `spacingFalloff` (see the option).
  const spacingAt = (distance: number) => {
    if (options.spacingHold === undefined) {
      return (
        options.spacingNear +
        (options.spacingFar - options.spacingNear) *
          (1 - Math.exp(-distance / Math.max(options.spacingFalloff, 1e-6)))
      );
    }

    // Under the hold: from `spacingOpening` at the break's own start up to
    // `spacingNear`, so the pieces the break opens with are the fine ones.
    if (distance < options.spacingHold && options.spacingOpening !== undefined) {
      return (
        options.spacingOpening +
        (options.spacingNear - options.spacingOpening) *
          smoothstep01(distance / Math.max(options.spacingHold, 1e-6))
      );
    }

    return (
      options.spacingNear +
      (options.spacingFar - options.spacingNear) *
        smoothstep01((distance - options.spacingHold) / Math.max(options.spacingFalloff, 1e-6))
    );
  };

  // Shells stepping outward from the impact, each one the local spacing
  // beyond the last, so the rings open out as the cells do. The step is
  // stretched along with the seeds (see `radialStretch`): the sampler makes
  // seeds sit that much further apart along the line from the blow, and
  // shells packed tighter than that would have nothing to land on them.
  // The same stretch goes to the sampler, so its room test, its shell band
  // and this step all measure the radial gap the same way.
  const stretch = Math.max(options.radialStretch, 1);
  const reach = modelBox.min.distanceTo(modelBox.max);
  const shellRadii: number[] = [];

  for (
    let radius = options.spacingNear * SHELL_START;
    radius < reach;
    radius += spacingAt(radius) * stretch
  ) {
    shellRadii.push(radius);
  }

  // Candidates: surface points pushed inward along their normals, kept if
  // they land inside the figure.
  const candidates: THREE.Vector3[] = [];
  const stride = Math.max(
    1,
    Math.floor(source.polygons.length / (options.candidateTarget ?? CANDIDATE_TARGET)),
  );

  for (let index = 0; index < source.polygons.length; index += stride) {
    const polygon = source.polygons[index];
    const centroid = new THREE.Vector3();
    const normal = new THREE.Vector3();

    polygon.vertices.forEach((vertex) => {
      centroid.add(vertex.point);
      normal.add(vertex.normal);
    });
    centroid.multiplyScalar(1 / polygon.vertices.length);
    normal.normalize();

    const depth = 0.1 + hash01(index, options.seed + 331) * 0.14;
    const point = centroid.addScaledVector(normal, -depth);

    if (!inside(point)) continue;

    candidates.push(point);
  }

  const guardPoints = options.guardSeeds.map(toModel);
  // A piece's rank in the order is how far its seed sits from where the
  // break starts (the blow itself when none is given). It is a tie-break
  // inside the flight's constraint graph, not the order itself.
  const releaseFrom = options.releaseFrom ? new THREE.Vector3(...options.releaseFrom) : impact;
  const weights = options.releaseWeights ?? { across: 1, down: 1, up: 1 };
  const spreadFrom = (point: THREE.Vector3) => {
    const dx = point.x - releaseFrom.x;
    const dy = (point.y - releaseFrom.y) * (point.y > releaseFrom.y ? weights.up : weights.down);
    const dz = (point.z - releaseFrom.z) * weights.across;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  const farthest = Math.max(
    ...candidates.concat(guardPoints).map((point) => spreadFrom(point)),
    1e-6,
  );
  // The break's order, as a 0..1 rank, worked out over the CANDIDATE points
  // — before any seed exists — so the same rank can both grade the cells
  // (`gradeAlongSweep`) and order the pieces at the end of this function.
  const sweep = options.releaseSweep
    ? new THREE.Vector3(...options.releaseSweep).normalize()
    : null;
  const lateFloor =
    options.lateFrom === undefined ? -Infinity : modelBox.min.y + size.y * options.lateFrom;
  const isLate = (point: THREE.Vector3) => point.y < lateFloor;
  // The head's corner of the figure, the mirror of `lateFrom`: above a
  // height and past a point across, it is ranked EARLY whatever the plane
  // says. See the option's own note for why the plane cannot do this.
  const earlyFloor = options.earlyBand
    ? modelBox.min.y + size.y * options.earlyBand.above
    : Infinity;
  const earlyEdge = options.earlyBand
    ? modelBox.min.x + size.x * options.earlyBand.toward
    : -Infinity;
  const isEarly = (point: THREE.Vector3) =>
    point.y > earlyFloor && point.x < earlyEdge && !isLate(point);
  // Each band's own span along the sweep, in figure units. The body's is
  // also what the cell grading measures its falloff in.
  let bodyMin = Infinity;
  let bodyMax = -Infinity;
  let lateMin = Infinity;
  let lateMax = -Infinity;
  let earlyMin = Infinity;
  let earlyMax = -Infinity;

  if (sweep) {
    for (const point of candidates.concat(guardPoints)) {
      const along = point.dot(sweep);

      if (isLate(point)) {
        lateMin = Math.min(lateMin, along);
        lateMax = Math.max(lateMax, along);
      } else if (isEarly(point)) {
        earlyMin = Math.min(earlyMin, along);
        earlyMax = Math.max(earlyMax, along);
      } else {
        bodyMin = Math.min(bodyMin, along);
        bodyMax = Math.max(bodyMax, along);
      }
    }
  }

  const bodySpan = Math.max(bodyMax - bodyMin, 1e-6);
  // The body fills the first 0.7 of the order and the base the last 0.28,
  // whatever the sweep says about where the base sits. The gap between
  // them is what keeps the two from interleaving once the constraint graph
  // has had its say.
  const BODY_SHARE = 0.7;
  const LATE_START = 0.72;
  // The head's window. It deliberately OVERLAPS the body's — the head is
  // meant to come apart while the plane is still crossing the shoulder and
  // the upper chest, one continuing break rather than a separate event, so
  // there is no gap here of the kind the base gets. The window has to sit
  // this early because the flight's constraint graph moves both ends
  // toward each other: at 0.10-0.26 the BAKE came out with the head at
  // percentile 0.271 and the mid torso at 0.264, a dead heat, against the
  // 0.25 / 0.30 the chunk centres alone predicted. Measured on the bake at
  // 0.05-0.19: head (y > 1.05, x < -0.6) 0.21, mid torso (0.2 < y < 0.85,
  // x > -0.6) 0.26.
  const EARLY_START = 0.05;
  const EARLY_END = 0.19;
  const rank01 = (point: THREE.Vector3) => {
    if (!sweep) return spreadFrom(point) / farthest;

    const along = point.dot(sweep);

    if (isLate(point) && lateMax > lateMin) {
      return LATE_START + (1 - LATE_START) * ((along - lateMin) / (lateMax - lateMin));
    }

    if (isEarly(point) && earlyMax > earlyMin) {
      return (
        EARLY_START + (EARLY_END - EARLY_START) * ((along - earlyMin) / (earlyMax - earlyMin))
      );
    }

    return BODY_SHARE * THREE.MathUtils.clamp((along - bodyMin) / bodySpan, 0, 1);
  };
  // Cell size follows the order rather than the distance from the blow when
  // `gradeAlongSweep` is on: the rank is turned back into figure units
  // (the body's span along the sweep) so `spacingFalloff` still reads as a
  // distance. The base lands past LATE_START * span, which is well beyond
  // the falloff, so it comes out at `spacingFar` throughout.
  const gradeDistanceOf = (point: THREE.Vector3) =>
    sweep && options.gradeAlongSweep ? rank01(point) * bodySpan : point.distanceTo(impact);
  const points = guardPoints.concat(
    sampleGradedSeeds(
      candidates,
      impact,
      spacingAt,
      candidates.map(gradeDistanceOf),
      shellRadii,
      guardPoints,
      stretch,
      options,
    ),
  );
  // Drop any pair that ended up on top of each other (see
  // SEED_MIN_SEPARATION: a coincident pair is a NaN bisector).
  const kept: THREE.Vector3[] = [];

  for (const point of points) {
    if (kept.some((other) => other.distanceTo(point) < SEED_MIN_SEPARATION)) continue;

    kept.push(point);
  }

  // The order's texture (`releaseTexture`). Only the ORDER is moved, after
  // the cells are graded, so the grading still follows the plane and the
  // fine pieces stay where the break opens.
  const texture = sweep ? options.releaseTexture : undefined;
  const noise = kept.map(() => 0);

  if (texture) {
    const patches = makeSmoothField(options.seed + 401, texture.grain);
    const textured = kept.map((point, index) => index).filter((index) => !isLate(kept[index]));

    textured.forEach((index) => {
      noise[index] =
        Math.sqrt(texture.shared) * patches(kept[index]) +
        Math.sqrt(1 - texture.shared) * gaussianHash(index, options.seed + 409);
    });

    // Take out any straight-line trend the field happens to have across the
    // figure, keeping its spread. Over a figure only a few patches wide a
    // smooth field often leans one way, and a lean in the noise is a tilt
    // of the front: simulated over the bake's chunk centres, three field
    // seeds turned the front's path on screen by 9, 10 and 17 degrees;
    // detrended, all four seeds tried stayed within 6 of the plane's own.
    const spreadBefore = Math.sqrt(
      textured.reduce((sum, index) => sum + noise[index] ** 2, 0) / Math.max(textured.length, 1),
    );
    const trend = fitLinear(
      textured.map((index) => kept[index]),
      textured.map((index) => noise[index]),
    );

    textured.forEach((index) => {
      noise[index] -= trend(kept[index]);
    });

    const spreadAfter = Math.sqrt(
      textured.reduce((sum, index) => sum + noise[index] ** 2, 0) / Math.max(textured.length, 1),
    );

    textured.forEach((index) => {
      // Mostly LATE: a patch can hang back by a lot but come early by
      // little (RELEASE_TEXTURE_LEAD). Unbounded both ways, patches from
      // the back of the shoulder jumped into the first pieces off and the
      // break stopped opening on the front of the figure: the first 45
      // pieces' mean depth (0.61 with no texture) fell to 0.48 on the bake
      // with the taper at 0.1, and to 0.54-0.56 over three field seeds with
      // it at 0.15; with this floor those seeds gave 0.59-0.61. The front
      // edge stays ragged by pieces lagging behind it rather than by pieces
      // running ahead of it.
      noise[index] = Math.max(
        (noise[index] * spreadBefore) / Math.max(spreadAfter, 1e-9),
        RELEASE_TEXTURE_LEAD,
      );
    });
  }

  // How far each seed's texture moves it, with the taper that spares the
  // opening. Then the straight-line trend of THAT is taken out again over
  // the part of the body that is seen to break (RELEASE_TEXTURE_SEEN): the
  // lead floor and the taper are not symmetric, so noise detrended over the
  // whole figure still leans once they are applied. On the bake while
  // tuning (grain 0.28), the front's path on screen (release fitted against
  // screen x and y over the body) was 52 degrees below horizontal without
  // this and 49 with it, against the plane's own 44; the first 45 pieces'
  // mean depth went from 0.589 to 0.603. (Over the first quarter of the body alone the path is
  // not measurable: its 40 pieces give a bootstrap 10-90% range of 30
  // degrees on the plane's own order.)
  const shift = kept.map((point, index) =>
    texture && !isLate(point)
      ? texture.amount * smoothstep01(rank01(point) / Math.max(texture.taper, 1e-6)) * noise[index]
      : 0,
  );

  if (texture) {
    const seen = kept
      .map((point, index) => index)
      .filter(
        (index) =>
          !isLate(kept[index]) &&
          !isEarly(kept[index]) &&
          rank01(kept[index]) <= RELEASE_TEXTURE_SEEN,
      );
    const lean = fitLinear(
      seen.map((index) => kept[index]),
      seen.map((index) => shift[index]),
    );
    const mean = seen.reduce((sum, index) => sum + shift[index], 0) / Math.max(seen.length, 1);

    kept.forEach((point, index) => {
      if (isLate(point) || isEarly(point)) return;
      const rank = rank01(point);
      // Full inside the seen part, eased out over the next 0.15 of the
      // order, and tapered like the shift so the first pieces off stay put.
      const reach =
        (1 - smoothstep01((rank - RELEASE_TEXTURE_SEEN) / 0.15)) *
        smoothstep01(rank / Math.max(texture.taper, 1e-6));

      shift[index] -= (lean(point) - mean) * reach;
    });
  }

  const positionOf = (point: THREE.Vector3, index: number) => {
    const rank = rank01(point);

    if (!texture || isLate(point)) return rank;

    const moved = rank + shift[index];

    // The head keeps its window's floor and the body its ceiling, so neither
    // band's texture can carry a piece across into the base's.
    return isEarly(point)
      ? THREE.MathUtils.clamp(moved, EARLY_START, BODY_SHARE)
      : THREE.MathUtils.clamp(moved, 0, BODY_SHARE);
  };
  const seeds: Seed[] = kept.map((point, index) => ({
    phase: point.y >= headFloor ? "head" : point.y < legsCeiling ? "lower" : "upper",
    point,
    position: positionOf(point, index),
    planePosition: rank01(point),
  }));

  return { impact, seeds };
}

// ---------------------------------------------------------------------------
// Cells: the figure clipped to each seed's Voronoi region
// ---------------------------------------------------------------------------

// The planes that bound a seed's Voronoi region within the figure's
// bounding box: the box is clipped by every bisector in turn, as a convex
// polytope, and whichever bisectors survive as faces of it are the ones
// that can bound the cell. A face may lie wholly inside the figure — a
// wall between two interior cells that never reaches the surface — so
// this, not whether the surface crosses a plane, is what decides which
// planes apply.
function boundingPlanes(planes: SplitPlane[], box: THREE.Box3) {
  const min = box.min.clone().addScalar(-0.05);
  const max = box.max.clone().addScalar(0.05);
  const corners: THREE.Vector3[] = [];

  for (let index = 0; index < 8; index++) {
    corners.push(
      new THREE.Vector3(index & 4 ? max.x : min.x, index & 2 ? max.y : min.y, index & 1 ? max.z : min.z),
    );
  }

  type Face = { plane: SplitPlane | null; points: THREE.Vector3[] };
  let faces: Face[] = [
    { plane: null, points: [corners[0], corners[2], corners[6], corners[4]] },
    { plane: null, points: [corners[1], corners[5], corners[7], corners[3]] },
    { plane: null, points: [corners[0], corners[4], corners[5], corners[1]] },
    { plane: null, points: [corners[2], corners[3], corners[7], corners[6]] },
    { plane: null, points: [corners[0], corners[1], corners[3], corners[2]] },
    { plane: null, points: [corners[4], corners[6], corners[7], corners[5]] },
  ];

  for (const plane of planes) {
    const { constant, normal } = plane;
    const memo = new Map<number, THREE.Vector3>();
    const crossing = (a: THREE.Vector3, b: THREE.Vector3, da: number, db: number) => {
      const ia = idOf(a);
      const ib = idOf(b);
      const key = ia < ib ? ia * 67108864 + ib : ib * 67108864 + ia;
      let point = memo.get(key);

      if (!point) {
        const [p, q, dp, dq] = ia < ib ? [a, b, da, db] : [b, a, db, da];

        point = p.clone().lerp(q, dp / (dp - dq));
        memo.set(key, point);
      }

      return point;
    };
    const next: Face[] = [];
    const rim = new Set<THREE.Vector3>();

    for (const face of faces) {
      const distances = face.points.map((point) => normal.dot(point) - constant);

      if (distances.every((d) => d <= CLIP_EPSILON)) {
        next.push(face);
        continue;
      }

      if (distances.every((d) => d >= -CLIP_EPSILON)) {
        continue;
      }

      const kept: THREE.Vector3[] = [];

      face.points.forEach((point, index) => {
        const other = face.points[(index + 1) % face.points.length];
        const d = distances[index];
        const dOther = distances[(index + 1) % face.points.length];

        if (d <= CLIP_EPSILON) kept.push(point);

        if ((d < -CLIP_EPSILON && dOther > CLIP_EPSILON) || (d > CLIP_EPSILON && dOther < -CLIP_EPSILON)) {
          const point2 = crossing(point, other, d, dOther);

          kept.push(point2);
          rim.add(point2);
        }
      });

      if (kept.length >= 3) next.push({ plane: face.plane, points: kept });
    }

    if (rim.size >= 3) {
      // The new face: the rim points, in order around their centre.
      const points = Array.from(rim);
      const centre = points
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .multiplyScalar(1 / points.length);
      const { u, v } = getPlaneBasis(normal);
      const angle = (point: THREE.Vector3) => {
        const offset = point.clone().sub(centre);

        return Math.atan2(offset.dot(v), offset.dot(u));
      };

      points.sort((a, b) => angle(a) - angle(b));
      next.push({ plane, points });
    }

    faces = next;
  }

  const bounding = new Set<SplitPlane>();

  faces.forEach((face) => {
    if (face.plane) bounding.add(face.plane);
  });

  return bounding;
}

// The piece around one seed: the surface near it, clipped by the bisector
// against every other seed whose bisector bounds its region, with a cap on
// each cut. Working on a patch of the surface rather than the whole figure
// keeps it fast: the patch holds every surface polygon the cell can
// contain, and the caps come from the whole figure regardless.
function carveCell(
  source: FragmentPiece,
  seeds: Seed[],
  seedIndex: number,
  nearestSeed: Int32Array,
  id: number,
  sections: Map<string, PlaneSection>,
) {
  const seed = seeds[seedIndex].point;
  let reach = 0;

  source.polygons.forEach((polygon, polygonIndex) => {
    if (nearestSeed[polygonIndex] !== seedIndex) return;
    polygon.vertices.forEach((vertex) => {
      reach = Math.max(reach, vertex.point.distanceTo(seed));
    });
  });

  const radius = reach * 1.3 + 0.2;
  let polygons = source.polygons.filter((polygon) =>
    polygon.vertices.some((vertex) => vertex.point.distanceTo(seed) <= radius),
  );
  const capStats: CapBuildStats[] = [];
  // Every other seed's bisector, nearest first, oriented away from this
  // seed. A plane's key names the pair the same way from either side, so
  // its section is computed once. Every new cap is trimmed by all of them:
  // a cap is the whole figure's section and can reach past planes the
  // surface never did.
  const planes = seeds
    .map((other, index) => ({ distance: other.point.distanceTo(seed), index }))
    .filter(({ index }) => index !== seedIndex)
    .sort((a, b) => a.distance - b.distance)
    .map(({ index }) => {
      const other = seeds[index].point;
      const normal = other.clone().sub(seed).normalize();
      const midpoint = seed.clone().add(other).multiplyScalar(0.5);

      return {
        constant: normal.dot(midpoint),
        key: `bisector:${Math.min(seedIndex, index)}:${Math.max(seedIndex, index)}`,
        normal,
      };
    });

  const bounding = boundingPlanes(planes, source.box);

  for (const plane of planes) {
    // Only the planes that bound the region can cut the cell; for the rest,
    // nothing on our side can be across them.
    if (!bounding.has(plane)) continue;

    const clipped = clipToHalfSpace(
      polygons,
      plane,
      planes.filter((other) => other !== plane),
      source,
      sections,
    );

    polygons = clipped.polygons;
    capStats.push(clipped.stats);
  }

  return makePiece({ capStats, depth: 0, id, polygons });
}

type CellBuild = {
  piece: FragmentPiece;
  seed: Seed;
};

// ---------------------------------------------------------------------------
// Roughening: stone that was dropped, not a polyhedron that was cut
// ---------------------------------------------------------------------------
//
// The cut clips each cell to half-spaces, so every cut face is a flat plane
// and every cut edge is a straight line. That is the reference's own look
// (a Blender cell fracture; see the cell notes in thinkerChunks) and it is
// what makes the pieces read as faceted solids rather than as broken stone.
//
// This bends them. Every vertex is moved by ONE field W(p) that depends on
// nothing but where the point is, so two pieces that shared a face before
// still share it after: a shared face is the same set of positions seen from
// both sides, and the same function of position moves both copies the same
// way. That is the whole of why this is safe, and it is why the field may
// not depend on the piece, the plane, the cell or the triangulation — a
// displacement that knew which side it was on would pull the two apart.
//
// The two sides' triangulations are not identical (each cell trims the
// shared cap by its OWN other planes, so the boundary strip is subdivided
// differently), so where one side carries a vertex the other interpolates
// across, the two surfaces sag apart by the field's departure from a chord.
// That grows as the wavelength falls, and at the wavelength this needs it is
// 2 to 5 thousandths of a figure unit over about a fifth of the seam. What
// pays for it is `sealPiece`, which fills those ribbons; without that pass
// this could not be turned up far enough to see.
//
// The skin is held still. `RELIEF_SKIN_RAMP` fades the field to nothing
// within that distance of the source mesh, so the statue's own surface, its
// silhouette and the crack lines drawn across it are exactly what they were,
// and only the INSIDE of the break moves. The ramp is a function of position
// too, so it keeps the matching property. (Letting the field move the skin as
// well was the alternative: at anything strong enough to bend a cut face the
// statue picks up a swell every wavelength, which reads as weathering rather
// than as marble.)
const RELIEF_AMPLITUDE = 0.018;
// How far under the skin the relief reaches full strength, in figure units.
//
// Short on purpose, and this is the thing that took three passes to see. The
// cut faces you actually LOOK at are the shallow ones — the wall of a cavity
// a neighbour just left, the face of a piece still near the surface — and
// they run from the skin inward. A ramp of 0.09 pins all of that flat, and
// the capture at hero fraction 0.78 came back indistinguishable from no
// relief at all. Raising the amplitude from 0.02 to 0.055 against the same
// ramp changed nothing, for the same reason: there was nothing left to move.
const RELIEF_SKIN_RAMP = 0.045;
// Wavenumbers, in radians per figure unit: the low octave turns over about
// every 0.28 units and the high one about every 0.14.
//
// Near the size of a piece, which is what it takes. A face 0.2 across only
// BENDS if the field turns over at that scale; at the 0.9 this started on,
// the field barely varies across a face, so the face translates and tilts and
// stays dead flat. Shorter than a piece and it would be crinkle rather than
// fracture, which is why the low octave sits at about one bend per face.
const RELIEF_LOW = [22.1, 24.3, 19.7];
const RELIEF_HIGH = [45.3, 40.1, 48.7];
const RELIEF_HIGH_WEIGHT = 0.35;
// Cut-face normals are rebuilt from the bent triangles themselves (see
// `smoothCutNormals`), averaged only across triangles of the SAME cut plane,
// keyed by that plane's normal at this precision. Two planes this close in
// direction meeting at a point are one surface for shading.
const PLANE_KEY_SCALE = 1e4;

/**
 * Fills whatever is still open in a piece: every edge that only one polygon
 * uses is chained into a loop and the loop is fanned shut.
 *
 * Two different things end up here, and it closes both.
 *
 * The real holes. A handful of pieces come out of the cut with a cap region
 * simply missing — on the bake before this, four of them, the worst 0.055
 * figure units across a piece of radius 0.32. Two guesses at the cause were
 * measured and both were wrong. `traceCapLoops` rejected no loop on any of
 * the four. Refanning the cap regions earcut returns a short triangulation
 * for — it does that on a contour that touches itself, and it does it 134
 * times on this figure — moved the worst gap by nothing. Nor did deciding
 * `groupCapRegions`' containment by a vote over a loop's corners and
 * midpoints instead of by its first corner alone, which lies ON the other
 * loop wherever two regions touch, so the ray cast answers however the
 * rounding falls. So this closes the hole rather than the cause, and the
 * cause is still open.
 *
 * The seams the relief opens. A cut face and its neighbour are subdivided
 * differently along the line where they meet — each cell trims the shared cap
 * by its OWN other planes — and while the faces were flat that cost nothing,
 * because both subdivisions of a straight line ARE the same line. Bent, one
 * side carries a vertex the other interpolates across, and the two sag apart
 * by the field's departure from a chord: measured, 2 to 5 thousandths over
 * about 270 of the figure's 1430 units of seam, worst 0.014. Those are the
 * ribbons this fills.
 *
 * Fanned from the loop's own centroid and marked as cut face, so a filled
 * hole reads as the fresh stone around it. A chain that will not close is
 * left alone.
 *
 * Wound OUTWARD, and that is not automatic. The walk below starts from
 * whichever end of an edge sorts first, so on its own it winds about half
 * the loops inward, and it used to give every fan one Newell normal for
 * the whole loop — which on a ribbon that folds back on itself points
 * anywhere. Measured on the v9 bake: these fans were 63% of the cut-face
 * triangles (78,081 of 123,896, but only 3.2% of the cut area), their
 * stored normals sat 45 degrees off their own triangles on average, and
 * 21% of their area had a normal more than 90 degrees off — lit from
 * behind on the side that shows, which is the dark sawtooth hairline along
 * the cut edges. So each loop is turned to run AGAINST the edges it closes
 * (the owning polygon runs each free edge one way; a lid over the hole
 * runs it the other), and its normals are left to `smoothCutNormals`.
 */
const SEAL_KEY_SCALE = 1e5;

function sealPiece(piece: FragmentPiece, group: { next: number }) {
  const keyOf = (point: THREE.Vector3) =>
    `${Math.round(point.x * SEAL_KEY_SCALE)},${Math.round(point.y * SEAL_KEY_SCALE)},${Math.round(point.z * SEAL_KEY_SCALE)}`;
  const uses = new Map<string, number>();
  const ends = new Map<string, [THREE.Vector3, THREE.Vector3]>();
  // Which way the (last) polygon using an edge runs it: the key of its start.
  const runsFrom = new Map<string, string>();

  piece.polygons.forEach((polygon) => {
    const { vertices } = polygon;

    for (let index = 0; index < vertices.length; index++) {
      const from = vertices[index].point;
      const to = vertices[(index + 1) % vertices.length].point;
      const a = keyOf(from);
      const b = keyOf(to);

      if (a === b) continue;

      const key = a < b ? `${a}|${b}` : `${b}|${a}`;

      uses.set(key, (uses.get(key) ?? 0) + 1);
      ends.set(key, a < b ? [from, to] : [to, from]);
      runsFrom.set(key, a);
    }
  });

  // The free edges, as an adjacency by position.
  const at = new Map<string, Array<{ key: string; other: THREE.Vector3; point: THREE.Vector3 }>>();
  const link = (point: THREE.Vector3, other: THREE.Vector3, key: string) => {
    const list = at.get(keyOf(point));

    if (list) list.push({ key, other, point });
    else at.set(keyOf(point), [{ key, other, point }]);
  };

  uses.forEach((count, key) => {
    if (count !== 1) return;

    const [from, to] = ends.get(key) as [THREE.Vector3, THREE.Vector3];

    link(from, to, key);
    link(to, from, key);
  });

  if (at.size === 0) return;

  const walked = new Set<string>();
  const sealed: FragmentPolygon[] = [];
  const step = new THREE.Vector3();
  const candidate = new THREE.Vector3();

  uses.forEach((count, startKey) => {
    if (count !== 1 || walked.has(startKey)) return;

    const [first, second] = ends.get(startKey) as [THREE.Vector3, THREE.Vector3];
    const loop: THREE.Vector3[] = [first];
    // Marked as this walk goes and given back if it does not close, so a walk
    // that fails costs the edges it touched nothing: taking them out of play
    // left the loops that shared them unsealable, and measured WORSE than not
    // sealing at all (34 pieces past 0.01 against 2).
    const taken: string[] = [startKey];
    let current = second;
    let currentKey = startKey;
    let previous = first;
    let closed = false;

    for (let guard = 0; guard < at.size + 2; guard++) {
      if (keyOf(current) === keyOf(first)) {
        closed = true;
        break;
      }

      loop.push(current);

      const options = (at.get(keyOf(current)) ?? []).filter(
        (edge) => edge.key !== currentKey && !walked.has(edge.key) && !taken.includes(edge.key),
      );

      if (options.length === 0) break;

      // Where more than two free edges meet — the seams do that, a ribbon's
      // two sides ending on the same point — take the sharpest turn back.
      // That traces the small loop around the gap rather than a long way
      // round the piece.
      step.subVectors(current, previous).normalize();

      let best = options[0];
      let bestTurn = Infinity;

      for (const option of options) {
        const turn = candidate.subVectors(option.other, current).normalize().dot(step);

        if (turn < bestTurn) {
          bestTurn = turn;
          best = option;
        }
      }

      taken.push(best.key);
      previous = current;
      currentKey = best.key;
      current = best.other;
    }

    if (!closed || loop.length < 3) return;

    taken.forEach((key) => walked.add(key));

    // taken[k] is the edge loop[k] -> loop[k + 1]. A vote rather than the
    // first edge: along a folded ribbon the two sides can disagree.
    let against = 0;

    taken.forEach((key, index) => {
      against += runsFrom.get(key) === keyOf(loop[index]) ? -1 : 1;
    });

    const centroid = new THREE.Vector3();

    loop.forEach((point) => centroid.add(point));
    centroid.multiplyScalar(1 / loop.length);

    // One smoothing group per lid (see smoothCutNormals); the normal here is
    // a placeholder that pass replaces.
    const lid = group.next++;

    // Turned by swapping the last two corners, not by reversing the loop:
    // the first corner of each lid stays where it was, because
    // `planReleaseOrder` samples a piece by its polygons' first corners, and
    // moving them moved the release order (by up to 0.061 of the break).
    loop.forEach((point, index) => {
      const next = loop[(index + 1) % loop.length];

      sealed.push({
        group: lid,
        kind: "cap",
        vertices: (against < 0 ? [point, centroid, next] : [point, next, centroid]).map((corner) => ({
          normal: new THREE.Vector3(0, 1, 0),
          point: corner,
        })),
      });
    });
  });

  piece.polygons.push(...sealed);
}

/**
 * A spatial hash of the source mesh's own TRIANGLES, for "how far under the
 * skin is this?". Only distances up to `reach` matter — past it the ramp is
 * saturated — so one cell of that size and its 26 neighbours is the whole
 * search.
 *
 * Triangles, not their corners: the cut's own points sit anywhere on a
 * source triangle, not at its corners, and against corners alone a point
 * lying flat on a large triangle measures as deep as half that triangle is
 * wide. That leak put full relief on points of the SKIN, and since a cap's
 * boundary and the surface's boundary are the same seam sampled at different
 * spacings, it opened the seam: the widest crack in the figure went from
 * 0.0002 to 0.046 figure units, 330 of 480 pieces past 0.002.
 */
function makeSkinDistance(source: FragmentPiece, reach: number) {
  type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const grid = new Map<string, Triangle[]>();
  const cell = (value: number) => Math.floor(value / reach);
  const add = (triangle: Triangle) => {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const point of triangle) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      minZ = Math.min(minZ, point.z);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      maxZ = Math.max(maxZ, point.z);
    }

    for (let x = cell(minX); x <= cell(maxX); x++) {
      for (let y = cell(minY); y <= cell(maxY); y++) {
        for (let z = cell(minZ); z <= cell(maxZ); z++) {
          const key = `${x},${y},${z}`;
          const bucket = grid.get(key);

          if (bucket) bucket.push(triangle);
          else grid.set(key, [triangle]);
        }
      }
    }
  };

  source.polygons.forEach((polygon) => {
    for (let index = 1; index < polygon.vertices.length - 1; index++) {
      add([
        polygon.vertices[0].point,
        polygon.vertices[index].point,
        polygon.vertices[index + 1].point,
      ]);
    }
  });

  const closest = new THREE.Vector3();
  const triangle = new THREE.Triangle();

  return (point: THREE.Vector3) => {
    const cx = cell(point.x);
    const cy = cell(point.y);
    const cz = cell(point.z);
    let best = reach * reach;

    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let z = cz - 1; z <= cz + 1; z++) {
          const bucket = grid.get(`${x},${y},${z}`);

          if (!bucket) continue;

          for (const [a, b, c] of bucket) {
            triangle.set(a, b, c);
            triangle.closestPointToPoint(point, closest);
            const distance = point.distanceToSquared(closest);

            if (distance < best) best = distance;
          }
        }
      }
    }

    return Math.sqrt(best);
  };
}

/** The relief field at a point, before the skin ramp: each component in -1..1. */
function reliefFieldAt(point: THREE.Vector3, seed: number, out: THREE.Vector3) {
  const component = (axis: number) => {
    const salt = 101 + axis * 7;
    const low =
      Math.sin(point.x * RELIEF_LOW[axis] + hash01(salt, seed) * TAU) *
      Math.sin(point.y * RELIEF_LOW[(axis + 1) % 3] + hash01(salt + 1, seed) * TAU) *
      Math.sin(point.z * RELIEF_LOW[(axis + 2) % 3] + hash01(salt + 2, seed) * TAU);
    const high =
      Math.sin(point.x * RELIEF_HIGH[axis] + hash01(salt + 3, seed) * TAU) *
      Math.sin(point.y * RELIEF_HIGH[(axis + 1) % 3] + hash01(salt + 4, seed) * TAU) *
      Math.sin(point.z * RELIEF_HIGH[(axis + 2) % 3] + hash01(salt + 5, seed) * TAU);

    return (low + RELIEF_HIGH_WEIGHT * high) / (1 + RELIEF_HIGH_WEIGHT);
  };

  return out.set(component(0), component(1), component(2));
}

/**
 * Bends every cut face and every cut edge, so the pieces read as stone that
 * was dropped rather than as a solid that was sliced. See the note above for
 * why a field of position alone is the only kind that is safe here.
 *
 * Points only. This used to turn each normal through the field's derivative
 * as well (n - J^T n), and those normals described a surface the mesh does
 * not have: the relief bends a face only at its VERTICES, and the cut's
 * triangles are large against the bend (longest edge p90 0.16, p99 0.33
 * figure units, where the low octave turns over every 0.14), so between
 * vertices the stone stays flat. Measured on the v9 bake, the stored normals
 * sat 10.0 degrees (area-weighted mean; p90 17) off the triangles they were
 * drawn on, deep in the figure; in the shell under the skin, where the
 * derivative also dropped the ramp's own gradient, 4.1 degrees (p99 18) off
 * even the smooth bent surface they meant to follow. Shaded, that is a
 * gradient across a face that is visibly flat, with a streak down every
 * fan triangle. `smoothCutNormals` now builds them from the moved triangles.
 * (Refining the cut so the mesh itself carries the bend was costed and
 * dropped: 3.3x the cut-face triangles at a 0.07 edge, 5.5x at 0.05, which
 * is 7 to 14 MB more bake.)
 */
function roughenCells(cells: CellBuild[], source: FragmentPiece, options: BuildSolidChunkOptions) {
  const seed = options.seed;
  const skinDistance = makeSkinDistance(source, RELIEF_SKIN_RAMP);

  // How strong the relief is here: nothing on the skin, full a ramp under it.
  const reliefAt = (point: THREE.Vector3) =>
    RELIEF_AMPLITUDE * smoothstep01(skinDistance(point) / RELIEF_SKIN_RAMP);

  // Each distinct POINT object is moved once — the cut shares points across
  // polygons and across pieces (that sharing is what `planReleaseOrder` reads
  // as pieces touching).
  const movedPoints = new Set<THREE.Vector3>();
  const displaced = new THREE.Vector3();

  cells.forEach(({ piece }) => {
    piece.polygons.forEach((polygon) => {
      polygon.vertices.forEach(({ point }) => {
        if (movedPoints.has(point)) return;

        movedPoints.add(point);
        const relief = reliefAt(point);

        if (relief <= 0) return;

        point.add(reliefFieldAt(point, seed, displaced).multiplyScalar(relief));
      });
    });
  });
}

/**
 * A piece's cut-face normals, from its own bent triangles: at each corner,
 * the angle-weighted mean of the face normals of every triangle that meets
 * there AND lies on the same cut plane. The
 * plane is read off the normal the cut gave the vertex, which is still that
 * plane's exact normal here, since nothing has turned it. So a bent face
 * shades smoothly across itself and a crease between two cut planes stays a
 * crease. Angle-weighted because the cut's triangulations are fans of long
 * thin triangles, and area or plain averaging lets those lean the result.
 *
 * Triangulated exactly as `makeFlatArrays` does (a fan from the polygon's
 * first vertex), so the triangles averaged are the triangles drawn. Each
 * polygon gets fresh vertex records, so a normal written here never leaks
 * into another polygon that shared the old record.
 */
function smoothCutNormals(piece: FragmentPiece) {
  const keyOf = (point: THREE.Vector3) =>
    `${Math.round(point.x * SEAL_KEY_SCALE)},${Math.round(point.y * SEAL_KEY_SCALE)},${Math.round(point.z * SEAL_KEY_SCALE)}`;
  const groupOf = (polygon: FragmentPolygon) => {
    if (polygon.group !== undefined) return `lid${polygon.group}`;

    const { normal } = polygon.vertices[0];

    return `${Math.round(normal.x * PLANE_KEY_SCALE)},${Math.round(normal.y * PLANE_KEY_SCALE)},${Math.round(normal.z * PLANE_KEY_SCALE)}`;
  };
  const sums = new Map<string, THREE.Vector3>();
  const anyGroup = new Map<string, THREE.Vector3>();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const face = new THREE.Vector3();
  const caps = piece.polygons.filter((polygon) => polygon.kind === "cap");
  const groups = caps.map(groupOf);
  const accumulate = (map: Map<string, THREE.Vector3>, key: string, weight: number) => {
    const sum = map.get(key);

    if (sum) sum.addScaledVector(face, weight);
    else map.set(key, face.clone().multiplyScalar(weight));
  };

  caps.forEach((polygon, polygonIndex) => {
    const { vertices } = polygon;

    for (let index = 1; index < vertices.length - 1; index++) {
      const corners = [vertices[0].point, vertices[index].point, vertices[index + 1].point];

      edgeA.subVectors(corners[1], corners[0]);
      edgeB.subVectors(corners[2], corners[0]);
      face.crossVectors(edgeA, edgeB);

      const doubleArea = face.length();

      if (doubleArea <= 1e-14) continue;

      face.multiplyScalar(1 / doubleArea);

      for (let corner = 0; corner < 3; corner++) {
        const here = corners[corner];
        const toNext = edgeA.subVectors(corners[(corner + 1) % 3], here);
        const toPrevious = edgeB.subVectors(corners[(corner + 2) % 3], here);
        const angle = toNext.angleTo(toPrevious);

        if (!Number.isFinite(angle) || angle <= 0) continue;

        const point = keyOf(here);

        accumulate(sums, `${point}|${groups[polygonIndex]}`, angle);
        accumulate(anyGroup, point, angle);
      }
    }
  });

  caps.forEach((polygon, polygonIndex) => {
    // A lid is one triangle, and it takes its own face normal. Smoothed like
    // a cut face, a lid over a ribbon that folds back on itself averages its
    // two sides into nothing in particular: measured, 34 degrees off its own
    // triangles by area and 13.8% of lid area past 90, against 0 this way.
    if (polygon.group !== undefined && polygon.vertices.length === 3) {
      const [a, b, c] = polygon.vertices;

      face.crossVectors(edgeA.subVectors(b.point, a.point), edgeB.subVectors(c.point, a.point));
      if (face.lengthSq() > 1e-28) {
        face.normalize();
        polygon.vertices = polygon.vertices.map(({ point }) => ({ normal: face.clone(), point }));
        return;
      }
    }

    polygon.vertices = polygon.vertices.map(({ normal, point }) => {
      const at = keyOf(point);
      const sum = sums.get(`${at}|${groups[polygonIndex]}`) ?? anyGroup.get(at);
      const next = sum && sum.lengthSq() > 1e-18 ? sum.clone().normalize() : normal.clone();

      return { normal: next, point };
    });
  });
}

function fractureIntoPieces(sourceGeometry: THREE.BufferGeometry, options: BuildSolidChunkOptions) {
  const source = makeSourcePiece(sourceGeometry);
  const { impact, seeds } = planSeeds(source, options);
  const stats: SplitStats = {
    dust: 0,
    interior: 0,
    islands: 0,
    seedCount: seeds.length,
    sourceOpenEdges: countOpenGeometryEdges(sourceGeometry),
  };
  // Which seed each polygon is nearest, by its CENTROID: the sizing of each
  // cell's patch comes from this, and keying on the first vertex (what this
  // did) misassigns polygons wherever the seeds are packed closer together
  // than the mesh triangles are — which is exactly what a fine patch is.
  // A seed that ends up owning nothing gets an empty patch and comes out as
  // a cap-only solid, which is then dropped as a hole in the figure.
  const nearestSeed = new Int32Array(source.polygons.length);
  const centroid = new THREE.Vector3();

  source.polygons.forEach((polygon, polygonIndex) => {
    centroid.set(0, 0, 0);
    polygon.vertices.forEach((vertex) => centroid.add(vertex.point));
    centroid.multiplyScalar(1 / polygon.vertices.length);
    const point = centroid;
    let best = 0;
    let bestDistance = Infinity;

    seeds.forEach((seed, seedIndex) => {
      const distance = point.distanceToSquared(seed.point);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = seedIndex;
      }
    });

    nearestSeed[polygonIndex] = best;
  });

  const cells: CellBuild[] = [];
  const sections = new Map<string, PlaneSection>();

  seeds.forEach((seed, seedIndex) => {
    const cell = carveCell(source, seeds, seedIndex, nearestSeed, seedIndex, sections);
    // A cell may come apart into islands where the figure folds back on
    // itself (the gap between an arm and the chest): each island flies as
    // its own piece, on the seed's schedule.
    const islands = splitConnectedComponents(cell);

    if (islands.length > 1) stats.islands += islands.length - 1;

    islands.forEach((island, islandIndex) => {
      // Dust: a few polygons caught in a fold, or a flake of cap with no
      // surface of its own.
      // An island with no surface of its own is a piece from INSIDE the
      // figure — every face of it is a cut. Those are real fragments, and a
      // smashed statue has them; dropping them punched holes in the figure
      // (2.75% of its volume once the size variation was strong enough to
      // leave seeds stranded in the interior). Only genuine slivers go.
      if (!island.polygons.some((polygon) => polygon.kind === "surface")) {
        stats.interior += 1;
      }

      if (
        island.polygons.length < ISLAND_MIN_POLYGONS ||
        island.faceArea < ISLAND_MIN_AREA
      ) {
        stats.dust += 1;
        return;
      }
      island.id = seedIndex * 8 + islandIndex;
      cells.push({ piece: island, seed });
    });
  });

  roughenCells(cells, source, options);

  // The relief moved points, so the boxes, centres and areas every piece was
  // measured with are stale; sealing adds polygons too.
  const lids = { next: 0 };

  cells.forEach((cell) => {
    sealPiece(cell.piece, lids);
    smoothCutNormals(cell.piece);
    cell.piece = makePiece({
      capStats: cell.piece.capStats,
      depth: cell.piece.depth,
      id: cell.piece.id,
      polygons: cell.piece.polygons,
    });
  });

  return { cells, impact, seeds, stats };
}

function makeFlatArrays(polygons: FragmentPolygon[], center: THREE.Vector3) {
  let triangleCount = 0;

  polygons.forEach((polygon) => {
    triangleCount += Math.max(polygon.vertices.length - 2, 0);
  });

  const positions = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  let cursor = 0;

  const push = (vertex: FragmentVertex) => {
    positions[cursor] = vertex.point.x - center.x;
    positions[cursor + 1] = vertex.point.y - center.y;
    positions[cursor + 2] = vertex.point.z - center.z;
    normals[cursor] = vertex.normal.x;
    normals[cursor + 1] = vertex.normal.y;
    normals[cursor + 2] = vertex.normal.z;
    cursor += 3;
  };

  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();

  polygons.forEach((polygon) => {
    for (let index = 1; index < polygon.vertices.length - 1; index++) {
      const a = polygon.vertices[0];
      const b = polygon.vertices[index];
      const c = polygon.vertices[index + 1];

      // A cut passing through an old cap's vertex leaves slivers that are
      // zero-area once stored as float32 relative to the centre; they cannot
      // rasterise, so leave them out. Judged at the stored precision.
      edgeA.set(
        Math.fround(b.point.x - center.x) - Math.fround(a.point.x - center.x),
        Math.fround(b.point.y - center.y) - Math.fround(a.point.y - center.y),
        Math.fround(b.point.z - center.z) - Math.fround(a.point.z - center.z),
      );
      edgeB.set(
        Math.fround(c.point.x - center.x) - Math.fround(a.point.x - center.x),
        Math.fround(c.point.y - center.y) - Math.fround(a.point.y - center.y),
        Math.fround(c.point.z - center.z) - Math.fround(a.point.z - center.z),
      );
      if (edgeA.cross(edgeB).lengthSq() <= 1e-20) {
        continue;
      }

      push(a);
      push(b);
      push(c);
    }
  });

  return {
    normals: normals.subarray(0, cursor),
    positions: positions.subarray(0, cursor),
  };
}

// When each piece starts moving, 0..1 of the breakup, one piece at a time:
// in rank order (see `releaseFrom`), held back only where a piece would
// drive into marble that is still standing well after it leaves. Touching
// means sharing cut points, so this follows the real cuts, not a guess.
// The islands of one seed count as one piece throughout.
//
// The hold-back is graded (RELEASE_ORDER_TOLERANCE_*): an ungraded guard
// makes the break begin at the end the flight points AT and travel back
// against it, which is the opposite of a break asked to sweep the same
// way its pieces fly. Only a blocker that sits much later in the rank
// keeps its edge now, so the rank, not the flight, sets the direction.
function planReleaseOrder(
  cells: CellBuild[],
  offsets: THREE.Vector3[],
  options: BuildSolidChunkOptions,
  /** The flights before `flightScatter` turned them; `offsets` is repaired in place. */
  straight: THREE.Vector3[] | null,
) {
  const count = cells.length;

  if (count <= 1) {
    return {
      exposedAt: cells.map(() => 0),
      neighbours: cells.map((): number[] => []),
      releaseAt: cells.map(() => 0),
      wallAt: cells.map(() => [] as number[]),
    };
  }

  // Units: one per seed. The arm goes first in path order; everything
  // else follows in sweep order.
  const unitOf = new Map<Seed, number>();
  const unitRank: number[] = [];
  const unitPlaneRank: number[] = [];
  const unitCells: number[][] = [];

  cells.forEach(({ seed }, index) => {
    let unit = unitOf.get(seed);

    if (unit === undefined) {
      unit = unitRank.length;
      unitOf.set(seed, unit);
      unitRank.push(
        THREE.MathUtils.clamp(seed.position, 0, 0.999),
      );
      unitPlaneRank.push(THREE.MathUtils.clamp(seed.planePosition, 0, 0.999));
      unitCells.push([]);
    }

    unitCells[unit].push(index);
  });

  const unitCount = unitRank.length;
  const cellUnit = cells.map(({ seed }) => unitOf.get(seed) as number);
  const cutPointIds = cells.map(({ piece }) => {
    const ids = new Set<number>();

    piece.polygons.forEach((polygon) => {
      if (polygon.kind === "cap") {
        polygon.vertices.forEach((vertex) => ids.add(idOf(vertex.point)));
      }
    });

    return ids;
  });
  const touching = (a: number, b: number) => {
    const [small, big] =
      cutPointIds[a].size < cutPointIds[b].size ? [cutPointIds[a], cutPointIds[b]] : [cutPointIds[b], cutPointIds[a]];

    for (const id of small) {
      if (big.has(id)) return true;
    }

    return false;
  };
  // A points at B if, moved a little way along its flight, some of the
  // face it shares with B ends up inside B's solid. The shared face is
  // A's cap on the bisector of their seeds; its vertices are where A would
  // first enter B.
  //
  // Since the relief (roughenCells) bent the cut faces, the only vertices
  // still within 1e-6 of the bisector are the ones the relief does not move:
  // the rim of the face, where it meets the skin. So this probes the rim.
  // Measured on the bake, it fires on 2,065 of 7,296 touching pairs; taking
  // in every vertex of a cap polygon lying within the relief's reach of the
  // plane (mean offset under 0.02, none past 0.035) fires on 4,312 of 8,197.
  // That wider probe was tried and not kept: the extra edges reshuffle the
  // order, and pairs a quarter or more inside standing marble over the drawn
  // break went 11 -> 13 on the old flight and 12 -> 14 on this one.
  // `clearStandingBlockers` deals with what gets through instead.
  const insideTests = cells.map(({ piece }) => makeInsideTest(piece));
  const probe = new THREE.Vector3();
  const pointsAt = (a: number, b: number) => {
    const seedA = cells[a].seed.point;
    const seedB = cells[b].seed.point;
    const normal = seedB.clone().sub(seedA);

    if (normal.lengthSq() < 1e-12) return false;

    normal.normalize();

    const constant = normal.dot(seedA.clone().add(seedB).multiplyScalar(0.5));
    const step = offsets[a].clone().normalize().multiplyScalar(RELEASE_PROBE_STEP);
    const inside = insideTests[b];
    let onFace = 0;
    let entered = 0;

    for (const polygon of cells[a].piece.polygons) {
      if (polygon.kind !== "cap") continue;

      for (const vertex of polygon.vertices) {
        if (Math.abs(normal.dot(vertex.point) - constant) > 1e-6) continue;
        onFace += 1;
        probe.copy(vertex.point).add(step);
        if (inside(probe)) entered += 1;
      }
    }

    return entered >= 2 && entered >= onFace * RELEASE_PROBE_FRACTION;
  };
  // A piece can also fly clean through one it never touched. For pairs
  // whose flight corridor comes close enough, a coarser probe: sample
  // points of the mover, stepped along its whole flight, inside-tested
  // against the other.
  const radii = cells.map(({ piece }) => piece.box.getSize(new THREE.Vector3()).length() / 2);
  const samples = cells.map(({ piece }) => {
    const points: THREE.Vector3[] = [];
    const stride = Math.max(1, Math.floor(piece.polygons.length / 40));

    for (let index = 0; index < piece.polygons.length; index += stride) {
      points.push(piece.polygons[index].vertices[0].point);
    }

    return points;
  });
  const segmentPoint = new THREE.Vector3();
  const fliesThrough = (a: number, b: number) => {
    // Corridor filter: is b anywhere near the line a travels?
    const start = cells[a].piece.center;
    const flight = offsets[a];
    const toB = probe.subVectors(cells[b].piece.center, start);
    const t = THREE.MathUtils.clamp(toB.dot(flight) / Math.max(flight.lengthSq(), 1e-12), 0, 1);

    segmentPoint.copy(start).addScaledVector(flight, t);

    if (segmentPoint.distanceTo(cells[b].piece.center) > (radii[a] + radii[b]) * 0.8) {
      return false;
    }

    // Seen from the mover, the other piece drifts backward through it:
    // testing the other's points against the mover's own volume catches a
    // small piece being swallowed whole, which sampling the mover's
    // surface can step right over.
    const inside = insideTests[a];
    let hits = 0;

    for (const fraction of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
      for (const point of samples[b]) {
        probe.copy(point).addScaledVector(flight, -fraction);
        if (inside(probe) && ++hits >= 3) return true;
      }
    }

    return false;
  };
  // before[u]: units that must start no later than u.
  const before: Array<Set<number>> = Array.from({ length: unitCount }, () => new Set());
  // neighbours[c]: the cells that share cut points with c — the pieces whose
  // leaving opens a cavity whose wall is c's own cut face (see `exposedAt`
  // at the end of this function).
  //
  // BY POSITION, not by object identity, and that is the whole of the hole
  // Kevin saw. `touching` above asks whether two cells' cap polygons share a
  // Vector3 INSTANCE. A shared face only carries shared instances where it
  // inherits them from the cached section of the whole figure by that plane
  // (sectionOf) — the RIM, where the cut meets the skin. A face that lies
  // entirely INSIDE the figure is built from intersections computed
  // separately on each side, so the two copies are the same positions in
  // different objects and the identity test says "not touching". Deep pieces
  // therefore never learn that the piece in front of them has gone.
  //
  // Measured on the 269-cell bake: adjacency by position finds 1368 pairs
  // (10.2 neighbours a piece) where identity leaves 110 of the 269 chunks
  // with an exposedAt LATER than the position test gives, 58 of them inside
  // the stretch the stage is drawn, and 67 chunks with no earlier neighbour
  // at all against 13. Chunk 109, under the shoulder skin, is the one in the
  // capture: it releases at 0.402 and was exposed at 0.402, while the piece
  // it shares a face with (91) leaves at 0.159. Ray-cast through the black
  // wedge at panel value 0.25, every hit for five pieces deep was an undrawn
  // cut face and the only skin was back-facing, so the pixel was stage black
  // — a hole straight into the figure, from breakup 0.045 to 0.402.
  //
  // The grid is safe because the relief (roughenCells) moves every copy of a
  // position by one field of position alone, so two copies of a shared face
  // stay bit-equal and land in the same cell; it is fine enough (1/3100 of
  // the figure's height, 1/240 of a median piece's radius) that two faces
  // that are not the same face do not.
  //
  // `touches` below is left on the identity test on purpose: it feeds the
  // release ORDER (which probe a pair gets in `hits`, and which tolerance
  // the texture's guard uses), and every number in the order was tuned
  // against it. This is a drawing question, not an order one.
  const neighbours: number[][] = Array.from({ length: count }, () => []);
  const touches: Array<Set<number>> = Array.from({ length: count }, () => new Set());
  const cellsAtCutPoint = new Map<string, number[]>();

  cells.forEach(({ piece }, cell) => {
    const seen = new Set<string>();

    piece.polygons.forEach((polygon) => {
      if (polygon.kind !== "cap") return;

      polygon.vertices.forEach(({ point }) => {
        const key = `${Math.round(point.x / CUT_POINT_GRID)},${Math.round(point.y / CUT_POINT_GRID)},${Math.round(point.z / CUT_POINT_GRID)}`;

        if (seen.has(key)) return;
        seen.add(key);

        const list = cellsAtCutPoint.get(key);

        if (list) list.push(cell);
        else cellsAtCutPoint.set(key, [cell]);
      });
    });
  });

  // Which cell each cut point is shared with, for the per-face wall test
  // below: a face is uncovered when the piece on the OTHER SIDE OF THAT FACE
  // leaves, not when any neighbour anywhere on the piece does.
  const neighbourSets: Array<Set<number>> = Array.from({ length: count }, () => new Set());

  cellsAtCutPoint.forEach((list) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (cellUnit[list[i]] === cellUnit[list[j]]) continue;
        neighbourSets[list[i]].add(list[j]);
        neighbourSets[list[j]].add(list[i]);
      }
    }
  });

  neighbourSets.forEach((set, cell) => neighbours[cell].push(...set));
  // Per cell, per cap polygon: the cell on the other side of it, by the cut
  // points it is built from — the neighbour that owns the most of them.
  const facing = cells.map(({ piece }, cell) =>
    piece.polygons
      .filter((polygon) => polygon.kind === "cap")
      .map((polygon) => {
        const votes = new Map<number, number>();

        polygon.vertices.forEach(({ point }) => {
          const list = cellsAtCutPoint.get(
            `${Math.round(point.x / CUT_POINT_GRID)},${Math.round(point.y / CUT_POINT_GRID)},${Math.round(point.z / CUT_POINT_GRID)}`,
          );

          list?.forEach((other) => {
            if (other === cell || cellUnit[other] === cellUnit[cell]) return;
            votes.set(other, (votes.get(other) ?? 0) + 1);
          });
        });

        let best = -1;
        let most = 0;

        votes.forEach((count, other) => {
          if (count > most) {
            most = count;
            best = other;
          }
        });

        // A face has to be BUILT from a neighbour's points to be its wall: a
        // lid from `sealPiece`, or a face whose points the vote does not
        // carry, belongs to no cavity and waits for the piece itself.
        return most >= Math.max(2, polygon.vertices.length * 0.5) ? best : -1;
      }),
  );

  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      if (cellUnit[a] === cellUnit[b] || !touching(a, b)) continue;
      touches[a].add(b);
      touches[b].add(a);
    }
  }

  // Does a's flight run into b: the face probe for touching pieces, the
  // corridor probe for the rest.
  const hits = (a: number, b: number) => (touches[a].has(b) ? pointsAt(a, b) : fliesThrough(a, b));
  // The pairs worth asking about: b still standing when a goes, give or
  // take what the texture can move a rank by.
  const TEXTURE_REACH = options.releaseTexture ? options.releaseTexture.amount * 1.5 : 0;
  const later = (a: number, b: number) =>
    cellUnit[a] !== cellUnit[b] && unitRank[cellUnit[b]] > unitRank[cellUnit[a]] - TEXTURE_REACH;

  // The scatter's repair (`flightScatter`, with the unturned flights in
  // `straight`). A turned flight that runs into a piece still standing when
  // it goes, where the straight flight did not, is turned back half way,
  // three times, then straightened. Measured with a sampled-point
  // interpenetration audit over the visible break (pairs where a flying
  // piece has a quarter or more of its sampled points inside standing
  // marble at some moment): 3 on the plane's own break, 10 with the scatter
  // unrepaired, 3 repaired (scatter alone; 7 with the texture as shipped). The
  // turns that survive are the ones with room: of the first 120 pieces off, 61
  // turned up and 55 down before the repair, and 60 up and 13 down after it —
  // tilted down, a piece from the shoulder flies into the body under it.
  if (straight) {
    for (let round = 0; round <= 3; round++) {
      const offenders: number[] = [];

      for (let a = 0; a < count; a++) {
        if (offsets[a].distanceToSquared(straight[a]) < 1e-12) continue;

        for (let b = 0; b < count; b++) {
          if (!later(a, b) || !hits(a, b)) continue;
          const turned = offsets[a];
          offsets[a] = straight[a];
          const straightHits = hits(a, b);
          offsets[a] = turned;

          if (!straightHits) {
            offenders.push(a);
            break;
          }
        }
      }

      if (offenders.length === 0) break;

      offenders.forEach((a) => {
        if (round === 3) {
          offsets[a] = straight[a].clone();
          return;
        }
        const length = offsets[a].length();
        offsets[a] = offsets[a].clone().lerp(straight[a], 0.5).setLength(length);
      });
    }
  }

  const struck = new Map<number, Set<number>>();

  for (let a = 0; a < count; a++) {
    for (let b = 0; b < count; b++) {
      if (!later(a, b) || !hits(a, b)) continue;
      if (!struck.has(a)) struck.set(a, new Set());
      (struck.get(a) as Set<number>).add(b);
    }
  }

  // The texture's guard. The tolerances below were set against the plane's
  // own order, where a piece in a mover's path that is "a little later" is
  // a few hundredths later and the mover is inside it for a moment. The
  // texture can hold a patch back a tenth of the order, still inside the
  // tolerance, and the mover then sat inside a standing neighbour for a
  // real stretch: on the audit above, pairs a quarter or more inside
  // standing marble went from 3 to 17 with the texture while tuning, and
  // back to 3 with this. So a piece in a mover's path may be no later
  // than the mover plus what the plane itself put between them
  // (plus STRIKE_SLACK): the texture's delays run DOWNSTREAM along the
  // flight, never across a piece's path. Holding the mover back instead
  // (an edge in `before`) cascaded through the order and turned the front's
  // path on screen by 20 degrees.
  if (options.releaseTexture) {
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;

      struck.forEach((targets, a) => {
        const ua = cellUnit[a];

        targets.forEach((b) => {
          const ub = cellUnit[b];
          const planeGap = unitPlaneRank[ub] - unitPlaneRank[ua];
          const tolerance = touches[a].has(b)
            ? RELEASE_ORDER_TOLERANCE_TOUCHING
            : RELEASE_ORDER_TOLERANCE_DISTANT;

          if (planeGap > tolerance) return;
          const latest = unitRank[ua] + Math.max(planeGap, 0) + STRIKE_SLACK;

          if (unitRank[ub] > latest) {
            unitRank[ub] = latest;
            moved = true;
          }
        });
      });

      if (!moved) break;
    }
  }

  for (let a = 0; a < count; a++) {
    for (let b = 0; b < count; b++) {
      const ua = cellUnit[a];
      const ub = cellUnit[b];

      if (ua === ub || !struck.get(a)?.has(b)) continue;

      // Graded: an edge only counts when the blocker is far enough behind
      // the mover in the wanted order that the mover would sit inside it
      // for a real stretch of the break.
      const tolerance = touches[a].has(b)
        ? RELEASE_ORDER_TOLERANCE_TOUCHING
        : RELEASE_ORDER_TOLERANCE_DISTANT;

      if (unitRank[ub] - unitRank[ua] > tolerance) before[ua].add(ub);
    }
  }

  // Two units each needing the other first can only go together.
  const order: number[][] = [];
  const placed = new Set<number>();

  while (placed.size < unitCount) {
    let pick = -1;

    for (let unit = 0; unit < unitCount; unit++) {
      if (placed.has(unit)) continue;
      const ready = Array.from(before[unit]).every((other) => placed.has(other));

      if (ready && (pick < 0 || unitRank[unit] < unitRank[pick])) pick = unit;
    }

    if (pick < 0) {
      // A cycle: take the unit of lowest rank together with whatever it
      // is still waiting on.
      let lowest = -1;

      for (let unit = 0; unit < unitCount; unit++) {
        if (!placed.has(unit) && (lowest < 0 || unitRank[unit] < unitRank[lowest])) lowest = unit;
      }

      const group = [lowest, ...Array.from(before[lowest]).filter((other) => !placed.has(other))];

      group.forEach((unit) => placed.add(unit));
      order.push(group);
      continue;
    }

    placed.add(pick);
    order.push([pick]);
  }

  // Small clusters (`releaseTexture.clusters`): a unit takes the beat of the
  // one before it when the two touch and the beat is not yet full, looking a
  // few places ahead in the order for such a neighbour, and only once
  // everything it waits on (`before`) has gone or is going on the same beat,
  // so the flight's guard is kept. Measured on lukebaffait.fr's break: the
  // lateness left over after fitting a front correlates 0.53 between blocks
  // a piece apart, 0.34 at one and a half, 0.13 at two to three and 0 past
  // that — neighbours go together, a few at a time — and its released area
  // per frame swings 17% about its running mean where the same area released
  // evenly swings 5%. On the bake the spread of the gaps between releases
  // over the visible break (their coefficient of variation) goes from 0.12
  // to 0.26.
  const clusterLimit = Math.max(1, Math.floor(options.releaseTexture?.clusters ?? 1));
  const shaped = clusterLimit > 1;
  const beats: number[][] = shaped ? [] : order;

  if (shaped) {
    const unitTouches: Array<Set<number>> = Array.from({ length: unitCount }, () => new Set());

    // `touches`, not `neighbours`: the two were the same set until the wall
    // test went positional, and this is the order, which every number in the
    // release was tuned against. Off the wider set the clusters take in
    // pieces that share a face deep inside the figure, which nobody sees go
    // together — and it moves the release: measured on the same cut, 268 of
    // 269 pieces changed moment (by up to 0.037 of the break), the gaps'
    // coefficient of variation went 0.59 -> 0.68 and the pieces released by
    // breakup 0.34 went 57 -> 55. What clusters on screen is pieces that
    // share SKIN, which is what this set is.
    touches.forEach((others, cell) => {
      others.forEach((other) => {
        if (cellUnit[other] !== cellUnit[cell]) unitTouches[cellUnit[cell]].add(cellUnit[other]);
      });
    });

    const LOOK_AHEAD = 4;
    const queue = order.map((group) => group.slice());
    const queued = new Map<number, number>();
    queue.forEach((group, index) => {
      if (group.length === 1) queued.set(group[0], index);
    });
    const gone = new Set<number>();
    const ready = (unit: number) => Array.from(before[unit]).every((other) => gone.has(other));
    const take = (beat: number[], unit: number) => {
      const index = queued.get(unit) as number;
      beat.push(unit);
      gone.add(unit);
      queue[index] = [];
      queued.delete(unit);
    };
    let cursor = 0;

    while (cursor < queue.length) {
      const beat = queue[cursor];
      queue[cursor] = [];
      cursor += 1;
      if (beat.length === 0) continue;
      beat.forEach((unit) => {
        gone.add(unit);
        queued.delete(unit);
      });

      // How many this beat may hold: 1 to clusterLimit, per beat, skewed
      // toward the small end so pairs are common and fuller beats are not.
      const room =
        1 + Math.floor(Math.pow(hash01(beats.length, options.seed + 419), 1.6) * clusterLimit);

      for (
        let ahead = cursor;
        ahead < Math.min(queue.length, cursor + LOOK_AHEAD) && beat.length < room;
        ahead++
      ) {
        const candidate = queue[ahead];
        if (candidate.length !== 1) continue;
        const unit = candidate[0];

        if (beat.some((member) => unitTouches[member].has(unit)) && ready(unit)) take(beat, unit);
      }

      beats.push(beat);
    }
  }

  const releaseAt = new Array<number>(count).fill(0);
  // The slots are spread so the release rate ramps (see
  // RELEASE_ACCELERATION). With u the share of the run to RELEASE_END, A
  // the acceleration and w the ramp's share of the run, the rate is
  // 1 + (A - 1)·u/w up to w and A after it, so the slots released by u are
  // u + (A - 1)·u²/2w up to w and w(A + 1)/2 + A(u - w) after; each slot's
  // moment is that count solved for u.
  const slots = beats.length;
  const acceleration: number = RELEASE_ACCELERATION;
  const rampShare = Math.min(RELEASE_RAMP_END / RELEASE_END, 1);
  const rampSlots = (rampShare * (acceleration + 1)) / 2;
  const totalSlots = rampSlots + acceleration * (1 - rampShare);
  const momentAt = (slot: number) => {
    if (slots <= 1) return 0;
    const n = (slot / (slots - 1)) * totalSlots;
    const u =
      acceleration === 1
        ? n
        : n <= rampSlots
          ? (rampShare * (Math.sqrt(1 + (2 * (acceleration - 1) * n) / rampShare) - 1)) /
            (acceleration - 1)
          : rampShare + (n - rampSlots) / acceleration;

    return RELEASE_END * u;
  };

  beats.forEach((beat, slot) => {
    const moment = momentAt(slot);
    const gap = slot + 1 < slots ? momentAt(slot + 1) - moment : 0;

    beat.forEach((unit, member) => {
      // Inside a beat the members go a fraction of the gap apart, in the
      // order they joined, so a cluster peels off rather than jumping as
      // one block; a member's blockers joined before it, so they still lead.
      const stagger = beat.length > 1 ? (member / beat.length) * CLUSTER_STAGGER * gap : 0;

      unitCells[unit].forEach((cell) => {
        releaseAt[cell] = moment + stagger;
      });
    });
  });

  // When a piece's cut faces first become visible: the moment IT leaves, or
  // the moment any piece it touches leaves, whichever is first. A seated
  // piece's cut faces are inside solid marble only while its NEIGHBOURS are
  // seated too — the moment one flies off, the wall of the cavity it leaves
  // is this piece's own cut face, and a piece that only shows its faces
  // when it moves shows a hole straight through a hollow figure instead.
  const exposedAt = releaseAt.map((moment, cell) =>
    neighbours[cell].reduce((first, other) => Math.min(first, releaseAt[other]), moment),
  );

  // Per cell, per cap polygon: the moment that face stops being buried —
  // the release of the piece on the other side of it, or the piece's own
  // release if it has no piece on the other side.
  const wallAt = facing.map((faces, cell) =>
    faces.map((other) => (other < 0 ? releaseAt[cell] : Math.min(releaseAt[cell], releaseAt[other]))),
  );

  return { exposedAt, neighbours, releaseAt, wallAt };
}

/**
 * Turns each planned flight by `options.flightScatter`, in place: a tilt up
 * or down about the horizontal across the flight, then a swing about the
 * vertical. Exported so the spread can be measured against a bake's own
 * centres without re-cutting the figure.
 *
 * The mix is what lukebaffait.fr's pieces measured (optical flow over its
 * frames 180-330, 170 pieces moving over 3 px a frame pair, camera taken
 * out): directions off the cloud's mean by 13 degrees median, 20 at p75, 38
 * at p90 on screen, where ours were 4 / 10 / 12. And the deviations are NOT
 * per piece: two pieces 120-250 px apart (of a 1920 px frame) deviate
 * together, correlation 0.84 and 5 degrees apart on average; 250-450 px,
 * 0.43; 450-900 px, 0.19. Lower pieces fall away more and upper pieces rise
 * (deviation against screen height, 0.43). So nearly all of it is a smooth
 * field over the figure and a little is each piece's own, which also keeps
 * touching neighbours flying nearly parallel. The fan is left at 0 for the
 * statue: the cloud's own expansion already gives 0.25 against height, and
 * over the pieces that are seen, all high on the figure, a fan is one tilt
 * up for all of them.
 *
 * Before any repair this lands the first 120 pieces off at 13 / 21 / 33
 * degrees on screen (projected through the stage's camera at the break).
 * The repairs in planReleaseOrder and straightenCrossingFlights take back
 * the turns that fly pieces through standing marble or through each other,
 * and leave 5 / 8 / 18: see those for what that buys.
 *
 * Do not spend pass-through budget buying the spread back WITH THIS FIELD.
 * Measured through the stage's camera with a software ID render, the unrepaired scatter (10 /
 * 19 / 32 degrees against the straight flights' 3 / 6 / 9) moves the share of
 * the flying cloud's pixels that two or more pieces cover by nothing at all:
 * 0.555 against 0.557, at panel value 0.317. A smooth field turns
 * neighbouring pieces together by design, so it does not open them up; what
 * does is how far a piece gets before the next one leaves (TRAVEL_WINDOW)
 * and, since `outwardPush`, the part of each flight that runs along the
 * piece's own skin normal: a direction that is structured outward buys the
 * spread AND pays pass-through back, which a random field cannot.
 * Damping the repairs smoothly over the field's own grain instead of piece by
 * piece was tried, to keep what the repairs take back coherent: it held the
 * neighbour correlation (0.36 -> 0.62 over pieces a piece apart) but damped
 * nearly every turn, leaving 3 / 6 / 9 — the straight flights.
 */
export function scatterFlights(
  offsets: THREE.Vector3[],
  centers: THREE.Vector3[],
  ids: number[],
  options: BuildSolidChunkOptions,
  /**
   * Each piece's place in the order, 0..1. The turns are centred over the
   * first quarter of the order — the pieces seen to fly — so the scatter
   * spreads their directions without swinging the stream's mean: over so
   * small a patch of the figure a smooth field is close to one value, and
   * uncentred it turned the whole seen stream by 15 to 22 degrees.
   */
  ranks: number[],
) {
  const scatter = options.flightScatter;

  if (!scatter || offsets.length === 0) return;

  const [fieldShare, fanShare, ownShare] = scatter.shares;
  const total = Math.max(fieldShare + fanShare + ownShare, 1e-6);
  const tiltField = makeSmoothField(options.seed + 501, scatter.grain);
  const yawField = makeSmoothField(options.seed + 503, scatter.grain);
  let low = Infinity;
  let high = -Infinity;

  centers.forEach((center) => {
    low = Math.min(low, center.y);
    high = Math.max(high, center.y);
  });

  const middle = (low + high) / 2;
  const half = Math.max((high - low) / 2, 1e-6);
  // A height uniform over -1..1 has variance 1/3; this brings the fan to
  // unit variance like the other two parts.
  const fanScale = Math.sqrt(3);
  const up = new THREE.Vector3(0, 1, 0);
  const across = new THREE.Vector3();

  const turns = offsets.map((_, index) => {
    const center = centers[index];
    const id = ids[index];
    const fan = ((center.y - middle) / half) * fanScale;

    return {
      tilt:
        scatter.tilt *
        (Math.sqrt(fieldShare / total) * tiltField(center) +
          Math.sqrt(fanShare / total) * fan +
          Math.sqrt(ownShare / total) * gaussianHash(id, options.seed + 509)),
      yaw:
        scatter.yaw *
        (Math.sqrt((fieldShare + fanShare) / total) * yawField(center) +
          Math.sqrt(ownShare / total) * gaussianHash(id, options.seed + 521)),
    };
  });
  const seenBy = [...ranks].sort((a, b) => a - b)[Math.floor((ranks.length - 1) * 0.25)];
  const seen = turns.filter((_, index) => ranks[index] <= seenBy);
  const meanTilt = seen.reduce((sum, turn) => sum + turn.tilt, 0) / Math.max(seen.length, 1);
  const meanYaw = seen.reduce((sum, turn) => sum + turn.yaw, 0) / Math.max(seen.length, 1);

  offsets.forEach((offset, index) => {
    const tilt = turns[index].tilt - meanTilt;
    const yaw = turns[index].yaw - meanYaw;

    offset.applyAxisAngle(up, yaw);
    across.crossVectors(offset, up);
    if (across.lengthSq() < 1e-12) return;
    // Positive tilt turns the flight toward +y: (offset x up) x offset
    // points up.
    offset.applyAxisAngle(across.normalize(), tilt);
  });
}

// About 40 points on a piece, one per polygon stride, for the flight checks —
// or `want` of them, for the steering pass, which grades itself against a
// finer sieve.
function samplePiece(piece: FragmentPiece, want = 40) {
  const points: THREE.Vector3[] = [];
  const stride = Math.max(1, Math.floor(piece.polygons.length / want));

  for (let index = 0; index < piece.polygons.length; index += stride) {
    const polygon = piece.polygons[index];
    const centroid = new THREE.Vector3();
    polygon.vertices.forEach((vertex) => centroid.add(vertex.point));
    // Pulled a little toward the piece's centre, so two faces that were
    // cut from one plane do not count as overlapping where they touch.
    points.push(centroid.multiplyScalar(1 / polygon.vertices.length).lerp(piece.center, 0.07));
  }

  return points;
}

// The stage's own per-piece travel curve (pieceTravelAt in ThinkerStage), for
// the crossing check below: a smootherstep unstick over the first UNSTICK of
// the window, then quick off the mark and slowing through the rest of it.
// Keep the two in step — the crossing check poses pieces with this, and a
// curve that is not the stage's would clear crossings the stage still has.
const STAGE_UNSTICK = 0.18;
/**
 * The stage's DRIFT_ON, which the crossing checks have to pose pieces with.
 * 1: past the knee a piece carries ON at the pace its window was planned at
 * — one offset per window, for as long as it is drawn — so it never slows
 * to a crawl and never leaves the line it broke off along. It was 0.3, a
 * drift, and before the knee the curve slowed to a dead stop at the window's
 * end. Asked for: "all of the pieces should continue moving down the line
 * that they break off from."
 */
export const STAGE_DRIFT_ON = 1;
const STAGE_KNEE = 1 - STAGE_DRIFT_ON / 2;
const STAGE_KNEE_AT = STAGE_KNEE * (2 - STAGE_KNEE);

/**
 * The stage's own shrink curve (shrinkAt in ThinkerStage): a piece keeps its
 * full size for the first quarter of its travel and takes its shrink over the
 * rest. The checks below pose pieces with it, so they see the size a piece
 * really is when it is still next to its neighbours.
 */
function stageShrinkAt(travel: number) {
  const x = THREE.MathUtils.clamp((travel - 0.25) / 0.75, 0, 1);

  return x * x * (3 - 2 * x);
}

function stageTravelAt(x: number) {
  if (x <= 0) return 0;

  const travel =
    x <= STAGE_KNEE
      ? x * (2 - x)
      : STAGE_KNEE_AT + STAGE_DRIFT_ON * (x - STAGE_KNEE);

  if (x >= STAGE_UNSTICK) return travel;

  const t = x / STAGE_UNSTICK;

  return travel * t * t * t * (t * (t * 6 - 15) + 10);
}

// How far into the break the crossing checks look, and how often: just past
// the 0.51 at which the stage stops drawing the statue (panel value 0.49 at
// 1280x800). It was 0.4, set when the stage stopped at ~0.34; the audit over
// the whole drawn stretch counts pairs of flying pieces overlapping for 0.06
// of the break or more, and looking this far takes that 11 -> 10.
const CROSSING_CHECK_END = 0.52;
const CROSSING_CHECK_STEP = 0.02;
// The share of a piece's sampled surface points inside another flying piece
// that counts as the two passing through each other.
const CROSSING_FRACTION = 0.25;
// Rounds of turning crossing flights back toward straight (see below).
const CROSSING_ROUNDS = 4;

/**
 * Flying pieces that pass through each other, straightened. The scatter
 * turns neighbouring flights by nearly the same amount, but pieces that
 * leave at different moments from different places can still cross, and
 * the plane's straight flights are the ones the expansion (FLIGHT_STRETCH,
 * FLIGHT_SPREAD) was built to keep apart. Measured with a sampled-point
 * audit over the visible break (pairs of flying pieces with a quarter or
 * more of one's sampled points inside the other at some moment): while
 * tuning, 4 on the plane's own break, 10 with the scatter and the texture,
 * 7 with this; pairs that stay overlapped for 0.06 of the break or more,
 * 10, 15 and 10. As shipped: 4, and 2 — `outwardPush` takes most of them
 * out before this pass ever sees them, and what this pass straightens a
 * piece back TO is now its OUTWARD flight, not the common one, because
 * `straight` is taken after the outward term is added.
 * Each pair found turns its more-turned piece half way back to straight,
 * for up to CROSSING_ROUNDS rounds, the last of which straightens it.
 * Poses are the stage's own: travel on its curve, spin times travel, the
 * shrink to `scale` (the roll with time in the air is left out).
 */
function straightenCrossingFlights(
  chunks: ThinkerChunkData[],
  pieces: FragmentPiece[],
  offsets: THREE.Vector3[],
  straight: THREE.Vector3[],
) {
  const insideTests = pieces.map((piece) => makeInsideTest(piece));
  const samples = pieces.map(samplePiece);
  const turnOf = (index: number) => offsets[index].angleTo(straight[index]);
  const euler = new THREE.Euler();
  const point = new THREE.Vector3();

  const poseAt = (index: number, moment: number) => {
    const chunk = chunks[index];
    const flown = (moment - chunk.releaseAt) / Math.max(chunk.travel, 0.01);
    const travel = stageTravelAt(flown);
    const turn = Math.min(travel, 1.5);
    return {
      position: pieces[index].center.clone().addScaledVector(offsets[index], travel),
      rotation: new THREE.Quaternion().setFromEuler(
        euler.set(chunk.spin[0] * turn, chunk.spin[1] * turn, chunk.spin[2] * turn),
      ),
      scale: THREE.MathUtils.lerp(1, chunk.scale, stageShrinkAt(travel)),
    };
  };

  for (let round = 0; round < CROSSING_ROUNDS; round++) {
    const straighten = new Set<number>();

    for (
      let moment = CROSSING_CHECK_STEP;
      moment <= CROSSING_CHECK_END + 1e-9;
      moment += CROSSING_CHECK_STEP
    ) {
      const flying = chunks
        .map((chunk, index) => index)
        .filter((index) => chunks[index].releaseAt < moment);
      const poses = new Map(flying.map((index) => [index, poseAt(index, moment)]));

      for (let i = 0; i < flying.length; i++) {
        for (let j = i + 1; j < flying.length; j++) {
          const a = flying[i];
          const b = flying[j];
          if (turnOf(a) < 1e-6 && turnOf(b) < 1e-6) continue;
          const poseA = poses.get(a)!;
          const poseB = poses.get(b)!;
          const reach = chunks[a].radius * poseA.scale + chunks[b].radius * poseB.scale;
          if (poseA.position.distanceTo(poseB.position) > reach) continue;

          // a's points, posed, carried into b's resting frame.
          const inverseB = poseB.rotation.clone().invert();
          let inside = 0;

          for (const sample of samples[a]) {
            point
              .copy(sample)
              .sub(pieces[a].center)
              .multiplyScalar(poseA.scale)
              .applyQuaternion(poseA.rotation)
              .add(poseA.position)
              .sub(poseB.position)
              .applyQuaternion(inverseB)
              .multiplyScalar(1 / poseB.scale)
              .add(pieces[b].center);
            if (pieces[b].box.containsPoint(point) && insideTests[b](point)) inside += 1;
          }

          if (inside >= samples[a].length * CROSSING_FRACTION) {
            straighten.add(turnOf(a) >= turnOf(b) ? a : b);
          }
        }
      }
    }

    if (straighten.size === 0) break;

    straighten.forEach((index) => {
      // Half way back each round, straight on the last: most crossings
      // clear with part of the turn kept.
      const length = offsets[index].length();
      offsets[index] =
        round === CROSSING_ROUNDS - 1
          ? straight[index].clone()
          : offsets[index].clone().lerp(straight[index], 0.5).setLength(length);
      chunks[index].offset = [offsets[index].x, offsets[index].y, offsets[index].z];
    });
  }
}

/**
 * Whatever is still inside solid stone after the two repairs above, steered
 * around it. Asked for: "eliminate any chunks passing through preexisting
 * material". The repairs each have one move and it is not always available —
 * `straightenCrossingFlights` can only turn a flight BACK to the one the
 * plane gave it, and that one may be no better, and `clearStandingBlockers`
 * can only let the standing piece go sooner, which the order will not always
 * allow (CLEAR_MAX_SHIFT, CLEAR_FROM). This has the move they are missing:
 * it turns the MOVER onto a different line.
 *
 * A piece still flies a straight line from where it broke off — the line is
 * just aimed a few degrees to one side of the thing it was going through.
 * The turn is about the axis that swings the flight in the plane it shares
 * with what it hits, smallest turn first, and a candidate is only taken if
 * it is clear of EVERYTHING (standing and flying alike), so the pass cannot
 * trade one overlap for another. Rounds until nothing moves, because a
 * turned piece can walk into a piece that was clear of it before.
 *
 * Measured with the sampled-point audit over the drawn break, pairs with a
 * tenth or more of a piece's points inside another once the mover has left
 * its socket: inside standing marble 7 -> 1 (none a quarter or more inside),
 * flying through flying 10 -> 0. It turns 69 of the 423 pieces, by 10 degrees
 * at the median and 36.5 at the most.
 */
const STEER_TURNS = [5, -5, 10, -10, 15, -15, 20, -20, 25, -25, 29, -29, 33, -33];
const STEER_ROUNDS = 12;
/**
 * The share of a mover's sampled points inside another piece this pass will
 * not leave, and how many points it takes. Both are stricter than the audit
 * that grades the result (a tenth of 70 points): a pass that is graded by a
 * finer sieve than it uses leaves the difference behind, and on the first
 * cut it did — 0.1 of 40 points left 7 pairs the audit still called
 * overlapping.
 */
const STEER_FRACTION = 0.07;
const STEER_SAMPLES = 90;
/**
 * How far out of its socket a piece has to be before this pass counts an
 * overlap against it, as a share of its flight. The audit that grades the
 * break uses the same figure.
 */
const STEER_MOVED = 0.15;
/** Shares of its own flight length a piece may lean away from what it hits. */
const STEER_APART = [0.06, 0.12, 0.2, 0.28, 0.38, 0.5];
/**
 * The most a flight may end up turned from the one the plan gave it, over
 * all the rounds together. Without a cap the pass walks a piece that has
 * nowhere clear to go a little further every round, and the stream goes with
 * it: the first 120 pieces off spread 15.7 / 38.6 / 52.8 degrees about their
 * mean on screen (median / p75 / p90) against the 13 / 20 / 38 of
 * lukebaffait.fr's own cloud. That was when the pass steered a third of the
 * pieces; now that it only steers the ones that are really in the way
 * (STEER_MOVED), a wide cap costs the stream nothing and buys the last pairs:
 * at 34 degrees the first 120 pieces spread 8.5 / 12.8 / 22.2 degrees about
 * their mean and two pairs are left inside standing marble, at 45 they spread
 * 8.8 / 13.2 / 23.3 and one is, a tenth inside for one step.
 */
const STEER_MAX_TURN = (45 * Math.PI) / 180;

function steerClearOfSolids(
  chunks: ThinkerChunkData[],
  pieces: FragmentPiece[],
  offsets: THREE.Vector3[],
) {
  const insideTests = pieces.map((piece) => makeInsideTest(piece));
  // The SKIN and the CUT FACES sampled separately, so both are covered at
  // this density however lopsided a piece is. A plain stride over all the
  // polygons put nearly every point on the cut faces of a piece that is
  // mostly cut face, and the pass then passed pairs that an audit sampling
  // the skin called half inside each other (261/284 measured 0.50).
  const samples = pieces.map((piece) => {
    const points: THREE.Vector3[] = [];

    for (const kind of ["surface", "cap"] as const) {
      const polygons = piece.polygons.filter((polygon) => polygon.kind === kind);
      const stride = Math.max(1, Math.floor(polygons.length / STEER_SAMPLES));

      for (let index = 0; index < polygons.length; index += stride) {
        const centroid = new THREE.Vector3();
        polygons[index].vertices.forEach((vertex) => centroid.add(vertex.point));
        points.push(
          centroid.multiplyScalar(1 / polygons[index].vertices.length).lerp(piece.center, 0.07),
        );
      }
    }

    return points;
  });
  const euler = new THREE.Euler();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const point = new THREE.Vector3();
  const radii = chunks.map((chunk) => chunk.radius);
  // Every piece a mover on this flight ends up a tenth or more inside, at any
  // moment the stage is drawn through.
  const blockersOf = (mover: number, flight: THREE.Vector3) => {
    const chunk = chunks[mover];
    const hit = new Set<number>();

    for (
      let moment = CROSSING_CHECK_STEP;
      moment <= CROSSING_CHECK_END + 1e-9;
      moment += CROSSING_CHECK_STEP
    ) {
      if (chunk.releaseAt >= moment) continue;

      const travel = stageTravelAt((moment - chunk.releaseAt) / Math.max(chunk.travel, 0.01));

      // Not while the piece is still in its socket. A piece that has just let
      // go has not gone anywhere — it is still interlocked with the
      // neighbours it was cut from, and no line it could fly clears them, so
      // a pass that counts those moments turns pieces that have nothing to
      // avoid. It turned 135 of 423 by a median of 18 degrees, which is the
      // whole of why the stream fanned out ("the path of all the pieces, it
      // is getting too spread out"); ignoring them it turns 9, and the first
      // 120 pieces off spread 6.1 / 10.3 / 16.4 degrees about their mean
      // instead of 14.4 / 25.2 / 34.3.
      if (travel < STEER_MOVED) continue;
      const turn = Math.min(travel, 1.5);
      const scale = THREE.MathUtils.lerp(1, chunk.scale, stageShrinkAt(travel));

      position.copy(flight).multiplyScalar(travel).add(pieces[mover].center);
      rotation.setFromEuler(
        euler.set(chunk.spin[0] * turn, chunk.spin[1] * turn, chunk.spin[2] * turn),
      );

      chunks.forEach((other, index) => {
        if (index === mover || hit.has(index)) return;

        const moving = other.releaseAt < moment;
        const otherTravel = moving
          ? stageTravelAt((moment - other.releaseAt) / Math.max(other.travel, 0.01))
          : 0;
        const otherScale = THREE.MathUtils.lerp(1, other.scale, stageShrinkAt(otherTravel));
        const otherAt = new THREE.Vector3(...other.offset)
          .multiplyScalar(otherTravel)
          .add(pieces[index].center);

        if (position.distanceTo(otherAt) > radii[mover] * scale + radii[index] * otherScale) return;

        // The other piece's own turn, so a mover is not tested against a pose
        // it never meets.
        const otherTurn = Math.min(otherTravel, 1.5);
        const otherRotation = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            other.spin[0] * otherTurn,
            other.spin[1] * otherTurn,
            other.spin[2] * otherTurn,
          ),
        );
        const inverse = otherRotation.clone().invert();
        let inside = 0;

        for (const sample of samples[mover]) {
          point
            .copy(sample)
            .sub(pieces[mover].center)
            .multiplyScalar(scale)
            .applyQuaternion(rotation)
            .add(position)
            .sub(otherAt)
            .applyQuaternion(inverse)
            .multiplyScalar(1 / Math.max(otherScale, 1e-6))
            .add(pieces[index].center);
          if (pieces[index].box.containsPoint(point) && insideTests[index](point)) inside += 1;
        }

        if (inside >= samples[mover].length * STEER_FRACTION) hit.add(index);
      });
    }

    return hit;
  };
  const axis = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  const planned = offsets.map((offset) => offset.clone());

  for (let round = 0; round < STEER_ROUNDS; round++) {
    let moved = 0;

    for (let mover = 0; mover < chunks.length; mover++) {
      const blockers = blockersOf(mover, offsets[mover]);

      if (blockers.size === 0) continue;

      // Swing away from the nearest thing in the way.
      const worst = [...blockers].reduce((best, index) =>
        pieces[index].center.distanceTo(pieces[mover].center) <
        pieces[best].center.distanceTo(pieces[mover].center)
          ? index
          : best,
      );

      axis.crossVectors(offsets[mover], pieces[worst].center.clone().sub(pieces[mover].center));

      if (axis.lengthSq() < 1e-12) continue;

      axis.normalize();

      // The swing that goes round the blocker first, then the one across it
      // (a piece boxed in on one side has the other to go to), and last a
      // push straight away from what it hits. A turn cannot separate two
      // pieces that left from almost the same place and fly almost the same
      // way — the pair 261/284 held their centres 0.04 apart, against radii
      // summing to 0.25, for the whole of the drawn break, and every turn of
      // the one moved it into the other's new place. Leaning the flight away
      // from the line between them does separate them, and it is still one
      // straight line from where the piece broke off.
      //
      // The best candidate is taken, not the first clear one: a piece with
      // nowhere clear to go still has somewhere BETTER to go, and the rounds
      // then walk it out. Taking only a clear line left three pairs of
      // pieces flying through each other that this clears.
      const across = axis.clone().cross(offsets[mover]).normalize();
      const apart = pieces[mover].center
        .clone()
        .sub(pieces[worst].center)
        .normalize()
        .multiplyScalar(offsets[mover].length());
      let bestCount = blockers.size;
      let best: THREE.Vector3 | null = null;

      const consider = (flight: THREE.Vector3) => {
        if (flight.angleTo(planned[mover]) > STEER_MAX_TURN) return false;

        const count = blockersOf(mover, flight).size;

        if (count >= bestCount) return false;

        bestCount = count;
        best = flight.clone();

        return count === 0;
      };

      search: for (const turns of [axis, across]) {
        for (const degrees of STEER_TURNS) {
          if (consider(candidate.copy(offsets[mover]).applyAxisAngle(turns, (degrees * Math.PI) / 180))) {
            break search;
          }
        }
      }

      if (bestCount > 0 && apart.lengthSq() > 1e-12) {
        for (const share of STEER_APART) {
          if (consider(candidate.copy(offsets[mover]).addScaledVector(apart, share))) break;
        }
      }

      if (best) {
        offsets[mover].copy(best);
        chunks[mover].offset = [offsets[mover].x, offsets[mover].y, offsets[mover].z];
        moved += 1;
      }
    }

    if (moved === 0) break;
  }

}

// `clearStandingBlockers`: the most a standing piece's release may be brought
// forward, in breakup, and the earliest it may be brought forward to.
const CLEAR_MAX_SHIFT = 0.03;
const CLEAR_FROM = 0.22;

/**
 * Flying pieces that pass through marble still standing, cleared by letting
 * the standing piece go a moment sooner: on the last check step before the
 * mover reaches it, if that is no more than CLEAR_MAX_SHIFT earlier and not
 * before CLEAR_FROM. Rounds until nothing moves. Poses and the test are
 * `straightenCrossingFlights`' own; the standing piece is at rest.
 *
 * Measured with the sampled-point audit over the drawn break (pairs where a
 * flying piece has a quarter or more of its points inside standing marble at
 * some moment): 11 as shipped before, 12 with the faster flight
 * (TRAVEL_WINDOW), 7 with this. Unlimited, the same pass took it to 8 but
 * pulled pieces from the back of the figure into the opening (42 of the
 * first 45 off forward of z 0.4 fell to 40) and flattened the build (the
 * drawn stretch's share released by 75% of it went 58.1 -> 63.0%); at this
 * limit those are 42 and 58.6.
 */
function clearStandingBlockers(
  chunks: ThinkerChunkData[],
  pieces: FragmentPiece[],
  neighbours: number[][],
) {
  const insideTests = pieces.map((piece) => makeInsideTest(piece));
  const samples = pieces.map(samplePiece);
  const euler = new THREE.Euler();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const point = new THREE.Vector3();

  for (let round = 0; round < 6; round++) {
    const earliest = new Map<number, number>();

    for (
      let moment = CROSSING_CHECK_STEP;
      moment <= CROSSING_CHECK_END + 1e-9;
      moment += CROSSING_CHECK_STEP
    ) {
      chunks.forEach((chunk, mover) => {
        if (chunk.releaseAt >= moment) return;
        const flown = (moment - chunk.releaseAt) / Math.max(chunk.travel, 0.01);
        const travel = stageTravelAt(flown);
        const turn = Math.min(travel, 1.5);
        const scale = THREE.MathUtils.lerp(1, chunk.scale, stageShrinkAt(travel));

        position.set(...chunk.offset).multiplyScalar(travel).add(pieces[mover].center);
        rotation.setFromEuler(euler.set(chunk.spin[0] * turn, chunk.spin[1] * turn, chunk.spin[2] * turn));

        chunks.forEach((other, standing) => {
          if (standing === mover || other.releaseAt < moment) return;
          if (position.distanceTo(pieces[standing].center) > chunk.radius * scale + other.radius) return;
          const sooner = Math.max(chunk.releaseAt, moment - CROSSING_CHECK_STEP);
          if (other.releaseAt - sooner > CLEAR_MAX_SHIFT || sooner < CLEAR_FROM) return;

          let inside = 0;

          for (const sample of samples[mover]) {
            point
              .copy(sample)
              .sub(pieces[mover].center)
              .multiplyScalar(scale)
              .applyQuaternion(rotation)
              .add(position);
            if (pieces[standing].box.containsPoint(point) && insideTests[standing](point)) inside += 1;
          }

          if (inside >= samples[mover].length * CROSSING_FRACTION) {
            earliest.set(standing, Math.min(earliest.get(standing) ?? Infinity, sooner));
          }
        });
      });
    }

    if (earliest.size === 0) break;

    earliest.forEach((moment, index) => {
      chunks[index].releaseAt = Math.min(chunks[index].releaseAt, moment);
      chunks[index].travel = Math.min(TRAVEL_WINDOW, 1 - chunks[index].releaseAt);
    });
  }

  // A piece's cut faces show from its first neighbour's release (see
  // planReleaseOrder), and some of those just moved.
  chunks.forEach((chunk, index) => {
    chunk.exposedAt = neighbours[index].reduce(
      (first, other) => Math.min(first, chunks[other].releaseAt),
      chunk.releaseAt,
    );
  });
}

/**
 * Cuts the figure into solid chunks and plans each one's flight.
 *
 * The pieces all fly the same way, along `options.direction`: every piece
 * gets the same push along it, plus a stretch — pieces further along the
 * direction travel further, so the ones in front never close on the ones
 * behind — plus a spread sideways from the figure's centre of surface so
 * neighbours across the line open up too. Together that is an expansion
 * of space about the centre, stronger along the flight line, which is what
 * keeps the rigid pieces from passing through one another; the spin is
 * kept small enough (smaller for bigger pieces) not to undo it.
 */
export function buildSolidThinkerChunks(
  sourceGeometry: THREE.BufferGeometry,
  options: BuildSolidChunkOptions,
): ThinkerChunkBuild {
  const { cells, impact, stats } = fractureIntoPieces(sourceGeometry, options);
  const pieces = cells.map((cell) => cell.piece);
  const origin = new THREE.Vector3();
  let weight = 0;

  pieces.forEach((piece) => {
    origin.addScaledVector(piece.center, piece.totalArea);
    weight += piece.totalArea;
  });
  origin.multiplyScalar(1 / Math.max(weight, 1e-6));

  const direction = new THREE.Vector3(...options.direction).normalize();
  const along = pieces.map((piece) => piece.center.clone().sub(origin).dot(direction));
  const minAlong = Math.min(...along);
  const maxAlong = Math.max(...along);
  const span = Math.max(maxAlong - minAlong, 1e-6);
  const driftCenter = new THREE.Vector3();
  // Each piece's own way OUT of the stone (`outwardPush`): the mean of the
  // skin it owned, weighted by area. A piece with almost no skin — one cut
  // out of the middle of a limb — has no such direction, so it falls back to
  // the line from the figure's centre of surface, which is the way out of
  // the figure itself.
  const outwards = pieces.map((piece) => {
    const out = new THREE.Vector3();

    piece.polygons.forEach((polygon) => {
      if (polygon.kind !== "surface") return;

      const share = polygonArea(polygon.vertices) / polygon.vertices.length;

      polygon.vertices.forEach((vertex) => out.addScaledVector(vertex.normal, share));
    });

    if (out.lengthSq() < 1e-12) out.copy(piece.center).sub(origin);

    return out.lengthSq() < 1e-12 ? out.set(0, 1, 0) : out.normalize();
  });
  const offsets = pieces.map((piece, index) => {
    const fromOrigin = piece.center.clone().sub(origin);
    const lead = (fromOrigin.dot(direction) - minAlong) / span;
    const sideways = fromOrigin.clone().addScaledVector(direction, -fromOrigin.dot(direction));
    const jitter = randomUnitVector(piece.id, options.seed + 23).multiplyScalar(
      options.spread * 0.025,
    );

    const offset = direction
      .clone()
      .multiplyScalar(options.spread * (FLIGHT_PUSH + FLIGHT_STRETCH * lead));

    if (ONE_DIRECTION) return offset;

    return offset
      .addScaledVector(sideways, FLIGHT_SPREAD)
      .addScaledVector(outwards[index], options.spread * (options.outwardPush ?? 0))
      .add(jitter);
  });

  const straight = options.flightScatter ? offsets.map((offset) => offset.clone()) : null;

  if (options.flightScatter && !ONE_DIRECTION) {
    scatterFlights(
      offsets,
      pieces.map((piece) => piece.center),
      pieces.map((piece) => piece.id),
      options,
      cells.map((cell) => cell.seed.position),
    );
  }
  const { exposedAt, neighbours, releaseAt, wallAt } = planReleaseOrder(cells, offsets, options, straight);

  const chunks = pieces.map((piece, index): ThinkerChunkData => {
    const offset = offsets[index];
    const extent = piece.box.getSize(new THREE.Vector3());
    const radius = extent.length() * 0.5;
    const spinLimit = THREE.MathUtils.clamp(0.11 / Math.max(radius, 0.05), 0.05, 0.3);
    // `spinSpread`: most pieces a little slower, a few clearly faster.
    const spinScale = options.spinSpread
      ? THREE.MathUtils.lerp(
          options.spinSpread[0],
          options.spinSpread[1],
          hash01(piece.id, options.seed + 83) ** 2,
        )
      : 1;
    const surface = makeFlatArrays(
      piece.polygons.filter((polygon) => polygon.kind === "surface"),
      piece.center,
    );
    // The cut faces, SORTED by the moment each stops being buried, so the
    // stage can draw the first n of them and no more (see `wall` below and
    // the draw range in ThinkerStage). One draw call either way.
    const caps = piece.polygons.filter((polygon) => polygon.kind === "cap");
    const moments = wallAt[index];
    const order = caps
      .map((_, capIndex) => capIndex)
      .sort((a, b) => moments[a] - moments[b]);
    const interior = makeFlatArrays(
      order.map((capIndex) => caps[capIndex]),
      piece.center,
    );
    // [moment, triangles drawn once the break has passed it], in order. Only
    // the steps are kept, so this is a handful of pairs per piece rather than
    // one per face.
    const wall: Array<[number, number]> = [];
    let triangles = 0;

    order.forEach((capIndex) => {
      triangles += Math.max(caps[capIndex].vertices.length - 2, 0);
      const moment = moments[capIndex];
      const last = wall[wall.length - 1];

      if (last && last[0] === moment) last[1] = triangles;
      else wall.push([moment, triangles]);
    });

    driftCenter.add(offset);

    return {
      center: [piece.center.x, piece.center.y, piece.center.z],
      debug: { capStats: piece.capStats, sourceIndex: piece.id },
      exposedAt: exposedAt[index],
      interiorNormals: interior.normals,
      interiorPositions: interior.positions,
      offset: [offset.x, offset.y, offset.z],
      phase: cells[index].seed.phase,
      radius,
      releaseAt: releaseAt[index],
      // Each piece shrinks to this over its flight, so daylight opens
      // between neighbours that left together: a tenth off each piece is
      // a clear gap at every seam, so the cloud reads as pieces rather
      // than as a cracked skin. Was 0.985, then 0.975, then 0.9; 0.84 after
      // a second ask for more space between the pieces.
      scale: 0.84,
      spin: [
        signedHash(piece.id, options.seed + 71) * spinLimit * spinScale,
        signedHash(piece.id, options.seed + 73) * spinLimit * spinScale,
        signedHash(piece.id, options.seed + 79) * spinLimit * 0.7 * spinScale,
      ],
      surfaceNormals: surface.normals,
      surfacePositions: surface.positions,
      travel: Math.min(TRAVEL_WINDOW, 1 - releaseAt[index]),
      wall,
    };
  });

  if (straight) {
    straightenCrossingFlights(chunks, pieces, offsets, straight);
    clearStandingBlockers(chunks, pieces, neighbours);
    // Off under ONE_DIRECTION: a pass whose only move is to turn a piece onto
    // a different line cannot run when every piece has to fly the same one.
    // With it on it turned 69 of 423 pieces by 10 degrees at the median, and
    // that is exactly the spread this round is here to take out.
    if (!ONE_DIRECTION) steerClearOfSolids(chunks, pieces, offsets);
    driftCenter.set(0, 0, 0);
    offsets.forEach((offset) => driftCenter.add(offset));
  }

  driftCenter.multiplyScalar(1 / Math.max(chunks.length, 1));

  return {
    // Published so the stage can open its camera on the blow.
    breakOrigin: [impact.x, impact.y, impact.z],
    chunks,
    drift: [driftCenter.x, driftCenter.y, driftCenter.z],
    stats,
  };
}

/** The typed arrays of a chunk as two geometries: the stone and the cuts. */
export function makeChunkGeometries(chunk: ThinkerChunkData) {
  const make = (positions: Float32Array, normals: Float32Array) => {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
  };

  return {
    interiorGeometry: make(chunk.interiorPositions, chunk.interiorNormals),
    surfaceGeometry: make(chunk.surfacePositions, chunk.surfaceNormals),
  };
}

/** Buffers to hand over when posting a build out of a worker. */
export function chunkTransferables(chunks: ThinkerChunkData[]) {
  const buffers: ArrayBuffer[] = [];

  chunks.forEach((chunk) => {
    buffers.push(
      chunk.surfacePositions.buffer as ArrayBuffer,
      chunk.surfaceNormals.buffer as ArrayBuffer,
      chunk.interiorPositions.buffer as ArrayBuffer,
      chunk.interiorNormals.buffer as ArrayBuffer,
    );
  });

  return buffers;
}
