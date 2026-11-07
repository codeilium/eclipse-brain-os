import { MOON_BENEFIT_FROM_PARENT_PLANET } from "./constants";
import { advanceOrbit, orbitProgressForDuration } from "./math";
import type { Moon, Planet } from "./types";

/**
 * Apply a completed focus session to a Planet. The Planet:
 * - advances its orbit by the session's DURATION — `orbitProgressForDuration(durationMs)`
 *   (1 min = 1% of an orbit; a long session can roll several orbits in one commit)
 * - all its moons each advance a FLAT 0.05 orbits (the parent-benefit cascade — a
 *   relationship gesture, deliberately NOT scaled by the session's length)
 * - updates lastSessionAt
 *
 * Returns a new Planet with the cascaded changes. Caller is responsible for
 * appending the Session to the Planet's session list and for replacing this
 * Planet inside its parent Star.
 *
 * NOTE: This function only handles the math cascade. Session record-keeping
 * (creating the Session object, appending it to the array) is done by the
 * caller in `universe.ts`.
 */
export function applyPomodoroToPlanet(
  planet: Planet,
  completedAt: string,
  durationMs: number,
): Planet {
  const updatedMoons: ReadonlyArray<Moon> = planet.moons.map((moon) => ({
    ...moon,
    orbit: advanceOrbit(moon.orbit, MOON_BENEFIT_FROM_PARENT_PLANET),
    // NOTE: moon.lastSessionAt is NOT updated here — only direct sessions
    // on the moon update its lastSessionAt. The cascade benefit nudges
    // the moon's orbit but doesn't reset its brightness clock. The benefit is
    // flat (PRD 22 left it untouched) — only the DIRECT advance is duration-based.
  }));

  return {
    ...planet,
    orbit: advanceOrbit(planet.orbit, orbitProgressForDuration(durationMs)),
    moons: updatedMoons,
    lastSessionAt: completedAt as Planet["lastSessionAt"],
  };
}

/**
 * Apply a completed focus session to a Moon. The Moon advances its orbit by the
 * session's DURATION — `orbitProgressForDuration(durationMs)`, the same minutes
 * rule as a planet's direct advance — and updates lastSessionAt. Nothing else
 * cascades — the parent Planet does NOT get a free advance from moon work.
 */
export function applyPomodoroToMoon(
  moon: Moon,
  completedAt: string,
  durationMs: number,
): Moon {
  return {
    ...moon,
    orbit: advanceOrbit(moon.orbit, orbitProgressForDuration(durationMs)),
    lastSessionAt: completedAt as Moon["lastSessionAt"],
  };
}
