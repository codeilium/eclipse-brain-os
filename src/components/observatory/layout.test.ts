import { describe, expect, it } from "vitest";

import {
  computeSize,
  computeStarBodySize,
  computeStarCoronaRadius,
  type ISODateString,
  type Moon,
  type Planet,
  type Session,
  type Star,
  type Galaxy,
} from "@/universe";

import {
  computeStarVisualRadius,
  computeSystemLayout,
  MOON_GAP,
  maxSystemExtent,
  PLANET_GAP,
  type PlanetLayoutInput,
  STAR_CORONA_CLEARANCE,
  systemLayoutForStar,
} from "./layout";
import { MOON_SIZE_SCALE } from "./moons/position";

// ===========================================================================
// computeSystemLayout — pure clearance geometry (the heavy invariant proof).
//
// The invariant we assert everywhere: no two SWEPT ANNULI overlap, and the gap
// between consecutive annuli is EXACTLY the configured gap (the worst-case-angle
// clearance). We recompute the expected clearance from the layout's OWN outputs
// plus the known body radii — so this genuinely cross-checks the packing, never
// re-derives it from the same code.
// ===========================================================================

/**
 * Assert the full clearance invariant for one layout result. For each level we
 * walk outward tracking the previous body's OUTER edge and assert the next
 * body's INNER edge sits exactly `gap` beyond it (so the empty space between any
 * two annuli is the gap → they cannot overlap).
 */
function assertClearance(
  starVisualRadius: number,
  planets: readonly PlanetLayoutInput[],
  layout: ReturnType<typeof computeSystemLayout>,
  planetGap: number,
  moonGap: number,
): void {
  expect(layout.planetShells).toHaveLength(planets.length);
  expect(layout.moonShells).toHaveLength(planets.length);

  const footprints: number[] = [];

  planets.forEach((planet, i) => {
    const shells = layout.moonShells[i]!;
    expect(shells).toHaveLength(planet.moons.length);

    // Moons clear the planet body, then each other, by exactly `moonGap`.
    let prevOuter = planet.bodyRadius;
    shells.forEach((shell, j) => {
      const r = planet.moons[j]!;
      const innerEdge = shell - r;
      expect(innerEdge - prevOuter).toBeCloseTo(moonGap, 9); // exact clearance
      expect(innerEdge - prevOuter).toBeGreaterThan(0); // → never overlaps
      prevOuter = shell + r;
    });

    // Footprint = moon-system reach (always > body) or the body when moonless.
    footprints.push(shells.length === 0 ? planet.bodyRadius : prevOuter);
  });

  // Planets clear the star, then each other, by exactly `planetGap` — using the
  // moon-inclusive footprint so a moony planet never reaches its neighbour.
  let prevOuter = starVisualRadius;
  layout.planetShells.forEach((shell, i) => {
    const fp = footprints[i]!;
    const innerEdge = shell - fp;
    expect(innerEdge - prevOuter).toBeCloseTo(planetGap, 9);
    expect(innerEdge - prevOuter).toBeGreaterThan(0);
    prevOuter = shell + fp;
  });

  // systemExtent = the outermost planet annulus edge (or the star alone).
  const expectedExtent =
    planets.length === 0 ? starVisualRadius : prevOuter;
  expect(layout.systemExtent).toBeCloseTo(expectedExtent, 9);
}

const noMoons = (bodyRadius: number): PlanetLayoutInput => ({
  bodyRadius,
  moons: [],
});

describe("computeSystemLayout — innermost clears the star", () => {
  it("places planet 0 exactly PLANET_GAP beyond the star (no moons)", () => {
    const R = 0.56; // a fresh star's visual radius
    const r = computeSize(0); // a fresh planet body
    const { planetShells } = computeSystemLayout(R, [noMoons(r)]);
    // shell − footprint − R === PLANET_GAP
    expect(planetShells[0]! - r - R).toBeCloseTo(PLANET_GAP, 9);
  });

  it("reproduces the OLD fresh-system spacing (young systems look unchanged)", () => {
    // The deliberate calibration: fresh star R≈0.56, fresh planet r=0.15 →
    // shell0 ≈ 1.21 (old PLANET_BASE_DISTANCE 1.2), step 0.8 (old RING_SPACING).
    const R = computeSize(0) * 1.4 + STAR_CORONA_CLEARANCE * 1.0; // body + 0.35·base corona
    const r = computeSize(0);
    const { planetShells } = computeSystemLayout(R, [
      noMoons(r),
      noMoons(r),
      noMoons(r),
    ]);
    expect(planetShells[0]!).toBeCloseTo(1.21, 2);
    expect(planetShells[1]! - planetShells[0]!).toBeCloseTo(0.8, 9);
    expect(planetShells[2]! - planetShells[1]!).toBeCloseTo(0.8, 9);
  });
});

describe("computeSystemLayout — adjacent planets never overlap", () => {
  it("clears each neighbour by exactly PLANET_GAP across many sizes", () => {
    const R = 1.0;
    const planets = [0.15, 0.4, 0.75, 0.3, 0.6].map(noMoons);
    const layout = computeSystemLayout(R, planets);
    assertClearance(R, planets, layout, PLANET_GAP, MOON_GAP);
    // Shells strictly increase outward.
    for (let i = 1; i < layout.planetShells.length; i++) {
      expect(layout.planetShells[i]!).toBeGreaterThan(layout.planetShells[i - 1]!);
    }
  });

  it("a planet WITH moons pushes its outer neighbour further than one without", () => {
    const R = 0.6;
    const big = computeSize(20); // a sizeable planet body
    const withMoons: PlanetLayoutInput = {
      bodyRadius: big,
      moons: [0.2, 0.2, 0.2],
    };
    const without = noMoons(big);
    const outer = noMoons(0.3);

    const a = computeSystemLayout(R, [withMoons, outer]);
    const b = computeSystemLayout(R, [without, outer]);
    // The moon system enlarges planet 0's footprint, so planet 1 sits further out.
    expect(a.planetShells[1]!).toBeGreaterThan(b.planetShells[1]!);
    assertClearance(R, [withMoons, outer], a, PLANET_GAP, MOON_GAP);
  });
});

describe("computeSystemLayout — moons clear their planet (and each other)", () => {
  it("places moon 0 exactly MOON_GAP beyond the planet body", () => {
    const planet: PlanetLayoutInput = { bodyRadius: 0.5, moons: [0.1] };
    const { moonShells } = computeSystemLayout(1, [planet]);
    expect(moonShells[0]![0]! - 0.1 - 0.5).toBeCloseTo(MOON_GAP, 9);
  });

  it("a planet that has OUTGROWN its moons still never swallows them", () => {
    // Huge planet body, tiny moons (the swallowing bug). moon 0's inner edge
    // must still clear the body by MOON_GAP, at every planet growth stage.
    const tinyMoon = computeSize(0) * MOON_SIZE_SCALE; // smallest possible moon
    for (const orbits of [0, 1, 5, 20, 40, 100]) {
      const body = computeSize(orbits);
      const planet: PlanetLayoutInput = {
        bodyRadius: body,
        moons: [tinyMoon, tinyMoon],
      };
      const layout = computeSystemLayout(2, [planet]);
      const shell0 = layout.moonShells[0]![0]!;
      expect(shell0 - tinyMoon - body).toBeCloseTo(MOON_GAP, 9);
      expect(shell0 - tinyMoon).toBeGreaterThan(body); // inner edge outside the body
      assertClearance(2, [planet], layout, PLANET_GAP, MOON_GAP);
    }
  });
});

describe("computeSystemLayout — systemExtent", () => {
  it("is the outermost planet annulus edge", () => {
    const R = 0.8;
    const planets = [noMoons(0.3), { bodyRadius: 0.5, moons: [0.15, 0.15] }];
    const layout = computeSystemLayout(R, planets);
    const lastShell = layout.planetShells[1]!;
    const lastFootprint =
      layout.moonShells[1]![1]! + 0.15; // outermost moon shell + its radius
    expect(layout.systemExtent).toBeCloseTo(lastShell + lastFootprint, 9);
  });

  it("is just the star's visual radius when the star has no planets", () => {
    const layout = computeSystemLayout(0.42, []);
    expect(layout.planetShells).toEqual([]);
    expect(layout.moonShells).toEqual([]);
    expect(layout.systemExtent).toBe(0.42);
  });
});

describe("computeSystemLayout — monotonic growth (the breathe)", () => {
  it("growing an inner body pushes everything OUTSIDE it outward, nothing inside", () => {
    const R = 0.6;
    const small = computeSystemLayout(R, [noMoons(0.2), noMoons(0.2), noMoons(0.2)]);
    // Grow the middle planet's body; planet 0 is unchanged, planets ≥1 move out.
    const grown = computeSystemLayout(R, [noMoons(0.2), noMoons(0.7), noMoons(0.2)]);
    expect(grown.planetShells[0]!).toBeCloseTo(small.planetShells[0]!, 9); // inner unchanged
    expect(grown.planetShells[1]!).toBeGreaterThan(small.planetShells[1]!); // itself out
    expect(grown.planetShells[2]!).toBeGreaterThan(small.planetShells[2]!); // outer pushed
    expect(grown.systemExtent).toBeGreaterThan(small.systemExtent);
  });

  it("a bigger star pushes the whole system outward", () => {
    const planets = [noMoons(0.3), noMoons(0.3)];
    const tight = computeSystemLayout(0.5, planets);
    const wide = computeSystemLayout(1.5, planets);
    expect(wide.planetShells[0]!).toBeGreaterThan(tight.planetShells[0]!);
    expect(wide.systemExtent).toBeGreaterThan(tight.systemExtent);
  });
});

describe("computeSystemLayout — honours custom gaps (general, not just defaults)", () => {
  it("clears by the SUPPLIED gaps", () => {
    const R = 1.0;
    const planets: PlanetLayoutInput[] = [
      { bodyRadius: 0.4, moons: [0.1, 0.2] },
      noMoons(0.6),
    ];
    const planetGap = 0.9;
    const moonGap = 0.05;
    const layout = computeSystemLayout(R, planets, { planetGap, moonGap });
    assertClearance(R, planets, layout, planetGap, moonGap);
  });
});

describe("computeSystemLayout — stress: NOTHING overlaps at any growth level", () => {
  it("holds for small / fully-grown / many-planet / with-&-without-moon configs", () => {
    const starRadii = [0.2, 0.56, 1.0, 2.2]; // empty → fully-grown star
    const orbitMenu = [0, 1, 4, 10, 20, 40, 100];

    for (const R of starRadii) {
      // Build up to 8 planets, alternating moon counts (0..3), all at varied orbits.
      for (const planetCount of [0, 1, 2, 5, 8]) {
        const planets: PlanetLayoutInput[] = Array.from(
          { length: planetCount },
          (_, i) => {
            const planetOrbits = orbitMenu[(i * 3) % orbitMenu.length]!;
            const moonCount = i % 4; // 0,1,2,3,0,1,2,3
            return {
              bodyRadius: computeSize(planetOrbits),
              moons: Array.from(
                { length: moonCount },
                (_, j) =>
                  computeSize(orbitMenu[(i + j) % orbitMenu.length]!) *
                  MOON_SIZE_SCALE,
              ),
            };
          },
        );
        const layout = computeSystemLayout(R, planets);
        assertClearance(R, planets, layout, PLANET_GAP, MOON_GAP);
      }
    }
  });
});

describe("computeSystemLayout — the PRD's named configs each clear", () => {
  it("SMALL (fresh) system: tight and intimate, nothing overlaps", () => {
    const R = computeSize(0) * 1.4 + STAR_CORONA_CLEARANCE * 1.0;
    const planets = [noMoons(computeSize(0))];
    const layout = computeSystemLayout(R, planets);
    assertClearance(R, planets, layout, PLANET_GAP, MOON_GAP);
    expect(layout.systemExtent).toBeLessThan(2); // intimate, not sprawling
  });

  it("FULLY-GROWN system (ceiling bodies, multi-moon): still nothing overlaps", () => {
    const R = computeSize(100) * 1.4 + STAR_CORONA_CLEARANCE * 2.5; // a maxed star
    const grownMoon = computeSize(40) * MOON_SIZE_SCALE;
    const planets: PlanetLayoutInput[] = [40, 60, 100, 40].map((orbits) => ({
      bodyRadius: computeSize(orbits),
      moons: [grownMoon, grownMoon, grownMoon],
    }));
    const layout = computeSystemLayout(R, planets);
    assertClearance(R, planets, layout, PLANET_GAP, MOON_GAP);
    expect(layout.systemExtent).toBeGreaterThan(10); // breathed far outward
  });

  it("planets WITH and WITHOUT moons coexist in one system, all clear", () => {
    const R = 0.7;
    const planets: PlanetLayoutInput[] = [
      noMoons(computeSize(10)),
      { bodyRadius: computeSize(10), moons: [0.15, 0.15] },
      noMoons(computeSize(2)),
    ];
    assertClearance(
      R,
      planets,
      computeSystemLayout(R, planets),
      PLANET_GAP,
      MOON_GAP,
    );
  });
});

// ===========================================================================
// Adapters — turn a universe Star into the geometry inputs (the locked size
// math) and pick the largest extent. Hand-built fixtures (the math.test.ts idiom).
// ===========================================================================

const EPOCH = "2026-01-01T00:00:00.000Z" as ISODateString;

const makeMoon = (orbitsCompleted: number): Moon =>
  ({
    id: "m",
    planetId: "p",
    name: "m",
    description: null,
    createdAt: EPOCH,
    orbit: { orbitsCompleted, currentOrbitProgress: 0 },
    sessions: [],
    lastSessionAt: null,
  }) as unknown as Moon;

const completedSessions = (n: number): readonly Session[] =>
  Array.from(
    { length: n },
    () =>
      ({
        id: "s",
        targetType: "planet",
        targetId: "p",
        startedAt: EPOCH,
        completedAt: EPOCH,
        durationMs: 1_500_000,
        status: "completed",
      }) as unknown as Session,
  );

const makePlanet = (
  orbitsCompleted: number,
  moons: readonly Moon[] = [],
  sessions: readonly Session[] = [],
): Planet =>
  ({
    id: "p",
    starId: "s",
    name: "p",
    description: null,
    createdAt: EPOCH,
    orbit: { orbitsCompleted, currentOrbitProgress: 0 },
    sessions,
    moons,
    lastSessionAt: null,
  }) as unknown as Planet;

const makeStar = (planets: readonly Planet[]): Star =>
  ({
    id: "s",
    galaxyId: "g",
    name: "s",
    description: null,
    createdAt: EPOCH,
    planets,
  }) as unknown as Star;

const makeGalaxy = (stars: readonly Star[]): Galaxy =>
  ({ stars }) as unknown as Galaxy;

describe("computeStarVisualRadius", () => {
  it("is the body size plus a fraction of the corona", () => {
    const star = makeStar([makePlanet(5), makePlanet(2)]);
    expect(computeStarVisualRadius(star)).toBeCloseTo(
      computeStarBodySize(star) +
        STAR_CORONA_CLEARANCE * computeStarCoronaRadius(star),
      9,
    );
  });

  it("grows as the corona grows (more cumulative work → larger clearance)", () => {
    const quiet = makeStar([makePlanet(1, [], completedSessions(0))]);
    const busy = makeStar([makePlanet(1, [], completedSessions(50))]);
    expect(computeStarVisualRadius(busy)).toBeGreaterThan(
      computeStarVisualRadius(quiet),
    );
  });
});

describe("systemLayoutForStar", () => {
  it("maps planet orbits → computeSize body radii and moon orbits → ×MOON_SIZE_SCALE", () => {
    const star = makeStar([
      makePlanet(5, [makeMoon(2), makeMoon(0)]),
      makePlanet(0),
    ]);
    const expected = computeSystemLayout(computeStarVisualRadius(star), [
      {
        bodyRadius: computeSize(5),
        moons: [computeSize(2) * MOON_SIZE_SCALE, computeSize(0) * MOON_SIZE_SCALE],
      },
      { bodyRadius: computeSize(0), moons: [] },
    ]);
    expect(systemLayoutForStar(star)).toEqual(expected);
  });

  it("a planet-less star lays out to just its visual radius as the extent", () => {
    const star = makeStar([]);
    expect(systemLayoutForStar(star).systemExtent).toBeCloseTo(
      computeStarVisualRadius(star),
      9,
    );
  });

  it("a matured system extends much further than its fresh self (the breathe)", () => {
    // Same shape (2 planets, each 1 moon); fresh vs well-grown via real orbits.
    const fresh = makeStar([
      makePlanet(0, [makeMoon(0)]),
      makePlanet(0, [makeMoon(0)]),
    ]);
    const mature = makeStar([
      makePlanet(40, [makeMoon(20)]),
      makePlanet(40, [makeMoon(20)]),
    ]);
    expect(systemLayoutForStar(mature).systemExtent).toBeGreaterThan(
      systemLayoutForStar(fresh).systemExtent,
    );
  });
});

describe("maxSystemExtent", () => {
  it("is 0 for an empty galaxy (no stars → no shells)", () => {
    expect(maxSystemExtent(makeGalaxy([]))).toBe(0);
  });

  it("picks the largest system's extent across the galaxy", () => {
    const small = makeStar([makePlanet(0)]);
    const large = makeStar([makePlanet(40, [makeMoon(20), makeMoon(20)]), makePlanet(40)]);
    const galaxy = makeGalaxy([small, large]);
    expect(maxSystemExtent(galaxy)).toBeCloseTo(
      systemLayoutForStar(large).systemExtent,
      9,
    );
    expect(maxSystemExtent(galaxy)).toBeGreaterThan(
      systemLayoutForStar(small).systemExtent,
    );
  });

  it("is scoped to the given galaxy — a grown sibling sky cannot inflate it (PRD 27)", () => {
    const small = makeStar([makePlanet(0)]);
    const large = makeStar([makePlanet(40, [makeMoon(20)]), makePlanet(40)]);
    // Two skies: the small galaxy's extent must ignore the grown one entirely.
    expect(maxSystemExtent(makeGalaxy([small]))).toBeLessThan(
      maxSystemExtent(makeGalaxy([large])),
    );
    expect(maxSystemExtent(makeGalaxy([small]))).toBeCloseTo(
      systemLayoutForStar(small).systemExtent,
      9,
    );
  });
});
