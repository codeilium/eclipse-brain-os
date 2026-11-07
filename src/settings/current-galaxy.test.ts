import { describe, expect, it } from "vitest";

import type { GalaxyId } from "@/universe";

import { resolveStoredGalaxyId } from "./current-galaxy";

const galaxies = [
  { id: "galaxy-a" as GalaxyId },
  { id: "galaxy-b" as GalaxyId },
];

describe("resolveStoredGalaxyId", () => {
  it("returns the stored id when it names a real galaxy", () => {
    expect(resolveStoredGalaxyId("galaxy-b", galaxies)).toBe("galaxy-b");
    expect(resolveStoredGalaxyId("galaxy-a", galaxies)).toBe("galaxy-a");
  });

  it("falls back to the first galaxy when nothing is stored (first run)", () => {
    expect(resolveStoredGalaxyId(undefined, galaxies)).toBe("galaxy-a");
  });

  it("falls back to the first galaxy on a stale id (the galaxy is gone)", () => {
    expect(resolveStoredGalaxyId("galaxy-deleted", galaxies)).toBe("galaxy-a");
  });

  it("falls back to the first galaxy on a junk stored value", () => {
    expect(resolveStoredGalaxyId("", galaxies)).toBe("galaxy-a");
  });

  it("returns null for a galaxy-less universe (unreachable, but never throws)", () => {
    expect(resolveStoredGalaxyId("galaxy-a", [])).toBeNull();
    expect(resolveStoredGalaxyId(undefined, [])).toBeNull();
  });
});
