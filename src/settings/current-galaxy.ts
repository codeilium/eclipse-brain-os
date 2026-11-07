/**
 * Current-galaxy resolution — the pure logic behind "reopen on the last-viewed
 * sky" (PRD 27). The `lastViewedGalaxyId` settings key remembers which galaxy
 * was on screen; this resolves a stored value against the universe's actual
 * galaxies, with no React / DOM / persistence so every branch is unit-testable.
 * The live wiring — reading + persisting the key — lives in
 * `use-current-galaxy.ts`; `page.tsx` owns the ephemeral current-galaxy state.
 *
 * Which galaxy is *viewed* is a durable UI preference (like the last-used
 * session length), never a property of the universe tree — the record has no
 * notion of a "current" galaxy.
 */

import type { GalaxyId } from "@/universe";

/**
 * Resolve a stored galaxy id against the universe's galaxies: the stored id if
 * it still names a real galaxy, else the first galaxy's id (the §12.6
 * resilience pattern — a stale id can never strand the app on a sky that no
 * longer exists), else `null` for a galaxy-less universe (unreachable in
 * practice: `createUniverse` always seeds one).
 */
export function resolveStoredGalaxyId(
  stored: string | undefined,
  galaxies: ReadonlyArray<{ readonly id: GalaxyId }>,
): GalaxyId | null {
  if (galaxies.length === 0) return null;
  if (stored !== undefined && galaxies.some((galaxy) => galaxy.id === stored)) {
    return stored as GalaxyId;
  }
  return galaxies[0]!.id;
}
