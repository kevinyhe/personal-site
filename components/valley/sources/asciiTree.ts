import * as THREE from "three";

import { WeepingCherryGenerator } from "@/components/BareThreeCanvas";
import type { CanvasSource } from "@/components/valley/barShader";

/**
 * The site's own weeping cherry, rendered off screen for the bar shader.
 *
 * The reference feeds its bar shader a video of a fir tree on black. Ours is
 * the hero's procedural tree, rendered by a private WebGLRenderer into a
 * canvas nobody sees, then copied into a plain 2D canvas that the bar engine
 * samples like any other source. The copy step is what makes the source safe
 * to read at any time: a WebGL drawing buffer may be blank between frames,
 * a 2D canvas keeps its pixels.
 *
 * Levels are the whole point. The bar shader turns brightness into bar width
 * (dark = wide = ink), and discards anything below 3/255. So the tree is lit
 * flat and grey on purpose: bark lands around 55-95 sRGB, blossoms around
 * 120-165, both inside the 55/175 black/white points the hero scene grades
 * this layer with. The hero's warm key and rose rim are not used here; they
 * were tuned for a dark scene where bark is meant to read near-black.
 */

type BuiltTree = Awaited<ReturnType<WeepingCherryGenerator["generate"]>>;

// ---------------------------------------------------------------------------
// Tuning. Every number here is a level or a framing choice; nothing else in
// the file needs touching to change how the tree reads through the bars.
// ---------------------------------------------------------------------------

/** The hero's field of view; the tree's branch tubes and wind amplitudes were tuned under it. */
const FOV = 42;
/** Fraction of the box left empty at the top and both sides, so the canopy's wind sway stays inside. */
const FRAME_MARGIN = 0.03;
/**
 * World units cut off the bottom. The generator fades the lowest 0.8 units of
 * the trunk toward black (its base sits below the hero's frame); cropping a
 * little of that keeps the base from ending in a dark stub.
 */
const BASE_CROP = 0.2;
/** Same slight yaw the hero gives the tree, so both show the same silhouette. */
const TREE_YAW = 0.06;
/**
 * The hero squashes the model to 0.7/0.8/0.64; these are those numbers with
 * y taken as 1, so the tree keeps the hero's proportions (the canopy the
 * generator was tuned for) whatever scale the fit lands on.
 */
const HERO_PROPORTION_X = 0.7 / 0.8;
const HERO_PROPORTION_Z = 0.64 / 0.8;
/**
 * The model is wider than tall (about 15 by 10.5 units, 1.2:1 with the
 * hero's proportions) and the hero scene's box for it is portrait, so a
 * uniform fit leaves the top half of the box empty. A vertical stretch up to
 * this factor fills more of it; past about 1.05 the weeping twigs start to
 * hang straight down like rope and the canopy reads as a thin curtain rather
 * than as a tree. It was 1.3, which is why it did. The right answer is to
 * give it a box its own shape (the caller's job) rather than to stretch it
 * into a portrait one.
 */
const MAX_FILL_STRETCH = 1.04;
/** Iterations of the camera fit. Each one halves the error; four is already below a pixel. */
const FIT_PASSES = 5;

/**
 * Flat white ambient. three's ambient irradiance is divided by pi in the
 * Lambert term, so 2.4 here is about 0.76 of the albedo on screen.
 */
const AMBIENT_INTENSITY = 2.4;
/** A soft key from the camera's upper left, just enough to give the canopy some shape. */
const KEY_INTENSITY = 0.8;
const KEY_POSITION = new THREE.Vector3(-4, 8, 10);
/**
 * Bark albedo (a purple-brown map times baked occlusion) is roughly 14 times
 * darker than the blossoms', far more than the 3x the bar grade wants. The
 * bark's material colour goes to white and the blossoms' down to a mid grey
 * to close that gap.
 */
const BARK_TINT = 0xffffff;
const BLOSSOM_TINT = 0xa6a6a6;
/** The generator's 0.32 is for a black void scene; here it would push blossoms past the white point. */
const BLOSSOM_EMISSIVE = 0.16;
/**
 * The blossom shader has its own baked backlight (a strong key and a rose
 * glow) that ignores scene lights. Kept at a fifth of its strength, with the
 * glow off, so it adds variation but cannot blow blossoms out.
 */
const TRANSMISSION_STRENGTH = 0.2;
/** Wind at the hero's "in bloom" strength, so twigs and blossoms flutter but the trunk stays put. */
const WIND_STRENGTH = 0.7;
/** The bar engine calls update at up to 60 fps; the tree only needs half that. */
const MAX_FPS = 30;

/** Hand the main thread a frame; a hidden tab has no rAF, so a timer backs it up. */
function yieldFrame() {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    window.setTimeout(finish, 250);
  });
}

/** Frees the GPU side of everything under `root`, textures included. */
function disposeObject(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as Partial<THREE.Mesh>;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const entry of materials) {
      for (const value of Object.values(entry as unknown as Record<string, unknown>)) {
        const texture = value as Partial<THREE.Texture> | null;
        if (texture && texture.isTexture && texture.dispose) texture.dispose();
      }
      entry.dispose();
    }
  });
}

function standardMaterialsOf(mesh: THREE.Mesh | THREE.InstancedMesh | null) {
  if (!mesh) return [] as THREE.MeshStandardMaterial[];
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return list.filter(
    (m): m is THREE.MeshStandardMaterial =>
      (m as Partial<THREE.MeshStandardMaterial>).isMeshStandardMaterial === true,
  );
}

/**
 * Re-level the generated materials for the bar grade. The blossom material's
 * onBeforeCompile (applyBlossomWind in BareThreeCanvas) installs the wind and
 * the baked transmission uniforms; wrapping it lets this module swap the
 * transmission uniforms for its own objects on this material only. Uniform
 * objects are per material, so the hero's tree is untouched.
 */
function relevelMaterials(tree: BuiltTree) {
  for (const bark of standardMaterialsOf(tree.branchMesh)) {
    bark.color.set(BARK_TINT);
  }

  const blossomMaterials = new Set<THREE.MeshStandardMaterial>();
  for (const mesh of [tree.blossomMesh, tree.lowBlossomMesh, tree.halfBlossomMesh, tree.budMesh]) {
    for (const m of standardMaterialsOf(mesh)) blossomMaterials.add(m);
  }
  for (const material of blossomMaterials) {
    material.color.set(BLOSSOM_TINT);
    material.emissiveIntensity = BLOSSOM_EMISSIVE;
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.uTransStrength = { value: TRANSMISSION_STRENGTH };
      shader.uniforms.uGlowColor = { value: new THREE.Color(0, 0, 0) };
    };
    material.needsUpdate = true;
  }
}

/**
 * Place a straight-on camera so the tree fills the frame: the lowest point
 * (the trunk base) on the bottom edge, the canopy inside the side and top
 * margins. Perspective makes the near side of the canopy project larger than
 * its box, so this fits the box's eight corners by projecting them and
 * correcting, a few passes, instead of solving the box once.
 */
function frameTree(camera: THREE.PerspectiveCamera, box: THREE.Box3, aspect: number) {
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const halfTan = Math.tan((FOV * Math.PI) / 360);
  const bottom = box.min.y + BASE_CROP;

  // First guess: the box's height or width against the frustum, whichever is
  // tighter, measured from the box's near face.
  let distance =
    Math.max(size.y / 2 / halfTan, size.x / 2 / (halfTan * aspect)) / (1 - FRAME_MARGIN) +
    size.z / 2;
  let cx = centre.x;
  let cy = bottom + distance * halfTan;

  const corner = new THREE.Vector3();
  for (let pass = 0; pass < FIT_PASSES; pass += 1) {
    camera.position.set(cx, cy, centre.z + distance);
    camera.lookAt(cx, cy, centre.z);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i += 1) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : bottom,
        i & 4 ? box.max.z : box.min.z,
      );
      corner.project(camera);
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }

    // NDC extents scale about 1/distance, so the overshoot ratio is a
    // direct multiplier on the distance. The margin is applied to the
    // canopy only: the base must touch -1 exactly.
    const limit = 2 - 2 * FRAME_MARGIN;
    const need = Math.max((maxY - minY) / limit, (maxX - minX) / limit);
    if (Math.abs(need - 1) > 1e-3) distance *= need;

    // Shift the camera so the base sits on the bottom edge and the canopy is
    // centred. World units per NDC unit at the focal plane is distance*tan.
    const unitsPerNdc = distance * halfTan;
    cy += (minY + 1) * unitsPerNdc;
    cx += ((minX + maxX) / 2) * unitsPerNdc * aspect;
  }

  camera.position.set(cx, cy, centre.z + distance);
  camera.lookAt(cx, cy, centre.z);
  camera.near = Math.max(0.05, distance - size.z);
  camera.far = distance + size.z + 5;
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}

export function createAsciiTree(options: {
  seed: number;
  width: number;
  height: number;
  mirror?: boolean;
  quality?: "low" | "medium" | "high";
  blossomCount?: number;
}): CanvasSource {
  const { seed, width, height, mirror = false, quality = "low", blossomCount = 7200 } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  // Black until the first frame lands: the bar shader discards black, so an
  // unfinished tree simply draws nothing rather than a grey block.
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
  }

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let tree: BuiltTree | null = null;
  let disposed = false;
  let lastRenderTime = -Infinity;

  const copyFrame = () => {
    if (!ctx || !renderer) return;
    // Straight after render() the drawing buffer is still intact; the copy
    // has to happen in the same task, which is why this is not deferred.
    ctx.save();
    if (mirror) {
      ctx.scale(-1, 1);
      ctx.drawImage(renderer.domElement, -width, 0, width, height);
    } else {
      ctx.drawImage(renderer.domElement, 0, 0, width, height);
    }
    ctx.restore();
  };

  const render = (timeSec: number) => {
    if (!renderer || !scene || !camera || !tree) return;
    const wind = tree.branchWindUniforms;
    if (wind) {
      wind.uWindTime.value = timeSec;
      wind.uWindStrength.value = WIND_STRENGTH;
      wind.uPointerStrength.value = 0;
    }
    renderer.render(scene, camera);
    copyFrame();
  };

  const build = async () => {
    const gl = new THREE.WebGLRenderer({
      canvas: document.createElement("canvas"),
      // Twigs are a pixel or two wide at this size; without AA they flicker
      // between cells as the wind moves them.
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    gl.setPixelRatio(1);
    gl.setSize(width, height, false);
    gl.setClearColor(0x000000, 1);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    // No tone curve: the levels above are worked out as albedo times
    // irradiance straight to sRGB, and a filmic curve would move them.
    gl.toneMapping = THREE.NoToneMapping;
    gl.shadowMap.enabled = false;
    renderer = gl;

    const generator = new WeepingCherryGenerator({
      seed,
      quality,
      blossomCount,
      // Loose petals fall out of the box and read as stray bars; none here.
      petalCount: 0,
    });
    const built = await generator.generate(yieldFrame);
    if (disposed) {
      disposeObject(built.group);
      return;
    }
    tree = built;

    // generate() bakes in the hero's placement (a lift, a push toward its
    // camera, a 0.7/0.8/0.64 squash). Back to an origin-rooted model so the
    // box measured below is the tree's own.
    built.group.position.set(0, 0, 0);
    built.group.rotation.set(0, TREE_YAW, 0);
    built.group.scale.set(HERO_PROPORTION_X, 1, HERO_PROPORTION_Z);
    built.group.updateMatrixWorld(true);
    built.blossomGrowth.value = 1;
    relevelMaterials(built);

    // Box3.setFromObject reads each InstancedMesh's instance matrices, so
    // the canopy's blossoms are in the measurement, not just the bark.
    const box = new THREE.Box3().setFromObject(built.group);
    const size = box.getSize(new THREE.Vector3());
    // When the box is taller than the tree, stretch the tree up toward the
    // box's shape (capped), then measure again so the fit sees the truth.
    const aspect = width / height;
    const stretch = Math.min(MAX_FILL_STRETCH, Math.max(1, size.x / aspect / size.y));
    if (stretch > 1) {
      built.group.scale.y = stretch;
      built.group.updateMatrixWorld(true);
      box.setFromObject(built.group);
    }

    const world = new THREE.Scene();
    world.background = new THREE.Color(0x000000);
    world.add(built.group);
    world.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
    const key = new THREE.DirectionalLight(0xffffff, KEY_INTENSITY);
    key.position.copy(KEY_POSITION);
    world.add(key);
    scene = world;

    const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 100);
    frameTree(cam, box, aspect);
    camera = cam;

    await yieldFrame();
    if (disposed) return;
    render(0);
    lastRenderTime = 0;
  };

  const ready = build().catch((error: unknown) => {
    // A failed build leaves the canvas black, which the bar shader treats
    // as empty: the landscape still draws, just without this tree.
    console.error("asciiTree: build failed", error);
  });

  // false means "nothing was redrawn", and the bar engine then skips
  // re-uploading this canvas as a texture. The tree renders at half the
  // engine's tick rate, so that is half the uploads of a 960 px canvas
  // saved every second — and there are two layers sampling it.
  const update = (timeSec: number): boolean => {
    if (disposed || !tree) return false;
    if (timeSec - lastRenderTime < 1 / MAX_FPS - 1e-3) return false;
    lastRenderTime = timeSec;
    render(timeSec);
    return true;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (tree) {
      tree.group.removeFromParent();
      disposeObject(tree.group);
      tree = null;
    }
    scene = null;
    camera = null;
    if (renderer) {
      renderer.dispose();
      // Hands the context back now rather than when the GC notices; the
      // page holds several contexts already and browsers cap the count.
      renderer.forceContextLoss();
      renderer = null;
    }
  };

  return { canvas, update, ready, dispose, animated: true };
}
