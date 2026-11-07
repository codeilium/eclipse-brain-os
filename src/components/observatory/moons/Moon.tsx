"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { IcosahedronGeometry, Mesh, MeshStandardMaterial } from "three";

import { duration, toSeconds } from "@/design/tokens";
import {
  computeBrightness,
  computeSize,
  type Moon as MoonData,
} from "@/universe";

import { applyBodyColor } from "../body-color";
import { SWELL_TIME_CONSTANT_S, easeDisplay } from "../display-ease";
import { ambientPhase } from "../motion";
import { easeAngle, forwardTarget, progressToAngle } from "../orbit-animation";
import { useReducedMotion } from "../reduced-motion";
import { SYSTEM_VISUAL_SCALE } from "../scale";
import { MOON_SIZE_SCALE } from "./position";

interface MoonProps {
  readonly moon: MoonData;
  /**
   * Orbital radius around the parent planet's center, ALREADY scaled by
   * SYSTEM_VISUAL_SCALE (computed in `Moons.tsx`). The moon sits at this radius
   * in its parent planet's LOCAL frame — the planet's transform group carries
   * the moon along as the planet glides (r3f-conventions.md §9.1 nested motion).
   */
  readonly radius: number;
  /** The current time in ms, used to compute brightness decay. */
  readonly nowMs: number;
}

/**
 * The glide easing time constant (seconds), sourced from `duration.base` — the
 * same token the planet glide uses (§6.3). Identical reuse, not a moon-specific
 * value: a moon advanced by the cascade glides exactly as a planet does.
 */
const GLIDE_TIME_CONSTANT_S = toSeconds(duration.base);

/** Ambient axis-spin speed — identical to the planet treatment (no bespoke moon motion). */
const AXIS_SPIN_SPEED = 0.5;

/**
 * Render a single moon — the fourth and final body type. A small low-poly
 * *reflective* body (like a planet), lit by the scene, with NO emissive and NO
 * halo: stars emit, planets and moons reflect (the warm/cool encoding holds at
 * every grain). Its color comes from its own brightness via the shared
 * `bodyColorFromBrightness`.
 *
 * NESTED ORBITAL MOTION (the one new rendering wrinkle, §9.1). A moon orbits its
 * parent *planet*, which is itself orbiting and gliding around its star. This
 * component renders INSIDE the planet's transform group (see `planets/Planet.tsx`
 * + `Moons.tsx`), so the planet's live position carries the moon for free — the
 * moon computes only its OWN local orbital position around the group origin (the
 * planet center), exactly as a planet computes its position around its star, but
 * in the planet's local frame.
 *
 * Two motions, mirroring a planet (§6.3):
 * 1. **Glide (one-shot transition).** The orbital angle is always
 *    `currentOrbitProgress × 2π` — an earned position, a readout of the cascade
 *    advances (+0.05 per parent Pomodoro), never a free-running timer orbit.
 *    `displayedAngle` is initialized to the earned angle → NO glide on mount;
 *    only a real progress change eases it forward (reusing `orbit-animation.ts`).
 * 2. **Axis-spin (ambient).** A slow constant Y-rotation from the shared clock.
 *
 * §9.1 discipline: `useMemo` geometry/material, dispose-on-unmount, no per-frame
 * allocations.
 */
export function Moon({ moon, radius, nowMs }: MoonProps) {
  const meshRef = useRef<Mesh>(null);

  // Reduced-motion signal (PRD 15), read once and gated per frame via the ref.
  const reducedRef = useReducedMotion();

  // Total elapsed ms (accumulated from `delta`), driving the ambient axis-spin.
  const elapsed = useRef(0);

  // The displayed orbital angle, initialized to the *earned* angle so the first
  // render is at the correct resting position — no glide on mount, only on a
  // later cascade-driven `currentOrbitProgress` change.
  const displayedAngle = useRef(
    progressToAngle(moon.orbit.currentOrbitProgress),
  );

  // The displayed orbital RADIUS (PRD 23). Initialized to the current target
  // shell → no breathe on mount; eased toward the `radius` prop each frame
  // (snapping under reduced motion) so the moon glides outward when its planet
  // grows and re-packs the moon shells, composed with the angle glide.
  const displayedRadius = useRef(radius);

  // Displayed brightness + size for the growth SWELL (the session-completion
  // polish), each initialized to its current computed value — no swell on mount,
  // only on a later target change. In V1 a moon's targets rarely move on a parent
  // session (the cascade nudges only its orbit, +0.05 — its brightness clock and
  // its size, log of integer orbits, are untouched), so this ease is honest but
  // mostly dormant for moons; the glide is what visibly moves. It still mirrors
  // the planet exactly (display eases toward computed truth, §6.4 / §9.1).
  const displayedBrightness = useRef<number>(
    computeBrightness(moon.lastSessionAt, moon.createdAt, nowMs),
  );
  const displayedSize = useRef<number>(
    computeSize(moon.orbit.orbitsCompleted),
  );

  // Body size from the locked growth math (logarithmic in completed orbits) —
  // the swell's size TARGET (eased toward, never applied instantly).
  const bodySize = useMemo(
    () => computeSize(moon.orbit.orbitsCompleted),
    [moon.orbit.orbitsCompleted],
  );

  // Brightness from the locked decay math (lastSessionAt, falling back to
  // createdAt) — the SAME path a planet uses. A fresh moon (lastSessionAt null)
  // decays from createdAt ≈ now → ~1.0 → warm, but it never feeds any
  // planet/star aggregate (those are derived from planets only, math.ts). The
  // swell's brightness TARGET (eased toward, applied via the material color).
  const brightness = useMemo(
    () => computeBrightness(moon.lastSessionAt, moon.createdAt, nowMs),
    [moon, nowMs],
  );

  // Geometry: a small low-poly icosahedron (detail 1 = 80 faces) — proportionate
  // to a subordinate body and cheaper than the planet's detail-2.
  const geometry = useMemo(() => new IcosahedronGeometry(1, 1), []);

  // Material: reflective MeshStandardMaterial WITHOUT emissive (mirrors a planet)
  // — the moon reflects the scene's lights; its base color carries the meaning.
  // Created ONCE; its color is seeded from the displayed brightness in the layout
  // effect below and mutated in place each frame by the swell ease (no per-change
  // material recreation — the old pop).
  const material = useMemo(
    () => new MeshStandardMaterial({ roughness: 0.6, metalness: 0.0 }),
    [],
  );

  // Dispose imperatively-created GPU resources on unmount.
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // Seed the initial color + scale from the displayed refs before the first paint
  // (no mount flash, no bloom on mount; reading refs in an effect is allowed).
  // `useFrame` owns color + scale thereafter (applied imperatively, not as JSX
  // props, so a re-render can't clobber an in-progress eased value).
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    applyBodyColor(
      (mesh.material as MeshStandardMaterial).color,
      displayedBrightness.current,
    );
    mesh.scale.setScalar(
      displayedSize.current * MOON_SIZE_SCALE * SYSTEM_VISUAL_SCALE,
    );
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    elapsed.current += delta * 1000;

    // --- Glide: ease the displayed angle toward the earned target (forward arc,
    //     incl. the 1.0→0.0 wrap). Allocation-free. Under reduced motion (PRD 15)
    //     it snaps to the earned target — the cascade advance still happens (the
    //     universe stays honest), only its animation quiets. ---
    const target = forwardTarget(
      displayedAngle.current,
      moon.orbit.currentOrbitProgress,
    );
    displayedAngle.current = reducedRef.current
      ? target
      : easeAngle(displayedAngle.current, target, delta, GLIDE_TIME_CONSTANT_S);

    // --- Radius breathe (PRD 23): ease the orbital radius toward its clearance
    //     shell. When the parent planet grows, the moon shells re-pack and the
    //     moon glides outward — composed with the angle glide. easeDisplay folds
    //     in the reduced-motion snap; one shared swell time constant. ---
    displayedRadius.current = easeDisplay(
      displayedRadius.current,
      radius,
      delta,
      SWELL_TIME_CONSTANT_S,
      reducedRef.current,
    );

    // Position is LOCAL to the parent planet's group (origin = planet center),
    // in the same XY plane as the planet's own orbit (z = 0). The group's live
    // world position (the planet's glide) carries this offset along for free.
    // Composes the eased angle with the eased radius: (cos, sin) × r.
    const angle = displayedAngle.current;
    const r = displayedRadius.current;
    mesh.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0);

    // --- Axis-spin: subtle constant rotation on the moon's own Y-axis, from the
    //     shared ambient clock. NOT orbital position. Holds still under reduced
    //     motion (continuous autonomous motion — PRD 15). ---
    if (!reducedRef.current) {
      mesh.rotation.y = ambientPhase(elapsed.current, AXIS_SPIN_SPEED);
    }

    // --- Growth swell: ease displayed brightness + size toward the computed
    //     targets, then apply in place — color via applyBodyColor, scale on the
    //     mesh (one shared time constant). Snaps under reduced motion (§6.4).
    //     Allocation-free. (Mostly dormant for moons in V1 — see the refs above.)
    //     The material is reached through the mesh ref (not the useMemo binding)
    //     so the per-frame mutation roots at a ref. ---
    const mat = mesh.material as MeshStandardMaterial;
    displayedBrightness.current = easeDisplay(
      displayedBrightness.current,
      brightness,
      delta,
      SWELL_TIME_CONSTANT_S,
      reducedRef.current,
    );
    applyBodyColor(mat.color, displayedBrightness.current);

    displayedSize.current = easeDisplay(
      displayedSize.current,
      bodySize,
      delta,
      SWELL_TIME_CONSTANT_S,
      reducedRef.current,
    );
    mesh.scale.setScalar(
      displayedSize.current * MOON_SIZE_SCALE * SYSTEM_VISUAL_SCALE,
    );
  });

  // Body scale = the EASED displayed size × MOON_SIZE_SCALE (subordinate to the
  // planet) × SYSTEM_VISUAL_SCALE, applied on the mesh in `useFrame` (not a JSX
  // prop) so growth eases instead of popping. The math values (computeSize) stay
  // pure, scaled at the render boundary (§9.1).
  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}
