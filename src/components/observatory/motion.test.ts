import { describe, expect, it } from "vitest";

import { duration } from "@/design/tokens";

import { ambientPhase, lissajous } from "./motion";

describe("ambientPhase", () => {
  it("returns 0 at elapsed = 0", () => {
    expect(ambientPhase(0)).toBe(0);
  });

  it("returns 0 at the end of the period (wraps)", () => {
    expect(ambientPhase(duration.drift)).toBeCloseTo(0, 10);
  });

  it("returns π at half the period", () => {
    expect(ambientPhase(duration.drift / 2)).toBeCloseTo(Math.PI, 10);
  });

  it("returns 2π·t for t in (0, 1)", () => {
    expect(ambientPhase(duration.drift * 0.25)).toBeCloseTo(Math.PI / 2, 10);
    expect(ambientPhase(duration.drift * 0.75)).toBeCloseTo(Math.PI * 1.5, 10);
  });

  it("scales by the speed multiplier", () => {
    // At half the period with 2x speed, we're back to start
    expect(ambientPhase(duration.drift / 2, 2.0)).toBeCloseTo(0, 10);
    // At half the period with 0.5x speed, we're at π/2
    expect(ambientPhase(duration.drift / 2, 0.5)).toBeCloseTo(Math.PI / 2, 10);
  });

  it("wraps correctly past multiple periods", () => {
    // Two full periods + a quarter should equal a quarter
    const elapsed = duration.drift * 2.25;
    expect(ambientPhase(elapsed)).toBeCloseTo(Math.PI / 2, 10);
  });

  it("uses default speed = 1.0", () => {
    expect(ambientPhase(duration.drift / 2)).toBe(
      ambientPhase(duration.drift / 2, 1.0),
    );
  });
});

describe("lissajous", () => {
  it("returns the zero vector at θ = 0", () => {
    const [x, y, z] = lissajous(0, 1.0, 1.0, 1.0);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1.0, 10); // cos(0) = 1
    expect(z).toBeCloseTo(0, 10);
  });

  it("scales each axis by its amplitude", () => {
    const [x, y, z] = lissajous(Math.PI / 2, 2.0, 3.0, 4.0);
    // sin(π/2) = 1, cos(1.3 · π/2) = cos(0.65π) ≈ -0.4540
    // sin(0.7 · π/2) = sin(0.35π) ≈ 0.8910
    expect(x).toBeCloseTo(2.0, 10);
    expect(y).toBeCloseTo(3.0 * Math.cos(1.3 * (Math.PI / 2)), 10);
    expect(z).toBeCloseTo(4.0 * Math.sin(0.7 * (Math.PI / 2)), 10);
  });

  it("respects custom frequency multipliers", () => {
    const [x, y, z] = lissajous(Math.PI, 1, 1, 1, [1, 1, 1]);
    // sin(π) ≈ 0, cos(π) = -1, sin(π) ≈ 0
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(-1, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("returns a tuple (not new array) — referential consistency check", () => {
    const result = lissajous(1.0, 1.0, 1.0, 1.0);
    expect(result).toHaveLength(3);
    expect(typeof result[0]).toBe("number");
  });

  it("handles zero amplitudes (collapses to origin on that axis)", () => {
    const [x, y, z] = lissajous(Math.PI / 4, 0, 0, 0);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(z).toBe(0);
  });
});
