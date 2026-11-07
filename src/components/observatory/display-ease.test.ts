import { describe, expect, it } from "vitest";

import { SWELL_TIME_CONSTANT_S, easeDisplay } from "./display-ease";

describe("SWELL_TIME_CONSTANT_S", () => {
  it("is a sensible positive beat (0.8s — duration.slow, a hair slower than the 0.4s glide)", () => {
    expect(SWELL_TIME_CONSTANT_S).toBeCloseTo(0.8, 10);
    expect(SWELL_TIME_CONSTANT_S).toBeGreaterThan(0);
  });
});

describe("easeDisplay — reduced motion (the honest snap, §6.4)", () => {
  it("snaps straight to the target when reduced, regardless of distance", () => {
    expect(easeDisplay(0, 1, 0.016, 0.8, true)).toBe(1);
    expect(easeDisplay(0.305, 1.0, 0.016, 0.8, true)).toBe(1.0);
  });

  it("snaps even with a tiny delta (the change still HAPPENS — only the animation is removed)", () => {
    // A far target + a near-zero delta: animated, this would barely move; reduced,
    // it must land on the target instantly (the body still reaches its true value).
    expect(easeDisplay(0, 100, 0.0001, 0.8, true)).toBe(100);
  });
});

describe("easeDisplay — animated (the exponential damp)", () => {
  it("moves a fraction of the remaining distance toward the target each step", () => {
    const next = easeDisplay(0, 1, 0.8, 0.8, false); // delta == tau → factor = 1 - e^-1
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
    expect(next).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it("only moves TOWARD the target, never beyond it (honest — never overshoots truth)", () => {
    // Brightness blooming 0.3 → 1.0: every eased step stays within (0.3, 1.0].
    let current = 0.3;
    for (let i = 0; i < 200; i++) {
      const next = easeDisplay(current, 1.0, 0.016, 0.8, false);
      expect(next).toBeGreaterThanOrEqual(current); // forward
      expect(next).toBeLessThanOrEqual(1.0); // never past truth
      current = next;
    }
  });

  it("snaps to the target when within epsilon (no infinite asymptote)", () => {
    expect(easeDisplay(5 - 1e-5, 5, 0.016, 0.8, false)).toBe(5);
    expect(easeDisplay(5, 5, 0.016, 0.8, false)).toBe(5);
  });

  it("delta = 0 is a no-op (rests where it is until a frame advances)", () => {
    expect(easeDisplay(0.4, 1.0, 0, 0.8, false)).toBe(0.4);
  });

  it("tau ≤ 0 resolves immediately to the target (degenerate safety)", () => {
    expect(easeDisplay(0, 1, 0.016, 0, false)).toBe(1);
    expect(easeDisplay(0, 1, 0.016, -1, false)).toBe(1);
  });

  it("a bigger time constant eases more slowly (smaller step per frame)", () => {
    const fast = easeDisplay(0, 1, 0.016, 0.4, false);
    const slow = easeDisplay(0, 1, 0.016, 0.8, false);
    expect(slow).toBeLessThan(fast);
    expect(slow).toBeGreaterThan(0);
  });

  it("is frame-rate independent: one big step ≈ many small steps over the same time", () => {
    const target = 0.5;
    const tau = 0.8;
    const totalTime = 0.5;

    const oneStep = easeDisplay(0, target, totalTime, tau, false);

    let many = 0;
    const smallDelta = totalTime / 60;
    for (let i = 0; i < 60; i++) {
      many = easeDisplay(many, target, smallDelta, tau, false);
    }

    expect(many).toBeCloseTo(oneStep, 6);
  });

  it("converges to the target over time, then snaps exactly", () => {
    let current = 0;
    for (let i = 0; i < 1000; i++) {
      current = easeDisplay(current, 1.0, 0.016, 0.8, false);
    }
    expect(current).toBe(1.0);
  });
});
