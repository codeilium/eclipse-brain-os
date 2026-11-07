import { describe, expect, it } from "vitest";

import { WRAP_BOX_HEIGHT, WRAP_BOX_WIDTH, wrapToBox } from "./wrap";
import { MAX_ZOOM } from "../camera-controls";

/** The half-open wrap interval for (center, extent). */
function bounds(center: number, extent: number): readonly [number, number] {
  return [center - extent / 2, center + extent / 2];
}

describe("wrapToBox — interval membership", () => {
  it("returns values already inside the box unchanged", () => {
    expect(wrapToBox(0, 0, 10)).toBe(0);
    expect(wrapToBox(3.2, 0, 10)).toBe(3.2);
    expect(wrapToBox(-4.999, 0, 10)).toBe(-4.999);
    expect(wrapToBox(7.5, 7, 10)).toBe(7.5);
  });

  it("wraps a value far ABOVE the box into [center − extent/2, center + extent/2)", () => {
    const [min, max] = bounds(2, 8);
    const wrapped = wrapToBox(1000.25, 2, 8);
    expect(wrapped).toBeGreaterThanOrEqual(min);
    expect(wrapped).toBeLessThan(max);
    // The wrap is a pure translation by a whole number of periods.
    expect((1000.25 - wrapped) / 8).toBeCloseTo(Math.round((1000.25 - wrapped) / 8), 9);
  });

  it("wraps a value far BELOW the box into [center − extent/2, center + extent/2)", () => {
    const [min, max] = bounds(-3, 12);
    const wrapped = wrapToBox(-987.6, -3, 12);
    expect(wrapped).toBeGreaterThanOrEqual(min);
    expect(wrapped).toBeLessThan(max);
    expect((-987.6 - wrapped) / 12).toBeCloseTo(Math.round((-987.6 - wrapped) / 12), 9);
  });
});

describe("wrapToBox — the period identity", () => {
  it("wrap(x + extent) === wrap(x): one full period away lands on the same point", () => {
    // Exactly-representable values so the identity holds bit-for-bit.
    expect(wrapToBox(1.5 + 8, 0, 8)).toBe(wrapToBox(1.5, 0, 8));
    expect(wrapToBox(-6.25 + 8, 0, 8)).toBe(wrapToBox(-6.25, 0, 8));
    expect(wrapToBox(3 + 46, 5, 46)).toBe(wrapToBox(3, 5, 46));
  });

  it("holds across many periods in both directions (within float tolerance)", () => {
    for (let k = -7; k <= 7; k++) {
      expect(wrapToBox(2.3 + k * 11, -1.5, 11)).toBeCloseTo(wrapToBox(2.3, -1.5, 11), 9);
    }
  });
});

describe("wrapToBox — exact edges (half-open interval)", () => {
  it("the lower edge (center − extent/2) maps to itself", () => {
    expect(wrapToBox(-5, 0, 10)).toBe(-5);
    expect(wrapToBox(2 - 4, 2, 8)).toBe(-2);
  });

  it("the upper edge (center + extent/2) wraps to the lower edge — no double-covered seam", () => {
    expect(wrapToBox(5, 0, 10)).toBe(-5);
    expect(wrapToBox(2 + 4, 2, 8)).toBe(-2);
  });
});

describe("wrapToBox — determinism", () => {
  it("identical inputs always produce identical outputs", () => {
    const a = wrapToBox(123.456, -7.89, 46);
    for (let i = 0; i < 100; i++) {
      expect(wrapToBox(123.456, -7.89, 46)).toBe(a);
    }
  });
});

describe("wrapToBox — sweep", () => {
  it("stays in-interval with a whole-period displacement for a grid of value/center/extent", () => {
    const values = [-1e6, -123.4, -8, -0.001, 0, 0.7, 5, 99.9, 1e6];
    const centers = [-20, -3.5, 0, 4.25, 17];
    const extents = [0.5, 3, 12, 46];
    for (const extent of extents) {
      for (const center of centers) {
        const [min, max] = bounds(center, extent);
        for (const value of values) {
          const wrapped = wrapToBox(value, center, extent);
          expect(wrapped).toBeGreaterThanOrEqual(min);
          expect(wrapped).toBeLessThan(max);
          // value − wrapped is an integer multiple of the extent (a torus, not a clamp).
          const periods = (value - wrapped) / extent;
          expect(periods).toBeCloseTo(Math.round(periods), 6);
        }
      }
    }
  });
});

describe("the wrap box covers the worst-case visible extent (the no-pop inequality)", () => {
  // Replicas of the render-layer numbers the derivation in wrap.ts rests on
  // (literals with their sources, the PRD 29 cross-module-inequality pattern —
  // MAX_ZOOM itself is imported live so a camera retune fails this loudly):
  const FOV_HALF_RAD = (30 * Math.PI) / 180; // Observatory <Canvas> fov 60° (vertical)
  const ASPECT_CEILING = 32 / 9; // widest commercial display class (PRD 31 call)
  const MOTE_MIN_Z = 1 - 0.1; // DustMotes: origin z ≥ 1, z-drift amplitude ≤ 0.1
  const MOTE_DRIFT_X = 0.3; // DustMotes: max x drift amplitude
  const MOTE_DRIFT_Y = 0.2; // DustMotes: max y drift amplitude
  // Camera idle-drift offset at MAX_ZOOM: lissajous (0.3, 0.15) × zoom/DEFAULT_ZOOM(5).
  const CAM_DRIFT_X = 0.3 * (MAX_ZOOM / 5);
  const CAM_DRIFT_Y = 0.15 * (MAX_ZOOM / 5);

  it("half-width exceeds the tilted 32:9 frustum at the lowest mote plane plus the drift margin", () => {
    const distance = MAX_ZOOM - MOTE_MIN_Z; // 9.1
    const halfAngleX = Math.atan(Math.tan(FOV_HALF_RAD) * ASPECT_CEILING);
    const tiltX = Math.atan(CAM_DRIFT_X / MAX_ZOOM);
    const needed = distance * Math.tan(halfAngleX + tiltX) + MOTE_DRIFT_X;
    expect(WRAP_BOX_WIDTH / 2).toBeGreaterThan(needed);
  });

  it("half-height exceeds the tilted vertical frustum at the lowest mote plane plus the drift margin", () => {
    const distance = MAX_ZOOM - MOTE_MIN_Z;
    const tiltY = Math.atan(CAM_DRIFT_Y / MAX_ZOOM);
    const needed = distance * Math.tan(FOV_HALF_RAD + tiltY) + MOTE_DRIFT_Y;
    expect(WRAP_BOX_HEIGHT / 2).toBeGreaterThan(needed);
  });
});
