import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CanvasSource } from "@/components/valley/barShader";
import { buildChannels, PICTURE_H, PICTURE_W } from "./channels";
import {
  aimCamera,
  CURVE_DROP,
  type Layout,
  layoutFor,
  mix,
  modelPlacement,
  MODEL_YAW,
  pictureCorners,
  projectRoot,
  rootRotation,
  SCREEN,
  type Screen,
  screenFromGlass,
  setBox,
  type ScrollState,
  stateAt,
} from "./layout";
import { SCREEN_FRAG, SCREEN_VERT } from "./shaders";

/**
 * The television, drawn off screen for the bar shader to read.
 *
 * One three.js renderer on a canvas that is never put on the page. Each
 * frame it draws the current channel into a small texture, then the set
 * with that texture on its glass. The bar engine uploads the canvas right
 * after and redraws it as blossom bars on the plum ground.
 *
 * The page hands it the scroll state and the cursor; it keeps nothing of
 * the page's own.
 */

export type Tv = {
  source: CanvasSource;
  /** The stage's CSS size. */
  resize(width: number, height: number): void;
  setState(state: ScrollState): void;
  /** Cursor across the stage, -1..1 each way. */
  pointer(cx: number, cy: number): void;
  /** Draws once, for the still frame. */
  renderNow(): void;
  redrawCard(mono: string, sans: string): void;
  layout(): Layout;
  /** Where things are on the stage now, shares of its size. For the dev handle. */
  measure(): { set: { x0: number; y0: number; x1: number; y1: number }; screen: { x: number; y: number }[] };
  ready: Promise<void>;
  dispose(): void;
};

/** The source canvas is never wider than this. The bars sample it about once per 5 texels; more is wasted. */
const SOURCE_MAX_W = 1600;
/** Scanlines across the picture: coarse, so the bar rows can show them. */
const SCAN_LINES = 26;

// Where the television's texture is laid out (flipY off, so v runs down
// the image). Found by looking at crt-basecolor.webp: the glass, and the
// two stickers on the cabinet's side. Shares of the image.
const TEX_GLASS: readonly [number, number, number, number] = [0.0, 0.22, 0.245, 0.54];
const TEX_STICKERS: readonly [number, number, number, number] = [0.33, 0.31, 0.49, 0.55];

/**
 * The printed labels must not read. Every bright texel (the print, the
 * badges, the stickers) is pulled down to the plastic's own tone, the
 * sticker patch is blurred into the cabinet, and the glass is darkened so
 * the rim round the picture reads as dark glass.
 */
function hideLabels(image: HTMLImageElement | ImageBitmap): HTMLCanvasElement | null {
  const w = image.width;
  const h = image.height;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const px = ctx.getImageData(0, 0, w, h);
  const d = px.data;
  // The body sits at 30 to 60. Above 58, what is left is kept to a tenth,
  // so print and badges come out a shade off the plastic.
  const knee = 58;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (lum <= knee) continue;
    const k = (knee + (lum - knee) * 0.1) / lum;
    d[i] *= k;
    d[i + 1] *= k;
    d[i + 2] *= k;
  }
  ctx.putImageData(px, 0, 0);
  // The stickers: blurred hard, then darkened, so no shape is left.
  const patch = (r: readonly [number, number, number, number], blurPx: number, shade: string): void => {
    const x = Math.floor(r[0] * w);
    const y = Math.floor(r[1] * h);
    const pw = Math.ceil((r[2] - r[0]) * w);
    const ph = Math.ceil((r[3] - r[1]) * h);
    const tmp = document.createElement("canvas");
    tmp.width = pw;
    tmp.height = ph;
    const t = tmp.getContext("2d");
    if (!t) return;
    t.drawImage(canvas, x, y, pw, ph, 0, 0, pw, ph);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, pw, ph);
    ctx.clip();
    // Where the browser has no canvas filter this is a plain copy, and the
    // shade below still covers it.
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(tmp, x, y);
    ctx.filter = "none";
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, pw, ph);
    ctx.restore();
  };
  patch(TEX_STICKERS, Math.round(w * 0.02), "rgba(24, 22, 20, 0.7)");
  patch(TEX_GLASS, Math.round(w * 0.004), "rgba(10, 10, 12, 0.75)");
  return canvas;
}

/** The glass, measured from the mesh: front-facing faces behind the bezel's front, above the deck. */
function measureGlass(model: THREE.Object3D): Screen | null {
  model.updateMatrixWorld(true);
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const box = new THREE.Box3().setFromObject(model);
  const floorY = box.min.y + 0.25 * (box.max.y - box.min.y);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let count = 0;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    const nor = mesh.geometry.attributes.normal;
    if (!pos || !nor) return;
    nm.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < pos.count; i += 1) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      if (n.z < 0.5 || p.z < 0.3 || p.z > 0.59 || Math.abs(p.x) > 0.9 || p.y < floorY) continue;
      min.min(p);
      max.max(p);
      count += 1;
    }
  });
  if (count < 20) return null;
  const s = screenFromGlass(min.toArray(), max.toArray());
  // A measurement far from the known one means the file changed shape:
  // trust the numbers the layout was checked with.
  if (Math.abs(s.h - SCREEN.h) > 0.2 || Math.abs(s.w - SCREEN.w) > 0.2) return null;
  return s;
}

export function buildTv(options: { still: boolean; mono: string; sans: string }): Tv {
  const { still } = options;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  // Asked for here, not by three, so a browser without it fails before
  // anything is built and the page keeps its words.
  const attributes: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    // The still frame is drawn once and read later (on load, on resize);
    // kept, or the browser may have cleared it by then.
    preserveDrawingBuffer: still,
    powerPreference: "high-performance",
  };
  const gl = canvas.getContext("webgl2", attributes);
  if (!gl) throw new Error("b18: no WebGL2 context");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attributes });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // ------------------------------------------------------ the channels
  const channels = buildChannels(options.mono, options.sans, !still);
  const target = keep(
    new THREE.WebGLRenderTarget(PICTURE_W, PICTURE_H, {
      depthBuffer: true,
      samples: 4,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    }),
  );

  // ------------------------------------------------------ the set
  const scene = new THREE.Scene();
  // Lit softly: a wide sky from above, a key from the front left, a fill
  // from the right, and a rim from behind to lift the top edge off the
  // ground. The plastic is dark, so the lights are strong.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a84, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff0f6, 1.2);
  fill.position.set(4, 1, 3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 2.0);
  rim.position.set(2, 3, -4);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);
  const camera = new THREE.PerspectiveCamera();

  const screenUniforms = {
    uPicture: { value: target.texture as THREE.Texture },
    uTime: { value: 0 },
    uSnow: { value: 0 },
    uRoll: { value: 0 },
    uPower: { value: 1 },
    uLines: { value: SCAN_LINES },
  };
  const screenMat = keep(
    new THREE.ShaderMaterial({ uniforms: screenUniforms, vertexShader: SCREEN_VERT, fragmentShader: SCREEN_FRAG }),
  );
  const screenMesh = new THREE.Mesh(undefined, screenMat);
  root.add(screenMesh);

  /** A plane the glass's shape, its corners fallen back by CURVE_DROP: the slight curve of the tube. */
  const placeScreen = (sc: Screen): void => {
    const aspect = sc.w / sc.h;
    const geo = new THREE.PlaneGeometry(aspect, 1, 24, 20);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const u = pos.getX(i) / (aspect / 2);
      const v = pos.getY(i) / 0.5;
      pos.setZ(i, (-CURVE_DROP * (u * u + v * v)) / 2);
    }
    geo.computeVertexNormals();
    screenMesh.geometry.dispose();
    screenMesh.geometry = geo;
    const at = modelPlacement(sc).screenAt;
    screenMesh.position.set(...at);
  };
  placeScreen(SCREEN);

  let disposed = false;
  let screen = SCREEN;
  const modelParts: { dispose(): void }[] = [];
  const loadTv = (): Promise<void> =>
    new Promise<void>((resolve) => {
      const texLoader = new THREE.TextureLoader();
      const loadTex = (url: string, srgb: boolean, clean: boolean): Promise<THREE.Texture> =>
        new Promise((done) => {
          texLoader.load(
            url,
            (t) => {
              if (clean) {
                const c = hideLabels(t.image as HTMLImageElement);
                if (c) t.image = c;
              }
              t.flipY = false;
              if (srgb) t.colorSpace = THREE.SRGBColorSpace;
              t.anisotropy = 4;
              t.needsUpdate = true;
              done(t);
            },
            undefined,
            () => done(new THREE.Texture()),
          );
        });
      new GLTFLoader().load(
        "/models/crt.glb",
        (gltf) => {
          void Promise.all([
            loadTex("/models/tv-old-tv-retro-tv/textures/crt-basecolor.webp", true, true),
            loadTex("/models/tv-old-tv-retro-tv/textures/crt-normal.webp", false, false),
          ]).then(([map, normalMap]) => {
            modelParts.push(map, normalMap);
            const wrap = new THREE.Group();
            gltf.scene.rotation.y = MODEL_YAW;
            wrap.add(gltf.scene);
            // The plastic is dark (texels at 30 to 60), so its colour is
            // multiplied up: lit, the front comes out near mid grey, and
            // the bars read it as a solid shape rather than a shadow.
            const tvMat = new THREE.MeshStandardMaterial({
              map,
              normalMap,
              color: new THREE.Color(4.5, 4.5, 4.5),
              roughness: 0.62,
              metalness: 0.05,
            });
            modelParts.push(tvMat);
            wrap.traverse((o) => {
              const mesh = o as THREE.Mesh;
              if (!mesh.isMesh) return;
              modelParts.push(mesh.geometry);
              const old = mesh.material as THREE.Material | THREE.Material[];
              if (Array.isArray(old)) old.forEach((m) => m.dispose());
              else old.dispose();
              mesh.material = tvMat;
            });
            if (disposed) {
              for (const part of modelParts) part.dispose();
              resolve();
              return;
            }
            screen = measureGlass(wrap) ?? SCREEN;
            const place = modelPlacement(screen);
            wrap.scale.setScalar(place.scale);
            wrap.position.set(...place.offset);
            root.add(wrap);
            placeScreen(screen);
            resolve();
          });
        },
        undefined,
        () => resolve(),
      );
    });

  // ------------------------------------------------------ state
  let layout = layoutFor(1920, 1038);
  let srcW = 4;
  let srcH = 4;
  let state = stateAt(0);
  const cursor = { x: 0, y: 0, tx: 0, ty: 0 };
  let clock = 0;

  const resize = (width: number, height: number): void => {
    const w = Math.max(2, width);
    const h = Math.max(2, height);
    layout = layoutFor(w, h);
    // One texel per CSS pixel up to the cap. The pixel ratio stays 1: the
    // canvas is a picture for the bars to sample, never shown itself.
    srcW = Math.min(SOURCE_MAX_W, Math.round(w));
    srcH = Math.max(2, Math.round((srcW * h) / w));
    renderer.setPixelRatio(1);
    renderer.setSize(srcW, srcH, false);
  };

  const draw = (time: number): void => {
    if (disposed) return;
    const st = state;
    // The channel, unless it is the card or the set is off.
    if (st.power > 0 && st.shown < channels.list.length) {
      const ch = channels.list[st.shown];
      ch.tick(time);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(ch.scene, ch.camera);
      renderer.setRenderTarget(null);
      screenUniforms.uPicture.value = target.texture;
    } else {
      screenUniforms.uPicture.value = channels.card;
    }
    screenUniforms.uTime.value = time;
    screenUniforms.uSnow.value = st.snow;
    screenUniforms.uRoll.value = st.roll;
    screenUniforms.uPower.value = st.power;

    root.rotation.copy(rootRotation(cursor.x, cursor.y, st.shift));
    aimCamera(camera, srcW, srcH, layout.dist, mix(layout.fx, 0.5, st.shift), layout.fy);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
  };

  const tvReady = loadTv();
  // The still frame waits for the set; the live one starts at once and the
  // set appears when it lands.
  const ready = still
    ? tvReady.then(() => {
        draw(0);
      })
    : Promise.race([tvReady, new Promise<void>((r) => setTimeout(r, 6000))]);

  const source: CanvasSource = {
    canvas,
    animated: !still,
    ready,
    update: (timeSec, dt) => {
      if (disposed) return false;
      clock = timeSec;
      // The cursor is followed with a lag of about a quarter second.
      const k = 1 - Math.exp(-dt * 4);
      cursor.x += (cursor.tx - cursor.x) * k;
      cursor.y += (cursor.ty - cursor.y) * k;
      draw(timeSec);
      return true;
    },
  };

  return {
    source,
    resize,
    setState(s) {
      state = s;
    },
    pointer(cx, cy) {
      cursor.tx = still ? 0 : cx;
      cursor.ty = still ? 0 : cy;
    },
    renderNow() {
      draw(clock);
    },
    redrawCard(mono, sans) {
      channels.redrawCard(mono, sans);
    },
    layout: () => layout,
    measure() {
      aimCamera(camera, srcW, srcH, layout.dist, mix(layout.fx, 0.5, state.shift), layout.fy);
      const rot = rootRotation(cursor.x, cursor.y, state.shift);
      return {
        set: setBox(camera, state.shift),
        screen: projectRoot(pictureCorners(screen), camera, rot).map((p) => ({ x: p.x, y: p.y })),
      };
    },
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      channels.dispose();
      screenMesh.geometry.dispose();
      for (const part of modelParts) part.dispose();
      for (const x of disposables) x.dispose();
      renderer.dispose();
      // Browsers allow a page only a few contexts. Give this one back now.
      renderer.forceContextLoss();
    },
  };
}
