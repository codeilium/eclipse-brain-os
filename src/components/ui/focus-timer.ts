/**
 * Pure helpers for the Pomodoro focus-session timer.
 *
 * The timer is **hybrid**: the *source of truth* is the session's wall-clock
 * start timestamp, and the visible countdown is merely a *render* of these pure
 * functions against the current time (`now`). Deriving elapsed/remaining from
 * timestamps — rather than counting down an in-memory accumulator — is what
 * keeps the timer correct across tab-backgrounding and resume: when the user
 * comes back, we recompute from `now` and the answer is right regardless of how
 * many ticks the throttled interval missed (r3f-conventions.md §12.7).
 *
 * All functions are pure — no React, no DOM, no `Date.now()` — so they are
 * fully unit-testable: the caller passes in `now`. Times are in milliseconds.
 */

/**
 * Milliseconds elapsed since the session started. Clamped to ≥ 0 so clock skew
 * (a `now` momentarily behind `start`) can never report negative elapsed time.
 */
export function sessionElapsedMs(startMs: number, nowMs: number): number {
  return Math.max(0, nowMs - startMs);
}

/**
 * Milliseconds remaining until the session completes — `duration − elapsed`,
 * floored at 0 (a finished or overshot session reads 0, never negative). This
 * is what the visible countdown renders.
 */
export function sessionRemainingMs(
  startMs: number,
  nowMs: number,
  durationMs: number,
): number {
  return Math.max(0, durationMs - sessionElapsedMs(startMs, nowMs));
}

/**
 * Whether the full duration has elapsed (completion is the unit — 25 minutes or
 * nothing). True the instant elapsed reaches the duration and forever after, so
 * a session returned-to long past its end still reads complete (the lenient
 * "came back to a finished session" case).
 */
export function isSessionComplete(
  startMs: number,
  nowMs: number,
  durationMs: number,
): boolean {
  return sessionElapsedMs(startMs, nowMs) >= durationMs;
}

/**
 * Format a millisecond duration as `MM:SS` for the countdown display. Clamped
 * to ≥ 0 and rounded *down* to whole seconds (so a fresh 25-minute session
 * reads "25:00", not "24:59"). Minutes are not capped at 59 — a hypothetical
 * longer session would read e.g. "90:00" rather than wrapping — but both fields
 * are zero-padded to two digits.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}`;
}
