import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { makeCards, type Card } from "./cards";
import { makeBody, step, type Body, type World } from "./physics";
import { colliderOf, drawFace, makeCube, makePieces, makePuck, orbitCounts, type Piece } from "./pieces";
import { DEEP, FRAME, TL, frameAmount, smooth } from "./timeline";

/**
 * The scene: 42 pieces, five cards, one camera that never moves.
 *
 * The screen is 10 units high at z = 0 and the camera looks straight down
 * -z, so a place on the page and a place in the scene convert with one
 * multiply. The pieces are in one of three states, set by how far down the
 * page is:
 *
 *   knot   pulled to the middle of the frame, turning slowly
 *   ring   flown out to the edges of the screen, round the word "Work"
 *   work   each sprung to its place on a card (a corner, an orbit, or a
 *          gap between two cards) and carried with the page as it scrolls
 *   pile   gravity on, a floor along the foot of the screen
 */

export type ClusterOpts = {
  root: HTMLElement;
  stage: HTMLElement;
  /** The clipped box the canvas goes in. */
  frame: HTMLElement;
  label: HTMLElement;
  labelName: HTMLElement;
  labelGroup: HTMLElement;
  /** One per project: the box on the page the card is drawn in. */
  slots: HTMLElement[];
  /** One per project: the words, tilted with the card. */
  texts: HTMLElement[];
  applyStage: (s: number) => number;
  reduced: boolean;
  fontFamily: string;
};

export type Cluster = { setFocus: (group: number) => void; dispose: () => void };

type Mode = "knot" | "ring" | "work" | "pile";

const FOV = 35;
const STEP = 1 / 120;
/** Corner order: top left, top right, bottom right, bottom left. */
const CORNER = [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const;

/** The same numbers every load, so the knot is the same knot. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Asks for a context on a spare canvas and hands it straight back. It
 *  is asked first so that a machine without WebGL gets the plain page and
 *  not an error in the console from the renderer. */
function canDraw(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function createCluster(o: ClusterOpts): Cluster | null {
  if (!canDraw()) return null;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.setAttribute("aria-hidden", "true");
  o.frame.appendChild(canvas);

  const scene = new THREE.Scene();
  const bandC = new THREE.Color(BAND), deepC = new THREE.Color(DEEP);
  const fog = new THREE.Fog(bandC.clone(), 14, 32);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, 0.5, 80);

  // Something for the pieces to reflect. A plain lit room, built in code.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.55;

  const key = new THREE.DirectionalLight(0xfff3f8, 2.7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 7;
  scene.add(key, key.target);
  // From behind and to the right, in blossom: it draws the far edges.
  const rim = new THREE.DirectionalLight(BLOSSOM, 1.6);
  scene.add(rim, rim.target);
  scene.add(new THREE.HemisphereLight(0xffe3f0, 0x2a0d1e, 0.55));

  // Two surfaces that show nothing but the shadows that fall on them: a
  // wall behind everything and the floor the pile lands on.
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.42 });
  const flat = new THREE.PlaneGeometry(1, 1);
  const wall = new THREE.Mesh(flat, shadowMat);
  wall.receiveShadow = true;
  wall.position.z = -7;
  const floor = new THREE.Mesh(flat, shadowMat);
  floor.receiveShadow = true;
  floor.rotation.x = -Math.PI / 2;
  floor.visible = false;
  scene.add(wall, floor);

  const pieces: Piece[] = makePieces();
  const counts = orbitCounts(pieces);
  const n = pieces.length;
  const cubeGeo = makeCube(), puckGeo = makePuck();
  const faces: HTMLCanvasElement[] = [];
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshPhysicalMaterial[] = [];
  const meshes: THREE.Mesh[] = [];
  const bodies: Body[] = [];
  /** Size now as a share of full size, and where it is heading. */
  const scaleNow = new Float32Array(n).fill(1);
  const rand = seeded(20260926);
  const sheen = new THREE.Color(BLOSSOM);

  pieces.forEach((p, i) => {
    const face = document.createElement("canvas");
    drawFace(face, p, o.fontFamily);
    const tex = new THREE.CanvasTexture(face);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.58,
      metalness: 0,
      sheen: 0.9,
      sheenRoughness: 0.5,
      sheenColor: sheen,
      clearcoat: 0.22,
      clearcoatRoughness: 0.55,
    });
    const mesh = new THREE.Mesh(p.cube ? cubeGeo : puckGeo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    faces.push(face); textures.push(tex); materials.push(mat); meshes.push(mesh);

    const b = makeBody();
    // Start as a loose ball of pieces; the knot settles before it is seen.
    const a = rand() * Math.PI * 2, u = rand() * 2 - 1, r = 1.5 + rand() * 3;
    const flatR = Math.sqrt(1 - u * u);
    b.x = Math.cos(a) * flatR * r; b.y = u * r; b.z = Math.sin(a) * flatR * r;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28));
    b.qx = q.x; b.qy = q.y; b.qz = q.z; b.qw = q.w;
    // Not square on to the viewer: a face seen slightly from the side
    // shows its thickness.
    const f = new THREE.Vector3((rand() - 0.5) * 0.9, (rand() - 0.5) * 0.9, 1).normalize();
    b.fx = f.x; b.fy = f.y; b.fz = f.z;
    b.cube = p.cube;
    b.inv = 1 / p.size ** 3;
    b.r = colliderOf(p.cube) * p.size;
    bodies.push(b);
  });

  // The order the pieces stand in round the ring, mixed so that no group
  // or colour sits together.
  const ringPlace = pieces.map((_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [ringPlace[i], ringPlace[j]] = [ringPlace[j], ringPlace[i]];
  }

  const kit = makeCards(o.slots.length);
  const cards: Card[] = kit.cards;
  cards.forEach((c) => scene.add(c.group));

  const world: World = {
    gravity: 0, floor: -4.6, wallX: 9, slab: 0.5, swirl: 0.5, cx: 0, cy: 0, cz: 0,
    face: 2.2, spinDrag: 1.2, rounds: 4,
    cursor: { on: false, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, r: 1.7 },
    eye: 15.86, shove: 0.12, topSpeed: 34,
  };

  let W = 1, H = 1, viewW = 18.5, viewH = 10, D = 15.86;
  let mode: Mode = "knot";
  let focus = -1;
  let time = 0;
  let lastCardY = 0;
  let rode = false;
  let hovered = -1;
  let pointerX = 0, pointerY = 0, pointerIn = false;
  let disposed = false;
  let sNow = 0;
  let rootFont = getComputedStyle(document.documentElement).fontSize;

  function resize(): void {
    W = o.stage.clientWidth;
    H = o.stage.clientHeight;
    if (!W || !H) return;
    // Never more than 2560 wide: at 4K the picture is drawn smaller and
    // stretched, which costs less than half the pixels.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, 2560 / W));
    renderer.setSize(W, H, false);
    const aspect = W / H;
    // A narrow window backs the camera off so the knot still fits across.
    viewH = Math.max(10, 12 / aspect);
    viewW = viewH * aspect;
    D = viewH / 2 / Math.tan((FOV * Math.PI) / 360);
    camera.aspect = aspect;
    camera.position.set(0, 0, D);
    world.eye = D;
    camera.far = D + 40;
    camera.updateProjectionMatrix();
    fog.near = D - 1.5;
    fog.far = D + 17;
    world.floor = -viewH * 0.45;
    world.wallX = viewW * 0.49;
    key.position.set(-viewW * 0.28, viewH * 0.95, D * 0.75);
    const sc = key.shadow.camera;
    sc.left = -viewW * 0.8; sc.right = viewW * 0.8; sc.top = viewH; sc.bottom = -viewH;
    sc.near = 0.5; sc.far = D + 40;
    sc.updateProjectionMatrix();
    rim.position.set(viewW * 0.5, viewH * 0.2, -8);
    wall.scale.set(viewW * 3, viewH * 3, 1);
    floor.scale.set(viewW * 3, 40, 1);
    floor.position.set(0, world.floor, 0);
  }

  /** How far down the design the page is, in screens x 100. */
  const readScroll = (): number => (-o.root.getBoundingClientRect().top / Math.max(1, H)) * 100;

  function setMode(next: Mode): void {
    if (next === mode) return;
    const from = mode;
    mode = next;
    floor.visible = next === "pile";
    if (next === "pile") {
      // Pieces on cards long scrolled past are screens away. Bring them
      // to just over the top edge so they fall in, not arrive a minute on.
      const top = viewH / 2;
      for (const b of bodies) {
        if (b.y > top + 1 || b.y < -top) {
          b.y = top + 1 + rand() * 9;
          b.x = (rand() - 0.5) * world.wallX * 1.7;
          b.z = (rand() - 0.5) * 2;
        }
        b.x = Math.max(-world.wallX + b.r, Math.min(world.wallX - b.r, b.x));
        b.px = b.x; b.py = b.y; b.pz = b.z;
        b.vx *= 0.3; b.vy = Math.min(0, b.vy) * 0.3; b.vz *= 0.3;
      }
    }
    if (from === "work") rode = false;
  }

  function params(): void {
    const c = world.cursor;
    if (mode === "knot") {
      world.gravity = 0; world.swirl = focus < 0 ? 0.5 : 0.15; world.face = 2.2; world.spinDrag = 1.2; world.rounds = 4;
      c.r = 1.45; world.shove = 0.12; world.topSpeed = 34;
    } else if (mode === "ring") {
      world.gravity = 0; world.swirl = 0; world.face = 2.6; world.spinDrag = 1.2; world.rounds = 3;
      c.r = 1.4; world.shove = 0.1; world.topSpeed = 34;
    } else if (mode === "work") {
      world.gravity = 0; world.swirl = 0; world.face = 3; world.spinDrag = 1.4; world.rounds = 2;
      c.r = 1.1; world.shove = 0.1; world.topSpeed = 34;
    } else {
      world.gravity = 30; world.swirl = 0; world.face = 0.35; world.spinDrag = 1.6; world.rounds = 6;
      c.r = 1.3; world.shove = 0.05; world.topSpeed = 13;
    }
  }

  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const vec = new THREE.Vector3();

  /** The cards' places, read off the page. */
  function placeCards(dt: number, px: number, py: number): void {
    const sr = o.stage.getBoundingClientRect();
    const ease = 1 - Math.exp(-7 * dt);
    for (let i = 0; i < cards.length; i += 1) {
      const c = cards[i];
      const r = o.slots[i].getBoundingClientRect();
      c.w = (r.width / W) * viewW;
      c.h = (r.height / H) * viewH;
      const cx = ((r.left + r.width / 2 - sr.left) / W - 0.5) * viewW;
      const cy = (0.5 - (r.top + r.height / 2 - sr.top) / H) * viewH;
      c.group.position.set(cx, cy, 0);
      c.group.scale.set(c.w, c.h, 1);
      c.seen = Math.abs(cy) < viewH / 2 + c.h / 2 + 0.5 && sNow > TL.toRing;
      c.group.visible = c.seen;
      c.material.uniforms.uSize.value.set(c.w, c.h);
      // 2rem on the page, in scene units.
      c.material.uniforms.uCorner.value = ((FRAME.radius * parseFloat(rootFont)) / H) * viewH;
      c.material.uniforms.uTime.value = o.reduced ? 12 : time;

      if (o.reduced) { c.rx = 0; c.ry = 0; c.group.rotation.set(0, 0, 0); continue; }
      const nx = (px - cx) / (c.w / 2), ny = (py - cy) / (c.h / 2);
      const near = pointerIn && Math.abs(nx) < 1.15 && Math.abs(ny) < 1.25;
      const over = pointerIn && Math.abs(nx) < 1 && Math.abs(ny) < 1;
      if (over && !c.over && c.seen) c.material.uniforms.uRipple.value.set(nx / 2 + 0.5, ny / 2 + 0.5, time);
      c.over = over;
      // The face turns to look at the cursor. With none, it idles.
      c.ty = near ? Math.max(-1, Math.min(1, nx)) * 0.2 : 0.05 * Math.sin(time * 0.4 + i);
      c.tx = near ? -Math.max(-1, Math.min(1, ny)) * 0.13 : 0.03 * Math.cos(time * 0.33 + i);
      c.rx += (c.tx - c.rx) * ease;
      c.ry += (c.ty - c.ry) * ease;
      c.group.rotation.set(c.rx, c.ry, 0);
      c.material.uniforms.uTilt.value.set(c.ry, c.rx);
    }
  }

  const lastTilt: string[] = cards.map(() => "");
  /** The words lean with the card, so they read as printed on it. */
  function tiltWords(): void {
    const persp = ((D / viewH) * 100).toFixed(2);
    for (let i = 0; i < cards.length; i += 1) {
      const c = cards[i];
      if (!c.seen) continue;
      const t = `perspective(${persp}vh) rotateX(${(-c.rx).toFixed(4)}rad) rotateY(${c.ry.toFixed(4)}rad)`;
      if (t !== lastTilt[i]) { o.texts[i].style.transform = t; lastTilt[i] = t; }
    }
  }

  /** Where each piece is pulled to, and how big it should be. */
  function aim(i: number): number {
    const p = pieces[i], b = bodies[i];
    if (mode === "knot") {
      const k = frameAmount(sNow);
      // The frame's middle is below the screen's, and the legend has the left.
      const bottom = (FRAME.side * W) / H;
      const cx = k * 0.075 * viewW;
      const cy = (-k * ((FRAME.top - bottom) / 200)) * viewH;
      world.cx = cx; world.cy = cy; world.cz = 0;
      b.pull = 9; b.drag = 2.4;
      if (focus < 0) { b.ax = cx; b.ay = cy; b.az = 0; return 1; }
      if (p.group === focus) { b.ax = cx; b.ay = cy; b.az = 3.4; b.pull = 12; return 1; }
      // The rest stand back in a ring round the chosen group.
      const a = (i / n) * Math.PI * 2;
      b.ax = cx + Math.cos(a) * viewW * 0.27; b.ay = cy + Math.sin(a) * viewH * 0.3; b.az = -5;
      return 0.85;
    }
    if (mode === "ring") {
      // Round the edge of the screen, squarer than an ellipse so the
      // corners fill, and at three depths.
      const a = (ringPlace[i] / n) * Math.PI * 2 + time * 0.04;
      const cx = Math.cos(a), cy = Math.sin(a);
      b.ax = Math.sign(cx) * Math.abs(cx) ** 0.55 * viewW * 0.47;
      b.ay = Math.sign(cy) * Math.abs(cy) ** 0.55 * viewH * 0.47;
      b.az = ((ringPlace[i] % 3) - 1) * 1.3;
      b.pull = 13; b.drag = 4.2;
      return 0.82;
    }
    if (mode === "work") {
      b.pull = 40; b.drag = 9;
      if (p.role === "loose") {
        // In the gap over a card, or under the last one.
        const g = p.place % (cards.length + 1);
        const over = cards[Math.min(g, cards.length - 1)];
        const y = g < cards.length ? over.group.position.y + over.h / 2 + viewH * 0.12 : over.group.position.y - over.h / 2 - viewH * 0.12;
        b.ax = (((p.place * 0.37 + 0.2) % 1) - 0.5) * viewW * 0.8;
        b.ay = y + Math.sin(time * 0.5 + p.place) * 0.15;
        b.az = 0.4;
        return 0.55;
      }
      const c = cards[p.card];
      if (p.role === "corner") {
        vec.set((CORNER[p.place][0] * c.w) / 2, (CORNER[p.place][1] * c.h) / 2, 0.2);
      } else {
        const turn = (o.reduced ? 0.6 : time * 0.32) + (p.place / Math.max(1, counts[p.card])) * Math.PI * 2 + p.card;
        vec.set(c.w * (0.1 + 0.15 * p.place), Math.cos(turn) * (c.h / 2 + 0.75), Math.sin(turn) * 1.7);
      }
      euler.set(c.rx, c.ry, 0);
      vec.applyEuler(euler).add(c.group.position);
      b.ax = vec.x; b.ay = vec.y; b.az = vec.z;
      return p.role === "corner" ? 0.56 : 0.5;
    }
    b.pull = 0; b.drag = 0.25;
    return 0.8;
  }

  function cursorTo(px: number, py: number, on: boolean): void {
    const c = world.cursor;
    const z = mode === "knot" && focus >= 0 ? 3.4 : 0;
    const t = (D - z) / D;
    c.px = c.x; c.py = c.y; c.pz = c.z;
    c.x = px * t; c.y = py * t; c.z = z;
    // Switched on this frame: it has no "before" to have moved from.
    if (on && !c.on) { c.px = c.x; c.py = c.y; c.pz = c.z; }
    c.on = on;
  }

  function simulate(steps: number): void {
    for (let k = 0; k < steps; k += 1) step(bodies, world, STEP, (k + 1) / steps);
  }

  function writeMeshes(): void {
    for (let i = 0; i < n; i += 1) {
      const b = bodies[i], m = meshes[i];
      m.position.set(b.x, b.y, b.z);
      m.quaternion.set(b.qx, b.qy, b.qz, b.qw);
      m.scale.setScalar(pieces[i].size * scaleNow[i]);
      // Off a card that is screens away: nothing to draw.
      m.visible = Math.abs(b.y) < viewH / 2 + 3;
    }
  }

  /** The piece under the cursor, or the nearest one it just pushed aside. */
  function pick(px: number, py: number): number {
    const len = Math.sqrt(px * px + py * py + D * D);
    const dx = px / len, dy = py / len, dz = -D / len;
    let best = -1, bestT = Infinity, near = -1, nearD = Infinity;
    for (let i = 0; i < n; i += 1) {
      const b = bodies[i];
      if (!meshes[i].visible) continue;
      const ox = b.x, oy = b.y, oz = b.z - D;
      const along = ox * dx + oy * dy + oz * dz;
      if (along < 0) continue;
      const off2 = ox * ox + oy * oy + oz * oz - along * along;
      if (off2 < b.r * b.r) {
        const t = along - Math.sqrt(b.r * b.r - off2);
        if (t < bestT) { bestT = t; best = i; }
      } else {
        const gap = Math.sqrt(off2) - b.r;
        if (gap < 0.7 && gap < nearD) { nearD = gap; near = i; }
      }
    }
    return best >= 0 ? best : near;
  }

  function showLabel(i: number): void {
    if (i !== hovered) {
      hovered = i;
      if (i >= 0) {
        o.labelName.textContent = pieces[i].skill.name;
        o.labelGroup.textContent = pieces[i].groupLabel;
      }
      o.label.style.opacity = i >= 0 ? "1" : "0";
    }
    if (i < 0) return;
    const b = bodies[i];
    const k = D / (D - b.z);
    const x = ((b.x * k) / viewW + 0.5) * 100;
    const y = (0.5 - ((b.y + b.r * 1.15) * k) / viewH) * 100;
    o.label.style.transform = `translate3d(${x.toFixed(2)}vw, ${Math.max(3, y).toFixed(2)}vh, 0) translate(-50%, -100%)`;
  }

  /** The cursor on the z = 0 plane, in scene units, and whether it counts. */
  function pointer(k: number): { x: number; y: number; on: boolean } {
    const sr = o.stage.getBoundingClientRect();
    const fx = (pointerX - sr.left) / W, fy = (pointerY - sr.top) / H;
    // Only inside the frame. The margin round it is the page, not the scene.
    const side = (k * FRAME.side) / 100, top = (k * FRAME.top) / 100, foot = (k * FRAME.side * W) / H / 100;
    const on = pointerIn && fx > side && fx < 1 - side && fy > top && fy < 1 - foot;
    return { x: (fx - 0.5) * viewW, y: (0.5 - fy) * viewH, on };
  }

  function modeAt(s: number): Mode {
    return s < TL.toRing ? "knot" : s < TL.toWork ? "ring" : s < TL.toPile ? "work" : "pile";
  }

  function frame(dt: number): void {
    sNow = readScroll();
    const k = o.applyStage(sNow);
    fog.color.lerpColors(bandC, deepC, smooth(0, TL.contractEnd, sNow));
    setMode(modeAt(sNow));
    params();
    const pt = pointer(k);
    const nearCards = sNow > TL.toRing - 30;
    if (nearCards) {
      placeCards(dt, pt.x, pt.y);
      tiltWords();
      // The page moved the cards. Everything on them moves the same.
      const y = cards[0].group.position.y;
      if (mode === "work" && rode) {
        const dy = y - lastCardY;
        for (const b of bodies) { b.y += dy; b.py += dy; }
      }
      lastCardY = y;
      rode = mode === "work";
    } else {
      for (const c of cards) { c.group.visible = false; c.seen = false; }
    }
    wall.visible = mode === "knot" || mode === "pile";

    const grow = 1 - Math.exp(-4 * dt);
    for (let i = 0; i < n; i += 1) {
      const to = aim(i);
      scaleNow[i] += (to - scaleNow[i]) * grow;
      bodies[i].r = colliderOf(pieces[i].cube) * pieces[i].size * scaleNow[i];
    }
    cursorTo(pt.x, pt.y, pt.on);
    simulate(Math.max(1, Math.min(5, Math.round(dt / STEP))));
    writeMeshes();
    showLabel(pt.on ? pick(pt.x, pt.y) : -1);
    renderer.render(scene, camera);
  }

  // Reduced motion. No loop. Each state is worked out once, to rest, and
  // drawn when the page reaches it.
  type Still = Float32Array;
  const stills: Partial<Record<Mode, Still>> = {};
  /** Places are kept from (ox, oy), so the knot can be put back round
   *  wherever its middle is by then. */
  const keep = (ox: number, oy: number): Still => {
    const a = new Float32Array(n * 7);
    bodies.forEach((b, i) => a.set([b.x - ox, b.y - oy, b.z, b.qx, b.qy, b.qz, b.qw], i * 7));
    return a;
  };
  const put = (a: Still, ox: number, oy: number): void => {
    bodies.forEach((b, i) => {
      b.x = a[i * 7] + ox; b.y = a[i * 7 + 1] + oy; b.z = a[i * 7 + 2];
      b.qx = a[i * 7 + 3]; b.qy = a[i * 7 + 4]; b.qz = a[i * 7 + 5]; b.qw = a[i * 7 + 6];
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.vx = 0; b.vy = 0; b.vz = 0; b.wx = 0; b.wy = 0; b.wz = 0;
    });
  };

  function settle(steps: number): void {
    params();
    for (let i = 0; i < n; i += 1) {
      scaleNow[i] = aim(i);
      bodies[i].r = colliderOf(pieces[i].cube) * pieces[i].size * scaleNow[i];
    }
    world.cursor.on = false;
    for (let k = 0; k < steps; k += 1) {
      if (mode === "knot") for (let i = 0; i < n; i += 1) aim(i);
      step(bodies, world, STEP, 1);
    }
  }

  function drawStill(): void {
    sNow = readScroll();
    o.applyStage(sNow);
    fog.color.lerpColors(bandC, deepC, smooth(0, TL.contractEnd, sNow));
    const next = modeAt(sNow);
    const changed = next !== mode;
    mode = next;
    floor.visible = mode === "pile";
    wall.visible = mode === "knot" || mode === "pile";
    placeCards(0, 0, 0);
    if (mode === "knot") {
      // The frame moves the knot's middle as it draws in; go with it.
      aim(0);
      if (stills.knot) put(stills.knot, world.cx, world.cy);
      for (let i = 0; i < n; i += 1) scaleNow[i] = focus >= 0 && pieces[i].group !== focus ? 0.85 : 1;
    } else if (mode === "work" || mode === "ring") {
      for (let i = 0; i < n; i += 1) {
        scaleNow[i] = aim(i);
        const b = bodies[i];
        b.x = b.ax; b.y = b.ay; b.z = b.az;
      }
    } else if (changed) {
      if (!stills.pile) {
        for (const b of bodies) { b.y = viewH; }
        mode = "knot";
        setMode("pile");
        settle(1500);
        stills.pile = keep(0, 0);
      }
      put(stills.pile, 0, 0);
      for (let i = 0; i < n; i += 1) scaleNow[i] = 0.8;
    }
    writeMeshes();
    renderer.render(scene, camera);
  }

  (window as unknown as Record<string, unknown>).__b02 = { bodies, world, get s() { return sNow; }, get mode() { return mode; }, get view() { return [W, H, viewW, viewH, pointerIn, pointerX, pointerY]; } };
  // Start: size it, then let the knot form before the first frame.
  resize();
  sNow = readScroll();
  settle(520);
  if (o.reduced) stills.knot = keep(world.cx, world.cy);

  let raf = 0, last = 0, onScreen = false, asked = false;
  const tick = (now: number): void => {
    raf = 0;
    if (disposed || !onScreen || document.hidden) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    time += dt;
    frame(dt);
    raf = requestAnimationFrame(tick);
  };
  const run = (): void => {
    if (o.reduced) {
      if (asked) return;
      asked = true;
      requestAnimationFrame(() => { asked = false; if (!disposed && onScreen) drawStill(); });
      return;
    }
    if (!raf && onScreen && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); }
  };

  const seen = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    run();
  });
  seen.observe(o.stage);
  const sized = new ResizeObserver(() => {
    rootFont = getComputedStyle(document.documentElement).fontSize;
    resize();
    if (o.reduced) run();
  });
  sized.observe(o.stage);

  const onMove = (e: PointerEvent): void => { pointerX = e.clientX; pointerY = e.clientY; pointerIn = true; };
  const onLeave = (): void => { pointerIn = false; };
  const onVisible = (): void => run();
  const onScroll = (): void => run();
  if (o.reduced) {
    window.addEventListener("scroll", onScroll, { passive: true });
  } else {
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
  }
  document.addEventListener("visibilitychange", onVisible);

  // The type marks were drawn before the page's font had loaded. Draw
  // them again once it has.
  void document.fonts.ready.then(() => {
    if (disposed) return;
    pieces.forEach((p, i) => {
      if (p.skill.icon) return;
      drawFace(faces[i], p, o.fontFamily);
      textures[i].needsUpdate = true;
    });
    if (o.reduced) run();
  });

  return {
    setFocus: (group: number): void => {
      focus = group;
      if (!o.reduced) return;
      if (mode === "knot") {
        settle(420);
        stills.knot = keep(world.cx, world.cy);
      }
      run();
    },
    dispose: (): void => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      seen.disconnect();
      sized.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onVisible);
      o.texts.forEach((t) => { t.style.transform = ""; });
      cubeGeo.dispose();
      puckGeo.dispose();
      flat.dispose();
      shadowMat.dispose();
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      kit.dispose();
      key.shadow.map?.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
