/**
 * Global rendering-layer visual scale for the Observatory.
 *
 * A purely VISUAL multiplier applied to every drawn body — star bodies, planet
 * bodies, the star halo, and planet/moon orbit offsets — that keeps each
 * star→planet→moon system compact and legible: a tidy, jewel-like cluster
 * rather than a sprawl.
 *
 * This is a RENDERING concern, not a math change. The locked PRD-1 math
 * (`computeSize` / `computeStarBodySize` / `computeStarCoronaRadius`, in
 * `@/universe`) and the per-body `position.ts` helpers keep their abstract
 * values — they encode the relationships *between* bodies. Each render
 * component multiplies by this constant at the point a math value becomes a
 * three.js `scale`/position, leaving every `useMemo`'d math value pure.
 *
 * Star *positions* are deliberately NOT scaled: stars keep their seeded disk
 * layout (spatial memory, `stars/position.ts`), and only each star's system
 * is scaled by this factor.
 *
 * This works WITH the camera (PRD 13: zoom + pan), not around a fixed one. It
 * is one of two by-eye levers, tuned in OPPOSITE directions: DISK_RADIUS went
 * much wider (2.4 → 6) to spread systems apart so the universe breathes, while
 * this scale went slightly tighter (0.6 → 0.54) so each system stays compact
 * as the gaps between systems open up — the *spacing* does the breathing, each
 * system stays a jewel. (Earlier, with a fixed camera, this was an interim
 * shrink to fit one frame; PRD 13 turned it into a composition lever.) See
 * `.claude/docs/r3f-conventions.md` §9.1.
 */
export const SYSTEM_VISUAL_SCALE = 0.54;
