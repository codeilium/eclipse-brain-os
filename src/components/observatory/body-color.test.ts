import { Color } from "three";
import { describe, expect, it } from "vitest";

import { color as tokens } from "@/design/tokens";

import { applyBodyColor, bodyColorFromBrightness } from "./body-color";

describe("bodyColorFromBrightness", () => {
  it("returns corona (warm gold) at brightness = 1.0", () => {
    const c = bodyColorFromBrightness(1.0);
    const target = new Color(tokens.corona);
    expect(c.r).toBeCloseTo(target.r, 5);
    expect(c.g).toBeCloseTo(target.g, 5);
    expect(c.b).toBeCloseTo(target.b, 5);
  });

  it("returns dusk (deep purple) at brightness = 0.0", () => {
    const c = bodyColorFromBrightness(0.0);
    const target = new Color(tokens.dusk);
    expect(c.r).toBeCloseTo(target.r, 5);
    expect(c.g).toBeCloseTo(target.g, 5);
    expect(c.b).toBeCloseTo(target.b, 5);
  });

  it("returns amethyst at brightness = 0.5 (segment boundary)", () => {
    const c = bodyColorFromBrightness(0.5);
    const target = new Color(tokens.amethyst);
    expect(c.r).toBeCloseTo(target.r, 5);
    expect(c.g).toBeCloseTo(target.g, 5);
    expect(c.b).toBeCloseTo(target.b, 5);
  });

  it("clamps brightness > 1.0 to corona", () => {
    const c = bodyColorFromBrightness(2.0);
    const target = new Color(tokens.corona);
    expect(c.r).toBeCloseTo(target.r, 5);
  });

  it("clamps brightness < 0.0 to dusk", () => {
    const c = bodyColorFromBrightness(-0.5);
    const target = new Color(tokens.dusk);
    expect(c.r).toBeCloseTo(target.r, 5);
  });

  it("produces a continuous gradient across the brightness range", () => {
    const samples = [0.0, 0.25, 0.5, 0.75, 1.0].map(bodyColorFromBrightness);
    // Each adjacent pair should differ — no abrupt flat segments.
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const diff =
        Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
      expect(diff).toBeGreaterThan(0);
    }
  });
});

describe("applyBodyColor (in-place, per-frame-safe)", () => {
  it("writes the same color bodyColorFromBrightness would, into a caller-owned target", () => {
    for (const b of [0.0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0]) {
      const expected = bodyColorFromBrightness(b);
      const target = new Color();
      applyBodyColor(target, b);
      expect(target.r).toBeCloseTo(expected.r, 10);
      expect(target.g).toBeCloseTo(expected.g, 10);
      expect(target.b).toBeCloseTo(expected.b, 10);
    }
  });

  it("mutates the SAME object (no allocation) rather than returning a new one", () => {
    const target = new Color(0x123456);
    const ret = applyBodyColor(target, 1.0) as unknown;
    expect(ret).toBeUndefined(); // returns void — the target is mutated in place
    const corona = new Color(tokens.corona);
    expect(target.r).toBeCloseTo(corona.r, 5);
    expect(target.g).toBeCloseTo(corona.g, 5);
    expect(target.b).toBeCloseTo(corona.b, 5);
  });

  it("leaves the shared palette anchors intact across many interleaved calls", () => {
    // lerpColors must not mutate the scratch anchors; the endpoints must stay
    // exact no matter what brightnesses were requested before them.
    const scratch = new Color();
    for (const b of [0.2, 0.8, 0.0, 0.51, 0.49, 0.99]) {
      applyBodyColor(scratch, b);
    }
    const warm = new Color();
    applyBodyColor(warm, 1.0);
    const cool = new Color();
    applyBodyColor(cool, 0.0);

    const corona = new Color(tokens.corona);
    const dusk = new Color(tokens.dusk);
    expect(warm.r).toBeCloseTo(corona.r, 10);
    expect(warm.g).toBeCloseTo(corona.g, 10);
    expect(warm.b).toBeCloseTo(corona.b, 10);
    expect(cool.r).toBeCloseTo(dusk.r, 10);
    expect(cool.g).toBeCloseTo(dusk.g, 10);
    expect(cool.b).toBeCloseTo(dusk.b, 10);
  });
});
