import { describe, expect, it } from "vitest";

import { computeSize } from "@/universe";

import { MOON_SIZE_SCALE } from "./position";

// The moon orbital radius is now packed by computeSystemLayout (see
// layout.test.ts for the clearance invariants); only the body-size scale lives
// here, so that is all this file covers.

describe("moon legibility constant", () => {
  it("keeps a moon clearly subordinate in size to its planet (0 < scale < 1)", () => {
    expect(MOON_SIZE_SCALE).toBeGreaterThan(0);
    expect(MOON_SIZE_SCALE).toBeLessThan(1);
  });

  it("renders a moon smaller than a planet at equal orbit counts (hierarchy holds)", () => {
    for (const orbits of [0, 1, 5, 20]) {
      const moonBody = computeSize(orbits) * MOON_SIZE_SCALE;
      const planetBody = computeSize(orbits);
      expect(moonBody).toBeLessThan(planetBody);
    }
  });
});
