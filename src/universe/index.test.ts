import { describe, expect, it } from "vitest";

// Import via the public `@/universe` path future PRDs will use — this also
// validates the barrel and the Vitest `@` alias resolve correctly.
import * as universe from "@/universe";

describe("@/universe public API (barrel)", () => {
  it("re-exports the entity factories", () => {
    for (const name of [
      "createUniverse",
      "createGalaxy",
      "createStar",
      "createPlanet",
      "createMoon",
      "createSession",
    ] as const) {
      expect(typeof universe[name]).toBe("function");
    }
  });

  it("re-exports the math and cascade functions", () => {
    for (const name of [
      "normalizeOrbit",
      "advanceOrbit",
      "orbitProgressForDuration",
      "computeSize",
      "decayBrightness",
      "computeBrightness",
      "computeStarBodySize",
      "computeStarBrightness",
      "computeStarCoronaRadius",
      "applyPomodoroToPlanet",
      "applyPomodoroToMoon",
    ] as const) {
      expect(typeof universe[name]).toBe("function");
    }
  });

  it("re-exports the universe-level operations", () => {
    for (const name of [
      "findStarById",
      "findPlanetById",
      "findMoonById",
      "addGalaxyToUniverse",
      "addStarToUniverse",
      "addPlanetToUniverse",
      "addMoonToUniverse",
      "editGalaxyDetails",
      "commitCompletedSession",
    ] as const) {
      expect(typeof universe[name]).toBe("function");
    }
  });

  it("re-exports the tunable constants", () => {
    expect(universe.MINUTES_PER_ORBIT).toBe(100);
    expect(universe.ORBIT_PROGRESS_PER_MINUTE).toBeCloseTo(0.01, 10);
    expect(universe.MOON_BENEFIT_FROM_PARENT_PLANET).toBe(0.05);
    expect(universe.GROWTH_CEILING_ORBITS).toBe(40);
    expect(universe.STAR_BODY_SIZE_MULTIPLIER).toBe(1.4);
    expect(universe.BRIGHTNESS_HALF_LIFE_DAYS).toBe(7);
    expect(universe.STAR_CORONA_CEILING_POMODOROS).toBe(200);
    expect(universe.CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it("wires a real end-to-end flow through the public API", () => {
    let u = universe.createUniverse();
    const star = universe.createStar(u.galaxies[0]!.id, "Ship Eclipse Brain OS");
    u = universe.addStarToUniverse(u, star);
    const planet = universe.createPlanet(star.id, "TypeScript");
    u = universe.addPlanetToUniverse(u, planet);

    const started = universe.createSession("planet", planet.id, universe.POMODORO_DURATION_MS);
    const done = { ...started, status: "completed" as const, completedAt: u.lastModified };
    u = universe.commitCompletedSession(u, done);

    expect(universe.findPlanetById(u, planet.id)!.planet.orbit.currentOrbitProgress).toBeCloseTo(
      0.25,
      10,
    );
  });
});
