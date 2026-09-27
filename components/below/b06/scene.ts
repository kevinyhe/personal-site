import * as THREE from "three";
import { projects } from "@/components/profile";
import { CAMERA_Z, FOV, GROUP_COLOURS, WORK } from "./layout";
import { cellOf, drawSheet, flatSkills, newSheet } from "./marks";
import { ART_FRAGMENTS, SKILL_FRAGMENT, STRIP_VERTEX } from "./shaders";

/**
 * The three.js side of design 06: ten work strips with their
 * reflections, 42 skill strips, one camera. It knows nothing of the page.
 * The stage tells it where each strip is, in vw and vh, every frame.
 *
 * Nothing here is lit. Every strip is drawn by its own shader at full
 * brightness, so it reads on the dark ground whatever else happens.
 */

/** Where a strip is and how it is shown. left, width in vw; top, height
 *  in vh; stand 0 lying to 1 upright; light and alpha 0 to 1. */
export type Pose = {
  left: number;
  width: number;
  top: number;
  height: number;
  stand: number;
  light: number;
  alpha: number;
};

export type StripScene = {
  resize(width: number, height: number): void;
  /** Work strip i. The window is the share of its picture it shows. */
  work(i: number, pose: Pose, winCentre: number, winWidth: number, winHeight: number, front: boolean): void;
  /** Skill strip i, its mark `mark` vw a side. */
  skill(i: number, pose: Pose, mark: number): void;
  workMotion(bend: number, shear: number): void;
  skillsMotion(bend: number, shear: number): void;
  draw(time: number): void;
  redrawMarks(monoFamily: string): void;
  dispose(): void;
};

type StripUniforms = {
  uSize: { value: THREE.Vector2 };
  uCentre: { value: THREE.Vector2 };
  uStand: { value: number };
  uLight: { value: number };
  uAlpha: { value: number };
  uEdge: { value: number };
};

/** The light line down a strip's long sides is this wide, in vw. */
const EDGE = 0.12;

export function buildScene(canvas: HTMLCanvasElement, monoFamily: string): StripScene {
  // Ask for the context ourselves. If the browser has none to give, this
  // throws before three.js is involved and the page falls back to words.
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("b06: no WebGL");
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true, premultipliedAlpha: true });
  // The canvas is clear where there is no strip. The ground is the page's.
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1.85, 0.1, 20);
  camera.position.set(0, 0, CAMERA_Z);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };

  // Many segments across, so a wide strip can curve. Two up is enough:
  // standing and shearing keep straight lines straight.
  const plane = keep(new THREE.PlaneGeometry(1, 1, 32, 2));

  let aspect = 1.85;
  const time = { value: 0 };
  const artAspect = { value: 1 };
  const workBend = { value: 0 };
  const workShear = { value: 0 };
  const skillsBend = { value: 0 };
  const skillsShear = { value: 0 };

  const own = (): StripUniforms => ({
    uSize: { value: new THREE.Vector2(0.1, 0.1) },
    uCentre: { value: new THREE.Vector2(0, 0) },
    uStand: { value: 1 },
    uLight: { value: 1 },
    uAlpha: { value: 0 },
    uEdge: { value: 0.05 },
  });

  const material = (uniforms: Record<string, THREE.IUniform>, fragmentShader: string): THREE.ShaderMaterial =>
    keep(
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: STRIP_VERTEX,
        fragmentShader,
        transparent: true,
        // Strips never cover one another except in passing, and the draw
        // order below settles those moments.
        depthTest: false,
        depthWrite: false,
      }),
    );

  const mesh = (m: THREE.ShaderMaterial, order: number): THREE.Mesh => {
    const out = new THREE.Mesh(plane, m);
    // The shader moves the strip, so three's own idea of where it is
    // would be wrong. Never let it decide the strip is out of sight.
    out.frustumCulled = false;
    out.renderOrder = order;
    out.visible = false;
    scene.add(out);
    return out;
  };

  // -------------------------------------------------------------- work
  type WorkStrip = { u: StripUniforms; window: { value: THREE.Vector4 }; body: THREE.Mesh; mirror: THREE.Mesh };
  const workStrips: WorkStrip[] = [];
  for (let i = 0; i < WORK.count; i += 1) {
    const project = Math.min(projects.length - 1, Math.floor(i / WORK.perProject));
    const u = own();
    const window = { value: new THREE.Vector4(0.5, 0.1, 0.5, 1) };
    const shared = {
      ...u,
      uBend: workBend,
      uShear: workShear,
      uTime: time,
      uAspect: artAspect,
      uWindow: window,
    };
    const fragment = ART_FRAGMENTS[project % ART_FRAGMENTS.length];
    const body = mesh(material({ ...shared, uMirror: { value: 0 } }, fragment), 2);
    const mirror = mesh(material({ ...shared, uMirror: { value: 1 } }, fragment), 1);
    workStrips.push({ u, window, body, mirror });
  }

  // ------------------------------------------------------------ skills
  const sheet = newSheet();
  drawSheet(sheet, monoFamily);
  const marks = keep(new THREE.CanvasTexture(sheet));
  marks.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  type SkillStrip = { u: StripUniforms; mark: { value: number }; body: THREE.Mesh };
  const skillStrips: SkillStrip[] = flatSkills.map((skill, i) => {
    const u = own();
    const mark = { value: 0.04 };
    const body = mesh(
      material(
        {
          ...u,
          uBend: skillsBend,
          uShear: skillsShear,
          uMirror: { value: 0 },
          uMarks: { value: marks },
          uCell: { value: new THREE.Vector4(...cellOf(i)) },
          uTint: { value: new THREE.Color(GROUP_COLOURS[skill.group % GROUP_COLOURS.length]).convertLinearToSRGB() },
          uMark: mark,
        },
        SKILL_FRAGMENT,
      ),
      2,
    );
    return { u, mark, body };
  });

  /** Writes a pose into a strip's uniforms. Says whether any of the
   *  strip can be seen, so the caller can skip drawing it. */
  const place = (u: StripUniforms, p: Pose): boolean => {
    const w = (p.width / 100) * aspect;
    const h = p.height / 100;
    u.uSize.value.set(w, h);
    u.uCentre.value.set(((p.left + p.width / 2) / 100 - 0.5) * aspect, 0.5 - (p.top + p.height / 2) / 100);
    u.uStand.value = p.stand;
    u.uLight.value = p.light;
    u.uAlpha.value = p.alpha;
    u.uEdge.value = Math.min(0.5, EDGE / Math.max(p.width, 0.01));
    // Generous limits: a bent row reaches past where it stands flat.
    return p.alpha > 0.004 && p.top < 125 && p.top + p.height > -25 && p.left < 140 && p.left + p.width > -40;
  };

  return {
    resize(width: number, height: number): void {
      const w = Math.max(1, width);
      const h = Math.max(1, height);
      aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      artAspect.value = (WORK.openW / WORK.h) * aspect;
      // Never more than 1.5 device pixels to one, never wider than 2560.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5, 2560 / w));
      renderer.setSize(w, h, false);
    },
    work(i, pose, winCentre, winWidth, winHeight, front): void {
      const s = workStrips[i];
      if (!s) return;
      const seen = place(s.u, pose);
      s.window.value.set(winCentre, winWidth, 0.5, winHeight);
      s.body.visible = seen;
      s.mirror.visible = seen && pose.stand > 0.5;
      s.body.renderOrder = front ? 3 : 2;
    },
    skill(i, pose, mark): void {
      const s = skillStrips[i];
      if (!s) return;
      s.body.visible = place(s.u, pose);
      s.mark.value = (mark / 100) * aspect;
    },
    workMotion(bend, shear): void {
      workBend.value = bend;
      workShear.value = shear;
    },
    skillsMotion(bend, shear): void {
      skillsBend.value = bend;
      skillsShear.value = shear;
    },
    draw(t: number): void {
      time.value = t;
      renderer.render(scene, camera);
    },
    redrawMarks(family: string): void {
      drawSheet(sheet, family);
      marks.needsUpdate = true;
    },
    dispose(): void {
      for (const d of disposables) d.dispose();
      renderer.dispose();
      // Give the context back now. Browsers allow only a few at once.
      renderer.forceContextLoss();
    },
  };
}
