import { duration } from "@/design/tokens";

/**
 * The Observatory's ambient motion utilities.
 *
 * Everything that drifts ambiently in the scene moves on the same clock
 * (`duration.drift`, 48s), each at its own *phase* and optional *speed
 * multiplier*. This module is the canonical source of that math — Camera,
 * DustMotes, and any future body that has ambient motion (PRD 6+) all use
 * these helpers so the scene's motion language stays coherent.
 *
 * All functions are pure — no React, no three.js, no state. They return
 * primitives or tuples (never new objects) so callers can use them in
 * `useFrame` without per-frame allocations.
 */

/** Full period of one ambient cycle, in milliseconds. */
const PERIOD_MS = duration.drift;

/**
 * Compute the phase θ (in radians, in [0, 2π)) for the current point on the
 * ambient-drift cycle.
 *
 * - `elapsedMs` is the total elapsed milliseconds since the component mounted
 *   (the caller is responsible for accumulating `delta` inside `useFrame`).
 * - `speed` is an optional per-element multiplier (default 1.0). Values >1
 *   make this element drift faster than the base cadence; values <1 slower.
 *   Used by `DustMotes` for parallax (0.5×–1.5× per mote).
 *
 * The function wraps inside the period so the phase never accumulates beyond
 * 2π, avoiding floating-point drift over long sessions.
 */
export function ambientPhase(elapsedMs: number, speed: number = 1.0): number {
  // Normalized position on the cycle in [0, 1)
  const t = ((elapsedMs * speed) % PERIOD_MS) / PERIOD_MS;
  return t * Math.PI * 2;
}

/**
 * Compute a Lissajous-like (x, y, z) offset from a phase θ and per-axis
 * amplitudes. The frequency-multiplier tuple slightly offsets the axes so
 * the path never exactly repeats — this is what gives the camera and the
 * dust motes their non-trivial wandering motion.
 *
 * Default frequencies: x=1.0, y=1.3, z=0.7 — matches the Camera and DustMote
 * patterns established in PRD 3/4. Override per element if a different shape
 * is needed.
 *
 * Returns a fresh tuple every call. Tuples are stack-allocated by V8 — no
 * heap allocation per frame, no GC pressure.
 */
export function lissajous(
  theta: number,
  xAmp: number,
  yAmp: number,
  zAmp: number,
  freqMultiplier: readonly [number, number, number] = [1.0, 1.3, 0.7],
): readonly [number, number, number] {
  return [
    Math.sin(theta * freqMultiplier[0]) * xAmp,
    Math.cos(theta * freqMultiplier[1]) * yAmp,
    Math.sin(theta * freqMultiplier[2]) * zAmp,
  ];
}
