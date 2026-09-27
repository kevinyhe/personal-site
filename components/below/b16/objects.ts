import * as THREE from "three";
import { petalOutline } from "@/components/petalGlyphs";
import { HANG_DROP, TRUNK_TOP, TRUNK_TOP_RADIUS, trunkRadius, trunkX } from "./layout";

/**
 * The things in the tree that are not the generator's: the trunk the
 * branches grow from, the five small objects hanging one from each branch,
 * and the loose petal. All drawn here in code.
 *
 * Colours are chosen for the bar dither, which reads brightness only: a
 * pale face becomes a wide bar, a dark one a hairline. So the objects are
 * pale blossom and white, with plum only where a part should read thin.
 */

const PALE = "#fde7f2";
const PINK = "#f9b9dc";
const DUSK = "#9a5a80";
const DARK = "#5a2549";

function standard(colour: string, lift = 0.28): THREE.MeshStandardMaterial {
  const c = new THREE.Color(colour);
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.62,
    metalness: 0,
    // Lit from any side it still reads: the dither has no use for a face
    // that falls to black.
    emissive: c.clone().multiplyScalar(lift),
  });
}

/** Everything made here, for one dispose. */
export type Kit = { dispose(): void };

// ------------------------------------------------------------ the trunk

/**
 * The trunk: rings up the leaning axis, each one a little out of round
 * so the bark catches the light in ridges. It runs past TRUNK_TOP and
 * overlaps the foot of the crown tree's own trunk, so the join has no seam.
 */
export function buildTrunk(): { mesh: THREE.Mesh; kit: Kit } {
  const rings = 96;
  const around = 28;
  const bottom = -0.6;
  const top = TRUNK_TOP + 3.2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let r = 0; r <= rings; r += 1) {
    const y = bottom + ((top - bottom) * r) / rings;
    const base = y <= TRUNK_TOP ? trunkRadius(Math.max(0, y)) : TRUNK_TOP_RADIUS * 1.04;
    const cx = trunkX(Math.min(y, TRUNK_TOP));
    for (let a = 0; a <= around; a += 1) {
      const t = (a / around) * Math.PI * 2;
      // Bark ridges run up the trunk and twist a little as they go.
      const ridge = 1 + 0.06 * Math.sin(t * 9 + y * 0.35) + 0.035 * Math.sin(t * 4 - y * 0.9);
      const rad = base * ridge;
      positions.push(cx + Math.cos(t) * rad, y, Math.sin(t) * rad);
      uvs.push(a / around, y / 6);
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let a = 0; a < around; a += 1) {
      const i0 = r * (around + 1) + a;
      const i1 = i0 + around + 1;
      index.push(i0, i1, i0 + 1, i1, i1 + 1, i0 + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();

  const texture = barkTexture();
  const material = new THREE.MeshStandardMaterial({
    // Mid-tone on purpose. The grade turns a lit blossom into a full bar;
    // the trunk lit by the key comes out near 150 of 255, about half a
    // bar, and its shadow side near 70, a hairline. So wood and flower
    // stay apart in the bars.
    color: "#8f7d87",
    map: texture ?? undefined,
    roughness: 0.9,
    metalness: 0,
    emissive: new THREE.Color("#2a1c24"),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Trunk";
  return {
    mesh,
    kit: {
      dispose() {
        geometry.dispose();
        material.dispose();
        texture?.dispose();
      },
    },
  };
}

/** Long dark fissures on a pale ground, drawn once on a canvas, so the bars on the trunk break into bark. */
function barkTexture(): THREE.CanvasTexture | null {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#d8d0d4";
  g.fillRect(0, 0, 256, 256);
  // A fixed sequence, not Math.random: the same bark on every visit.
  let s = 1234567;
  const rand = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let k = 0; k < 70; k += 1) {
    const x = rand() * 256;
    const w = 1 + rand() * 4;
    const y0 = rand() * 256;
    const len = 40 + rand() * 160;
    g.fillStyle = `rgba(60, 40, 52, ${0.25 + rand() * 0.45})`;
    g.beginPath();
    g.moveTo(x, y0);
    g.bezierCurveTo(x + (rand() - 0.5) * 12, y0 + len * 0.33, x + (rand() - 0.5) * 12, y0 + len * 0.66, x + (rand() - 0.5) * 8, y0 + len);
    g.lineWidth = w;
    g.strokeStyle = g.fillStyle;
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The thick piece where a branch leaves the trunk. The generator's stem is
 * thin at its cut end; this tapers from trunk-thick down to it. In the
 * spray's own frame: from inside the trunk at +x out along the stem's rise.
 */
export function buildCollar(material: THREE.MeshStandardMaterial): THREE.Mesh {
  const from = new THREE.Vector3(0.9, -0.22, 0);
  const to = new THREE.Vector3(-0.95, 0.3, 0.01);
  const length = from.distanceTo(to);
  const geometry = new THREE.CylinderGeometry(0.14, 0.52, length, 18, 4);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  // Cylinder's +y is its thin end; point that along the stem.
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  mesh.name = "Branch collar";
  return mesh;
}

// ------------------------------------------------------- hanging objects

/**
 * One object per project, hanging on a thread. Each group's origin is the
 * point on the branch it hangs from; the thread runs down HANG_DROP and the
 * object hangs below that, about a unit across. Built from primitives so
 * each one reads by its outline alone, which is all the dither keeps.
 */
export function buildHangers(): { groups: THREE.Group[]; kit: Kit } {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T): T => {
    geometries.push(x);
    return x;
  };
  const pale = standard(PALE);
  const pink = standard(PINK);
  const dusk = standard(DUSK, 0.15);
  const dark = standard(DARK, 0.1);
  const ringMat = new THREE.MeshStandardMaterial({ color: PINK, emissive: new THREE.Color(PINK).multiplyScalar(0.3), roughness: 0.6, side: THREE.DoubleSide });
  materials.push(pale, pink, dusk, dark, ringMat);

  const thread = g(new THREE.CylinderGeometry(0.018, 0.018, 1, 5));
  const withThread = (length: number): THREE.Group => {
    const group = new THREE.Group();
    const line = new THREE.Mesh(thread, pale);
    line.scale.y = length;
    line.position.y = -length / 2;
    group.add(line);
    return group;
  };
  const drop = HANG_DROP;

  // 0. A microphone on its cable: handle up, head down.
  const mic = withThread(drop);
  {
    const handle = new THREE.Mesh(g(new THREE.CylinderGeometry(0.1, 0.075, 0.62, 16)), pale);
    handle.position.y = -drop - 0.31;
    const band = new THREE.Mesh(g(new THREE.CylinderGeometry(0.15, 0.12, 0.1, 18)), dusk);
    band.position.y = -drop - 0.66;
    const head = new THREE.Mesh(g(new THREE.SphereGeometry(0.25, 20, 14)), pale);
    head.position.y = -drop - 0.9;
    // The grille: rings round the head, darker, so the head reads as mesh.
    const grille = g(new THREE.TorusGeometry(0.245, 0.012, 5, 28));
    for (let k = -2; k <= 2; k += 1) {
      const ring = new THREE.Mesh(grille, dusk);
      const yy = k * 0.085;
      const rr = Math.sqrt(Math.max(0.001, 0.25 * 0.25 - yy * yy)) / 0.245;
      ring.scale.set(rr, rr, 1);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = head.position.y + yy;
      mic.add(ring);
    }
    mic.add(handle, band, head);
  }

  // 1. A sensor board: the blaster's IMU and ESP32 on one small card.
  const board = withThread(drop);
  {
    const card = new THREE.Mesh(g(new THREE.BoxGeometry(0.95, 0.64, 0.05)), pink);
    card.position.y = -drop - 0.34;
    const chip = new THREE.Mesh(g(new THREE.BoxGeometry(0.34, 0.26, 0.06)), dark);
    chip.position.set(-0.18, card.position.y + 0.05, 0.05);
    const imu = new THREE.Mesh(g(new THREE.BoxGeometry(0.14, 0.14, 0.05)), dusk);
    imu.position.set(0.22, card.position.y + 0.1, 0.05);
    const shield = new THREE.Mesh(g(new THREE.BoxGeometry(0.3, 0.22, 0.04)), pale);
    shield.position.set(-0.18, card.position.y + 0.05, 0.09);
    board.add(card, chip, imu, shield);
    const pin = g(new THREE.BoxGeometry(0.035, 0.08, 0.05));
    for (let k = 0; k < 10; k += 1) {
      const p = new THREE.Mesh(pin, pale);
      p.position.set(-0.4 + k * 0.088, card.position.y - 0.36, 0);
      board.add(p);
    }
    const hole = new THREE.Mesh(g(new THREE.TorusGeometry(0.04, 0.012, 5, 12)), pale);
    hole.position.set(0, -drop + 0.0, 0.03);
    board.add(hole);
  }

  // 2. A boxing glove, hung by its cuff.
  const glove = withThread(drop);
  {
    const cuff = new THREE.Mesh(g(new THREE.CylinderGeometry(0.2, 0.22, 0.3, 18)), pale);
    cuff.position.y = -drop - 0.15;
    const trim = new THREE.Mesh(g(new THREE.TorusGeometry(0.21, 0.035, 8, 20)), dusk);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = -drop - 0.02;
    const fist = new THREE.Mesh(g(new THREE.SphereGeometry(0.34, 22, 16)), pink);
    fist.scale.set(1, 1.12, 0.92);
    fist.position.set(0, -drop - 0.62, 0.02);
    const thumb = new THREE.Mesh(g(new THREE.CapsuleGeometry(0.1, 0.22, 6, 12)), pink);
    thumb.rotation.z = 0.5;
    thumb.position.set(-0.3, -drop - 0.5, 0.1);
    glove.add(cuff, trim, fist, thumb);
  }

  // 3. A small robot: chassis, four wheels, a lift tower.
  const robot = withThread(drop);
  {
    const chassis = new THREE.Mesh(g(new THREE.BoxGeometry(0.78, 0.2, 0.5)), pale);
    chassis.position.y = -drop - 0.52;
    const tower = new THREE.Mesh(g(new THREE.BoxGeometry(0.12, 0.42, 0.12)), pink);
    tower.position.set(0.1, -drop - 0.22, 0);
    const arm = new THREE.Mesh(g(new THREE.BoxGeometry(0.5, 0.08, 0.1)), dusk);
    arm.position.set(-0.08, -drop - 0.06, 0);
    const wheel = g(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 18));
    for (const [x, z] of [[-0.27, 0.29], [0.27, 0.29], [-0.27, -0.29], [0.27, -0.29]]) {
      const w = new THREE.Mesh(wheel, dark);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, -drop - 0.6, z);
      robot.add(w);
    }
    robot.add(chassis, tower, arm);
  }

  // 4. A ringed planet.
  const planet = withThread(drop);
  {
    const ball = new THREE.Mesh(g(new THREE.SphereGeometry(0.3, 24, 16)), pale);
    ball.position.y = -drop - 0.34;
    const ring = new THREE.Mesh(g(new THREE.RingGeometry(0.42, 0.62, 48, 1)), ringMat);
    ring.position.copy(ball.position);
    ring.rotation.set(-1.2, 0.35, 0);
    const band = new THREE.Mesh(g(new THREE.TorusGeometry(0.3, 0.02, 5, 32)), dusk);
    band.position.copy(ball.position);
    band.rotation.set(-1.2, 0.35, 0);
    band.scale.setScalar(0.985);
    planet.add(ball, ring, band);
  }

  const groups = [mic, board, glove, robot, planet];
  groups.forEach((h, i) => {
    h.name = `Hanging object ${i}`;
  });
  return {
    groups,
    kit: {
      dispose() {
        for (const x of geometries) x.dispose();
        for (const m of materials) m.dispose();
      },
    },
  };
}

// ------------------------------------------------------------ the petal

/** The hero's petal outline (petalGlyphs), flat, one unit long. */
export function petalGeometry(): THREE.BufferGeometry {
  const flat = petalOutline(1, 0.6);
  const shape = new THREE.Shape();
  shape.moveTo(flat[0], flat[1]);
  for (let k = 2; k < flat.length; k += 2) shape.lineTo(flat[k], flat[k + 1]);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 2);
}
