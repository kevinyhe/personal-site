import * as THREE from "three";
import { petalOutline } from "@/components/petalGlyphs";
import * as L from "./layout";

/**
 * The things in the scene that are not the tree generator's: the hill,
 * the five plaques on their strings, the stone lantern, and the shapes of
 * a loose petal, a leaf and a snowflake. All drawn here in code.
 *
 * Colours are chosen for the bar dither, which reads brightness only: a
 * pale face becomes a wide bar, a dark one a hairline.
 */

export type Kit = { dispose(): void };

/** A fixed sequence, not Math.random: the same picture on every visit. */
export function lcg(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// --------------------------------------------------------------- the hill

export function buildHill(): { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; kit: Kit } {
  const rings = 44;
  const around = 72;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const rand = lcg(2929);
  for (let k = 0; k <= rings; k += 1) {
    // Rings closer together near the tree, where the camera is.
    const r = L.HILL_RADIUS * Math.pow(k / rings, 1.7);
    for (let a = 0; a <= around; a += 1) {
      const t = (a / around) * Math.PI * 2;
      const x = Math.cos(t) * r;
      const z = Math.sin(t) * r;
      // A little unevenness, none at the trunk.
      const bump = k > 2 ? (rand() - 0.5) * 0.18 * Math.min(1, r / 8) : 0;
      positions.push(x, L.hillY(r) + bump, z);
      uvs.push(x / 5, z / 5);
    }
  }
  for (let k = 0; k < rings; k += 1) {
    for (let a = 0; a < around; a += 1) {
      const i0 = k * (around + 1) + a;
      const i1 = i0 + around + 1;
      index.push(i0, i0 + 1, i1, i1, i0 + 1, i1 + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const texture = grassTexture();
  const material = new THREE.MeshStandardMaterial({ color: "#6a5a62", map: texture ?? undefined, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Hill";
  return {
    mesh,
    material,
    kit: {
      dispose() {
        geometry.dispose();
        material.dispose();
        texture?.dispose();
      },
    },
  };
}

/** Short strokes of grass, light on mid grey, so the hill breaks into uneven bars instead of a flat block. */
function grassTexture(): THREE.CanvasTexture | null {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#b8b0b4";
  g.fillRect(0, 0, 128, 128);
  const rand = lcg(77);
  for (let k = 0; k < 260; k += 1) {
    const x = rand() * 128;
    const y = rand() * 128;
    const light = rand() > 0.5;
    g.strokeStyle = light ? "rgba(255, 255, 255, 0.55)" : "rgba(40, 28, 36, 0.35)";
    g.lineWidth = 1 + rand() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 4, y - 3 - rand() * 6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------- the plaques

const ROMAN = ["I", "II", "III", "IV", "V"];

/**
 * The face of plaque i: pale wood, a thin grain, a border cut in, and the
 * project's number as a Roman numeral in brush-thick plum strokes. The
 * numeral is drawn from straight strokes, so it needs no font.
 */
function plaqueTexture(i: number): THREE.CanvasTexture | null {
  const W = 256;
  const H = Math.round((W * L.PLAQUE_H) / L.PLAQUE_W);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#f3e6ea";
  g.fillRect(0, 0, W, H);
  const rand = lcg(500 + i * 31);
  for (let k = 0; k < 26; k += 1) {
    const y = rand() * H;
    g.strokeStyle = `rgba(120, 80, 96, ${0.08 + rand() * 0.12})`;
    g.lineWidth = 1 + rand() * 2;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + (rand() - 0.5) * 10, W * 0.7, y + (rand() - 0.5) * 10, W, y + (rand() - 0.5) * 6);
    g.stroke();
  }
  // The border, following the pitched top.
  const inset = 14;
  const eave = H * (1 - 0.45) * 0.5;
  g.strokeStyle = "#5a2549";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(inset, H - inset);
  g.lineTo(W - inset, H - inset);
  g.lineTo(W - inset, eave + inset * 0.6);
  g.lineTo(W / 2, inset + 4);
  g.lineTo(inset, eave + inset * 0.6);
  g.closePath();
  g.stroke();
  // The numeral.
  const glyph = ROMAN[i] ?? "";
  const sh = H * 0.36;
  const sw = sh * 0.34;
  const gap = sh * 0.2;
  const cy = H * 0.62;
  const parts: ("I" | "V")[] = glyph.split("") as ("I" | "V")[];
  const widthOf = (p: "I" | "V"): number => (p === "I" ? sw * 0.5 : sh * 0.7);
  const total = parts.reduce((s, p) => s + widthOf(p), 0) + gap * (parts.length - 1);
  let x = W / 2 - total / 2;
  g.strokeStyle = "#2a0d1e";
  g.lineCap = "square";
  g.lineWidth = sw * 0.5;
  for (const p of parts) {
    const w = widthOf(p);
    g.beginPath();
    if (p === "I") {
      g.moveTo(x + w / 2, cy - sh / 2);
      g.lineTo(x + w / 2, cy + sh / 2);
    } else {
      g.moveTo(x, cy - sh / 2);
      g.lineTo(x + w / 2, cy + sh / 2);
      g.lineTo(x + w, cy - sh / 2);
    }
    g.stroke();
    x += w + gap;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // The face's UVs are its own shape coordinates, centred; these map them onto the canvas.
  t.repeat.set(1 / L.PLAQUE_W, 1 / L.PLAQUE_H);
  t.offset.set(0.5, 0.5);
  return t;
}

export type Plaque = {
  /** At the hook. Turn it about y to turn the board; tilt it to swing. */
  group: THREE.Group;
  /** The board and its string, below the hook. */
  board: THREE.Group;
  string: THREE.Mesh;
};

export function buildPlaques(): { plaques: Plaque[]; kit: Kit } {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const w = L.PLAQUE_W / 2;
  const h = L.PLAQUE_H / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w, -h);
  shape.lineTo(w, -h);
  shape.lineTo(w, h * 0.45);
  shape.lineTo(0, h);
  shape.lineTo(-w, h * 0.45);
  shape.closePath();
  const boardGeo = new THREE.ExtrudeGeometry(shape, { depth: L.PLAQUE_D, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
  boardGeo.translate(0, 0, -L.PLAQUE_D / 2);
  geometries.push(boardGeo);
  const edge = new THREE.MeshStandardMaterial({ color: "#c9aab8", roughness: 0.8, emissive: new THREE.Color("#3a2430") });
  const cord = new THREE.MeshStandardMaterial({ color: "#f9b9dc", roughness: 0.7, emissive: new THREE.Color("#6a3050") });
  materials.push(edge, cord);
  const stringGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 5);
  stringGeo.translate(0, -0.5, 0);
  const knotGeo = new THREE.SphereGeometry(0.05, 10, 8);
  geometries.push(stringGeo, knotGeo);

  const plaques: Plaque[] = L.HOOKS.map((hook, i) => {
    const tex = plaqueTexture(i);
    if (tex) textures.push(tex);
    const face = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: tex ?? undefined,
      roughness: 0.75,
      metalness: 0,
      // Lit or not, the face stays pale enough to read as a board.
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: tex ?? undefined,
      emissiveIntensity: 0.35,
    });
    materials.push(face);
    const group = new THREE.Group();
    group.name = `Plaque ${i}`;
    group.position.set(hook[0], hook[1], hook[2]);
    const string = new THREE.Mesh(stringGeo, cord);
    string.scale.y = L.STRING;
    group.add(string);
    const board = new THREE.Group();
    board.position.y = -L.STRING - h;
    const mesh = new THREE.Mesh(boardGeo, [face, edge]);
    board.add(mesh);
    const knot = new THREE.Mesh(knotGeo, cord);
    knot.position.set(0, h + 0.02, L.PLAQUE_D * 0.6);
    board.add(knot);
    group.add(board);
    return { group, board, string };
  });
  return {
    plaques,
    kit: {
      dispose() {
        for (const g of geometries) g.dispose();
        for (const m of materials) m.dispose();
        for (const t of textures) t.dispose();
      },
    },
  };
}

// ------------------------------------------------------------- the lantern

/**
 * A stone lantern: a foot, a post, a firebox with open windows, a wide
 * roof and a knob on top. The firebox's inside is a separate mesh, so the
 * light can come up at night without lighting the stone.
 */
export function buildLantern(): { group: THREE.Group; fire: THREE.MeshStandardMaterial; kit: Kit } {
  const geometries: THREE.BufferGeometry[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T): T => {
    geometries.push(x);
    return x;
  };
  const stone = new THREE.MeshStandardMaterial({ color: "#a89aa2", roughness: 0.95, emissive: new THREE.Color("#1e1418") });
  const fire = new THREE.MeshStandardMaterial({ color: "#fff2f8", emissive: new THREE.Color("#fff0f6"), emissiveIntensity: 0.2, roughness: 1 });
  const H = L.LANTERN_H;
  const group = new THREE.Group();
  group.name = "Stone lantern";
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, rotY = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.rotation.y = rotY;
    group.add(m);
    return m;
  };
  add(g(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 6)), stone, 0.07);
  add(g(new THREE.CylinderGeometry(0.11, 0.14, H * 0.42, 8)), stone, 0.14 + H * 0.21);
  add(g(new THREE.CylinderGeometry(0.3, 0.2, 0.12, 6)), stone, H * 0.5);
  // The firebox: four corner posts round a glowing core.
  const boxY = H * 0.5 + 0.06 + 0.2;
  add(g(new THREE.BoxGeometry(0.3, 0.34, 0.3)), fire, boxY, Math.PI / 4);
  const post = g(new THREE.BoxGeometry(0.07, 0.4, 0.07));
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const m = new THREE.Mesh(post, stone);
    m.position.set(Math.cos(a) * 0.23, boxY, Math.sin(a) * 0.23);
    group.add(m);
  }
  add(g(new THREE.ConeGeometry(0.58, 0.32, 6)), stone, boxY + 0.36);
  add(g(new THREE.SphereGeometry(0.08, 10, 8)), stone, boxY + 0.58);
  group.position.set(...L.LANTERN_POS);
  return {
    group,
    fire,
    kit: {
      dispose() {
        for (const x of geometries) x.dispose();
        stone.dispose();
        fire.dispose();
      },
    },
  };
}
/** Height of the lantern's light above its foot. */
export const LANTERN_FIRE_Y = L.LANTERN_H * 0.5 + 0.26;

// ------------------------------------------------- petal, leaf, snowflake

/** The hero's petal outline (petalGlyphs), flat, one unit long. */
export function petalGeometry(): THREE.BufferGeometry {
  const flat = petalOutline(1, 0.6);
  const shape = new THREE.Shape();
  shape.moveTo(flat[0], flat[1]);
  for (let k = 2; k < flat.length; k += 2) shape.lineTo(flat[k], flat[k + 1]);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 2);
}

/** A cherry leaf: pointed at the tip, round at the base, one unit long, its stalk at the origin. */
export function leafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.22, 0.12, 0.26, 0.55, 0, 1);
  shape.bezierCurveTo(-0.26, 0.55, -0.22, 0.12, 0, 0);
  return new THREE.ShapeGeometry(shape, 6);
}

export function flakeGeometry(): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(1, 0);
}
