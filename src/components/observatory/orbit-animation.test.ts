import { describe, expect, it } from "vitest";

import { easeAngle, forwardTarget, progressToAngle } from "./orbit-animation";

const TWO_PI = Math.PI * 2;

describe("progressToAngle", () => {
  it("maps progress 0 → 0 rad", () => {
    expect(progressToAngle(0)).toBe(0);
  });

  it("maps progress 0.25 → π/2 (90°)", () => {
    expect(progressToAngle(0.25)).toBeCloseTo(Math.PI / 2, 10);
  });

  it("maps progress 0.5 → π (180°)", () => {
    expect(progressToAngle(0.5)).toBeCloseTo(Math.PI, 10);
  });

  it("maps progress 1.0 → 2π (full turn)", () => {
    expect(progressToAngle(1)).toBeCloseTo(TWO_PI, 10);
  });
});

describe("forwardTarget", () => {
  it("returns a target ahead of the current angle for a simple advance (0.20 → 0.25)", () => {
    const current = progressToAngle(0.2);
    const target = forwardTarget(current, 0.25);
    expect(target).toBeCloseTo(progressToAngle(0.25), 10);
    expect(target).toBeGreaterThan(current); // forward
    // Travels a small forward arc (~0.05 of a turn), not most of the way round.
    expect(target - current).toBeCloseTo(0.05 * TWO_PI, 10);
  });

  it("handles the 0.95 → 0.05 wrap by traveling FORWARD through 1.0, not backward", () => {
    const current = progressToAngle(0.95);
    const target = forwardTarget(current, 0.05);
    // Unwrapped target should be ~1.05 turns, i.e. a forward arc of ~0.10.
    expect(target).toBeCloseTo(1.05 * TWO_PI, 10);
    expect(target).toBeGreaterThan(current);
    expect(target - current).toBeCloseTo(0.1 * TWO_PI, 10);
    // It must NOT be the backward path (~0.90 of a turn the other way).
    expect(target - current).toBeLessThan(0.5 * TWO_PI);
  });

  it("handles the 0.75 → 0.0 orbit-completion wrap (forward quarter through the boundary)", () => {
    const current = progressToAngle(0.75);
    const target = forwardTarget(current, 0); // orbit completed, progress reset to 0
    expect(target).toBeCloseTo(TWO_PI, 10); // continue forward to the 1.0/0.0 point
    expect(target - current).toBeCloseTo(0.25 * TWO_PI, 10);
  });

  it("rests at the current angle when the target progress is unchanged (no spurious motion)", () => {
    const current = progressToAngle(0.42);
    const target = forwardTarget(current, 0.42);
    expect(target).toBeCloseTo(current, 9);
  });

  it("keeps advancing forward when the current angle has accumulated past 2π", () => {
    // After several wraps the displayed angle can exceed 2π; the next advance
    // must still resolve to a forward target above it.
    const current = 1.05 * TWO_PI; // resting at progress 0.05, one turn in
    const target = forwardTarget(current, 0.3); // advance to progress 0.30
    expect(target).toBeCloseTo(1.3 * TWO_PI, 10);
    expect(target - current).toBeCloseTo(0.25 * TWO_PI, 10);
  });

  it("normalizes out-of-range target progress before unwrapping", () => {
    // A defensive case: progress should be [0,1) but normalize anyway.
    const current = progressToAngle(0.1);
    const target = forwardTarget(current, 1.25); // ≡ 0.25
    expect(target).toBeCloseTo(progressToAngle(0.25), 10);
  });
});

describe("easeAngle", () => {
  it("moves a fraction of the remaining distance toward the target each step", () => {
    const next = easeAngle(0, 1, 0.4, 0.4); // delta == timeConstant → factor = 1 - e^-1 ≈ 0.632
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
    expect(next).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it("snaps to the target when within epsilon (no infinite asymptote)", () => {
    const target = 5;
    expect(easeAngle(5 - 1e-5, target, 0.016, 0.4)).toBe(target);
    expect(easeAngle(target, target, 0.016, 0.4)).toBe(target);
  });

  it("is frame-rate independent: one big step ≈ many small steps over the same time", () => {
    const start = 0;
    const target = 2;
    const tau = 0.4;
    const totalTime = 0.5;

    // One large delta.
    const oneStep = easeAngle(start, target, totalTime, tau);

    // Sixty small deltas summing to the same elapsed time.
    let many = start;
    const smallDelta = totalTime / 60;
    for (let i = 0; i < 60; i++) {
      many = easeAngle(many, target, smallDelta, tau);
    }

    expect(many).toBeCloseTo(oneStep, 6);
  });

  it("eases backward too (the sign of the step follows target - current)", () => {
    const next = easeAngle(2, 0, 0.1, 0.4);
    expect(next).toBeLessThan(2);
    expect(next).toBeGreaterThan(0);
  });

  it("converges to the target over time, then snaps exactly (no asymptote)", () => {
    let current = 0;
    const target = 10;
    // ~8s of 60fps frames — well past the point the remaining gap drops below
    // the 1e-4 snap epsilon, so it lands on the target exactly.
    for (let i = 0; i < 500; i++) {
      current = easeAngle(current, target, 0.016, 0.4);
    }
    expect(current).toBe(target);
  });
});
