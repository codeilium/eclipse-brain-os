/**
 * The toroidal mote-field wrap (PRD 31 — the endless dust).
 *
 * The dust motes are seeded once into a fixed WRAP_BOX_WIDTH × WRAP_BOX_HEIGHT
 * box, and each frame their rendered position is wrapped modulo that box
 * *centered on the camera's pan* — a mote leaving one edge re-enters at the
 * opposite edge, so the field follows the camera wherever it goes. Constant
 * count ⇒ constant density; coverage is infinite by construction; the dynamic
 * pan bound (PRD 23's `panBoundForExtent`) is irrelevant, however far it grows.
 *
 * Everything here is pure — no React, no three.js, no state — so it is
 * unit-tested in isolation and `DustMotes.tsx` can call it inside `useFrame`
 * with no per-frame allocations (numbers in, numbers out).
 */

// ---------------------------------------------------------------------------
// The wrap box — sized so a wrap can NEVER happen on-screen, at any zoom.
//
// Derivation (worst case, from the real camera math — PRD 31 pre-flight):
//   - fov 60° vertical (Observatory's <Canvas>), camera z = MAX_ZOOM = 10.
//   - Motes live at z ∈ [1, 4] with z-drift ≤ 0.1 → lowest plane z = 0.9, the
//     farthest from the camera → the largest visible footprint: distance 9.1.
//   - The camera's idle drift offsets it from the pan target by ≤ ±0.6 x /
//     ±0.3 y at MAX_ZOOM (lissajous amplitudes 0.3/0.15 × zoom/DEFAULT_ZOOM),
//     and the lookAt(pan) turns that offset into a frustum tilt of ≤ 3.43° (x)
//     / 1.72° (y). The wrap is centered on camera.position (which includes the
//     offset), so the tilted frustum edge is the binding constraint.
//   - Vertical:   9.1 · tan(30° + 1.72°)              ≈ 5.63
//                 + mote y-drift 0.2                   → 5.83  → half-H = 6.
//   - Horizontal: aspect ceiling 32:9 (A = 3.556 — the widest commercial
//     display class, so a wrap is impossible on ANY screen, by construction):
//                 9.1 · tan(atan(tan 30° · A) + 3.43°) ≈ 22.0
//                 + mote x-drift 0.3                   → 22.3  → half-W = 23.
//   The slack (≈ 0.7 x / 0.17 y) also absorbs the ≤ 1-frame lag of reading the
//   camera from a sibling useFrame. A mote can therefore only ever wrap while
//   off-screen — no pops, at any zoom, on any display.
//
// The locking inequality is asserted in wrap.test.ts against MAX_ZOOM, so a
// camera retune that would let a wrap on-screen fails loudly.
// ---------------------------------------------------------------------------

/** World-units width of the mote wrap box (x axis). See derivation above. */
export const WRAP_BOX_WIDTH = 46;

/** World-units height of the mote wrap box (y axis). See derivation above. */
export const WRAP_BOX_HEIGHT = 12;

/**
 * Wrap a coordinate into the half-open interval
 * `[center − extent/2, center + extent/2)` by adding the integer multiple of
 * `extent` that lands it inside — the 1-D torus. The lower edge maps to
 * itself; the upper edge wraps to the lower (half-open, so the box tiles the
 * line with no double-covered seam). Precondition: `extent > 0`.
 *
 * Pure and deterministic; returns a number (no allocation), so it is safe to
 * call per mote per frame. A value already inside the box returns *itself*
 * (bit-for-bit — the common case is two comparisons, and the wrap never
 * perturbs an on-screen mote by a float rounding step).
 */
export function wrapToBox(value: number, center: number, extent: number): number {
  const min = center - extent / 2;
  if (value >= min && value < center + extent / 2) return value;
  return min + ((((value - min) % extent) + extent) % extent);
}
