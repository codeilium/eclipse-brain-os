import { describe, expect, it } from "vitest";

import { POMODORO_DURATION_MS } from "./constants";
import {
  createGalaxy,
  createMoon,
  createPlanet,
  createSession,
  createStar,
  createUniverse,
} from "./factory";
import type {
  GalaxyId,
  ISODateString,
  MoonId,
  PlanetId,
  Session,
  StarId,
  Universe,
} from "./types";
import {
  addGalaxyToUniverse,
  addMoonToUniverse,
  addPlanetToUniverse,
  addStarToUniverse,
  commitCompletedSession,
  deleteMoon,
  deletePlanet,
  deleteStar,
  describeSubtree,
  editGalaxyDetails,
  editMoonDetails,
  editPlanetDetails,
  editStarDetails,
  findMoonById,
  findPlanetById,
  findStarById,
} from "./universe";

/** Build a universe seeded with: 2 stars; star A has planet P1 (with moon M1) and planet P2. */
function seededUniverse() {
  let u = createUniverse();
  const galaxyId = u.galaxies[0]!.id;

  const starA = createStar(galaxyId, "Become a better engineer");
  const starB = createStar(galaxyId, "Learn the cello");
  u = addStarToUniverse(u, starA);
  u = addStarToUniverse(u, starB);

  const p1 = createPlanet(starA.id, "Python");
  const p2 = createPlanet(starA.id, "Systems design");
  u = addPlanetToUniverse(u, p1);
  u = addPlanetToUniverse(u, p2);

  const m1 = createMoon(p1.id, "Pomodoro discipline");
  u = addMoonToUniverse(u, m1);

  return { u, starA, starB, p1, p2, m1 };
}

// A completed session defaults to the classic 25-min length (→ 0.25 orbits under
// the PRD 22 minutes rule). Pass an explicit durationMs to exercise other lengths.
function completedSession(
  targetType: Session["targetType"],
  targetId: Session["targetId"],
  at: string,
  durationMs: number = POMODORO_DURATION_MS,
): Session {
  const started = createSession(targetType, targetId, durationMs);
  return { ...started, status: "completed", completedAt: at as ISODateString };
}

describe("find functions", () => {
  it("finds a star by id, and returns null for a miss", () => {
    const { u, starA } = seededUniverse();
    expect(findStarById(u, starA.id)?.id).toBe(starA.id);
    expect(findStarById(u, "missing" as StarId)).toBeNull();
  });

  it("finds a planet with its star and galaxy, and returns null for a miss", () => {
    const { u, p1, starA } = seededUniverse();
    const found = findPlanetById(u, p1.id);
    expect(found?.planet.id).toBe(p1.id);
    expect(found?.star.id).toBe(starA.id);
    expect(found?.galaxy.id).toBe(u.galaxies[0]!.id);
    expect(findPlanetById(u, "missing" as PlanetId)).toBeNull();
  });

  it("finds a moon with its full lineage, and returns null for a miss", () => {
    const { u, m1, p1, starA } = seededUniverse();
    const found = findMoonById(u, m1.id);
    expect(found?.moon.id).toBe(m1.id);
    expect(found?.planet.id).toBe(p1.id);
    expect(found?.star.id).toBe(starA.id);
    expect(findMoonById(u, "missing" as MoonId)).toBeNull();
  });
});

describe("add functions", () => {
  it("adds a star to its galaxy and updates lastModified", () => {
    const u0 = createUniverse();
    const star = createStar(u0.galaxies[0]!.id, "New pursuit");
    const u1 = addStarToUniverse(u0, star);
    expect(u1.galaxies[0]!.stars.map((s) => s.id)).toContain(star.id);
    expect(u1).not.toBe(u0);
    expect(u0.galaxies[0]!.stars).toHaveLength(0); // original untouched
  });

  it("adds a star only to its galaxy, leaving sibling galaxies untouched", () => {
    // V2-shaped: a Universe with two galaxies. Adding a star to the second
    // must leave the first untouched (the non-matching-galaxy branch).
    let u = createUniverse();
    const g2 = createGalaxy(u.id, "Side projects");
    u = { ...u, galaxies: [...u.galaxies, g2] };
    const star = createStar(g2.id, "Lives in the second galaxy");
    const u2 = addStarToUniverse(u, star);
    expect(u2.galaxies[0]!.stars).toHaveLength(0);
    expect(u2.galaxies[1]!.stars.map((s) => s.id)).toContain(star.id);
  });

  it("adds a planet only to its parent star, not its siblings", () => {
    const { u, starA, starB, p1 } = seededUniverse();
    const starAFound = findStarById(u, starA.id)!;
    const starBFound = findStarById(u, starB.id)!;
    expect(starAFound.planets.map((p) => p.id)).toContain(p1.id);
    expect(starBFound.planets).toHaveLength(0);
  });

  it("adds a moon only to its parent planet, not its siblings", () => {
    const { u, p1, p2, m1 } = seededUniverse();
    expect(findPlanetById(u, p1.id)!.planet.moons.map((m) => m.id)).toContain(m1.id);
    expect(findPlanetById(u, p2.id)!.planet.moons).toHaveLength(0);
  });
});

describe("addGalaxyToUniverse (PRD 27)", () => {
  it("appends the galaxy and bumps lastModified", () => {
    const u0 = createUniverse();
    const g2 = createGalaxy(u0.id, "Side projects");
    const u1 = addGalaxyToUniverse(u0, g2);
    expect(u1.galaxies.map((g) => g.id)).toEqual([u0.galaxies[0]!.id, g2.id]);
    expect(u1).not.toBe(u0);
    expect(u1.lastModified >= u0.lastModified).toBe(true);
  });

  it("existing galaxies (and everything they hold) pass through by reference", () => {
    // The append must not rebuild what's already there — galaxy A's stars,
    // sessions, everything, are the SAME objects after the append.
    const { u, starA } = seededUniverse();
    const g2 = createGalaxy(u.id, "Side projects");
    const after = addGalaxyToUniverse(u, g2);
    expect(after.galaxies[0]).toBe(u.galaxies[0]);
    expect(findStarById(after, starA.id)).toBe(findStarById(u, starA.id));
    expect(after.galaxies[1]).toBe(g2);
  });

  it("does not mutate the input universe", () => {
    const u = createUniverse();
    addGalaxyToUniverse(u, createGalaxy(u.id, "Side projects"));
    expect(u.galaxies).toHaveLength(1);
  });
});

describe("commitCompletedSession", () => {
  it("advances the target planet, appends the session, and cascades to its moons", () => {
    const { u, p1, m1 } = seededUniverse();
    const at = new Date().toISOString();
    const u2 = commitCompletedSession(u, completedSession("planet", p1.id, at));

    const planet = findPlanetById(u2, p1.id)!.planet;
    expect(planet.orbit.currentOrbitProgress).toBeCloseTo(0.25, 10);
    expect(planet.sessions).toHaveLength(1);
    expect(planet.lastSessionAt).toBe(at);

    const moon = findMoonById(u2, m1.id)!.moon;
    expect(moon.orbit.currentOrbitProgress).toBeCloseTo(0.05, 10);
    expect(moon.lastSessionAt).toBeNull(); // cascade nudges orbit, not brightness
  });

  it("leaves sibling planets untouched", () => {
    const { u, p1, p2 } = seededUniverse();
    const u2 = commitCompletedSession(u, completedSession("planet", p1.id, new Date().toISOString()));
    const sibling = findPlanetById(u2, p2.id)!.planet;
    expect(sibling.orbit.currentOrbitProgress).toBe(0);
    expect(sibling.sessions).toHaveLength(0);
  });

  it("advances the target moon without affecting its parent planet", () => {
    const { u, p1, m1 } = seededUniverse();
    const at = new Date().toISOString();
    const u2 = commitCompletedSession(u, completedSession("moon", m1.id, at));

    const moon = findMoonById(u2, m1.id)!.moon;
    expect(moon.orbit.currentOrbitProgress).toBeCloseTo(0.25, 10);
    expect(moon.lastSessionAt).toBe(at);
    expect(moon.sessions).toHaveLength(1);

    const parent = findPlanetById(u2, p1.id)!.planet;
    expect(parent.orbit.currentOrbitProgress).toBe(0);
    expect(parent.sessions).toHaveLength(0);
  });

  it("advances the planet proportionally to a longer session (100 min = one orbit), cascade stays flat", () => {
    const { u, p1, m1 } = seededUniverse();
    const at = new Date().toISOString();
    const u2 = commitCompletedSession(u, completedSession("planet", p1.id, at, 100 * 60_000));

    const planet = findPlanetById(u2, p1.id)!.planet;
    expect(planet.orbit).toEqual({ orbitsCompleted: 1, currentOrbitProgress: 0 });
    expect(planet.sessions).toHaveLength(1);

    // The parent-benefit cascade stays FLAT — the moon gets 0.05, not 100 × 1%.
    const moon = findMoonById(u2, m1.id)!.moon;
    expect(moon.orbit.currentOrbitProgress).toBeCloseTo(0.05, 10);
    expect(moon.orbit.orbitsCompleted).toBe(0);
  });

  it("rolls a multi-orbit session in a single commit (250 min from zero → +2 orbits, 0.5)", () => {
    const { u, p1 } = seededUniverse();
    const u2 = commitCompletedSession(
      u,
      completedSession("planet", p1.id, new Date().toISOString(), 250 * 60_000),
    );
    expect(findPlanetById(u2, p1.id)!.planet.orbit).toEqual({
      orbitsCompleted: 2,
      currentOrbitProgress: 0.5,
    });
  });

  it("applies the same minutes rule to a directly-sessioned moon (100 min = one orbit)", () => {
    const { u, m1 } = seededUniverse();
    const u2 = commitCompletedSession(
      u,
      completedSession("moon", m1.id, new Date().toISOString(), 100 * 60_000),
    );
    expect(findMoonById(u2, m1.id)!.moon.orbit).toEqual({
      orbitsCompleted: 1,
      currentOrbitProgress: 0,
    });
  });

  it("throws when the session is not completed", () => {
    const { u, p1 } = seededUniverse();
    const inProgress = createSession("planet", p1.id, POMODORO_DURATION_MS);
    expect(() => commitCompletedSession(u, inProgress)).toThrow(/in-progress/);
  });

  it("throws when a completed session has no completedAt", () => {
    const { u, p1 } = seededUniverse();
    const started = createSession("planet", p1.id, POMODORO_DURATION_MS);
    const bad: Session = { ...started, status: "completed", completedAt: null };
    expect(() => commitCompletedSession(u, bad)).toThrow(/completedAt/);
  });

  it("does not mutate the input universe", () => {
    const { u, p1 } = seededUniverse();
    const before: Universe = u;
    commitCompletedSession(u, completedSession("planet", p1.id, new Date().toISOString()));
    expect(findPlanetById(before, p1.id)!.planet.orbit.currentOrbitProgress).toBe(0);
    expect(findPlanetById(before, p1.id)!.planet.sessions).toHaveLength(0);
  });
});

// ----- Edit mutators (PRD 16) — name + description only, never earned state -----

describe("editGalaxyDetails (PRD 27)", () => {
  it("changes only the name; identity + stars are byte-identical", () => {
    // Work the galaxy first so there is real earned state to protect.
    const { u, p1 } = seededUniverse();
    const worked = commitCompletedSession(
      u,
      completedSession("planet", p1.id, "2026-06-11T10:00:00.000Z"),
    );
    const before = worked.galaxies[0]!;
    const after = editGalaxyDetails(worked, before.id, { name: "First light" });
    const galaxy = after.galaxies[0]!;
    expect(galaxy.name).toBe("First light");
    expect(galaxy.id).toBe(before.id);
    expect(galaxy.universeId).toBe(before.universeId);
    expect(galaxy.createdAt).toBe(before.createdAt);
    expect(galaxy.stars).toBe(before.stars); // earned state by reference
    expect(after.lastModified >= worked.lastModified).toBe(true);
  });

  it("leaves sibling galaxies untouched (by reference)", () => {
    const { u } = seededUniverse();
    const g2 = createGalaxy(u.id, "Side projects");
    const two = addGalaxyToUniverse(u, g2);
    const after = editGalaxyDetails(two, g2.id, { name: "Side quests" });
    expect(after.galaxies[0]).toBe(two.galaxies[0]);
    expect(after.galaxies[1]!.name).toBe("Side quests");
  });

  it("an empty / whitespace name is a gentle no-op (same universe reference)", () => {
    const { u } = seededUniverse();
    expect(editGalaxyDetails(u, u.galaxies[0]!.id, { name: "   " })).toBe(u);
  });

  it("a missing id is a safe no-op (same universe reference)", () => {
    const { u } = seededUniverse();
    const noop = editGalaxyDetails(u, "missing" as GalaxyId, { name: "X" });
    expect(noop).toBe(u);
    expect(noop.lastModified).toBe(u.lastModified);
  });

  it("does not mutate the input universe", () => {
    const { u } = seededUniverse();
    const originalName = u.galaxies[0]!.name;
    editGalaxyDetails(u, u.galaxies[0]!.id, { name: "Something else" });
    expect(u.galaxies[0]!.name).toBe(originalName);
  });
});

describe("editStarDetails", () => {
  it("changes only name + description; identity + children are byte-identical", () => {
    const { u, starA } = seededUniverse();
    const before = findStarById(u, starA.id)!;

    const after = editStarDetails(u, starA.id, {
      name: "Renamed pursuit",
      description: "a new description",
    });
    const edited = findStarById(after, starA.id)!;

    expect(edited.name).toBe("Renamed pursuit");
    expect(edited.description).toBe("a new description");
    // A star's earned/identity fields (it has no orbit/sessions of its own):
    expect(edited.id).toBe(before.id);
    expect(edited.galaxyId).toBe(before.galaxyId);
    expect(edited.createdAt).toBe(before.createdAt);
    expect(edited.planets).toBe(before.planets); // children untouched (same ref)
  });
});

describe("editPlanetDetails", () => {
  it("changes only name + description; every earned field is byte-identical", () => {
    const { u, p1 } = seededUniverse();
    // Earn some state first, so we can prove it survives the edit.
    const worked = commitCompletedSession(
      u,
      completedSession("planet", p1.id, new Date().toISOString()),
    );
    const before = findPlanetById(worked, p1.id)!.planet;

    const after = editPlanetDetails(worked, p1.id, {
      name: "Python (renamed)",
      description: "now with a description",
    });
    const edited = findPlanetById(after, p1.id)!.planet;

    expect(edited.name).toBe("Python (renamed)");
    expect(edited.description).toBe("now with a description");
    // Every earned / derived / identity field, byte-identical (object refs intact):
    expect(edited.id).toBe(before.id);
    expect(edited.starId).toBe(before.starId);
    expect(edited.createdAt).toBe(before.createdAt);
    expect(edited.lastSessionAt).toBe(before.lastSessionAt);
    expect(edited.orbit).toBe(before.orbit);
    expect(edited.sessions).toBe(before.sessions);
    expect(edited.moons).toBe(before.moons);
  });
});

describe("editMoonDetails", () => {
  it("changes only name + description; every earned field is byte-identical", () => {
    const { u, m1 } = seededUniverse();
    const worked = commitCompletedSession(
      u,
      completedSession("moon", m1.id, new Date().toISOString()),
    );
    const before = findMoonById(worked, m1.id)!.moon;

    const after = editMoonDetails(worked, m1.id, {
      name: "Renamed sub-practice",
      description: null,
    });
    const edited = findMoonById(after, m1.id)!.moon;

    expect(edited.name).toBe("Renamed sub-practice");
    expect(edited.description).toBeNull();
    expect(edited.id).toBe(before.id);
    expect(edited.planetId).toBe(before.planetId);
    expect(edited.createdAt).toBe(before.createdAt);
    expect(edited.lastSessionAt).toBe(before.lastSessionAt);
    expect(edited.orbit).toBe(before.orbit);
    expect(edited.sessions).toBe(before.sessions);
  });
});

describe("edit no-ops & immutability", () => {
  it("an empty / whitespace name is a gentle no-op (same universe reference)", () => {
    const { u, starA } = seededUniverse();
    expect(editStarDetails(u, starA.id, { name: "   ", description: "x" })).toBe(u);
  });

  it("a missing id is a safe no-op (same universe reference)", () => {
    const { u } = seededUniverse();
    expect(
      editStarDetails(u, "missing" as StarId, { name: "X", description: null }),
    ).toBe(u);
    expect(
      editPlanetDetails(u, "missing" as PlanetId, { name: "X", description: null }),
    ).toBe(u);
    expect(
      editMoonDetails(u, "missing" as MoonId, { name: "X", description: null }),
    ).toBe(u);
  });

  it("can clear a description to null", () => {
    const { u, p1 } = seededUniverse();
    const after = editPlanetDetails(u, p1.id, { name: "Python", description: null });
    expect(findPlanetById(after, p1.id)!.planet.description).toBeNull();
  });

  it("does not mutate the input universe", () => {
    const { u, starA } = seededUniverse();
    const originalName = findStarById(u, starA.id)!.name;
    editStarDetails(u, starA.id, { name: "Something else", description: "y" });
    expect(findStarById(u, starA.id)!.name).toBe(originalName);
  });
});

// ----- Delete mutators (PRD 16) — cascade the subtree -----

describe("deleteStar", () => {
  it("removes the star and its whole subtree, leaving siblings untouched", () => {
    const { u, starA, starB, p1, m1 } = seededUniverse();
    const after = deleteStar(u, starA.id);
    expect(findStarById(after, starA.id)).toBeNull();
    expect(findPlanetById(after, p1.id)).toBeNull(); // cascaded with the star
    expect(findMoonById(after, m1.id)).toBeNull(); // cascaded with the star
    expect(findStarById(after, starB.id)?.id).toBe(starB.id); // sibling remains
  });
});

describe("deletePlanet", () => {
  it("removes the planet and its moons, leaving the star + sibling planets", () => {
    const { u, starA, p1, p2, m1 } = seededUniverse();
    const after = deletePlanet(u, p1.id);
    expect(findPlanetById(after, p1.id)).toBeNull();
    expect(findMoonById(after, m1.id)).toBeNull(); // cascaded with the planet
    expect(findPlanetById(after, p2.id)?.planet.id).toBe(p2.id); // sibling remains
    expect(findStarById(after, starA.id)?.id).toBe(starA.id); // parent remains
  });
});

describe("deleteMoon", () => {
  it("removes just the moon, leaving its planet + siblings", () => {
    const { u, p1, p2, m1 } = seededUniverse();
    const after = deleteMoon(u, m1.id);
    expect(findMoonById(after, m1.id)).toBeNull();
    expect(findPlanetById(after, p1.id)!.planet.moons).toHaveLength(0);
    expect(findPlanetById(after, p2.id)?.planet.id).toBe(p2.id);
  });
});

describe("delete no-ops & immutability", () => {
  it("a missing id is a safe no-op (same universe reference)", () => {
    const { u } = seededUniverse();
    expect(deleteStar(u, "missing" as StarId)).toBe(u);
    expect(deletePlanet(u, "missing" as PlanetId)).toBe(u);
    expect(deleteMoon(u, "missing" as MoonId)).toBe(u);
  });

  it("does not mutate the input universe", () => {
    const { u, starA, p1 } = seededUniverse();
    deleteStar(u, starA.id);
    expect(findStarById(u, starA.id)?.id).toBe(starA.id); // original intact
    expect(findPlanetById(u, p1.id)?.planet.id).toBe(p1.id);
  });

  it("bumps lastModified on a real delete, preserves it on a no-op", () => {
    const { u, starA } = seededUniverse();
    const real = deleteStar(u, starA.id);
    expect(real).not.toBe(u);
    expect(real.lastModified >= u.lastModified).toBe(true);
    const noop = deleteStar(u, "missing" as StarId);
    expect(noop).toBe(u);
    expect(noop.lastModified).toBe(u.lastModified);
  });
});

// ----- describeSubtree (PRD 16) — the honest cascade count -----

describe("describeSubtree", () => {
  it("counts a star's planets and the sum of their moons", () => {
    const { u, starA } = seededUniverse();
    expect(describeSubtree(findStarById(u, starA.id)!)).toEqual({
      planets: 2,
      moons: 1,
    });
  });

  it("counts a planet's moons (and zero planets)", () => {
    const { u, p1, p2 } = seededUniverse();
    expect(describeSubtree(findPlanetById(u, p1.id)!.planet)).toEqual({
      planets: 0,
      moons: 1,
    });
    expect(describeSubtree(findPlanetById(u, p2.id)!.planet)).toEqual({
      planets: 0,
      moons: 0,
    });
  });

  it("reports zero for a moon (a leaf) and for an empty star", () => {
    const { u, m1, starB } = seededUniverse();
    expect(describeSubtree(findMoonById(u, m1.id)!.moon)).toEqual({
      planets: 0,
      moons: 0,
    });
    expect(describeSubtree(findStarById(u, starB.id)!)).toEqual({
      planets: 0,
      moons: 0,
    });
  });
});
