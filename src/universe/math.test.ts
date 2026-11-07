import { describe, expect, it } from "vitest";

import {
  BRIGHTNESS_HALF_LIFE_DAYS,
  GROWTH_AMOUNT,
  GROWTH_BASE_SIZE,
  GROWTH_CEILING_ORBITS,
  MS_PER_DAY,
  STAR_BODY_SIZE_MULTIPLIER,
  STAR_CORONA_BASE_RADIUS,
  STAR_CORONA_CEILING_POMODOROS,
  STAR_CORONA_EXPANSION_AMOUNT,
} from "./constants";
import {
  advanceOrbit,
  computeBrightness,
  computeSize,
  computeStarBodySize,
  computeStarBrightness,
  computeStarCoronaRadius,
  countCompletedPomodorosInStar,
  decayBrightness,
  normalizeOrbit,
  orbitProgressForDuration,
} from "./math";
import type {
  GalaxyId,
  ISODateString,
  Moon,
  MoonId,
  Planet,
  PlanetId,
  Session,
  Star,
  StarId,
} from "./types";

// ----- minimal fixture builders (test-only; excluded from coverage) -----

const EPOCH = "2026-01-01T00:00:00.000Z";
const ISO = (s: string): ISODateString => s as ISODateString;

function makeSession(status: Session["status"]): Session {
  return {
    id: "sess" as SessionId,
    targetType: "planet",
    targetId: "p" as PlanetId,
    startedAt: ISO(EPOCH),
    completedAt: status === "completed" ? ISO(EPOCH) : null,
    durationMs: 1_500_000,
    status,
  };
}
type SessionId = Session["id"];

function makeMoon(over: Partial<Moon> = {}): Moon {
  return {
    id: "m" as MoonId,
    planetId: "p" as PlanetId,
    name: "Moon",
    description: null,
    createdAt: ISO(EPOCH),
    orbit: { orbitsCompleted: 0, currentOrbitProgress: 0 },
    sessions: [],
    lastSessionAt: null,
    ...over,
  };
}

function makePlanet(over: Partial<Planet> = {}): Planet {
  return {
    id: "p" as PlanetId,
    starId: "s" as StarId,
    name: "Planet",
    description: null,
    createdAt: ISO(EPOCH),
    orbit: { orbitsCompleted: 0, currentOrbitProgress: 0 },
    sessions: [],
    moons: [],
    lastSessionAt: null,
    ...over,
  };
}

function makeStar(planets: ReadonlyArray<Planet>): Star {
  return {
    id: "s" as StarId,
    galaxyId: "g" as GalaxyId,
    name: "Star",
    description: null,
    createdAt: ISO(EPOCH),
    planets,
  };
}

const completedTimes = (n: number): ReadonlyArray<Session> =>
  Array.from({ length: n }, () => makeSession("completed"));

// ----- normalizeOrbit -----

describe("normalizeOrbit", () => {
  it("leaves an already-normalized orbit unchanged", () => {
    expect(normalizeOrbit({ orbitsCompleted: 2, currentOrbitProgress: 0.5 })).toEqual({
      orbitsCompleted: 2,
      currentOrbitProgress: 0.5,
    });
  });

  it("rolls over at exactly 1.0 progress", () => {
    expect(normalizeOrbit({ orbitsCompleted: 0, currentOrbitProgress: 1 })).toEqual({
      orbitsCompleted: 1,
      currentOrbitProgress: 0,
    });
  });

  it("rolls a single boundary when progress > 1", () => {
    expect(normalizeOrbit({ orbitsCompleted: 0, currentOrbitProgress: 1.5 })).toEqual({
      orbitsCompleted: 1,
      currentOrbitProgress: 0.5,
    });
  });

  it("handles multi-orbit rollover (progress > 2)", () => {
    expect(normalizeOrbit({ orbitsCompleted: 0, currentOrbitProgress: 2.75 })).toEqual({
      orbitsCompleted: 2,
      currentOrbitProgress: 0.75,
    });
    expect(normalizeOrbit({ orbitsCompleted: 3, currentOrbitProgress: 2.25 })).toEqual({
      orbitsCompleted: 5,
      currentOrbitProgress: 0.25,
    });
  });

  it("keeps currentOrbitProgress in [0, 1)", () => {
    const { currentOrbitProgress } = normalizeOrbit({
      orbitsCompleted: 1,
      currentOrbitProgress: 3.99,
    });
    expect(currentOrbitProgress).toBeGreaterThanOrEqual(0);
    expect(currentOrbitProgress).toBeLessThan(1);
  });
});

// ----- advanceOrbit -----

describe("advanceOrbit", () => {
  it("advances within a single orbit", () => {
    expect(advanceOrbit({ orbitsCompleted: 0, currentOrbitProgress: 0 }, 0.25)).toEqual({
      orbitsCompleted: 0,
      currentOrbitProgress: 0.25,
    });
  });

  it("advances across one orbit boundary", () => {
    expect(advanceOrbit({ orbitsCompleted: 0, currentOrbitProgress: 0.75 }, 0.5)).toEqual({
      orbitsCompleted: 1,
      currentOrbitProgress: 0.25,
    });
  });

  it("advances across multiple orbit boundaries in one step", () => {
    expect(advanceOrbit({ orbitsCompleted: 0, currentOrbitProgress: 0.5 }, 2)).toEqual({
      orbitsCompleted: 2,
      currentOrbitProgress: 0.5,
    });
  });

  it("preserves existing completed orbits", () => {
    expect(advanceOrbit({ orbitsCompleted: 3, currentOrbitProgress: 0.5 }, 0.25)).toEqual({
      orbitsCompleted: 3,
      currentOrbitProgress: 0.75,
    });
  });
});

// ----- orbitProgressForDuration (PRD 22 — a minute = a percent) -----

const MIN_MS = 60_000;

describe("orbitProgressForDuration", () => {
  it("converts minutes to orbit progress at 1 min = 1% (100 min = one orbit)", () => {
    expect(orbitProgressForDuration(1 * MIN_MS)).toBeCloseTo(0.01, 10);
    expect(orbitProgressForDuration(10 * MIN_MS)).toBeCloseTo(0.1, 10);
    expect(orbitProgressForDuration(25 * MIN_MS)).toBeCloseTo(0.25, 10);
    expect(orbitProgressForDuration(50 * MIN_MS)).toBeCloseTo(0.5, 10);
    expect(orbitProgressForDuration(100 * MIN_MS)).toBeCloseTo(1.0, 10);
  });

  it("returns the whole multi-orbit delta for a long session (no flooring here)", () => {
    // The raw delta, BEFORE normalizeOrbit rolls it. The field MAX is 600 min = 6 orbits.
    expect(orbitProgressForDuration(250 * MIN_MS)).toBeCloseTo(2.5, 10);
    expect(orbitProgressForDuration(600 * MIN_MS)).toBeCloseTo(6.0, 10);
  });

  it("is zero for a zero-length session", () => {
    expect(orbitProgressForDuration(0)).toBe(0);
  });

  it("composes with advanceOrbit to roll a multi-orbit session (the linchpin)", () => {
    // 250 min from progress 0.7 → +3 orbits, ≈0.2 remainder (the PRD's headline case).
    const rolled = advanceOrbit(
      { orbitsCompleted: 0, currentOrbitProgress: 0.7 },
      orbitProgressForDuration(250 * MIN_MS),
    );
    expect(rolled.orbitsCompleted).toBe(3);
    expect(rolled.currentOrbitProgress).toBeCloseTo(0.2, 10);

    // 250 min from 0 → exactly +2 orbits, progress 0.5.
    expect(
      advanceOrbit(
        { orbitsCompleted: 0, currentOrbitProgress: 0 },
        orbitProgressForDuration(250 * MIN_MS),
      ),
    ).toEqual({ orbitsCompleted: 2, currentOrbitProgress: 0.5 });

    // 100 min from 0 → exactly +1 orbit, progress 0.0 (lands clean on the boundary).
    expect(
      advanceOrbit(
        { orbitsCompleted: 0, currentOrbitProgress: 0 },
        orbitProgressForDuration(100 * MIN_MS),
      ),
    ).toEqual({ orbitsCompleted: 1, currentOrbitProgress: 0 });

    // 600 min from 0 → +6 orbits, progress 0.0 (the field max, in a single commit).
    expect(
      advanceOrbit(
        { orbitsCompleted: 0, currentOrbitProgress: 0 },
        orbitProgressForDuration(600 * MIN_MS),
      ),
    ).toEqual({ orbitsCompleted: 6, currentOrbitProgress: 0 });
  });
});

// ----- computeSize -----

describe("computeSize", () => {
  it("returns the base size at 0 orbits", () => {
    expect(computeSize(0)).toBeCloseTo(GROWTH_BASE_SIZE, 10);
  });

  it("returns base + amount at the ceiling", () => {
    expect(computeSize(GROWTH_CEILING_ORBITS)).toBeCloseTo(
      GROWTH_BASE_SIZE + GROWTH_AMOUNT,
      10,
    );
  });

  it("is strictly monotonically increasing", () => {
    const samples = [0, 1, 2, 5, 10, 20, 40, 100].map(computeSize);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!);
    }
  });

  it("keeps growing (slowly) beyond the ceiling", () => {
    expect(computeSize(100)).toBeGreaterThan(computeSize(GROWTH_CEILING_ORBITS));
  });
});

// ----- decayBrightness -----

describe("decayBrightness", () => {
  it("is fully warm (1.0) at zero elapsed time", () => {
    expect(decayBrightness(0)).toBe(1);
  });

  it("is 0.5 after exactly one half-life", () => {
    expect(decayBrightness(BRIGHTNESS_HALF_LIFE_DAYS * MS_PER_DAY)).toBeCloseTo(0.5, 10);
  });

  it("is 0.25 after two half-lives", () => {
    expect(decayBrightness(2 * BRIGHTNESS_HALF_LIFE_DAYS * MS_PER_DAY)).toBeCloseTo(
      0.25,
      10,
    );
  });

  it("is 0.125 after three half-lives", () => {
    expect(decayBrightness(3 * BRIGHTNESS_HALF_LIFE_DAYS * MS_PER_DAY)).toBeCloseTo(
      0.125,
      10,
    );
  });

  it("asymptotes toward 0 but never reaches it", () => {
    const oneYear = decayBrightness(365 * MS_PER_DAY);
    expect(oneYear).toBeGreaterThan(0);
    expect(oneYear).toBeLessThan(0.01);
  });

  it("clamps to 1.0 for negative elapsed time (future-dated)", () => {
    expect(decayBrightness(-7 * MS_PER_DAY)).toBe(1);
  });

  it("stays within [0, 1] across extremes", () => {
    expect(decayBrightness(Number.MAX_SAFE_INTEGER)).toBeGreaterThanOrEqual(0);
    expect(decayBrightness(-Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(1);
  });
});

// ----- computeBrightness -----

describe("computeBrightness", () => {
  it("decays from createdAt when there are no sessions", () => {
    const createdAt = EPOCH;
    const nowMs = Date.parse(createdAt) + BRIGHTNESS_HALF_LIFE_DAYS * MS_PER_DAY;
    expect(computeBrightness(null, createdAt, nowMs)).toBeCloseTo(0.5, 10);
  });

  it("decays from lastSessionAt once a session exists, ignoring createdAt", () => {
    const createdAt = EPOCH; // long ago
    const nowMs = Date.parse(createdAt) + 100 * MS_PER_DAY;
    const lastSessionAt = new Date(nowMs).toISOString(); // just now
    // If it (wrongly) used createdAt, this would be ~0; using lastSessionAt → ~1.
    expect(computeBrightness(lastSessionAt, createdAt, nowMs)).toBeCloseTo(1, 10);
  });

  it("matches decayBrightness from the chosen reference", () => {
    const createdAt = EPOCH;
    const nowMs = Date.parse(createdAt) + 3 * MS_PER_DAY;
    expect(computeBrightness(null, createdAt, nowMs)).toBe(
      decayBrightness(nowMs - Date.parse(createdAt)),
    );
  });
});

// ----- computeStarBrightness -----

describe("computeStarBrightness", () => {
  it("is 0 for a star with no planets", () => {
    expect(computeStarBrightness(makeStar([]), Date.parse(EPOCH))).toBe(0);
  });

  it("is the max of its planets' brightness", () => {
    const nowMs = Date.parse(EPOCH) + 30 * MS_PER_DAY;
    const recent = new Date(nowMs).toISOString();
    const old = new Date(nowMs - 14 * MS_PER_DAY).toISOString();
    const star = makeStar([
      makePlanet({ lastSessionAt: ISO(recent) }), // ~1.0 (brightest)
      makePlanet({ lastSessionAt: ISO(old) }), // ~0.25
    ]);
    const result = computeStarBrightness(star, nowMs);
    expect(result).toBeCloseTo(1, 10);
    expect(result).toBeGreaterThan(0.9);
  });

  it("returns the least-neglected planet when all are dim", () => {
    const nowMs = Date.parse(EPOCH) + 60 * MS_PER_DAY;
    const star = makeStar([
      makePlanet({ lastSessionAt: ISO(new Date(nowMs - 21 * MS_PER_DAY).toISOString()) }),
      makePlanet({ lastSessionAt: ISO(new Date(nowMs - 14 * MS_PER_DAY).toISOString()) }),
    ]);
    // 14-day planet (0.25) is brighter than the 21-day planet (0.125).
    expect(computeStarBrightness(star, nowMs)).toBeCloseTo(0.25, 10);
  });
});

// ----- computeStarCoronaRadius -----

describe("computeStarCoronaRadius", () => {
  const starWithPomodoros = (n: number): Star =>
    makeStar([makePlanet({ sessions: completedTimes(n) })]);

  it("starts at the base radius with no completed Pomodoros", () => {
    expect(computeStarCoronaRadius(starWithPomodoros(0))).toBeCloseTo(
      STAR_CORONA_BASE_RADIUS,
      10,
    );
  });

  it("grows logarithmically with cumulative Pomodoros", () => {
    expect(computeStarCoronaRadius(starWithPomodoros(10))).toBeGreaterThan(
      computeStarCoronaRadius(starWithPomodoros(0)),
    );
    expect(computeStarCoronaRadius(starWithPomodoros(50))).toBeGreaterThan(
      computeStarCoronaRadius(starWithPomodoros(10)),
    );
  });

  it("caps at the ceiling and reaches base + expansion", () => {
    const atCeiling = computeStarCoronaRadius(
      starWithPomodoros(STAR_CORONA_CEILING_POMODOROS),
    );
    const beyond = computeStarCoronaRadius(
      starWithPomodoros(STAR_CORONA_CEILING_POMODOROS + 300),
    );
    expect(atCeiling).toBeCloseTo(
      STAR_CORONA_BASE_RADIUS + STAR_CORONA_EXPANSION_AMOUNT,
      10,
    );
    expect(beyond).toBeCloseTo(atCeiling, 10);
  });
});

// ----- computeStarBodySize -----

describe("computeStarBodySize", () => {
  const planetWithOrbits = (orbitsCompleted: number): Planet =>
    makePlanet({ orbit: { orbitsCompleted, currentOrbitProgress: 0 } });

  it("is the base size × multiplier for a star with no planets", () => {
    // computeSize(0) === GROWTH_BASE_SIZE — the smallest possible body.
    expect(computeStarBodySize(makeStar([]))).toBeCloseTo(
      GROWTH_BASE_SIZE * STAR_BODY_SIZE_MULTIPLIER,
      10,
    );
  });

  it("treats a star whose planets are all at 0 orbits like a brand-new star", () => {
    const allZero = makeStar([planetWithOrbits(0), planetWithOrbits(0)]);
    expect(computeStarBodySize(allZero)).toBeCloseTo(
      computeStarBodySize(makeStar([])),
      10,
    );
  });

  it("aggregates a single planet's completed orbits, scaled by the multiplier", () => {
    expect(computeStarBodySize(makeStar([planetWithOrbits(5)]))).toBeCloseTo(
      computeSize(5) * STAR_BODY_SIZE_MULTIPLIER,
      10,
    );
  });

  it("sums orbitsCompleted across multiple planets (the 0/2/5 scenario → total 7)", () => {
    const star = makeStar([
      planetWithOrbits(0),
      planetWithOrbits(2),
      planetWithOrbits(5),
    ]);
    expect(computeStarBodySize(star)).toBeCloseTo(
      computeSize(7) * STAR_BODY_SIZE_MULTIPLIER,
      10,
    );
  });

  it("never shrinks as orbits are added (monotonic in total orbits)", () => {
    const sizes = [0, 1, 3, 8, 20, 60].map((total) =>
      computeStarBodySize(makeStar([planetWithOrbits(total)])),
    );
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeGreaterThan(sizes[i - 1]!);
    }
  });

  it("always exceeds its largest planet's size (the metaphor invariant)", () => {
    // In the 0/2/5 star, the body dominates the largest planet (5 orbits).
    const star = makeStar([
      planetWithOrbits(0),
      planetWithOrbits(2),
      planetWithOrbits(5),
    ]);
    expect(computeStarBodySize(star)).toBeGreaterThan(computeSize(5));
    // The ratio floor is exactly the multiplier — when one planet holds all
    // the orbits, totalOrbits === that planet's orbits.
    expect(computeStarBodySize(makeStar([planetWithOrbits(40)]))).toBeCloseTo(
      computeSize(40) * STAR_BODY_SIZE_MULTIPLIER,
      10,
    );
  });
});

// ----- countCompletedPomodorosInStar -----

describe("countCompletedPomodorosInStar", () => {
  it("counts only completed sessions across all planets", () => {
    const star = makeStar([
      makePlanet({
        sessions: [
          makeSession("completed"),
          makeSession("completed"),
          makeSession("abandoned"),
          makeSession("in-progress"),
        ],
      }),
      makePlanet({ sessions: [makeSession("completed")] }),
    ]);
    expect(countCompletedPomodorosInStar(star)).toBe(3);
  });

  it("ignores moon sessions entirely", () => {
    const star = makeStar([
      makePlanet({
        sessions: [makeSession("completed")],
        moons: [makeMoon({ sessions: [makeSession("completed"), makeSession("completed")] })],
      }),
    ]);
    expect(countCompletedPomodorosInStar(star)).toBe(1);
  });

  it("is 0 for a star whose planets have no sessions", () => {
    expect(countCompletedPomodorosInStar(makeStar([makePlanet()]))).toBe(0);
  });
});
