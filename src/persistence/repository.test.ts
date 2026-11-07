import { beforeEach, describe, expect, it } from "vitest";

import {
  addGalaxyToUniverse,
  addPlanetToUniverse,
  addStarToUniverse,
  commitCompletedSession,
  createGalaxy,
  createPlanet,
  createSession,
  createStar,
  createUniverse,
  POMODORO_DURATION_MS,
  type ISODateString,
  type Universe,
} from "@/universe";

import { getDB, UNIVERSE_KEY, UNIVERSE_STORE } from "./db";
import { ConcurrentModificationError, CorruptDataError } from "./errors";
import {
  clearUniverse,
  loadUniverse,
  resetConcurrencyTracker,
  saveUniverse,
} from "./repository";

function withLastModified(u: Universe, iso: string): Universe {
  return { ...u, lastModified: iso as Universe["lastModified"] };
}

function laterIso(iso: string, ms = 60_000): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

describe("repository", () => {
  beforeEach(async () => {
    await clearUniverse();
    resetConcurrencyTracker();
  });

  it("saves then loads the same universe (roundtrip)", async () => {
    const universe = createUniverse();
    await saveUniverse(universe);
    const loaded = await loadUniverse();
    expect(loaded).toEqual(universe);
  });

  it("returns null when no universe is stored", async () => {
    expect(await loadUniverse()).toBeNull();
  });

  it("round-trips a worked multi-galaxy universe unchanged (PRD 27)", async () => {
    // A multi-galaxy record was always a valid record — validation loops every
    // galaxy and the repository stores the whole tree generically. Prove a
    // worked two-galaxy universe survives load → validate → save with no
    // single-galaxy assumption (and no migration) anywhere in the seam.
    let universe = createUniverse();
    const galaxyB = createGalaxy(universe.id, "Side projects");
    universe = addGalaxyToUniverse(universe, galaxyB);

    const starA = createStar(universe.galaxies[0]!.id, "Become a better engineer");
    universe = addStarToUniverse(universe, starA);
    const planet = createPlanet(starA.id, "Python");
    universe = addPlanetToUniverse(universe, planet);
    const started = createSession("planet", planet.id, POMODORO_DURATION_MS);
    universe = commitCompletedSession(universe, {
      ...started,
      status: "completed",
      completedAt: new Date().toISOString() as ISODateString,
    });
    universe = addStarToUniverse(
      universe,
      createStar(galaxyB.id, "Learn the cello"),
    );

    await saveUniverse(universe);
    const loaded = await loadUniverse();
    expect(loaded).toEqual(universe);

    // Saving the loaded record back is accepted unchanged (same-tab save).
    await expect(saveUniverse(loaded!)).resolves.toBeUndefined();
    expect(await loadUniverse()).toEqual(universe);
  });

  it("lets the same tab save repeatedly", async () => {
    const universe = createUniverse();
    await saveUniverse(universe);
    const updated = withLastModified(universe, laterIso(universe.lastModified));
    await expect(saveUniverse(updated)).resolves.toBeUndefined();
    expect((await loadUniverse())?.lastModified).toBe(updated.lastModified);
  });

  it("rejects a stale save when another tab wrote a newer version", async () => {
    const universe = createUniverse();
    await saveUniverse(universe); // observed = universe.lastModified

    // Simulate another tab persisting a newer version directly.
    const db = await getDB();
    const newer = withLastModified(universe, laterIso(universe.lastModified));
    await db.put(UNIVERSE_STORE, newer, UNIVERSE_KEY);

    // This tab's now-stale save must be refused, not silently overwrite.
    await expect(saveUniverse(universe)).rejects.toBeInstanceOf(ConcurrentModificationError);
  });

  it("clears the stored universe and load returns null afterward", async () => {
    await saveUniverse(createUniverse());
    expect(await loadUniverse()).not.toBeNull();
    await clearUniverse();
    expect(await loadUniverse()).toBeNull();
  });

  it("throws CorruptDataError when the stored record is malformed", async () => {
    const db = await getDB();
    await db.put(UNIVERSE_STORE, { schemaVersion: 1, id: 123 } as unknown as Universe, UNIVERSE_KEY);
    await expect(loadUniverse()).rejects.toBeInstanceOf(CorruptDataError);
  });
});
