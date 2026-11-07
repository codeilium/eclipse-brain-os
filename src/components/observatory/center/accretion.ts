/**
 * Pure accretion math for the galaxy's center (PRD 26 — the black hole).
 *
 * The black hole's accretion ring derives its presence from the galaxy's TOTAL
 * accumulated focus — the sum of every persisted session's `durationMs` across
 * every planet AND moon in the galaxy. The center *gathers* work (it never does
 * any), so its light is literally the hours the person has put in: near-invisible
 * at zero work, building honestly as they work, asymptotically saturating so it
 * never blows out.
 *
 * These are pure reads of the existing universe record — sessions have carried
 * `durationMs` since PRD 11 (and a *completed* session is appended to its
 * target's `sessions` by `commitCompletedSession`), so NO model, persistence,
 * or schema change is needed or made. Pure data → number, no React, no three.js
 * (the §9.1 pure-utility rule; unit-tested like every other pure helper).
 */

import type { Galaxy } from "@/universe";

const MS_PER_MINUTE = 60_000;

/**
 * Minutes of total galaxy focus at which the accretion ring reaches HALF its
 * full presence. 500 min ≈ 8 focused hours — a real first stretch of work makes
 * the center clearly alive, while full presence stays a long pursuit (the
 * asymptote is never reached). A by-eye-tunable craft constant like
 * `SWELL_TIME_CONSTANT_S` / `DISK_RADIUS`: Codeilium nudges it to his pace.
 */
export const ACCRETION_HALF_SATURATION_MINUTES = 500;

/**
 * Total focused minutes accumulated across the whole galaxy: the sum of
 * `durationMs` over every completed session on every planet and every moon of
 * every star, converted to minutes.
 *
 * Only `status === "completed"` sessions count — defensively mirroring
 * `countCompletedPomodorosInStar` (`@/universe` math.ts). On any real record
 * this is equivalent to summing everything (only completed sessions are ever
 * persisted), but an in-progress/abandoned session's `durationMs` is a *chosen*
 * length, not worked time — counting one would fabricate light, and the
 * center's light is earned (honest-universe).
 *
 * Read-only: never mutates the galaxy.
 */
export function galaxyFocusedMinutes(galaxy: Galaxy): number {
  let totalMs = 0;
  for (const star of galaxy.stars) {
    for (const planet of star.planets) {
      for (const session of planet.sessions) {
        if (session.status === "completed") totalMs += session.durationMs;
      }
      for (const moon of planet.moons) {
        for (const session of moon.sessions) {
          if (session.status === "completed") totalMs += session.durationMs;
        }
      }
    }
  }
  return totalMs / MS_PER_MINUTE;
}

/**
 * Accretion presence (0..1) for a total of focused minutes:
 *
 *   intensity = minutes / (minutes + ACCRETION_HALF_SATURATION_MINUTES)
 *
 * The asymptotic-saturation shape (0 at zero work; exactly 0.5 at the
 * half-saturation point; monotonic; approaches but NEVER reaches 1) — the same
 * "early progress dramatic, late progress incremental, a ceiling approached but
 * never reached" family as the corona's capped log curve, in its simplest
 * rational form. Negative input (impossible from a real record) clamps to 0.
 */
export function accretionIntensity(minutes: number): number {
  if (minutes <= 0) return 0;
  return minutes / (minutes + ACCRETION_HALF_SATURATION_MINUTES);
}
