"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
  type RefObject,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import * as THREE from "three";

import {
  buildSolidThinkerChunks,
  loadThinkerGeometry,
} from "@/components/thinkerFragments";

gsap.registerPlugin(ScrollTrigger);

/**
 * The Thinker, ported from kevinsworks: the figure is cut into 25 solid
 * chunks that drift apart as the page scrolls, drag-rotatable, on a black
 * stage with one hard key. Here it lives inside the home page's panel
 * (the box that grows over the tree scene), and its scroll progress comes
 * from a spacer element the page provides rather than its own sticky
 * section. The progress runs: 0 -> 0.3 the whole stage zooms out from
 * 130% to 100% (the figure arrives too close and settles); 0.35 -> 0.98
 * the breakup, as in the original.
 *
 * Model: "The Thinker by Auguste Rodin" by Rigsters (Sketchfab), CC-BY-4.0 —
 * see public/model/thinker/license.txt. Geometry only; the textures are
 * not used.
 */

type ProgressRef = MutableRefObject<{ value: number }>;
type DragRotation = {
  active: boolean;
  lastX: number;
  lastY: number;
  pitch: number;
  pointerId: number | null;
  targetPitch: number;
  targetYaw: number;
  yaw: number;
};
type DragRotationRef = MutableRefObject<DragRotation>;

const THINKER_BASE_YAW = Math.PI / 3;
// The arrival zoom: 130% -> 100% over the first stretch of the scroll.
const ZOOM_START = 1.3;
const ZOOM_END_AT = 0.3;
const HOLD_END = 0.35;
const BREAK_END = 0.98;
const STAGE_BLACK = "#0a0a0a";

function smoothPhase(start: number, end: number, value: number) {
  const x = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return prefersReducedMotion;
}

// Scroll progress 0..1 across the trigger element: from its top entering
// the bottom of the viewport (it follows the page's own scroll section, so
// there is no dead zone) to its bottom reaching the bottom.
function useThinkerScrollProgress({
  progressRef,
  reducedMotion,
  triggerRef,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
  triggerRef: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return undefined;
    progressRef.current.value = 0;
    if (reducedMotion) return undefined;
    const tween = gsap.to(progressRef.current, {
      ease: "none",
      scrollTrigger: {
        end: "bottom bottom",
        scrub: 1.08,
        start: "top bottom",
        trigger,
      },
      value: 1,
    });
    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 250);
    return () => {
      window.clearTimeout(refresh);
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [progressRef, reducedMotion, triggerRef]);
}

function useThinkerGeometry() {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    let active = true;
    let loaded: THREE.BufferGeometry | null = null;
    loadThinkerGeometry()
      .then((next) => {
        loaded = next;
        if (active) {
          setGeometry(next);
          ScrollTrigger.refresh();
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to load thinker model.", error);
      });
    return () => {
      active = false;
      loaded?.dispose();
    };
  }, []);
  return geometry;
}

function CameraRig({
  progressRef,
  reducedMotion,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
}) {
  const { camera, size } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(0, 0.02, 0), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const progress = reducedMotion ? 0 : progressRef.current.value;
    const breakup = smoothPhase(HOLD_END, BREAK_END, progress);
    const compact = size.width < 720;
    target.set(
      compact ? 0.16 - breakup * 0.12 : 0.46 - breakup * 0.22,
      compact ? 0.12 : 0.24 + breakup * 0.08,
      compact ? 6.9 : 5.95 - breakup * 0.14,
    );
    if (!reducedMotion) target.x += Math.sin(clock.elapsedTime * 0.18) * 0.028;
    camera.position.lerp(target, 0.08);
    camera.lookAt(lookAt);
  });
  return null;
}

function StageLights({
  progressRef,
  reducedMotion,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
}) {
  const keyLightRef = useRef<THREE.SpotLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);

  useFrame(({ clock }) => {
    const progress = reducedMotion ? 0 : progressRef.current.value;
    const breakup = smoothPhase(HOLD_END, BREAK_END, progress);
    const pulse = reducedMotion
      ? 0
      : Math.sin(clock.elapsedTime * 0.28 + breakup * 2.1) * 0.6;
    if (keyLightRef.current) {
      keyLightRef.current.position.x = -3.4 + breakup * 1.4;
      keyLightRef.current.intensity = 15.5 + breakup * 5.5 + pulse;
    }
    if (rimLightRef.current) {
      rimLightRef.current.intensity = 3.2 + breakup * 2.8;
    }
  });

  return (
    <>
      <ambientLight intensity={0.035} />
      <spotLight
        ref={keyLightRef}
        angle={0.34}
        castShadow
        color="#ffffff"
        decay={1.05}
        distance={9}
        intensity={15.5}
        penumbra={0.06}
        position={[-3.4, 3.2, 2.8]}
        shadow-bias={-0.0005}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <spotLight
        angle={0.24}
        color="#f4f5ff"
        decay={1.2}
        distance={8}
        intensity={5}
        penumbra={0.05}
        position={[3.2, 2.1, -1.5]}
      />
      <directionalLight
        ref={rimLightRef}
        color="#ffffff"
        intensity={3.2}
        position={[2.7, 1.8, -3.8]}
      />
      <pointLight color="#ffffff" intensity={1.65} position={[-1.45, -1.05, 2.4]} />
    </>
  );
}

function ChunkedThinker({
  dragRotationRef,
  progressRef,
  reducedMotion,
  sourceGeometry,
}: {
  dragRotationRef: DragRotationRef;
  progressRef: ProgressRef;
  reducedMotion: boolean;
  sourceGeometry: THREE.BufferGeometry;
}) {
  const stageRef = useRef<THREE.Group>(null);
  const chunkRefs = useRef<Array<THREE.Group | null>>([]);
  const chunks = useMemo(
    () =>
      buildSolidThinkerChunks(sourceGeometry, {
        chunkCount: 25,
        seed: 211,
        spread: 1.95,
      }),
    [sourceGeometry],
  );

  useEffect(() => {
    return () => {
      for (const chunk of chunks) {
        chunk.interiorGeometry.dispose();
        chunk.surfaceGeometry.dispose();
      }
    };
  }, [chunks]);

  useFrame(({ clock, size }) => {
    const progress = reducedMotion ? 0 : progressRef.current.value;
    const breakup = reducedMotion ? 0 : smoothPhase(HOLD_END, BREAK_END, progress);
    const settle = reducedMotion ? 0 : smoothPhase(BREAK_END, 1, progress);
    // Arrival: the whole stage starts at 130% and eases out to 100%.
    const zoom = reducedMotion
      ? 1
      : THREE.MathUtils.lerp(ZOOM_START, 1, smoothPhase(0, ZOOM_END_AT, progress));

    chunks.forEach((chunk, index) => {
      const group = chunkRefs.current[index];
      if (!group) return;
      const localProgress = THREE.MathUtils.clamp(
        (breakup - chunk.releaseAt) / Math.max(1 - chunk.releaseAt, 0.24),
        0,
        1,
      );
      const travel = smoothPhase(0, 1, localProgress) * (1 + settle * 0.12);
      const breathing =
        Math.sin(clock.elapsedTime * 0.22 + index * 0.63) * 0.012 * travel;
      group.position.copy(chunk.center).addScaledVector(chunk.offset, travel);
      group.position.y += breathing;
      group.rotation.set(
        chunk.spin.x * travel,
        chunk.spin.y * travel,
        chunk.spin.z * travel,
      );
      group.scale.setScalar(THREE.MathUtils.lerp(1, chunk.scale, travel));
    });

    if (stageRef.current) {
      const compact = size.width < 720;
      const stageScale = (compact ? 0.92 : 1) * zoom;
      const drag = dragRotationRef.current;
      drag.yaw = THREE.MathUtils.lerp(drag.yaw, drag.targetYaw, drag.active ? 0.32 : 0.12);
      drag.pitch = THREE.MathUtils.lerp(
        drag.pitch,
        drag.targetPitch,
        drag.active ? 0.32 : 0.12,
      );
      stageRef.current.scale.setScalar(stageScale);
      stageRef.current.position.set(compact ? -0.03 : 0.02, -0.08, 0);
      stageRef.current.rotation.set(
        -0.1 + breakup * 0.04 + drag.pitch,
        THINKER_BASE_YAW - breakup * 0.035 + drag.yaw,
        0.012,
      );
    }
  });

  return (
    <group
      ref={stageRef}
      position={[0.02, -0.08, 0]}
      rotation={[-0.1, THINKER_BASE_YAW, 0.012]}
    >
      {chunks.map((chunk, index) => (
        <group
          key={`${index}-${chunk.releaseAt.toFixed(3)}`}
          ref={(node) => {
            chunkRefs.current[index] = node;
          }}
          position={chunk.center}
        >
          <mesh castShadow frustumCulled={false} geometry={chunk.surfaceGeometry}>
            <meshStandardMaterial
              color="#f1f1eb"
              emissive="#ffffff"
              emissiveIntensity={0.02}
              metalness={0}
              roughness={0.88}
              side={THREE.FrontSide}
            />
          </mesh>
          <mesh frustumCulled={false} geometry={chunk.interiorGeometry}>
            <meshStandardMaterial
              color="#d8d8d0"
              emissive="#ffffff"
              emissiveIntensity={0.018}
              metalness={0}
              roughness={0.94}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function StageFloor() {
  return (
    <mesh position={[0, -1.61, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[13, 13]} />
      <shadowMaterial color="#000000" opacity={0.82} />
    </mesh>
  );
}

function ThinkerCanvas({
  active,
  dragRotationRef,
  progressRef,
  reducedMotion,
}: {
  active: boolean;
  dragRotationRef: DragRotationRef;
  progressRef: ProgressRef;
  reducedMotion: boolean;
}) {
  const geometry = useThinkerGeometry();
  return (
    <Canvas
      camera={{ far: 100, fov: 34, near: 0.1, position: [0.46, 0.24, 5.95] }}
      dpr={[1, 1.75]}
      // Frozen while the panel is closed: no point drawing behind the tree.
      frameloop={active ? "always" : "never"}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.38;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
      shadows
      style={{ height: "100%", width: "100%" }}
    >
      <color args={[STAGE_BLACK]} attach="background" />
      <fog args={[STAGE_BLACK, 5.1, 9.2]} attach="fog" />
      <CameraRig progressRef={progressRef} reducedMotion={reducedMotion} />
      <StageLights progressRef={progressRef} reducedMotion={reducedMotion} />
      <StageFloor />
      {geometry ? (
        <ChunkedThinker
          dragRotationRef={dragRotationRef}
          progressRef={progressRef}
          reducedMotion={reducedMotion}
          sourceGeometry={geometry}
        />
      ) : null}
    </Canvas>
  );
}

export default function ThinkerStage({
  active,
  triggerRef,
}: {
  /** Whether the panel holding the stage is open enough to be seen. */
  active: boolean;
  /** The scroll spacer whose extent drives the stage's progress. */
  triggerRef: RefObject<HTMLElement | null>;
}) {
  const progressRef = useRef({ value: 0 });
  const dragRotationRef = useRef<DragRotation>({
    active: false,
    lastX: 0,
    lastY: 0,
    pitch: 0,
    pointerId: null,
    targetPitch: 0,
    targetYaw: 0,
    yaw: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRotationRef.current;
    if (drag.pointerId !== event.pointerId) return;
    drag.active = false;
    drag.pointerId = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const drag = dragRotationRef.current;
    drag.active = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.pointerId = event.pointerId;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRotationRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.lastX;
    const deltaY = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.targetYaw = THREE.MathUtils.clamp(
      drag.targetYaw + deltaX * 0.006,
      -Math.PI * 0.72,
      Math.PI * 0.72,
    );
    drag.targetPitch = THREE.MathUtils.clamp(
      drag.targetPitch + deltaY * 0.004,
      -0.42,
      0.32,
    );
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const drag = dragRotationRef.current;
    const yawStep = Math.PI * 0.08;
    const pitchStep = 0.08;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      drag.targetYaw = THREE.MathUtils.clamp(
        drag.targetYaw + (event.key === "ArrowLeft" ? -yawStep : yawStep),
        -Math.PI * 0.72,
        Math.PI * 0.72,
      );
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      drag.targetPitch = THREE.MathUtils.clamp(
        drag.targetPitch + (event.key === "ArrowUp" ? -pitchStep : pitchStep),
        -0.42,
        0.32,
      );
      event.preventDefault();
    }
  };

  useThinkerScrollProgress({ progressRef, reducedMotion, triggerRef });

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: STAGE_BLACK }}>
      <div
        aria-label="Drag or use arrow keys to rotate The Thinker"
        className={`absolute inset-0 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onKeyDown={handleKeyDown}
        onPointerCancel={stopDragging}
        onPointerDown={handlePointerDown}
        onPointerLeave={(event) => {
          if (dragRotationRef.current.active) stopDragging(event);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        role="application"
        style={{ pointerEvents: active ? "auto" : "none", touchAction: "none" }}
        tabIndex={active ? 0 : -1}
      >
        <ThinkerCanvas
          active={active}
          dragRotationRef={dragRotationRef}
          progressRef={progressRef}
          reducedMotion={reducedMotion}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_0%,rgba(0,0,0,0.12)_42%,rgba(0,0,0,0.92)_100%)]" />
    </div>
  );
}
