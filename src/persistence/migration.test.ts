import { deleteDB, openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUniverse } from "@/universe";

import {
  type EclipseDBSchema,
  PAGES_STORE,
  SETTINGS_STORE,
  UNIVERSE_KEY,
  UNIVERSE_STORE,
} from "./db";
import { runMigrations } from "./schema";

// A throwaway DB name so this test owns the version sequence in isolation — it
// never touches the singleton `getDB()` / the real `eclipse-brain-os` database.
const NAME = "eclipse-brain-os-migration-test";

/** Open the throwaway DB at `version`, running the REAL migration framework. */
function open(version: number) {
  return openDB<EclipseDBSchema>(NAME, version, {
    upgrade(db, oldVersion, newVersion) {
      runMigrations(db, oldVersion, newVersion ?? version);
    },
  });
}

describe("DB v3 migration (pages store)", () => {
  beforeEach(async () => {
    await deleteDB(NAME);
  });
  afterEach(async () => {
    await deleteDB(NAME);
  });

  it("v2 → v3 is additive: preserves universe + settings, adds the pages store", async () => {
    // 1. Build a v2 DB (universe + settings stores) and seed real data.
    const v2 = await open(2);
    const universe = createUniverse();
    await v2.put(UNIVERSE_STORE, universe, UNIVERSE_KEY);
    await v2.put(SETTINGS_STORE, "reduce", "motionPreference");
    expect(v2.objectStoreNames.contains(PAGES_STORE)).toBe(false); // not yet
    v2.close();

    // 2. Upgrade to v3 (runs only the additive 2 → 3 step).
    const v3 = await open(3);

    // 3. Existing data survived the upgrade intact.
    expect(await v3.get(UNIVERSE_STORE, UNIVERSE_KEY)).toEqual(universe);
    expect(await v3.get(SETTINGS_STORE, "motionPreference")).toBe("reduce");

    // 4. The new pages store now exists and is usable.
    expect(v3.objectStoreNames.contains(PAGES_STORE)).toBe(true);
    const page = { id: "body-1", markdown: "hi", updatedAt: 1 };
    await v3.put(PAGES_STORE, page, "body-1");
    expect(await v3.get(PAGES_STORE, "body-1")).toEqual(page);
    v3.close();
  });

  it("a fresh install (0 → 3) creates the universe, settings, and pages stores", async () => {
    const db = await open(3);
    expect(db.objectStoreNames.contains(UNIVERSE_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(SETTINGS_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(PAGES_STORE)).toBe(true);
    db.close();
  });
});
