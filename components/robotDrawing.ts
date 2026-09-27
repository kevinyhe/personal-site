import * as THREE from "three";

import { buildEdges } from "@/components/robotEdges";

/**
 * The robot as an engineer's drawing: its real edges in one colour over a
 * flat fill, and round it a full set of dimensions, all built from the
 * model's own measurements.
 *
 * It lives in the robot's own scene. begin() swaps every part to the fill
 * and shows the lines; end() puts the parts back. So one renderer, one
 * camera and one pose draw both pictures, and the drawing always lines up
 * with the shaded robot to the pixel.
 *
 * The dimensions hang off the robot group, so they turn with it, the way
 * dimensions on a drawing belong to the part. The one exception is the
 * heading dial on the floor: it holds still while the robot turns over
 * it, and an arc on it shows how far the robot has turned.
 */

export type RobotDrawing = {
  begin(): void;
  end(): void;
  dispose(): void;
};

type Colours = { fill: string; edge: string; dim: string; faint: string };

const MM = 1000;
/** Label height in metres. The robot stands about 0.46 m. */
const TEXT_H = 0.0135;
/** Edges kept where faces meet at more than this, degrees. */
const CREASE = 30;

export function buildRobotDrawing(
  robotRoot: THREE.Object3D,
  model: THREE.Object3D,
  wheels: THREE.Object3D[],
  colours: Colours,
  fontFamily: string,
): RobotDrawing {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // --- The parts and their edges ------------------------------------------------
  const fill = keep(
    new THREE.MeshBasicMaterial({ color: colours.fill, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  );
  const edgeMat = keep(new THREE.LineBasicMaterial({ color: colours.edge }));
  const meshes: THREE.Mesh[] = [];
  const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const edgeLines: THREE.LineSegments[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes.push(mesh);
    const ends = buildEdges(mesh.geometry, CREASE);
    const geo = keep(
      ends
        ? new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(ends, 3))
        : new THREE.EdgesGeometry(mesh.geometry, CREASE),
    );
    const lines = new THREE.LineSegments(geo, edgeMat);
    lines.visible = false;
    // A child of the part, so a spinning wheel's edges spin with it.
    mesh.add(lines);
    edgeLines.push(lines);
  });

  // --- Measurements, in the robot group's own axes ---------------------------------
  robotRoot.updateMatrixWorld(true);
  const toLocal = robotRoot.matrixWorld.clone().invert();
  const box = new THREE.Box3().setFromObject(model).applyMatrix4(toLocal);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const hubs = wheels.map((w) => w.getWorldPosition(new THREE.Vector3()).applyMatrix4(toLocal));
  const radius = wheels.length
    ? ((wheels[0].userData as { radius?: number }).radius ?? size.y * 0.09)
    : size.y * 0.09;
  const floor = box.min.y;

  // --- Drawing helpers -----------------------------------------------------------
  const dims = new THREE.Group();
  dims.visible = false;
  dims.renderOrder = 10;
  robotRoot.add(dims);

  const solid = keep(new THREE.LineBasicMaterial({ color: colours.dim, depthTest: false, transparent: true, opacity: 0.95 }));
  const faint = keep(new THREE.LineBasicMaterial({ color: colours.faint, depthTest: false, transparent: true, opacity: 0.32 }));
  const dashed = keep(
    new THREE.LineDashedMaterial({ color: colours.dim, dashSize: 0.008, gapSize: 0.006, depthTest: false, transparent: true, opacity: 0.7 }),
  );
  const chain = keep(
    new THREE.LineDashedMaterial({ color: colours.edge, dashSize: 0.022, gapSize: 0.006, depthTest: false, transparent: true, opacity: 0.8 }),
  );

  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const segs = (pts: THREE.Vector3[], mat: THREE.Material, parent: THREE.Object3D = dims) => {
    const g = keep(new THREE.BufferGeometry().setFromPoints(pts));
    const l = new THREE.LineSegments(g, mat);
    if (mat instanceof THREE.LineDashedMaterial) l.computeLineDistances();
    l.renderOrder = 10;
    parent.add(l);
    return l;
  };

  /** Text on a card that always faces the lens, `h` metres tall. */
  const label = (text: string, at: THREE.Vector3, h = TEXT_H, parent: THREE.Object3D = dims) => {
    const px = 64;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const font = `500 ${px}px ${fontFamily}`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + px * 0.6;
    c.width = w;
    c.height = Math.ceil(px * 1.5);
    ctx.font = font;
    ctx.fillStyle = colours.fill;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colours.dim;
    ctx.textBaseline = "middle";
    ctx.fillText(text, px * 0.3, c.height / 2);
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = keep(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const s = new THREE.Sprite(mat);
    s.scale.set((h * c.width) / c.height, h, 1);
    s.position.copy(at);
    s.renderOrder = 11;
    parent.add(s);
    return { sprite: s, canvas: c, ctx, texture: tex, font, px };
  };

  /** Two short strokes crossing the end of a dimension line, drawing style. */
  const tick = (at: THREE.Vector3, along: THREE.Vector3, across: THREE.Vector3, s = 0.007) => {
    const d = along.clone().add(across).normalize().multiplyScalar(s);
    return [at.clone().sub(d), at.clone().add(d)];
  };

  /** A dimension: extension lines from a and b out along `out`, the line
   *  between them at that offset, a tick at each end, the value mid-way. */
  const dimension = (a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3, offset: number, text: string) => {
    const o = out.clone().normalize();
    const a2 = a.clone().addScaledVector(o, offset);
    const b2 = b.clone().addScaledVector(o, offset);
    const along = b2.clone().sub(a2).normalize();
    const pts: THREE.Vector3[] = [
      a.clone().addScaledVector(o, 0.008), a2.clone().addScaledVector(o, 0.012),
      b.clone().addScaledVector(o, 0.008), b2.clone().addScaledVector(o, 0.012),
      a2, b2,
      ...tick(a2, along, o),
      ...tick(b2, along, o),
    ];
    segs(pts, solid);
    label(text, a2.clone().add(b2).multiplyScalar(0.5).addScaledVector(o, 0.012));
  };

  const mm = (m: number) => `${Math.round(m * MM)}`;
  const { min, max } = box;

  // 1-3. The three overall sizes.
  dimension(v(min.x, floor, max.z), v(max.x, floor, max.z), v(0, 0, 1), 0.075, `L ${mm(size.x)}`);
  dimension(v(max.x, floor, min.z), v(max.x, floor, max.z), v(1, 0, 0), 0.075, `W ${mm(size.z)}`);
  dimension(v(min.x, floor, max.z), v(min.x, max.y, max.z), v(-1, 0, 0), 0.075, `H ${mm(size.y)}`);

  // 4-7. From the wheels: wheelbase, track, axle height, wheel diameter.
  const near = hubs.filter((h) => h.z > centre.z).sort((p, q) => p.x - q.x);
  const side = hubs.filter((h) => h.x > centre.x).sort((p, q) => p.z - q.z);
  if (near.length >= 2) {
    const [r1, r0] = [near[0], near[near.length - 1]];
    dimension(v(r1.x, r1.y, r1.z), v(r0.x, r0.y, r0.z), v(0, -1, 0), r1.y - floor + 0.03, `WB ${mm(r0.x - r1.x)}`);
    // Axle height, floor to hub, beside the rear wheel.
    dimension(v(r1.x - radius - 0.02, floor, r1.z), v(r1.x - radius - 0.02, r1.y, r1.z), v(-1, 0, 0), 0.03, `A ${mm(r1.y - floor)}`);
    // The front wheel: a circle round it, a diameter across it, a leader out.
    const circle: THREE.Vector3[] = [];
    const n = 64;
    const cr = radius + 0.006;
    for (let i = 0; i < n; i += 1) {
      const t0 = (i / n) * Math.PI * 2;
      const t1 = ((i + 1) / n) * Math.PI * 2;
      circle.push(v(r0.x + Math.cos(t0) * cr, r0.y + Math.sin(t0) * cr, r0.z + 0.012));
      circle.push(v(r0.x + Math.cos(t1) * cr, r0.y + Math.sin(t1) * cr, r0.z + 0.012));
    }
    segs(circle, solid);
    const d = Math.SQRT1_2 * radius;
    segs([v(r0.x - d, r0.y - d, r0.z + 0.012), v(r0.x + d, r0.y + d, r0.z + 0.012)], solid);
    const elbow = v(r0.x + radius + 0.035, r0.y + radius + 0.04, r0.z + 0.012);
    segs([v(r0.x + d, r0.y + d, r0.z + 0.012), elbow, elbow, elbow.clone().add(v(0.03, 0, 0))], solid);
    label(`Ø ${(radius * 2 * MM).toFixed(1)}`, elbow.clone().add(v(0.058, 0, 0)));
  }
  if (side.length >= 2) {
    const [a, b] = [side[0], side[side.length - 1]];
    dimension(v(max.x, floor, a.z), v(max.x, floor, b.z), v(1, 0, 0), 0.15, `T ${mm(b.z - a.z)}`);
  }

  // 8. Centre lines, long dash and short dash, as a drawing marks a datum.
  segs(
    [
      v(centre.x, floor - 0.03, centre.z), v(centre.x, max.y + 0.05, centre.z),
      v(min.x - 0.04, radius + floor, max.z + 0.001), v(max.x + 0.04, radius + floor, max.z + 0.001),
      v(centre.x, floor, min.z - 0.04), v(centre.x, floor, max.z + 0.04),
      v(min.x - 0.04, floor, centre.z), v(max.x + 0.04, floor, centre.z),
    ],
    chain,
  );
  label("CL", v(centre.x + 0.016, max.y + 0.02, centre.z), TEXT_H * 0.9);

  // 9. The envelope: the box it fits in, dashed.
  const c = [
    v(min.x, min.y, min.z), v(max.x, min.y, min.z), v(max.x, min.y, max.z), v(min.x, min.y, max.z),
    v(min.x, max.y, min.z), v(max.x, max.y, min.z), v(max.x, max.y, max.z), v(min.x, max.y, max.z),
  ];
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  segs(E.flatMap(([i, j]) => [c[i], c[j]]), dashed);

  // 10. A 25 mm grid on the floor under it.
  const grid: THREE.Vector3[] = [];
  const g = 0.025;
  const gx0 = Math.floor((min.x - 0.1) / g) * g;
  const gx1 = Math.ceil((max.x + 0.1) / g) * g;
  const gz0 = Math.floor((min.z - 0.1) / g) * g;
  const gz1 = Math.ceil((max.z + 0.1) / g) * g;
  for (let x = gx0; x <= gx1 + 1e-6; x += g) grid.push(v(x, floor, gz0), v(x, floor, gz1));
  for (let z = gz0; z <= gz1 + 1e-6; z += g) grid.push(v(gx0, floor, z), v(gx1, floor, z));
  segs(grid, faint);

  // 11. The heading dial. It sits in the robot group but is turned back by
  // the robot's own yaw in begin(), so it holds still under the robot.
  const dial = new THREE.Group();
  dims.add(dial);
  dial.position.set(centre.x, floor + 0.001, centre.z);
  const R = Math.hypot(size.x, size.z) / 2 + 0.055;
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i < 96; i += 1) {
    const t0 = (i / 96) * Math.PI * 2;
    const t1 = ((i + 1) / 96) * Math.PI * 2;
    ring.push(v(Math.cos(t0) * R, 0, Math.sin(t0) * R), v(Math.cos(t1) * R, 0, Math.sin(t1) * R));
  }
  for (let deg = 0; deg < 360; deg += 15) {
    const t = (deg * Math.PI) / 180;
    const len = deg % 90 === 0 ? 0.03 : deg % 45 === 0 ? 0.02 : 0.011;
    ring.push(v(Math.cos(t) * R, 0, Math.sin(t) * R), v(Math.cos(t) * (R + len), 0, Math.sin(t) * (R + len)));
  }
  segs(ring, solid, dial);
  for (const deg of [0, 90, 180, 270]) {
    const t = (deg * Math.PI) / 180;
    label(`${deg}°`, v(Math.cos(t) * (R + 0.05), 0, -Math.sin(t) * (R + 0.05)), TEXT_H * 0.8, dial);
  }
  // The arc from 0 to the robot's heading, and its value. Rebuilt when the
  // heading moves by a degree or more.
  const arcGeo = keep(new THREE.BufferGeometry());
  const arc = new THREE.Line(arcGeo, solid);
  arc.renderOrder = 10;
  dial.add(arc);
  const pointer = segs([v(0, 0, 0), v(R - 0.012, 0, 0)], solid, dims);
  pointer.position.set(centre.x, floor + 0.001, centre.z);
  const heading = label("θ 0°", v(0, 0, 0), TEXT_H, dial);
  let shownDeg = Number.NaN;
  const setHeading = (yawRad: number) => {
    const deg = ((((yawRad * 180) / Math.PI) % 360) + 360) % 360;
    const rounded = Math.round(deg);
    if (rounded === shownDeg) return;
    shownDeg = rounded;
    const pts: THREE.Vector3[] = [];
    const steps = Math.max(2, Math.ceil(rounded / 4));
    const ra = R * 0.72;
    for (let i = 0; i <= steps; i += 1) {
      const t = ((rounded * Math.PI) / 180) * (i / steps);
      pts.push(v(Math.cos(t) * ra, 0, -Math.sin(t) * ra));
    }
    arcGeo.setFromPoints(pts);
    if (heading) {
      const mid = ((rounded / 2) * Math.PI) / 180;
      heading.sprite.position.set(Math.cos(mid) * (ra - 0.045), 0.01, -Math.sin(mid) * (ra - 0.045));
      const { ctx, canvas, font, px, texture } = heading;
      ctx.font = font;
      ctx.fillStyle = colours.fill;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colours.dim;
      ctx.textBaseline = "middle";
      ctx.fillText(`θ ${rounded}°`, px * 0.3, canvas.height / 2);
      texture.needsUpdate = true;
    }
  };

  // 12. Callouts to the two assemblies, with leaders.
  const callout = (from: THREE.Vector3, to: THREE.Vector3, text: string) => {
    segs([from, to, to, to.clone().add(v(to.x < from.x ? -0.03 : 0.03, 0, 0))], solid);
    const dot: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i += 1) {
      const t0 = (i / 12) * Math.PI * 2;
      const t1 = ((i + 1) / 12) * Math.PI * 2;
      dot.push(from.clone().add(v(Math.cos(t0) * 0.004, Math.sin(t0) * 0.004, 0)), from.clone().add(v(Math.cos(t1) * 0.004, Math.sin(t1) * 0.004, 0)));
    }
    segs(dot, solid);
    label(text, to.clone().add(v(to.x < from.x ? -0.075 : 0.075, 0, 0)));
  };
  callout(v(min.x + size.x * 0.3, max.y - size.y * 0.18, max.z), v(min.x - 0.03, max.y - size.y * 0.3, max.z), "LIFT");
  callout(v(max.x - size.x * 0.25, floor + size.y * 0.22, max.z), v(max.x + 0.03, floor + size.y * 0.42, max.z), "DRIVETRAIN");

  // 13. The title block, on the floor at the near corner.
  label("82855Z · UNITS MM · 5.67 kg", v(max.x - 0.02, floor, max.z + 0.16), TEXT_H * 0.95);

  // --- Passes --------------------------------------------------------------------
  const begin = () => {
    for (const m of meshes) {
      saved.set(m, m.material);
      m.material = fill;
    }
    for (const l of edgeLines) l.visible = true;
    dims.visible = true;
    // The dial and its pointer: the dial is held still against the robot's
    // yaw; the pointer, a child of the robot, points where it heads.
    const yaw = robotRoot.rotation.y;
    dial.rotation.y = -yaw;
    setHeading(yaw);
  };
  const end = () => {
    for (const m of meshes) {
      const old = saved.get(m);
      if (old) m.material = old;
    }
    saved.clear();
    for (const l of edgeLines) l.visible = false;
    dims.visible = false;
  };
  const dispose = () => {
    end();
    for (const l of edgeLines) l.removeFromParent();
    dims.removeFromParent();
    for (const d of disposables) d.dispose();
  };
  return { begin, end, dispose };
}
