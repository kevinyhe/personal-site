import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { buildEdges } from "./edges";
import { BOX_MAX, BOX_MIN, CENTRE, DIM_GAP, DIST, FAR, FOV, NEAR, type Pose } from "./layout";
import { COMPOSITE_FRAG, MASK_FRAG, QUAD_VERT, STROKES } from "./shaders";

/**
 * The picture. One robot, drawn twice from one camera into two textures:
 * solid, and as an engineer's drawing. A third texture, the mask, says
 * where the drawing shows. A last pass puts them together over the
 * contour ground.
 *
 * This file knows nothing about the page. It is handed a canvas and, each
 * frame, the robot's pose and the strokes to add to the mask.
 */

/** One stroke on the mask, from a to b. x and y are shares of the stage, from the left and the top. */
export type Stroke = { ax: number; ay: number; bx: number; by: number; radius: number; strength: number };

export type Frame = {
  pose: Pose;
  /** Seconds since the start, and since the frame before. */
  time: number;
  dt: number;
  strokes: readonly Stroke[];
  /** The still frame: solid on the left half, drawn on the right, no mask. */
  split: boolean;
  /** How much the page behind the canvas shows through the ground, 0 to 1. */
  open: number;
  /** The middle of the robot, as shares of the stage. */
  spotX: number;
  spotY: number;
};

export type Reveal = {
  resize(width: number, height: number): void;
  frame(f: Frame): void;
  /** The numbers on the dimension lines, drawn again once the page's own font is in. */
  redrawLabels(monoFamily: string): void;
  /** "empty" until the robot is in, "solid" until its edges are found, then "drawn". */
  stage(): "empty" | "solid" | "drawn";
  /** Settles when the robot and its edges are in, or could not be had. */
  ready: Promise<void>;
  dispose(): void;
};

const MAX_BUFFER_WIDTH = 2560;
const MAX_RATIO = 1.5;
const MASK_HEIGHT = 384;
/** Faces that meet at less than this are one surface, and get no line. Degrees. */
const EDGE_ANGLE = 30;
const DEEP = "#1a0812";

type Wheel = { node: THREE.Object3D; base: THREE.Quaternion; axis: THREE.Vector3; sign: number };

const pause = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

/** The model's greys, moved into the palette: dark parts plum, light parts blossom, white parts nearly white. */
const PART_DARK = new THREE.Color("#612b50");
const PART_MID = new THREE.Color(BLOSSOM);
const PART_LIGHT = new THREE.Color("#fff3f9");
function tint(c: THREE.Color): THREE.Color {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const out = new THREE.Color();
  return l < 0.5 ? out.lerpColors(PART_DARK, PART_MID, l / 0.5) : out.lerpColors(PART_MID, PART_LIGHT, (l - 0.5) / 0.5);
}

/** The dimension lines of the drawing, in the robot's own axes: [solid lines, dashed centre lines]. */
function dimensionLines(): [number[], number[]] {
  const [x0, y0, z0] = BOX_MIN;
  const [x1, y1, z1] = BOX_MAX;
  const g = DIM_GAP;
  const over = g * 1.35;
  const t = 0.012;
  const s: number[] = [];
  const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): void => {
    s.push(ax, ay, az, bx, by, bz);
  };
  // Length, on the floor beside the right side. Two lines out from the
  // corners, the measured line between them, a slash at each end.
  seg(x0, y0, z1 + g, x1, y0, z1 + g);
  seg(x0, y0, z1, x0, y0, z1 + over);
  seg(x1, y0, z1, x1, y0, z1 + over);
  seg(x0 - t, y0, z1 + g - t, x0 + t, y0, z1 + g + t);
  seg(x1 - t, y0, z1 + g - t, x1 + t, y0, z1 + g + t);
  // Width, on the floor ahead of the front.
  seg(x1 + g, y0, z0, x1 + g, y0, z1);
  seg(x1, y0, z0, x1 + over, y0, z0);
  seg(x1, y0, z1, x1 + over, y0, z1);
  seg(x1 + g - t, y0, z0 - t, x1 + g + t, y0, z0 + t);
  seg(x1 + g - t, y0, z1 - t, x1 + g + t, y0, z1 + t);
  // Height, behind the rear left corner.
  seg(x0 - g, y0, z0, x0 - g, y1, z0);
  seg(x0, y0, z0, x0 - over, y0, z0);
  seg(x0, y1, z0, x0 - over, y1, z0);
  seg(x0 - g - t, y0 - t, z0, x0 - g + t, y0 + t, z0);
  seg(x0 - g - t, y1 - t, z0, x0 - g + t, y1 + t, z0);
  // The footprint on the floor.
  seg(x0, y0, z0, x1, y0, z0);
  seg(x1, y0, z0, x1, y0, z1);
  seg(x1, y0, z1, x0, y0, z1);
  seg(x0, y0, z1, x0, y0, z0);

  // Centre lines: along the robot through the middle of the drivetrain,
  // and across it.
  const d: number[] = [];
  d.push(x0 - 0.03, y0, 0, x1 + 0.03, y0, 0);
  d.push(0, y0, z0 - 0.03, 0, y0, z1 + 0.03);
  return [s, d];
}

export function buildReveal(canvas: HTMLCanvasElement, monoFamily: string): Reveal {
  // The context is asked for here, not by three, so a browser that has
  // none fails before anything is built. The caller falls back to the
  // plain page.
  const attributes: WebGLContextAttributes = {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  };
  const gl = canvas.getContext("webgl2", attributes);
  if (!gl) throw new Error("b10: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attributes });
  renderer.setClearColor(0x000000, 0);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };

  const camera = new THREE.PerspectiveCamera(FOV, 1.85, NEAR, FAR);
  camera.position.set(0, 0, DIST);
  camera.lookAt(0, 0, 0);

  // ------------------------------------------------- the solid robot
  // Lit to be bright. With these numbers a pale face turned to the lens
  // comes out at about its own colour, and a face turned away at about
  // four tenths of it. Nothing falls to black.
  const solidScene = new THREE.Scene();
  solidScene.add(new THREE.HemisphereLight("#fff0f6", "#8a4a72", 1.5));
  const key = new THREE.DirectionalLight("#ffd9b8", 2.4);
  key.position.set(-1.6, 2.2, 3);
  solidScene.add(key);
  const rim = new THREE.DirectionalLight("#ff86c4", 3.2);
  rim.position.set(2.2, 1.2, -2.6);
  solidScene.add(rim);
  const fill = new THREE.DirectionalLight(BLOSSOM, 0.6);
  fill.position.set(2.5, 0.2, 2);
  solidScene.add(fill);

  const solidRig = new THREE.Group();
  const solidHold = new THREE.Group();
  solidHold.position.set(-CENTRE[0], -CENTRE[1], -CENTRE[2]);
  solidRig.add(solidHold);
  solidScene.add(solidRig);

  // ------------------------------------------------- the drawn robot
  const drawScene = new THREE.Scene();
  const drawRig = new THREE.Group();
  const drawHold = new THREE.Group();
  drawHold.position.copy(solidHold.position);
  drawRig.add(drawHold);
  drawScene.add(drawRig);

  // The faces are filled, faintly, and pushed back a little in depth.
  // They hide the lines of the far side and let the near lines through.
  const faceMat = keep(
    new THREE.MeshBasicMaterial({ color: "#341127", polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  );
  const lineMat = keep(new THREE.LineBasicMaterial({ color: BLOSSOM }));
  const dimMat = keep(new THREE.LineBasicMaterial({ color: "#ffffff" }));
  const dashMat = keep(new THREE.LineDashedMaterial({ color: BLOSSOM, dashSize: 0.022, gapSize: 0.012 }));

  const [solidLines, dashedLines] = dimensionLines();
  const dimGeo = keep(new THREE.BufferGeometry());
  dimGeo.setAttribute("position", new THREE.Float32BufferAttribute(solidLines, 3));
  drawHold.add(new THREE.LineSegments(dimGeo, dimMat));
  const dashGeo = keep(new THREE.BufferGeometry());
  dashGeo.setAttribute("position", new THREE.Float32BufferAttribute(dashedLines, 3));
  const dashes = new THREE.LineSegments(dashGeo, dashMat);
  dashes.computeLineDistances();
  drawHold.add(dashes);

  // The three measurements, as type that always faces the lens.
  const size = [BOX_MAX[0] - BOX_MIN[0], BOX_MAX[2] - BOX_MIN[2], BOX_MAX[1] - BOX_MIN[1]];
  const labelAt: [number, number, number][] = [
    [(BOX_MIN[0] + BOX_MAX[0]) / 2, BOX_MIN[1], BOX_MAX[2] + DIM_GAP + 0.035],
    [BOX_MAX[0] + DIM_GAP + 0.035, BOX_MIN[1], (BOX_MIN[2] + BOX_MAX[2]) / 2],
    [BOX_MIN[0] - DIM_GAP - 0.045, (BOX_MIN[1] + BOX_MAX[1]) / 2, BOX_MIN[2]],
  ];
  const labels = size.map((metres, i) => {
    const sheet = document.createElement("canvas");
    sheet.width = 512;
    sheet.height = 128;
    const texture = keep(new THREE.CanvasTexture(sheet));
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = keep(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.12, 0.03, 1);
    sprite.position.set(...labelAt[i]);
    sprite.renderOrder = 10;
    drawHold.add(sprite);
    return { sheet, texture, text: `${Math.round(metres * 1000)} mm` };
  });
  const redrawLabels = (family: string): void => {
    for (const l of labels) {
      const c = l.sheet.getContext("2d");
      if (!c) continue;
      c.clearRect(0, 0, l.sheet.width, l.sheet.height);
      c.font = `500 76px ${family}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#ffffff";
      c.fillText(l.text, l.sheet.width / 2, l.sheet.height / 2 + 4);
      l.texture.needsUpdate = true;
    }
  };
  redrawLabels(monoFamily);

  // ------------------------------------------------------ the targets
  const target = (): THREE.WebGLRenderTarget =>
    keep(
      new THREE.WebGLRenderTarget(4, 4, {
        depthBuffer: true,
        samples: 4,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      }),
    );
  const solidTarget = target();
  const drawTarget = target();

  // The mask fades by a small amount each frame. In 8 bits a small
  // amount rounds to nothing, so it is kept in 16-bit floats where the
  // browser can draw to those.
  const floats = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
  const maskTarget = (): THREE.WebGLRenderTarget =>
    keep(
      new THREE.WebGLRenderTarget(4, 4, {
        depthBuffer: false,
        type: floats ? THREE.HalfFloatType : THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        generateMipmaps: false,
      }),
    );
  let maskRead = maskTarget();
  let maskWrite = maskTarget();

  // ------------------------------------------------------- the passes
  const maskUniforms = {
    uPrev: { value: maskRead.texture },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uAspect: { value: 1.85 },
    uTime: { value: 0 },
    uKeep: { value: 1 },
    uDrop: { value: 0 },
    uFloor: { value: 0 },
    uFlow: { value: 0 },
    uSeg: { value: Array.from({ length: STROKES }, () => new THREE.Vector4()) },
    uBlob: { value: Array.from({ length: STROKES }, () => new THREE.Vector2()) },
  };
  const pass = { depthTest: false, depthWrite: false, blending: THREE.NoBlending };
  const maskMat = keep(new THREE.ShaderMaterial({ uniforms: maskUniforms, vertexShader: QUAD_VERT, fragmentShader: MASK_FRAG, ...pass }));

  const compositeUniforms = {
    uSolid: { value: solidTarget.texture },
    uDraw: { value: drawTarget.texture },
    uMask: { value: maskRead.texture },
    uPixel: { value: new THREE.Vector2(1, 1) },
    uAspect: { value: 1.85 },
    uTime: { value: 0 },
    uSplit: { value: 0 },
    uOpen: { value: 0 },
    uLine: { value: 1 },
    uSpot: { value: new THREE.Vector3(0.9, 0.5, 0.7) },
    uPlum: { value: new THREE.Color(BAND) },
    uDeep: { value: new THREE.Color(DEEP) },
    uBlossom: { value: new THREE.Color(BLOSSOM) },
  };
  const compositeMat = keep(
    new THREE.ShaderMaterial({ uniforms: compositeUniforms, vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG, ...pass }),
  );

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(keep(new THREE.PlaneGeometry(2, 2)), maskMat);
  quad.frustumCulled = false;
  quadScene.add(quad);

  // --------------------------------------------------------- the robot
  const wheels: Wheel[] = [];
  const robotParts: { dispose(): void }[] = [];
  let progress: "empty" | "solid" | "drawn" = "empty";
  let disposed = false;

  const findWheels = (root: THREE.Object3D): void => {
    root.traverse((o) => {
      const data = o.userData as { axis?: number[]; sign?: number };
      if (/^wheel_/.test(o.name) && data.axis) {
        wheels.push({ node: o, base: o.quaternion.clone(), axis: new THREE.Vector3().fromArray(data.axis).normalize(), sign: data.sign ?? 1 });
      }
    });
  };

  const load = async (): Promise<void> => {
    const response = await fetch("/models/hero.glb");
    if (!response.ok) throw new Error(`b10: hero.glb, ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (disposed) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    const solid = gltf.scene;

    // Its own materials go; the palette's come in, one for each of the old.
    const swapped = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const meshes: THREE.Mesh[] = [];
    solid.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes.push(mesh);
      robotParts.push(mesh.geometry);
      const old = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      let made = swapped.get(old);
      if (!made) {
        const colour = tint(old.color ?? new THREE.Color(1, 1, 1));
        made = new THREE.MeshStandardMaterial({
          color: colour,
          roughness: 0.55,
          metalness: 0.08,
          emissive: colour.clone().multiplyScalar(0.08),
        });
        swapped.set(old, made);
        robotParts.push(made);
        old.dispose();
      }
      mesh.material = made;
    });
    if (disposed) {
      for (const part of robotParts) part.dispose();
      return;
    }

    // The same parts again for the drawing, sharing the geometry.
    const drawn = solid.clone(true);
    const faces: THREE.Mesh[] = [];
    drawn.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = faceMat;
      faces.push(mesh);
    });
    findWheels(solid);
    findWheels(drawn);
    solidHold.add(solid);
    drawHold.add(drawn);
    progress = "solid";

    // The edges, one part at a time with a breath between, so the page
    // is never held for longer than the largest part takes.
    for (const face of faces) {
      await pause();
      if (disposed) return;
      const ends = buildEdges(face.geometry, EDGE_ANGLE);
      const geometry = ends ? new THREE.BufferGeometry() : new THREE.EdgesGeometry(face.geometry, EDGE_ANGLE);
      if (ends) geometry.setAttribute("position", new THREE.BufferAttribute(ends, 3));
      robotParts.push(geometry);
      // A child of the face, so it turns with the wheel it is on.
      face.add(new THREE.LineSegments(geometry, lineMat));
    }
    progress = "drawn";
  };
  // A robot that cannot be had leaves the ground and the trail. The
  // words are in the page either way.
  const ready = load().catch(() => undefined);

  // ------------------------------------------------------------ sizes
  let bufferW = 4;
  let bufferH = 4;
  let aspect = 1.85;
  const resize = (width: number, height: number): void => {
    const w = Math.max(2, width);
    const h = Math.max(2, height);
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO, MAX_BUFFER_WIDTH / w);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    bufferW = Math.max(2, Math.floor(w * ratio));
    bufferH = Math.max(2, Math.floor(h * ratio));
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    solidTarget.setSize(bufferW, bufferH);
    drawTarget.setSize(bufferW, bufferH);
    const maskW = Math.max(2, Math.round(MASK_HEIGHT * aspect));
    maskRead.setSize(maskW, MASK_HEIGHT);
    maskWrite.setSize(maskW, MASK_HEIGHT);
    maskUniforms.uAspect.value = aspect;
    compositeUniforms.uAspect.value = aspect;
    compositeUniforms.uPixel.value.set(1 / bufferW, 1 / bufferH);
    // Lines are a pixel and a bit wide on a 1080-row buffer and grow with it.
    compositeUniforms.uLine.value = Math.max(1, bufferH / 900);
  };

  const spin = new THREE.Quaternion();
  const frame = (f: Frame): void => {
    if (disposed) return;
    for (const rig of [solidRig, drawRig]) {
      rig.position.copy(f.pose.pos);
      rig.quaternion.copy(f.pose.q);
      rig.scale.setScalar(f.pose.scale);
    }
    for (const w of wheels) {
      spin.setFromAxisAngle(w.axis, w.sign * f.pose.wheel);
      w.node.quaternion.copy(w.base).multiply(spin);
    }

    renderer.setRenderTarget(solidTarget);
    renderer.clear();
    renderer.render(solidScene, camera);
    renderer.setRenderTarget(drawTarget);
    renderer.clear();
    renderer.render(drawScene, camera);

    if (!f.split) {
      const u = maskUniforms;
      u.uPrev.value = maskRead.texture;
      // The blur is per frame, so on a fast screen it is made narrower.
      const spread = 1.4 * Math.sqrt(Math.min(2, f.dt * 60));
      u.uTexel.value.set(spread / maskRead.width, spread / maskRead.height);
      u.uTime.value = f.time;
      u.uKeep.value = Math.exp(-f.dt / 3.2);
      u.uDrop.value = 0.03 * f.dt;
      u.uFloor.value = floats || f.dt === 0 ? 0 : 0.0045;
      u.uFlow.value = 0.08 * f.dt;
      for (let i = 0; i < STROKES; i += 1) {
        const s = f.strokes[i];
        if (s && s.strength > 0) {
          // The shader's y runs up the screen; the page's runs down.
          u.uSeg.value[i].set(s.ax * aspect, 1 - s.ay, s.bx * aspect, 1 - s.by);
          u.uBlob.value[i].set(s.radius, s.strength);
        } else {
          u.uBlob.value[i].set(0, 0);
        }
      }
      quad.material = maskMat;
      renderer.setRenderTarget(maskWrite);
      renderer.render(quadScene, quadCamera);
      const swap = maskRead;
      maskRead = maskWrite;
      maskWrite = swap;
    }

    const c = compositeUniforms;
    c.uMask.value = maskRead.texture;
    c.uTime.value = f.time;
    c.uSplit.value = f.split ? 1 : 0;
    c.uOpen.value = f.open;
    c.uSpot.value.set(f.spotX * aspect, 1 - f.spotY, 0.75 * f.pose.scale);
    quad.material = compositeMat;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCamera);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const part of robotParts) part.dispose();
    for (const thing of disposables) thing.dispose();
    renderer.dispose();
    // Browsers allow a page only a few contexts. Give this one back now
    // rather than when the canvas is collected.
    renderer.forceContextLoss();
  };

  return { resize, frame, redrawLabels, stage: () => progress, ready, dispose };
}
