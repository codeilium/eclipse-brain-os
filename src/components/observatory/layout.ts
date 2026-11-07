/**
 * Clearance-aware radial layout for a star's system (PRD 23).
 *
 * Bodies grow — the star from its system (`computeStarBodySize`), each planet
 * from its own completed orbits (`computeSize`), each moon from its own — so a
 * layout with FIXED orbit radii eventually collides: a grown planet overlaps the
 * grown star, neighbours overlap, a planet swallows its moons. This module
 * derives every orbit radius from the CURRENT body sizes with a guaranteed
 * clearance gap, hierarchically, so nothing can touch *by construction*. Young
 * systems stay tight; the system breathes outward as it matures (the growth made
 * spatial). The radius is presentation-derived — the model stores only the orbit
 * ANGLE (`currentOrbitProgress`) + `orbitsCompleted`; the radius has always been
 * assigned by the renderer (r3f-conventions.md §9.1 / universe-model.md).
 *
 * `computeSystemLayout` is PURE GEOMETRY — plain numbers in, shells out, no
 * React/three/`@/universe`, no per-frame allocation — so the clearance invariant
 * is heavily unit-testable (`layout.test.ts`). The thin adapters below
 * (`computeStarVisualRadius` / `systemLayoutForStar` / `maxSystemExtent`) turn a
 * universe `Star` into the geometry inputs (body radii via the locked size math)
 * and are shared by the renderer (`planets/Planets.tsx`) and the camera
 * (`Scene.tsx` → the pannable extent) so there is ONE source of truth.
 *
 * All values are UNSCALED (the abstract math frame, like `position.ts` helpers);
 * the render boundary multiplies by `SYSTEM_VISUAL_SCALE`, and the camera scales
 * the extent the same way (observatory/scale.ts, §9.1). This module never imports
 * the scale — it stays scale-unaware.
 */

import {
  computeSize,
  computeStarBodySize,
  computeStarCoronaRadius,
  type Star,
  type Galaxy,
} from "@/universe";

import { MOON_SIZE_SCALE } from "./moons/position";

// ---------------------------------------------------------------------------
// Clearance constants — eyeball-tunable craft values (PRD 23 §11/§12; Codeilium
// nudges them live). The defaults are chosen so a FRESH system reproduces the
// old fixed spacing almost exactly — a young system looks unchanged, only a
// mature one breathes outward:
//   • fresh planet 0 shell = R_star + PLANET_GAP + r_planet
//       = (0.15·1.4 + 0.35·1.0) + 0.5 + 0.15 = 1.21  (≈ old PLANET_BASE_DISTANCE 1.2)
//   • fresh planet step    = footprint + PLANET_GAP + footprint
//       = 0.15 + 0.5 + 0.15 = 0.8            (== old PLANET_RING_SPACING 0.8)
// ---------------------------------------------------------------------------

/**
 * Clearance gap (unscaled) between a planet's swept annulus and the star /
 * its inner neighbour. The empty space between surfaces, on top of the bodies'
 * own footprints. ↑ = roomier systems. (Matches the old 0.8 planet step for
 * fresh bodies; see above.)
 */
export const PLANET_GAP = 0.5;

/**
 * Clearance gap (unscaled) between a moon and the planet body / its inner
 * neighbour moon. Smaller than `PLANET_GAP` so moons stay tight and clearly
 * subordinate — they hug their planet (the moons/position.ts legibility note).
 * ↑ = moons sit further out.
 */
export const MOON_GAP = 0.2;

/**
 * How much of the star's soft corona the innermost planet may sit IN FRONT of,
 * as a fraction of the corona radius. A planet in the outer glow is pretty; it
 * must never sit inside the bright core — so the star's "visual radius" (what
 * planets clear) is the body plus this fraction of the corona. ↑ = planets kept
 * further out of the glow. (Corona radius runs 1.0–2.5; body 0.21–~1.3.)
 */
export const STAR_CORONA_CLEARANCE = 0.35;

/** One planet's geometry input: its (unscaled) body radius + its moons' (unscaled) body radii. */
export interface PlanetLayoutInput {
  readonly bodyRadius: number;
  readonly moons: readonly number[];
}

/** The computed shells (unscaled orbital radii) + the system's outer reach. */
export interface SystemLayout {
  /** Orbital radius for each planet, by index (clears the star + its inner neighbour). */
  readonly planetShells: readonly number[];
  /** Orbital radius for each moon, by `[planetIndex][moonIndex]` (clears the planet body + inner moon). */
  readonly moonShells: readonly (readonly number[])[];
  /** Outer reach of the whole system (outermost planet's annulus edge), for the camera. */
  readonly systemExtent: number;
}

/**
 * Pack a star's system so no two bodies' swept annuli overlap — pure geometry.
 *
 * Each body's **footprint** is the half-extent it sweeps from its own orbit
 * centre. We pack outward, each shell clearing the OUTER EDGE of everything
 * already inside it by the relevant gap, so clearance holds at the worst-case
 * angle (two bodies at the same angle):
 *
 * - **Moons (per planet)** pack outward from the planet body:
 *     moonShell[0]   = planetBodyRadius + moonGap + r_m[0]
 *     moonShell[j+1] = (moonShell[j] + r_m[j]) + moonGap + r_m[j+1]
 *   A planet's **footprint** = its outermost moon's reach (moonShell[last] +
 *   r_m[last]) — always > the body radius — or the body radius if it has no moons.
 *
 * - **Planets** pack outward from the star (`shell ± footprint` annuli):
 *     planetShell[0]   = starVisualRadius + planetGap + footprint[0]   (clears the star)
 *     planetShell[i+1] = (planetShell[i] + footprint[i]) + planetGap + footprint[i+1]
 *   The footprint includes the moon system, so a moony planet never reaches into
 *   its neighbour.
 *
 * Monotonic + deterministic: a body growing pushes only what is OUTSIDE it
 * outward, by exactly the amount needed. `O(planets + moons)`, no allocation
 * beyond the returned arrays (built once, not per frame).
 *
 * @param starVisualRadius  the star's clearance radius (body + corona allowance)
 * @param planets           per-planet body + moon-body radii (unscaled)
 * @param opts.planetGap    override the planet-level gap (defaults to `PLANET_GAP`)
 * @param opts.moonGap      override the moon-level gap (defaults to `MOON_GAP`)
 */
export function computeSystemLayout(
  starVisualRadius: number,
  planets: readonly PlanetLayoutInput[],
  opts?: { readonly planetGap?: number; readonly moonGap?: number },
): SystemLayout {
  const planetGap = opts?.planetGap ?? PLANET_GAP;
  const moonGap = opts?.moonGap ?? MOON_GAP;

  const moonShells: number[][] = [];
  const planetShells: number[] = [];

  // Outer edge of the last planet annulus packed so far; the star's clearance
  // radius is the innermost "edge" the first planet clears.
  let prevPlanetOuterEdge = starVisualRadius;

  for (const planet of planets) {
    // --- Level 1: pack this planet's moons outward from its body ---
    const shells: number[] = [];
    let prevMoonOuterEdge = planet.bodyRadius;
    for (const moonRadius of planet.moons) {
      const shell = prevMoonOuterEdge + moonGap + moonRadius;
      shells.push(shell);
      prevMoonOuterEdge = shell + moonRadius; // this moon's outer edge
    }
    moonShells.push(shells);

    // The planet's footprint = its moon system's reach (always > the body), or
    // just the body radius when it has no moons.
    const footprint = shells.length === 0 ? planet.bodyRadius : prevMoonOuterEdge;

    // --- Level 2: pack this planet's swept annulus outward from the star ---
    const shell = prevPlanetOuterEdge + planetGap + footprint;
    planetShells.push(shell);
    prevPlanetOuterEdge = shell + footprint; // this planet annulus's outer edge
  }

  // The system's outer reach: the outermost planet annulus edge, or just the
  // star's visual radius when the star has no planets (atmosphere-only systems
  // still report an honest extent — the star itself).
  const systemExtent =
    planets.length === 0 ? starVisualRadius : prevPlanetOuterEdge;

  return { planetShells, moonShells, systemExtent };
}

/**
 * A star's **visual radius** (unscaled) — what its planets must clear. The body
 * size aggregated from the system (`computeStarBodySize`) plus a fraction of the
 * soft corona (`STAR_CORONA_CLEARANCE × computeStarCoronaRadius`) so the
 * innermost planet sits outside the bright core but may sit in the outer glow.
 * Consumes the locked size math; never alters it.
 */
export function computeStarVisualRadius(star: Star): number {
  return (
    computeStarBodySize(star) +
    STAR_CORONA_CLEARANCE * computeStarCoronaRadius(star)
  );
}

/**
 * Build the geometry inputs for a `Star` from the locked size math and run
 * `computeSystemLayout`. The moon body radius in the unscaled frame is
 * `computeSize(orbits) × MOON_SIZE_SCALE` (a moon mesh scales by
 * `…·MOON_SIZE_SCALE·SCALE`), and the planet body radius is `computeSize(orbits)`
 * (a planet mesh scales by `…·SCALE`). Shared by the renderer and the camera.
 */
export function systemLayoutForStar(star: Star): SystemLayout {
  return computeSystemLayout(
    computeStarVisualRadius(star),
    star.planets.map((planet) => ({
      bodyRadius: computeSize(planet.orbit.orbitsCompleted),
      moons: planet.moons.map(
        (moon) => computeSize(moon.orbit.orbitsCompleted) * MOON_SIZE_SCALE,
      ),
    })),
  );
}

/**
 * The largest `systemExtent` (unscaled) across the RENDERED galaxy's stars —
 * `0` for an empty galaxy. The camera scales this by `SYSTEM_VISUAL_SCALE` and
 * adds it to the seeding `DISK_RADIUS` so a grown system at the disk edge stays
 * reachable (camera-controls.ts `panBoundForExtent`). Scoped per galaxy
 * (PRD 27): each galaxy is its own sky, so a grown system in galaxy A must not
 * inflate the pan bounds of galaxy B.
 */
export function maxSystemExtent(galaxy: Galaxy): number {
  let max = 0;
  for (const star of galaxy.stars) {
    const extent = systemLayoutForStar(star).systemExtent;
    if (extent > max) max = extent;
  }
  return max;
}
