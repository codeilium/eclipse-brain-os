/**
 * Reduced-motion preference — the pure resolution logic + types (PRD 15).
 *
 * Eclipse Brain OS is built on motion, so it must honor a user's request for
 * less of it. The "should motion be reduced?" signal combines two inputs:
 *
 * - the OS-level `prefers-reduced-motion: reduce` media query, and
 * - an explicit in-app override the user sets in the settings surface, which can
 *   force motion *off* (`reduce`) or *on* (`allow`) regardless of the OS, or
 *   defer to the OS (`system`, the default).
 *
 * `resolveReducedMotion` is the single, pure rule that turns those two into one
 * boolean. It is deliberately free of React / DOM / persistence so it can be
 * unit-tested in every combination (it is in the vitest coverage `include`).
 * The live wiring — reading the media query, persisting the override — lives in
 * `use-motion-preference.ts`; the gating of the actual `useFrame` loops lives in
 * the observatory (see `r3f-conventions.md` §6.4).
 */

/**
 * How the app decides whether to reduce motion:
 * - `system` — follow the OS `prefers-reduced-motion` setting (the default).
 * - `reduce` — force reduced motion on, even if the OS doesn't ask.
 * - `allow`  — force full motion on, even if the OS asks for reduced.
 */
export type MotionPreference = "system" | "reduce" | "allow";

/** The out-of-the-box preference: defer to the operating system. */
export const DEFAULT_MOTION_PREFERENCE: MotionPreference = "system";

/**
 * Resolve the effective "reduce motion?" boolean from the OS media-query value
 * and the user's override. Pure and total over the union:
 *
 * | preference | result        |
 * |------------|---------------|
 * | `reduce`   | `true`        |
 * | `allow`    | `false`       |
 * | `system`   | `osReduced`   |
 */
export function resolveReducedMotion(
  osReduced: boolean,
  preference: MotionPreference,
): boolean {
  if (preference === "reduce") return true;
  if (preference === "allow") return false;
  return osReduced; // "system" — defer to the OS
}

/**
 * Type guard for a value loaded from persistence (an unknown string, or
 * `undefined` when nothing was stored). Anything not in the union — including a
 * stale value from a future build — is rejected so the caller falls back to the
 * default rather than trusting a malformed preference.
 */
export function isMotionPreference(value: unknown): value is MotionPreference {
  return value === "system" || value === "reduce" || value === "allow";
}
