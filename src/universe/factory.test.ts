import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION, POMODORO_DURATION_MS } from "./constants";
import {
  createGalaxy,
  createMoon,
  createPlanet,
  createSession,
  createStar,
  createUniverse,
} from "./factory";
import type { GalaxyId, PlanetId, StarId, UniverseId } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_ORBIT = { orbitsCompleted: 0, currentOrbitProgress: 0 };

const isIso = (s: string): boolean => new Date(s).toISOString() === s;

describe("createUniverse", () => {
  it("creates a schema-versioned universe with one implicit galaxy", () => {
    const u = createUniverse();
    expect(u.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(u.galaxies).toHaveLength(1);
    expect(u.galaxies[0]!.name).toBe("My Universe");
    expect(u.galaxies[0]!.stars).toHaveLength(0);
    expect(u.id).toMatch(UUID_RE);
    expect(isIso(u.createdAt)).toBe(true);
    expect(u.lastModified).toBe(u.createdAt);
    expect(u.galaxies[0]!.universeId).toBe(u.id);
  });
});

describe("createGalaxy", () => {
  it("creates an empty galaxy bound to its universe", () => {
    const g = createGalaxy("uni-1" as UniverseId, "Side quests");
    expect(g.id).toMatch(UUID_RE);
    expect(g.universeId).toBe("uni-1");
    expect(g.name).toBe("Side quests");
    expect(g.stars).toHaveLength(0);
  });
});

describe("createStar", () => {
  it("creates an empty star with a null description by default", () => {
    const s = createStar("gal-1" as GalaxyId, "Become a better writer");
    expect(s.id).toMatch(UUID_RE);
    expect(s.galaxyId).toBe("gal-1");
    expect(s.name).toBe("Become a better writer");
    expect(s.description).toBeNull();
    expect(s.planets).toHaveLength(0);
  });

  it("accepts an optional description", () => {
    expect(createStar("gal-1" as GalaxyId, "S", "the why").description).toBe("the why");
  });
});

describe("createPlanet", () => {
  it("creates a planet at the orbital origin with no sessions or moons", () => {
    const p = createPlanet("star-1" as StarId, "Daily writing");
    expect(p.id).toMatch(UUID_RE);
    expect(p.starId).toBe("star-1");
    expect(p.orbit).toEqual(ZERO_ORBIT);
    expect(p.sessions).toHaveLength(0);
    expect(p.moons).toHaveLength(0);
    expect(p.lastSessionAt).toBeNull();
    expect(p.description).toBeNull();
  });
});

describe("createMoon", () => {
  it("creates a moon at the orbital origin bound to its planet", () => {
    const m = createMoon("planet-1" as PlanetId, "Deep work");
    expect(m.id).toMatch(UUID_RE);
    expect(m.planetId).toBe("planet-1");
    expect(m.orbit).toEqual(ZERO_ORBIT);
    expect(m.sessions).toHaveLength(0);
    expect(m.lastSessionAt).toBeNull();
  });
});

describe("createSession", () => {
  it("creates an in-progress session with no completion time", () => {
    const s = createSession("planet", "planet-1" as PlanetId, POMODORO_DURATION_MS);
    expect(s.id).toMatch(UUID_RE);
    expect(s.targetType).toBe("planet");
    expect(s.targetId).toBe("planet-1");
    expect(s.durationMs).toBe(POMODORO_DURATION_MS);
    expect(s.status).toBe("in-progress");
    expect(s.completedAt).toBeNull();
    expect(isIso(s.startedAt)).toBe(true);
  });
});

describe("id generation", () => {
  it("produces a unique id per call", () => {
    const ids = new Set([
      createStar("g" as GalaxyId, "a").id,
      createStar("g" as GalaxyId, "b").id,
      createPlanet("s" as StarId, "c").id,
      createMoon("p" as PlanetId, "d").id,
    ]);
    expect(ids.size).toBe(4);
  });
});
