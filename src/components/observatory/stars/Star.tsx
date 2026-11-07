"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
} from "three";

import {
  computeStarBodySize,
  computeStarBrightness,
  computeStarCoronaRadius,
  type Star as StarData,
  type StarId,
} from "@/universe";

import { applyBodyColor } from "../body-color";
import { DRAG_THRESHOLD_PX } from "../camera-controls";
import { SWELL_TIME_CONSTANT_S, easeDisplay } from "../display-ease";
import { useReducedMotion } from "../reduced-motion";
import { SYSTEM_VISUAL_SCALE } from "../scale";
import { SelectionRing } from "./SelectionRing";
import { createStarGlowMaterial } from "./StarGlowMaterial";

interface StarProps {
  readonly star: StarData;
  /**
   * The star's world-space position. Computed once by `Stars`
   * (`starPositionFromId`) and shared with the star's planets so both render
   * around the same point.
   */
  readonly position: readonly [number, number, number];
  /** The current time in ms, used to compute brightness decay. */
  readonly nowMs: number;
  /** Whether this star is the currently-selected one (a cool ring is drawn). */
  readonly selected: boolean;
  /** Reports a click on this star up to `page.tsx` (§12.6). */
  readonly onSelectStar: (id: StarId | null) => void;
}

/**
 * World-space gap between the star body's surface and the selection ring. Added
 * (not multiplied) so the ring sits a constant comfortable distance off any
 * body — a tiny ember and a mature star both get the same legible margin — and
 * the ring stays inside the innermost orbit line (radius 1.2 × 0.6 = 0.72).
 */
const SELECTION_RING_GAP = 0.12;

/**
 * The halo's luminous intensity for a given (brightness, corona radius). A dim
 * star has a dim halo; a star whose corona has expanded past base (cumulative
 * work invested) gets a luminosity bonus. Extracted from the former inline memo
 * so the swell ease can recompute it each frame from the *displayed* (eased)
 * brightness + corona — the same math, now allocation-free and shared with the
 * material's initial value.
 */
function haloIntensityFor(brightness: number, coronaRadius: number): number {
  const fromBrightness = brightness;
  const radiusBonus = Math.min(1, (coronaRadius - 1.0) / 1.5);
  return Math.min(1.0, fromBrightness * 0.6 + radiusBonus * 0.4);
}

/**
 * Render a single star — body (low-poly emissive icosahedron) + halo
 * (transparent radial glow on a billboard plane).
 *
 * All visual properties are derived from the locked universe math (PRD 1):
 * - Position: received as a prop (computed once by `Stars` and shared with
 *   this star's planets so the system renders around one point)
 * - Body size: aggregates cumulative planet `orbitsCompleted` via
 *   `computeStarBodySize`, scaled so the star dominates its system
 * - Brightness: from `computeStarBrightness` (max of planets, 0 if none)
 * - Color: from brightness via `bodyColorFromBrightness` (warm → cool)
 * - Halo radius: from `computeStarCoronaRadius` (log of cumulative Pomodoros)
 *
 * Stars with zero planets render dim and cool — a brand-new pursuit, dim
 * but visible. That visibility is intentional: existing is its own claim.
 *
 * The star carries a minimal `useFrame` (added by the growth-swell polish — it
 * was static through PRD 15): brightness/size/corona only, **no** axis-spin or
 * ambient motion, allocation-free. When a session on any of this star's planets
 * changes its aggregate (`computeStarBrightness` = max-of-planets;
 * `computeStarBodySize` / `computeStarCoronaRadius` = system aggregates), the
 * star's *displayed* values ease toward the new computed truth, so the star
 * blooms in step with the planet (display eases, truth is instant — §6.4 / §9.1).
 */
export function Star({
  star,
  position,
  nowMs,
  selected,
  onSelectStar,
}: StarProps) {
  // Reduced-motion signal (PRD 15), read once and gated per frame via the ref.
  const reducedRef = useReducedMotion();

  // Refs to the body + halo meshes so the swell `useFrame` can own their scale
  // (set there, not as a JSX prop, so a re-render can't clobber an in-progress
  // eased value — the clobber-free pattern the glide uses for group.position).
  const bodyMeshRef = useRef<Mesh>(null);
  const haloMeshRef = useRef<Mesh>(null);

  // Brightness is a function of (star, nowMs): the max of this star's planets'
  // brightness (computeStarBrightness). Re-computed when star/nowMs change — the
  // swell's brightness TARGET, eased toward (not applied instantly).
  const brightness = useMemo(
    () => computeStarBrightness(star, nowMs),
    [star, nowMs],
  );

  // Body size aggregates the cumulative orbitsCompleted across this star's
  // planets, scaled by STAR_BODY_SIZE_MULTIPLIER — the star is always visually
  // dominant over its system. A brand-new star (no planets, or all planets at
  // 0 orbits) has the smallest body. The swell's size TARGET.
  const bodySize = useMemo(() => computeStarBodySize(star), [star]);

  // Halo radius from corona math (log of cumulative completed Pomodoros). It
  // grows on EVERY completed session — unlike body size, which moves only when a
  // planet completes a whole orbit — so it is the star's most session-responsive
  // growth: the swell's corona TARGET, eased so the halo extent blooms in step.
  const haloRadius = useMemo(() => computeStarCoronaRadius(star), [star]);

  // Displayed brightness/size/corona for the growth SWELL — each initialized to
  // its current computed value (the memos above) so a freshly-loaded universe
  // renders correctly with NO bloom on mount; only a later target change (a
  // session on one of this star's planets shifts its aggregate) eases them. The
  // display eases toward the computed aggregate truth; the truth is instant.
  const displayedBrightness = useRef<number>(brightness);
  const displayedSize = useRef<number>(bodySize);
  const displayedCorona = useRef<number>(haloRadius);

  // Body geometry: low-poly icosahedron, reused. Detail 3 (1280 faces): the
  // star is now the largest body — its size aggregates the whole system — so it
  // needs more tessellation than the planets' detail-2 spheres to read as a
  // smooth disc at its dominant size. Allocating inside useMemo keeps the
  // allocation off the render path. (Cheap for V1's 1–10 stars.)
  const bodyGeometry = useMemo(() => new IcosahedronGeometry(1, 3), []);

  // Body material: emissive, created ONCE. Its emissive color + intensity are
  // the *displayed* brightness — seeded in the layout effect below and mutated in
  // place each frame by the swell ease — so a completion blooms the star over a
  // beat instead of recreating the material at the target (the old instant pop).
  // Dark base; emissive is what's seen.
  const bodyMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: new Color(0x000000), // dark base; emissive is what's seen
        emissive: new Color(), // seeded in the layout effect, eased in useFrame
        roughness: 0.4,
        metalness: 0.0,
      }),
    [],
  );

  // Halo: a flat plane (billboard). Reused single PlaneGeometry.
  const haloGeometry = useMemo(() => new PlaneGeometry(1, 1), []);

  // Halo material, created ONCE. Its uColor + uIntensity uniforms are seeded in
  // the layout effect and mutated in place each frame by the swell ease (the
  // material's contract: mutate the uniform values, never replace them).
  const haloMaterial = useMemo(() => createStarGlowMaterial(new Color(), 0), []);

  // Dispose imperatively-created GPU resources on unmount.
  useEffect(
    () => () => {
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
    },
    [bodyGeometry, bodyMaterial, haloGeometry, haloMaterial],
  );

  // Seed the initial appearance from the displayed refs (= the current computed
  // aggregates) before the first paint — no mount flash, no bloom on mount.
  // Reading refs in an effect is allowed (unlike during render); the swell
  // `useFrame` owns these imperatively thereafter (never as JSX props, so a
  // re-render can't clobber an in-progress eased value). This mirrors the first
  // frame of the swell loop with the values already at rest.
  useLayoutEffect(() => {
    const bodyMesh = bodyMeshRef.current;
    const haloMesh = haloMeshRef.current;
    if (!bodyMesh || !haloMesh) return;
    const dB = displayedBrightness.current;
    const bodyMat = bodyMesh.material as MeshStandardMaterial;
    applyBodyColor(bodyMat.emissive, dB);
    bodyMat.emissiveIntensity = 0.5 + dB * 0.5;
    bodyMesh.scale.setScalar(displayedSize.current * SYSTEM_VISUAL_SCALE);
    const haloMat = haloMesh.material as ShaderMaterial;
    const uColor = haloMat.uniforms.uColor;
    const uIntensity = haloMat.uniforms.uIntensity;
    if (uColor) applyBodyColor(uColor.value, dB);
    if (uIntensity) {
      uIntensity.value = haloIntensityFor(dB, displayedCorona.current);
    }
    haloMesh.scale.setScalar(displayedCorona.current * 2 * SYSTEM_VISUAL_SCALE);
  }, []);

  // The star's minimal swell loop — brightness/size/corona only (NO axis-spin or
  // ambient motion; the star body is otherwise static). Ease each displayed value
  // toward its computed aggregate target (snapping under reduced motion), then
  // apply in place: emissive color + intensity AND the halo color from the eased
  // brightness; the body scale from the eased size; the halo extent + its
  // radius-bonus intensity from the eased corona. ONE shared time constant, so
  // the whole star blooms as a single beat. Allocation-free (in-place mutation,
  // stack reads). A planet's session shifts these aggregates, so the star blooms
  // in step with the planet (honest aggregate — §9.1 / §6.4).
  useFrame((_, delta) => {
    const bodyMesh = bodyMeshRef.current;
    const haloMesh = haloMeshRef.current;
    if (!bodyMesh || !haloMesh) return;
    const reduced = reducedRef.current;
    // Reach the materials through the mesh refs (not the useMemo'd bindings) so
    // the per-frame mutation roots at a ref, exactly like mesh.scale/rotation.
    const bodyMat = bodyMesh.material as MeshStandardMaterial;
    const haloMat = haloMesh.material as ShaderMaterial;

    // Brightness → body emissive (color + intensity) + the halo's color.
    displayedBrightness.current = easeDisplay(
      displayedBrightness.current,
      brightness,
      delta,
      SWELL_TIME_CONSTANT_S,
      reduced,
    );
    const dB = displayedBrightness.current;
    applyBodyColor(bodyMat.emissive, dB);
    bodyMat.emissiveIntensity = 0.5 + dB * 0.5;

    // Size → body scale.
    displayedSize.current = easeDisplay(
      displayedSize.current,
      bodySize,
      delta,
      SWELL_TIME_CONSTANT_S,
      reduced,
    );
    bodyMesh.scale.setScalar(displayedSize.current * SYSTEM_VISUAL_SCALE);

    // Corona → halo extent + the halo intensity's radius bonus, eased in step so
    // the whole star blooms together (the corona grows on every session).
    displayedCorona.current = easeDisplay(
      displayedCorona.current,
      haloRadius,
      delta,
      SWELL_TIME_CONSTANT_S,
      reduced,
    );
    haloMesh.scale.setScalar(displayedCorona.current * 2 * SYSTEM_VISUAL_SCALE);

    // Halo uniforms are defined by createStarGlowMaterial; mutate the values in
    // place (guarded for the index-signature type — they always exist here).
    const uColor = haloMat.uniforms.uColor;
    const uIntensity = haloMat.uniforms.uIntensity;
    if (uColor) applyBodyColor(uColor.value, dB);
    if (uIntensity) {
      uIntensity.value = haloIntensityFor(dB, displayedCorona.current);
    }
  });

  // If this star unmounts while hovered, reset the pointer cursor so it can't
  // stick (onPointerOut wouldn't fire on an unmounted mesh).
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  return (
    <group position={position as unknown as [number, number, number]}>
      {/* Star body — emissive icosahedron. Its scale (the eased displayed size ×
          SYSTEM_VISUAL_SCALE — the rendering-layer system shrink) is set on the
          mesh in the swell `useFrame`, not as a JSX prop, so growth eases in and
          a re-render can't clobber it; the bodySize math value stays pure
          (observatory/scale.ts, §9.1).

          The first canvas interactivity (§12.6): clicking the body selects this
          star. stopPropagation so only the front-most star is selected and the
          click is not also seen as an empty-space "miss" (deselect). The cursor
          turns to a pointer on hover so it reads as clickable. */}
      <mesh
        ref={bodyMeshRef}
        geometry={bodyGeometry}
        material={bodyMaterial}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          // Drag-vs-click (PRD 13): R3F's `delta` is the pixels the pointer
          // traveled since pointerdown. Past the threshold this click was a
          // camera pan, not a selection — ignore it so a drag never selects.
          if (e.delta > DRAG_THRESHOLD_PX) return;
          e.stopPropagation();
          onSelectStar(star.id);
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      />
      {/* Halo — billboarded plane with radial glow. Its scale (the eased
          displayed corona × 2 × SYSTEM_VISUAL_SCALE — ×2 because the plane spans
          -0.5..0.5 in UV space) is set on the mesh in the swell `useFrame` so the
          halo extent eases in step with the body. The scale was always applied
          at the mesh (never inside the haloRadius memo, which also feeds
          haloIntensity's radiusBonus — scaling that would dim, not shrink); now
          it rides the eased corona there. renderOrder behind the body, in front
          of the background gradient (-1000). */}
      <mesh
        ref={haloMeshRef}
        geometry={haloGeometry}
        material={haloMaterial}
        renderOrder={-10}
      />
      {/* Selection indicator — a quiet cool ring around the body when selected.
          A constant gap past the body surface; cool + subordinate + honest (it
          never warms the star). Sized from the TARGET body size (not the eased
          one): on the rare every-4th-session size bump the body eases up to meet
          the ring — a tiny, transient, selection-only mismatch (the ring shows
          where the body is heading). See SelectionRing + §12.6. */}
      {selected && (
        <SelectionRing
          radius={bodySize * SYSTEM_VISUAL_SCALE + SELECTION_RING_GAP}
        />
      )}
    </group>
  );
}
