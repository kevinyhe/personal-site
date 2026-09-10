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
   * cells are finest at this point and coarsen away from it, and pieces
   * come loose in order of their distance from it.
   */
  impact: [number, number, number];
  /**
   * Where the break is watched from, in figure units: pieces come loose in
   * order of their distance from HERE rather than from the impact, so the
   * ones nearest the lens go first and the far side of the figure last.
   * Left out, the impact itself is the origin.
   */
  releaseFrom?: [number, number, number];
  /**
   * A direction in figure units: when set, the break is a plane sweeping
   * along it — pieces come loose in order of how far along this axis they
   * sit, from the far end back. Given the flight's own direction reversed,
   * the front starts at the head (the part furthest along the flight) and
   * slices down the figure at the angle the pieces leave at. Overrides
   * `releaseFrom`.
   */
  releaseSweep?: [number, number, number];
  /** Target cell width at the impact, in figure units. */
  spacingNear: number;
  /** Target cell width far from the impact. */
  spacingFar: number;
  /**
   * How quickly the spacing opens out, in figure units: at this distance
   * from the impact the cells are ~63% of the way from near to far.
   */
  spacingFalloff: number;
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
};

// Roughly how many surface points are offered to the sampler. It has to be
// dense enough that the finest spacing near the impact has candidates to
// choose between, and no denser — every candidate costs work in the sampler.
const CANDIDATE_TARGET = 2200;
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
// The first gap between releases is this many times the last, so the gaps
// shrink and the whole thing accelerates away: a piece here and there to
// begin with, then the figure going at once.
//
// Set by measuring how much has let go partway through: at 3 a fifth was out
// a quarter of the way in and half by 0.54, which spread the break evenly
// over the run. At 10 it was a tenth and 0.63. Now that the run is the
// whole page — from the panel's first beat to the black — 50 keeps the
// start sparse (the first gap is 0.0155 of the break, the last 0.0003:
// a piece now and then for a long while, then the figure going at once).
const RELEASE_ACCELERATION = 50;
// How much of the breakup a piece's flight takes once released. Doubled
// from 0.275 with the run: a piece's flight is a share of the break, and
// the break is twice as long, so this keeps each piece's own pace and
// then halves it again.
const TRAVEL_WINDOW = 0.55;
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

// The flight, in multiples of `spread`: the push every piece gets along the
// direction; the extra the piece furthest along it gets over the piece
// furthest behind; and the fraction of a piece's sideways distance from the
// centre it moves outward. The push was 0.15 and the sideways share 0.3
// until the pieces were asked, twice, to sit further apart in the air:
// the push now carries every piece further along the flight and the
// sideways share doubles, so the cloud opens along and across.
const FLIGHT_PUSH = 0.28;
const FLIGHT_STRETCH = 1.0;
const FLIGHT_SPREAD = 0.6;

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
  const spacings = candidates.map((candidate, index) => {
    const fieldIn = smoothstep01(distances[index] / IMPACT_FINE_RADIUS);

    return (
      spacingAt(distances[index]) *
      Math.pow(sizeFieldAt(candidate, options), fieldIn)
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
  // easing out to `spacingFar`.
  const spacingAt = (distance: number) =>
    options.spacingNear +
    (options.spacingFar - options.spacingNear) *
      (1 - Math.exp(-distance / Math.max(options.spacingFalloff, 1e-6)));

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
  const stride = Math.max(1, Math.floor(source.polygons.length / CANDIDATE_TARGET));

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
  const points = guardPoints.concat(
    sampleGradedSeeds(candidates, impact, spacingAt, shellRadii, guardPoints, stretch, options),
  );
  // Drop any pair that ended up on top of each other (see
  // SEED_MIN_SEPARATION: a coincident pair is a NaN bisector).
  const kept: THREE.Vector3[] = [];

  for (const point of points) {
    if (kept.some((other) => other.distanceTo(point) < SEED_MIN_SEPARATION)) continue;

    kept.push(point);
  }

  // The break travels away from the viewer, so a piece's place in the
  // order is how far its seed sits from where the break is watched from
  // (the camera's opening eye; the blow itself when none is given).
  const releaseFrom = options.releaseFrom ? new THREE.Vector3(...options.releaseFrom) : impact;
  const farthest = Math.max(...kept.map((point) => point.distanceTo(releaseFrom)), 1e-6);
  const sweep = options.releaseSweep
    ? new THREE.Vector3(...options.releaseSweep).normalize()
    : null;
  let sweepMin = Infinity;
  let sweepMax = -Infinity;
  if (sweep) {
    for (const point of kept) {
      const along = point.dot(sweep);
      sweepMin = Math.min(sweepMin, along);
      sweepMax = Math.max(sweepMax, along);
    }
  }
  const rankOf = (point: THREE.Vector3) =>
    sweep
      ? (point.dot(sweep) - sweepMin) / Math.max(sweepMax - sweepMin, 1e-6)
      : point.distanceTo(releaseFrom) / farthest;
  const seeds: Seed[] = kept.map((point) => ({
    phase: point.y >= headFloor ? "head" : point.y < legsCeiling ? "lower" : "upper",
    point,
    position: rankOf(point),
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
// up the arm from the hand, then the rest along the sweep — the head and
// the right knee together first, the tail last. A piece may never start
// before a touching neighbour that its own flight points at, or it would
// drive into it while the neighbour still sits; where that cuts across
// the order, the neighbour goes just before it instead. Touching means
// sharing cut points, so this follows the real cuts, not a guess. The
// islands of one seed count as one piece throughout.
function planReleaseOrder(cells: CellBuild[], offsets: THREE.Vector3[]) {
  const count = cells.length;

  if (count <= 1) {
    return cells.map(() => 0);
  }

  // Units: one per seed. The arm goes first in path order; everything
  // else follows in sweep order.
  const unitOf = new Map<Seed, number>();
  const unitRank: number[] = [];
  const unitCells: number[][] = [];

  cells.forEach(({ seed }, index) => {
    let unit = unitOf.get(seed);

    if (unit === undefined) {
      unit = unitRank.length;
      unitOf.set(seed, unit);
      unitRank.push(
        THREE.MathUtils.clamp(seed.position, 0, 0.999),
      );
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

  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      const ua = cellUnit[a];
      const ub = cellUnit[b];

      if (ua === ub) continue;

      if (touching(a, b)) {
        if (pointsAt(a, b)) before[ua].add(ub);
        if (pointsAt(b, a)) before[ub].add(ua);
      } else {
        if (fliesThrough(a, b)) before[ua].add(ub);
        if (fliesThrough(b, a)) before[ub].add(ua);
      }
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

  const releaseAt = new Array<number>(count).fill(0);
  // Gaps between releases shrink geometrically: slot k sits at the sum of
  // gaps g^0..g^(k-1), scaled so the last slot lands on RELEASE_END. That
  // is what makes the number of pieces coming off grow exponentially.
  const slots = order.length;
  const decay = slots > 2 ? Math.pow(RELEASE_ACCELERATION, -1 / (slots - 2)) : 1;
  const total = decay === 1 ? Math.max(slots - 1, 1) : (1 - Math.pow(decay, slots - 1)) / (1 - decay);
  const momentAt = (slot: number) =>
    slots <= 1
      ? 0
      : (RELEASE_END * (decay === 1 ? slot : (1 - Math.pow(decay, slot)) / (1 - decay))) / total;

  order.forEach((group, slot) => {
    const moment = momentAt(slot);

    group.forEach((unit) => {
      unitCells[unit].forEach((cell) => {
        releaseAt[cell] = moment;
      });
    });
  });

  return releaseAt;
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
  const offsets = pieces.map((piece) => {
    const fromOrigin = piece.center.clone().sub(origin);
    const lead = (fromOrigin.dot(direction) - minAlong) / span;
    const sideways = fromOrigin.clone().addScaledVector(direction, -fromOrigin.dot(direction));
    const jitter = randomUnitVector(piece.id, options.seed + 23).multiplyScalar(
      options.spread * 0.025,
    );

    return direction
      .clone()
      .multiplyScalar(options.spread * (FLIGHT_PUSH + FLIGHT_STRETCH * lead))
      .addScaledVector(sideways, FLIGHT_SPREAD)
      .add(jitter);
  });
  const releaseAt = planReleaseOrder(cells, offsets);

  const chunks = pieces.map((piece, index): ThinkerChunkData => {
    const offset = offsets[index];
    const extent = piece.box.getSize(new THREE.Vector3());
    const radius = extent.length() * 0.5;
    const spinLimit = THREE.MathUtils.clamp(0.11 / Math.max(radius, 0.05), 0.05, 0.3);
    const surface = makeFlatArrays(
      piece.polygons.filter((polygon) => polygon.kind === "surface"),
      piece.center,
    );
    const interior = makeFlatArrays(
      piece.polygons.filter((polygon) => polygon.kind === "cap"),
      piece.center,
    );

    driftCenter.add(offset);

    return {
      center: [piece.center.x, piece.center.y, piece.center.z],
      debug: { capStats: piece.capStats, sourceIndex: piece.id },
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
        signedHash(piece.id, options.seed + 71) * spinLimit,
        signedHash(piece.id, options.seed + 73) * spinLimit,
        signedHash(piece.id, options.seed + 79) * spinLimit * 0.7,
      ],
      surfaceNormals: surface.normals,
      surfacePositions: surface.positions,
      travel: Math.min(TRAVEL_WINDOW, 1 - releaseAt[index]),
    };
  });

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
