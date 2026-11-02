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
  /** Shaded: the lights instead of the ones it has by default. `key` is
   *  where the key light is from, x to the right of the screen, y up and z
   *  toward the lens, and how strong it is; `sky` the hemisphere's
   *  strength, `fill` the dim second light's and `fillAt` where it is from
   *  (unset, opposite the key). */
  light?: { key: [number, number, number]; keyI: number; sky: number; fill: number; fillAt?: [number, number, number] };
  /** Shaded: each part in its own colour from the model, as a grey (how
   *  light the colour is), no darker than DARKEST so a black part still
   *  shows its shape, instead of every part in the one grey. */
  colours?: boolean;
  /** `colours`: how far apart the parts' greys stay, as a power on their
   *  ratio to COLOUR_MIDDLE: 1 as the model has them, less pulls every
   *  part toward the middle, so the light and shade across the robot
   *  count for more than which part is which. */
  colourSpread?: number;
  /** A low round plinth under it, which turns and rises with it. */
  pedestal?: boolean;
  /** Robot height as a share of the canvas height when parked. */
  fill?: number;
  /** Put the floor the robot stands on at the bottom edge of the frame,
   *  so its wheels rest on the edge with no air under them, instead of
   *  centring the frame on the robot's middle. */
  floorAtBottom?: boolean;
  /** The camera's height over the floor in wheel radii: 1 is level with
   *  the axles, the middle of the wheels. Unset, a little over the axles
   *  (8% of its height). */
  eye?: number;
  /** Look down at its middle from this many degrees over level instead,
   *  the frame centred on it: the tops of its deck and rails show. */
  elevation?: number;
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
  /** Put its centre at this share of the canvas width (0 left, 1 right)
   *  and roll the wheels by the distance covered. For a drive the page
   *  plots itself. Draws. */
  moveTo(xFrac: number): void;
  /** Drive along a curve in the floor from one share of the width to
   *  another, t in 0..1: a cubic that sets off at ARC_HEADING, swings out
   *  toward the lens and comes back in to park heading right, the robot
   *  turned to the curve's tangent the whole way and the wheels rolling by
   *  the arc covered. Draws. */
  arc(fromFrac: number, toFrac: number, t: number): void;
  /** The heading the arc sets off on, radians of yaw. A turn before it
   *  should end here, so the two join without a kink. */
  readonly ARC_HEADING: number;
  /** Set the wheels outright (not by the distance since the last call,
   *  as moveTo and seek do): as if it had gone `forward` metres along its
   *  heading and turned `turned` radians on the spot, each wheel rolling
   *  the ground its own place covers. Draws. */
  wheelsTo(forward: number, turned: number): void;
  /** Draws how near each part is to the lens instead of its shading:
   *  white at the nearest any part of it can come at any heading, black at
   *  the furthest, for a bake that fades its far side. The next draw is
   *  shaded again. */
  renderDepth(): void;
  /** The wheels' radius and the drivetrain's half-width (centre to the
   *  wheels' planes), and its height, metres. Zero until ready. */
  measure(): { radius: number; halfTrack: number; height: number };
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
/** `colours`: the darkest a part is drawn, linear: about black plastic's. */
const DARKEST = 0.04;
/** `colourSpread` pulls the parts' greys toward this one, linear. */
const COLOUR_MIDDLE = 0.25;
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

type Wheel = {
  node: THREE.Object3D;
  axis: THREE.Vector3;
  sign: number;
  radius: number;
  /** As it was in the glb, for wheelsTo. */
  rest: THREE.Quaternion;
  /** Its centre across the robot (+z its right), metres. */
  z: number;
};

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
  light,
  colours = false,
  colourSpread = 1,
  pedestal = false,
  fill: FILL_OPT = FILL,
  floorAtBottom = false,
  eye: eyeRadii,
  elevation,
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
    scene.add(new THREE.HemisphereLight(0xfff4f8, 0x5a5660, light?.sky ?? (shaded ? 0.7 : 1.3)));
    const key = new THREE.DirectionalLight(0xffffff, light?.keyI ?? (shaded ? 2.6 : 1.7));
    key.position.set(...(light?.key ?? [-2, 3, 4]));
    if (shaded) {
      // A proper key: it throws shadows, so the lift shades the drivetrain
      // and the channels shade each other. The shadow camera is a box a
      // metre across round the robot, which is all it ever needs; from the
      // side (`light`) the robot's box is longer across the light, and the
      // box is let out round it.
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = light ? -0.9 : -0.6;
      key.shadow.camera.right = light ? 0.9 : 0.6;
      key.shadow.camera.top = light ? 0.9 : 0.8;
      key.shadow.camera.bottom = light ? -0.9 : -0.3;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 12;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.01;
    }
    scene.add(key);
    // A second, dimmer light from the other side, so the faces the key
    // does not reach are shaded rather than flat.
    const fill = new THREE.DirectionalLight(0xffe8f0, light?.fill ?? (shaded ? 0.2 : 0.5));
    if (light) fill.position.set(...(light.fillAt ?? [-light.key[0], 1, -light.key[2]]));
    else fill.position.set(3, 1, -2);
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
    const centreY = floorAtBottom ? halfHeight : height / 2;
    if (elevation !== undefined) {
      const a = (elevation * Math.PI) / 180;
      camera.position.set(0, centreY + Math.sin(a) * dist, Math.cos(a) * dist);
      camera.lookAt(0, centreY, 0);
      camera.clearViewOffset();
    } else {
      const eye = eyeRadii !== undefined ? axleY * eyeRadii : axleY + height * 0.08;
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
      const up = ((centreY - eye) / halfHeight) * (h / 2);
      camera.setViewOffset(w, h, 0, -up, w, h);
    }
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
    // `colours`: the grey each of the model's materials is drawn in.
    const greys = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && shaded) {
        (o as THREE.Mesh).castShadow = true;
        (o as THREE.Mesh).receiveShadow = true;
      }
      if (shaded && colours && (o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const now = old.map((m) => {
          let grey = greys.get(m);
          if (!grey) {
            const c = (m as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1);
            const own = Math.max(DARKEST, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
            const v = COLOUR_MIDDLE * (own / COLOUR_MIDDLE) ** colourSpread;
            grey = new THREE.MeshStandardMaterial({ color: new THREE.Color(v, v, v), roughness: 0.5, metalness: 0.08 });
            greys.set(m, grey);
          }
          return grey;
        });
        for (const m of old) m.dispose();
        mesh.material = Array.isArray(mesh.material) ? now : now[0];
      } else if (flat && (o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of old) m.dispose();
        mesh.material = flat;
      }
      const data = o.userData as {
        axis?: number[];
        sign?: number;
        radius?: number;
      };
      if (/^wheel_/.test(o.name) && data.axis && data.radius) {
        wheels.push({
          node: o,
          axis: new THREE.Vector3().fromArray(data.axis).normalize(),
          sign: data.sign ?? 1,
          radius: data.radius,
          rest: o.quaternion.clone(),
          z: 0,
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
    robot.updateMatrixWorld(true);
    for (const w of wheels) {
      const c = new THREE.Box3().setFromObject(w.node).getCenter(new THREE.Vector3());
      w.z = robot.worldToLocal(c).z;
    }
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

  // The curve's control points, as shares of the distance D between the
  // two stations: the first pulls back and out toward the lens (+z), the
  // second sits on the line in from the park, so the path arrives square.
  const ARC_P1 = { x: -0.6, z: 0.45 };
  const ARC_P2 = { x: -0.55, z: 0 };
  const ARC_HEADING = Math.atan2(-ARC_P1.z, ARC_P1.x);
  const arcPoint = (x0: number, x3: number, t: number) => {
    const D = x3 - x0;
    const p1x = x0 + ARC_P1.x * D,
      p1z = ARC_P1.z * D;
    const p2x = x3 + ARC_P2.x * D,
      p2z = ARC_P2.z * D;
    const u = 1 - t;
    const x = u * u * u * x0 + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * x3;
    const z = 3 * u * u * t * p1z + 3 * u * t * t * p2z;
    const dx = 3 * u * u * (p1x - x0) + 6 * u * t * (p2x - p1x) + 3 * t * t * (x3 - p2x);
    const dz = 3 * u * u * p1z + 6 * u * t * (p2z - p1z) + 3 * t * t * (0 - p2z);
    return { x, z, dx, dz };
  };
  const arc = (fromFrac: number, toFrac: number, t: number) => {
    if (disposed || !loaded) return;
    const x0 = (fromFrac * 2 - 1) * halfWidth;
    const x3 = (toFrac * 2 - 1) * halfWidth;
    const { x, z, dx, dz } = arcPoint(x0, x3, Math.min(1, Math.max(0, t)));
    // Heading from the tangent. Forward is +x at yaw 0 and yaw turns it
    // toward -z, so yaw = atan2(-dz, dx). The wheels roll by the ground
    // covered, along whichever way the robot is pointing.
    const ds = Math.hypot(x - robot.position.x, z - robot.position.z);
    for (const w of wheels) w.node.rotateOnAxis(w.axis, (w.sign * ds) / w.radius);
    robot.position.x = x;
    robot.position.z = z;
    turn = Math.atan2(-dz, dx);
    robot.rotation.y = (facing < 0 ? Math.PI : 0) + turn;
    render();
  };

  const spun = new THREE.Quaternion();
  const wheelsTo = (forward: number, turned: number) => {
    if (disposed || !loaded) return;
    for (const w of wheels) {
      w.node.quaternion
        .copy(w.rest)
        .multiply(spun.setFromAxisAngle(w.axis, (w.sign * (forward + w.z * turned)) / w.radius));
    }
    render();
  };
  // renderDepth's: every part plain white, fogged to black from the
  // nearest any part can be (the footprint's half diagonal in front of its
  // middle) to the furthest.
  const plain = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const renderDepth = () => {
    if (disposed || !loaded) return;
    const middle = robot.position.clone();
    middle.y += height / 2;
    const d = camera.position.distanceTo(middle);
    const r = Math.hypot(length, width) / 2;
    scene.fog = new THREE.Fog(0x000000, d - r, d + r);
    scene.overrideMaterial = plain;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.fog = null;
    dirty = true;
  };
  const measure = () => ({
    radius: wheels[0]?.radius ?? 0,
    halfTrack: wheels.length ? wheels.reduce((a, w) => a + Math.abs(w.z), 0) / wheels.length : 0,
    height: loaded ? height : 0,
  });

  const moveTo = (xFrac: number) => {
    if (disposed || !loaded) return;
    const x = (xFrac * 2 - 1) * halfWidth;
    roll(x - robot.position.x);
    robot.position.x = x;
    render();
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
    plain.dispose();
    renderer.dispose();
    canvas.remove();
  };

  return {
    play,
    seek,
    yaw,
    rise,
    moveTo,
    arc,
    ARC_HEADING,
    wheelsTo,
    renderDepth,
    measure,
    topPx,
    frontPx,
    canvas,
    source,
    dispose,
    ready,
  };
}
