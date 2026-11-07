/**
 * Tunable constants for the Eclipse Brain OS universe model.
 *
 * These are deliberately separated from the math functions so that PRD 7
 * (planet rendering) and PRD 12 (growth/brightness visual tuning) can adjust
 * them after seeing the universe in motion. Changing any value here cascades
 * across the whole universe — be deliberate.
 *
 * The metaphor is locked. These values are negotiable.
 */

// Orbit mechanics — a completed session advances the orbit by its DURATION.
// 1 minute of focus = 1% of an orbit, so 100 minutes = exactly one full orbit
// (PRD 22). The advance is computed from the session's durationMs via
// orbitProgressForDuration (math.ts), replacing the old flat per-Pomodoro rate.
export const MINUTES_PER_ORBIT = 100;
export const ORBIT_PROGRESS_PER_MINUTE = 1 / MINUTES_PER_ORBIT; // 0.01
// PRD 21 default/fallback session length (the classic 25-min Pomodoro). NOT the
// orbit rate — a session now carries its own chosen durationMs; this only seeds
// the launcher on first run and is the fallback when no last-used value exists.
export const POMODORO_DURATION_MS = 25 * 60 * 1000; // 25 minutes

// Cascade — when a planet gets a Pomodoro, its moons benefit a little
export const MOON_BENEFIT_FROM_PARENT_PLANET = 0.05; // 0.05 orbits per moon

// Growth function (planets and moons)
export const GROWTH_BASE_SIZE = 0.15;
export const GROWTH_AMOUNT = 0.6;
export const GROWTH_CEILING_ORBITS = 40;

// Star body size. Stars have no orbit of their own, so their body size
// aggregates the cumulative orbitsCompleted across their planets (via
// computeStarBodySize in math.ts), then scales by this multiplier so the star
// stays visually dominant over its largest planet. Locked: 1.4 keeps the star
// ≥ its biggest planet at any reasonable system state (the ratio floor is
// exactly this multiplier, reached only when one planet holds all the orbits).
export const STAR_BODY_SIZE_MULTIPLIER = 1.4;

// Brightness function
export const BRIGHTNESS_HALF_LIFE_DAYS = 7;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Star corona expansion
export const STAR_CORONA_BASE_RADIUS = 1.0;
export const STAR_CORONA_EXPANSION_AMOUNT = 1.5;
export const STAR_CORONA_CEILING_POMODOROS = 200;

// Universe schema versioning
export const CURRENT_SCHEMA_VERSION = 1 as const;
