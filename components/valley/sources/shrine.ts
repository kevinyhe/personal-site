import * as THREE from "three";

import type { CanvasSource } from "../barShader";

// A shrine on the hillside, in three dimensions, rendered off screen and fed
// to the bar shader like everything else in this landscape.
//
// WHY 3D AND NOT A SILHOUETTE. The three shapes this replaces were flat
// drawings, and flat is what they looked like: a torii painted head-on has no
// depth to its two uprights, and a pagoda's eaves — which are the whole
// building — only read as eaves when you can see along them. Built as
// geometry and lit from one side, the near upright is brighter than the far
// one, every roof shows its underside, and the grade turns that difference
// into a difference in bar width. The shader is a tone engine; giving it
// tone to work with is the difference between a diagram and a place.
//
// WHERE IT GOES. The reference stands a fir at x 70%, 43.5% wide and 52%
// tall, which is the one large thing on the right of its landscape. This is
// that: a shrine precinct at the same box — torii at the front, the hall
// behind it with its crossed finials, a pagoda further back, two stone
// lanterns on the path.
//
// ---------------------------------------------------------------------------
// The greys
// ---------------------------------------------------------------------------
// The layer is graded blackPoint 55 / whitePoint 175, which is the slot's
// own: a DARK grey draws a WIDE bar and reads BRIGHT on the page. So the
// materials here are dark where the building is meant to carry — roofs,
// pillars, the torii — and the ground is left black, which the shader
// discards, so the landscape behind shows through the precinct instead of the
// precinct sitting on a slab.

type ShrineOptions = { seed: number; width: number; height: number };

/** Sun elevation and bearing, in the scene's own units. */
const KEY_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
/** Flat fill, so nothing facing away goes to black and drops out. */
const AMBIENT = 1.55;
const KEY = 1.35;

/**
 * The palette, as sRGB albedos, and they are LIGHTER than the greys the
 * drawing is meant to come out at. The renderer multiplies them by the light
 * before the shader ever sees them, and at the values this started with —
 * roofs at 0x2e — every surface came out under the black point, which is the
 * widest bar there is, so the whole precinct drew as one solid mass. Taken
 * too far the other way it went dark and disappeared. These land the
 * rendered greys between about 65 and 130, which is inside the 55/175 grade
 * with the roofs near the wide end and the walls near the middle.
 */
const ROOF = 0x606060;
const ROOF_UNDER = 0x7c7c7c;
const RIDGE = 0x505050;
const PILLAR = 0x6a6a6a;
const WALL = 0x9a9a9a;
const PLATFORM = 0x868686;
const STONE = 0x929292;
const TORII = 0x4c4c4c;

function box(w: number, h: number, d: number, colour: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9, metalness: 0 }),
  );
}

function cyl(r: number, h: number, colour: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.08, h, 10),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9, metalness: 0 }),
  );
}

/**
 * Tokyō — the bracket blocks that carry an eave. A row of little stepped
 * cubes under the overhang on all four sides, which at this distance is not
 * read as joinery but as the dotted line of shadow every Japanese roof has
 * under it, and which is most of what separates one of these buildings from
 * a box with a lid.
 */
function brackets(span: number, depth: number, colour: number): THREE.Group {
  const g = new THREE.Group();
  const step = span / 7;
  for (const [w, d, axis] of [
    [span, depth, "x"],
    [depth, span, "z"],
  ] as const) {
    const n = Math.max(3, Math.round(w / step));
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n - 0.5;
      for (const side of [-1, 1]) {
        const b = box(step * 0.42, step * 0.34, step * 0.5, colour);
        if (axis === "x") b.position.set(t * w, 0, (side * d) / 2);
        else b.position.set((side * d) / 2, 0, t * w);
        g.add(b);
      }
    }
  }
  return g;
}

/** Kōran — the railing round a storey: a top rail on short posts. */
function railing(span: number, depth: number, scale: number): THREE.Group {
  const g = new THREE.Group();
  for (const [w, d, axis] of [
    [span, depth, "x"],
    [depth, span, "z"],
  ] as const) {
    for (const side of [-1, 1]) {
      const rail = box(
        axis === "x" ? w : 0.09 * scale,
        0.09 * scale,
        axis === "x" ? 0.09 * scale : w,
        RIDGE,
      );
      rail.position.set(
        axis === "x" ? 0 : (side * d) / 2,
        0.34 * scale,
        axis === "x" ? (side * d) / 2 : 0,
      );
      g.add(rail);
      const n = Math.max(3, Math.round(w / (0.7 * scale)));
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n - 0.5;
        const post = box(0.06 * scale, 0.34 * scale, 0.06 * scale, PILLAR);
        post.position.set(
          axis === "x" ? t * w : (side * d) / 2,
          0.17 * scale,
          axis === "x" ? (side * d) / 2 : t * w,
        );
        g.add(post);
      }
    }
  }
  return g;
}

/** One roof: two slabs leaning against each other over a ridge beam. */
function roof(span: number, depth: number, rise: number, thick: number): THREE.Group {
  const g = new THREE.Group();
  const slope = Math.hypot(span / 2, rise);
  for (const side of [-1, 1]) {
    const slab = box(slope, thick, depth, ROOF);
    slab.position.set((side * span) / 4, rise / 2, 0);
    slab.rotation.z = side * -Math.atan2(rise, span / 2);
    g.add(slab);
    // The underside of the eave, a shade lighter, which is what says the roof
    // has thickness when it is seen from below.
    const under = box(slope * 0.98, thick * 0.35, depth * 0.98, ROOF_UNDER);
    under.position.copy(slab.position);
    under.position.y -= thick * 0.6;
    under.rotation.z = slab.rotation.z;
    g.add(under);
  }
  const beam = box(span * 0.08, thick * 1.5, depth * 1.04, RIDGE);
  beam.position.y = rise;
  g.add(beam);
  return g;
}

function torii(scale: number): THREE.Group {
  const g = new THREE.Group();
  const h = 6 * scale;
  const span = 5.2 * scale;
  const r = 0.28 * scale;
  for (const side of [-1, 1]) {
    const leg = cyl(r, h, TORII);
    leg.position.set((side * span) / 2, h / 2, 0);
    leg.rotation.z = side * 0.022;
    g.add(leg);
    const foot = cyl(r * 1.9, 0.3 * scale, STONE);
    foot.position.set((side * span) / 2, 0.15 * scale, 0);
    g.add(foot);
  }
  // The tie beam, and over it the top rail: longer, thicker, tipped up at
  // both ends by a pair of shallow rotations.
  const nuki = box(span * 1.1, 0.34 * scale, r * 1.7, TORII);
  nuki.position.y = h * 0.78;
  g.add(nuki);
  const railY = h * 0.99;
  for (const side of [-1, 1]) {
    const half = box(span * 0.72, 0.42 * scale, r * 2.4, TORII);
    half.position.set((side * span) / 3.1, railY, 0);
    half.rotation.z = side * -0.055;
    g.add(half);
  }
  const post = box(0.3 * scale, h * 0.17, r * 1.4, TORII);
  post.position.y = h * 0.885;
  g.add(post);
  return g;
}

function lantern(scale: number): THREE.Group {
  const g = new THREE.Group();
  const base = cyl(0.62 * scale, 0.34 * scale, STONE);
  base.position.y = 0.17 * scale;
  g.add(base);
  const shaft = cyl(0.26 * scale, 1.5 * scale, STONE);
  shaft.position.y = 1.05 * scale;
  g.add(shaft);
  const mid = box(1.0 * scale, 0.26 * scale, 1.0 * scale, STONE);
  mid.position.y = 1.9 * scale;
  g.add(mid);
  // The firebox: dark, because the light in it is what a lantern is.
  const fire = box(1.1 * scale, 0.9 * scale, 1.1 * scale, 0x3e3e3e);
  fire.position.y = 2.45 * scale;
  g.add(fire);
  const cap = roof(2.0 * scale, 2.0 * scale, 0.42 * scale, 0.2 * scale);
  cap.position.y = 2.95 * scale;
  g.add(cap);
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.2 * scale, 8, 6),
    new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.9 }),
  );
  knob.position.y = 3.5 * scale;
  g.add(knob);
  return g;
}

function pagoda(scale: number): THREE.Group {
  const g = new THREE.Group();
  const storeys = 5;
  let y = 0;
  for (let i = 0; i < storeys; i += 1) {
    const t = i / (storeys - 1);
    const span = (5.4 - 1.8 * t) * scale;
    const storeyH = (1.5 - 0.22 * t) * scale;
    const wall = box(span * 0.52, storeyH, span * 0.52, WALL);
    wall.position.y = y + storeyH / 2;
    g.add(wall);
    // The ground storey has a door; the ones above have shuttered panels,
    // which at this size is one darker band across the front.
    const panel = box(
      span * (i === 0 ? 0.2 : 0.34),
      storeyH * (i === 0 ? 0.74 : 0.44),
      span * 0.02,
      i === 0 ? RIDGE : PILLAR,
    );
    panel.position.set(0, y + storeyH * (i === 0 ? 0.37 : 0.5), span * 0.27);
    g.add(panel);
    const br = brackets(span * 0.72, span * 0.72, RIDGE);
    br.position.y = y + storeyH - 0.16 * scale;
    g.add(br);
    const r = roof(span, span, 0.5 * scale, 0.2 * scale);
    r.position.y = y + storeyH;
    g.add(r);
    // Every storey above the first stands on a balcony.
    if (i > 0) {
      const rail = railing(span * 0.82, span * 0.82, scale);
      rail.position.y = y + 0.02 * scale;
      g.add(rail);
    }
    y += storeyH + 0.34 * scale;
  }
  const mast = cyl(0.09 * scale, 2.2 * scale, RIDGE);
  mast.position.y = y + 1.1 * scale;
  g.add(mast);
  for (let i = 0; i < 5; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry((0.34 - i * 0.045) * scale, 0.035 * scale, 4, 12),
      new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.9 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + (0.45 + i * 0.3) * scale;
    g.add(ring);
  }
  return g;
}

/** The main hall: a platform, pillars, walls, a deep roof, and on the ridge
 *  the crossed finials (chigi) and the billets (katsuogi) that say shrine
 *  rather than temple. */
function hall(scale: number): THREE.Group {
  const g = new THREE.Group();
  const w = 9 * scale;
  const d = 6.4 * scale;
  const platY = 1.5 * scale;

  const plat = box(w * 1.16, 0.5 * scale, d * 1.2, PLATFORM);
  plat.position.y = platY;
  g.add(plat);
  for (let i = 0; i < 4; i += 1) {
    const post = cyl(0.3 * scale, platY, PILLAR);
    post.position.set(
      (-0.42 + (i % 2) * 0.84) * w,
      platY / 2,
      (i < 2 ? -0.42 : 0.42) * d,
    );
    g.add(post);
  }
  const body = box(w * 0.92, 2.6 * scale, d * 0.9, WALL);
  body.position.y = platY + 1.55 * scale;
  g.add(body);
  for (const side of [-1, 1]) {
    for (const zz of [-1, 1]) {
      const p = cyl(0.34 * scale, 2.9 * scale, PILLAR);
      p.position.set(side * w * 0.44, platY + 1.7 * scale, zz * d * 0.44);
      g.add(p);
    }
  }
  const top = platY + 2.9 * scale;
  const doors = box(w * 0.3, 2.1 * scale, d * 0.02, RIDGE);
  doors.position.set(0, platY + 1.3 * scale, d * 0.46);
  g.add(doors);
  const br = brackets(w * 1.05, d * 1.0, RIDGE);
  br.position.y = top - 0.24 * scale;
  g.add(br);
  const rail = railing(w * 1.1, d * 1.14, scale * 1.4);
  rail.position.y = platY + 0.26 * scale;
  g.add(rail);
  const r = roof(w * 1.5, d * 1.45, 2.3 * scale, 0.42 * scale);
  r.position.y = top;
  g.add(r);
  // Katsuogi: short billets lying across the ridge.
  for (let i = -2; i <= 2; i += 1) {
    const billet = cyl(0.2 * scale, d * 0.9, RIDGE);
    billet.rotation.x = Math.PI / 2;
    billet.position.set(i * 1.5 * scale, top + 2.4 * scale, 0);
    g.add(billet);
  }
  // Chigi: two pairs of crossed finials standing up off the gable ends.
  for (const zz of [-1, 1]) {
    for (const side of [-1, 1]) {
      const fin = box(0.26 * scale, 3.4 * scale, 0.26 * scale, RIDGE);
      fin.position.set(side * 0.55 * scale, top + 3.4 * scale, zz * d * 0.7);
      fin.rotation.z = side * 0.24;
      g.add(fin);
    }
  }
  // Steps down the front.
  for (let i = 0; i < 4; i += 1) {
    const step = box(w * 0.34, 0.24 * scale, 0.5 * scale, PLATFORM);
    step.position.set(0, (0.24 * (i + 1) - 0.12) * scale, d * 0.66 + i * 0.5 * scale);
    g.add(step);
  }
  return g;
}

/**
 * The Kondō — a Golden Hall, and the one building in the set that is NOT a
 * shrine hall: two storeys with a skirt roof (mokoshi) round the lower one
 * and a hipped-gable roof (irimoya) over the upper. Two roofs stacked with a
 * band of wall showing between them is the whole read; one roof and it is a
 * hall like any other.
 */
function kondo(scale: number): THREE.Group {
  const g = new THREE.Group();
  const w = 10 * scale;
  const d = 7.6 * scale;
  const platY = 1.2 * scale;

  const plat = box(w * 1.2, 0.5 * scale, d * 1.25, PLATFORM);
  plat.position.y = platY;
  g.add(plat);

  // Lower storey and its skirt roof.
  const lower = box(w * 0.86, 2.6 * scale, d * 0.84, WALL);
  lower.position.y = platY + 1.55 * scale;
  g.add(lower);
  const skirt = roof(w * 1.42, d * 1.34, 0.85 * scale, 0.34 * scale);
  skirt.position.y = platY + 2.7 * scale;
  g.add(skirt);

  // Upper storey, set back, and the big roof over it.
  const upper = box(w * 0.66, 2.3 * scale, d * 0.64, WALL);
  upper.position.y = platY + 4.5 * scale;
  g.add(upper);
  for (const side of [-1, 1]) {
    for (const zz of [-1, 1]) {
      const p = cyl(0.3 * scale, 2.4 * scale, PILLAR);
      p.position.set(side * w * 0.3, platY + 4.5 * scale, zz * d * 0.3);
      g.add(p);
    }
  }
  const top = roof(w * 1.16, d * 1.1, 2.0 * scale, 0.4 * scale);
  top.position.y = platY + 5.65 * scale;
  g.add(top);
  return g;
}

/** A length of roofed corridor (kairō): a low wall with a pent roof on it. */
function corridor(length: number, scale: number): THREE.Group {
  const g = new THREE.Group();
  const wall = box(length, 2.2 * scale, 1.5 * scale, WALL);
  wall.position.y = 1.1 * scale;
  g.add(wall);
  const r = roof(2.9 * scale, length, 0.55 * scale, 0.22 * scale);
  r.rotation.y = Math.PI / 2;
  r.position.y = 2.3 * scale;
  g.add(r);
  for (let x = -length / 2 + scale; x < length / 2; x += 2.6 * scale) {
    const post = cyl(0.17 * scale, 2.2 * scale, PILLAR);
    post.position.set(x, 1.1 * scale, 0.7 * scale);
    g.add(post);
  }
  return g;
}

/**
 * Shitennōji, Osaka — the oldest officially administered temple in Japan, and
 * a layout so particular it has its own name (Shitennōji-shiki garan): a
 * five-storey pagoda and the Golden Hall standing ONE BEHIND THE OTHER on a
 * single north-south axis, with a roofed corridor drawn round both of them
 * and a gate in its south side. Every other plan of the period puts the
 * pagoda and the hall side by side; this one puts them in a line, so from
 * the front the pagoda stands in front of the hall and half hides it. That
 * is what is drawn here.
 */
export function createShitennoji(options: ShrineOptions): CanvasSource {
  return render(options, (scene) => {
    const g = new THREE.Group();
    // The corridor: across the front, and returning up both sides.
    const front = corridor(30, 0.85);
    front.position.set(0, 0, 13);
    g.add(front);
    for (const side of [-1, 1]) {
      const run = corridor(26, 0.85);
      run.rotation.y = Math.PI / 2;
      run.position.set(side * 15, 0, 0);
      g.add(run);
    }
    // The gate in the middle of the front run, taller than the corridor.
    const gate = new THREE.Group();
    const gateRoof = roof(7.5, 5.5, 1.3, 0.34);
    gateRoof.position.y = 4.6;
    gate.add(gateRoof);
    for (const side of [-1, 1]) {
      for (const zz of [-1, 1]) {
        const p = cyl(0.3, 4.6, PILLAR);
        p.position.set(side * 2.4, 2.3, zz * 1.7);
        gate.add(p);
      }
    }
    gate.position.set(0, 0, 13);
    g.add(gate);

    // The pagoda in front, the hall behind it, on one axis.
    const pg = pagoda(0.92);
    pg.position.set(-0.5, 0, 4);
    g.add(pg);
    const kd = kondo(0.92);
    kd.position.set(-0.5, 0, -7.5);
    g.add(kd);

    // Turned the other way from the shrine on the far side of the valley, so
    // the two do not read as the same building twice.
    g.rotation.y = 0.3;
    scene.add(g);
    return { position: new THREE.Vector3(-15, 13, 44), target: new THREE.Vector3(1, 6, -1) };
  });
}

/**
 * One five-storey pagoda, and nothing else.
 *
 * A precinct is a plan — you read it by seeing how the parts sit together,
 * which needs width, and width is the one thing this slot has none of. A
 * single tower is a SHAPE, and it is the shape that carries at any size: the
 * eaves stepping in as they climb, the mast over the top. Looked at slightly
 * from below, as a tall building is.
 */
/** A torii on its own, standing in the open. */
export function createToriiGate(options: ShrineOptions): CanvasSource {
  return render(options, (scene) => {
    const g = new THREE.Group();
    g.add(torii(1.6));
    // Turned a little, so the two uprights are at different distances and
    // the near one takes more light than the far — which is the only thing
    // that stops a torii reading as a flat drawing of one.
    g.rotation.y = 0.26;
    scene.add(g);
    return {
      position: new THREE.Vector3(3, 4.2, 24),
      target: new THREE.Vector3(0, 5.2, 0),
    };
  });
}

/** Two stone lanterns, as they stand either side of an approach. */
export function createLanternPair(options: ShrineOptions): CanvasSource {
  return render(options, (scene) => {
    const g = new THREE.Group();
    for (const [side, scale] of [
      [-1, 1],
      [1, 0.86],
    ] as const) {
      const l = lantern(scale);
      // The far one set back as well as across, so the pair reads as a path
      // going away rather than as two objects on a line.
      l.position.set(side * 3.4, 0, side < 0 ? 1.5 : -2.2);
      g.add(l);
    }
    g.rotation.y = 0.2;
    scene.add(g);
    return {
      position: new THREE.Vector3(1.5, 3.2, 17),
      target: new THREE.Vector3(0, 2.4, 0),
    };
  });
}

export function createPagodaTower(options: ShrineOptions): CanvasSource {
  return render(options, (scene) => {
    const g = new THREE.Group();
    const tower = pagoda(1.55);
    g.add(tower);
    // A low stone platform, so it stands on something.
    const base = box(11, 0.7, 11, PLATFORM);
    base.position.y = 0.35;
    g.add(base);
    for (let i = 0; i < 3; i += 1) {
      const step = box(6.4, 0.3, 1.1, PLATFORM);
      step.position.set(0, 0.15 + i * 0.3, 5.4 + i * 1.05);
      g.add(step);
    }
    // A quarter turn, so two faces of every roof are in view and the eaves
    // read as eaves rather than as horizontal rules.
    g.rotation.y = -0.42;
    scene.add(g);
    return {
      // Far enough back that the whole tower fits the frame with air over
      // it, and below its middle, because a pagoda is looked UP at. At 27
      // the top two roofs were off the top of the box.
      position: new THREE.Vector3(8, 6, 38),
      target: new THREE.Vector3(0, 7, 0),
    };
  });
}

/**
 * The hall on its own, with its two lanterns on the approach. The precinct
 * (createShrine) put the hall, a pagoda and a torii in one picture, which
 * made them one layer of the landscape; the page wants them at different
 * depths, so each is its own render now.
 */
export function createHall(options: ShrineOptions): CanvasSource {
  return render(options, (scene) => {
    const group = new THREE.Group();
    const hl = hall(1);
    hl.position.set(0, 0, 0);
    group.add(hl);
    for (const side of [-1, 1]) {
      const l = lantern(0.85);
      l.position.set(side * 5.2, 0, 6.5);
      group.add(l);
    }
    group.rotation.y = -0.34;
    scene.add(group);
    return { position: new THREE.Vector3(11, 8, 30), target: new THREE.Vector3(0, 3.6, 0) };
  });
}

export function createShrine(options: ShrineOptions): CanvasSource {
  return render(options, (scene) => {
    const group = new THREE.Group();
    const t = torii(1.15);
    t.position.set(0.6, 0, 11);
    group.add(t);
    for (const side of [-1, 1]) {
      const l = lantern(0.85);
      l.position.set(side * 4.4, 0, 6.5);
      group.add(l);
    }
    const hl = hall(1);
    hl.position.set(0.2, 0, -2);
    group.add(hl);
    const pg = pagoda(0.78);
    pg.position.set(-9.5, 0, -10.5);
    group.add(pg);
    // A three-quarter view: enough turn to see along the eaves, not so much
    // that the torii stops reading head-on.
    group.rotation.y = -0.34;
    scene.add(group);
    return { position: new THREE.Vector3(12.5, 11, 41), target: new THREE.Vector3(-1.5, 5, -2) };
  });
}

/**
 * The scaffolding every precinct here shares: an off-screen renderer, two
 * lights, and a canvas the shader reads.
 *
 * It is not a still. The key light swings a few degrees and rises and falls
 * a little on a slow loop, and the scene turns by about a degree with it —
 * so every lit face of every roof drifts across the grade's midpoint and the
 * bars under it widen and narrow. Nothing moves in the picture; what moves
 * is the light on it, which is the only kind of animation a building should
 * have. Redrawn at ANIM_FPS, and update() returns false the rest of the
 * time so the engine skips the upload.
 */
const ANIM_FPS = 10;
/** How far the key swings, in radians, and how long one loop takes. */
const SWING = 0.26;
const SWING_PERIOD = 23;
/** And how far the scene itself turns with it. */
const TURN = 0.022;
const TURN_PERIOD = 31;

function render(
  options: ShrineOptions,
  build: (scene: THREE.Scene) => { position: THREE.Vector3; target: THREE.Vector3 },
): CanvasSource {
  const canvas = document.createElement("canvas");
  const w = Math.max(2, Math.round(options.width));
  const h = Math.max(2, Math.round(options.height));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Black until the render lands: the shader discards black, so an
  // unfinished scene draws nothing rather than a grey block.
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
  }

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: document.createElement("canvas"),
      // The uprights, the railings and the bracket blocks are a pixel or two
      // wide at this size.
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
  } catch (error) {
    console.warn("shrine: WebGL unavailable", error);
    return {
      canvas,
      animated: false,
      ready: Promise.resolve(),
      dispose: () => {
        canvas.width = 1;
        canvas.height = 1;
      },
    };
  }
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // No tone curve: the greys above are worked out as albedo times irradiance
  // straight to sRGB, and a filmic curve would move every one of them.
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT));
  const key = new THREE.DirectionalLight(0xffffff, KEY);
  const keyDir = KEY_DIR.clone();
  key.position.copy(keyDir).multiplyScalar(50);
  scene.add(key);

  const shot = build(scene);
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.5, 400);
  camera.position.copy(shot.position);
  camera.lookAt(shot.target);
  // The group the build put in: turned with the light so the two drifts are
  // not in step with each other.
  const subject = scene.children.find((c) => c instanceof THREE.Group) as
    | THREE.Group
    | undefined;
  const baseYaw = subject ? subject.rotation.y : 0;

  const swung = new THREE.Vector3();
  const draw = (timeSec: number) => {
    if (!renderer) return;
    const a = Math.sin((timeSec / SWING_PERIOD) * Math.PI * 2) * SWING;
    swung
      .copy(keyDir)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), a)
      .setY(keyDir.y + Math.sin((timeSec / SWING_PERIOD) * Math.PI * 2 + 1.1) * 0.1)
      .normalize();
    key.position.copy(swung).multiplyScalar(50);
    if (subject) {
      subject.rotation.y =
        baseYaw + Math.sin((timeSec / TURN_PERIOD) * Math.PI * 2) * TURN;
    }
    renderer.render(scene, camera);
    if (ctx) ctx.drawImage(renderer.domElement, 0, 0, w, h);
  };
  draw(0);

  let last = -Infinity;
  return {
    canvas,
    animated: true,
    ready: Promise.resolve(),
    update: (timeSec: number) => {
      if (timeSec - last < 1 / ANIM_FPS) return false;
      last = timeSec;
      draw(timeSec);
      return true;
    },
    dispose: () => {
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) m.dispose();
      });
      renderer?.dispose();
      renderer = null;
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
