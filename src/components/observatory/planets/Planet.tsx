"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, IcosahedronGeometry, Mesh, MeshStandardMaterial } from "three";

import { duration, toSeconds } from "@/design/tokens";
import {
  computeBrightness,
  computeSize,
  type Planet as PlanetData,
} from "@/universe";

import { applyBodyColor } from "../body-color";
import { SWELL_TIME_CONSTANT_S, easeDisplay } from "../display-ease";
import { Moons } from "../moons";
import { ambientPhase } from "../motion";
import { easeAngle, forwardTarget, progressToAngle } from "../orbit-animation";
import { useReducedMotion } from "../reduced-motion";
import { SYSTEM_VISUAL_SCALE } from "../scale";

interface PlanetProps {
  readonly planet: PlanetData;
  /** Parent star center (world space). The planet orbits around this point. */
  readonly parentPosition: readonly [number, number, number];
  /**
   * The planet's TARGET orbital radius (clearance shell from `computeSystemLayout`,
   * already scaled by SYSTEM_VISUAL_SCALE). The displayed radius EASES toward it
   * (PRD 23 — the system breathes outward as bodies grow), composed with the
   * angle glide; snaps under reduced motion. At rest the planet sits here.
   */
  readonly radius: number;
  /**
   * This planet's moons' UNSCALED orbital shells (from the system layout),
   * forwarded to `<Moons>` which scales them at its own render boundary (PRD 23).
   */
  readonly moonShells: readonly number[];
  /** The current time in ms, used to compute brightness decay. */
  readonly nowMs: number;
}

/**
 * The glide easing time constant, in seconds. Sourced from the `duration.base`
 * token (400ms) rather than hardcoded — convention §6 keeps all motion timing
 * in `duration.*`, and the glide is a *transition* keyed to it (§6.3). A calm
 * but brisk advance: the planet visibly settles into its new earned position in
 * ~1.2–1.5s.
 */
const GLIDE_TIME_CONSTANT_S = toSeconds(duration.base);

/**
 * Speed multiplier for the ambient axis-spin (a fraction of the shared 48s
 * drift clock → ~96s per rotation). Slow and calm — a liveness cue, never a
 * claim of orbital progress.
 */
const AXIS_SPIN_SPEED = 0.5;

/**
 * Render a single planet — a low-poly *reflective* (non-emissive) body that
 * lives on its orbital ring around the parent star.
 *
 * Two independent motions (r3f-conventions.md §6.3):
 *
 * 1. **Glide (a one-shot transition).** The planet's orbital *angle* is always
 *    `currentOrbitProgress × 2π` — an earned position, a readout of real work,
 *    NOT a free-running timer orbit. When `currentOrbitProgress` changes (a
 *    Pomodoro completes — PRD 11), the displayed angle eases *forward* along the
 *    arc to the new earned angle (never backward, and forward through the
 *    1.0→0.0 wrap) over ~1.5s. When progress is unchanged the planet rests at
 *    its earned position. The position is computed here each frame from
 *    `parentPosition + (cos, sin) × radius`.
 *
 * 2. **Axis-spin (ambient).** A slow constant rotation about the planet's own
 *    Y-axis, driven by the shared `motion.ts` ambient clock. Completely
 *    independent of orbital position — it adds life without faking progress.
 *
 * Unlike stars (light sources), planets are lit by the scene's ambient +
 * directional lights; their brightness drives material color (warm → cool). No
 * halo — that effort-glow is a star-only mechanic. Allocates nothing per frame;
 * disposes its geometry + material on unmount.
 *
 * The body mesh + the planet's `<Moons>` are wrapped in a position-only group
 * that the glide drives, so each moon is carried along as the planet moves while
 * sitting at its own local orbital angle (nested orbital motion, §9.1). The
 * body's scale + axis-spin stay on the mesh, so moons (its siblings) inherit
 * only the group's position — never the planet's size or spin.
 */
export function Planet({
  planet,
  parentPosition,
  radius,
  moonShells,
  nowMs,
}: PlanetProps) {
  const meshRef = useRef<Mesh>(null);

  // Reduced-motion signal (PRD 15), read once and gated per frame via the ref.
  const reducedRef = useReducedMotion();

  // The wrapping group carries the orbital position, so the planet's moons —
  // rendered as its children — are carried along as the planet glides (nested
  // orbital motion, §9.1). Only the group moves along the orbit; the body mesh
  // sits at its local origin and keeps its own scale + axis-spin.
  const groupRef = useRef<Group>(null);

  // Total elapsed ms (accumulated from `delta`), driving the ambient axis-spin.
  const elapsed = useRef(0);

  // The displayed orbital angle. Initialized to the *earned* angle so the first
  // render is at the correct resting position — no glide on mount, only on
  // later `currentOrbitProgress` changes. (useRef's initializer runs once.)
  const displayedAngle = useRef(
    progressToAngle(planet.orbit.currentOrbitProgress),
  );

  // The displayed orbital RADIUS (PRD 23). Initialized to the current target
  // shell so the first render rests at the correct radius — no breathe on mount,
  // only on a later layout change (a session grows a body → the shells re-pack).
  // Eased toward the `radius` prop each frame (snapping under reduced motion),
  // composed with the angle glide. The OrbitLine eases the SAME target in
  // lockstep, so the planet stays on its ring throughout the breathe.
  const displayedRadius = useRef(radius);

  // Displayed brightness + size for the growth SWELL (the session-completion
  // brightness/size polish). Like `displayedAngle`, each is initialized to its
  // current computed value, so a freshly-loaded universe renders at the correct
  // appearance with NO swell on mount — only a later target change (a completed
  // session) eases them. The display eases toward the computed truth; the truth
  // itself stays instant (r3f-conventions.md §6.4 / §9.1).
  const displayedBrightness = useRef<number>(
    computeBrightness(planet.lastSessionAt, planet.createdAt, nowMs),
  );
  const displayedSize = useRef<number>(
    computeSize(planet.orbit.orbitsCompleted),
  );

  // Body size from the locked growth math (logarithmic in completed orbits).
  // This is the swell's size TARGET — eased toward, never applied instantly.
  const bodySize = useMemo(
    () => computeSize(planet.orbit.orbitsCompleted),
    [planet.orbit.orbitsCompleted],
  );

  // Brightness from the locked decay math (lastSessionAt, falling back to
  // createdAt) — the same call computeStarBrightness makes per planet. The
  // swell's brightness TARGET (eased toward, then applied via the material color).
  const brightness = useMemo(
    () => computeBrightness(planet.lastSessionAt, planet.createdAt, nowMs),
    [planet, nowMs],
  );

  // Geometry: same low-poly subdivision-2 icosahedron as before (320 faces).
  const geometry = useMemo(() => new IcosahedronGeometry(1, 2), []);

  // Material: MeshStandardMaterial WITHOUT emissive — the planet reflects the
  // scene's lights; its base color carries the warm/cool meaning. Created ONCE
  // (no brightness/color dep): its color is seeded from the displayed brightness
  // in the layout effect below and then mutated in place each frame by the swell
  // ease — so a completion blooms the color over a beat instead of recreating the
  // material at the target (the old instant pop).
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

  // Seed the initial color + scale from the displayed refs (= the current
  // computed values) BEFORE the first paint, so there's no mount-frame flash and
  // no bloom on mount. Reading refs in an effect is allowed (unlike during
  // render). `useFrame` owns color + scale thereafter — applied imperatively, not
  // as JSX props, so a re-render can't clobber an in-progress eased value (the
  // same reason the glide owns `group.position`).
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    applyBodyColor(
      (mesh.material as MeshStandardMaterial).color,
      displayedBrightness.current,
    );
    mesh.scale.setScalar(displayedSize.current * SYSTEM_VISUAL_SCALE);
  }, []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;
    elapsed.current += delta * 1000;

    // --- Glide: ease the displayed angle toward the earned target (forward
    //     arc, including across the 1.0→0.0 wrap). Allocation-free: helpers
    //     return numbers and we mutate position.set in place.
    //
    //     Under reduced motion (PRD 15) the glide resolves *instantly* — we snap
    //     to the earned target rather than animating the travel. This keeps the
    //     universe HONEST: a completed session still advanced this body, and that
    //     advance still shows (never frozen-stale); only its choreography quiets.
    //     The position is a readout of real work, so an instant snap is the right
    //     "near-instant transition" here (no in-between motion to trigger). ---
    const target = forwardTarget(
      displayedAngle.current,
      planet.orbit.currentOrbitProgress,
    );
    displayedAngle.current = reducedRef.current
      ? target
      : easeAngle(displayedAngle.current, target, delta, GLIDE_TIME_CONSTANT_S);

    // --- Radius breathe (PRD 23): ease the orbital radius toward its clearance
    //     target. The whole system breathes outward as bodies grow, composed
    //     with the angle glide above. easeDisplay folds in the reduced-motion
    //     snap (so the radius resolves instantly, still honest), and shares the
    //     swell time constant so the breathe reads as one beat with the growth.
    //     Allocation-free (returns a number). ---
    displayedRadius.current = easeDisplay(
      displayedRadius.current,
      radius,
      delta,
      SWELL_TIME_CONSTANT_S,
      reducedRef.current,
    );

    // Position the GROUP (not the mesh) at the orbital position — its moon
    // children inherit this motion for free, so a moon is carried along as the
    // planet glides while sitting at its own local orbital angle (§9.1). Position
    // composes the eased angle with the eased radius: parent + (cos, sin) × r.
    const angle = displayedAngle.current;
    const r = displayedRadius.current;
    group.position.set(
      parentPosition[0] + Math.cos(angle) * r,
      parentPosition[1] + Math.sin(angle) * r,
      parentPosition[2],
    );

    // --- Axis-spin: subtle constant rotation on the planet's own Y-axis, from
    //     the shared ambient clock. NOT orbital position. Stays on the BODY mesh
    //     (not the group), so the planet's moons do not inherit its spin.
    //     Under reduced motion it holds still — it is continuous, autonomous
    //     motion (the actual perpetual body motion, PRD 15). ---
    if (!reducedRef.current) {
      mesh.rotation.y = ambientPhase(elapsed.current, AXIS_SPIN_SPEED);
    }

    // --- Growth swell: ease the displayed brightness + size toward the computed
    //     targets (the instant truth the universe math produces on a session
    //     commit), then apply them in place — color via applyBodyColor, scale on
    //     the body mesh. ONE shared time constant so brightness + size read as a
    //     single "becoming," not two separately-timed changes. Under reduced
    //     motion easeDisplay snaps to the target — the body still brightens/grows
    //     (honest), just un-animated (§6.4). Allocation-free: applyBodyColor
    //     mutates material.color in place, setScalar mutates the scale, easeDisplay
    //     returns a number. The material is reached through the mesh ref (not the
    //     useMemo'd `material` binding) so the per-frame mutation roots at a ref. ---
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
    mesh.scale.setScalar(displayedSize.current * SYSTEM_VISUAL_SCALE);
  });

  // A position-only wrapping group carries the orbital position (set each frame
  // above); the body mesh and the planet's moons are its children. The mesh keeps
  // its own body scale + axis-spin — moons, as siblings, inherit neither, only
  // the group's position. Body scale = the EASED displayed size × SYSTEM_VISUAL_SCALE,
  // applied on the mesh in `useFrame` (not a JSX prop) so a completion's growth
  // eases in instead of popping and a re-render can't clobber it; the math value
  // (computeSize) stays pure, scaled at the render boundary (scale.ts, §9.1).
  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      <Moons planet={planet} nowMs={nowMs} moonShells={moonShells} />
    </group>
  );
}
