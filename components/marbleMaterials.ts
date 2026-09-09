import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * The marble, as two materials shared by every chunk of a figure: the
 * outer stone and the cut faces. One program and one set of uniforms
 * across all the draw calls, and a whole-figure fade is two writes.
 *
 * Nothing here marks the cuts. Glue seams along them were drawn for a
 * while (a hairline darkening from a per-vertex distance to the nearest
 * cut) and taken out again: the figure reads better as clean stone that
 * simply comes apart, and the seam pass cost ~110 ms on the frame the
 * chunks arrived.
 */

/** The outer stone. */
function makeSurfaceMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#f1f1eb",
    emissive: "#ffffff",
    emissiveIntensity: 0.02,
    metalness: 0,
    roughness: 0.88,
    side: THREE.FrontSide,
  });
}

/** The cut faces: a little greyer and duller than the polished outside. */
function makeInteriorMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#d8d8d0",
    emissive: "#ffffff",
    emissiveIntensity: 0.018,
    metalness: 0,
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
}

/**
 * One surface and one cut-face material for a figure, made once and
 * disposed when the figure leaves.
 */
export function useMarbleMaterials() {
  const materials = useMemo(
    () => ({ interior: makeInteriorMaterial(), surface: makeSurfaceMaterial() }),
    [],
  );
  // Disposed on the real unmount only, not whenever a dependency changes.
  // (React's development double-mount still runs this once against live
  // materials; three then rebuilds their program on the next draw, the
  // same as it does for the geometries disposed the same way.)
  const liveRef = useRef(materials);
  liveRef.current = materials;
  useEffect(() => {
    const live = liveRef.current;
    return () => {
      live.interior.dispose();
      live.surface.dispose();
    };
  }, []);

  return materials;
}
