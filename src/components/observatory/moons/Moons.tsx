"use client";

import type { Planet } from "@/universe";

import { SYSTEM_VISUAL_SCALE } from "../scale";
import { Moon } from "./Moon";

interface MoonsProps {
  /** The parent planet — its `moons` are rendered around its local origin. */
  readonly planet: Planet;
  /** The current time in ms, used to compute brightness decay. */
  readonly nowMs: number;
  /**
   * Per-moon UNSCALED orbital radii (clearance shells) from the system layout
   * (`computeSystemLayout`, computed once per system in `Planets.tsx` and threaded
   * through `<Planet>`). Each clears the planet body + its inner-neighbour moon
   * with a guaranteed gap, so a grown moon never fuses with the planet or another
   * moon (PRD 23). Scaled by `SYSTEM_VISUAL_SCALE` at this render boundary.
   */
  readonly moonShells: readonly number[];
}

/**
 * Render all moons attached to one planet — the fourth body type completing the
 * hierarchy (Galaxy → Star → Planet → Moon).
 *
 * Rendered INSIDE the parent planet's transform group (`planets/Planet.tsx`), so
 * the planet's live position carries every moon along as it glides; each moon
 * computes only its own LOCAL orbital position (r3f-conventions.md §9.1
 * nested-orbital-motion). No `parentPosition` needed — the group origin is the
 * planet center.
 *
 * Honest-universe principle: a planet with no moons renders nothing here (no
 * phantom moons; a moon appears only where one exists). No moon orbit lines —
 * moons are small and close, so a per-moon ring would be clutter (PRD §6.3);
 * the moon reads as anchored by hugging its planet.
 *
 * The orbital radius is the clearance shell from the system layout (PRD 23 —
 * measured outward from the planet body, accounting for every moon's body size),
 * multiplied by `SYSTEM_VISUAL_SCALE` at this render boundary — the same factor
 * the planet body and planet orbit use, so the planet→moon proportion is
 * preserved and the pure layout math stays unscaled (observatory/scale.ts, §9.1).
 * Each moon eases toward its shell (the breathe) in `Moon.tsx`.
 */
export function Moons({ planet, nowMs, moonShells }: MoonsProps) {
  if (planet.moons.length === 0) {
    return null;
  }

  return (
    <>
      {planet.moons.map((moon, index) => (
        <Moon
          key={moon.id}
          moon={moon}
          radius={moonShells[index]! * SYSTEM_VISUAL_SCALE}
          nowMs={nowMs}
        />
      ))}
    </>
  );
}
