import { describe, expect, it } from "vitest";

import { createMoon, createPlanet, createStar, type GalaxyId } from "@/universe";

import { subtreeIds } from "./subtree-ids";

const GALAXY = "galaxy-1" as GalaxyId;

describe("subtreeIds", () => {
  it("a star yields itself + every planet + every planet's moons", () => {
    const star = createStar(GALAXY, "Pursuit");
    const planetA = createPlanet(star.id, "A");
    const planetB = createPlanet(star.id, "B");
    const moonA1 = createMoon(planetA.id, "A1");
    const moonA2 = createMoon(planetA.id, "A2");
    const starFull = {
      ...star,
      planets: [{ ...planetA, moons: [moonA1, moonA2] }, planetB],
    };

    const ids = subtreeIds(starFull);
    expect(ids).toHaveLength(5);
    expect(new Set(ids)).toEqual(
      new Set([star.id, planetA.id, moonA1.id, moonA2.id, planetB.id]),
    );
    expect(ids[0]).toBe(star.id); // the body itself leads the list
  });

  it("a planet yields itself + its moons", () => {
    const star = createStar(GALAXY, "S");
    const planet = createPlanet(star.id, "P");
    const m1 = createMoon(planet.id, "m1");
    const m2 = createMoon(planet.id, "m2");
    const planetFull = { ...planet, moons: [m1, m2] };

    const ids = subtreeIds(planetFull);
    expect(new Set(ids)).toEqual(new Set([planet.id, m1.id, m2.id]));
    expect(ids[0]).toBe(planet.id);
  });

  it("a moon yields just itself (a leaf)", () => {
    const star = createStar(GALAXY, "S");
    const planet = createPlanet(star.id, "P");
    const moon = createMoon(planet.id, "M");
    expect(subtreeIds(moon)).toEqual([moon.id]);
  });

  it("a star with no planets yields just itself", () => {
    const star = createStar(GALAXY, "Lonely");
    expect(subtreeIds(star)).toEqual([star.id]);
  });

  it("a planet with no moons yields just itself", () => {
    const star = createStar(GALAXY, "S");
    const planet = createPlanet(star.id, "P");
    expect(subtreeIds(planet)).toEqual([planet.id]);
  });
});
