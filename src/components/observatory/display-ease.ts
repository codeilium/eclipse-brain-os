/**
 * The "growth swell" display ease (session-completion brightness + size polish).
 *
 * When a focus session completes, the universe math instantly produces a body's
 * new, true brightness and size (`commitCompletedSession` → `computeBrightness` /
 * `computeSize` / `computeStarBrightness` / `computeStarBodySize` /
 * `computeStarCoronaRadius`). This helper is how that truth is *shown*: a body's
 * *displayed* brightness/size eases **toward** the computed value over a short
 * beat, the same way the orbit *glide* eases the displayed angle toward the
 * earned one (r3f-conventions.md §6.3 / §6.4). The display eases; the truth is
 * instant. The displayed value only ever moves *toward* the computed target,
 * never beyond it, and at rest equals it (the honest-universe invariant, §2).
 *
 * This is the project's THIRD instance of the same frame-rate-independent
 * exponential damp — a deliberate sibling of `orbit-animation.ts`'s `easeAngle`
 * (orbital angle) and `camera-controls.ts`'s `dampTo` (camera pan/zoom). Each
 * domain owns its own copy so the domains stay decoupled (see the note on
 * `dampTo`); body *display properties* are the third such domain. The only thing
 * `easeDisplay` adds over those two is the reduced-motion snap, folded in so
 * every call site obeys §6.4 uniformly.
 *
 * Pure — no React, no three.js, no state. Returns a number, so a `useFrame`
 * caller eases with no per-frame allocation (§5).
 */

import { duration, toSeconds } from "@/design/tokens";

/**
 * The swell's easing time constant, in seconds. A by-eye-tunable craft value
 * (like the orbit glide's `GLIDE_TIME_CONSTANT_S` and the camera's `*_TAU`):
 * sourced from a `duration.*` token rather than hardcoded (§6). Started at
 * `duration.slow` (0.8s) — a hair slower than the glide's `duration.base`
 * (0.4s), so the swell reads as *becoming* rather than a flash, without
 * dragging. Tune live on real frames: nudge toward `duration.base` for a
 * snappier, glide-matched beat, or toward `duration.cinematic` (1.2s — the token
 * literally labelled "planet growth") for a more luxurious bloom. ONE constant
 * drives brightness, size, and (for the star) corona so a body reads as a single
 * unified growth event, not several separately-timed changes.
 */
export const SWELL_TIME_CONSTANT_S = toSeconds(duration.slow);

/**
 * Ease a displayed scalar (brightness, size, corona radius) one frame toward its
 * computed `target`, or snap to it under reduced motion.
 *
 * - **`reduced` true** → returns `target` (instant). The body still reaches its
 *   true value — reduced motion removes the *animation*, never the *change*
 *   (honest-universe, §6.4). This is the same rule the glide obeys
 *   (`reducedRef.current ? target : easeAngle(...)`).
 * - **otherwise** → an exponential damp: each frame closes
 *   `1 − exp(−delta / tau)` of the remaining distance, so one large frame ≈ many
 *   small ones summing to it (smooth at any frame rate). Snaps to `target` within
 *   an epsilon to avoid the infinite asymptote; `tau ≤ 0` and `delta = 0` resolve
 *   to a no-op-safe result.
 *
 * `delta` and `tau` are in seconds. Identical damp math to `easeAngle` / `dampTo`.
 */
export function easeDisplay(
  current: number,
  target: number,
  delta: number,
  tau: number,
  reduced: boolean,
): number {
  // Reduced motion: snap to the computed truth (the un-animated honest baseline).
  if (reduced) return target;
  if (tau <= 0) return target;
  const diff = target - current;
  if (Math.abs(diff) < 1e-4) return target;
  return current + diff * (1 - Math.exp(-delta / tau));
}
