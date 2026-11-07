/**
 * Pure helpers for the planet orbit *glide* animation.
 *
 * The orbital *angle* of a planet is always `currentOrbitProgress × 2π` — an
 * earned position, a readout of real work, never a free-running timer orbit
 * (see r3f-conventions.md §6.3). But when `currentOrbitProgress` *changes* (a
 * Pomodoro completes — PRD 11), the planet should visibly *travel* to its new
 * earned position along the forward arc rather than teleporting. These helpers
 * compute the interpolated angle for that one-shot transition.
 *
 * All three functions are pure — no React, no three.js, no state. They return
 * primitives so a `useFrame` caller can use them with no per-frame allocations.
 */

const TWO_PI = Math.PI * 2;

/** Convert orbit progress [0, 1) to an angle in radians. Centralizes the convention. */
export function progressToAngle(progress: number): number {
  return progress * TWO_PI;
}

/**
 * Given the current displayed angle and a target *progress*, return the target
 * *angle* "unwrapped" so that it is always **≥ the current displayed angle** —
 * so a simple lerp toward it always moves **forward** (counter-clockwise,
 * increasing angle).
 *
 * Orbit progress only ever advances (you cannot un-do a Pomodoro), so the
 * planet always travels forward, including across the 1.0 → 0.0 wrap. Example:
 * displayed `0.95·2π`, target progress `0.05` → this returns ≈ `1.05·2π`, i.e.
 * a forward travel of ~`0.10·2π` through the wrap point, **not** a backward
 * ~`0.90·2π` swing.
 *
 * When the planet is already at the target (progress unchanged), the returned
 * target equals the current angle (within epsilon), so the lerp is a no-op and
 * the planet rests at its earned position.
 */
export function forwardTarget(currentAngle: number, targetProgress: number): number {
  // Normalize progress into [0, 1) then to an angle in [0, 2π).
  const normalizedProgress = ((targetProgress % 1) + 1) % 1;
  const targetBase = normalizedProgress * TWO_PI;
  // Lift the target by whole turns until it is at or ahead of the current
  // angle, so lerping toward it travels forward. The epsilon prevents adding a
  // needless extra turn when the target already equals the current angle.
  let target = targetBase;
  while (target < currentAngle - 1e-9) {
    target += TWO_PI;
  }
  return target;
}

/**
 * Ease `current` toward `target` by a frame-rate-independent factor derived
 * from `delta` (seconds) and a time constant (seconds). Returns the new value.
 *
 * This is an exponential damp: each frame closes a fraction
 * `1 - exp(-delta / timeConstant)` of the remaining distance. Using `delta`
 * makes it smooth at any frame rate (one large step ≈ many small steps summing
 * to it). When the remaining distance falls below epsilon it snaps to `target`,
 * avoiding the infinite asymptote.
 *
 * `timeConstant` is a parameter (default 0.4s, a calm-but-brisk glide); the
 * Observatory call site sources it from a `duration.*` token rather than
 * hardcoding it (r3f-conventions.md §6.3). Smaller = snappier.
 */
export function easeAngle(
  current: number,
  target: number,
  delta: number,
  timeConstant: number = 0.4,
): number {
  const diff = target - current;
  if (Math.abs(diff) < 1e-4) return target;
  const factor = 1 - Math.exp(-delta / timeConstant);
  return current + diff * factor;
}
