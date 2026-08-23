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

type CapBuildStats = {
  danglingVertices: number;
  fallbackLoops: number;
  loopCount: number;
  planeKey: string;
  repairedGaps: number;
  rejectedLoops: number;
  segmentCount: number;
  tracedLoopCount: number;
};

export type SolidThinkerChunk = {
  center: THREE.Vector3;
  debug?: {
    capStats: CapBuildStats[];
    sourceIndex: number;
  };
  interiorGeometry: THREE.BufferGeometry;
  offset: THREE.Vector3;
  releaseAt: number;
  scale: number;
  spin: THREE.Vector3;
  surfaceGeometry: THREE.BufferGeometry;
};

type BuildSolidChunkOptions = {
  chunkCount: number;
  seed: number;
  spread: number;
};

type FragmentVertex = {
  normal: THREE.Vector3;
  point: THREE.Vector3;
  uv: THREE.Vector2;
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
  id: number;
  polygons: FragmentPolygon[];
  totalArea: number;
};

type SplitPlane = {
  constant: number;
  key: string;
  normal: THREE.Vector3;
};

type CapGraphPoint = {
  key: string;
  point: THREE.Vector3;
  uv: THREE.Vector2;
};

type CapLoop = {
  area: number;
  edgeChains: THREE.Vector3[][];
  points: THREE.Vector3[];
  uv: THREE.Vector2[];
};

type SplitStats = {
  capFailures: {
    maxDanglingVertices: number;
    maxSegments: number;
    withDanglingVertices: number;
    withNoSegments: number;
    withRejectedLoops: number;
  };
  rejectionReasons: {
    degenerateChild: number;
    missingCapLoop: number;
    missingSurfaceOrCap: number;
    sizeImbalance: number;
  };
  rejectedSplits: number;
  retryCount: number;
  sourceOpenEdges: number;
  successfulSplits: number;
  targetCount: number;
};

type ChunkBoundaryAudit = {
  capOnlyOpenEdges: number;
  chunkCount: number;
  fractureStats: SplitStats;
  maxOpenEdges: number;
  missingCapChunks: number;
  openChunks: number;
  surfaceOnlyOpenEdges: number;
  totalOpenEdges: number;
  weldedOpenEdges: number;
  worstChunks: Array<{
    capStats: CapBuildStats[];
    chunkIndex: number;
    openEdges: number;
    sourceIndex?: number;
  }>;
};

const CLIP_EPSILON = 0.00001;
const CAP_KEY_SCALE = 30000;
const MIN_CAP_SEGMENT_LENGTH_SQ = 0.0000000001;
const MIN_CAP_LOOP_AREA = 0.000002;
const MAX_CAP_REPAIR_DISTANCE_SQ = 0.000004;

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

function normalizeGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();

  if (!geometry.boundingBox) {
    return geometry;
  }

  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const scale = 3.1 / Math.max(size.x, size.y, size.z);

  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.normalizeNormals();

  return geometry;
}

export async function loadThinkerGeometry(modelPath = "/model/thinker/scene.gltf") {
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

  return normalizeGeometry(geometry);
}

function hash01(index: number, seed: number) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453123;

  return value - Math.floor(value);
}

function signedHash(index: number, seed: number) {
  return hash01(index, seed) * 2 - 1;
}

function pointKey(point: THREE.Vector3, scale = CAP_KEY_SCALE) {
  return [
    Math.round(point.x * scale),
    Math.round(point.y * scale),
    Math.round(point.z * scale),
  ].join(",");
}

function readPosition(attribute: THREE.BufferAttribute, index: number) {
  return new THREE.Vector3(
    attribute.getX(index),
    attribute.getY(index),
    attribute.getZ(index),
  );
}

function readNormal(
  attribute: THREE.BufferAttribute | undefined,
  index: number,
  fallback: THREE.Vector3,
) {
  if (!attribute) {
    return fallback.clone();
  }

  const normal = new THREE.Vector3(
    attribute.getX(index),
    attribute.getY(index),
    attribute.getZ(index),
  );

  return normal.lengthSq() > 0.000001 ? normal.normalize() : fallback.clone();
}

function readUv(attribute: THREE.BufferAttribute | undefined, index: number) {
  if (!attribute) {
    return new THREE.Vector2();
  }

  return new THREE.Vector2(attribute.getX(index), attribute.getY(index));
}

function getTriangleNormal(points: THREE.Vector3[]) {
  const normal = new THREE.Vector3()
    .subVectors(points[1], points[0])
    .cross(new THREE.Vector3().subVectors(points[2], points[0]));

  return normal.lengthSq() > 0.000001 ? normal.normalize() : new THREE.Vector3(0, 1, 0);
}

function interpolateVertex(
  a: FragmentVertex,
  b: FragmentVertex,
  t: number,
  plane?: SplitPlane,
): FragmentVertex {
  const point = a.point.clone().lerp(b.point, t);

  if (plane) {
    point.copy(snapToPlane(point, plane));
  }

  return {
    normal: a.normal.clone().lerp(b.normal, t).normalize(),
    point,
    uv: a.uv.clone().lerp(b.uv, t),
  };
}

function makeSourcePiece(sourceGeometry: THREE.BufferGeometry): FragmentPiece {
  const geometry = sourceGeometry.index
    ? sourceGeometry.toNonIndexed()
    : sourceGeometry.clone();

  if (!geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }

  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const normal = geometry.getAttribute("normal") as
    | THREE.BufferAttribute
    | undefined;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
  const polygons: FragmentPolygon[] = [];
  const triangleCount = Math.floor(position.count / 3);

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const start = triangle * 3;
    const points = [
      readPosition(position, start),
      readPosition(position, start + 1),
      readPosition(position, start + 2),
    ];
    const fallbackNormal = getTriangleNormal(points);

    polygons.push({
      kind: "surface",
      vertices: points.map((point, corner) => ({
        normal: readNormal(normal, start + corner, fallbackNormal),
        point,
        uv: readUv(uv, start + corner),
      })),
    });
  }

  geometry.dispose();

  return makePiece({
    capStats: [],
    depth: 0,
    id: 0,
    polygons,
  });
}

function polygonArea(vertices: FragmentVertex[]) {
  if (vertices.length < 3) {
    return 0;
  }

  let area = 0;
  const origin = vertices[0].point;

  for (let index = 1; index < vertices.length - 1; index++) {
    area += new THREE.Vector3()
      .subVectors(vertices[index].point, origin)
      .cross(new THREE.Vector3().subVectors(vertices[index + 1].point, origin))
      .length() * 0.5;
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

  polygons.forEach((polygon) => {
    totalArea += polygonArea(polygon.vertices);
    polygon.vertices.forEach((vertex) => box.expandByPoint(vertex.point));
  });

  const center = box.isEmpty()
    ? new THREE.Vector3()
    : box.getCenter(new THREE.Vector3());

  return {
    box,
    capStats,
    center,
    depth,
    id,
    polygons,
    totalArea,
  };
}

function splitConnectedComponents(piece: FragmentPiece) {
  if (piece.polygons.length <= 1) {
    return [piece];
  }

  const polygonsByPoint = new Map<string, number[]>();

  piece.polygons.forEach((polygon, polygonIndex) => {
    const keys = new Set(
      polygon.vertices.map((vertex) => pointKey(vertex.point, CAP_KEY_SCALE)),
    );

    keys.forEach((key) => {
      polygonsByPoint.set(key, [
        ...(polygonsByPoint.get(key) ?? []),
        polygonIndex,
      ]);
    });
  });

  const visited = new Set<number>();
  const components: FragmentPolygon[][] = [];

  piece.polygons.forEach((_, startIndex) => {
    if (visited.has(startIndex)) {
      return;
    }

    const component: FragmentPolygon[] = [];
    const queue = [startIndex];

    visited.add(startIndex);

    while (queue.length > 0) {
      const polygonIndex = queue.pop() as number;
      const polygon = piece.polygons[polygonIndex];

      component.push(polygon);

      polygon.vertices.forEach((vertex) => {
        const key = pointKey(vertex.point, CAP_KEY_SCALE);

        polygonsByPoint.get(key)?.forEach((neighborIndex) => {
          if (!visited.has(neighborIndex)) {
            visited.add(neighborIndex);
            queue.push(neighborIndex);
          }
        });
      });
    }

    components.push(component);
  });

  return components.map((polygons, componentIndex) =>
    makePiece({
      capStats: piece.capStats,
      depth: piece.depth,
      id: piece.id * 1000 + componentIndex,
      polygons,
    }),
  );
}

function getPlaneBasis(normal: THREE.Vector3) {
  const reference =
    Math.abs(normal.y) < 0.92
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(reference, normal).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();

  return { u, v };
}

function signedLoopArea(points: THREE.Vector2[]) {
  let area = 0;

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];

    area += point.x * next.y - next.x * point.y;
  });

  return area * 0.5;
}

function cleanLoop(points: THREE.Vector3[], plane: SplitPlane) {
  const { u, v } = getPlaneBasis(plane.normal);
  let loop = points.filter(
    (point, index) =>
      index === 0 ||
      point.distanceToSquared(points[index - 1]) > MIN_CAP_SEGMENT_LENGTH_SQ,
  );

  if (
    loop.length > 1 &&
    loop[0].distanceToSquared(loop[loop.length - 1]) <=
      MIN_CAP_SEGMENT_LENGTH_SQ
  ) {
    loop = loop.slice(0, -1);
  }

  const loopUv = loop.map((point) => new THREE.Vector2(point.dot(u), point.dot(v)));

  if (signedLoopArea(loopUv) < 0) {
    loop.reverse();
  }

  const orientedUv = loop.map(
    (point) => new THREE.Vector2(point.dot(u), point.dot(v)),
  );
  let cornerIndices = loop
    .map((_, index) => index)
    .filter((index) => {
      const previous = orientedUv[(index - 1 + orientedUv.length) % orientedUv.length];
      const point = orientedUv[index];
      const next = orientedUv[(index + 1) % orientedUv.length];
      const before = point.clone().sub(previous);
      const after = next.clone().sub(point);

      if (before.lengthSq() <= 0.0000000001 || after.lengthSq() <= 0.0000000001) {
        return false;
      }

      before.normalize();
      after.normalize();

      return !(
        Math.abs(before.x * after.y - before.y * after.x) < 0.00001 &&
        before.dot(after) > 0.999
      );
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
    uv: cleaned.map((point) => new THREE.Vector2(point.dot(u), point.dot(v))),
  };
}

function snapToPlane(point: THREE.Vector3, plane: SplitPlane) {
  const snapped = new THREE.Vector3(
    Math.round(point.x * CAP_KEY_SCALE) / CAP_KEY_SCALE,
    Math.round(point.y * CAP_KEY_SCALE) / CAP_KEY_SCALE,
    Math.round(point.z * CAP_KEY_SCALE) / CAP_KEY_SCALE,
  );

  snapped.addScaledVector(plane.normal, plane.constant - plane.normal.dot(snapped));

  return snapped;
}

function getPolygonCutSegment(polygon: FragmentPolygon, plane: SplitPlane) {
  const intersections: THREE.Vector3[] = [];

  const pushIntersection = (point: THREE.Vector3) => {
    const snapped = snapToPlane(point, plane);

    if (
      intersections.every(
        (existing) => existing.distanceToSquared(snapped) > MIN_CAP_SEGMENT_LENGTH_SQ,
      )
    ) {
      intersections.push(snapped);
    }
  };

  polygon.vertices.forEach((current, index) => {
    const next = polygon.vertices[(index + 1) % polygon.vertices.length];
    const currentDistance = plane.normal.dot(current.point) - plane.constant;
    const nextDistance = plane.normal.dot(next.point) - plane.constant;

    if (Math.abs(currentDistance) <= CLIP_EPSILON) {
      pushIntersection(current.point);
    }

    if (currentDistance * nextDistance < -CLIP_EPSILON * CLIP_EPSILON) {
      const denominator = currentDistance - nextDistance;
      const t =
        Math.abs(denominator) > 0.0000001
          ? THREE.MathUtils.clamp(currentDistance / denominator, 0, 1)
          : 0;

      pushIntersection(interpolateVertex(current, next, t, plane).point);
    }
  });

  if (
    intersections.length === 2 &&
    intersections[0].distanceToSquared(intersections[1]) > MIN_CAP_SEGMENT_LENGTH_SQ
  ) {
    return [intersections[0], intersections[1]] as const;
  }

  return null;
}

function clipPolygonSide(
  polygon: FragmentPolygon,
  plane: SplitPlane,
  keepSign: -1 | 1,
): FragmentPolygon | null {
  const vertices = polygon.vertices;
  const clipped: FragmentVertex[] = [];
  const isInside = (distance: number) =>
    keepSign < 0 ? distance <= CLIP_EPSILON : distance >= -CLIP_EPSILON;

  vertices.forEach((current, index) => {
    const next = vertices[(index + 1) % vertices.length];
    const currentDistance = plane.normal.dot(current.point) - plane.constant;
    const nextDistance = plane.normal.dot(next.point) - plane.constant;
    const currentInside = isInside(currentDistance);
    const nextInside = isInside(nextDistance);

    if (currentInside && nextInside) {
      clipped.push(next);
      return;
    }

    if (currentInside !== nextInside) {
      const denominator = currentDistance - nextDistance;
      const t =
        Math.abs(denominator) > 0.0000001
          ? THREE.MathUtils.clamp(currentDistance / denominator, 0, 1)
          : 0;
      const intersection = interpolateVertex(current, next, t, plane);

      clipped.push(intersection);

      if (!currentInside && nextInside) {
        clipped.push(next);
      }
    }
  });

  if (clipped.length < 3 || polygonArea(clipped) < 0.0000001) {
    return null;
  }

  return {
    kind: polygon.kind,
    vertices: clipped,
  };
}

function traceCapLoops(
  segments: Array<readonly [THREE.Vector3, THREE.Vector3]>,
  plane: SplitPlane,
) {
  const { u, v } = getPlaneBasis(plane.normal);
  const points = new Map<string, CapGraphPoint>();
  const edges: Array<{ aKey: string; bKey: string }> = [];
  const edgeKeys = new Set<string>();
  const adjacency = new Map<string, number[]>();

  const getPoint = (point: THREE.Vector3) => {
    const snapped = snapToPlane(point, plane);
    const key = pointKey(snapped);
    const existing = points.get(key);

    if (existing) {
      return existing;
    }

    const graphPoint = {
      key,
      point: snapped,
      uv: new THREE.Vector2(snapped.dot(u), snapped.dot(v)),
    };

    points.set(key, graphPoint);

    return graphPoint;
  };

  const addEdge = (a: THREE.Vector3, b: THREE.Vector3) => {
    const from = getPoint(a);
    const to = getPoint(b);

    if (
      from.key === to.key ||
      from.point.distanceToSquared(to.point) <= MIN_CAP_SEGMENT_LENGTH_SQ
    ) {
      return false;
    }

    const edgeKey = from.key < to.key ? `${from.key}|${to.key}` : `${to.key}|${from.key}`;

    if (edgeKeys.has(edgeKey)) {
      return false;
    }

    const edgeIndex = edges.length;

    edgeKeys.add(edgeKey);
    edges.push({ aKey: from.key, bKey: to.key });
    adjacency.set(from.key, [...(adjacency.get(from.key) ?? []), edgeIndex]);
    adjacency.set(to.key, [...(adjacency.get(to.key) ?? []), edgeIndex]);
    return true;
  };

  segments.forEach(([a, b]) => {
    addEdge(a, b);
  });

  let repairedGaps = 0;
  let oddKeys = Array.from(adjacency.entries())
    .filter(([, edgeIndices]) => edgeIndices.length % 2 === 1)
    .map(([key]) => key);

  while (oddKeys.length >= 2) {
    let bestPair: [number, number] | null = null;
    let bestDistance = Infinity;

    for (let fromIndex = 0; fromIndex < oddKeys.length - 1; fromIndex++) {
      const from = points.get(oddKeys[fromIndex]);

      if (!from) {
        continue;
      }

      for (let toIndex = fromIndex + 1; toIndex < oddKeys.length; toIndex++) {
        const to = points.get(oddKeys[toIndex]);

        if (!to) {
          continue;
        }

        const distance = from.point.distanceToSquared(to.point);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestPair = [fromIndex, toIndex];
        }
      }
    }

    if (!bestPair || bestDistance > MAX_CAP_REPAIR_DISTANCE_SQ) {
      break;
    }

    const from = points.get(oddKeys[bestPair[0]]);
    const to = points.get(oddKeys[bestPair[1]]);

    if (!from || !to || !addEdge(from.point, to.point)) {
      break;
    }

    repairedGaps += 1;
    oddKeys = oddKeys.filter(
      (_, index) => index !== bestPair?.[0] && index !== bestPair?.[1],
    );
  }

  const danglingVertices = Array.from(adjacency.values()).filter(
    (edgeIndices) => edgeIndices.length % 2 === 1,
  ).length;

  if (danglingVertices > 0 || edges.length < 3) {
    return {
      loops: [] as CapLoop[],
      stats: {
        danglingVertices,
        fallbackLoops: 0,
        loopCount: 0,
        planeKey: plane.key,
        repairedGaps,
        rejectedLoops: danglingVertices,
        segmentCount: edges.length,
        tracedLoopCount: 0,
      } satisfies CapBuildStats,
    };
  }

  const visited = new Set<number>();
  const loops: CapLoop[] = [];
  let rejectedLoops = 0;
  const pairings = new Map<string, number>();

  adjacency.forEach((edgeIndices, key) => {
    const remaining = [...edgeIndices];
    const point = points.get(key);

    while (point && remaining.length >= 2) {
      const edgeIndex = remaining.shift() as number;
      const edge = edges[edgeIndex];
      const otherKey = edge.aKey === key ? edge.bKey : edge.aKey;
      const other = points.get(otherKey);

      if (!other) {
        continue;
      }

      const incomingDirection = other.uv.clone().sub(point.uv).normalize();
      let bestCandidateIndex = 0;
      let bestDot = Infinity;

      remaining.forEach((candidateEdgeIndex, candidateIndex) => {
        const candidateEdge = edges[candidateEdgeIndex];
        const candidateOtherKey =
          candidateEdge.aKey === key ? candidateEdge.bKey : candidateEdge.aKey;
        const candidateOther = points.get(candidateOtherKey);

        if (!candidateOther) {
          return;
        }

        const candidateDirection = candidateOther.uv.clone().sub(point.uv).normalize();
        const dot = incomingDirection.dot(candidateDirection);

        if (dot < bestDot) {
          bestDot = dot;
          bestCandidateIndex = candidateIndex;
        }
      });

      const pairedEdgeIndex = remaining.splice(bestCandidateIndex, 1)[0];

      pairings.set(`${key}|${edgeIndex}`, pairedEdgeIndex);
      pairings.set(`${key}|${pairedEdgeIndex}`, edgeIndex);
    }
  });

  edges.forEach((edge, edgeIndex) => {
    if (visited.has(edgeIndex)) {
      return;
    }

    const loopPoints: THREE.Vector3[] = [];
    let currentKey = edge.aKey;
    let nextKey = edge.bKey;
    let currentEdgeIndex = edgeIndex;

    for (let guard = 0; guard <= edges.length + 1; guard++) {
      const point = points.get(currentKey);

      if (!point || visited.has(currentEdgeIndex)) {
        break;
      }

      loopPoints.push(point.point);
      visited.add(currentEdgeIndex);

      if (nextKey === edge.aKey) {
        const cleaned = cleanLoop(loopPoints, plane);
        const area = signedLoopArea(cleaned.uv);

        if (cleaned.points.length >= 3 && Math.abs(area) >= MIN_CAP_LOOP_AREA) {
          loops.push({
            area: Math.abs(area),
            edgeChains: cleaned.edgeChains,
            points: cleaned.points,
            uv: cleaned.uv,
          });
        } else {
          rejectedLoops += 1;
        }

        return;
      }

      const nextEdgeIndex = pairings.get(`${nextKey}|${currentEdgeIndex}`);

      if (nextEdgeIndex === undefined || visited.has(nextEdgeIndex)) {
        break;
      }

      const nextEdge = edges[nextEdgeIndex];

      currentKey = nextKey;
      nextKey =
        nextEdge.aKey === currentKey ? nextEdge.bKey : nextEdge.aKey;
      currentEdgeIndex = nextEdgeIndex;
    }

    rejectedLoops += 1;
  });

  return {
    loops,
    stats: {
      danglingVertices,
      fallbackLoops: 0,
      loopCount: loops.length,
      planeKey: plane.key,
      repairedGaps,
      rejectedLoops,
      segmentCount: edges.length,
      tracedLoopCount: loops.length,
    } satisfies CapBuildStats,
  };
}

function makeCapPolygons(
  loops: CapLoop[],
  plane: SplitPlane,
  normal: THREE.Vector3,
) {
  const polygons: FragmentPolygon[] = [];

  const pushCapTriangle = (points: THREE.Vector3[], normal: THREE.Vector3) => {
    const triangleNormal = new THREE.Vector3()
      .subVectors(points[1], points[0])
      .cross(new THREE.Vector3().subVectors(points[2], points[0]));

    if (triangleNormal.lengthSq() <= 0.000000001) {
      return;
    }

    if (triangleNormal.dot(normal) < 0) {
      [points[1], points[2]] = [points[2], points[1]];
    }

    polygons.push({
      kind: "cap",
      vertices: points.map((point) => ({
        normal: normal.clone(),
        point: point.clone(),
        uv: new THREE.Vector2(),
      })),
    });
  };

  loops.forEach((loop) => {
    const triangles = THREE.ShapeUtils.triangulateShape(loop.uv, []);

    triangles.forEach(([aIndex, bIndex, cIndex]) => {
      const indices = [aIndex, bIndex, cIndex];
      const edgeChains = indices.map((fromIndex, edgeIndex) => {
        const toIndex = indices[(edgeIndex + 1) % 3];

        if ((fromIndex + 1) % loop.points.length === toIndex) {
          return loop.edgeChains[fromIndex];
        }

        if ((toIndex + 1) % loop.points.length === fromIndex) {
          return [...loop.edgeChains[toIndex]].reverse();
        }

        return [loop.points[fromIndex], loop.points[toIndex]];
      });
      const enrichedEdges = edgeChains
        .map((chain, edgeIndex) => ({ chain, edgeIndex }))
        .filter(({ chain }) => chain.length > 2);

      if (enrichedEdges.length === 0) {
        pushCapTriangle(indices.map((index) => loop.points[index]), normal);
        return;
      }

      if (enrichedEdges.length === 1) {
        const { chain, edgeIndex } = enrichedEdges[0];
        const opposite = loop.points[indices[(edgeIndex + 2) % 3]];

        for (let index = 0; index < chain.length - 1; index++) {
          pushCapTriangle([chain[index], chain[index + 1], opposite], normal);
        }

        return;
      }

      const boundary: THREE.Vector3[] = [];

      edgeChains.forEach((chain, edgeIndex) => {
        boundary.push(...(edgeIndex === 0 ? chain : chain.slice(1)));
      });

      if (
        boundary.length > 1 &&
        boundary[0].distanceToSquared(boundary[boundary.length - 1]) <=
          MIN_CAP_SEGMENT_LENGTH_SQ
      ) {
        boundary.pop();
      }

      const center = indices
        .map((index) => loop.points[index])
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .multiplyScalar(1 / 3);

      boundary.forEach((point, index) => {
        pushCapTriangle(
          [point, boundary[(index + 1) % boundary.length], center],
          normal,
        );
      });
    });
  });

  return polygons;
}

function splitPiece(
  piece: FragmentPiece,
  plane: SplitPlane,
  nextId: number,
) {
  const negative: FragmentPolygon[] = [];
  const positive: FragmentPolygon[] = [];
  const segments: Array<readonly [THREE.Vector3, THREE.Vector3]> = [];

  piece.polygons.forEach((polygon) => {
    const cutSegment = getPolygonCutSegment(polygon, plane);

    if (cutSegment) {
      segments.push(cutSegment);
    }

    const negativePolygon = clipPolygonSide(polygon, plane, -1);
    const positivePolygon = clipPolygonSide(polygon, plane, 1);

    if (negativePolygon) {
      negative.push(negativePolygon);
    }

    if (positivePolygon) {
      positive.push(positivePolygon);
    }
  });

  const capResult = traceCapLoops(segments, plane);

  if (capResult.loops.length === 0) {
    return {
      capStats: capResult.stats,
      children: null,
    };
  }

  negative.push(...makeCapPolygons(capResult.loops, plane, plane.normal));
  positive.push(
    ...makeCapPolygons(capResult.loops, plane, plane.normal.clone().negate()),
  );

  const nextCapStats = piece.capStats.concat(capResult.stats);
  const negativePiece = makePiece({
    capStats: nextCapStats,
    depth: piece.depth + 1,
    id: nextId,
    polygons: negative,
  });
  const positivePiece = makePiece({
    capStats: nextCapStats,
    depth: piece.depth + 1,
    id: nextId + 1,
    polygons: positive,
  });

  return {
    capStats: capResult.stats,
    children: [negativePiece, positivePiece] as const,
  };
}

function randomUnitVector(seed: number, salt: number) {
  const z = signedHash(seed, salt);
  const angle = hash01(seed, salt + 3) * Math.PI * 2;
  const radius = Math.sqrt(Math.max(1 - z * z, 0));

  return new THREE.Vector3(
    Math.cos(angle) * radius,
    z,
    Math.sin(angle) * radius,
  );
}

function getPieceProjection(piece: FragmentPiece, normal: THREE.Vector3) {
  let min = Infinity;
  let max = -Infinity;

  piece.polygons.forEach((polygon) => {
    polygon.vertices.forEach((vertex) => {
      const projection = vertex.point.dot(normal);

      min = Math.min(min, projection);
      max = Math.max(max, projection);
    });
  });

  return { max, min };
}

function findIntersectingCutConstant(
  piece: FragmentPiece,
  normal: THREE.Vector3,
  preferred: number,
) {
  let chosen = preferred;
  let chosenDistance = Infinity;

  piece.polygons.forEach((polygon) => {
    const projections = polygon.vertices.map((vertex) => vertex.point.dot(normal));
    const min = Math.min(...projections);
    const max = Math.max(...projections);
    const span = max - min;

    if (span <= CLIP_EPSILON * 8) {
      return;
    }

    const margin = Math.min(span * 0.16, Math.max(span - CLIP_EPSILON * 4, 0) * 0.48);
    const candidate = THREE.MathUtils.clamp(preferred, min + margin, max - margin);
    const surfacePenalty = polygon.kind === "surface" ? 0 : span * 0.08;
    const distance = Math.abs(candidate - preferred) + surfacePenalty;

    if (distance < chosenDistance) {
      chosen = candidate;
      chosenDistance = distance;
    }
  });

  return chosenDistance < Infinity ? chosen : null;
}

function normalizedPoint(point: THREE.Vector3, box: THREE.Box3, size: THREE.Vector3) {
  return new THREE.Vector3(
    THREE.MathUtils.clamp((point.x - box.min.x) / Math.max(size.x, 0.001), 0, 1),
    THREE.MathUtils.clamp((point.y - box.min.y) / Math.max(size.y, 0.001), 0, 1),
    THREE.MathUtils.clamp((point.z - box.min.z) / Math.max(size.z, 0.001), 0, 1),
  );
}

function getDetailBias(piece: FragmentPiece, modelBox: THREE.Box3, size: THREE.Vector3) {
  const normalized = normalizedPoint(piece.center, modelBox, size);
  const handBand =
    normalized.y > 0.28 &&
    normalized.y < 0.56 &&
    normalized.x < 0.3 &&
    normalized.z > 0.68
      ? 2.35
      : 0;
  const forearmBand =
    normalized.y > 0.32 &&
    normalized.y < 0.7 &&
    normalized.x < 0.4 &&
    normalized.z > 0.54
      ? 1.55
      : 0;
  const headBand = normalized.y > 0.72 ? 1.1 : 0;
  const extremityBand =
    Math.abs(normalized.x - 0.5) > 0.25 && normalized.y > 0.2 ? 0.65 : 0;

  return 1 + handBand + forearmBand + headBand + extremityBand;
}

function choosePieceIndex({
  anchor,
  locked,
  modelBox,
  pieces,
  seed,
  size,
  step,
}: {
  anchor: THREE.Vector3;
  locked: Set<number>;
  modelBox: THREE.Box3;
  pieces: FragmentPiece[];
  seed: number;
  size: THREE.Vector3;
  step: number;
}) {
  let chosenIndex = -1;
  let chosenScore = -Infinity;
  const modelExtent = Math.max(size.length(), 0.001);

  pieces.forEach((piece, index) => {
    if (locked.has(piece.id) || piece.polygons.length < 18) {
      return;
    }

    const handDistance = THREE.MathUtils.clamp(
      piece.center.distanceTo(anchor) / (modelExtent * 0.55),
      0,
      1,
    );
    const detailBias = getDetailBias(piece, modelBox, size);
    const random = 0.88 + hash01(piece.id + step * 17, seed + 401) * 0.24;
    const score =
      piece.totalArea *
      detailBias *
      random *
      (1.18 - handDistance * 0.22) /
      (1 + piece.depth * 0.08);

    if (score > chosenScore) {
      chosenIndex = index;
      chosenScore = score;
    }
  });

  return chosenIndex;
}

function makeSplitPlane({
  anchor,
  attempt,
  piece,
  seed,
  step,
}: {
  anchor: THREE.Vector3;
  attempt: number;
  piece: FragmentPiece;
  seed: number;
  step: number;
}): SplitPlane | null {
  const fromAnchor = piece.center.clone().sub(anchor);

  if (fromAnchor.lengthSq() <= 0.000001) {
    fromAnchor.set(0.7, 0.25, 0.35);
  }

  fromAnchor.normalize();

  const crackFamilies = [
    new THREE.Vector3(0.82, 0.24, 0.32),
    new THREE.Vector3(-0.28, 0.78, 0.42),
    new THREE.Vector3(0.24, -0.38, 0.89),
    new THREE.Vector3(0.66, -0.12, -0.64),
  ];
  const family =
    crackFamilies[(piece.depth + attempt + Math.floor(hash01(step, seed) * 4)) % crackFamilies.length];
  const random = randomUnitVector(piece.id + step * 31 + attempt * 7, seed + 503);
  const normal = family
    .clone()
    .multiplyScalar(0.55)
    .add(fromAnchor.clone().multiplyScalar(0.28))
    .add(random.multiplyScalar(0.5))
    .normalize();
  const projection = getPieceProjection(piece, normal);
  const extent = projection.max - projection.min;

  if (extent < 0.035) {
    return null;
  }

  const centerBias = 0.5 + signedHash(piece.id + step * 13, seed + attempt * 19) * 0.17;
  const attemptNudge = signedHash(attempt + piece.depth * 11, seed + step) * 0.08;
  const t = THREE.MathUtils.clamp(centerBias + attemptNudge, 0.28, 0.72);
  const preferredConstant = THREE.MathUtils.lerp(projection.min, projection.max, t);
  const constant = findIntersectingCutConstant(piece, normal, preferredConstant);

  if (constant === null) {
    return null;
  }

  return {
    constant,
    key: `split:${piece.id}:${step}:${attempt}`,
    normal,
  };
}

function hasSurfaceAndCap(piece: FragmentPiece) {
  let surfaceArea = 0;
  let capArea = 0;

  piece.polygons.forEach((polygon) => {
    if (polygon.kind === "surface") {
      surfaceArea += polygonArea(polygon.vertices);
    } else {
      capArea += polygonArea(polygon.vertices);
    }
  });

  return {
    capArea,
    hasBoth: surfaceArea > 0.00001 && capArea > 0.00001,
    surfaceArea,
  };
}

function getSplitRejectionReason(
  parent: FragmentPiece,
  a: FragmentPiece,
  b: FragmentPiece,
  targetCount: number,
) {
  const aParts = hasSurfaceAndCap(a);
  const bParts = hasSurfaceAndCap(b);

  if (!aParts.hasBoth || !bParts.hasBoth) {
    return "missingSurfaceOrCap" as const;
  }

  if (a.polygons.length < 12 || b.polygons.length < 12) {
    return "degenerateChild" as const;
  }

  const smallerArea = Math.min(a.totalArea, b.totalArea);
  const largerArea = Math.max(a.totalArea, b.totalArea);
  const ratio = smallerArea / Math.max(largerArea, 0.000001);
  const minimumArea = parent.totalArea / Math.max(targetCount * 5.5, 1);

  if (ratio <= 0.045 || smallerArea <= minimumArea) {
    return "sizeImbalance" as const;
  }

  return null;
}

function fractureIntoPieces(
  sourceGeometry: THREE.BufferGeometry,
  options: BuildSolidChunkOptions,
) {
  const sourcePiece = makeSourcePiece(sourceGeometry);
  const modelBox = sourcePiece.box.clone();
  const size = modelBox.getSize(new THREE.Vector3());
  const targetCount = THREE.MathUtils.clamp(Math.floor(options.chunkCount), 24, 46);
  const anchor = new THREE.Vector3(
    modelBox.min.x + size.x * 0.06,
    modelBox.min.y + size.y * 0.426,
    modelBox.min.z + size.z * 0.84,
  );
  const pieces = [sourcePiece];
  const locked = new Set<number>();
  const stats: SplitStats = {
    capFailures: {
      maxDanglingVertices: 0,
      maxSegments: 0,
      withDanglingVertices: 0,
      withNoSegments: 0,
      withRejectedLoops: 0,
    },
    rejectionReasons: {
      degenerateChild: 0,
      missingCapLoop: 0,
      missingSurfaceOrCap: 0,
      sizeImbalance: 0,
    },
    rejectedSplits: 0,
    retryCount: 0,
    sourceOpenEdges: countOpenGeometryEdges(sourceGeometry),
    successfulSplits: 0,
    targetCount,
  };
  let nextId = 1;

  for (let step = 0; pieces.length < targetCount && step < targetCount * 36; step++) {
    const pieceIndex = choosePieceIndex({
      anchor,
      locked,
      modelBox,
      pieces,
      seed: options.seed,
      size,
      step,
    });

    if (pieceIndex < 0) {
      break;
    }

    const piece = pieces[pieceIndex];
    let accepted: [FragmentPiece, FragmentPiece, CapBuildStats] | null = null;

    for (let attempt = 0; attempt < 18; attempt++) {
      const plane = makeSplitPlane({
        anchor,
        attempt,
        piece,
        seed: options.seed,
        step,
      });

      if (!plane) {
        stats.retryCount += 1;
        continue;
      }

      const split = splitPiece(piece, plane, nextId);
      const result = split.children;
      const rejectionReason = result
        ? getSplitRejectionReason(piece, result[0], result[1], targetCount)
        : "missingCapLoop";

      if (result && !rejectionReason) {
        accepted = [result[0], result[1], split.capStats];
        break;
      }

      if (rejectionReason) {
        stats.rejectionReasons[rejectionReason] += 1;
      }

      if (!result) {
        stats.capFailures.maxDanglingVertices = Math.max(
          stats.capFailures.maxDanglingVertices,
          split.capStats.danglingVertices,
        );
        stats.capFailures.maxSegments = Math.max(
          stats.capFailures.maxSegments,
          split.capStats.segmentCount,
        );
        stats.capFailures.withDanglingVertices += Number(
          split.capStats.danglingVertices > 0,
        );
        stats.capFailures.withNoSegments += Number(split.capStats.segmentCount === 0);
        stats.capFailures.withRejectedLoops += Number(split.capStats.rejectedLoops > 0);
      }
      stats.retryCount += 1;
    }

    if (!accepted) {
      locked.add(piece.id);
      stats.rejectedSplits += 1;
      continue;
    }

    pieces.splice(pieceIndex, 1, accepted[0], accepted[1]);
    nextId += 2;
    stats.successfulSplits += 1;
  }

  const connectedPieces = pieces.flatMap(splitConnectedComponents);

  return {
    anchor,
    modelBox,
    pieces: connectedPieces,
    size,
    stats,
  };
}

function pushGeometryVertex({
  center,
  normal,
  normals,
  point,
  positions,
  uv,
  uvs,
}: {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  normals: number[];
  point: THREE.Vector3;
  positions: number[];
  uv: THREE.Vector2;
  uvs: number[];
}) {
  positions.push(point.x - center.x, point.y - center.y, point.z - center.z);
  normals.push(normal.x, normal.y, normal.z);
  uvs.push(uv.x, uv.y);
}

function pushPolygonTriangles({
  center,
  normals,
  polygon,
  positions,
  uvs,
}: {
  center: THREE.Vector3;
  normals: number[];
  polygon: FragmentPolygon;
  positions: number[];
  uvs: number[];
}) {
  if (polygon.vertices.length < 3) {
    return;
  }

  for (let index = 1; index < polygon.vertices.length - 1; index++) {
    [polygon.vertices[0], polygon.vertices[index], polygon.vertices[index + 1]].forEach(
      (vertex) =>
        pushGeometryVertex({
          center,
          normal: vertex.normal,
          normals,
          point: vertex.point,
          positions,
          uv: vertex.uv,
          uvs,
        }),
    );
  }
}

function makeBufferGeometry(polygons: FragmentPolygon[], center: THREE.Vector3) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();

  polygons.forEach((polygon) =>
    pushPolygonTriangles({
      center,
      normals,
      polygon,
      positions,
      uvs,
    }),
  );

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function addGeometryEdges(
  edgeCounts: Map<string, number>,
  geometry: THREE.BufferGeometry,
  keyScale = CAP_KEY_SCALE,
) {
  const position = geometry.getAttribute("position") as
    | THREE.BufferAttribute
    | undefined;

  if (!position) {
    return;
  }

  for (let index = 0; index < position.count; index += 3) {
    const points = [0, 1, 2].map(
      (offset) =>
        new THREE.Vector3(
          position.getX(index + offset),
          position.getY(index + offset),
          position.getZ(index + offset),
        ),
    );

    [
      [0, 1],
      [1, 2],
      [2, 0],
    ].forEach(([from, to]) => {
      const fromKey = pointKey(points[from], keyScale);
      const toKey = pointKey(points[to], keyScale);

      if (fromKey === toKey) {
        return;
      }

      const key = fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;

      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    });
  }
}

function countOpenGeometryEdges(geometry: THREE.BufferGeometry) {
  const triangleGeometry = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const edgeCounts = new Map<string, number>();

  addGeometryEdges(edgeCounts, triangleGeometry);
  triangleGeometry.dispose();

  let openEdges = 0;

  edgeCounts.forEach((count) => {
    if (count % 2 === 1) {
      openEdges += 1;
    }
  });

  return openEdges;
}

function auditChunkBoundaries(
  chunks: SolidThinkerChunk[],
  fractureStats: SplitStats,
): ChunkBoundaryAudit {
  const details = chunks.map((chunk, chunkIndex) => {
    const edgeCounts = new Map<string, number>();
    const surfaceEdgeCounts = new Map<string, number>();
    const capEdgeCounts = new Map<string, number>();
    const weldedEdgeCounts = new Map<string, number>();

    addGeometryEdges(edgeCounts, chunk.surfaceGeometry);
    addGeometryEdges(edgeCounts, chunk.interiorGeometry);
    addGeometryEdges(surfaceEdgeCounts, chunk.surfaceGeometry);
    addGeometryEdges(capEdgeCounts, chunk.interiorGeometry);
    addGeometryEdges(weldedEdgeCounts, chunk.surfaceGeometry, 2000);
    addGeometryEdges(weldedEdgeCounts, chunk.interiorGeometry, 2000);

    const countOpenEdges = (counts: Map<string, number>) => {
      let openEdges = 0;

      counts.forEach((count) => {
        if (count % 2 === 1) {
          openEdges += 1;
        }
      });

      return openEdges;
    };
    const openEdges = countOpenEdges(edgeCounts);

    return {
      capOnlyOpenEdges: countOpenEdges(capEdgeCounts),
      capStats: chunk.debug?.capStats ?? [],
      chunkIndex,
      openEdges,
      sourceIndex: chunk.debug?.sourceIndex,
      surfaceOnlyOpenEdges: countOpenEdges(surfaceEdgeCounts),
      weldedOpenEdges: countOpenEdges(weldedEdgeCounts),
    };
  });
  const worstChunks = details
    .filter((detail) => detail.openEdges > 0)
    .sort((a, b) => b.openEdges - a.openEdges)
    .slice(0, 8);

  return {
    capOnlyOpenEdges: details.reduce(
      (total, detail) => total + detail.capOnlyOpenEdges,
      0,
    ),
    chunkCount: chunks.length,
    fractureStats,
    maxOpenEdges: details.reduce(
      (maxOpenEdges, detail) => Math.max(maxOpenEdges, detail.openEdges),
      0,
    ),
    missingCapChunks: chunks.filter(
      (chunk) =>
        (chunk.interiorGeometry.getAttribute("position")?.count ?? 0) === 0,
    ).length,
    openChunks: details.filter((detail) => detail.openEdges > 0).length,
    surfaceOnlyOpenEdges: details.reduce(
      (total, detail) => total + detail.surfaceOnlyOpenEdges,
      0,
    ),
    totalOpenEdges: details.reduce(
      (totalOpenEdges, detail) => totalOpenEdges + detail.openEdges,
      0,
    ),
    weldedOpenEdges: details.reduce(
      (total, detail) => total + detail.weldedOpenEdges,
      0,
    ),
    worstChunks,
  };
}

function maybeLogChunkBoundaryAudit(
  chunks: SolidThinkerChunk[],
  fractureStats: SplitStats,
) {
  if (
    typeof window === "undefined" ||
    !window.location.search.includes("auditChunks")
  ) {
    return;
  }

  console.info(
    "Thinker chunk boundary audit",
    JSON.stringify(auditChunkBoundaries(chunks, fractureStats), null, 2),
  );
}

function getPieceReleaseDistance(piece: FragmentPiece, point: THREE.Vector3) {
  let minimumDistanceSq = Infinity;
  const yaw = Math.PI / 3;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const targetX = point.x * cosine + point.z * sine;
  const targetDepth = -point.x * sine + point.z * cosine;

  piece.polygons.forEach((polygon) => {
    polygon.vertices.forEach((vertex) => {
      const projectedX = vertex.point.x * cosine + vertex.point.z * sine;
      const projectedDepth = -vertex.point.x * sine + vertex.point.z * cosine;
      const deltaX = projectedX - targetX;
      const deltaY = vertex.point.y - point.y;
      const deltaDepth = (projectedDepth - targetDepth) * 0.78;

      minimumDistanceSq = Math.min(
        minimumDistanceSq,
        deltaX * deltaX + deltaY * deltaY + deltaDepth * deltaDepth,
      );
    });
  });

  return Math.sqrt(minimumDistanceSq);
}

export function buildSolidThinkerChunks(
  sourceGeometry: THREE.BufferGeometry,
  options: BuildSolidChunkOptions,
) {
  const { anchor, modelBox, pieces, size, stats } = fractureIntoPieces(
    sourceGeometry,
    options,
  );
  const commonDirection = new THREE.Vector3(-1.15, -0.36, -0.75).normalize();
  const sideDirection = new THREE.Vector3(-commonDirection.z, 0, commonDirection.x)
    .normalize()
    .multiplyScalar(0.22);
  const modelExtent = Math.max(size.length(), 0.001);
  const releaseDirection = new THREE.Vector3(0.58, 0.62, 0.18).normalize();
  const drafts = pieces.map((piece, index) => {
    const random = hash01(piece.id, options.seed + 53);
    const signed = signedHash(piece.id, options.seed + 59);
    const normalized = normalizedPoint(piece.center, modelBox, size);
    const handDistance = THREE.MathUtils.clamp(
      getPieceReleaseDistance(piece, anchor) / (modelExtent * 0.38),
      0,
      1,
    );
    const fromHand = piece.center.clone().sub(anchor);
    const directionalWave = THREE.MathUtils.clamp(
      (fromHand.dot(releaseDirection) / (modelExtent * 0.34) + 1) * 0.5,
      0,
      1,
    );
    const detailBias = getDetailBias(piece, modelBox, size);
    const distance =
      options.spread *
      (0.78 + random * 0.34 + detailBias * 0.035 + (1 - handDistance) * 0.14);
    const offset = commonDirection
      .clone()
      .multiplyScalar(distance)
      .add(sideDirection.clone().multiplyScalar(signed * options.spread * 0.16))
      .add(new THREE.Vector3(0, signedHash(piece.id, options.seed + 61) * 0.08, 0));
    const surfacePolygons = piece.polygons.filter(
      (polygon) => polygon.kind === "surface",
    );
    const capPolygons = piece.polygons.filter((polygon) => polygon.kind === "cap");
    const releasePriority =
      handDistance * 0.72 +
      directionalWave * 0.18 +
      THREE.MathUtils.clamp((0.18 - normalized.y) / 0.18, 0, 1) * 0.06 +
      hash01(piece.id, options.seed + 67) * 0.018;

    return {
      chunk: {
        center: piece.center,
        debug: {
          capStats: piece.capStats,
          sourceIndex: piece.id,
        },
        interiorGeometry: makeBufferGeometry(capPolygons, piece.center),
        offset,
        releaseAt: 0,
        scale: 0.94 + random * 0.13,
        spin: new THREE.Vector3(
          signedHash(index, options.seed + 71) * Math.PI * 0.11,
          signedHash(index, options.seed + 73) * Math.PI * 0.14,
          signedHash(index, options.seed + 79) * Math.PI * 0.09,
        ),
        surfaceGeometry: makeBufferGeometry(surfacePolygons, piece.center),
      } satisfies SolidThinkerChunk,
      releasePriority,
    };
  });
  const releaseStart = 0.015;
  const releaseEnd = 0.95;
  const sortedDrafts = drafts.sort((a, b) => a.releasePriority - b.releasePriority);
  const chunks = sortedDrafts.map((draft, order) => {
    const progress =
      sortedDrafts.length <= 1 ? 0 : order / Math.max(sortedDrafts.length - 1, 1);

    draft.chunk.releaseAt = THREE.MathUtils.lerp(
      releaseStart,
      releaseEnd,
      Math.pow(progress, 0.72),
    );

    return draft.chunk;
  });

  maybeLogChunkBoundaryAudit(chunks, stats);

  return chunks;
}
