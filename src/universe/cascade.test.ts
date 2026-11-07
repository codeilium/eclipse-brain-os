import { describe, expect, it } from "vitest";

import { applyPomodoroToMoon, applyPomodoroToPlanet } from "./cascade";
import { createMoon, createPlanet } from "./factory";
import type { Planet, StarId } from "./types";

const COMPLETED_AT = "2026-03-01T12:25:00.000Z";
const STAR_ID = "star-1" as StarId;
const MIN_MS = 60_000;

// The DIRECT advance is now duration-based (PRD 22): 1 min = 1% of an orbit. The
// classic 25-min session advances 0.25 — the calibration point for the old flat rate.
const MIN_25 = 25 * MIN_MS;

function planetWithMoons(moonCount: number): Planet {
  let planet = createPlanet(STAR_ID, "Practice");
  for (let i = 0; i < moonCount; i++) {
    planet = { ...planet, moons: [...planet.moons, createMoon(planet.id, `Moon ${i}`)] };
  }
  return planet;
}

describe("applyPomodoroToPlanet (direct advance is duration-based)", () => {
  it("advances the planet by minutes × 1% — a 25-min session = 0.25 orbits", () => {
    const result = applyPomodoroToPlanet(createPlanet(STAR_ID, "Python"), COMPLETED_AT, MIN_25);
    expect(result.orbit).toEqual({ orbitsCompleted: 0, currentOrbitProgress: 0.25 });
  });

  it("scales with the session length (1 / 50 / 100 minutes)", () => {
    const fresh = () => createPlanet(STAR_ID, "Python");
    expect(
      applyPomodoroToPlanet(fresh(), COMPLETED_AT, 1 * MIN_MS).orbit.currentOrbitProgress,
    ).toBeCloseTo(0.01, 10);
    expect(
      applyPomodoroToPlanet(fresh(), COMPLETED_AT, 50 * MIN_MS).orbit.currentOrbitProgress,
    ).toBeCloseTo(0.5, 10);
    // 100 min = exactly one full orbit → lands clean on the boundary.
    expect(applyPomodoroToPlanet(fresh(), COMPLETED_AT, 100 * MIN_MS).orbit).toEqual({
      orbitsCompleted: 1,
      currentOrbitProgress: 0,
    });
  });

  it("rolls a multi-orbit session in one commit (250 min from 0.7 → +3 orbits, ≈0.2)", () => {
    const seeded: Planet = {
      ...createPlanet(STAR_ID, "Python"),
      orbit: { orbitsCompleted: 0, currentOrbitProgress: 0.7 },
    };
    const result = applyPomodoroToPlanet(seeded, COMPLETED_AT, 250 * MIN_MS);
    expect(result.orbit.orbitsCompleted).toBe(3);
    expect(result.orbit.currentOrbitProgress).toBeCloseTo(0.2, 10);
  });

  it("rolls the field maximum (600 min = 6 orbits) from zero in one commit", () => {
    const result = applyPomodoroToPlanet(
      createPlanet(STAR_ID, "Python"),
      COMPLETED_AT,
      600 * MIN_MS,
    );
    expect(result.orbit).toEqual({ orbitsCompleted: 6, currentOrbitProgress: 0 });
  });

  it("sets the planet's lastSessionAt to the completion time", () => {
    const result = applyPomodoroToPlanet(createPlanet(STAR_ID, "Python"), COMPLETED_AT, MIN_25);
    expect(result.lastSessionAt).toBe(COMPLETED_AT);
  });

  it("advances each moon by the FLAT 0.05 cascade benefit, regardless of length", () => {
    // Even a full-orbit (100-min) parent session nudges moons by exactly 0.05 — the
    // parent-benefit cascade is deliberately NOT scaled by duration (PRD 22).
    const result = applyPomodoroToPlanet(planetWithMoons(2), COMPLETED_AT, 100 * MIN_MS);
    expect(result.orbit.orbitsCompleted).toBe(1); // planet did a full lap …
    expect(result.moons).toHaveLength(2);
    for (const moon of result.moons) {
      expect(moon.orbit.currentOrbitProgress).toBeCloseTo(0.05, 10); // … moon still just 0.05
      expect(moon.orbit.orbitsCompleted).toBe(0);
    }
  });

  it("does NOT reset a moon's brightness clock (lastSessionAt stays null)", () => {
    const result = applyPomodoroToPlanet(planetWithMoons(2), COMPLETED_AT, MIN_25);
    for (const moon of result.moons) {
      expect(moon.lastSessionAt).toBeNull();
    }
  });

  it("does not mutate the input planet (returns a new object)", () => {
    const planet = planetWithMoons(1);
    const result = applyPomodoroToPlanet(planet, COMPLETED_AT, MIN_25);
    expect(result).not.toBe(planet);
    expect(planet.orbit.currentOrbitProgress).toBe(0);
    expect(planet.lastSessionAt).toBeNull();
    expect(planet.moons[0]!.orbit.currentOrbitProgress).toBe(0);
  });

  it("accumulates: four 25-min sessions = exactly 1 completed orbit", () => {
    let planet = planetWithMoons(1);
    for (let i = 0; i < 4; i++) {
      planet = applyPomodoroToPlanet(planet, COMPLETED_AT, MIN_25);
    }
    expect(planet.orbit).toEqual({ orbitsCompleted: 1, currentOrbitProgress: 0 });
    // moon nudged 0.05 × 4 = 0.20 over the same span (flat cascade benefit)
    expect(planet.moons[0]!.orbit.currentOrbitProgress).toBeCloseTo(0.2, 10);
  });

  it("carries a moon across an orbit boundary via the cascade benefit", () => {
    const near = createPlanet(STAR_ID, "P");
    const planet: Planet = {
      ...near,
      moons: [{ ...createMoon(near.id, "M"), orbit: { orbitsCompleted: 0, currentOrbitProgress: 0.98 } }],
    };
    const result = applyPomodoroToPlanet(planet, COMPLETED_AT, MIN_25);
    // 0.98 + 0.05 = 1.03 → rolls to orbit 1, progress 0.03
    expect(result.moons[0]!.orbit.orbitsCompleted).toBe(1);
    expect(result.moons[0]!.orbit.currentOrbitProgress).toBeCloseTo(0.03, 10);
  });
});

describe("applyPomodoroToMoon (direct advance is duration-based)", () => {
  it("advances the moon by minutes × 1% — a 25-min session = 0.25 orbits + sets lastSessionAt", () => {
    const result = applyPomodoroToMoon(
      createMoon("p-1" as Planet["id"], "Deep Work"),
      COMPLETED_AT,
      MIN_25,
    );
    expect(result.orbit).toEqual({ orbitsCompleted: 0, currentOrbitProgress: 0.25 });
    expect(result.lastSessionAt).toBe(COMPLETED_AT);
  });

  it("completes a full orbit on a 100-min session", () => {
    const result = applyPomodoroToMoon(
      createMoon("p-1" as Planet["id"], "Deep Work"),
      COMPLETED_AT,
      100 * MIN_MS,
    );
    expect(result.orbit).toEqual({ orbitsCompleted: 1, currentOrbitProgress: 0 });
  });

  it("does not mutate the input moon", () => {
    const moon = createMoon("p-1" as Planet["id"], "Deep Work");
    const result = applyPomodoroToMoon(moon, COMPLETED_AT, MIN_25);
    expect(result).not.toBe(moon);
    expect(moon.orbit.currentOrbitProgress).toBe(0);
    expect(moon.lastSessionAt).toBeNull();
  });

  it("accumulates: four 25-min sessions = exactly 1 completed orbit", () => {
    let moon = createMoon("p-1" as Planet["id"], "Consistency");
    for (let i = 0; i < 4; i++) {
      moon = applyPomodoroToMoon(moon, COMPLETED_AT, MIN_25);
    }
    expect(moon.orbit).toEqual({ orbitsCompleted: 1, currentOrbitProgress: 0 });
  });
});
