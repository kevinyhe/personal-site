import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { skillGroups } from "@/components/profile";
import { newPucks, newRobot, robotAgainstFixed, stepPucks, stepRobot, type Fixed, type Pucks, type Robot } from "./drive";
import { blocked, curveTo, loopPath, nearest, newPilot, stepPilot, type Pilot } from "./pilot";
import { buildSites, groupWord } from "./sites";
import { DEEP, PINK, floorTexture, glowTexture, markTexture, type Fonts } from "./textures";
import { CLUSTERS, GATE, PUCK_H, PUCK_R, ROBOT_SCALE, SITES, START, clamp, headingOf, hexCells, type P2 } from "./world";

/**
 * The floor, the robot on it, and the loop that runs them.
 *
 * Who is driving is one of four things. "auto": the robot follows the loop
 * past the five sites. "goto": it has been sent to one site and is on its
 * way. "parked": it got there. "manual": a person has the keys. Eight
 * seconds with no key pressed hands it back to "auto".
 */

export type DriveOptions = {
  /** The canvas goes in here and takes its size. */
  host: HTMLElement;
  /** The whole stage: clicks and the pointer over it are what claim the keys. */
  stage: HTMLElement;
  reduced: boolean;
  fonts: Fonts;
  /** The robot drove into a site's circle, or out of all of them. */
  onSite: (index: number | null) => void;
  /** The stage took the arrow keys, or gave them back. */
  onKeys: (held: boolean) => void;
  /** A person is driving, or the robot is driving itself. */
  onDriver: (person: boolean) => void;
  /** The robot went through the gate. */
  onGate: () => void;
  /** The robot is loaded and the first frame is drawn. */
  onReady: () => void;
};

export type DriveHandle = {
  /** Send the robot to a site. */
  goTo: (index: number) => void;
  dispose: () => void;
};

type Wheel = { node: THREE.Object3D; axis: THREE.Vector3; sign: number; radius: number; left: boolean };

/** The camera: behind the robot, looking down at it and past it. */
const FOV = 46;
const CAM_BACK = 10.2;
const CAM_UP = 8.9;
const CAM_LEAD = 2.6;
const LOOK_Y = 1;
/** How quickly the camera catches up, 1/s. Low for the turn, so the world
 *  swings round gently when the robot spins on the spot. */
const FOLLOW = 5.5;
const FOLLOW_TURN = 2.4;

const IDLE_BEFORE_AUTO = 8;
const MAX_BUFFER_WIDTH = 2560;
const SHADOW_HALF = 27;
const SHADOW_MAP = 2048;

const KEYS: Record<string, "up" | "down" | "left" | "right"> = {
  arrowup: "up", w: "up",
  arrowdown: "down", s: "down",
  arrowleft: "left", a: "left",
  arrowright: "right", d: "right",
};

/** A value that follows a target and settles without overshoot. */
class Follow {
  x = 0;
  v = 0;
  step(target: number, rate: number, dt: number): void {
    const off = this.x - target;
    const e = Math.exp(-rate * dt);
    const t = (this.v + rate * off) * dt;
    this.v = (this.v - rate * t) * e;
    this.x = target + (off + t) * e;
  }
  set(x: number): void {
    this.x = x;
    this.v = 0;
  }
}

export function mountDrive(o: DriveOptions): DriveHandle | null {
  // Asked for on the canvas the renderer will use, before three.js is
  // given it: three.js logs an error of its own when there is no WebGL,
  // and a page that falls back to plain text has nothing to report.
  const canvas = document.createElement("canvas");
  const settings = { antialias: true, alpha: false, powerPreference: "high-performance" as const };
  const context = canvas.getContext("webgl2", settings) as WebGL2RenderingContext | null;
  if (!context) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context, ...settings });
  } catch {
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(new THREE.Color(DEEP), 1);
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
  o.host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(DEEP), 17, 64);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 160);

  // Light. A sky that is faintly pink over a plum ground; a low warm key
  // that throws the shadows; a pink light from the far side for the edges.
  scene.add(new THREE.HemisphereLight(0xffe6f2, 0x3a1329, 1.15));
  const key = new THREE.DirectionalLight(0xffd3b4, 3.2);
  const keyFrom = new THREE.Vector3(-0.62, 0.6, 0.5).normalize();
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  key.shadow.camera.left = -SHADOW_HALF;
  key.shadow.camera.right = SHADOW_HALF;
  key.shadow.camera.top = SHADOW_HALF;
  key.shadow.camera.bottom = -SHADOW_HALF;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 120;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.05;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xff7dbd, 2.2);
  rim.position.set(30, 22, -34);
  scene.add(rim);

  // The floor.
  const floorMap = floorTexture(renderer.capabilities.getMaxAnisotropy());
  floorMap.repeat.set(60, 60);
  const floorGeo = new THREE.PlaneGeometry(240, 240);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: floorMap, roughness: 1, metalness: 0 }));
  floor.receiveShadow = true;
  scene.add(floor);

  // A patch of warmer light that goes where the robot goes.
  const glowGeo = new THREE.PlaneGeometry(34, 34);
  glowGeo.rotateX(-Math.PI / 2);
  const glow = new THREE.Mesh(
    glowGeo,
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }),
  );
  glow.position.y = 0.012;
  scene.add(glow);

  // The robot: a group that is moved and turned, a group inside it that
  // leans, and the model inside that.
  const robotGroup = new THREE.Group();
  const lean = new THREE.Group();
  robotGroup.add(lean);
  scene.add(robotGroup);
  const wheels: Wheel[] = [];

  const robot: Robot = newRobot(START.x, START.z, START.th);
  const fixed: Fixed[] = [];
  let pucks: Pucks | null = null;
  const puckMeshes: THREE.Mesh[] = [];
  let tick: (t: number) => void = () => {};

  const loop = loopPath();
  let pilot: Pilot = newPilot(loop, nearest(loop, robot.x, robot.z));
  let mode: "auto" | "goto" | "parked" | "manual" = "auto";
  let gotoHeading = 0;
  /** The site it has been sent to, and whether it is going round by the
   *  loop because the short way was blocked. */
  let goal = 0;
  let roundTheLoop = false;
  let idle = 0;
  let site: number | null = null;
  let person = false;

  const camX = new Follow();
  const camZ = new Follow();
  const camTurn = new Follow();

  let disposed = false;
  let loaded = false;
  let onScreen = false;
  let raf = 0;
  let last = 0;
  let clock = 0;

  // ---- building ----------------------------------------------------------

  function buildWorld(): void {
    const built = buildSites(o.fonts);
    scene.add(built.root);
    fixed.push(...built.fixed);
    tick = built.tick;

    const at: P2[] = [];
    const up: number[] = [];
    const puckGeo = new THREE.CylinderGeometry(PUCK_R, PUCK_R, PUCK_H, 40);
    puckGeo.translate(0, PUCK_H / 2, 0);
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(PINK), roughness: 0.55 });
    skillGroups.forEach((group, g) => {
      const cluster = CLUSTERS[g];
      const inward = { x: -cluster.out.x, z: -cluster.out.z };
      hexCells(group.skills.length, PUCK_R * 2 + 0.14).forEach((cell, k) => {
        at.push({ x: cluster.at.x + cell.x, z: cluster.at.z + cell.z });
        // The mark's top toward the middle of the floor: upright to
        // someone looking in from the loop.
        up.push(headingOf(inward));
        const top = new THREE.MeshStandardMaterial({ map: markTexture(group.skills[k], o.fonts), roughness: 0.6 });
        const mesh = new THREE.Mesh(puckGeo, [side, top, side]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        puckMeshes.push(mesh);
        scene.add(mesh);
      });
      scene.add(groupWord(group.label, o.fonts, { x: cluster.at.x + cluster.out.x * 3.4, z: cluster.at.z + cluster.out.z * 3.4 }, inward));
    });
    pucks = newPucks(at);
    pucks.a.set(up);
  }

  async function loadRobot(): Promise<void> {
    const response = await fetch("/models/hero.glb");
    const bytes = await response.arrayBuffer();
    if (disposed) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    if (disposed) {
      gltf.scene.traverse(free);
      return;
    }
    gltf.scene.scale.setScalar(ROBOT_SCALE);
    gltf.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      // The wheels are named in the file, each with the axis it turns on,
      // its radius and its side (tools/bake_hero.mjs wrote them).
      const data = node.userData as { axis?: number[]; sign?: number; radius?: number; side?: string };
      if (/^wheel_/.test(node.name) && data.axis && data.radius) {
        wheels.push({
          node,
          axis: new THREE.Vector3().fromArray(data.axis).normalize(),
          sign: data.sign ?? 1,
          radius: data.radius * ROBOT_SCALE,
          left: data.side === "L",
        });
      }
    });
    lean.add(gltf.scene);
  }

  // ---- drawing -----------------------------------------------------------

  const lightRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), keyFrom).normalize();
  const lightUp = new THREE.Vector3().crossVectors(keyFrom, lightRight).normalize();
  const texel = (SHADOW_HALF * 2) / SHADOW_MAP;

  function place(): void {
    robotGroup.position.set(robot.x, 0, robot.z);
    robotGroup.rotation.y = robot.th;
    lean.rotation.z = robot.pitch;
    lean.rotation.x = robot.roll;
    for (const w of wheels) w.node.rotateOnAxis(w.axis, (w.sign * (w.left ? robot.dl : robot.dr)) / w.radius);
    robot.dl = 0;
    robot.dr = 0;
    glow.position.x = robot.x;
    glow.position.z = robot.z;

    if (pucks) {
      for (let i = 0; i < pucks.n; i += 1) {
        const m = puckMeshes[i];
        m.position.x = pucks.x[i];
        m.position.z = pucks.z[i];
        m.rotation.y = pucks.a[i];
      }
    }

    const fx = Math.cos(camTurn.x);
    const fz = -Math.sin(camTurn.x);
    camera.position.set(camX.x - fx * CAM_BACK, CAM_UP, camZ.x - fz * CAM_BACK);
    camera.lookAt(camX.x + fx * CAM_LEAD, LOOK_Y, camZ.x + fz * CAM_LEAD);

    // The shadow box goes with the camera, moved in whole texels of the
    // shadow map so the shadows' edges do not crawl as it goes.
    const a = Math.round((camX.x * lightRight.x + camZ.x * lightRight.z) / texel) * texel;
    const b = Math.round((camX.x * lightUp.x + camZ.x * lightUp.z) / texel) * texel;
    const c = camX.x * keyFrom.x + camZ.x * keyFrom.z;
    key.target.position.set(
      lightRight.x * a + lightUp.x * b + keyFrom.x * c,
      lightRight.y * a + lightUp.y * b + keyFrom.y * c,
      lightRight.z * a + lightUp.z * b + keyFrom.z * c,
    );
    key.position.copy(key.target.position).addScaledVector(keyFrom, 60);
  }

  function draw(): void {
    if (disposed || !loaded) return;
    place();
    renderer.render(scene, camera);
  }

  function snapCamera(): void {
    camX.set(robot.x);
    camZ.set(robot.z);
    camTurn.set(robot.th);
  }

  // ---- who is driving ----------------------------------------------------

  const down = { up: false, down: false, left: false, right: false };
  const anyKey = () => down.up || down.down || down.left || down.right;

  function setPerson(next: boolean): void {
    if (person === next) return;
    person = next;
    o.onDriver(next);
  }

  function backToLoop(): void {
    mode = "auto";
    pilot = newPilot(loop, nearest(loop, robot.x, robot.z));
    setPerson(false);
  }

  function setSite(next: number | null): void {
    if (site === next) return;
    site = next;
    o.onSite(next);
  }

  let gateSide = 0;
  function watch(): void {
    // Which site's circle it is in. A little further to leave than to
    // enter, so the card does not flicker on the line.
    let inside: number | null = null;
    for (let i = 0; i < SITES.length; i += 1) {
      const s = SITES[i];
      const reach = s.zoneR + (site === i ? 0.5 : 0);
      if ((robot.x - s.zone.x) ** 2 + (robot.z - s.zone.z) ** 2 < reach * reach) inside = i;
    }
    setSite(inside);

    // The gate: the line between the posts, crossed either way.
    const dx = robot.x - GATE.at.x;
    const dz = robot.z - GATE.at.z;
    const along = dx * GATE.out.x + dz * GATE.out.z;
    const across = dx * -GATE.out.z + dz * GATE.out.x;
    const now = Math.sign(along);
    if (gateSide !== 0 && now !== 0 && now !== gateSide && Math.abs(across) < GATE.width / 2 && Math.abs(along) < 2) o.onGate();
    if (now !== 0) gateSide = now;
  }

  function step(dt: number): void {
    clock += dt;
    let throttle = 0;
    let steer = 0;
    if (mode === "manual") {
      throttle = (down.up ? 1 : 0) - (down.down ? 1 : 0);
      steer = (down.left ? 1 : 0) - (down.right ? 1 : 0);
      idle = anyKey() ? 0 : idle + dt;
      if (idle > IDLE_BEFORE_AUTO) backToLoop();
    } else if (mode === "parked") {
      idle += dt;
      if (idle > IDLE_BEFORE_AUTO) backToLoop();
    } else {
      if (mode === "goto" && roundTheLoop) {
        // Coming up to the site along the loop: leave the loop for the
        // last stretch, which is clear from here.
        const s = SITES[goal];
        if ((robot.x - (s.corner.x - s.dirIn.x * 7)) ** 2 + (robot.z - (s.corner.z - s.dirIn.z * 7)) ** 2 < 9) {
          roundTheLoop = false;
          pilot = newPilot(curveTo(robot.x, robot.z, robot.th, s.stop.x, s.stop.z, s.stopHeading), 0);
        }
      }
      stepPilot(pilot, robot, fixed, dt, gotoHeading);
      throttle = pilot.throttle;
      steer = pilot.steer;
      if (mode === "goto" && pilot.arrived) {
        mode = "parked";
        idle = 0;
      }
    }
    stepRobot(robot, throttle, steer, dt);
    robotAgainstFixed(robot, fixed);
    if (pucks) stepPucks(pucks, robot, fixed, dt);
    watch();
    tick(clock);
    camX.step(robot.x, FOLLOW, dt);
    camZ.step(robot.z, FOLLOW, dt);
    camTurn.step(robot.th, FOLLOW_TURN, dt);
  }

  const running = () => loaded && onScreen && !document.hidden && !o.reduced && !disposed;
  function frame(now: number): void {
    raf = 0;
    if (!running()) return;
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function wake(): void {
    if (raf || !running()) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // ---- keys --------------------------------------------------------------

  let clicked = false;
  let over = false;
  let held = false;
  function claim(): void {
    const next = (clicked || over) && onScreen;
    if (next === held) return;
    held = next;
    if (!held) down.up = down.down = down.left = down.right = false;
    o.onKeys(held);
  }
  const onPointerDown = (e: PointerEvent) => {
    clicked = o.stage.contains(e.target as Node);
    if (clicked) over = true;
    claim();
  };
  const onEnter = () => {
    over = true;
    claim();
  };
  const onLeave = () => {
    over = false;
    claim();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      clicked = false;
      over = false;
      claim();
      return;
    }
    if (!held || o.reduced || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const k = KEYS[e.key.toLowerCase()];
    if (!k) return;
    // Held here, or the arrow keys would scroll the page as well.
    e.preventDefault();
    down[k] = true;
    idle = 0;
    if (mode !== "manual") {
      mode = "manual";
      setPerson(true);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const k = KEYS[e.key.toLowerCase()];
    if (k) down[k] = false;
  };
  const onBlur = () => {
    down.up = down.down = down.left = down.right = false;
  };
  const onVisibility = () => wake();

  document.addEventListener("pointerdown", onPointerDown);
  o.stage.addEventListener("pointerenter", onEnter);
  o.stage.addEventListener("pointerleave", onLeave);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);

  const seen = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (!onScreen) {
      clicked = false;
      over = false;
    }
    claim();
    wake();
  });
  seen.observe(o.stage);

  // ---- size --------------------------------------------------------------

  function fit(): void {
    const w = Math.max(2, o.host.clientWidth);
    const h = Math.max(2, o.host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, MAX_BUFFER_WIDTH / w));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // A still picture has no loop to redraw it.
    if (!raf) draw();
  }
  const sized = new ResizeObserver(fit);
  sized.observe(o.host);

  // ---- start -------------------------------------------------------------

  function park(index: number): void {
    const s = SITES[index];
    robot.x = s.stop.x;
    robot.z = s.stop.z;
    robot.th = s.stopHeading;
    robot.vl = robot.vr = robot.v = robot.w = 0;
    snapCamera();
    setSite(index);
  }

  const fontsIn = Promise.race([
    Promise.all([document.fonts.load(`500 96px ${o.fonts.mono}`), document.fonts.load(`700 60px ${o.fonts.sans}`)]),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]).catch(() => undefined);

  void (async () => {
    try {
      await fontsIn;
      if (disposed) return;
      buildWorld();
      await loadRobot();
      if (disposed) return;
    } catch {
      // No model or no canvas text: the page's own text is still there.
      return;
    }
    loaded = true;
    snapCamera();
    if (o.reduced) park(0);
    tick(0);
    fit();
    draw();
    o.onReady();
    wake();
  })();

  if (process.env.NODE_ENV !== "production") {
    // For the capture harness: where things are, to check they moved.
    (window as unknown as Record<string, unknown>).__b01 = {
      robot,
      pucks: () => pucks,
      mode: () => mode,
      wheel: () => wheels[0]?.node.rotation.toArray(),
    };
  }

  function free(node: THREE.Object3D): void {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map) map.dispose();
      m.dispose();
    }
  }

  return {
    goTo(index) {
      if (disposed || !loaded || !SITES[index]) return;
      if (o.reduced) {
        park(index);
        draw();
        return;
      }
      const s = SITES[index];
      // Three ways there, the first that is clear: a curve leaving the way
      // the robot faces; a curve leaving straight for the site, which it
      // turns on the spot to take; round by the loop.
      const direct = Math.atan2(-(s.stop.z - robot.z), s.stop.x - robot.x);
      const ways = [robot.th, direct].map((th) => curveTo(robot.x, robot.z, th, s.stop.x, s.stop.z, s.stopHeading));
      const clear = ways.find((w) => !blocked(w, fixed));
      goal = index;
      roundTheLoop = !clear;
      pilot = clear ? newPilot(clear, 0) : newPilot(loop, nearest(loop, robot.x, robot.z));
      gotoHeading = s.stopHeading;
      mode = "goto";
      idle = 0;
      setPerson(false);
      wake();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      seen.disconnect();
      sized.disconnect();
      document.removeEventListener("pointerdown", onPointerDown);
      o.stage.removeEventListener("pointerenter", onEnter);
      o.stage.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      scene.traverse(free);
      key.shadow.map?.dispose();
      renderer.dispose();
      canvas.remove();
      if (process.env.NODE_ENV !== "production") delete (window as unknown as Record<string, unknown>).__b01;
    },
  };
}
