import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { CanvasSource } from "@/components/valley/barShader";
import { centre, GROUP_COUNT, GROUPS, groupCentres, type Piece, splitMesh, type Vec3, WHEELS } from "./parts";
import { explodeAt, FOV, litAt, poseAt } from "./layout";

/**
 * Kevin's robot, drawn off screen in greys and handed to the bar shader,
 * as the band above does it. Here it comes apart: the glb is cut into its
 * connected pieces, the pieces are sorted into part groups (parts.ts), and
 * each group is one mesh whose pieces a small shader moves out along the
 * group's way and away from each other. The four wheels are their own
 * meshes so they can turn.
 *
 * It knows nothing about the page. draw(s) puts everything where layout.ts
 * says it is at scroll s.
 */

export type Exploded = {
  source: CanvasSource;
  ready: Promise<void>;
  resize(aspect: number): void;
  draw(s: number): void;
  dispose(): void;
};

/** Render width. The bar grid is 300 cells across; this is under five texels a cell. */
const RENDER_W = 1400;

const VERT = /* glsl */ `
uniform vec3 uShift;
uniform float uSpread;
attribute vec3 aSpread;
varying vec3 vNormal;
void main() {
  vec3 p = position + uShift + aSpread * uSpread;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

// Two lights fixed to the view: a key from the upper left and a weaker
// fill from the right. The grey goes straight to the bar grade: a lit
// group lands over its full-bar point, a dimmed one stays above its
// no-bar point so it thins but never vanishes.
const FRAG = /* glsl */ `
uniform float uLit;
uniform vec3 uKey;
uniform vec3 uFill;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float lam = max(dot(n, uKey), 0.0) * 0.75 + max(dot(n, uFill), 0.0) * 0.25;
  float base = 0.55 + 0.45 * lam;
  float g = base * mix(0.62, 1.0, uLit) + 0.12 * uLit;
  gl_FragColor = vec4(vec3(min(g, 1.0)), 1.0);
}
`;

type Wheel = { mesh: THREE.Mesh; base: THREE.Vector3; side: number };

export function buildExploded(canvas: HTMLCanvasElement, url: string): Exploded {
  // The context is asked for here, not by three, so a browser without one
  // fails before anything is built and the page keeps its words.
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    // The bar shader copies this canvas after the frame is drawn.
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("b25: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  renderer.setPixelRatio(1);
  // Greys written straight out, no colour conversion.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, 0.05, 30);
  const robot = new THREE.Group();
  scene.add(robot);

  const key = new THREE.Vector3(-0.5, 0.75, 0.45).normalize();
  const fill = new THREE.Vector3(0.85, 0.15, 0.35).normalize();
  const materials = GROUPS.map(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.DoubleSide,
        uniforms: {
          uShift: { value: new THREE.Vector3() },
          uSpread: { value: 0 },
          uLit: { value: 0.5 },
          uKey: { value: key },
          uFill: { value: fill },
        },
      }),
  );
  const geometries: THREE.BufferGeometry[] = [];
  const wheels: Wheel[] = [];

  let loaded = false;
  let disposed = false;
  let lastS = NaN;
  let lastAspect = NaN;
  let dirty = false;

  const setSize = (aspect: number): void => {
    // An upright screen keeps its height under RENDER_W too.
    const w = Math.max(2, Math.round(Math.min(RENDER_W, RENDER_W * aspect)));
    const h = Math.max(2, Math.round(w / aspect));
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  };
  setSize(1.85);

  const place = (s: number): void => {
    const pose = poseAt(s, camera.aspect);
    camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    robot.rotation.y = pose.yaw;
    robot.position.set(pose.at.x, pose.at.y, pose.at.z);
    for (let g = 0; g < GROUP_COUNT; g += 1) {
      const e = explodeAt(g, s);
      const spec = GROUPS[g];
      const u = materials[g].uniforms;
      (u.uShift.value as THREE.Vector3).set(spec.dir.x * spec.dist * e, spec.dir.y * spec.dist * e, spec.dir.z * spec.dist * e);
      u.uSpread.value = spec.spread * e;
      u.uLit.value = litAt(g, s);
    }
    // The wheels have no shift in the shader: each moves out to its own
    // side as a mesh, and turns by the distance driven.
    (materials[WHEELS].uniforms.uShift.value as THREE.Vector3).set(0, 0, 0);
    const out = GROUPS[WHEELS].dist * explodeAt(WHEELS, s);
    for (const w of wheels) {
      w.mesh.position.set(w.base.x, w.base.y, w.base.z + w.side * out);
      w.mesh.rotation.set(0, 0, -pose.roll);
    }
  };

  const ready = (async () => {
    const response = await fetch(url, { priority: "low" } as RequestInit);
    const bytes = await response.arrayBuffer();
    if (disposed) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    if (disposed) return;
    gltf.scene.updateMatrixWorld(true);

    // Everything read out into plain float arrays in the robot's frame.
    type Raw = { pos: Float32Array; nor: Float32Array; idx: Uint32Array };
    const readMesh = (mesh: THREE.Mesh, matrix: THREE.Matrix4): Raw => {
      const src = mesh.geometry;
      if (!src.getAttribute("normal")) src.computeVertexNormals();
      const p = src.getAttribute("position");
      const nAttr = src.getAttribute("normal");
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
      const v = new THREE.Vector3();
      const pos = new Float32Array(p.count * 3);
      const nor = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i += 1) {
        v.fromBufferAttribute(p, i).applyMatrix4(matrix);
        pos[i * 3] = v.x;
        pos[i * 3 + 1] = v.y;
        pos[i * 3 + 2] = v.z;
        v.fromBufferAttribute(nAttr, i).applyMatrix3(normalMatrix).normalize();
        nor[i * 3] = v.x;
        nor[i * 3 + 1] = v.y;
        nor[i * 3 + 2] = v.z;
      }
      let idx: Uint32Array;
      if (src.index) idx = Uint32Array.from(src.index.array as ArrayLike<number>);
      else {
        idx = new Uint32Array(p.count);
        for (let i = 0; i < p.count; i += 1) idx[i] = i;
      }
      return { pos, nor, idx };
    };

    const makeGeometry = (pos: Float32Array, nor: Float32Array, spread: Float32Array, idx: Uint32Array): THREE.BufferGeometry => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      g.setAttribute("aSpread", new THREE.BufferAttribute(spread, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      geometries.push(g);
      return g;
    };

    const statics: { raw: Raw; pieceOf: Int32Array; pieces: Piece[] }[] = [];
    const found: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) found.push(o as THREE.Mesh);
    });
    for (const mesh of found) {
      const parent = mesh.parent;
      if (parent && /^wheel_/.test(parent.name)) {
        // A wheel: its geometry about its own axle, the mesh at the axle.
        const raw = readMesh(mesh, mesh.matrix);
        const geo = makeGeometry(raw.pos, raw.nor, new Float32Array(raw.pos.length), raw.idx);
        const m = new THREE.Mesh(geo, materials[WHEELS]);
        const base = parent.getWorldPosition(new THREE.Vector3());
        m.position.copy(base);
        robot.add(m);
        wheels.push({ mesh: m, base, side: base.z >= 0 ? 1 : -1 });
      } else {
        const raw = readMesh(mesh, mesh.matrixWorld);
        const { pieceOf, pieces } = splitMesh(raw.pos, raw.idx, false);
        statics.push({ raw, pieceOf, pieces });
      }
    }
    // The glb's own geometry and materials are not drawn; free them now.
    for (const mesh of found) {
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mt of mats) mt.dispose();
    }

    const centres: Vec3[] = groupCentres(statics.flatMap((st) => st.pieces));
    // One mesh per group: count, then fill.
    for (let g = 0; g < GROUP_COUNT; g += 1) {
      if (g === WHEELS) continue;
      let verts = 0;
      let tris = 0;
      for (const st of statics) {
        const n = st.raw.pos.length / 3;
        for (let i = 0; i < n; i += 1) if (st.pieces[st.pieceOf[i]].group === g) verts += 1;
        for (let t = 0; t < st.raw.idx.length; t += 3) if (st.pieces[st.pieceOf[st.raw.idx[t]]].group === g) tris += 1;
      }
      if (!tris) continue;
      const pos = new Float32Array(verts * 3);
      const nor = new Float32Array(verts * 3);
      const spread = new Float32Array(verts * 3);
      const idx = new Uint32Array(tris * 3);
      let vo = 0;
      let io = 0;
      const gc = centres[g];
      for (const st of statics) {
        const n = st.raw.pos.length / 3;
        const remap = new Int32Array(n).fill(-1);
        const pieceCentres = st.pieces.map((p) => centre(p.min, p.max));
        for (let i = 0; i < n; i += 1) {
          const pc = st.pieceOf[i];
          if (st.pieces[pc].group !== g) continue;
          remap[i] = vo;
          const c = pieceCentres[pc];
          for (let k = 0; k < 3; k += 1) {
            pos[vo * 3 + k] = st.raw.pos[i * 3 + k];
            nor[vo * 3 + k] = st.raw.nor[i * 3 + k];
          }
          spread[vo * 3] = c.x - gc.x;
          spread[vo * 3 + 1] = c.y - gc.y;
          spread[vo * 3 + 2] = c.z - gc.z;
          vo += 1;
        }
        for (let t = 0; t < st.raw.idx.length; t += 3) {
          const a = remap[st.raw.idx[t]];
          if (a < 0) continue;
          idx[io] = a;
          idx[io + 1] = remap[st.raw.idx[t + 1]];
          idx[io + 2] = remap[st.raw.idx[t + 2]];
          io += 3;
        }
      }
      robot.add(new THREE.Mesh(makeGeometry(pos, nor, spread, idx), materials[g]));
    }
    loaded = true;
    lastS = NaN;
  })();

  const draw = (s: number): void => {
    if (disposed || !loaded) return;
    if (s === lastS && camera.aspect === lastAspect) return;
    lastS = s;
    lastAspect = camera.aspect;
    place(s);
    renderer.render(scene, camera);
    dirty = true;
  };

  const source: CanvasSource = {
    canvas,
    animated: true,
    ready: ready.catch(() => {}),
    update: () => {
      const drew = dirty;
      dirty = false;
      return drew;
    },
  };

  return {
    source,
    ready,
    resize(aspect: number) {
      setSize(aspect);
      lastS = NaN;
    },
    draw,
    dispose() {
      disposed = true;
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
