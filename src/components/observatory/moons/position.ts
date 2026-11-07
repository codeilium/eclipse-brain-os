/**
 * Pure legibility constant for moons — the fourth body type.
 *
 * A moon's *orbital radius* is no longer computed here: as of PRD 23 the whole
 * system (planet shells + moon shells, with guaranteed clearance) is packed by
 * `computeSystemLayout` (`observatory/layout.ts`), which measures each moon
 * outward from the planet body AND accounts for every moon's body size, so a
 * grown moon never fuses with its planet or a neighbour. The old index-based
 * `moonOrbitalRadius` (+ its `MOON_BASE_GAP` / `MOON_RING_SPACING`) was
 * superseded and removed.
 *
 * What remains is the moon's *body size* scale — a render-layer concern unique
 * to moons (the layout consumes it when computing a moon's body radius).
 */

/**
 * Multiplier applied to a moon's growth-derived size (`computeSize`) so it stays
 * clearly subordinate to its planet — the visual hierarchy star > planet > moon
 * must hold. Combined with the flat cascade benefit nudging moons far less than a
 * directly-worked planet's duration-based advance (MOON_BENEFIT_FROM_PARENT_PLANET
 * 0.05 vs e.g. 0.25 for a 25-min session), a moon stays a fraction of its planet's
 * size at every stage. ↑ = bigger moons. Consumed both by `Moon.tsx` (the rendered
 * body scale) and by `layout.ts` (the moon's body radius for clearance packing).
 */
export const MOON_SIZE_SCALE = 0.4;
