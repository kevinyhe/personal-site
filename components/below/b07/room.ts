import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BAND, BLOSSOM } from "@/components/bandColours";
import {
  aim,
  BOARDS,
  DESK,
  DESK_TOP,
  DRAWERS,
  ease,
  glassTriangles,
  KEYBOARD,
  LAMP,
  LIGHTS,
  makeCamera,
  MODEL,
  MOUSE,
  MUG,
  PANEL,
  type Pose,
  poseAt,
  POSTER,
  ROBOT,
  ROOM,
  RUG,
  SCREEN,
  screenCorners,
  SHELF,
  type Spot,
  stillPose,
  TV_AT,
  TV_SCALE,
} from "./rig";
import { DUST_FRAG, DUST_VERT } from "./shaders";
import {
  AMBER,
  boardTexture,
  DEEP,
  floorTexture,
  haloTexture,
  posterTexture,
  rugTexture,
  screenPictureTexture,
  seeded,
  softDotTexture,
  wallPoolsTexture,
  wallTexture,
  WOOD,
  woodTexture,
} from "./textures";

/**
 * The room and everything in it. This file knows nothing about the page:
 * it is handed a canvas and, each frame, how far along the move in the
 * camera is.
 *
 * The canvas is see-through in one place only, the television's screen.
 * The page's own desktop lies behind the canvas there and shows through.
 */

export type Room = {
  camera: THREE.PerspectiveCamera;
  resize(width: number, height: number): void;
  /** t 0..1 along the move in. time, dt in seconds. lean -1..1 each way. */
  frame(t: number, time: number, dt: number, leanX: number, leanY: number): void;
  /** The one frame for less motion. */
  still(): void;
  corners(): Spot[];
  /** Settles when the television is in, or has failed and the stand-in stays. */
  ready: Promise<void>;
  /** Goes up each time a model or one of its pictures lands, so the page
   *  knows a frame it drew before is out of date. */
  version(): number;
  dispose(): void;
};

const MAX_BUFFER_WIDTH = 2560;
const MAX_RATIO = 1.5;
const DUST = 320;

const TV_TEXTURES = {
  map: "/models/tv-old-tv-retro-tv/textures/crt-basecolor.webp",
  normalMap: "/models/tv-old-tv-retro-tv/textures/crt-normal.webp",
  metalnessMap: "/models/tv-old-tv-retro-tv/textures/crt-metallic.webp",
  roughnessMap: "/models/tv-old-tv-retro-tv/textures/crt-roughness.webp",
};

/** Change a loaded picture's pixels in place, through a canvas. */
function rework(texture: THREE.Texture, change: (data: Uint8ClampedArray) => void): void {
  const image = texture.image as HTMLImageElement | undefined;
  if (!image || !image.width) return;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  change(pixels.data);
  ctx.putImageData(pixels, 0, 0);
  texture.image = canvas;
  texture.needsUpdate = true;
}

export function buildRoom(canvas: HTMLCanvasElement, stillOnly: boolean): Room {
  // Asked for here, not by three, so a browser with no WebGL fails at
  // this line and the page falls back to its words.
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("b07: no WebGL");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  // The soft kind. With it a smaller map gives a softer edge.
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = makeCamera(1.85);
  let alive = true;
  let landed = 0;

  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    owned.push(thing);
    return thing;
  };
  const paint = (colour: string, roughness = 0.7, metalness = 0): THREE.MeshStandardMaterial =>
    keep(new THREE.MeshStandardMaterial({ color: colour, roughness, metalness }));
  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));
  /** A box from its two opposite corners. */
  const block = (
    parent: THREE.Object3D,
    material: THREE.Material,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    shadows = true,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(unitBox, material);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = shadows;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ------------------------------------------------ something to reflect
  // Metal with nothing to reflect is black. This is a small room of its
  // own, drawn once: plum all round, a warm panel and a pink one.
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const around = new THREE.Scene();
    const shellGeo = new THREE.SphereGeometry(20, 24, 12);
    const shellMat = new THREE.MeshBasicMaterial({ color: "#4a1c3c", side: THREE.BackSide });
    around.add(new THREE.Mesh(shellGeo, shellMat));
    const panelGeo = new THREE.PlaneGeometry(1, 1);
    const panels: THREE.MeshBasicMaterial[] = [];
    const panel = (r: number, g: number, b: number, w: number, h: number, x: number, y: number, z: number): void => {
      const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      mat.color.setRGB(r, g, b);
      panels.push(mat);
      const m = new THREE.Mesh(panelGeo, mat);
      m.scale.set(w, h, 1);
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      around.add(m);
    };
    panel(3.2, 2.2, 1.4, 8, 6, -9, 9, 6);
    panel(2.4, 1.3, 1.9, 10, 5, 8, 2, 9);
    panel(1.2, 0.9, 1.2, 14, 4, 0, 12, -8);
    const target = keep(pmrem.fromScene(around, 0.04, 0.1, 50));
    scene.environment = target.texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    shellGeo.dispose();
    shellMat.dispose();
    panelGeo.dispose();
    for (const m of panels) m.dispose();
  }

  // ------------------------------------------------------------- lights
  scene.add(new THREE.HemisphereLight(LIGHTS.sky.above, LIGHTS.sky.below, LIGHTS.sky.level));

  const lamp = new THREE.SpotLight(LIGHTS.lamp.colour, LIGHTS.lamp.candela, 0, LIGHTS.lamp.angle, LIGHTS.lamp.penumbra, 2);
  lamp.position.set(LAMP.head[0], LAMP.head[1], LAMP.head[2]);
  lamp.target.position.set(LAMP.aim[0], LAMP.aim[1], LAMP.aim[2]);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.near = 0.06;
  lamp.shadow.camera.far = 5;
  lamp.shadow.bias = -0.0012;
  lamp.shadow.normalBias = 0.012;
  scene.add(lamp, lamp.target);

  const glow = new THREE.PointLight(LIGHTS.glow.colour, LIGHTS.glow.candela, 0, 2);
  glow.position.set(LIGHTS.glow.at[0], LIGHTS.glow.at[1], LIGHTS.glow.at[2]);
  scene.add(glow);

  // --------------------------------------------------------------- room
  const roomW = ROOM.rightX - ROOM.leftX;
  const roomD = ROOM.frontZ - ROOM.backZ;
  const flat = keep(new THREE.PlaneGeometry(1, 1));

  const floor = new THREE.Mesh(flat, keep(new THREE.MeshStandardMaterial({ map: keep(floorTexture()), roughness: 0.62 })));
  floor.scale.set(roomW, roomD, 1);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((ROOM.leftX + ROOM.rightX) / 2, 0, (ROOM.backZ + ROOM.frontZ) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const paper = keep(wallTexture());
  const backWall = new THREE.Mesh(
    flat,
    keep(
      new THREE.MeshStandardMaterial({
        map: paper,
        roughness: 0.9,
        emissive: "#ffffff",
        emissiveMap: keep(wallPoolsTexture()),
        emissiveIntensity: 0.42,
      }),
    ),
  );
  backWall.scale.set(roomW, ROOM.height, 1);
  backWall.position.set((ROOM.leftX + ROOM.rightX) / 2, ROOM.height / 2, ROOM.backZ);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const leftWall = new THREE.Mesh(
    flat,
    keep(new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9, emissive: "#8a4a74", emissiveIntensity: 0.06 })),
  );
  leftWall.scale.set(roomD, ROOM.height, 1);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(ROOM.leftX, ROOM.height / 2, (ROOM.backZ + ROOM.frontZ) / 2);
  leftWall.receiveShadow = true;
  scene.add(leftWall);

  const skirting = paint("#4a1c3c", 0.6);
  block(scene, skirting, ROOM.leftX, 0, ROOM.backZ, ROOM.rightX, 0.11, ROOM.backZ + 0.02, false);
  block(scene, skirting, ROOM.leftX, 0, ROOM.backZ, ROOM.leftX + 0.02, 0.11, ROOM.frontZ, false);

  const rug = new THREE.Mesh(flat, keep(new THREE.MeshStandardMaterial({ map: keep(rugTexture()), roughness: 0.95 })));
  rug.scale.set(RUG.x1 - RUG.x0, RUG.z1 - RUG.z0, 1);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set((RUG.x0 + RUG.x1) / 2, 0.004, (RUG.z0 + RUG.z1) / 2);
  rug.receiveShadow = true;
  scene.add(rug);

  // The picture is its own light: it has to read in a dark corner.
  const poster = new THREE.Mesh(flat, keep(new THREE.MeshBasicMaterial({ map: keep(posterTexture()) })));
  (poster.material as THREE.MeshBasicMaterial).color.setScalar(0.62);
  poster.scale.set(POSTER.w, POSTER.h, 1);
  poster.position.set(POSTER.cx, POSTER.cy, ROOM.backZ + 0.021);
  scene.add(poster);
  block(
    scene,
    paint(WOOD, 0.5),
    POSTER.cx - POSTER.w / 2 - 0.02,
    POSTER.cy - POSTER.h / 2 - 0.02,
    ROOM.backZ,
    POSTER.cx + POSTER.w / 2 + 0.02,
    POSTER.cy + POSTER.h / 2 + 0.02,
    ROOM.backZ + 0.02,
    false,
  );

  // --------------------------------------------------------------- desk
  const wood = keep(new THREE.MeshStandardMaterial({ map: keep(woodTexture()), roughness: 0.5 }));
  const woodDark = keep(new THREE.MeshStandardMaterial({ map: wood.map, color: "#b8a0a0", roughness: 0.6 }));
  block(scene, wood, -DESK.halfW, DESK_TOP - DESK.thick, DESK.backZ, DESK.halfW, DESK_TOP, DESK.frontZ);
  for (const sx of [-1, 1]) {
    for (const z of [DESK.backZ + DESK.legInset, DESK.frontZ - DESK.legInset - DESK.leg]) {
      const x = sx < 0 ? -DESK.halfW + DESK.legInset : DESK.halfW - DESK.legInset - DESK.leg;
      block(scene, woodDark, x, 0, z, x + DESK.leg, DESK_TOP - DESK.thick, z + DESK.leg);
    }
  }
  block(scene, woodDark, -DESK.halfW + 0.1, 0.42, DESK.backZ + 0.05, DESK.halfW - 0.1, DESK_TOP - DESK.thick, DESK.backZ + 0.07);
  {
    const top = DESK_TOP - DESK.thick;
    block(scene, woodDark, DRAWERS.x0, DRAWERS.y0, DRAWERS.z0, DRAWERS.x1, top, DRAWERS.z1);
    const each = (top - DRAWERS.y0) / 3;
    const pull = paint(AMBER, 0.35, 0.6);
    for (let i = 0; i < 3; i += 1) {
      const y0 = DRAWERS.y0 + i * each + 0.008;
      block(scene, wood, DRAWERS.x0 + 0.01, y0, DRAWERS.z1, DRAWERS.x1 - 0.01, y0 + each - 0.016, DRAWERS.z1 + 0.012);
      const mid = (DRAWERS.x0 + DRAWERS.x1) / 2;
      block(scene, pull, mid - 0.05, y0 + each / 2 - 0.012, DRAWERS.z1 + 0.012, mid + 0.05, y0 + each / 2 - 0.002, DRAWERS.z1 + 0.026, false);
    }
  }

  // -------------------------------------------------------------- shelf
  {
    const x0 = SHELF.x0;
    block(scene, wood, x0, SHELF.y, ROOM.backZ, SHELF.x1, SHELF.y + SHELF.thick, ROOM.backZ + SHELF.depth);
    block(scene, woodDark, x0 + 0.1, SHELF.y - 0.14, ROOM.backZ, x0 + 0.13, SHELF.y, ROOM.backZ + SHELF.depth - 0.04, false);
    block(scene, woodDark, SHELF.x1 - 0.13, SHELF.y - 0.14, ROOM.backZ, SHELF.x1 - 0.1, SHELF.y, ROOM.backZ + SHELF.depth - 0.04, false);
    const rand = seeded(53);
    const covers = [BLOSSOM, "#ffffff", BAND, AMBER, "#8a4a74", BLOSSOM, DEEP, "#c77daa"].map((c) => paint(c, 0.75));
    let x = x0 + 0.06;
    let n = 0;
    while (x < SHELF.x1 - 0.5) {
      const w = 0.025 + rand() * 0.035;
      const h = SHELF.bookH * (0.68 + rand() * 0.32);
      const d = 0.13 + rand() * 0.05;
      const book = block(scene, covers[n % covers.length], x, SHELF.y + SHELF.thick, ROOM.backZ + 0.02, x + w, SHELF.y + SHELF.thick + h, ROOM.backZ + 0.02 + d);
      // The last few lean on the ones before them.
      if (x > SHELF.x1 - 0.62) book.rotation.z = -0.16;
      x += w + 0.004;
      n += 1;
    }
    // Three more, lying flat at the other end.
    for (let i = 0; i < 3; i += 1) {
      const inset = i * 0.012;
      block(
        scene,
        covers[(i * 3 + 1) % covers.length],
        SHELF.x1 - 0.36 + inset,
        SHELF.y + SHELF.thick + i * 0.036,
        ROOM.backZ + 0.03,
        SHELF.x1 - 0.1 - inset,
        SHELF.y + SHELF.thick + (i + 1) * 0.036 - 0.003,
        ROOM.backZ + 0.19,
      );
    }
  }

  // ----------------------------------------------------------- keyboard
  {
    const K = KEYBOARD;
    const body = new THREE.Mesh(keep(new RoundedBoxGeometry(K.w, K.h, K.d, 3, 0.008)), paint("#ecd5e2", 0.55));
    body.position.set(K.cx, DESK_TOP + K.h / 2, K.cz);
    body.castShadow = true;
    body.receiveShadow = true;
    scene.add(body);
    // Five rows. Widths are in key units, fifteen to a row.
    const rows: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
      [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
      [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
      [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
      [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
    ];
    const total = rows.reduce((sum, r) => sum + r.length, 0);
    const unit = (K.w - 0.024) / 15;
    const pitch = (K.d - 0.02) / rows.length;
    const gap = 0.003;
    const keys = new THREE.InstancedMesh(
      keep(new RoundedBoxGeometry(1, 1, 1, 2, 0.12)),
      keep(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 })),
      total,
    );
    const place = new THREE.Matrix4();
    const size = new THREE.Vector3();
    const at = new THREE.Vector3();
    const noTurn = new THREE.Quaternion();
    const plain = new THREE.Color("#4a1c3c");
    const marked = new THREE.Color(BLOSSOM);
    let n = 0;
    rows.forEach((row, r) => {
      let x = K.cx - K.w / 2 + 0.012;
      row.forEach((units, c) => {
        const w = units * unit;
        size.set(w - gap, K.keyH, pitch - gap);
        at.set(x + w / 2, DESK_TOP + K.h + K.keyH / 2 - 0.002, K.cz - K.d / 2 + 0.01 + pitch * (r + 0.5));
        place.compose(at, noTurn, size);
        keys.setMatrixAt(n, place);
        // Escape and Enter are the two keys in blossom.
        const accent = (r === 0 && c === 0) || (r === 2 && c === row.length - 1);
        keys.setColorAt(n, accent ? marked : plain);
        x += w;
        n += 1;
      });
    });
    keys.instanceMatrix.needsUpdate = true;
    if (keys.instanceColor) keys.instanceColor.needsUpdate = true;
    keys.castShadow = true;
    keys.receiveShadow = true;
    scene.add(keys);
    owned.push(keys);
  }

  // -------------------------------------------------------------- mouse
  {
    const M = MOUSE;
    // Half a stretched ball. The half under the desk top is never seen.
    const shell = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), paint("#ecd5e2", 0.45));
    shell.scale.set(M.w / 2, M.h, M.d / 2);
    shell.position.set(M.cx, DESK_TOP, M.cz);
    shell.castShadow = true;
    shell.receiveShadow = true;
    scene.add(shell);
    block(scene, paint("#4a1c3c", 0.5), M.cx - 0.0015, DESK_TOP + M.h * 0.7, M.cz - M.d / 2 + 0.004, M.cx + 0.0015, DESK_TOP + M.h * 0.97, M.cz - 0.012, false);
    // Its lead, round the side of the set and off the back of the desk.
    const lead = new THREE.CatmullRomCurve3([
      new THREE.Vector3(M.cx, DESK_TOP + 0.008, M.cz - M.d / 2),
      new THREE.Vector3(M.cx + 0.03, DESK_TOP + 0.004, M.cz - 0.16),
      new THREE.Vector3(M.cx - 0.01, DESK_TOP + 0.004, -0.05),
      new THREE.Vector3(M.cx + 0.04, DESK_TOP + 0.004, -0.3),
      new THREE.Vector3(M.cx + 0.02, DESK_TOP + 0.004, DESK.backZ - 0.01),
    ]);
    const wire = new THREE.Mesh(keep(new THREE.TubeGeometry(lead, 48, 0.003, 6)), paint(DEEP, 0.6));
    wire.castShadow = true;
    scene.add(wire);
  }

  // ---------------------------------------------------------------- mug
  {
    const G = MUG;
    const glaze = keep(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.25, side: THREE.DoubleSide }));
    const wall = new THREE.Mesh(keep(new THREE.CylinderGeometry(G.r, G.r * 0.9, G.h, 40, 1, true)), glaze);
    wall.position.set(G.cx, DESK_TOP + G.h / 2, G.cz);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    const disc = keep(new THREE.CircleGeometry(1, 40));
    const base = new THREE.Mesh(disc, glaze);
    base.scale.setScalar(G.r * 0.9);
    base.rotation.x = -Math.PI / 2;
    base.position.set(G.cx, DESK_TOP + 0.002, G.cz);
    scene.add(base);
    const drink = new THREE.Mesh(disc, paint("#3a1a1a", 0.2));
    drink.scale.setScalar(G.r * 0.97);
    drink.rotation.x = -Math.PI / 2;
    drink.position.set(G.cx, DESK_TOP + G.h * 0.82, G.cz);
    scene.add(drink);
    const ear = new THREE.Mesh(keep(new THREE.TorusGeometry(0.028, 0.0065, 10, 28, Math.PI)), glaze);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(G.cx - G.r * 0.95, DESK_TOP + G.h * 0.5, G.cz);
    ear.castShadow = true;
    scene.add(ear);
    // A band of blossom round it.
    const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(G.r * 0.985 + 0.0006, G.r * 0.965 + 0.0006, G.h * 0.22, 40, 1, true)), paint(BLOSSOM, 0.3));
    band.position.set(G.cx, DESK_TOP + G.h * 0.6, G.cz);
    scene.add(band);
  }

  // ------------------------------------------------------------- boards
  {
    const B = BOARDS;
    const edge = paint("#4a1a4a", 0.6);
    const chip = paint(DEEP, 0.4);
    const pin = paint(AMBER, 0.3, 0.7);
    const turns = [0.06, -0.12, 0.2, -0.05];
    for (let i = 0; i < B.count; i += 1) {
      const face = keep(new THREE.MeshStandardMaterial({ map: keep(boardTexture(90 + i * 7)), roughness: 0.45 }));
      const holder = new THREE.Group();
      holder.position.set(B.cx + (i % 2 ? 0.012 : -0.008), DESK_TOP + i * B.step, B.cz + (i % 2 ? -0.008 : 0.006));
      holder.rotation.y = turns[i % turns.length];
      scene.add(holder);
      // Six sides: the four edges and the underside plain, the top printed.
      const board = new THREE.Mesh(unitBox, [edge, edge, face, edge, edge, edge]);
      board.scale.set(B.w, 0.0028, B.d);
      board.position.y = 0.0014 + 0.004;
      board.castShadow = true;
      board.receiveShadow = true;
      holder.add(board);
      // Parts stand on each board and hold the next one off it.
      block(holder, chip, -0.05, 0.0068, -0.03, -0.01, 0.0115, 0.0);
      block(holder, chip, 0.02, 0.0068, 0.01, 0.065, 0.0115, 0.04);
      block(holder, pin, -0.08, 0.0068, 0.035, -0.02, 0.0115, 0.043, false);
      if (i === B.count - 1) {
        block(holder, pin, 0.045, 0.0068, -0.05, 0.075, 0.021, -0.03);
        const can = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.009, 0.009, 0.022, 20)), paint(BLOSSOM, 0.3, 0.4));
        can.position.set(-0.065, 0.018, -0.04);
        can.castShadow = true;
        holder.add(can);
      }
    }
  }

  // --------------------------------------------------------------- lamp
  {
    const enamel = paint(BLOSSOM, 0.35, 0.25);
    const joint = paint(AMBER, 0.3, 0.8);
    const rod = keep(new THREE.CylinderGeometry(1, 1, 1, 16));
    const ball = keep(new THREE.SphereGeometry(1, 20, 12));
    const upY = new THREE.Vector3(0, 1, 0);
    /** A rod from one point to another. */
    const between = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): void => {
      const m = new THREE.Mesh(rod, material);
      const span = b.clone().sub(a);
      m.scale.set(radius, span.length(), radius);
      m.position.copy(a).addScaledVector(span, 0.5);
      m.quaternion.setFromUnitVectors(upY, span.normalize());
      m.castShadow = true;
      scene.add(m);
    };
    const knuckle = (p: THREE.Vector3, radius: number): void => {
      const m = new THREE.Mesh(ball, joint);
      m.scale.setScalar(radius);
      m.position.copy(p);
      m.castShadow = true;
      scene.add(m);
    };
    const foot = new THREE.Vector3(LAMP.foot[0], LAMP.foot[1], LAMP.foot[2]);
    const elbow = new THREE.Vector3(LAMP.elbow[0], LAMP.elbow[1], LAMP.elbow[2]);
    const head = new THREE.Vector3(LAMP.head[0], LAMP.head[1], LAMP.head[2]);
    const way = new THREE.Vector3(LAMP.aim[0], LAMP.aim[1], LAMP.aim[2]).sub(head).normalize();
    // The shade sits behind the bulb, so the arm meets its back end.
    const neck = head.clone().addScaledVector(way, -LAMP.shadeL);

    const plate = new THREE.Mesh(keep(new THREE.CylinderGeometry(LAMP.footR, LAMP.footR * 1.08, 0.022, 40)), enamel);
    plate.position.set(foot.x, foot.y + 0.011, foot.z);
    plate.castShadow = true;
    plate.receiveShadow = true;
    scene.add(plate);
    const ankle = foot.clone().setY(foot.y + 0.03);
    between(ankle, elbow, 0.008, enamel);
    between(elbow, neck, 0.008, enamel);
    knuckle(ankle, 0.016);
    knuckle(elbow, 0.016);
    knuckle(neck, 0.016);

    // An open cone, narrow at the back. Blossom outside, lit inside. It
    // throws no shadow: the bulb is inside it, and it would shade the room.
    const coneGeo = keep(new THREE.CylinderGeometry(0.026, LAMP.shadeR, LAMP.shadeL, 40, 1, true));
    const middle = neck.clone().addScaledVector(way, LAMP.shadeL / 2);
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), way);
    const outside = new THREE.Mesh(coneGeo, enamel);
    outside.position.copy(middle);
    outside.quaternion.copy(turn);
    scene.add(outside);
    const lit = keep(new THREE.MeshBasicMaterial({ color: "#ffe2bd", side: THREE.BackSide, toneMapped: false }));
    const inside = new THREE.Mesh(coneGeo, lit);
    inside.position.copy(middle);
    inside.quaternion.copy(turn);
    inside.scale.setScalar(0.985);
    scene.add(inside);
    const cap = new THREE.Mesh(keep(new THREE.CircleGeometry(0.026, 24)), enamel);
    cap.position.copy(neck);
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), way.clone().negate());
    scene.add(cap);
    const bulb = new THREE.Mesh(ball, keep(new THREE.MeshBasicMaterial({ color: "#fff4e0", toneMapped: false })));
    bulb.scale.setScalar(0.026);
    bulb.position.copy(head).addScaledVector(way, -0.045);
    scene.add(bulb);
  }

  // --------------------------------------------------------------- dust
  const dustUniforms = {
    uTime: { value: 0 },
    uScale: { value: 1 },
    uLevel: { value: 1 },
    uDot: { value: keep(softDotTexture()) },
    uColour: { value: new THREE.Color(AMBER) },
  };
  {
    // Motes inside the lamp's cone, brighter near its middle line.
    const rand = seeded(211);
    const head = new THREE.Vector3(LAMP.head[0], LAMP.head[1], LAMP.head[2]);
    const way = new THREE.Vector3(LAMP.aim[0], LAMP.aim[1], LAMP.aim[2]).sub(head);
    const reach = way.length();
    way.normalize();
    const side = new THREE.Vector3().crossVectors(way, new THREE.Vector3(0, 0, 1)).normalize();
    const over = new THREE.Vector3().crossVectors(way, side);
    const position = new Float32Array(DUST * 3);
    const seed = new Float32Array(DUST * 4);
    const p = new THREE.Vector3();
    const spread = Math.tan(LIGHTS.lamp.angle * 0.8);
    for (let i = 0; i < DUST; i += 1) {
      let off = 0;
      // Try again if the place is under the desk top. The middle of the
      // beam is always over it, so the last try never fails.
      for (let tries = 0; tries < 12; tries += 1) {
        const along = (0.12 + rand() * 0.86) * reach;
        off = tries === 11 ? 0 : Math.sqrt(rand());
        const round = rand() * Math.PI * 2;
        const r = off * along * spread;
        p.copy(head).addScaledVector(way, along).addScaledVector(side, Math.cos(round) * r).addScaledVector(over, Math.sin(round) * r);
        if (p.y > DESK_TOP + 0.03) break;
      }
      position.set([p.x, p.y, p.z], i * 3);
      seed.set([rand() * 6.28, 0.15 + rand() * 0.35, 0.5 + rand(), (1 - off * 0.8) * (0.35 + rand() * 0.65)], i * 4);
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    const mat = keep(
      new THREE.ShaderMaterial({
        uniforms: dustUniforms,
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const dust = new THREE.Points(geo, mat);
    // The motes drift outside the box their resting places make.
    dust.frustumCulled = false;
    dust.renderOrder = 3;
    scene.add(dust);
  }

  // --------------------------------------------------------- the screen
  // Where the page shows through. This draws nothing and leaves the
  // canvas clear, but it still takes its place in depth, so the keyboard
  // and the frame in front of it hide the page as they should.
  const hole = keep(
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: THREE.NoBlending, toneMapped: false }),
  );
  const picture = stillOnly
    ? keep(new THREE.MeshBasicMaterial({ map: keep(screenPictureTexture(PANEL.halfW / PANEL.halfH)), toneMapped: false }))
    : hole;
  const pane = new THREE.Mesh(flat, picture);
  pane.scale.set(PANEL.halfW * 2, PANEL.halfH * 2, 1);
  pane.position.set(SCREEN.cx, SCREEN.cy, PANEL.z);
  pane.renderOrder = -1;
  scene.add(pane);

  // The glow past the screen's edges, seen from across the room. Gone by
  // the time the camera is seated, so nothing lies over the page.
  const haloMat = keep(
    new THREE.MeshBasicMaterial({
      map: keep(haloTexture()),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  const halo = new THREE.Mesh(flat, haloMat);
  halo.scale.set(SCREEN.halfW * 3.6, SCREEN.halfH * 3.6, 1);
  halo.position.set(SCREEN.cx, SCREEN.cy, TV_AT.z + MODEL.max[2] * TV_SCALE + 0.004);
  halo.renderOrder = 2;
  scene.add(halo);

  // A plain set of boxes in the television's place. It is what is seen
  // until the model has loaded, and what stays if it never does.
  const standIn = new THREE.Group();
  {
    const shell = paint("#3a3438", 0.5);
    const x0 = TV_AT.x + MODEL.min[0] * TV_SCALE;
    const x1 = TV_AT.x + MODEL.max[0] * TV_SCALE;
    const y0 = DESK_TOP + 0.02;
    const y1 = TV_AT.y + MODEL.max[1] * TV_SCALE;
    const zBack = TV_AT.z + MODEL.min[2] * TV_SCALE;
    const zMid = PANEL.z - 0.004;
    const zFront = TV_AT.z + 0.5923 * TV_SCALE;
    block(standIn, shell, x0, y0, zBack, x1, y1, zMid);
    block(standIn, shell, x0, SCREEN.cy + SCREEN.halfH, zMid, x1, y1, zFront);
    block(standIn, shell, x0, y0, zMid, x1, SCREEN.cy - SCREEN.halfH, zFront);
    block(standIn, shell, x0, SCREEN.cy - SCREEN.halfH, zMid, SCREEN.cx - SCREEN.halfW, SCREEN.cy + SCREEN.halfH, zFront);
    block(standIn, shell, SCREEN.cx + SCREEN.halfW, SCREEN.cy - SCREEN.halfH, zMid, x1, SCREEN.cy + SCREEN.halfH, zFront);
    block(standIn, shell, x0 + 0.06, DESK_TOP, zBack + 0.08, x1 - 0.06, y0, zFront - 0.08);
  }
  scene.add(standIn);

  const loaded: { dispose(): void }[] = [];
  const dropObject = (root: THREE.Object3D): void => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        for (const value of Object.values(m)) {
          if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
        }
        m.dispose();
      }
    });
  };

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const television = (async (): Promise<void> => {
    const gltf = await loader.loadAsync("/models/crt.glb");
    if (!alive) {
      dropObject(gltf.scene);
      return;
    }
    // The file's face looks down +x. A quarter turn brings it to +z.
    const turn = new THREE.Matrix4().makeRotationY(MODEL.yaw);
    gltf.scene.updateMatrixWorld(true);
    const pictures = new THREE.TextureLoader();
    const grab = (url: string, colour: boolean, after?: (t: THREE.Texture) => void): THREE.Texture => {
      const t = pictures.load(url, (got) => {
        if (!alive) return;
        if (after) after(got);
        landed += 1;
      });
      // The model's own texture layout: not flipped.
      t.flipY = false;
      t.anisotropy = 8;
      if (colour) t.colorSpace = THREE.SRGBColorSpace;
      loaded.push(t);
      return t;
    };
    const skin = new THREE.MeshStandardMaterial({
      // The printed labels are pure white and would shine like lamps.
      // Fold the brightest pixels down; leave the rest as they are.
      map: grab(TV_TEXTURES.map, true, (t) =>
        rework(t, (data) => {
          for (let i = 0; i < data.length; i += 4) {
            const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            if (lum <= 64) continue;
            const k = (64 + (lum - 64) * 0.3) / lum;
            data[i] *= k;
            data[i + 1] *= k;
            data[i + 2] *= k;
          }
        }),
      ),
      normalMap: grab(TV_TEXTURES.normalMap, false),
      metalnessMap: grab(TV_TEXTURES.metalnessMap, false),
      // Parts of the map are mirror smooth and throw hard white spots.
      roughnessMap: grab(TV_TEXTURES.roughnessMap, false, (t) =>
        rework(t, (data) => {
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 1] < 110) data[i] = data[i + 1] = data[i + 2] = 110;
          }
        }),
      ),
      metalness: 0.5,
      envMapIntensity: 1.2,
    });
    // The set's own colour is near black. In a dark room it would be a
    // hole, so it is lifted, toward plum.
    skin.color.setRGB(2.6, 2.2, 2.45);
    loaded.push(skin);

    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry;
      const index = geo.index;
      const corners = geo.getAttribute("position");
      if (index && corners) {
        // Take the glass out, so the page behind the canvas is seen
        // through the frame.
        const flatCorners = new Float32Array(corners.count * 3);
        for (let i = 0; i < corners.count; i += 1) {
          flatCorners[i * 3] = corners.getX(i);
          flatCorners[i * 3 + 1] = corners.getY(i);
          flatCorners[i * 3 + 2] = corners.getZ(i);
        }
        const toModel = turn.clone().multiply(mesh.matrixWorld);
        const flags = glassTriangles(flatCorners, index.array, toModel);
        const kept: number[] = [];
        for (let t = 0; t < flags.length; t += 1) {
          if (flags[t]) continue;
          kept.push(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2));
        }
        geo.setIndex(kept);
      }
      const before = mesh.material;
      for (const m of Array.isArray(before) ? before : [before]) {
        for (const value of Object.values(m)) {
          if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
        }
        m.dispose();
      }
      mesh.material = skin;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      loaded.push(geo);
    });

    const set = new THREE.Group();
    gltf.scene.rotation.y = MODEL.yaw;
    set.add(gltf.scene);
    set.scale.setScalar(TV_SCALE);
    set.position.set(TV_AT.x, TV_AT.y, TV_AT.z);
    scene.remove(standIn);
    scene.add(set);
    landed += 1;
  })().catch(() => {
    // The stand-in stays.
  });

  // ---------------------------------------------------------- the robot
  const turner = new THREE.Group();
  turner.position.set(ROBOT.cx, DESK_TOP, ROBOT.cz);
  turner.rotation.y = -0.6;
  scene.add(turner);
  {
    // A low round stand, so it reads as an ornament and not a lost toy.
    const stand = new THREE.Mesh(keep(new THREE.CylinderGeometry(ROBOT.reach * 0.92, ROBOT.reach * 0.96, 0.012, 48)), paint(BAND, 0.4));
    stand.position.y = 0.006;
    stand.castShadow = true;
    stand.receiveShadow = true;
    turner.add(stand);
  }
  void (async (): Promise<void> => {
    const response = await fetch("/models/hero.glb");
    const bytes = await response.arrayBuffer();
    if (!alive) return;
    const gltf = await loader.parseAsync(bytes, "");
    if (!alive) {
      dropObject(gltf.scene);
      return;
    }
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const middle = box.getCenter(new THREE.Vector3());
    // Sized by whichever is larger, its height or its footprint, so it
    // fits both the stand and the space over it.
    const k = Math.min((ROBOT.h - 0.014) / size.y, (ROBOT.reach * 1.7) / Math.hypot(size.x, size.z));
    gltf.scene.scale.setScalar(k);
    gltf.scene.position.set(-middle.x * k, 0.012 - box.min.y * k, -middle.z * k);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    loaded.push({ dispose: () => dropObject(gltf.scene) });
    turner.add(gltf.scene);
    landed += 1;
  })().catch(() => {
    // No robot. The stand is left empty.
  });

  // -------------------------------------------------------------- frame
  const pose: Pose = { eye: new THREE.Vector3(), look: new THREE.Vector3() };
  let width = 2;
  let height = 2;

  const resize = (w: number, h: number): void => {
    width = Math.max(2, Math.round(w));
    height = Math.max(2, Math.round(h));
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO, MAX_BUFFER_WIDTH / width);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // A mote is about 7 mm across. This turns that into pixels at one
    // metre; the shader divides by how far away the mote is.
    dustUniforms.uScale.value = ((height * ratio) / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 0.007;
  };

  const frame = (t: number, time: number, dt: number, leanX: number, leanY: number): void => {
    if (!alive) return;
    poseAt(t, camera.aspect, time, leanX, leanY, pose);
    aim(camera, pose);
    const e = ease(t);
    turner.rotation.y += dt * 0.35;
    dustUniforms.uTime.value = time;
    // Motes near the lens would be large blots over the page.
    dustUniforms.uLevel.value = 1 - THREE.MathUtils.smoothstep(e, 0.45, 0.85);
    haloMat.opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(e, 0.3, 0.95));
    halo.visible = haloMat.opacity > 0.004;
    // A tube is never quite steady.
    glow.intensity = LIGHTS.glow.candela * (1 + 0.05 * Math.sin(time * 9.1) + 0.03 * Math.sin(time * 23.7));
    renderer.render(scene, camera);
  };

  const still = (): void => {
    if (!alive) return;
    stillPose(camera.aspect, pose);
    aim(camera, pose);
    dustUniforms.uLevel.value = 1;
    haloMat.opacity = 0.8;
    renderer.render(scene, camera);
  };

  const dispose = (): void => {
    if (!alive) return;
    alive = false;
    for (const thing of owned) thing.dispose();
    for (const thing of loaded) thing.dispose();
    lamp.shadow.map?.dispose();
    lamp.dispose();
    renderer.dispose();
    // The canvas is thrown away with the scene; give its context back now
    // and not whenever the browser gets round to it.
    renderer.forceContextLoss();
  };

  return {
    camera,
    resize,
    frame,
    still,
    corners: () => screenCorners(camera),
    ready: television,
    version: () => landed,
    dispose,
  };
}
