import { describe, expect, it } from "vitest";

import type {
  Galaxy,
  GalaxyId,
  ISODateString,
  Moon,
  MoonId,
  Planet,
  PlanetId,
  Session,
  SessionId,
  StarId,
  Star,
  UniverseId,
} from "@/universe";

import {
  ACCRETION_HALF_SATURATION_MINUTES,
  accretionIntensity,
  galaxyFocusedMinutes,
} from "./accretion";

// ===========================================================================
// Pure accretion math (PRD 26 — the black hole). The one test surface of the
// PRD: the helpers READ the existing record (sessions carry `durationMs` since
// PRD 11) — no model/persistence change to test, only the sum and the curve.
// ===========================================================================

const AT = "2026-06-01T00:00:00.000Z" as ISODateString;
const MS_PER_MINUTE = 60_000;

let idCounter = 0;
function nextId<T extends string>(): T {
  idCounter += 1;
  return `accretion-test-id-${idCounter}` as T;
}

/** A completed session of the given length, hand-built like the record holds. */
function completedSession(
  targetType: "planet" | "moon",
  targetId: PlanetId | MoonId,
  minutes: number,
): Session {
  return {
    id: nextId<SessionId>(),
    targetType,
    targetId,
    startedAt: AT,
    completedAt: AT,
    durationMs: minutes * MS_PER_MINUTE,
    status: "completed",
  };
}

function makeMoon(planetId: PlanetId, sessions: readonly Session[]): Moon {
  return {
    id: nextId<MoonId>(),
    planetId,
    name: "moon",
    description: null,
    createdAt: AT,
    orbit: { orbitsCompleted: 0, currentOrbitProgress: 0 },
    sessions,
    lastSessionAt: null,
  };
}

function makePlanet(
  starId: StarId,
  sessions: readonly Session[],
  moons: readonly Moon[] = [],
): Planet {
  return {
    id: nextId<PlanetId>(),
    starId,
    name: "planet",
    description: null,
    createdAt: AT,
    orbit: { orbitsCompleted: 0, currentOrbitProgress: 0 },
    sessions,
    moons,
    lastSessionAt: null,
  };
}

function makeStar(galaxyId: GalaxyId, planets: readonly Planet[]): Star {
  return {
    id: nextId<StarId>(),
    galaxyId,
    name: "star",
    description: null,
    createdAt: AT,
    planets,
  };
}

function makeGalaxy(
  build: (galaxyId: GalaxyId) => readonly Star[] = () => [],
): Galaxy {
  const galaxyId = nextId<GalaxyId>();
  return {
    id: galaxyId,
    universeId: nextId<UniverseId>(),
    name: "My Universe",
    createdAt: AT,
    stars: build(galaxyId),
  };
}

describe("galaxyFocusedMinutes", () => {
  it("returns 0 for an empty galaxy (no stars)", () => {
    expect(galaxyFocusedMinutes(makeGalaxy())).toBe(0);
  });

  it("returns 0 when stars and planets exist but no session does", () => {
    const galaxy = makeGalaxy((gid) => {
      const starId = nextId<StarId>();
      const planet = makePlanet(starId, [], [makeMoon(nextId<PlanetId>(), [])]);
      return [{ ...makeStar(gid, [planet]), id: starId }];
    });
    expect(galaxyFocusedMinutes(galaxy)).toBe(0);
  });

  it("sums a planet's completed sessions, converting ms to minutes", () => {
    const galaxy = makeGalaxy((gid) => {
      const starId = nextId<StarId>();
      const planetId = nextId<PlanetId>();
      const planet = {
        ...makePlanet(starId, []),
        id: planetId,
        sessions: [
          completedSession("planet", planetId, 25),
          completedSession("planet", planetId, 50),
        ],
      };
      return [{ ...makeStar(gid, [planet]), id: starId }];
    });
    expect(galaxyFocusedMinutes(galaxy)).toBe(75);
  });

  it("includes moon sessions — moon work feeds the galaxy's center", () => {
    const galaxy = makeGalaxy((gid) => {
      const starId = nextId<StarId>();
      const planetId = nextId<PlanetId>();
      const moonId = nextId<MoonId>();
      const moon = {
        ...makeMoon(planetId, []),
        id: moonId,
        sessions: [completedSession("moon", moonId, 30)],
      };
      const planet = {
        ...makePlanet(starId, [completedSession("planet", planetId, 100)]),
        id: planetId,
        moons: [moon],
      };
      return [{ ...makeStar(gid, [planet]), id: starId }];
    });
    expect(galaxyFocusedMinutes(galaxy)).toBe(130);
  });

  it("sums across multiple stars, planets, and moons", () => {
    const galaxy = makeGalaxy((gid) => {
      const starAId = nextId<StarId>();
      const starBId = nextId<StarId>();
      const pA1Id = nextId<PlanetId>();
      const pA2Id = nextId<PlanetId>();
      const pBId = nextId<PlanetId>();
      const moonId = nextId<MoonId>();
      const starA = {
        ...makeStar(gid, [
          {
            ...makePlanet(starAId, [completedSession("planet", pA1Id, 25)]),
            id: pA1Id,
          },
          {
            ...makePlanet(starAId, [completedSession("planet", pA2Id, 60)]),
            id: pA2Id,
          },
        ]),
        id: starAId,
      };
      const starB = {
        ...makeStar(gid, [
          {
            ...makePlanet(starBId, [completedSession("planet", pBId, 15)]),
            id: pBId,
            moons: [
              {
                ...makeMoon(pBId, []),
                id: moonId,
                sessions: [completedSession("moon", moonId, 10)],
              },
            ],
          },
        ]),
        id: starBId,
      };
      return [starA, starB];
    });
    expect(galaxyFocusedMinutes(galaxy)).toBe(25 + 60 + 15 + 10);
  });

  it("handles fractional minutes exactly (durationMs is not floored)", () => {
    const galaxy = makeGalaxy((gid) => {
      const starId = nextId<StarId>();
      const planetId = nextId<PlanetId>();
      const session = {
        ...completedSession("planet", planetId, 1),
        durationMs: 90_000, // 1.5 min
      };
      const planet = { ...makePlanet(starId, [session]), id: planetId };
      return [{ ...makeStar(gid, [planet]), id: starId }];
    });
    expect(galaxyFocusedMinutes(galaxy)).toBeCloseTo(1.5, 10);
  });

  it("counts only completed sessions — a chosen length is not worked time", () => {
    // The real record only ever holds completed sessions (only completion
    // commits), so this is the defensive honest-universe guard: a hypothetical
    // in-progress/abandoned entry must not fabricate light.
    const galaxy = makeGalaxy((gid) => {
      const starId = nextId<StarId>();
      const planetId = nextId<PlanetId>();
      const sessions: Session[] = [
        completedSession("planet", planetId, 40),
        {
          ...completedSession("planet", planetId, 600),
          completedAt: null,
          status: "in-progress",
        },
        {
          ...completedSession("planet", planetId, 600),
          completedAt: null,
          status: "abandoned",
        },
      ];
      const planet = { ...makePlanet(starId, sessions), id: planetId };
      return [{ ...makeStar(gid, [planet]), id: starId }];
    });
    expect(galaxyFocusedMinutes(galaxy)).toBe(40);
  });

  it("is monotonic in added sessions — more work never dims the center", () => {
    const starId = nextId<StarId>();
    const planetId = nextId<PlanetId>();
    const base = makeGalaxy((gid) => [
      {
        ...makeStar(gid, [
          {
            ...makePlanet(starId, [completedSession("planet", planetId, 25)]),
            id: planetId,
          },
        ]),
        id: starId,
      },
    ]);
    const before = galaxyFocusedMinutes(base);
    const grown: Galaxy = {
      ...base,
      stars: base.stars.map((s) => ({
        ...s,
        planets: s.planets.map((p) => ({
          ...p,
          sessions: [...p.sessions, completedSession("planet", p.id, 5)],
        })),
      })),
    };
    expect(galaxyFocusedMinutes(grown)).toBeGreaterThan(before);
    expect(accretionIntensity(galaxyFocusedMinutes(grown))).toBeGreaterThan(
      accretionIntensity(before),
    );
  });

  it("does not mutate the galaxy (pure read)", () => {
    const galaxy = makeGalaxy((gid) => {
      const starId = nextId<StarId>();
      const planetId = nextId<PlanetId>();
      const moonId = nextId<MoonId>();
      const planet = {
        ...makePlanet(starId, [completedSession("planet", planetId, 25)]),
        id: planetId,
        moons: [
          {
            ...makeMoon(planetId, [completedSession("moon", moonId, 10)]),
            id: moonId,
          },
        ],
      };
      return [{ ...makeStar(gid, [planet]), id: starId }];
    });
    const snapshot = JSON.parse(JSON.stringify(galaxy)) as unknown;
    galaxyFocusedMinutes(galaxy);
    expect(galaxy).toEqual(snapshot);
  });
});

describe("accretionIntensity", () => {
  it("is 0 at zero minutes — no work, no light", () => {
    expect(accretionIntensity(0)).toBe(0);
  });

  it("clamps a (record-impossible) negative input to 0", () => {
    expect(accretionIntensity(-10)).toBe(0);
  });

  it("is exactly 0.5 at the half-saturation point", () => {
    expect(accretionIntensity(ACCRETION_HALF_SATURATION_MINUTES)).toBe(0.5);
  });

  it("is strictly monotonic increasing", () => {
    const samples = [0, 1, 25, 100, 500, 2000, 10_000, 1_000_000];
    for (let i = 1; i < samples.length; i += 1) {
      expect(accretionIntensity(samples[i]!)).toBeGreaterThan(
        accretionIntensity(samples[i - 1]!),
      );
    }
  });

  it("approaches but never reaches 1 (the asymptote)", () => {
    expect(accretionIntensity(1_000_000)).toBeLessThan(1);
    expect(accretionIntensity(Number.MAX_SAFE_INTEGER)).toBeLessThan(1);
    // ... while getting meaningfully close: presence saturates, never blows out.
    expect(accretionIntensity(1_000_000)).toBeGreaterThan(0.99);
  });

  it("matches the rational form m / (m + half) at sample points", () => {
    const half = ACCRETION_HALF_SATURATION_MINUTES;
    for (const m of [10, 250, 750, 5000]) {
      expect(accretionIntensity(m)).toBeCloseTo(m / (m + half), 12);
    }
  });
});
