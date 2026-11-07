import { describe, expect, it } from "vitest";

import type { StarId } from "@/universe";

import { BLACKHOLE_MAX_RADIUS } from "../center/BlackHoleMaterial";
import { SYSTEM_VISUAL_SCALE } from "../scale";
import {
  DISK_RADIUS,
  STAR_SEED_INNER_EXCLUSION,
  remapToAnnulus,
  starPositionFromId,
} from "./position";

describe("starPositionFromId", () => {
  it("returns the same position for the same ID", () => {
    const id = "test-star-1" as StarId;
    const p1 = starPositionFromId(id);
    const p2 = starPositionFromId(id);
    expect(p1).toEqual(p2);
  });

  it("returns different positions for different IDs", () => {
    const a = starPositionFromId("alpha" as StarId);
    const b = starPositionFromId("beta" as StarId);
    expect(a).not.toEqual(b);
  });

  it("positions are within the configured bounds", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"] as StarId[];
    for (const id of ids) {
      const [x, y, z] = starPositionFromId(id);
      expect(Math.abs(x)).toBeLessThanOrEqual(DISK_RADIUS);
      expect(Math.abs(y)).toBeLessThanOrEqual(DISK_RADIUS);
      expect(Math.abs(z)).toBeLessThanOrEqual(0.5);
    }
  });

  it("keeps every seeded star within the disk radius (the containment invariant)", () => {
    // The invariant: every star center seeds within ±DISK_RADIUS — asserted
    // against the imported constant (not a hardcoded number) so it survives
    // retunes of the disk. DISK_RADIUS was widened (±2.4 → ±6) once PRD 13's
    // camera made the whole field reachable (the camera's pan bound is derived
    // from this same constant, so a wider disk stays pannable). Sampled across
    // real-flow IDs (crypto.randomUUID, exactly what createStar emits) so the
    // guarantee holds for a busy universe.
    for (let i = 0; i < 500; i++) {
      const id = crypto.randomUUID() as StarId;
      const [x, y, z] = starPositionFromId(id);
      expect(Math.abs(x)).toBeLessThanOrEqual(DISK_RADIUS);
      expect(Math.abs(y)).toBeLessThanOrEqual(DISK_RADIUS);
      expect(Math.abs(z)).toBeLessThanOrEqual(0.5);
    }
  });

  it("UUID-shaped IDs give well-distributed positions", () => {
    // Sample real-ish UUIDs and confirm they spread (rather than clustering)
    const uuids = [
      "a8e7b3c0-5d1f-4e2a-9c3b-8d2f1e0a7b6c",
      "b1c9d2e3-4f5a-6b7c-8d9e-0f1a2b3c4d5e",
      "c2d3e4f5-6a7b-8c9d-0e1f-2a3b4c5d6e7f",
    ] as StarId[];
    const positions = uuids.map(starPositionFromId);
    // Sanity check: no two positions are identical
    expect(positions[0]).not.toEqual(positions[1]);
    expect(positions[1]).not.toEqual(positions[2]);
  });
});

describe("the inner exclusion (PRD 29)", () => {
  // The raw square seed, replicated verbatim from position.ts (FNV-1a →
  // mulberry32 → three draws). The sweep compares each id's remapped position
  // against its pre-remap vector — angle preservation, z passthrough, and the
  // displacement profile are all relative claims, so the raw seed is the
  // reference. If the hash or the draws ever drift, every relative assertion
  // here fails loudly.
  function rawSquareSeed(id: string): readonly [number, number, number] {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let a = h >>> 0;
    const rand = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const x = (rand() - 0.5) * 2 * DISK_RADIUS;
    const y = (rand() - 0.5) * 2 * DISK_RADIUS;
    const z = (rand() - 0.5) * 2 * 0.5;
    return [x, y, z];
  }

  // 2000 fixed ids (deterministic, greppable) + 500 real-flow UUIDs (exactly
  // what createStar emits), each paired with its raw pre-remap seed.
  const sweepIds: StarId[] = [
    ...Array.from({ length: 2000 }, (_, i) => `prd29-sweep-${i}` as StarId),
    ...Array.from({ length: 500 }, () => crypto.randomUUID() as StarId),
  ];
  const sweep = sweepIds.map((id) => ({
    id,
    raw: rawSquareSeed(id),
    pos: starPositionFromId(id),
  }));

  // One float ulp of slack on the annulus bounds: the radius is reconstructed
  // through hypot of a scaled vector, so the boundary cases may round a hair
  // past the exact constants. Physically meaningless; documented honesty.
  const EPS = 1e-9;

  it("every seeded star lands strictly inside the annulus", () => {
    for (const { pos } of sweep) {
      const radius = Math.hypot(pos[0], pos[1]);
      expect(radius).toBeGreaterThanOrEqual(STAR_SEED_INNER_EXCLUSION - EPS);
      expect(radius).toBeLessThanOrEqual(DISK_RADIUS + EPS);
    }
  });

  it("preserves the seeding angle exactly (the vector is scaled, never rotated)", () => {
    for (const { raw, pos } of sweep) {
      const rawNorm = Math.hypot(raw[0], raw[1]);
      const newNorm = Math.hypot(pos[0], pos[1]);
      // Normalized cross product ≈ 0 (collinear) AND dot product > 0 (same
      // direction, not flipped 180°).
      const cross = raw[0] * pos[1] - raw[1] * pos[0];
      const dot = raw[0] * pos[0] + raw[1] * pos[1];
      expect(Math.abs(cross) / (rawNorm * newNorm)).toBeLessThan(1e-12);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it("passes z through untouched (parallax scatter is unrelated to the xy clearing)", () => {
    for (const { raw, pos } of sweep) {
      expect(pos[2]).toBe(raw[2]);
    }
  });

  it("is deterministic across repeated calls", () => {
    for (const { id, pos } of sweep.filter((_, i) => i % 50 === 0)) {
      expect(starPositionFromId(id)).toEqual(pos);
    }
  });

  it("displacement shrinks as the seed sits farther out (no pile-up on the inner rim)", () => {
    // The remap's signature: in the normalized frame (t = Chebyshev radius of
    // the raw seed / DISK_RADIUS, which is area-uniform like a disk's r/R),
    // the radial displacement d(t) = r'/R − t is ≥ 0 (everything moves outward
    // or stays) and strictly decreasing in t — formerly-central stars push out
    // the most, far stars barely move. Sorted by t, d must be non-increasing.
    const samples = sweep
      .map(({ raw, pos }) => {
        const t = Math.max(Math.abs(raw[0]), Math.abs(raw[1])) / DISK_RADIUS;
        const d = Math.hypot(pos[0], pos[1]) / DISK_RADIUS - t;
        return { t, d };
      })
      .sort((a, b) => a.t - b.t);
    let previousD = Number.POSITIVE_INFINITY;
    for (const sample of samples) {
      expect(sample.d).toBeGreaterThanOrEqual(-EPS);
      expect(sample.d).toBeLessThanOrEqual(previousD + EPS);
      previousD = sample.d;
    }
    // And the concrete far band: the outer 10% (by t) shifts radially by less
    // than 0.05 world units — far stars genuinely barely move.
    const far = samples.filter((s) => s.t >= 0.9);
    expect(far.length).toBeGreaterThan(0);
    for (const s of far) {
      expect(Math.abs(s.d) * DISK_RADIUS).toBeLessThan(0.05);
    }
  });

  it("relocates the old near-origin offenders clear of the heart, angle intact", () => {
    // Ids whose RAW seed sat within 0.5 of the origin — the stars that used to
    // draw over the black hole's ring and contest its hit disc. Require a
    // real population so the assertion can't pass vacuously.
    const offenders = sweep.filter(
      ({ raw }) => Math.hypot(raw[0], raw[1]) < 0.5,
    );
    expect(offenders.length).toBeGreaterThanOrEqual(5);
    for (const { raw, pos } of offenders) {
      const radius = Math.hypot(pos[0], pos[1]);
      expect(radius).toBeGreaterThanOrEqual(STAR_SEED_INNER_EXCLUSION - EPS);
      // Still on its old ray: same direction out of the origin.
      expect(raw[0] * pos[0] + raw[1] * pos[1]).toBeGreaterThan(0);
    }
  });

  it("folds the square's corners inside the disk proper", () => {
    // The raw seed was uniform in the SQUARE ±DISK_RADIUS, so its radius
    // reached DISK_RADIUS·√2 at the corners — outside the disk the layout has
    // always claimed. The annulus's outer bound folds them in.
    const corners = sweep.filter(
      ({ raw }) => Math.hypot(raw[0], raw[1]) > DISK_RADIUS,
    );
    expect(corners.length).toBeGreaterThan(0);
    for (const { pos } of corners) {
      expect(Math.hypot(pos[0], pos[1])).toBeLessThanOrEqual(DISK_RADIUS + EPS);
    }
  });

  it("handles the degenerate dead-center seed totally", () => {
    // Unreachable through any practical id (both xy draws landing exactly on
    // 0.5), but the remap must be total: no angle to preserve, so the inner
    // rim at angle 0.
    expect(remapToAnnulus(0, 0)).toEqual([STAR_SEED_INNER_EXCLUSION, 0]);
  });

  it("clears the black hole's interactive reach with room for a young system", () => {
    // The clearing exists FOR the heart: the invisible hit disc (PRD 28)
    // spans BLACKHOLE_MAX_RADIUS × SYSTEM_VISUAL_SCALE ≈ 0.46 world units,
    // and a freshly-seeded star's planet shell reaches ≈ 0.65 world. The
    // exclusion must cover both — if either side of this inequality is ever
    // retuned past the other, this fails and the constant needs a fresh look.
    const hitDiscReach = BLACKHOLE_MAX_RADIUS * SYSTEM_VISUAL_SCALE;
    const youngSystemReach = 0.65;
    expect(STAR_SEED_INNER_EXCLUSION).toBeGreaterThan(
      hitDiscReach + youngSystemReach,
    );
  });
});
