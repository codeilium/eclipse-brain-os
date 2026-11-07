"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Mesh, PlaneGeometry, ShaderMaterial } from "three";

import type { Galaxy } from "@/universe";

import { DRAG_THRESHOLD_PX } from "../camera-controls";
import { SWELL_TIME_CONSTANT_S, easeDisplay } from "../display-ease";
import { ambientPhase } from "../motion";
import { useReducedMotion } from "../reduced-motion";
import { SYSTEM_VISUAL_SCALE } from "../scale";
import { accretionIntensity, galaxyFocusedMinutes } from "./accretion";
import {
  BLACKHOLE_MAX_RADIUS,
  createBlackHoleMaterial,
} from "./BlackHoleMaterial";

interface BlackHoleProps {
  /**
   * The galaxy whose center this is. The black hole maps 1:1 to this real
   * `@/universe` entity (honest-universe, §2) — one galaxy, one heart — and
   * reads it purely: its accretion presence derives from the galaxy's total
   * persisted focus. Per-galaxy-shaped so PRD 27 (multi-galaxy) just mounts
   * one per rendered galaxy.
   */
  readonly galaxy: Galaxy;
  /**
   * Reports a click on the center up to `page.tsx` (PRD 28 — the mind's first
   * door; the `onSelectStar` channel's sibling, §12.6). Drag-guarded: a camera
   * pan that ends over the center never opens the panel.
   */
  readonly onSelectCenter: () => void;
}

/**
 * Speed multiplier for the accretion ring's ambient spin, on the shared 48s
 * drift clock (§6.1 — never a bespoke clock): 0.25 → one revolution ≈ 3.2
 * minutes. Statelier than the planets' axis-spin (0.5) — gravity, not a
 * pinwheel. A by-eye craft constant; Codeilium nudges it live.
 */
const BLACKHOLE_SPIN_SPEED = 0.25;

/**
 * The black hole at the galaxy's center (PRD 26) — a dark core wearing a cool
 * accretion ring whose presence is the galaxy's accumulated focus, rendered as
 * ONE plane at the origin (z = 0, where reset-view lands — returning to the
 * heart). One draw call; the zones live in the shader (BlackHoleMaterial).
 *
 * - **Presence is earned, and eases at the commit beat.** The target intensity
 *   is `accretionIntensity(galaxyFocusedMinutes(galaxy))` — pure reads of the
 *   persisted record. Sessions are the sole source of `durationMs`, so the
 *   target changes only when a session commits; the displayed intensity eases
 *   toward it through the shared `easeDisplay` + `SWELL_TIME_CONSTANT_S`
 *   (the same beat as the growth swell, §6.5), snapping under reduced motion
 *   (§6.4 — choreography, never truth), resting once settled. Initialized to
 *   the current target: no bloom on mount.
 * - **The spin is choreography, gated.** The streaked ring rotates slowly on
 *   the shared ambient clock; under reduced motion it holds still (the
 *   axis-spin rule, §6.4) while the presence still applies in full.
 * - **The center is clickable (PRD 28 — superseding PRD 26's raycast
 *   transparency, deliberately).** The VISIBLE mesh keeps its no-op `raycast`
 *   and zero handlers — its visuals and math are untouched. Interaction lives
 *   on a separate INVISIBLE hit disc spanning the ring's full reach
 *   (`BLACKHOLE_MAX_RADIUS` — the visual core is small, so clicking *near*
 *   the heart counts), with the Star.tsx drag-guard: past `DRAG_THRESHOLD_PX`
 *   a click was a pan, not an opening. Empty-space clicks AWAY from the disc
 *   remain misses → deselect, byte-identical (§12.6 elsewhere untouched).
 * - **Cool register only** — the strict inversion of warm-=-earned; see
 *   BlackHoleMaterial. Never a warm token.
 *
 * Layering: renderOrder −20 — above the background gradient (−1000), behind
 * the star halos (−10), orbit lines (−5), and bodies (0). A star CAN seed near
 * the origin and crowd the center (the accepted PRD 26 edge — seeding inner
 * exclusion is a named backlog PRD); it simply draws over the ring.
 *
 * Allocation-free per frame; geometry + material disposed on unmount (§9.1).
 */
export function BlackHole({ galaxy, onSelectCenter }: BlackHoleProps) {
  // Reduced-motion signal (PRD 15), read once and gated per frame via the ref.
  const reducedRef = useReducedMotion();

  const meshRef = useRef<Mesh>(null);

  // Total elapsed ms (accumulated from `delta`), driving the ambient spin.
  const elapsed = useRef(0);

  // The presence TARGET — recomputed only when the galaxy changes (a commit
  // appends a session and produces a new galaxy object). Pure reads; the
  // record is never touched.
  const intensity = useMemo(
    () => accretionIntensity(galaxyFocusedMinutes(galaxy)),
    [galaxy],
  );

  // The displayed presence, eased toward the target. Initialized to the
  // current computed value so a page load renders the earned state with NO
  // bloom on mount (the displayed-eases-toward-computed pattern, §6.5/§9.1).
  const displayedIntensity = useRef<number>(intensity);

  // Plane geometry (reused): spans -0.5..0.5, scaled below to the ring's max
  // reach — the extent within which the shader draws core, rim, and ring.
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);

  // Material created ONCE; its uIntensity uniform is seeded in the layout
  // effect and mutated in place each frame (never replaced).
  const material = useMemo(() => createBlackHoleMaterial(0), []);

  // The mesh's (static) world size: the plane spans 2 × the max ring reach,
  // scaled at the render boundary like every body (scale.ts, §9.1). Presence
  // EXTENT changes happen in-shader (uIntensity), never by rescaling the mesh.
  const planeScale = BLACKHOLE_MAX_RADIUS * 2 * SYSTEM_VISUAL_SCALE;

  // Dispose imperatively-created GPU resources on unmount.
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // If the hit disc unmounts while hovered, reset the pointer cursor so it
  // can't stick (the Star.tsx pattern — onPointerOut wouldn't fire then).
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  // Seed the displayed presence before first paint (the Star.tsx pattern):
  // reading refs in an effect is allowed, and the useFrame below owns the
  // uniform imperatively thereafter — a re-render can't clobber an in-progress
  // eased value.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as ShaderMaterial;
    const uIntensity = mat.uniforms.uIntensity;
    if (uIntensity) uIntensity.value = displayedIntensity.current;
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    elapsed.current += delta * 1000;

    // --- Presence (truth): ease the displayed intensity toward the earned
    //     target; snaps under reduced motion — the change always shows. ---
    displayedIntensity.current = easeDisplay(
      displayedIntensity.current,
      intensity,
      delta,
      SWELL_TIME_CONSTANT_S,
      reducedRef.current,
    );
    const mat = mesh.material as ShaderMaterial;
    const uIntensity = mat.uniforms.uIntensity;
    if (uIntensity) uIntensity.value = displayedIntensity.current;

    // --- Spin (choreography): the streaked ring's slow ambient rotation on
    //     the shared clock. Continuous autonomous motion → holds still under
    //     reduced motion (the axis-spin rule, §6.4). The core/rim are radially
    //     symmetric, so only the streaks visibly travel. ---
    if (!reducedRef.current) {
      mesh.rotation.z = ambientPhase(elapsed.current, BLACKHOLE_SPIN_SPEED);
    }
  });

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        position={[0, 0, 0]}
        scale={[planeScale, planeScale, 1]}
        renderOrder={-20}
        // The VISIBLE mesh stays raycast-transparent (PRD 26, preserved): its
        // no-op raycast + zero handlers mean the visual plane itself is
        // scenery. Interaction lives on the invisible hit disc below (PRD 28).
        raycast={() => null}
      />
      {/* The mind's door (PRD 28): a generous INVISIBLE hit disc — the ring's
          full reach, so clicking near the heart counts even when the core is
          a small dark hint. `visible: false` skips rendering entirely (zero
          pixels, zero draw) while three.js raycasting still hit-tests it, so
          the R3F click path works. Drag-guarded like Star.tsx: a pan that
          ends here never opens the panel. stopPropagation so the click is not
          ALSO an empty-canvas miss (deselect) — clicks away from the disc are
          untouched. A star seeded near the origin can overlap this disc (the
          accepted PRD 26 seeding edge): R3F resolves by nearest intersection,
          and whichever wins is acceptable. */}
      <mesh
        visible={false}
        position={[0, 0, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.delta > DRAG_THRESHOLD_PX) return;
          e.stopPropagation();
          onSelectCenter();
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <circleGeometry args={[BLACKHOLE_MAX_RADIUS * SYSTEM_VISUAL_SCALE, 24]} />
        <meshBasicMaterial />
      </mesh>
    </>
  );
}
