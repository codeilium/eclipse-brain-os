/**
 * Eclipse Brain OS — Moons module public API.
 *
 * Renders each planet's moons (sub-practices) as small reflective, non-emissive
 * bodies orbiting the planet's local origin — nested inside the planet's
 * transform group, so the planet's glide carries them (r3f-conventions.md §9.1).
 * Driven entirely by `@/universe` data; a planet with no moons renders nothing.
 * Moons advance only via the parent-planet cascade (not directly focusable, V1).
 */

export { Moons } from "./Moons";
