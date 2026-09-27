import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CanvasSource } from "@/components/valley/barShader";
import { projects, skillGroups } from "@/components/profile";
import {
  BIG,
  FAR,
  FOV,
  forwardAt,
  GAP,
  type GateDims,
  headingAt,
  LANTERNS,
  LAYOUT,
  NEAR,
  PLAQUE_H,
  PLAQUE_OUT,
  PLAQUE_W,
  PLAQUE_Y,
  placeAt,
  type Pose,
  RACK_HALF,
  RACK_LAT,
  RAIL_TOP,
  railY,
  RIDGES,
  ridgeY,
  rightAt,
  rng,
  SAKURA,
  SMALL,
  TAB_DROP,
  TAB_H,
  TAB_W,
  tabAlong,
  TERRACE,
  TRUNKS,
} from "./path";
import {
  BIRD_FRAG,
  BIRD_VERT,
  CARD_FRAG,
  CARD_VERT,
  FLOOR_FRAG,
  GATE_FRAG,
  GATE_VERT,
  GROUND_FRAG,
  PETAL_FRAG,
  PETAL_VERT,
  PLAIN_VERT,
  SHADE_FRAG,
  SHADE_VERT,
  SKY_FRAG,
  SKY_VERT,
  UV_VERT,
} from "./shaders";
import { makePlaque, makeTablets, sheetRect } from "./textures";

/**
 * The tunnel of gates, drawn off screen in greys and handed to the bar
 * shader as a canvas source. It knows nothing about the page: each frame
 * it is told where the camera is.
 *
 * Every gate is built here from posts and beams. All the posts (and their
 * dark bases) are one instanced mesh and all the beams another, so two
 * hundred gates cost two draw calls. The woods, the lanterns, the sakura,
 * the rack and the hills are merged into one mesh with a grey per vertex.
 *
 * The render is small on purpose: the bar shader samples one texel per
 * cell, about 320 cells across, so three texels a cell is plenty.
 */

export type Tunnel = {
  source: CanvasSource;
  resize(aspect: number): void;
  draw(pose: Pose, time: number): void;
  /** Paints the plaques and tablets again, once the page's fonts have arrived. */
  repaint(): void;
  dispose(): void;
};

const RENDER_W = 960;
/** The haze everything fades toward with distance, and how fast. */
const HAZE = 0.64;
const FOG_RATE = 0.007;
/** The open ground's grey. */
const GROUND = 0.42;

/** Gives a geometry a constant `shade` and drops what the merge does not need. */
function shaded(geo: THREE.BufferGeometry, value: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute("uv");
  const n = g.getAttribute("position").count;
  g.setAttribute("shade", new THREE.Float32BufferAttribute(new Array<number>(n).fill(value), 1));
  return g;
}

export function buildTunnel(
  canvas: HTMLCanvasElement,
  opts: { animated: boolean; sansFamily: string; update?: (time: number, dt: number) => void },
): Tunnel {
  // The context is asked for here, not by three, so a browser without one
  // fails before anything is built and the page keeps its words.
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    // The bar shader copies this canvas after the frame is drawn.
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("b22: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  try {
    return assemble(renderer, canvas, opts);
  } catch (error) {
    // Half a scene is no scene: hand the context back and let the page fall back.
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

function assemble(
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  opts: { animated: boolean; sansFamily: string; update?: (time: number, dt: number) => void },
): Tunnel {
  // An off-screen buffer of a fixed small size; the screen's pixel ratio does not apply to it.
  renderer.setPixelRatio(1);
  // The greys are written straight out: no colour conversion, no tone curve.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(new THREE.Color(HAZE, HAZE, HAZE), 1);

  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(t: T): T => {
    owned.push(t);
    return t;
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, NEAR, FAR);
  camera.rotation.order = "YXZ";

  // One set of fog uniforms, shared by every material.
  const common = {
    uCam: { value: new THREE.Vector3() },
    uFogRate: { value: FOG_RATE },
    uHaze: { value: HAZE },
  };
  const mat = (vertexShader: string, fragmentShader: string, extra: Record<string, THREE.IUniform> = {}, side: THREE.Side = THREE.FrontSide) =>
    keep(new THREE.ShaderMaterial({ uniforms: { ...common, ...extra }, vertexShader, fragmentShader, side }));

  const up = new THREE.Vector3(0, 1, 0);
  const yawQ = (h: number) => new THREE.Quaternion().setFromAxisAngle(up, h);

  // ---------------------------------------------------------------- sky
  const sky = new THREE.Mesh(
    keep(new THREE.SphereGeometry(700, 32, 16)),
    keep(new THREE.ShaderMaterial({ uniforms: { uHaze: common.uHaze }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false })),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ------------------------------------------------------------- ground
  // A square whose far edge is the terrace edge, so past it the hills
  // fall away below. The whole path lies on it (the Node check measures).
  {
    const size = 800;
    const g = new THREE.Group();
    g.position.set(TERRACE.x, 0, TERRACE.z);
    g.rotation.y = TERRACE.heading;
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(size, size)), mat(PLAIN_VERT, GROUND_FRAG, { uGround: { value: GROUND } }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = size / 2 - TERRACE.edge;
    g.add(ground);
    scene.add(g);
  }

  // The tunnel floor, one strip per run, a little darker than the open
  // ground and barred with the light between the posts. It runs a couple
  // of metres past each end and turns into the open ground there.
  {
    const strips: THREE.BufferGeometry[] = [];
    const halfW = SMALL.half + 0.4;
    for (const run of LAYOUT.runs) {
      const pos: number[] = [];
      const uv: number[] = [];
      const open: number[] = [];
      const idx: number[] = [];
      const u0 = run.u0 - 2.4;
      const u1 = run.u1 + 2.4;
      const n = Math.ceil((u1 - u0) / 0.4);
      for (let i = 0; i <= n; i += 1) {
        const u = u0 + ((u1 - u0) * i) / n;
        const beyond = Math.max(run.u0 - 0.4 - u, u - run.u1 - 0.4, 0);
        const o = Math.min(1, beyond / 2);
        for (const side of [-1, 1]) {
          const p = placeAt(u, side * halfW);
          pos.push(p.x, 0.012, p.z);
          uv.push(side * halfW, (u - run.u0) / GAP);
          open.push(o * o * (3 - 2 * o));
        }
        if (i > 0) {
          const a = (i - 1) * 2;
          // Wound so the face points up.
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute("aOpen", new THREE.Float32BufferAttribute(open, 1));
      g.setIndex(idx);
      strips.push(g);
    }
    const merged = mergeGeometries(strips, false);
    for (const s of strips) s.dispose();
    if (merged) {
      const floor = new THREE.Mesh(keep(merged), mat(UV_VERT, FLOOR_FRAG, { uGround: { value: GROUND } }, THREE.DoubleSide));
      scene.add(floor);
    }
  }

  // -------------------------------------------------------------- gates
  {
    const gates = LAYOUT.gates;
    const r = rng(2202);
    const postGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 14));
    postGeo.translate(0, 0.5, 0);
    const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1));
    boxGeo.translate(0, 0.5, 0);
    const gateMat = mat(GATE_VERT, GATE_FRAG);
    const posts = new THREE.InstancedMesh(postGeo, gateMat, gates.length * 4);
    const beams = new THREE.InstancedMesh(boxGeo, gateMat, gates.length * 3);
    const postTone = new Float32Array(gates.length * 4);
    const beamTone = new Float32Array(gates.length * 3);
    const m4 = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    let pi = 0;
    let bi = 0;
    const put = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, q: THREE.Quaternion, sx: number, sy: number, sz: number) => {
      v.set(x, y, z);
      s.set(sx, sy, sz);
      m4.compose(v, q, s);
      mesh.setMatrixAt(i, m4);
    };
    for (const gate of gates) {
      const d: GateDims = gate.big ? BIG : SMALL;
      const q = yawQ(headingAt(gate.u));
      // Weathered gates: each a shade of its own.
      const tone = 0.6 + (r() - 0.5) * 0.12;
      for (const side of [-1, 1]) {
        const p = placeAt(gate.u, side * d.half);
        put(posts, pi, p.x, 0, p.z, q, d.postR, d.shimakiY, d.postR);
        postTone[pi] = tone;
        pi += 1;
        put(posts, pi, p.x, 0, p.z, q, d.footR, d.footH, d.footR);
        postTone[pi] = 0.1;
        pi += 1;
      }
      const c = placeAt(gate.u, 0);
      put(beams, bi, c.x, d.nukiY, c.z, q, 2 * (d.half + d.nukiOver), d.nukiH, d.depth * 0.55);
      beamTone[bi] = tone;
      bi += 1;
      put(beams, bi, c.x, d.shimakiY, c.z, q, 2 * (d.half + d.shimakiOver), d.shimakiH, d.depth * 0.8);
      beamTone[bi] = tone * 0.92;
      bi += 1;
      // The top beam is dark, as the real ones are capped in black.
      put(beams, bi, c.x, d.shimakiY + d.shimakiH, c.z, q, 2 * (d.half + d.kasagiOver), d.kasagiH, d.depth);
      beamTone[bi] = 0.22;
      bi += 1;
    }
    // The geometries are shared by nothing else, so each carries its own instance greys.
    postGeo.setAttribute("aTone", new THREE.InstancedBufferAttribute(postTone, 1));
    boxGeo.setAttribute("aTone", new THREE.InstancedBufferAttribute(beamTone, 1));
    posts.instanceMatrix.needsUpdate = true;
    beams.instanceMatrix.needsUpdate = true;
    // The instances span the whole path; three's box test would see only the first.
    posts.frustumCulled = false;
    beams.frustumCulled = false;
    scene.add(posts, beams);
    owned.push({ dispose: () => posts.dispose() }, { dispose: () => beams.dispose() });
  }

  // ------------------------------------------------------------ plaques
  const plaques = projects.map((p) => makePlaque(p, opts.sansFamily));
  {
    const geo = keep(new THREE.PlaneGeometry(PLAQUE_W, PLAQUE_H));
    LAYOUT.plaqueU.forEach((pu, k) => {
      const pl = plaques[k];
      keep(pl.texture);
      const f = forwardAt(pu);
      const c = placeAt(pu, 0);
      const mesh = new THREE.Mesh(geo, mat(CARD_VERT, CARD_FRAG, { uMap: { value: pl.texture } }));
      mesh.position.set(c.x - f.x * PLAQUE_OUT, PLAQUE_Y, c.z - f.z * PLAQUE_OUT);
      mesh.rotation.y = headingAt(pu);
      scene.add(mesh);
    });
  }

  // ------------------------------------------------ everything standing
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, shade: number) => parts.push(shaded(g, shade));

  // Bare trunks, tall enough to leave the top of the frame.
  for (const t of TRUNKS) {
    const g = new THREE.CylinderGeometry(t.r * 0.8, t.r, t.h, 7);
    g.translate(t.x, t.h / 2, t.z);
    add(g, 0.1);
  }

  // Sakura: a trunk, two limbs, a crown of lumpy blossom clumps.
  {
    const m4 = new THREE.Matrix4();
    for (const t of SAKURA) {
      const r = rng(t.seed + 7);
      const trunk = new THREE.CylinderGeometry(t.r * 0.7, t.r, t.h, 7);
      trunk.translate(t.x, t.h / 2, t.z);
      add(trunk, 0.1);
      for (const side of [-1, 1]) {
        const limb = new THREE.CylinderGeometry(0.06, 0.12, t.crown * 0.9, 5);
        limb.translate(0, (t.crown * 0.9) / 2, 0);
        m4.makeRotationZ(side * (0.6 + r() * 0.3));
        limb.applyMatrix4(m4);
        limb.translate(t.x, t.h * 0.85, t.z);
        add(limb, 0.1);
      }
      const clumps = 8 + Math.floor(r() * 4);
      for (let i = 0; i < clumps; i += 1) {
        const a = r() * Math.PI * 2;
        const d = r() * t.crown * 0.62;
        const size = t.crown * (0.4 + r() * 0.3);
        const clump = new THREE.IcosahedronGeometry(size, 1);
        const pos = clump.getAttribute("position");
        for (let k = 0; k < pos.count; k += 1) {
          const f = 0.82 + r() * 0.3;
          pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f * 0.78, pos.getZ(k) * f);
        }
        clump.computeVertexNormals();
        clump.translate(t.x + Math.cos(a) * d, t.h + t.crown * 0.45 + (r() - 0.3) * t.crown * 0.5, t.z + Math.sin(a) * d);
        add(clump, 0.66 + r() * 0.2);
      }
    }
  }

  // Stone lanterns: base, shaft, shelf, the light box with its window, roof, the jewel on top.
  for (const l of LANTERNS) {
    const stack: [THREE.BufferGeometry, number, number][] = [];
    let y = 0;
    const put = (g: THREE.BufferGeometry, h: number, shade: number) => {
      g.translate(0, y + h / 2, 0);
      stack.push([g, shade, h]);
      y += h;
    };
    put(new THREE.BoxGeometry(0.62, 0.2, 0.62), 0.3, 0.2);
    put(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 8), 0.7, 0.28);
    put(new THREE.BoxGeometry(0.56, 0.12, 0.56), 0.12, 0.32);
    const boxY = y;
    put(new THREE.BoxGeometry(0.42, 0.38, 0.42), 0.38, 0.26);
    // The window: two crossed bars of light, poking just through each face.
    const w1 = new THREE.BoxGeometry(0.24, 0.2, 0.46);
    w1.translate(0, boxY + 0.19, 0);
    stack.push([w1, 0.95, 0]);
    const w2 = new THREE.BoxGeometry(0.46, 0.2, 0.24);
    w2.translate(0, boxY + 0.19, 0);
    stack.push([w2, 0.95, 0]);
    const roof = new THREE.ConeGeometry(0.46, 0.3, 4);
    roof.rotateY(Math.PI / 4);
    put(roof, 0.3, 0.2);
    put(new THREE.SphereGeometry(0.07, 8, 6), 0.1, 0.26);
    for (const [g, shade] of stack) {
      g.translate(l.x, 0, l.z);
      add(g, shade);
    }
  }

  // The rack of votive tablets, standing to the left of the skills
  // clearing and facing the path. Built in its own frame (x along the
  // path, z toward the path) and then set in place.
  const rackMatrix = (() => {
    const c = placeAt(LAYOUT.skillsU, -RACK_LAT);
    const f = forwardAt(LAYOUT.skillsU);
    const rt = rightAt(LAYOUT.skillsU);
    return new THREE.Matrix4().makeBasis(new THREE.Vector3(f.x, 0, f.z), up, new THREE.Vector3(rt.x, 0, rt.z)).setPosition(c.x, 0, c.z);
  })();
  {
    const midX = tabAlong(5);
    const inRack = (g: THREE.BufferGeometry, shade: number) => {
      g.applyMatrix4(rackMatrix);
      add(g, shade);
    };
    const topY = RAIL_TOP + 0.55;
    // A dark board behind the tablets, so their names read on it.
    const board = new THREE.BoxGeometry(RACK_HALF * 2, topY - 0.3, 0.05);
    board.translate(midX, 0.3 + (topY - 0.3) / 2, -0.14);
    inRack(board, 0.05);
    for (const side of [-1, 1]) {
      const post = new THREE.BoxGeometry(0.14, topY, 0.14);
      post.translate(midX + side * RACK_HALF, topY / 2, -0.05);
      inRack(post, 0.2);
    }
    for (let row = 0; row < 5; row += 1) {
      const rail = new THREE.BoxGeometry(RACK_HALF * 2, 0.05, 0.06);
      rail.translate(midX, railY(row), 0.0);
      inRack(rail, 0.34);
    }
    const roof = new THREE.BoxGeometry(RACK_HALF * 2 + 0.5, 0.08, 0.75);
    roof.rotateX(0.22);
    roof.translate(midX, topY + 0.04, -0.02);
    inRack(roof, 0.2);
  }

  // The hills from the terrace: curtains with a wavy top, far ones taller.
  {
    const tf = { x: -Math.sin(TERRACE.heading), z: -Math.cos(TERRACE.heading) };
    const tr = { x: Math.cos(TERRACE.heading), z: -Math.sin(TERRACE.heading) };
    for (const ridge of RIDGES) {
      const pos: number[] = [];
      const idx: number[] = [];
      const n = 90;
      for (let i = 0; i <= n; i += 1) {
        const l = -ridge.span + (2 * ridge.span * i) / n;
        const bx = TERRACE.x + tf.x * ridge.d + tr.x * l;
        const bz = TERRACE.z + tf.z * ridge.d + tr.z * l;
        pos.push(bx, ridgeY(ridge, l), bz, bx, -160, bz);
        if (i > 0) {
          const a = (i - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      add(g, 0.08);
    }
  }

  {
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (merged) scene.add(new THREE.Mesh(keep(merged), mat(SHADE_VERT, SHADE_FRAG, {}, THREE.DoubleSide)));
  }

  // ------------------------------------------------------------ tablets
  const sheet = makeTablets(skillGroups, opts.sansFamily);
  keep(sheet.texture);
  {
    const faces: THREE.BufferGeometry[] = [];
    let i = 0;
    skillGroups.forEach((g, row) => {
      g.skills.forEach((_, col) => {
        const face = new THREE.PlaneGeometry(TAB_W, TAB_H);
        const [u0, v0, u1, v1] = sheetRect(i);
        const uv = face.getAttribute("uv");
        for (let k = 0; k < uv.count; k += 1) uv.setXY(k, uv.getX(k) < 0.5 ? u0 : u1, uv.getY(k) < 0.5 ? v0 : v1);
        // Each hangs a touch askew, as they do on a real rack.
        face.rotateZ(((i * 37) % 7) / 7 * 0.08 - 0.04);
        face.translate(tabAlong(col), railY(row) - TAB_DROP, 0.05);
        face.applyMatrix4(rackMatrix);
        faces.push(face);
        i += 1;
      });
    });
    const merged = mergeGeometries(faces, false);
    for (const f of faces) f.dispose();
    if (merged) scene.add(new THREE.Mesh(keep(merged), mat(CARD_VERT, CARD_FRAG, { uMap: { value: sheet.texture } }, THREE.DoubleSide)));
  }

  // ------------------------------------------------------------- birds
  const birdUniforms = { uTime: { value: 0 } };
  {
    const tf = { x: -Math.sin(TERRACE.heading), z: -Math.cos(TERRACE.heading) };
    const tr = { x: Math.cos(TERRACE.heading), z: -Math.sin(TERRACE.heading) };
    const r = rng(2203);
    const pos: number[] = [];
    const wing: number[] = [];
    const phase: number[] = [];
    for (let b = 0; b < 7; b += 1) {
      const d = 80 + r() * 40;
      // Off to the right of the words and the links, a third of the way down.
      const l = d * (0.48 + r() * 0.24);
      const y = 1.6 + d * (0.08 + r() * 0.08);
      const cx = TERRACE.x + tf.x * d + tr.x * l;
      const cz = TERRACE.z + tf.z * d + tr.z * l;
      const span = 1.6 + r() * 0.5;
      const ph = r() * Math.PI * 2;
      for (const side of [-1, 1]) {
        // body, wing tip, and a point under the wing's middle
        const pts: [number, number, number][] = [
          [0, 0, 0],
          [side * span, span * 0.28, 1],
          [side * span * 0.35, -span * 0.12, 0.35],
        ];
        for (const [lx, ly, wv] of pts) {
          pos.push(cx + tr.x * lx, y + ly, cz + tr.z * lx);
          wing.push(wv);
          phase.push(ph);
        }
      }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aWing", new THREE.Float32BufferAttribute(wing, 1));
    g.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
    const birds = new THREE.Mesh(g, keep(new THREE.ShaderMaterial({ uniforms: birdUniforms, vertexShader: BIRD_VERT, fragmentShader: BIRD_FRAG, side: THREE.DoubleSide })));
    birds.frustumCulled = false;
    scene.add(birds);
  }

  // ------------------------------------------------------------- petals
  const petalUniforms = {
    uTime: { value: 0 },
    uCentre: { value: new THREE.Vector3() },
    uSize: { value: 40 },
  };
  {
    const r = rng(2204);
    const n = 260;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = (r() - 0.5) * 12;
      pos[i * 3 + 1] = r() * 5;
      pos[i * 3 + 2] = (r() - 0.5) * 18;
      phase[i] = r() * Math.PI * 2;
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    const petals = new THREE.Points(g, keep(new THREE.ShaderMaterial({ uniforms: petalUniforms, vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG })));
    petals.frustumCulled = false;
    scene.add(petals);
  }

  // ------------------------------------------------------------ drawing
  const resize = (aspect: number): void => {
    const a = Math.max(0.4, Math.min(4, aspect || 1.85));
    const h = Math.max(2, Math.round(RENDER_W / a));
    renderer.setSize(RENDER_W, h, false);
    camera.aspect = a;
    camera.updateProjectionMatrix();
    // A petal 0.08 m across, in render pixels at one metre.
    petalUniforms.uSize.value = (0.08 * h) / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
  };
  resize(1.85);

  const forward = new THREE.Vector3();
  let disposed = false;
  const draw = (pose: Pose, time: number): void => {
    if (disposed) return;
    camera.position.set(pose.x, pose.y, pose.z);
    camera.rotation.set(pose.pitch, pose.yaw, pose.roll);
    camera.updateMatrixWorld();
    common.uCam.value.copy(camera.position);
    sky.position.copy(camera.position);
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    petalUniforms.uCentre.value.set(camera.position.x + forward.x * 6, 2.4, camera.position.z + forward.z * 6);
    petalUniforms.uTime.value = time;
    birdUniforms.uTime.value = time;
    renderer.render(scene, camera);
  };

  const repaint = (): void => {
    if (disposed) return;
    for (const p of plaques) p.repaint();
    sheet.repaint();
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const t of owned) t.dispose();
    renderer.dispose();
    // Contexts are few; give this one back now.
    renderer.forceContextLoss();
  };

  const source: CanvasSource = {
    canvas,
    animated: opts.animated,
    ready: Promise.resolve(),
    update: opts.update
      ? (time, dt) => {
          opts.update?.(time, dt);
          return true;
        }
      : undefined,
    // The page disposes the scene itself; the engine must not do it twice.
  };

  return { source, resize, draw, repaint, dispose };
}
