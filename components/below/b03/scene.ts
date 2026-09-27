import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BAND, BLOSSOM } from "@/components/bandColours";
import { skillGroups } from "@/components/profile";
import { buildGroundGeometry, groundHeight } from "./ground";
import { buildPieces, type Piece } from "./objects";
import { BLOCK, buildLayout, placeOnRoad, Road } from "./path";
import { GROUND_FRAG, GROUND_VERT, PETAL_FRAG, PETAL_VERT, SKY_FRAG, SKY_VERT } from "./shaders";
import { buildGlowTexture, buildMarkSheet } from "./textures";

/**
 * The night plain and everything on it. This file knows nothing about the
 * page: it is handed a canvas and, each frame, how far the page has
 * scrolled; it can say where on the screen a block or a row of cubes is,
 * which is what the annotations need to point at them.
 */

export type Point = { x: number; y: number };

export type Plain = {
  resize(width: number, height: number): void;
  /** u: scroll in screens from the journey's top. t, dt: seconds. */
  frame(u: number, t: number, dt: number): void;
  /** Where on the stage a block's marked point is. false: behind the camera. */
  blockPoint(block: number, which: 0 | 1, out: Point): boolean;
  /** Where the first and last cube of a row of skills are. */
  rowEnds(row: number, first: Point, last: Point): boolean;
  /** Half the width of a skill cube on screen, at that row. */
  cubeReach(row: number): number;
  pointer(x: number, y: number): void;
  redrawMarks(monoFamily: string): void;
  dispose(): void;
};

const MAX_BUFFER_WIDTH = 2560;
const FOV = 40;
const CUBE = 0.82;
const CUBE_GAP = 1.2;
const ROW_GAP = 1.9;
const ROW_LEFT = -7.3;
const PETALS = 1400;
const LAMP = 3.2;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number): number => {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
};
/** A number that looks random but is the same on every visit. */
const fixedRandom = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function buildPlain(canvas: HTMLCanvasElement, monoFamily: string): Plain {
  // Throws if WebGL cannot start. The caller falls back to the plain page.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(new THREE.Color(BAND), 1);
  // Neutral leaves colours under about 0.8 as they are and only rolls off
  // the highlights, so the glass and the objects keep the palette.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, 0.1, 900);
  const layout = buildLayout(groundHeight);
  const eyeRoad = new Road(layout.eyes);
  const lookRoad = new Road(layout.looks);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };

  // ---------------------------------------------------------------- sky
  const skyUniforms = {
    uZenith: { value: new THREE.Color(BAND) },
    uHorizon: { value: new THREE.Color("#3d1533") },
    uGlow: { value: new THREE.Color(BLOSSOM).multiplyScalar(0.42) },
    uGlowDir: { value: layout.glowDir.clone() },
  };
  const skyMat = keep(
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  const skyGeo = keep(new THREE.SphereGeometry(600, 48, 24));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // ------------------------------------------- what the glass reflects
  // Glass with nothing to reflect is a dark hole. This is a small room
  // drawn once: the same sky, and three bright panels for the highlights.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  const roomSky = new THREE.Mesh(skyGeo, skyMat);
  room.add(roomSky);
  const panelGeo = keep(new THREE.PlaneGeometry(1, 1));
  const panel = (r: number, g: number, b: number, w: number, h: number, at: THREE.Vector3): void => {
    const mat = keep(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
    mat.color.setRGB(r, g, b);
    const m = new THREE.Mesh(panelGeo, mat);
    m.scale.set(w, h, 1);
    m.position.copy(at);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  panel(2.4, 2.0, 2.2, 26, 12, new THREE.Vector3(-16, 24, 14));
  panel(1.7, 0.9, 1.3, 70, 7, layout.glowDir.clone().multiplyScalar(40).setY(4));
  panel(0.8, 0.7, 1.4, 40, 8, layout.glowDir.clone().multiplyScalar(-40).setY(10));
  // The far limit is past the sky sphere, or the sky is cut out of the room.
  const envTarget = pmrem.fromScene(room, 0.03, 0.1, 1000);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1;
  pmrem.dispose();

  // ------------------------------------------------------------ ground
  const middle = layout.blocks[2];
  const groundUniforms = {
    ...skyUniforms,
    uLow: { value: new THREE.Color("#4b1d3f") },
    uHigh: { value: new THREE.Color("#8a4777") },
    uLine: { value: new THREE.Color(BLOSSOM) },
    uPool: { value: new THREE.Color(BLOSSOM).multiplyScalar(0.5) },
    uMoonDir: { value: new THREE.Vector3(-0.5, 0.75, 0.45).normalize() },
    uBlocks: { value: layout.blocks.map((b) => new THREE.Vector4(b.x, b.z, 1, 0)) },
    uField: { value: new THREE.Vector4(layout.field.x, layout.field.z, 0, 0) },
  };
  const ground = new THREE.Mesh(
    keep(buildGroundGeometry(middle)),
    keep(new THREE.ShaderMaterial({ uniforms: groundUniforms, vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG })),
  );
  scene.add(ground);

  // ------------------------------------------------------------ lights
  const moon = new THREE.DirectionalLight("#ffe9f4", 1.4);
  moon.position.copy(groundUniforms.uMoonDir.value).multiplyScalar(50);
  scene.add(moon);
  scene.add(new THREE.HemisphereLight("#d9b3cf", BAND, 1));

  // ------------------------------------------------------------ blocks
  const glass = keep(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0.07,
      metalness: 0,
      transmission: 1,
      ior: 1.32,
      thickness: 2,
      attenuationColor: new THREE.Color("#f4a3cf"),
      attenuationDistance: 3.2,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.3,
    }),
  );
  const slabGeo = keep(new RoundedBoxGeometry(BLOCK.w, BLOCK.h, BLOCK.d, 6, BLOCK.r));
  const plinthGeo = keep(new THREE.CylinderGeometry(1.32, 1.32, 0.1, 64));
  const glowTex = keep(buildGlowTexture());
  const pieces: Piece[] = buildPieces();

  // Four corner marks on the ground round each block, as a surveyor's pegs.
  const pegs: number[] = [];
  const px = BLOCK.w / 2 + 0.9;
  const pz = BLOCK.d / 2 + 0.9;
  const arm = 0.7;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pegs.push(sx * px, 0, sz * pz, sx * (px - arm), 0, sz * pz);
      pegs.push(sx * px, 0, sz * pz, sx * px, 0, sz * (pz - arm));
    }
  }
  const pegGeo = keep(new THREE.BufferGeometry());
  pegGeo.setAttribute("position", new THREE.Float32BufferAttribute(pegs, 3));
  const pegMat = keep(new THREE.LineBasicMaterial({ color: BLOSSOM }));

  type Block = {
    group: THREE.Group;
    piece: Piece;
    turner: THREE.Group;
    lamp: THREE.PointLight;
    plinth: THREE.MeshBasicMaterial;
    halo: THREE.SpriteMaterial;
    points: [THREE.Vector3, THREE.Vector3];
    phase: number;
  };
  const blossom = new THREE.Color(BLOSSOM);
  const blocks: Block[] = layout.blocks.map((at, i) => {
    const group = new THREE.Group();
    group.position.copy(at);
    group.rotation.y = layout.blockYaw[i];

    const slab = new THREE.Mesh(slabGeo, glass);
    slab.position.y = BLOCK.lift + BLOCK.h / 2;
    group.add(slab);

    const plinthMat = keep(new THREE.MeshBasicMaterial({ color: BLOSSOM }));
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = BLOCK.lift + 0.42;
    group.add(plinth);

    const turner = new THREE.Group();
    turner.position.y = BLOCK.lift + 2.35;
    turner.add(pieces[i].group);
    group.add(turner);

    // The light sits under the object, so it is lit from the plinth up.
    // It is close: at one unit away, 3.2 is already a well lit surface.
    const lamp = new THREE.PointLight(BLOSSOM, LAMP, 14, 2);
    lamp.position.y = BLOCK.lift + 0.95;
    group.add(lamp);
    const fill = new THREE.PointLight("#ffffff", 3.5, 9, 2);
    fill.position.set(-0.9, BLOCK.lift + 3.9, 0.9);
    group.add(fill);

    const haloMat = keep(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: BLOSSOM,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        transparent: true,
        opacity: 0.2,
      }),
    );
    const halo = new THREE.Sprite(haloMat);
    halo.position.y = BLOCK.lift + BLOCK.h * 0.45;
    halo.scale.set(11, 11, 1);
    halo.renderOrder = 5;
    group.add(halo);

    const peg = new THREE.LineSegments(pegGeo, pegMat);
    peg.position.y = 0.22;
    group.add(peg);

    scene.add(group);
    group.updateMatrixWorld(true);
    // Two marked points on the front face: upper left and lower right.
    // The leader lines end on these, so they end on the glass.
    const upper = new THREE.Vector3(-BLOCK.w * 0.3, BLOCK.lift + BLOCK.h * 0.8, BLOCK.d / 2).applyMatrix4(group.matrixWorld);
    const lower = new THREE.Vector3(BLOCK.w * 0.3, BLOCK.lift + BLOCK.h * 0.2, BLOCK.d / 2).applyMatrix4(group.matrixWorld);
    return { group, piece: pieces[i], turner, lamp, plinth: plinthMat, halo: haloMat, points: [upper, lower], phase: i * 1.7 };
  });

  // ------------------------------------------------------ skill cubes
  const skills = skillGroups.flatMap((g, row) => g.skills.map((skill, col) => ({ skill, row, col })));
  const sheet = buildMarkSheet(
    skills.map((s) => s.skill),
    monoFamily,
  );
  keep(sheet.texture);
  const cubeGlass = keep(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0.06,
      metalness: 0,
      transmission: 1,
      ior: 1.25,
      thickness: 0.6,
      attenuationColor: new THREE.Color("#f4a3cf"),
      attenuationDistance: 1.6,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.4,
    }),
  );
  const cubeGeo = keep(new RoundedBoxGeometry(CUBE, CUBE, CUBE, 4, 0.1));
  // alphaTest, not transparency: a see-through mark would be drawn after
  // the glass and lost behind it. A cut-out one is drawn before.
  const markMat = keep(
    new THREE.MeshBasicMaterial({ map: sheet.texture, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false }),
  );
  const fieldGroup = new THREE.Group();
  fieldGroup.position.copy(layout.field);
  fieldGroup.rotation.y = layout.fieldYaw;
  fieldGroup.visible = false;
  scene.add(fieldGroup);

  type Cube = { holder: THREE.Group; rest: THREE.Vector3; from: THREE.Vector3; delay: number; spin: number };
  const REST_Y = CUBE / 2 + 0.22;
  const cubes: Cube[] = skills.map(({ row, col }, i) => {
    const holder = new THREE.Group();
    holder.add(new THREE.Mesh(cubeGeo, cubeGlass));
    const geo = keep(new THREE.PlaneGeometry(CUBE * 0.66, CUBE * 0.66));
    const c = sheet.cell(i);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k += 1) uv.setXY(k, c.u + uv.getX(k) * c.w, c.v + uv.getY(k) * c.h);
    const mark = new THREE.Mesh(geo, markMat);
    // Lying nearly flat and tipped back toward the camera, which is above
    // and behind the field looking down.
    mark.rotation.x = -1.16;
    holder.add(mark);
    fieldGroup.add(holder);
    const rest = new THREE.Vector3(ROW_LEFT + col * CUBE_GAP, REST_Y, (row - 2) * ROW_GAP);
    const from = new THREE.Vector3(
      rest.x + (fixedRandom(i * 3 + 1) - 0.5) * 5,
      -1.4,
      rest.z + (fixedRandom(i * 3 + 2) - 0.5) * 5,
    );
    return { holder, rest, from, delay: row * 0.06 + col * 0.025, spin: (fixedRandom(i * 3 + 3) - 0.5) * 5 };
  });
  const fieldLamp = new THREE.PointLight("#ffe3f1", 0, 40, 2);
  fieldLamp.position.set(-1.5, 5, 0);
  fieldGroup.add(fieldLamp);
  fieldGroup.updateMatrixWorld(true);
  const rowFirst: THREE.Vector3[] = [];
  const rowLast: THREE.Vector3[] = [];
  skillGroups.forEach((g, row) => {
    const z = (row - 2) * ROW_GAP;
    rowFirst.push(new THREE.Vector3(ROW_LEFT, REST_Y, z).applyMatrix4(fieldGroup.matrixWorld));
    rowLast.push(new THREE.Vector3(ROW_LEFT + (g.skills.length - 1) * CUBE_GAP, REST_Y, z).applyMatrix4(fieldGroup.matrixWorld));
  });

  // ------------------------------------------------------------ petals
  const petalGeo = keep(new THREE.BufferGeometry());
  const spots = new Float32Array(PETALS * 3);
  const seeds = new Float32Array(PETALS * 4);
  for (let i = 0; i < PETALS; i += 1) {
    spots[i * 3] = fixedRandom(i * 7 + 1);
    spots[i * 3 + 1] = fixedRandom(i * 7 + 2);
    spots[i * 3 + 2] = fixedRandom(i * 7 + 3);
    seeds[i * 4] = fixedRandom(i * 7 + 4);
    seeds[i * 4 + 1] = fixedRandom(i * 7 + 5);
    seeds[i * 4 + 2] = fixedRandom(i * 7 + 6);
    seeds[i * 4 + 3] = fixedRandom(i * 7 + 7);
  }
  petalGeo.setAttribute("position", new THREE.BufferAttribute(spots, 3));
  petalGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const petalUniforms = {
    uTime: { value: 0 },
    uScale: { value: 1000 },
    uBox: { value: new THREE.Vector3(56, 22, 56) },
    uPetal: { value: new THREE.Color(BLOSSOM) },
  };
  const petals = new THREE.Points(
    petalGeo,
    keep(
      new THREE.ShaderMaterial({
        uniforms: petalUniforms,
        vertexShader: PETAL_VERT,
        fragmentShader: PETAL_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    ),
  );
  // The shader moves them, so three's idea of where they are is wrong.
  petals.frustumCulled = false;
  petals.renderOrder = 4;
  scene.add(petals);

  // -------------------------------------------------------- the camera
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lift = new THREE.Vector3(0, 1, 0);
  const probe = new THREE.Vector3();
  const pointerAim = { x: 0, y: 0 };
  const pointerNow = { x: 0, y: 0 };
  let stageW = 1;
  let stageH = 1;

  const toStage = (world: THREE.Vector3, out: Point): boolean => {
    probe.copy(world).project(camera);
    out.x = (probe.x * 0.5 + 0.5) * stageW;
    out.y = (-probe.y * 0.5 + 0.5) * stageH;
    return probe.z < 1 && probe.z > -1;
  };

  const tint = new THREE.Color();

  return {
    resize(width, height) {
      stageW = Math.max(1, width);
      stageH = Math.max(1, height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, MAX_BUFFER_WIDTH / stageW);
      renderer.setPixelRatio(ratio);
      renderer.setSize(stageW, stageH, false);
      const aspect = stageW / stageH;
      camera.aspect = aspect;
      // On a tall screen, keep the width of the view and let the height
      // grow, or the blocks would run off both sides.
      const wide = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.6;
      camera.fov = aspect >= 1.6 ? FOV : Math.min(80, THREE.MathUtils.radToDeg(Math.atan(wide / aspect)) * 2);
      camera.updateProjectionMatrix();
      petalUniforms.uScale.value = (stageH * ratio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    },

    frame(u, t, dt) {
      const place = placeOnRoad(u);
      eyeRoad.at(place, eye);
      lookRoad.at(place, look);

      // The pointer leans the view a little. It eases, so it cannot jerk.
      const ease = 1 - Math.exp(-dt * 3);
      pointerNow.x += (pointerAim.x - pointerNow.x) * ease;
      pointerNow.y += (pointerAim.y - pointerNow.y) * ease;
      camera.position.copy(eye);
      camera.up.set(0, 1, 0);
      camera.lookAt(look);
      side.setFromMatrixColumn(camera.matrixWorld, 0);
      look.addScaledVector(side, pointerNow.x * 0.5).addScaledVector(lift, -pointerNow.y * 0.3);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      sky.position.copy(camera.position);

      for (let i = 0; i < blocks.length; i += 1) {
        const b = blocks[i];
        const pulse = 0.84 + 0.16 * Math.sin(t * 1.3 + b.phase);
        b.lamp.intensity = LAMP * pulse;
        b.halo.opacity = 0.2 * pulse;
        tint.copy(blossom).multiplyScalar(0.7 + 0.5 * pulse);
        b.plinth.color.copy(tint);
        groundUniforms.uBlocks.value[i].z = pulse;
        b.turner.rotation.y = b.piece.swing ? Math.sin(t * 0.28) * 0.6 : t * 0.22 + b.phase;
        b.piece.update(t + b.phase);
      }

      // The cubes are under the ground until the rise begins.
      const rise = clamp01((u - 4.9) / 0.85);
      const showField = u > 4.7;
      fieldGroup.visible = showField;
      fieldLamp.intensity = 34 * rise;
      groundUniforms.uField.value.z = rise;
      if (showField) {
        for (let i = 0; i < cubes.length; i += 1) {
          const c = cubes[i];
          const k = clamp01((rise - c.delay) / 0.5);
          // First half: straight up out of the ground to a hover.
          // Second half: across to its place in the row, and down.
          const up = smooth(k / 0.45);
          const across = smooth((k - 0.45) / 0.55);
          const hover = c.from.y + (2.4 - c.from.y) * up;
          c.holder.position.set(
            c.from.x + (c.rest.x - c.from.x) * across,
            hover + (c.rest.y - hover) * across,
            c.from.z + (c.rest.z - c.from.z) * across,
          );
          const loose = (1 - across) * (1 - across);
          c.holder.rotation.set(c.spin * loose * 0.6, c.spin * loose, 0);
        }
      }

      petalUniforms.uTime.value = t;
      renderer.render(scene, camera);
    },

    blockPoint(block, which, out) {
      return toStage(blocks[block].points[which], out);
    },
    rowEnds(row, first, last) {
      const a = toStage(rowFirst[row], first);
      const b = toStage(rowLast[row], last);
      return a && b;
    },
    cubeReach(row) {
      const d = camera.position.distanceTo(rowFirst[row]);
      const perUnit = stageH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d);
      return CUBE * 0.5 * perUnit;
    },
    pointer(x, y) {
      pointerAim.x = x;
      pointerAim.y = y;
    },
    redrawMarks(family) {
      sheet.redraw(family);
    },
    dispose() {
      scene.traverse((o) => {
        // Sprites share one geometry inside three. It is not ours to free.
        if ((o as THREE.Sprite).isSprite) return;
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) {
          const map = (mat as THREE.MeshStandardMaterial).map;
          if (map) map.dispose();
          mat.dispose();
        }
      });
      for (const d of disposables) d.dispose();
      envTarget.dispose();
      scene.environment = null;
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
