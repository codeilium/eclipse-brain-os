import { describe, expect, it } from "vitest";

import {
  addGalaxyToUniverse,
  addStarToUniverse,
  createGalaxy,
  createStar,
  createUniverse,
} from "@/universe";

import { CorruptDataError } from "./errors";
import { validateUniverse } from "./validation";

/** Assert `fn` throws CorruptDataError whose `.field` equals `field`. */
function expectCorrupt(fn: () => void, field: string | undefined): void {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(CorruptDataError);
  expect((thrown as CorruptDataError).field).toBe(field);
}

/** A valid universe object literal with one galaxy → star → planet. */
function buildNestedUniverse(planetOverrides: Record<string, unknown> = {}): unknown {
  const base = createUniverse();
  const galaxy = base.galaxies[0]!;
  const planet = {
    id: "p1",
    starId: "s1",
    name: "Python",
    description: null,
    createdAt: base.createdAt,
    orbit: { orbitsCompleted: 0, currentOrbitProgress: 0 },
    sessions: [],
    moons: [],
    lastSessionAt: null,
    ...planetOverrides,
  };
  const star = {
    id: "s1",
    galaxyId: galaxy.id,
    name: "Become a better engineer",
    description: null,
    createdAt: base.createdAt,
    planets: [planet],
  };
  return { ...base, galaxies: [{ ...galaxy, stars: [star] }] };
}

describe("validateUniverse", () => {
  it("accepts a freshly created universe", () => {
    expect(() => validateUniverse(createUniverse())).not.toThrow();
  });

  it("accepts a valid nested universe", () => {
    expect(() => validateUniverse(buildNestedUniverse())).not.toThrow();
  });

  it("accepts a multi-galaxy universe — no single-galaxy assumption (PRD 27)", () => {
    let u = createUniverse();
    u = addGalaxyToUniverse(u, createGalaxy(u.id, "Side projects"));
    u = addStarToUniverse(u, createStar(u.galaxies[1]!.id, "Learn the cello"));
    expect(() => validateUniverse(u)).not.toThrow();
  });

  it("rejects a non-object (no field path)", () => {
    expectCorrupt(() => validateUniverse(null), undefined);
    expectCorrupt(() => validateUniverse(42), undefined);
  });

  it("rejects a wrong schemaVersion, pointing at schemaVersion", () => {
    expectCorrupt(() => validateUniverse({ ...createUniverse(), schemaVersion: 99 }), "schemaVersion");
  });

  it("rejects a missing required field, pointing at it", () => {
    const u: Record<string, unknown> = { ...createUniverse() };
    u.id = undefined; // structurally identical to "missing" for the validator
    expectCorrupt(() => validateUniverse(u), "id");
  });

  it("rejects a wrong-typed top-level field, pointing at it", () => {
    const u: Record<string, unknown> = { ...createUniverse() };
    u.createdAt = 12345;
    expectCorrupt(() => validateUniverse(u), "createdAt");
  });

  it("reports the nested path for a wrong-typed star name", () => {
    const base = createUniverse();
    const galaxy = base.galaxies[0]!;
    const star = {
      id: "s1",
      galaxyId: galaxy.id,
      name: 123,
      description: null,
      createdAt: base.createdAt,
      planets: [],
    };
    const u = { ...base, galaxies: [{ ...galaxy, stars: [star] }] };
    expectCorrupt(() => validateUniverse(u), "galaxies[0].stars[0].name");
  });

  it("reports the full nested path for a corrupt planet orbit", () => {
    const u = buildNestedUniverse({ orbit: { orbitsCompleted: -1, currentOrbitProgress: 0 } });
    expectCorrupt(() => validateUniverse(u), "galaxies[0].stars[0].planets[0].orbit.orbitsCompleted");
  });

  it("rejects an out-of-range currentOrbitProgress", () => {
    const u = buildNestedUniverse({ orbit: { orbitsCompleted: 0, currentOrbitProgress: 1 } });
    expectCorrupt(
      () => validateUniverse(u),
      "galaxies[0].stars[0].planets[0].orbit.currentOrbitProgress",
    );
  });

  it("rejects a non-null, non-string nullable field (description)", () => {
    const u = buildNestedUniverse({ description: 42 });
    expectCorrupt(() => validateUniverse(u), "galaxies[0].stars[0].planets[0].description");
  });

  it("rejects a non-array field (sessions)", () => {
    const u = buildNestedUniverse({ sessions: "not-an-array" });
    expectCorrupt(() => validateUniverse(u), "galaxies[0].stars[0].planets[0].sessions");
  });
});
