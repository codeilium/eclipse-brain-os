import {
  BRIGHTNESS_HALF_LIFE_DAYS,
  GROWTH_AMOUNT,
  GROWTH_BASE_SIZE,
  GROWTH_CEILING_ORBITS,
  MINUTES_PER_ORBIT,
  MS_PER_DAY,
  STAR_BODY_SIZE_MULTIPLIER,
  STAR_CORONA_BASE_RADIUS,
  STAR_CORONA_CEILING_POMODOROS,
  STAR_CORONA_EXPANSION_AMOUNT,
} from "./constants";
import type { Brightness, OrbitState, Size, Star } from "./types";

/**
 * Normalize an orbit state — if progress >= 1.0, roll over and increment orbits.
 * Handles multi-orbit advances (e.g., a session that crosses two orbit boundaries).
 */
export function normalizeOrbit(orbit: OrbitState): OrbitState {
  const totalProgress = orbit.orbitsCompleted + orbit.currentOrbitProgress;
  const orbitsCompleted = Math.floor(totalProgress);
  const currentOrbitProgress = totalProgress - orbitsCompleted;
  return { orbitsCompleted, currentOrbitProgress };
}

/** Advance an orbit by some fractional amount (e.g., 0.25 for a 25-min session). */
export function advanceOrbit(orbit: OrbitState, delta: number): OrbitState {
  return normalizeOrbit({
    orbitsCompleted: orbit.orbitsCompleted,
    currentOrbitProgress: orbit.currentOrbitProgress + delta,
  });
}

const MS_PER_MINUTE = 60_000;

/**
 * Orbit progress earned by a COMPLETED focus session of the given duration.
 *
 * 1 minute of focus = 1% of an orbit (MINUTES_PER_ORBIT = 100), so this is
 * exactly `minutes / 100`:
 *   25min → 0.25 · 50min → 0.5 · 100min → 1.0 (one lap) · 600min → 6.0 (six laps)
 *
 * Computed straight from `durationMs` — no flooring/rounding branch. A completed
 * session ran for exactly its `durationMs` (completion fires at `startedAt +
 * durationMs`), so this is the honest time committed. A delta ≥ 1 is rolled by
 * `normalizeOrbit`'s floor/mod, so a multi-orbit session advances `orbitsCompleted`
 * by its whole part and keeps the fractional remainder in [0, 1).
 */
export function orbitProgressForDuration(durationMs: number): number {
  return durationMs / (MINUTES_PER_ORBIT * MS_PER_MINUTE);
}

/**
 * Logarithmic growth function — size as a function of completed orbits.
 *
 * size = baseSize + growthAmount × log(orbits + 1) / log(ceilingOrbits + 1)
 *
 * - At 0 orbits: returns baseSize
 * - At ceilingOrbits: returns baseSize + growthAmount (the mature size)
 * - Beyond ceilingOrbits: continues growing logarithmically, but slowly
 *
 * The "+ 1" inside both logs avoids log(0) and ensures size(0) = baseSize.
 */
export function computeSize(orbitsCompleted: number): Size {
  const normalized =
    Math.log(orbitsCompleted + 1) / Math.log(GROWTH_CEILING_ORBITS + 1);
  const size = GROWTH_BASE_SIZE + GROWTH_AMOUNT * normalized;
  return size as Size;
}

/**
 * Exponential decay brightness as a function of milliseconds since last attention.
 *
 * brightness = exp(-days / halfLife × ln(2))
 *
 * - At 0 days: brightness = 1.0 (fully warm)
 * - At halfLife days (7): brightness = 0.5
 * - At 2× halfLife (14 days): brightness = 0.25
 * - Asymptotic toward 0 (cool/dormant) but never quite reaches it
 *
 * NOTE: For a brand-new planet/moon with no sessions, the input should be
 * milliseconds since CREATION, not since first session. See `computeBrightness`.
 */
export function decayBrightness(msSinceAttention: number): Brightness {
  const days = msSinceAttention / MS_PER_DAY;
  const brightness = Math.exp((-days / BRIGHTNESS_HALF_LIFE_DAYS) * Math.LN2);
  return Math.max(0, Math.min(1, brightness)) as Brightness;
}

/**
 * Compute the current brightness of a Planet or Moon, given the current time.
 *
 * If there are sessions, decay from the most recent session.
 * If there are no sessions, decay from the creation date (the planet was
 * "attended to" at the moment of its creation — the user chose to add it).
 */
export function computeBrightness(
  lastSessionAt: string | null,
  createdAt: string,
  nowMs: number,
): Brightness {
  const reference = lastSessionAt ?? createdAt;
  const referenceMs = new Date(reference).getTime();
  return decayBrightness(nowMs - referenceMs);
}

/**
 * A Star's brightness is the MAX of its planets' brightness. The star shines
 * as warmly as its most-recently-tended planet. Stars with no planets at all
 * are at brightness = 0 (dormant — nothing alive in this system yet).
 */
export function computeStarBrightness(star: Star, nowMs: number): Brightness {
  if (star.planets.length === 0) {
    return 0 as Brightness;
  }
  let max = 0;
  for (const planet of star.planets) {
    const b = computeBrightness(planet.lastSessionAt, planet.createdAt, nowMs);
    if (b > max) max = b;
  }
  return max as Brightness;
}

/**
 * Compute the corona radius of a Star — grows logarithmically with the total
 * number of completed Pomodoros across all planets in the star's system.
 *
 * Capped at STAR_CORONA_CEILING_POMODOROS so the visual doesn't grow forever.
 */
export function computeStarCoronaRadius(star: Star): Size {
  const totalPomodoros = countCompletedPomodorosInStar(star);
  const clamped = Math.min(totalPomodoros, STAR_CORONA_CEILING_POMODOROS);
  const normalized =
    Math.log(clamped + 1) / Math.log(STAR_CORONA_CEILING_POMODOROS + 1);
  const radius =
    STAR_CORONA_BASE_RADIUS + STAR_CORONA_EXPANSION_AMOUNT * normalized;
  return radius as Size;
}

/**
 * Compute the body size of a Star. A star has no orbit of its own, so its body
 * size aggregates the cumulative `orbitsCompleted` across its planets (mirroring
 * how `computeStarCoronaRadius` aggregates the system's cumulative Pomodoros for
 * the halo), scaled by `STAR_BODY_SIZE_MULTIPLIER` so the star is always visually
 * dominant over its largest planet. A star with no planets — or all planets at
 * 0 orbits — has the smallest body.
 *
 * Because `computeSize` is monotonic and totalOrbits ≥ any single planet's
 * orbits, the result is always ≥ that planet's size × the multiplier.
 */
export function computeStarBodySize(star: Star): number {
  const totalOrbits = star.planets.reduce(
    (sum, p) => sum + p.orbit.orbitsCompleted,
    0,
  );
  return computeSize(totalOrbits) * STAR_BODY_SIZE_MULTIPLIER;
}

/** Sum of completed sessions across all planets in a star (NOT including moon sessions). */
export function countCompletedPomodorosInStar(star: Star): number {
  let total = 0;
  for (const planet of star.planets) {
    total += planet.sessions.filter((s) => s.status === "completed").length;
  }
  return total;
}
