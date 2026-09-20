import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { skillGroups } from "@/components/profile";
import { skillIcon } from "@/components/skillIcons";

/**
 * What the television shows: one small 3D scene per project, and a test
 * card for the skills. Each scene is drawn to a texture the size of the
 * glass, and the glass shader does the rest.
 *
 * All in greys. The bar shader reads brightness only, so colour here
 * would be thrown away. Backgrounds stay well off black, or the bars
 * would leave a hole where the picture is.
 */

export type Channel = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Moves things for time t, seconds. */
  tick(t: number): void;
};

export type Channels = {
  list: Channel[];
  /** The test card, drawn on a 2D canvas. */
  card: THREE.CanvasTexture;
  /** Draws the card again once the page's fonts are in. */
  redrawCard(mono: string, sans: string): void;
  dispose(): void;
};

/** Picture size in texels. The glass is 1.2 wide to 1 tall. */
export const PICTURE_W = 480;
export const PICTURE_H = 400;

const grey = (v: number): THREE.Color => new THREE.Color(v, v, v);

function lit(scene: THREE.Scene, keyAt: [number, number, number], key = 2.6, sky = 1.8): void {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x707070, sky));
  const k = new THREE.DirectionalLight(0xffffff, key);
  k.position.set(...keyAt);
  scene.add(k);
}

function makeCamera(fov: number, at: [number, number, number], look: [number, number, number]): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(fov, PICTURE_W / PICTURE_H, 0.1, 60);
  c.position.set(...at);
  c.lookAt(...look);
  return c;
}

const mat = (v: number, rough = 0.55): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: grey(v), roughness: rough, metalness: 0.05 });

// ------------------------------------------------------------ 1: microphone
function microphone(): Channel {
  const scene = new THREE.Scene();
  scene.background = grey(0.16);
  lit(scene, [-2, 3, 4]);
  const mic = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 40, 28), mat(0.85, 0.8));
  head.position.y = 0.55;
  mic.add(head);
  // The grille's band and a few of its wires, so the head reads as a mic.
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.555, 0.045, 12, 64), mat(0.95, 0.35));
  band.position.y = 0.55;
  band.rotation.x = Math.PI / 2;
  mic.add(band);
  for (let i = 0; i < 6; i += 1) {
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.012, 6, 48), mat(0.6));
    wire.position.y = 0.55;
    wire.rotation.y = (i / 6) * Math.PI;
    mic.add(wire);
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 1.5, 32), mat(0.7, 0.4));
  handle.position.y = -0.55;
  mic.add(handle);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.14, 32), mat(0.95, 0.3));
  collar.position.y = 0.05;
  mic.add(collar);
  mic.rotation.z = -0.35;
  mic.rotation.x = 0.25;
  scene.add(mic);

  // Sound rings go out from the head, fading as they grow.
  const rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  for (let i = 0; i < 4; i += 1) {
    const m = new THREE.MeshBasicMaterial({ color: grey(1) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 8, 96), m);
    ring.position.set(-0.2, 0.5, 0);
    scene.add(ring);
    rings.push({ mesh: ring, mat: m });
  }
  const bg = 0.16;
  return {
    scene,
    camera: makeCamera(34, [0, 0.2, 5.2], [0, 0.1, 0]),
    tick(t) {
      mic.rotation.y = Math.sin(t * 0.6) * 0.35;
      rings.forEach((r, i) => {
        const u = (t / 2.6 + i / rings.length) % 1;
        r.mesh.scale.setScalar(0.75 + u * 1.6);
        const v = bg + (1 - bg) * (1 - u) * (1 - u);
        r.mat.color.setRGB(v, v, v);
      });
    },
  };
}

// ------------------------------------------------------------ 2: blaster and board
function blaster(): Channel {
  const scene = new THREE.Scene();
  scene.background = grey(0.14);
  lit(scene, [-3, 4, 3]);
  const gun = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.42), mat(0.85));
  gun.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.3), mat(0.6));
  top.position.set(-0.1, 0.33, 0);
  gun.add(top);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.1, 24), mat(0.95, 0.35));
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(1.5, 0.05, 0);
  gun.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 10, 24), mat(0.5));
  muzzle.rotation.y = Math.PI / 2;
  muzzle.position.set(2.05, 0.05, 0);
  gun.add(muzzle);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.36), mat(0.7));
  grip.position.set(-0.55, -0.62, 0);
  grip.rotation.z = -0.28;
  gun.add(grip);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 24, Math.PI), mat(0.6));
  guard.rotation.z = Math.PI;
  guard.position.set(-0.1, -0.3, 0);
  gun.add(guard);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.46, 28), mat(0.95, 0.4));
  drum.rotation.x = Math.PI / 2;
  drum.position.set(0.35, -0.12, 0);
  gun.add(drum);
  gun.position.set(-0.3, 0.1, 0);
  scene.add(gun);

  // The sensor board: a plate, three chips and a row of pins, wired to the grip.
  const board = new THREE.Group();
  board.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.7), mat(0.35)));
  const chipMat = mat(0.95, 0.3);
  for (const [x, z, s] of [[-0.25, -0.1, 0.26], [0.2, 0.12, 0.18], [0.3, -0.18, 0.12]] as const) {
    const chip = new THREE.Mesh(new THREE.BoxGeometry(s, 0.06, s), chipMat);
    chip.position.set(x, 0.05, z);
    board.add(chip);
  }
  const pinMat = mat(0.8, 0.3);
  for (let i = 0; i < 10; i += 1) {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.035), pinMat);
    pin.position.set(-0.45 + i * 0.1, 0.09, 0.3);
    board.add(pin);
  }
  board.position.set(0.9, -1.05, 0.3);
  board.rotation.set(0.9, -0.3, 0.1);
  scene.add(board);
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.75, -1.05, 0),
        new THREE.Vector3(-0.3, -1.6, 0.4),
        new THREE.Vector3(0.4, -1.4, 0.4),
        new THREE.Vector3(0.6, -1.05, 0.3),
      ]),
      32,
      0.025,
      6,
    ),
    mat(0.9),
  );
  scene.add(wire);
  return {
    scene,
    camera: makeCamera(34, [0.4, 0.6, 6.4], [0.3, -0.35, 0]),
    tick(t) {
      gun.rotation.y = -0.35 + Math.sin(t * 0.5) * 0.3;
      gun.rotation.x = Math.sin(t * 0.8) * 0.06;
      board.rotation.y = -0.3 + Math.sin(t * 0.7 + 1) * 0.25;
    },
  };
}

// ------------------------------------------------------------ 3: ring and gloves
function glove(side: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0.92, 0.45);
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 20), m);
  fist.scale.set(1.25, 0.9, 1);
  g.add(fist);
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), m);
  thumb.position.set(0.05, -0.05, 0.3 * side);
  g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.36, 24), mat(0.6));
  cuff.rotation.z = Math.PI / 2;
  cuff.position.x = -0.5;
  g.add(cuff);
  return g;
}

function ring(): Channel {
  const scene = new THREE.Scene();
  scene.background = grey(0.15);
  lit(scene, [-2, 5, 3]);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 3.2), mat(0.75));
  floor.position.y = -0.15;
  scene.add(floor);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.5, 3.3), mat(0.45));
  apron.position.y = -0.55;
  scene.add(apron);
  const postMat = mat(0.95, 0.3);
  const ropeMat = mat(0.9, 0.4);
  const corners: [number, number][] = [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]];
  for (const [x, z] of corners) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12), postMat);
    post.position.set(x, 0.6, z);
    scene.add(post);
  }
  const rope = new THREE.CylinderGeometry(0.025, 0.025, 3, 8);
  for (let side = 0; side < 4; side += 1) {
    const [ax, az] = corners[side];
    const [bx, bz] = corners[(side + 1) % 4];
    for (const y of [0.4, 0.7, 1.0]) {
      const r = new THREE.Mesh(rope, ropeMat);
      r.position.set((ax + bx) / 2, y, (az + bz) / 2);
      // Lie along x or along z.
      if (az === bz) r.rotation.z = Math.PI / 2;
      else r.rotation.x = Math.PI / 2;
      scene.add(r);
    }
  }
  const left = glove(1);
  const right = glove(-1);
  right.rotation.y = Math.PI;
  scene.add(left, right);
  return {
    scene,
    camera: makeCamera(36, [0, 3.2, 5.6], [0, 0.35, 0]),
    tick(t) {
      // One jabs while the other pulls back, and both bob.
      const a = Math.max(0, Math.sin(t * 2.2));
      const b = Math.max(0, Math.sin(t * 2.2 + Math.PI));
      left.position.set(-0.75 + a * 0.35, 0.95 + Math.sin(t * 3) * 0.05, 0.2);
      right.position.set(0.75 - b * 0.35, 0.95 + Math.sin(t * 3 + 1) * 0.05, -0.2);
    },
  };
}

// ------------------------------------------------------------ 4: robot on the field
function field(robotReady: (group: THREE.Group) => void): Channel {
  const scene = new THREE.Scene();
  scene.background = grey(0.14);
  lit(scene, [-2, 5, 3], 2.8, 2.0);
  // Six by six foam tiles, two greys, and the white tape lines.
  const tile = new THREE.PlaneGeometry(0.98, 0.98);
  const light = mat(0.55, 0.9);
  const dark = mat(0.42, 0.9);
  for (let i = 0; i < 6; i += 1) {
    for (let j = 0; j < 6; j += 1) {
      const t = new THREE.Mesh(tile, (i + j) % 2 ? light : dark);
      t.rotation.x = -Math.PI / 2;
      t.position.set(i - 2.5, 0, j - 2.5);
      scene.add(t);
    }
  }
  const tape = mat(1, 0.6);
  for (const [w, d, x, z] of [[6, 0.05, 0, 0], [0.05, 6, 0, 0], [6, 0.05, 0, -3], [6, 0.05, 0, 3]] as const) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), tape);
    line.position.set(x, 0.005, z);
    scene.add(line);
  }
  const drive = new THREE.Group();
  scene.add(drive);
  robotReady(drive);
  return {
    scene,
    camera: makeCamera(38, [0, 3.4, 4.6], [0, 0.2, 0.2]),
    tick(t) {
      // Round a circle, facing along it.
      const a = t * 0.35;
      drive.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1);
      drive.rotation.y = -a;
    },
  };
}

// ------------------------------------------------------------ 5: ringed planet
function planet(): { channel: Channel; textures: THREE.Texture[] } {
  const scene = new THREE.Scene();
  scene.background = grey(0.1);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.position.set(-4, 2, 3);
  scene.add(sun);

  // Bands across the globe, drawn once on a small canvas.
  const bands = document.createElement("canvas");
  bands.width = 16;
  bands.height = 256;
  const b = bands.getContext("2d");
  if (b) {
    for (let y = 0; y < 256; y += 1) {
      const v = 150 + 60 * Math.sin(y * 0.19) + 30 * Math.sin(y * 0.53 + 1);
      b.fillStyle = `rgb(${v},${v},${v})`;
      b.fillRect(0, y, 16, 1);
    }
  }
  const bandTex = new THREE.CanvasTexture(bands);
  bandTex.colorSpace = THREE.SRGBColorSpace;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.9 }));
  // The ring's texture is concentric circles: RingGeometry's uv is flat
  // across the disc, so circles on the canvas land as bands round it.
  const disc = document.createElement("canvas");
  disc.width = 512;
  disc.height = 512;
  const d = disc.getContext("2d");
  if (d) {
    const img = d.createImageData(512, 512);
    for (let y = 0; y < 512; y += 1) {
      for (let x = 0; x < 512; x += 1) {
        const r = Math.hypot(x - 255.5, y - 255.5);
        const f = r / 256;
        // Clear inside the ring, past its edge, and in one gap.
        const clear = f < 0.6 || f > 0.99 || (f > 0.78 && f < 0.81);
        const v = 170 + 70 * Math.sin(r * 0.21);
        const i = (y * 512 + x) * 4;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = clear ? 0 : 255;
      }
    }
    d.putImageData(img, 0, 0);
  }
  const discTex = new THREE.CanvasTexture(disc);
  discTex.colorSpace = THREE.SRGBColorSpace;
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(1.35, 2.3, 96, 1),
    new THREE.MeshBasicMaterial({ map: discTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 }),
  );
  ringMesh.rotation.x = -Math.PI / 2 + 0.38;
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.32;
  tilt.add(globe, ringMesh);
  scene.add(tilt);

  // Stars from a seeded sequence, so every visit has the same sky.
  let seed = 7;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const stars = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i += 1) {
    stars[i * 3] = (rand() - 0.5) * 14;
    stars[i * 3 + 1] = (rand() - 0.5) * 10;
    stars[i * 3 + 2] = -4 - rand() * 3;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false })));
  return {
    channel: {
      scene,
      camera: makeCamera(34, [0, 0.4, 6.2], [0, 0, 0]),
      tick(t) {
        globe.rotation.y = t * 0.25;
        tilt.rotation.y = Math.sin(t * 0.2) * 0.25;
      },
    },
    textures: [bandTex, discTex],
  };
}

// ------------------------------------------------------------ 6: the test card
/** Five bars, light to dark, one per skill group. Plum and blossom tones. */
export const CARD_TONES = ["#fde3f0", "#f9b9dc", "#d98fb6", "#8a4a72", "#4a1a36"];

function drawCard(canvas: HTMLCanvasElement, mono: string, sans: string): void {
  const c = canvas.getContext("2d");
  if (!c) return;
  const W = canvas.width;
  const H = canvas.height;
  c.fillStyle = "#6a3a56";
  c.fillRect(0, 0, W, H);
  const top = 46;
  const bottom = H - 56;
  const barW = W / skillGroups.length;
  skillGroups.forEach((g, i) => {
    const x = i * barW;
    c.fillStyle = CARD_TONES[i];
    c.fillRect(x, top, barW, bottom - top);
    const ink = i < 3 ? "#2a0d1e" : "#ffffff";
    c.fillStyle = ink;
    c.font = `600 15px ${mono}`;
    c.textAlign = "center";
    c.textBaseline = "top";
    c.fillText(g.label.split(" ")[0].toUpperCase(), x + barW / 2, top + 10);
    // Each skill's mark, stacked down the bar.
    const step = Math.min(30, (bottom - top - 44) / g.skills.length);
    g.skills.forEach((s, k) => {
      const cy = top + 44 + k * step + step / 2;
      const icon = skillIcon(s.icon);
      const size = step * 0.72;
      if (icon) {
        c.save();
        c.translate(x + barW / 2 - size / 2, cy - size / 2);
        c.scale(size / 24, size / 24);
        c.fill(new Path2D(icon.path));
        c.restore();
      } else {
        c.font = `700 ${Math.round(size * 0.55)}px ${sans}`;
        c.textBaseline = "middle";
        c.fillText(s.mark ?? s.name.slice(0, 2), x + barW / 2, cy);
        c.textBaseline = "top";
      }
    });
  });
  // The strip along the top, the steps along the bottom, the circle.
  c.fillStyle = "#fde3f0";
  c.font = `500 18px ${mono}`;
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText("CH 06  SKILLS", 18, top / 2);
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    const v = Math.round(40 + (215 * i) / (steps - 1));
    c.fillStyle = `rgb(${v},${Math.round(v * 0.75)},${Math.round(v * 0.87)})`;
    c.fillRect((i * W) / steps, bottom, W / steps + 1, H - bottom);
  }
  c.strokeStyle = "#ffffff";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(W / 2, (top + bottom) / 2 + 12, Math.min(W, bottom - top) * 0.34, 0, Math.PI * 2);
  c.stroke();
}

// ------------------------------------------------------------ all of them
export function buildChannels(monoFamily: string, sansFamily: string, loadRobot: boolean): Channels {
  const cardCanvas = document.createElement("canvas");
  cardCanvas.width = PICTURE_W;
  cardCanvas.height = PICTURE_H;
  drawCard(cardCanvas, monoFamily, sansFamily);
  const card = new THREE.CanvasTexture(cardCanvas);
  card.colorSpace = THREE.SRGBColorSpace;

  let disposed = false;
  const robotParts: { dispose(): void }[] = [];
  const onDrive = (drive: THREE.Group): void => {
    if (!loadRobot) return;
    const load = async (): Promise<void> => {
      const res = await fetch("/models/hero.glb");
      if (!res.ok) return;
      const bytes = await res.arrayBuffer();
      if (disposed) return;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.parseAsync(bytes, "");
      // Its greys, lifted so no part falls near black on the small screen.
      const swapped = new Map<THREE.Material, THREE.MeshStandardMaterial>();
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        robotParts.push(mesh.geometry);
        const old = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
        let made = swapped.get(old);
        if (!made) {
          const c = old.color ?? new THREE.Color(1, 1, 1);
          const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
          made = mat(0.3 + 0.65 * Math.sqrt(l), 0.5);
          swapped.set(old, made);
          robotParts.push(made);
          old.dispose();
        }
        mesh.material = made;
      });
      if (disposed) {
        for (const p of robotParts) p.dispose();
        return;
      }
      // The model is 0.46 m tall and the tiles here are 1 unit, so it is
      // scaled up to about one tile. Its front is +x; the drive heads
      // along its own +z, so a quarter turn puts the front first.
      gltf.scene.scale.setScalar(2.4);
      gltf.scene.rotation.y = -Math.PI / 2;
      drive.add(gltf.scene);
    };
    load().catch(() => undefined);
  };

  const p = planet();
  const list = [microphone(), blaster(), ring(), field(onDrive), p.channel];

  return {
    list,
    card,
    redrawCard(mono, sans) {
      drawCard(cardCanvas, mono, sans);
      card.needsUpdate = true;
    },
    dispose() {
      disposed = true;
      const seen = new Set<{ dispose(): void }>();
      for (const ch of list) {
        ch.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) seen.add(mesh.geometry);
          const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(m)) m.forEach((x) => seen.add(x));
          else if (m) seen.add(m);
        });
      }
      for (const t of p.textures) seen.add(t);
      for (const r of robotParts) seen.add(r);
      seen.add(card);
      for (const x of seen) x.dispose();
    },
  };
}
