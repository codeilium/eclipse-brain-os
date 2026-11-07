/**
 * Pure validation for the create-a-body flow (PRD 9 stars; PRD 10 planets).
 *
 * The only rule: a body needs a non-empty name — a pursuit (star) or practice
 * (planet) must be named. The name is trimmed first so whitespace-only input
 * never creates a blank, unnameable body. Description is optional and
 * unconstrained, so it needs no validation here.
 *
 * Shared by every create entry point (first-star onboarding, "+ new pursuit",
 * "+ add practice") — one rule, no duplication. Kept pure (no React, no DOM) so
 * it can be unit-tested in isolation. See `.claude/docs/r3f-conventions.md` §12.
 */

/** True if `name`, once trimmed, is a usable body name (star or planet). */
export function isValidBodyName(name: string): boolean {
  return name.trim().length > 0;
}
