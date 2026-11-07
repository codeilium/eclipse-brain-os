import type { StarId } from "@/universe";

/**
 * Compute a deterministic 3D position for a star given its ID. Stars are
 * laid out on a roughly-flat ANNULUS centered at the origin — a disk with a
 * guaranteed radial clearing around the galaxy's heart — with slight Z
 * scatter for parallax against the ambient camera drift.
 *
 * Determinism matters: the same star ID always returns the same position,
 * so a user's stars are in the same places across reloads. Spatial memory
 * is part of how the universe becomes *theirs* — "Python is over there
 * on the left."
 *
 * Layout parameters:
 * - XY radius ∈ [STAR_SEED_INNER_EXCLUSION, DISK_RADIUS] (currently [1.5, 6])
 * - Z ∈ [-DEPTH_SCATTER, +DEPTH_SCATTER] (currently ±0.5 units)
 *
 * The radius lets the universe SPREAD OUT and breathe: stars seed across a
 * wide field with real void between systems. The camera (PRD 13: zoom + pan)
 * is what makes the whole field reachable — the pan bound is derived from
 * this constant (PAN_BOUND = DISK_RADIUS + margin), so the user can bring any
 * star, even one at the disk edge, to screen center even though the field is
 * far wider than a single viewport. No star is ever stranded off-screen.
 * Star positions are NOT scaled by SYSTEM_VISUAL_SCALE, so this radius is the
 * true world-space extent of star centers.
 *
 * The story here used to be the opposite. With a FIXED camera (pre-PRD-13)
 * the radius had to be SHRUNK to fit one viewport — it was reduced ±4.5 →
 * ±2.4 so every seeded star stayed inside the visible frame, trading a wider
 * layout for guaranteed visibility. PRD 13's camera removed that constraint,
 * so this by-eye retune loosened it the other way: ±6 is wider than even the
 * original ±4.5. The camera, not a shrunken seeding radius, now keeps every
 * star reachable; the disk is free to be generous so the universe reads as
 * space rather than a crowded frame. (Determinism is untouched — same FNV-1a
 * → mulberry32 hashing; only the radius widened.)
 *
 * PRD 29 added the INNER EXCLUSION: the raw seed used to be uniform in the
 * SQUARE ±DISK_RADIUS (radius up to DISK_RADIUS·√2 at the corners), with
 * nothing keeping a star off the origin — so a star could seed over the black
 * hole, crowding its ring (PRD 23/26) and contesting its hit disc (PRD 28).
 * Now the radial component alone is remapped into the annulus
 * [STAR_SEED_INNER_EXCLUSION, DISK_RADIUS] (see `remapToAnnulus`): same hash,
 * same draws, angle preserved exactly, z untouched. Existing stars relocate
 * once — and that is honest: position has always been presentation derived
 * from the id, never earned state (the PRD 16 proof); nothing in the record
 * moves, and after this the same id maps to its new position forever.
 */
// Exported so the camera-control layer derives its pan bounds from the seeding
// radius rather than hardcoding a magic number — keeping the two correct
// relative to each other (observatory/camera-controls.ts:
// PAN_BOUND = DISK_RADIUS + PAN_MARGIN). That parameterization paid off in this
// retune: widening the disk (2.4 → 6) automatically widened the reachable pan
// bound (3.6 → 7.2), with no camera change needed. (PRD 29's annulus is a
// subset of the disk, so the pan bound is unaffected.)
export const DISK_RADIUS = 6;
const DEPTH_SCATTER = 0.5;

/**
 * The heart's clearing (PRD 29): no star may seed within this radius of the
 * origin, where the black hole lives. The guarantee covers the heart's full
 * interactive reach — the invisible hit disc spans
 * BLACKHOLE_MAX_RADIUS × SYSTEM_VISUAL_SCALE = 0.85 × 0.54 ≈ 0.46 world
 * units — plus a young system's spatial reach (fresh planet-0 shell ≈ 1.21
 * unscaled × 0.54 ≈ 0.65 world), with ~0.4 margin. A by-eye craft default
 * (Codeilium's nudge knob); DISK_RADIUS = 6 keeps the remaining annulus
 * generous. Residual edges, named not fixed: a fully GROWN system seeded near
 * the inner rim can still reach over the center (dynamic repulsion would
 * break pure id→position — out of scope), and star–star spacing stays
 * deferred (set-dependent layout, the named future PRD).
 */
export const STAR_SEED_INNER_EXCLUSION = 1.5;

/**
 * Hash a string to a 32-bit unsigned integer using FNV-1a, then use it
 * as the seed for a mulberry32 PRNG. This gives us per-star deterministic
 * randomness without needing a real crypto hash.
 */
function hashStringToSeed(str: string): number {
  let h = 2166136261 >>> 0; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV prime
  }
  return h >>> 0;
}

/**
 * Tiny deterministic PRNG (mulberry32). Pure — usable inside useMemo. The
 * same function lives (unexported) in the atmosphere's DustMotes; it is
 * copied here rather than shared so the stars module stays self-contained
 * and DustMotes stays untouched.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Remap a square-seeded (x, y) into the annulus
 * [STAR_SEED_INNER_EXCLUSION, DISK_RADIUS] — PRD 29's whole logic change.
 *
 * The raw seed is uniform in the square ±DISK_RADIUS. For that distribution
 * the Chebyshev-normalized radius t = max(|x|,|y|)/DISK_RADIUS has t² uniform
 * on [0,1] *independently of angle* — exactly the radial CDF of a uniform
 * disk. So t feeds the standard area-preserving annulus remap
 * r' = √(INNER² + t²·(R² − INNER²)), giving a radially area-uniform annulus:
 * no pile-up on the inner rim, and far stars barely move (the normalized
 * displacement r'/R − t is ≥ 0 and strictly decreasing in t; at t = 0.9 the
 * radial shift is ≈ 0.04 world units). The square's corners (raw radius up to
 * DISK_RADIUS·√2) fold inside the disk proper — the one sizeable relocation,
 * forced by the annulus's outer bound. The vector is scaled, never rotated:
 * angle preservation is exact, no trig involved.
 *
 * Exported for the sweep tests — the dead-center branch is unreachable
 * through any practical id, but the function must be total.
 */
export function remapToAnnulus(
  x: number,
  y: number,
): readonly [number, number] {
  const t = Math.max(Math.abs(x), Math.abs(y)) / DISK_RADIUS;
  const targetRadius = Math.sqrt(
    STAR_SEED_INNER_EXCLUSION ** 2 +
      t * t * (DISK_RADIUS ** 2 - STAR_SEED_INNER_EXCLUSION ** 2),
  );
  const flatRadius = Math.hypot(x, y);
  if (flatRadius === 0) {
    // A dead-center raw seed has no angle; place it on the inner rim at
    // angle 0 so the function stays total and deterministic.
    return [STAR_SEED_INNER_EXCLUSION, 0];
  }
  const scale = targetRadius / flatRadius;
  return [x * scale, y * scale];
}

/**
 * Compute the deterministic 3D position for a star.
 *
 * The position is a function of the star's ID *only* — not its index in
 * the array, not the current universe state, nothing else. This means:
 * - Adding a new star never moves existing stars
 * - Reloading the page never changes positions
 * - Deleting a star and recreating it with a new ID *will* give a new position
 *   (but that's correct — new IDs are new entities)
 */
export function starPositionFromId(
  id: StarId,
): readonly [number, number, number] {
  const rand = mulberry32(hashStringToSeed(id));
  const x = (rand() - 0.5) * 2 * DISK_RADIUS;
  const y = (rand() - 0.5) * 2 * DISK_RADIUS;
  const z = (rand() - 0.5) * 2 * DEPTH_SCATTER;
  const [annulusX, annulusY] = remapToAnnulus(x, y);
  return [annulusX, annulusY, z];
}
