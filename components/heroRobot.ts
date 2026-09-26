import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { CanvasSource } from "@/components/valley/barShader";

/**
 * The robot driving in, as an overlay.
 *
 * mountHeroRobot() makes its own canvas, transparent, that nothing can
 * click through to — pointer-events: none — so the page underneath reads,
 * scrolls and selects exactly as it did. The robot enters from off the
 * left edge, drives right, and eases to a stop with its front quarter past
 * the right edge and its wheels turning at ground speed. Then it is a
 * still: the frame loop stops, and the canvas is redrawn only on resize.
 *
 * Three imports: three, GLTFLoader, the meshopt decoder. No controls, no
 * shadows, no post. One directional light and one hemisphere light, tuned
 * so the robot's own greys stay off both ends of the scale — it has to
 * read on a light page and on a dark one.
 *
 * Where the canvas lives is the one option beyond the brief. By default it
 * is fixed to the viewport and does not scroll, which is the brief. Given
 * a `container` it is absolute inside that element instead, sized to it,
 * and scrolls with it — which is what a robot standing beside a paragraph
 * halfway down the page needs, or it would drive in unseen and then sit
 * over the footer.
 *
 * The camera is on the robot's RIGHT side, not its left as the brief says.
 * With x forward and y up, the right side is +z, and a camera at +z is the
 * one that puts +x on the right of the screen — which is the visible
 * requirement: entering from the left, driving to the right. From the left
 * side it would drive right to left.
 *
 * Under 640px wide it does not mount at all. Scaling the framing down
 * leaves a toy-sized robot with a page's worth of empty canvas around it,
 * and a phone gets nothing out of a 2 s drive-in it cannot see whole.
 */

export type HeroRobotOptions = {
  /** The baked .glb (tools/bake_hero.mjs). */
  url: string;
  /** Stacking order of the canvas. Default 5: over content, under a nav. */
  zIndex?: number;
  /** Mount inside this element instead of fixed to the viewport. */
  container?: HTMLElement;
  /** Which edge it drives in from. It always parks on the right with a
   *  quarter of its length past the edge; from the right it faces left
   *  and that quarter is its tail. Default left, as the brief has it. */
  enterFrom?: "left" | "right";
  /** How far in from the entry edge its leading edge stops, CSS px.
   *  Unset, it parks with a quarter of its length past the far edge. */
  travel?: number;
  /** How far in from the entry edge its TRAILING edge stops, CSS px —
   *  the whole robot on screen, with this much room behind it. Wins over
   *  `travel`. Allow a few percent over the box's own length: the near
   *  wheels are closer to the lens and bulge past the model's box. */
  inset?: number;
  /** Draw it as one flat shape in this colour, unlit. */
  silhouette?: string;
  /** Render to a canvas of this size that is NOT put on the page. The
   *  result is read back through `source`, for feeding to a bar canvas
   *  (valley/barShader) as a layer, so the robot is drawn in the same
   *  vertical bars as the landscape. Transparent where it is not, white
   *  where it is unless `silhouette` says otherwise. */
  offscreen?: { width: number; height: number };
  /** Where its centre stops, CSS px from the left of the canvas. Wins over
   *  `inset` and `travel`. */
  endX?: number;
  /** Off screen: keep the lights and draw every part in one neutral grey,
   *  so what comes out is the SHADING alone, for a dither to read. A real
   *  key with a shadow map, so parts shade each other. */
  shaded?: boolean;
  /** A low round plinth under it, which turns and rises with it. */
  pedestal?: boolean;
  /** Robot height as a share of the canvas height when parked. */
  fill?: number;
  /** Put the floor the robot stands on at the bottom edge of the frame,
   *  so its wheels rest on the edge with no air under them, instead of
   *  centring the frame on the robot's middle. */
  floorAtBottom?: boolean;
};

export type HeroRobot = {
  /** Drive in on its own clock. Idempotent: a second call while playing or parked does nothing. */
  play(): void;
  /** Put the robot at a point along its drive, 0 off the left edge to 1
   *  parked, and draw it. For a drive-in run by the scroll: call it from a
   *  scrubbed trigger and there is no frame loop at all. */
  seek(t: number): void;
  /** Remove the canvas and free the renderer, geometry and materials. */
  dispose(): void;
  /** Turn it about its up axis, radians, on top of its heading — for a
   *  drift into place: come in angled and straighten up. Draws. */
  yaw(rad: number): void;
  /** Raise it from below the frame's bottom edge (0) to standing on the
   *  floor (1). Draws. */
  rise(t: number): void;
  /** Where its top is right now, CSS px from the canvas's top. */
  topPx(): number;
  /** Where its leading edge is right now, CSS px from the canvas's left.
   *  For a wipe that follows it across the page. */
  frontPx(): number;
  /** The canvas it draws on. */
  canvas: HTMLCanvasElement;
  /** The canvas as a bar-shader layer source: update() says whether it
   *  drew since the last upload. */
  source: CanvasSource;
  /** Resolves once the glb is decoded and the first frame could draw. */
  ready: Promise<void>;
};

/** The shot. */
const FOV = 40;
/** Robot height as a share of the canvas height when parked. */
const FILL = 0.9;
/** How much of the robot's length is on screen when parked. */
const VISIBLE = 0.75;
/** The drive, seconds, and its curve. */
const DURATION = 2.0;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/** Pixel ratio cap. */
const MAX_DPR = 2;
const MIN_WIDTH = 640;

type Wheel = { node: THREE.Object3D; axis: THREE.Vector3; sign: number; radius: number };

export function mountHeroRobot({
  url,
  zIndex = 5,
  container,
  enterFrom = "left",
  travel,
  inset,
  silhouette,
  offscreen,
  endX,
  shaded = false,
  pedestal = false,
  fill: FILL_OPT = FILL,
  floorAtBottom = false,
}: HeroRobotOptions): HeroRobot | null {
  if (typeof window === "undefined" || window.innerWidth < MIN_WIDTH) return null;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  if (offscreen) {
    canvas.width = offscreen.width;
    canvas.height = offscreen.height;
  } else {
    Object.assign(canvas.style, {
      position: container ? "absolute" : "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: String(zIndex),
    } satisfies Partial<CSSStyleDeclaration>);
    (container ?? document.body).appendChild(canvas);
  }

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(offscreen ? 1 : Math.min(MAX_DPR, window.devicePixelRatio || 1));
  if (shaded) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
  if (!silhouette) {
    // Two lights, no shadows. The hemisphere fills from a warm sky and a
    // neutral ground so no face goes black; the key is soft enough that
    // the lit faces stay under white.
    // Harder when it is shaded for a dither: less fill, more key, so the
    // faces the key misses fall to the grade's floor.
    scene.add(new THREE.HemisphereLight(0xfff4f8, 0x5a5660, shaded ? 0.7 : 1.3));
    const key = new THREE.DirectionalLight(0xffffff, shaded ? 2.6 : 1.7);
    key.position.set(-2, 3, 4);
    if (shaded) {
      // A proper key: it throws shadows, so the lift shades the drivetrain
      // and the channels shade each other. The shadow camera is a box a
      // metre across round the robot, which is all it ever needs.
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -0.6;
      key.shadow.camera.right = 0.6;
      key.shadow.camera.top = 0.8;
      key.shadow.camera.bottom = -0.3;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 12;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.01;
    }
    scene.add(key);
    // A second, dimmer light from the other side, so the faces the key
    // does not reach are shaded rather than flat.
    const fill = new THREE.DirectionalLight(0xffe8f0, shaded ? 0.2 : 0.5);
    fill.position.set(3, 1, -2);
    scene.add(fill);
  }
  // One flat unlit colour on every part: the robot is its outline, and
  // the outline is where the wheels' rollers show it turning.
  const flatColour = silhouette ?? (offscreen && !shaded ? "#ffffff" : undefined);
  const flat = flatColour
    ? new THREE.MeshBasicMaterial({ color: new THREE.Color(flatColour) })
    : shaded
      ? new THREE.MeshStandardMaterial({ color: 0xc4c4c4, roughness: 0.5, metalness: 0.08 })
      : null;

  const robot = new THREE.Group();
  // Facing -x when it comes in from the right. The drivetrain is centred
  // on the origin, so the half turn keeps it in place.
  const facing = enterFrom === "right" ? -1 : 1;
  if (facing < 0) robot.rotation.y = Math.PI;
  scene.add(robot);
  const wheels: Wheel[] = [];
  let length = 1;
  let width = 1;
  let height = 1;
  let axleY = 0.05;
  let halfWidth = 1;
  let startX = 0;
  let parkX = 0;
  let disposed = false;
  let loaded = false;
  let playing = false;
  let parked = false;
  let progress = 0;
  let turn = 0;
  let lift = 1;
  let frameBottom = 0;
  let frameTop = 1;
  let dirty = false;
  let raf = 0;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const box = () => {
    if (offscreen) return { w: offscreen.width, h: offscreen.height };
    const w = container ? container.clientWidth : window.innerWidth;
    const h = container ? container.clientHeight : window.innerHeight;
    return { w: Math.max(2, w), h: Math.max(2, h) };
  };

  /** Camera distance from the fov and the robot's height, then the x of
   *  the two ends of the drive from the frame's half-width at that distance. */
  const frame = () => {
    const { w, h } = box();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const halfHeight = height / FILL_OPT / 2;
    const dist = halfHeight / Math.tan((FOV * Math.PI) / 360);
    halfWidth = halfHeight * camera.aspect;
    const eye = axleY + height * 0.08;
    camera.position.set(0, eye, dist);
    camera.lookAt(0, eye, 0);
    // The eye is at axle height and level, so the frame's centre is at the
    // axle — and the robot's top half is above the frame. An off-axis
    // lens: the frame is slid up to centre on the robot's middle while the
    // eye and the horizon stay where they are, which is the only way
    // "level, at axle height" and "fills 90% of the height" both hold.
    // The frame is centred on the robot's middle, or — with the floor at
    // the bottom — its bottom edge is put on y = 0 and it reaches up from
    // there, so the wheels sit on the edge.
    const centreY = floorAtBottom ? halfHeight : height / 2;
    const up = ((centreY - eye) / halfHeight) * (h / 2);
    camera.setViewOffset(w, h, 0, -up, w, h);
    camera.updateProjectionMatrix();
    // The frame's top and bottom in world y, at the robot's plane.
    frameTop = centreY + halfHeight;
    frameBottom = centreY - halfHeight;
    placeY();
    // Parked on the right either way. With `travel`, its leading edge
    // stops that far in from the edge it came through; without, (1 -
    // VISIBLE) of its length is past the far edge — the front if it came
    // from the left, the tail if from the right. Off the far side to start.
    if (endX !== undefined) {
      parkX = (endX / w) * 2 * halfWidth - halfWidth;
    } else if (inset !== undefined) {
      const inward = (inset / w) * 2 * halfWidth;
      parkX = facing > 0 ? -halfWidth + inward + length / 2 : halfWidth - inward - length / 2;
    } else if (travel !== undefined) {
      const inward = (travel / w) * 2 * halfWidth;
      parkX = facing > 0 ? -halfWidth + inward - length / 2 : halfWidth - inward + length / 2;
    } else {
      parkX = halfWidth - length / 2 + (1 - VISIBLE) * length;
    }
    // Off the far side to start, by the footprint's DIAGONAL: turned by a
    // yaw, a corner of it reaches further than half its length.
    const reach = Math.hypot(length, width) / 2 + 0.03;
    startX = facing > 0 ? -halfWidth - reach : halfWidth + reach;
    // The camera follows nothing: only the robot moves. Its screen
    // position survives an aspect change by re-deriving from progress.
    robot.position.x = startX + (parkX - startX) * (reduced ? 1 : progress);
  };

  const render = () => {
    if (disposed || !loaded) return;
    renderer.render(scene, camera);
    dirty = true;
  };
  /** Its y for the current lift: standing at 0, or down past the frame's
   *  bottom edge with all of it — plinth included — out of view. */
  const placeY = () => {
    const below = frameBottom - height - 0.08;
    robot.position.y = below * (1 - lift);
  };
  const rise = (t: number) => {
    if (disposed) return;
    lift = Math.min(1, Math.max(0, t));
    placeY();
    render();
  };
  const topPx = () => {
    const { h } = box();
    const worldTop = robot.position.y + height;
    return ((frameTop - worldTop) / (frameTop - frameBottom)) * h;
  };
  const source: CanvasSource = {
    canvas,
    animated: true,
    update: () => {
      const drew = dirty;
      dirty = false;
      return drew;
    },
  };
  /** Screen x of the leading edge, from the canvas's left, in its px.
   *  The footprint turned by the yaw: length along the heading, width
   *  across it. */
  const frontPx = () => {
    const { w } = box();
    const reach = (length / 2) * Math.abs(Math.cos(turn)) + (width / 2) * Math.abs(Math.sin(turn));
    const edge = robot.position.x + facing * reach;
    return ((edge / halfWidth + 1) / 2) * w;
  };
  const yaw = (rad: number) => {
    if (disposed) return;
    turn = rad;
    robot.rotation.y = (facing < 0 ? Math.PI : 0) + rad;
    render();
  };

  const ready = (async () => {
    // Low priority: this must never queue ahead of the page's own assets.
    const response = await fetch(url, { priority: "low" } as RequestInit);
    const bytes = await response.arrayBuffer();
    if (disposed) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    if (disposed) return;
    robot.add(gltf.scene);
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && shaded) {
        (o as THREE.Mesh).castShadow = true;
        (o as THREE.Mesh).receiveShadow = true;
      }
      if (flat && (o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of old) m.dispose();
        mesh.material = flat;
      }
      const data = o.userData as { axis?: number[]; sign?: number; radius?: number };
      if (/^wheel_/.test(o.name) && data.axis && data.radius) {
        wheels.push({
          node: o,
          axis: new THREE.Vector3().fromArray(data.axis).normalize(),
          sign: data.sign ?? 1,
          radius: data.radius,
        });
      }
    });
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const size = bounds.getSize(new THREE.Vector3());
    length = size.x;
    width = size.z;
    height = size.y;
    if (pedestal) {
      // A plinth: a low, wide disc it stands on. Its material is whatever
      // the robot's is, so it dithers the same.
      const r = Math.hypot(length, width) * 0.56;
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 1.04, 0.035, 64),
        flat ?? new THREE.MeshStandardMaterial({ color: 0xc4c4c4, roughness: 0.5 }),
      );
      disc.position.y = -0.0175;
      if (shaded) {
        disc.receiveShadow = true;
        disc.castShadow = true;
      }
      robot.add(disc);
    }
    axleY = wheels[0]?.radius ?? size.y * 0.1;
    loaded = true;
    frame();
    if (reduced) parked = true;
    render();
  })();

  // dx is world x; the wheels turn on the robot's own forward, which is
  // -x world when it faces left.
  const roll = (dx: number) => {
    for (const w of wheels) w.node.rotateOnAxis(w.axis, (w.sign * facing * dx) / w.radius);
  };

  let t0 = 0;
  let pausedAt = 0;
  const step = (now: number) => {
    if (disposed || !playing) return;
    const t = Math.min(1, (now - t0) / 1000 / DURATION);
    progress = easeOutCubic(t);
    const x = startX + (parkX - startX) * progress;
    roll(x - robot.position.x);
    robot.position.x = x;
    render();
    if (t >= 1) {
      playing = false;
      parked = true;
      return;
    }
    raf = requestAnimationFrame(step);
  };

  const play = () => {
    if (disposed || playing || parked) return;
    ready.then(() => {
      if (disposed || playing || parked) return;
      if (reduced) return;
      playing = true;
      t0 = performance.now();
      raf = requestAnimationFrame(step);
    });
  };

  const seek = (t: number) => {
    if (disposed) return;
    progress = Math.min(1, Math.max(0, t));
    parked = progress >= 1;
    if (!loaded) return;
    const x = startX + (parkX - startX) * progress;
    roll(x - robot.position.x);
    robot.position.x = x;
    render();
  };

  const onResize = () => {
    if (!loaded) return;
    frame();
    render();
  };
  // A hidden tab freezes the clock, so the drive resumes where it was.
  const onVisibility = () => {
    if (!playing) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      pausedAt = performance.now();
    } else {
      t0 += performance.now() - pausedAt;
      raf = requestAnimationFrame(step);
    }
  };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    robot.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) m.dispose();
      }
    });
    renderer.dispose();
    canvas.remove();
  };

  return { play, seek, yaw, rise, topPx, frontPx, canvas, source, dispose, ready };
}
