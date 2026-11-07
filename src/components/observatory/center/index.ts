/**
 * The galaxy's center (PRD 26) — the black hole.
 *
 * Public surface: the component `Scene` mounts, plus `galaxyFocusedMinutes`
 * (PRD 28 — the center panel's one honest derived line reads the same pure
 * sum the accretion ring earns its light from; `page.tsx` computes it and
 * passes a number down). The intensity curve and the material stay internal.
 */
export { BlackHole } from "./BlackHole";
export { galaxyFocusedMinutes } from "./accretion";
