/**
 * Live tree placement, shared between the tuner panel and the render loop.
 *
 * A plain mutable object rather than React state on purpose: the render loop
 * reads it every frame and must not re-render the canvas component to see a
 * change. The panel writes, the loop reads, nothing subscribes.
 *
 * The defaults reproduce the placement baked into generate() EXACTLY, so the
 * loop can apply this unconditionally — a session without the tuner mounted
 * looks identical to one with no tuner in the codebase at all.
 */
export type TreeTuning = {
  x: number;
  y: number;
  z: number;
  /** Yaw in radians — which face of the canopy points at the camera. */
  rotY: number;
  /** Uniform multiplier on top of the baked non-uniform scale. */
  scale: number;
};

/**
 * Baked non-uniform scale from WeepingCherryGenerator.generate(). This tracks
 * whatever is currently frozen in there, so `scale: 1` always means "as it
 * ships" and adjustments are relative to the last freeze rather than to some
 * older baseline.
 */
export const TREE_BASE_SCALE = { x: 0.7, y: 0.8, z: 0.64 } as const;

export const TREE_TUNING_DEFAULT: TreeTuning = {
  x: 2.0,
  y: 2.25,
  z: 4.35,
  rotY: 0.06,
  scale: 1,
};

export const treeTuning: TreeTuning = { ...TREE_TUNING_DEFAULT };

export function setTreeTuning(patch: Partial<TreeTuning>) {
  Object.assign(treeTuning, patch);
}

/**
 * Versioned. A stored `scale` is a multiplier against TREE_BASE_SCALE, so
 * once a freeze folds a multiplier into the base, any older stored value
 * would be applied a second time and shrink the tree. Bumping the key on
 * every freeze retires those entries instead of silently compounding them.
 */
export const TREE_TUNING_STORAGE_KEY = "arbor:tree-tuning:v4";

/** True only when the URL carries ?tune — never for an ordinary visitor. */
export function isTreeTuningEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("tune");
}

/**
 * The exact lines to paste into WeepingCherryGenerator.generate() to freeze
 * the current placement, after which the tuner can be removed again.
 */
export function freezeBlock(t: TreeTuning = treeTuning) {
  const f = (v: number) => v.toFixed(2);
  const lines = [
    `this.group.position.set(${f(t.x)}, ${f(t.y)}, ${f(t.z)});`,
    `this.group.scale.set(${f(TREE_BASE_SCALE.x * t.scale)}, ${f(
      TREE_BASE_SCALE.y * t.scale,
    )}, ${f(TREE_BASE_SCALE.z * t.scale)});`,
  ];
  if (Math.abs(t.rotY) > 1e-4) {
    lines.splice(1, 0, `this.group.rotation.y = ${t.rotY.toFixed(3)};`);
  }
  return lines.join("\n");
}
