import * as THREE from "three";
import * as P from "./plan";

/**
 * The dusk sky as a three.js scene, drawn in greys on a canvas that is
 * never put on the page. The bar shader reads that canvas and redraws it
 * as plum bars on blossom: a dark grey is a wide bar, a light grey a thin
 * one. So everything here is unlit and says its own value; there are no
 * lights and no colour.
 *
 * Nothing here may be pure black: the bar shader drops black cells, which
 * would punch holes in the page. The darkest value is P.INK.
 */

export type Point = { x: number; y: number };

export type Sky = {
  canvas: HTMLCanvasElement;
  /** Sets the drawing size from the stage's, and how wide one bar cell is
   *  on the stage (CSS px), which is what the stars are sized by. */
  resize(stageW: number, stageH: number, cellCss: number): void;
  /** Draws the scene at scroll u. lean: the pointer, -1..1 each way.
   *  top: overrides how much of the frame's top is plum. */
  frame(u: number, time: number, lean: Point, top?: number): void;
  /** Where star n of group g is on the stage, as shares of its width and
   *  height. False when it is behind the camera. */
  star(g: number, n: number, out: Point): boolean;
  /** The pose the last frame was drawn from. */
  pose(): P.Pose;
  dispose(): void;
};

const MAX_DRAW_WIDTH = 1600;
const DEG = Math.PI / 180;

// -------------------------------------------------------------- shaders
// All short, all written out in full. No three.js chunks, so no colour
// space conversion: what the shader writes is the grey the bars read.

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_FRAG = /* glsl */ `
uniform float uHorizon;
uniform float uZenith;
uniform float uFrom;
uniform float uTo;
varying vec3 vDir;
void main() {
  float e = normalize(vDir).y;
  float v = mix(uHorizon, uZenith, smoothstep(uFrom, uTo, e));
  gl_FragColor = vec4(vec3(v), 1.0);
}
`;

const FLAT_VERT = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FLAT_FRAG = /* glsl */ `
uniform float uValue;
void main() {
  gl_FragColor = vec4(vec3(uValue), 1.0);
}
`;

const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// Red holds the shade, alpha the cover.
const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uTone;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D(uMap, vUv);
  float a = texel.a * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(texel.r * uTone), a);
}
`;

// A star is a short upright bar: as tall as about two and a half bar
// cells and half as wide, so the grid always catches it in one column.
const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aLevel;
attribute float aPhase;
uniform float uCell;
uniform float uTime;
varying float vLevel;
void main() {
  vLevel = aLevel * (0.9 + 0.1 * sin(uTime * 1.3 + aPhase));
  gl_PointSize = aSize * uCell * 2.6;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const STAR_FRAG = /* glsl */ `
varying float vLevel;
void main() {
  if (vLevel <= 0.0) discard;
  if (abs(gl_PointCoord.x - 0.5) > 0.25) discard;
  gl_FragColor = vec4(vec3(vLevel), 1.0);
}
`;

// The lit sliver: inside the disc, outside a second disc set up and to the
// left of it.
const MOON_FRAG = /* glsl */ `
uniform float uValue;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  if (length(p) > 1.0) discard;
  if (length(p - vec2(-0.42, 0.22)) < 0.98) discard;
  gl_FragColor = vec4(vec3(uValue), 1.0);
}
`;

// Screen-space: plum across the top of the frame, fading downward.
const TOP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const TOP_FRAG = /* glsl */ `
uniform float uAmount;
uniform float uReach;
uniform float uInk;
varying vec2 vUv;
void main() {
  float a = uAmount * (1.0 - smoothstep(0.0, uReach, 1.0 - vUv.y));
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(uInk), a);
}
`;

// ------------------------------------------------------------- textures

const CLOUD_TEX_W = 256;
const CLOUD_TEX_H = 128;

function cloudTexture(kind: number): THREE.DataTexture {
  const data = new Uint8Array(CLOUD_TEX_W * CLOUD_TEX_H * 4);
  const texel: [number, number] = [0, 0];
  for (let j = 0; j < CLOUD_TEX_H; j += 1) {
    // Row 0 of a DataTexture is the bottom of the plane, which is t = 0.
    const t = (j + 0.5) / CLOUD_TEX_H;
    for (let i = 0; i < CLOUD_TEX_W; i += 1) {
      P.cloudTexel(kind, (i + 0.5) / CLOUD_TEX_W, t, texel);
      const o = (j * CLOUD_TEX_W + i) * 4;
      const shade = Math.round(texel[0] * 255);
      data[o] = shade;
      data[o + 1] = shade;
      data[o + 2] = shade;
      data[o + 3] = Math.round(texel[1] * 255);
    }
  }
  const tex = new THREE.DataTexture(data, CLOUD_TEX_W, CLOUD_TEX_H, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Where the stars are in the world: laid out on the screen of a camera at
 *  the skills pose, 1.85 wide to 1 tall, and pushed out along each ray.
 *  The same sums as the Node check. */
export function starPositions(cons: P.Constellation[]): THREE.Vector3[][] {
  const cam = new THREE.PerspectiveCamera(P.FOV, 1.85, 0.1, 3000);
  const p = P.pose(P.SKY_U);
  cam.position.set(p.x, p.y, p.z);
  cam.rotation.order = "YXZ";
  cam.rotation.set(p.pitch * DEG, p.yaw * DEG, 0);
  cam.updateMatrixWorld(true);
  const dir = new THREE.Vector3();
  return cons.map((c) =>
    c.stars.map((s) => {
      dir.set(s.sx * 2 - 1, 1 - s.sy * 2, 0.5).unproject(cam).sub(cam.position).normalize();
      return cam.position.clone().addScaledVector(dir, P.STAR_DISTANCE);
    }),
  );
}

// ---------------------------------------------------------------- scene

export function buildSky(cons: P.Constellation[]): Sky {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  // Asked for here, so a browser without WebGL 2 fails before three.js is
  // involved. preserveDrawingBuffer: in the still layout the bar shader
  // reads this canvas later than the frame it was drawn in.
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: true,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("b15: no WebGL 2");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.setClearColor(new THREE.Color(P.INK, P.INK, P.INK), 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(P.FOV, 1.85, 0.1, 3000);
  camera.rotation.order = "YXZ";

  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    owned.push(thing);
    return thing;
  };

  // ---------------------------------------------------------------- sky
  const skyUniforms = {
    uHorizon: { value: 1 },
    uZenith: { value: 0.6 },
    uFrom: { value: P.SKY_FROM },
    uTo: { value: P.SKY_TO },
  };
  const sky = new THREE.Mesh(
    keep(new THREE.SphereGeometry(2000, 32, 24)),
    keep(
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    ),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // -------------------------------------------------------------- moon
  const moonMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { uValue: { value: 0.97 } },
      vertexShader: CLOUD_VERT,
      fragmentShader: MOON_FRAG,
    }),
  );
  const moon = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1)), moonMat);
  const moonSize = 2 * P.MOON_DISTANCE * Math.tan(P.MOON_RADIUS * DEG);
  moon.scale.set(moonSize, moonSize, 1);
  moon.frustumCulled = false;
  scene.add(moon);

  // ------------------------------------------------------------- hills
  const ridgeMats: THREE.ShaderMaterial[] = [];
  for (const r of P.RIDGES) {
    const steps = 360;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k <= steps; k += 1) {
      const x = -P.RIDGE_HALF_WIDTH + (2 * P.RIDGE_HALF_WIDTH * k) / steps;
      pos.push(x, P.ridgeTop(r, x), r.z, x, -1500, r.z);
      if (k > 0) {
        const a = (k - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = keep(
      new THREE.ShaderMaterial({
        uniforms: { uValue: { value: r.dusk } },
        vertexShader: FLAT_VERT,
        fragmentShader: FLAT_FRAG,
        side: THREE.DoubleSide,
      }),
    );
    ridgeMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ------------------------------------------------------------ clouds
  const textures = Array.from({ length: P.CLOUD_KINDS }, (_, k) => keep(cloudTexture(k)));
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  type CloudMesh = { c: P.Cloud; mesh: THREE.Mesh; uniforms: { uMap: { value: THREE.Texture }; uTone: { value: number }; uOpacity: { value: number } } };
  const clouds: CloudMesh[] = P.CLOUDS.map((c) => {
    const uniforms = { uMap: { value: textures[c.kind] as THREE.Texture }, uTone: { value: 1 }, uOpacity: { value: 0 } };
    const mat = keep(
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const mesh = new THREE.Mesh(plane, mat);
    mesh.position.set(c.x, c.y, c.z);
    mesh.scale.set(c.w, c.h, 1);
    scene.add(mesh);
    return { c, mesh, uniforms };
  });

  // ------------------------------------------------------------- stars
  const world = starPositions(cons);
  const flat = world.flat();
  const starGeo = keep(new THREE.BufferGeometry());
  const starPos = new Float32Array(flat.length * 3);
  const starSize = new Float32Array(flat.length);
  const starLevel = new Float32Array(flat.length);
  const starPhase = new Float32Array(flat.length);
  const starInfo = cons.flatMap((c) => c.stars);
  flat.forEach((v, i) => {
    starPos[i * 3] = v.x;
    starPos[i * 3 + 1] = v.y;
    starPos[i * 3 + 2] = v.z;
    starSize[i] = starInfo[i].size;
    starPhase[i] = i * 2.39;
  });
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(starSize, 1));
  const levelAttr = new THREE.BufferAttribute(starLevel, 1);
  levelAttr.setUsage(THREE.DynamicDrawUsage);
  starGeo.setAttribute("aLevel", levelAttr);
  starGeo.setAttribute("aPhase", new THREE.BufferAttribute(starPhase, 1));
  const starUniforms = { uCell: { value: 6 }, uTime: { value: 0 } };
  const stars = new THREE.Points(
    starGeo,
    keep(
      new THREE.ShaderMaterial({
        uniforms: starUniforms,
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        depthWrite: false,
      }),
    ),
  );
  stars.frustumCulled = false;
  // After the sky, which ignores depth, and before the clouds.
  stars.renderOrder = -5;
  scene.add(stars);

  // -------------------------------------------------- plum at the top
  const topUniforms = { uAmount: { value: 1 }, uReach: { value: P.TOP_REACH }, uInk: { value: P.INK } };
  const top = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(2, 2)),
    keep(
      new THREE.ShaderMaterial({
        uniforms: topUniforms,
        vertexShader: TOP_VERT,
        fragmentShader: TOP_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    ),
  );
  top.renderOrder = 100;
  top.frustumCulled = false;
  scene.add(top);

  // ----------------------------------------------------------- per frame
  const now: P.Pose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0 };
  const moonDir = new THREE.Vector3();
  const probe = new THREE.Vector3();

  return {
    canvas,

    resize(stageW, stageH, cellCss) {
      const w = Math.max(2, Math.round(Math.min(MAX_DRAW_WIDTH, stageW)));
      const h = Math.max(2, Math.round((w * stageH) / Math.max(1, stageW)));
      renderer.setSize(w, h, false);
      const aspect = stageW / Math.max(1, stageH);
      camera.aspect = aspect;
      camera.fov = P.fovFor(aspect);
      camera.updateProjectionMatrix();
      // One bar cell in drawing pixels.
      starUniforms.uCell.value = (cellCss * w) / Math.max(1, stageW);
    },

    frame(u, time, lean, topAmount) {
      P.pose(u, now);
      const d = P.darkness(u);
      camera.position.set(now.x, now.y, now.z);
      camera.rotation.set((now.pitch + lean.y * 1.5) * DEG, (now.yaw + lean.x * 2.5) * DEG, 0);
      camera.updateMatrixWorld(true);
      sky.position.copy(camera.position);

      const parts = P.skyParts(d);
      skyUniforms.uHorizon.value = parts.horizon;
      skyUniforms.uZenith.value = parts.zenith;
      P.RIDGES.forEach((r, i) => {
        ridgeMats[i].uniforms.uValue.value = P.ridgeValue(r, d);
      });

      const tone = P.cloudTone(d);
      const fade = P.cloudFade(d);
      for (const cm of clouds) {
        const { c } = cm;
        const ahead = now.z - c.z;
        let a = ahead <= 0.05 ? 0 : P.nearFade(ahead) * P.hazeFade(ahead) * fade;
        if (c.curtain !== undefined) a *= P.curtainShown(c.curtain, u);
        cm.uniforms.uOpacity.value = a;
        cm.uniforms.uTone.value = tone;
        cm.mesh.visible = a > 0.004;
        cm.mesh.position.x = c.x + Math.sin((time / c.period) * Math.PI * 2 + c.phase) * P.CLOUD_SWAY;
      }

      // Stars come in group by group and go as the camera tips back down.
      const gone = P.starsGone(u);
      let i = 0;
      cons.forEach((c, g) => {
        const shown = P.starsShown(g, u) * gone;
        for (const s of c.stars) {
          starLevel[i] = shown > 0.01 ? P.INK + (s.bright - P.INK) * shown : 0;
          i += 1;
        }
      });
      levelAttr.needsUpdate = true;
      starUniforms.uTime.value = time;

      // The moon sits on the sky round the camera, a fixed way off, and
      // faces it. It is only up in the contact screen.
      const elev = P.moonElevation(u) * DEG;
      const az = P.MOON_AZ * DEG;
      moonDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev));
      moon.visible = u > 7.8;
      moon.position.copy(camera.position).addScaledVector(moonDir, P.MOON_DISTANCE);
      moon.lookAt(camera.position);

      topUniforms.uAmount.value = topAmount ?? P.topDark(u);

      renderer.render(scene, camera);
    },

    star(g, n, out) {
      probe.copy(world[g][n]).project(camera);
      out.x = probe.x * 0.5 + 0.5;
      out.y = 0.5 - probe.y * 0.5;
      return probe.z > -1 && probe.z < 1;
    },

    pose() {
      return { ...now };
    },

    dispose() {
      for (const o of owned) o.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
