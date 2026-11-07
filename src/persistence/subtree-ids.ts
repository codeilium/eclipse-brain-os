/**
 * `subtreeIds(body)` — a body's own id plus all of its descendant ids.
 *
 * The id-enumeration sibling of `@/universe`'s `describeSubtree` (which gives
 * descendant *counts*, for the delete confirmation): page cleanup on a delete
 * needs the actual *ids* of the deleted body AND everything nested under it, so
 * it can remove their page records (`deletePages`). A star yields its id + its
 * planets' + their moons'; a planet its id + its moons'; a moon just itself.
 *
 * Lives here in the persistence layer (the consumer), NOT in `@/universe`, so
 * the universe model stays completely untouched (the PRD 17 guardrail) — it only
 * *type*-imports the body shapes. Pure: no I/O, no mutation. Returns raw
 * `string[]` (the branded ids are strings at runtime; `deletePages` takes plain
 * strings).
 */

import type { Moon, Planet, Star } from "@/universe";

export function subtreeIds(body: Star | Planet | Moon): string[] {
  if ("planets" in body) {
    // Star: itself + each planet + each planet's moons.
    return [
      body.id,
      ...body.planets.flatMap((planet) => [
        planet.id,
        ...planet.moons.map((moon) => moon.id),
      ]),
    ];
  }
  if ("moons" in body) {
    // Planet: itself + its moons.
    return [body.id, ...body.moons.map((moon) => moon.id)];
  }
  // Moon: a leaf — just itself.
  return [body.id];
}
