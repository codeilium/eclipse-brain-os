/**
 * Pure helpers + tunable limits for the Observatory camera control (PRD 13).
 *
 * The camera is a single owned source of truth: an ephemeral pan target (the
 * point in the z=0 sky plane the camera is centered on) and a zoom DISTANCE
 * (the camera's z above that plane). User input (wheel/pinch zoom, drag pan)
 * moves those, clamped; the existing ambient drift (`motion.ts`) is composed on
 * top as an idle-gated offset. None of this is persisted — camera position is
 * ephemeral view state, like selection (r3f-conventions.md §12.6).
 *
 * Everything here is pure — no React, no three.js, no state — so it is
 * unit-tested in isolation and the `Camera.tsx` driver can call it inside
 * `useFrame` with no per-frame allocations (all return numbers / stack tuples).
 * The render driver (native listeners + the composing `useFrame`) is verified
 * visually like every other `.tsx` (§11); these helpers carry the testable math.
 *
 * `DISK_RADIUS` is imported (not hardcoded) so the pan bounds stay correct
 * relative to where stars actually seed — and stay correct automatically if the
 * seeding disk is later loosened (the deferred by-eye retune PRD 13 enables but
 * deliberately does not perform).
 */

import { duration, toSeconds } from "@/design/tokens";

import { DISK_RADIUS } from "./stars/position";

// ---------------------------------------------------------------------------
// Limits & tunables — eyeball-tunable craft values (PRD 13 §5 / §9). Defaults
// chosen against the CURRENT composition (DISK_RADIUS 6, SYSTEM_VISUAL_SCALE
// 0.54, fov 60°); easy to nudge on real hardware. "Limits are findability, not
// restriction" — they keep the populated universe always reachable.
// ---------------------------------------------------------------------------

/** The default framing the camera starts at and resets to — matches the <Canvas> camera z. */
export const DEFAULT_ZOOM = 5;

/**
 * Closest the camera may dolly in (smallest z). At z=2 the visible half-height
 * is tan(30°)·2 ≈ 1.15 world units — enough that a single star→planet→moon
 * system fills the frame and is comfortably inspectable, without zooming
 * uselessly into one body.
 */
export const MIN_ZOOM = 2;

/**
 * Farthest the camera may dolly out (largest z). At z=10 the visible
 * half-height is tan(30°)·10 ≈ 5.77, so you survey the bulk of the
 * ±DISK_RADIUS field and its systems at once (the full width fits on any
 * desktop aspect); a star at the extreme top/bottom edge of the now-wider disk
 * is brought in with a small pan (MIN_PAN_BOUND ≈ 7.2; the live bound grows with
 * the system extent — PRD 23). You can never zoom out into
 * pure void with nothing to come back to. (Safely within the 100×100 z=-50
 * background plane: even at z=10 + full pan the view spans ≈ ±42 < ±50, so the
 * atmosphere never reveals an edge — see r3f-conventions.md §8 / the PRD 13
 * atmosphere note.)
 */
export const MAX_ZOOM = 10;

/** Breathing room (world units) past the seeded disk edge the user may pan to. */
export const PAN_MARGIN = 1.2;

/**
 * The MINIMUM pan bound (world units) — the floor the dynamic bound never drops
 * below, so an empty or young/tiny universe is never over-tight. Derived from
 * the star-seeding radius (stars seed within ±DISK_RADIUS) plus a margin: the
 * user can bring any star — even one at the disk edge — to screen center with a
 * little room around it, but can never wander infinitely into empty space.
 * Parameterized on DISK_RADIUS so it stays correct if the seeding disk loosens.
 *
 * This is exactly the OLD fixed pan bound (DISK_RADIUS + PAN_MARGIN ≈ 7.2);
 * PRD 23 made the live bound TRACK the system extent above this floor (see
 * `panBoundForExtent`) so a grown system's outer planets stay reachable.
 */
export const MIN_PAN_BOUND = DISK_RADIUS + PAN_MARGIN;

/**
 * The pan bound for a universe whose largest system extends
 * `maxSystemExtentScaled` (world units — the layout's `systemExtent` already
 * multiplied by `SYSTEM_VISUAL_SCALE`) from its star center (PRD 23). A grown
 * system seeded at the disk edge has its outer planets near
 * ±(DISK_RADIUS + maxSystemExtentScaled); add PAN_MARGIN so they can be brought
 * to screen center with room. Clamped to never drop below `MIN_PAN_BOUND`, so a
 * tiny/empty universe keeps today's bound. The camera reads this each render so
 * the WHOLE grown universe stays pannable — the old fixed bound could not reach
 * a grown system's outer planets. (Pure; the live value is threaded from `Scene`,
 * which derives `maxSystemExtent` from the universe.)
 */
export function panBoundForExtent(maxSystemExtentScaled: number): number {
  return Math.max(
    MIN_PAN_BOUND,
    DISK_RADIUS + maxSystemExtentScaled + PAN_MARGIN,
  );
}

/**
 * How long (ms) after the last zoom/pan input before the ambient drift resumes.
 * The camera goes still to "listen" while you move it, then breathes again once
 * you rest. ~1.2s reads as a calm settle, not a lag.
 */
export const IDLE_DELAY_MS = 1200;

/**
 * Pointer travel (px, since pointer-down) beyond which a gesture is a drag
 * (pan), not a click (select). Below it, the press may still select a star
 * (PRD 10). R3F's own `event.delta` is compared against this in `Star.tsx`.
 */
export const DRAG_THRESHOLD_PX = 6;

/**
 * Multiplicative wheel sensitivity: targetZoom *= exp(deltaY · this). A
 * multiplicative (rather than additive) step gives a constant *feel* at every
 * scale — one notch changes the framing by the same proportion whether you're
 * zoomed in or out.
 */
export const WHEEL_ZOOM_SENSITIVITY = 0.001;

// ---------------------------------------------------------------------------
// Easing time-constants (seconds) for the per-frame exponential damp. Sourced
// from duration.* tokens, never hardcoded (r3f-conventions.md §6 / §6.3). Pan
// and free-mode zoom share ONE τ so cursor-centered zoom stays exact while the
// dolly eases (see zoomTowardCursor + the §-note in dampTo).
// ---------------------------------------------------------------------------

/** Free-mode pan + zoom ease — near-immediate but jitter-free ("weighty" direct feel). */
export const CONTROL_TAU = toSeconds(duration.instant); // 0.12s

/**
 * The cinematic glide settle (never a snap) — the slow τ a glide eases over. Shared by BOTH
 * the reset-view glide (to the origin) and the fly-to-new-star glide (PRD 24, to the new star's
 * position): reset is just the origin case of one general "glide to (target, DEFAULT_ZOOM)" path.
 * Under reduced motion the driver substitutes the brisk CONTROL_TAU so the glide snaps (§6.4).
 */
export const RESET_TAU = toSeconds(duration.cinematic); // 1.2s

/** Idle-factor fade — how gently the breathing dissolves and resumes. */
export const IDLE_TAU = toSeconds(duration.slow); // 0.8s

/**
 * The camera fly-to trigger (PRD 24): a nonce + the world-space pan target to glide to. Mirrors
 * the `resetSignal` nonce, but carries a *target* — `page.tsx` bumps `signal` (and sets `x`/`y`
 * to the new star's world position via `starPositionFromId`) when a star is created, and the
 * camera eases to center it at the default overview zoom. `signal === 0` is the initial mount
 * (no glide). The point is in the same world space as the pan target / `PAN_BOUND` (stars seed
 * within ±DISK_RADIUS, unscaled — see stars/position.ts), so it needs no `SYSTEM_VISUAL_SCALE`.
 */
export interface CameraFlyTo {
  readonly signal: number;
  readonly x: number;
  readonly y: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Clamp `value` to `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamp a zoom distance to the dolly range `[MIN_ZOOM, MAX_ZOOM]`. */
export function clampZoom(distance: number): number {
  return clamp(distance, MIN_ZOOM, MAX_ZOOM);
}

/**
 * Clamp one pan axis (world units) to `[-bound, +bound]`. The `bound` is the
 * LIVE pan bound (PRD 23 — `panBoundForExtent`, threaded from `Scene`), passed in
 * rather than read from a module const so it can grow with the universe's extent.
 */
export function clampPanAxis(value: number, bound: number): number {
  return clamp(value, -bound, bound);
}

/**
 * Convert a pointer drag in *pixels* into the world-space delta to ADD to the
 * pan target — the "grab the sky and move it 1:1" mapping.
 *
 * At distance `zoom` the visible world height is `2·zoom·tan(fov/2)`, so each
 * pixel is `(2·zoom·tan(fov/2)) / viewportHeightPx` world units (square pixels,
 * so the same scale applies horizontally). Signs make the grabbed point follow
 * the cursor: dragging right (`dxPx > 0`) moves the *content* right, i.e. the
 * camera/pan-target LEFT (−x); screen-y is down while world-y is up, so
 * dragging down (`dyPx > 0`) raises the pan target (+y).
 *
 * Returns a stack tuple `[worldDx, worldDy]` — no heap allocation per call.
 */
export function panWorldDelta(
  dxPx: number,
  dyPx: number,
  zoom: number,
  viewportHeightPx: number,
  fovRad: number,
): readonly [number, number] {
  const unitsPerPixel = (2 * zoom * Math.tan(fovRad / 2)) / viewportHeightPx;
  return [-dxPx * unitsPerPixel, dyPx * unitsPerPixel];
}

/**
 * Given a zoom change `zoom → newZoom`, return the new pan target that keeps the
 * world point currently under the cursor fixed (zoom *toward the cursor*).
 *
 * The point under the cursor is `pan + ndc · zoom · tan(fov/2)` (×aspect on x);
 * holding it fixed across the zoom change gives
 * `newPan = pan + ndc · tan(fov/2) · (zoom − newZoom)` (×aspect on x). When the
 * cursor is at the view center (`ndc = 0`) the pan is unchanged — that is the
 * zoom-toward-center fallback for free.
 *
 * Because free-mode pan and zoom ease with the SAME time-constant, this exact
 * relationship is preserved throughout the eased dolly, not just at the
 * endpoints (a damp by an equal factor on both keeps `newPan = f(newZoom)`).
 *
 * `ndcX`/`ndcY` are normalized device coords in `[-1, 1]` (y up). Returns a
 * stack tuple `[newPanX, newPanY]`.
 */
export function zoomTowardCursor(
  panX: number,
  panY: number,
  zoom: number,
  newZoom: number,
  ndcX: number,
  ndcY: number,
  fovRad: number,
  aspect: number,
): readonly [number, number] {
  const tan = Math.tan(fovRad / 2);
  const dz = zoom - newZoom;
  return [panX + ndcX * tan * aspect * dz, panY + ndcY * tan * dz];
}

/**
 * Frame-rate-independent exponential damp of `current` toward `target` over a
 * time-constant `tau` (seconds), advancing by `delta` seconds. Each frame closes
 * `1 − exp(−delta/tau)` of the remaining distance, so one big step ≈ many small
 * steps summing to it (smooth at any frame rate). Snaps to `target` within an
 * epsilon to avoid an infinite asymptote; `delta = 0` is a no-op.
 *
 * The project's generic counterpart to `orbit-animation.ts`'s `easeAngle`
 * (same math, domain-neutral name — cameras pan/zoom, they don't orbit). Kept
 * here rather than imported so the camera and orbit domains stay decoupled.
 */
export function dampTo(
  current: number,
  target: number,
  delta: number,
  tau: number,
): number {
  if (tau <= 0) return target;
  const diff = target - current;
  if (Math.abs(diff) < 1e-4) return target;
  return current + diff * (1 - Math.exp(-delta / tau));
}

/**
 * The drift's idle GATE: 1 (breathe) once the user has been idle at least
 * `delayMs`, else 0 (stillness). A hard 0/1 target; the fade between them is the
 * eased `dampTo` in `nextIdleFactor`, so the breathing never snaps on/off.
 */
export function idleFactorTarget(
  msSinceInteract: number,
  delayMs: number = IDLE_DELAY_MS,
): 0 | 1 {
  return msSinceInteract >= delayMs ? 1 : 0;
}

/**
 * Advance the eased idle factor one frame. While the user is actively dragging,
 * the target is forced to 0 (no breathing mid-gesture — two motion sources at
 * once feel seasick); otherwise it follows `idleFactorTarget`. The result eases
 * via `dampTo` (τ = IDLE_TAU), so the drift dissolves when the user grabs the
 * camera and resumes — around wherever they left it — after the idle delay.
 *
 * Stays within `[0, 1]` for any `current` in `[0, 1]` (a damp toward a 0/1
 * target is a convex step). Pure; used directly in the composing `useFrame`.
 */
export function nextIdleFactor(
  current: number,
  isDragging: boolean,
  msSinceInteract: number,
  delta: number,
): number {
  const target = isDragging ? 0 : idleFactorTarget(msSinceInteract);
  return dampTo(current, target, delta, IDLE_TAU);
}

// ---------------------------------------------------------------------------
// Keyboard control (PRD 15) — another input source feeding the SAME owned
// camera view-state (pan target + zoom distance), through the SAME clamps as
// wheel/drag. Not a second camera: `Camera.tsx`'s keydown handler maps a key to
// one of these actions and nudges `targetPan`/`targetZoom`, then the existing
// composing `useFrame` eases + composes the idle drift exactly as for the
// mouse. These helpers carry the testable key→delta/step math (§8.1).
// ---------------------------------------------------------------------------

/**
 * Fraction of the visible view *height* one arrow/WASD press pans. A fraction
 * (not a fixed world distance) so a keypress moves the same proportion of the
 * frame at any zoom — consistent feel zoomed in or out, matching the
 * multiplicative wheel.
 */
export const KEY_PAN_FRACTION = 0.15;

/**
 * Multiplicative zoom step per +/- press: zoom *in* divides the distance by
 * this, *out* multiplies by it (~18% per press — a notch comparable to a wheel
 * step, brisk but not jarring).
 */
export const KEY_ZOOM_FACTOR = 1.18;

/** A discrete camera action decoded from a key (or null when unbound). */
export type CameraKeyAction =
  | { readonly kind: "pan"; readonly dx: -1 | 0 | 1; readonly dy: -1 | 0 | 1 }
  | { readonly kind: "zoom"; readonly dir: "in" | "out" }
  | { readonly kind: "reset" };

/**
 * Map a `KeyboardEvent.key` to a camera action, or `null` when the key isn't
 * bound (the caller then ignores it — no `preventDefault`). Bindings:
 *
 * - **Pan** (`dx`/`dy` in screen/world terms — `dx:+1` east, `dy:+1` north):
 *   arrow keys and WASD.
 * - **Zoom:** `+` / `=` / `PageUp` zoom in; `-` / `_` / `PageDown` zoom out.
 * - **Reset:** `0` (deliberately *not* `Escape`, which already closes overlays
 *   / deselects — PRD 15 §5.9).
 *
 * No rotation binding exists — the camera never rotates (§8.1).
 */
export function mapKeyToCameraAction(key: string): CameraKeyAction | null {
  switch (key) {
    case "ArrowLeft":
    case "a":
    case "A":
      return { kind: "pan", dx: -1, dy: 0 };
    case "ArrowRight":
    case "d":
    case "D":
      return { kind: "pan", dx: 1, dy: 0 };
    case "ArrowUp":
    case "w":
    case "W":
      return { kind: "pan", dx: 0, dy: 1 };
    case "ArrowDown":
    case "s":
    case "S":
      return { kind: "pan", dx: 0, dy: -1 };
    case "+":
    case "=":
    case "PageUp":
      return { kind: "zoom", dir: "in" };
    case "-":
    case "_":
    case "PageDown":
      return { kind: "zoom", dir: "out" };
    case "0":
      return { kind: "reset" };
    default:
      return null;
  }
}

/**
 * World-units a single pan keypress moves the pan target, at the given zoom
 * distance — `KEY_PAN_FRACTION` of the visible height `2·zoom·tan(fov/2)` (the
 * same view-height geometry `panWorldDelta` uses). The caller multiplies by the
 * action's `dx`/`dy` and clamps with `clampPanAxis`.
 */
export function keyboardPanWorldStep(zoom: number, fovRad: number): number {
  return KEY_PAN_FRACTION * 2 * zoom * Math.tan(fovRad / 2);
}

/**
 * The new (clamped) zoom distance after one keyboard zoom step. Multiplicative
 * like the wheel — `in` shrinks the distance (closer), `out` grows it — and run
 * through `clampZoom` so keyboard zoom honors the same `[MIN_ZOOM, MAX_ZOOM]`
 * limits. Keyboard zoom is toward the view center (the pan target is unchanged),
 * which is the natural cursorless analogue of the wheel's zoom-toward-cursor.
 */
export function keyboardZoomStep(zoom: number, dir: "in" | "out"): number {
  const factor = dir === "in" ? 1 / KEY_ZOOM_FACTOR : KEY_ZOOM_FACTOR;
  return clampZoom(zoom * factor);
}
