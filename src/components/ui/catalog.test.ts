import { describe, expect, it } from "vitest";

import { createMoon, createPlanet, createStar } from "@/universe";
import type { GalaxyId, Star } from "@/universe";

import { filterCatalog } from "./catalog";

const GALAXY_ID = "galaxy-1" as GalaxyId;

/** A star with real practices attached (the factories + spread, like the model tests). */
function star(name: string, practiceNames: ReadonlyArray<string> = []): Star {
  const s = createStar(GALAXY_ID, name);
  return { ...s, planets: practiceNames.map((n) => createPlanet(s.id, n)) };
}

/** The canonical little universe the contract tests read against. */
function fixture(): ReadonlyArray<Star> {
  return [
    star("Become a better engineer", ["Python", "Systems design"]),
    star("Write a novel", ["Drafting", "Editing"]),
    star("Stay healthy"), // a pursuit with no practices yet
  ];
}

describe("filterCatalog — empty query is everything", () => {
  it("returns every star with all its practices on an empty query", () => {
    const stars = fixture();
    const entries = filterCatalog(stars, "");
    expect(entries.map((e) => e.star)).toEqual([...stars]);
    // All practices, by reference — the resting catalog is the full list.
    entries.forEach((entry, i) => {
      expect(entry.practices).toBe(stars[i]?.planets);
    });
  });

  it("treats a whitespace-only query as empty", () => {
    const stars = fixture();
    expect(filterCatalog(stars, "   \t ")).toEqual(filterCatalog(stars, ""));
  });

  it("includes a practice-less star on an empty query", () => {
    const entries = filterCatalog(fixture(), "");
    const healthy = entries.find((e) => e.star.name === "Stay healthy");
    expect(healthy).toBeDefined();
    expect(healthy?.practices).toEqual([]);
  });

  it("returns an empty catalog for an empty universe", () => {
    expect(filterCatalog([], "")).toEqual([]);
    expect(filterCatalog([], "python")).toEqual([]);
  });
});

describe("filterCatalog — matching is a case-insensitive substring", () => {
  it("matches a star name regardless of case", () => {
    const entries = filterCatalog(fixture(), "ENGINEER");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.star.name).toBe("Become a better engineer");
  });

  it("matches mid-word substrings", () => {
    // "yth" sits inside "Python" — substring, not prefix/word matching.
    const entries = filterCatalog(fixture(), "yth");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.practices.map((p) => p.name)).toEqual(["Python"]);
  });

  it("trims the query before matching", () => {
    const entries = filterCatalog(fixture(), "  python  ");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.practices.map((p) => p.name)).toEqual(["Python"]);
  });
});

describe("filterCatalog — which stars appear, and which practices show", () => {
  it("a name-matched star shows ALL its practices (even non-matching ones)", () => {
    const stars = fixture();
    const entries = filterCatalog(stars, "novel");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.star.name).toBe("Write a novel");
    expect(entries[0]?.practices).toBe(stars[1]?.planets); // all, by reference
  });

  it("a star matched only via a practice shows ONLY the matching practices", () => {
    const entries = filterCatalog(fixture(), "python");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.star.name).toBe("Become a better engineer");
    expect(entries[0]?.practices.map((p) => p.name)).toEqual(["Python"]);
  });

  it("shows every matching practice when several match", () => {
    const stars = [star("Music", ["Sight reading", "Sight singing", "Theory"])];
    const entries = filterCatalog(stars, "sight");
    expect(entries[0]?.practices.map((p) => p.name)).toEqual([
      "Sight reading",
      "Sight singing",
    ]);
  });

  it("a query can match one star by name and another by practice — both appear, each shaped right", () => {
    const stars = [
      star("Design", ["Typography"]), // name-matched → all practices
      star("Become a better engineer", ["Systems design", "Python"]), // practice-matched → only it
    ];
    const entries = filterCatalog(stars, "design");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.practices).toBe(stars[0]?.planets);
    expect(entries[1]?.practices.map((p) => p.name)).toEqual(["Systems design"]);
  });

  it("a practice-less star appears on a name match, with no practices", () => {
    const entries = filterCatalog(fixture(), "healthy");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.star.name).toBe("Stay healthy");
    expect(entries[0]?.practices).toEqual([]);
  });

  it("drops a star when neither it nor any practice matches", () => {
    const entries = filterCatalog(fixture(), "drafting");
    expect(entries.map((e) => e.star.name)).toEqual(["Write a novel"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterCatalog(fixture(), "guitar")).toEqual([]);
  });
});

describe("filterCatalog — the catalog is shallow: moons are NOT searched", () => {
  it("a query matching only a moon's name matches nothing", () => {
    const base = star("Become a better engineer", ["Python"]);
    const planet = base.planets[0];
    if (!planet) throw new Error("fixture practice missing");
    const withMoon: Star = {
      ...base,
      planets: [
        { ...planet, moons: [createMoon(planet.id, "Pomodoro discipline")] },
      ],
    };
    expect(filterCatalog([withMoon], "pomodoro")).toEqual([]);
  });
});

describe("filterCatalog — read-only and order-preserving", () => {
  it("never mutates its inputs", () => {
    const stars = fixture();
    const snapshot = structuredClone(stars);
    filterCatalog(stars, "python");
    filterCatalog(stars, "");
    expect(stars).toEqual(snapshot);
  });

  it("preserves the input order (the alphabetical sort is presentation, not filtering)", () => {
    const stars = [star("Zebra"), star("Apple"), star("Mango")];
    const entries = filterCatalog(stars, "");
    expect(entries.map((e) => e.star.name)).toEqual(["Zebra", "Apple", "Mango"]);
  });

  it("returns the star objects by reference", () => {
    const stars = fixture();
    const entries = filterCatalog(stars, "python");
    expect(entries[0]?.star).toBe(stars[0]);
  });
});
