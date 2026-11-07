import { Color } from "three";

import { color } from "@/design/tokens";

/**
 * The warm→cool palette anchors, decoded once at module load (three's color
 * management is enabled, so `new Color(hex)` decodes sRGB → the linear working
 * space). These are SCRATCH read-only references for `applyBodyColor`: it
 * interpolates *between* them into a caller-owned target via `lerpColors`, which
 * never mutates its arguments — so the anchors stay intact across calls and no
 * allocation happens per call.
 */
const CORONA = new Color(color.corona);
const AMETHYST = new Color(color.amethyst);
const DUSK = new Color(color.dusk);

/**
 * Write a body's warm→cool color for a given brightness (in [0, 1]) INTO an
 * existing `Color`, allocating nothing. This is the per-frame-safe form of the
 * mapping — used by the growth-swell ease (`display-ease.ts`), which mutates a
 * material's `color` / `emissive` / halo `uColor` in place each frame as the
 * displayed brightness eases toward its computed target (r3f-conventions.md
 * §6.4 / §9.1). See `bodyColorFromBrightness` for the curve's rationale.
 *
 * - brightness ≥ 0.5 → interpolate `amethyst` → `corona` (cool purple → warm gold)
 * - brightness < 0.5 → interpolate `dusk` → `amethyst` (dim ember → cool purple)
 *
 * `lerpColors(a, b, t)` sets `target` to the linear interpolation of `a`,`b`
 * without touching either — identical math to the original `a.clone().lerp(b, t)`.
 */
export function applyBodyColor(target: Color, brightness: number): void {
  // Clamp to [0, 1] defensively (the Brightness branded type guarantees this,
  // but we accept raw numbers here for testability and per-frame eased values).
  const b = Math.max(0, Math.min(1, brightness));

  if (b >= 0.5) {
    // High brightness: amethyst → corona as b goes 0.5 → 1.
    target.lerpColors(AMETHYST, CORONA, (b - 0.5) / 0.5);
  } else {
    // Low brightness: dusk → amethyst as b goes 0 → 0.5.
    target.lerpColors(DUSK, AMETHYST, b / 0.5);
  }
}

/**
 * Map a body's brightness (in [0, 1]) to its rendered color along the
 * warm→cool axis. Shared by stars (PRD 6) and planets (PRD 7); any future
 * body type that maps brightness to color uses this same helper.
 *
 * - brightness = 1.0 → `corona` (full warm gold)
 * - brightness = 0.5 → `amethyst` (cool purple — the segment boundary)
 * - brightness = 0.0 → `dusk` (deeper, near-violet purple — a dim ember)
 *
 * The mapping uses two segments rather than a linear interpolation across
 * three colors so the transition at brightness ≈ 0.1 gives "neglected" bodies
 * a recognizable cool tone — they don't just look "dim gold," they look
 * *temperature-different*. This is the warm/cool meaning system in action.
 *
 * Allocates a new `Color`, so it is for one-off use (mount, tests). For
 * per-frame color interpolation use the in-place `applyBodyColor` instead; this
 * function delegates to it so the two-segment curve has a single source.
 */
export function bodyColorFromBrightness(brightness: number): Color {
  const c = new Color();
  applyBodyColor(c, brightness);
  return c;
}
