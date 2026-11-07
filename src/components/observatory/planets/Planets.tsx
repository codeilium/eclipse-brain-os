"use client";

import { Fragment, useMemo } from "react";

import type { Star } from "@/universe";

import { systemLayoutForStar } from "../layout";
import { SYSTEM_VISUAL_SCALE } from "../scale";
import { OrbitLine } from "./OrbitLine";
import { Planet } from "./Planet";

interface PlanetsProps {
  readonly star: Star;
  /** The parent star's world-space position (shared from `Stars`). */
  readonly parentPosition: readonly [number, number, number];
  /** The current time in ms, used to compute brightness decay. */
  readonly nowMs: number;
}

/**
 * Render all planets attached to one star, each with its orbit-path line.
 *
 * Honest-universe principle: if the star has no planets, this renders nothing
 * (no orbit lines either — a path annotation exists only with its planet).
 *
 * CLEARANCE-AWARE LAYOUT (PRD 23). Orbital radii are no longer index-based
 * (the old `orbitalRadius`); they are derived from the CURRENT body sizes with a
 * guaranteed clearance gap via `computeSystemLayout`, so a grown planet never
 * overlaps the grown star, neighbours never overlap, and a planet never swallows
 * its moons. Young systems stay tight; the system breathes outward as it matures.
 * The layout is memoized on the star — sizes depend only on `orbitsCompleted`
 * (and the corona's completed-session count), never on `nowMs`, so it is stable
 * across the 60s `nowMs` ticks and recomputes only when this star's data changes
 * (a session commit). `O(planets + moons)`.
 *
 * For each planet we pass the scaled planet shell to BOTH the `<OrbitLine>` (the
 * faint cool ring) and the `<Planet>` (the lit body) so the body always sits on
 * its drawn path — both ease toward this same target radius, in lockstep, when
 * the system breathes (the ring "follows automatically"). The planet's unscaled
 * moon shells are forwarded down to `<Moons>`, which scales them at its own
 * boundary. `SYSTEM_VISUAL_SCALE` is applied here at the render boundary; the
 * pure `computeSystemLayout` math stays unscaled (observatory/scale.ts, §9.1).
 */
export function Planets({ star, parentPosition, nowMs }: PlanetsProps) {
  // Compute the system layout (clearance-packed shells + extent) once, memoized
  // on the star. Hoisted above the empty-check so the hook is unconditional; a
  // planet-less star lays out to empty shells (cheap) and still returns null.
  const layout = useMemo(() => systemLayoutForStar(star), [star]);

  if (star.planets.length === 0) {
    return null;
  }

  return (
    <>
      {star.planets.map((planet, index) => {
        // The planet's TARGET orbital radius (scaled to world space). Planet +
        // OrbitLine ease toward it together (the breathe); at rest they sit here.
        const radius = layout.planetShells[index]! * SYSTEM_VISUAL_SCALE;
        // This planet's unscaled moon shells (a stable ref from the memo),
        // forwarded to <Moons> through <Planet>; <Moons> scales them.
        const moonShells = layout.moonShells[index]!;
        return (
          <Fragment key={planet.id}>
            <OrbitLine center={parentPosition} radius={radius} />
            <Planet
              planet={planet}
              parentPosition={parentPosition}
              radius={radius}
              moonShells={moonShells}
              nowMs={nowMs}
            />
          </Fragment>
        );
      })}
    </>
  );
}
