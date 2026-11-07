/**
 * Custom focus-session length — the pure parsing / clamping logic + bounds
 * (PRD 21). The person types how many minutes their session runs; this turns a
 * raw field string into a valid length and resolves a persisted value, with no
 * React / DOM / persistence so every branch is unit-testable (it is in the
 * vitest coverage `include`). The live wiring — reading + persisting the
 * last-used value — lives in `use-session-duration.ts`; the field that feeds
 * these lives in `StarContext.tsx`.
 *
 * The length is a property of the *session* (chosen each time), remembered
 * globally as a durable UI preference — it is deliberately NOT a property of any
 * body in the universe tree (bodies carry earned state; preferences live in
 * settings). As of PRD 22 the orbit advance is time-proportional: a completed
 * session advances `durationMs / (MINUTES_PER_ORBIT × 60_000)` (1 min = 1% of an
 * orbit), so this chosen length now directly drives how far the orbit moves.
 */

import { POMODORO_DURATION_MS } from "@/universe";

/**
 * Gentle bounds on a typed session length, in minutes (PRD 21 §3). Lean and
 * forgiving rather than prescriptive: at least a minute, at most a long
 * half-day. A typed value outside the band is clamped (not rejected).
 */
export const MIN_SESSION_MINUTES = 1;
export const MAX_SESSION_MINUTES = 600;

/**
 * First-run / fallback length: the classic 25-minute Pomodoro. This repurposes
 * `POMODORO_DURATION_MS` as the *default*, not a hard-coded session length —
 * the value seeds the picker on first ever run and is the fallback whenever no
 * valid persisted value exists.
 */
export const DEFAULT_SESSION_DURATION_MS = POMODORO_DURATION_MS;

const MS_PER_MINUTE = 60_000;

/** Whole-or-fractional minutes → milliseconds. */
export function minutesToMs(minutes: number): number {
  return minutes * MS_PER_MINUTE;
}

/** Milliseconds → whole minutes (rounded — the field speaks in whole minutes). */
export function msToMinutes(ms: number): number {
  return Math.round(ms / MS_PER_MINUTE);
}

/** Clamp a minutes value into the gentle `[MIN, MAX]` band. */
export function clampSessionMinutes(minutes: number): number {
  return Math.min(MAX_SESSION_MINUTES, Math.max(MIN_SESSION_MINUTES, minutes));
}

/**
 * Parse a typed field value into a valid whole-minutes length, or `null`.
 *
 * Gentle, never a scold (mirrors `isValidBodyName`, PRD 9/10): an empty /
 * non-numeric / non-positive value returns `null` — the caller treats that as a
 * no-op on start (nothing happens, no error shown). A positive number is rounded
 * to whole minutes and clamped into `[MIN, MAX]`, so an out-of-band value still
 * starts a session, just at the nearest sane length.
 */
export function parseSessionMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampSessionMinutes(Math.round(value));
}

/**
 * Resolve a value read from the settings store into a usable duration in ms.
 * A finite, positive stored value is normalized to a clamped whole-minute ms
 * value; anything else (missing / junk / non-positive) falls back to the
 * default. Parallel to motion's `isMotionPreference` + the hook's fallback: a
 * malformed or out-of-range persisted value can never break the launcher.
 */
export function resolveStoredDurationMs(stored: string | undefined): number {
  if (stored === undefined) return DEFAULT_SESSION_DURATION_MS;
  const value = Number(stored);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_SESSION_DURATION_MS;
  return minutesToMs(clampSessionMinutes(msToMinutes(value)));
}
