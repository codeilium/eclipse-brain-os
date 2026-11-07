/**
 * Pure filtering for the star catalog (PRD 25).
 *
 * The catalog lists every star with its practices nested, behind one small
 * filter. This helper is the catalog's whole brain: given the universe's stars
 * and the typed query, it decides which stars appear and which of their
 * practices show beneath them. The panel renders the result; navigation,
 * ordering, and presentation live in `StarCatalog.tsx`.
 *
 * The contract:
 * - Matching is a **case-insensitive substring** over star + practice names
 *   (the query is trimmed first, so stray whitespace never hides everything).
 *   Moons are deliberately NOT searched — the catalog is shallow by design
 *   (you navigate to a star; sub-practices live in its StarContext).
 * - A star appears if **it or any of its practices** matches.
 * - A **name-matched star shows all its practices** (you found the star; show
 *   its whole little system). A star included only because practices matched
 *   shows **only the matching ones** (the practices are what you found).
 * - An **empty query is everything** — the resting catalog is the full list.
 *
 * Read-only of the universe: never mutates its inputs, preserves their order
 * (the alphabetical sort is presentation, applied in the component), and
 * returns the practice arrays by reference where possible. Kept pure (no
 * React, no DOM) so it is unit-testable in isolation, like `validation.ts`.
 */

import type { Planet, Star } from "@/universe";

/** One catalog row group: a star and the practices to list beneath it. */
export interface CatalogEntry {
  readonly star: Star;
  /** All practices when the star's own name matched (or the query is empty);
   *  only the matching practices when the star is in via a practice match. */
  readonly practices: ReadonlyArray<Planet>;
}

/** Filter the catalog: which stars appear, and which practices under each. */
export function filterCatalog(
  stars: ReadonlyArray<Star>,
  query: string,
): ReadonlyArray<CatalogEntry> {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return stars.map((star) => ({ star, practices: star.planets }));
  }
  const entries: CatalogEntry[] = [];
  for (const star of stars) {
    const starMatches = star.name.toLowerCase().includes(q);
    const practices = starMatches
      ? star.planets
      : star.planets.filter((p) => p.name.toLowerCase().includes(q));
    if (starMatches || practices.length > 0) {
      entries.push({ star, practices });
    }
  }
  return entries;
}
